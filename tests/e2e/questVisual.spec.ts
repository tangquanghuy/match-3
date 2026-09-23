import { expect, test, type Page } from '@playwright/test';

const KINGDOM = '破碎尖塔';
const QUEST_HASH = `#quest/${encodeURIComponent(KINGDOM)}`;
type Mode = 'normal' | 'hard' | 'veryHard';

async function openQuest(page: Page, questsDone = 8): Promise<void> {
  await page.goto(`/game.html${QUEST_HASH}`);
  await expect(page.locator('.quest-map')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(({ kingdom, completed }) => {
    const key = 'gems.meta.save';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.kingdoms[kingdom].questsDone = completed;
    save.kingdoms[kingdom].exploreTier = completed === 8 ? 2 : 0;
    localStorage.setItem(key, JSON.stringify(save));
  }, { kingdom: KINGDOM, completed: questsDone });
  await page.reload();
  await expect(page.locator('.quest-map')).toBeVisible({ timeout: 15_000 });
}

async function selectMode(page: Page, mode: Mode): Promise<void> {
  await page.locator(`.qtab[data-mode="${mode}"]`).click();
  const suffix = mode === 'normal' ? '' : `/${mode.toLowerCase()}`;
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash)))
    .toBe(`#quest/${KINGDOM}${suffix}`);
  await expect(page.locator('.quest-map')).toHaveAttribute('data-mode', mode);
  await expect(page.locator(`.qtab[data-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.qtab[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.qpin')).toHaveCount(mode === 'normal' ? 8 : 3);
}

async function screenshot(page: Page, name: string): Promise<void> {
  await expect.poll(() => page.locator('.quest-map img').evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete),
  )).toBe(true);
  await page.screenshot({ path: `artifacts/quest-redesign/${name}.png`, animations: 'disabled' });
}

test('难度切换同步路由、节点和奖励图示，刷新保持 VERY HARD', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openQuest(page);
  await expect(page.locator('.qtab')).toHaveCount(3);
  for (const mode of ['normal', 'hard', 'veryHard'] as const) {
    const loot = page.locator(`.qtab[data-mode="${mode}"] .qtab-loot`);
    await expect(loot).toBeVisible();
    await expect.poll(() => loot.locator('.qloot-tile').count()).toBeGreaterThan(0);
    await expect.poll(() => loot.locator('.qloot-tile').evaluateAll((tiles) =>
      tiles.every((tile) => tile.querySelector('.qloot-symbol, img') !== null),
    )).toBe(true);
    await selectMode(page, mode);
    await expect(page.locator('#qdRewards')).toBeVisible();
    await expect.poll(() => page.locator('#qdRewards [data-reward]').count()).toBeGreaterThan(0);
  }

  const rewardKeys = await page.evaluate(() => {
    const keys = (selector: string): string[] => [...document.querySelectorAll<HTMLElement>(selector)]
      .map((element) => element.dataset.reward!);
    return {
      tab: keys('.qtab[data-mode="veryHard"] [data-reward]'),
      detail: keys('#qdRewards [data-reward]'),
    };
  });
  expect(rewardKeys.tab.length).toBeGreaterThan(0);
  expect(rewardKeys.tab.some((key) => rewardKeys.detail.includes(key))).toBe(true);
  await page.reload();
  await expect(page.locator('.qtab[data-mode="veryHard"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.qpin')).toHaveCount(3);
  await expect(page.locator('#questFight')).toBeEnabled();
  await screenshot(page, 'desktop-very-hard-rewards');
});

test('VERY HARD 三个关卡更新敌人等级并保存实际探索档位', async ({ page }) => {
  await openQuest(page);
  await selectMode(page, 'veryHard');
  for (const [node, level, tier] of [[1, 16, 4], [2, 21, 5], [3, 26, 6]]) {
    const pin = page.locator(`.qpin[data-node="${node}"]`);
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.qpin[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#qdTitle')).toHaveText(`${KINGDOM} ${node}`);
    await expect(page.locator('#qdSub')).toContainText(`Lv.${level}`);
    await expect(page.locator('#qdFoes .qd-foe')).toHaveCount(4);
    await expect(page.locator('#questFight')).toBeEnabled();
    await expect.poll(() => page.evaluate((kingdom) => {
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      return save.kingdoms[kingdom].exploreTier;
    }, KINGDOM)).toBe(tier);
  }
  await page.reload();
  await expect(page.locator('.qpin[data-node="3"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#qdSub')).toContainText('Lv.26');
});

test('普通主线全通后清晰呈现已通关，不能重复出战', async ({ page }) => {
  await openQuest(page);
  await expect(page.locator('#questFight')).toBeDisabled();
  await expect(page.locator('#questFight')).toContainText('已通关');
  await page.locator('.qpin[data-node="1"]').click();
  await expect(page.locator('#qdTitle')).toHaveText(`${KINGDOM} 1`);
  await expect(page.locator('#questFight')).toBeDisabled();
  await expect(page.locator('#questFight')).toContainText('已通关');
  await selectMode(page, 'hard');
  await expect(page.locator('#questFight')).toBeEnabled();
});

test('未全通存档可预览困难奖励，但只有当前普通关卡可以出战', async ({ page }) => {
  await openQuest(page, 3);
  await expect(page.locator('.qpin[data-node="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#questFight')).toBeEnabled();
  await page.locator('.qpin[data-node="5"]').click();
  await expect(page.locator('#questFight')).toBeDisabled();

  for (const mode of ['hard', 'veryHard'] as const) {
    await selectMode(page, mode);
    await page.locator('.qpin[data-node="3"]').click();
    await expect(page.locator('#qdTitle')).toHaveText(`${KINGDOM} 3`);
    await expect(page.locator('#qdRewards')).toBeVisible();
    await expect(page.locator('#questFight')).toBeDisabled();
  }
  expect(await page.evaluate((kingdom) => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    return save.kingdoms[kingdom].exploreTier;
  }, KINGDOM)).toBe(0);
  await screenshot(page, 'locked-very-hard-preview');
  await selectMode(page, 'normal');
  await expect(page.locator('.qpin[data-node="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#questFight')).toBeEnabled();
});

for (const viewport of [
  { width: 1600, height: 900, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
]) {
  test(`关卡选择 ${viewport.label} 的难度、关卡和出战控件完整且不重叠`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openQuest(page);
    for (const mode of ['normal', 'hard', 'veryHard'] as const) {
      await selectMode(page, mode);
      const layout = await page.evaluate(() => {
        const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
        const tabs = [...document.querySelectorAll('.qtab')].map((element) => element.getBoundingClientRect());
        const pins = [...document.querySelectorAll('.qpin')].map((element) => element.getBoundingClientRect());
        const dock = rect('.quest-dock');
        const fight = rect('#questFight');
        const nav = rect('.bottom-bar');
        const overlaps = (a: DOMRect, b: DOMRect): boolean =>
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        const controls = [...tabs, ...pins];
        return {
          documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          controlsWithinViewport: [...controls, fight].every((bounds) =>
            bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
            bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
          ),
          controlsOverlap: controls.some((a, index) => controls.slice(index + 1).some((b) => overlaps(a, b))),
          dockOverlapsControls: controls.some((control) => overlaps(control, dock)),
          dockAboveNav: dock.bottom <= nav.top + 2,
          fightWithinDock: fight.left >= dock.left - 1 && fight.right <= dock.right + 1 &&
            fight.top >= dock.top - 1 && fight.bottom <= dock.bottom + 1,
        };
      });
      expect(layout.documentOverflow).toBe(false);
      expect(layout.controlsWithinViewport).toBe(true);
      expect(layout.controlsOverlap).toBe(false);
      expect(layout.dockOverlapsControls).toBe(false);
      expect(layout.dockAboveNav).toBe(true);
      expect(layout.fightWithinDock).toBe(true);
      await screenshot(page, `${viewport.label}-${mode}`);
    }
  });
}
