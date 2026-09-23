import { test, expect } from '@playwright/test';

test.describe('结算屏 R-1/R-2/R-3/R-7 UX 回归', () => {
  test('直链空态不谎报胜利，也不再展示多余入账文案', async ({ page }) => {
    await page.goto('/game.html#result');
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.result-screen')).toHaveClass(/is-empty/);
    await expect(page.locator('#resultTitle')).toHaveText('暂无战报');
    await expect(page.locator('#resultEn, #kicker, #pvpKicker, .result-summary > .panel-inner > .eyebrow')).toHaveCount(0);
    expect(await page.locator('.result-screen').innerText()).not.toMatch(/BATTLE REPORT|NO REPORT|MATCH RESULT|VICTORY|DEFEAT|BATTLE SUMMARY|ARENA RUN|INVASION REPORT/);
    await expect(page.locator('#standardXp')).toBeHidden();
    await expect(page.locator('#standardRewards')).toBeHidden();
    await expect(page.locator('#again')).toHaveText('去世界地图');
    expect(await page.locator('.result-screen').innerText()).not.toMatch(/奖励已自动入账|数字即入账结果/);
  });

  test('空态结算页在平板和手机使用真实视口布局', async ({ page }) => {
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/game.html#result');
      await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('#stage')).toHaveClass(/result-responsive/);
      const geometry = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('#stage')!;
        return {
          viewport: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          stageWidth: stage.getBoundingClientRect().width,
          stageHeight: stage.getBoundingClientRect().height,
          transform: getComputedStyle(stage).transform,
          actions: document.querySelector('.result-actions')?.getBoundingClientRect().right ?? 0,
        };
      });
      expect(geometry.stageWidth).toBeCloseTo(geometry.viewport, 0);
      expect(geometry.stageHeight).toBeCloseTo(geometry.viewportHeight, 0);
      expect(geometry.transform).toBe('none');
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.actions).toBeLessThanOrEqual(geometry.viewport + 1);
    }
  });

  test('真实奖励卡使用官方立绘和六档边框，不把战斗四维压到卡面', async ({ page }) => {
    await page.goto('/game.html#result');
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => {
      const modulePath = '/src/meta/screens/resultScreen.ts';
      const { ResultScreen } = await import(/* @vite-ignore */ modulePath);
      const screen = new ResultScreen();
      screen.setDetail({
        victory: true,
        lines: [],
        xpGained: 40,
        heroLevelsGained: 0,
        classLevelUp: null,
        classUnlocked: null,
        questProgress: { from: 3, to: 4 },
        troopRewards: [{ troopId: 6169, note: '加尔凡尼亚任务 4/8 首通' }],
        firstWinClaimed: false,
      }, { kingdom: '破碎尖塔', sourceLabel: 'KINGDOM QUEST 04' });
      const ctx = {
        save: () => ({ hero: { level: 1, xp: 0 }, kingdoms: {} }),
        navigate: () => undefined,
      } as never;
      const stage = document.querySelector('#stage')!;
      stage.innerHTML = screen.html();
      screen.mount(ctx);
    });
    await expect(page.locator('#dropRow')).toBeVisible();
    await expect(page.locator('#rewardRows')).toContainText('本场暂无额外奖励');
    await expect(page.locator('#rewardRows')).not.toContainText('战败保底');
    const emptyRewardWidth = await page.locator('.reward-row--empty > div').evaluate((el) => el.getBoundingClientRect().width);
    expect(emptyRewardWidth).toBeGreaterThan(100);
    await expect(page.locator('#again')).toHaveText('返回地图');
    await expect(page.locator('#again')).not.toContainText('再战');
    await expect(page.locator('#dropName')).toHaveText('德拉古力斯');
    await expect(page.locator('#dropRarity')).toHaveText('神话');
    await expect(page.locator('#dropCard')).toHaveClass(/\br-5\b/);
    await expect(page.locator('#dropArt')).toHaveAttribute('src', /\/meta\/assets\/portraits\//);
    await expect.poll(() => page.locator('#dropArt').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('#sumArt')).toHaveAttribute('src', '/meta/assets/kingdom-spire.png');
    await expect(page.locator('#dropCard')).toBeEmpty();
    expect(await page.locator('#dropRow').innerText()).not.toMatch(/攻|护|生|魔/);
    expect(await page.locator('.result-screen').innerText()).not.toMatch(/BATTLE REPORT|MATCH RESULT|VICTORY|DEFEAT|BATTLE SUMMARY|ARENA RUN|INVASION REPORT/);
    expect(await page.locator('.result-screen').innerText()).not.toMatch(/奖励已自动入账|数字即入账结果/);
    await expect(page.locator('.result-summary')).toHaveCount(0);
    const layout = await page.evaluate(() => ({
      cardWidth: parseFloat(getComputedStyle(document.querySelector('#dropCard')!).width),
      imageBottom: document.querySelector('#dropCard')!.getBoundingClientRect().bottom,
      questTop: document.querySelector('#questRow')!.getBoundingClientRect().top,
      questBottom: document.querySelector('#questRow')!.getBoundingClientRect().bottom,
      actionTop: document.querySelector('.result-actions')!.getBoundingClientRect().top,
    }));
    expect(layout.cardWidth).toBeGreaterThanOrEqual(100);
    expect(layout.imageBottom).toBeLessThanOrEqual(layout.questTop);
    expect(layout.questBottom).toBeLessThanOrEqual(layout.actionTop);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      card: document.querySelector('#dropCard')!.getBoundingClientRect(),
      row: document.querySelector('#dropRow')!.getBoundingClientRect(),
      stageTransform: getComputedStyle(document.querySelector('#stage')!).transform,
    }));
    expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewport + 1);
    expect(mobile.stageTransform).toBe('none');
    expect(mobile.card.right).toBeLessThanOrEqual(mobile.row.right);
  });

  test('多行资源和部队奖励并排呈现，任务进度及操作不被遮挡', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/game.html#result');
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => {
      const modulePath = '/src/meta/screens/resultScreen.ts';
      const { ResultScreen } = await import(/* @vite-ignore */ modulePath);
      const screen = new ResultScreen();
      screen.setDetail({
        victory: true,
        lines: [
          { key: 'kills', label: '击杀奖励', deltas: { gold: 1240, souls: 86 } },
          { key: 'first-win', label: '每日首胜', deltas: { gems: 50 } },
          { key: 'quest', label: '王国任务', deltas: { goldKeys: 1 } },
        ],
        xpGained: 40,
        heroLevelsGained: 0,
        classLevelUp: null,
        classUnlocked: null,
        questProgress: { from: 3, to: 4 },
        troopRewards: [{ troopId: 6169, note: '任务 4/8 首通' }],
        firstWinClaimed: true,
      }, { kingdom: '破碎尖塔', sourceLabel: 'KINGDOM QUEST 04' });
      const ctx = {
        save: () => ({ hero: { level: 1, xp: 0 }, kingdoms: {} }),
        navigate: () => undefined,
      } as never;
      document.querySelector('#stage')!.innerHTML = screen.html();
      screen.mount(ctx);
      const chromePath = '/src/meta/shell/chrome.ts';
      const { mountIcons } = await import(/* @vite-ignore */ chromePath);
      mountIcons(document.querySelector('#stage')!);
      await document.fonts.ready;
    });
    await expect(page.locator('.result-screen')).toHaveClass(/has-troop-reward/);
    await expect(page.locator('.reward-row')).toHaveCount(4);
    await expect.poll(() => page.locator('#dropArt').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => page.locator('#sumArt').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const main = document.querySelector('.result-main .panel-inner')!;
      return {
        reward: box('#standardRewards'), drop: box('#dropRow'), quest: box('#questRow'),
        actions: box('.result-actions'), mainScroll: main.scrollHeight, mainHeight: main.clientHeight,
      };
    });
    expect(geometry.reward.right).toBeLessThan(geometry.drop.left);
    expect(geometry.drop.bottom).toBeLessThanOrEqual(geometry.quest.top);
    expect(geometry.quest.bottom).toBeLessThanOrEqual(geometry.actions.top);
    expect(geometry.mainScroll).toBeLessThanOrEqual(geometry.mainHeight + 2);
    await page.screenshot({ path: 'artifacts/ux-phase-b/result-rich-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'artifacts/ux-phase-b/result-rich-mobile.png', fullPage: true });

    const longRewards = await page.evaluate(() => {
      const list = document.querySelector('#standardRewards')!;
      const rows = document.querySelector('#rewardRows')!;
      const template = rows.firstElementChild!;
      for (let i = 0; i < 10; i++) rows.appendChild(template.cloneNode(true));
      const scroller = document.querySelector('.result-screen')!;
      return {
        listScroll: list.scrollHeight,
        listHeight: list.clientHeight,
        screenScroll: scroller.scrollHeight,
        screenHeight: scroller.clientHeight,
        questBottom: document.querySelector('#questRow')!.getBoundingClientRect().bottom,
        actionsTop: document.querySelector('.result-actions')!.getBoundingClientRect().top,
      };
    });
    expect(longRewards.listScroll).toBeLessThanOrEqual(longRewards.listHeight + 2);
    expect(longRewards.screenScroll).toBeGreaterThan(longRewards.screenHeight);
    expect(longRewards.questBottom).toBeLessThanOrEqual(longRewards.actionsTop);
  });

  test('来源返回文案按活动来源区分，不伪装成重放', async ({ page }) => {
    await page.goto('/game.html#result');
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => {
      const modulePath = '/src/meta/screens/resultScreen.ts';
      const { ResultScreen } = await import(/* @vite-ignore */ modulePath);
      const screen = new ResultScreen();
      screen.setDetail({
        victory: true,
        lines: [],
        xpGained: 0,
        heroLevelsGained: 0,
        classLevelUp: null,
        classUnlocked: null,
        questProgress: null,
        troopRewards: [],
        firstWinClaimed: false,
      }, { kingdom: '破碎尖塔', sourceLabel: 'RAID BOSS', returnHash: '#events/raidBoss' });
      const ctx = {
        save: () => ({ hero: { level: 1, xp: 0 }, kingdoms: {} }),
        navigate: () => undefined,
      } as never;
      const stage = document.querySelector('#stage')!;
      stage.innerHTML = screen.html();
      screen.mount(ctx);
    });
    await expect(page.locator('#again')).toHaveText('返回活动页');
    await expect(page.locator('.result-actions button:visible')).toHaveCount(2);
    await expect(page.locator('#backToSource, #map')).toHaveCount(0);
  });
});
