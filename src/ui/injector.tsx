import { createRoot, Root } from 'react-dom/client';
import { PriceChart } from './components/PriceChart';

let reactRoot: Root | null = null;
let mountContainer: HTMLElement | null = null;

export async function injectUI(
    targetContainer: HTMLElement,
    history: any[],
    honesty: { score: number; message: string } // Додано honesty
) {
    try {
        cleanupUI();

        mountContainer = document.createElement('div');
        mountContainer.id = 'fair-price-shadow-host';
        mountContainer.style.width = '100%';
        mountContainer.style.marginTop = '20px';

        // Вставляємо ПЕРЕД цільовим контейнером або в нього
        targetContainer.parentNode?.insertBefore(mountContainer, targetContainer.nextSibling);

        const shadowRoot = mountContainer.attachShadow({ mode: 'open' });

        // Додаємо стилі Tailwind в Shadow DOM
        const styleLink = document.createElement('style');
        styleLink.textContent = `
            :host { all: initial; font-family: sans-serif; display: block; width: 100%; }
            .fair-price-app { background: #1e293b; padding: 16px; border-radius: 12px; color: white; }
        `;
        shadowRoot.appendChild(styleLink);

        const reactContainer = document.createElement('div');
        reactContainer.className = 'fair-price-app';
        shadowRoot.appendChild(reactContainer);

        reactRoot = createRoot(reactContainer);
        reactRoot.render(<PriceChart data={history} honesty={honesty} />);

        console.log('[FairPrice] 🛡️ UI успішно інжектовано');
    } catch (error) {
        console.error('[FairPrice] ❌ Помилка інжекту UI:', error);
    }
}

export function cleanupUI() {
    if (reactRoot) {
        reactRoot.unmount();
        reactRoot = null;
    }
    if (mountContainer) {
        mountContainer.remove();
        mountContainer = null;
    }
}