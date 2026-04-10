/**
 * Sitemap parser: fetches a sitemap XML and extracts product URLs.
 * Works in Node.js / Deno / Edge Function context (no DOM required).
 */

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
}

/**
 * Fetch and parse a sitemap XML, returning entries whose <loc> matches the filter.
 */
export async function parseSitemap(
  sitemapUrl: string,
  urlFilter: (url: string) => boolean = () => true,
): Promise<SitemapEntry[]> {
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return extractEntries(xml, urlFilter);
}

/**
 * Parse sitemap XML string without a DOM parser (regex-based, safe for edge runtimes).
 */
export function extractEntries(
  xml: string,
  urlFilter: (url: string) => boolean = () => true,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  const tagRegex = (tag: string) => new RegExp(`<${tag}>\\s*(.+?)\\s*</${tag}>`);

  let match: RegExpExecArray | null;
  while ((match = urlBlockRegex.exec(xml)) !== null) {
    const block = match[1];
    const locMatch = block.match(tagRegex('loc'));
    if (!locMatch) continue;

    const loc = locMatch[1].trim();
    if (!urlFilter(loc)) continue;

    const lastmodMatch = block.match(tagRegex('lastmod'));
    const changefreqMatch = block.match(tagRegex('changefreq'));

    entries.push({
      loc,
      lastmod: lastmodMatch?.[1].trim(),
      changefreq: changefreqMatch?.[1].trim(),
    });
  }

  return entries;
}

/**
 * Filter that matches Dnipro-M product pages.
 */
export function isDniproMProduct(url: string): boolean {
  return url.includes('/tovar/');
}

