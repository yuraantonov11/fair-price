import type { HonestyResult, PriceTrend } from '@/types/honesty';
export type { HonestyResult, PriceTrend, HonestyState } from '@/types/honesty';

export class HonestyCalculator {
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    static calculateStdDev(prices: number[], mean: number): number {
        if (prices.length < 2) return 0;
        const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
        return Math.sqrt(variance);
    }

    static computeTrend(history: { price: number; date: number }[]): PriceTrend {
        if (history.length < 3) return 'stable';
        const recent = history.slice(-5);
        const firstHalf = recent.slice(0, Math.ceil(recent.length / 2));
        const secondHalf = recent.slice(Math.floor(recent.length / 2));
        const avgFirst = firstHalf.reduce((s, p) => s + p.price, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((s, p) => s + p.price, 0) / secondHalf.length;
        const delta = (avgSecond - avgFirst) / avgFirst;
        if (delta > 0.04) return 'rising';
        if (delta < -0.04) return 'falling';
        return 'stable';
    }

    static calculate(
        currentPrice: number,
        priceHistory: { price: number; date: number }[],
        category: string = 'Загальна',
    ): HonestyResult {
        if (!currentPrice || currentPrice <= 0) {
            return { score: 0, message: 'Помилка: Некоректна поточна ціна товару.', state: 'invalid' };
        }

        const validHistory = priceHistory
            .filter(p => p.price > 0 && Number.isFinite(p.date))
            .sort((a, b) => a.date - b.date);

        if (validHistory.length === 0) {
            return {
                score: -1,
                message: 'Щойно почали збирати історію цін для аналізу.',
                state: 'collecting',
                details: { entryCount: 0 },
            };
        }

        if (validHistory.length === 1) {
            const pt = validHistory[0];
            const daysAtObservedPrice = Math.floor(Math.max(0, Date.now() - pt.date) / 86_400_000);
            const message = currentPrice === pt.price
                ? 'Маємо перше підтвердження: ця ціна вже тримається деякий час. Покажемо більше висновків, щойно зберемо ще кілька спостережень.'
                : 'Маємо лише одну зафіксовану ціну в історії. Уже можемо показати, коли вона була актуальною, але для повного аналізу потрібно більше спостережень.';
            return {
                score: -1,
                message,
                state: 'single-price',
                details: {
                    entryCount: 1,
                    firstSeenAt: pt.date,
                    lastSeenAt: pt.date,
                    observedPrice: pt.price,
                    daysAtObservedPrice,
                },
            };
        }

        if (validHistory.length < 3) {
            return {
                score: -1,
                message: 'Збираємо історію цін для аналізу...',
                state: 'collecting',
                details: {
                    entryCount: validHistory.length,
                    firstSeenAt: validHistory[0]?.date,
                    lastSeenAt: validHistory[validHistory.length - 1]?.date,
                    observedPrices: validHistory.map(p => ({ price: p.price, date: p.date })),
                },
            };
        }

        // ── Full analysis (3+ entries) ──────────────────────────────────
        const now = Date.now();
        const ninetyDaysAgo = now - 90 * 86_400_000;
        const fourteenDaysAgo = now - 14 * 86_400_000;

        // Use 90-day window; fall back to all history if window is too thin
        const window90 = validHistory.filter(p => p.date >= ninetyDaysAgo);
        const useHistory = window90.length >= 3 ? window90 : validHistory;

        const prices = useHistory.map(p => p.price);
        const median = this.calculateMedian(prices);
        const min90 = Math.min(...prices);
        const max90 = Math.max(...prices);
        const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
        const stdDev = this.calculateStdDev(prices, mean);

        if (median === 0) {
            return { score: 0, message: 'Недостатньо коректних даних для аналізу.', state: 'invalid' };
        }

        // Volatility: CV (coefficient of variation) > 25% → volatile product
        const cv = stdDev / median;
        const isVolatile = cv > 0.25;

        // ── Spike detection ─────────────────────────────────────────────
        // Recent prices (14 days) vs older median
        const recentPts = validHistory.filter(p => p.date >= fourteenDaysAgo);
        const olderPts  = validHistory.filter(p => p.date < fourteenDaysAgo && p.date >= ninetyDaysAgo);
        const oldMedian = olderPts.length > 0 ? this.calculateMedian(olderPts.map(p => p.price)) : median;
        const maxRecent = recentPts.length > 0 ? Math.max(...recentPts.map(p => p.price)) : currentPrice;

        // Spike = price was pushed up >25% above older norm AND current price is below that peak
        // (store raised price, then "discounted" it back)
        const spikeThreshold = isVolatile ? 0.40 : 0.25;
        const hasSpike = maxRecent > oldMedian * (1 + spikeThreshold) && currentPrice < maxRecent * 0.95;

        // ── Base score ──────────────────────────────────────────────────
        // Anchored to median: score=50 at median, 100 at ≤ min, 0 at ≥ 2×median
        // score = clamp(50 * (2 - currentPrice / median), 0, 100)
        let score = Math.max(0, Math.min(100, 50 * (2 - currentPrice / median)));

        // Spike penalty (15–30 depending on severity)
        const spikeSeverity = (maxRecent - oldMedian) / oldMedian;
        if (hasSpike) {
            score = Math.max(0, score - (spikeSeverity > 0.5 ? 30 : 20));
        }

        // ── Trend ───────────────────────────────────────────────────────
        const trend = this.computeTrend(validHistory);

        // ── Verdict message ─────────────────────────────────────────────
        const priceVsMedianPct = Math.round((currentPrice - median) / median * 100);
        let message: string;

        if (hasSpike) {
            message = `Підозра на маніпуляцію: ціна штучно підіймалась до ${Math.round(maxRecent)} ₴, тепер виглядає як "знижка".`;
        } else if (score >= 70) {
            message = `Вигідна ціна — на ${Math.abs(priceVsMedianPct)}% нижче за звичайну. Схоже на справжню знижку.`;
        } else if (score >= 50) {
            message = 'Ціна в межах норми. Суттєвої знижки немає, але і переплати теж.';
        } else if (score >= 35) {
            message = `Ціна на ${priceVsMedianPct}% вища за звичайну для цього товару. Варто почекати.`;
        } else {
            message = `Ціна значно вища за звичайну (+${priceVsMedianPct}%). Рекомендуємо не купувати зараз.`;
        }

        if (isVolatile && !hasSpike) {
            message += ' (Увага: ціна цього товару природно коливається.)';
        }

        return {
            score: Math.round(score),
            message,
            state: 'analyzed',
            details: {
                entryCount: validHistory.length,
                firstSeenAt: validHistory[0]?.date,
                lastSeenAt: validHistory[validHistory.length - 1]?.date,
                min90,
                max90,
                median90: Math.round(median),
                priceVsMedianPct,
                trend,
                isVolatile,
                hasSpike,
            },
        };
    }
}