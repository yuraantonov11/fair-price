export interface ProductData {
    url: string;
    title: string;
    sku: string;            // Унікальний ID товару з сайту (для p_external_id)
    currentPrice: number;   // Ціна (у копійках для БД, у гривнях для UI)
    oldPrice: number | null;// Стара ціна
    promoName: string | null; // Назва акції
    store: 'rozetka' | 'dnipro-m';
    storeDomain: string;    // Чистий домен (наприклад, 'rozetka.com.ua')
}

export interface HistoryRecord {
    price: number;
    old_price: number | null;
    promo_name: string | null; // Додано поле для історії
    created_at: string;        // Дата з Supabase (valid_from)
}

export interface HonestyScore {
    score: number;
    message: string;
}