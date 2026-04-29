import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');

test.describe('extension smoke', () => {
  test.skip(!fs.existsSync(extensionPath), 'Build the extension first: npm run build');

  async function launchExtensionContext(): Promise<{ context: BrowserContext; page: Page }> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-price-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    const page = context.pages()[0] ?? await context.newPage();
    return { context, page };
  }

  function dniproFixture() {
    return `<!doctype html>
      <html lang="uk">
        <head>
          <meta charset="utf-8" />
          <meta itemprop="sku" content="FP-DNIPRO-1" />
          <title>Dnipro-M test product</title>
        </head>
        <body>
          <main>
            <h1>Акумуляторний тестовий товар</h1>
            <div class="product-buy-info">
              <div class="product-price__current">1 998 ₴</div>
              <div class="product-price__old">2 460 ₴</div>
            </div>
          </main>
        </body>
      </html>`;
  }

  function rozetkaFixture() {
    return `<!doctype html>
      <html lang="uk">
        <head>
          <meta charset="utf-8" />
          <meta itemprop="sku" content="FP-ROZETKA-1" />
          <title>Rozetka test product</title>
        </head>
        <body>
          <main class="product">
            <div class="product-about__right">
              <h1 class="product__title">Тестовий товар Rozetka</h1>
              <div class="product-price__big">14 999 ₴</div>
              <div class="product-price__small">16 499 ₴</div>
            </div>
          </main>
        </body>
      </html>`;
  }

  async function expectWidgetInjected(page: Page) {
    const mount = page.locator('#fair-price-container');
    await expect(mount).toHaveCount(1);

    await expect
      .poll(async () => {
        return mount.evaluate((node) => node.shadowRoot?.textContent || '');
      }, { timeout: 10_000 })
      .toMatch(/First confirmed price|Є перша підтверджена ціна|Honesty index|Індекс чесності/);
  }

  test('Dnipro-M: injects widget and restores after mount removal', async () => {
    const { context, page } = await launchExtensionContext();
    await page.route('https://dnipro-m.ua/tovar/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: dniproFixture() });
    });

    try {
      await page.goto('https://dnipro-m.ua/tovar/fp-test-product/', { waitUntil: 'domcontentloaded' });
      await expectWidgetInjected(page);

      await page.evaluate(() => document.getElementById('fair-price-container')?.remove());

      await expect
        .poll(async () => page.locator('#fair-price-container').count(), { timeout: 10_000 })
        .toBe(1);
      await expectWidgetInjected(page);
    } finally {
      await context.close();
    }
  });

  test('Rozetka: injects widget through the shared injector path', async () => {
    const { context, page } = await launchExtensionContext();
    await page.route('https://rozetka.com.ua/ua/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: rozetkaFixture() });
    });

    try {
      await page.goto('https://rozetka.com.ua/ua/fp-test-product/p123456/', { waitUntil: 'domcontentloaded' });
      await expectWidgetInjected(page);
    } finally {
      await context.close();
    }
  });
});

