import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { DniproMAdapter } from '@/adapters/DniproMAdapter';
import { injectUI } from '@/ui/injector';
// @ts-ignore
import '@/assets/tailwind.css';

interface PriceCheckPayload {
  url: string;
  sku: string;
  currentPrice: number;
  oldPrice?: number | null;
  promoName?: string | null;
  title: string;
}

interface CheckPriceResponse {
  success: boolean;
  score: { score: number, message: string };
  history: { date: number, price: number, oldPrice?: number, promoName?: string }[];
  error?: string;
}

export default defineContentScript({
  // Вказуємо конкретні сайти, щоб не навантажувати зайве браузер
  matches: ['*://dnipro-m.ua/*', '*://rozetka.com.ua/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    console.log("FairPrice: Content Script Loaded");

    // 1. Визначаємо адаптер
    const adapters = [new RozetkaAdapter(), new DniproMAdapter()];
    const adapter = adapters.find(a => a.isApplicable());

    if (!adapter) {
      console.log("FairPrice: No adapter for this domain");
      return;
    }

    // 2. Ініціалізуємо "міст" для доступу до JS-змінних сторінки (dataLayer, __NEXT_DATA__)
    // Цей метод ми додали в адаптер у попередньому кроці
    if (adapter.injectProvider) {
      await adapter.injectProvider();
    }

    // 3. Запускаємо логіку аналізу
    await extractAndInject(adapter, ctx);

    // 4. Слідкуємо за зміною URL (для SPA-сайтів, як Розетка або Дніпро-М)
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log("FairPrice: URL changed, re-analyzing...");
        extractAndInject(adapter, ctx).catch(console.error);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // --- Допоміжна функція ---
    // --- Допоміжна функція ---
    async function extractAndInject(currentAdapter: any, context: any) {
      await new Promise(res => setTimeout(res, 500));

      const productId = currentAdapter.getProductID();
      const currentPrice = currentAdapter.getCurrentPrice();

      if (!productId || !currentPrice) {
        console.log("FairPrice: Product data not found yet");
        return;
      }

      const promoName = await currentAdapter.getPromoName();
      const oldPrice = currentAdapter.getOriginalPrice();
      const title = currentAdapter.getTitle();

      const payload: PriceCheckPayload = {
        url: window.location.href,
        sku: productId,
        currentPrice,
        oldPrice,
        promoName,
        title: title || document.title
      };

      try {
        // ТИМЧАСОВА ПЕРЕВІРКА (щоб віджет точно з'явився, навіть якщо background.ts не працює)
        console.log("FairPrice Payload prepared:", payload);

        // Малюємо інтерфейс з тестовими даними ПЕРЕД запитом до бекенду
        injectUI(context, { score: 100, message: "Тестовий запуск" }, [
          { date: Date.now() - 86400000, price: currentPrice + 500 },
          { date: Date.now(), price: currentPrice }
        ]);

        // Реальний запит (може падати, якщо бекенд не готовий)
        const response = await chrome.runtime.sendMessage({
          action: "checkPrice",
          payload
        }) as CheckPriceResponse;

        if (response && response.success) {
          // Якщо бекенд відповів - оновлюємо віджет реальними даними
          injectUI(context, response.score, response.history);
        }
      } catch (e) {
        console.error("FairPrice: Error during communication with background", e);
      }
    }
  }
});