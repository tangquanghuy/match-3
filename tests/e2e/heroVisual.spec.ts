import { expect, test, type Page } from '@playwright/test';

const OUTPUT = 'artifacts/ux-phase-b/shots';

async function openFresh(page: Page): Promise<void> {
  await page.goto('/game.html#hero');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.hero-screen')).toBeVisible({ timeout: 15_000 });
  await page.locator('.hero-art img, .plate-art img').evaluateAll(async (images: HTMLImageElement[]) => {
    await Promise.all(images.map(async (image) => {
      if (!image.complete) await new Promise<void>((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
      await image.decode();
    }));
  });
}

test('英雄总览：关键四维、职业层级与立绘信息分区清晰', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openFresh(page);

  await expect(page.locator('#careerLevel')).toContainText('冠军 Lv.12');
  await expect(page.locator('#careerWins')).toContainText('34 / 250 胜');
  await expect(page.locator('#nextReward')).toContainText('冠军 Lv.20');
  await expect(page.locator('.hero-stat')).toHaveCount(4);
  // 演示档主角 Lv.20 督军：职业基底 生12/甲10/攻8/魔0 + 等级点 生13/甲9/攻6/魔5（heroLevelGain），
  // 骑士之剑淬炼 3 级 → floor(3/2)=1 点，按攻/甲/生/魔轮转落在攻击。
  await expect(page.locator('.hero-stat').nth(0)).toHaveAttribute('aria-label', '攻击 15，淬炼加成 1');
  await expect(page.locator('.hero-stat').nth(1)).toHaveAttribute('aria-label', '护甲 19');
  await expect(page.locator('.hero-stat').nth(2)).toHaveAttribute('aria-label', '生命 25');
  await expect(page.locator('.hero-stat').nth(3)).toHaveAttribute('aria-label', '魔力 5');
  await expect(page.locator('#playerName')).toHaveText('影织者');
  await expect(page.locator('.hero-art img')).toHaveAttribute('alt', '影织者');
  await expect(page.locator('.hero-metrics')).not.toContainText(/影织者|法露特/);
  await expect(page.locator('.hero-stat em')).toHaveCount(0);
  await expect(page.locator('#heroLevelLabel, #heroStatsNote')).toHaveCount(0);

  await expect(page.locator('#classCurrent')).toContainText('督军');
  await expect(page.locator('#classCurrent')).toContainText('34 / 250 胜');
  await expect(page.locator('#classPreview')).toHaveCount(0);
  await expect(page.locator('.class-vault')).not.toContainText('机械师');
  await expect(page.locator('.perk-summary-head b')).toHaveText('当前职业特质');
  await expect(page.locator('#perkBoardLegacy, #perkBoardCareerLegacy')).toHaveCount(0);
  await expect(page.locator('.talent-board')).toBeVisible();
  await expect(page.locator('#talentPath .talent-node')).toHaveCount(7);
  await expect(page.locator('#talentPath')).toHaveAttribute('aria-label', '2 / 7 已选');
  await expect(page.locator('#talentSummary')).toHaveText('2 / 7');
  await expect(page.locator('.weapon-slab .wspell-body > .ink-rule')).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const heroArt = rect('.hero-art');
    const heroMetrics = rect('.hero-metrics');
    const info = document.querySelector<HTMLElement>('.hero-info')!;
    const heroInfo = info.getBoundingClientRect();
    const weaponArt = rect('.weapon-plate .plate-art');
    const weaponPlate = rect('.weapon-plate');
    const weapon = rect('.weapon-slab');
    const sanctuary = rect('.class-vault');
    const talent = rect('.talent-board');
    return {
      heroSeparated: heroMetrics.top >= heroArt.bottom - 1,
      weaponFillsPlate: weaponArt.width >= weaponPlate.width - 18 && weaponArt.height >= weaponPlate.height - 18,
      sectionsSeparated: sanctuary.top >= weapon.bottom - 1,
      talentAfterSanctuary: talent.top >= sanctuary.bottom - 1,
      contentFits: talent.bottom <= heroInfo.bottom + 1,
      hasInnerScroll: info.scrollHeight > info.clientHeight + 1,
      overflowY: getComputedStyle(info).overflowY,
      artNaturalWidth: (document.querySelector('.hero-art img') as HTMLImageElement).naturalWidth,
    };
  });
  expect(geometry.heroSeparated).toBe(true);
  expect(geometry.weaponFillsPlate).toBe(true);
  expect(geometry.sectionsSeparated).toBe(true);
  expect(geometry.talentAfterSanctuary).toBe(true);
  expect(geometry.contentFits).toBe(true);
  expect(geometry.hasInnerScroll).toBe(false);
  expect(geometry.overflowY).toBe('hidden');
  expect(geometry.artNaturalWidth).toBeGreaterThan(0);
  await expect(page.locator('.weapon-plate .plate-caption')).toHaveCount(0);

  await page.locator('.weapon-slab .spell-stat').first().click();
  const formulaTip = page.locator('.weapon-slab .spell-tip:not([hidden])');
  await expect(formulaTip).toBeVisible();
  const tipGeometry = await formulaTip.evaluate((tip) => {
    const rect = tip.getBoundingClientRect();
    const stage = document.getElementById('stage')!.getBoundingClientRect();
    return {
      fullyRendered: tip.scrollHeight <= tip.clientHeight + 1,
      insideStage: rect.left >= stage.left && rect.right <= stage.right && rect.bottom <= stage.bottom,
      visibleAtBottom: document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 2)?.closest('.spell-tip') === tip,
    };
  });
  expect(tipGeometry.fullyRendered).toBe(true);
  expect(tipGeometry.insideStage).toBe(true);
  expect(tipGeometry.visibleAtBottom).toBe(true);
  await page.screenshot({ path: `${OUTPUT}/hero-final-formula-1600.png` });
  await page.keyboard.press('Escape');

  await page.screenshot({ path: `${OUTPUT}/hero-final-1600.png` });
});

