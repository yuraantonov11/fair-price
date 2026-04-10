import { describe, expect, it } from 'vitest';
import { extractEntries, isDniproMProduct } from '../../src/utils/sitemapParser';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://dnipro-m.ua/</loc>
    <changefreq>always</changefreq>
    <lastmod>2026-04-10T01:00:01+03:00</lastmod>
  </url>
  <url>
    <loc>https://dnipro-m.ua/tovar/akumulyatorna-lancyugova-pila-dms-201bc/</loc>
    <changefreq>weekly</changefreq>
    <lastmod>2026-03-15T10:00:00+02:00</lastmod>
  </url>
  <url>
    <loc>https://dnipro-m.ua/catalog/electroinstrument/</loc>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>https://dnipro-m.ua/tovar/shurupovert-cd-200t/</loc>
    <changefreq>weekly</changefreq>
    <lastmod>2026-02-10T09:00:00+02:00</lastmod>
  </url>
</urlset>`;

describe('sitemapParser', () => {
  it('extracts all entries from XML', () => {
    const entries = extractEntries(SAMPLE_XML);
    expect(entries).toHaveLength(4);
    expect(entries[0].loc).toBe('https://dnipro-m.ua/');
    expect(entries[0].lastmod).toBe('2026-04-10T01:00:01+03:00');
  });

  it('filters product URLs with isDniproMProduct', () => {
    const products = extractEntries(SAMPLE_XML, isDniproMProduct);
    expect(products).toHaveLength(2);
    expect(products.every(e => e.loc.includes('/tovar/'))).toBe(true);
  });

  it('handles entries without lastmod', () => {
    const entries = extractEntries(SAMPLE_XML);
    const catalog = entries.find(e => e.loc.includes('/catalog/'));
    expect(catalog).toBeDefined();
    expect(catalog!.lastmod).toBeUndefined();
  });

  it('returns empty array for empty XML', () => {
    expect(extractEntries('')).toEqual([]);
    expect(extractEntries('<urlset></urlset>')).toEqual([]);
  });
});

