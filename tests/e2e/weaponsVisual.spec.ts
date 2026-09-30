import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

async function waitForWeaponArt(page: Page): Promise<void> {
  await page.locator('.detail-art img, .upgrade-weapon-art img').first().evaluate(async (image: HTMLImageElement) => {
    if (!image.complete) await new Promise<void>((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
    await image.decode();
  });
}

test('武器目录使用固定分页，不再一次渲染瀑布长列表', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#weapons/owned');

  await expect(page.locator('.weapons-workspace--owned .weapon-card')).toHaveCount(12);
  await expect(page.locator('.weapons-page-total')).toHaveText('1-12 / 22');
  await expect(page.locator('.weapons-page-actions b')).toHaveText('第 1 / 2 页');
  await page.locator('[data-weapon-page="next"]').click();
  await expect(page.locator('.weapons-workspace--owned .weapon-card')).toHaveCount(10);
  await expect(page.locator('.weapons-page-total')).toHaveText('13-22 / 22');

  await page.locator('[data-weapon-tab="all"]').click();
  await expect(page.locator('.weapons-workspace--all .weapon-card')).toHaveCount(12);
  await expect(page.locator('.weapons-page-actions b')).toHaveText('第 1 / 60 页');
  await expect(page.locator('.weapons-page-total')).toHaveText('1-12 / 718');

  await page.locator('[data-weapon-search]').fill('中毒');
  expect(await page.locator('.weapons-workspace--all .weapon-card').count()).toBeLessThanOrEqual(12);
  await expect(page.locator('.weapons-page-actions b')).toContainText('第 1 /');
});

test('武器目录与详情共用规范稀有度名称和整卡边框色', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#weapons/all');

  const expected = [
    ['Common', '普通', 'rgb(170, 178, 173)'],
    ['Uncommon', '精良', 'rgb(76, 175, 106)'],
    ['Rare', '稀有', 'rgb(154, 79, 212)'],
    ['UltraRare', '传说', 'rgb(255, 226, 74)'],
    ['Epic', '史诗', 'rgb(197, 107, 45)'],
    ['Mythic', '神话', 'rgb(86, 216, 255)'],
    ['Doomed', '末日', 'rgb(212, 91, 89)'],
  ] as const;
  const rarityFilter = page.locator('[data-weapon-filter="rarity"]');
  await expect(rarityFilter.locator('option')).toHaveText(['稀有度', ...expected.map((entry) => entry[1])]);

  for (const [key, , color] of expected) {
    await rarityFilter.selectOption(key);
    const card = page.locator('.weapons-workspace--all .weapon-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-rarity', key);
    await expect(card.locator('.weapon-rarity')).toHaveCount(0);
    await expect.poll(() => card.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(color);
    await card.click();
    const sheet = page.locator('.weapon-detail-sheet');
    await expect(sheet).toBeVisible();
    await expect.poll(() => page.locator('.detail-art').evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(color);
    await expect.poll(() => sheet.evaluate((element) => getComputedStyle(element).getPropertyValue('--rarity-line').trim())).not.toBe('');
    await page.locator('[data-weapon-detail-close]').click();
  }
});

for (const viewport of [
  { width: 1600, height: 900, pageSize: 12 },
  { width: 768, height: 1024, pageSize: 8 },
  { width: 390, height: 844, pageSize: 4 },
]) {
  test(`武器目录 ${viewport.width}px 分页完整落在单屏`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/game.html#weapons/owned');
    await expect(page.locator('.weapons-workspace--owned .weapon-card')).toHaveCount(viewport.pageSize);
    const geometry = await page.locator('.weapons-screen').evaluate((screen) => ({
      clientHeight: screen.clientHeight,
      scrollHeight: screen.scrollHeight,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    expect(geometry.pageOverflow).toBe(false);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
    await page.screenshot({ path: `artifacts/ux-phase-b/shots/weapons-catalog-paged-${viewport.width}.png` });
  });
}

test('武器详情：立绘、四色属性和技能形成清晰主次，材料账本不在本页', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#weapons/owned');
  await page.locator('.weapons-workspace--owned .weapon-card').first().click();
  await expect(page.locator('.weapon-detail-sheet')).toBeVisible();
  await waitForWeaponArt(page);

  await expect(page.locator('.detail-stats .detail-stat')).toHaveCount(4);
  await expect(page.locator('.detail-spell')).toBeVisible();
  await expect(page.locator('.detail-spell .detail-section-heading h3')).toHaveText('武器技能');
  await expect(page.locator('.detail-acquire')).toBeVisible();
  await expect(page.locator('.detail-spell [data-icon="sparkles"]')).toHaveCount(1);
  await expect(page.locator('.resource-row')).toHaveCount(0);
  await expect(page.locator('[data-weapon-action="open-upgrade"]')).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const screen = rect('.weapons-screen');
    const sheet = rect('.weapon-detail-sheet');
    const topbar = rect('.topbar');
    const bottom = rect('.bottom-bar');
    const art = rect('.detail-art');
    const stats = rect('.detail-stats');
    const spell = rect('.detail-spell');
    const scroll = document.querySelector('.detail-scroll')!;
    const colors = [...document.querySelectorAll('.detail-stat')].map((node) => getComputedStyle(node).color);
    return {
      withinScreen: sheet.top >= screen.top && sheet.bottom <= screen.bottom && sheet.left >= screen.left && sheet.right <= screen.right,
      clearOfChrome: sheet.top >= topbar.bottom && sheet.bottom <= bottom.top,
      artWidth: art.width,
      artHeight: art.height,
      statsBelowArt: stats.top >= art.bottom,
      spellWidth: spell.width,
      spellFont: parseFloat(getComputedStyle(document.querySelector('.detail-copy')!).fontSize),
      needsScroll: scroll.scrollHeight > scroll.clientHeight + 1,
      colorCount: new Set(colors).size,
    };
  });
  expect(layout.withinScreen).toBe(true);
  expect(layout.clearOfChrome).toBe(true);
  expect(layout.artWidth).toBeGreaterThan(420);
  expect(layout.artHeight).toBeGreaterThan(300);
  expect(layout.statsBelowArt).toBe(true);
  expect(layout.spellWidth).toBeGreaterThan(500);
  expect(layout.spellFont).toBeGreaterThanOrEqual(16);
  expect(layout.needsScroll).toBe(false);
  expect(layout.colorCount).toBe(4);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-detail-final-1600.png' });

  await page.locator('[data-weapon-action="open-upgrade"]').click();
  await expect(page.locator('.weapon-upgrade-view')).toBeVisible();
  await expect(page.locator('.upgrade-resource-head')).toContainText('需求');
  await expect(page.locator('.upgrade-resource-head')).toContainText('持有');
  await expect(page.locator('.upgrade-resource-head')).toContainText('缺口');
  await expect(page.locator('.resource-row')).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-temper-final-1600.png' });
  await page.locator('[data-weapon-action="temper"]').click();
  await expect(page.locator('.upgrade-heading h2')).toContainText('升至 Lv.5');
});

test('词缀单列带图标且不重叠，达标精通武器可领取', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#weapons/owned');
  await page.locator('[data-weapon-search]').fill('守护者之戟');
  await page.locator('.weapons-workspace--owned .weapon-card').first().click();
  await waitForWeaponArt(page);
  await expect(page.locator('.affix-card')).toHaveCount(1);
  await expect(page.locator('.affix-card .affix-icon svg')).toHaveCount(1);
  const overlap = await page.locator('.affix-card').evaluate((card) => {
    const box = (selector: string) => card.querySelector(selector)!.getBoundingClientRect();
    const icon = box('.affix-icon');
    const copy = box('.affix-copy');
    const name = box('.affix-copy b');
    const state = box('.affix-state');
    const hit = (a: DOMRect, b: DOMRect) => a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
    return icon.right > copy.left + 1 || copy.right > state.left + 1 || hit(name, state);
  });
  expect(overlap).toBe(false);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-detail-affix-1600.png' });

  await page.locator('[data-weapon-detail-close]').click();
  await page.locator('[data-weapon-tab="all"]').click();
  await page.locator('[data-weapon-search]').fill('神性长枪');
  await page.locator('.weapons-workspace--all .weapon-card').first().click();
  await waitForWeaponArt(page);
  await expect(page.locator('.affix-card')).toHaveCount(2);
  await expect(page.locator('.affix-card .affix-icon[data-icon="orb"]')).toHaveCount(0);
  const lance = await page.evaluate(() => {
    const scroll = document.querySelector('.detail-scroll')!;
    const hits = [...document.querySelectorAll('.affix-card')].map((card) => {
      const name = card.querySelector('.affix-copy b')!.getBoundingClientRect();
      const desc = card.querySelector('.affix-copy small')!.getBoundingClientRect();
      const state = card.querySelector('.affix-state')!.getBoundingClientRect();
      const icon = card.querySelector('.affix-icon')!;
      const hit = (a: DOMRect, b: DOMRect) => a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
      return {
        overlap: hit(name, state) || hit(desc, state),
        iconName: icon.getAttribute('data-icon'),
      };
    });
    return {
      needsScroll: scroll.scrollHeight > scroll.clientHeight + 1,
      hits,
    };
  });
  expect(lance.needsScroll).toBe(false);
  expect(lance.hits.every((row) => !row.overlap)).toBe(true);
  expect(lance.hits.map((row) => row.iconName)).toEqual(['shield', 'swirl']);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-detail-lance-1600.png' });
  await page.locator('[data-weapon-detail-close]').click();

  await page.locator('[data-weapon-search]').fill('王者偃月刀');
  await page.locator('.weapons-workspace--all .weapon-card').first().click();
  await expect(page.locator('.detail-acquire')).toContainText('水之精通 8');
  await expect(page.locator('[data-weapon-action="goto-hero"]')).toContainText('前往法力精通');
});

