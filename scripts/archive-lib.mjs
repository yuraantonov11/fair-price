import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const MAX_PART = 100 * 1024 * 1024;
const MAX_RAW = 90 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function monthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Expected month YYYY-MM');
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: next.toISOString().slice(0, 10) };
}
export function normalizedRow(row) {
  const value = { ...row };
  for (const key of ['updated_at', 'observed_at']) if (value[key]) value[key] = new Date(value[key]).toISOString();
  return value;
}
export function checkRecord(record, month) {
  const { start, end } = monthBounds(month);
  const o = record?.observation; const p = record?.product;
  if (!o || !p || typeof o.id !== 'string' || p.id !== o.product_id || o.source !== 'system'
    || !Number.isInteger(o.price) || o.price <= 0 || (o.regular_price !== null && (!Number.isInteger(o.regular_price) || o.regular_price <= 0))
    || typeof o.is_available !== 'boolean' || typeof o.observed_day !== 'string' || o.observed_day < start || o.observed_day >= end
    || !Number.isFinite(Date.parse(o.observed_at)) || new Date(o.observed_at).toISOString().slice(0, 10) !== o.observed_day
    || typeof p.url !== 'string') throw new Error('Invalid trusted archive record');
}

/** Stream the full-fidelity snapshot into deterministic, bounded gzip parts. */
export async function exportBundle(rows, folder, month, rawLimit = MAX_RAW) {
  const { start, end } = monthBounds(month);
  const manifest = { version: 1, schemaVersion: '20261019', unit: 'kopecks', timezone: 'UTC', month,
    fromDay: start, untilDay: end, generatedAt: new Date().toISOString(), rowCount: 0, parts: [] };
  let output; let rawBytes = 0; let count = 0; let rawPath;
  async function closePart() {
    if (!output) return;
    if (output.errored) throw output.errored;
    output.end(); await once(output, 'close');
    const name = `observations-${String(manifest.parts.length + 1).padStart(4, '0')}.jsonl.gz`;
    const target = path.join(folder, name);
    await pipeline(createReadStream(rawPath), createGzip({ level: 9 }), createWriteStream(target));
    const compressed = await readFile(target);
    if (compressed.length > MAX_PART) throw new Error('Archive part exceeds 100 MiB');
    manifest.parts.push({ name, bytes: compressed.length, sha256: sha256(compressed), rowCount: count });
    output = undefined; rawBytes = 0; count = 0;
  }
  try {
    for await (const record of rows) {
      checkRecord(record, month);
      const normalized = { product: normalizedRow(record.product), observation: normalizedRow(record.observation) };
      const line = `${canonical(normalized)}\n`;
      const bytes = Buffer.byteLength(line);
      if (bytes > 65536) throw new Error('Archive row exceeds 64 KiB');
      if (output && rawBytes + bytes > rawLimit) await closePart();
      if (!output) {
        rawPath = path.join(folder, `raw-${manifest.parts.length}.jsonl`);
        output = createWriteStream(rawPath, { mode: 0o600 });
        output.on('error', () => {}); // Awaited writes/close surface the error without an unhandled event.
      }
      if (output.errored) throw output.errored;
      if (!output.write(line)) await once(output, 'drain');
      rawBytes += bytes; count++; manifest.rowCount++;
    }
    await closePart();
    if (!manifest.rowCount) throw new Error('Cannot archive an empty month');
    await writeFile(path.join(folder, 'manifest.json'), `${canonical(manifest)}\n`, { mode: 0o600 });
    return manifest;
  } finally {
    if (output && !output.closed) {
      const closed = once(output, 'close').catch(() => {});
      output.destroy(); await closed;
    }
  }
}

