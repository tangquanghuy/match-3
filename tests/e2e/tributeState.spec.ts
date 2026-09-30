import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
});

test('a new account with legacy-zero tribute shows accumulating and a live midnight countdown', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date(2026, 8, 29, 23, 6) });
  await page.goto('/game.html#map');
  await expect(page.locator('.map-shell')).toBeVisible();
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.createdAt = Date.now() - 6 * 60_000;
    save.hero.level = 1;
    save.mapSeenLevel = 1;
    save.kingdoms = { '破碎尖塔': { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 } };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#dailyTribute')).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#dailyTributeTag')).toHaveText('累积中');
  await page.locator('#dailyTribute').click();
  await expect(page.locator('#tributeRows')).toContainText('进贡王国 · 0');
  await expect(page.locator('#tributeConfirm')).toBeDisabled();
  const countdown = page.locator('#tributeRows [data-tribute-at]');
  await expect(countdown).toHaveText(/5[34]:\d{2}/);
  const seconds = (text: string) => { const [m, s] = text.split(':').map(Number); return m! * 60 + s!; };
  const before = seconds((await countdown.textContent())!);
  await page.clock.fastForward(2000);
  await expect.poll(async () => seconds((await countdown.textContent())!)).toBeLessThan(before);
  await page.screenshot({ path: 'artifacts/tribute-empty-mobile.png' });
  await page.locator('#tributeClose').click();
  await page.evaluate(() => { location.hash = '#team'; });
  await expect(page.locator('.map-shell')).toHaveCount(0);
  await page.clock.fastForward(5000);
  expect(errors).toEqual([]);
});

test('an empty capped window advances, updates the open treasury, and collects exactly once despite a slow reply', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(2026, 8, 29, 12) });
  await page.goto('/game.html#map');
  await expect(page.locator('.map-shell')).toBeVisible();
  const start = await page.evaluate(async () => {
    const path = '/src/meta/systems/tribute.ts';
    const { tributeHourHit } = await import(path) as typeof import('../../src/meta/systems/tribute');
    for (let hour = 490_000; hour < 491_000; hour++) {
      if (Array.from({ length: 12 }, (_, i) => hour + i + 1).every(h => !tributeHourHit('破碎尖塔', h, 1))
        && tributeHourHit('破碎尖塔', hour + 13, 1)) {
        const start = hour * 3_600_000;
        const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
        save.createdAt = start;
        save.hero.level = 1;
        save.mapSeenLevel = 1;
        save.kingdoms = { '破碎尖塔': { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: start } };
        localStorage.setItem('gems.meta.save', JSON.stringify(save));
        return start;
      }
    }
    throw new Error('Missing tribute fixture');
  });
  await page.clock.setSystemTime(new Date(start + 13 * 3_600_000 - 30_000));
  await page.reload();
  await expect(page.locator('#dailyTributeTag')).toHaveText('累积中');
  await page.locator('#dailyTribute').click();
  await expect(page.locator('#tributeRows')).toContainText('进贡王国 · 0');
  await expect(page.locator('#tributeConfirm')).toBeDisabled();
  await page.clock.fastForward(31_000);
  await expect(page.locator('#tributeRows .tr-row')).toHaveCount(1);
  await expect(page.locator('#tributeConfirm')).toBeEnabled();
  await expect(page.locator('#dailyTributeTag')).toHaveText('可收');
  const before = await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(path) as typeof import('../../src/meta/gateway');
    const gateway = metaGateway();
    const transport = (gateway as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
    const original = transport.send.bind(transport);
    transport.send = async command => {
      const reply = await original(command);
      if (command.type === 'collectAllTribute') {
        document.documentElement.dataset.tributeClaims = String(Number(document.documentElement.dataset.tributeClaims ?? 0) + 1);
        await new Promise<void>(resolve => {
          (window as unknown as { releaseTribute: () => void }).releaseTribute = resolve;
        });
      }
      return reply;
    };
    return gateway.current().currencies.gold;
  });
  const expectedGold = Number(await page.locator('#tributeRows .tr-total.gold b').getAttribute('data-count'));
  await page.locator('#tributeConfirm').click();
  await expect(page.locator('html')).toHaveAttribute('data-tribute-claims', '1');
  await page.clock.fastForward(2000);
  await expect(page.locator('#tributeConfirm')).toBeDisabled();
  await page.evaluate(() => { (window as unknown as { releaseTribute: () => void }).releaseTribute(); });
  await expect(page.locator('#tributeConfirm')).toHaveClass(/is-done/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.gold)).toBe(before + expectedGold);
  await page.clock.fastForward(1000);
  await expect(page.locator('#tributeConfirm')).toHaveClass(/is-done/);
  await page.clock.fastForward(2000);
  await page.locator('#dailyTribute').click();
  await expect(page.locator('#tributeConfirm')).toBeDisabled();
  await expect(page.locator('#dailyTributeTag')).toHaveText('累积中');
  await expect(page.locator('#tributeRows [data-tribute-at]')).not.toHaveText('00:00');
  await expect(page.locator('html')).toHaveAttribute('data-tribute-claims', '1');
  expect(errors).toEqual([]);
});
