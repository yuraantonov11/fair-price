#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadEnvFile('.env');
loadEnvFile('.env.local');

const args = process.argv.slice(2);
const modeIndex = args.indexOf('--mode');
const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'core';

if (mode !== 'core' && mode !== 'crawl') {
  console.error('❌ Invalid mode. Use --mode core or --mode crawl');
  process.exit(1);
}

const checks = [];

checks.push(() => {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (!Number.isFinite(major) || major < 20) {
    return { ok: false, message: `Node.js 20+ is required (current: ${process.versions.node})` };
  }
  return { ok: true, message: `Node.js ${process.versions.node}` };
});

checks.push(() =>
  existsSync(resolve(process.cwd(), '.env.example'))
    ? { ok: true, message: '.env.example exists' }
    : { ok: false, message: '.env.example is missing' }
);

if (mode === 'core') {
  checks.push(checkAny(['VITE_SUPABASE_URL'], 'VITE_SUPABASE_URL is required for extension background Supabase calls'));
  checks.push(checkAny(['VITE_SUPABASE_ANON_KEY'], 'VITE_SUPABASE_ANON_KEY is required for extension background Supabase calls'));
}

if (mode === 'crawl') {
  checks.push(checkAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'], 'SUPABASE_URL (or VITE_SUPABASE_URL) is required for crawler'));
  checks.push(checkAny(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY is required for crawler RPC writes'));
}

console.log(`🩺 Agent doctor (${mode})`);

let hasFailures = false;
for (const runCheck of checks) {
  const result = runCheck();
  if (result.ok) {
    console.log(`✅ ${result.message}`);
  } else {
    hasFailures = true;
    console.error(`❌ ${result.message}`);
  }
}

if (hasFailures) {
  process.exit(1);
}

console.log('✅ Preflight checks passed');

function checkAny(keys, errorMessage) {
  return () => {
    for (const key of keys) {
      const value = process.env[key];
      if (typeof value === 'string' && value.trim()) {
        return { ok: true, message: `${key} is set` };
      }
    }
    return { ok: false, message: errorMessage };
  };
}

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
