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

## File: src/core/ExtensionController.ts
````typescript
import { IPriceAdapter } from '@/adapters/IPriceAdapter';
import { ProductData } from '@/types';
import { waitForElement } from '@/utils/domUtils';
import { HonestyCalculator } from './HonestyCalculator';
import {MessageRouter} from "@/core/MessageRouter";

console.error('[FairPrice: BOOT] 🟧 3. Модуль ExtensionController завантажено в пам\'ять!');

export class ExtensionController {
    private adapter: IPriceAdapter;
    private currentUrl: string;
    private mountPoint: HTMLElement | null = null;
    private root: any = null;

    constructor(adapter: IPriceAdapter, private renderUI: (container: HTMLElement, history: any[], honestyScore: { score: number; message: string }) => void) {
        this.adapter = adapter;
        this.currentUrl = window.location.href;
    }

    public init() {
        console.log(`[FairPrice] Ініціалізація для ${this.adapter.storeName}`);
        this.processPage();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                this.onUrlChange();
            }
        }).observe(document, {subtree: true, childList: true});
    }

    private onUrlChange() {
        console.log('[FairPrice] Виявлено SPA навігацію. Перезапуск...');
        this.currentUrl = location.href; // Оновлюємо URL
        this.cleanup();
        setTimeout(() => this.processPage(), 500);
    }

    private cleanup() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        if (this.mountPoint) {
            this.mountPoint.remove();
            this.mountPoint = null;
        }
    }

    private async processPage() {
        console.log(`[FairPrice] 🚀 Запуск processPage для URL: ${this.currentUrl}`);

        if (!this.adapter.isProductPage(this.currentUrl)) {
            console.log('[FairPrice] 🛑 Це не сторінка товару (перевірка isProductPage не пройдена). Перериваємо.');
            return;
        }

        try {
            console.log('[FairPrice] ⏳ Спроба витягнути дані про товар...');
            const productData = await this.adapter.extractData();

            if (!productData) {
                console.warn('[FairPrice] ⚠️ Дані не витягнуто (extractData повернув null). Можливо, змінилася верстка сайту або селектори неактуальні.');
                return;
            }
            console.log('[FairPrice] ✅ Дані успішно отримані:', productData);

            console.log('[FairPrice] 💾 Відправляємо дані в background для збереження...');
            await MessageRouter.send({
                type: 'SAVE_PRODUCT',
                payload: productData
            });

            console.log('[FairPrice] 📥 Запитуємо історію цін з БД...');
            const historyResponse = await MessageRouter.send({
                type: 'GET_HISTORY',
                payload: { url: productData.url }
            });

            if (!historyResponse.success) {
                throw new Error('Failed to fetch history');
            }
            console.log(`[FairPrice] 📊 Отримано історію (${historyResponse.data.length} записів):`, historyResponse.data);

            const mappedHistory = historyResponse.data.map((item: any) => ({
                price: item.price,
                date: new Date(item.created_at).getTime()
            }));

            const honestyResult = HonestyCalculator.calculate(productData.currentPrice, mappedHistory);
            console.log(`[FairPrice] Результат аналізу:`, honestyResult);

            await this.injectUI(mappedHistory, honestyResult);

        } catch (error) {
            console.error('[FairPrice] ❌ Помилка обробки сторінки:', error);
        }
    }

    private async injectUI(history: any[], honestyScore: { score: number; message: string }) {
        const targetContainer = await waitForElement(this.adapter.injectTargetSelector);

        if (!this.mountPoint) {
            this.mountPoint = document.createElement('div');
            this.mountPoint.id = 'fair-price-container';
            this.mountPoint.className = 'tw-mt-4 tw-p-4 tw-border tw-rounded tw-bg-white';
            targetContainer.appendChild(this.mountPoint);
        }

        this.renderUI(this.mountPoint, history, honestyScore);
    }
}
````

