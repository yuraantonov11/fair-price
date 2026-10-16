import { describe, expect, it, vi } from 'vitest';
import { createCrawlHandler } from '../../supabase/functions/_shared/edgeHandler';

const request = (secret?: string, body = '{}') => new Request('https://edge.test/crawl', {
  method: 'POST', headers: secret ? { 'x-crawl-secret': secret } : {}, body,
});
describe('Edge trigger boundary', () => {
  it('fails closed without a configured or matching secret, before fetching anything', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await createCrawlHandler({ fetcher })(request('secret'))).status).toBe(401);
    const handler = createCrawlHandler({ secret: 'secret', fetcher });
    expect((await handler(request())).status).toBe(401);
    expect((await handler(request('wrong'))).status).toBe(401);
    expect((await handler(new Request('https://edge.test'))).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts a void RPC response, records system data and releases the lease', async () => {
    const payloads: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/rpc/')) {
        payloads.push({ path: url, body: JSON.parse(String(init?.body)) });
        return url.endsWith('acquire_crawl_lock') ? Response.json('lease-token') : new Response(null, { status: 204 });
      }
      return new Response(url.includes('sitemap') ? '<urlset><url><loc>https://dnipro-m.ua/tovar/test/</loc></url></urlset>'
        : '<script id="__NEXT_DATA__">{"props":{"pageProps":{"product":{"id":1,"title":"Tool","price":100}}}}</script>');
    });
    const handler = createCrawlHandler({ url: 'https://backend.test', serviceKey: 'server-only', secret: 'secret', fetcher });
    const response = await handler(request('secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ saved: 1, failed: 0 });
    expect(payloads.find(p => p.path.endsWith('record_price'))?.body).toMatchObject({ p_price: 10000, p_source: 'system' });
    expect(payloads.at(-1)?.path).toContain('release_crawl_lock');
  });
  it('rejects overlapping runs and invalid limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(null));
    const handler = createCrawlHandler({ url: 'https://backend.test', serviceKey: 'key', secret: 'secret', fetcher });
    expect((await handler(request('secret'))).status).toBe(409);
    expect((await handler(request('secret', '{"limit":21}'))).status).toBe(400);
    expect((await handler(request('secret', 'invalid json'))).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
