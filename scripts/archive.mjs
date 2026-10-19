#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadLocalEnv } from './env.mjs';
import { exportBundle, GitHubArchive, monthBounds, readBundle, restoreBundle } from './archive-lib.mjs';

loadLocalEnv();
const action = process.argv[2] ?? 'auto';
if (!['auto', 'verify', 'restore', 'announce-release', 'privacy'].includes(action)) throw new Error('Unsupported archive action');
const args = process.argv.slice(3);
if (args.length && (args.length !== 2 || args[0] !== '--month')) throw new Error('Expected --month YYYY-MM');
const requestedMonth = args[1];
if (requestedMonth) monthBounds(requestedMonth);
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
const events = [];
function report(event, fields = {}) { const value = { event, ...fields }; events.push(value); console.log(JSON.stringify(value)); }
function unwrap(result, operation) {
  if (result.error) throw new Error(`${operation} failed (${result.error.code ?? result.status ?? 'unknown'})`);
  return result.data;
}
async function rpc(name, payload = {}) { return unwrap(await db.rpc(name, payload), name); }
const repo = process.env.PRICE_ARCHIVE_REPO ?? 'yuraantonov11/fair-price-archive';
const token = process.env.PRICE_ARCHIVE_TOKEN;
const github = token ? new GitHubArchive(repo, token) : null;

async function* monthRows(month) {
  const { start, end } = monthBounds(month);
  let last;
  for (;;) {
    let query = db.from('price_observations').select('*,products(*)').gte('observed_day', start).lt('observed_day', end).order('id').limit(1000);
    if (last) query = query.gt('id', last);
    const rows = unwrap(await query, 'archive read');
    for (const { products, ...observation } of rows) yield { product: products, observation };
    if (rows.length < 1000) return;
    last = rows.at(-1).id;
  }
}
async function registerExport(month, bundle) {
  const existing = unwrap(await db.from('price_archive_exports').select('manifest_sha256').eq('month', `${month}-01`).maybeSingle(), 'archive registry');
  if (existing && existing.manifest_sha256 !== bundle.digest) throw new Error('Registered archive differs; refusing replacement');
  if (!existing) unwrap(await db.from('price_archive_exports').insert({ month: `${month}-01`, manifest_sha256: bundle.digest, manifest: bundle.manifest }), 'archive registration');
}
async function withFolder(run) {
  const folder = await mkdtemp(path.join(tmpdir(), 'fair-price-archive-'));
  try { return await run(folder); }
  finally {
    // mkdtemp gives a fixed, absolute child of the OS temp directory. No user path
    // or computed repository path is accepted for recursive cleanup.
    if (path.dirname(folder) !== path.resolve(tmpdir()) || !path.basename(folder).startsWith('fair-price-archive-')) throw new Error('Unsafe temp directory');
    await rm(folder, { recursive: true, force: true });
  }
}
async function archiveMonth(month, lease, prune) {
  return withFolder(async folder => {
    const release = await github.release(month, true);
    const assets = await github.assets(release);
    if (!assets.some(asset => asset.name === 'manifest.json')) {
      const registered = unwrap(await db.from('price_archive_exports').select('month').eq('month', `${month}-01`).maybeSingle(), 'archive registry');
      if (registered) throw new Error('Verified archive manifest missing; refusing to replace it');
      // Only incomplete, unregistered uploads can be restarted. The source rows
      // remain untouched until a complete downloadable snapshot is verified.
      await github.clearIncomplete(assets);
      const manifest = await exportBundle(monthRows(month), folder, month);
      for (const part of manifest.parts) await github.upload(release, assets, part.name, await readFile(path.join(folder, part.name)));
      // The manifest is uploaded last; incomplete uploads can never be pruned.
      await github.upload(release, assets, 'manifest.json', await readFile(path.join(folder, 'manifest.json')));
    }
    const bundle = await github.downloadBundle(month, folder, release, assets);
    await registerExport(month, bundle);
    let pruned = 0;
    if (prune) {
      let batch = [];
      const flush = async () => {
        pruned += await rpc('prune_archived_observations', { p_month: `${month}-01`, p_sha256: bundle.digest, p_rows: batch, p_lease: lease });
        batch = [];
      };
      for await (const record of readBundle(bundle.manifest, folder)) {
        batch.push(record.observation);
        if (batch.length === 1000) await flush();
      }
      if (batch.length) await flush();
    }
    const { start, end } = monthBounds(month);
    const remaining = prune ? await db.from('price_observations').select('id', { count: 'exact', head: true })
      .gte('observed_day', start).lt('observed_day', end) : null;
    if (remaining?.error) throw new Error('Archive remainder check failed');
    report('archive-verified', { month, rows: bundle.manifest.rowCount, pruned, remaining: remaining?.count ?? null });
  });
}

