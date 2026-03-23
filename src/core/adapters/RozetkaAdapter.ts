// @ts-nocheck
import type { IPriceAdapter } from './IPriceAdapter';

export class RozetkaAdapter implements IPriceAdapter {
  isApplicable(url: string): boolean {
    return url.includes('rozetka.com.ua');
  }

  getProductID(): string | null {
    // 1. Спроба з URL
    const urlSkuMatch = window.location.href.match(/p(\d+)/);
    if (urlSkuMatch && urlSkuMatch[1]) {
      console.log('FairPrice: SKU found in URL:', urlSkuMatch[1]);
      return urlSkuMatch[1];
    }

    // 2. Спроба з DOM
    const skuElement = document.querySelector('.product__code-accent');
    const sku = skuElement ? skuElement.textContent?.trim().replace(/\D/g, '') || null : null;
    console.log('FairPrice: SKU found in DOM:', sku);
    return sku;
  }

  getCurrentPrice(): number | null {
    // Основні селектори для ціни
    const selectors = [
      '.product-price__big',
      '.product-prices__big',
      '.price__value',
      '[data-testid="price"]',
      'p.product-prices__big'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const priceText = el.textContent?.replace(/[^0-9]/g, '');
        if (priceText) {
          console.log('FairPrice: Current Price found:', parseInt(priceText, 10));
          return parseInt(priceText, 10);
        }
      }
    }
    console.warn('FairPrice: Current Price NOT found');
    return null;
  }

  getOriginalPrice(): number | null {
    const selectors = [
      '.product-price__small',
      '.product-prices__small',
      '.price__old',
      '[data-testid="old-price"]',
      'p.product-prices__small'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const priceText = el.textContent?.replace(/[^0-9]/g, '');
        if (priceText) {
            console.log('FairPrice: Original Price found:', parseInt(priceText, 10));
            return parseInt(priceText, 10);
        }
      }
    }
    return null;
  }

  getTitle(): string | null {
    const titleEl = document.querySelector('.product__title') || document.querySelector('h1.product__title');
    return titleEl ? titleEl.textContent?.trim() || null : document.title;
  }

  isInStock(): boolean {
    const statusElement = document.querySelector('.status-label');
    if (!statusElement) return true; // Припускаємо, що є, якщо немає мітки

    const statusText = statusElement.textContent?.toLowerCase() || '';
    return !statusText.includes('немає в наявності') && !statusText.includes('закінчився');
  }
}