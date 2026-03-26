export { ProductData } from '../adapters/IPriceAdapter';

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