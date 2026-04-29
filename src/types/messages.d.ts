import { ProductData } from './index';

export interface SaveProductMessage {
    type: 'SAVE_PRODUCT';
    payload: ProductData;
}

export interface GetHistoryMessage {
    type: 'GET_HISTORY';
    payload: {
        url: string;
        sku?: string;
    };
}
export interface SetIconMessage {
    type: 'SET_ICON';
    payload: {
        status: 'success' | 'error' | 'inactive' | 'single-price';
    };
}

export interface SaveAlertMessage {
    type: 'SAVE_ALERT';
    payload: {
        url: string;
        targetPrice: number; // UAH (will be converted to kopecks in background)
        channel?: 'browser' | 'telegram';
    };
}

export interface GetAlertsMessage {
    type: 'GET_ALERTS';
    payload: { url: string };
}

export interface DeleteAlertMessage {
    type: 'DELETE_ALERT';
    payload: { alertId: string };
}

export interface TrackEventMessage {
    type: 'TRACK_EVENT';
    payload: { event: string; data?: Record<string, unknown> };
}

export interface SetConsentMessage {
    type: 'SET_CONSENT';
    payload: { affiliateEnabled: boolean };
}

export interface GetConsentMessage {
    type: 'GET_CONSENT';
    payload?: Record<string, never>;
}

export interface CheckBaselineMessage {
    type: 'CHECK_BASELINE';
    payload: {
        url: string;
        store: string;
        externalId?: string;
        currentPrice: number; // UAH
    };
}

export type ExtensionMessage =
    | SaveProductMessage
    | GetHistoryMessage
    | SetIconMessage
    | SaveAlertMessage
    | GetAlertsMessage
    | DeleteAlertMessage
    | TrackEventMessage
    | SetConsentMessage
    | GetConsentMessage
    | CheckBaselineMessage;
