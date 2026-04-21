#!/usr/bin/env node
/**
 * scripts/check-db.mjs
 *
 * Перевіряє кількість товарів у базі та їхній статус
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const projectRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
loadEnvFile(resolve(projectRoot, '.env'));
loadEnvFile(resolve(projectRoot, '.env.local'));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Не встановлені SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('🔍 Перевіряю базу даних...\n');

  // Загальна кількість товарів
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  console.log(`📦 Всього товарів: ${totalProducts}`);

  // Товари за магазинами
  const { data: storeStats } = await supabase
    .from('products')
    .select('store_domain');

  const storeCounts = {};
  for (const item of storeStats || []) {
    storeCounts[item.store_domain] = (storeCounts[item.store_domain] || 0) + 1;
  }

  console.log('\n🏪 Товари за магазинами:');
  for (const [store, count] of Object.entries(storeCounts)) {
    console.log(`   ${store}: ${count}`);
  }

  // Кількість записів у price_history
  const { count: totalHistory } = await supabase
    .from('price_history')
    .select('*', { count: 'exact', head: true });

  console.log(`\n💰 Всього записів про ціни: ${totalHistory}`);

  // Статистика по доступності
  const { data: availStats } = await supabase
    .from('price_history')
    .select('is_available, count', { count: 'exact' });

  const { data: availOnly } = await supabase
    .rpc('get_availability_stats');

  console.log('\n📊 Статистика доступності (останні записи):');
  const availQuery = await supabase
    .from('price_history')
    .select('is_available')
    .order('valid_from', { ascending: false })
    .limit(totalHistory);

  const availCounts = { true: 0, false: 0 };
  for (const item of availQuery.data || []) {
    availCounts[item.is_available ? 'true' : 'false']++;
  }

  console.log(`   Доступні: ${availCounts['true']}`);
  console.log(`   Недоступні: ${availCounts['false']}`);

  // Останні 5 товарів
  console.log('\n📋 Останні 5 товарів:');
  const { data: recent } = await supabase
    .from('products')
    .select('id, name, store_domain, url, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  for (const product of recent || []) {
    const updated = new Date(product.updated_at).toLocaleString('uk-UA');
    console.log(`   ✓ ${product.name} (${product.store_domain})`);
    console.log(`     URL: ${product.url}`);
    console.log(`     Оновлено: ${updated}`);
    console.log('');
  }

  // Поточна дата
  console.log(`\n⏰ Поточний час сервера:`);
  const { data: now } = await supabase.rpc('get_now');
  console.log(`   ${new Date(now).toLocaleString('uk-UA')}`);

  console.log('\n✅ Перевірка завершена!');
}

main().catch((err) => {
  console.error('❌ Помилка:', err.message || err);
  process.exit(1);
});

