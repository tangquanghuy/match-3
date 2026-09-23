import { expect, test, type Page } from '@playwright/test';

const ids = ['invasion', 'raidBoss', 'towerOfDoom', 'factionAssault', 'worldEvent', 'classTrials'];

async function loadedArtwork(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeVisible();
  await expect.poll(() => page.locator(selector).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
}

async function openCleanEvents(page: Page, hash = '#events'): Promise<void> {
  await page.goto('/game.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(`/game.html${hash}`);
}

test('活动周倒计时在页面存活期间更新，并明确周一重置时间', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 17, 11, 30, 0) });
  await page.goto('/game.html#events');
  const countdown = page.locator('[data-event-countdown]');
  await expect(countdown).toHaveText('剩 3天 12时 30分');
  await expect(page.locator('.ev-overview-header')).toContainText('周一 0:00 重置');
  await page.clock.fastForward(61_000);
  await expect(countdown).toHaveText('剩 3天 12时 29分');

  await page.goto('/game.html#events/invasion');
  await expect(page.locator('[data-event-countdown]')).toHaveText('剩 3天 12时 29分');
  await expect(page.locator('.ev-kingdom')).toContainText('周一 0:00 重置');
});

test('玩法规则默认展开并记住用户的展开偏好', async ({ page }) => {
  await openCleanEvents(page, '#events/invasion');
  const rules = page.locator('.ev-howto');
  await expect(rules).toHaveAttribute('open', '');

  await rules.locator('summary').click();
  await expect(rules).not.toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gems.ui.events.rules.open'))).toBe('closed');

  await page.goto('/game.html#events/raidBoss');
  await expect(page.locator('.ev-howto')).not.toHaveAttribute('open', '');
  await page.locator('.ev-howto summary').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gems.ui.events.rules.open'))).toBe('open');
  await page.reload();
  await expect(page.locator('.ev-howto')).toHaveAttribute('open', '');
});

test('末日之塔放弃使用页内确认，取消和 Esc 不会清除本轮', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCleanEvents(page, '#events/towerOfDoom');
  await page.evaluate(() => {
    const key = 'gems.meta.save';
    const save = JSON.parse(localStorage.getItem(key)!);
    const date = new Date();
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    date.setHours(0, 0, 0, 0);
    save.eventWeeks.towerOfDoom = {
      weekStart: date.getTime(), points: 420, claimed: [], wins: 3,
      tokens: 18, tokensEarned: 18, playRewards: 0, bought: {},
      eventData: { floor: 8, floorBest: 11, runActive: 1 },
      runTeam: [
        { externalId: 'tower-a', hp: 12, maxHp: 40, defeated: false },
        { externalId: 'tower-b', hp: 0, maxHp: 36, defeated: true },
      ],
    };
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();

  await page.locator('#evAbandon').click();
  const modal = page.locator('#evAbandonModal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('荣耀 +14 · 熔铸符卷 +1');
  await expect(modal).toContainText('当前层进度 · 本轮队伍生命与阵亡状态');
  const confirmBounds = await modal.locator('.ev-tower-confirm').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  expect(confirmBounds.left).toBeGreaterThanOrEqual(0);
  expect(confirmBounds.right).toBeLessThanOrEqual(390);
  expect(confirmBounds.top).toBeGreaterThanOrEqual(0);
  expect(confirmBounds.bottom).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'artifacts/ux-phase-b/events-tower-abandon-confirm-mobile.png' });
  await page.locator('#evCancelAbandon').click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#evAbandon')).toBeVisible();

  await page.locator('#evAbandon').click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('#evAbandon')).toBeVisible();

  await page.locator('#evAbandon').click();
  await page.locator('#evConfirmAbandon').click();
  await expect(page.locator('#evAbandon')).toHaveCount(0);
  await expect(page.locator('.ev-tower-info')).toContainText('尚未开爬');
});

