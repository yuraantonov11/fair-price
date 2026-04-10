/**
 * Supabase Edge Function: crawl-prices
 *
 * Fetches sitemap, scrapes product pages, and records prices via record_price RPC.
 * Designed to be triggered by a cron job (pg_cron or external scheduler).
 *
 * Deploy: supabase functions deploy crawl-prices
 * Invoke: supabase functions invoke crawl-prices --body '{}'
 * Cron:   set up in Supabase Dashboard > Database > Extensions > pg_cron
 *         or use an external scheduler (GitHub Actions, etc.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SITEMAP_URL = 'https://dnipro-m.ua/sitemap_uk.xml';
const STORE_DOMAIN = 'dnipro-m.ua';
const BATCH_SIZE = 20;           // concurrent fetches per batch
const DELAY_BETWEEN_BATCHES = 2000; // ms — be polite to the store server
const REQUEST_TIMEOUT = 10000;   // ms per page fetch

interface SitemapEntry {
  loc: string;
}

interface ScrapedProduct {
  url: string;
  externalId: string;
  name: string;
  price: number;
  regularPrice: number | null;
  isAvailable: boolean;
}

// ── Sitemap Parser (regex, no DOM) ──────────────────────────────────

function extractProductUrls(xml: string): string[] {
  const urls: string[] = [];
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  const locRegex = /<loc>\s*(.+?)\s*<\/loc>/;

  let match: RegExpExecArray | null;
  while ((match = urlBlockRegex.exec(xml)) !== null) {
    const locMatch = match[1].match(locRegex);
    if (locMatch && locMatch[1].includes('/tovar/')) {
      urls.push(locMatch[1].trim());
    }
  }
  return urls;
}

// ── Price Scraper (server-side, from raw HTML) ──────────────────────

async function scrapeProduct(url: string): Promise<ScrapedProduct | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

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
    let ldMatch: RegExpExecArray | null;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      try {
        const raw = JSON.parse(ldMatch[1]);
        const prod = Array.isArray(raw)
          ? raw.find((d: any) => d['@type'] === 'Product')
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

function normalizeUrl(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

// ── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Main Handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Fetch sitemap
  console.log(`[crawl-prices] Fetching sitemap: ${SITEMAP_URL}`);
  const sitemapResp = await fetch(SITEMAP_URL);
  if (!sitemapResp.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch sitemap' }), { status: 502 });
  }
  const sitemapXml = await sitemapResp.text();
  const productUrls = extractProductUrls(sitemapXml);
  console.log(`[crawl-prices] Found ${productUrls.length} product URLs`);

  // 2. Scrape in batches
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  const batches = chunk(productUrls, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = await Promise.allSettled(batch.map((url) => scrapeProduct(url)));

    for (const result of results) {
      if (result.status === 'rejected' || !result.value) {
        skipped++;
        continue;
      }

      const product = result.value;
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

      if (error) {
        failed++;
        console.error(`[crawl-prices] RPC error for ${product.url}:`, error.message);
      } else {
        saved++;
      }
    }

    // Progress log every 5 batches
    if ((i + 1) % 5 === 0 || i === batches.length - 1) {
      console.log(`[crawl-prices] Progress: batch ${i + 1}/${batches.length} | saved=${saved} failed=${failed} skipped=${skipped}`);
    }

    if (i < batches.length - 1) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = { saved, failed, skipped, totalUrls: productUrls.length, durationSeconds: duration };
  console.log(`[crawl-prices] Done in ${duration}s:`, summary);

  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
});

