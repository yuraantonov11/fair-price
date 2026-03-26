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
    // Видаляємо валюту, пробіли (в т.ч. нерозривні), коми міняємо на крапки
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