import { IPriceAdapter } from './IPriceAdapter';

export class RozetkaAdapter implements IPriceAdapter {

  // Цей метод тепер існує, і помилка зникне!
  isApplicable(): boolean {
    return window.location.hostname.includes('rozetka.com.ua');
  }

  getProductID(): string | null {
    return null; // Поки що заглушка, напишемо пізніше
  }

  getTitle(): string | null {
    return null;
  }

  getCurrentPrice(): number | null {
    return null;
  }

  getOriginalPrice(): number | null {
    return null;
  }

  getStockStatus(): boolean {
    return true;
  }
}