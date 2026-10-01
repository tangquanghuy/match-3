import { expect, test, type Page } from '@playwright/test';

async function openMap(page: Page): Promise<void> {
  await page.goto('/game.html#map');
  await expect(page.locator('.map-shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.knode.sel')).toBeVisible();
}

for (const viewport of [
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
]) {
  test(`地图在 ${viewport.label} 使用真实尺寸并保留完整操作层`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMap(page);

    await expect(page.locator('#stage')).toHaveClass(/map-responsive/);
    const layout = await page.evaluate(() => {
      const rect = (selector: string): DOMRect => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const stage = rect('#stage');
      const frame = rect('.map-frame');
      const daily = rect('.daily');
      const nav = rect('.bottom-bar');
      const visibleRailButtons = [...document.querySelectorAll<HTMLElement>('.rail button')]
        .filter((button) => getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0);
      return {
        stageWidth: stage.width,
        stageHeight: stage.height,
        transform: getComputedStyle(document.querySelector('#stage')!).transform,
        frameWidth: frame.width,
        frameHeight: frame.height,
        frameBelowRail: frame.top >= Math.max(...visibleRailButtons.map((button) => button.getBoundingClientRect().bottom)) - 2,
        dailyAboveNav: daily.bottom <= nav.top + 1,
        visibleRailButtons: visibleRailButtons.length,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });

    expect(layout.stageWidth).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(layout.stageHeight).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(layout.transform).toBe('none');
    expect(layout.frameWidth).toBeGreaterThan(viewport.width - 24);
    expect(layout.frameHeight).toBeGreaterThan(430);
    expect(layout.frameBelowRail).toBe(true);
    expect(layout.dailyAboveNav).toBe(true);
    // 手机隐藏锁定入口；馈赠已开放，所以手机可见 6 个
    expect(layout.visibleRailButtons).toBe(viewport.width < 700 ? 6 : 7);
    expect(layout.documentOverflow).toBe(false);

    await page.screenshot({ path: `artifacts/ux-phase-b/map-responsive-${viewport.label}.png` });
  });
}

test('手机王国详情将主视觉与信息区物理分开并可完整滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);
  await page.locator('.knode.sel').click({ force: true });
  await expect(page.locator('#kingdomVeil')).toBeVisible();
  await expect.poll(() => page.locator('#kingdomPortrait').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const geometry = await page.locator('.kingdom-sheet').evaluate((sheet) => {
    const art = sheet.querySelector<HTMLElement>('.kingdom-art')!.getBoundingClientRect();
    const info = sheet.querySelector<HTMLElement>('.kingdom-info')!.getBoundingClientRect();
    const bounds = sheet.getBoundingClientRect();
    return {
      artBottom: art.bottom,
      infoTop: info.top,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      scrollable: sheet.scrollHeight > sheet.clientHeight,
      captionVisible: getComputedStyle(sheet.querySelector<HTMLElement>('.art-caption')!).display !== 'none',
    };
  });
  expect(geometry.infoTop).toBeGreaterThanOrEqual(geometry.artBottom - 1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(390);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(844);
  expect(geometry.captionVisible).toBe(false);

  await page.locator('.entry-cards').scrollIntoViewIfNeeded();
  await expect(page.locator('#entryQuest')).toBeVisible();
  await page.screenshot({ path: 'artifacts/ux-phase-b/map-responsive-mobile-kingdom.png' });
});

test('王国详情把战斗置于主行动并为锁定王国提供单一门禁状态', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openMap(page);
  await page.locator('.knode.sel').click({ force: true });
  await expect(page.locator('#kingdomOpenBody')).toBeVisible();

  const hierarchy = await page.evaluate(() => {
    const quest = document.querySelector<HTMLElement>('#entryQuest')!;
    const tribute = document.querySelector<HTMLElement>('#tributeRow')!;
    const upgrade = document.querySelector<HTMLElement>('#kingdomUpgrade')!;
    const qr = quest.getBoundingClientRect();
    const tr = tribute.getBoundingClientRect();
    const ur = upgrade.getBoundingClientRect();
    return {
      questArea: qr.width * qr.height,
      upgradeArea: ur.width * ur.height,
      // 王国等级与进贡两块并排放在主行动下方
      visualOrder: qr.bottom <= tr.top + 1 && qr.bottom <= ur.top + 1,
      upgradeIsPrimary: upgrade.classList.contains('primary'),
      questBackground: getComputedStyle(quest).backgroundImage,
      upgradeBackground: getComputedStyle(upgrade).backgroundImage,
    };
  });
  expect(hierarchy.questArea).toBeGreaterThan(hierarchy.upgradeArea);
  expect(hierarchy.visualOrder).toBe(true);
  expect(hierarchy.upgradeIsPrimary).toBe(false);
  expect(hierarchy.questBackground).not.toBe(hierarchy.upgradeBackground);
  await page.screenshot({ path: 'artifacts/ux-phase-b/map-kingdom-action-hierarchy-desktop.png' });

  await page.locator('#kingdomClose').click();
  await page.locator('.knode.locked').first().evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('#kingdomLockPanel')).toBeVisible();
  await expect(page.locator('#kingdomOpenBody')).toBeHidden();
  await expect(page.locator('#kingdomLockLevel')).toContainText('冒险者 Lv.');
  await expect(page.locator('#kingdomLockTroops')).toContainText('名王国部队收藏');
  await expect(page.locator('#kingdomLockBonus')).toContainText('满级加成');
  await expect(page.locator('#kingdomLockedCta')).toBeVisible();
  await page.screenshot({ path: 'artifacts/ux-phase-b/map-kingdom-locked-gate-desktop.png' });
});

