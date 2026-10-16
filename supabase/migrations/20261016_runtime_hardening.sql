-- Apply after BOTH existing migrations. All security changes are atomic.
BEGIN;

REVOKE ALL ON public.price_alerts, public.audit_events, public.user_requests FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS allow_select_price_alerts ON public.price_alerts;
DROP POLICY IF EXISTS allow_insert_price_alerts ON public.price_alerts;
DROP POLICY IF EXISTS allow_update_price_alerts ON public.price_alerts;
DROP POLICY IF EXISTS allow_insert_audit_events ON public.audit_events;
DROP POLICY IF EXISTS allow_insert_user_requests ON public.user_requests;

CREATE TABLE public.community_price_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  store_domain TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX community_reports_recent ON public.community_price_reports(reported_at DESC);
CREATE INDEX community_reports_url_recent ON public.community_price_reports(url, reported_at DESC);
ALTER TABLE public.community_price_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_price_reports FROM PUBLIC, anon, authenticated;

CREATE TABLE public.price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  observed_day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price INTEGER NOT NULL CHECK (price > 0),
  regular_price INTEGER CHECK (regular_price > 0),
  promo_name TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'system' CHECK (source = 'system'),
  UNIQUE(product_id, observed_day)
);
ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.price_observations TO anon, authenticated;
CREATE POLICY read_confirmed_observations ON public.price_observations FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX observations_recent ON public.price_observations(product_id, observed_at DESC);
ALTER TABLE public.price_history ADD COLUMN last_seen_at TIMESTAMPTZ;
UPDATE public.price_history SET last_seen_at = valid_from WHERE last_seen_at IS NULL;
-- Legacy rows remain in price_history; do not infer confirmations or promote their trust.

REVOKE ALL ON public.products, public.price_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.products, public.price_history TO anon, authenticated;

-- A legacy repair script could have reintroduced these unsafe overloads after V2.
DROP FUNCTION IF EXISTS public.record_price(TEXT,TEXT,TEXT,TEXT,BIGINT,BIGINT,BOOLEAN,TEXT);
DROP FUNCTION IF EXISTS public.record_price(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,BOOLEAN,TEXT);

