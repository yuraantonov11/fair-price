import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { parsePrice, queryFirst, waitForAnyElement } from '@/utils/domUtils';
import { HydrationParser } from '@/utils/hydrationParser';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DniproMAdapter', { runtime: 'content', store: 'dnipro-m.ua' });

export class DniproMAdapter implements IPriceAdapter {
  getStoreDomain(): string { return 'dnipro-m.ua'; }
  isApplicable(): boolean { return window.location.hostname.includes('dnipro-m.ua'); }
  isProductPage(): boolean { return window.location.pathname.includes('/tovar/'); }
  isCatalogPage(): boolean { return !this.isProductPage() && document.querySelector('.catalog-list') !== null; }
  getUIAnchor(): Element | null {
    return queryFirst([
      '.product-buy-info',
      '.product-main__buy',
      '.product-main__actions',
      '.product-price',
      '.product-card__price',
      '.product-code',
      '[itemprop="sku"]',
      'h1',
    ])?.closest('div') ?? queryFirst([
      '.product-buy-info',
      '.product-main__buy',
      '.product-main__actions',
      '.product-price',
      '.product-card__price',
      '.product-code',
      '[itemprop="sku"]',
      'h1',
    ]);
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
    const priceEl = queryFirst<HTMLElement>([
      '.product-price__current',
      '.price__current',
      '[data-price-current]',
      '[itemprop="price"]',
    ]);
    return parsePrice(priceEl?.textContent);
  }

  getOriginalPrice(): number | null {
    const hyd = this.getHydrationData();
    if (hyd?.oldPrice) return parseFloat(hyd.oldPrice);
    const oldPriceEl = queryFirst<HTMLElement>([
      '.product-price__old',
      '.price__old',
      '[data-price-old]',
    ]);
    return parsePrice(oldPriceEl?.textContent);
  }

  getStockStatus(): boolean {
    const hyd = this.getHydrationData();
    return hyd?.isAvailable !== undefined ? hyd.isAvailable : true;
  }

  extractCategoryFromDOM(): string | null {
    // Breadcrumbs: last meaningful crumb before the product name
    const breadcrumbs = Array.from(
      document.querySelectorAll('[itemprop="breadcrumb"] a, .breadcrumbs a, .breadcrumb a')
    );
    if (breadcrumbs.length > 1) {
      return breadcrumbs[breadcrumbs.length - 2]?.textContent?.trim() || null;
    }
    return null;
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      await waitForAnyElement(['h1', '.product-title', '.product-main h1'], 8000);
      const currentPrice = this.getCurrentPrice();

      if (!currentPrice || currentPrice <= 0) return null;

      const hydData = this.getHydrationData();
      const sourceConfidence: 'dom' | 'hydration' = hydData ? 'hydration' : 'dom';
      const category = this.extractCategoryFromDOM() || undefined;

      return {
        externalId: this.getProductID() || 'unknown',
        name: queryFirst<HTMLElement>(['h1', '.product-title', '.product-main h1'])?.textContent?.trim() || 'Товар Dnipro-M',
        url: window.location.origin + window.location.pathname,
        price: Math.round(currentPrice * 100),
        regularPrice: this.getOriginalPrice() ? Math.round(this.getOriginalPrice()! * 100) : null,
        promoName: document.querySelector('.badge__text')?.textContent?.trim() || null,
        isAvailable: this.getStockStatus(),
        hydrationData: hydData,
        category,
        sourceConfidence,
      };
    } catch (error) {
      logger.error('Failed to parse Dnipro-M product page', { error, url: window.location.href });
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> { return []; }
}