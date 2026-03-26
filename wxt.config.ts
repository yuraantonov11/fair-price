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
    permissions: ["storage", "alarms"],
    host_permissions: [
      "*://dnipro-m.ua/*",
      "*://rozetka.com.ua/*"
    ],
  },
  webExt: {
    startUrls: [
      "https://dnipro-m.ua/tovar/sadovij-podribnyuvach-gsb-38/",
    ],
  },
});