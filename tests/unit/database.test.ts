import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const product = ['dnipro-m.ua', 'audit-1', 'https://dnipro-m.ua/tovar/audit-test/', 'Audit tool', 100000, null, true, null, null, 'system'];
const record = (values = product) => db.query('SELECT public.record_price($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', values);
async function role(name: 'anon' | 'authenticated' | 'service_role') {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.role', '${name}', false); SET ROLE ${name};`);
}
beforeAll(async () => {
  // Emulate the Supabase roles/auth helper. All application migrations run unchanged,
  // except uuid-ossp, an unused optional extension unavailable in embedded Postgres.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
    $$ SELECT current_setting('request.jwt.claim.role', true) $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;`);
  for (const name of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
    if (name === '20261016_runtime_hardening.sql') await db.exec(`CREATE FUNCTION public.record_price(
      text,text,text,text,integer,integer,boolean,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;`);
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''));
  }
}, 30000);
afterEach(async () => { await db.exec('RESET ROLE'); });
afterAll(async () => { await db.close(); });

describe('database trust boundaries', () => {
  it('removes legacy RPC overloads that could bypass the hardened path', async () => {
    const result = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='record_price'`);
    expect(result.rows[0]?.count).toBe(1);
  });
  it.each(['anon', 'authenticated'] as const)('%s cannot read or alter private alerts', async name => {
    await role(name);
    await expect(db.query('SELECT * FROM public.price_alerts')).rejects.toThrow(/permission denied/);
    await expect(db.query("INSERT INTO public.price_alerts(user_key,product_id,target_price) VALUES('x',gen_random_uuid(),1)")).rejects.toThrow(/permission denied/);
    await expect(db.query('UPDATE public.price_alerts SET is_active=false')).rejects.toThrow(/permission denied/);
    await expect(db.query('DELETE FROM public.price_alerts')).rejects.toThrow(/permission denied/);
  });
  it('prevents source spoofing and direct canonical writes', async () => {
    await role('anon');
    await expect(record()).rejects.toThrow(/Only the server/);
    await expect(db.query('INSERT INTO public.price_observations(product_id,price) VALUES(gen_random_uuid(),1)')).rejects.toThrow(/permission denied/);
    await expect(db.query('SELECT * FROM public.community_price_reports')).rejects.toThrow(/permission denied/);
    await expect(db.query('SELECT public.acquire_crawl_lock(60)')).rejects.toThrow(/permission denied/);
  });
  it('bounds and isolates anonymous reports; they do not create canonical products', async () => {
    await role('anon');
    await record([...product.slice(0, 9), 'community']);
    await record([...product.slice(0, 9), 'community']);
    expect((await db.query('SELECT * FROM public.products')).rows).toHaveLength(0);
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT * FROM public.community_price_reports')).rows).toHaveLength(1);
    await role('anon');
    await expect(record([...product.slice(0, 4), -100, ...product.slice(5, 9), 'community'])).rejects.toThrow(/Invalid product/);
    await expect(record(['evil.test', ...product.slice(1, 9), 'community'])).rejects.toThrow(/Invalid product/);
  });
  it('records daily server confirmations idempotently and preserves metadata changes', async () => {
    await role('service_role');
    await record(); await record();
    expect((await db.query('SELECT source FROM public.price_observations')).rows).toEqual([{ source: 'system' }]);
    expect((await db.query('SELECT * FROM public.price_history')).rows).toHaveLength(1);
    await db.exec("UPDATE public.price_observations SET observed_day=observed_day-1,observed_at=observed_at-interval '1 day'");
    await record();
    expect((await db.query('SELECT * FROM public.price_observations')).rows).toHaveLength(2);
    expect((await db.query('SELECT * FROM public.price_history')).rows).toHaveLength(1);
    const promo = [...product]; promo[7] = 'Sale'; await record(promo);
    expect((await db.query('SELECT * FROM public.price_history')).rows).toHaveLength(2);
    await role('anon');
    expect((await db.query('SELECT * FROM public.price_observations')).rows).toHaveLength(2);
  });
  it('leases exclude overlapping crawlers and reject releases by a different owner', async () => {
    await role('service_role');
    const first = await db.query<{ token: string }>('SELECT public.acquire_crawl_lock(60) AS token');
    expect(first.rows[0]!.token).toBeTruthy();
    expect((await db.query<{ token: string }>('SELECT public.acquire_crawl_lock(60) AS token')).rows[0]!.token).toBeNull();
    await db.query('SELECT public.release_crawl_lock(gen_random_uuid())');
    expect((await db.query<{ token: string }>('SELECT public.acquire_crawl_lock(60) AS token')).rows[0]!.token).toBeNull();
    await db.query('SELECT public.release_crawl_lock($1)', [first.rows[0]!.token]);
    expect((await db.query<{ token: string }>('SELECT public.acquire_crawl_lock(60) AS token')).rows[0]!.token).toBeTruthy();
  });
});