test('熔炉要求进入独立次级页，并明确显示等级与资源缺口', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#weapons/forge');
  await expect(page.locator('.weapons-workspace--forge .weapon-card')).toHaveCount(9);
  await page.locator('.weapons-workspace--forge .weapon-card').last().click();
  await expect(page.locator('.detail-spell')).toBeVisible();
  await expect(page.locator('.resource-row')).toHaveCount(0);

  await page.locator('[data-weapon-action="open-upgrade"]').click();
  await expect(page.locator('.weapon-upgrade-view')).toBeVisible();
  await expect(page.locator('.weapon-detail-sheet-head')).toContainText('锻造准备');
  await expect(page.locator('.weapon-upgrade-view')).toContainText('劫数之书');
  expect((await page.locator('.weapon-upgrade-view').innerText()).match(/劫数之书/g)).toHaveLength(1);
  await expect(page.locator('.upgrade-gate')).toContainText('主角 Lv.40');
  // 演示档主角 Lv.20（buildDemoSave），门槛 Lv.40 → 差 20 级
  await expect(page.locator('.upgrade-gate')).toContainText('当前 Lv.20');
  await expect(page.locator('.upgrade-gate')).toContainText('还差 20 级');
  await expect(page.locator('.resource-row')).toHaveCount(2);
  await expect(page.locator('.resource-row.is-short')).toHaveCount(2);
  await expect(page.locator('.detail-actions .primary-action')).toBeDisabled();
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/weapons-forge-requirements-final-1600.png' });

  await page.locator('.detail-actions [data-weapon-action="back-detail"]').click();
  await expect(page.locator('.detail-spell')).toBeVisible();
  await expect(page.locator('.weapon-upgrade-view')).toHaveCount(0);
});

