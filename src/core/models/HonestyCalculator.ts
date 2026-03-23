interface PriceHistory {
  date: number;
  price: number;
}

interface ScoreResult {
  score: number;
  message: string;
}

export class HonestyCalculator {
  static _calculateMedian(prices: number[]): number {
    if (prices.length === 0) return 0;
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  static _detectSpike(priceHistory: PriceHistory[], discountStartDate: number): boolean {
    const preDiscountPeriod = priceHistory.filter(p => 
      p.date < discountStartDate && 
      p.date > discountStartDate - 14 * 24 * 60 * 60 * 1000
    );
    if (preDiscountPeriod.length < 2) return false;

    const prices = preDiscountPeriod.map(p => p.price);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    return (maxPrice - minPrice) / minPrice > 0.20;
  }

  static calculate(currentPrice: number, priceHistory: PriceHistory[]): ScoreResult {
    if (priceHistory.length < 5) {
      return { score: -1, message: "Недостатньо даних для аналізу." };
    }

    const last30Days = priceHistory.filter(p => p.date > Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last60Days = priceHistory;

    const p_min30 = Math.min(...last30Days.map(p => p.price));
    const p_median60 = this._calculateMedian(last60Days.map(p => p.price));

    let penaltySpike = 0;
    if (this._detectSpike(last60Days, Date.now())) {
      penaltySpike = 50;
    }

    const rawScore = (1 - (currentPrice - p_min30) / p_median60) * 100 - penaltySpike;
    const score = Math.max(0, rawScore);

    let message = "Аналіз чесності знижки.";
    if (score < 50) {
      message = "Знижка виглядає підозріло. Ціна нещодавно була нижчою.";
    } else if (score > 80) {
      message = "Це хороша знижка порівняно з попередньою історією цін.";
    }

    return { score: Math.round(score), message };
  }
}
