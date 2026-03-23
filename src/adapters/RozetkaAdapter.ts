import { IPriceAdapter } from './IPriceAdapter';

export class RozetkaAdapter implements IPriceAdapter {
  getProductID(): string | null {
    // Приклад вилучення ID зі сторінки Rozetka
    const element = document.querySelector('rz-product-main-info');
    return element ? element.getAttribute('data-product-id') : null;
  }

  getCurrentPrice(): number | null {
    const priceEl = document.querySelector('.product-price__big');
    if (!priceEl) return null;
    return parseInt(priceEl.textContent?.replace(/\D/g, '') || '0', 10);
  }

  getOriginalPrice(): number | null {
    const oldPriceEl = document.querySelector('.product-price__small');
    if (!oldPriceEl) return null;
    return parseInt(oldPriceEl.textContent?.replace(/\D/g, '') || '0', 10);
  }

  getHydrationData(): any {
    const nextData = document.getElementById('__NEXT_DATA__');
    return nextData ? JSON.parse(nextData.textContent || '{}') : null;
  }

  getStockStatus(): boolean {
    const statusEl = document.querySelector('.status-label');
    return statusEl ? !statusEl.textContent?.includes('Немає в наявності') : true;
  }
}