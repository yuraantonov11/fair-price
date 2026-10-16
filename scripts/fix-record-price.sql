-- Retired: this script used to create an unsafe legacy record_price overload.
-- Apply supabase/migrations/*.sql in filename order instead.
-- 20261016_runtime_hardening.sql removes old overloads and isolates community reports.
DO $$ BEGIN
  RAISE EXCEPTION 'Legacy repair retired. Apply the complete migration chain; see README.md';
END $$;
