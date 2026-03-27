export class HonestyCalculator {
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Динамічний вибір волатильності залежно від категорії (на основі ТЗ)
    static getVolatilityForCategory(category: string): number {
        const catLower = category.toLowerCase();
        if (catLower.includes('електроніка') || catLower.includes('смартфони') || catLower.includes('комп')) {
            return 0.05; // 5% волатильність для техніки
        }
        if (catLower.includes('одяг') || catLower.includes('взуття')) {
            return 0.25; // 25% для одягу (сезонні розпродажі)
        }
        if (catLower.includes('побутова техніка')) {
            return 0.10; // 10%
        }
        return 0.08; // 8% за замовчуванням
    }

    static calculate(
        currentPrice: number,
        priceHistory: {price: number, date: number}[],
        category: string = 'Загальна' // Тепер приймаємо рядок категорії
    ): {score: number, message: string} {

        // Запобіжник: захист від некоректних вхідних даних
        if (!currentPrice || currentPrice <= 0) {
            return { score: 0, message: "Помилка: Некоректна поточна ціна товару." };
        }

        // Відкидаємо можливі помилки парсингу в історії (нульові ціни)
        const validHistory = priceHistory.filter(p => p.price > 0);

        if (validHistory.length < 3) {
            return { score: -1, message: "Збираємо історію цін для аналізу..." };
        }

        const categoryVolatility = this.getVolatilityForCategory(category);
        const now = Date.now();
        const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);

        // Вся історія за 60 днів
        const history60Days = validHistory.filter(p => p.date >= sixtyDaysAgo);
        const prices60 = history60Days.map(p => p.price);
        const median = this.calculateMedian(prices60);

        // Запобіжник для ділення
        if (median === 0) {
            return { score: 0, message: "Недостатньо коректних даних бази для аналізу." };
        }

        // Мінімум за 30 днів
        const history30Days = validHistory.filter(p => p.date >= thirtyDaysAgo);
        const min30 = history30Days.length > 0 ? Math.min(...history30Days.map(p => p.price)) : currentPrice;

        // ==========================================
        // ДЕТЕКЦІЯ СТРИБКА (Pre-inflation Spike)
        // ==========================================
        let penaltySpike = 0;

        const recentPrices = validHistory.filter(p => p.date >= fourteenDaysAgo);
        const maxRecentPrice = recentPrices.length > 0 ? Math.max(...recentPrices.map(p => p.price)) : currentPrice;

        const olderPrices = validHistory.filter(p => p.date < fourteenDaysAgo && p.date >= sixtyDaysAgo);
        const oldMedian = olderPrices.length > 0 ? this.calculateMedian(olderPrices.map(p => p.price)) : median;

        // Якщо за останні 2 тижні ціна підстрибнула на >20% від старої норми
        if (maxRecentPrice > oldMedian * 1.2 && currentPrice < maxRecentPrice) {
            penaltySpike = 50;
        }
        // ==========================================

        let score = (1 - ((currentPrice - min30) / median)) * 100;

        // Нормалізуємо фінальний бал: не менше 0 і не більше 100
        score = Math.max(0, Math.min(100, score - penaltySpike));

        let message = "Ціна виглядає стабільною.";
        const discountRatio = (median - currentPrice) / median;

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