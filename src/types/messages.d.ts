import { ProductData } from './index';

export interface SaveProductMessage {
    type: 'SAVE_PRODUCT';
    payload: ProductData;
}

export interface GetHistoryMessage {
    type: 'GET_HISTORY';
    payload: {
        url: string;
        sku?: string; // Можна шукати і за SKU, якщо захочемо в майбутньому
    };
}

export type ExtensionMessage = SaveProductMessage | GetHistoryMessage;