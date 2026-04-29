import { RozetkaAdapter } from '@/adapters/RozetkaAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import { HonestyResult } from '@/core/HonestyCalculator';
import { injectUI } from '@/ui/injector';
import { createLogger } from '@/utils/logger';

const logger = createLogger('rozetka.content', { runtime: 'content', store: 'rozetka.com.ua' });

export default defineContentScript({
  matches: ['*://*.rozetka.com.ua/*'],

  main() {
    logger.info('Content script loaded');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    }

    const adapter = new RozetkaAdapter();

    const renderReactUI = (container: HTMLElement, history: any[], honestyScore: HonestyResult) => {
      injectUI(container, history, honestyScore, 'rozetka');
    };

    const controller = new ExtensionController(adapter, renderReactUI);
    logger.debug('Starting extension controller');
    controller.init();
  },
});