import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { parsePrice, waitForElement } from '@/utils/domUtils';

export class DniproMAdapter implements IPriceAdapter {

  getStoreDomain(): string {
    return 'dnipro-m.ua';
  }

  isApplicable(): boolean {
    return window.location.hostname.includes('dnipro-m.ua');
  }

  isProductPage(): boolean {
    return window.location.pathname.includes('/tovar/');
  }

  isCatalogPage(): boolean {
    // Adjust this selector/path check to match Dnipro-M catalog URLs if needed
    return !this.isProductPage() && document.querySelector('.catalog-list, .products-list') !== null;
  }

  getUIAnchor(): Element | null {
    return document.querySelector('h1');
  }

  getUIInsertMethod(): ContentScriptAppendMode {
    return 'after';
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      await waitForElement('h1', 8000);
      const title = document.querySelector('h1')?.textContent?.trim() || 'Товар Dnipro-M';

      // SKU
      const sku = document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') ||
        document.querySelector('.product-code__code')?.textContent?.trim() ||
        'unknown';

      // Promo badge
      const promoName = document.querySelector('.badge__text, .product-card-info__price-badge')?.textContent?.trim() || null;

      // Prices
      const currentPriceEl = document.querySelector('.product-price__current, .product-card-info__price-current, .price__current');
      const oldPriceEl = document.querySelector('.product-price__old, .product-card-info__price-old, .price__old');

      let currentPrice = parsePrice(currentPriceEl?.textContent);
      let oldPrice = parsePrice(oldPriceEl?.textContent);

      // Fallback: JSON-LD
      if (!currentPrice) {
        const ldScript = document.querySelector('script[type="application/ld+json"]');
        if (ldScript) {
          try {
            const json = JSON.parse(ldScript.textContent || '{}');
            const price = json.offers?.price || json.offers?.[0]?.price;
            if (price) currentPrice = parseFloat(price);
          } catch (e) { /* ignore */ }
        }
      }

      // Guard: suspiciously low price
      if (currentPrice && currentPrice < 300) {
        console.warn('[FairPrice] Ціна підозріло мала, ігноруємо:', currentPrice);
        currentPrice = null;
      }

      if (!currentPrice) {
        console.error('[FairPrice] ❌ Не вдалося знайти валідну ціну на сторінці.');
        return null;
      }

      console.log(`[FairPrice] ✅ Знайдено: ${currentPrice} UAH (SKU: ${sku})`);

      return {
        externalId: sku,
        name: title,
        url: window.location.origin + window.location.pathname,
        price: Math.round(currentPrice * 100),
        regularPrice: oldPrice ? Math.round(oldPrice * 100) : null,
        promoName: promoName || null,
        isAvailable: true,
      };
    } catch (error) {
      console.error('[FairPrice] Помилка parseProductPage:', error);
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> {
    // Implement catalog scraping for Dnipro-M if needed
    return [];
  }
}