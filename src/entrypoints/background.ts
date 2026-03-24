import { HonestyCalculator } from '@/utils/HonestyCalculator';

interface PriceCheckPayload {
  url: string;
  sku: string;
  currentPrice: number;
  title: string;
}

interface PriceHistoryEntry {
  date: number;
  price: number;
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
    const { sku, currentPrice } = payload;

    try {
      console.log(`Checking price for SKU: ${sku}, Price: ${currentPrice}`);

      const cachedData = await getLocalPriceHistory(sku);

      if (cachedData && isFresh(cachedData.timestamp)) {
        const score = HonestyCalculator.calculate(currentPrice, cachedData.history);
        sendResponse({ success: true, score, history: cachedData.history });
        return;
      }

      const mockHistory = generateMockHistory(currentPrice);
      const score = HonestyCalculator.calculate(currentPrice, mockHistory);

      await saveLocalPriceHistory(sku, mockHistory);

      sendResponse({ success: true, score, history: mockHistory });

    } catch (error: any) {
      console.error("Error checking price:", error);
      sendResponse({ success: false, error: error.message || String(error) });
    }
  }

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
        [sku]: {
          history,
          timestamp: Date.now()
        }
      }, () => resolve());
    });
  }

  function isFresh(timestamp: number) {
    return Date.now() - timestamp < 60 * 60 * 1000;
  }

  function generateMockHistory(basePrice: number): PriceHistoryEntry[] {
    const history: PriceHistoryEntry[] = [];
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      const date = now - i * 24 * 60 * 60 * 1000;
      const price = basePrice * (1 + (Math.random() * 0.2 - 0.1));
      history.push({ date, price });
    }
    return history;
  }
});