for (const size of [
  { width: 1600, height: 900, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
]) {
  test(`活动总览和六类详情保持图像与动作区分离：${size.label}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/game.html#events');
    await expect(page.locator('.ev-overview-card')).toHaveCount(6);
    await expect(page.locator('.ev-overview-foot a[href^="#shop/"]')).toHaveCount(6);
    await loadedArtwork(page, '.ev-overview-card:first-child .ev-overview-visual img');
    if (size.width < 1400) {
      await expect(page.locator('#stage')).toHaveClass(/events-responsive/);
      expect(await page.locator('#stage').evaluate((stage) => stage.getBoundingClientRect().width)).toBe(size.width);
    }
    await page.screenshot({ path: `artifacts/ux-phase-b/events-visual-overview-${size.label}.png` });
    if (size.width < 1400) {
      await page.locator('.ev-overview-card').last().scrollIntoViewIfNeeded();
      await expect(page.locator('.ev-overview-card').last()).toBeVisible();
      await page.screenshot({ path: `artifacts/ux-phase-b/events-visual-overview-${size.label}-tail.png` });
    }

    for (const id of ids) {
      await page.goto(`/game.html#events/${id}`);
      await expect(page.locator('.ev-banner h1')).toBeVisible();
      await loadedArtwork(page, '.ev-banner-art img');
      await expect(page.locator('.ev-mile-track .ev-mile')).toHaveCount(0);
      await expect(page.locator(`.ev-rewards-entry[href="#events/${id}/rewards"]`)).toBeVisible();
      await expect(page.locator('.ev-state')).toBeVisible();
      await expect(page.locator(`.ev-shop-entry[href="#shop/${id}"]`)).toBeVisible();
      const layout = await page.locator('.ev-screen').evaluate((root) => {
        const panel = root.querySelector('.ev-panel')!;
        const image = root.querySelector('.ev-banner-art')!.getBoundingClientRect();
        const copy = root.querySelector('.ev-banner-copy')!.getBoundingClientRect();
        const shop = root.querySelector('.ev-shop-entry')!.getBoundingClientRect();
        const activeTab = root.querySelector('.ev-tab.page')!.getBoundingClientRect();
        const intersect = image.left < copy.right && image.right > copy.left && image.top < copy.bottom && image.bottom > copy.top;
        return {
          horizontalOverflow: panel.scrollWidth > panel.clientWidth + 2 || root.scrollWidth > root.clientWidth + 2,
          artOverlapsCopy: intersect,
          shopVisible: shop.bottom <= innerHeight - 55 && shop.top >= 0,
          activeTabVisible: activeTab.left >= 0 && activeTab.right <= innerWidth,
          artWidth: image.width,
          artHeight: image.height,
        };
      });
      expect(layout, `${id} ${size.label}`).toMatchObject({ horizontalOverflow: false, artOverlapsCopy: false, shopVisible: true, activeTabVisible: true });
      expect(layout.artWidth).toBeGreaterThan(110);
      expect(layout.artHeight).toBeGreaterThan(110);
      await page.screenshot({ path: `artifacts/ux-phase-b/events-visual-${id}-${size.label}.png` });

      await page.locator('.ev-rewards-entry').click();
      await expect(page).toHaveURL(new RegExp(`#events/${id}/rewards$`));
      const rewards = page.locator('.ev-mile-track .ev-mile');
      await expect(rewards).toHaveCount(6);
      await rewards.last().scrollIntoViewIfNeeded();
      await expect(rewards.last()).toBeInViewport();
      const rewardsLayout = await page.locator('.ev-rewards-panel').evaluate((panel) => {
        const last = panel.querySelector('.ev-mile:last-child')!.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        return {
          horizontalOverflow: panel.scrollWidth > panel.clientWidth + 2,
          lastVisible: last.top >= panelRect.top - 1 && last.bottom <= panelRect.bottom + 1,
        };
      });
      expect(rewardsLayout, `${id} ${size.label} rewards`).toEqual({ horizontalOverflow: false, lastVisible: true });
      await page.screenshot({ path: `artifacts/ux-phase-b/events-rewards-${id}-${size.label}.png` });
      await page.locator('.ev-rewards-back:visible').last().click();
      await expect(page).toHaveURL(new RegExp(`#events/${id}$`));
    }
  });
}

test('手机活动切换菜单能到达每个活动，无须横向寻找被截断的页签', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#events/invasion');
  await expect(page.locator('#evTypePicker')).toBeVisible();
  await page.locator('#evTypePicker').selectOption('classTrials');
  await expect(page).toHaveURL(/#events\/classTrials$/);
  await expect(page.locator('.ev-banner h1')).toHaveText('职业试炼');
});
