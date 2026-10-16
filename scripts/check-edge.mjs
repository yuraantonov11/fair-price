import assert from 'node:assert/strict';

const url = new URL(process.env.SUPABASE_URL);
assert(url.protocol === 'https:' && url.hostname.endsWith('.supabase.co'), 'Expected a hosted Supabase URL');
assert(process.env.CRAWL_TRIGGER_SECRET, 'CRAWL_TRIGGER_SECRET is required');
const endpoint = `${url.origin}/functions/v1/crawl-prices`;
const invoke = (method, secret) => fetch(endpoint, {
  method,
  headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-crawl-secret': secret } : {}) },
  body: method === 'POST' ? JSON.stringify({ limit: 10 }) : undefined,
  signal: AbortSignal.timeout(60_000),
});
assert.equal((await invoke('GET')).status, 405, 'Only POST should be allowed');
assert.equal((await invoke('POST')).status, 401, 'Unauthenticated requests must be rejected');
assert.equal((await invoke('POST', 'invalid-smoke-secret')).status, 401, 'Incorrect secrets must be rejected');
const response = await invoke('POST', process.env.CRAWL_TRIGGER_SECRET);
assert.equal(response.status, 200, 'Authenticated bounded Edge crawl must succeed');
const summary = await response.json();
assert(summary.saved > 0 && summary.failed === 0, 'Edge crawl must persist real observations');
console.log('Edge authentication and live crawl passed:', JSON.stringify(summary));
