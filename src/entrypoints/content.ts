import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { DniproMAdapter } from '@/adapters/DniproMAdapter';
import { injectUI } from '@/ui/injector';

// @ts-ignore
import  '@/assets/tailwind.css';

  interface PriceCheckPayload {
  url: string;
  sku: string;
  currentPrice: number;
  title: string;
  oldPrice?: number | null;
  promoName?: string | null;
}

interface CheckPriceResponse {
  success: boolean;
  score: { score: number, message: string };
  history: { date: number, price: number }[];
  error?: string;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui', // КРИТИЧНО ВАЖЛИВО: ховає Tailwind у Shadow DOM!

  main(ctx) { // <-- ДОДАЛИ ctx СЮДИ
    console.log("FairPrice: Content Script Loaded");
    runApp();

    function runApp() {
      const adapters = [new RozetkaAdapter(), new DniproMAdapter()];
      const adapter = adapters.find(a => a.isApplicable());

      if (!adapter) return;

      extractAndInject(adapter).catch(console.error);

      let lastUrl = window.location.href;
      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          extractAndInject(adapter).catch(console.error);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    async function extractAndInject(adapter: any) {
      const productId = adapter.getProductID();
      const currentPrice = adapter.getCurrentPrice();
      if (!productId || !currentPrice) return;

      const title = adapter.getTitle();
      const oldPrice = adapter.getOriginalPrice();
      const promoName = adapter.getPromoName();

      const payload: PriceCheckPayload = {
        url: window.location.href,
        sku: productId,
        currentPrice,
        oldPrice,
        promoName,
        title: title || document.title
      };

      try {
        const response = await chrome.runtime.sendMessage({
          action: "checkPrice",
          payload
        }) as CheckPriceResponse;

        if (response && response.success) {
          // ПЕРЕДАЄМО ctx у функцію малювання!
          injectUI(ctx, response.score, response.history);
        }
      } catch (e) {
        console.error("Fair Price: Error", e);
      }
    }
  }
});