async function main() {
  if (action === 'announce-release') {
    const response = await fetch('https://api.github.com/repos/yuraantonov11/fair-price/releases/tags/v2.5.0', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Published release v2.5.0 is required before starting the migration window');
    const release = await response.json();
    if (release.draft || release.prerelease || !release.published_at) throw new Error('Stable published release required');
    await rpc('announce_history_release', { p_version: '2.5.0' });
    report('history-api-release-announced', { graceDays: 14 }); return;
  }
  if (action === 'privacy') { report('history-api-privacy', { restricted: await rpc('apply_history_privacy') }); return; }
  const lease = await rpc('acquire_crawl_lock', { p_seconds: 10800 });
  if (!lease) throw new Error('Another crawler or archive process holds the database lease');
  try {
    if (action !== 'auto') {
      if (!github || !requestedMonth) throw new Error('Private archive token and --month are required');
      await github.assertPrivate();
      await withFolder(async folder => {
        const bundle = await github.downloadBundle(requestedMonth, folder);
        await registerExport(requestedMonth, bundle);
        if (action === 'restore') {
          const restored = await restoreBundle(bundle.manifest, folder);
          unwrap(await db.from('price_archive_exports').update({ restore_verified_at: new Date().toISOString() })
            .eq('month', `${requestedMonth}-01`).eq('manifest_sha256', bundle.digest), 'restore proof');
          report('archive-restored-in-isolated-database', { month: requestedMonth, rows: restored });
        } else report('archive-verified', { month: requestedMonth, rows: bundle.manifest.rowCount });
      });
      return;
    }
    report('storage-maintenance', await rpc('maintain_price_storage', { p_lease: lease }));
    if (!github) {
      report('archive-not-configured', { requiredSecret: 'PRICE_ARCHIVE_TOKEN', cleanup: false });
      if (process.env.GITHUB_ACTIONS) console.log('::warning::PRICE_ARCHIVE_TOKEN is missing. Private archive export and cleanup are disabled.');
      return;
    }
    await github.assertPrivate();
    const earliest = unwrap(await db.from('price_observations').select('observed_day').order('observed_day').limit(1), 'archive candidate');
    if (!earliest.length) return;
    const cutoff = new Date(); cutoff.setUTCHours(0, 0, 0, 0); cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const prune = process.env.PRICE_ARCHIVE_PRUNE === 'true';
    const registry = unwrap(await db.from('price_archive_exports').select('month,manifest_sha256,restore_verified_at'), 'archive registry');
    if (prune && !registry.some(item => item.restore_verified_at)) throw new Error('Cleanup requires a successful isolated archive:restore first');
    let month = earliest[0].observed_day.slice(0, 7);
    while (new Date(`${monthBounds(month).end}T00:00:00Z`) <= cutoff) {
      const { start, end } = monthBounds(month);
      const exists = unwrap(await db.from('price_observations').select('id').gte('observed_day', start).lt('observed_day', end).limit(1), 'archive candidate');
      if (exists.length && (prune || !registry.some(item => item.month === start))) await archiveMonth(month, lease, prune);
      month = end.slice(0, 7);
    }
  } finally { await rpc('release_crawl_lock', { p_token: lease }); }
}
main().catch(error => { report('archive-failed', { error: error.message }); process.exitCode = 1; }).finally(async () => {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Price storage maintenance\n\n\`\`\`json\n${events.map(value => JSON.stringify(value)).join('\n')}\n\`\`\`\n`);
});
