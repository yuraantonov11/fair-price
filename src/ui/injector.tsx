import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HonestyResult } from '@/core/HonestyCalculator';
import { PriceChart } from './components/PriceChart';
import tailwindStyles from '@/ui/styles.css?inline';
import { createLogger } from '@/utils/logger';
import i18nInstance, { initLanguage, watchLanguage } from '@/utils/i18n';

const logger = createLogger('injector', { runtime: 'content', area: 'ui' });

let reactRoot: Root | null = null;
let mountContainer: HTMLElement | null = null;
let reactContainer: HTMLElement | null = null;
let currentHistory: any[] | null = null;
let currentHonesty: HonestyResult | null = null;
let currentStore: string | undefined = undefined;
let unwatchLang: (() => void) | null = null;

const HOST_RESET = `
  :host { 
    all: initial; 
    display: block; 
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; 
    font-size: 16px !important; 
  }
`;

function renderChart() {
  if (!reactRoot || !currentHistory || !currentHonesty) return;
  reactRoot.render(
    <I18nextProvider i18n={i18nInstance}>
      <PriceChart data={currentHistory} honesty={currentHonesty} store={currentStore} />
    </I18nextProvider>
  );
}

export async function injectUI(
    targetContainer: HTMLElement,
    history: any[],
    honesty: HonestyResult,
    store?: string
) {
    try {
        const targetChanged = mountContainer !== targetContainer;
        if (targetChanged && mountContainer) {
            cleanupUI();
        }

        // Load persisted language before first render
        await initLanguage();

        mountContainer = targetContainer;
        currentHistory = history;
        currentHonesty = honesty;
        currentStore = store;

        mountContainer.id = 'fair-price-container';
        mountContainer.style.cssText = 'width: 100%; display: block;';

        const shadowRoot = mountContainer.shadowRoot ?? mountContainer.attachShadow({ mode: 'open' });

        let styleTag = shadowRoot.querySelector('style[data-fp-style]') as HTMLStyleElement | null;
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.dataset.fpStyle = 'true';
            styleTag.textContent = HOST_RESET + tailwindStyles;
            shadowRoot.appendChild(styleTag);
        }

        reactContainer = shadowRoot.querySelector('[data-fp-react-root]') as HTMLElement | null;
        if (!reactContainer) {
            reactContainer = document.createElement('div');
            reactContainer.dataset.fpReactRoot = 'true';
            shadowRoot.appendChild(reactContainer);
        }

        if (!reactRoot) {
            reactRoot = createRoot(reactContainer);
        }
        renderChart();

        // Live language switch: re-render whenever popup changes the language
        if (!unwatchLang) {
            unwatchLang = watchLanguage(() => renderChart());
        }

    } catch (error) {
        logger.error('UI injection failed', { error, targetId: targetContainer.id });
    }
}

export function cleanupUI() {
    if (unwatchLang) { unwatchLang(); unwatchLang = null; }
    if (reactRoot) { reactRoot.unmount(); reactRoot = null; }
    if (reactContainer) { reactContainer.remove(); reactContainer = null; }
    currentHistory = null;
    currentHonesty = null;
    currentStore = undefined;
    mountContainer = null;
}