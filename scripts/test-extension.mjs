#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadEnvFile('.env');
loadEnvFile('.env.local');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

function getErrorMessage(error) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const message = error.message || error.error_description || error.details;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown error';
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing env vars: VITE_SUPABASE_URL/SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('🔍 Fair Price extension diagnostics');
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  console.log('');

  console.log('1) Connectivity check');
  const { count, error: connectivityError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  if (connectivityError) {
    console.error(`   ❌ Помилка: ${getErrorMessage(connectivityError)}\n`);
    process.exit(1);
  }

  console.log(`   ✅ Supabase доступний (products: ${count ?? 'unknown'})\n`);

  console.log('2) History query check');
  const { data: history, error: historyError } = await supabase
    .from('price_history')
    .select('id, price, valid_from, products!inner(url)')
    .limit(1);

  if (historyError) {
    console.error(`   ❌ Помилка: ${getErrorMessage(historyError)}\n`);
    process.exit(1);
  }

  console.log(`   ✅ Query працює (rows: ${history?.length ?? 0})\n`);

  console.log('3) RPC record_price check');
  const { error: rpcError } = await supabase.rpc('record_price', {
    p_store_domain: 'diagnostics.fair-price.local',
    p_external_id: 'diagnostic-product',
    p_url: 'https://diagnostics.fair-price.local/tovar/extension-health-check',
    p_name: 'Extension Health Check',
    p_price: 10000,
    p_regular_price: 12000,
    p_promo_name: 'Diagnostics',
    p_is_available: true,
  });

  if (rpcError) {
    console.error(`   ❌ Помилка: ${getErrorMessage(rpcError)}\n`);
    process.exit(1);
  }

  console.log('   ✅ RPC record_price працює\n');

  console.log('4) Stats check');
  const [{ count: productsCount, error: productsCountError }, { count: historyCount, error: historyCountError }] =
    await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('price_history').select('*', { count: 'exact', head: true }),
    ]);

  if (productsCountError || historyCountError) {
    console.error(`   ❌ Помилка: ${getErrorMessage(productsCountError || historyCountError)}\n`);
    process.exit(1);
  }

  console.log(`   ✅ products: ${productsCount ?? 'unknown'}`);
  console.log(`   ✅ price_history: ${historyCount ?? 'unknown'}\n`);

  console.log('🎉 Diagnostics passed');
}

main().catch((error) => {
  console.error(`❌ Fatal error: ${getErrorMessage(error)}`);
  process.exit(1);
});

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
