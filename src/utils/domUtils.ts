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

/**
 * Finds the first existing element from a fallback selector list.
 */
export function queryFirst<T extends Element = Element>(selectors: string[]): T | null {
    for (const selector of selectors) {
        const element = document.querySelector<T>(selector);
        if (element) return element;
    }
    return null;
}

/**
 * Waits until any selector from a fallback list appears.
 */
export function waitForAnyElement(selectors: string[], timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const immediate = queryFirst(selectors);
        if (immediate) {
            return resolve(immediate);
        }

        const observer = new MutationObserver(() => {
            const element = queryFirst(selectors);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for selectors: ${selectors.join(', ')}`));
        }, timeout);
    });
}
