import { expect, test, type Page } from '@playwright/test';

const ARTIFACT_DIR = 'artifacts/ux-phase-b/chests-corrections';

async function openFresh(page: Page, hash: string): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(`/game.html#${hash}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.chest-panel, .bag-panel')).toBeVisible({ timeout: 15_000 });
}

test.describe('宝箱视觉与批量入口', () => {
  test('荣耀宝箱常驻单抽与十连，余额不足时同时显示费用和缺口', async ({ page }) => {
    await openFresh(page, 'chests/keys');
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      save.currencies.glory = 0;
      save.currencies.gloryKeys = 0;
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
    });
    await page.reload();

    const single = page.locator('[data-open="glory-1"]');
    const ten = page.locator('[data-open="glory-10"]');
    await expect(single).toBeVisible();
    await expect(ten).toBeVisible();
    await expect(single).toBeDisabled();
    await expect(ten).toBeDisabled();
    await expect(single.locator('.btn-label')).toHaveText('还差 20 荣耀');
    await expect(single.locator('.btn-cost')).toHaveText('20');
    await expect(ten.locator('.btn-label')).toHaveText('还差 200 荣耀');
    await expect(ten.locator('.btn-cost')).toHaveText('200');

    const source = await page.locator('#stage').textContent();
    expect(source).not.toMatch(/RECENT LOOT|KEY SUMMON|GLORY SUMMON|GEM SUMMON|DROP RATES|PACK OPENING/);

    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      save.currencies.glory = 200;
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
    });
    await page.reload();
    await expect(page.locator('[data-open="glory-1"]')).toBeEnabled();
    await expect(page.locator('[data-open="glory-10"]')).toBeEnabled();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/glory-actions-desktop.png`,
      fullPage: false,
    });
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
    await page.locator('[data-open="glory-10"]').click();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('gems.meta.save')!).gachaLog[0]?.kind,
    )).toBe('glory');
    // Loot may award glory back. Replay the recorded seed against the pre-draw
    // save to check the exact debit AND credited loot rather than assuming zero.
    const settlement = await page.evaluate(async (before) => {
      const after = JSON.parse(localStorage.getItem('gems.meta.save')!);
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { openGloryChest } = await load('/src/meta/systems/gacha.ts');
      const result = openGloryChest(before, after.gachaLog[0].seed, 10);
      return { actual: after.currencies.glory, expected: before.currencies.glory, spent: result.spent.glory };
    }, before);
    expect(settlement.spent).toBe(200);
    expect(settlement.actual).toBe(settlement.expected);
    await expect(page.locator('#summonModal:not([hidden]), #gloryFeedback:not([hidden])')).toHaveCount(1);
  });

  test('材料库不再用英文眉题复读中文标题', async ({ page }) => {
    await openFresh(page, 'bag/stones');
    const source = await page.locator('#stage').textContent();
    expect(source).not.toMatch(/MATERIALS VAULT|FORGE INGOTS|TRAITSTONES|FORGE SCROLLS|CURRENCIES/);
    await expect(page.locator('.bag-tab')).toHaveCount(3);
  });

  for (const viewport of [
    { width: 1600, height: 900, label: 'desktop' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 390, height: 844, label: 'mobile' },
  ]) {
    test(`宝石宝箱主体在 ${viewport.label} 构图中居中且无遮挡`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFresh(page, 'chests/gems');
      await expect.poll(() => page.locator('.gem-chest-page .chest-art')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const framing = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('.chest-stage')!;
        const art = document.querySelector<HTMLImageElement>('.gem-chest-page .chest-art')!;
        const stageBox = stage.getBoundingClientRect();
        const artBox = art.getBoundingClientRect();
        return {
          naturalWidth: art.naturalWidth,
          stageCenter: stageBox.left + stageBox.width / 2,
          focalCenter: artBox.left + artBox.width * 0.45,
          stageHeight: stageBox.height,
          artWidth: artBox.width,
          stageWidth: stageBox.width,
          stageBottom: stageBox.bottom,
          recentTop: document.querySelector<HTMLElement>('.recent-bar')!.getBoundingClientRect().top,
          recentHeight: document.querySelector<HTMLElement>('.recent-bar')!.getBoundingClientRect().height,
          scrollWidth: document.documentElement.scrollWidth,
          objectPosition: getComputedStyle(art).objectPosition,
        };
      });

      expect(framing.naturalWidth).toBeGreaterThan(0);
      expect(framing.artWidth).toBeGreaterThan(framing.stageWidth * 1.09);
      expect(Math.abs(framing.focalCenter - framing.stageCenter)).toBeLessThan(2);
      expect(framing.objectPosition).toMatch(/^45%/);
      expect(framing.recentTop).toBeGreaterThanOrEqual(framing.stageBottom - 1);
      expect(framing.recentHeight).toBeLessThanOrEqual(100);
      if (viewport.width === 390) expect(framing.stageHeight).toBeGreaterThanOrEqual(300);
      expect(framing.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);

      await page.screenshot({
        path: `${ARTIFACT_DIR}/gem-chest-${viewport.label}.png`,
        fullPage: false,
      });
    });
  }
});


test('宝石宝箱概率公示：每种特质石1颗，高阶概率递减', async ({ page }) => {
  await openFresh(page, 'chests/gems');
  await page.locator('#showOdds').click();
  const rows = page.locator('#oddsDrawer .odds-row');
  for (const [name, rate] of [['高级特质石 ×1', '10%'], ['符文特质石 ×1', '8%'], ['秘法特质石 ×1', '2%'], ['圣辉石 ×1', '0.5%']]) {
    const row = rows.filter({ has: page.getByText(name!, { exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('span').last()).toHaveText(rate!);
  }
  const total = await rows.locator('span:last-child').allTextContents();
  expect(total.reduce((sum, text) => sum + Number.parseFloat(text), 0)).toBeCloseTo(100, 8);
});
