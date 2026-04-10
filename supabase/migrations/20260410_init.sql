-- ============================================================
-- FairPrice: Initial schema migration
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Таблиця продуктів (один рядок на унікальний товар)
CREATE TABLE IF NOT EXISTS products (
  id           BIGSERIAL PRIMARY KEY,
  store_domain TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_domain, external_id)
);

-- Таблиця цінової історії (один рядок на зміну ціни)
CREATE TABLE IF NOT EXISTS price_history (
  id             BIGSERIAL PRIMARY KEY,
  product_id     BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price          BIGINT NOT NULL,         -- в копійках
  regular_price  BIGINT,                  -- в копійках, NULL якщо знижки немає
  is_available   BOOLEAN NOT NULL DEFAULT TRUE,
  promo_name     TEXT,
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Таблиця фідбеків від юзерів (popup → SEND_FEEDBACK)
CREATE TABLE IF NOT EXISTS user_requests (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,               -- 'suggestion' | 'bug'
  url        TEXT,
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Індекси для прискорення запитів розширення
CREATE INDEX IF NOT EXISTS idx_price_history_product_id
  ON price_history(product_id);

CREATE INDEX IF NOT EXISTS idx_price_history_valid_from
  ON price_history(valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_products_url
  ON products(url);

-- ============================================================
-- RPC: record_price
-- Викликається і розширенням (anon key), і краулером (service role)
-- ============================================================
CREATE OR REPLACE FUNCTION record_price(
  p_store_domain  TEXT,
  p_external_id   TEXT,
  p_url           TEXT,
  p_name          TEXT,
  p_price         BIGINT,
  p_regular_price BIGINT DEFAULT NULL,
  p_is_available  BOOLEAN DEFAULT TRUE,
  p_promo_name    TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER   -- дозволяє anon-ключу писати в таблиці через RPC
AS $$
DECLARE
  v_product_id BIGINT;
  v_last_price BIGINT;
BEGIN
  -- Upsert продукту (оновлює URL/назву якщо змінились)
  INSERT INTO products (store_domain, external_id, url, name)
  VALUES (p_store_domain, p_external_id, p_url, p_name)
  ON CONFLICT (store_domain, external_id)
  DO UPDATE SET
    url  = EXCLUDED.url,
    name = EXCLUDED.name
  RETURNING id INTO v_product_id;

  -- Записуємо ціну тільки якщо вона змінилась (або це перший запис)
  SELECT price INTO v_last_price
  FROM price_history
  WHERE product_id = v_product_id
  ORDER BY valid_from DESC
  LIMIT 1;

  IF v_last_price IS DISTINCT FROM p_price THEN
    INSERT INTO price_history (
      product_id, price, regular_price, is_available, promo_name
    ) VALUES (
      v_product_id, p_price, p_regular_price, p_is_available, p_promo_name
    );
  END IF;
END;
$$;

-- ============================================================
-- RLS (Row Level Security): дозволити anon читати, але не писати напряму
-- Запис відбувається тільки через SECURITY DEFINER функцію record_price
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Читати можуть всі (anon key)
CREATE POLICY "allow_select_products"
  ON products FOR SELECT USING (true);

CREATE POLICY "allow_select_price_history"
  ON price_history FOR SELECT USING (true);

-- user_requests: тільки вставка через anon (без читання)
ALTER TABLE user_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_insert_user_requests"
  ON user_requests FOR INSERT WITH CHECK (true);

