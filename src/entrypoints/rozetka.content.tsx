import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import { createRoot } from 'react-dom/client';
import { PriceChart } from '@/ui/components/PriceChart';
import '@/ui/styles.css';

export default defineContentScript({
  matches: ['*://*.rozetka.com.ua/*'],

  main() {
    const adapter = new RozetkaAdapter();
    let root: any = null;

    const renderReactUI = (
        container: HTMLElement,
        history: any[],
        honestyScore: { score: number; message: string }
    ) => {
      if (!root) {
        root = createRoot(container);
      }
      root.render(
          <div className="fair-price-app">
            <PriceChart data={history} honesty={honestyScore} />
          </div>
      );
    };

    const controller = new ExtensionController(adapter, renderReactUI);
    controller.init();
  },
});