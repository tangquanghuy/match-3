import { test, expect } from '@playwright/test';

for (const width of [1600, 390, 320]) {
  test(`${width}px 官阶分页、领奖和刷新落盘`, async ({ page }) => {
    const pageSize = width <= 900 ? 3 : 6;
    const pageCount = 30 / pageSize;
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    await page.goto('/game.html#invasion');
    await expect(page.locator('[data-inv-refresh]')).toBeVisible();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
    const old = await page.locator('[data-invade]').first().getAttribute('data-invade');
    for (let i=0; i<8; i++) await page.locator('[data-inv-refresh]').click();
    await expect(page.locator('[data-invade]').first()).not.toHaveAttribute('data-invade', old!);
    const refreshed = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
    expect(refreshed.invasion.refreshCount).toBe(before.invasion.refreshCount + 8);
    expect(refreshed.currencies).toEqual(before.currencies);
    const ids = await page.locator('[data-invade]').evaluateAll(items => items.map(el => el.getAttribute('data-invade')));
    await page.reload();
    await expect(page.locator('[data-invade]')).toHaveCount(3);
    expect(await page.locator('[data-invade]').evaluateAll(items => items.map(el => el.getAttribute('data-invade')))).toEqual(ids);
    await page.locator('.inv-hub-links a[href="#invasion/ranks"]').click();
    await expect(page.locator('.inv-rank-row')).toHaveCount(pageSize);
    await expect(page.locator('[data-claim-rank="rank-1"]')).toBeDisabled();
    const claim = page.locator('[data-claim-rank="rank-0"]');
    await expect(claim).toBeEnabled(); await claim.click(); await expect(claim).toHaveText('已领取');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.gems)).toBe(before.currencies.gems + 50);
    await page.reload(); await expect(claim).toBeDisabled();
    for (let i=0; i<pageCount; i++) {
      await page.locator(`.inv-rank-pager a[href="#invasion/ranks/${i}"]`).click();
      await expect(page.locator('.inv-rank-row')).toHaveCount(pageSize);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect.poll(() => page.locator('.inv-rank-emblem img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    }
    await expect(page.locator('.inv-rank-row').last()).toContainText('钻石 III');
    await page.screenshot({path: `artifacts/ux-phase-b/shots/gow-ranks-${width}.png`, fullPage: true});
    await page.reload(); await expect(page.locator('.inv-rank-row').last()).toContainText('钻石 III');
  });
}

test('只有最高小阶显示周榜；直达地址也遵守门槛', async ({ page }) => {
  await page.goto('/game.html#invasion/standings');
  await expect(page.locator('.inv-row')).toHaveCount(0);
  await expect(page.locator('.inv-secondary-body')).toContainText('达到钻石 III');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!); s.invasion.progressionVp = 7500;
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.reload();
  // A zero-count assertion alone also passes before the async screen has mounted.
  await expect(page.locator('.inv-secondary-body')).toContainText('达到钻石 III');
  await expect(page.locator('.inv-row')).toHaveCount(0);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!); s.invasion.progressionVp = 8000;
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
  });
  await page.reload(); await expect(page.locator('.inv-row')).toHaveCount(30);
  await expect(page.locator('.inv-cutline')).toHaveCount(0);
  await expect(page.locator('.inv-secondary-body')).not.toContainText('名晋级');
});


test('周刷新清空进度并重新开放领奖，对手卡显示固定三档 VP', async ({ page }) => {
  await page.goto('/game.html#invasion');
  for (const [i, card] of (await page.locator('.inv-rival').all()).entries()) {
    const multiplier = Number(await card.getAttribute('data-vp-multiplier'));
    await expect(card.locator('.inv-rival-expected b')).toHaveText(`+${[10,20,30][i]! * multiplier} VP`);
  }
  const before = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gems.meta.save')!);
    s.invasion.weekStart -= 7 * 86400000;
    s.invasion.progressionVp = 8000; s.invasion.vp = 8000; s.invasion.league = 9;
    s.invasion.claimedRanks = Array.from({length:30}, (_,i) => `rank-${i}`);
    localStorage.setItem('gems.meta.save', JSON.stringify(s));
    return s.currencies.gems;
  });
  await page.goto('/game.html#invasion/ranks');
  await page.reload();
  await expect(page.locator('.inv-ranks-page header')).toContainText('每周 6,000 宝石');
  await expect(page.locator('.inv-rank-overview')).toContainText('青铜 I');
  await expect(page.locator('[data-claim-rank="rank-1"]')).toBeDisabled();
  const claim = page.locator('[data-claim-rank="rank-0"]');
  await expect(claim).toBeEnabled(); await claim.click(); await expect(claim).toBeDisabled();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
  expect(after.invasion.progressionVp).toBe(0);
  expect(after.invasion.claimedRanks).toEqual(['rank-0']);
  expect(after.currencies.gems).toBe(before + 50);
  await page.reload(); await expect(claim).toBeDisabled();
});
