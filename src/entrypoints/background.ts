import { supabase } from '@/utils/supabaseClient';
import {
    SaveProductMessage, GetHistoryMessage, SetIconMessage,
    SaveAlertMessage, GetAlertsMessage, DeleteAlertMessage, TrackEventMessage,
    SetConsentMessage, GetConsentMessage, CheckBaselineMessage,
} from '@/types/messages';
import { createLogger } from '@/utils/logger';

const logger = createLogger('background', { runtime: 'background' });
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BASELINE_API_URL = import.meta.env.VITE_BASELINE_API_URL;
const TELEGRAM_ALERTS_ENABLED = import.meta.env.VITE_TELEGRAM_ALERTS_ENABLED === 'true';

// SPA debounce: prevent duplicate GET_HISTORY calls within 500ms per tab
const lastHistoryCallTs = new Map<number, number>();
const HISTORY_DEBOUNCE_MS = 500;

const USER_KEY_STORAGE_KEY = 'fp_user_key';
const CONSENT_STORAGE_KEY  = 'fp_affiliate_consent';

async function getUserKey(): Promise<string> {
  const stored = await browser.storage.local.get(USER_KEY_STORAGE_KEY);
  if (stored[USER_KEY_STORAGE_KEY]) return stored[USER_KEY_STORAGE_KEY] as string;
  const key = crypto.randomUUID();
  await browser.storage.local.set({ [USER_KEY_STORAGE_KEY]: key });
  return key;
}

