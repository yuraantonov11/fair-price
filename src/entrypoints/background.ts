import { HonestyCalculator } from '@/utils/HonestyCalculator';
import { supabase } from '@/utils/supabase';

// 🔥 ГОЛОВНИЙ ПЕРЕМИКАЧ:
// true = генерувати красиві фейкові графіки для розробки UI
// false = записувати і читати реальні ціни з Supabase
const USE_MOCK_DATA = true;

interface PriceCheckPayload {
  url: string;
  sku: string;
  currentPrice: number;
  title: string;
}

interface PriceHistoryEntry {
  date: number;
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
}

interface CachedData {
  history: PriceHistoryEntry[];
  timestamp: number;
}

export default defineBackground(() => {
  console.log("Fair Price Service Worker Loaded");

  chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (request.action === "checkPrice") {
      handleCheckPrice(request.payload as PriceCheckPayload, sendResponse).catch(console.error);
      return true;
    }
  });

  async function handleCheckPrice(payload: PriceCheckPayload, sendResponse: (response?: any) => void) {
    const { sku, currentPrice, url } = payload;

    try {
      // 1. Перевіряємо локальний кеш браузера (щоб не "спамити" БД при кожному кліку)
      const cachedData = await getLocalPriceHistory(sku);
      if (cachedData && isFresh(cachedData.timestamp)) {
        const score = HonestyCalculator.calculate(currentPrice, cachedData.history);
        sendResponse({ success: true, score, history: cachedData.history });
        return;
      }

      let history: PriceHistoryEntry[] = [];

      // 2. РОЗДІЛЕННЯ ЛОГІКИ (TEST vs PROD)
      if (USE_MOCK_DATA) {
        console.log(`[DEV MODE] Generating mock data for SKU: ${sku}`);
        history = generateMockHistory(currentPrice);
      } else {
        console.log(`[PROD MODE] Fetching real data from Supabase for SKU: ${sku}`);

        // А) Записуємо сьогоднішню ціну в БД
        const { error: insertError } = await supabase
            .from('prices')
            .insert([{ sku: sku, price: currentPrice, url: url }]);

        if (insertError) {
          console.error("Supabase Insert Error:", insertError);
        }

        // Б) Витягуємо всю історію цього товару з БД
        const { data, error: fetchError } = await supabase
            .from('prices')
            .select('price, created_at')
            .eq('sku', sku)
            .order('created_at', { ascending: true }); // Сортуємо від найстарішої до найновішої

        if (fetchError) throw fetchError;

        if (data && data.length > 0) {
          history = data.map((row: any) => ({
            price: row.price,
            date: new Date(row.created_at).getTime()
          }));
        } else {
          // Якщо товар новий і це перший запис
          history = [{ price: currentPrice, date: Date.now() }];
        }
      }

      // 3. Рахуємо "чесність", зберігаємо в кеш і відправляємо на фронтенд
      const score = HonestyCalculator.calculate(currentPrice, history);
      await saveLocalPriceHistory(sku, history);
      sendResponse({ success: true, score, history });

    } catch (error: any) {
      console.error("Error checking price:", error);
      sendResponse({ success: false, error: error.message || String(error) });
    }
  }

  // --- ДОПОМІЖНІ ФУНКЦІЇ ---

  async function getLocalPriceHistory(sku: string): Promise<CachedData | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get([sku], (result) => {
        resolve((result[sku] as CachedData) || null);
      });
    });
  }

  async function saveLocalPriceHistory(sku: string, history: PriceHistoryEntry[]) {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({
        [sku]: { history, timestamp: Date.now() }
      }, () => resolve());
    });
  }

  function isFresh(timestamp: number) {
    // Кеш живе 1 годину (щоб оновлення сторінки не робило зайвих запитів до Supabase)
    return Date.now() - timestamp < 60 * 60 * 1000;
  }

  function generateMockHistory(basePrice: number): PriceHistoryEntry[] {
    const history: PriceHistoryEntry[] = [];
    const now = Date.now();
    const promos = ["🔥 Гаряча ціна", "🎁 Весняний розпродаж", "⚡ Знижка вихідного дня"];

    for (let i = 0; i < 60; i++) {
      const date = now - i * 24 * 60 * 60 * 1000;
      const price = Math.round(basePrice * (1 + (Math.random() * 0.2 - 0.1)));

      // З імовірністю 20% імітуємо акцію в минулому
      const isPromo = Math.random() > 0.8;
      const oldPrice = isPromo ? Math.round(price * 1.25) : null;
      const promoName = isPromo ? promos[Math.floor(Math.random() * promos.length)] : null;

      history.push({ date, price, oldPrice, promoName });
    }
    return history;
  }
});