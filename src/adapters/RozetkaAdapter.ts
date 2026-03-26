import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { waitForElement, parsePrice } from '@/utils/domUtils';

export class RozetkaAdapter implements IPriceAdapter {

  getStoreDomain(): string {
    return 'rozetka.com.ua';
  }

  isApplicable(): boolean {
    return window.location.hostname.includes('rozetka.com.ua');
  }

  isProductPage(): boolean {
    // Rozetka uses /p in the path for product pages
    return window.location.pathname.includes('/p');
  }

  isCatalogPage(): boolean {
    return !this.isProductPage() && document.querySelector('.catalog-list, .products-list') !== null;
  }

  getUIAnchor(): Element | null {
    return document.querySelector('.product-about__right');
  }

  getUIInsertMethod(): ContentScriptAppendMode {
    return 'after';
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      // Rozetka is a SPA — wait for the price element to appear
      await waitForElement('.product-price__big');

      const titleEl = document.querySelector('.product__title');
      const priceEl = document.querySelector('.product-price__big');
      const oldPriceEl = document.querySelector('.product-price__small');

      const currentPrice = parsePrice(priceEl?.textContent);
      if (!currentPrice) {
        console.error('[FairPrice] ❌ Не вдалося знайти валідну ціну на сторінці Rozetka.');
        return null;
      }

      const sku = document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') || 'unknown';
      const cleanUrl = window.location.origin + window.location.pathname;

      console.log(`[FairPrice] ✅ Знайдено: ${currentPrice} UAH (SKU: ${sku})`);

      return {
        externalId: sku,
        name: titleEl?.textContent?.trim() || 'Невідомий товар Rozetka',
        url: cleanUrl,
        price: Math.round(currentPrice * 100),
        regularPrice: parsePrice(oldPriceEl?.textContent)
          ? Math.round(parsePrice(oldPriceEl!.textContent)! * 100)
          : null,
        promoName: null,
        isAvailable: true,
      };
    } catch (error) {
      console.warn('[FairPrice] RozetkaAdapter: Не вдалося розпарсити дані', error);
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> {
    return [];
  }
}