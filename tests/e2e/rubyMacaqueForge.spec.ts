import { expect, test } from '@playwright/test';

test('红宝石猕猴不在宝石商店上架，熔炉珍藏显示 150 万魂和 200 万金币', async ({ page }) => {
  await page.goto('/game.html#shop/gems/weapon/gw_TheRubyMacaque');
  await expect(page.locator('.gem-shop-detail')).toContainText('该武器暂未上架', { timeout: 15_000 });
  await expect(page.locator('[data-buy-weapon="gw_TheRubyMacaque"]')).toHaveCount(0);

  await page.goto('/game.html#weapons/forge');
  await expect(page.locator('[data-weapon-tab="forge"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-weapon-search]').fill('红宝石猕猴');
  const card = page.locator('[data-recipe-id="gw_TheRubyMacaque"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('1,500,000 魂 · 2,000,000 金');
  await expect(page.locator('.recipe-group-label')).toContainText('珍藏配方');
});
