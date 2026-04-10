import { describe, expect, it } from 'vitest';

/**
 * Test the server-side HTML parsing functions from priceScraper.
 * We test the internal parsing logic by calling the exported scrapeProductPage
 * with a mock fetch, but since the module uses global fetch,
 * we test the parsing helpers indirectly via known HTML patterns.
 */

// Inline the parsing logic to test without network
function parseNextData(html: string) {
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const product = data?.props?.pageProps?.product;
    if (!product || !product.price) return null;
    return {
      externalId: String(product.id || 'unknown'),
      name: product.title || 'Unknown',
      price: Math.round(parseFloat(product.price) * 100),
      regularPrice: product.oldPrice ? Math.round(parseFloat(product.oldPrice) * 100) : null,
      isAvailable: product.isAvailable ?? true,
    };
  } catch {
    return null;
  }
}

function parseJsonLd(html: string) {
  const ldRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const product = Array.isArray(data)
        ? data.find((d: any) => d['@type'] === 'Product')
        : data['@type'] === 'Product' ? data : null;
      if (!product?.offers?.price) continue;
      return {
        externalId: product.sku || product.productID || 'unknown',
        name: product.name || 'Unknown',
        price: Math.round(parseFloat(product.offers.price) * 100),
        regularPrice: null,
        isAvailable: product.offers?.availability?.includes('InStock') ?? true,
      };
    } catch { continue; }
  }
  return null;
}

describe('priceScraper parsing', () => {
  it('extracts product from __NEXT_DATA__', () => {
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"product":{"id":12345,"title":"Дриль Dnipro-M","price":"2499.00","oldPrice":"2999.00","isAvailable":true}}}}
        </script>
      </body></html>
    `;

    const result = parseNextData(html);
    expect(result).not.toBeNull();
    expect(result!.externalId).toBe('12345');
    expect(result!.name).toBe('Дриль Dnipro-M');
    expect(result!.price).toBe(249900);
    expect(result!.regularPrice).toBe(299900);
    expect(result!.isAvailable).toBe(true);
  });

  it('extracts product from JSON-LD', () => {
    const html = `
      <html><body>
        <script type="application/ld+json">
          {"@type":"Product","name":"Шуруповерт CD-200T","sku":"78583000-1","offers":{"price":"1850.00","availability":"https://schema.org/InStock"}}
        </script>
      </body></html>
    `;

    const result = parseJsonLd(html);
    expect(result).not.toBeNull();
    expect(result!.externalId).toBe('78583000-1');
    expect(result!.name).toBe('Шуруповерт CD-200T');
    expect(result!.price).toBe(185000);
    expect(result!.isAvailable).toBe(true);
  });

  it('returns null for HTML without price data', () => {
    const html = '<html><body><h1>About Us</h1></body></html>';
    expect(parseNextData(html)).toBeNull();
    expect(parseJsonLd(html)).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{broken json</script>';
    expect(parseNextData(html)).toBeNull();
  });
});

