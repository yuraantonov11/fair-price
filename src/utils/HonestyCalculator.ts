export class HonestyCalculator {
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    static calculate(currentPrice: number, priceHistory: {price: number, date: number}[]): {score: number, message: string} {
        if (priceHistory.length < 5) {
            return { score: -1, message: "Недостатньо даних для аналізу." };
        }
        const prices = priceHistory.map(p => p.price);
        const minPrice = Math.min(...prices);
        const medianPrice = this.calculateMedian(prices);

        // Спрощена формула з ТЗ
        const score = Math.max(0, (1 - ((currentPrice - minPrice) / medianPrice)) * 100);

        let message = "Аналіз чесності знижки.";
        if (score < 50) message = "Знижка виглядає підозріло. Ціна нещодавно була нижчою.";
        else if (score > 80) message = "Це хороша знижка порівняно з попередньою історією цін.";

        return { score: Math.round(score), message };
    }
}