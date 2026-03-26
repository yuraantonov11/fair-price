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