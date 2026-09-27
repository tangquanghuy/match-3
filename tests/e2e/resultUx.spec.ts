import { expect, test, type Page } from '@playwright/test';

async function mountResult(page: Page, gems = 0, returnHash = '#map', kind = 'pve') {
  await page.goto('/game.html#result');
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async ({ gems, returnHash, kind }) => {
    const path = '/src/meta/screens/resultScreen.ts';
    const { ResultScreen } = await import(/* @vite-ignore */ path);
    const screen = new ResultScreen();
    const detail = kind === 'pve' ? {
      victory: true,
      lines: [
        { key: 'kills', label: '击杀', deltas: { gold: 40, souls: 8 } },
        { key: 'victory', label: '胜利', deltas: { gold: 60, souls: 30 } },
        { key: 'battle-collect', label: '战斗收集', deltas: { gems } },
        { key: 'first-win', label: '每日首胜', deltas: { gems: 50 } },
        { key: 'kingdom-first-clear', label: '王国首通', deltas: { gems: 100 } },
        { key: 'event-milestone', label: '周常奖励', deltas: { gems: 500, gold: 9999 } },
        { key: 'quest', label: '任务', deltas: { goldKeys: 1 } },
      ],
      xpGained: 100, heroLevelsGained: 0, classLevelUp: null, classUnlocked: null,
      questProgress: { from: 3, to: 4 }, troopRewards: [{ troopId: 6169, note: '首通' }],
      firstWinClaimed: true,
    } : {
      kind, battle: { endReason: 'elimination' }, frenzy: false,
      settled: {
        victory: true, runOver: true, wins: 2, losses: 0, gold: 80, glory: 999, vpDelta: 100,
        battleRewards: { gold: 60, souls: 30, xpGained: 100, heroLevelsGained: 0 },
        collected: { gold: 0, souls: 0, gems, maps: 0 },
        rewards: { gold: 4000, souls: 750, gems: 50 },
      },
    };
    screen.setDetail(detail, { kingdom: kind === 'pve' ? '破碎尖塔' : '竞技场', sourceLabel: kind === 'pve' ? 'NORMAL 4' : '', returnHash });
    document.querySelector('#stage')!.innerHTML = screen.html();
    screen.mount({ save: () => ({ hero: { level: 1, xp: 20 }, kingdoms: {} }), navigate: () => undefined });
    const chrome = '/src/meta/shell/chrome.ts';
    const { mountIcons } = await import(/* @vite-ignore */ chrome);
    mountIcons(document.querySelector('#stage')!);
    await document.fonts.ready;
  }, { gems, returnHash, kind });
}

/** 真实存档 + 真实精通逻辑的升级流程；navigate 记录到 window.__nav。 */
async function mountLevelUp(page: Page, levels: number, offers: string[][]) {
  await page.goto('/game.html#result');
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async ({ levels, offers }) => {
    const load = (p: string) => import(/* @vite-ignore */ p);
    const { ResultScreen } = await load('/src/meta/screens/resultScreen.ts');
    const { newSave } = await load('/src/meta/state/schema.ts');
    const { pickManaMastery } = await load('/src/meta/systems/manaMastery.ts');
    const save = newSave({ now: 1 });
    save.hero.level = 6;
    save.hero.xp = 40;
    save.hero.manaMastery.Blue = 2;
    save.hero.masteryOffers = offers;
    const w = window as unknown as { __save: unknown; __nav: string | null };
    w.__save = save;
    w.__nav = null;
    const screen = new ResultScreen();
    screen.setDetail({
      victory: true, lines: [{ key: 'victory', label: '', deltas: { gold: 60, souls: 30 } }],
      xpGained: 500, heroLevelsGained: levels, classLevelUp: null, classUnlocked: null,
      questProgress: null, troopRewards: [], firstWinClaimed: false,
    }, { kingdom: '破碎尖塔', sourceLabel: 'NORMAL 5' });
    document.querySelector('#stage')!.innerHTML = screen.html();
    screen.mount({
      save: () => save,
      navigate: (hash: string) => { w.__nav = hash; },
      refreshChrome: () => undefined,
      gateway: { pickManaMastery: async (color: string) => ({ result: pickManaMastery(save, color) }) },
    });
  }, { levels, offers });
}

