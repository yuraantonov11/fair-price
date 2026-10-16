import { getSupabase } from '@/utils/supabaseClient';
import { createLogger } from '@/utils/logger';
import { runtimeFailure } from '@/utils/runtimeErrors';
import { canonicalProductUrl, validateProduct } from '@/utils/productValidation';
import type { TracedMessage } from '@/types/messages';
import type { HistoryPoint, RuntimeResponse } from '@/types/runtime';

const logger = createLogger('background', { runtime: 'background' });
const historyRequests = new Map<string, Promise<RuntimeResponse<HistoryPoint[]>>>();
const CONSENT_KEY = 'fp_consent_v2';
const ICON_PATHS = {
  success: 'icons/icon_success.png', error: 'icons/icon_error.png',
  inactive: 'icons/icon_inactive.png', 'single-price': 'icons/icon_single-price.png',
} as const;
type Sender = { tab?: { id?: number }; id?: string };

async function consent() {
  const stored = await browser.storage.local.get(CONSENT_KEY);
  const value = stored[CONSENT_KEY];
  const preferences = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { affiliateEnabled: preferences.affiliateEnabled === true, telemetryEnabled: preferences.telemetryEnabled === true };
}

async function loadHistory(url: string): Promise<RuntimeResponse<HistoryPoint[]>> {
  try {
    const { data, error, status } = await getSupabase().from('price_observations')
      .select('price, regular_price, promo_name, observed_at, source, products!inner(url)')
      .eq('products.url', url).eq('source', 'system').eq('is_available', true)
      .gte('observed_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
      .order('observed_at', { ascending: true }).limit(62);
    if (error) throw { ...error, status };
    return { success: true, data: (data ?? []).map(item => ({
      price: item.price / 100,
      oldPrice: item.regular_price == null ? null : item.regular_price / 100,
      promoName: item.promo_name, date: item.observed_at, lastSeenAt: item.observed_at,
      source: 'system' as const,
    })) };
  } catch (error) {
    return runtimeFailure(error, 'SUPABASE_HISTORY_FAILED');
  }
}

export async function handleMessage(message: TracedMessage, sender: Sender = {}): Promise<RuntimeResponse> {
  const payload = 'payload' in message ? message.payload : undefined;
  let url: string | undefined;
  let store: string | undefined;
  try {
    if (payload && typeof payload === 'object' && 'url' in payload && typeof payload.url === 'string') {
      const parsed = new URL(payload.url);
      if (['https:', 'http:'].includes(parsed.protocol)) { url = parsed.origin + parsed.pathname; store = parsed.hostname; }
    }
  } catch { /* Invalid URLs are handled by each request's validator. */ }
  const log = logger.child({ traceId: message.traceId, messageType: message.type, url, store });
  try {
    switch (message.type) {
      case 'SAVE_PRODUCT': {
        const product = validateProduct(message.payload);
        const store = new URL(product.url).hostname;
        const { error, status } = await getSupabase().rpc('record_price', {
          p_store_domain: store, p_external_id: product.externalId || product.url,
          p_url: product.url, p_name: product.name, p_price: product.price,
          p_regular_price: product.regularPrice, p_is_available: product.isAvailable,
          p_promo_name: product.promoName, p_category: product.category ?? null,
          p_source: 'community',
        });
        if (error) throw { ...error, status };
        return { success: true };
      }
      case 'GET_HISTORY': {
        const url = canonicalProductUrl(message.payload.url);
        const key = `${sender.tab?.id ?? 'popup'}:${url}`;
        let request = historyRequests.get(key);
        if (!request) {
          request = loadHistory(url);
          historyRequests.set(key, request);
        }
        try {
          const result = await request;
          if (!result.success) log.warn('History request failed', {
            url, store: new URL(url).hostname, ...result,
          });
          return result;
        } finally {
          if (historyRequests.get(key) === request) historyRequests.delete(key);
        }
      }
      case 'SET_ICON': {
        if (!Object.hasOwn(ICON_PATHS, message.payload.status)) throw new Error('Invalid icon status');
        if (sender.tab?.id !== undefined) {
          await browser.action.setIcon({ tabId: sender.tab.id, path: ICON_PATHS[message.payload.status] });
        }
        return { success: true };
      }
      case 'SAVE_ALERT': case 'GET_ALERTS': case 'DELETE_ALERT':
        return { success: false, code: 'FEATURE_DISABLED', error: 'Price alerts are not available yet', retryable: false };
      case 'SET_CONSENT': {
        const next = { ...await consent() };
        for (const key of ['affiliateEnabled', 'telemetryEnabled'] as const) {
          if (message.payload[key] !== undefined) {
            if (typeof message.payload[key] !== 'boolean') throw new Error('Invalid consent');
            next[key] = message.payload[key];
          }
        }
        await browser.storage.local.set({ [CONSENT_KEY]: next });
        return { success: true, data: next };
      }
      case 'GET_CONSENT': return { success: true, data: await consent() };
      case 'TRACK_EVENT': {
        // Telemetry ingestion is disabled until a rate-limited endpoint is available.
        return { success: false, code: 'FEATURE_DISABLED', error: 'Telemetry is disabled', retryable: false };
      }
      case 'CHECK_BASELINE': {
        const endpoint = import.meta.env.VITE_BASELINE_API_URL;
        if (!endpoint || !(await consent()).telemetryEnabled) {
          return { success: false, code: 'BASELINE_DISABLED', error: 'Baseline check is disabled', retryable: false };
        }
        const url = canonicalProductUrl(message.payload.url);
        if (!Number.isFinite(message.payload.currentPrice) || message.payload.currentPrice <= 0) throw new Error('Invalid current price');
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, store: new URL(url).hostname, externalId: message.payload.externalId }),
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) throw { message: `Baseline HTTP ${response.status}`, status: response.status };
        const payload = await response.json() as { baselinePrice?: number; currency?: string };
        if (!Number.isFinite(payload.baselinePrice) || payload.baselinePrice! <= 0 || (payload.currency && payload.currency !== 'UAH')) {
          throw new Error('Invalid baseline response');
        }
        const deltaPct = (message.payload.currentPrice - payload.baselinePrice!) / payload.baselinePrice!;
        return { success: true, data: { baselinePrice: payload.baselinePrice, deltaPct, isSuspicious: Math.abs(deltaPct) >= .08 } };
      }
      case 'SEND_FEEDBACK': {
        const { type, comment } = message.payload;
        if (!['bug', 'suggestion'].includes(type) || typeof comment !== 'string' || comment.length > 4000) throw new Error('Invalid feedback');
        const url = message.payload.url ? new URL(message.payload.url) : null;
        // Strip query strings and fragments, which can contain account/session data.
        const { error, status } = await getSupabase().rpc('submit_feedback', {
          p_type: type, p_comment: comment, p_url: url && ['https:', 'http:'].includes(url.protocol) ? url.origin + url.pathname : null,
        });
        if (error) throw { ...error, status };
        return { success: true };
      }
      default: return { success: false, code: 'UNKNOWN_MESSAGE', error: 'Unknown message type', retryable: false };
    }
  } catch (error) {
    const result = runtimeFailure(error);
    log.warn('Request failed', result);
    return result;
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((input: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !input || typeof input !== 'object' || !('type' in input)) return false;
    void handleMessage(input as TracedMessage, sender).then(sendResponse);
    return true;
  });
});
