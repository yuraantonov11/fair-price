import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import type { HonestyResult } from '@/core/HonestyCalculator';
import type { HistoryPoint, HistoryView } from '@/types/runtime';
import { injectUI, cleanupUI } from '@/ui/injector';
import { createLogger } from '@/utils/logger';

const logger = createLogger('rozetka.content', { runtime: 'content', store: 'rozetka.com.ua' });

export default defineContentScript({
  matches: ['*://*.rozetka.com.ua/*'],

  main(ctx) {
    logger.info('Content script loaded');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    }

    const adapter = new RozetkaAdapter();

    const renderReactUI = (container: HTMLElement, history: HistoryPoint[], honestyScore: HonestyResult, view: HistoryView) => {
      return injectUI(container, history, honestyScore, 'rozetka', view);
    };

    const controller = new ExtensionController(adapter, renderReactUI, cleanupUI);
    logger.debug('Starting extension controller');
    controller.init();
    ctx.onInvalidated(() => controller.destroy());
  },
});