import { expect, test } from '@playwright/test';

// Layout assertions should not wait for the optional third-party font CDN.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
});

test('材料库以物品格展示，并在桌面侧栏切换详情', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#bag/ingots');
  await expect(page.locator('.bag-item')).toHaveCount(7);
  await expect(page.locator('.bag-detail-card:visible')).toHaveCount(1);

  const first = page.locator('.bag-item').first();
  const last = page.locator('.bag-item').last();
  const firstBox = await first.boundingBox();
  const lastBox = await last.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect(lastBox!.x - firstBox!.x).toBeGreaterThan(200);

  await last.click();
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.bag-detail-card:visible h3')).toHaveText('神话钢锭');
  await expect(page.locator('.bag-detail-action:visible')).toHaveText('查看可淬炼武器 →');
});

test('手机端选择材料展开详情并可关闭', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#bag/stones');
  await expect(page.locator('.bag-item')).toHaveCount(19);
  await expect(page.locator('.bag-detail')).toBeHidden();

  const item = page.locator('.bag-item').nth(1);
  await item.click();
  await expect(page.locator('.bag-detail')).toBeVisible();
  await expect(page.locator('.bag-detail-card:visible h3')).toHaveText('初级自然之石');
  await page.locator('.bag-detail-close').click();
  await expect(page.locator('.bag-detail')).toBeHidden();
  await expect(item).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#bagOwnedOnly').check();
  expect(await page.locator('.bag-item:visible').count()).toBeLessThan(19);
  await page.locator('#bagOwnedOnly').uncheck();
  await expect(page.locator('.bag-item:visible')).toHaveCount(19);
});

test('符卷与钥匙同栏展示，荣耀钥匙可查看和使用', async ({ page }) => {
  await page.goto('/game.html#bag/supplies');
  await expect(page.locator('.bag-tab')).toHaveCount(3);
  await expect(page.locator('.bag-item')).toHaveCount(4);
  await expect(page.locator('[data-bag-item="burningSouls"]')).toContainText('燃烧灵魂');
  await expect(page.locator('[data-bag-item="burningSouls"] .bag-item-count')).toHaveText('未获得');
  await expect(page.locator('[data-bag-item="gloryKeys"] .bag-item-count')).toHaveText('未获得');
  await expect(page.locator('[data-bag-item="forgeScrolls"]')).toContainText('熔铸符卷');
  await expect(page.locator('[data-bag-item="treasureMaps"]')).toContainText('藏宝图');
  await page.locator('[data-bag-item="burningSouls"]').click();
  await expect(page.locator('.bag-detail-card:visible')).toContainText('用于不朽升级与特质解锁');
  await expect(page.locator('.bag-detail-card:visible')).toContainText('33 / 66 / 99');

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.currencies.gloryKeys = 3;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  const ticket = page.locator('[data-bag-item="gloryKeys"]');
  await expect(ticket.locator('.bag-item-count')).toHaveText('×3');
  await ticket.click();
  await expect(page.locator('.bag-detail-card:visible .bag-detail-count')).toContainText('3');
  await expect(page.locator('.bag-detail-card:visible')).toContainText('荣耀');
  await page.goto('/game.html#bag/scrolls');
  await expect(page.locator('.bag-tab.active')).toContainText('符卷·门票');
  await page.goto('/game.html#bag/tickets');
  await expect(page.locator('.bag-tab.active')).toContainText('符卷·门票');
});

test('紧凑网格完整显示于常见视口，矮屏详情仍能关闭', async ({ page }) => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/game.html#bag/stones');
    await expect(page.locator('.bag-item')).toHaveCount(19);
    const fits = await page.evaluate(() => {
      const screen = document.querySelector('.bag-screen')!;
      const shelf = document.querySelector('.bag-shelf')!;
      return shelf.getBoundingClientRect().bottom <= screen.getBoundingClientRect().bottom;
    });
    expect(fits).toBe(true);
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/game.html#bag/stones');
  await page.locator('.bag-item').last().click();
  const detail = page.locator('.bag-detail');
  await expect(detail).toBeVisible();
  const box = await detail.boundingBox();
  const screen = await page.locator('.bag-screen').boundingBox();
  expect(box).not.toBeNull();
  expect(screen).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(screen!.y);
  expect(box!.y + box!.height).toBeLessThanOrEqual(screen!.y + screen!.height);
  await expect(page.locator('.bag-detail-close')).toBeInViewport();
  await expect(page.locator('.bag-detail-card:visible .bag-detail-action')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#bag/supplies');
  await page.locator('[data-bag-item="gloryKeys"]').click();
  await expect(page.locator('.bag-detail-card:visible')).toContainText('荣耀');
  await expect(page.locator('.bag-detail-card:visible .bag-detail-action')).toBeInViewport();
  const ticketBox = await detail.boundingBox();
  const shortPanel = await page.locator('.bag-panel').boundingBox();
  expect(ticketBox!.y + ticketBox!.height).toBeGreaterThan(shortPanel!.y + shortPanel!.height);
});


test('新增秘法石分页展示，手机详情和返回页正常', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#bag/stones');
  await expect(page.locator('.bag-pagination')).toContainText('1 / 3');
  await page.getByRole('link', { name: '下一页', exact: true }).click();
  await expect(page.locator('.bag-pagination')).toContainText('2 / 3');
  await expect(page.locator('.bag-item')).toHaveCount(19);
  await page.locator('[data-bag-item="arcane:blue:green"]').click();
  await expect(page.locator('.bag-detail-card:visible h3')).toHaveText('秘法沼泽属性石');
  await expect(page.locator('.bag-detail-card:visible')).toContainText('探索');
  await page.locator('.bag-detail-close').click();
  await page.getByRole('link', { name: '下一页', exact: true }).click();
  await expect(page.locator('.bag-item')).toHaveCount(2);
  await expect(page.locator('.bag-pagination')).toContainText('3 / 3');
  await page.getByRole('link', { name: '上一页', exact: true }).click();
  await expect(page.locator('.bag-pagination')).toContainText('2 / 3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('特质石详情列出对应王国并能进入探索', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#bag/stones');
  await page.locator('[data-bag-item="minor:blue"]').click();
  const basic = page.locator('.bag-detail-card:visible');
  await expect(basic).toContainText('75% 优先旗帜加成色');
  await basic.locator('.bag-farm summary').click();
  await expect(basic.locator('.bag-farm button')).not.toHaveCount(0);
  await page.locator('.bag-detail-close').click();

  await page.goto('/game.html#bag/stones/arcane');
  await page.locator('[data-bag-item="arcane:blue:brown"]').click();
  const arcane = page.locator('.bag-detail-card:visible');
  await expect(arcane).toContainText('基础抽取每次有 1% 概率掉秘法石');
  await arcane.locator('.bag-farm summary').click();
  await arcane.locator('.bag-farm button', { hasText: '破碎尖塔' }).click();
  await expect(page.locator('.explore-screen h1')).toHaveText('破碎尖塔');
});
