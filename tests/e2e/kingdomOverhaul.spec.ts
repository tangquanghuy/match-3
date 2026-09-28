import { expect, test, type Page } from '@playwright/test';

/**
 * 王国改版回归：迷雾（只渲染已开放 + 已探明）、宝库一键收取、编队拖拽自动保存、升级页「新王国开放」。
 * 全部走真实网关与真实存档（演示档 Lv.20）。
 */

type SaveLike = {
  hero: { level: number };
  currencies: { gold: number; souls: number };
  kingdoms: Record<string, { lastTributeAt: number }>;
  teams: Array<{ members: Array<{ kind: string; troopId?: number }> }>;
};

async function openMap(page: Page): Promise<void> {
  await page.goto('/game.html#map');
  await expect(page.locator('.map-shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.knode.sel')).toBeVisible();
}

/** 经网关导出 → 把所有王国的进贡锚点拨回 hours 小时前 → 导入，再刷新让各屏读到新存档 */
async function rewindTribute(page: Page, hours: number): Promise<void> {
  await page.evaluate(async (h) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const gw = metaGateway() as { exportSaveJson(): string; importSaveJson(t: string): Promise<unknown> };
    const save = JSON.parse(gw.exportSaveJson()) as { kingdoms: Record<string, { lastTributeAt: number }> };
    for (const k of Object.values(save.kingdoms)) k.lastTributeAt = Date.now() - h * 3_600_000;
    await gw.importSaveJson(JSON.stringify(save));
  }, hours);
  await page.reload();
}

const savedTeam = (page: Page) => page.evaluate(async () => {
  const load = (path: string) => import(/* @vite-ignore */ path);
  const { metaGateway } = await load('/src/meta/gateway/index.ts');
  const save = JSON.parse((metaGateway() as { exportSaveJson(): string }).exportSaveJson()) as SaveLike;
  return save.teams[0]!.members.map((m) => (m.kind === 'hero' ? 'hero' : m.troopId));
});

test('地图迷雾：只渲染已开放与已探明王国，探明王国是锁定态', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openMap(page);
  const fog = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const { kingdomsUnlockedAt, ALL_KINGDOMS_UNLOCK_LEVEL } = await load('/src/meta/data/kingdoms.ts');
    const save = JSON.parse((metaGateway() as { exportSaveJson(): string }).exportSaveJson()) as SaveLike;
    const nodes = [...document.querySelectorAll<HTMLElement>('.knode')];
    return {
      level: save.hero.level,
      total: ALL_KINGDOMS_UNLOCK_LEVEL as number,
      expectedOpen: (kingdomsUnlockedAt(save.hero.level) as string[]).length,
      rendered: nodes.length,
      open: nodes.filter((n) => !n.classList.contains('locked')).length,
      locked: nodes.filter((n) => n.classList.contains('locked')).length,
      lockedNotScouted: nodes.filter((n) => n.classList.contains('locked') && !n.classList.contains('scouted')).length,
    };
  });
  expect(fog.open).toBe(fog.expectedOpen);
  expect(fog.locked).toBeGreaterThan(0);
  expect(fog.locked).toBeLessThanOrEqual(3);
  expect(fog.lockedNotScouted).toBe(0);
  expect(fog.rendered).toBeLessThan(fog.total);
  await expect(page.locator('#mapFog')).toBeAttached();
});

