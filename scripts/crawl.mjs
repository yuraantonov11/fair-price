#!/usr/bin/env node
/**
 * scripts/crawl.mjs
 *
 * Standalone crawler for GitHub Actions / local use.
 * Scrapes Dnipro-M product pages and writes prices to Supabase.
 *
 * Usage:
 *   node scripts/crawl.mjs
 *   node scripts/crawl.mjs --limit 50
 *   node scripts/crawl.mjs --offset 500 --limit 100
 *   node scripts/crawl.mjs --concurrency 10 --delay 1000
 *
 * Required env vars:
 *   SUPABASE_URL             (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars:
 *   CRAWL_LIMIT    - max URLs to process (default: all)
 *   CRAWL_OFFSET   - start from URL index (default: 0)
 *   CRAWL_CONCURRENCY - parallel requests (default: 20)
 *   CRAWL_DELAY_MS    - ms between batches (default: 2000)
 */

import { createClient } from '@supabase/supabase-js';

// ── Configuration ────────────────────────────────────────────────────

const SITEMAP_URL = 'https://dnipro-m.ua/sitemap_uk.xml';
const STORE_DOMAIN = 'dnipro-m.ua';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse CLI args
const args = parseArgs(process.argv.slice(2));
const LIMIT = args.limit ? parseInt(args.limit) : (process.env.CRAWL_LIMIT ? parseInt(process.env.CRAWL_LIMIT) : null);
const OFFSET = parseInt(args.offset || process.env.CRAWL_OFFSET || '0');
const CONCURRENCY = parseInt(args.concurrency || process.env.CRAWL_CONCURRENCY || '20');
const DELAY_MS = parseInt(args.delay || process.env.CRAWL_DELAY_MS || '2000');
const REQUEST_TIMEOUT_MS = 12000;

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      result[key] = argv[i + 1] || true;
      i++;
    }
  }
  return result;
}

// ── Validation ──────────────────────────────────────────────────────

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL (or VITE_SUPABASE_URL) is not set');
  process.exit(1);
}
if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Sitemap Parser ──────────────────────────────────────────────────

function extractProductUrls(xml) {
  const urls = [];
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  const locRegex = /<loc>\s*(.+?)\s*<\/loc>/;

  let match;
  while ((match = urlBlockRegex.exec(xml)) !== null) {
    const locMatch = match[1].match(locRegex);
    if (locMatch && locMatch[1].includes('/tovar/')) {
      urls.push(locMatch[1].trim());
    }
  }
  return urls;
}

// ── Price Scraper ───────────────────────────────────────────────────

function normalizeUrl(url) {
  const u = new URL(url);
  return u.origin + u.pathname;
}

