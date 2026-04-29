-- ============================================================
-- FairPrice: V2 schema migration
-- Adds: source to price_history, category to products,
--       price_alerts and audit_events tables.
-- Updates record_price RPC to accept p_category / p_source.
-- Safe to re-run: uses IF NOT EXISTS, DO-exception guards,
-- and ALTER COLUMN … IF NOT EXISTS where supported.
-- ============================================================

-- ── 1. price_history: add source column ──────────────────────
ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'community'
    CHECK (source IN ('community', 'system'));

-- ── 2. products: add category column ─────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category TEXT;

-- ── 3. price_alerts table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key     TEXT        NOT NULL,
  product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  target_price INTEGER     NOT NULL,   -- в копійках
  channel      TEXT        NOT NULL DEFAULT 'browser'
                           CHECK (channel IN ('browser', 'telegram')),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. audit_events table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT        NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Additional indexes ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_price_history_product_valid_from
  ON public.price_history(product_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_active
  ON public.price_alerts(user_key, is_active);

CREATE INDEX IF NOT EXISTS idx_products_store_sku
  ON public.products(store_domain, external_id);

-- ── 6. Update record_price RPC ────────────────────────────────
-- Drop old signatures before recreating
DROP FUNCTION IF EXISTS public.record_price(text,text,text,text,bigint,bigint,boolean,text);
DROP FUNCTION IF EXISTS public.record_price(text,text,text,text,integer,integer,boolean,text);
DROP FUNCTION IF EXISTS public.record_price(text,text,text,text,integer,integer,boolean,text,text,text);

CREATE OR REPLACE FUNCTION public.record_price(
  p_store_domain  TEXT,
  p_external_id   TEXT,
  p_url           TEXT,
  p_name          TEXT,
  p_price         INTEGER,
  p_regular_price INTEGER  DEFAULT NULL,
  p_is_available  BOOLEAN  DEFAULT TRUE,
  p_promo_name    TEXT     DEFAULT NULL,
  p_category      TEXT     DEFAULT NULL,
  p_source        TEXT     DEFAULT 'community'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
  v_last_price INTEGER;
BEGIN
  -- Upsert product row
  INSERT INTO public.products (store_domain, external_id, url, name, category, updated_at)
  VALUES (p_store_domain, p_external_id, p_url, p_name, p_category, now())
  ON CONFLICT (url)
  DO UPDATE SET
    store_domain = EXCLUDED.store_domain,
    external_id  = EXCLUDED.external_id,
    name         = EXCLUDED.name,
    category     = COALESCE(EXCLUDED.category, public.products.category),
    updated_at   = now()
  RETURNING id INTO v_product_id;

  -- Last known price
  SELECT price INTO v_last_price
  FROM public.price_history
  WHERE product_id = v_product_id
  ORDER BY valid_from DESC
  LIMIT 1;

  -- Write only if price changed (or first record)
  IF v_last_price IS DISTINCT FROM p_price THEN
    INSERT INTO public.price_history (
      product_id, price, regular_price, promo_name, is_available, source, valid_from
    ) VALUES (
      v_product_id, p_price, p_regular_price, p_promo_name,
      COALESCE(p_is_available, true),
      COALESCE(p_source, 'community'),
      now()
    );
  END IF;
END;
$$;

-- ── 7. RLS for new tables ─────────────────────────────────────
ALTER TABLE public.price_alerts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY allow_select_price_alerts
    ON public.price_alerts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY allow_insert_price_alerts
    ON public.price_alerts FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY allow_update_price_alerts
    ON public.price_alerts FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY allow_insert_audit_events
    ON public.audit_events FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

