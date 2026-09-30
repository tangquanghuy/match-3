import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, step = 'done', route = 'team') {
  await page.goto('/cover.html');
  await page.evaluate(() => localStorage.removeItem('gems.meta.save'));
  await page.goto('/game.html#team');
  await expect(page.locator('#banner')).toBeVisible({ timeout: 20000 });
  await page.evaluate(async (step) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const gw = metaGateway();
    const save = JSON.parse(gw.exportSaveJson());
    save.hero.level = 25;
    save.onboarding = { step, noviceSummonUsed: false };
    save.currencies.gems = 1000;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, step);
  // Full navigation avoids the active tutorial redirect racing the fixture route.
  await page.goto(`/game.html?dialogFixture=${step}#${route}`);
}

for (const viewport of [{ width: 1600, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`flag picker layout and search ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await fixture(page);
    await page.locator('#banner').click();
    const dialog = page.locator('.banner-picker');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: `artifacts/flag-picker-${viewport.width}.png` });
    await page.locator('#bannerSearch').fill('破碎尖塔');
    await expect(page.locator('[data-banner]:visible')).toHaveCount(1);
    await page.locator('[data-banner="破碎尖塔"]').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#banner')).toBeFocused();
    await expect(page.locator('#bannerCopy')).toHaveText('破碎尖塔');
    await page.locator('#banner').click();
    await page.locator('#bannerSearch').fill('不存在的王国');
    await expect(page.locator('.banner-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test(`guide artwork layout ${viewport.width}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    for (const [step, route, target] of [
      ['battle', 'map', ''], ['gift', 'map', '#railGifts'],
      ['gift', 'gifts', '[data-gift-claim="starter"]'],
      ['summon', 'chests/gems', '[data-open="gem-10"]'],
    ]) {
      // A fresh document removes the preceding tutorial guard before replacing fixtures.
      await fixture(page, step, route);
      const bubble = page.locator('.tut-bubble');
      await expect(bubble).toBeVisible({ timeout: 20000 });
      await expect(page.locator('.tut-card')).toHaveCSS('position', 'relative');
      expect(await page.locator('.tut-card').evaluate(el => getComputedStyle(el, '::before').borderImageSource)).toContain('frame');
      await page.waitForTimeout(500);
      const box = (await bubble.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      if (target) {
        const t = (await page.locator(target).boundingBox())!;
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y + t.height).toBeLessThanOrEqual(viewport.height);
        await page.locator(target).click({ trial: true });
        expect(box.x >= t.x + t.width || box.x + box.width <= t.x || box.y >= t.y + t.height || box.y + box.height <= t.y).toBe(true);
      }
      await page.screenshot({ animations: 'disabled', path: `artifacts/guide-${step}-${route.replace('/', '-')}-${viewport.width}.png` });
    }
  });
}

test('cover preloads guide artwork before entry and removes repeated disclaimers', async ({ page }) => {
  const images = new Set<string>();
  page.on('request', req => { if (req.url().includes('/tutorial/')) images.add(req.url()); });
  await page.route('**/preload-manifest.json', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/cover.html');
  await expect(page.locator('#enterBtn')).toHaveText('进入游戏');
  expect([...images].some(url => url.includes('frame.webp'))).toBe(true);
  expect([...images].some(url => url.includes('guide.webp'))).toBe(true);
  expect([...images].some(url => url.includes('battle-loading.webp'))).toBe(true);
  await expect(page.locator('body')).not.toContainText('社区同人 · 免费三消 RPG');
  await expect(page.locator('.cover-foot')).not.toContainText('非商业项目');
  await page.screenshot({ animations: 'disabled', path: 'artifacts/cover-clean.png' });
});
