import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import { createRoot } from 'react-dom/client';
import { PriceChart } from '@/ui/components/PriceChart';
import '@/ui/styles.css';

export default defineContentScript({
  matches: ['*://*.rozetka.com.ua/*'],

  main() {
    // Фікс для Firefox: примусова прив'язка контексту для анімацій (якщо виникала помилка requestAnimationFrame)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    }

    const adapter = new RozetkaAdapter();

    const renderReactUI = (
        container: HTMLElement,
        history: any[],
        honestyScore: { score: number; message: string }
    ) => {
      // Якщо контейнер новий (після відновлення SPA), створюємо новий React Root.
      // Зберігаємо екземпляр root прямо в DOM-елементі, щоб не плутати старі і нові контейнери.
      let root = (container as any)._reactRoot;

      if (!root) {
        root = createRoot(container);
        (container as any)._reactRoot = root;
      }

      root.render(
          <div className="fair-price-app w-full block">
            <PriceChart data={history} honesty={honestyScore} />
          </div>
      );
    };

    const controller = new ExtensionController(adapter, renderReactUI);
    controller.init();
  },
});