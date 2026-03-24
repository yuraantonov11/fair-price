import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { DniproMAdapter } from '@/adapters/DniproMAdapter';
import { injectUI } from '@/ui/injector';

interface PriceCheckPayload {
  url: string;
  sku: string;
  currentPrice: number;
  title: string;
}

interface CheckPriceResponse {
  success: boolean;
  score: { score: number, message: string };
  history: { date: number, price: number }[];
  error?: string;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log("FairPrice: Content Script Loaded");

    runApp();

    function runApp() {
      const adapters = [
        new RozetkaAdapter(),
        new DniproMAdapter()
      ];

      console.log("FairPrice: Analyzing URL:", window.location.href);

      // ВИПРАВЛЕНО: isApplicable() тепер викликається без аргументів
      const adapter = adapters.find(a => a.isApplicable());

      if (!adapter) {
        console.log("FairPrice: No adapter found for this site.");
        return;
      }

      console.log("FairPrice: Adapter found:", adapter.constructor.name);

      extractAndInject(adapter).catch(console.error);

      let lastUrl = window.location.href;
      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          console.log("FairPrice: URL changed, re-checking...");
          extractAndInject(adapter).catch(console.error);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    async function extractAndInject(adapter: any) {
      const productId = adapter.getProductID();
      if (!productId) return;

      const currentPrice = adapter.getCurrentPrice();
      if (!currentPrice) return;

      const title = adapter.getTitle();

      if (document.getElementById('fair-price-root')) return;

      console.log("FairPrice: Data found. Requesting analysis...", { productId, currentPrice });

      const payload: PriceCheckPayload = {
        url: window.location.href,
        sku: productId,
        currentPrice,
        title: title || document.title
      };

      try {
        const response = await chrome.runtime.sendMessage({
          action: "checkPrice",
          payload
        }) as CheckPriceResponse;

        console.log("FairPrice: Analysis received:", response);

        if (response && response.success) {
          injectUI(response.score, response.history);
        } else {
          console.error("Fair Price: Failed to get analysis.", response?.error);
        }
      } catch (e) {
        console.error("Fair Price: Error sending message", e);
      }
    }
  }
});