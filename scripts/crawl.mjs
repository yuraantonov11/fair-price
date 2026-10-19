#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './env.mjs';
import { crawlOptions, discoverUrls, crawlBatch, assertCrawlSuccess, isProductUrl } from '../supabase/functions/_shared/crawler.ts';

loadLocalEnv();
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  if (!['limit', 'offset', 'concurrency', 'delay', 'store'].includes(key) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) {
    throw new Error('Expected a supported crawler option and its value');
  }
  args[key] = process.argv[i + 1];
}
const store = args.store ?? process.env.CRAWL_STORE ?? 'all';
if (!['', 'all', 'dnipro-m.ua', 'rozetka.com.ua'].includes(store)) throw new Error('Unsupported crawler store');
const options = crawlOptions({ concurrency: process.env.CRAWL_CONCURRENCY, delay: process.env.CRAWL_DELAY_MS,
  offset: process.env.CRAWL_OFFSET, limit: process.env.CRAWL_LIMIT, ...args });
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const supabase = createClient(url, key, { auth: { persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });

async function main() {
  const { data: lease, error: leaseError } = await supabase.rpc('acquire_crawl_lock', { p_seconds: 10800 });
  if (leaseError) throw leaseError;
  if (!lease) throw new Error('Another crawler holds the database lease');
  try {
    const { data: budget, error: budgetError } = await supabase.rpc('price_storage_budget');
    if (budgetError) throw budgetError;
    if (!budget || typeof budget.writesAllowed !== 'boolean') throw new Error('Storage budget schema unavailable');
    console.log(JSON.stringify({ event: 'storage-budget', ...budget }));
    if (!budget.writesAllowed) throw new Error('STORAGE_BUDGET_EXCEEDED');
    const urls = !budget.discoveryAllowed || store === 'rozetka.com.ua' ? [] : await discoverUrls('https://dnipro-m.ua/sitemap_uk.xml');
    // Verify a bounded set of recent community URLs using the store's own data,
    // never the reported price. Also revisit every previously confirmed Rozetka item.
    if (budget.discoveryAllowed) {
      const { data: reports, error: reportsError } = await supabase.from('community_price_reports')
      .select('url').gte('reported_at', new Date(Date.now() - 86_400_000).toISOString())
      .order('reported_at', { ascending: false }).limit(1000);
      if (reportsError) throw reportsError;
      urls.push(...(reports ?? []).map(item => item.url));
    }
    for (let offset = 0; !budget.discoveryAllowed || store !== 'dnipro-m.ua'; offset += 1000) {
      let query = supabase.from('products').select('url');
      const knownStore = budget.discoveryAllowed ? 'rozetka.com.ua' : !store || store === 'all' ? null : store;
      if (knownStore) query = query.eq('store_domain', knownStore);
      const { data: products, error } = await query.order('id').range(offset, offset + 999);
      if (error) throw error;
      urls.push(...(products ?? []).map(item => item.url));
      if (!products || products.length < 1000) break;
    }
    const selected = [...new Set(urls)].filter(isProductUrl)
      .filter(input => !store || store === 'all' || new URL(input).hostname === store);
    console.log(JSON.stringify({ event: 'crawl-start', store: store || 'all', discoveredUrls: selected.length }));
    let saved = 0;
    let loggedFailures = 0;
    const summary = await crawlBatch(selected, async product => {
      // Repeating the same observation is idempotent; only transient RPC failures are retried.
      for (let attempt = 0; ; attempt++) {
        const { error, status } = await supabase.rpc('record_price', {
          p_store_domain: new URL(product.url).hostname, p_external_id: product.externalId, p_url: product.url,
          p_name: product.name, p_price: product.price, p_regular_price: product.regularPrice,
          p_is_available: product.isAvailable, p_promo_name: null, p_source: 'system',
        });
        if (!error) break;
        if (attempt >= 2 || (status !== 0 && status !== 429 && status < 500)) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      }
      if (++saved % 50 === 0) console.log(JSON.stringify({ event: 'crawl-progress', store: store || 'all', saved }));
    }, options, fetch, (input, error) => {
      if (loggedFailures++ >= 20) return;
      const address = new URL(input);
      // Log only stable diagnostics, never response bodies or credentials.
      console.error(JSON.stringify({ event: 'crawl-error', store: address.hostname, url: address.origin + address.pathname,
        code: typeof error?.code === 'string' ? error.code : error?.name || 'UNKNOWN', status: error?.status ?? null }));
    });
    console.log(JSON.stringify(summary));
    assertCrawlSuccess(summary);
    console.log('Crawl complete');
  } finally {
    const { error } = await supabase.rpc('release_crawl_lock', { p_token: lease });
    if (error) console.error('Could not release crawler lease:', error.message);
  }
}
main().catch(error => { console.error(error.message ?? 'Crawl failed'); process.exitCode = 1; });
