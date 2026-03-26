import { createRoot, Root } from 'react-dom/client';
import { PriceChart } from './components/PriceChart';

let reactRoot: Root | null = null;
let mountContainer: HTMLElement | null = null;

// Базові стилі для Shadow DOM (Tailwind utility-first через CDN play)
const BASE_STYLES = `
  @import url('https://cdn.jsdelivr.net/npm/tailwindcss@3/base.css');
  
  *, *::before, *::after { box-sizing: border-box; }
  :host { all: initial; display: block; font-family: ui-sans-serif, system-ui, sans-serif; }
  
  .flex { display: flex; } .flex-col { flex-direction: column; }
  .gap-1 { gap: 0.25rem; } .gap-2 { gap: 0.5rem; } .gap-3 { gap: 0.75rem; } .gap-4 { gap: 1rem; }
  .items-center { align-items: center; } .items-baseline { align-items: baseline; }
  .justify-between { justify-content: space-between; } .justify-center { justify-content: center; }
  .w-full { width: 100%; } .h-full { height: 100%; } .h-\\[200px\\] { height: 200px; }
  .w-2 { width: 0.5rem; } .h-2 { height: 0.5rem; } .h-1\\.5 { height: 0.375rem; }
  .p-3 { padding: 0.75rem; } .p-4 { padding: 1rem; }
  .px-1\\.5 { padding-left: 0.375rem; padding-right: 0.375rem; }
  .py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
  .mt-2 { margin-top: 0.5rem; } .ml-1 { margin-left: 0.25rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .rounded { border-radius: 0.25rem; } .rounded-full { border-radius: 9999px; }
  .rounded-lg { border-radius: 0.5rem; } .rounded-xl { border-radius: 0.75rem; }
  .border { border-width: 1px; border-style: solid; }
  .border-2 { border-width: 2px; border-style: solid; }
  .border-dashed { border-style: dashed; }
  .text-white { color: #fff; } .text-center { text-align: center; }
  .text-xs { font-size: 0.75rem; line-height: 1rem; }
  .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
  .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
  .text-2xl { font-size: 1.5rem; line-height: 2rem; }
  .text-\\[10px\\] { font-size: 10px; }
  .font-medium { font-weight: 500; } .font-bold { font-weight: 700; }
  .font-black { font-weight: 900; } .font-normal { font-weight: 400; }
  .uppercase { text-transform: uppercase; }
  .tracking-wider { letter-spacing: 0.05em; }
  .leading-relaxed { line-height: 1.625; } .leading-none { line-height: 1; }
  .line-through { text-decoration: line-through; }
  .no-underline { text-decoration: none; }
  .transition-all { transition: all 0.15s ease; }
  .inline-block { display: inline-block; }
  .min-w-\\[150px\\] { min-width: 150px; }
  .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,.1),0 8px 10px -6px rgba(0,0,0,.1); }
  .z-50 { z-index: 50; }
  /* Colors */
  .bg-slate-800 { background-color: #1e293b; }
  .bg-slate-900\\/95 { background-color: rgba(15,23,42,.95); }
  .bg-slate-700 { background-color: #334155; }
  .bg-rose-500\\/10 { background-color: rgba(239,68,68,.1); }
  .bg-amber-500\\/10 { background-color: rgba(245,158,11,.1); }
  .bg-emerald-500\\/10 { background-color: rgba(16,185,129,.1); }
  .bg-amber-400\\/20 { background-color: rgba(251,191,36,.2); }
  .bg-emerald-400 { background-color: #34d399; }
  .bg-amber-400 { background-color: #fbbf24; }
  .border-slate-700 { border-color: #334155; }
  .border-rose-500\\/20 { border-color: rgba(239,68,68,.2); }
  .border-amber-500\\/20 { border-color: rgba(245,158,11,.2); }
  .border-emerald-500\\/20 { border-color: rgba(16,185,129,.2); }
  .border-amber-400\\/30 { border-color: rgba(251,191,36,.3); }
  .border-slate-400 { border-color: #94a3b8; }
  .text-slate-400 { color: #94a3b8; } .text-slate-500 { color: #64748b; }
  .text-slate-700 { color: #334155; }
  .text-rose-500 { color: #ef4444; }
  .text-amber-500 { color: #f59e0b; } .text-amber-400 { color: #fbbf24; }
  .text-emerald-500 { color: #10b981; } .text-emerald-400 { color: #34d399; }
  .decoration-rose-500\\/70 { text-decoration-color: rgba(239,68,68,.7); }
`;

export async function injectUI(
    targetContainer: HTMLElement,
    history: any[],
    honesty: { score: number; message: string }
) {
    try {
        cleanupUI();

        mountContainer = document.createElement('div');
        mountContainer.id = 'fair-price-shadow-host';
        mountContainer.style.cssText = 'width:100%; margin-top:20px; display:block;';
        targetContainer.parentNode?.insertBefore(mountContainer, targetContainer.nextSibling);

        const shadowRoot = mountContainer.attachShadow({ mode: 'open' });

        const styleTag = document.createElement('style');
        styleTag.textContent = BASE_STYLES;
        shadowRoot.appendChild(styleTag);

        const reactContainer = document.createElement('div');
        shadowRoot.appendChild(reactContainer);

        reactRoot = createRoot(reactContainer);
        reactRoot.render(<PriceChart data={history} honesty={honesty} />);

        console.log('[FairPrice] 🛡️ UI успішно інжектовано');
    } catch (error) {
        console.error('[FairPrice] ❌ Помилка інжекту UI:', error);
    }
}

export function cleanupUI() {
    if (reactRoot) { reactRoot.unmount(); reactRoot = null; }
    if (mountContainer) { mountContainer.remove(); mountContainer = null; }
}