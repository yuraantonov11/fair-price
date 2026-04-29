import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '@/utils/i18n';
import type { HonestyResult, PriceTrend, HonestyVerdict } from '@/types/honesty';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

type PriceHistory = {
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
  date: string | number;
  source?: 'community' | 'system' | string;
};

interface PriceChartProps {
  data: PriceHistory[];
  honesty: HonestyResult;
  store?: string;
}

const DEFAULT_CHART_LOCALE = 'en-US';

// Хелпери
function scoreColor(score: number) {
  if (score < 35) return { text: 'text-rose-500', stroke: '#f43f5e', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
  if (score < 55) return { text: 'text-amber-400', stroke: '#fbbf24', bg: 'bg-amber-400/10', border: 'border-amber-400/20' };
  return { text: 'text-emerald-400', stroke: '#34d399', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' };
}

function trendKey(trend?: PriceTrend): string {
  if (trend === 'rising') return 'chart.trend.rising';
  if (trend === 'falling') return 'chart.trend.falling';
  return 'chart.trend.stable';
}

function trendIcon(trend?: PriceTrend): string {
  if (trend === 'rising') return '↑';
  if (trend === 'falling') return '↓';
  return '→';
}

function trendCls(trend?: PriceTrend): string {
  if (trend === 'rising') return 'text-rose-400';
  if (trend === 'falling') return 'text-emerald-400';
  return 'text-slate-400';
}

// Reason code chip config
const REASON_CODE_CONFIG: Record<string, { icon: string; className: string }> = {
  SPIKE_14D_DETECTED:      { icon: '🚨', className: 'bg-rose-500/15 border-rose-500/30 text-rose-200' },
  PRICE_NEAR_MIN30:        { icon: '🎯', className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200' },
  HIGH_CATEGORY_VOLATILITY:{ icon: '⚡', className: 'bg-amber-500/15 border-amber-500/30 text-amber-200' },
  INSUFFICIENT_HISTORY:    { icon: 'ℹ️', className: 'bg-slate-500/20 border-slate-500/30 text-slate-300' },
};

const ReasonChips = ({ codes }: { codes: string[] }) => {
  const { t } = useTranslation();
  if (!codes || codes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map(code => {
        const cfg = REASON_CODE_CONFIG[code] ?? { icon: '○', className: 'bg-slate-600/20 border-slate-600/30 text-slate-300' };
        return (
          <span key={code}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold leading-none ${cfg.className}`}>
            <span>{cfg.icon}</span>
            <span>{t(`chart.reasonCodes.${code}`, code)}</span>
          </span>
        );
      })}
    </div>
  );
};

function verdictCls(verdict?: HonestyVerdict): string {
  if (verdict === 'fair')    return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
  if (verdict === 'risky')   return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
  return 'bg-amber-500/10 border-amber-500/20 text-amber-300';
}

const SourceLegend = ({ data }: { data: PriceHistory[] }) => {
  const { t } = useTranslation();
  const counts = data.reduce((acc, d) => {
    const s = d.source ?? 'community';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.source.label')}</span>
      {entries.map(([src, cnt]) => (
        <span key={src}
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${src === 'system' ? 'bg-violet-500/10 border-violet-500/20 text-violet-300' : 'bg-slate-500/10 border-slate-600/20 text-slate-400'}`}>
          {t(`chart.source.${src}`, src)} ({cnt})
        </span>
      ))}
    </div>
  );
};

// Круговий індикатор чесності
const ScoreRing = ({ score }: { score: number }) => {
  const { t } = useTranslation();
  const colors = scoreColor(score);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const labelKey = score < 35 ? 'chart.score.suspicious' : score < 55 ? 'chart.score.normal' : score < 70 ? 'chart.score.decent' : 'chart.score.goodDeal';
  const emoji    = score < 35 ? '🚨' : score < 55 ? 'ℹ️' : score < 70 ? '👍' : '✅';

  return (
      <div className="flex items-center gap-3">
        <div className="relative w-18 h-18 shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" className="stroke-white/5" strokeWidth="6" />
            <circle cx="36" cy="36" r={r} fill="none" stroke={colors.stroke} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${filled} ${circ}`} className="transition-all duration-700 ease-out" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-base font-black ${colors.text}`}>{score}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{t('chart.score.label')}</span>
            <span className="text-xs">{emoji}</span>
          </div>
          <span className={`text-sm font-extrabold ${colors.text}`}>{t(labelKey)}</span>
          <span className="text-[10px] text-slate-500">{t('chart.score.baseline')}</span>
        </div>
      </div>
  );
};

// Стан збору даних
const CollectingCard = ({ count, message }: { count: number; message: string }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3 shadow-xl font-sans">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{t('chart.collecting.title')}</span>
        </div>
        <span className="text-[11px] text-emerald-300 font-black px-2 py-1 bg-emerald-400/10 rounded-md whitespace-nowrap">{t('chart.collecting.counter', { count })}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${Math.min((count / 3) * 100, 100)}%` }} />
        </div>
        <div className="rounded-xl border border-white/8 bg-slate-950/45 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-1">{t('chart.collecting.observationLabel')}</div>
          <p className="text-sm text-slate-200 font-medium leading-snug">{message}</p>
        </div>
      </div>
    </div>
  );
};

// Попередній аналіз з наявними цінами (2 записи)
const PreviewCollectingCard = ({
  count, message, observedPrices, currentPrice,
}: {
  count: number; message: string;
  observedPrices?: Array<{ price: number; date: number }>;
  currentPrice?: number;
}) => {
  const { t } = useTranslation();
  const priceList = observedPrices ?? [];
  const minPrice = priceList.length > 0 ? Math.min(...priceList.map(p => p.price)) : 0;
  const maxPrice = priceList.length > 0 ? Math.max(...priceList.map(p => p.price)) : 0;
  const effectiveCurrentPrice = currentPrice ?? priceList[priceList.length - 1]?.price;
  const currentVsMinPct = minPrice > 0 && effectiveCurrentPrice
    ? Math.round(((effectiveCurrentPrice - minPrice) / minPrice) * 100) : 0;

  let currentPriceMsg = '';
  if (effectiveCurrentPrice != null && minPrice > 0 && maxPrice > 0) {
    if (effectiveCurrentPrice <= minPrice) {
      currentPriceMsg = t('chart.preview.currentAtMin', { price: Math.round(effectiveCurrentPrice) });
    } else if (effectiveCurrentPrice >= maxPrice) {
      currentPriceMsg = t('chart.preview.currentAtMax', { price: Math.round(effectiveCurrentPrice), pct: Math.max(0, currentVsMinPct) });
    } else {
      currentPriceMsg = t('chart.preview.currentBetween', { price: Math.round(effectiveCurrentPrice), pct: Math.max(0, currentVsMinPct) });
    }
  }

  return (
    <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3 shadow-xl font-sans">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{t('chart.preview.title')}</span>
        </div>
        <span className="text-[11px] text-emerald-300 font-black px-2 py-1 bg-emerald-400/10 rounded-md whitespace-nowrap">{t('chart.preview.counter', { count })}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.preview.lowestObserved')}</div>
          <div className="mt-1 text-base font-black text-emerald-400">{minPrice > 0 ? `${Math.round(minPrice)} ₴` : '—'}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.preview.highestObserved')}</div>
          <div className="mt-1 text-base font-black text-amber-400">{maxPrice > 0 ? `${Math.round(maxPrice)} ₴` : '—'}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-slate-950/50 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-1">{t('chart.preview.observationLabel')}</p>
        <p className="text-sm text-slate-100 font-semibold leading-snug">{message}</p>
        {currentPriceMsg && <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{currentPriceMsg}</p>}
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{t('chart.preview.disclaimer')}</p>
      </div>

      {priceList.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-700/80">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.preview.recordedObservations')}</span>
          <div className="flex flex-col gap-1">
            {priceList.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs rounded-lg bg-white/3 px-2.5 py-1.5">
                <span className="text-slate-300">{new Date(p.date).toLocaleDateString(DEFAULT_CHART_LOCALE)}</span>
                <span className="font-black text-slate-100">{Math.round(p.price)} ₴</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${Math.min((count / 3) * 100, 100)}%` }} />
        </div>
      </div>
    </div>
  );
};

