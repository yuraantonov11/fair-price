import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function run(failure: boolean, store = 'all') {
  return spawnSync(process.execPath, ['--import', './tests/fixtures/crawler-preload.mjs', 'scripts/crawl.mjs', '--limit', '1'], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, SUPABASE_URL: 'https://crawler-audit.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
      FP_RPC_FAILURE: failure ? '1' : '0', CRAWL_STORE: store },
  });
}
describe('actual Node crawler CLI (offline)', () => {
  it('records integer kopecks with system provenance and exits successfully', () => {
    const result = run(false);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"saved":1');
  });
  it('exits nonzero after all RPC writes fail', () => {
    const result = run(true);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain('"failed":1');
    expect(result.stdout).not.toContain('Crawl complete');
  });
  it('can populate Rozetka independently without fetching the Dnipro-M sitemap', () => {
    const result = run(false, 'rozetka.com.ua');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"store":"rozetka.com.ua"');
    expect(result.stdout).toContain('"saved":1');
  });
});
