import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

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
    version: "1.0.0",
    description: "Автоматичний моніторинг цін та перевірка реальності знижок в українських інтернет-магазинах.",
    author: {
      email: "yuraantonov11@gmail.com"
    },
    icons: {
      "16": "icons/icon_inactive.png",
      "48": "icons/icon_inactive.png",
      "128": "icons/icon_inactive.png"
    },
    action: {
      default_title: "Чесна Ціна",
      default_icon: {
        "16": "icons/icon_inactive.png",
        "48": "icons/icon_inactive.png",
        "128": "icons/icon_inactive.png"
      }
    },
    permissions: [
      "storage",
      "alarms",
      "declarativeNetRequest"
    ],
    host_permissions: [
      "*://dnipro-m.ua/*",
      "*://rozetka.com.ua/*",
      "*://*.supabase.co/*"
    ],
    browser_specific_settings: {
      gecko: {
        id: "fairprice@yuraantonov.com",
        strict_min_version: "109.0"
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