import { createLogger } from '@/utils/logger';

const logger = createLogger('HydrationParser', { runtime: 'content', store: 'dnipro-m.ua' });

export class HydrationParser {
    static parseNextData(): any {
        const script = document.getElementById('__NEXT_DATA__');
        if (script) {
            try {
                const data = JSON.parse(script.textContent || '{}');
                // Шлях до даних у Dnipro-M зазвичай лежить у props.pageProps
                return data?.props?.pageProps || null;
            } catch (e) {
                logger.warn('Failed to parse __NEXT_DATA__ payload', { error: e });
            }
        }
        return null;
    }

    /**
     * Специфічний мапінг для Dnipro-M
     */
    static getDniproMProduct(data: any) {
        if (!data || !data.product) return null;

        const p = data.product;
        return {
            externalId: String(p.id),
            title: p.title,
            currentPrice: p.price, // Тут ціна вже зазвичай у форматі number
            oldPrice: p.oldPrice || null,
            isAvailable: p.isAvailable ?? true
        };
    }
}