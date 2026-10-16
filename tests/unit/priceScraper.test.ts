import { describe, expect, it } from 'vitest';

// Fixtures exercise the exact shared parser used by Node and Edge.
import { parseProductHtml } from '../../supabase/functions/_shared/crawler';
const parseNextData = (html: string) => parseProductHtml(html, 'https://dnipro-m.ua/tovar/test/');
const parseJsonLd = parseNextData;

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