## File: src/core/HonestyCalculator.ts
````typescript
export class HonestyCalculator {
    /**
     * Розрахунок медіани - вона ігнорує поодинокі "викиди" ціни вгору
     */
    static calculateMedian(prices: number[]): number {
        if (prices.length === 0) return 0;
        const sorted = [...prices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Основний метод розрахунку рейтингу чесності
     */
    static calculate(currentPrice: number, priceHistory: {price: number, date: number}[]): {score: number, message: string} {
        // Якщо даних занадто мало (менше 3-5 записів), ми не можемо робити висновки
        if (priceHistory.length < 3) {
            return { score: -1, message: "Збираємо історію цін для аналізу..." };
        }

        const prices = priceHistory.map(p => p.price);
        const min30 = Math.min(...prices);
        const median = this.calculateMedian(prices);

        // --- Детекція Pre-inflation Spike (Штраф за маніпуляцію) ---
        let penaltySpike = 0;
        const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

        // Шукаємо, чи була ціна значно нижчою за останні 14 днів
        const recentPrices = priceHistory.filter(p => p.date >= fourteenDaysAgo);
        if (recentPrices.length > 1) {
            const oldRecentPrice = recentPrices[0].price;
            // Якщо ціна перед "знижкою" зросла на понад 15-20%
            if (currentPrice < oldRecentPrice * 1.2 && prices.some(p => p > currentPrice * 1.1)) {
                // Це виглядає як штучне накручування
                penaltySpike = 40;
            }
        }

        // Формула з ТЗ: Score = max(0, (1 - (P_now - P_min30)/P_median) * 100 - Penalty)
        let score = (1 - ((currentPrice - min30) / (median || 1))) * 100;
        score = Math.max(0, score - penaltySpike);

        // Формування повідомлення
        let message = "Ціна виглядає стабільною.";
        if (penaltySpike > 0) {
            message = "Увага! Помічено штучне підняття ціни перед знижкою (Pre-inflation Spike).";
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

## File: src/entrypoints/popup/App.tsx
````typescript
import React from 'react';

const App: React.FC = () => {
    return (
        <div className="fair-price-popup p-4">
            <h1 className="text-xl font-bold">Чесна Ціна</h1>
            <p className="mt-2 text-gray-600">Перевірка історії цін...</p>
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

## File: src/types/index.d.ts
````typescript
export interface ProductData {
    url: string;
    title: string;
    currentPrice: number;
    oldPrice: number | null;
    store: 'rozetka' | 'dnipro-m';
}

export interface HistoryRecord {
    price: number;
    old_price: number | null;
    created_at: string;
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
    payload: { url: string };
}

export type ExtensionMessage = SaveProductMessage | GetHistoryMessage;
````

## File: src/ui/components/PriceChart.tsx
````typescript
import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type PriceHistory = {
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
  date: number;
};

interface PriceChartProps {
  data: PriceHistory[];
  honesty: {
    score: number;
    message: string;
  };
}

export const PriceChart = ({ data, honesty }: PriceChartProps) => {
  if (!data || data.length === 0) {
    return (
        <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-xl text-white">
          <p className="text-sm text-slate-400 text-center">
            Недостатньо даних для побудови графіка.
          </p>
        </div>
    );
  }

  const isCollecting = honesty.score === -1;

  if (isCollecting && data.length < 3) {
    const currentPrice = data[data.length - 1]?.price;
    return (
        <div className="flex flex-col gap-3 p-4 bg-slate-800 rounded-xl text-white">
          {/* Заголовок */}
          <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Чесна Ціна — Моніторинг
          </span>
            <span className="text-[10px] text-slate-500">
            {data.length} / 3+ записів
          </span>
          </div>

          {/* Поточна ціна */}
          {currentPrice && (
              <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">
              {currentPrice.toLocaleString('uk-UA')} ₴
            </span>
                <span className="text-xs text-slate-400">поточна ціна</span>
              </div>
          )}

          {/* Прогрес-бар збору даних */}
          <div className="flex flex-col gap-1">
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                  className="bg-amber-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min((data.length / 3) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {honesty.message} Щоразу як ви відкриваєте сторінку — ціна фіксується.
            </p>
          </div>
        </div>
    );
  }

  // Визначаємо колірну схему на основі скорингу
  const getScoreColor = (score: number) => {
    if (score === -1) return 'text-slate-400';
    if (score < 40) return 'text-rose-500';
    if (score < 70) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getScoreBg = (score: number) => {
    if (score < 40) return 'bg-rose-500/10 border-rose-500/20';
    if (score < 70) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-emerald-500/10 border-emerald-500/20';
  };

  const groupedByDay = data.reduce((acc, item) => {
    const dateObj = new Date(item.date);
    const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });

    acc[dateStr] = {
      dateStr,
      fullDate: dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }),
      price: Math.round(item.price),
      oldPrice: item.oldPrice ? Math.round(item.oldPrice) : null,
      promoName: item.promoName,
      timestamp: item.date
    };
    return acc;
  }, {} as Record<string, any>);

  let chartData = Object.values(groupedByDay)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-14);

  if (chartData.length === 1) {
    const today = chartData[0];
    chartData = [{ ...today, dateStr: 'Початок', fullDate: 'Моніторинг розпочато' }, today];
  }

  const prices = chartData.flatMap(d => d.oldPrice ? [d.price, d.oldPrice] : [d.price]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = Math.max((maxPrice - minPrice) * 0.2, 100);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
          <div className="p-3 bg-slate-900/95 border border-slate-700 rounded-lg text-white shadow-xl z-50 min-w-[150px]">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">{item.fullDate}</p>
            {item.promoName && (
                <div className="mb-2">
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/30">
                    {item.promoName}
                  </span>
                </div>
            )}
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-black text-emerald-400">{item.price} ₴ <span className="text-[10px] font-normal text-slate-400 ml-1">поточна</span></p>
              {item.oldPrice && item.oldPrice > item.price && (
                  <p className="text-xs text-slate-400 line-through decoration-rose-500/70">{item.oldPrice} ₴ <span className="text-[10px] font-normal no-underline ml-1">без знижки</span></p>
              )}
            </div>
          </div>
      );
    }
    return null;
  };

  return (
      <div className="flex flex-col w-full h-full gap-4">
        {/* Новий блок рейтингу чесності */}
        <div className={`p-3 rounded-lg border ${getScoreBg(honesty.score)} flex flex-col gap-1`}>
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Аналіз чесності знижки
            </span>
            <span className={`text-xl font-black ${getScoreColor(honesty.score)}`}>
              {honesty.score === -1 ? '???' : `${honesty.score}%`}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-700 leading-relaxed">
            {honesty.message}
          </p>
        </div>

        {/* Графік */}
        <div className="w-full h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
              <XAxis dataKey="dateStr" stroke="#94a3b8" fontSize={11} fontWeight={500} tickLine={false} axisLine={false} tickMargin={12} />
              <YAxis domain={[Math.max(0, minPrice - padding), maxPrice + padding]} hide />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Line type="monotone" dataKey="oldPrice" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls />
              <Line type="monotone" dataKey="price" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: '#34d399', strokeWidth: 2, stroke: '#1e293b' }} activeDot={{ r: 6, fill: '#10b981', strokeWidth: 0 }} animationDuration={1000} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Легенда */}
        <div className="flex justify-center gap-4">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Ціна зі знижкою</span>
          </div>
          <div className="flex items-center gap-1.5 leading-none">
            <span className="w-2 h-2 rounded-full border-2 border-slate-400 border-dashed"></span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Без знижки</span>
          </div>
        </div>
      </div>
  );
};
````

