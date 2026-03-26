import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { waitForElement, parsePrice } from '@/utils/domUtils';

export class RozetkaAdapter implements IPriceAdapter {

  getStoreDomain(): string { return 'rozetka.com.ua'; }
  isApplicable(): boolean { return window.location.hostname.includes('rozetka.com.ua'); }
  isProductPage(): boolean { return window.location.pathname.includes('/p'); }
  isCatalogPage(): boolean { return !this.isProductPage() && document.querySelector('.catalog-list, .products-list') !== null; }
  getUIAnchor(): Element | null { return document.querySelector('.product-about__right'); }
  getUIInsertMethod(): ContentScriptAppendMode { return 'after'; }

  // Заділ на майбутнє: парсинг стану SSR Розетки
  getHydrationData(): any | null {
    return null;
  }

  getProductID(): string | null {
    return document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') || null;
  }

  getCurrentPrice(): number | null {
    const priceEl = document.querySelector('.product-price__big');
    return parsePrice(priceEl?.textContent);
  }

  getOriginalPrice(): number | null {
    const oldPriceEl = document.querySelector('.product-price__small');
    return parsePrice(oldPriceEl?.textContent);
  }

  getStockStatus(): boolean {
    // Якщо кнопка "Купити" заблокована або відсутня — товару немає
    const buyButton = document.querySelector('app-buy-button button');
    return buyButton ? !buyButton.hasAttribute('disabled') : false;
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      // Чекаємо саме на ціну, оскільки це SPA
      await waitForElement('.product-price__big');

      const currentPrice = this.getCurrentPrice();
      if (!currentPrice) {
        console.error('[FairPrice] ❌ Не вдалося знайти валідну ціну на сторінці Rozetka.');
        return null;
      }

      const titleEl = document.querySelector('.product__title');
      const sku = this.getProductID() || 'unknown';
      const cleanUrl = window.location.origin + window.location.pathname;

      console.log(`[FairPrice] ✅ Знайдено: ${currentPrice} UAH (SKU: ${sku})`);

      return {
        externalId: sku,
        name: titleEl?.textContent?.trim() || 'Невідомий товар Rozetka',
        url: cleanUrl,
        price: Math.round(currentPrice * 100),
        regularPrice: this.getOriginalPrice() ? Math.round(this.getOriginalPrice()! * 100) : null,
        promoName: null,
        isAvailable: this.getStockStatus(),
        hydrationData: this.getHydrationData()
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