async function scrapeProduct(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'FairPrice-Crawler/1.0 (price-monitoring)',
        Accept: 'text/html',
        'Accept-Language': 'uk',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) return null;
    const html = await resp.text();

    // Try __NEXT_DATA__ first
    const nextMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1]);
        const p = data?.props?.pageProps?.product;
        if (p?.price) {
          return {
            url: normalizeUrl(url),
            externalId: String(p.id || 'unknown'),
            name: p.title || 'Unknown',
            price: Math.round(parseFloat(p.price) * 100),
            regularPrice: p.oldPrice ? Math.round(parseFloat(p.oldPrice) * 100) : null,
            isAvailable: p.isAvailable ?? true,
          };
        }
      } catch { /* fall through */ }
    }

    // Try JSON-LD
    const ldRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      try {
        const raw = JSON.parse(ldMatch[1]);
        const prod = Array.isArray(raw)
          ? raw.find((d) => d['@type'] === 'Product')
          : raw['@type'] === 'Product' ? raw : null;
        if (prod?.offers?.price) {
          return {
            url: normalizeUrl(url),
            externalId: prod.sku || prod.productID || 'unknown',
            name: prod.name || 'Unknown',
            price: Math.round(parseFloat(prod.offers.price) * 100),
            regularPrice: null,
            isAvailable: prod.offers?.availability?.includes('InStock') ?? true,
          };
        }
      } catch { continue; }
    }

    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function formatDuration(ms) {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('🕷️  FairPrice Crawler');
  console.log(`📦 Project: ${SUPABASE_URL}`);
  console.log(`⚙️  Config: concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms, offset=${OFFSET}, limit=${LIMIT ?? 'all'}`);
  console.log('');

  // 1. Fetch sitemap
  console.log(`📥 Fetching sitemap: ${SITEMAP_URL}`);
  const sitemapResp = await fetch(SITEMAP_URL);
  if (!sitemapResp.ok) {
    console.error(`❌ Failed to fetch sitemap: ${sitemapResp.status}`);
    process.exit(1);
  }
  const sitemapXml = await sitemapResp.text();
  const allUrls = extractProductUrls(sitemapXml);
  console.log(`✅ Found ${allUrls.length} product URLs in sitemap`);

  // 2. Apply offset/limit
  const productUrls = allUrls.slice(OFFSET, LIMIT !== null ? OFFSET + LIMIT : undefined);
  console.log(`🎯 Processing ${productUrls.length} URLs (offset=${OFFSET})`);
  console.log('');

  // 3. Scrape in batches
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  const batches = chunk(productUrls, CONCURRENCY);
  const totalBatches = batches.length;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = await Promise.allSettled(batch.map((url) => scrapeProduct(url)));

    const batchResults = await Promise.allSettled(
      results
        .filter((r) => r.status === 'fulfilled' && r.value !== null)
        .map(async (r) => {
          const product = r.value;
          const { error } = await supabase.rpc('record_price', {
            p_store_domain: STORE_DOMAIN,
            p_external_id: product.externalId,
            p_url: product.url,
            p_name: product.name,
            p_price: product.price,
            p_regular_price: product.regularPrice,
            p_is_available: product.isAvailable,
            p_promo_name: null,
          });
          if (error) throw error;
          return product;
        })
    );

    for (const r of results) {
      if (r.status === 'rejected' || !r.value) skipped++;
    }
    for (const r of batchResults) {
      if (r.status === 'fulfilled') saved++;
      else failed++;
    }

    // Progress log
    const percent = Math.round(((i + 1) / totalBatches) * 100);
    const elapsed = formatDuration(Date.now() - startTime);
    process.stdout.write(`\r  Batch ${i + 1}/${totalBatches} (${percent}%) | ✅ ${saved} saved | ⏭️  ${skipped} skipped | ❌ ${failed} failed | ⏱️  ${elapsed}   `);

    if (i < batches.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(''); // newline after progress
  console.log('');

  const duration = formatDuration(Date.now() - startTime);
  const summary = {
    saved,
    failed,
    skipped,
    processedUrls: productUrls.length,
    totalInSitemap: allUrls.length,
    durationSeconds: Math.round((Date.now() - startTime) / 1000),
  };

  console.log('📊 Summary:');
  console.log(`  ✅ Saved:      ${saved}`);
  console.log(`  ⏭️  Skipped:   ${skipped}`);
  console.log(`  ❌ Failed:    ${failed}`);
  console.log(`  📦 Processed: ${productUrls.length}/${allUrls.length}`);
  console.log(`  ⏱️  Duration:  ${duration}`);
  console.log('');

  if (failed > 0) {
    console.warn(`⚠️  ${failed} RPC errors — check Supabase logs`);
  }

  if (saved === 0 && skipped === productUrls.length) {
    console.error('❌ Nothing was saved — check if the database tables exist (run migration)');
    process.exit(1);
  }

  console.log('✅ Done!');

  // Output JSON summary for CI parsing
  console.log(`\n::notice::Crawl complete: ${JSON.stringify(summary)}`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message || err);
  process.exit(1);
});

