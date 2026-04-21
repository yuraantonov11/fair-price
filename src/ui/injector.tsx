import { createRoot, Root } from 'react-dom/client';
import { HonestyResult } from '@/core/HonestyCalculator';
import { PriceChart } from './components/PriceChart';
import tailwindStyles from '@/ui/styles.css?inline';
import { createLogger } from '@/utils/logger';

const logger = createLogger('injector', { runtime: 'content', area: 'ui' });

let reactRoot: Root | null = null;
let mountContainer: HTMLElement | null = null;

const HOST_RESET = `
  :host { 
    all: initial; 
    display: block; 
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; 
    font-size: 16px !important; 
  }
`;

export async function injectUI(
    targetContainer: HTMLElement,
    history: any[],
    honesty: HonestyResult
) {
    try {
        cleanupUI();

        mountContainer = document.createElement('div');
        mountContainer.id = 'fair-price-shadow-host';
        mountContainer.style.cssText = 'width: 100%; margin-top: 20px; display: block;';

        targetContainer.parentNode?.insertBefore(mountContainer, targetContainer.nextSibling);

        const shadowRoot = mountContainer.attachShadow({ mode: 'open' });

        const styleTag = document.createElement('style');
        styleTag.textContent = HOST_RESET + tailwindStyles;
        shadowRoot.appendChild(styleTag);

        const reactContainer = document.createElement('div');
        shadowRoot.appendChild(reactContainer);

        reactRoot = createRoot(reactContainer);
        reactRoot.render(<PriceChart data={history} honesty={honesty} />);

    } catch (error) {
        logger.error('UI injection failed', { error, targetId: targetContainer.id });
    }
}

export function cleanupUI() {
    if (reactRoot) { reactRoot.unmount(); reactRoot = null; }
    if (mountContainer) { mountContainer.remove(); mountContainer = null; }
}