export function checkManifest(manifest, month) {
  const { start, end } = monthBounds(month);
  if (manifest?.version !== 1 || manifest.schemaVersion !== '20261019' || manifest.month !== month
    || manifest.fromDay !== start || manifest.untilDay !== end || manifest.unit !== 'kopecks' || manifest.timezone !== 'UTC'
    || !Number.isSafeInteger(manifest.rowCount) || manifest.rowCount <= 0 || !Array.isArray(manifest.parts)
    || !manifest.parts.length || manifest.parts.length > 1000) throw new Error('Invalid archive manifest');
  const names = new Set();
  for (const part of manifest.parts) {
    if (!/^observations-\d{4}\.jsonl\.gz$/.test(part.name) || names.has(part.name)
      || !/^[a-f0-9]{64}$/.test(part.sha256) || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > MAX_PART
      || !Number.isSafeInteger(part.rowCount) || part.rowCount <= 0) throw new Error('Invalid archive part');
    names.add(part.name);
  }
  if (manifest.parts.reduce((sum, part) => sum + part.rowCount, 0) !== manifest.rowCount) throw new Error('Archive count mismatch');
}

export async function* readBundle(manifest, folder) {
  checkManifest(manifest, manifest.month);
  const seen = new Set();
  for (const part of manifest.parts) {
    const filename = path.join(folder, part.name);
    const bytes = await readFile(filename);
    if (bytes.length !== part.bytes || sha256(bytes) !== part.sha256) throw new Error('Archive checksum mismatch');
    const input = createReadStream(filename);
    const stream = input.pipe(createGunzip());
    input.on('error', error => stream.destroy(error));
    let count = 0; let rawBytes = 0; let pending = '';
    try {
      // UTF-8 decoding must preserve multibyte characters across gzip chunks.
      stream.setEncoding('utf8');
      for await (const chunk of stream) {
        rawBytes += Buffer.byteLength(chunk);
        if (rawBytes > MAX_RAW) throw new Error('Archive expansion limit exceeded');
        pending += chunk;
        let end;
        while ((end = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          if (Buffer.byteLength(line) > 65536) throw new Error('Archive expansion limit exceeded');
          const record = JSON.parse(line); checkRecord(record, manifest.month);
          if (seen.has(record.observation.id)) throw new Error('Duplicate archived observation');
          seen.add(record.observation.id); count++;
          yield record;
        }
        if (Buffer.byteLength(pending) > 65536) throw new Error('Archive expansion limit exceeded');
      }
      if (pending) throw new Error('Truncated JSONL archive');
    } finally { input.destroy(); stream.destroy(); }
    if (count !== part.rowCount) throw new Error('Archive row count mismatch');
  }
}

/** No caller may register or prune a partially verified bundle. */
export async function verifyBundle(manifest, folder) {
  let count = 0;
  for await (const record of readBundle(manifest, folder)) { void record; count++; }
  if (count !== manifest.rowCount) throw new Error('Archive total count mismatch');
  return count;
}

export class GitHubArchive {
  constructor(repo, token, fetcher = fetch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !token) throw new Error('Private archive credentials missing');
    this.repo = repo; this.token = token; this.fetcher = fetcher;
  }
  async request(endpoint, options = {}, allowMissing = false) {
    const response = await this.fetcher(endpoint.startsWith('https://') ? endpoint : `https://api.github.com/repos/${this.repo}${endpoint}`, {
      ...options, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28', ...options.headers }, signal: AbortSignal.timeout(120000),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Private archive API returned HTTP ${response.status}`);
    return response;
  }
  async assertPrivate() {
    if (!(await (await this.request('')).json()).private) throw new Error('Archive repository must be PRIVATE');
  }
  async release(month, create = false) {
    monthBounds(month);
    const existing = await this.request(`/releases/tags/prices-${month}`, {}, true);
    if (existing) return existing.json();
    if (!create) throw new Error('Monthly archive release not found');
    return (await this.request('/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: `prices-${month}`, name: `Prices ${month}`, make_latest: 'false', body: 'Private confirmed price archive, schema v1.' }) })).json();
  }
  async assets(release) {
    const assets = [];
    for (let page = 1; ; page++) {
      const batch = await (await this.request(`/releases/${release.id}/assets?per_page=100&page=${page}`)).json();
      assets.push(...batch);
      if (batch.length < 100) return assets;
    }
  }
  async download(asset) {
    // Construct the endpoint ourselves; never forward credentials to manifest URLs.
    return Buffer.from(await (await this.request(`/releases/assets/${asset.id}`, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer());
  }
  async upload(release, assets, name, bytes) {
    const existing = assets.find(asset => asset.name === name);
    if (existing) {
      if (existing.size !== bytes.length) throw new Error('Existing archive asset differs; refusing overwrite');
      if (sha256(await this.download(existing)) !== sha256(bytes)) throw new Error('Existing archive asset differs; refusing overwrite');
      return;
    }
    const response = await this.request(`https://uploads.github.com/repos/${this.repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    assets.push(await response.json());
  }
  async clearIncomplete(assets) {
    if (assets.some(asset => asset.name === 'manifest.json')) throw new Error('Cannot reset a committed archive');
    for (const asset of [...assets]) {
      if (!/^observations-\d{4}\.jsonl\.gz$/.test(asset.name)) continue;
      await this.request(`/releases/assets/${asset.id}`, { method: 'DELETE' });
      assets.splice(assets.indexOf(asset), 1);
    }
  }
  async downloadBundle(month, folder, release, assets) {
    release ??= await this.release(month); assets ??= await this.assets(release);
    const manifestAsset = assets.find(asset => asset.name === 'manifest.json');
    if (!manifestAsset || manifestAsset.size > 1024 * 1024) throw new Error('Archive manifest missing or too large');
    const manifestBytes = await this.download(manifestAsset);
    if (manifestBytes.length > 1024 * 1024) throw new Error('Archive manifest too large');
    const manifest = JSON.parse(manifestBytes); checkManifest(manifest, month);
    for (const part of manifest.parts) {
      const asset = assets.find(asset => asset.name === part.name);
      if (!asset || asset.size !== part.bytes) throw new Error('Archive part missing or size differs');
      const bytes = await this.download(asset);
      if (bytes.length !== part.bytes || sha256(bytes) !== part.sha256) throw new Error('Remote archive checksum mismatch');
      await writeFile(path.join(folder, part.name), bytes, { mode: 0o600 });
    }
    await writeFile(path.join(folder, 'manifest.json'), manifestBytes, { mode: 0o600 });
    await verifyBundle(manifest, folder);
    return { manifest, digest: sha256(manifestBytes) };
  }
}

/** Restore into a disposable real Postgres runtime, never the production DB. */
export async function restoreBundle(manifest, folder) {
  await verifyBundle(manifest, folder);
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;`);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql') && name.slice(0, 8) <= manifest.schemaVersion).sort()) {
      await db.exec((await readFile(new URL(name, migrations), 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
    }
    // A disposable restore can exceed the production free-tier size. Keep all
    // data constraints; only disable physical-size guards in this isolated DB.
    await db.exec(`ALTER TABLE public.products DISABLE TRIGGER guard_product_storage;
      ALTER TABLE public.price_observations DISABLE TRIGGER guard_observation_storage;`);
    const expected = createHash('sha256');
    const actual = createHash('sha256');
    await db.exec('BEGIN');
    let count = 0;
    for await (const record of readBundle(manifest, folder)) {
      await db.query(`INSERT INTO public.products SELECT (jsonb_populate_record(NULL::public.products,$1::jsonb)).*
        ON CONFLICT(id) DO NOTHING`, [JSON.stringify(record.product)]);
      await db.query(`INSERT INTO public.price_observations SELECT (jsonb_populate_record(NULL::public.price_observations,$1::jsonb)).*`,
        [JSON.stringify(record.observation)]);
      const result = await db.query('SELECT to_jsonb(o) AS row FROM public.price_observations o WHERE id=$1', [record.observation.id]);
      expected.update(`${canonical(normalizedRow(record.observation))}\n`);
      actual.update(`${canonical(normalizedRow(result.rows[0].row))}\n`);
      count++;
      if (count % 500 === 0) await db.exec('COMMIT; BEGIN');
    }
    await db.exec('COMMIT');
    const restored = await db.query('SELECT count(*)::int AS count FROM public.price_observations');
    if (restored.rows[0].count !== manifest.rowCount || expected.digest('hex') !== actual.digest('hex')) throw new Error('Restored database differs from archive');
    return manifest.rowCount;
  } finally { await db.close(); }
}