const amount = (page: Page, currency: string) => page.locator(`[data-battle-currency="${currency}"] strong`);
const navigated = (page: Page) => page.evaluate(() => (window as unknown as { __nav: string | null }).__nav);

test('直接进入结算页不伪造胜利或奖励', async ({ page }) => {
  await page.goto('/game.html#result');
  await expect(page.locator('#resultTitle')).toHaveText('暂无战报');
  await expect(page.locator('#standardXp')).toBeHidden();
  await expect(page.locator('#standardRewards')).toBeHidden();
  await expect(page.locator('#again')).toHaveText('去世界地图');
});

test('仅展示本场经验金币灵魂，首胜50宝石等额外来源不计入', async ({ page }) => {
  await mountResult(page);
  await expect(page.locator('#resultTitle')).toHaveText('战斗胜利');
  await expect(page.locator('#resultSub')).toHaveText('任务 · 破碎尖塔 · 第 4 关 · 进度：4/8');
  await expect(page.locator('#xpGain')).toHaveText('+100');
  await expect(page.locator('#xpLevel')).toHaveText('等级 1');
  await expect(amount(page, 'gold')).toHaveText('+100');
  await expect(amount(page, 'souls')).toHaveText('+38');
  await expect(amount(page, 'gems')).toHaveCount(0);
  await expect(page.locator('.reward-row')).toHaveCount(2);
  await expect(page.locator('#dropRow, #questRow, .pvp-settlement, #masteryRow')).toHaveCount(0);
  await expect(page.locator('.result-screen')).not.toContainText('每日首胜');
  await expect(page.locator('#again')).toHaveText('继续');
  await expect(page.locator('#again')).toHaveAttribute('title', '返回地图');
});

test('本场确有宝石时按实际数量显示，桌面和手机均无重叠', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountResult(page, 2);
  await expect(amount(page, 'gems')).toHaveText('+2');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.waitForTimeout(2200); // 入场动画结束后再量
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON() as DOMRect;
      return { title: box('#resultTitle'), sub: box('#resultSub'), rewards: box('#standardRewards'), actions: box('.result-actions') };
    });
    expect(boxes.title.bottom).toBeLessThanOrEqual(boxes.sub.top + 1);
    expect(boxes.sub.bottom).toBeLessThanOrEqual(boxes.rewards.top);
    expect(boxes.rewards.bottom).toBeLessThanOrEqual(boxes.actions.top + 1);
    await expect(page.locator('#again')).toBeInViewport();
    await expect(page.locator('#team')).toBeInViewport();
    await page.screenshot({ path: `artifacts/ux-phase-b/result-battle-only-${width}.png`, fullPage: true });
  }
});

test('活动返回入口保留，额外奖励面板移出结算', async ({ page }) => {
  await mountResult(page, 0, '#events/raidBoss');
  await expect(page.locator('#again')).toHaveAttribute('title', '返回活动页');
  await expect(page.locator('#again')).toHaveAccessibleName('继续：返回活动页');
  await expect(page.locator('.result-actions button:visible')).toHaveCount(2);
});

for (const kind of ['arena', 'invasion']) {
  test(`${kind}显示本场经验和货币而非整轮大奖或赛季积分`, async ({ page }) => {
    await mountResult(page, 0, `#${kind}`, kind);
    await expect(page.locator('#xpGain')).toHaveText('+100');
    await expect(amount(page, 'gold')).toHaveText(kind === 'arena' ? '+60' : '+140');
    await expect(amount(page, 'souls')).toHaveText('+30');
    await expect(amount(page, 'gems')).toHaveCount(0);
  });
}

