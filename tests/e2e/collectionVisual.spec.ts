import { expect, test, type Page } from '@playwright/test';

const RARITY_BORDER = [
  'rgb(170, 178, 173)',
  'rgb(76, 175, 106)',
  'rgb(154, 79, 212)',
  'rgb(255, 226, 74)',
  'rgb(197, 107, 45)',
  'rgb(86, 216, 255)',
] as const;

async function openFresh(page: Page, hash: 'troop' | 'team'): Promise<void> {
  await page.goto(`/game.html#${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(hash === 'troop' ? '#collection' : '.team-screen')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(hash === 'troop' ? '#collection' : '.team-screen')).toBeVisible({ timeout: 15_000 });
}

test.describe('收藏域视觉回归', () => {
  test('图鉴浏览卡以六档整框表达稀有度，姓名栏不覆盖官方立绘', async ({ page }) => {
    await openFresh(page, 'troop');
    await page.locator('[data-tab="all"]').click();

    for (let tier = 0; tier < RARITY_BORDER.length; tier += 1) {
      await page.locator(`#rarityChips [data-rarity="${tier}"]`).click();
      await expect(page.locator('#collectionPage')).toHaveText('1');
      const card = page.locator(`.collection-card.r-${tier}`).first();
      await expect(card).toBeVisible();
      await expect.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(RARITY_BORDER[tier]);
    }

    const card = page.locator('.collection-card').first();
    const separation = await card.evaluate((el) => {
      const art = el.querySelector('img')!.getBoundingClientRect();
      const info = el.querySelector('.collection-info')!.getBoundingClientRect();
      return { artBottom: art.bottom, infoTop: info.top, stats: el.querySelectorAll('.card-stats, .stat-chips').length };
    });
    expect(separation.infoTop).toBeGreaterThanOrEqual(separation.artBottom - 1);
    expect(separation.stats).toBe(0);

    await card.click();
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#rarityBadge')).toBeHidden();
    const detailRarity = await page.locator('#characterCard').evaluate((el) => ({
      tier: Number((el as HTMLElement).dataset.rarity),
      border: getComputedStyle(el).borderTopColor,
    }));
    expect(detailRarity.border).toBe(RARITY_BORDER[detailRarity.tier]);
  });

  test('编队槽与名册卡保留立绘主体，姓名和等级进入独立底栏', async ({ page }) => {
    await openFresh(page, 'team');
    const mini = page.locator('.mini').first();
    await expect(mini).toBeVisible();
    const geometry = await mini.evaluate((el) => {
      const art = el.querySelector('img')!.getBoundingClientRect();
      const info = el.querySelector('.mini-shade')!.getBoundingClientRect();
      return {
        artBottom: art.bottom,
        infoTop: info.top,
        statBlocks: el.querySelectorAll('.stat-chips, .card-stats').length,
      };
    });
    expect(geometry.infoTop).toBeGreaterThanOrEqual(geometry.artBottom - 1);
    expect(geometry.statBlocks).toBe(0);
    await expect(page.locator('.slot .stat-chips, .slot .card-stats')).toHaveCount(0);

    const framed = page.locator('.mini[class*=" r-"]:not(.r-hero)').first();
    const rarity = await framed.evaluate((el) => {
      const cls = [...el.classList].find((name) => /^r-[0-5]$/.test(name))!;
      return { tier: Number(cls.slice(2)), border: getComputedStyle(el).borderTopColor };
    });
    expect(rarity.border).toBe(RARITY_BORDER[rarity.tier]);
  });

  test('collection cards fit two desktop viewports with aligned metadata', async ({ page }) => {
    for (const viewport of [
      { width: 2048, height: 997, pageSize: 16 },
      { width: 1280, height: 800, pageSize: 14 },
    ]) {
      await page.setViewportSize(viewport);
      await openFresh(page, 'troop');
      await page.locator('[data-tab="all"]').click();
      await expect(page.locator('.collection-card')).toHaveCount(viewport.pageSize);
      const geometry = await page.locator('#collectionBands').evaluate((bands) => {
        const info = bands.querySelector('.collection-info')!;
        const name = info.querySelector('h2')!.getBoundingClientRect();
        const level = info.querySelector('.collection-level')!.getBoundingClientRect();
        const role = info.querySelector('.collection-role')!.getBoundingClientRect();
        return { scrollHeight: bands.scrollHeight, clientHeight: bands.clientHeight,
          nameBottom: name.bottom, levelTop: level.top, nameRight: name.right, roleLeft: role.left };
      });
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
      expect(geometry.nameBottom).toBeLessThanOrEqual(geometry.levelTop + 1);
      expect(geometry.nameRight).toBeLessThan(geometry.roleLeft);
    }
  });

  for (const viewport of [
    { width: 1600, height: 900, label: '桌面', pageSize: 16 },
    { width: 768, height: 1024, label: '平板', pageSize: 8 },
    { width: 390, height: 844, label: '手机', pageSize: 4 },
  ]) {
    test(`${viewport.label}图鉴使用真分页且详情只有一层滚动`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFresh(page, 'troop');
      await page.locator('[data-tab="all"]').click();

      const cards = page.locator('.collection-card');
      const pager = page.locator('#collectionPagination');
      await expect(pager).toBeVisible();
      await expect(cards).toHaveCount(viewport.pageSize);
      await expect(page.locator('#collectionPage')).toHaveText('1');
      await expect(page.locator('#collectionPages')).not.toHaveText('1');
      await expect(page.locator('#collectionPrev')).toBeDisabled();
      await expect(page.locator('#collectionNext')).toBeEnabled();
      // 由 Vite 加载真实总池（含社区卡），避免扩池后旧的硬编码数量误报。
      const troopCount = await page.evaluate(async () => { const path = '/src/data/troops.ts'; return (await import(path)).TROOPS.length as number; });
      await expect(page.locator('#collectionRange')).toContainText(`共 ${troopCount.toLocaleString('en-US')} 支`);

      const listGeometry = await page.locator('#collectionBands').evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(listGeometry.scrollHeight).toBeLessThanOrEqual(listGeometry.clientHeight + 1);

      const firstPageId = await cards.first().getAttribute('data-troop');
      await page.locator('#collectionBands').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(cards).toHaveCount(viewport.pageSize);

      await page.locator('#collectionNext').click();
      await expect(page.locator('#collectionPage')).toHaveText('2');
      await expect.poll(() => page.locator('#collectionBands').evaluate((element) => element.scrollTop)).toBe(0);
      expect(await cards.first().getAttribute('data-troop')).not.toBe(firstPageId);

      await page.locator('[data-rarity="5"]').click();
      await expect(page.locator('#collectionPage')).toHaveText('1');
      await expect(page.locator('#collectionRange')).toContainText('共');
      await expect.poll(() => cards.evaluateAll((images) => images.every((card) => {
        const image = card.querySelector<HTMLImageElement>('img');
        return !!image?.complete && image.naturalWidth > 0;
      }))).toBe(true);
      await page.screenshot({ path: `artifacts/ux-phase-b/collection-paged-${viewport.width}.png` });

      await cards.first().click();
      await expect(page.locator('#detail')).toBeVisible();
      await expect(page.locator('#collection')).toBeHidden();
      const scrollState = await page.evaluate(() => {
        const detail = document.querySelector<HTMLElement>('#detail')!;
        const spellBody = document.querySelector<HTMLElement>('#detail .spell-body')!;
        return {
          detailOverflow: getComputedStyle(detail).overflowY,
          spellOverflow: getComputedStyle(spellBody).overflowY,
          nestedSpellScroll: spellBody.scrollHeight > spellBody.clientHeight + 1
            && ['auto', 'scroll'].includes(getComputedStyle(spellBody).overflowY),
        };
      });
      expect(scrollState.detailOverflow).toBe('auto');
      expect(scrollState.spellOverflow).toBe('visible');
      expect(scrollState.nestedSpellScroll).toBe(false);
    });
  }

  test('全局滚动条主题覆盖前置与后置页面样式', async ({ page }) => {
    const cases = [
      { hash: 'troop', selector: '#collectionBands' },
      { hash: 'settings', selector: '.settings-screen' },
      { hash: 'arena', selector: '.arena-screen' },
    ];

    for (const item of cases) {
      await page.goto(`/game.html#${item.hash}`);
      const target = page.locator(item.selector);
      await expect(target).toBeVisible({ timeout: 15_000 });
      const scrollbar = await target.evaluate((element) => ({
        color: getComputedStyle(element).scrollbarColor,
        width: getComputedStyle(element).scrollbarWidth,
        thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
        track: getComputedStyle(element, '::-webkit-scrollbar-track').backgroundColor,
      }));
      expect(scrollbar).toEqual({
        color: 'rgb(98, 95, 89) rgb(13, 17, 21)',
        width: 'thin',
        thumb: 'rgb(98, 95, 89)',
        track: 'rgb(13, 17, 21)',
      });
    }
  });

  for (const viewport of [
    { width: 768, height: 1024, label: '平板' },
    { width: 390, height: 844, label: '手机' },
  ]) {
    test(`${viewport.label}图鉴与编队使用真实尺寸而非整体缩放`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFresh(page, 'troop');
      const collection = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('.stage')!;
        const card = document.querySelector<HTMLElement>('.collection-card')!;
        return {
          stageWidth: stage.getBoundingClientRect().width,
          stageHeight: stage.getBoundingClientRect().height,
          transform: getComputedStyle(stage).transform,
          cardWidth: card.getBoundingClientRect().width,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(collection.stageWidth).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(collection.stageHeight).toBeGreaterThanOrEqual(viewport.height - 1);
      expect(collection.transform).toBe('none');
      expect(collection.cardWidth).toBeGreaterThan(150);
      expect(collection.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);

      await page.goto('/game.html#team');
      await expect(page.locator('.team-screen')).toBeVisible();
      const team = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('.stage')!;
        const slot = document.querySelector<HTMLElement>('.slot:not(.empty)')!;
        const mini = document.querySelector<HTMLElement>('.mini')!;
        const art = mini.querySelector('img')!.getBoundingClientRect();
        const info = mini.querySelector('.mini-shade')!.getBoundingClientRect();
        return {
          stageWidth: stage.getBoundingClientRect().width,
          transform: getComputedStyle(stage).transform,
          slotWidth: slot.getBoundingClientRect().width,
          miniWidth: mini.getBoundingClientRect().width,
          artBottom: art.bottom,
          infoTop: info.top,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(team.stageWidth).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(team.transform).toBe('none');
      expect(team.slotWidth).toBeGreaterThan(160);
      expect(team.miniWidth).toBeGreaterThan(100);
      expect(team.infoTop).toBeGreaterThanOrEqual(team.artBottom - 1);
      expect(team.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }

  test('按王国分组时同一王国的卡留在同一页', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await openFresh(page, 'troop');
    await page.locator('[data-tab="all"]').click();
    await page.locator('#groupSelect').selectOption('kingdom');
    await expect(page.locator('.kingdom-section').first()).toBeVisible();

    const seen = new Map<string, number>();
    const pageCount = Number((await page.locator('#collectionPages').innerText()).replace(/,/g, ''));
    for (let i = 0; i < pageCount; i += 1) {
      const bands = await page.locator('.kingdom-section').evaluateAll((sections) => sections.map((section) => ({
        name: section.querySelector('b')?.textContent ?? '',
        cards: section.querySelectorAll('.collection-card').length,
      })));
      expect(bands.length).toBeGreaterThan(0);
      for (const band of bands) {
        expect(seen.has(band.name), `${band.name} 被拆到了多页`).toBe(false);
        expect(band.cards).toBeGreaterThan(0);
        seen.set(band.name, band.cards);
      }
      if (i < pageCount - 1) await page.locator('#collectionNext').click();
    }
    expect(Math.max(...seen.values())).toBeGreaterThan(16);
  });
});
