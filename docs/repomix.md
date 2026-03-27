This file is a merged representation of a subset of the codebase, containing files not matching ignore patterns, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching these patterns are excluded: node_modules, docs, dev, .wxt, .idea, .ai, .output
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
.gitignore
package.json
public/icons/icon_error.png
public/icons/icon_inactive.png
public/icons/icon_success.png
README.md
src/adapters/DniproMAdapter.ts
src/adapters/IPriceAdapter.ts
src/adapters/RozetkaAdapter.ts
src/core/ExtensionController.ts
src/core/HonestyCalculator.ts
src/core/MessageRouter.ts
src/entrypoints/background.ts
src/entrypoints/dniprom.content.tsx
src/entrypoints/popup/App.tsx
src/entrypoints/popup/index.html
src/entrypoints/rozetka.content.tsx
src/store/usePriceStore.ts
src/types/css.d.ts
src/types/env.d.ts
src/types/index.d.ts
src/types/messages.d.ts
src/ui/components/PriceChart.tsx
src/ui/injector.tsx
src/ui/styles.css
src/utils/domUtils.ts
src/utils/hydrationParser.ts
src/utils/supabaseClient.ts
tsconfig.json
wxt.config.ts
```

# Files

## File: README.md
````markdown
# Чесна Ціна (Fair Price) Extension

Розширення для браузера, яке допомагає перевіряти чесність ціни (наприклад, розрахунок ціни за одиницю товару).

## Структура проекту (WXT + Vite)

Проект використовує фреймворк [WXT](https://wxt.dev/) для сучасної розробки розширень, React 19 та TailwindCSS 4.

### Основні директорії:
- `wxt.config.ts`: Конфігурація проекту та маніфесту.
- `src/entrypoints/`: Точки входу розширення (Popup, Background, Content Scripts).
  - `popup/`: UI спливаючого вікна (React).
  - `background.js`: Service worker.
  - `content.ts`: Скрипт, що ін'єктується на веб-сторінки.
- `src/core/`: Бізнес-логіка (адаптери магазинів, розрахунок чесності).
- `src/ui/`: Компоненти інтерфейсу (Shadow DOM ін'єктор).

## Як запустити

1.  **Встановіть залежності**:
    ```bash
    npm install
    ```
    *Примітка: Переконайтеся, що ви використовуєте Node.js LTS версії (v20+ рекомендується для React 19).*

2.  **Запустіть режим розробки**:
    ```bash
    npm run dev
    ```
    Ця команда:
    - Збере проект.
    - Відкриє окремий екземпляр Chrome з автоматично завантаженим розширенням.
    - Забезпечить HMR (миттєве оновлення при зміні коду).

    *Якщо браузер не відкрився автоматично, перевірте консоль на наявність помилок.*

3.  **Збірка для публікації**:
    ```bash
    npm run build
    ```
    Готове розширення (zip-архів та розпакована папка) з'явиться у директорії `.output/`.

### Встановлення в браузер (вручну)

Якщо ви хочете встановити зібрану версію:
1. Виконайте `npm run build`.
2. Відкрийте `chrome://extensions/`.
3. Увімкніть "Developer mode" (Режим розробника).
4. Натисніть "Load unpacked" (Завантажити розпаковане).
5. Виберіть папку `.output/chrome-mv3` (або відповідну для вашого браузера).

## Додавання нових магазинів

Щоб додати підтримку нового магазину:
1.  Створіть новий клас адаптера в `src/core/adapters/`, наслідуючись від `IPriceAdapter`.
2.  Додайте його в масив `adapters` у файлі `src/entrypoints/content.js`.

## Ліцензія

MIT
````

## File: src/core/HonestyCalculator.ts
````typescript
export class HonestyCalculator {
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    static calculate(
        currentPrice: number,
        priceHistory: {price: number, date: number}[],
        categoryVolatility: number = 0.08
    ): {score: number, message: string} {

        if (priceHistory.length < 3) {
            return { score: -1, message: "Збираємо історію цін для аналізу..." };
        }

        const now = Date.now();
        const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);

        // Вся історія за 60 днів
        const history60Days = priceHistory.filter(p => p.date >= sixtyDaysAgo);
        const prices60 = history60Days.map(p => p.price);
        const median = this.calculateMedian(prices60);