const SinglePriceCard = ({
  message, observedPrice, firstSeenAt, daysAtObservedPrice,
}: {
  message: string; observedPrice?: number; firstSeenAt?: number; daysAtObservedPrice?: number;
}) => {
  const { t } = useTranslation();

  const daysLabel = (() => {
    const d = daysAtObservedPrice ?? 0;
    if (d <= 0) return t('chart.singlePrice.lessThanDay');
    if (d === 1) return t('chart.singlePrice.day');
    return t('chart.singlePrice.days', { count: d });
  })();

  const dateLabel = (() => {
    if (!firstSeenAt || !Number.isFinite(firstSeenAt)) return t('chart.singlePrice.datePending');
    return new Date(firstSeenAt).toLocaleDateString(DEFAULT_CHART_LOCALE, { day: '2-digit', month: 'long', year: 'numeric' });
  })();

  return (
    <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col gap-4 shadow-xl font-sans">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-400 animate-pulse" />
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">{t('chart.singlePrice.title')}</span>
        </div>
        <span className="text-xs text-slate-300 font-black px-2 py-1 bg-slate-400/10 rounded-md">{t('chart.singlePrice.counter')}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.singlePrice.observedPrice')}</div>
          <div className="mt-1 text-lg font-black text-white">{observedPrice ? `${Math.round(observedPrice)} ₴` : '—'}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.singlePrice.heldFor')}</div>
          <div className="mt-1 text-lg font-black text-slate-300">{daysLabel}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.singlePrice.firstSeen')}</div>
          <div className="mt-1 text-sm font-bold text-slate-200">{dateLabel}</div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-sm text-slate-200 leading-relaxed">{message}</div>
      <p className="text-xs text-slate-400 leading-relaxed">{t('chart.singlePrice.footer')}</p>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label, chartColor }: any) => {
  const { t } = useTranslation();
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl flex flex-col gap-1 min-w-30 font-sans z-50">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{label}</span>
          <div className="flex flex-col">
            <span className="text-sm font-black" style={{ color: chartColor }}>{data.price} ₴</span>
            {data.oldPrice && (
              <span className="text-xs text-slate-500 line-through font-medium">{t('chart.tooltip.regularPrice')}: {data.oldPrice} ₴</span>
            )}
          </div>
        </div>
    );
  }
  return null;
};

