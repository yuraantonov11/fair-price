import { DniproMAdapter } from '@/adapters/DniproMAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import type { HonestyResult } from '@/core/HonestyCalculator';
import type { HistoryPoint, HistoryView } from '@/types/runtime';
import { injectUI, cleanupUI } from '@/ui/injector';
import { createLogger } from '@/utils/logger';

const logger = createLogger('dniprom.content', { runtime: 'content', store: 'dnipro-m.ua' });

export default defineContentScript({
  matches: ['*://dnipro-m.ua/*', '*://*.dnipro-m.ua/*'],

  main(ctx) {
    logger.info('Content script loaded');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    }

    const adapter = new DniproMAdapter();

    // Замість ручного createRoot, просто викликаємо нашу функцію з injector.tsx
    const renderReactUI = (container: HTMLElement, history: HistoryPoint[], honestyScore: HonestyResult, view: HistoryView) => {
      return injectUI(container, history, honestyScore, 'dniprom', view);
    };

    const controller = new ExtensionController(adapter, renderReactUI, cleanupUI);
    logger.debug('Starting extension controller');
    controller.init();
    ctx.onInvalidated(() => controller.destroy());
  },
});