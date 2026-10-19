import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtensionController } from '@/core/ExtensionController';
import { MessageRouter } from '@/core/MessageRouter';
import type { IPriceAdapter } from '@/adapters/IPriceAdapter';
import type { HonestyResult } from '@/types/honesty';
import type { HistoryView } from '@/types/runtime';

vi.mock('@/core/spaReinjectHelper', () => ({
  isMountMissing: (mount: unknown) => !mount, isMountOutOfPlace: () => false, placeMountNearAnchor: vi.fn(),
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('long-lived content runtime', () => {
  it('rechecks freshness locally after 48 hours and clears its timer on destroy', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-10-19T12:00:00Z'); vi.setSystemTime(now);
    const address = 'https://dnipro-m.ua/tovar/long-lived/';
    vi.stubGlobal('location', { href: address });
    vi.stubGlobal('window', { location: { href: address }, setTimeout, clearTimeout });
    vi.stubGlobal('document', { createElement: () => ({ style: {}, remove: vi.fn() }) });
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
    const product = { url: address, price: 60000, regularPrice: null, name: 'Tool', externalId: '1', isAvailable: true };
    const adapter = { getStoreDomain: () => 'dnipro-m.ua', isProductPage: () => true,
      parseProductPage: async () => product, getUIAnchor: () => ({}), getUIInsertMethod: () => 'afterend' } as unknown as IPriceAdapter;
    const send = vi.spyOn(MessageRouter, 'send').mockImplementation(async message => {
      if (message.type === 'GET_HISTORY') return { success: true, data: Array.from({ length: 30 }, (_, i) => ({
        price: 1000, date: now - i * 86400000, source: 'system',
      })) } as any;
      return { success: true };
    });
    let rendered: { honesty: HonestyResult; view: HistoryView } | undefined;
    const controller = new ExtensionController(adapter, (_container, _history, honesty, view) => { rendered = { honesty, view }; });
    controller.init();
    await vi.waitFor(() => expect(rendered?.view.state).toBe('ready'));
    expect(rendered?.honesty.confidence?.stale).toBe(false);
    expect(rendered?.honesty.verdict).toBe('fair');
    vi.setSystemTime(now + 49 * 3600000);
    await vi.advanceTimersByTimeAsync(60000);
    expect(rendered?.honesty.confidence?.stale).toBe(true);
    expect(rendered?.honesty.verdict).toBeUndefined();
    expect(send.mock.calls.filter(([message]) => message.type === 'GET_HISTORY')).toHaveLength(1);
    expect(send.mock.calls.filter(([message]) => message.type === 'SET_ICON').at(-1)?.[0]).toMatchObject({ payload: { status: 'inactive' } });
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
