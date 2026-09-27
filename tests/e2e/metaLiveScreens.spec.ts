import { test, expect } from '@playwright/test';

test('素材批冒烟：活动屏/入侵屏/荣耀箱', async ({ page }) => {
  await page.goto('http://localhost:5173/game.html#events');
  await expect(page.locator('.ev-banner h1')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#evFight')).toBeVisible();
  await expect(page.locator('.ev-mile').first()).toBeVisible();
  await expect(page.locator('[data-nav="商店"]')).toBeVisible();
  await expect(page.locator('#evTokenBalance')).toBeVisible();
  await expect(page.locator('.ev-tab')).toHaveCount(6); // 六活动页签

  // 六个独立活动页：轮值页可出战，非轮值页为预告态
  for (const id of ['invasion', 'raidBoss', 'towerOfDoom', 'factionAssault', 'worldEvent', 'classTrials']) {
    await page.goto(`http://localhost:5173/game.html#events/${id}`);
    await expect(page.locator('.ev-howto')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.ev-state, .ev-preview').first()).toBeVisible();
  }
  await page.goto('http://localhost:5173/game.html#events/raidBoss');
  await expect(page.locator('.ev-hpbar, .ev-preview').first()).toBeVisible({ timeout: 15000 });

  await page.goto('http://localhost:5173/game.html#invasion');
  await expect(page.locator('.inv-hub-rank h1')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.inv-rival').first()).toBeVisible();
  const rivals = await page.locator('.inv-rival').count();
  expect(rivals).toBe(3);
  await expect(page.locator('.inv-rank-emblem')).toHaveCount(1);
  await page.locator('.inv-hub-links a[href="#invasion/standings"]').click();
  await expect(page.locator('.inv-row.me')).toBeVisible();

  // 地图 rail 入口（demo 档主角 12 级 → 入侵已解锁）
  await page.goto('http://localhost:5173/game.html#map');
  await expect(page.locator('#railEvents')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#railInvasionCopy')).toHaveText('入侵排位');
  await page.locator('#railEvents').click();
  await expect(page.locator('.ev-banner h1')).toBeVisible({ timeout: 15000 });

  // 材料库独立页（顶栏背包按钮）
  await page.goto('http://localhost:5173/game.html#map');
  await page.locator('#materialsBtn').click();
  await expect(page).toHaveURL(/#bag$/);
  await expect(page.locator('.bag-panel')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.bag-item').first()).toBeVisible();

  // 宝箱屏荣耀箱
  await page.goto('http://localhost:5173/game.html#chests');
  await expect(page.locator('[data-open="glory-1"]')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-open="glory-1"]').click();
  await expect(page.locator('#gloryBalance')).toHaveText(/[\d,]+/, { timeout: 10000 });
});
