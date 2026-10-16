import { describe, expect, it, vi } from 'vitest';
import { assertCrawlSuccess, crawlBatch, crawlOptions, extractProductUrls, fetchProduct, fetchText, parseProductHtml } from '../../supabase/functions/_shared/crawler';

const url = 'https://dnipro-m.ua/tovar/test/';
const html = '<script type="application/json" id="__NEXT_DATA__">{"props":{"pageProps":{"product":{"id":1,"title":"Drill","price":"1999.99","oldPrice":"2500","isAvailable":true}}}}</script>';
describe('production crawler', () => {
  it('parses structured data in kopecks regardless of attribute order', () => {
    expect(parseProductHtml(html, url)).toMatchObject({ price: 199999, regularPrice: 250000, externalId: '1' });
  });
  it('handles graph JSON-LD, rejects invalid/non-UAH prices and unrelated HTML', () => {
    const ld = (price: string, currency = 'UAH') => `<script data-test="1" type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Product', name: 'Tool', offers: [{ price, priceCurrency: currency }] }] })}</script>`;
    expect(parseProductHtml(ld('1200'), url)?.price).toBe(120000);
    expect(parseProductHtml(ld('NaN'), url)).toBeNull();
    expect(parseProductHtml(ld('10', 'USD'), url)).toBeNull();
    expect(parseProductHtml('<h1>Tool</h1><script>{"price":500}</script>', url)).toBeNull();
  });
  it('deduplicates sitemap entries and rejects foreign domains', () => {
    const xml = `<urlset><url><loc>${url}</loc></url><url><loc>${url}</loc></url><url><loc>https://evil.test/tovar/x/</loc></url></urlset>`;
    expect(extractProductUrls(xml)).toEqual([url]);
  });
  it('verifies Rozetka report URLs against structured store prices, rejecting lookalike hosts', () => {
    const page = '<script type="application/ld+json">{"@type":"Product","name":"Tool","sku":"123","offers":{"price":"2999.50","priceCurrency":"UAH"}}</script>';
    expect(parseProductHtml(page, 'https://rozetka.com.ua/ua/tool/p123/')?.price).toBe(299950);
    expect(parseProductHtml(page, 'https://rozetka.com.ua.evil.test/ua/tool/p123/')).toBeNull();
  });
  it('confirms Rozetka prices through its official UA API when HTML is blocked', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const api = new URL(String(input));
      expect(api.origin + api.pathname).toBe('https://product-api.rozetka.com.ua/v4/goods/get-main');
      expect(api.searchParams.get('goodsId')).toBe('123');
      expect(api.searchParams.get('country')).toBe('UA');
      return Response.json({ success: true, data: { id: 123, title: 'Tool', price: '2999.50', old_price: 3500, sell_status: 'available' } });
    });
    const record = vi.fn().mockResolvedValue(undefined);
    const summary = await crawlBatch(['https://rozetka.com.ua/ua/tool/p123/'], record, crawlOptions({}), fetcher);
    expect(summary.saved).toBe(1);
    expect(record).toHaveBeenCalledWith({ url: 'https://rozetka.com.ua/ua/tool/p123/', externalId: '123',
      name: 'Tool', price: 299950, regularPrice: 350000, isAvailable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects the wrong API product and keeps unavailable products unavailable', async () => {
    const data = { id: 124, title: 'Tool', price: 100, old_price: 0, sell_status: 'unavailable' };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ success: true, data }));
    await expect(fetchProduct('https://rozetka.com.ua/ua/tool/p123/', fetcher)).rejects.toThrow('Invalid Rozetka');
    data.id = 123;
    expect(await fetchProduct('https://rozetka.com.ua/ua/tool/p123/', fetcher)).toMatchObject({ price: 10000, regularPrice: null, isAvailable: false });
    data.sell_status = 'unknown';
    expect((await fetchProduct('https://rozetka.com.ua/ua/tool/p123/', fetcher))?.isAvailable).toBe(false);
  });
  it('skips removed pages but reports access failures', async () => {
    const record = vi.fn();
    const removed = await crawlBatch([url], record, crawlOptions({}), vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect(removed).toMatchObject({ saved: 0, failed: 0, skipped: 1 });
    const blocked = await crawlBatch([url], record, crawlOptions({}), vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    expect(blocked).toMatchObject({ saved: 0, failed: 1, skipped: 0 });
    expect(record).not.toHaveBeenCalled();
  });
  it.each([{ concurrency: 0 }, { concurrency: 21 }, { limit: -1 }, { delay: 'x' }, { limit: true }])('rejects unsafe options %j', options => {
    expect(() => crawlOptions(options)).toThrow();
  });
  it('fails the run when every RPC fails instead of reporting success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(html));
    const summary = await crawlBatch([url], async () => { throw new Error('RPC failed'); }, crawlOptions({ delay: 0 }), fetcher);
    expect(summary).toEqual({ saved: 0, failed: 1, skipped: 0, processedUrls: 1 });
    expect(() => assertCrawlSuccess(summary)).toThrow('incomplete');
  });
  it('keeps the abort signal active while consuming a stalled body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => ({ ok: true,
      text: () => new Promise<string>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    } as Response));
    await expect(fetchText(url, fetcher, 5)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
