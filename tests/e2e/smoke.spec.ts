import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.cwd(), '.output-e2e/chrome-mv3');

test.describe('extension smoke', () => {
  test.beforeAll(() => expect(fs.existsSync(extensionPath), 'Run npm run build:e2e').toBe(true));
  test.beforeEach(async () => { await fetch('http://127.0.0.1:38765/control'); });

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
        return mount.locator('.fair-price-app').innerText();
      }, { timeout: 10_000 })
      .toMatch(/First confirmed price|Є перша підтверджена ціна|Honesty index|Індекс чесності/i);
  }

  test('all toolbar icon states are accepted by the browser', async () => {
    const { context, page } = await launchExtensionContext();
    await page.route('https://dnipro-m.ua/tovar/**', route => route.fulfill({ contentType: 'text/html', body: dniproFixture() }));
    type IconUpdate = { error: string | null; sizes: number[] };
    type IconProbe = typeof globalThis & { __iconUpdates: IconUpdate[] };
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      await worker.evaluate(() => {
        const updates: IconUpdate[] = [];
        (globalThis as IconProbe).__iconUpdates = updates;
        const setIcon = chrome.action.setIcon.bind(chrome.action);
        chrome.action.setIcon = ((details, callback?: () => void) => {
          setIcon(details, () => {
            updates.push({
              error: chrome.runtime.lastError?.message ?? null,
              sizes: Object.values(details.imageData ?? {}).map((image: ImageData) => image.width),
            });
            callback?.();
          });
        }) as typeof chrome.action.setIcon;
      });

      // Empty, first observation, normal price, suspicious spike: exercise the
      // actual content -> background -> native setIcon path for all four assets.
      const scenarios = ['fp_records=0', 'fp_records=1', 'fp_records=3', 'fp_records=3&fp_scenario=spike'];
      for (const [index, scenario] of scenarios.entries()) {
        await page.goto(`https://dnipro-m.ua/tovar/fp-test-product/?fp_test=1&${scenario}`);
        await expect.poll(() => worker.evaluate(() => (globalThis as IconProbe).__iconUpdates.length)).toBe(index + 1);
        const update = await worker.evaluate(() => (globalThis as IconProbe).__iconUpdates.at(-1)!);
        expect(update.error).toBeNull();
        expect(update.sizes).toEqual([16, 32]);
      }
    } finally { await context.close(); }
  });

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

  for (const scenario of ['schema', 'access', 'network'] as const) {
    test(`Dnipro-M: ${scenario} failure is visible and retry recovers`, async () => {
      await fetch(`http://127.0.0.1:38765/control?failure=${scenario}`);
      const { context, page } = await launchExtensionContext();
      await page.route('https://dnipro-m.ua/tovar/**', route => route.fulfill({ contentType: 'text/html', body: dniproFixture() }));
      try {
        await page.goto('https://dnipro-m.ua/tovar/fp-test-product/');
        await expect(page.locator('[data-history-state="error"]')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('alert')).toContainText(/Could not load|Не вдалося завантажити/);
        const stats = await (await fetch('http://127.0.0.1:38765/stats')).json();
        expect(stats.historyCalls).toBe(scenario === 'network' ? 3 : 1);
        await fetch('http://127.0.0.1:38765/control');
        await page.getByRole('button', { name: /Retry|Повторити/ }).click();
        await expectWidgetInjected(page);
        await expect(page.locator('[data-history-state="error"]')).toHaveCount(0);
      } finally { await context.close(); }
    });
  }

  test('successful empty history is distinct from backend failure', async () => {
    await fetch('http://127.0.0.1:38765/control?empty=1');
    const { context, page } = await launchExtensionContext();
    await page.route('https://dnipro-m.ua/tovar/**', route => route.fulfill({ contentType: 'text/html', body: dniproFixture() }));
    try {
      await page.goto('https://dnipro-m.ua/tovar/fp-test-product/');
      await expect(page.locator('[data-history-state="empty"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /Retry|Повторити/ })).toHaveCount(0);
    } finally { await context.close(); }
  });

  test('a failed submission still displays existing trusted history', async () => {
    await fetch('http://127.0.0.1:38765/control?saveFails=1');
    const { context, page } = await launchExtensionContext();
    await page.route('https://dnipro-m.ua/tovar/**', route => route.fulfill({ contentType: 'text/html', body: dniproFixture() }));
    try {
      await page.goto('https://dnipro-m.ua/tovar/fp-test-product/');
      await expectWidgetInjected(page);
      await expect(page.getByRole('status')).toContainText(/Could not submit|Не вдалося надіслати/);
    } finally { await context.close(); }
  });

  test('SPA navigation discards a slow response for the previous product', async () => {
    await fetch('http://127.0.0.1:38765/control?delayFirst=1');
    const { context, page } = await launchExtensionContext();
    await page.route('https://dnipro-m.ua/tovar/**', route => route.fulfill({ contentType: 'text/html', body: dniproFixture() }));
    try {
      await page.goto('https://dnipro-m.ua/tovar/first/');
      await expect.poll(async () => (await (await fetch('http://127.0.0.1:38765/stats')).json()).historyCalls).toBe(1);
      await page.evaluate(() => {
        history.pushState({}, '', '/tovar/second/');
        document.querySelector('h1')!.textContent = 'Second product';
        document.querySelector('.product-price__current')!.textContent = '7 777 ₴';
      });
      await expectWidgetInjected(page);
      await expect(page.locator('#fair-price-container .fair-price-app')).toContainText('7777');
      await expect.poll(async () => (await (await fetch('http://127.0.0.1:38765/stats')).json()).completedFirst).toBe(true);
      await expect(page.locator('#fair-price-container .fair-price-app')).toContainText('7777');
      await expect(page.locator('#fair-price-container')).toHaveCount(1);
    } finally { await context.close(); }
  });
});

