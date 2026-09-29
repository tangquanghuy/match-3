import { expect, test, type Page } from '@playwright/test';

/**
 * 新手引导全流程：全新档 → 引导遮罩拦截 → 战斗加载页 → 试炼战（自动） → 结算 → 回地图
 * → 馈赠领见面礼 → 宝箱页新手十连（第 10 张异界来客）→ 引导结束。
 */
async function newGame(page: Page): Promise<void> {
  await page.goto('/game.html#map');
  await expect(page.locator('.map-shell')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    await (metaGateway() as { resetToNewGame(): Promise<unknown> }).resetToNewGame();
    localStorage.setItem('gems.debug.slowLoad', '120');
  });
  await page.reload();
}

test('新手引导：试炼 → 馈赠 → 新手十连，期间其他入口被拦截', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await newGame(page);

  const bubble = page.locator('.tut-bubble');
  await expect(bubble).toContainText('欢迎来到破晓之誓');
  await expect(page.locator('.tut-guide')).toBeVisible();
  // 引导期间点别的入口无效
  await page.locator('#railEvents').click({ force: true });
  await expect(page).toHaveURL(/#map$/);
  const team = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).teams[0].members[0]);
  expect(team).toEqual({ kind: 'hero' });

  // 战斗加载页：双方阵容 + 进度，加载完才进战斗
  await page.locator('.tut-action').click();
  const loading = page.locator('.bl-screen');
  await expect(loading).toBeVisible();
  await expect(loading.locator('.bl-side.enemy .bl-unit')).toHaveCount(3);
  await expect(loading.locator('#blTitle')).toHaveText('新手试炼');
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/onboarding-loading.png' });
  await expect(loading).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('#battle-root')).toBeVisible();

  await page.getByText('自动', { exact: true }).click();
  await expect(page).toHaveURL(/#result/, { timeout: 180_000 });
  // 结算页（含升级二选一）不加任何遮挡
  await expect(page.locator('.tut-layer:not(.tut-battle)')).toHaveCount(0);
  for (let i = 0; i < 10 && /#result/.test(page.url()); i++) {
    const card = page.locator('#luChoices [data-mastery-color]').first();
    if (await card.isVisible().catch(() => false)) await card.click();
    const next = page.locator('#luContinue:visible, #again:visible').first();
    if (await next.count()) await next.click();
    await page.waitForTimeout(800);
  }
  await expect(page).toHaveURL(/#map$/);
  await expect(bubble).toContainText('打得漂亮');
  await expect(page.locator('.tut-layer')).toHaveClass(/has-hole/);

  await page.locator('#railGifts').click();
  await expect(page).toHaveURL(/#gifts/);
  await page.locator('[data-gift-claim="starter"]').click();
  await expect(bubble).toContainText('召唤伙伴');
  await page.locator('.tut-action').click();
  await expect(page).toHaveURL(/#chests\/gems$/);
  await expect(page.locator('[data-open="gem-10"]')).toContainText('新手十连');
  await page.locator('[data-open="gem-10"]').click();
  await expect(page.locator('.tut-layer')).toHaveCount(0);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
  expect(save.onboarding).toEqual({ step: 'done', noviceSummonUsed: true });
  // 十连恒发 10 张牌（材料也占一张）；最后一张是部队
  await expect(page.locator('#summonCards .summon-card')).toHaveCount(10);
  expect(save.gachaLog[0].troops.length).toBeGreaterThan(0);
  await page.evaluate(() => localStorage.removeItem('gems.debug.slowLoad'));
});

test('馈赠：部队卡奖励领取后弹出获得展示', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto('/game.html#gifts/invasion');
  await expect(page.locator('.gift-card').first()).toContainText('完成第一次入侵');
  // 打完第一场入侵：用存档模拟累计场数
  await page.evaluate(() => {
    const k = 'gems.meta.save'; const s = JSON.parse(localStorage.getItem(k)!);
    s.gifts.invasionBattles = 1; localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload();
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/gifts-invasion-1600.png' });
  await page.locator('[data-gift-claim="invasion-first"]').click();
  // 借用宝箱开箱演出：一张卡背，翻开必为传说，关闭后回到馈赠页
  await expect(page).toHaveURL(/#chests\/gems$/);
  const modal = page.locator('#summonModal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#summonTitle')).toHaveText('馈赠');
  const card = page.locator('#summonCards .summon-card');
  await expect(card).toHaveCount(1);
  await expect(modal).toHaveClass(/is-ready/, { timeout: 15_000 });
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/gifts-reveal-back-1600.png' });
  await card.click();
  // 传说及以上有特写，点击关闭后才算翻完
  const slam = page.locator('#legendSlam');
  await expect(slam).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/gifts-reveal-slam-1600.png' });
  await expect(async () => {
    if (await slam.isVisible()) await slam.click({ force: true });
    await expect(modal).toHaveClass(/is-complete/, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(card).toContainText('传说');
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/gifts-reveal-1600.png' });
  await page.locator('#summonAction').click();
  await expect(page).toHaveURL(/#gifts\/invasion$/);
  await expect(page.locator('.gift-card').first()).toContainText('已领取');
  await page.goto('/game.html#gifts/hero');
  await expect(page.locator('.gift-pager button')).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/redesign-r3/shots/gifts-hero-1600.png' });
});