## File: src/ui/styles.css
````css
@import "tailwindcss";

:host {
    all: initial;
    font-size: 16px !important;
    line-height: 1.5 !important;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    display: block;
}
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

## File: src/utils/supabaseClient.ts
````typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);
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

## File: src/ui/injector.tsx
````typescript
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
    permissions: ["storage", "alarms"],
    host_permissions: [
      "*://dnipro-m.ua/*",
      "*://rozetka.com.ua/*"
    ],
  },
  webExt: {
    startUrls: [
      "https://dnipro-m.ua/tovar/sadovij-podribnyuvach-gsb-38/",
    ],
  },
});
````

## File: src/adapters/IPriceAdapter.ts
````typescript
import { ProductData } from '@/types';

export interface IPriceAdapter {
  readonly storeName: 'rozetka' | 'dnipro-m';

  /**
   * Селектор, після або всередині якого буде інжектований наш графік
   */
  readonly injectTargetSelector: string;

  /**
   * Перевіряє, чи відповідає поточний домен цьому адаптеру
   */
  matchDomain(hostname: string): boolean;

  /**
   * Перевіряє, чи ми знаходимось на сторінці конкретного товару
   */
  isProductPage(url: string): boolean;

  /**
   * Витягує всі необхідні дані зі сторінки.
   */
  extractData(): Promise<ProductData | null>;
}
````

