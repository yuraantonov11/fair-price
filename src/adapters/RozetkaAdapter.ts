import { IPriceAdapter } from './IPriceAdapter';
import { ProductData } from '@/types';
import { waitForElement, parsePrice } from '@/utils/domUtils';

export class RozetkaAdapter implements IPriceAdapter {
  storeName = 'rozetka' as const;

  // Блок на Розетці, біля якого зазвичай малюють інфу про товар (кнопки купити тощо)
  injectTargetSelector = '.product-about__right';

  matchDomain(hostname: string): boolean {
    return hostname.includes('rozetka.com.ua');
  }

  isProductPage(url: string): boolean {
    // Розетка використовує /p у шляху для товарів
    return url.includes('/p');
  }

  async extractData(): Promise<ProductData | null> {
    try {
      // Очікуємо появи головної ціни, оскільки Розетка - це SPA
      await waitForElement('.product-price__big');

      const titleEl = document.querySelector('.product__title');
      const priceEl = document.querySelector('.product-price__big');
      const oldPriceEl = document.querySelector('.product-price__small');

      const currentPrice = parsePrice(priceEl?.textContent);
      if (!currentPrice) return null;

      // Відрізаємо GET-параметри від URL, щоб історія зберігалася для одного товару коректно
      const cleanUrl = window.location.origin + window.location.pathname;

      return {
        url: cleanUrl,
        title: titleEl?.textContent?.trim() || 'Невідомий товар Rozetka',
        currentPrice,
        oldPrice: parsePrice(oldPriceEl?.textContent),
        store: this.storeName
      };
    } catch (error) {
      console.warn('[FairPrice] RozetkaAdapter: Не вдалося розпарсити дані', error);
      return null;
    }
  }
}