import { expect, test, type Locator, type Page } from '@playwright/test';

type BattleWindow = Window & {
  __app: {
    getEngine(): {
      getState(): {
        teams: Record<'Left' | 'Right', {
          characters: Array<{
            manaCost: number;
            statuses: Array<{ id: string; turns: number; magnitude?: number }>;
          }>;
        }>;
      };
    };
    setAllManaCost(value: number): void;
  };
};

async function openBattle(page: Page, teamSize: 3 | 4): Promise<void> {
  await page.addInitScript((size) => {
    window.localStorage.clear();
    window.localStorage.setItem('debug.teamSize', String(size));
  }, teamSize);
  await page.goto('/index.html');
  await page.waitForFunction((count) => (
    !!(window as unknown as BattleWindow).__app
    && document.querySelectorAll('.gcard').length === count * 2
  ), teamSize);
}

async function addStatuses(page: Page, count: number): Promise<void> {
  await page.evaluate((amount) => {
    const app = (window as unknown as BattleWindow).__app;
    const character = app.getEngine().getState().teams.Left.characters[0];
    const statuses = [
      { id: 'poison', turns: 3, magnitude: 2 },
      { id: 'web', turns: 4 },
      { id: 'bleed', turns: 2, magnitude: 1 },
    ];
    character.statuses.splice(0, character.statuses.length, ...statuses.slice(0, amount));
    app.setAllManaCost(character.manaCost);
  }, count);
}

async function cardGeometry(card: Locator) {
  return card.evaluate((element) => {
    const root = element as HTMLElement;
    const cardRect = root.getBoundingClientRect();
    const rectOf = (selector: string) => {
      const node = root.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`缺少卡面节点 ${selector}`);
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const isVisible = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const attack = rectOf('.c-bl .stat');
    const vitals = rectOf('.c-br .stat');
    const manaGem = rectOf('.gem');
    const magic = rectOf('.magic');
    const traitRow = root.querySelector<HTMLElement>('.trait-row');
    const transientOrRejected = [...root.querySelectorAll<HTMLElement>(
      '.name-band,.name-flash,.mana-num,.vital-stack,[data-stat="armor"],[data-stat="health"]',
    )].filter(isVisible);
    const insideCard = (rect: { left: number; top: number; right: number; bottom: number }) => (
      rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5
      && rect.top >= cardRect.top - 0.5 && rect.bottom <= cardRect.bottom + 0.5
    );

    return {
      attack,
      vitals,
      manaGem,
      magic,
      anchorsInside: [attack, vitals, manaGem, magic].every(insideCard),
      attackOnLeft: attack.right < cardRect.left + cardRect.width * 0.52,
      vitalsOnRight: vitals.left > cardRect.left + cardRect.width * 0.48,
      manaTopLeft: manaGem.left <= cardRect.left + 3 && manaGem.top <= cardRect.top + 3,
      magicTopRight: magic.right >= cardRect.right - 3 && magic.top <= cardRect.top + 3,
      magicValue: root.querySelector<HTMLElement>('.magic-v')?.textContent ?? '',
      traitCount: traitRow?.querySelectorAll('.trait-badge').length ?? 0,
      rejectedVisibleCount: transientOrRejected.length,
    };
  });
}

async function expectRestoredCard(card: Locator): Promise<void> {
  const layout = await cardGeometry(card);
  expect(layout.anchorsInside).toBe(true);
  expect(layout.attackOnLeft).toBe(true);
  expect(layout.vitalsOnRight).toBe(true);
  expect(layout.manaTopLeft).toBe(true);
  expect(layout.magicTopRight).toBe(true);
  expect(Number(layout.magicValue)).toBeGreaterThanOrEqual(0);
  expect(layout.traitCount).toBeGreaterThan(0);
  expect(layout.rejectedVisibleCount).toBe(0);
}

test('667x375 3v3 keeps the original battle-card information layout', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openBattle(page, 3);

  const cards = page.locator('.gcard');
  await expect(cards).toHaveCount(6);
  await expectRestoredCard(cards.first());

  await cards.first().locator('.gem').click();
  const manaTip = page.locator('.status-tooltip');
  await expect(manaTip.locator('.st-title')).toContainText('法力');
  await expect(manaTip).toContainText('关联颜色');

  await addStatuses(page, 1);
  const statusEntry = cards.first().locator('.status-more');
  await expect(statusEntry).toHaveText('+1');
  expect((await statusEntry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(23.5);
  await expectRestoredCard(cards.first());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/battle-card-restored-3v3-667x375.png' });
});

test('667x375 4v4 aggregates statuses without covering the character art', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openBattle(page, 4);

  const cards = page.locator('.gcard');
  await expect(cards).toHaveCount(8);
  await addStatuses(page, 3);
  const summary = cards.first().locator('.status-more');
  await expect(summary).toHaveText('+3');
  await expect(cards.first().locator('.status-badge')).toHaveCount(0);
  expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(23.5);
  await expectRestoredCard(cards.first());
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/battle-card-restored-4v4-667x375.png' });
});

test('desktop battle cards keep magic and traits without the rejected name or mana rows', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openBattle(page, 3);

  const cards = page.locator('.gcard');
  await expect(cards).toHaveCount(6);
  await expectRestoredCard(cards.first());
  await expect(cards.locator('.magic')).toHaveCount(6);
  await expect(cards.locator('.trait-row')).toHaveCount(6);
  await expect(cards.locator('.name-band,.name-flash,.mana-num')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/battle-card-restored-desktop.png' });
});
