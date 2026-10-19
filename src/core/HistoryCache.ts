import type { HistoryPoint, RuntimeResponse } from '@/types/runtime';

type Entry = { key: string; expires: number; data: HistoryPoint[] };
type SessionStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<unknown>;
};
const STORAGE_KEY = 'fp_history_cache_v1';
const TTL = 10 * 60_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** A bounded, session-only cache shared by all tabs and service-worker restarts. */
export class HistoryCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<RuntimeResponse<HistoryPoint[]>>>();
  private hydrated?: Promise<void>;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private storage: () => SessionStorage | undefined = () => browser.storage.session,
    private now = () => Date.now()) {}

  private async hydrate() {
    try {
      const value = (await this.storage()?.get(STORAGE_KEY))?.[STORAGE_KEY];
      if (Array.isArray(value)) for (const item of value) {
        if (item && typeof item.key === 'string' && Number.isFinite(item.expires) && item.expires > this.now()
          && Array.isArray(item.data) && item.data.length <= 60 && item.data.every((p: HistoryPoint) => p
            && Number.isFinite(p.price) && p.price > 0 && p.source === 'system' && Number.isFinite(new Date(p.date).getTime()))) {
          this.entries.set(item.key, item);
        }
      }
      this.trim();
    } catch { /* Firefox MV2 and storage quota errors use the memory cache. */ }
  }

  private trim() {
    for (const [key, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(key);
    while (this.entries.size > 100 || new TextEncoder().encode(JSON.stringify([...this.entries.values()])).length > MAX_BYTES) {
      const first = this.entries.keys().next().value;
      if (first === undefined) break;
      this.entries.delete(first);
    }
  }

  private persist() {
    this.trim();
    this.writes = this.writes.then(async () => {
      try { await this.storage()?.set({ [STORAGE_KEY]: [...this.entries.values()] }); } catch { /* Memory fallback. */ }
    });
  }

  async get(key: string, fetcher: () => Promise<RuntimeResponse<HistoryPoint[]>>, force = false): Promise<RuntimeResponse<HistoryPoint[]>> {
    await (this.hydrated ??= this.hydrate());
    const pending = this.pending.get(key);
    if (pending) return pending;
    const entry = this.entries.get(key);
    if (!force && entry && entry.expires > this.now()) {
      this.entries.delete(key); this.entries.set(key, entry); this.persist();
      return { success: true, data: entry.data };
    }
    // A failed explicit refresh must not resurrect the previous cached response.
    this.entries.delete(key);
    const request = fetcher().then(result => {
      if (result.success) this.entries.set(key, { key, expires: this.now() + TTL, data: result.data ?? [] });
      this.persist();
      return result;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
