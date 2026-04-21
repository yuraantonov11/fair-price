#!/usr/bin/env node
/**
 * scripts/agent-doctor.mjs
 *
 * Fast preflight check for local/AI runs.
 * - mode=core: checks env for extension runtime/dev
 * - mode=crawl: checks env for crawler writes to Supabase
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const mode = String(args.mode || 'core');

if (mode !== 'core' && mode !== 'crawl') {
  console.error('❌ Invalid mode. Use --mode core or --mode crawl');
  process.exit(1);
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const checks = [];

checks.push(checkNodeVersion());
checks.push(checkFile('.env.example', 'missing .env.example template'));

if (mode === 'core') {
  checks.push(checkAny(['VITE_SUPABASE_URL'], 'VITE_SUPABASE_URL is required for extension background Supabase calls'));
  checks.push(checkAny(['VITE_SUPABASE_ANON_KEY'], 'VITE_SUPABASE_ANON_KEY is required for extension background Supabase calls'));
}

if (mode === 'crawl') {
  checks.push(checkAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'], 'SUPABASE_URL (or VITE_SUPABASE_URL) is required for crawler'));
  checks.push(checkAny(['SUPABASE_SERVICE_ROLE_KEY'], 'SUPABASE_SERVICE_ROLE_KEY is required for crawler RPC writes'));
}

const failed = checks.filter((c) => !c.ok);

console.log(`\nFairPrice doctor (mode=${mode})`);
for (const c of checks) {
  const mark = c.ok ? 'OK ' : 'ERR';
  console.log(`[${mark}] ${c.message}`);
}

if (failed.length > 0) {
  console.error('\nPreflight failed. Fix ENV/config and rerun.');
  process.exit(1);
}

console.log('\nPreflight passed.');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      result[key] = argv[i + 1] || true;
      i++;
    }
  }
  return result;
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

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (Number.isNaN(major) || major < 20) {
    return {
      ok: false,
      message: `Node.js >= 20 required, current=${process.versions.node}`,
    };
  }
  return {
    ok: true,
    message: `Node.js version ${process.versions.node}`,
  };
}

function checkFile(fileName, failMessage) {
  const filePath = resolve(process.cwd(), fileName);
  return existsSync(filePath)
    ? { ok: true, message: `${fileName} found` }
    : { ok: false, message: failMessage };
}

function checkAny(keys, failMessage) {
  const found = keys.find((k) => {
    const value = process.env[k];
    return value !== undefined && String(value).trim().length > 0;
  });

  if (!found) {
    return {
      ok: false,
      message: `${failMessage} (expected one of: ${keys.join(', ')})`,
    };
  }

  return {
    ok: true,
    message: `${found} is set`,
  };
}
