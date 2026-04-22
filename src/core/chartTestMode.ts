export type ChartTestScenario = 'flat' | 'discount' | 'spike' | 'volatile' | 'rising';

type HistoryPoint = {
  price: number;
  oldPrice: number | null;
  promoName: string | null;
  date: number;
};

export type ChartTestModeResult = {
  enabled: boolean;
  source?: string;
  recordCount?: number;
  scenario?: ChartTestScenario;
  currentPrice?: number;
  history?: HistoryPoint[];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parsePositiveInt(input: string | null): number | undefined {
  if (!input) return undefined;
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePositiveNumber(input: string | null): number | undefined {
  if (!input) return undefined;
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeScenario(input: string | null): ChartTestScenario {
  const value = (input || '').toLowerCase();
  if (value === 'discount' || value === 'spike' || value === 'volatile' || value === 'rising') return value;
  return 'flat';
}

function generatePriceByScenario(
  scenario: ChartTestScenario,
  index: number,
  count: number,
  basePrice: number,
): number {
  if (count <= 1) return basePrice;

  const progress = index / (count - 1);
  const wave = [0, -0.02, 0.015, -0.01, 0.01][index % 5];

  if (scenario === 'discount') {
    const multiplier = 1.35 - progress * 0.35;
    return Math.round(basePrice * multiplier);
  }

  if (scenario === 'spike') {
    if (index === count - 2) return Math.round(basePrice * 1.45);
    if (index < count - 2) return Math.round(basePrice * 1.1);
    return basePrice;
  }

  if (scenario === 'volatile') {
    const volatileWave = [1.0, 0.9, 1.08, 0.94, 1.13, 0.96][index % 6];
    return Math.round(basePrice * volatileWave);
  }

  if (scenario === 'rising') {
    const multiplier = 0.85 + progress * 0.3;
    return Math.round(basePrice * multiplier);
  }

  return Math.round(basePrice * (1 + wave));
}

function buildSyntheticHistory(recordCount: number, basePrice: number, scenario: ChartTestScenario): HistoryPoint[] {
  if (recordCount <= 0) return [];

  const now = Date.now();
  const items: HistoryPoint[] = [];

  for (let i = 0; i < recordCount; i += 1) {
    const price = generatePriceByScenario(scenario, i, recordCount, basePrice);
    const isLast = i === recordCount - 1;

    items.push({
      price,
      oldPrice: scenario === 'discount' && isLast ? Math.round(price * 1.22) : null,
      promoName: scenario === 'discount' && isLast ? 'Тестова знижка' : null,
      date: now - (recordCount - 1 - i) * ONE_DAY_MS,
    });
  }

  return items;
}

export function resolveChartTestMode(url: string, liveCurrentPrice: number): ChartTestModeResult {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { enabled: false };
  }

  const params = parsedUrl.searchParams;
  const isEnabled = params.get('fp_test') === '1';
  if (!isEnabled) return { enabled: false };

  const requestedRecords = parsePositiveInt(params.get('fp_records')) ?? 3;
  const recordCount = Math.max(0, Math.min(30, requestedRecords));

  const scenario = normalizeScenario(params.get('fp_scenario'));
  const currentPrice = parsePositiveNumber(params.get('fp_price')) ?? liveCurrentPrice;
  const history = buildSyntheticHistory(recordCount, Math.round(currentPrice), scenario);

  return {
    enabled: true,
    source: 'query',
    recordCount,
    scenario,
    currentPrice,
    history,
  };
}

