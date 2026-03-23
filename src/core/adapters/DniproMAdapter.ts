import { IPriceAdapter } from './IPriceAdapter';

export class DniproMAdapter implements IPriceAdapter {
    private productData: any = null;

    constructor() {
        this.extractJsonLd();
    }

    isApplicable(): boolean {
        return window.location.hostname.includes('dnipro-m.ua');
    }

    // Витягуємо гідратаційні дані (Вимога ТЗ №1)
    private extractJsonLd() {
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of Array.from(scripts)) {
                if (script.textContent && script.textContent.includes('"@type": "Product"')) {
                    const cleanJson = script.textContent.replace(/\\n/g, '').trim();
                    const data = JSON.parse(cleanJson);

                    if (data && data['@type'] === 'Product') {
                        this.productData = data;
                        console.log('✅ [FairPrice] Успішно завантажено JSON-LD:', this.productData);
                        break; // Знайшли товар — зупиняємо пошук
                    }
                }
            }
        } catch (e) {
            console.error('❌ [FairPrice] Помилка парсингу JSON-LD:', e);
        }
    }

    getProductID(): string | null {
        // Пріоритет 1: Надійний SKU з бекенду
        if (this.productData && this.productData.sku) {
            return this.productData.sku.toString();
        }

        // Пріоритет 2: Старий запасний варіант
        const skuEl = document.querySelector('[data-product-id], .product-code__value');
        let id = skuEl ? skuEl.getAttribute('data-product-id') || skuEl.textContent?.trim() : null;
        if (!id) {
            const urlParts = window.location.pathname.split('/').filter(Boolean);
            id = urlParts[urlParts.length - 1];
        }
        return id || 'unknown-product';
    }

    getTitle(): string | null {
        // Пріоритет 1: Беремо ідеальну назву з JSON-LD
        if (this.productData && this.productData.name) {
            return this.productData.name;
        }

        // Пріоритет 2: Запасний варіант з HTML
        const titleEl = document.querySelector('h1, .product-head__title');
        if (titleEl) {
            return titleEl.textContent?.trim() || null;
        }

        return document.title;
    }

    getCurrentPrice(): number | null {
        // Пріоритет 1: Ціна з JSON-LD (найточніша)
        if (this.productData && this.productData.offers && this.productData.offers.price) {
            return parseFloat(this.productData.offers.price);
        }

        // Пріоритет 2: Старий запасний варіант
        const priceEl = document.querySelector('.product-price__current, [itemprop="price"], .price-block__actual, .buy-block__price');
        if (priceEl) {
            const parsed = parseInt(priceEl.textContent?.replace(/\D/g, '') || '0', 10);
            if (parsed > 0) return parsed;
        }
        return null;
    }

    getOriginalPrice(): number | null {
        // JSON-LD стандартно містить лише актуальну ціну продажу (offer).
        // Тому стару (перекреслену) ціну продовжуємо брати з DOM.
        const oldPriceEl = document.querySelector('.product-price__old, .price-block__old');
        if (!oldPriceEl) return null;
        const price = parseInt(oldPriceEl.textContent?.replace(/\D/g, '') || '0', 10);
        return price > 0 ? price : null;
    }

    // Перевірка наявності (Вимога ТЗ №5)
    getStockStatus(): boolean {
        if (this.productData && this.productData.offers && this.productData.offers.availability) {
            // Schema.org використовує 'http://schema.org/InStock'
            return this.productData.offers.availability.includes('InStock');
        }

        const outOfStockEl = document.querySelector('.in-stock--false, .product-status--out-of-stock');
        return outOfStockEl ? false : true;
    }
}