## File: src/adapters/RozetkaAdapter.ts
````typescript
import { IPriceAdapter } from './IPriceAdapter';
import { ProductData } from '@/types';
import { waitForElement, parsePrice } from '@/utils/domUtils';

export class RozetkaAdapter implements IPriceAdapter {
  storeName = 'rozetka' as const;

  // Блок на Розетці, біля якого зазвичай малюють інфу про товар (кнопки купити тощо)
  injectTargetSelector = '.product-about__right';

  matchDomain(hostname: string): boolean {
    return hostname.includes('rozetka.com.ua');
  }

  isProductPage(url: string): boolean {
    // Розетка використовує /p у шляху для товарів
    return url.includes('/p');
  }

  async extractData(): Promise<ProductData | null> {
    try {
      // Очікуємо появи головної ціни, оскільки Розетка - це SPA
      await waitForElement('.product-price__big');

      const titleEl = document.querySelector('.product__title');
      const priceEl = document.querySelector('.product-price__big');
      const oldPriceEl = document.querySelector('.product-price__small');

      const currentPrice = parsePrice(priceEl?.textContent);
      if (!currentPrice) return null;

      // Відрізаємо GET-параметри від URL, щоб історія зберігалася для одного товару коректно
      const cleanUrl = window.location.origin + window.location.pathname;

      return {
        url: cleanUrl,
        title: titleEl?.textContent?.trim() || 'Невідомий товар Rozetka',
        currentPrice,
        oldPrice: parsePrice(oldPriceEl?.textContent),
        store: this.storeName
      };
    } catch (error) {
      console.warn('[FairPrice] RozetkaAdapter: Не вдалося розпарсити дані', error);
      return null;
    }
  }
}
````

## File: src/entrypoints/background.ts
````typescript
import { supabase } from '@/utils/supabaseClient';
import { SaveProductMessage, GetHistoryMessage } from '@/types/messages';

