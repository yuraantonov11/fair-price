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

    // У DniproMAdapter.ts

    private async getPageVariable(varName: string): Promise<any> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn(`[FairPrice] Timeout waiting for ${varName}`);
                document.removeEventListener('RECEIVE_PAGE_DATA', onDataReceived);
                resolve(null);
            }, 2000); // 2 секунди ліміт очікування

            const onDataReceived = (event: any) => {
                if (event.detail.varName === varName) {
                    clearTimeout(timeout);
                    document.removeEventListener('RECEIVE_PAGE_DATA', onDataReceived);
                    resolve(event.detail.value);
                }
            };

            document.addEventListener('RECEIVE_PAGE_DATA', onDataReceived);

            // ВАЖЛИВО: Відправляємо запит
            document.dispatchEvent(new CustomEvent('GET_PAGE_DATA', {
                detail: { varName }
            }));
        });
    }

    async getPromoName(): Promise<string | null> {
        const dl = await this.getPageVariable('dataLayer');

        if (!dl || !Array.isArray(dl)) return null;

        // Шукаємо об'єкт ecommerce, де є view_item або product-details
        const viewItemEvent = dl.find(item => item.event === 'view_item' || item.ecommerce?.detail);

        if (viewItemEvent && viewItemEvent.ecommerce) {
            // Структура GTM для товарів зазвичай така:
            const products = viewItemEvent.ecommerce.items || [viewItemEvent.ecommerce.detail?.products?.[0]];
            const product = products?.[0];

            if (product) {
                console.log("[FairPrice] Знайдено товар у dataLayer:", product.item_name || product.name);
                // Якщо в об'єкті товару є назва акції або знижка:
                return product.discount || product.coupon || "Акційна ціна";
            }
        }

        return null;
    }

    async injectProvider() {
        try {
            // WXT автоматично зробить файл доступним за цим шляхом
            await injectScript('/pageProvider.js', {
                keepInDom: false,
            });
            console.log("FairPrice: Page Provider injected successfully");
        } catch (e) {
            console.error("FairPrice: Injection failed:", e);
        }
    }
}