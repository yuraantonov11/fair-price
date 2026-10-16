import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('action icon updates', () => {
  const setIcon = vi.fn();
  const fetchIcon = vi.fn();
  const runtime: { getURL: (path: string) => string; lastError?: { message: string } } = {
    getURL: path => `chrome-extension://test${path}`,
  };
  let setActionIcon: typeof import('@/utils/actionIcon').setActionIcon;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete runtime.lastError;
    vi.stubEnv('FIREFOX', '');
    vi.stubGlobal('browser', { runtime, action: { setIcon } });
    vi.stubGlobal('fetch', fetchIcon);
    fetchIcon.mockResolvedValue({ ok: true, blob: async () => new Blob() });
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(private width: number, private height: number) {}
      getContext() {
        return { drawImage() {}, getImageData: () => ({ width: this.width, height: this.height }) };
      }
    });
    setIcon.mockImplementation((_details, callback) => { callback(); });
    ({ setActionIcon } = await import('@/utils/actionIcon'));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('waits for a callback-only API and propagates runtime.lastError', async () => {
    let complete!: () => void;
    setIcon.mockImplementation((_details, callback) => { complete = callback; });
    const result = setActionIcon(7, '/icons/icon_inactive.png');
    const rejection = expect(result).rejects.toThrow('No tab with id: 7');
    await vi.waitFor(() => expect(setIcon).toHaveBeenCalledOnce());
    runtime.lastError = { message: 'No tab with id: 7' };
    complete();
    delete runtime.lastError;
    await rejection;
  });

  it('shares decoding across tabs while still updating each tab', async () => {
    await Promise.all([
      setActionIcon(1, '/icons/icon_success.png'),
      setActionIcon(2, '/icons/icon_success.png'),
    ]);
    expect(fetchIcon).toHaveBeenCalledOnce();
    expect(setIcon.mock.calls.map(([details]) => details.tabId)).toEqual([1, 2]);
  });

  it('allows retry after an image load failure', async () => {
    fetchIcon.mockResolvedValueOnce({ ok: false });
    await expect(setActionIcon(1, '/icons/icon_error.png')).rejects.toThrow('Could not load action icon');
    await expect(setActionIcon(1, '/icons/icon_error.png')).resolves.toBeUndefined();
    expect(fetchIcon).toHaveBeenCalledTimes(2);
  });

  it('uses the Firefox MV2 promise API and propagates its rejection', async () => {
    vi.stubEnv('FIREFOX', 'true');
    setIcon.mockRejectedValue(new Error('Firefox icon failure'));
    vi.stubGlobal('browser', { runtime, browserAction: { setIcon } });
    await expect(setActionIcon(1, '/icons/icon_error.png')).rejects.toThrow('Firefox icon failure');
    expect(setIcon.mock.calls[0]).toHaveLength(1);
  });
});
