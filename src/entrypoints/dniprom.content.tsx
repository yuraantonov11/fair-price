console.error('[FairPrice: BOOT] ⬛ 1. Файл dniprom.content.tsx фізично прочитано браузером!');
import { DniproMAdapter } from '@/adapters/DniproMAdapter';
import { ExtensionController } from '@/core/ExtensionController';
import { injectUI } from '@/ui/injector';

export default defineContentScript({
  matches: ['*://dnipro-m.ua/*', '*://*.dnipro-m.ua/*'],

  main() {
    console.log('[FairPrice: LEVEL 0] 🚀 Скрипт завантажено для Dnipro-M');

    const adapter = new DniproMAdapter();

    // Замість ручного createRoot, просто викликаємо нашу функцію з injector.tsx
    const renderReactUI = (container: HTMLElement, history: any[], honestyScore: number) => {
      injectUI(container, history, honestyScore);
    };

    const controller = new ExtensionController(adapter, renderReactUI);
    controller.init();
  },
});