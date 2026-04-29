import { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { HonestyCalculator, HonestyResult } from './HonestyCalculator';
import { MessageRouter } from "@/core/MessageRouter";
import { createLogger } from '@/utils/logger';
import { resolveChartTestMode } from '@/core/chartTestMode';
import { isMountMissing, isMountOutOfPlace, placeMountNearAnchor } from '@/core/spaReinjectHelper';

export class ExtensionController {
    private adapter: IPriceAdapter;
    private currentUrl: string;
    private mountPoint: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private processTimer: number | null = null;
    private restoreTimer: number | null = null;

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
        void this.processPage();

        // Надійний обсервер для SPA-додатків
        this.observer = new MutationObserver(() => {
            const url = location.href;
            if (url !== this.currentUrl) {
                // Сценарій 1: Користувач перейшов на іншу сторінку
                this.currentUrl = url;
                this.logger.info('Detected SPA navigation, restarting page processing', { url });
                this.cleanup();
                this.scheduleProcessPage(500);
            } else if (this.adapter.isProductPage() && this.cachedHistory && this.cachedHonestyScore && !this.isProcessing) {
                const anchor = this.adapter.getUIAnchor();
                if (anchor && (isMountMissing(this.mountPoint) || isMountOutOfPlace(this.mountPoint, anchor, this.adapter.getUIInsertMethod()))) {
                    this.scheduleRestoreFromCache();
                }
            }
        });

        this.observer.observe(document, { subtree: true, childList: true });
    }

    private cleanup() {
        if (this.processTimer) {
            window.clearTimeout(this.processTimer);
            this.processTimer = null;
        }
        if (this.restoreTimer) {
            window.clearTimeout(this.restoreTimer);
            this.restoreTimer = null;
        }
        if (this.mountPoint) {
            this.mountPoint.remove();
            this.mountPoint = null;
        }
        this.cachedHistory = null;
        this.cachedHonestyScore = null;
    }

    private scheduleProcessPage(delay = 250) {
        if (this.processTimer) {
            window.clearTimeout(this.processTimer);
        }
        this.processTimer = window.setTimeout(() => {
            this.processTimer = null;
            void this.processPage();
        }, delay);
    }

    private scheduleRestoreFromCache() {
        if (this.restoreTimer) return;
        this.restoreTimer = window.setTimeout(() => {
            this.restoreTimer = null;
            if (!this.cachedHistory || !this.cachedHonestyScore) return;
            const anchor = this.adapter.getUIAnchor();
            if (!anchor) return;
            this.logger.info('UI mount missing or displaced, restoring from cache', { url: this.currentUrl });
            if (isMountMissing(this.mountPoint)) {
                this.mountPoint = null;
            }
            void this.injectUI(this.cachedHistory, this.cachedHonestyScore);
        }, 150);
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

            const baselineResponse = await MessageRouter.send({
                type: 'CHECK_BASELINE',
                payload: {
                    url: productData.url,
                    store: this.adapter.getStoreDomain(),
                    externalId: productData.externalId,
                    currentPrice: productData.price / 100,
                },
            });

            if (baselineResponse?.success && baselineResponse?.data) {
                MessageRouter.send({
                    type: 'TRACK_EVENT',
                    payload: {
                        event: 'personalized_pricing_check',
                        data: {
                            store: this.adapter.getStoreDomain(),
                            url: productData.url,
                            currentPrice: baselineResponse.data.currentPrice,
                            baselinePrice: baselineResponse.data.baselinePrice,
                            deltaPct: baselineResponse.data.deltaPct,
                            isSuspicious: baselineResponse.data.isSuspicious,
                        },
                    },
                }).catch(() => {});
            }

            // KPI: track history_loaded
            if (historyResponse?.success && historyData.length > 0) {
                MessageRouter.send({
                    type: 'TRACK_EVENT',
                    payload: { event: 'history_loaded', data: { store: this.adapter.getStoreDomain(), count: historyData.length } },
                }).catch(() => {});
            }
            let mappedHistory = historyData.map((item: any) => ({
                price: item.price,
                oldPrice: item.oldPrice,
                promoName: item.promoName,
                date: new Date(item.date).getTime()
            }));

            const liveCurrentPrice = productData.price / 100;
            const chartTestMode = resolveChartTestMode(window.location.href, liveCurrentPrice);
            if (chartTestMode.enabled) {
                mappedHistory = chartTestMode.history ?? mappedHistory;
                if (chartTestMode.currentPrice != null) {
                    productData.price = Math.round(chartTestMode.currentPrice * 100);
                }
                this.logger.info('Chart test mode enabled', {
                    source: chartTestMode.source,
                    records: chartTestMode.recordCount,
                    scenario: chartTestMode.scenario,
                    url: this.currentUrl,
                });
            }

            const honestyResult = HonestyCalculator.calculate(
                productData.price / 100,
                mappedHistory,
                productData.category
            );

            if (chartTestMode.enabled) {
                honestyResult.details = {
                    entryCount: mappedHistory.length,
                    ...(honestyResult.details ?? {}),
                    isTestMode: true,
                };
            }

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

            // KPI: track widget_shown
            MessageRouter.send({
                type: 'TRACK_EVENT',
                payload: {
                    event: 'widget_shown',
                    data: {
                        store: this.adapter.getStoreDomain(),
                        state: honestyResult.state,
                        verdict: honestyResult.verdict,
                        score: honestyResult.score,
                    },
                },
            }).catch(() => {});

        } catch (error) {
            this.logger.error('Page processing failed', { error, url: this.currentUrl });
        } finally {
            this.isProcessing = false;
        }
    }

    private async injectUI(history: any[], honestyScore: HonestyResult) {
        const anchor = this.adapter.getUIAnchor();
        if (!anchor) return;
        const insertMethod = this.adapter.getUIInsertMethod();

        // Перевіряємо, чи контейнер відсутній фізично в DOM
        if (isMountMissing(this.mountPoint)) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            // Додані відступи (my-4) та очищення обтікання, щоб макет магазину не "наїжджав" на графік
            this.mountPoint.className = 'w-full my-4 z-[999] block clear-both';
        }

        const mountPoint = this.mountPoint;
        if (!mountPoint) return;

        if (isMountOutOfPlace(mountPoint, anchor, insertMethod)) {
            placeMountNearAnchor({ mountPoint, anchor, insertMethod });
        }

        this.renderUI(mountPoint, history, honestyScore);
    }
}