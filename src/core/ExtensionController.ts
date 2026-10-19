import type { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { HonestyCalculator, honestyIcon, type HonestyResult } from './HonestyCalculator';
import { MessageRouter } from '@/core/MessageRouter';
import { createLogger } from '@/utils/logger';
import { runtimeFailure } from '@/utils/runtimeErrors';
import { resolveChartTestMode } from '@/core/chartTestMode';
import { isMountMissing, isMountOutOfPlace, placeMountNearAnchor } from '@/core/spaReinjectHelper';
import type { HistoryPoint, HistoryView, RuntimeResponse } from '@/types/runtime';
import type { ExtensionMessage } from '@/types/messages';

export class ExtensionController {
    private currentUrl = window.location.href;
    private mountPoint: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private processTimer: number | null = null;
    private restoreTimer: number | null = null;
    private freshnessTimer: number | null = null;
    private generation = 0;
    private processing = false;
    private cached: { history: HistoryPoint[]; honesty: HonestyResult; view: HistoryView } | null = null;
    private traceId = crypto.randomUUID();
    private logger;

    constructor(
        private adapter: IPriceAdapter,
        private renderUI: (container: HTMLElement, history: HistoryPoint[], honesty: HonestyResult, view: HistoryView) => void | Promise<void>,
        private disposeUI: () => void = () => {},
    ) {
        this.logger = createLogger('ExtensionController', { runtime: 'content', store: adapter.getStoreDomain(), traceId: this.traceId });
    }

    public init() {
        void this.processPage();
        this.observer = new MutationObserver(() => {
            if (location.href !== this.currentUrl) {
                this.currentUrl = location.href;
                ++this.generation; // Invalidate old work immediately, before the navigation debounce.
                this.cleanup();
                this.scheduleProcessPage();
            } else if (this.cached && !this.processing) {
                const anchor = this.adapter.getUIAnchor();
                if (anchor && (isMountMissing(this.mountPoint) || isMountOutOfPlace(this.mountPoint, anchor, this.adapter.getUIInsertMethod()))) {
                    if (this.restoreTimer !== null) return;
                    this.restoreTimer = window.setTimeout(() => {
                        this.restoreTimer = null;
                        if (this.cached) void this.injectUI();
                    }, 150);
                }
            }
        });
        this.observer.observe(document, { subtree: true, childList: true });
    }

    public destroy() {
        ++this.generation;
        this.observer?.disconnect();
        this.observer = null;
        this.cleanup();
    }

    private cleanup() {
        if (this.processTimer !== null) window.clearTimeout(this.processTimer);
        if (this.restoreTimer !== null) window.clearTimeout(this.restoreTimer);
        if (this.freshnessTimer !== null) window.clearTimeout(this.freshnessTimer);
        this.freshnessTimer = null;
        this.processTimer = this.restoreTimer = null;
        this.disposeUI();
        this.mountPoint?.remove();
        this.mountPoint = null;
        this.cached = null;
        this.processing = false;
    }

    private scheduleProcessPage() {
        if (this.processTimer !== null) window.clearTimeout(this.processTimer);
        this.processTimer = window.setTimeout(() => {
            this.processTimer = null;
            void this.processPage();
        }, 250);
    }

    private send<T = unknown>(message: ExtensionMessage) {
        return MessageRouter.send<T>({ ...message, traceId: this.traceId });
    }

    private async processPage(forceRefresh = false) {
        const run = ++this.generation;
        const url = this.currentUrl;
        const active = () => run === this.generation && location.href === url;
        this.processing = true;
        let currentPrice: number | undefined;
        let regularPrice: number | null | undefined;
        const show = async (history: HistoryPoint[], view: HistoryView, testMode = false) => {
            if (!active()) return;
            const honesty = HonestyCalculator.calculate(currentPrice ?? 0,
                history.map(p => ({ ...p, date: new Date(p.date).getTime() })), this.category, { regularPrice });
            if (testMode) honesty.details = { entryCount: history.length, ...honesty.details, isTestMode: true };
            if (view.state === 'loading' || view.state === 'error') {
                honesty.score = -1;
                honesty.state = 'collecting';
                honesty.verdict = undefined;
            }
            this.cached = { history, honesty, view: { ...view, currentPrice, onRetry: () => { void this.processPage(true); } } };
            if (this.freshnessTimer !== null) window.clearTimeout(this.freshnessTimer);
            this.freshnessTimer = view.state === 'ready' ? window.setTimeout(() => {
                this.freshnessTimer = null;
                // Recheck evidence age on long-lived pages without a backend request.
                if (active() && this.cached) void show(this.cached.history, this.cached.view, testMode);
            }, 60_000) : null;
            const status = view.state !== 'ready' ? 'inactive' : honestyIcon(honesty);
            void this.send({ type: 'SET_ICON', payload: { status } });
            await this.injectUI();
        };
        try {
            if (!this.adapter.isProductPage()) {
                void this.send({ type: 'SET_ICON', payload: { status: 'inactive' } });
                return;
            }
            const product = await this.adapter.parseProductPage();
            if (!active() || !product) return;
            currentPrice = product.price / 100;
            regularPrice = product.regularPrice == null ? null : product.regularPrice / 100;
            this.category = product.category;
            const test = resolveChartTestMode(url, currentPrice);
            if (test.enabled) {
                currentPrice = test.currentPrice ?? currentPrice;
                const history: HistoryPoint[] = (test.history ?? []).map(p => ({ ...p, source: 'system' }));
                await show(history, { state: history.length ? 'ready' : 'empty' }, true);
                return;
            }
            await show([], { state: 'loading' });
            if (!active()) return;
            let saveFailed = false;
            void this.send({ type: 'SAVE_PRODUCT', payload: product }).then(result => {
                if (!active()) return;
                saveFailed = !result.success;
                if (!result.success) this.logger.warn('SAVE_PRODUCT failed', { ...result, url: product.url });
                if (this.cached && this.cached.view.state !== 'loading' && saveFailed) {
                    this.cached.view.saveFailed = true;
                    void this.injectUI();
                }
            });
            let response: RuntimeResponse<HistoryPoint[]>;
            for (let attempt = 0; ; attempt++) {
                response = await this.send<HistoryPoint[]>({ type: 'GET_HISTORY', payload: { url: product.url, forceRefresh } });
                if (!active()) return;
                if (response.success || !response.retryable || attempt >= 2) break;
                await new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 500 : 1500));
                if (!active()) return;
            }
            if (response.success) {
                const history = response.data ?? [];
                await show(history, { state: history.length ? 'ready' : 'empty', saveFailed });
            } else {
                this.logger.warn('GET_HISTORY failed', { ...response, url: product.url });
                await show([], { state: 'error', error: response, saveFailed });
            }
            if (active()) {
                // Optional check has its own timeout and never holds up the widget.
                void this.send({ type: 'CHECK_BASELINE', payload: {
                    url: product.url, store: this.adapter.getStoreDomain(), externalId: product.externalId, currentPrice,
                } });
            }
        } catch (error) {
            if (active()) await show([], { state: 'error', error: runtimeFailure(error) });
        } finally {
            if (active()) this.processing = false;
        }
    }

    private category?: string;

    private async injectUI() {
        if (!this.cached) return;
        const anchor = this.adapter.getUIAnchor();
        if (!anchor) return;
        if (isMountMissing(this.mountPoint)) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            this.mountPoint.style.cssText = 'width:100%;display:block;margin:16px 0;clear:both';
        }
        const mount = this.mountPoint!;
        const insertMethod = this.adapter.getUIInsertMethod();
        if (isMountOutOfPlace(mount, anchor, insertMethod)) placeMountNearAnchor({ mountPoint: mount, anchor, insertMethod });
        const { history, honesty, view } = this.cached;
        await this.renderUI(mount, history, honesty, view);
    }
}