test('宝库：攒满 12 小时后一键收取多国进贡并入账', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openMap(page);
  await rewindTribute(page, 12);
  await expect(page.locator('.map-shell')).toBeVisible({ timeout: 15_000 });

  const before = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const { tributeTreasury } = await load('/src/meta/systems/tribute.ts');
    const gw = metaGateway() as { exportSaveJson(): string };
    const save = JSON.parse(gw.exportSaveJson());
    const t = tributeTreasury(save, Date.now()) as { readyCount: number; totals: { gold: number; souls: number } };
    return { gold: save.currencies.gold as number, souls: save.currencies.souls as number, kingdoms: t.readyCount, total: t.totals };
  });
  expect(before.kingdoms).toBeGreaterThan(0);

  await page.locator('.knode.sel').click({ force: true });
  await expect(page.locator('#tributeRow')).toBeVisible();
  await page.locator('#kingdomCollect').click();
  await expect(page.locator('#tributeVeil')).toBeVisible();
  await expect(page.locator('#tributeRows .tr-row')).toHaveCount(before.kingdoms);
  await expect(page.locator('#tributeConfirm')).toBeEnabled();
  await page.locator('#tributeConfirm').click();
  await expect(page.locator('#tributeConfirm')).toHaveClass(/is-done/);

  const after = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const save = JSON.parse((metaGateway() as { exportSaveJson(): string }).exportSaveJson()) as SaveLike;
    const advanced = Object.values(save.kingdoms).filter((k) => Date.now() - k.lastTributeAt < 11 * 3_600_000).length;
    return { gold: save.currencies.gold, souls: save.currencies.souls, advanced };
  });
  expect(after.gold - before.gold).toBe(before.total.gold);
  expect(after.souls - before.souls).toBe(before.total.souls);
  // 收过的王国锚点都已前移（不再停在 12 小时前）
  expect(after.advanced).toBeGreaterThanOrEqual(before.kingdoms);
});

test('编队：拖拽换位即自动保存，拖出不满 4 人暂不保存，撤销后恢复', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#team');
  await expect(page.locator('.team-screen .slot').first()).toBeVisible({ timeout: 15_000 });
  const center = async (sel: string) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const drag = async (from: string, to: string) => {
    const a = await center(from);
    const b = await center(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 12, a.y + 8, { steps: 3 });
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
  };

  const before = await savedTeam(page);
  expect(before).toHaveLength(4);
  await drag('#slots [data-slot="0"]', '#slots [data-slot="3"]');
  await expect.poll(() => savedTeam(page)).toEqual([before[3], before[1], before[2], before[0]]);
  await expect(page.locator('#saveHint')).toContainText('已自动保存');

  const swapped = await savedTeam(page);
  await drag('#slots [data-slot="2"]', '#roster');
  await expect(page.locator('#saveHint')).toContainText('还差 1 人');
  expect(await savedTeam(page)).toEqual(swapped);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#saveHint')).toContainText('已自动保存');
  expect(await savedTeam(page)).toEqual(swapped);
  await expect(page.locator('#saveTeam')).toHaveCount(0);
});

for (const [level, visible] of [[6, true], [50, false]] as const) {
  test(`升级到 Lv.${level} ${visible ? '显示' : '不显示'}「新王国开放」`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/game.html#result');
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
    const expected = await page.evaluate(async (lv) => {
      const load = (p: string) => import(/* @vite-ignore */ p);
      const { ResultScreen } = await load('/src/meta/screens/resultScreen.ts');
      const { newSave } = await load('/src/meta/state/schema.ts');
      const { pickManaMastery } = await load('/src/meta/systems/manaMastery.ts');
      const { kingdomsUnlockedBetween } = await load('/src/meta/data/kingdoms.ts');
      const save = newSave({ now: 1 });
      save.hero.level = lv;
      save.hero.masteryOffers = [['Blue', 'Red']];
      const screen = new ResultScreen();
      screen.setDetail({
        victory: true, lines: [{ key: 'victory', label: '', deltas: { gold: 60, souls: 30 } }],
        xpGained: 500, heroLevelsGained: 1, classLevelUp: null, classUnlocked: null,
        questProgress: null, troopRewards: [], firstWinClaimed: false,
      }, { kingdom: '破碎尖塔', sourceLabel: 'NORMAL 5' });
      document.querySelector('#stage')!.innerHTML = screen.html();
      screen.mount({
        save: () => save, navigate: () => undefined, refreshChrome: () => undefined,
        gateway: { pickManaMastery: async (c: string) => ({ result: pickManaMastery(save, c) }) },
      });
      return kingdomsUnlockedBetween(lv - 1, lv) as string[];
    }, level);
    await page.locator('#again').click();
    await expect(page.locator('#levelUp')).toBeVisible();
    if (visible) {
      expect(expected).toHaveLength(1);
      await expect(page.locator('#luUnlock')).toBeVisible();
      await expect(page.locator('#luUnlock')).toContainText('新王国开放');
      await expect(page.locator('#luUnlock')).toContainText(expected[0]!);
    } else {
      await expect(page.locator('#luUnlock')).toBeHidden();
    }
  });
}