for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`武器详情 ${viewport.width}px：不越过外壳且无横向溢出`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/game.html#weapons/forge');
    await page.locator('.weapons-workspace--forge .weapon-card').first().click();
    await waitForWeaponArt(page);

    const overview = await page.evaluate(() => {
      const screen = document.querySelector('.weapons-screen')!.getBoundingClientRect();
      const sheet = document.querySelector('.weapon-detail-sheet')!.getBoundingClientRect();
      const art = document.querySelector('.detail-art')!.getBoundingClientRect();
      return {
        contained: sheet.top >= screen.top && sheet.bottom <= screen.bottom && sheet.left >= screen.left && sheet.right <= screen.right,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        artWidth: art.width,
        statOverflow: [...document.querySelectorAll('.detail-stat')].some((node) => {
          const parent = node.getBoundingClientRect();
          return [...node.children].some((child) => {
            const box = child.getBoundingClientRect();
            return box.left < parent.left - 1 || box.right > parent.right + 1;
          });
        }),
      };
    });
    expect(overview.contained).toBe(true);
    expect(overview.pageOverflow).toBe(false);
    expect(overview.artWidth).toBeGreaterThan(viewport.width === 390 ? 340 : 220);
    expect(overview.statOverflow).toBe(false);
    await page.screenshot({ path: `artifacts/ux-phase-b/shots/weapons-detail-final-${viewport.width}.png` });

    await page.locator('[data-weapon-action="open-upgrade"]').click();
    await expect(page.locator('.resource-row')).toHaveCount(2);
    const upgrade = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rowOverflow: [...document.querySelectorAll('.resource-row')].some((node) => node.scrollWidth > node.clientWidth + 1),
      actionVisible: (() => {
        const action = document.querySelector('.detail-actions')!.getBoundingClientRect();
        const sheet = document.querySelector('.weapon-detail-sheet')!.getBoundingClientRect();
        return action.top >= sheet.top && action.bottom <= sheet.bottom;
      })(),
    }));
    expect(upgrade.pageOverflow).toBe(false);
    expect(upgrade.rowOverflow).toBe(false);
    expect(upgrade.actionVisible).toBe(true);
    await page.screenshot({ path: `artifacts/ux-phase-b/shots/weapons-upgrade-final-${viewport.width}.png` });
  });
}
