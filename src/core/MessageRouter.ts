/**
 * MessageRouter: Керування асинхронним обміном даними між воркером та скриптами.
 */
import type { TracedMessage } from '@/types/messages';
import type { RuntimeResponse } from '@/types/runtime';
import { runtimeFailure } from '@/utils/runtimeErrors';

export class MessageRouter {
    static async send<T = unknown>(message: TracedMessage): Promise<RuntimeResponse<T>> {
        try {
            return await browser.runtime.sendMessage(message) as RuntimeResponse<T>;
        } catch (error) {
            return runtimeFailure(error, 'MESSAGE_FAILED');
        }
    }
}
