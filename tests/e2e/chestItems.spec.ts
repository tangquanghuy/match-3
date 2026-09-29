import { expect, test } from '@playwright/test';

/** 开箱：开几箱发几张牌；材料牌卡面画材料图，不走部队特写 */
test('宝石十连发满 10 张牌，材料牌显示材料图', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/game.html#chests/gems');
  const ten = page.locator('[data-open="gem-10"]');
  await expect(ten).toBeEnabled({ timeout: 20_000 });
  // 连开几次，直到本批里至少有一张材料牌（宝石箱 20% 出材料）
  let itemCount = 0;
  for (let attempt = 0; attempt < 4 && itemCount === 0; attempt++) {
    await ten.click();
    const modal = page.locator('#summonModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#summonCards .summon-card')).toHaveCount(10);
    await expect(page.locator('#summonCounter')).toHaveText('0 / 10');
    itemCount = await page.locator('#summonCards .card-face.is-item').count();
    await expect(modal).toHaveClass(/is-ready/, { timeout: 15_000 });
    if (itemCount === 0) {
      await page.locator('#summonSkip').click();
      await expect(async () => {
        const slam = page.locator('#legendSlam');
        if (await slam.isVisible()) await slam.click({ force: true });
        await expect(modal).toHaveClass(/is-complete/, { timeout: 1_000 });
      }).toPass({ timeout: 60_000 });
      await page.locator('#summonAction').click();
      await page.evaluate(async () => {
        const load = (path: string) => import(/* @vite-ignore */ path);
        const { metaGateway } = await load('/src/meta/gateway/index.ts');
        (metaGateway() as { current(): { currencies: { gems: number } } }).current().currencies.gems += 1500;
      });
      await page.reload();
      await expect(ten).toBeEnabled();
    }
  }
  expect(itemCount).toBeGreaterThan(0);
  const item = page.locator('#summonCards .summon-card:has(.card-face.is-item)').first();
  await item.click();
  await expect(item).toHaveClass(/is-revealed/, { timeout: 10_000 });
  await expect(page.locator('#legendSlam')).toBeHidden();
  await expect(item.locator('.card-item-art')).toBeVisible();
  await expect(item).not.toHaveClass(/is-flipping/, { timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/chest-item-card-1600.png' });
  // 全部翻开后再拍一张整批效果
  await page.locator('#summonSkip').click();
  await expect(async () => {
    const slam = page.locator('#legendSlam');
    if (await slam.isVisible()) await slam.click({ force: true });
    await expect(page.locator('#summonModal')).toHaveClass(/is-complete/, { timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/chest-item-batch-1600.png' });
});