        // Мінімум за 30 днів
        const history30Days = priceHistory.filter(p => p.date >= thirtyDaysAgo);
        const min30 = history30Days.length > 0 ? Math.min(...history30Days.map(p => p.price)) : currentPrice;

        // ==========================================
        // 🚨 ВИПРАВЛЕНА ЛОГІКА ДЕТЕКЦІЇ СТРИБКА
        // ==========================================
        let penaltySpike = 0;

        // Максимальна ціна за останні 14 днів (шукаємо сам "стрибок")
        const recentPrices = priceHistory.filter(p => p.date >= fourteenDaysAgo);
        const maxRecentPrice = recentPrices.length > 0 ? Math.max(...recentPrices.map(p => p.price)) : currentPrice;

        // Медіана ціни ДО цих 14 днів (шукаємо "нормальну" ціну)
        const olderPrices = priceHistory.filter(p => p.date < fourteenDaysAgo && p.date >= sixtyDaysAgo);
        const oldMedian = olderPrices.length > 0 ? this.calculateMedian(olderPrices.map(p => p.price)) : median;

        // Якщо за останні 2 тижні ціна підстрибнула на >20% від старої норми,
        // і зараз нам подають це як знижку:
        if (maxRecentPrice > oldMedian * 1.2 && currentPrice < maxRecentPrice) {
            penaltySpike = 50; // Нараховуємо 50 штрафних балів
        }
        // ==========================================

        let score = (1 - ((currentPrice - min30) / (median || 1))) * 100;
        score = Math.max(0, score - penaltySpike);

        let message = "Ціна виглядає стабільною.";
        const discountRatio = (median - currentPrice) / (median || 1);

        if (penaltySpike > 0) {
            message = "Увага! Помічено штучне підняття ціни перед знижкою (Pre-inflation Spike).";
        } else if (discountRatio > categoryVolatility * 3) {
            message = "Аномально висока знижка для цієї категорії. Можлива маніпуляція якістю.";
        } else if (score < 40) {
            message = "Знижка сумнівна. Ціна нещодавно була нижчою.";
        } else if (score > 80) {
            message = "Це дійсно вигідна пропозиція порівняно з історією.";
        }

        return { score: Math.round(score), message };
    }
}
````

## File: src/core/MessageRouter.ts
````typescript
/**
 * MessageRouter: Керування асинхронним обміном даними між воркером та скриптами.
 */
export class MessageRouter {
    static async send(message: any) {
        return await browser.runtime.sendMessage(message);
    }

    static onMessage(callback: (message: any, sender: any, sendResponse: any) => void) {
        browser.runtime.onMessage.addListener(callback);
    }
}
````

## File: src/entrypoints/popup/App.tsx
````typescript
import React, { useEffect, useState } from 'react';

const App: React.FC = () => {
    const [currentUrl, setCurrentUrl] = useState<string>('');
    const [isSupported, setIsSupported] = useState<boolean>(false);

    useEffect(() => {
        // Отримуємо URL поточної активної вкладки
        if (typeof browser !== 'undefined' && browser.tabs) {
            browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                const url = tabs[0]?.url || '';
                setCurrentUrl(url);
                setIsSupported(url.includes('rozetka.com.ua') || url.includes('dnipro-m.ua'));
            });
        }
    }, []);

    return (
        <div className="w-80 p-5 bg-slate-900 text-slate-200 font-sans border border-slate-700 shadow-2xl">
            {/* Шапка */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <span className="text-xl">🕵️‍♂️</span>
                </div>
                <div>
                    <h1 className="text-lg font-black text-white leading-tight">Чесна Ціна</h1>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Fair Price Tracker</p>
                </div>
            </div>

            {/* Блок статусу */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                {isSupported ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-emerald-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            <span className="text-sm font-bold">Сайт підтримується</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Відкрийте сторінку будь-якого товару, і ми автоматично покажемо графік історії цін та перевіримо чесність знижки просто на сторінці.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-amber-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <span className="text-sm font-bold">Сайт не підтримується</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Розширення наразі працює на <b>Rozetka</b> та <b>Dnipro-M</b>. Перейдіть на один із цих магазинів для аналізу цін.
                        </p>
                    </div>
                )}
            </div>

            {/* Футер */}
            <div className="mt-4 pt-3 border-t border-slate-700/50 text-center">
                <p className="text-[10px] text-slate-500">
                    Розроблено для захисту від маніпулятивних знижок.
                </p>
            </div>
        </div>
    );
};

