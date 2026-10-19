import { describe, expect, it, vi } from 'vitest';
import { HistoryCache } from '@/core/HistoryCache';
import type { HistoryPoint, RuntimeResponse } from '@/types/runtime';

describe('session history cache', () => {
  it('expires at ten minutes, separates backends and supports explicit refresh', async () => {
    let now = 0;
    const cache = new HistoryCache(() => undefined, () => now);
    const fetcher = vi.fn(async (): Promise<RuntimeResponse<HistoryPoint[]>> => ({ success: true, data: [] }));
    await cache.get('backend-a:product', fetcher);
    await cache.get('backend-a:product', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await cache.get('backend-b:product', fetcher);
    now = 600000;
    await cache.get('backend-a:product', fetcher);
    await cache.get('backend-a:product', fetcher, true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('survives service-worker restarts and evicts least recently used entries at 100', async () => {
    let saved: Record<string, unknown> = {};
    const storage = { get: async () => saved, set: async (value: Record<string, unknown>) => { saved = value; } };
    const cache = new HistoryCache(() => storage);
    const fetcher = vi.fn(async (): Promise<RuntimeResponse<HistoryPoint[]>> => ({ success: true, data: [] }));
    for (let i = 0; i < 100; i++) await cache.get(String(i), fetcher);
    await cache.get('0', fetcher);
    await cache.get('100', fetcher);
    const restarted = new HistoryCache(() => storage);
    await restarted.get('0', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(101);
    await restarted.get('1', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(102);
  });
  it('bounds serialized storage and falls back to memory on quota/unsupported storage', async () => {
    const storage = { get: vi.fn().mockRejectedValue(new Error('Unavailable')), set: vi.fn().mockRejectedValue(new Error('Quota')) };
    const cache = new HistoryCache(() => storage);
    const fetcher = vi.fn(async (): Promise<RuntimeResponse<HistoryPoint[]>> => ({ success: true,
      data: Array.from({ length: 60 }, () => ({ price: 1000, date: Date.now(), source: 'system', promoName: 'x'.repeat(30000) })) }));
    await cache.get('a', fetcher); await cache.get('b', fetcher); await cache.get('b', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [value] of storage.set.mock.calls) expect(new TextEncoder().encode(JSON.stringify(value)).length).toBeLessThan(2 * 1024 * 1024);
    await cache.get('a', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
