export type HonestyState = 'invalid' | 'collecting' | 'single-price' | 'analyzed';
export type PriceTrend = 'rising' | 'falling' | 'stable';

export interface HonestyMessageParams {
  max?: number;
  pct?: number;
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

  // analyzed
  min90?: number;
  max90?: number;
  median90?: number;
  priceVsMedianPct?: number; // negative = cheaper than median (good)
  trend?: PriceTrend;
  isVolatile?: boolean; // stddev/median > 25%
  hasSpike?: boolean; // detected artificial inflation
}

export interface HonestyResult {
  score: number;
  /** Translation key from calculator namespace */
  messageKey: string;
  /** Optional interpolation params for the translation key */
  messageParams?: HonestyMessageParams;
  /** @deprecated use messageKey + messageParams, kept for backward compat during migration */
  message: string;
  state: HonestyState;
  details?: HonestyDetails;
}
