import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { waitForElement, parsePrice } from '@/utils/domUtils';
import {ContentScriptAppendMode} from "wxt/utils/content-script-ui/types";
import { createLogger } from '@/utils/logger';

const logger = createLogger('RozetkaAdapter', { runtime: 'content', store: 'rozetka.com.ua' });

export class RozetkaAdapter implements IPriceAdapter {

  getStoreDomain(): string { return 'rozetka.com.ua'; }
  isApplicable(): boolean { return window.location.hostname.includes('rozetka.com.ua'); }
  isProductPage(): boolean { return window.location.pathname.includes('/p'); }
  isCatalogPage(): boolean { return !this.isProductPage() && document.querySelector('.catalog-list, .products-list') !== null; }

  getUIAnchor(): Element | null {
    return document.querySelector('.product-trade') || document.querySelector('.product-about__right');
  }

  getUIInsertMethod(): ContentScriptAppendMode{
    return 'after';
  }

  getHydrationData(): any | null {
    try {
      // Сучасні фреймворки часто залишають state у глобальних змінних або скриптах
      const scripts = Array.from(document.querySelectorAll('script'));
      const stateScript = scripts.find(s => s.textContent?.includes('window.__INITIAL_STATE__'));
      if (stateScript && stateScript.textContent) {
        const match = stateScript.textContent.match(/window\.__INITIAL_STATE__\s*=\s*({.+});/);
        if (match) return JSON.parse(match[1]);
      }
    } catch (e) {
      logger.warn('Failed to parse hydration data', { error: e });
    }
    return null;
  }

  getProductID(): string | null {
    return document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') || null;
  }

  getCurrentPrice(): number | null {
    const priceEl = document.querySelector('.product-price__big');
    return parsePrice(priceEl?.textContent); // парсер повертає UAH
  }

  getOriginalPrice(): number | null {
    const oldPriceEl = document.querySelector('.product-price__small');
    return parsePrice(oldPriceEl?.textContent); // парсер повертає UAH
  }

  getStockStatus(): boolean {
    const buyButton = document.querySelector('app-buy-button button');
    return buyButton ? !buyButton.hasAttribute('disabled') : false;
  }

  extractCategoryFromDOM(): string | null {
    // Витягуємо категорію з хлібних крихт (зазвичай передостанній елемент)
    const breadcrumbs = Array.from(document.querySelectorAll('.breadcrumbs__link'));
    if (breadcrumbs.length > 1) {
      return breadcrumbs[breadcrumbs.length - 2]?.textContent?.trim() || null;
    }
    return null;
  }

  async parseProductPage(): Promise<ProductData | null> {
    let productData: Partial<ProductData> = {};

    // 1. Спроба розпарсити JSON-LD (швидко та надійно)
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.innerHTML);
        const product = Array.isArray(data) ? data.find(i => i['@type'] === 'Product') : data;

        if (product) {
          productData = {
            name: product.name,
            price: product.offers?.price ? Math.round(product.offers.price * 100) : undefined, // переводимо в копійки
            externalId: product.sku || product.productID,
            category: product.category || undefined
          };
        }
      } catch (e) {
        logger.warn('JSON-LD parse failed, fallback to DOM parsing', { error: e });
      }
    }

    // 2. Fallback на CSS-селектори та доповнення відсутніх даних
    try {
      await waitForElement('.product-price__big');

      const currentPriceUAH = this.getCurrentPrice();
      if (!currentPriceUAH && !productData.price) {
        logger.warn('Could not resolve valid price on page', { url: window.location.href });
        return null;
      }

      const sku = this.getProductID() || productData.externalId || 'unknown';
      const titleEl = document.querySelector('.product__title');
      const cleanUrl = window.location.origin + window.location.pathname;

      // Надаємо пріоритет ціні з DOM, якщо вона є (бо JSON-LD може кешуватися)
      const finalPrice = currentPriceUAH ? Math.round(currentPriceUAH * 100) : productData.price!;
      const originalPriceUAH = this.getOriginalPrice();

      logger.info('Parsed product successfully', { sku, priceUAH: finalPrice / 100 });

      return {
        externalId: sku,
        name: productData.name || titleEl?.textContent?.trim() || 'Невідомий товар Rozetka',
        url: cleanUrl,
        price: finalPrice, // Завжди в копійках
        regularPrice: originalPriceUAH ? Math.round(originalPriceUAH * 100) : null,
        promoName: null,
        isAvailable: this.getStockStatus(),
        hydrationData: this.getHydrationData(),
        category: productData.category || this.extractCategoryFromDOM() || 'Загальна' // Зберігаємо категорію
      };
    } catch (error) {
      logger.warn('Failed to parse page data', { error, url: window.location.href });
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> {
    return [];
  }
}