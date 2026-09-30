import { expect, test, type Page } from '@playwright/test';

const ids = ['invasion', 'raidBoss', 'towerOfDoom', 'factionAssault', 'worldEvent', 'classTrials'];

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

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

test('玩法说明独立成页，出战页只呈现当前决策', async ({ page }) => {
  await openCleanEvents(page, '#events/invasion');
  await expect(page.locator('.ev-howto')).toHaveCount(0);
  await expect(page.locator('.ev-weekly')).toHaveCount(0);
  await page.locator('.ev-title-row a').click();
  await expect(page).toHaveURL(/#events\/invasion\/rules$/);
  await expect(page.locator('.ev-howto li').first()).toBeVisible();
  await expect(page.locator('.ev-howto').last()).toContainText('周一 0:00');
  await expect(page.locator('.ev-fight')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.ev-rules-page')).toBeVisible();
  await page.locator('.ev-rewards-back').first().click();
  await expect(page.locator('.ev-board .evm')).toBeVisible();
});

test('末日之塔放弃使用页内确认，取消和 Esc 不会清除本轮', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCleanEvents(page, '#events/towerOfDoom');
  // Start a real run through the gateway; legacy eventData/runTeam no longer
  // describes the roguelike tower state introduced in the mode redesign.
  await page.locator('[data-act="start"]').click();
  await expect(page.locator('.evm-tower')).toHaveClass(/is-running/);
  await page.locator('[data-act^="pick:"]').first().click();
  const runBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).eventWeeks.towerOfDoom);

  await page.locator('[data-act="abandon"]').click();
  const modal = page.locator('#evConfirm');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('当前队伍状态、遗物与塔金将清除');
  await expect(modal).toContainText('本周最高层与积分保留');
  const confirmBounds = await modal.locator('.ev-tower-confirm').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  expect(confirmBounds.left).toBeGreaterThanOrEqual(0);
  expect(confirmBounds.right).toBeLessThanOrEqual(390);
  expect(confirmBounds.top).toBeGreaterThanOrEqual(0);
  expect(confirmBounds.bottom).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'artifacts/visual-redesign/events-tower-abandon-confirm-mobile.png' });
  await page.locator('#evConfirmCancel').click();
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-act="abandon"]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).eventWeeks.towerOfDoom)).toEqual(runBefore);

  await page.locator('[data-act="abandon"]').click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-act="abandon"]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).eventWeeks.towerOfDoom)).toEqual(runBefore);

  await page.locator('[data-act="abandon"]').click();
  await page.locator('#evConfirmOk').click();
  await expect(page.locator('[data-act="abandon"]')).toHaveCount(0);
  await expect(page.locator('[data-act="start"]')).toBeVisible();
  await expect(page.locator('.tw-last')).toContainText('第 0 层');
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
    await expect(page.locator('.ev-overview-foot a[href^="#shop/"]')).toHaveCount(0);
    await expect(page.locator('[data-nav="商店"]')).toBeVisible();
    await loadedArtwork(page, '.ev-overview-card:first-child .ev-overview-visual img');
    if (size.width < 1400) {
      await expect(page.locator('#stage')).toHaveClass(/events-responsive/);
      expect(await page.locator('#stage').evaluate((stage) => stage.getBoundingClientRect().width)).toBe(size.width);
    }
    await page.screenshot({ path: `artifacts/visual-redesign/events-visual-overview-${size.label}.png` });
    if (size.width < 1400) {
      await page.locator('.ev-overview-card').last().scrollIntoViewIfNeeded();
      await expect(page.locator('.ev-overview-card').last()).toBeVisible();
      await page.screenshot({ path: `artifacts/visual-redesign/events-visual-overview-${size.label}-tail.png` });
    }

    for (const id of ids) {
      await page.goto(`/game.html#events/${id}`);
      await expect(page.locator('.ev-banner h1')).toBeVisible();
      await loadedArtwork(page, '.ev-banner-art img');
      await expect(page.locator('.ev-mile-track .ev-mile')).toHaveCount(0);
      await expect(page.locator(`.ev-rewards-entry[href="#events/${id}/rewards"]`)).toBeVisible();
      await expect(page.locator('.ev-board .evm')).toBeVisible();
      await expect(page.locator('.ev-shop-entry')).toHaveCount(1);
      await expect(page.locator('[data-nav="商店"]')).toBeVisible();
      const layout = await page.locator('.ev-screen').evaluate((root) => {
        const panel = root.querySelector('.ev-panel')!;
        const image = root.querySelector('.ev-banner-art')!.getBoundingClientRect();
        const copy = root.querySelector('.ev-banner-copy')!.getBoundingClientRect();
        const activeTab = root.querySelector('.ev-tab.page')!.getBoundingClientRect();
        const intersect = image.left < copy.right && image.right > copy.left && image.top < copy.bottom && image.bottom > copy.top;
        return {
          horizontalOverflow: panel.scrollWidth > panel.clientWidth + 2 || root.scrollWidth > root.clientWidth + 2,
          artOverlapsCopy: intersect,
          activeTabVisible: activeTab.left >= 0 && activeTab.right <= innerWidth,
          artWidth: image.width,
          artHeight: image.height,
        };
      });
      expect(layout, `${id} ${size.label}`).toMatchObject({ horizontalOverflow: false, artOverlapsCopy: false, activeTabVisible: true });
      expect(layout.artWidth).toBeGreaterThanOrEqual(80);
      expect(layout.artHeight).toBeGreaterThanOrEqual(100);
      await page.screenshot({ path: `artifacts/visual-redesign/events-visual-${id}-${size.label}.png` });

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
      await page.screenshot({ path: `artifacts/visual-redesign/events-rewards-${id}-${size.label}.png` });
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

test('活动战术、加成角色图鉴筛选与兑换入口可直接操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCleanEvents(page, '#events/invasion');
  const squad = page.locator('[data-select^="squad:"]').first();
  const action = await squad.getAttribute('data-select');
  await squad.click();
  await expect(page.locator('.iv-detail:not(.empty)')).toBeVisible();
  await expect(page.locator(`[data-fight="${action}"]`)).toBeEnabled();
  for (const [id, dimension, select] of [['factionAssault', 'kingdom', '#kingdomSelect'], ['worldEvent', 'race', '#typeSelect']]) {
    await page.goto(`/game.html#events/${id}`);
    const entry = page.locator(`a[href^="#troop/filter/${dimension}/"]`);
    const href = (await entry.getAttribute('href'))!;
    const value = decodeURIComponent(href.split('/').at(-1)!);
    await entry.click();
    await expect(page.locator(select)).toHaveValue(value);
    await expect(page.locator('[data-tab="owned"]')).toHaveClass(/selected/);
    await expect(page.locator('#collectionSearch')).toHaveValue('');
  }
  await page.goto('/game.html#events/towerOfDoom');
  await expect(page.locator('[data-act="start"]')).toBeVisible();
  await page.locator('.ev-shop-entry').click();
  await expect(page).toHaveURL(/#shop\/towerOfDoom$/);
  await page.locator('[data-shop-rules]').click();
  await expect(page.locator('#shopItemContent')).toContainText('/ 360');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/ux-phase-b/event-shop-weekly-mobile.png' });
});

test('没有职业时试炼给出修复入口，跨周自动刷新共享目标和奖励', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 27, 23, 59, 50) });
  await openCleanEvents(page, '#events/classTrials');
  await page.evaluate(() => {
    const key = 'gems.meta.save'; const save = JSON.parse(localStorage.getItem(key)!);
    save.hero.classId = null;
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0);
    save.eventWeeks.invasion = { weekStart: d.getTime(), points: 1200, wins: 30, tokens: 100, tokensEarned: 100,
      playRewards: 4, bought: {}, claimed: [0, 1, 2, 3, 4, 5], runTeam: null,
      eventData: { revision: 2, sharedClaim0: 1, sharedClaim1: 1, sharedClaim2: 1, sharedClaim3: 1,
        gemPaid0: 150, gemPaid1: 150, gemPaid2: 150, gemPaid3: 75, gemPaid4: 75 } };
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('.ev-fight')).toBeDisabled();
  await expect(page.locator('.ev-warning')).toContainText('职业');
  await expect(page.locator('.ct-class[href="#hero"]')).toBeVisible();
  await page.goto('/game.html#events');
  await expect(page.locator('.ev-weekly-goals .claimed')).toHaveCount(4);
  await page.clock.fastForward(20_000);
  await expect(page.locator('.ev-weekly-goals .claimed')).toHaveCount(0);
  await expect(page.locator('.ev-overview-card').first()).toContainText('600');
});
