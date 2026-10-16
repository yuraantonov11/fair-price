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
    const response = await fetch(`${url.origin}/rest/v1/${schema ? 'price_observations?select=price,source,observed_at,products!inner(url)&limit=0' : ''}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000),
    });
    check(response.ok, `Supabase ${schema ? 'schema' : 'API'} probe: HTTP ${response.status}`);
    if (schema && response.ok) {
      const api = await fetch(`${url.origin}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
      const spec = await api.json();
      const params = spec.paths?.['/rpc/record_price']?.post?.parameters ?? [];
      const properties = params.flatMap(p => Object.keys(p.schema?.properties ?? {}));
      check(properties.includes('p_source') && properties.includes('p_category'), 'record_price V2 arguments are exposed');
    }
  }
} catch (error) { check(false, `${error.code || error.cause?.code || error.name}: ${error.message}. Check Supabase project status and environment.`); }
if (offline) console.log('Offline: connectivity and deployed schema were not checked.');
process.exitCode = failed ? 1 : 0;
