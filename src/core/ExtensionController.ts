import { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { HonestyCalculator, HonestyResult } from './HonestyCalculator';
import { MessageRouter } from "@/core/MessageRouter";
import { createLogger } from '@/utils/logger';

export class ExtensionController {
    private adapter: IPriceAdapter;
    private currentUrl: string;
    private mountPoint: HTMLElement | null = null;
    private observer: MutationObserver | null = null;

    // Кеш для відновлення після агресивних перемалювань (Angular/React)
    private cachedHistory: any[] | null = null;
    private cachedHonestyScore: HonestyResult | null = null;
    private isProcessing = false;
    private logger;

    constructor(
        adapter: IPriceAdapter,
        private renderUI: (container: HTMLElement, history: any[], honestyScore: HonestyResult) => void
    ) {
        this.adapter = adapter;
        this.currentUrl = window.location.href;
        const traceId = Math.random().toString(36).slice(2, 10);
        this.logger = createLogger('ExtensionController', {
            runtime: 'content',
            store: this.adapter.getStoreDomain(),
            traceId,
        });
    }

    public init() {
        this.logger.info('Controller initialized', { url: this.currentUrl });
        this.processPage();

        // Надійний обсервер для SPA-додатків
        this.observer = new MutationObserver(() => {
            const url = location.href;
            if (url !== this.currentUrl) {
                // Сценарій 1: Користувач перейшов на іншу сторінку
                this.currentUrl = url;
                this.logger.info('Detected SPA navigation, restarting page processing', { url });
                this.cleanup();
                setTimeout(() => this.processPage(), 500);
            } else if (this.adapter.isProductPage() && this.cachedHistory && this.cachedHonestyScore && !this.isProcessing) {
                // Сценарій 2: URL той самий, але фреймворк магазину видалив наш графік з DOM
                if (!document.getElementById('fair-price-container')) {
                    const anchor = this.adapter.getUIAnchor();
                    // Відновлюємо тільки якщо якір існує (сторінка не перезавантажується повністю)
                    if (anchor) {
                        this.logger.info('UI mount was removed by page framework, restoring from cache');
                        this.mountPoint = null; // Скидаємо посилання на старий, видалений елемент
                        this.injectUI(this.cachedHistory, this.cachedHonestyScore);
                    }
                }
            }
        });

        this.observer.observe(document, { subtree: true, childList: true });
    }

    private cleanup() {
        if (this.mountPoint) {
            this.mountPoint.remove();
            this.mountPoint = null;
        }
        this.cachedHistory = null;
        this.cachedHonestyScore = null;
    }

    private async processPage() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        if (!this.adapter.isProductPage()) {
            MessageRouter.send({ type: 'SET_ICON', payload: { status: 'inactive' } }).catch(() => {});
            this.isProcessing = false;
            return;
        }

        try {
            const productData = await this.adapter.parseProductPage();
            if (!productData) {
                this.isProcessing = false;
                return;
            }

            const saveResponse = await MessageRouter.send({ type: 'SAVE_PRODUCT', payload: productData });
            if (!saveResponse?.success) {
                this.logger.warn('SAVE_PRODUCT failed, continue with local analysis', {
                    error: saveResponse?.error || 'unknown error',
                    code: saveResponse?.code || 'UNKNOWN',
                    productUrl: productData.url,
                    externalId: productData.externalId,
                });
            }

            const historyResponse = await MessageRouter.send({
                type: 'GET_HISTORY',
                payload: { url: productData.url }
            });

            if (!historyResponse?.success) {
                this.logger.warn('GET_HISTORY failed, fallback to empty history', {
                    error: historyResponse?.error || 'unknown error',
                    code: historyResponse?.code || 'UNKNOWN',
                    productUrl: productData.url,
                });
            }

            const historyData = Array.isArray(historyResponse?.data) ? historyResponse.data : [];
            let mappedHistory = historyData.map((item: any) => ({
                price: item.price,
                oldPrice: item.oldPrice,
                promoName: item.promoName,
                date: new Date(item.date).getTime()
            }));

            // ==========================================
            // 🛠 РЕЖИМ РОЗРОБНИКА (MOCK DATA)
            // ==========================================
            const DEV_MODE = false; // Зміни на false перед релізом!
            const SCENARIO: 'FAKE' | 'HONEST' | 'COLLECTING' = 'FAKE';

            if (DEV_MODE) {
                const now = Date.now();
                const day = 24 * 60 * 60 * 1000;

                if (SCENARIO === 'FAKE') {
                    productData.price = 1999 * 100;
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 60 * day },
                        { price: 2400, oldPrice: 2800, promoName: 'Весняний розпродаж', date: now - 30 * day },
                        { price: 3200, oldPrice: null, promoName: null, date: now - 12 * day },
                        { price: 1999, oldPrice: 3500, promoName: 'Супер Знижка', date: now }
                    ];
                }
                else if (SCENARIO === 'HONEST') {
                    productData.price = 1800 * 100;
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 60 * day },
                        { price: 2500, oldPrice: null, promoName: null, date: now - 45 * day },
                        { price: 2450, oldPrice: null, promoName: null, date: now - 30 * day },
                        { price: 2450, oldPrice: null, promoName: null, date: now - 10 * day },
                        { price: 1800, oldPrice: 2450, promoName: 'Чесний Розпродаж', date: now }
                    ];
                }
                else if (SCENARIO === 'COLLECTING') {
                    productData.price = 2500 * 100;
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 2 * day }
                    ];
                }
            }
            // ==========================================

            const honestyResult = HonestyCalculator.calculate(
                productData.price / 100,
                mappedHistory,
                productData.category
            );

            const iconStatus = honestyResult.state === 'single-price'
                ? 'single-price'
                : honestyResult.state !== 'analyzed'
                    ? 'inactive'
                    : (honestyResult.score < 40 ? 'error' : 'success');
            MessageRouter.send({ type: 'SET_ICON', payload: { status: iconStatus } }).catch(() => {});

            // Зберігаємо в кеш для моментального відновлення
            this.cachedHistory = mappedHistory;
            this.cachedHonestyScore = honestyResult;

            await this.injectUI(mappedHistory, honestyResult);

        } catch (error) {
            this.logger.error('Page processing failed', { error, url: this.currentUrl });
        } finally {
            this.isProcessing = false;
        }
    }

    private async injectUI(history: any[], honestyScore: HonestyResult) {
        const anchor = this.adapter.getUIAnchor();
        if (!anchor) return;

        // Перевіряємо, чи контейнер відсутній фізично в DOM
        if (!this.mountPoint || !document.contains(this.mountPoint)) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            // Додані відступи (my-4) та очищення обтікання, щоб макет магазину не "наїжджав" на графік
            this.mountPoint.className = 'w-full my-4 z-[999] block clear-both';

            const insertMethod = this.adapter.getUIInsertMethod();
            if (insertMethod === 'after') {
                anchor.parentNode?.insertBefore(this.mountPoint, anchor.nextSibling);
            } else {
                anchor.appendChild(this.mountPoint);
            }
        }

        this.renderUI(this.mountPoint, history, honestyScore);
    }
}