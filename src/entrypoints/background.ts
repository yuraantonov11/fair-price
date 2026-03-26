import { supabase } from '@/utils/supabaseClient';
import { SaveProductMessage, GetHistoryMessage } from '@/types/messages';

export default defineBackground(() => {
  console.log('[FairPrice] Background Service Worker запущено.');

  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (message.type === 'SAVE_PRODUCT') {
      handleSaveProduct(message as SaveProductMessage).then(sendResponse);
      return true; // Дозволяє асинхронну відповідь
    }

    if (message.type === 'GET_HISTORY') {
      handleGetHistory(message as GetHistoryMessage).then(sendResponse);
      return true;
    }
  });

  async function handleSaveProduct(msg: SaveProductMessage) {
    try {
      const { payload } = msg;

      // Визначаємо чистий домен для бази даних
      // Пріоритет: payload.storeDomain (якщо передано), інакше мапимо за payload.store
      const storeDomain = payload.storeDomain ||
          (payload.store === 'rozetka' ? 'rozetka.com.ua' : 'dnipro-m.ua');

      // Викликаємо оновлену RPC-функцію в Supabase
      const { error } = await supabase.rpc('record_price', {
        p_store_domain: storeDomain,
        p_external_id: payload.sku || payload.url, // Використовуємо SKU як унікальний ID
        p_url: payload.url,
        p_name: payload.title,
        p_price: Math.round(payload.currentPrice),    // Очікуємо копійки від адаптера
        p_regular_price: payload.oldPrice ? Math.round(payload.oldPrice) : null,
        p_is_available: true,
        p_promo_name: payload.promoName || null       // ПЕРЕДАЄМО НАЗВУ АКЦІЇ
      });

      if (error) {
        console.error('[FairPrice] Supabase RPC Error:', error.message);
        throw error;
      }

      return { success: true };
    } catch (error: any) {
      console.error('[FairPrice] Помилка збереження:', error);
      return { success: false, error: error.message };
    }
  }

  async function handleGetHistory(msg: GetHistoryMessage) {
    try {
      // Отримуємо історію цін, роблячи Join з таблицею products за URL
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

      // Конвертуємо копійки назад у гривні для коректного відображення на графіку
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
});