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

    // 1. ГРУПУВАННЯ ПО ДНЯХ (усуває "стовпці" та "паркан")
    const groupedByDay = history.reduce((acc, item) => {
        const dateObj = new Date(item.date);
        const dateStr = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });

        // Завжди перезаписуємо, щоб залишилась лише остання (найсвіжіша) ціна за цей день
        acc[dateStr] = {
            dateStr,
            fullDate: dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }),
            price: Math.round(item.price),
            oldPrice: item.oldPrice ? Math.round(item.oldPrice) : Math.round(item.price),
            timestamp: item.date // зберігаємо для правильного сортування
        };
        return acc;
    }, {} as Record<string, any>);

    // 2. ФОРМАТУВАННЯ ТА ОБРІЗКА (лишаємо тільки останні 14 унікальних днів)
    let data = Object.values(groupedByDay)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-14)
        .map(item => {
            let discountText = null;
            if (item.oldPrice > item.price) {
                const percent = Math.round((1 - item.price / item.oldPrice) * 100);
                discountText = `Знижка -${percent}%`;
            }
            return { ...item, discountText };
        });

    // 3. UX-ТРЮК: Якщо моніторинг щойно почався (лише 1 день)
    if (data.length === 1) {
        const today = data[0];
        data = [
            { ...today, dateStr: 'Початок', fullDate: 'Моніторинг розпочато' },
            today
        ];
    }

    // 4. ДИНАМІЧНИЙ МАСШТАБ (щоб лінія виглядала плавною і не прилипала до країв)
    const prices = data.flatMap(d => [d.price, d.oldPrice]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = Math.max((maxPrice - minPrice) * 0.2, 100); // 20% відступ

    return (
        <div className="h-56 w-full mt-6 flex flex-col">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />

                    <XAxis
                        dataKey="dateStr"
                        tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={12}
                        padding={{ left: 10, right: 10 }} // Відступи від країв графіка
                    />

                    <YAxis domain={[Math.max(0, minPrice - padding), maxPrice + padding]} hide />

                    <Tooltip
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const item = payload[0].payload;
                                return (
                                    <div className="bg-white p-3 rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] border border-slate-100 font-sans z-50 min-w-[140px]">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{item.fullDate}</p>
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-sky-600">Актуальна: {item.price} ₴</p>
                                            {item.oldPrice > item.price && (
                                                <p className="text-xs text-slate-400 line-through">Була: {item.oldPrice} ₴</p>
                                            )}
                                        </div>
                                        <div className="mt-2">
                                            {item.discountText ? (
                                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600">
                          {item.discountText}
                        </span>
                                            ) : (
                                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-50 text-slate-400">
                          Без знижки
                        </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />

                    {/* Стара ціна - сіра пунктирна */}
                    <Line
                        type="monotone"
                        dataKey="oldPrice"
                        stroke="#cbd5e1"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={false}
                    />

                    {/* Актуальна ціна - плавна блакитна */}
                    <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: '#0ea5e9' }}
                        activeDot={{ r: 6, fill: '#0ea5e9', strokeWidth: 0, stroke: '#fff' }}
                        animationDuration={1000}
                    />
                </LineChart>
            </ResponsiveContainer>

            <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 leading-none">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                    <span className="text-[11px] text-slate-500 font-medium">Поточна ціна</span>
                </div>
                <div className="flex items-center gap-1.5 leading-none">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 border-dashed"></span>
                    <span className="text-[11px] text-slate-500 font-medium">Без знижки</span>
                </div>
            </div>
        </div>
    );
};