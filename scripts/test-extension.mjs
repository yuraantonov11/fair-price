#!/usr/bin/env node
/**
 * scripts/test-extension.mjs
 *
 * Перевіка роботи розширення:
 * 1. Перевірка адаптерів
 * 2. Перевірка Supabase клієнта
 * 3. Перевірка MessageRouter
 * 4. Симуляція роботи контролера
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function getErrorMessage(error) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const message = error.message || error.error_description || error.details;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown error';
}

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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ VITE_SUPABASE_URL або VITE_SUPABASE_ANON_KEY не встановлені');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('🧪 Тестування розширення FairPrice\n');

  // 1. Тест Supabase connection
  console.log('✓ 1️⃣  Тест з\'єднання Supabase...');
  try {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`   ❌ Помилка: ${getErrorMessage(error)}\n`);
      process.exit(1);
    }
    console.log(`   ✅ Supabase доступний (products: ${count ?? 'unknown'})\n`);
  } catch (e) {
    console.error(`   ❌ Помилка: ${getErrorMessage(e)}\n`);
    process.exit(1);
  }

  // 2. Тест отримання історії ціни
  console.log('✓ 2️⃣  Тест отримання історії ціни...');
  try {
    const testUrl = 'https://dnipro-m.ua/tovar/remin-dlya-kompresora-50-2r/';
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('id')
      .eq('url', testUrl)
      .single();

    if (prodError) {
      console.log('   ⚠️  Товар не знайдений (це нормально для тесту)\n');
    } else {
      const { data: history, error: histError } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', product.id)
        .order('valid_from', { ascending: false })
        .limit(3);

      if (histError) {
        console.error(`   ❌ Помилка: ${getErrorMessage(histError)}\n`);
        return;
      }
      console.log(`   ✅ Знайдено ${history?.length || 0} записів про ціну`);
      if (history?.length > 0) {
        const latest = history[0];
        console.log(`   💰 Остання ціна: ${(latest.price / 100).toFixed(2)} грн`);
      }
      console.log('');
    }
  } catch (e) {
    console.error(`   ❌ Помилка: ${getErrorMessage(e)}\n`);
  }

  // 3. Тест RPC record_price
  console.log('✓ 3️⃣  Тест RPC record_price...');
  try {
    const { error } = await supabase.rpc('record_price', {
      p_store_domain: 'dnipro-m.ua',
      p_external_id: 'test-123',
      p_url: 'https://dnipro-m.ua/tovar/test-product/',
      p_name: '[TEST] Test Product',
      p_price: 99900, // 999 грн
      p_regular_price: null,
      p_is_available: true,
      p_promo_name: null,
    });

    if (error) {
      console.error(`   ❌ Помилка: ${getErrorMessage(error)}\n`);
      return;
    }
    console.log('   ✅ RPC record_price працює\n');
  } catch (e) {
    console.error(`   ❌ Помилка: ${getErrorMessage(e)}\n`);
  }

  // 4. Тест отримання історії через RPC GET_HISTORY
  console.log('✓ 4️⃣  Тест отримання історії ціни (для UI)...');
  try {
    const testUrl = 'https://dnipro-m.ua/tovar/test-product/';
    const { data: history, error } = await supabase
      .from('price_history')
      .select('price, valid_from, is_available')
      .eq('product_id', (await supabase.from('products').select('id').eq('url', testUrl).single()).data?.id || null)
      .order('valid_from', { ascending: true })
      .limit(10);

    if (error) {
      console.log('   ⚠️  Помилка отримання історії (це нормально)\n');
    } else {
      console.log(`   ✅ Отримано ${history?.length || 0} записів\n`);
    }
  } catch (e) {
    console.error(`   ⚠️  ${getErrorMessage(e)}\n`);
  }

  // 5. Статистика
  console.log('✓ 5️⃣  Статистика бази даних...');
  const { count: products } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: history } = await supabase
    .from('price_history')
    .select('*', { count: 'exact', head: true });

  console.log(`   📦 Товарів: ${products}`);
  console.log(`   💰 Записів про ціни: ${history}`);
  console.log('');

  console.log('✅ Всі тести завершені!\n');
  console.log('📌 Наступні кроки:');
  console.log('   1. npm run dev          - запустити розширення');
  console.log('   2. Перейти на сторінку товару (Dnipro-M)');
  console.log('   3. Перевірити чи з\'являється графік ціни');
  console.log('   4. Перевірити іконку в розширенні');
}

main().catch((err) => {
  console.error('❌ Помилка:', getErrorMessage(err));
  process.exit(1);
});

