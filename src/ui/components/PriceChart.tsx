import React, { useState, useEffect, useRef } from 'react';
import type { HonestyResult, PriceTrend } from '@/types/honesty';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

type PriceHistory = {
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
  date: string | number;
};

interface PriceChartProps {
  data: PriceHistory[];
  honesty: HonestyResult;
}

function formatObservedDuration(days: number) {
  if (days <= 0) return 'менше доби';
  if (days === 1) return '1 день';
  if (days >= 2 && days <= 4) return `${days} дні`;
  return `${days} днів`;
}

function formatObservedDate(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return 'дата ще уточнюється';
  return new Date(timestamp).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// Хелпери
function scoreColor(score: number) {
  // 50 = normal (amber), 70+ = good (emerald), 30- = bad (rose)
  if (score < 35) return { text: 'text-rose-500', stroke: '#f43f5e', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
  if (score < 55) return { text: 'text-amber-400', stroke: '#fbbf24', bg: 'bg-amber-400/10', border: 'border-amber-400/20' };
  return { text: 'text-emerald-400', stroke: '#34d399', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' };
}

function trendIcon(trend?: PriceTrend) {
  if (trend === 'rising')  return { icon: '↑', label: 'Зростає', cls: 'text-rose-400' };
  if (trend === 'falling') return { icon: '↓', label: 'Знижується', cls: 'text-emerald-400' };
  return { icon: '→', label: 'Стабільна', cls: 'text-slate-400' };
}

// Круговий індикатор чесності
const ScoreRing = ({ score, compact = false }: { score: number; compact?: boolean }) => {
  const colors = scoreColor(score);
  const r = compact ? 20 : 28;
  const size = compact ? 52 : 72;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  // 50 = neutral, 70+ = good, 30- = bad
  const label = score < 35 ? 'Підозріла' : score < 55 ? 'Нормальна' : score < 70 ? 'Непогана' : 'Вигідна';
  const emoji  = score < 35 ? '🚨' : score < 55 ? 'ℹ️' : score < 70 ? '👍' : '✅';

  return (
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-white/5" strokeWidth={compact ? 5 : 6} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={colors.stroke} strokeWidth={compact ? 5 : 6} strokeLinecap="round"
                strokeDasharray={`${filled} ${circ}`}
                className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`${compact ? 'text-sm' : 'text-base'} font-black ${colors.text}`}>{score}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Індекс чесності</span>
            <span className="text-[11px]">{emoji}</span>
          </div>
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold ${colors.text}`}>{label}</span>
          {!compact && <span className="text-[10px] text-slate-500">50 = норма · 70+ = знижка</span>}
        </div>
      </div>
  );
};

// Стан збору даних
const CollectingCard = ({ count, message }: { count: number; message: string }) => (
    <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-3 flex flex-col gap-2 shadow-xl font-sans">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Починаємо моніторинг</span>
        </div>
        <span className="text-[10px] text-emerald-300 font-black px-2 py-0.5 bg-emerald-400/10 rounded-md whitespace-nowrap">{count} / 3</span>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
            className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
            style={{ width: `${Math.min((count / 3) * 100, 100)}%` }}
        />
      </div>
      <p className="text-xs text-slate-200 leading-snug">{message}</p>
    </div>
);

// Попередній аналіз з наявними цінами (2 записи)
const PreviewCollectingCard = ({
  count,
  message,
  observedPrices,
  currentPrice,
}: {
  count: number;
  message: string;
  observedPrices?: Array<{ price: number; date: number }>;
  currentPrice?: number;
}) => {
  const priceList = observedPrices ?? [];
  const minPrice = priceList.length > 0 ? Math.min(...priceList.map(p => p.price)) : 0;
  const maxPrice = priceList.length > 0 ? Math.max(...priceList.map(p => p.price)) : 0;
  const effectiveCurrentPrice = currentPrice ?? priceList[priceList.length - 1]?.price;
  const currentVsMinPct = minPrice > 0 && effectiveCurrentPrice
    ? Math.round(((effectiveCurrentPrice - minPrice) / minPrice) * 100)
    : 0;

  return (
    <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-3 flex flex-col gap-2 shadow-xl font-sans">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Попередній аналіз</span>
        </div>
        <span className="text-[10px] text-emerald-300 font-black px-2 py-0.5 bg-emerald-400/10 rounded-md whitespace-nowrap">{count} / 3</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Мін (за спост.)</div>
          <div className="mt-0.5 text-sm font-black text-emerald-400">{minPrice > 0 ? `${Math.round(minPrice)} ₴` : '—'}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Макс (за спост.)</div>
          <div className="mt-0.5 text-sm font-black text-amber-400">{maxPrice > 0 ? `${Math.round(maxPrice)} ₴` : '—'}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Поточна ціна</div>
          <div className="mt-0.5 text-sm font-black text-blue-300">{effectiveCurrentPrice ? `${Math.round(effectiveCurrentPrice)} ₴` : '—'}</div>
        </div>
      </div>

      <div className="rounded-lg border border-white/8 bg-slate-950/50 px-2.5 py-2">
        <p className="text-xs text-slate-100 font-semibold leading-snug">{message}</p>
        {effectiveCurrentPrice != null && maxPrice > 0 && (
          <p className="text-[11px] text-slate-200 mt-1 leading-relaxed">
            {effectiveCurrentPrice >= maxPrice
              ? `Зараз ціна на верхній межі зібраного діапазону: ${Math.round(effectiveCurrentPrice)} ₴ (+${Math.max(0, currentVsMinPct)}% до мінімуму).`
              : `Зараз ціна нижча за максимум зібраних спостережень: ${Math.round(effectiveCurrentPrice)} ₴.`}
          </p>
        )}
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          Попередній висновок лише за наявними спостереженнями (не за всю історію).
        </p>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
            className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
            style={{ width: `${Math.min((count / 3) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
};

const SinglePriceCard = ({
  message,
  observedPrice,
  firstSeenAt,
  daysAtObservedPrice,
}: {
  message: string;
  observedPrice?: number;
  firstSeenAt?: number;
  daysAtObservedPrice?: number;
}) => (
    <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-3 flex flex-col gap-2 shadow-xl font-sans">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Є перша підтверджена ціна</span>
        </div>
        <span className="text-[10px] text-sky-300 font-black px-2 py-0.5 bg-sky-400/10 rounded-md">1 запис</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Зафіксована ціна</div>
          <div className="mt-0.5 text-base font-black text-white">{observedPrice ? `${Math.round(observedPrice)} ₴` : '—'}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Тримається вже</div>
          <div className="mt-0.5 text-base font-black text-sky-300">{formatObservedDuration(daysAtObservedPrice ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Вперше побачили</div>
          <div className="mt-0.5 text-[11px] font-bold text-slate-200">{formatObservedDate(firstSeenAt)}</div>
        </div>
      </div>

      <div className="px-2.5 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs text-slate-200 leading-relaxed">
        {message}
      </div>
    </div>
);

const CustomTooltip = ({ active, payload, label, chartColor }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl flex flex-col gap-1 min-w-30 font-sans z-50">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{label}</span>
          <div className="flex flex-col">
          <span className="text-sm font-black" style={{ color: chartColor }}>
            {data.price} ₴
          </span>
            {data.oldPrice && (
                <span className="text-xs text-slate-500 line-through font-medium">
              Без знижки: {data.oldPrice} ₴
            </span>
            )}
          </div>
        </div>
    );
  }
  return null;
};


export const PriceChart = ({ data, honesty }: PriceChartProps) => {
  const CHART_HEIGHT = 136;
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return <div className="p-4 rounded-2xl bg-slate-900/90 text-slate-400 text-xs text-center">Недостатньо даних.</div>;
  }

  const normalizedData = data
      .map(item => ({ ...item, timestamp: new Date(item.date).getTime() }))
      .filter(item => Number.isFinite(item.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

  if (honesty.state === 'single-price' && normalizedData.length >= 1) {
    const observedPoint = normalizedData[0];

    return (
        <SinglePriceCard
            message={honesty.message}
            observedPrice={honesty.details?.observedPrice ?? observedPoint.price}
            firstSeenAt={honesty.details?.firstSeenAt ?? observedPoint.timestamp}
            daysAtObservedPrice={honesty.details?.daysAtObservedPrice}
        />
    );
  }

  if (honesty.score === -1 && honesty.state === 'collecting' && normalizedData.length >= 2) {
    return (
        <PreviewCollectingCard
            count={normalizedData.length}
            message={honesty.message}
            observedPrices={honesty.details?.observedPrices}
            currentPrice={normalizedData[normalizedData.length - 1]?.price}
        />
    );
  }

  if (honesty.score === -1 && normalizedData.length < 3) {
    return <CollectingCard count={normalizedData.length} message={honesty.message} />;
  }

  const groupedByDay = normalizedData.reduce((acc, item) => {
    const dateObj = new Date(item.date);
    if (isNaN(dateObj.getTime())) return acc;
    const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
    acc[dateStr] = {
      dateStr,
      price: Math.round(item.price),
      oldPrice: item.oldPrice ? Math.round(item.oldPrice) : null,
      timestamp: item.timestamp,
    };
    return acc;
  }, {} as Record<string, any>);

  const chartData = Object.values(groupedByDay).sort((a: any, b: any) => a.timestamp - b.timestamp).slice(-14);

  // Отримуємо кольори на основі оцінки
  const colors = scoreColor(honesty.score);

  return (
      <div className="flex flex-col gap-2 bg-linear-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-white/5 p-3 shadow-xl font-sans">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">FairPrice</span>
            <span className="text-[11px] text-slate-400 font-medium">Історія цін · {chartData.length} записів</span>
          </div>
          {/* Trend badge */}
          {honesty.details?.trend && (() => {
            const t = trendIcon(honesty.details?.trend);
            return (
              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-white/5 ${t.cls}`}>
                <span>{t.icon}</span>
                <span className="text-[10px]">{t.label}</span>
              </div>
            );
          })()}
        </div>

        {/* Volatility warning */}
        {honesty.details?.isVolatile && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-medium">
            <span>⚡</span>
            <span>Ціна цього товару природно волатильна — оцінюйте обережно</span>
          </div>
        )}

        {/* Spike warning */}
        {honesty.details?.hasSpike && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-300 font-bold">
            <span>🚨</span>
            <span>Виявлено штучне підняття ціни перед "знижкою"</span>
          </div>
        )}

        <div className={`px-2.5 py-2 rounded-lg ${colors.bg} ${colors.border} border text-[11px] text-slate-200 font-medium leading-relaxed`}>
          {honesty.message}
        </div>

        {/* Безпечний контейнер для графіка */}
        <div className="w-full relative" style={{ height: CHART_HEIGHT }} ref={containerRef}>
          {chartWidth > 0 && (
              <AreaChart width={chartWidth} height={CHART_HEIGHT} data={chartData} margin={{ top: 4, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={colors.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dateStr" stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                    content={<CustomTooltip chartColor={colors.stroke} />}
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                />
                <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="price"
                    stroke={colors.stroke}
                    strokeWidth={2.5}
                    fill="url(#gradPrice)"
                />
              </AreaChart>
          )}
        </div>

        {/* Stats bar: min / median / max */}
        {(honesty.details?.min90 != null) && (
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex flex-col items-center rounded-md bg-white/3 px-1.5 py-1.5 border border-white/5">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Мін · 90д</span>
              <span className="text-xs font-black text-emerald-400 mt-0.5">{Math.round(honesty.details.min90!)} ₴</span>
            </div>
            <div className="flex flex-col items-center rounded-md bg-white/5 px-1.5 py-1.5 border border-white/10">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Медіана</span>
              <span className="text-xs font-black text-slate-200 mt-0.5">{honesty.details.median90} ₴</span>
            </div>
            <div className="flex flex-col items-center rounded-md bg-white/3 px-1.5 py-1.5 border border-white/5">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Макс · 90д</span>
              <span className="text-xs font-black text-rose-400 mt-0.5">{Math.round(honesty.details.max90!)} ₴</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/5 pt-2">
          <span className="text-[10px] text-slate-400">
            {honesty.details?.priceVsMedianPct != null
              ? `До медіани: ${honesty.details.priceVsMedianPct > 0 ? '+' : ''}${honesty.details.priceVsMedianPct}%`
              : 'Оцінка сформована за історією'}
          </span>
          {honesty.score !== -1 && <ScoreRing score={honesty.score} compact={true} />}
        </div>
      </div>
  );
};