const TestModeBadge = () => (
  <div className="absolute top-2 right-2 z-20 px-2 py-1 rounded-md border border-fuchsia-400/40 bg-fuchsia-500/15 text-[10px] font-extrabold tracking-wider text-fuchsia-200">
    TEST MODE
  </div>
);

export const PriceChart = ({ data, honesty, store }: PriceChartProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const isTestMode = Boolean(honesty.details?.isTestMode);
  const themed = (content: React.ReactNode) => (
    <div className="fair-price-app w-full block" data-store={store}>
      {content}
    </div>
  );
  const withTestBadge = (content: React.ReactNode) => (
    <div className="relative">
      {isTestMode && <TestModeBadge />}
      {content}
    </div>
  );

  // Translate the message from messageKey if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const translatedMessage = String(honesty.messageKey
    ? t(honesty.messageKey, honesty.messageParams as any ?? {})
    : honesty.message);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setChartWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return themed(withTestBadge(<div className="p-4 rounded-2xl bg-slate-900/90 text-slate-400 text-xs text-center">{t('chart.notEnoughData')}</div>));
  }

  const normalizedData = data
      .map(item => ({ ...item, timestamp: new Date(item.date).getTime() }))
      .filter(item => Number.isFinite(item.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

  if (honesty.state === 'single-price' && normalizedData.length >= 1) {
    const observedPoint = normalizedData[0];
    return themed(withTestBadge(
        <SinglePriceCard
            message={translatedMessage}
            observedPrice={honesty.details?.observedPrice ?? observedPoint.price}
            firstSeenAt={honesty.details?.firstSeenAt ?? observedPoint.timestamp}
            daysAtObservedPrice={honesty.details?.daysAtObservedPrice}
        />
    ));
  }

  if (honesty.score === -1 && honesty.state === 'collecting' && normalizedData.length >= 2) {
    return themed(withTestBadge(
        <PreviewCollectingCard
            count={normalizedData.length}
            message={translatedMessage}
            observedPrices={honesty.details?.observedPrices}
            currentPrice={normalizedData[normalizedData.length - 1]?.price}
        />
    ));
  }

  if (honesty.score === -1 && normalizedData.length < 3) {
    return themed(withTestBadge(<CollectingCard count={normalizedData.length} message={translatedMessage} />));
  }

  const groupedByDay = normalizedData.reduce((acc, item) => {
    const dateObj = new Date(item.date);
    if (isNaN(dateObj.getTime())) return acc;
    const dateStr = dateObj.toLocaleDateString(DEFAULT_CHART_LOCALE, { day: '2-digit', month: 'short' });
    acc[dateStr] = {
      dateStr,
      price: Math.round(item.price),
      oldPrice: item.oldPrice ? Math.round(item.oldPrice) : null,
      timestamp: item.timestamp,
    };
    return acc;
  }, {} as Record<string, any>);

  const chartData = Object.values(groupedByDay).sort((a: any, b: any) => a.timestamp - b.timestamp).slice(-14);
  const colors = scoreColor(honesty.score);

  return themed(withTestBadge(
      <div className="flex flex-col gap-3 bg-linear-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-white/5 p-4 shadow-xl font-sans">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{t('chart.fairprice')}</span>
            <span className="text-xs text-slate-400 font-medium">{t('chart.priceHistory', { count: chartData.length })}</span>
          </div>
          <div className="flex items-center gap-2">
            {honesty.verdict && (
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${verdictCls(honesty.verdict)}`}>
                {t(`chart.verdict.${honesty.verdict}`)}
              </span>
            )}
            {honesty.details?.trend && (
              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-white/5 ${trendCls(honesty.details.trend)}`}>
                <span>{trendIcon(honesty.details.trend)}</span>
                <span className="text-[10px]">{t(trendKey(honesty.details.trend))}</span>
              </div>
            )}
          </div>
        </div>

        {honesty.details?.isVolatile && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-medium">
            <span>⚡</span>
            <span>{t('chart.warnings.volatile')}</span>
          </div>
        )}

        {honesty.details?.hasSpike && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-300 font-bold">
            <span>🚨</span>
            <span>{t('chart.warnings.spike')}</span>
          </div>
        )}

        <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.border} border text-xs text-slate-200 font-medium leading-relaxed`}>
          {translatedMessage}
        </div>

        {honesty.reasonCodes && honesty.reasonCodes.length > 0 && (
          <ReasonChips codes={honesty.reasonCodes} />
        )}

        <div className="w-full h-45 mt-1 relative" ref={containerRef}>
          {chartWidth > 0 && (
              <AreaChart width={chartWidth} height={180} data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={colors.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dateStr" stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<CustomTooltip chartColor={colors.stroke} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                <Area isAnimationActive={false} type="monotone" dataKey="price" stroke={colors.stroke} strokeWidth={2.5} fill="url(#gradPrice)" />
              </AreaChart>
          )}
        </div>

        {/* V2 stats row — uses metrics if available, falls back to legacy details */}
        {(honesty.metrics || honesty.details?.min90 != null) && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="flex flex-col items-center rounded-lg bg-white/3 px-2 py-1.5 border border-white/5">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                {honesty.metrics ? t('chart.stats.min30') : t('chart.stats.min90')}
              </span>
              <span className="text-xs font-black text-emerald-400 mt-0.5">
                {Math.round(honesty.metrics?.min30 ?? honesty.details?.min90 ?? 0)} ₴
              </span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-white/5 px-2 py-1.5 border border-white/10">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                {honesty.metrics ? t('chart.stats.median60') : t('chart.stats.median')}
              </span>
              <span className="text-xs font-black text-slate-200 mt-0.5">
                {Math.round(honesty.metrics?.median60 ?? honesty.details?.median90 ?? 0)} ₴
              </span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-white/3 px-2 py-1.5 border border-white/5">
              {honesty.metrics ? (
                <>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.stats.spike')}</span>
                  <span className={`text-xs font-black mt-0.5 ${honesty.metrics.spike14Pct > 0.15 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {honesty.metrics.spike14Pct > 0 ? `+${Math.round(honesty.metrics.spike14Pct * 100)}%` : '—'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{t('chart.stats.max90')}</span>
                  <span className="text-xs font-black text-rose-400 mt-0.5">{Math.round(honesty.details?.max90 ?? 0)} ₴</span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded-full" style={{ backgroundColor: colors.stroke }} />
              <span className="text-[10px] text-slate-400 font-medium">{t('chart.priceTrend')}</span>
            </div>
            <SourceLegend data={data} />
          </div>
          {honesty.score !== -1 && <ScoreRing score={honesty.score} />}
        </div>
      </div>
  ));
};

