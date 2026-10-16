#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { loadLocalEnv } from './env.mjs';
import { isPublicBackendKey } from '../src/utils/backendConfig.ts';
loadLocalEnv();
const mode = process.argv.includes('crawl') ? 'crawl' : 'core';
const offline = process.argv.includes('--offline');
const schema = process.argv.includes('--schema');
let failed = false;
function check(ok, message) { console.log(`[${ok ? 'OK' : 'ERR'}] ${message}`); failed ||= !ok; }
check(Number(process.versions.node.split('.')[0]) >= 24, 'Node.js >=24 (native TypeScript crawler runtime)');
check(existsSync('.env.example'), '.env.example exists');
const address = mode === 'crawl' ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL;
const key = mode === 'crawl' ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.VITE_SUPABASE_ANON_KEY;
check(Boolean(key && !/your-anon|your-service/.test(key)), `${mode === 'crawl' ? 'Service role' : 'Publishable/anon'} key is configured (value hidden)`);
if (mode === 'core' && key) check(isPublicBackendKey(key), 'Client key is public (never service-role)');
try {
  if (!address || /your-project/.test(address)) throw new Error('Set a real Supabase URL');
  const url = new URL(address);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('Use HTTPS (or local E2E backend)');
  check(true, 'Supabase URL format');
  if (!offline && key) {
    await lookup(url.hostname);
    check(true, `DNS resolves ${url.hostname}`);
    const response = await fetch(`${url.origin}/rest/v1/${schema ? 'price_observations?select=price,source,observed_at,products!inner(url)&limit=0' : 'products?select=id&limit=0'}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000),
    });
    check(response.ok, `Supabase ${schema ? 'schema' : 'API'} probe: HTTP ${response.status}`);
    if (schema && response.ok) {
      // Hosted Supabase can restrict OpenAPI to service_role. Exercise argument
      // resolution with deliberately invalid input: the hardened RPC must reject
      // it before any write, so this works with the extension's public key.
      const rpc = await fetch(`${url.origin}/rest/v1/rpc/record_price`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_store_domain: 'dnipro-m.ua', p_external_id: '', p_url: null, p_name: '',
          p_price: 0, p_regular_price: null, p_is_available: true, p_promo_name: null,
          p_category: null, p_source: 'community' }),
        signal: AbortSignal.timeout(8000),
      });
      const rejection = await rpc.json();
      check(rpc.status === 400 && rejection.code === '22023', 'Hardened record_price V2 resolves and rejects invalid input without writing');
    }
  }
} catch (error) { check(false, `${error.code || error.cause?.code || error.name}: ${error.message}. Check Supabase project status and environment.`); }
if (offline) console.log('Offline: connectivity and deployed schema were not checked.');
process.exitCode = failed ? 1 : 0;