export default App;
````

## File: src/entrypoints/popup/index.html
````html
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Чесна Ціна - Popup</title>
</head>
<body>
    <div id="root"></div>
    <script type="module">
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import App from './App.tsx';
        import '@/ui/styles.css';

        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
    </script>
</body>
</html>
````

## File: src/store/usePriceStore.ts
````typescript
// Placeholder for usePriceStore.ts (Zustand + chrome.storage)
// export const usePriceStore = create(...)

export const usePriceStore = {
    // TODO: Implement Zustand store with chrome.storage persistence
};
````

## File: src/types/css.d.ts
````typescript
declare module '*.css';
declare module '@/ui/styles.css?inline';
````

## File: src/types/env.d.ts
````typescript
interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
````

## File: src/ui/styles.css
````css
/* Спочатку імпорт шрифтів */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

/* Потім Tailwind */
@import "tailwindcss";

*, *::before, *::after {
  box-sizing: border-box;
}

.fair-price-app {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  color-scheme: dark;
}

.fair-price-app p {
  margin: 0;
}
````

## File: src/utils/hydrationParser.ts
````typescript
export class HydrationParser {
    static parseNextData(): any {
        const script = document.getElementById('__NEXT_DATA__');
        if (script) {
            try {
                const data = JSON.parse(script.textContent || '{}');
                // Шлях до даних у Dnipro-M зазвичай лежить у props.pageProps
                return data?.props?.pageProps || null;
            } catch (e) {
                console.error('[FairPrice] Помилка парсингу __NEXT_DATA__', e);
            }
        }
        return null;
    }

    /**
     * Специфічний мапінг для Dnipro-M
     */
    static getDniproMProduct(data: any) {
        if (!data || !data.product) return null;

        const p = data.product;
        return {
            externalId: String(p.id),
            title: p.title,
            currentPrice: p.price, // Тут ціна вже зазвичай у форматі number
            oldPrice: p.oldPrice || null,
            isAvailable: p.isAvailable ?? true
        };
    }
}
````

## File: .gitignore
````
.idea/
*.DS_Store
node_modules/
dist/
build/
.output/
````

