import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/wxt/bin/wxt.mjs', 'build'], {
  stdio: 'inherit', env: { ...process.env, FP_E2E: '1', VITE_SUPABASE_URL: 'http://127.0.0.1:38765',
    VITE_SUPABASE_ANON_KEY: 'e2e-only-not-a-real-key', VITE_BASELINE_API_URL: '' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
