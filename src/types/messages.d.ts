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
export interface SetIconMessage {
    type: 'SET_ICON';
    payload: {
        status: 'success' | 'error' | 'inactive';
    };
}

export type ExtensionMessage = SaveProductMessage | GetHistoryMessage | SetIconMessage;