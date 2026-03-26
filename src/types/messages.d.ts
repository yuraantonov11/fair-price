import { ProductData } from './index';

export interface SaveProductMessage {
    type: 'SAVE_PRODUCT';
    payload: ProductData;
}

export interface GetHistoryMessage {
    type: 'GET_HISTORY';
    payload: { url: string };
}

export type ExtensionMessage = SaveProductMessage | GetHistoryMessage;