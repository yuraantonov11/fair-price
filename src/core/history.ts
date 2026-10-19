import type { HistoryPoint } from '@/types/runtime';

export const DAY_MS = 86_400_000;
export const utcDay = (time: number) => Math.floor(time / DAY_MS) * DAY_MS;
type Point = { price: number; date: number; source?: string; day?: string };

/** Latest real confirmation per UTC day. Never fill missing days. */
export function confirmedDays<T extends Point>(history: T[], days = 60, now = Date.now()): T[] {
  const first = utcDay(now) - (days - 1) * DAY_MS;
  const byDay = new Map<number, T>();
  for (const point of history) {
    if (!Number.isFinite(point.price) || point.price <= 0 || !Number.isFinite(point.date)
      || point.date < first || point.date > now || (point.source !== undefined && point.source !== 'system')) continue;
    const day = utcDay(point.date);
    if (point.day && point.day !== new Date(day).toISOString().slice(0, 10)) continue;
    const previous = byDay.get(day);
    if (!previous || previous.date <= point.date) byDay.set(day, point);
  }
  return [...byDay.values()].sort((a, b) => a.date - b.date);
}

export interface PricePeriod {
  fromDay: number;
  toDay: number;
  count: number;
  price: number;
  oldPrice?: number | null;
  promoName?: string | null;
}

export function historyPresentation(data: Array<Omit<HistoryPoint, 'source'> & { source?: string }>, days: number, now = Date.now()) {
  const points = confirmedDays(data.map(p => ({ ...p, date: new Date(p.date).getTime() })), days, now);
  const periods: PricePeriod[] = [];
  const byDay = new Map(points.map(p => [utcDay(p.date), p]));
  for (const p of points) {
    const day = utcDay(p.date);
    const previous = periods.at(-1);
    if (previous && previous.toDay + DAY_MS === day && previous.price === p.price
      && (previous.oldPrice ?? null) === (p.oldPrice ?? null) && (previous.promoName ?? null) === (p.promoName ?? null)) {
      previous.toDay = day;
      previous.count++;
    } else periods.push({ fromDay: day, toDay: day, count: 1, price: p.price, oldPrice: p.oldPrice, promoName: p.promoName });
  }
  const periodEnds = new Set(periods.map(period => period.toDay));
  const periodBoundaries = new Set(periods.flatMap(period => [period.fromDay, period.toDay]));
  const chart: Array<{ timestamp: number; price: number | null; oldPrice: number | null; periodEnd: boolean }> = [];
  for (let index = 0; index < days; index++) {
    const timestamp = utcDay(now) - (days - 1 - index) * DAY_MS;
    const point = byDay.get(timestamp);
    if (!point) {
      chart.push({ timestamp, price: null, oldPrice: null, periodEnd: false });
      continue;
    }
    // Keep only the start and end of an unchanged-price interval. The chart
    // still spans the same dates, while missing days remain null and break it.
    if (!periodBoundaries.has(timestamp)) continue;
    chart.push({ timestamp, price: point.price, oldPrice: point.oldPrice ?? null, periodEnd: periodEnds.has(timestamp) });
  }
  return { points, periods, chart };
}
