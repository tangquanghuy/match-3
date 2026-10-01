import { expect, test } from '@playwright/test';

test('零黄金的1级玩家卡按逐槽配方解锁，预览与实际扣石一致', async ({ page }) => {
  await page.goto('/game.html#troop/6000');
  await expect(page.locator('#detail')).toBeVisible();
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.collection['6000'] = { level: 1, ascension: 0, copies: 0, locked: false, traits: [false, false, false] };
    save.currencies.gold = 0;
    save.materials.traitstones = { 'minor:blue': 42, 'major:blue': 12, 'runic:blue': 4, 'arcane:blue:blue': 1 };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#unlockCost')).toContainText('初级水之石 ×10');
  await expect(page.locator('#unlockCost')).toContainText('高级水之石 ×4');
  await expect(page.locator('#unlockCost [data-icon="coin"]')).toHaveCount(0);
  for (let slot = 0; slot < 3; slot++) {
    await expect(page.locator('#unlock')).toBeEnabled();
    if (slot === 2) await expect(page.locator('#unlockCost')).toContainText('秘法坚毅属性石 ×1');
    await page.locator('#unlock').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).collection['6000'].traits.filter(Boolean).length)).toBe(slot + 1);
  }
  await expect(page.locator('#unlock')).toBeDisabled();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
  expect(data.currencies.gold).toBe(0);
  expect(data.collection['6000'].level).toBe(1);
  expect(Object.values(data.materials.traitstones).every(n => n === 0)).toBe(true);
});