## File: src/core/ExtensionController.ts
````typescript
import { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { HonestyCalculator } from './HonestyCalculator';
import { MessageRouter } from "@/core/MessageRouter";

export class ExtensionController {
    private adapter: IPriceAdapter;
    private currentUrl: string;
    private mountPoint: HTMLElement | null = null;
    private observer: MutationObserver | null = null;

    constructor(
        adapter: IPriceAdapter,
        private renderUI: (container: HTMLElement, history: any[], honestyScore: { score: number; message: string }) => void
    ) {
        this.adapter = adapter;
        this.currentUrl = window.location.href;
    }

    public init() {
        console.log(`[FairPrice] Ініціалізація для ${this.adapter.getStoreDomain()}`);
        this.processPage();

        // Надійний обсервер для SPA-додатків
        this.observer = new MutationObserver(() => {
            const url = location.href;
            if (url !== this.currentUrl) {
                this.currentUrl = url;
                console.log('[FairPrice] Виявлено SPA навігацію. Перезапуск...');
                this.cleanup();
                // Дебаунс для того, щоб React/Next.js встиг відрендерити новий DOM
                setTimeout(() => this.processPage(), 500);
            }
        });
        this.observer.observe(document, { subtree: true, childList: true });
    }

    private cleanup() {
        if (this.mountPoint) {
            this.mountPoint.remove();
            this.mountPoint = null;
        }
    }

    private async processPage() {
        if (!this.adapter.isProductPage()) {
            MessageRouter.send({ type: 'SET_ICON', payload: { status: 'inactive' } }).catch(() => {});
            return;
        }

        try {
            const productData = await this.adapter.parseProductPage();
            if (!productData) return;

            await MessageRouter.send({ type: 'SAVE_PRODUCT', payload: productData });

            const historyResponse = await MessageRouter.send({
                type: 'GET_HISTORY',
                payload: { url: productData.url }
            });

            if (!historyResponse.success) throw new Error('Failed to fetch history');

            let mappedHistory = historyResponse.data.map((item: any) => ({
                price: item.price,
                oldPrice: item.oldPrice,
                promoName: item.promoName,
                date: new Date(item.date).getTime()
            }));

            // ==========================================
            // 🛠 РЕЖИМ РОЗРОБНИКА (MOCK DATA)
            // ==========================================
            const DEV_MODE = true; // Зміни на false перед релізом!

            // Змінюй це значення для тестування різних станів:
            // 'FAKE'       - Маніпуляція (штучне підняття перед акцією)
            // 'HONEST'     - Дійсно вигідна і чесна знижка
            // 'COLLECTING' - Недостатньо даних (менше 3 записів)
            const SCENARIO: 'FAKE' | 'HONEST' | 'COLLECTING' = 'FAKE';

            if (DEV_MODE) {
                console.warn(`[FairPrice: DEV MODE] Увімкнено сценарій: ${SCENARIO}`);
                const now = Date.now();
                const day = 24 * 60 * 60 * 1000;

                if (SCENARIO === 'FAKE') {
                    productData.price = 1999 * 100; // Підміняємо поточну ціну
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 60 * day },
                        { price: 2400, oldPrice: 2800, promoName: 'Весняний розпродаж', date: now - 30 * day },
                        { price: 3200, oldPrice: null, promoName: null, date: now - 12 * day }, // Стрибок
                        { price: 1999, oldPrice: 3500, promoName: 'Супер Знижка', date: now }
                    ];
                }
                else if (SCENARIO === 'HONEST') {
                    productData.price = 1800 * 100;
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 60 * day },
                        { price: 2500, oldPrice: null, promoName: null, date: now - 45 * day },
                        { price: 2450, oldPrice: null, promoName: null, date: now - 30 * day },
                        { price: 2450, oldPrice: null, promoName: null, date: now - 10 * day },
                        { price: 1800, oldPrice: 2450, promoName: 'Чесний Розпродаж', date: now } // Реальне падіння
                    ];
                }
                else if (SCENARIO === 'COLLECTING') {
                    productData.price = 2500 * 100;
                    mappedHistory = [
                        { price: 2500, oldPrice: null, promoName: null, date: now - 2 * day }
                    ];
                }
            }
            // ==========================================

            const volatility = this.adapter.getStoreDomain() === 'dnipro-m.ua' ? 0.08 : 0.15;

            // Передаємо поточну ціну (справжню або підмінену тестову)
            const honestyResult = HonestyCalculator.calculate(
                productData.price / 100,
                mappedHistory,
                volatility
            );

            const iconStatus = honestyResult.score === -1 ? 'inactive' : (honestyResult.score < 40 ? 'error' : 'success');
            MessageRouter.send({ type: 'SET_ICON', payload: { status: iconStatus } }).catch(() => {});

            await this.injectUI(mappedHistory, honestyResult);

        } catch (error) {
            console.error('[FairPrice] ❌ Помилка обробки сторінки:', error);
        }
    }

    private async injectUI(history: any[], honestyScore: { score: number; message: string }) {
        const anchor = this.adapter.getUIAnchor();
        if (!anchor) return;

        if (!this.mountPoint) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            this.mountPoint.className = 'w-full mt-4 mb-4 z-50 block'; // Tailwind замість inline-стилів

            const insertMethod = this.adapter.getUIInsertMethod();
            if (insertMethod === 'after') {
                anchor.parentNode?.insertBefore(this.mountPoint, anchor.nextSibling);
            } else {
                anchor.appendChild(this.mountPoint);
            }
        }

        this.renderUI(this.mountPoint, history, honestyScore);
    }
}
````

## File: src/entrypoints/dniprom.content.tsx
````typescript
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
    const renderReactUI = (container: HTMLElement, history: any[], honestyScore: { score: number; message: string }) => {
      injectUI(container, history, honestyScore);
    };

    const controller = new ExtensionController(adapter, renderReactUI);
    controller.init();
  },
});
````

## File: src/entrypoints/rozetka.content.tsx
````typescript
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
````

## File: src/types/index.d.ts
````typescript
export { ProductData } from '../adapters/IPriceAdapter';

export interface HistoryRecord {
    price: number;
    old_price: number | null;
    promo_name: string | null; // Додано поле для історії
    created_at: string;        // Дата з Supabase (valid_from)
}

