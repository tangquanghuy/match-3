import { expect, test, type Page } from '@playwright/test';

const KINGDOM = '破碎尖塔';
const QUEST_HASH = `#quest/${encodeURIComponent(KINGDOM)}`;
const EXPLORE_HASH = `#explore/${encodeURIComponent(KINGDOM)}`;
async function openQuest(page: Page, questsDone = 8, unlocked = 2): Promise<void> {
  await page.goto(`/game.html${QUEST_HASH}`);
  await expect(page.locator('.quest-map')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(({ kingdom, completed, unlocked }) => {
    const key = 'gems.meta.save';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.kingdoms[kingdom].questsDone = completed;
    save.kingdoms[kingdom].exploreTier = completed === 8 ? 2 : 0;
    save.kingdoms[kingdom].exploreUnlockedTier = unlocked;
    save.kingdoms[kingdom].clearedExploreTiers = [];
    save.kingdoms[kingdom].exploreRun = null;
    localStorage.setItem(key, JSON.stringify(save));
  }, { kingdom: KINGDOM, completed: questsDone, unlocked });
  await page.reload();
  await expect(page.locator('.quest-map')).toBeVisible({ timeout: 20_000 });
}
async function openExplore(page: Page) {
  await page.locator('#questExplore').click();
  await expect(page.locator('.explore-screen')).toBeVisible();
  await expect(page.locator('.ex-scale-labels span')).toHaveCount(12);
  await expect(page.locator('.ex-difficulty-feature')).toHaveCount(1);
  await expect(page.locator('.ex-route li')).toHaveCount(6);
}
async function screenshot(page: Page, name: string) {
  await expect.poll(() => page.locator('.explore-screen img').evaluateAll(images =>
    images.every(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  await page.screenshot({ path: `artifacts/quest-redesign/${name}.png`, animations: 'disabled' });
}

test('普通主线保持八关与首通状态；王国探索为独立12档页面', async ({ page }) => {
  await openQuest(page);
  await expect(page.locator('.qpin')).toHaveCount(8);
  await expect(page.locator('#questFight')).toBeDisabled();
  await expect(page.locator('#questFight')).toContainText('已通关');
  const initialPower = await page.locator('#qdSub').textContent();
  expect(initialPower).toMatch(/^敌方战力 [\d,]+ \/ 我方 [\d,]+$/);
  await page.locator('.qpin[data-node="1"]').click();
  await expect(page.locator('#qdSub')).not.toHaveText(initialPower!);
  await expect(page.locator('#qdRewards .qfirst-clear')).toHaveText('首通已完成');
  await openExplore(page);
  await expect(page.locator('#exploreFight')).toBeEnabled();
  await expect(page.locator('.ex-enemy')).toHaveCount(4);
  await expect(page.locator('.ex-power')).toContainText(/敌方战力\s*[\d,]+\s*\/\s*我方\s*[\d,]+/);
  await expect(page.locator('#exploreDifficulty')).toHaveAttribute('max', '2');
  await expect(page.locator('#explorePrev')).toBeEnabled();
  await expect(page.locator('#exploreNext')).toBeDisabled();
  await expect(page.locator('.ex-scale-labels .locked')).toHaveCount(10);
  await expect(page.locator('.ex-material b')).toHaveText('秘法护盾属性石');
  await expect(page.locator('.ex-first-clear')).toHaveText('首次完成本轮 +200 宝石');
  await page.locator('#explorePrev').click();
  await expect(page.locator('#exploreDifficulty')).toHaveValue('1');
  await expect(page.locator('#explorePrev')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#exploreDifficulty')).toHaveValue('1');
  await expect(page.locator('#explorePrev')).toBeDisabled();
});

test('难度刻度支持键盘与边界，刷新后保持操作焦点', async ({ page }) => {
  await openQuest(page, 8, 12);
  await openExplore(page);
  await page.locator('#exploreDifficulty').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', '3');
  await expect(page.locator('#exploreDifficulty')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', '12');
  await expect(page.locator('#exploreNext')).toBeDisabled();
  await page.keyboard.press('Home');
  await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', '1');
  await expect(page.locator('#explorePrev')).toBeDisabled();
});

test('主线未通仍只开放当前普通关卡，探索出战被锁定', async ({ page }) => {
  await openQuest(page, 3);
  await expect(page.locator('.qpin[data-node="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#questFight')).toBeEnabled();
  await expect(page.locator('#qdRewards .qfirst-clear')).toHaveText('首通 +100 宝石');
  await page.locator('.qpin[data-node="5"]').click();
  await expect(page.locator('#questFight')).toBeDisabled();
  await expect(page.locator('#questExplore')).toBeDisabled();
  await page.goto(`/game.html${EXPLORE_HASH}`);
  await expect(page.locator('#exploreFight')).toBeDisabled();
  await expect(page.locator('.ex-gate')).toHaveText('通关本王国主线后开放');
});

test('全12档可选且保存，已通关可重复探索，旧路由导入新页面', async ({ page }) => {
  await openQuest(page, 8, 12);
  await page.evaluate(k => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.kingdoms[k].clearedExploreTiers = [1, 2, 3, 4, 5, 6];
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, KINGDOM);
  await page.reload();
  await openExplore(page);
  await page.locator('#exploreDifficulty').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', '1');
  for (let tier = 1; tier <= 12; tier++) {
    if (tier > 1) await page.locator('#exploreNext').click();
    await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', String(tier));
    await expect(page.locator('#exploreDifficulty')).toHaveValue(String(tier));
    await expect(page.locator('#exploreFight')).toBeEnabled();
    if (tier <= 6) await expect(page.locator('.ex-first-clear')).toHaveText('首通已完成');
  }
  await expect(page.locator('.ex-material')).toContainText('本档首领也必掉 1 颗');
  await page.reload();
  await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', '12');
    await expect(page.locator('.ex-level')).toContainText('Lv.150');
    await expect(page.locator('.ex-landscape')).toHaveAttribute('src', /relic-landscape.*\.webp/);
    await expect(page.locator('.ex-medallion img')).toHaveAttribute('src', /difficulty-sigil.*\.webp/);
    await expect(page.locator('.ex-stone img')).toHaveAttribute('src', /stone-arcane-blue-brown.*\.webp/);
    await expect(page.locator('.ex-stone svg')).toHaveCount(0);
    await expect(page.locator('.ex-reward-amount')).toHaveText('×2');
  for (const suffix of ['hard', 'veryhard', 'vh', 'explore']) {
    await page.goto(`/game.html${QUEST_HASH}/${suffix}`);
    await expect(page.locator('.ex-scale-labels span')).toHaveCount(12);
  await expect(page.locator('.ex-difficulty-feature')).toHaveCount(1);
  }
});

test('已进行的六场路线锁定难度、刷新保留阵容、放弃需确认且不抹奖励', async ({ page }) => {
  await openQuest(page, 8, 12);
  await page.evaluate(k => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.kingdoms[k].exploreRun = { id: 'e2e-run', tier: 12, stage: 4, seed: 42 };
    save.materials.traitstones['arcane:blue:brown'] = 7;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, KINGDOM);
  await page.reload();
  await openExplore(page);
  await expect(page.locator('.ex-route .done')).toHaveCount(4);
  await expect(page.locator('.ex-route .current')).toContainText('首领');
  await expect(page.locator('#exploreDifficulty')).toBeDisabled();
  await expect(page.locator('.ex-step:disabled')).toHaveCount(2);
  await expect(page.locator('#exploreFight')).toHaveText('继续探索');
  const before = await page.locator('.ex-enemies').innerText();
  await page.reload();
  await expect(page.locator('.ex-enemies')).toHaveText(before, { useInnerText: true });
  await page.locator('#exploreAbandon').click();
  await expect(page.locator('#exploreConfirm')).toBeVisible();
  await page.locator('#exploreKeep').click();
  await expect(page.locator('#exploreConfirm')).not.toBeVisible();
  await page.locator('#exploreAbandon').click();
  await page.locator('#exploreConfirmAbandon').click();
  await expect(page.locator('#exploreFight')).toHaveText('开始探索');
  await expect(page.locator('.ex-route .done')).toHaveCount(0);
  await expect.poll(() => page.evaluate(k => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    return [save.kingdoms[k].exploreRun, save.materials.traitstones['arcane:blue:brown']];
  }, KINGDOM)).toEqual([null, 7]);
});

for (const viewport of [
  { width: 1600, height: 900, label: 'desktop' },
  { width: 1366, height: 768, label: 'laptop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
  { width: 320, height: 568, label: 'small-mobile' },
  { width: 844, height: 390, label: 'landscape' },
]) {
  test(`探索 ${viewport.label} 控件可达、无横向截断、资源正常`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openQuest(page, 8, 12);
    // Keep the ordinary quest regression, independent of the new Explore layout.
    const mainFits = await page.locator('#questFight').evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    });
    expect(mainFits).toBe(true);
    await openExplore(page);
    await page.locator('#exploreDifficulty').focus();
    await page.keyboard.press('End');
    await expect(page.locator('.ex-difficulty-feature')).toHaveAttribute('data-tier', '12');
    await expect(page.locator('.ex-level')).toContainText('Lv.150');
    await expect(page.locator('.ex-landscape')).toHaveAttribute('src', /relic-landscape.*\.webp/);
    await expect(page.locator('.ex-medallion img')).toHaveAttribute('src', /difficulty-sigil.*\.webp/);
    await expect(page.locator('.ex-stone img')).toHaveAttribute('src', /stone-arcane-blue-brown.*\.webp/);
    await expect(page.locator('.ex-stone svg')).toHaveCount(0);
    await expect(page.locator('.ex-reward-amount')).toHaveText('×2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (viewport.width < 1400) {
      await expect(page.locator('#stage')).toHaveClass(/quest-responsive/);
      expect(await page.locator('#stage').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(viewport.width);
      expect(await page.locator('#exploreFight').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    await screenshot(page, `explore-${viewport.label}-top`);
    await page.locator('#exploreFight').scrollIntoViewIfNeeded();
    expect(await page.locator('#exploreFight').evaluate(el => {
      const r = el.getBoundingClientRect();
      const nav = document.querySelector('.bottom-bar')!.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= nav.top + 1;
    })).toBe(true);
    await screenshot(page, `explore-${viewport.label}-fight`);
  });
}