export default defineBackground(() => {
  console.log('[FairPrice] Background Service Worker запущено.');

  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (message.type === 'SAVE_PRODUCT') {
      handleSaveProduct(message as SaveProductMessage).then(sendResponse);
      return true; // Асинхронна відповідь
    }

    if (message.type === 'GET_HISTORY') {
      handleGetHistory(message as GetHistoryMessage).then(sendResponse);
      return true; // Асинхронна відповідь
    }
  });

  async function handleSaveProduct(msg: SaveProductMessage) {
    try {
      const { payload } = msg;

      // Мапимо назву стора на домен для RPC
      const domain = payload.store === 'rozetka' ? 'rozetka.com.ua' : 'dnipro-m.ua';

      // Використовуємо RPC і конвертуємо гривні в копійки
      const { error } = await supabase.rpc('record_price', {
        p_store_domain: domain,
        p_external_id: payload.url,
        p_url: payload.url,
        p_name: payload.title,
        p_price: Math.round(payload.currentPrice * 100),
        p_regular_price: payload.oldPrice ? Math.round(payload.oldPrice * 100) : null,
        p_is_available: true
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('[FairPrice] Помилка збереження:', error);
      return { success: false, error };
    }
  }

  async function handleGetHistory(msg: GetHistoryMessage) {
    try {
      // Робимо JOIN з таблицею products для пошуку по URL
      const { data, error } = await supabase
          .from('price_history')
          .select(`
            price, 
            regular_price, 
            valid_from,
            products!inner(url)
          `)
          .eq('products.url', msg.payload.url)
          .order('valid_from', { ascending: true });

      if (error) throw error;

      // Мапимо відповідь для фронтенду і повертаємо копійки назад у гривні
      const mappedData = data.map((item: any) => ({
        price: item.price / 100,
        old_price: item.regular_price ? item.regular_price / 100 : null,
        created_at: item.valid_from // ExtensionController очікує created_at
      }));

      return { success: true, data: mappedData };
    } catch (error) {
      console.error('[FairPrice] Помилка отримання історії:', error);
      return { success: false, error: null, data: [] };
    }
  }
});
````

## File: src/adapters/DniproMAdapter.ts
````typescript
import { IPriceAdapter } from './IPriceAdapter';
import { ProductData } from '@/types';
import { parsePrice, waitForElement } from '@/utils/domUtils';

export class DniproMAdapter implements IPriceAdapter {
    storeName = 'dnipro-m' as const;
    injectTargetSelector = 'h1';

    matchDomain(hostname: string): boolean {
        return hostname.includes('dnipro-m.ua');
    }

    isProductPage(url: string): boolean {
        return url.includes('/tovar/');
    }

