/**
 * Category-specific volatility thresholds for the V2 Honesty Score algorithm.
 * spikeThresholdPct: minimum relative price jump to classify as a spike.
 * warningBandPct:    CV (stddev/median) threshold above which "high volatility" flag is raised.
 */

export interface CategoryVolatility {
  spikeThresholdPct: number;
  warningBandPct: number;
}

const VOLATILITY_MAP: Record<string, CategoryVolatility> = {
  tools:       { spikeThresholdPct: 0.20, warningBandPct: 0.15 },
  electronics: { spikeThresholdPct: 0.15, warningBandPct: 0.10 },
  fashion:     { spikeThresholdPct: 0.35, warningBandPct: 0.25 },
  fmcg:        { spikeThresholdPct: 0.10, warningBandPct: 0.08 },
  unknown:     { spikeThresholdPct: 0.25, warningBandPct: 0.20 },
};

/** Ukrainian → canonical key mapping */
const UA_CATEGORY_MAP: Record<string, string> = {
  'інструменти':      'tools',
  'електроніка':      'electronics',
  'техніка':          'electronics',
  'побутова техніка': 'electronics',
  'одяг':             'fashion',
  'взуття':           'fashion',
  'мода':             'fashion',
  'продукти':         'fmcg',
  'їжа':              'fmcg',
  'напої':            'fmcg',
  'загальна':         'unknown',
  'general':          'unknown',
};

/**
 * Normalise a raw category string from an adapter to a canonical key,
 * then look up volatility thresholds.  Falls back to 'unknown'.
 */
export function getCategoryVolatility(category: string = 'unknown'): CategoryVolatility {
  const normalised = category.toLowerCase().trim();
  const canonical = UA_CATEGORY_MAP[normalised] ?? (VOLATILITY_MAP[normalised] ? normalised : 'unknown');
  return VOLATILITY_MAP[canonical] ?? VOLATILITY_MAP['unknown'];
}

