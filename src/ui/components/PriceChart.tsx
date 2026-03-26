import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type PriceHistory = {
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
  date: string | number; // Дозволяємо і рядок (ISO), і число (Timestamp)
};

interface PriceChartProps {
  data: PriceHistory[];
  honesty: {
    score: number;
    message: string;
  };
}

export const PriceChart = ({ data, honesty }: PriceChartProps) => {
  if (!data || data.length === 0) {
    return (
        <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-xl text-white">
          <p className="text-sm text-slate-400 text-center">
            Недостатньо даних для побудови графіка.
          </p>
        </div>
    );
  }

  // Перетворюємо всі дати в мілісекунди для надійного сортування
  const normalizedData = data.map(item => ({
    ...item,
    timestamp: new Date(item.date).getTime()
  })).sort((a, b) => a.timestamp - b.timestamp);

  const isCollecting = honesty.score === -1;

  // Режим збору даних (коли записів < 3)
  if (isCollecting && normalizedData.length < 3) {
    const currentPrice = normalizedData[normalizedData.length - 1]?.price;
    return (
        <div className="flex flex-col gap-3 p-4 bg-slate-800 rounded-xl text-white">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Чесна Ціна — Моніторинг
            </span>
            <span className="text-[10px] text-slate-500">
              {normalizedData.length} / 3+ записів
            </span>
          </div>

          {currentPrice && (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-400">
                  {currentPrice.toLocaleString('uk-UA')} ₴
                </span>
                <span className="text-xs text-slate-400">поточна ціна</span>
              </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                  className="bg-amber-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min((normalizedData.length / 3) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {honesty.message}
            </p>
          </div>
        </div>
    );
  }

  // Визначаємо колірну схему на основі скорингу
  const getScoreColor = (score: number) => {
    if (score < 40) return 'text-rose-500';
    if (score < 70) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const getScoreBg = (score: number) => {
    if (score < 40) return 'bg-rose-500/10 border-rose-500/20';
    if (score < 70) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-emerald-500/10 border-emerald-500/20';
  };

  // Групування даних по днях для графіка
  const groupedByDay = normalizedData.reduce((acc, item) => {
    const dateObj = new Date(item.date);

    if (isNaN(dateObj.getTime())) return acc;

    const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });

    acc[dateStr] = {
      dateStr,
      fullDate: dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }),
      price: Math.round(item.price),
      oldPrice: item.oldPrice ? Math.round(item.oldPrice) : null,
      promoName: item.promoName,
      timestamp: item.timestamp
    };
    return acc;
  }, {} as Record<string, any>);

  let chartData = Object.values(groupedByDay)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-14);

  // Якщо точка лише одна, додаємо "фіктивну" початкову точку для лінії
  if (chartData.length === 1) {
    const today = chartData[0];
    chartData = [{ ...today, dateStr: 'Початок', fullDate: 'Старт моніторингу' }, today];
  }

  const prices = chartData.flatMap(d => d.oldPrice ? [d.price, d.oldPrice] : [d.price]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.2 || 100;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
          <div className="p-3 bg-slate-900/95 border border-slate-700 rounded-lg text-white shadow-xl z-50">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">{item.fullDate}</p>
            {item.promoName && (
                <div className="mb-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/30">
                    {item.promoName}
                  </span>
                </div>
            )}
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-black text-emerald-400">{item.price} ₴</p>
              {item.oldPrice && item.oldPrice > item.price && (
                  <p className="text-xs text-slate-400 line-through decoration-rose-500/70">{item.oldPrice} ₴</p>
              )}
            </div>
          </div>
      );
    }
    return null;
  };

  return (
      <div className="flex flex-col w-full gap-4 p-4 bg-slate-800 rounded-xl">
        {/* Блок рейтингу */}
        <div className={`p-3 rounded-lg border ${getScoreBg(honesty.score)} flex flex-col gap-1`}>
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Аналіз чесності
            </span>
            <span className={`text-xl font-black ${getScoreColor(honesty.score)}`}>
              {honesty.score === -1 ? '...' : `${honesty.score}%`}
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-300 leading-relaxed">
            {honesty.message}
          </p>
        </div>

        {/* Графік — додаємо inline-style для Shadow DOM */}
        <div style={{ width: '100%', height: '180px', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
              <XAxis
                  dataKey="dateStr"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
              />
              {/* Додаємо перевірку, щоб не було NaN */}
              <YAxis domain={[Math.max(0, (minPrice || 0) - (padding || 0)), (maxPrice || 0) + (padding || 0)]} hide />
              <Tooltip content={<CustomTooltip />} />
              <Line
                  type="monotone"
                  dataKey="oldPrice"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={true}
              />
              <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#34d399"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#34d399', strokeWidth: 2, stroke: '#1e293b' }}
                  connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-center gap-4 border-t border-slate-700 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Ціна зі знижкою</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-slate-400 border-dashed"></span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Без знижки</span>
          </div>
        </div>
      </div>
  );
};