import { IPriceAdapter } from './IPriceAdapter';
import { ProductData } from '@/types';
import { parsePrice, waitForElement } from '@/utils/domUtils';

export class DniproMAdapter implements IPriceAdapter {
    storeName = 'dnipro-m' as const;
    injectTargetSelector = '.product-card-info__price, .price-block, h1';

    matchDomain(hostname: string): boolean {
        return hostname.includes('dnipro-m.ua');
    }

    isProductPage(url: string): boolean {
        return url.includes('/tovar/');
    }

    async extractData(): Promise<ProductData | null> {
        console.group('[FairPrice FINAL DEBUG]');
        try {
            await waitForElement('h1', 5000);

            let price: number | null = null;
            let title: string | null = document.querySelector('h1')?.textContent?.trim() || null;

            // 1. Шукаємо ціну в УСІХ скриптах (ld+json та __NEXT_DATA__)
            const allScripts = document.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__');
            console.log(`Знайдено ${allScripts.length} потенційних джерел JSON`);

            for (const s of Array.from(allScripts)) {
                try {
                    const json = JSON.parse(s.textContent || '{}');

                    // Рекурсивний пошук ключа "price" в об'єкті будь-якої вкладеності
                    const findPrice = (obj: any): any => {
                        if (!obj || typeof obj !== 'object') return null;
                        if (obj.price && (typeof obj.price === 'number' || typeof obj.price === 'string')) return obj.price;
                        for (const key in obj) {
                            const found = findPrice(obj[key]);
                            if (found) return found;
                        }
                        return null;
                    };

                    const foundPrice = findPrice(json);
                    if (foundPrice) {
                        console.log('✅ Ціну знайдено в JSON:', foundPrice);
                        price = typeof foundPrice === 'string' ? parseFloat(foundPrice) : foundPrice;
                        break;
                    }
                } catch (e) { /* ігноруємо помилки парсингу окремих скриптів */ }
            }

            // 2. Якщо JSON мовчить, шукаємо в DOM за атрибутами (SEO Style)
            if (!price) {
                console.warn('JSON не дав результату. Шукаємо в DOM...');
                const priceSelectors = [
                    '[itemprop="price"]',
                    '.product-card-info__price-current',
                    '.price__value',
                    '.product-card-info__price'
                ];

                for (const sel of priceSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        console.log(`Спроба селектора ${sel}:`, el.textContent);
                        price = parsePrice(el.textContent);
                        if (price) break;
                    }
                }
            }

            if (!price) {
                console.error('❌ Ціну не знайдено жодним методом.');
                console.groupEnd();
                return null;
            }

            const data: ProductData = {
                url: window.location.origin + window.location.pathname,
                title: title || 'Товар Dnipro-M',
                currentPrice: price,
                oldPrice: parsePrice(document.querySelector('.product-card-info__price-old, .price__old')?.textContent),
                store: this.storeName
            };

            console.log('🚀 УСПІХ! Дані зібрано:', data);
            console.groupEnd();
            return data;

        } catch (error) {
            console.error('Помилка:', error);
            console.groupEnd();
            return null;
        }
    }
}