export interface HonestyScore {
    score: number;
    message: string;
}
````

## File: src/types/messages.d.ts
````typescript
import { ProductData } from './index';

export interface SaveProductMessage {
    type: 'SAVE_PRODUCT';
    payload: ProductData;
}

export interface GetHistoryMessage {
    type: 'GET_HISTORY';
    payload: {
        url: string;
        sku?: string; // Можна шукати і за SKU, якщо захочемо в майбутньому
    };
}
export interface SetIconMessage {
    type: 'SET_ICON';
    payload: {
        status: 'success' | 'error' | 'inactive';
    };
}

export type ExtensionMessage = SaveProductMessage | GetHistoryMessage | SetIconMessage;
````

## File: src/ui/components/PriceChart.tsx
````typescript
import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts';

type PriceHistory = {
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
  date: string | number;
};

interface PriceChartProps {
  data: PriceHistory[];
  honesty: { score: number; message: string; };
}

// Хелпери
function scoreColor(score: number) {
  if (score < 40) return { text: 'text-rose-500', stroke: '#f43f5e', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
  if (score < 70) return { text: 'text-amber-500', stroke: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  return { text: 'text-emerald-500', stroke: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
}

function formatPrice(v: number) { return v.toLocaleString('uk-UA') + ' ₴'; }

// Круговий індикатор чесності
const ScoreRing = ({ score }: { score: number }) => {
  const colors = scoreColor(score);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const label = score < 40 ? 'Підозрілий' : score < 70 ? 'Сумнівний' : 'Чесний';
  const emoji  = score < 40 ? '🚨' : score < 70 ? '⚠️' : '✅';

  return (
      <div className="flex items-center gap-3">
        <div className="relative w-[72px] h-[72px] shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" className="stroke-white/5" strokeWidth="6" />
            <circle
                cx="36" cy="36" r={r} fill="none"
                stroke={colors.stroke} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${filled} ${circ}`}
                className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-base font-black ${colors.text}`}>{score}%</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Аналіз чесності</span>
            <span className="text-xs">{emoji}</span>
          </div>
          <span className={`text-sm font-extrabold ${colors.text}`}>{label}</span>
        </div>
      </div>
  );
};

const CollectingCard = ({ count, message }: { count: number; message: string }) => (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col gap-4 shadow-xl font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
          Починаємо моніторинг
        </span>
        </div>
        <span className="text-xs text-emerald-400 font-black px-2 py-1 bg-emerald-400/10 rounded-md">
        {count} / 3 записи
      </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${Math.min((count / 3) * 100, 100)}%` }}
          />
        </div>
        <p className="text-sm text-slate-300 leading-relaxed mt-1">
          Першу ціну зафіксовано! 🕵️‍♂️ Щоб показати точний графік та перевірити чесність знижки, нам потрібно зібрати трохи більше історії.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Завітайте сюди пізніше — розширення автоматично стежить за змінами.
        </p>
      </div>
    </div>
);

// Головний компонент
export const PriceChart = ({ data, honesty }: PriceChartProps) => {
  if (!data || data.length === 0) {
    return <div className="p-4 rounded-2xl bg-slate-900/90 text-slate-400 text-xs text-center">Недостатньо даних.</div>;
  }

  const normalizedData = data
      .map(item => ({ ...item, timestamp: new Date(item.date).getTime() }))
      .sort((a, b) => a.timestamp - b.timestamp);

  if (honesty.score === -1 && normalizedData.length < 3) {
    return <CollectingCard count={normalizedData.length} message={honesty.message} />;
  }

  // Підготовка даних для графіка (групування по днях)
  const groupedByDay = normalizedData.reduce((acc, item) => {
    const dateObj = new Date(item.date);
    if (isNaN(dateObj.getTime())) return acc;
    const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
    acc[dateStr] = {
      dateStr,
      price: Math.round(item.price),
      oldPrice: item.oldPrice ? Math.round(item.oldPrice) : null,
      timestamp: item.timestamp,
    };
    return acc;
  }, {} as Record<string, any>);

  const chartData = Object.values(groupedByDay).sort((a: any, b: any) => a.timestamp - b.timestamp).slice(-14);
  const colors = scoreColor(honesty.score);

  return (
      <div className="flex flex-col gap-3 bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-white/5 p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">FairPrice</span>
            <span className="text-xs text-slate-400 font-medium">Історія цін · {chartData.length} записів</span>
          </div>
        </div>

        <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.border} border text-xs text-slate-300 font-medium leading-relaxed`}>
          {honesty.message}
        </div>

        {/* Графік Recharts */}
        <div className="w-full h-[180px] mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="dateStr" stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#10b981' }} />
              <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2.5} fill="url(#gradPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Легенда та оцінка */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-400 font-medium">Ціна зі знижкою</span>
            </div>
          </div>
          {honesty.score !== -1 && <ScoreRing score={honesty.score} />}
        </div>
      </div>
  );
};
````

