import type { HonestyResult, PriceTrend, HistoryConfidence } from '@/types/honesty';
import { getCategoryVolatility } from '@/core/volatility';
import { confirmedDays, DAY_MS, utcDay } from '@/core/history';
export type { HonestyResult, PriceTrend, HonestyState } from '@/types/honesty';

export class HonestyCalculator {
    static calculateMedian(prices: number[]): number {
        if (!prices.length) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
    }

    static calculateStdDev(prices: number[], mean: number): number {
        return prices.length < 2 ? 0 : Math.sqrt(prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length);
    }

    static computeTrend(history: { price: number; date: number }[]): PriceTrend {
        if (history.length < 3) return 'stable';
        const recent = history.slice(-5);
        const first = recent.slice(0, Math.ceil(recent.length / 2));
        const last = recent.slice(Math.floor(recent.length / 2));
        const average = (points: typeof recent) => points.reduce((sum, p) => sum + p.price, 0) / points.length;
        const delta = (average(last) - average(first)) / average(first);
        return delta > .04 ? 'rising' : delta < -.04 ? 'falling' : 'stable';
    }

    static calculate(
        currentPrice: number,
        priceHistory: { price: number; date: number; source?: string; day?: string }[],
        category = 'unknown',
        options: { regularPrice?: number | null; now?: number } = {},
    ): HonestyResult {
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) return {
            score: 0, state: 'invalid', messageKey: 'calculator.invalidPrice', message: 'Invalid current price.', reasonCodes: [],
        };
        const now = options.now ?? Date.now();
        const history = confirmedDays(priceHistory, 60, now);
        const count = history.length;
        const firstSeenAt = history[0]?.date;
        const lastSeenAt = history.at(-1)?.date;
        const spanDays = firstSeenAt === undefined ? 0 : (utcDay(now) - utcDay(firstSeenAt)) / DAY_MS + 1;
        const coverage = spanDays ? count / spanDays : 0;
        const confidence: HistoryConfidence = {
            level: count >= 30 && coverage >= .8 ? 'high' : count >= 14 && coverage >= .7 ? 'medium' : 'low',
            confirmedDays: count, spanDays, coverage, lastConfirmedAt: lastSeenAt,
            stale: lastSeenAt !== undefined && now - lastSeenAt > 2 * DAY_MS,
        };
        const advertised = Number.isFinite(options.regularPrice) && options.regularPrice! > currentPrice;
        const discount: NonNullable<HonestyResult['discount']> = {
            status: advertised ? 'insufficient-data' : 'not-advertised',
        };
        const details = { entryCount: count, firstSeenAt, lastSeenAt };
        if (count < 3) {
            const messageKey = count === 0 ? 'calculator.noHistory' : count === 1
                ? currentPrice === history[0]!.price ? 'calculator.firstPriceSame' : 'calculator.firstPriceDiff' : 'calculator.collecting';
            return { score: -1, state: count === 1 ? 'single-price' : 'collecting', messageKey,
                message: 'More confirmed days are needed.', confidence, discount,
                reasonCodes: ['INSUFFICIENT_HISTORY'], details: { ...details,
                    ...(count === 1 ? { observedPrice: history[0]!.price, daysAtObservedPrice: 0 } : { observedPrices: history }),
                } };
        }
        const window30 = history.filter(p => p.date >= utcDay(now) - 29 * DAY_MS);
        if (!window30.length) return { score: -1, state: 'collecting', messageKey: 'calculator.collecting',
            message: 'No recent confirmations.', confidence, discount, details, reasonCodes: ['INSUFFICIENT_HISTORY'] };
        const prices = history.map(p => p.price);
        const median60 = this.calculateMedian(prices);
        const min30 = Math.min(...window30.map(p => p.price));
        const { spikeThresholdPct, warningBandPct } = getCategoryVolatility(category);
        const mean = prices.reduce((sum, p) => sum + p, 0) / count;
        const isVolatile = this.calculateStdDev(prices, mean) / median60 > warningBandPct;
        const recentStart = utcDay(now) - 13 * DAY_MS;
        const older = history.filter(p => p.date < recentStart);
        const recent = history.filter(p => p.date >= recentStart);
        const baseline = older.length >= 7 ? this.calculateMedian(older.map(p => p.price)) : 0;
        let raisedPeak = 0;
        if (baseline) for (let i = 1; i < recent.length; i++) {
            const a = recent[i - 1]!; const b = recent[i]!;
            if (utcDay(b.date) - utcDay(a.date) === DAY_MS
                && Math.min(a.price, b.price) > baseline * (1 + spikeThresholdPct)) raisedPeak = Math.max(raisedPeak, a.price, b.price);
        }
        const hasSpike = Boolean(advertised && raisedPeak && currentPrice <= raisedPeak * .95);
        const spike14Pct = raisedPeak && baseline ? (raisedPeak - baseline) / baseline : 0;
        if (advertised && baseline) discount.status = hasSpike ? 'suspicious-pattern' : 'no-suspicious-pattern';
        const score = Math.round(Math.max(0, Math.min(100, 100 - 50 * currentPrice / median60)));
        const reasonCodes = [
            ...(hasSpike ? ['SPIKE_14D_DETECTED'] : []),
            ...(currentPrice <= min30 * 1.05 ? ['PRICE_NEAR_MIN30'] : []),
            ...(isVolatile ? ['HIGH_CATEGORY_VOLATILITY'] : []),
            ...(confidence.level === 'low' ? ['INSUFFICIENT_HISTORY'] : []),
            ...(confidence.stale ? ['STALE_HISTORY'] : []),
        ];
        const priceVsMedianPct = Math.round((currentPrice - median60) / median60 * 100);
        return {
            score, state: 'analyzed', confidence, discount,
            verdict: confidence.stale ? undefined : score >= 65 ? 'fair' : score >= 40 ? 'warning' : 'risky',
            messageKey: confidence.stale ? 'calculator.stale' : confidence.level === 'low' ? 'calculator.preliminary'
                : score >= 65 ? 'calculator.goodDeal' : currentPrice <= median60 ? 'calculator.normal'
                : score >= 40 ? 'calculator.highPrice' : 'calculator.veryHigh',
            messageParams: { pct: Math.abs(priceVsMedianPct) }, message: `Price value: ${score}/100`, reasonCodes,
            metrics: { median60, min30, spike14Pct, penalty: 0 },
            details: { ...details, min30, median60, priceVsMedianPct, trend: this.computeTrend(history), isVolatile, hasSpike,
                min90: Math.min(...prices), max90: Math.max(...prices), median90: median60 },
        };
    }
}

export function canShowVerdict(result: HonestyResult): boolean {
    return result.state === 'analyzed' && Boolean(result.confidence && !result.confidence.stale && result.confidence.level !== 'low');
}

export function honestyIcon(result: HonestyResult): 'inactive' | 'single-price' | 'success' | 'error' {
    if (result.state === 'single-price') return 'single-price';
    if (!canShowVerdict(result)) return 'inactive';
    return result.score >= 65 ? 'success' : result.score < 40 ? 'error' : 'inactive';
}
