import { IPriceAdapter, ProductData } from './IPriceAdapter';

export class DniproMAdapter implements IPriceAdapter {
    getStoreDomain(): string {
        return 'dnipro-m.ua';
    }

    isProductPage(): boolean {
        return window.location.pathname.includes('/tovar/');
    }

    isCatalogPage(): boolean {
        return window.location.pathname.includes('/catalog/') || window.location.pathname.includes('/sale/');
    }

    async parseProductPage(): Promise<ProductData | null> {
        if (!this.isProductPage()) return null;

        const name = document.querySelector('h1')?.textContent?.trim() || document.title;

        // Спроба отримати дані з GTM (надійніше)
        const gtmPromo = window.dataLayer?.find((i: any) => i.event === 'view_promotion')?.ecommerce?.promotion_name;
        const gtmProduct = window.dataLayer?.find((i: any) => i.event === 'view_item')?.ecommerce?.items?.[0];

        const externalId = gtmProduct?.item_id || document.querySelector('[data-product-id]')?.getAttribute('data-product-id') || '';

        const priceElem = document.querySelector('.price__current, .product-price__current');
        const regularPriceElem = document.querySelector('.price__old, .product-price__old');

        const priceText = priceElem?.textContent?.replace(/\D/g, '') || gtmProduct?.price?.toString() || '0';
        const price = parseInt(priceText) * 100;

        let regularPrice = null;
        const regularPriceText = regularPriceElem?.textContent?.replace(/\D/g, '');

        if (regularPriceText) {
            regularPrice = parseInt(regularPriceText) * 100;
        } else if (gtmProduct?.discount) {
            regularPrice = price + (parseInt(gtmProduct.discount) * 100);
        }

        const isAvailable = !document.querySelector('.out-of-stock');

        return {
            externalId,
            name,
            url: window.location.href,
            price,
            regularPrice,
            promoName: gtmPromo || null,
            isAvailable
        };
    }

    parseCatalogPage(): ProductData[] {
        const products: ProductData[] = [];
        if (!this.isCatalogPage()) return products;

        const cards = document.querySelectorAll('.catalog-grid .product-card, .catalog-item, .catalog-card');

        cards.forEach(card => {
            try {
                const linkElem = card.querySelector('a.product-card__title, a.catalog-card__link') as HTMLAnchorElement;
                const priceElem = card.querySelector('.price__current, .catalog-card__price');
                const regularPriceElem = card.querySelector('.price__old, .catalog-card__old-price');

                if (linkElem && priceElem) {
                    const url = linkElem.href;
                    const externalId = card.getAttribute('data-product-id') || url.split('/').filter(Boolean).pop() || '';

                    const price = parseInt(priceElem.textContent?.replace(/\D/g, '') || '0') * 100;
                    const regularPrice = regularPriceElem ? parseInt(regularPriceElem.textContent?.replace(/\D/g, '') || '0') * 100 : null;

                    products.push({
                        externalId,
                        name: linkElem.textContent?.trim() || '',
                        url,
                        price,
                        regularPrice,
                        isAvailable: !card.classList.contains('out-of-stock')
                    });
                }
            } catch (e) {
                console.warn('Помилка парсингу картки в каталозі Dnipro-M', e);
            }
        });

        return products;
    }

    getUIAnchor(): Element | null {
        return document.querySelector('.product-buy-section, .price-block, .product-action-block, .buy-block');
    }

    getUIInsertMethod(): ContentScriptAppendMode {
        return 'after';
    }

    isApplicable(): boolean {
        return window.location.hostname.includes(this.getStoreDomain());
    }

    async injectProvider() {
        try {
            await injectScript('/pageProvider.js', {
                keepInDom: false,
            });
            console.log("FairPrice: Page Provider injected successfully");
        } catch (e) {
            console.error("FairPrice: Injection failed:", e);
        }
    }
}