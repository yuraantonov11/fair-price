import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface PricePoint {
    price: number;
    oldPrice?: number | null;
    date: number;
}

export const PriceChart = ({ history }: { history: PricePoint[] }) => {
    if (!history || history.length === 0) return (
        <div className="flex items-center justify-center h-48 w-full mt-6 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-sm text-slate-400 font-medium">Збираємо перші дані...</p>
        </div>
    );

    // Форматуємо дані
    let data = [...history]
        .sort((a, b) => a.date - b.date)
        .map(item => ({
            dateStr: new Date(item.date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }),
            fullDate: new Date(item.date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }),
            price: item.price,
            oldPrice: item.oldPrice || item.price
        }));

    // UX-Трюк: Якщо є лише 1 точка запису, додаємо фейкову "вчорашню", щоб намалювати лінію
    if (data.length === 1) {
        const today = data[0];
        data = [
            { ...today, dateStr: 'Початок', fullDate: 'Моніторинг розпочато' },
            today
        ];
    }

    return (
        <div className="h-52 w-full mt-6 flex flex-col">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

                    {/* Вісь X з датами */}
                    <XAxis
                        dataKey="dateStr"
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={12}
                        minTickGap={20}
                    />

                    <YAxis domain={['dataMin - 300', 'dataMax + 300']} hide />

                    {/* Тултип (спливаюче вікно при наведенні) */}
                    <Tooltip
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const item = payload[0].payload;
                                return (
                                    <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 font-sans z-50">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{item.fullDate}</p>
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-sky-500">Актуальна: {item.price} ₴</p>
                                            {item.oldPrice > item.price && (
                                                <p className="text-xs text-slate-400 line-through">Була без знижки: {item.oldPrice} ₴</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />

                    {/* Лінія ціни без знижки (сіра пунктирна) */}
                    <Line
                        type="monotone"
                        dataKey="oldPrice"
                        stroke="#cbd5e1"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        activeDot={false}
                    />

                    {/* Лінія актуальної ціни (блакитна) */}
                    <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#0ea5e9', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, fill: '#0284c7', strokeWidth: 0 }}
                        animationDuration={1500}
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Легенда */}
            <div className="flex justify-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 leading-none">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                    <span className="text-[11px] text-slate-500 font-medium">Поточна ціна</span>
                </div>
                <div className="flex items-center gap-1.5 leading-none">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 border-dashed"></span>
                    <span className="text-[11px] text-slate-500 font-medium">Ціна без знижки</span>
                </div>
            </div>
        </div>
    );
};