import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { parsePrice, waitForElement } from '@/utils/domUtils';
import { HydrationParser } from '@/utils/hydrationParser';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DniproMAdapter', { runtime: 'content', store: 'dnipro-m.ua' });

export class DniproMAdapter implements IPriceAdapter {
  getStoreDomain(): string { return 'dnipro-m.ua'; }
  isApplicable(): boolean { return window.location.hostname.includes('dnipro-m.ua'); }
  isProductPage(): boolean { return window.location.pathname.includes('/tovar/'); }
  isCatalogPage(): boolean { return !this.isProductPage() && document.querySelector('.catalog-list') !== null; }
  getUIAnchor(): Element | null {
    // Insert after the price+buy block so the chart appears directly below the price.
    return document.querySelector('.product-buy-info') ||
        document.querySelector('.product-price') ||
        document.querySelector('.product-code') ||
        document.querySelector('[itemprop="sku"]')?.closest('div') ||
        document.querySelector('h1');
  }
  getUIInsertMethod(): ContentScriptAppendMode { return 'after'; }

  getHydrationData(): any | null {
    const nextData = HydrationParser.parseNextData();
    return HydrationParser.getDniproMProduct(nextData);
  }

  getProductID(): string | null {
    const hyd = this.getHydrationData();
    if (hyd?.externalId) return hyd.externalId;
    return document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') ||
        document.querySelector('.product-code__code')?.textContent?.trim() || null;
  }

  getCurrentPrice(): number | null {
    const hyd = this.getHydrationData();
    if (hyd?.currentPrice) return parseFloat(hyd.currentPrice);
    const priceEl = document.querySelector('.product-price__current, .price__current');
    return parsePrice(priceEl?.textContent);
  }

  getOriginalPrice(): number | null {
    const hyd = this.getHydrationData();
    if (hyd?.oldPrice) return parseFloat(hyd.oldPrice);
    const oldPriceEl = document.querySelector('.product-price__old, .price__old');
    return parsePrice(oldPriceEl?.textContent);
  }

  getStockStatus(): boolean {
    const hyd = this.getHydrationData();
    return hyd?.isAvailable !== undefined ? hyd.isAvailable : true;
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      await waitForElement('h1', 8000);
      const currentPrice = this.getCurrentPrice();

      if (!currentPrice || currentPrice <= 0) return null;

      return {
        externalId: this.getProductID() || 'unknown',
        name: document.querySelector('h1')?.textContent?.trim() || 'Товар Dnipro-M',
        url: window.location.origin + window.location.pathname,
        price: Math.round(currentPrice * 100),
        regularPrice: this.getOriginalPrice() ? Math.round(this.getOriginalPrice()! * 100) : null,
        promoName: document.querySelector('.badge__text')?.textContent?.trim() || null,
        isAvailable: this.getStockStatus(),
        hydrationData: this.getHydrationData()
      };
    } catch (error) {
      logger.error('Failed to parse Dnipro-M product page', { error, url: window.location.href });
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> { return []; }
}