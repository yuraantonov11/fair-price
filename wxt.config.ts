import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'module';
import { loadEnv } from 'vite';
import { isPublicBackendKey } from './src/utils/backendConfig';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

const firefoxBinaryPath = process.env.WXT_FIREFOX_BINARY || 'C:/Program Files/Firefox Developer Edition/firefox.exe';
const devStartUrl = process.env.WXT_START_URL || 'https://dnipro-m.ua/tovar/akumulyatorna-lancyugova-pila-dms-201bc/';
const e2e = process.env.FP_E2E === '1';
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const backend = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const baseline = process.env.VITE_BASELINE_API_URL ?? env.VITE_BASELINE_API_URL;
const backendOrigin = backend ? new URL(backend).origin : undefined;
const publicKey = process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
if (publicKey && !isPublicBackendKey(publicKey)) throw new Error('Refusing to bundle a privileged or invalid Supabase key');

export default defineConfig({
  srcDir: 'src',
  outDir: e2e ? '.output-e2e' : '.output',
  zip: {
    dotSources: true,
    includeSources: ['src/**', 'public/**', 'scripts/**', 'supabase/functions/**', 'supabase/migrations/**', 'package*.json', 'tsconfig.json',
      'vitest.config.ts', 'playwright.config.ts', 'wxt.config.ts', 'README.md', '.env.example',
      'docs/crawl-prices.md', 'docs/privacy-policy.md', 'docs/archive.md'],
    excludeSources: ['**/.env', '**/.env.local', '**/.env.*.local', '**/node_modules/**',
      'src/**/.env*', 'public/**/.env*', 'scripts/**/.env*', 'supabase/**/.env*'],
  },
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: { port: 3000, strictPort: true },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    css: { devSourcemap: true, transformer: 'lightningcss' },
  }),
  manifest: ({ command }) => ({
    name: command === 'serve' ? "Чесна Ціна (Dev)" : "Чесна Ціна",
    short_name: "FairPrice",
    version,
    description: "Автоматичний моніторинг цін та перевірка реальності знижок в українських інтернет-магазинах.",
    author: "Yurii Antonov <yuraantonov11@gmail.com>" as unknown as { email: string },
    icons: {
      "16": "icons/icon_inactive_16.png",
      "48": "icons/icon_inactive_48.png",
      "128": "icons/icon_inactive_128.png"
    },
    action: {
      default_title: "Чесна Ціна",
      default_icon: {
        "16": "icons/icon_inactive_16.png",
        "48": "icons/icon_inactive_48.png",
        "128": "icons/icon_inactive_128.png"
      }
    },
    permissions: [
      "storage"
    ],
    host_permissions: [
      "*://dnipro-m.ua/*",
      "*://rozetka.com.ua/*",
      ...(backendOrigin ? [`${backendOrigin}/*`] : []),
      ...(baseline ? [`${new URL(baseline).origin}/*`] : []),
      ...(e2e ? ['http://127.0.0.1/*'] : [])
    ],
    browser_specific_settings: {
      gecko: {
        id: "fairprice@yuraantonov.com",
        strict_min_version: "142.0",
        ...({
          data_collection_permissions: {
            required: ["browsingActivity", "websiteContent"],
            optional: []
          }
        } as Record<string, unknown>)
      }
    }
  }),
  webExt: {
    startUrls: [devStartUrl],
    binaries: {
      firefox: firefoxBinaryPath
    }
  }
});
