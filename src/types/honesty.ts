export type HonestyState = 'invalid' | 'collecting' | 'single-price' | 'analyzed';
export type PriceTrend = 'rising' | 'falling' | 'stable';
export type HonestyVerdict = 'fair' | 'warning' | 'risky';

export interface HistoryConfidence {
  level: 'low' | 'medium' | 'high';
  confirmedDays: number;
  spanDays: number;
  coverage: number;
  lastConfirmedAt?: number;
  stale: boolean;
}

export interface HonestyMessageParams {
  max?: number;
  pct?: number;
}

export interface HonestyMetrics {
  median60: number;
  min30: number;
  spike14Pct: number;
  /** @deprecated Economic value has no promotion/volatility penalties. Always zero. */
  penalty: number;
}

export interface HonestyDetails {
  entryCount: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
  isTestMode?: boolean;

  // collecting / single-price
  observedPrice?: number;
  daysAtObservedPrice?: number;
  observedPrices?: Array<{ price: number; date: number }>;

  // analyzed — V2 fields
  min30?: number;
  median60?: number;
  priceVsMedianPct?: number; // negative = cheaper than median (good)
  trend?: PriceTrend;
  isVolatile?: boolean; // stddev/median > 25%
  hasSpike?: boolean; // possible increase before an advertised discount

  // analyzed — legacy (kept for backward compat)
  /** @deprecated use median60 */
  min90?: number;
  /** @deprecated use median60 */
  max90?: number;
  /** @deprecated use median60 */
  median90?: number;
}

export interface HonestyResult {
  confidence?: HistoryConfidence;
  discount?: { status: 'not-advertised' | 'insufficient-data' | 'no-suspicious-pattern' | 'suspicious-pattern' };
  score: number;
  /** Translation key from calculator namespace */
  messageKey: string;
  /** Optional interpolation params for the translation key */
  messageParams?: HonestyMessageParams;
  /** @deprecated use messageKey + messageParams, kept for backward compat during migration */
  message: string;
  state: HonestyState;
  details?: HonestyDetails;
  // V2 fields
  verdict?: HonestyVerdict;
  reasonCodes?: string[];
  metrics?: HonestyMetrics;
}
