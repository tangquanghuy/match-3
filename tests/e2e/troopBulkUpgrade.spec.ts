import { expect, test, type Page } from '@playwright/test';

const TROOP_ID = 6000;
const fmt = (n: number) => n.toLocaleString('en-US');

async function setup(page: Page, budgetTarget = 4, ascension = 0, level = 1) {
  await page.goto(`/game.html#troop/${TROOP_ID}`);
  await expect(page.locator('#upgrade')).toBeVisible({ timeout: 15_000 });
  const prices = await page.evaluate(async ({ id, budgetTarget, ascension, level }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const { totalSoulCost, levelCapFor } = await load('/src/meta/data/economy.ts');
    const { getTroopById } = await load('/src/data/troops.ts');
    const gw = metaGateway();
    const save = JSON.parse(gw.exportSaveJson());
    const troop = getTroopById(id);
    save.collection[id] = { level, ascension, copies: 0, traits: [false, false, false], locked: false };
    const cap = levelCapFor(troop.rarityIdx, ascension);
    const costs = Array.from({ length: cap + 1 }, (_, to) => to > level ? totalSoulCost(troop.rarityIdx, level, to) : 0);
    save.currencies.souls = budgetTarget > cap ? 1000000 : costs[budgetTarget];
    await gw.dev.importSaveJson(JSON.stringify(save));
    return { costs, cap, souls: save.currencies.souls as number };
  }, { id: TROOP_ID, budgetTarget, ascension, level });
  await page.reload();
  await expect(page.locator('#upgrade')).toBeVisible({ timeout: 15_000 });
  return prices;
}

async function saved(page: Page) {
  return page.evaluate(id => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    return { level: save.collection[id].level, souls: save.currencies.souls };
  }, TROOP_ID);
}

