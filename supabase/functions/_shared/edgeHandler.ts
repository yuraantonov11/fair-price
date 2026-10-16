import { crawlOptions, discoverUrls, crawlBatch, assertCrawlSuccess } from './crawler.ts';

export function createCrawlHandler(config: {
  url?: string; serviceKey?: string; secret?: string;
  fetcher?: typeof fetch; onError?: (error: unknown) => void;
}) {
  const { url: SUPABASE_URL, serviceKey: SERVICE_KEY, secret: SECRET } = config;
  const fetcher = config.fetcher ?? fetch;

  async function authorized(value: string | null): Promise<boolean> {
    if (!SECRET || !value) return false;
    const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    const a = await digest(SECRET); const b = await digest(value);
    return a.reduce((diff, byte, i) => diff | (byte ^ b[i]!), 0) === 0;
  }
  async function rpc(name: string, payload: Record<string, unknown>) {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Server configuration missing');
    const response = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`RPC failed: ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return async (req: Request) => {
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!await authorized(req.headers.get('x-crawl-secret'))) return new Response(null, { status: 401 });
    let token: string | null = null;
    try {
      const text = await req.text();
      if (text.length > 1024) return new Response(null, { status: 413 });
      const payload = text ? JSON.parse(text) : {};
      const options = crawlOptions({ limit: payload.limit ?? 20, offset: payload.offset ?? 0, concurrency: 10, delay: 1000 });
      if (options.limit === null || options.limit > 20) return Response.json({ error: 'Backup crawl limit is 20' }, { status: 400 });
      token = await rpc('acquire_crawl_lock', { p_seconds: 300 });
      if (!token) return Response.json({ error: 'Crawler already running' }, { status: 409 });
      const urls = await discoverUrls('https://dnipro-m.ua/sitemap_uk.xml', fetcher);
      const summary = await crawlBatch(urls, async product => {
        await rpc('record_price', { p_store_domain: new URL(product.url).hostname, p_external_id: product.externalId,
          p_url: product.url, p_name: product.name, p_price: product.price, p_regular_price: product.regularPrice,
          p_is_available: product.isAvailable, p_promo_name: null, p_source: 'system' });
      }, options, fetcher);
      assertCrawlSuccess(summary);
      return Response.json(summary);
    } catch (error) {
      config.onError?.(error);
      const invalid = error instanceof SyntaxError || (error instanceof Error && /Invalid|limit exceeded/.test(error.message));
      return Response.json({ error: invalid ? 'Invalid crawl options' : 'Crawl failed; check server configuration and logs' }, { status: invalid ? 400 : 502 });
    } finally {
      if (token) await rpc('release_crawl_lock', { p_token: token }).catch(() => {});
    }
  };
}
