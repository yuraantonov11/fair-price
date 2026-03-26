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