test('天赋树：不可用内容锁定且只显示玩家口径', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openFresh(page);
  await page.locator('#openTree').click();
  await expect(page.locator('#treeVeil:not([hidden])')).toBeVisible();
  await expect(page.locator('.talent-cell')).toHaveCount(21);
  await expect(page.locator('.talent-flag')).toHaveText(['暂未开放', '暂未开放']);
  await expect(page.locator('#treeVeil')).not.toContainText('未实现');
  await expect(page.locator('#treeVeil')).not.toContainText('PvP');

  const unavailable = page.locator('.talent-cell[data-usable="no"], .talent-cell[data-usable="na"]');
  await expect(unavailable).toHaveCount(2);
  for (const cell of await unavailable.all()) {
    await expect(cell).toHaveClass(/locked/);
    await expect(cell).toHaveAttribute('aria-disabled', 'true');
    await expect(cell.locator('.talent-desc')).toHaveText('该天赋尚未开放');
  }
  await page.screenshot({ path: `${OUTPUT}/hero-final-tree-1600.png` });
});

for (const viewport of [
  { width: 768, height: 1024, label: '768' },
  { width: 390, height: 844, label: '390' },
]) {
  test(`英雄页 ${viewport.label}px 使用真实响应式布局`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openFresh(page);

    const layout = await page.evaluate(() => {
      const stage = document.getElementById('stage')!;
      const screen = document.querySelector<HTMLElement>('.hero-screen')!;
      const art = document.querySelector('.hero-art')!.getBoundingClientRect();
      const identity = document.querySelector('.hero-metrics')!.getBoundingClientRect();
      const weaponArt = document.querySelector('.weapon-plate .plate-art')!.getBoundingClientRect();
      const weaponPlate = document.querySelector('.weapon-plate')!.getBoundingClientRect();
      return {
        stageWidth: stage.getBoundingClientRect().width,
        stageHeight: stage.getBoundingClientRect().height,
        transform: getComputedStyle(stage).transform,
        screenWidth: screen.getBoundingClientRect().width,
        screenScrollable: screen.scrollHeight > screen.clientHeight,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroSeparated: identity.top >= art.bottom - 1,
        weaponFillsPlate: weaponArt.width >= weaponPlate.width - 18 && weaponArt.height >= weaponPlate.height - 18,
      };
    });
    expect(layout.stageWidth).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(layout.stageHeight).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(layout.transform).toBe('none');
    expect(layout.screenWidth).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(layout.pageOverflow).toBe(false);
    expect(layout.heroSeparated).toBe(true);
    expect(layout.weaponFillsPlate).toBe(true);
    if (viewport.width === 390) expect(layout.screenScrollable).toBe(true);

    await page.screenshot({ path: `${OUTPUT}/hero-final-${viewport.label}.png` });
    if (viewport.width === 390) {
      await page.locator('.class-vault').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUTPUT}/hero-final-390-career.png` });
      await page.locator('#openTree').scrollIntoViewIfNeeded();
      await page.locator('#openTree').click();
      await expect(page.locator('#treeVeil:not([hidden])')).toBeVisible();
      const tree = await page.locator('.tree-body').evaluate((el) => ({
        horizontal: el.scrollWidth > el.clientWidth,
        vertical: el.scrollHeight > el.clientHeight,
      }));
      expect(tree.horizontal).toBe(true);
      expect(tree.vertical).toBe(true);
      await page.screenshot({ path: `${OUTPUT}/hero-final-tree-390.png` });
    }
  });
}
