// @ts-nocheck
import { RozetkaAdapter } from '@/core/adapters/RozetkaAdapter';
import { DniproMAdapter } from '@/core/adapters/DniproMAdapter';
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
    
    // Start application logic
    runApp();

    function runApp() {
      const adapters = [
        new RozetkaAdapter(),
        new DniproMAdapter()
      ];
      const currentUrl = window.location.href;
      
      console.log("FairPrice: Analyzing URL:", currentUrl);

      const adapter = adapters.find(a => a.isApplicable(currentUrl));

      if (!adapter) {
        console.log("FairPrice: No adapter found for this site.");
        return;
      }

      console.log("FairPrice: Adapter found:", adapter.constructor.name);

      // Initial check
      extractAndInject(adapter);

      // Set up MutationObserver to handle SPA navigation/updates
      let lastUrl = currentUrl;
      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            console.log("FairPrice: URL changed, re-checking...");
            extractAndInject(adapter);
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

      // Check if UI is already injected
      if (document.getElementById('fair-price-root')) return;

      console.log("FairPrice: Data found. Requesting analysis...", { productId, currentPrice });

      const payload: PriceCheckPayload = {
        url: window.location.href,
        sku: productId,
        currentPrice,
        title: title || document.title
      };

      try {
        // Send data to background script for analysis
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