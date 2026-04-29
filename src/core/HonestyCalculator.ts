import type { HonestyResult, PriceTrend } from '@/types/honesty';
import { getCategoryVolatility } from '@/core/volatility';
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
        category: string = 'unknown',
    ): HonestyResult {
        if (!currentPrice || currentPrice <= 0) {
            return {
                score: 0,
                messageKey: 'calculator.invalidPrice',
                message: 'Error: invalid current price.',
                state: 'invalid',
                verdict: 'risky',
                reasonCodes: [],
            };
        }

        const validHistory = priceHistory
            .filter(p => p.price > 0 && Number.isFinite(p.date))
            .sort((a, b) => a.date - b.date);

        if (validHistory.length === 0) {
            return {
                score: -1,
                messageKey: 'calculator.noHistory',
                message: 'Just started collecting price history for analysis.',
                state: 'collecting',
                details: { entryCount: 0 },
                reasonCodes: ['INSUFFICIENT_HISTORY'],
            };
        }

        if (validHistory.length === 1) {
            const pt = validHistory[0];
            const daysAtObservedPrice = Math.floor(Math.max(0, Date.now() - pt.date) / 86_400_000);
            const messageKey = currentPrice === pt.price
                ? 'calculator.firstPriceSame'
                : 'calculator.firstPriceDiff';
            const message = currentPrice === pt.price
                ? 'First confirmation: this price has been stable for a while. More conclusions once we collect a few more observations.'
                : 'Only one recorded price in history. We can show when it was last seen, but a full analysis needs more observations.';
            return {
                score: -1,
                messageKey,
                message,
                state: 'single-price',
                details: {
                    entryCount: 1,
                    firstSeenAt: pt.date,
                    lastSeenAt: pt.date,
                    observedPrice: pt.price,
                    daysAtObservedPrice,
                },
                reasonCodes: ['INSUFFICIENT_HISTORY'],
            };
        }

        if (validHistory.length < 3) {
            return {
                score: -1,
                messageKey: 'calculator.collecting',
                message: 'Collecting price history for analysis...',
                state: 'collecting',
                details: {
                    entryCount: validHistory.length,
                    firstSeenAt: validHistory[0]?.date,
                    lastSeenAt: validHistory[validHistory.length - 1]?.date,
                    observedPrices: validHistory.map(p => ({ price: p.price, date: p.date })),
                },
                reasonCodes: ['INSUFFICIENT_HISTORY'],
            };
        }

        // ── Full analysis (3+ entries) ──────────────────────────────────
        const now = Date.now();
        const sixtyDaysAgo   = now - 60 * 86_400_000;
        const thirtyDaysAgo  = now - 30 * 86_400_000;
        const fourteenDaysAgo = now - 14 * 86_400_000;

        // V2 windows
        const window60 = validHistory.filter(p => p.date >= sixtyDaysAgo);
        const window30 = validHistory.filter(p => p.date >= thirtyDaysAgo);

        // Fall back to all history if windows are too thin (< 3 points)
        const useHistory60 = window60.length >= 3 ? window60 : validHistory;
        const isInsufficientHistory = window60.length < 3;

        const prices60 = useHistory60.map(p => p.price);
        const median60 = this.calculateMedian(prices60);

        // min30: minimum from 30-day window; fall back to 60d window
        const prices30 = window30.length >= 1 ? window30.map(p => p.price) : prices60;
        const min30 = Math.min(...prices30);

        const mean60 = prices60.reduce((s, p) => s + p, 0) / prices60.length;
        const stdDev = this.calculateStdDev(prices60, mean60);

        if (median60 === 0) {
            return {
                score: 0,
                messageKey: 'calculator.insufficientData',
                message: 'Not enough valid data for analysis.',
                state: 'invalid',
                reasonCodes: ['INSUFFICIENT_HISTORY'],
            };
        }

        // ── Category volatility thresholds ──────────────────────────────
        const cv = getCategoryVolatility(category);
        const { spikeThresholdPct, warningBandPct } = cv;

        // CV (coefficient of variation)
        const cvValue = stdDev / median60;
        const isVolatile = cvValue > warningBandPct;

        // ── Spike detection (14-day window) ─────────────────────────────
        const recentPts = validHistory.filter(p => p.date >= fourteenDaysAgo);
        const olderPts  = validHistory.filter(p => p.date < fourteenDaysAgo && p.date >= sixtyDaysAgo);
        const oldMedian = olderPts.length > 0 ? this.calculateMedian(olderPts.map(p => p.price)) : median60;
        const maxRecent = recentPts.length > 0 ? Math.max(...recentPts.map(p => p.price)) : currentPrice;

        const spike14Pct = oldMedian > 0 ? (maxRecent - oldMedian) / oldMedian : 0;
        const hasSpike = spike14Pct > spikeThresholdPct && currentPrice < maxRecent * 0.95;

        // ── Base score ──────────────────────────────────────────────────
        // Anchored to median60: score=50 at median, 100 at ≤ min, 0 at ≥ 2×median
        let score = Math.max(0, Math.min(100, 50 * (2 - currentPrice / median60)));

        // ── Penalties ───────────────────────────────────────────────────
        let penalty = 0;
        if (hasSpike) {
            const spikePenalty = spike14Pct > 0.5 ? 30 : 20;
            penalty += spikePenalty;
        }
        if (isVolatile) {
            penalty += 5;
        }
        score = Math.max(0, score - penalty);

        // ── Reason codes ────────────────────────────────────────────────
        const reasonCodes: string[] = [];
        if (isInsufficientHistory) reasonCodes.push('INSUFFICIENT_HISTORY');
        if (hasSpike)            reasonCodes.push('SPIKE_14D_DETECTED');
        if (currentPrice <= min30 * 1.05) reasonCodes.push('PRICE_NEAR_MIN30');
        if (isVolatile)          reasonCodes.push('HIGH_CATEGORY_VOLATILITY');

        // ── Verdict ─────────────────────────────────────────────────────
        const verdict = score >= 65 ? 'fair' : score >= 40 ? 'warning' : 'risky';

        // ── Trend ───────────────────────────────────────────────────────
        const trend = this.computeTrend(validHistory);

        // ── Verdict message ─────────────────────────────────────────────
        const priceVsMedianPct = Math.round((currentPrice - median60) / median60 * 100);
        let messageKey: string;
        let messageParams: { max?: number; pct?: number } | undefined;

        if (hasSpike) {
            messageKey = 'calculator.spike';
            messageParams = { max: Math.round(maxRecent) };
        } else if (score >= 70) {
            messageKey = 'calculator.goodDeal';
            messageParams = { pct: Math.abs(priceVsMedianPct) };
        } else if (score >= 50) {
            messageKey = 'calculator.normal';
        } else if (score >= 35) {
            messageKey = 'calculator.highPrice';
            messageParams = { pct: priceVsMedianPct };
        } else {
            messageKey = 'calculator.veryHigh';
            messageParams = { pct: priceVsMedianPct };
        }

        if (isVolatile && !hasSpike) {
            messageKey += 'Volatile';
        }

        // Legacy fallback message (English)
        const message = `Score: ${Math.round(score)} (key: ${messageKey})`;

        // Legacy alias fields (backward compat)
        const min90  = Math.min(...prices60);
        const max90  = Math.max(...prices60);

        return {
            score: Math.round(score),
            messageKey,
            messageParams,
            message,
            state: 'analyzed',
            verdict,
            reasonCodes,
            metrics: {
                median60: Math.round(median60),
                min30,
                spike14Pct: Math.round(spike14Pct * 1000) / 1000,
                penalty,
            },
            details: {
                entryCount: validHistory.length,
                firstSeenAt: validHistory[0]?.date,
                lastSeenAt: validHistory[validHistory.length - 1]?.date,
                min30,
                median60: Math.round(median60),
                priceVsMedianPct,
                trend,
                isVolatile,
                hasSpike,
                // legacy aliases
                min90,
                max90,
                median90: Math.round(median60),
            },
        };
    }
}

