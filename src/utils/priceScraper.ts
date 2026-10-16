export { parseProductHtml, type ScrapedProduct } from '../../supabase/functions/_shared/crawler';
import { parseProductHtml, fetchText, isProductUrl } from '../../supabase/functions/_shared/crawler';
export async function scrapeProductPage(url: string) {
  if (!isProductUrl(url)) return null;
  return parseProductHtml(await fetchText(url), url);
}