for (const viewport of [
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
]) {
  test(`王国主线在 ${viewport.label} 保留可读关卡卡与真实尺寸`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/game.html#quest/${encodeURIComponent('破碎尖塔')}`);
    await expect(page.locator('.quest-map')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.qtab')).toHaveCount(2);
    await expect(page.locator('.qtab[data-mode="normal"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#questExplore')).toContainText('12 档难度');
    await expect(page.locator('.qpin')).toHaveCount(8);

    const layout = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('#stage')!;
      const screen = document.querySelector<HTMLElement>('.quest-screen')!;
      const pin = document.querySelector<HTMLElement>('.qpin')!;
      const dock = document.querySelector<HTMLElement>('.quest-dock')!;
      const bottom = document.querySelector<HTMLElement>('.bottom-bar')!.getBoundingClientRect();
      const screenRect = screen.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      return {
        stageWidth: stage.getBoundingClientRect().width,
        stageHeight: stage.getBoundingClientRect().height,
        transform: getComputedStyle(stage).transform,
        pinSize: pin.getBoundingClientRect().width,
        screenAboveNav: screenRect.bottom <= bottom.top + 1,
        dockAboveNav: dockRect.bottom <= bottom.top + 2,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    expect(layout.stageWidth).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(layout.stageHeight).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(layout.transform).toBe('none');
    expect(layout.pinSize).toBeGreaterThan(30);
    expect(layout.screenAboveNav).toBe(true);
    expect(layout.dockAboveNav).toBe(true);
    expect(layout.documentOverflow).toBe(false);

    await page.screenshot({ path: `artifacts/ux-phase-b/quest-responsive-${viewport.label}.png` });
    await expect(page.locator('#questExplore')).toBeEnabled();
    await page.locator('#questExplore').click();
    await expect(page.locator('.explore-screen')).toBeVisible();
    await expect(page.locator('.ex-scale-labels span')).toHaveCount(12);
    await expect(page.locator('.ex-route li')).toHaveCount(6);
    await page.locator('#exploreFight').scrollIntoViewIfNeeded();
    await expect(page.locator('#exploreFight')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({ path: `artifacts/ux-phase-b/quest-responsive-${viewport.label}-explore.png` });
  });
}