const ICON_PATHS = {
  success: 'icons/icon_success.png',
  error: 'icons/icon_error.png',
  inactive: 'icons/icon_inactive.png',
  'single-price': 'icons/icon_single-price.png',
} as const;

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

      case 'GET_HISTORY': {
          const tabId = sender?.tab?.id as number | undefined;
          if (tabId !== undefined) {
            const last = lastHistoryCallTs.get(tabId) ?? 0;
            const now = Date.now();
            if (now - last < HISTORY_DEBOUNCE_MS) {
              sendResponse({ success: false, data: [], code: 'DEBOUNCED' });
              return true;
            }
            lastHistoryCallTs.set(tabId, now);
          }
          handleGetHistory(message as GetHistoryMessage).then(sendResponse);
          return true;
      }

      case 'SET_ICON':
        handleSetIcon(message as SetIconMessage, sender).then(sendResponse);
        return true;

      case 'SEND_FEEDBACK':
        handleSendFeedback(message).then(sendResponse);
        return true;

      case 'SAVE_ALERT':
        handleSaveAlert(message as SaveAlertMessage).then(sendResponse);
        return true;

      case 'GET_ALERTS':
        handleGetAlerts(message as GetAlertsMessage).then(sendResponse);
        return true;

      case 'DELETE_ALERT':
        handleDeleteAlert(message as DeleteAlertMessage).then(sendResponse);
        return true;

      case 'TRACK_EVENT':
        handleTrackEvent(message as TrackEventMessage).then(sendResponse);
        return true;

      case 'SET_CONSENT':
        handleSetConsent(message as SetConsentMessage).then(sendResponse);
        return true;

      case 'GET_CONSENT':
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        handleGetConsent(message as GetConsentMessage).then(sendResponse);
        return true;

      case 'CHECK_BASELINE':
        handleCheckBaseline(message as CheckBaselineMessage).then(sendResponse);
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
        p_promo_name: payload.promoName || null,
        p_category: payload.category || null,
        p_source: 'community',
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
            source,
            products!inner(url)
          `)
          .eq('products.url', msg.payload.url)
          .order('valid_from', { ascending: true });

      if (error) throw error;

      const mappedData = data.map((item: any) => ({
        price: item.price / 100,
        oldPrice: item.regular_price ? item.regular_price / 100 : null,
        promoName: item.promo_name,
        date: item.valid_from,
        source: item.source ?? 'community',
      }));

      return { success: true, data: mappedData };
    } catch (error: any) {
      logger.error('Failed to fetch history', { error, url: msg?.payload?.url });
      return { success: false, error: getErrorMessage(error), code: 'SUPABASE_HISTORY_FAILED', data: [] };
    }
  }

  async function handleSaveAlert(msg: SaveAlertMessage) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false, error: config.error, code: 'SUPABASE_CONFIG_ERROR' };

      const userKey = await getUserKey();
      const { url, targetPrice, channel = 'browser' } = msg.payload;
      const requestedChannel = channel;
      const effectiveChannel = requestedChannel === 'telegram' && !TELEGRAM_ALERTS_ENABLED
        ? 'browser'
        : requestedChannel;

      // Resolve product_id from URL
      const { data: products, error: productError } = await supabase
          .from('products').select('id').eq('url', url).limit(1);
      if (productError) throw productError;
      if (!products || products.length === 0) {
        return { success: false, error: 'Product not found — visit the product page first', code: 'PRODUCT_NOT_FOUND' };
      }

      const { error } = await supabase.from('price_alerts').insert({
        user_key: userKey,
        product_id: products[0].id,
        target_price: Math.round(targetPrice * 100), // UAH → kopecks
        channel: effectiveChannel,
        is_active: true,
      });
      if (error) throw error;
      logger.info('Alert saved', { url, targetPrice, requestedChannel, effectiveChannel });
      return {
        success: true,
        data: {
          requestedChannel,
          effectiveChannel,
          fallbackApplied: requestedChannel !== effectiveChannel,
        },
      };
    } catch (error: any) {
      logger.error('Failed to save alert', { error, url: msg?.payload?.url });
      return { success: false, error: getErrorMessage(error), code: 'ALERT_SAVE_FAILED' };
    }
  }

  async function handleGetAlerts(msg: GetAlertsMessage) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false, error: config.error, code: 'SUPABASE_CONFIG_ERROR', data: [] };

      const userKey = await getUserKey();
      const { url } = msg.payload;

      const { data, error } = await supabase
          .from('price_alerts')
          .select('id, target_price, channel, is_active, created_at, products!inner(url)')
          .eq('products.url', url)
          .eq('user_key', userKey)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: (data ?? []).map((a: any) => ({
          id: a.id,
          targetPrice: a.target_price / 100, // kopecks → UAH
          channel: a.channel,
          createdAt: a.created_at,
        })),
      };
    } catch (error: any) {
      logger.error('Failed to get alerts', { error, url: msg?.payload?.url });
      return { success: false, error: getErrorMessage(error), code: 'ALERT_FETCH_FAILED', data: [] };
    }
  }

  async function handleDeleteAlert(msg: DeleteAlertMessage) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false, error: config.error, code: 'SUPABASE_CONFIG_ERROR' };

      const userKey = await getUserKey();
      const { error } = await supabase
          .from('price_alerts')
          .update({ is_active: false })
          .eq('id', msg.payload.alertId)
          .eq('user_key', userKey);

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete alert', { error, alertId: msg?.payload?.alertId });
      return { success: false, error: getErrorMessage(error), code: 'ALERT_DELETE_FAILED' };
    }
  }

  async function handleTrackEvent(msg: TrackEventMessage) {
    try {
      const config = validateSupabaseConfig();
      if (!config.ok) return { success: false };

      const { error } = await supabase.from('audit_events').insert({
        event_type: msg.payload.event,
        payload: msg.payload.data ?? {},
      });
      if (error) throw error;
      return { success: true };
    } catch {
      // telemetry errors are silent — never block the main flow
      return { success: false };
    }
  }

  async function handleSetConsent(msg: SetConsentMessage) {
    try {
      await browser.storage.local.set({ [CONSENT_STORAGE_KEY]: msg.payload.affiliateEnabled });
      logger.info('Affiliate consent updated', { affiliateEnabled: msg.payload.affiliateEnabled });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set consent', { error });
      return { success: false, error: getErrorMessage(error), code: 'CONSENT_SET_FAILED' };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleGetConsent(_msg: GetConsentMessage) {
    try {
      const stored = await browser.storage.local.get(CONSENT_STORAGE_KEY);
      // Default: true (opt-in by default, user can opt-out)
      const affiliateEnabled = stored[CONSENT_STORAGE_KEY] !== false;
      return { success: true, affiliateEnabled };
    } catch (error: any) {
      logger.error('Failed to get consent', { error });
      return { success: false, error: getErrorMessage(error), code: 'CONSENT_FETCH_FAILED', affiliateEnabled: true };
    }
  }

  async function handleCheckBaseline(msg: CheckBaselineMessage) {
    try {
      if (!BASELINE_API_URL) {
        return { success: false, code: 'BASELINE_DISABLED', reason: 'VITE_BASELINE_API_URL is not configured' };
      }

      const requestBody = {
        url: msg.payload.url,
        store: msg.payload.store,
        externalId: msg.payload.externalId,
      };

      const response = await fetch(BASELINE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        return { success: false, code: 'BASELINE_HTTP_ERROR', status: response.status };
      }

      const payload = await response.json() as {
        baselinePrice?: number;
        currency?: string;
        sampleSize?: number;
      };

      if (!payload?.baselinePrice || payload.baselinePrice <= 0) {
        return { success: false, code: 'BASELINE_EMPTY' };
      }

      const currentPrice = msg.payload.currentPrice;
      const baselinePrice = payload.baselinePrice;
      const deltaPct = baselinePrice > 0 ? (currentPrice - baselinePrice) / baselinePrice : 0;
      const isSuspicious = Math.abs(deltaPct) >= 0.08;

      return {
        success: true,
        data: {
          baselinePrice,
          currentPrice,
          deltaPct: Math.round(deltaPct * 1000) / 1000,
          isSuspicious,
          currency: payload.currency ?? 'UAH',
          sampleSize: payload.sampleSize ?? null,
        },
      };
    } catch (error: any) {
      logger.warn('Baseline check failed', {
        error: getErrorMessage(error),
        url: msg.payload.url,
        store: msg.payload.store,
      });
      return { success: false, code: 'BASELINE_ERROR', error: getErrorMessage(error) };
    }
  }

  async function handleSetIcon(msg: SetIconMessage, sender: any) {
    const status = msg.payload.status;
    const tabId = sender?.tab?.id;

    if (tabId) {
      try {
        const iconPath = ICON_PATHS[status] || ICON_PATHS.inactive;

        // Передаємо об'єкт розмірів без початкового слеша для кросбраузерності
        await browser.action.setIcon({
          path: {
            "16": iconPath,
            "48": iconPath,
            "128": iconPath
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

