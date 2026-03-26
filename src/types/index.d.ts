export interface ProductData {
    url: string;
    title: string;
    currentPrice: number;
    oldPrice: number | null;
    store: 'rozetka' | 'dnipro-m';
}

export interface HistoryRecord {
    price: number;
    old_price: number | null;
    created_at: string;
}

export interface HonestyScore {
    score: number;
    status: 'honest' | 'suspicious' | 'scam';
    message: string;
}