import { expect, test } from '@playwright/test';
import { weekStartOf } from '../../src/meta/gateway/clock';

test('入侵点选保留地图位置，城防在独立页面建设', async ({ page }) => {
  await page.goto('/game.html');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.hero.level = 20;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.goto('/game.html#events/invasion');
  await page.reload();
  await expect(page.locator('.iv-squad')).toHaveCount(3);
  await page.locator('.iv-map').evaluate((el) => { el.dataset.testMounted = 'yes'; });
  const squads = page.locator('.iv-squad');
  await squads.first().click();
  await expect(squads.first()).toHaveClass(/selected/);
  await expect(page.locator('.iv-detail')).not.toHaveClass(/empty/);
  expect(await page.locator('.iv-map').getAttribute('data-test-mounted')).toBe('yes');
  await squads.nth(1).click();
  await expect(squads.first()).not.toHaveClass(/selected/);
  expect(await page.locator('.iv-map').getAttribute('data-test-mounted')).toBe('yes');
  await page.locator('.iv-defense-link').click();
  await expect(page).toHaveURL(/#events\/invasion\/defense$/);
  await expect(page.locator('.iv-build-page')).toContainText('战备补给');
  await expect(page.locator('.iv-build-page')).toContainText('修缮王都');
});

test('庆典掷骰显示结果且棋子逐格移动', async ({ page }) => {
  await page.goto('/game.html');
  const week = weekStartOf(Date.now());
  await page.evaluate((weekStart) => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.hero.level = 20;
    save.eventWeeks.worldEvent = {
      weekStart, points: 0, claimed: [], wins: 0, tokens: 0, tokensEarned: 0,
      playRewards: 0, bought: {}, eventData: { revision: 1 }, runTeam: null,
      mode: { v: 1, board: [], pos: 0, dice: 1, lucky: 0, laps: 0, supplies: 0,
        doubleNext: false, rolls: 0, wins: 0, last: null, pending: null, blessing: null, specials: 0 },
    };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, week);
  await page.goto('/game.html#events/worldEvent');
  await page.reload();
  await expect(page.locator('.wd-board > .wd-tile')).toHaveCount(20);
  await expect(page.locator('[data-act="roll"]')).toBeEnabled();
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.wd-board > .wd-tile')];
    document.body.dataset.worldSteps = '';
    const observer = new MutationObserver(() => {
      const index = tiles.findIndex((tile) => tile.classList.contains('here'));
      if (index < 0) return;
      const steps = document.body.dataset.worldSteps?.split(',').filter(Boolean) ?? [];
      if (steps.at(-1) !== String(index)) document.body.dataset.worldSteps = [...steps, index].join(',');
    });
    for (const tile of tiles) observer.observe(tile, { attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('[data-act="roll"]').click();
  await expect(page.locator('.wd-roll-result')).toContainText(/掷出 [1-6] 点/);
  // 动画未结束前保留旧界面与正在行走的棋子，而非直接重画终点。
  await expect(page.locator('.wd-board > .wd-tile').first()).not.toHaveClass(/here/);
  await expect(page.locator('.wd-roll-result')).toHaveCount(0, { timeout: 4_000 });
  const steps = (await page.locator('body').getAttribute('data-world-steps'))?.split(',').map(Number);
  expect(steps?.[0]).toBe(1);
  await expect(page.locator('.wd-board > .wd-tile.here')).toHaveCount(1);
});

test('爬塔点选节点不重新挂载滚动地图', async ({ page }) => {
  await page.goto('/game.html');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.hero.level = 20;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.goto('/game.html#events/towerOfDoom');
  await page.reload();
  await page.locator('[data-act="start"]').click();
  await expect(page.locator('.tw-map-scroll')).toBeVisible();
  // 开局祝福弹层挡住地图，先领取再测试点选。
  await page.locator('.tw-modal [data-act]').first().click();
  await page.locator('.tw-map-scroll').evaluate((el) => { el.dataset.testMounted = 'yes'; });
  await page.locator('.tw-node').first().click();
  await expect(page.locator('.tw-detail')).not.toHaveClass(/empty/);
  expect(await page.locator('.tw-map-scroll').getAttribute('data-test-mounted')).toBe('yes');
});
