import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type PriceHistory = {
  price: number;
  date: number;
};

export const PriceChart = ({ data }: { data: PriceHistory[] }) => {
  if (!data || data.length === 0) {
    return <div className="text-center text-slate-400 p-4">Недостатньо даних для побудови графіка.</div>;
  }

  // 1. ГРУПУВАННЯ ПО ДНЯХ (усуває "стовпці" та зайві точки)
  // Ми залишаємо лише одну (останню) ціну для кожного унікального дня
  const groupedByDay = data.reduce((acc, item) => {
    const dateObj = new Date(item.date);
    const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });

    acc[dateStr] = {
      dateStr,
      fullDate: dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }),
      price: Math.round(item.price), // Округлюємо, щоб не було копійок
      timestamp: item.date
    };
    return acc;
  }, {} as Record<string, any>);

  // 2. СОРТУВАННЯ ТА ОБРІЗКА
  let chartData = Object.values(groupedByDay)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-14); // Показуємо динаміку лише за останні 14 унікальних днів

  // 3. UX-ТРЮК: малюємо лінію, навіть якщо є дані лише за сьогодні
  if (chartData.length === 1) {
    const today = chartData[0];
    chartData = [
      { ...today, dateStr: 'Початок', fullDate: 'Моніторинг розпочато' },
      today
    ];
  }

  // 4. ДИНАМІЧНИЙ МАСШТАБ ОСІ Y (щоб лінія не прилипала до країв)
  const prices = chartData.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = Math.max((maxPrice - minPrice) * 0.2, 100);

  // 5. КРАСИВИЙ ТУЛТИП (Підказка)
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
          <div className="p-3 bg-slate-900/95 border border-slate-700 rounded-lg text-white shadow-xl z-50 min-w-32.5">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{item.fullDate}</p>
            <p className="text-sm font-black text-emerald-400">{item.price} ₴</p>
          </div>
      );
    }
    return null;
  };

  return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />

          <XAxis
              dataKey="dateStr"
              stroke="#94a3b8"
              fontSize={11}
              fontWeight={500}
              tickLine={false}
              axisLine={false}
              tickMargin={12}
          />

          <YAxis
              domain={[Math.max(0, minPrice - padding), maxPrice + padding]}
              hide
          />

          <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <Line
              type="monotone"
              dataKey="price"
              stroke="#34d399"
              strokeWidth={3}
              dot={{ r: 4, fill: '#34d399', strokeWidth: 2, stroke: '#1e293b' }}
              activeDot={{ r: 6, fill: '#10b981', strokeWidth: 0 }}
              animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
  );
};