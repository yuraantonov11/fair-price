import { IPriceAdapter, ProductData } from './IPriceAdapter';

export class RozetkaAdapter implements IPriceAdapter {
  getStoreDomain(): string {
    return 'rozetka.com.ua';
  }

  isProductPage(): boolean {
    return !!document.querySelector('rz-product-main-info');
  }

  isCatalogPage(): boolean {
    return !!document.querySelector('rz-catalog');
  }

  parseProductPage(): ProductData | null {
    if (!this.isProductPage()) return null;

    const name = document.querySelector('h1.product__title')?.textContent?.trim() || document.title;

    const priceElem = document.querySelector('p.product-price__big');
    const regularPriceElem = document.querySelector('p.product-price__small');

    const priceText = priceElem?.textContent?.replace(/\D/g, '') || '0';
    const price = parseInt(priceText) * 100;

    let regularPrice = null;
    const regularPriceText = regularPriceElem?.textContent?.replace(/\D/g, '');
    if (regularPriceText) {
      regularPrice = parseInt(regularPriceText) * 100;
    }

    const urlParams = window.location.href.split('/');
    const pIdIndex = urlParams.findIndex(p => p.startsWith('p'));
    let externalId = '';
    if (pIdIndex !== -1) {
      externalId = urlParams[pIdIndex].replace('p', '');
    }

    const isAvailable = !!document.querySelector('rz-product-buy-btn button.buy-button:not([disabled])');

    return {
      externalId,
      name,
      url: window.location.href,
      price,
      regularPrice,
      isAvailable
    };
  }

  parseCatalogPage(): ProductData[] {
    const products: ProductData[] = [];
    if (!this.isCatalogPage()) return products;

    const cards = document.querySelectorAll('rz-catalog-tile');

    cards.forEach(card => {
      try {
        const linkElem = card.querySelector('a.goods-tile__heading') as HTMLAnchorElement;
        const priceElem = card.querySelector('.goods-tile__price-value');
        const regularPriceElem = card.querySelector('.goods-tile__price--old');

        if (linkElem && priceElem) {
          const url = linkElem.href;
          const urlParts = url.split('/');
          const pIdPart = urlParts.find(p => p.startsWith('p'));
          const externalId = pIdPart ? pIdPart.replace('p', '') : '';

          const price = parseInt(priceElem.textContent?.replace(/\D/g, '') || '0') * 100;
          const regularPrice = regularPriceElem ? parseInt(regularPriceElem.textContent?.replace(/\D/g, '') || '0') * 100 : null;

          products.push({
            externalId,
            name: linkElem.textContent?.trim() || '',
            url,
            price,
            regularPrice,
            isAvailable: !card.querySelector('.goods-tile__availability--out-of-stock')
          });
        }
      } catch (e) {
        console.warn('Помилка парсингу картки в каталозі Rozetka', e);
      }
    });

    return products;
  }

  getUIAnchor(): Element | null {
    return document.querySelector('rz-product-main-info .product-price, .buy-block, rz-product-buy-btn');
  }

  getUIInsertMethod(): ContentScriptAppendMode {
    return 'after';
  }

  isApplicable(): boolean {
    return window.location.hostname.includes(this.getStoreDomain());
  }

  async injectProvider(): Promise<void> {
    return Promise.resolve();
  }
}