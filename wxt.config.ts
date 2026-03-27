import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Чесна Ціна (Fair Price)",
    version: "1.0.0",
    description: "Інтелектуальна система моніторингу цін та детекції маніпулятивних знижок",
    action: {
      default_title: "Чесна Ціна",
      default_icon: {
        "16": "/icons/icon_inactive.png",
        "48": "/icons/icon_inactive.png",
        "128": "/icons/icon_inactive.png"
      }
    },
    permissions: [
      "storage",
      "alarms",
      "declarativeNetRequest" // Обов'язково для перехоплення прихованих цін у JSON
    ],
    host_permissions: [
      "*://dnipro-m.ua/*",
      "*://rozetka.com.ua/*"
    ],
    browser_specific_settings: {
      gecko: {
        id: "fairprice@yuraantonov.com",
        strict_min_version: "109.0"
      }
    }
  },
  webExt: {
    binaries: {
      firefox: 'C:/Program Files/Firefox Developer Edition/firefox.exe'
    }
  }
});