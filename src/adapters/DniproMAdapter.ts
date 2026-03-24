import { IPriceAdapter } from './IPriceAdapter';

export class DniproMAdapter implements IPriceAdapter {
    private productData: any = null;

    constructor() {
        this.extractJsonLd();
    }

    isApplicable(): boolean {
        return window.location.hostname.includes('dnipro-m.ua');
    }

    // Витягуємо гідратаційні дані
    private extractJsonLd() {
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of Array.from(scripts)) {
                if (script.textContent && script.textContent.includes('"@type": "Product"')) {
                    const cleanJson = script.textContent.replace(/\\n/g, '').trim();
                    const data = JSON.parse(cleanJson);

                    if (data && data['@type'] === 'Product') {
                        this.productData = data;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('FairPrice JSON-LD Error:', e);
        }
    }

    getProductID(): string | null {
        if (this.productData && this.productData.sku) return this.productData.sku.toString();
        const skuEl = document.querySelector('[data-product-id], .product-code__value');
        let id = skuEl ? skuEl.getAttribute('data-product-id') || skuEl.textContent?.trim() : null;
        if (!id) {
            const urlParts = window.location.pathname.split('/').filter(Boolean);
            id = urlParts[urlParts.length - 1];
        }
        return id || 'unknown-product';
    }

    getTitle(): string | null {
        if (this.productData && this.productData.name) return this.productData.name;
        const titleEl = document.querySelector('h1, .product-head__title');
        return titleEl ? titleEl.textContent?.trim() || null : document.title;
    }

    getCurrentPrice(): number | null {
        if (this.productData?.offers?.price) return parseFloat(this.productData.offers.price);
        const priceEl = document.querySelector('.product-price__current, [itemprop="price"], .price-block__actual');
        if (priceEl) {
            const parsed = parseInt(priceEl.textContent?.replace(/\D/g, '') || '0', 10);
            if (parsed > 0) return parsed;
        }
        return null;
    }

    getOriginalPrice(): number | null {
        const oldPriceEl = document.querySelector('.product-price__old, .price-block__old');
        if (!oldPriceEl) return null;
        const price = parseInt(oldPriceEl.textContent?.replace(/\D/g, '') || '0', 10);
        return price > 0 ? price : null;
    }

    getStockStatus(): boolean {
        if (this.productData?.offers?.availability) {
            return this.productData.offers.availability.includes('InStock');
        }
        const outOfStockEl = document.querySelector('.in-stock--false, .product-status--out-of-stock');
        return !outOfStockEl;
    }
}