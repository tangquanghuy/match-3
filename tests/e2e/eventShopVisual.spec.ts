import { test, expect, type Page } from '@playwright/test';

function currentWeekStart(): number {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

async function openCleanShop(page: Page): Promise<void> {
  await page.goto('/game.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto('/game.html#shop/invasion');
  await expect(page.locator('.event-shop-panel')).toBeVisible();
}

test('活动商店在桌面端呈现招牌、奖励明细和明确购买状态', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);

  await expect(page.locator('.shop-tab')).toHaveCount(6);
  await expect(page.locator('.shop-goods')).toHaveCount(4);
  await expect(page.locator('.shop-goods.featured')).toContainText('圣辉石');
  await expect(page.locator('.shop-goods.featured .shop-reward')).toContainText('持有 1 → 2');
  await expect(page.locator('.shop-buy.is-poor')).toHaveCount(4);
  await expect(page.locator('.shop-goods.featured .shop-goods-art')).toHaveCSS('background-color', 'rgb(25, 29, 36)');
});

test('六家活动商店均保留招牌位且货架没有横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  const shops: Record<string, number> = {
    invasion: 4,
    raidBoss: 5,
    towerOfDoom: 4,
    factionAssault: 4,
    worldEvent: 4,
    classTrials: 4,
  };
  for (const [id, count] of Object.entries(shops)) {
    await page.goto(`/game.html#shop/${id}`);
    await expect(page.locator('.shop-goods')).toHaveCount(count);
    await expect(page.locator('.shop-goods.featured')).toHaveCount(1);
    const overflow = await page.locator('.event-shop-panel').evaluate((panel) => panel.scrollWidth - panel.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.goto('/game.html#shop/raidBoss');
  await expect(page.locator('.shop-grid')).toHaveClass(/shop-grid-4/);
});

test('活动商店兑换后同步余额、持有量和售罄状态', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  const weekStart = currentWeekStart();
  await page.evaluate((start) => {
    const key = 'gems.meta.save';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.eventWeeks.invasion = {
      weekStart: start,
      points: 0,
      claimed: [],
      wins: 8,
      tokens: 100,
      tokensEarned: 100,
      playRewards: 0,
      bought: {},
      eventData: {},
      runTeam: null,
    };
    localStorage.setItem(key, JSON.stringify(save));
  }, weekStart);
  await page.reload();

  const featured = page.locator('.shop-goods.featured');
  await expect(featured.locator('[data-buy="invasion_celestial"]')).toBeEnabled();
  await featured.locator('[data-buy="invasion_celestial"]').click();
  await expect(page.locator('.shop-token-identity > strong')).toHaveText('40');
  await expect(featured).toHaveClass(/sold-out/);
  await expect(featured.locator('.shop-buy')).toHaveText('周一补货');
  await expect(featured.locator('.shop-reward')).toContainText('当前持有 2');
  await expect(page.locator('#toast')).toContainText('已购入 圣辉石');
  await page.screenshot({ path: 'artifacts/ux-phase-b/event-shop-purchased-1600.png' });
});

test('活动商店在 768 和 390 宽度使用原生尺寸且主要操作不溢出', async ({ page }) => {
  for (const viewport of [{ width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openCleanShop(page);
    await expect(page.locator('#stage')).toHaveClass(/event-shop-responsive/);
    await expect(page.locator('.shop-goods.featured')).toBeVisible();
    const layout = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.event-shop-panel')!;
      const action = document.querySelector<HTMLElement>('.shop-goods.featured .shop-buy')!;
      const rect = action.getBoundingClientRect();
      return {
        stageWidth: document.querySelector<HTMLElement>('#stage')!.getBoundingClientRect().width,
        panelOverflow: panel.scrollWidth - panel.clientWidth,
        actionLeft: rect.left,
        actionRight: rect.right,
      };
    });
    expect(layout.stageWidth).toBe(viewport.width);
    expect(layout.panelOverflow).toBeLessThanOrEqual(1);
    expect(layout.actionLeft).toBeGreaterThanOrEqual(0);
    expect(layout.actionRight).toBeLessThanOrEqual(viewport.width);
  }
});
