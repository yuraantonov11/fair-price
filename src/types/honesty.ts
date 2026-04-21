export type HonestyState = 'invalid' | 'collecting' | 'single-price' | 'analyzed';
export type PriceTrend = 'rising' | 'falling' | 'stable';

export interface HonestyDetails {
  entryCount: number;
  firstSeenAt?: number;
  lastSeenAt?: number;

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
  score: number; // -1 = no analysis; 0-100: 50=normal, 70+=good deal, 30-=suspicious
  message: string;
  state: HonestyState;
  details?: HonestyDetails;
}

