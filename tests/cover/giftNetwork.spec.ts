import { expect, test, type Page } from '@playwright/test';
import type { LocalTransport } from '../../src/meta/gateway/transport';
import type { MetaCommand } from '../../src/meta/server/protocol';

declare global {
  interface Window { giftBackend?: LocalTransport }
}

async function fixture(page: Page): Promise<void> {
  await page.route(/fonts\.(?:googleapis|gstatic)\.com/, route => route.abort());
  await page.route('**/api/meta/save', async route => {
    const reply = await page.evaluate(async () => {
      if (!window.giftBackend) {
        const path = '/src/meta/gateway/transport.ts';
        const { LocalTransport, memoryStorage } = await import(/* @vite-ignore */ path);
        const backend: LocalTransport = new LocalTransport(memoryStorage(), { fresh: 'demo' });
        const { save } = await backend.load();
        save.onboarding.step = 'gift';
        save.gifts.claimed = [];
        save.currencies.gems = 0;
        save.character = { name: '网络测试旅者', gender: 'male', portrait: 'default:male' };
        await backend.send({ type: 'dev.importSave', args: { json: JSON.stringify(save) } });
        window.giftBackend = backend;
      }
      return window.giftBackend.load();
    });
    await route.fulfill({ json: reply });
  });
}

for (const width of [1440, 390]) {
  test(`slow starter gift shows network status, prevents duplicates and advances once (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await fixture(page);
    let claims = 0;
    await page.route('**/api/meta/command', async route => {
      const command = route.request().postDataJSON() as MetaCommand;
      if (command.type === 'claimGift') {
        claims++;
        await new Promise(resolve => setTimeout(resolve, 5500));
      }
      const reply = await page.evaluate(command => window.giftBackend!.send(command), command);
      await route.fulfill({ json: reply });
    });
    await page.goto('/game.html#gifts');
    const claim = page.locator('[data-gift-claim="starter"]');
    const indicator = page.locator('.network-wait');
    await expect(claim).toBeEnabled();
    await expect(indicator).toBeHidden();
    await claim.click();
    await expect(claim).toBeDisabled();
    await claim.dispatchEvent('click');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('等待网络中...');
    await expect(page.locator('#tutTitle')).toHaveText('领取见面礼');
    const bounds = await indicator.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/gift-network-${width}.png` });
    await expect(page.locator('#tutTitle')).toHaveText('召唤伙伴');
    await expect(indicator).toBeHidden();
    const { save } = await page.evaluate(() => window.giftBackend!.load());
    expect(save.currencies.gems).toBe(1000);
    expect(save.gifts.claimed.filter(id => id === 'starter')).toHaveLength(1);
    expect(claims).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('failed gift request restores the button and a manual retry succeeds', async ({ page }) => {
  await fixture(page);
  let claims = 0;
  // Hold the reply until the delayed indicator is observed, rather than racing an 800ms window.
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>(resolve => { releaseFailure = resolve; });
  await page.route('**/api/meta/command', async route => {
    const command = route.request().postDataJSON() as MetaCommand;
    if (command.type === 'claimGift' && ++claims === 1) {
      await failureGate;
      await route.fulfill({ status: 503, body: 'network failure' });
      return;
    }
    const reply = await page.evaluate(command => window.giftBackend!.send(command), command);
    await route.fulfill({ json: reply });
  });
  await page.goto('/game.html#gifts');
  const claim = page.locator('[data-gift-claim="starter"]');
  await claim.click();
  try {
    await expect(claim).toBeDisabled();
    await expect(page.locator('.network-wait')).toBeVisible();
  } finally { releaseFailure(); }
  await expect(claim).toBeEnabled();
  await expect(page.locator('.network-wait')).toBeHidden();
  await expect(page.locator('#tutTitle')).toHaveText('领取见面礼');
  await claim.click();
  await expect(page.locator('#tutTitle')).toHaveText('召唤伙伴');
  expect(claims).toBe(2);
  expect((await page.evaluate(() => window.giftBackend!.load())).save.currencies.gems).toBe(1000);
});

test('lost reply after commit resynchronizes without replaying the reward', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  let claims = 0;
  await page.route('**/api/meta/command', async route => {
    const command = route.request().postDataJSON() as MetaCommand;
    const reply = await page.evaluate(command => window.giftBackend!.send(command), command);
    if (command.type === 'claimGift') {
      claims++;
      await route.abort('connectionreset');
    } else await route.fulfill({ json: reply });
  });
  await page.goto('/game.html#gifts');
  await page.locator('[data-gift-claim="starter"]').click();
  await expect(page.locator('#tutTitle')).toHaveText('召唤伙伴');
  await expect(page.locator('.network-wait')).toBeHidden();
  expect(claims).toBe(1);
  expect((await page.evaluate(() => window.giftBackend!.load())).save.currencies.gems).toBe(1000);
  expect(errors).toEqual([]);
});
