import { supabase } from '@/utils/supabaseClient';
import { SaveProductMessage, GetHistoryMessage, SetIconMessage } from '@/types/messages';
import { createLogger } from '@/utils/logger';

const logger = createLogger('background', { runtime: 'background' });
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function validateSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false as const, error: 'Supabase env vars are missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)' };
  }

  try {
    const url = new URL(SUPABASE_URL);
    return { ok: true as const, host: url.host };
  } catch {
    return { ok: false as const, error: 'VITE_SUPABASE_URL has invalid format' };
  }
}

export default defineBackground(() => {
  logger.info('Service worker started');

  // Quick connectivity probe helps distinguish config/network issues from DB-level errors.
  void (async () => {
    const config = validateSupabaseConfig();
    if (!config.ok) {
      logger.error('Supabase config validation failed', { reason: config.error });
      return;
    }

    try {
      const probeUrl = `${SUPABASE_URL}/rest/v1/`;
      const response = await fetch(probeUrl, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      });

      logger.info('Supabase connectivity probe completed', {
        host: config.host,
        status: response.status,
      });
    } catch (error) {
      logger.error('Supabase connectivity probe failed', {
        host: config.host,
        error: getErrorMessage(error),
      });
    }
  })();

  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    switch (message.type) {
      case 'SAVE_PRODUCT':
        handleSaveProduct(message as SaveProductMessage).then(sendResponse);
        return true;

      case 'GET_HISTORY':
        handleGetHistory(message as GetHistoryMessage).then(sendResponse);
        return true;

      case 'SET_ICON':
        handleSetIcon(message as SetIconMessage, sender).then(sendResponse);
        return true;

      case 'SEND_FEEDBACK':
        handleSendFeedback(message).then(sendResponse);
        return true;

      default:
        logger.warn('Unknown message type', { messageType: message.type });
        return false;
    }
  });

  async function handleSendFeedback(msg: any) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false, error: config.error, code: 'SUPABASE_CONFIG_ERROR' };

      const { type, url, comment } = msg.payload;
      const { error } = await supabase
          .from('user_requests')
          .insert([{
            type,
            url,
            comment,
            created_at: new Date().toISOString()
          }]);

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to send feedback', { error, messageType: msg?.payload?.type, url: msg?.payload?.url });
      return { success: false, error: getErrorMessage(error), code: 'SUPABASE_FEEDBACK_FAILED' };
    }
  }

  async function handleSaveProduct(msg: SaveProductMessage) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false, error: config.error, code: 'SUPABASE_CONFIG_ERROR' };

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
      logger.error('Failed to save product', { error, url: msg?.payload?.url, externalId: msg?.payload?.externalId });
      return { success: false, error: getErrorMessage(error), code: 'SUPABASE_SAVE_FAILED' };
    }
  }

  async function handleGetHistory(msg: GetHistoryMessage) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false, error: config.error, code: 'SUPABASE_CONFIG_ERROR', data: [] };

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

      const mappedData = data.map((item: any) => ({
        price: item.price / 100,
        oldPrice: item.regular_price ? item.regular_price / 100 : null,
        promoName: item.promo_name,
        date: item.valid_from
      }));

      return { success: true, data: mappedData };
    } catch (error: any) {
      logger.error('Failed to fetch history', { error, url: msg?.payload?.url });
      return { success: false, error: getErrorMessage(error), code: 'SUPABASE_HISTORY_FAILED', data: [] };
    }
  }

  async function handleSetIcon(msg: SetIconMessage, sender: any) {
    const status = msg.payload.status;
    const tabId = sender?.tab?.id;

    if (tabId) {
      try {
        // Передаємо об'єкт розмірів без початкового слеша для кросбраузерності
        await browser.action.setIcon({
          path: {
            "16": `icons/icon_${status}.png`,
            "48": `icons/icon_${status}.png`,
            "128": `icons/icon_${status}.png`
          },
          tabId: tabId
        });
      } catch (err) {
        logger.error('Failed to set icon', { error: err, tabId, status });
      }
    }
    return { success: true };
  }
});