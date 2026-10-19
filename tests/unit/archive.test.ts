import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Maintenance modules run directly in Node 24, outside the extension TS build.
import { exportBundle, verifyBundle, readBundle, restoreBundle, GitHubArchive, sha256 } from '../../scripts/archive-lib.mjs';

let folder: string;
beforeEach(async () => { folder = await mkdtemp(path.join(os.tmpdir(), 'fair-price-archive-test-')); });
afterEach(async () => {
  expect(path.dirname(folder)).toBe(path.resolve(os.tmpdir()));
  expect(path.basename(folder)).toMatch(/^fair-price-archive-test-/);
  await rm(folder, { recursive: true, force: true });
});
const record = (day: number) => ({
  product: { id: '00000000-0000-0000-0000-000000000001', url: 'https://dnipro-m.ua/tovar/archived/',
    store_domain: 'dnipro-m.ua', external_id: 'archived', name: 'Архівний товар', category: null, updated_at: '2025-01-31T03:00:00Z' },
  observation: { id: `00000000-0000-0000-0000-${String(day).padStart(12, '0')}`, product_id: '00000000-0000-0000-0000-000000000001',
    observed_day: `2025-01-${String(day).padStart(2, '0')}`, observed_at: `2025-01-${String(day).padStart(2, '0')}T03:00:00Z`,
    price: 30099, regular_price: 40000, promo_name: 'Акція', is_available: day !== 2, source: 'system' },
});
async function* rows(count = 3) { for (let i = 1; i <= count; i++) yield record(i); }

describe('private full-fidelity archive', () => {
  it('splits gzip parts, verifies every row and restores the production schema in isolation', async () => {
    const manifest = await exportBundle(rows(), folder, '2025-01', 1000);
    expect(manifest.parts).toHaveLength(3);
    expect(await verifyBundle(manifest, folder)).toBe(3);
    const restored = [];
    for await (const row of readBundle(manifest, folder)) restored.push(row);
    expect(restored[1].observation).toMatchObject({ price: 30099, is_available: false, source: 'system' });
    expect(await restoreBundle(manifest, folder)).toBe(3);
  }, 30000);
  it('rejects damaged files, incorrect counts, traversal and duplicate IDs', async () => {
    const manifest = await exportBundle(rows(), folder, '2025-01');
    const filename = path.join(folder, manifest.parts[0].name);
    const original = await readFile(filename);
    await writeFile(filename, Buffer.from('damaged'));
    await expect(verifyBundle(manifest, folder)).rejects.toThrow(/checksum/);
    await writeFile(filename, original);
    const invalidGzip = Buffer.from('not gzip');
    await writeFile(filename, invalidGzip);
    const badCompression = { ...manifest, parts: [{ ...manifest.parts[0], bytes: invalidGzip.length, sha256: sha256(invalidGzip) }] };
    await expect(verifyBundle(badCompression, folder)).rejects.toThrow();
    await writeFile(filename, original);
    await expect(verifyBundle({ ...manifest, rowCount: 5 }, folder)).rejects.toThrow(/count/);
    await expect(verifyBundle({ ...manifest, parts: [{ ...manifest.parts[0], name: '../private.gz' }] }, folder)).rejects.toThrow(/Invalid archive part/);
    async function* duplicates() { yield record(1); yield record(1); }
    const duplicateManifest = await exportBundle(duplicates(), folder, '2025-01');
    await expect(verifyBundle(duplicateManifest, folder)).rejects.toThrow(/Duplicate/);
  });
  it('never promotes community data or archives a row outside the requested month', async () => {
    async function* untrusted() { const row = record(1); row.observation.source = 'community'; yield row; }
    await expect(exportBundle(untrusted(), folder, '2025-01')).rejects.toThrow(/Invalid trusted/);
    await expect(exportBundle(rows(), folder, '2025-02')).rejects.toThrow(/Invalid trusted/);
  });
  it('requires a private repository and refuses overwrites of existing assets', async () => {
    const publicRepo = new GitHubArchive('owner/archive', 'secret', async () => Response.json({ private: false }));
    await expect(publicRepo.assertPrivate()).rejects.toThrow(/PRIVATE/);
    const github = new GitHubArchive('owner/archive', 'secret', async () => new Response('old bytes'));
    await expect(github.upload({ id: 1 }, [{ id: 3, name: 'manifest.json' }], 'manifest.json', Buffer.from('new bytes'))).rejects.toThrow(/refusing overwrite/);
  });
  it('restarts incomplete uploads without deleting a committed manifest', async () => {
    const calls: string[] = [];
    const github = new GitHubArchive('owner/archive', 'secret', async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`); return new Response(null, { status: 204 });
    });
    const assets = [{ id: 7, name: 'observations-0001.jsonl.gz' }];
    await github.clearIncomplete(assets);
    expect(assets).toHaveLength(0);
    expect(calls).toHaveLength(1);
    await expect(github.clearIncomplete([{ id: 8, name: 'manifest.json' }])).rejects.toThrow(/committed archive/);
    expect(calls).toHaveLength(1);
  });
  it('uploads idempotently and verifies a fresh authenticated download', async () => {
    const manifest = await exportBundle(rows(), folder, '2025-01');
    const assets: Array<{ id: number; name: string; size: number }> = [];
    const bodies = new Map<number, Buffer>();
    let uploads = 0;
    const github = new GitHubArchive('owner/archive', 'secret', async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (init?.method === 'POST') {
        const bytes = Buffer.from(init.body as Uint8Array); const asset = { id: assets.length + 1, name: url.searchParams.get('name')!, size: bytes.length };
        bodies.set(asset.id, bytes); uploads++;
        return Response.json(asset);
      }
      return new Response(new Uint8Array(bodies.get(Number(url.pathname.split('/').at(-1)))!));
    });
    for (const name of [...manifest.parts.map((part: { name: string }) => part.name), 'manifest.json']) {
      const bytes = await readFile(path.join(folder, name));
      await github.upload({ id: 1 }, assets, name, bytes);
      await github.upload({ id: 1 }, assets, name, bytes);
    }
    expect(uploads).toBe(2);
    const downloaded = await github.downloadBundle('2025-01', folder, { id: 1 }, assets);
    expect(downloaded.digest).toBe(sha256(await readFile(path.join(folder, 'manifest.json'))));
    expect(downloaded.manifest.rowCount).toBe(3);
    bodies.set(1, Buffer.from('corrupt remote file'));
    await expect(github.downloadBundle('2025-01', folder, { id: 1 }, assets)).rejects.toThrow(/checksum/);
  });
});