describe('bounded history and private archival', () => {
  it('returns at most 60 UTC days for one URL, excluding unavailable/future observations', async () => {
    const inserted = await db.query<{ id: string }>(`INSERT INTO public.products(store_domain,external_id,url,name)
      VALUES('dnipro-m.ua','bounded','https://dnipro-m.ua/tovar/bounded/','Bounded') RETURNING id`);
    const id = inserted.rows[0]!.id;
    await db.query(`INSERT INTO public.price_observations(product_id,price,observed_day,observed_at)
      SELECT $1,100099,(now() AT TIME ZONE 'UTC')::date-i,now()-i*interval '1 day' FROM generate_series(-1,70) i`, [id]);
    await db.query(`UPDATE public.price_observations SET is_available=false WHERE product_id=$1 AND observed_day=(now() AT TIME ZONE 'UTC')::date-5`, [id]);
    await role('anon');
    const rows = await db.query<{ price: number; observed_day: string }>(`SELECT * FROM public.get_product_history('https://dnipro-m.ua/tovar/bounded/')`);
    expect(rows.rows).toHaveLength(59);
    expect(rows.rows[0]?.price).toBe(100099);
    expect((await db.query(`SELECT * FROM public.get_product_history('https://dnipro-m.ua/tovar/unknown/')`)).rows).toHaveLength(0);
    await expect(db.query(`SELECT * FROM public.get_product_history('https://evil.test/')`)).rejects.toThrow(/Invalid product URL/);
    await expect(db.query('SELECT * FROM public.price_archive_exports')).rejects.toThrow(/permission denied/);
    await expect(db.query('SELECT public.apply_history_privacy()')).rejects.toThrow(/permission denied/);
  });
  it('requires verified export, restore proof and a live lease; only exact old snapshots can be deleted', async () => {
    await db.exec('DELETE FROM public.crawl_leases');
    const id = (await db.query<{ id: string }>('SELECT id FROM public.products LIMIT 1')).rows[0]!.id;
    await db.query(`INSERT INTO public.price_observations(product_id,price,observed_day,observed_at)
      VALUES($1,12345,'2025-01-10','2025-01-10T03:00:00Z'),($1,12345,'2025-01-11','2025-01-11T03:00:00Z')`, [id]);
    const snapshots = (await db.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(o) AS row FROM public.price_observations o WHERE observed_day BETWEEN '2025-01-01' AND '2025-01-31' ORDER BY observed_day`)).rows.map(r => r.row);
    const sha = 'a'.repeat(64);
    await role('service_role');
    const lease = (await db.query<{ token: string }>('SELECT public.acquire_crawl_lock(300) AS token')).rows[0]!.token;
    const prune = (rows = snapshots, hash = sha) => db.query<{ count: number }>('SELECT public.prune_archived_observations($1,$2,$3::jsonb,$4) AS count', ['2025-01-01', hash, JSON.stringify(rows), lease]);
    await expect(prune()).rejects.toThrow(/Verified archive/);
    await db.query(`INSERT INTO public.price_archive_exports(month,manifest_sha256,manifest) VALUES('2025-01-01',$1,'{"version":1}')`, [sha]);
    await expect(prune()).rejects.toThrow(/restore proof/);
    await db.exec("UPDATE public.price_archive_exports SET restore_verified_at=now()");
    await expect(prune(snapshots, 'b'.repeat(64))).rejects.toThrow(/Verified archive/);
    await db.exec("UPDATE public.price_observations SET price=54321 WHERE observed_day='2025-01-11'");
    expect((await prune()).rows[0]?.count).toBe(1);
    expect((await prune()).rows[0]?.count).toBe(0);
    expect((await db.query("SELECT price FROM public.price_observations WHERE observed_day='2025-01-11'")).rows).toEqual([{ price: 54321 }]);
    await db.query('SELECT public.release_crawl_lock($1)', [lease]);
    await expect(prune()).rejects.toThrow(/lease required/);
  });
  it('keeps the compatibility window and then closes raw reads without breaking the RPC', async () => {
    await role('service_role');
    expect((await db.query<{ active: boolean }>('SELECT public.apply_history_privacy() AS active')).rows[0]?.active).toBe(false);
    await db.query("SELECT public.announce_history_release('2.5.0')");
    expect((await db.query<{ active: boolean }>('SELECT public.apply_history_privacy() AS active')).rows[0]?.active).toBe(false);
    await db.exec("UPDATE public.history_api_rollout SET released_at=now()-interval '14 days'");
    expect((await db.query<{ active: boolean }>('SELECT public.apply_history_privacy() AS active')).rows[0]?.active).toBe(true);
    for (const name of ['anon', 'authenticated'] as const) {
      await role(name);
      for (const table of ['products', 'price_history', 'price_observations']) await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
      expect((await db.query("SELECT * FROM public.get_product_history('https://dnipro-m.ua/tovar/bounded/')")).rows).toHaveLength(59);
    }
  });
});
