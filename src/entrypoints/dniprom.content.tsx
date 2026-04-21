import { DniproMAdapter } from '@/adapters/DniproMAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import { HonestyResult } from '@/core/HonestyCalculator';
import { injectUI } from '@/ui/injector';
import { createLogger } from '@/utils/logger';

const logger = createLogger('dniprom.content', { runtime: 'content', store: 'dnipro-m.ua' });

export default defineContentScript({
  matches: ['*://dnipro-m.ua/*', '*://*.dnipro-m.ua/*'],

  main() {
    logger.info('Content script loaded');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    }

    const adapter = new DniproMAdapter();

    // Замість ручного createRoot, просто викликаємо нашу функцію з injector.tsx
    const renderReactUI = (container: HTMLElement, history: any[], honestyScore: HonestyResult) => {
      injectUI(container, history, honestyScore);
    };

    const controller = new ExtensionController(adapter, renderReactUI);
    logger.debug('Starting extension controller');
    controller.init();
  },
});