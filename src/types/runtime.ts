export interface HistoryPoint {
  price: number; // UAH; conversion happens only in background
  oldPrice?: number | null;
  promoName?: string | null;
  date: string | number;
  source: 'community' | 'system';
  lastSeenAt?: string | number;
}

export interface RuntimeFailure {
  success: false;
  code: string;
  error: string;
  retryable: boolean;
  details?: { causeCode?: string; status?: number };
}

export type RuntimeResponse<T = unknown> = { success: true; data?: T } | RuntimeFailure;

export interface ConsentState { affiliateEnabled: boolean; telemetryEnabled: boolean }

export interface HistoryView {
  state: 'loading' | 'ready' | 'empty' | 'error';
  currentPrice?: number;
  error?: RuntimeFailure;
  saveFailed?: boolean;
  onRetry?: () => void;
}