## File: src/utils/domUtils.ts
````typescript
/**
 * Очікує появи елемента в DOM. Вирішує проблему асинхронного рендеру в SPA.
 */
export function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) {
            return resolve(el);
        }

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

/**
 * Безпечний парсинг ціни
 */
export function parsePrice(priceStr: string | null | undefined): number | null {
    if (!priceStr) return null;

    const clean = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');

    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Відстежує зміну URL в SPA додатках без перезавантаження сторінки.
 */
export function observeSPA(onUrlChange: (newUrl: string) => void) {
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            onUrlChange(url);
        }
    });

    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
}
````

## File: src/utils/supabaseClient.ts
````typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);
````

## File: tsconfig.json
````json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["chrome", "wxt"]
  },
  "include": [
    "entrypoints/**/*",
    "src/**/*",
    ".wxt/types/**/*"
  ]
}
````

## File: package.json
````json
{
  "name": "fair-price-extension",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "repomix": "npx repomix --ignore node_modules,docs,dev,.wxt,.idea,.ai,.output --style markdown -o docs/repomix.md"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.100.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "recharts": "^3.8.0",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.2",
    "@types/chrome": "^0.1.38",
    "@types/react-dom": "^19.2.3",
    "@wxt-dev/module-react": "^1.2.2",
    "repomix": "^1.13.0",
    "tailwindcss": "^4.2.2",
    "typescript": "^6.0.2",
    "wxt": "^0.20.20"
  }
}
````

## File: src/ui/injector.tsx
````typescript
import { createRoot, Root } from 'react-dom/client';
import { PriceChart } from './components/PriceChart';
import tailwindStyles from '@/ui/styles.css?inline';

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
    honesty: { score: number; message: string }
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
        console.error('[FairPrice] ❌ Помилка інжекту UI:', error);
    }
}

export function cleanupUI() {
    if (reactRoot) { reactRoot.unmount(); reactRoot = null; }
    if (mountContainer) { mountContainer.remove(); mountContainer = null; }
}
````

## File: wxt.config.ts
````typescript
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Чесна Ціна (Fair Price)",
    version: "1.0.0",
    description: "Інтелектуальна система моніторингу цін та детекції маніпулятивних знижок",
    action: {
      default_title: "Чесна Ціна",
      default_icon: {
        "16": "/icons/icon_inactive.png",
        "48": "/icons/icon_inactive.png",
        "128": "/icons/icon_inactive.png"
      }
    },
    permissions: [
      "storage",
      "alarms",
      "declarativeNetRequest" // Обов'язково для перехоплення прихованих цін у JSON
    ],
    host_permissions: [
      "*://dnipro-m.ua/*",
      "*://rozetka.com.ua/*"
    ],
  }
});
````

## File: src/adapters/IPriceAdapter.ts
````typescript
export interface ProductData {
  externalId: string;
  name: string;
  url: string;
  price: number;        // Ціна в копійках
  regularPrice: number | null;
  promoName?: string | null;
  isAvailable: boolean;
  hydrationData?: any;  // Дані з Next.js/React
}

export interface IPriceAdapter {
  getStoreDomain(): string;
  isApplicable(): boolean;

  getProductID(): string | null;
  getCurrentPrice(): number | null;
  getOriginalPrice(): number | null;
  getHydrationData(): any | null;
  getStockStatus(): boolean;

  parseProductPage(): Promise<ProductData | null> | ProductData | null;

  isProductPage(): boolean;
  isCatalogPage(): boolean;
  parseCatalogPage(): Promise<ProductData[]> | ProductData[];

  getUIAnchor(): Element | null;
  getUIInsertMethod(): ContentScriptAppendMode;
}
````

