/**
 * Server-side price scraper for Dnipro-M product pages.
 * Extracts price data from raw HTML without a browser DOM.
 * Works in Node.js / Deno / Supabase Edge Functions.
 */

export interface ScrapedProduct {
  url: string;
  externalId: string;
  name: string;
  price: number;        // kopecks
  regularPrice: number | null; // kopecks
  isAvailable: boolean;
}

/**
 * Fetch a product page and extract price data from JSON-LD / __NEXT_DATA__.
 */
export async function scrapeProductPage(url: string): Promise<ScrapedProduct | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FairPrice-Crawler/1.0 (price monitoring)',
      'Accept': 'text/html',
      'Accept-Language': 'uk',
    },
  });

  if (!response.ok) return null;

  const html = await response.text();

  // Strategy 1: Parse __NEXT_DATA__ (Next.js hydration payload)
  const nextDataResult = parseNextData(html);
  if (nextDataResult) {
    return { url: normalizeUrl(url), ...nextDataResult };
  }

  // Strategy 2: Parse JSON-LD structured data
  const jsonLdResult = parseJsonLd(html);
  if (jsonLdResult) {
    return { url: normalizeUrl(url), ...jsonLdResult };
  }

  // Strategy 3: Regex fallback on raw HTML
  const regexResult = parseWithRegex(html, url);
  if (regexResult) {
    return { url: normalizeUrl(url), ...regexResult };
  }

  return null;
}

function normalizeUrl(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

function parseNextData(html: string): Omit<ScrapedProduct, 'url'> | null {
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const product = data?.props?.pageProps?.product;
    if (!product || !product.price) return null;

    const price = Math.round(parseFloat(product.price) * 100);
    if (price <= 0) return null;

    return {
      externalId: String(product.id || 'unknown'),
      name: product.title || 'Unknown',
      price,
      regularPrice: product.oldPrice ? Math.round(parseFloat(product.oldPrice) * 100) : null,
      isAvailable: product.isAvailable ?? true,
    };
  } catch {
    return null;
  }
}

function parseJsonLd(html: string): Omit<ScrapedProduct, 'url'> | null {
  const ldRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;

  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const product = Array.isArray(data)
        ? data.find((d: any) => d['@type'] === 'Product')
        : data['@type'] === 'Product' ? data : null;

      if (!product?.offers?.price) continue;

      const price = Math.round(parseFloat(product.offers.price) * 100);
      if (price <= 0) continue;

      return {
        externalId: product.sku || product.productID || 'unknown',
        name: product.name || 'Unknown',
        price,
        regularPrice: null,
        isAvailable: product.offers?.availability?.includes('InStock') ?? true,
      };
    } catch {
      // try next LD+JSON block
    }
  }

  return null;
}

function parseWithRegex(html: string, _url: string): Omit<ScrapedProduct, 'url'> | null {
  // Try to find price from common Dnipro-M patterns
  const priceMatch = html.match(/"price"\s*:\s*"?([\d.]+)"?/);
  const nameMatch = html.match(/<h1[^>]*>\s*(.*?)\s*<\/h1>/);

  if (!priceMatch) return null;

  const price = Math.round(parseFloat(priceMatch[1]) * 100);
  if (price <= 0) return null;

  // Try to extract SKU
  const skuMatch = html.match(/(?:sku|productID|externalId)["\s:]+["']?([\w-]+)/i);

  return {
    externalId: skuMatch?.[1] || 'unknown',
    name: nameMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || 'Unknown',
    price,
    regularPrice: null,
    isAvailable: true,
  };
}