    async extractData(): Promise<ProductData | null> {
        try {
            await waitForElement('h1', 8000);
            const title = document.querySelector('h1')?.textContent?.trim() || 'Товар Dnipro-M';

            // --- Стратегія 1: ld+json → шукаємо offers.price ---
            const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const s of Array.from(ldScripts)) {
                try {
                    const json = JSON.parse(s.textContent || '{}');
                    const price = this.extractFromLdJson(json);
                    if (price) {
                        console.log('[FairPrice] ✅ ld+json ціна:', price);
                        return this.buildResult(title, price, null);
                    }
                } catch { /* skip */ }
            }

            // --- Стратегія 2: __NEXT_DATA__ --- глибокий пошук числового price ---
            const nextScript = document.getElementById('__NEXT_DATA__');
            if (nextScript) {
                try {
                    const json = JSON.parse(nextScript.textContent || '{}');
                    console.log('[FairPrice] __NEXT_DATA__ pageProps keys:',
                        Object.keys(json?.props?.pageProps || {}));
                    const price = this.deepFindPrice(json, 0);
                    if (price) {
                        console.log('[FairPrice] ✅ __NEXT_DATA__ ціна:', price);
                        return this.buildResult(title, price, null);
                    }
                } catch { /* skip */ }
            }

            // --- Стратегія 3: DOM — перебираємо всі варіанти ---
            console.warn('[FairPrice] JSON не дав результату, пробуємо DOM...');
            const domResult = this.extractFromDOM();
            if (domResult) {
                console.log('[FairPrice] ✅ DOM ціна:', domResult);
                const oldPrice = parsePrice(
                    document.querySelector('.product-card-info__price-old, .price__old, [class*="price-old"], [class*="old-price"]')?.textContent
                );
                return this.buildResult(title, domResult, oldPrice);
            }

            // --- Стратегія 4: Регулярка по всьому тексту сторінки ---
            console.warn('[FairPrice] DOM не дав результату, регулярка...');
            const bodyText = document.body.innerText;
            // Шукаємо патерн "4 998 ₴" або "4998 грн" або просто велике число
            const priceMatch = bodyText.match(/(\d[\d\s]{2,6})\s*(?:₴|грн)/);
            if (priceMatch) {
                const price = parseFloat(priceMatch[1].replace(/\s/g, ''));
                if (price > 0) {
                    console.log('[FairPrice] ✅ Регулярка ціна:', price);
                    return this.buildResult(title, price, null);
                }
            }

            console.error('[FairPrice] ❌ Ціну не знайдено жодним методом.');
            return null;

        } catch (error) {
            console.error('[FairPrice] Помилка extractData:', error);
            return null;
        }
    }

    private extractFromLdJson(obj: any): number | null {
        if (!obj || typeof obj !== 'object') return null;

        // Якщо це Product з offers
        if (obj['@type'] === 'Product' && obj.offers) {
            const offer = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
            const raw = offer?.price ?? offer?.lowPrice ?? offer?.highPrice;
            if (raw !== undefined && raw !== null) {
                const p = typeof raw === 'string' ? parseFloat(raw.replace(/[^\d.]/g, '')) : raw;
                if (p > 0) return p;
            }
        }

        // Рекурсивно по масивах і об'єктах
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = this.extractFromLdJson(item);
                if (found) return found;
            }
        } else {
            for (const key of Object.keys(obj)) {
                const found = this.extractFromLdJson(obj[key]);
                if (found) return found;
            }
        }
        return null;
    }

    private deepFindPrice(obj: any, depth: number): number | null {
        if (depth > 15 || !obj || typeof obj !== 'object') return null;

        // Пріоритетні ключі
        const priceKeys = ['price', 'currentPrice', 'salePrice', 'offerPrice', 'sellPrice', 'cost'];
        for (const key of priceKeys) {
            if (key in obj) {
                const val = obj[key];
                if (typeof val === 'number' && val > 10 && val < 10_000_000) return val;
                if (typeof val === 'string') {
                    const p = parseFloat(val.replace(/[^\d.]/g, ''));
                    if (!isNaN(p) && p > 10 && p < 10_000_000) return p;
                }
            }
        }

        // Рекурсія
        for (const key of Object.keys(obj)) {
            const found = this.deepFindPrice(obj[key], depth + 1);
            if (found) return found;
        }
        return null;
    }

    private extractFromDOM(): number | null {
        const selectors = [
            // meta/itemprop — найнадійніше
            'meta[itemprop="price"]',            // <meta content="4998">
            '[itemprop="price"][content]',
            '[itemprop="price"]',
            // Специфічні класи Dnipro-M
            '.product-card-info__price-current',
            '.product-card-info__price',
            '.price__value',
            '.price-block__price',
            // Загальні
            '[class*="current-price"]',
            '[class*="price-current"]',
            '[class*="price__current"]',
            '[class*="sale-price"]',
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;

            // Спочатку content-атрибут (SEO-розмітка)
            const content = el.getAttribute('content') || el.getAttribute('data-price');
            if (content) {
                const p = parseFloat(content.replace(/[^\d.]/g, ''));
                if (p > 0) { console.log(`[FairPrice] DOM[${sel}] content="${content}"`); return p; }
            }

            // Потім textContent
            const p = parsePrice(el.textContent);
            if (p && p > 0) { console.log(`[FairPrice] DOM[${sel}] text="${el.textContent?.trim()}"`); return p; }
        }
        return null;
    }

    private buildResult(title: string, price: number, oldPrice: number | null): ProductData {
        return {
            url: window.location.origin + window.location.pathname,
            title,
            currentPrice: price,&3!#sTW"cA#EB&Q
            oldPrice,
            store: this.storeName
        };
    }
}
````
