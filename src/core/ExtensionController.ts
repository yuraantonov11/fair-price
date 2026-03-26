import { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { HonestyCalculator } from './HonestyCalculator';
import { MessageRouter } from "@/core/MessageRouter";

export class ExtensionController {
    private adapter: IPriceAdapter;
    private currentUrl: string;
    private mountPoint: HTMLElement | null = null;
    private observer: MutationObserver | null = null;

    constructor(
        adapter: IPriceAdapter,
        private renderUI: (container: HTMLElement, history: any[], honestyScore: { score: number; message: string }) => void
    ) {
        this.adapter = adapter;
        this.currentUrl = window.location.href;
    }

    public init() {
        console.log(`[FairPrice] Ініціалізація для ${this.adapter.getStoreDomain()}`);
        this.processPage();

        // Надійний обсервер для SPA-додатків
        this.observer = new MutationObserver(() => {
            const url = location.href;
            if (url !== this.currentUrl) {
                this.currentUrl = url;
                console.log('[FairPrice] Виявлено SPA навігацію. Перезапуск...');
                this.cleanup();
                // Дебаунс для того, щоб React/Next.js встиг відрендерити новий DOM
                setTimeout(() => this.processPage(), 500);
            }
        });
        this.observer.observe(document, { subtree: true, childList: true });
    }

    private cleanup() {
        if (this.mountPoint) {
            this.mountPoint.remove();
            this.mountPoint = null;
        }
    }

    private async processPage() {
        if (!this.adapter.isProductPage()) {
            MessageRouter.send({ type: 'SET_ICON', payload: { status: 'inactive' } }).catch(() => {});
            return;
        }

        try {
            const productData = await this.adapter.parseProductPage();
            if (!productData) return;

            await MessageRouter.send({ type: 'SAVE_PRODUCT', payload: productData });

            const historyResponse = await MessageRouter.send({
                type: 'GET_HISTORY',
                payload: { url: productData.url }
            });

            if (!historyResponse.success) throw new Error('Failed to fetch history');

            let mappedHistory = historyResponse.data.map((item: any) => ({
                price: item.price,
                oldPrice: item.oldPrice,
                promoName: item.promoName,
                date: new Date(item.date).getTime()
            }));

            // ==========================================
            // 🛠 РЕЖИМ РОЗРОБНИКА (MOCK DATA)
            // ==========================================
            const DEV_MODE = true; // Зміни на false перед релізом!

            // Змінюй це значення для тестування різних станів:
            // 'FAKE'       - Маніпуляція (штучне підняття перед акцією)
            // 'HONEST'     - Дійсно вигідна і чесна знижка
            // 'COLLECTING' - Недостатньо даних (менше 3 записів)
            const SCENARIO: 'FAKE' | 'HONEST' | 'COLLECTING' = 'FAKE';

            if (DEV_MODE) {
                console.warn(`[FairPrice: DEV MODE] Увімкнено сценарій: ${SCENARIO}`);
                const now = Date.now();
                const day = 24 * 60 * 60 * 1000;

                if (SCENARIO === 'FAKE') {
                    productData.price = 1999 * 100; // Підміняємо поточну ціну
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 60 * day },
                        { price: 2400, oldPrice: 2800, promoName: 'Весняний розпродаж', date: now - 30 * day },
                        { price: 3200, oldPrice: null, promoName: null, date: now - 12 * day }, // Стрибок
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
                        { price: 1800, oldPrice: 2450, promoName: 'Чесний Розпродаж', date: now } // Реальне падіння
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

            const volatility = this.adapter.getStoreDomain() === 'dnipro-m.ua' ? 0.08 : 0.15;

            // Передаємо поточну ціну (справжню або підмінену тестову)
            const honestyResult = HonestyCalculator.calculate(
                productData.price / 100,
                mappedHistory,
                volatility
            );

            const iconStatus = honestyResult.score === -1 ? 'inactive' : (honestyResult.score < 40 ? 'error' : 'success');
            MessageRouter.send({ type: 'SET_ICON', payload: { status: iconStatus } }).catch(() => {});

            await this.injectUI(mappedHistory, honestyResult);

        } catch (error) {
            console.error('[FairPrice] ❌ Помилка обробки сторінки:', error);
        }
    }

    private async injectUI(history: any[], honestyScore: { score: number; message: string }) {
        const anchor = this.adapter.getUIAnchor();
        if (!anchor) return;

        if (!this.mountPoint) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            this.mountPoint.className = 'w-full mt-4 mb-4 z-50 block'; // Tailwind замість inline-стилів

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