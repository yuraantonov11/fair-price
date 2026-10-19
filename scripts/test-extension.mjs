#!/usr/bin/env node
// Live smoke check: submit an actual store price, then read trusted daily history.
// Uses the public extension key; never fabricates a product or promotes a report.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './env.mjs';
import { fetchProduct, isProductUrl } from '../supabase/functions/_shared/crawler.ts';
import { isPublicBackendKey } from '../src/utils/backendConfig.ts';

loadLocalEnv();
const url = process.env.LIVE_PRODUCT_URL || 'https://dnipro-m.ua/tovar/remin-dlya-kompresora-50-2r/';
assert(isProductUrl(url), 'LIVE_PRODUCT_URL must be a supported product page');
assert(isPublicBackendKey(process.env.VITE_SUPABASE_ANON_KEY), 'Use a public extension key');
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
});
const product = await fetchProduct(url);
assert(product, 'Store data must contain a valid UAH product price');
const { error: saveError } = await client.rpc('record_price', {
  p_store_domain: new URL(product.url).hostname, p_external_id: product.externalId,
  p_url: product.url, p_name: product.name, p_price: product.price,
  p_regular_price: product.regularPrice, p_is_available: product.isAvailable,
  p_promo_name: null, p_category: null, p_source: 'community',
});
assert(!saveError, 'Live community price submission failed: ' + (saveError?.code || 'unknown'));
console.log('Live community submission: OK (' + product.price / 100 + ' UAH)');
const { data, error: historyError } = await client.rpc('get_product_history', { p_url: product.url });
assert(!historyError, 'Live history read failed: ' + (historyError?.code || 'unknown'));
assert(data.length > 0, 'Run the real crawler first: no trusted observations for this product');
assert(data.every(row => Number.isSafeInteger(row.price) && row.price > 0 && row.source === 'system'));
console.log('Trusted daily history: OK (' + data.length + ' observations, latest ' + data.at(-1).price / 100 + ' UAH)');
