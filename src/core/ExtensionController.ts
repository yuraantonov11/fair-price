import { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { ProductData } from '@/types';
import { waitForElement } from '@/utils/domUtils';
import { HonestyCalculator } from './HonestyCalculator';
import {MessageRouter} from "@/core/MessageRouter";

console.error('[FairPrice: BOOT] 🟧 3. Модуль ExtensionController завантажено в пам\'ять!');

export class ExtensionController {
    private adapter: IPriceAdapter;
    private currentUrl: string;
    private mountPoint: HTMLElement | null = null;
    private root: any = null;

    constructor(adapter: IPriceAdapter, private renderUI: (container: HTMLElement, history: any[], honestyScore: number) => void) {
        this.adapter = adapter;
        this.currentUrl = window.location.href;
    }

    public init() {
        console.log(`[FairPrice] Ініціалізація для ${this.adapter.storeName}`);
        this.processPage();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                this.onUrlChange();
            }
        }).observe(document, {subtree: true, childList: true});
    }

    private onUrlChange() {
        console.log('[FairPrice] Виявлено SPA навігацію. Перезапуск...');
        this.currentUrl = location.href; // Оновлюємо URL
        this.cleanup();
        setTimeout(() => this.processPage(), 500);
    }

    private cleanup() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        if (this.mountPoint) {
            this.mountPoint.remove();
            this.mountPoint = null;
        }
    }

    private async processPage() {
        console.log(`[FairPrice] 🚀 Запуск processPage для URL: ${this.currentUrl}`);

        if (!this.adapter.isProductPage(this.currentUrl)) {
            console.log('[FairPrice] 🛑 Це не сторінка товару (перевірка isProductPage не пройдена). Перериваємо.');
            return;
        }

        try {
            console.log('[FairPrice] ⏳ Спроба витягнути дані про товар...');
            const productData = await this.adapter.extractData();

            if (!productData) {
                console.warn('[FairPrice] ⚠️ Дані не витягнуто (extractData повернув null). Можливо, змінилася верстка сайту або селектори неактуальні.');
                return;
            }
            console.log('[FairPrice] ✅ Дані успішно отримані:', productData);

            console.log('[FairPrice] 💾 Відправляємо дані в background для збереження...');
            await MessageRouter.send({
                type: 'SAVE_PRODUCT',
                payload: productData
            });

            console.log('[FairPrice] 📥 Запитуємо історію цін з БД...');
            const historyResponse = await MessageRouter.send({
                type: 'GET_HISTORY',
                payload: { url: productData.url }
            });

            if (!historyResponse.success) {
                throw new Error('Failed to fetch history');
            }
            console.log(`[FairPrice] 📊 Отримано історію (${historyResponse.data.length} записів):`, historyResponse.data);

            const mappedHistory = historyResponse.data.map((item: any) => ({
                price: item.price,
                date: new Date(item.created_at).getTime()
            }));

            const honestyResult = HonestyCalculator.calculate(productData.currentPrice, mappedHistory);
            console.log(`[FairPrice] Результат аналізу:`, honestyResult);

            await this.injectUI(mappedHistory, honestyResult);

        } catch (error) {
            console.error('[FairPrice] ❌ Помилка обробки сторінки:', error);
        }
    }

    private async injectUI(history: any[], honestyScore: number) {
        const targetContainer = await waitForElement(this.adapter.injectTargetSelector);

        if (!this.mountPoint) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            this.mountPoint.className = 'tw-mt-4 tw-p-4 tw-border tw-rounded tw-bg-white';
            targetContainer.appendChild(this.mountPoint);
        }

        this.renderUI(this.mountPoint, history, honestyScore);
    }
}