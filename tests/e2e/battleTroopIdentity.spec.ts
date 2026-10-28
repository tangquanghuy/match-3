import { expect, test } from '@playwright/test';
import type { App } from '../../src/render/App';

const yeluoName = '\u53f6\u843d';

test('a hero sharing a troop name has only their own battle codex and badge data', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const app = (window as unknown as { __app?: { startupPlaying: boolean } }).__app;
    return !!app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
  });
  await page.evaluate(async (name) => {
    const win = window as unknown as { __app: App };
    const old = win.__app;
    const request = structuredClone(old.getBattleRequest());
    const hero = request.playerTeam[0]!;
    hero.name = name;
    hero.externalId = 'p0-hero';
    delete hero.templateId;
    hero.traitIds = [];
    hero.displayTraitIds = [];
    hero.spellName = undefined;
    hero.spellDescription = undefined;
    old.destroy();
    const next = new (old.constructor as new () => App)();
    await next.init(document.getElementById('app')!, request);
    win.__app = next;
  }, yeluoName);
  const heroCard = page.locator('.gcard.ally').first();
  await expect(heroCard).toBeVisible();
  const badgeCopy = await heroCard.locator('.trait-badge').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-trait-name')));
  const official = await page.evaluate(async (name) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { TROOPS } = await load('/src/data/troops.ts');
    return TROOPS.find((troop: { name: string }) => troop.name === name)! as { spell: { name: string }; traits: { name: string }[] };
  }, yeluoName);
  expect(badgeCopy).toEqual([]);
  await heroCard.click();
  const detail = page.getByTestId('unit-sheet');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.usw-name h2')).toHaveText(yeluoName);
  await expect(detail.locator('.usw-trait.locked')).toHaveCount(3);
  await expect(detail.locator('.usw-pane[data-pane="spell"]')).not.toContainText(official.spell.name);
});


test('same-name combatants open their own native details with snapshot identity and stats', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const app = (window as unknown as { __app?: { startupPlaying: boolean } }).__app;
    return !!app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
  });
  await page.evaluate(async (name) => {
    const win = window as unknown as { __app: App };
    const old = win.__app;
    const request = structuredClone(old.getBattleRequest());
    const base = request.enemyTeam[0]!;
    request.enemyTeam = [7, 23].map((level, index) => {
      const unit = structuredClone(base);
      unit.externalId = `identity-enemy-${index}`;
      unit.name = name;
      unit.race = index === 0 ? '半精灵' : '人类';
      unit.levelLabel = `Lv.${level}`;
      unit.spellName = `守卫技能${level}`;
      unit.spellDescription = `本场守卫${level}的技能说明。`;
      unit.stats.hp = 100 + level;
      unit.traitIds = [];
      unit.displayTraitIds = [];
      delete unit.templateId;
      return unit;
    });
    old.destroy();
    const next = new (old.constructor as new () => App)();
    await next.init(document.getElementById('app')!, request);
    win.__app = next;
  }, yeluoName);
  await page.waitForFunction(() => !(window as unknown as { __app: { startupPlaying: boolean } }).__app.startupPlaying);
  await expect(page.locator('.story-identity')).toHaveCount(0);
  for (const [index, level] of [7, 23].entries()) {
    const card = page.locator('.gcard.enemy').nth(index);
    await expect(card.locator('.c-br')).toBeVisible();
    await expect(card.locator('.gem')).toBeVisible();
    await card.click();
    const detail = page.getByTestId('unit-sheet');
    await expect(detail).toBeVisible();
    await expect(detail.locator('.usw-name h2')).toHaveText(yeluoName);
    await expect(detail.locator('.usw-name span')).toContainText(index === 0 ? '半精灵' : '人类');
    await expect(detail.locator('.usw-name span')).toContainText(`Lv.${level}`);
    await expect(detail.locator('.usw-name span')).not.toContainText(`Lv.${index === 0 ? 23 : 7}`);
    await expect(detail.locator('.usw-head-title h3')).toHaveText(`守卫技能${level}`);
    await expect(detail.locator('.usw-trait.locked')).toHaveCount(3);
    await detail.getByRole('button', { name: '关闭详情' }).click();
  }
});