for (const viewport of [{ width: 1600, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
  test(`批量升级：左右选择、实时总价、最大与持久化 ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { costs, souls } = await setup(page);
    await page.locator('#upgrade').click();
    await expect(page.locator('#upgradeLevels')).toHaveText('提升 1 级');
    await expect(page.locator('#upgradePortrait img')).toBeVisible();
    await page.locator('#upgradePortrait img').evaluate((img: HTMLImageElement) => img.decode());
    await expect(page.locator('.upgrade-stat')).toHaveCount(4);
    await expect(page.locator('.upgrade-stat svg')).toHaveCount(4);
    await expect(page.locator('#upgradeFrom')).toHaveText('1');
    await expect(page.locator('#upgradeTo')).toHaveText('2');
    await expect(page.locator('#upgradeLess')).toBeDisabled();
    await expect(page.locator('#upgradeTotalCost')).toHaveText(fmt(costs[2]!));
    await page.locator('#upgradeMore').click();
    await expect(page.locator('#upgradeLevels')).toHaveText('提升 2 级');
    await expect(page.locator('#upgradeTotalCost')).toHaveText(fmt(costs[3]!));
    await expect(page.locator('#soulPreview')).toHaveText(`${fmt(souls)} → ${fmt(souls - costs[3]!)}`);
    await page.locator('#upgradeLess').click();
    await expect(page.locator('#upgradeLevels')).toHaveText('提升 1 级');
    await page.locator('#upgradeMax').click();
    await expect(page.locator('#upgradeLevels')).toHaveText('提升 3 级');
    await expect(page.locator('#upgradeTotalCost')).toHaveText(fmt(souls));
    await expect(page.locator('#soulPreview')).toHaveText(`${fmt(souls)} → 0`);
    await expect(page.locator('#upgradeMax')).toBeDisabled();
    const bounds = await page.locator('#modal .modal').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.locator('.upgrade-dialog').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const confirmBox = await page.locator('#confirmUpgrade').boundingBox();
    expect(confirmBox!.y + confirmBox!.height).toBeLessThanOrEqual(viewport.height);
    expect((await page.locator('#upgradeMore').boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#upgradeTo')).toHaveText('4');
    await page.screenshot({ path: `artifacts/troop-bulk-upgrade-${viewport.width}.png` });
    await page.locator('#confirmUpgrade').click();
    await expect(page.locator('#modal')).toBeHidden();
    expect(await saved(page)).toEqual({ level: 4, souls: 0 });
    await page.reload();
    await expect(page.locator('#upgrade')).toBeDisabled();
    expect(await saved(page)).toEqual({ level: 4, souls: 0 });
  });
}

test('余额不足禁用确认，最大退回可承担等级，取消和重开不扣资源', async ({ page }) => {
  const { souls } = await setup(page);
  await page.locator('#upgrade').click();
  await page.locator('#upgradeMax').click();
  await page.locator('#upgradeMore').click();
  await expect(page.locator('#upgradeHint')).toContainText('灵魂不足');
  await expect(page.locator('#confirmUpgrade')).toBeDisabled();
  await page.locator('#upgradeMax').click();
  await expect(page.locator('#confirmUpgrade')).toBeEnabled();
  await page.locator('#cancelUpgrade').click();
  expect(await saved(page)).toEqual({ level: 1, souls });
  await page.locator('#upgrade').click();
  await expect(page.locator('#upgradeLevels')).toHaveText('提升 1 级');
});

test('充足资源最大遵守升阶等级上限，满级后关闭升级入口', async ({ page }) => {
  const { cap, costs, souls } = await setup(page, 99, 2);
  await page.locator('#upgrade').click();
  await page.locator('#upgradeMax').click();
  await expect(page.locator('#upgradeLevels')).toHaveText(`提升 ${cap - 1} 级`);
  await expect(page.locator('#upgradeMore')).toBeDisabled();
  await expect(page.locator('#upgradeTotalCost')).toHaveText(fmt(costs[cap]!));
  await page.locator('#confirmUpgrade').click();
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#upgrade')).toBeDisabled();
  expect(await saved(page)).toEqual({ level: cap, souls: souls - costs[cap]! });
});

test('旗帜与王国同步开放，没有任务记录也可装备，未开放王国保持锁定', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const gw = metaGateway();
    const save = JSON.parse(gw.exportSaveJson());
    save.hero.level = 1;
    save.kingdoms = {};
    await gw.dev.importSaveJson(JSON.stringify(save));
  });
  await page.goto('/game.html#team');
  await page.locator('#banner').click();
  await expect(page.locator('[data-banner="破碎尖塔"]')).toBeEnabled();
  await page.locator('.banner-locked-group summary').click();
  await expect(page.locator('[data-banner="卡拉考斯"]')).toBeDisabled();
  await expect(page.locator('.banner-picker')).not.toContainText('8/8');
  await page.locator('[data-banner="破碎尖塔"]').click();
  await expect(page.locator('#bannerCopy')).toHaveText('破碎尖塔');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).teams[0].bannerKingdomId)).toBe('破碎尖塔');
});

test('升级请求进行中锁定选择器，重复确认只提交一次', async ({ page }) => {
  await setup(page);
  await page.locator('#upgrade').click();
  await page.locator('#upgradeMax').click();
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { metaGateway } = await load('/src/meta/gateway/index.ts');
    const gw = metaGateway();
    const original = gw.levelUpTroop.bind(gw);
    document.body.dataset.upgradeRequests = '0';
    gw.levelUpTroop = async (id: number, target: number) => {
      document.body.dataset.upgradeRequests = String(Number(document.body.dataset.upgradeRequests) + 1);
      await new Promise(resolve => setTimeout(resolve, 500));
      return original(id, target);
    };
    const button = document.querySelector('#confirmUpgrade')!;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#confirmUpgrade')).toBeDisabled();
  await expect(page.locator('#upgradeLess')).toBeDisabled();
  await expect(page.locator('#upgradeMore')).toBeDisabled();
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-upgrade-requests', '1');
  expect(await saved(page)).toEqual({ level: 4, souls: 0 });
});


test('升级弹窗锁定背景、循环键盘焦点，关闭与路由切换后恢复', async ({ page }) => {
  await setup(page);
  await page.locator('#upgrade').click();
  await expect(page.locator('#closeUpgrade')).toBeFocused();
  expect(await page.locator('#stage').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#cancelUpgrade')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#closeUpgrade')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#upgrade')).toBeFocused();
  expect(await page.locator('#stage').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await page.locator('#upgrade').click();
  await page.locator('#modal').click({ position: { x: 3, y: 3 } });
  await expect(page.locator('#modal')).toBeHidden();
  await page.locator('#upgrade').click();
  await page.evaluate(() => { location.hash = '#team'; });
  await expect(page.locator('#banner')).toBeVisible();
  await expect(page.locator('#modal')).toHaveCount(0);
  expect(await page.locator('#stage').evaluate(el => (el as HTMLElement).inert)).toBe(false);
});

test('窄屏灵魂不足仍能调整级数，资源警示清楚且不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { souls } = await setup(page);
  await page.locator('#upgrade').click();
  await page.locator('#upgradeMax').click();
  await page.locator('#upgradeMore').click();
  await expect(page.locator('#upgradeHint')).toContainText('灵魂不足');
  await expect(page.locator('.upgrade-resource')).toHaveClass(/short/);
  await expect(page.locator('#confirmUpgrade')).toBeDisabled();
  expect(await page.locator('.upgrade-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/upgrade-insufficient-320.png' });
  await page.locator('#upgradeLess').click();
  await expect(page.locator('#upgradeHint')).toBeHidden();
  await expect(page.locator('#confirmUpgrade')).toBeEnabled();
  await page.locator('#closeUpgrade').click();
  expect(await saved(page)).toEqual({ level: 1, souls });
});