CREATE OR REPLACE FUNCTION public.record_price(
  p_store_domain TEXT, p_external_id TEXT, p_url TEXT, p_name TEXT, p_price INTEGER,
  p_regular_price INTEGER DEFAULT NULL, p_is_available BOOLEAN DEFAULT TRUE,
  p_promo_name TEXT DEFAULT NULL, p_category TEXT DEFAULT NULL, p_source TEXT DEFAULT 'community'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id UUID;
  v_last public.price_history%ROWTYPE;
  v_trusted BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF p_price IS NULL OR p_price <= 0 OR p_regular_price <= 0
    OR p_name IS NULL OR length(trim(p_name)) = 0 OR length(p_name) > 500
    OR p_external_id IS NULL OR length(p_external_id) > 200
    OR length(p_category) > 200 OR length(p_promo_name) > 500
    OR p_url IS NULL OR length(p_url) > 2000 OR p_store_domain IS NULL
    OR NOT ((p_store_domain = 'dnipro-m.ua' AND p_url ~ '^https://dnipro-m[.]ua/tovar/[^/?#]+/$')
      OR (p_store_domain = 'rozetka.com.ua' AND p_url ~ '^https://rozetka[.]com[.]ua/([^?#]*/)?p[0-9]+/$')) THEN
    RAISE EXCEPTION 'Invalid product data' USING ERRCODE = '22023';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('system', 'community') OR (p_source = 'system' AND NOT v_trusted) THEN
    RAISE EXCEPTION 'Only the server may confirm prices' USING ERRCODE = '42501';
  END IF;
  IF NOT v_trusted THEN
    -- Anonymous reports are untrusted, never change canonical products or prices.
    -- Global and per-product budgets also bound anonymous storage abuse.
    PERFORM pg_advisory_xact_lock(17010601);
    IF (SELECT count(*) FROM public.community_price_reports WHERE reported_at > now() - interval '1 hour') >= 1000 THEN
      RAISE EXCEPTION 'Community reporting limit reached' USING ERRCODE = '54000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.community_price_reports WHERE url = p_url AND reported_at > now() - interval '10 minutes') THEN
      INSERT INTO public.community_price_reports(url, store_domain, external_id, name, price)
      VALUES(p_url, p_store_domain, p_external_id, p_name, p_price);
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.products(store_domain, external_id, url, name, category, updated_at)
  VALUES(p_store_domain, p_external_id, p_url, p_name, p_category, now())
  ON CONFLICT(url) DO UPDATE SET store_domain = EXCLUDED.store_domain, external_id = EXCLUDED.external_id,
    name = EXCLUDED.name, category = COALESCE(EXCLUDED.category, public.products.category), updated_at = now()
  RETURNING id INTO v_id;

  SELECT * INTO v_last FROM public.price_history WHERE product_id = v_id ORDER BY valid_from DESC LIMIT 1;
  IF v_last.id IS NULL OR v_last.price IS DISTINCT FROM p_price
    OR v_last.regular_price IS DISTINCT FROM p_regular_price OR v_last.promo_name IS DISTINCT FROM p_promo_name
    OR v_last.is_available IS DISTINCT FROM COALESCE(p_is_available, true) OR v_last.source <> 'system' THEN
    INSERT INTO public.price_history(product_id, price, regular_price, promo_name, is_available, source, valid_from, last_seen_at)
    VALUES(v_id, p_price, p_regular_price, p_promo_name, COALESCE(p_is_available, true), 'system', now(), now());
  ELSE
    UPDATE public.price_history SET last_seen_at = now() WHERE id = v_last.id;
  END IF;
  INSERT INTO public.price_observations(product_id, price, regular_price, promo_name, is_available)
  VALUES(v_id, p_price, p_regular_price, p_promo_name, COALESCE(p_is_available, true))
  ON CONFLICT(product_id, observed_day) DO UPDATE SET price = EXCLUDED.price,
    regular_price = EXCLUDED.regular_price, promo_name = EXCLUDED.promo_name,
    is_available = EXCLUDED.is_available, observed_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_price(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,BOOLEAN,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_price(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,BOOLEAN,TEXT,TEXT,TEXT) TO anon, authenticated, service_role;

CREATE TABLE public.crawl_leases (name TEXT PRIMARY KEY, token UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
ALTER TABLE public.crawl_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crawl_leases FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.acquire_crawl_lock(p_seconds INTEGER DEFAULT 300) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token UUID;
BEGIN
  IF p_seconds < 30 OR p_seconds > 10800 THEN RAISE EXCEPTION 'Invalid lease duration'; END IF;
  INSERT INTO public.crawl_leases(name, token, expires_at) VALUES('prices', gen_random_uuid(), now() + make_interval(secs => p_seconds))
  ON CONFLICT(name) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
  WHERE public.crawl_leases.expires_at < now() RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;
CREATE FUNCTION public.release_crawl_lock(p_token UUID) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.crawl_leases WHERE name = 'prices' AND token = p_token;
$$;
REVOKE ALL ON FUNCTION public.acquire_crawl_lock(INTEGER), public.release_crawl_lock(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_crawl_lock(INTEGER), public.release_crawl_lock(UUID) TO service_role;

CREATE FUNCTION public.submit_feedback(p_type TEXT, p_comment TEXT, p_url TEXT DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('suggestion','bug') OR p_comment IS NULL OR length(p_comment) > 4000 OR length(p_url) > 2000 THEN
    RAISE EXCEPTION 'Invalid feedback' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(17010602);
  IF (SELECT count(*) FROM public.user_requests WHERE created_at > now() - interval '1 hour') >= 100 THEN
    RAISE EXCEPTION 'Feedback limit reached' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.user_requests(type, url, comment) VALUES(p_type, p_url, p_comment);
END;
$$;
CREATE INDEX IF NOT EXISTS user_requests_recent ON public.user_requests(created_at DESC);
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT,TEXT,TEXT) TO anon, authenticated, service_role;
GRANT ALL ON public.price_observations, public.community_price_reports, public.crawl_leases TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
