-- ============================================================
-- FairPrice: Initial schema migration
-- Reflects the actual live schema (uuid PKs, integer prices).
-- Safe to re-run: uses IF NOT EXISTS and DO-exception guards.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────

-- Один рядок на унікальний товар (upsert по url)
CREATE TABLE IF NOT EXISTS public.products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_domain TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  url          TEXT NOT NULL,
  name         TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_url_key UNIQUE (url)
);

-- Один рядок на зміну ціни (записується тільки якщо price змінилась)
CREATE TABLE IF NOT EXISTS public.price_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price          INTEGER NOT NULL,       -- в копійках
  regular_price  INTEGER,               -- в копійках, NULL якщо знижки немає
  promo_name     TEXT,
  is_available   BOOLEAN NOT NULL DEFAULT true,
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Фідбеки від юзерів (popup → SEND_FEEDBACK)
CREATE TABLE IF NOT EXISTS public.user_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,              -- 'suggestion' | 'bug'
  url        TEXT,
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_price_history_product_id
  ON public.price_history(product_id);

CREATE INDEX IF NOT EXISTS idx_price_history_valid_from
  ON public.price_history(valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_products_url
  ON public.products(url);

-- ── RPC: record_price ─────────────────────────────────────────
-- Викликається і розширенням (anon key через SECURITY DEFINER),
-- і краулером (scripts/crawl.mjs, service_role key).
-- Ціни передаються в КОПІЙКАХ (integer).
-- Запис до price_history тільки якщо ціна змінилась.

-- Видаляємо всі старі версії функції перед (пере)створенням
DROP FUNCTION IF EXISTS public.record_price(text,text,text,text,bigint,bigint,boolean,text);
DROP FUNCTION IF EXISTS public.record_price(text,text,text,text,integer,integer,boolean,text);

CREATE OR REPLACE FUNCTION public.record_price(
  p_store_domain  TEXT,
  p_external_id   TEXT,
  p_url           TEXT,
  p_name          TEXT,
  p_price         INTEGER,
  p_regular_price INTEGER  DEFAULT NULL,
  p_is_available  BOOLEAN  DEFAULT TRUE,
  p_promo_name    TEXT     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
  v_last_price INTEGER;
BEGIN
  -- Upsert товару: оновлює назву і домен якщо URL вже відомий
  INSERT INTO public.products (store_domain, external_id, url, name, updated_at)
  VALUES (p_store_domain, p_external_id, p_url, p_name, now())
  ON CONFLICT (url)
  DO UPDATE SET
    store_domain = EXCLUDED.store_domain,
    external_id  = EXCLUDED.external_id,
    name         = EXCLUDED.name,
    updated_at   = now()
  RETURNING id INTO v_product_id;

  -- Беремо останню відому ціну
  SELECT price INTO v_last_price
  FROM public.price_history
  WHERE product_id = v_product_id
  ORDER BY valid_from DESC
  LIMIT 1;

  -- Пишемо тільки якщо ціна змінилась (або це перший запис)
  IF v_last_price IS DISTINCT FROM p_price THEN
    INSERT INTO public.price_history (
      product_id, price, regular_price, promo_name, is_available, valid_from
    ) VALUES (
      v_product_id, p_price, p_regular_price, p_promo_name,
      COALESCE(p_is_available, true), now()
    );
  END IF;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_requests ENABLE ROW LEVEL SECURITY;

-- Читання доступне всім (anon key)
DO $$ BEGIN
  CREATE POLICY allow_select_products
    ON public.products FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY allow_select_price_history
    ON public.price_history FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_requests: тільки вставка (без читання через anon)
DO $$ BEGIN
  CREATE POLICY allow_insert_user_requests
    ON public.user_requests FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
