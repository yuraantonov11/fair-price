export interface ScrapedProduct {
  url: string;
  externalId: string;
  name: string;
  price: number;
  regularPrice: number | null;
  isAvailable: boolean;
}

const MAX_PRICE = 2_147_483_647;
function kopecks(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  const result = Math.round(number * 100);
  return Number.isSafeInteger(result) && result > 0 && result <= MAX_PRICE ? result : null;
}

export function isProductUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const supported = url.hostname === 'dnipro-m.ua' ? /^\/tovar\/[^/]+\/?$/.test(url.pathname)
      : url.hostname === 'rozetka.com.ua' && /\/p\d+\/?$/.test(url.pathname);
    return url.protocol === 'https:' && Boolean(supported) && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function findProduct(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const item of data) { const found = findProduct(item); if (found) return found; }
  } else if (data && typeof data === 'object') {
    const item = data as Record<string, unknown>;
    if (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product'))) return item;
    if (item['@graph']) return findProduct(item['@graph']);
  }
  return null;
}

export function parseProductHtml(html: string, inputUrl: string): ScrapedProduct | null {
  if (!isProductUrl(inputUrl)) return null;
  const parsedUrl = new URL(inputUrl);
  const url = parsedUrl.origin + parsedUrl.pathname.replace(/\/+$/, '') + '/';
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    try {
      let product: Record<string, unknown> | null = null;
      let next = false;
      if (/\bid\s*=\s*['"]__NEXT_DATA__['"]/i.test(match[1]!)) {
        const data = JSON.parse(match[2]!);
        product = data?.props?.pageProps?.product ?? null;
        next = true;
      } else if (/\btype\s*=\s*['"]application\/ld\+json['"]/i.test(match[1]!)) {
        product = findProduct(JSON.parse(match[2]!));
      }
      if (!product) continue;
      const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const offer = offers as Record<string, unknown> | undefined;
      if (!next && offer?.priceCurrency && offer.priceCurrency !== 'UAH') continue;
      const price = kopecks(next ? product.price : offer?.price);
      if (!price) continue;
      const externalId = String((next ? product.id : product.sku ?? product.productID) ?? 'unknown');
      const name = String((next ? product.title : product.name) ?? 'Unknown').slice(0, 500);
      return { url, externalId: externalId.slice(0, 200), name, price,
        regularPrice: next ? kopecks(product.oldPrice) : null,
        isAvailable: next ? product.isAvailable !== false : String(offer?.availability ?? 'InStock').endsWith('InStock') };
    } catch { /* Try the next structured-data block. Never guess prices from unrelated HTML. */ }
  }
  return null;
}

export function extractProductUrls(xml: string): string[] {
  return [...new Set([...xml.matchAll(/<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/g)]
    .map(match => match[1]!.match(/<loc>\s*([^<]+)\s*<\/loc>/)?.[1]?.trim())
    .filter((url): url is string => Boolean(url && isProductUrl(url))))];
}

export async function fetchText(url: string, fetcher: typeof fetch = fetch, timeoutMs = 12000): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, {
        headers: { 'User-Agent': 'FairPrice-Crawler/2.0 (price-monitoring)', 'Accept-Language': 'uk' },
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`) as Error & { retryable: boolean; status: number };
        error.status = response.status;
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return await response.text(); // Signal remains active while the body is read.
    } catch (error) {
      if (attempt >= 2 || (error as { retryable?: boolean }).retryable === false) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
}

export async function fetchProduct(inputUrl: string, fetcher: typeof fetch = fetch): Promise<ScrapedProduct | null> {
  if (!isProductUrl(inputUrl)) throw new Error('Unsupported product URL');
  const address = new URL(inputUrl);
  try {
    if (address.hostname !== 'rozetka.com.ua') {
      return parseProductHtml(await fetchText(inputUrl, fetcher), inputUrl);
    }
    // The public UA product API remains available when store HTML requires a
    // Cloudflare challenge. Verify the requested goods ID; never trust a report's price.
    const id = address.pathname.match(/\/p(\d+)\/?$/)![1]!;
    const api = new URL('https://product-api.rozetka.com.ua/v4/goods/get-main');
    api.search = new URLSearchParams({ goodsId: id, lang: 'ua', country: 'UA' }).toString();
    const response = JSON.parse(await fetchText(api.href, fetcher));
    const product = response?.data;
    // Retired IDs can return HTTP 200 with a permanent redirect to a store
    // category/home page instead of product data. Do not treat that as a price.
    const redirect = response?.redirect_to;
    if (!product && response?.success === true && [301, 308].includes(redirect?.status)) {
      const target = new URL(redirect.url);
      if (target.protocol === 'https:' && target.hostname === 'rozetka.com.ua' && !isProductUrl(target.href)) return null;
    }
    if (response?.success !== true || String(product?.id) !== id
      || typeof product?.title !== 'string' || !product.title.trim()
      || typeof product.sell_status !== 'string') throw new Error('Invalid Rozetka product response');
    const price = kopecks(product.price);
    if (!price) return null;
    return { url: address.origin + address.pathname.replace(/\/+$/, '') + '/', externalId: id,
      name: product.title.trim().slice(0, 500), price, regularPrice: kopecks(product.old_price),
      isAvailable: ['available', 'limited'].includes(product.sell_status) };
  } catch (error) {
    // Removed product pages should not make every daily run fail permanently.
    if ([404, 410].includes((error as { status?: number }).status ?? 0)) return null;
    throw error;
  }
}

export async function discoverUrls(sitemap: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const pending = [sitemap]; const seen = new Set<string>(); const urls = new Set<string>();
  while (pending.length) {
    const next = pending.shift()!;
    if (seen.has(next)) continue;
    if (seen.size >= 30) throw new Error('Too many sitemap files');
    const address = new URL(next);
    if (address.origin !== 'https://dnipro-m.ua' || address.username || address.password) throw new Error('Untrusted sitemap URL');
    seen.add(next);
    const xml = await fetchText(next, fetcher);
    for (const url of extractProductUrls(xml)) urls.add(url);
    for (const match of xml.matchAll(/<sitemap(?:\s[^>]*)?>([\s\S]*?)<\/sitemap>/g)) {
      const loc = match[1]!.match(/<loc>\s*([^<]+)\s*<\/loc>/)?.[1]?.trim();
      if (loc) pending.push(loc);
    }
  }
  return [...urls];
}

export interface CrawlOptions { concurrency: number; delay: number; offset: number; limit: number | null }
export function crawlOptions(values: Record<string, unknown>): CrawlOptions {
  if (Object.values(values).some(value => typeof value === 'boolean')) throw new Error('Invalid crawl option');
  const options = { concurrency: Number(values.concurrency ?? 10), delay: Number(values.delay ?? 2000),
    offset: Number(values.offset ?? 0), limit: values.limit == null || values.limit === '' ? null : Number(values.limit) };
  for (const [key, value] of Object.entries(options)) {
    if (value !== null && (!Number.isSafeInteger(value) || value < (key === 'concurrency' || key === 'limit' ? 1 : 0))) throw new Error(`Invalid ${key}`);
  }
  if (options.concurrency > 20 || (options.limit !== null && options.limit > 100000)) throw new Error('Crawl limit exceeded');
  return options;
}

export async function crawlBatch(urls: string[], record: (product: ScrapedProduct) => Promise<void>,
  options: CrawlOptions, fetcher: typeof fetch = fetch, onError?: (url: string, error: unknown) => void) {
  const selected = urls.slice(options.offset, options.limit === null ? undefined : options.offset + options.limit);
  const summary = { saved: 0, failed: 0, skipped: 0, processedUrls: selected.length };
  for (let i = 0; i < selected.length; i += options.concurrency) {
    await Promise.all(selected.slice(i, i + options.concurrency).map(async url => {
      try {
        const product = await fetchProduct(url, fetcher);
        if (!product) { summary.skipped++; return; }
        await record(product);
        summary.saved++;
      } catch (error) { summary.failed++; onError?.(url, error); }
    }));
    if (i + options.concurrency < selected.length) await new Promise(resolve => setTimeout(resolve, options.delay));
  }
  return summary;
}

export function assertCrawlSuccess(summary: { saved: number; failed: number; skipped: number }) {
  if (summary.failed > 0 || summary.saved === 0) throw new Error(`Crawl incomplete: ${JSON.stringify(summary)}`);
}
