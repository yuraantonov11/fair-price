import React, { useState, useEffect, useRef } from 'react';
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
  honesty: { score: number; message: string; };
}

// Хелпери
function scoreColor(score: number) {
  if (score < 40) return { text: 'text-rose-500', stroke: '#f43f5e', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
  if (score < 70) return { text: 'text-amber-500', stroke: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  return { text: 'text-emerald-500', stroke: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
}

// Круговий індикатор чесності
const ScoreRing = ({ score }: { score: number }) => {
  const colors = scoreColor(score);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const label = score < 40 ? 'Підозрілий' : score < 70 ? 'Сумнівний' : 'Чесний';
  const emoji  = score < 40 ? '🚨' : score < 70 ? '⚠️' : '✅';

  return (
      <div className="flex items-center gap-3">
        <div className="relative w-[72px] h-[72px] shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" className="stroke-white/5" strokeWidth="6" />
            <circle
                cx="36" cy="36" r={r} fill="none"
                stroke={colors.stroke} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${filled} ${circ}`}
                className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-base font-black ${colors.text}`}>{score}%</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Аналіз чесності</span>
            <span className="text-xs">{emoji}</span>
          </div>
          <span className={`text-sm font-extrabold ${colors.text}`}>{label}</span>
        </div>
      </div>
  );
};

// Стан збору даних
const CollectingCard = ({ count, message }: { count: number; message: string }) => (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col gap-4 shadow-xl font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Починаємо моніторинг</span>
        </div>
        <span className="text-xs text-emerald-400 font-black px-2 py-1 bg-emerald-400/10 rounded-md">{count} / 3 записи</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${Math.min((count / 3) * 100, 100)}%` }}
          />
        </div>
        <p className="text-sm text-slate-300 leading-relaxed mt-1">
          Першу ціну зафіксовано! 🕵️‍♂️ Щоб показати точний графік та перевірити чесність знижки, нам потрібно зібрати трохи більше історії.
        </p>
      </div>
    </div>
);

// Головний компонент
export const PriceChart = ({ data, honesty }: PriceChartProps) => {
  // Використовуємо власне вимірювання ширини замість ResponsiveContainer
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // ResizeObserver безпечно працює всередині Shadow DOM
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
      .sort((a, b) => a.timestamp - b.timestamp);

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
  const colors = scoreColor(honesty.score);

  return (
      <div className="flex flex-col gap-3 bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-white/5 p-4 shadow-xl font-sans">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">FairPrice</span>
            <span className="text-xs text-slate-400 font-medium">Історія цін · {chartData.length} записів</span>
          </div>
        </div>

        <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.border} border text-xs text-slate-300 font-medium leading-relaxed`}>
          {honesty.message}
        </div>

        {/* Безпечний контейнер для графіка */}
        <div className="w-full h-[180px] mt-2 relative" ref={containerRef}>
          {chartWidth > 0 && (
              <AreaChart width={chartWidth} height={180} data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dateStr" stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(148,163,184,0.3)" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip isAnimationActive={false} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#10b981' }} />
                <Area isAnimationActive={false} type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2.5} fill="url(#gradPrice)" />
              </AreaChart>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-400 font-medium">Ціна зі знижкою</span>
            </div>
          </div>
          {honesty.score !== -1 && <ScoreRing score={honesty.score} />}
        </div>
      </div>
  );
};