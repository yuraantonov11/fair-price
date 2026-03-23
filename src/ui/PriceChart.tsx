import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

type PriceHistory = {
  price: number;
  date: number;
};

// Функція для форматування дати на осі X
const formatDate = (unixTime: number) => {
  return new Date(unixTime).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
  });
};

// Компонент для кастомної підказки при наведенні
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2 bg-slate-900/90 border border-slate-700 rounded-md text-white shadow-lg">
        <p className="label font-bold">{`Дата: ${formatDate(label)}`}</p>
        <p className="intro">{`Ціна: ${payload[0].value} ₴`}</p>
      </div>
    );
  }
  return null;
};

export const PriceChart = ({ data }: { data: PriceHistory[] }) => {
  if (!data || data.length < 2) {
    return <div className="text-center text-slate-400 p-4">Недостатньо даних для побудови графіка.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
        <XAxis
          dataKey="date"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={formatDate}
          stroke="#94a3b8"
          fontSize={12}
        />
        <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `${value} ₴`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line type="monotone" dataKey="price" name="Ціна" stroke="#34d399" strokeWidth={2} dot={{ r: 4, fill: '#34d399' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};