## File: src/adapters/RozetkaAdapter.ts
````typescript
import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { waitForElement, parsePrice } from '@/utils/domUtils';

export class RozetkaAdapter implements IPriceAdapter {

  getStoreDomain(): string { return 'rozetka.com.ua'; }
  isApplicable(): boolean { return window.location.hostname.includes('rozetka.com.ua'); }
  isProductPage(): boolean { return window.location.pathname.includes('/p'); }
  isCatalogPage(): boolean { return !this.isProductPage() && document.querySelector('.catalog-list, .products-list') !== null; }
  getUIAnchor(): Element | null { return document.querySelector('.product-about__right'); }
  getUIInsertMethod(): ContentScriptAppendMode { return 'after'; }

  // Заділ на майбутнє: парсинг стану SSR Розетки
  getHydrationData(): any | null {
    return null;
  }

  getProductID(): string | null {
    return document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') || null;
  }

  getCurrentPrice(): number | null {
    const priceEl = document.querySelector('.product-price__big');
    return parsePrice(priceEl?.textContent);
  }

  getOriginalPrice(): number | null {
    const oldPriceEl = document.querySelector('.product-price__small');
    return parsePrice(oldPriceEl?.textContent);
  }

  getStockStatus(): boolean {
    // Якщо кнопка "Купити" заблокована або відсутня — товару немає
    const buyButton = document.querySelector('app-buy-button button');
    return buyButton ? !buyButton.hasAttribute('disabled') : false;
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      // Чекаємо саме на ціну, оскільки це SPA
      await waitForElement('.product-price__big');

      const currentPrice = this.getCurrentPrice();
      if (!currentPrice) {
        console.error('[FairPrice] ❌ Не вдалося знайти валідну ціну на сторінці Rozetka.');
        return null;
      }

      const titleEl = document.querySelector('.product__title');
      const sku = this.getProductID() || 'unknown';
      const cleanUrl = window.location.origin + window.location.pathname;

      console.log(`[FairPrice] ✅ Знайдено: ${currentPrice} UAH (SKU: ${sku})`);

      return {
        externalId: sku,
        name: titleEl?.textContent?.trim() || 'Невідомий товар Rozetka',
        url: cleanUrl,
        price: Math.round(currentPrice * 100),
        regularPrice: this.getOriginalPrice() ? Math.round(this.getOriginalPrice()! * 100) : null,
        promoName: null,
        isAvailable: this.getStockStatus(),
        hydrationData: this.getHydrationData()
      };
    } catch (error) {
      console.warn('[FairPrice] RozetkaAdapter: Не вдалося розпарсити дані', error);
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> {
    return [];
  }
}
````

## File: src/entrypoints/background.ts
````typescript
import { supabase } from '@/utils/supabaseClient';
import { SaveProductMessage, GetHistoryMessage, SetIconMessage } from '@/types/messages';

export default defineBackground(() => {
  console.log('[FairPrice] Background Service Worker запущено.');

  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    // Чітка маршрутизація подій
    switch (message.type) {
      case 'SAVE_PRODUCT':
        handleSaveProduct(message as SaveProductMessage).then(sendResponse);
        return true; // Вказує браузеру чекати на асинхронну відповідь

      case 'GET_HISTORY':
        handleGetHistory(message as GetHistoryMessage).then(sendResponse);
        return true;

      case 'SET_ICON':
        handleSetIcon(message as SetIconMessage, sender).then(sendResponse);
        return false; // Відповідь не потрібна, відпрацьовує синхронно

      default:
        console.warn('[FairPrice] Невідомий тип повідомлення:', message.type);
        return false;
    }
  });

  async function handleSaveProduct(msg: SaveProductMessage) {
    try {
      const { payload } = msg;
      const urlObj = new URL(payload.url);
      const storeDomain = urlObj.hostname.replace(/^www\./, '');

      const { error } = await supabase.rpc('record_price', {
        p_store_domain: storeDomain,
        p_external_id: payload.externalId || payload.url,
        p_url: payload.url,
        p_name: payload.name,
        p_price: Math.round(payload.price),
        p_regular_price: payload.regularPrice ? Math.round(payload.regularPrice) : null,
        p_is_available: payload.isAvailable ?? true,
        p_promo_name: payload.promoName || null
      });

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('[FairPrice] Помилка збереження:', error);
      return { success: false, error: error.message };
    }
  }

