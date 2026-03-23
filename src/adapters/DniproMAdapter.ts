import { IPriceAdapter } from './IPriceAdapter';

export class DniproMAdapter implements IPriceAdapter {

    getProductID(): string | null {
        // 1. ЗАПУСКАЄМО РОЗВІДКУ ТУТ (коли DOM вже точно готовий)
        console.log('🕵️‍♂️ FairPrice: Починаємо сканування прихованих даних сторінки...');
        this.exploreHydrationData();

        // 2. СТАРИЙ КОД ПОШУКУ ID (щоб віджет продовжував працювати)
        const skuEl = document.querySelector('[data-product-id], .product-code__value');
        let id = skuEl ? skuEl.getAttribute('data-product-id') || skuEl.textContent?.trim() : null;

        if (!id) {
            const urlParts = window.location.pathname.split('/').filter(Boolean);
            id = urlParts[urlParts.length - 1];
        }

        console.log('FairPrice: Знайдений ID:', id);
        return id || 'unknown-product';
    }

    // МЕТОД-ШПИГУН
    exploreHydrationData() {
        try {
            // Стратегія 1: JSON-LD (Schema.org) - стандарт для SEO
            const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
            jsonLdScripts.forEach((script, index) => {
                if (script.textContent && script.textContent.includes('Product')) {
                    try {
                        const data = JSON.parse(script.textContent.replace(/\\n/g, '').trim());
                        console.log(`✅ [Розвідка] Знайдено JSON-LD Product [${index}]:`, data);
                    } catch (e) {
                        console.log(`⚠️ [Розвідка] Знайдено JSON-LD, але помилка парсингу:`, script.textContent.substring(0, 100));
                    }
                }
            });

            // Стратегія 2: Внутрішній стан фреймворків (Nuxt.js / Next.js)
            const frameworkData = document.querySelector('#__NUXT_DATA__, #__NEXT_DATA__');
            if (frameworkData?.textContent) {
                console.log(`✅ [Розвідка] Знайдено стан Nuxt/Next:`, JSON.parse(frameworkData.textContent));
            }

            // Стратегія 3: GTM / DataLayer (Аналітика e-commerce)
            const allScripts = document.querySelectorAll('script');
            allScripts.forEach(script => {
                if (script.textContent && (script.textContent.includes('dataLayer.push') || script.textContent.includes('ecommerce'))) {
                    console.log('✅ [Розвідка] Знайдено скрипт з e-commerce dataLayer (перші 200 символів):', script.textContent.substring(0, 200) + '...');
                }
            });

        } catch (e) {
            console.error('❌ [Розвідка] Критична помилка сканування:', e);
        }
    }

    getCurrentPrice(): number | null {
        const priceEl = document.querySelector('.product-price__current, [itemprop="price"], .price-block__actual, .buy-block__price');
        if (priceEl) {
            const parsed = parseInt(priceEl.textContent?.replace(/\D/g, '') || '0', 10);
            if (parsed > 0) return parsed;
        }
        const metaPrice = document.querySelector('meta[itemprop="price"]');
        if (metaPrice) return parseInt(metaPrice.getAttribute('content') || '0', 10);
        return null;
    }

    getOriginalPrice(): number | null {
        const oldPriceEl = document.querySelector('.product-price__old, .price-block__old');
        if (!oldPriceEl) return null;
        const price = parseInt(oldPriceEl.textContent?.replace(/\D/g, '') || '0', 10);
        return price > 0 ? price : null;
    }

    getStockStatus(): boolean {
        const outOfStockEl = document.querySelector('.in-stock--false, .product-status--out-of-stock');
        return outOfStockEl ? false : true;
    }
}