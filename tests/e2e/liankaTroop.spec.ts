import { expect, test } from '@playwright/test';

test('Lianka is discoverable with the final spell, traits and original portrait', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/game.html#troop');
  await expect(page.locator('#collection')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-tab="all"]').click();
  await page.locator('#collectionSearch').fill('Lianka');
  const card = page.locator('.collection-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Lianka');
  await card.click();
  const detail = page.locator('#detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('日轮坠灭');
  await expect(detail).toContainText('普通宝石');
  for (const name of ['不熄之躯', '黑曜法衣', '蚀日魔焰']) {
    await expect(page.locator('#traitList')).toContainText(name);
  }
  const image = page.locator('#portraitArt');
  await expect(image).toHaveAttribute('src', /lianka\.webp/);
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.locator('#spellName').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/lianka-integration.png', fullPage: true });
});
