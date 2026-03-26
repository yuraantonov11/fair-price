import { ProductData } from '@/types';

export interface IPriceAdapter {
  readonly storeName: 'rozetka' | 'dnipro-m';

  /**
   * Селектор, після або всередині якого буде інжектований наш графік
   */
  readonly injectTargetSelector: string;

  /**
   * Перевіряє, чи відповідає поточний домен цьому адаптеру
   */
  matchDomain(hostname: string): boolean;

  /**
   * Перевіряє, чи ми знаходимось на сторінці конкретного товару
   */
  isProductPage(url: string): boolean;

  /**
   * Витягує всі необхідні дані зі сторінки.
   */
  extractData(): Promise<ProductData | null>;
}