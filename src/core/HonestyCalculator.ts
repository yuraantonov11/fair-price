export class HonestyCalculator {
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    static calculate(
        currentPrice: number,
        priceHistory: {price: number, date: number}[],
        categoryVolatility: number = 0.08
    ): {score: number, message: string} {

        if (priceHistory.length < 3) {
            return { score: -1, message: "Збираємо історію цін для аналізу..." };
        }

        const now = Date.now();
        const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);

        // Вся історія за 60 днів
        const history60Days = priceHistory.filter(p => p.date >= sixtyDaysAgo);
        const prices60 = history60Days.map(p => p.price);
        const median = this.calculateMedian(prices60);

        // Мінімум за 30 днів
        const history30Days = priceHistory.filter(p => p.date >= thirtyDaysAgo);
        const min30 = history30Days.length > 0 ? Math.min(...history30Days.map(p => p.price)) : currentPrice;

        // ==========================================
        // 🚨 ВИПРАВЛЕНА ЛОГІКА ДЕТЕКЦІЇ СТРИБКА
        // ==========================================
        let penaltySpike = 0;

        // Максимальна ціна за останні 14 днів (шукаємо сам "стрибок")
        const recentPrices = priceHistory.filter(p => p.date >= fourteenDaysAgo);
        const maxRecentPrice = recentPrices.length > 0 ? Math.max(...recentPrices.map(p => p.price)) : currentPrice;

        // Медіана ціни ДО цих 14 днів (шукаємо "нормальну" ціну)
        const olderPrices = priceHistory.filter(p => p.date < fourteenDaysAgo && p.date >= sixtyDaysAgo);
        const oldMedian = olderPrices.length > 0 ? this.calculateMedian(olderPrices.map(p => p.price)) : median;

        // Якщо за останні 2 тижні ціна підстрибнула на >20% від старої норми,
        // і зараз нам подають це як знижку:
        if (maxRecentPrice > oldMedian * 1.2 && currentPrice < maxRecentPrice) {
            penaltySpike = 50; // Нараховуємо 50 штрафних балів
        }
        // ==========================================

        let score = (1 - ((currentPrice - min30) / (median || 1))) * 100;
        score = Math.max(0, score - penaltySpike);

        let message = "Ціна виглядає стабільною.";
        const discountRatio = (median - currentPrice) / (median || 1);

        if (penaltySpike > 0) {
            message = "Увага! Помічено штучне підняття ціни перед знижкою (Pre-inflation Spike).";
        } else if (discountRatio > categoryVolatility * 3) {
            message = "Аномально висока знижка для цієї категорії. Можлива маніпуляція якістю.";
        } else if (score < 40) {
            message = "Знижка сумнівна. Ціна нещодавно була нижчою.";
        } else if (score > 80) {
            message = "Це дійсно вигідна пропозиція порівняно з історією.";
        }

        return { score: Math.round(score), message };
    }
}