test('升级：必须先二选一法力精通，选择经网关入账后才离开结算', async ({ page }) => {
  await mountLevelUp(page, 1, [['Blue', 'Red']]);
  await expect(page.locator('#xpNote')).toContainText('提升 1 级');
  await page.locator('#again').click();
  await expect(page.locator('#levelUp')).toBeVisible();
  await expect(page.locator('#resultSummary')).toBeHidden();
  await expect(page.locator('#luLevel')).toHaveText('6');
  await expect(page.locator('#levelUpTitle')).toHaveText('等级提升');
  await expect(page.locator('#luStep')).toBeHidden();
  const cards = page.locator('#luChoices .lu-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('+1 水之精通');
  await expect(cards.first()).toContainText('精通 2 → 3');
  await expect(cards.nth(1)).toContainText('+1 火之精通');
  await expect(page.locator('#luStats .lu-stat')).toHaveCount(4);
  await expect(page.locator('#luStats .lu-stat.is-up').first()).toBeVisible();

  const next = page.locator('#luContinue');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await next.click({ force: true });
  await expect(page.locator('#levelUp')).toBeVisible();
  expect(await navigated(page)).toBeNull();

  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'false');
  await cards.first().click();
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(next).toHaveAttribute('aria-disabled', 'false');
  await next.click();
  await expect.poll(() => navigated(page)).toBe('#map');
  const hero = await page.evaluate(() => (window as unknown as { __save: { hero: { manaMastery: Record<string, number>; masteryOffers: unknown[] } } }).__save.hero);
  expect(hero.manaMastery.Blue).toBe(3);
  expect(hero.manaMastery.Red).toBe(0);
  expect(hero.masteryOffers).toHaveLength(0);
});

test('连升两级逐页呈现，每页消耗一个精通点；无待分配点时可直接继续', async ({ page }) => {
  await mountLevelUp(page, 2, [['Green', 'Purple'], ['Yellow', 'Brown']]);
  await page.locator('#again').click();
  await expect(page.locator('#luLevel')).toHaveText('5');
  await expect(page.locator('#luStep')).toHaveText('1 / 2');
  await page.locator('#luChoices [data-mastery-color="Purple"]').click();
  await page.locator('#luContinue').click();
  await expect(page.locator('#luLevel')).toHaveText('6');
  await expect(page.locator('#luStep')).toHaveText('2 / 2');
  await expect(page.locator('#luChoices [data-mastery-color="Brown"]')).toBeVisible();
  await page.locator('#luChoices [data-mastery-color="Brown"]').click();
  await page.locator('#luContinue').click();
  await expect.poll(() => navigated(page)).toBe('#map');
  const mastery = await page.evaluate(() => (window as unknown as { __save: { hero: { manaMastery: Record<string, number> } } }).__save.hero.manaMastery);
  expect(mastery).toMatchObject({ Purple: 1, Brown: 1, Green: 0, Yellow: 0 });

  await mountLevelUp(page, 1, []);
  await page.locator('#again').click();
  await expect(page.locator('#luPrompt')).toContainText('法力精通已全部分配');
  await expect(page.locator('#luChoices .lu-card')).toHaveCount(0);
  await expect(page.locator('#luContinue')).toHaveAttribute('aria-disabled', 'false');
  await page.locator('#luContinue').click();
  await expect.poll(() => navigated(page)).toBe('#map');
});

test('胜利播放合成凯旋曲，升级叠加号角，离开结算淡出并交还氛围音乐', async ({ page }) => {
  await mountLevelUp(page, 1, [['Blue', 'Red']]);
  const music = () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/ResultMusic.ts')) ?? '/src/audio/ResultMusic.ts';
    const { resultMusic } = await import(/* @vite-ignore */ path);
    return resultMusic.theme as string | null;
  });
  await expect.poll(music).toBe('victory');
  await page.locator('#again').click();
  await expect.poll(music).toBe('victory');
  await page.evaluate(async () => {
    const path = '/src/meta/screens/resultScreen.ts';
    const { ResultScreen } = await import(/* @vite-ignore */ path);
    new ResultScreen().dispose();
  });
  await expect.poll(music).toBeNull();
});
