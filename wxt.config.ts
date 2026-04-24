import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

const firefoxBinaryPath = process.env.WXT_FIREFOX_BINARY || 'C:/Program Files/Firefox Developer Edition/firefox.exe';
const devStartUrl = process.env.WXT_START_URL || 'https://dnipro-m.ua/tovar/akumulyatorna-lancyugova-pila-dms-201bc/';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Чесна Ціна",
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
      "*://*.supabase.co/*"
    ],
    browser_specific_settings: {
      gecko: {
        id: "fairprice@yuraantonov.com",
        strict_min_version: "142.0",
        ...({
          data_collection_permissions: {
            required: ["none"],
            optional: []
          }
        } as Record<string, unknown>)
      }
    }
  },
  webExt: {
    startUrls: [devStartUrl],
    binaries: {
      firefox: firefoxBinaryPath
    }
  }
});