import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSupabase: vi.fn(), limit: vi.fn(), rpc: vi.fn() }));
vi.mock('@/utils/supabaseClient', () => ({ getSupabase: mocks.getSupabase }));
vi.stubGlobal('defineBackground', (fn: unknown) => fn);
const { handleMessage } = await import('@/entrypoints/background');

describe('background history requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: mocks.limit };
    mocks.getSupabase.mockReturnValue({ from: () => chain, rpc: mocks.rpc });
    mocks.limit.mockResolvedValue({ data: [], error: null });
  });
  it('coalesces identical inflight requests, without suppressing another product in the same tab', async () => {
    let resolve!: (value: unknown) => void;
    mocks.limit.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const message = { type: 'GET_HISTORY' as const, payload: { url: 'https://dnipro-m.ua/tovar/first/' } };
    const first = handleMessage(message, { tab: { id: 1 } });
    const same = handleMessage(message, { tab: { id: 1 } });
    await expect(handleMessage({ ...message, payload: { url: 'https://dnipro-m.ua/tovar/second/' } }, { tab: { id: 1 } })).resolves.toMatchObject({ success: true });
    expect(mocks.limit).toHaveBeenCalledTimes(2);
    resolve({ data: [], error: null });
    expect(await first).toEqual(await same);
  });
  it('converts kopecks exactly once and retains system provenance', async () => {
    mocks.limit.mockResolvedValue({ data: [{ price: 199999, regular_price: 250000, observed_at: '2026-10-16', source: 'system' }] });
    expect(await handleMessage({ type: 'GET_HISTORY', payload: { url: 'https://dnipro-m.ua/tovar/test/' } })).toMatchObject({ success: true, data: [{ price: 1999.99, oldPrice: 2500, source: 'system' }] });
  });
  it('preserves structured schema failures instead of returning an empty success', async () => {
    mocks.limit.mockResolvedValue({ error: { code: '42703', message: 'Missing source' }, status: 400 });
    expect(await handleMessage({ type: 'GET_HISTORY', payload: { url: 'https://dnipro-m.ua/tovar/test/' } })).toMatchObject({ success: false, code: 'SCHEMA_MISMATCH', error: 'Missing source', retryable: false });
  });
  it('rejects deferred alerts and telemetry without touching the database', async () => {
    expect(await handleMessage({ type: 'GET_ALERTS', payload: { url: '' } })).toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(await handleMessage({ type: 'TRACK_EVENT', payload: { event: 'widget_shown' } })).toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(mocks.getSupabase).not.toHaveBeenCalled();
  });
});
