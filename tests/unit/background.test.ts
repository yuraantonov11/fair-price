import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSupabase: vi.fn(), rpc: vi.fn() }));
vi.mock('@/utils/supabaseClient', () => ({ getSupabase: mocks.getSupabase }));
vi.stubGlobal('defineBackground', (fn: unknown) => fn);
let handleMessage: typeof import('@/entrypoints/background')['handleMessage'];
const message = { type: 'GET_HISTORY' as const, payload: { url: 'https://dnipro-m.ua/tovar/test/' } };

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.getSupabase.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  ({ handleMessage } = await import('@/entrypoints/background'));
});
describe('background history API', () => {
  it('coalesces requests across tabs and caches successful empty history', async () => {
    let resolve!: (value: unknown) => void;
    mocks.rpc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const first = handleMessage(message, { tab: { id: 1 } });
    const second = handleMessage(message, { tab: { id: 2 } });
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    resolve({ data: [], error: null });
    expect(await first).toEqual(await second);
    await handleMessage(message);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await handleMessage({ ...message, payload: { ...message.payload, forceRefresh: true } });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('converts kopecks exactly once and retains the UTC date and provenance', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ price: 199999, regular_price: 250000, observed_at: '2026-10-19T03:00:00Z', observed_day: '2026-10-19' }] });
    expect(await handleMessage(message)).toMatchObject({ success: true, data: [{ price: 1999.99, oldPrice: 2500, day: '2026-10-19', source: 'system' }] });
    expect(mocks.rpc).toHaveBeenCalledWith('get_product_history', { p_url: message.payload.url });
  });
  it('preserves schema failures, never caching them as empty successes', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: '42703', message: 'Missing source' }, status: 400 });
    expect(await handleMessage(message)).toMatchObject({ success: false, code: 'SCHEMA_MISMATCH', retryable: false });
    expect(await handleMessage(message)).toMatchObject({ success: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('rejects deferred alerts/telemetry without touching the database', async () => {
    expect(await handleMessage({ type: 'GET_ALERTS', payload: { url: '' } })).toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(await handleMessage({ type: 'TRACK_EVENT', payload: { event: 'widget_shown' } })).toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(mocks.getSupabase).not.toHaveBeenCalled();
  });
});
