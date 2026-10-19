BEGIN;

-- Additive rollout: existing clients continue reading tables until the explicit,
-- release-gated cutover below. No legacy/community data is promoted.
CREATE FUNCTION public.get_product_history(p_url TEXT)
RETURNS TABLE(price INTEGER, regular_price INTEGER, promo_name TEXT, observed_day DATE, observed_at TIMESTAMPTZ, source TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_url IS NULL OR length(p_url) > 2000 OR NOT (
    p_url ~ '^https://dnipro-m[.]ua/tovar/[^/?#]+/$'
    OR p_url ~ '^https://rozetka[.]com[.]ua/([^?#]*/)?p[0-9]+/$') THEN
    RAISE EXCEPTION 'Invalid product URL' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT o.price,o.regular_price,o.promo_name,o.observed_day,o.observed_at,o.source
    FROM public.price_observations o JOIN public.products p ON p.id=o.product_id
    WHERE p.url=p_url AND o.source='system' AND o.is_available
      AND o.observed_day BETWEEN (now() AT TIME ZONE 'UTC')::date-59 AND (now() AT TIME ZONE 'UTC')::date
      AND o.observed_at <= now()
    ORDER BY o.observed_day LIMIT 60;
END;
$$;
REVOKE ALL ON FUNCTION public.get_product_history(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_history(TEXT) TO anon,authenticated,service_role;

CREATE TABLE public.price_archive_exports (
  month DATE PRIMARY KEY CHECK (extract(day FROM month)=1),
  manifest_sha256 TEXT NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest JSONB NOT NULL CHECK (manifest->>'version'='1'),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  restore_verified_at TIMESTAMPTZ,
  pruned_rows BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX observations_archive_day ON public.price_observations(observed_day);
CREATE TABLE public.history_api_rollout (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
  released_at TIMESTAMPTZ,
  restricted_at TIMESTAMPTZ
);
INSERT INTO public.history_api_rollout(id) VALUES(true);
ALTER TABLE public.price_archive_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_api_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_archive_exports,public.history_api_rollout FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.price_archive_exports,public.history_api_rollout TO service_role;

CREATE FUNCTION public.announce_history_release(p_version TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_version <> '2.5.0' OR p_version IS NULL THEN RAISE EXCEPTION 'Expected release 2.5.0'; END IF;
  UPDATE public.history_api_rollout SET released_at=COALESCE(released_at,now()) WHERE id;
END;
$$;
CREATE FUNCTION public.apply_history_privacy() RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.history_api_rollout WHERE released_at <= now()-interval '14 days') THEN RETURN false; END IF;
  REVOKE SELECT ON public.products,public.price_history,public.price_observations FROM PUBLIC,anon,authenticated;
  UPDATE public.history_api_rollout SET restricted_at=COALESCE(restricted_at,now()) WHERE id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.price_storage_budget() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_bytes BIGINT := pg_database_size(current_database());
BEGIN
  RETURN jsonb_build_object('bytes',v_bytes,'discoveryAllowed',v_bytes<400000000,'writesAllowed',v_bytes<450000000);
END;
$$;
-- Cover both crawler implementations and community ingestion, including direct
-- service writes. Deletion remains possible when the write budget is exhausted.
CREATE FUNCTION public.guard_price_storage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_database_size(current_database()) >= 450000000 THEN
    RAISE EXCEPTION 'STORAGE_BUDGET_EXCEEDED' USING ERRCODE='54000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_observation_storage BEFORE INSERT OR UPDATE ON public.price_observations
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_price_storage();
CREATE TRIGGER guard_community_storage BEFORE INSERT ON public.community_price_reports
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_price_storage();
-- Guard at the start of record_price, before products/change history can grow.
CREATE TRIGGER guard_product_storage BEFORE INSERT OR UPDATE ON public.products
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_price_storage();

CREATE FUNCTION public.prune_archived_observations(p_month DATE,p_sha256 TEXT,p_rows JSONB,p_lease UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted INTEGER;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.crawl_leases WHERE name='prices' AND token=p_lease AND expires_at>now()) THEN
    RAISE EXCEPTION 'Archive lease required';
  END IF;
  IF p_month IS NULL OR extract(day FROM p_month)<>1 OR p_month+interval '1 month' > (now() AT TIME ZONE 'UTC')::date-90
    OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Invalid archive batch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.price_archive_exports WHERE month=p_month AND manifest_sha256=p_sha256)
    OR NOT EXISTS(SELECT 1 FROM public.price_archive_exports WHERE restore_verified_at IS NOT NULL AND manifest->>'version'='1') THEN
    RAISE EXCEPTION 'Verified archive and restore proof required';
  END IF;
  WITH snapshots AS (SELECT * FROM jsonb_populate_recordset(NULL::public.price_observations,p_rows)), removed AS (
    DELETE FROM public.price_observations o USING snapshots s
    WHERE o.id=s.id AND o.observed_day>=p_month AND o.observed_day<p_month+interval '1 month'
      AND o.observed_day=s.observed_day AND o.product_id=s.product_id AND o.observed_at=s.observed_at
      AND o.price=s.price AND o.regular_price IS NOT DISTINCT FROM s.regular_price
      AND o.promo_name IS NOT DISTINCT FROM s.promo_name AND o.is_available=s.is_available AND o.source=s.source
    RETURNING o.id
  ) SELECT count(*)::int INTO v_deleted FROM removed;
  UPDATE public.price_archive_exports SET pruned_rows=pruned_rows+v_deleted WHERE month=p_month;
  RETURN v_deleted;
END;
$$;

CREATE FUNCTION public.maintain_price_storage(p_lease UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted INTEGER;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.crawl_leases WHERE name='prices' AND token=p_lease AND expires_at>now()) THEN
    RAISE EXCEPTION 'Maintenance lease required';
  END IF;
  DELETE FROM public.community_price_reports WHERE reported_at<now()-interval '7 days';
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  RETURN jsonb_build_object('communityDeleted',v_deleted,'privacyRestricted',public.apply_history_privacy(),'budget',public.price_storage_budget());
END;
$$;

REVOKE ALL ON FUNCTION public.announce_history_release(TEXT), public.apply_history_privacy(),public.price_storage_budget(),
  public.guard_price_storage(),public.prune_archived_observations(DATE,TEXT,JSONB,UUID),public.maintain_price_storage(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.announce_history_release(TEXT),public.apply_history_privacy(),public.price_storage_budget(),
  public.prune_archived_observations(DATE,TEXT,JSONB,UUID),public.maintain_price_storage(UUID) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
