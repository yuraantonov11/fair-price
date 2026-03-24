import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type PriceHistory = {
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
  date: number;
};

export const PriceChart = ({ data }: { data: PriceHistory[] }) => {
  if (!data || data.length === 0) {
    return <div className="text-center text-slate-400 p-4">Недостатньо даних для побудови графіка.</div>;
  }

  const groupedByDay = data.reduce((acc, item) => {
    const dateObj = new Date(item.date);
    const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });

    acc[dateStr] = {
      dateStr,
      fullDate: dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }),
      price: Math.round(item.price),
      oldPrice: item.oldPrice ? Math.round(item.oldPrice) : null,
      promoName: item.promoName,
      timestamp: item.date
    };
    return acc;
  }, {} as Record<string, any>);

  let chartData = Object.values(groupedByDay)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-14);

  if (chartData.length === 1) {
    const today = chartData[0];
    chartData = [{ ...today, dateStr: 'Початок', fullDate: 'Моніторинг розпочато' }, today];
  }

  const prices = chartData.flatMap(d => d.oldPrice ? [d.price, d.oldPrice] : [d.price]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = Math.max((maxPrice - minPrice) * 0.2, 100);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      // Беремо дані з першої лінії
      const item = payload[0].payload;

      return (
          <div className="p-3 bg-slate-900/95 border border-slate-700 rounded-lg text-white shadow-xl z-50 min-w-[150px]">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">{item.fullDate}</p>

            {/* Якщо є назва акції */}
            {item.promoName && (
                <div className="mb-2">
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/30">
                {item.promoName}
              </span>
                </div>
            )}

            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-black text-emerald-400">{item.price} ₴ <span className="text-[10px] font-normal text-slate-400 ml-1">поточна</span></p>
              {/* Якщо є стара ціна (була знижка) */}
              {item.oldPrice && item.oldPrice > item.price && (
                  <p className="text-xs text-slate-400 line-through decoration-rose-500/70">{item.oldPrice} ₴ <span className="text-[10px] font-normal no-underline ml-1">без знижки</span></p>
              )}
            </div>
          </div>
      );
    }
    return null;
  };

  return (
      <div className="flex flex-col w-full h-full">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
            <XAxis dataKey="dateStr" stroke="#94a3b8" fontSize={11} fontWeight={500} tickLine={false} axisLine={false} tickMargin={12} />
            <YAxis domain={[Math.max(0, minPrice - padding), maxPrice + padding]} hide />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }} />

            {/* Лінія старої ціни (сіра, пунктирна) */}
            <Line type="monotone" dataKey="oldPrice" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls />

            {/* Лінія актуальної ціни (зелена) */}
            <Line type="monotone" dataKey="price" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: '#34d399', strokeWidth: 2, stroke: '#1e293b' }} activeDot={{ r: 6, fill: '#10b981', strokeWidth: 0 }} animationDuration={1000} />
          </LineChart>
        </ResponsiveContainer>

        {/* Легенда під графіком */}
        <div className="flex justify-center gap-4 mt-1">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Ціна зі знижкою</span>
          </div>
          <div className="flex items-center gap-1.5 leading-none">
            <span className="w-2 h-2 rounded-full border-2 border-slate-400 border-dashed"></span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Без знижки</span>
          </div>
        </div>
      </div>
  );
};