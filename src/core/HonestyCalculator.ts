export class HonestyCalculator {
    /**
     * Розрахунок медіани - вона ігнорує поодинокі "викиди" ціни вгору
     */
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Основний метод розрахунку рейтингу чесності
     */
    static calculate(currentPrice: number, priceHistory: {price: number, date: number}[]): {score: number, message: string} {
        // Якщо даних занадто мало (менше 3-5 записів), ми не можемо робити висновки
        if (priceHistory.length < 3) {
            return { score: -1, message: "Збираємо історію цін для аналізу..." };
        }

        const prices = priceHistory.map(p => p.price);
        const min30 = Math.min(...prices);
        const median = this.calculateMedian(prices);

        // --- Детекція Pre-inflation Spike (Штраф за маніпуляцію) ---
        let penaltySpike = 0;
        const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

        // Шукаємо, чи була ціна значно нижчою за останні 14 днів
        const recentPrices = priceHistory.filter(p => p.date >= fourteenDaysAgo);
        if (recentPrices.length > 1) {
            const oldRecentPrice = recentPrices[0].price;
            // Якщо ціна перед "знижкою" зросла на понад 15-20%
            if (currentPrice < oldRecentPrice * 1.2 && prices.some(p => p > currentPrice * 1.1)) {
                // Це виглядає як штучне накручування
                penaltySpike = 40;
            }
        }

        // Формула з ТЗ: Score = max(0, (1 - (P_now - P_min30)/P_median) * 100 - Penalty)
        let score = (1 - ((currentPrice - min30) / (median || 1))) * 100;
        score = Math.max(0, score - penaltySpike);

        // Формування повідомлення
        let message = "Ціна виглядає стабільною.";
        if (penaltySpike > 0) {
            message = "Увага! Помічено штучне підняття ціни перед знижкою (Pre-inflation Spike).";
        } else if (score < 40) {
            message = "Знижка сумнівна. Ціна нещодавно була нижчою.";
        } else if (score > 80) {
            message = "Це дійсно вигідна пропозиція порівняно з історією.";
        }

        return { score: Math.round(score), message };
    }
}