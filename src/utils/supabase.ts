// src/utils/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { ProductData } from '@/adapters/IPriceAdapter';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveProductsBatch(domain: string, products: ProductData[]) {
    // Викликаємо RPC для кожного знайденого товару
    const promises = products.map(p =>
        supabase.rpc('record_price', {
            p_store_domain: domain,
            p_external_id: p.externalId,
            p_url: p.url,
            p_name: p.name,
            p_price: p.price,
            p_regular_price: p.regularPrice,
            p_is_available: p.isAvailable
        })
    );

    await Promise.allSettled(promises);
}