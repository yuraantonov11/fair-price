import type { ProductData } from '@/adapters/IPriceAdapter';

export function canonicalProductUrl(input: string): string {
  const url = new URL(input);
  url.hostname = url.hostname.replace(/^www\./, '');
  const supported = url.hostname === 'dnipro-m.ua' || url.hostname === 'rozetka.com.ua';
  const productPath = url.hostname === 'dnipro-m.ua' ? /^\/tovar\/[^/]+\/?$/ : /\/p\d+\/?$/;
  if (!supported || !productPath.test(url.pathname) || url.username || url.password
    || url.port || !['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported product URL');
  return `https://${url.hostname}${url.pathname.replace(/\/+$/, '')}/`;
}

export function validateProduct(product: ProductData): ProductData {
  if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 2_147_483_647
    || (product.regularPrice != null && (!Number.isSafeInteger(product.regularPrice) || product.regularPrice <= 0
      || product.regularPrice > 2_147_483_647))
    || typeof product.name !== 'string' || !product.name.trim() || product.name.length > 500
    || typeof product.externalId !== 'string' || product.externalId.length > 200
    || (product.promoName != null && (typeof product.promoName !== 'string' || product.promoName.length > 500))
    || (product.category != null && (typeof product.category !== 'string' || product.category.length > 200))) {
    throw new Error('Invalid product data (prices must be positive integer kopecks)');
  }
  return { ...product, url: canonicalProductUrl(product.url) };
}