  async function handleGetHistory(msg: GetHistoryMessage) {
    try {
      const { data, error } = await supabase
          .from('price_history')
          .select(`
            price, 
            regular_price, 
            promo_name,
            valid_from,
            products!inner(url)
          `)
          .eq('products.url', msg.payload.url)
          .order('valid_from', { ascending: true });

      if (error) throw error;

      // Конвертуємо копійки у гривні для графіка
      const mappedData = data.map((item: any) => ({
        price: item.price / 100,
        oldPrice: item.regular_price ? item.regular_price / 100 : null,
        promoName: item.promo_name,
        date: item.valid_from
      }));

      return { success: true, data: mappedData };
    } catch (error: any) {
      console.error('[FairPrice] Помилка отримання історії:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  async function handleSetIcon(msg: SetIconMessage, sender: any) {
    const status = msg.payload.status;
    const tabId = sender?.tab?.id;

    if (tabId) {
      try {
        await browser.action.setIcon({
          // Важливо: переконайся, що іконки лежать у папці public/icons/
          path: `/icons/icon_${status}.png`,
          tabId: tabId
        });
      } catch (err) {
        console.error('[FairPrice] Помилка встановлення іконки', err);
      }
    }
    return { success: true };
  }
});
````

## File: src/adapters/DniproMAdapter.ts
````typescript
import { IPriceAdapter, ProductData } from './IPriceAdapter';
import { parsePrice, waitForElement } from '@/utils/domUtils';
import { HydrationParser } from '@/utils/hydrationParser';

export class DniproMAdapter implements IPriceAdapter {
  getStoreDomain(): string { return 'dnipro-m.ua'; }
  isApplicable(): boolean { return window.location.hostname.includes('dnipro-m.ua'); }
  isProductPage(): boolean { return window.location.pathname.includes('/tovar/'); }
  isCatalogPage(): boolean { return !this.isProductPage() && document.querySelector('.catalog-list') !== null; }
  getUIAnchor(): Element | null { return document.querySelector('h1'); }
  getUIInsertMethod(): ContentScriptAppendMode { return 'after'; }

  getHydrationData(): any | null {
    const nextData = HydrationParser.parseNextData();
    return HydrationParser.getDniproMProduct(nextData);
  }

  getProductID(): string | null {
    const hyd = this.getHydrationData();
    if (hyd?.externalId) return hyd.externalId;
    return document.querySelector('meta[itemprop="sku"]')?.getAttribute('content') ||
        document.querySelector('.product-code__code')?.textContent?.trim() || null;
  }

  getCurrentPrice(): number | null {
    const hyd = this.getHydrationData();
    if (hyd?.currentPrice) return parseFloat(hyd.currentPrice);
    const priceEl = document.querySelector('.product-price__current, .price__current');
    return parsePrice(priceEl?.textContent);
  }

  getOriginalPrice(): number | null {
    const hyd = this.getHydrationData();
    if (hyd?.oldPrice) return parseFloat(hyd.oldPrice);
    const oldPriceEl = document.querySelector('.product-price__old, .price__old');
    return parsePrice(oldPriceEl?.textContent);
  }

  getStockStatus(): boolean {
    const hyd = this.getHydrationData();
    return hyd?.isAvailable !== undefined ? hyd.isAvailable : true;
  }

  async parseProductPage(): Promise<ProductData | null> {
    try {
      await waitForElement('h1', 8000);
      const currentPrice = this.getCurrentPrice();

      if (!currentPrice || currentPrice < 300) return null;

      return {
        externalId: this.getProductID() || 'unknown',
        name: document.querySelector('h1')?.textContent?.trim() || 'Товар Dnipro-M',
        url: window.location.origin + window.location.pathname,
        price: Math.round(currentPrice * 100),
        regularPrice: this.getOriginalPrice() ? Math.round(this.getOriginalPrice()! * 100) : null,
        promoName: document.querySelector('.badge__text')?.textContent?.trim() || null,
        isAvailable: this.getStockStatus(),
        hydrationData: this.getHydrationData()
      };
    } catch (error) {
      console.error('[FairPrice] Помилка:', error);
      return null;
    }
  }

  async parseCatalogPage(): Promise<ProductData[]> { return []; }
}
````
