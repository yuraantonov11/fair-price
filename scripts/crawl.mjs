#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './env.mjs';
import { crawlOptions, discoverUrls, crawlBatch, assertCrawlSuccess, isProductUrl } from '../supabase/functions/_shared/crawler.ts';

loadLocalEnv();
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  if (!['limit', 'offset', 'concurrency', 'delay'].includes(key) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) {
    throw new Error('Expected --limit/--offset/--concurrency/--delay followed by an integer');
  }
  args[key] = process.argv[i + 1];
}
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
    const urls = await discoverUrls('https://dnipro-m.ua/sitemap_uk.xml');
    // Verify a bounded set of recent community URLs using the store's actual HTML,
    // never the reported price. Also revisit every previously confirmed Rozetka item.
    const { data: reports, error: reportsError } = await supabase.from('community_price_reports')
      .select('url').gte('reported_at', new Date(Date.now() - 86_400_000).toISOString())
      .order('reported_at', { ascending: false }).limit(1000);
    if (reportsError) throw reportsError;
    urls.push(...(reports ?? []).map(item => item.url));
    for (let offset = 0; ; offset += 1000) {
      const { data: products, error } = await supabase.from('products').select('url')
        .eq('store_domain', 'rozetka.com.ua').order('id').range(offset, offset + 999);
      if (error) throw error;
      urls.push(...(products ?? []).map(item => item.url));
      if (!products || products.length < 1000) break;
    }
    const summary = await crawlBatch([...new Set(urls)].filter(isProductUrl), async product => {
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
    }, options);
    console.log(JSON.stringify(summary));
    assertCrawlSuccess(summary);
    console.log('Crawl complete');
  } finally {
    const { error } = await supabase.rpc('release_crawl_lock', { p_token: lease });
    if (error) console.error('Could not release crawler lease:', error.message);
  }
}
main().catch(error => { console.error(error.message ?? 'Crawl failed'); process.exitCode = 1; });
