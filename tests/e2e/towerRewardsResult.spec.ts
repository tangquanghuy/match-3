import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 900 }, { width: 390, height: 844 },
  { width: 320, height: 568 }, { width: 844, height: 390 },
]) {
  for (const floor of [8, 16, 25]) {
    test(`爬塔 ${floor} 层材料进入普通胜利结算 ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/game.html#result', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.result-screen')).toBeVisible();
      const expected = await page.evaluate(async (floor) => {
        const load = (p: string) => import(/* @vite-ignore */ p);
        const { ResultScreen } = await load('/src/meta/screens/resultScreen.ts');
        const { newSave } = await load('/src/meta/state/schema.ts');
        const { ensureEventWeek } = await load('/src/meta/systems/events.ts');
        const { rewardTowerBoss } = await load('/src/meta/systems/eventHighTierRewards.ts');
        const { INGOT_NAMES, stoneName } = await load('/src/meta/data/materials.ts');
        const save = newSave({ now: 1 });
        const lines = rewardTowerBoss(save, ensureEventWeek(save, 0, 'towerOfDoom'), floor);
        const balance = JSON.stringify(save.materials);
        const screen = new ResultScreen();
        screen.setDetail({
          victory: true, lines: [
            { key: 'victory', label: '胜利', deltas: { gold: 60, souls: 30 } },
            ...lines,
            { key: 'event-progress', label: '其他进度', deltas: {}, mats: { forgeScrolls: 99 } },
          ],
          xpGained: 100, heroLevelsGained: 0, classLevelUp: null, classUnlocked: null,
          questProgress: null, troopRewards: [], firstWinClaimed: false,
        }, { kingdom: '', sourceLabel: '末日之塔', returnHash: '#events/towerOfDoom' });
        document.querySelector('#stage')!.innerHTML = screen.html();
        screen.mount({ save: () => save, navigate: (hash: string) => {
          (window as unknown as { __nav: string }).__nav = hash;
        } });
        const { mountIcons } = await load('/src/meta/shell/chrome.ts');
        mountIcons(document.querySelector('#stage')!);
        await document.fonts.ready;
        return {
          label: lines[0].label,
          unchanged: JSON.stringify(save.materials) === balance,
          materials: [
            ...Object.entries(lines[0].mats.ingots).map(([key, n]) => ({ key: `ingot:${key}`, name: INGOT_NAMES[key], n })),
            ...Object.entries(lines[0].mats.traitstones).map(([key, n]) => ({ key: `stone:${key}`, name: stoneName(key), n })),
            { key: 'forgeScrolls', name: '\u7194\u94f8\u7b26\u5377', n: 99 },
          ],
        };
      }, floor);
      expect(expected.unchanged).toBe(true);
      await expect(page.locator('#resultTitle')).toHaveText('战斗胜利');
      await expect(page.locator('#resultSub')).toContainText(expected.label);
      await expect(page.locator('#resultSub')).toContainText('已入账');
      await expect(page.locator('[data-battle-currency="gold"] strong')).toHaveText('+60');
      await expect(page.locator('[data-battle-material]')).toHaveCount(expected.materials.length);
      const scroll = page.locator('#resultScroll');
      const footer = (await page.locator('.result-actions').boundingBox())!;
      for (const material of expected.materials) {
        const card = page.locator(`[data-battle-material="${material.key}"]`);
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator('strong')).toHaveText(`+${material.n}`);
        await expect(card).toContainText(material.name);
        await expect.poll(() => card.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
        const box = (await card.boundingBox())!;
        const window = (await scroll.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y).toBeGreaterThanOrEqual(window.y - 1);
        expect(box.y + box.height).toBeLessThanOrEqual(window.y + window.height + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(footer.y + 1);
      }
      expect(await scroll.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.locator('#again').click();
      expect(await page.evaluate(() => (window as unknown as { __nav: string }).__nav)).toBe('#events/towerOfDoom');
    });
  }
}
