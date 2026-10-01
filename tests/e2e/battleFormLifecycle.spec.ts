import { expect, test, type Page } from '@playwright/test';
import type { App } from '@render/App';
import type { TeamView } from '@render/TeamView';
import type { Character } from '@engine/types';
import type { EventStreamPlayer } from '@render/EventStreamPlayer';
import type { UnitSheetData } from '@render/UnitSheet';

interface BattleWindow extends Window {
  __app: Pick<App, 'getEngine'> & {
    startupPlaying: boolean;
    leftTeamView: TeamView;
    rightTeamView: TeamView;
    player: EventStreamPlayer;
    openUnitSheet(id: number): void;
    unitSheetData(id: number): UnitSheetData;
    skillDisplayTextOf(ch: Character): { name: string; description: string };
  };
}

async function openBattle(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    const app = (window as unknown as BattleWindow).__app;
    return app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
  });
}

for (const [width, height] of [[360, 800], [390, 844], [412, 915], [1440, 900]]) {
  test(`team anchors survive exits, vacancies, reorder and resummon ${width}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    await openBattle(page);
    const teams = await page.evaluate(async () => {
      const app = (window as unknown as BattleWindow).__app;
      const result = [];
      for (const [index, view] of [app.leftTeamView, app.rightTeamView].entries()) {
        const roster = app.getEngine().getState().teams[index === 0 ? 'Left' : 'Right'].characters;
        const ids = roster.map(c => c.id);
        const measure = () => {
          const r = view.el.getBoundingClientRect();
          const living = [...view.el.children].filter(el => el instanceof HTMLElement &&
            el.classList.contains('gcard') && el.style.position !== 'absolute') as HTMLElement[];
          const slots = [...view.el.querySelectorAll<HTMLElement>('.gslot-empty')];
          const flow = [...view.el.children].filter(el => living.includes(el as HTMLElement) || slots.includes(el as HTMLElement));
          return { left: r.left, width: r.width, styleLeft: view.el.style.left, styleWidth: view.el.style.width,
            live: living.map(el => Number(el.dataset.testid!.replace('card-', ''))),
            sizes: [...living, ...slots].map(el => [el.offsetWidth, el.offsetHeight]),
            slots: slots.length, exits: view.el.querySelectorAll('.gcard').length - living.length,
            emptyAtTail: flow.slice(0, living.length).every(el => living.includes(el as HTMLElement)) };
        };
        const before = measure();
        view.removeCharacterCard(ids[0]);
        const single = measure();
        // The previous card still fades while a second death batch closes ranks.
        view.removeCharacterCards([ids[1], ids[2]]);
        const overlapping = measure();
        await new Promise(resolve => setTimeout(resolve, 750));
        const settled = measure();
        for (let i = 0; i < 3; i++) view.addCharacterCard({ ...roster[i], id: 1000 + index * 10 + i });
        const restored = measure();
        view.removeCharacterCard(1001 + index * 10);
        view.placeCard(ids[3], 99);
        const moved = measure();
        view.orderCards([...moved.live].reverse());
        const shuffled = measure();
        view.removeCharacterCards(shuffled.live);
        const wiped = measure();
        view.addCharacterCard({ ...roster[0], id: 2000 + index });
        const recovered = measure();
        await new Promise(resolve => setTimeout(resolve, 750));
        const final = measure();
        result.push({ before, single, overlapping, settled, restored, moved, shuffled, wiped, recovered, final });
      }
      return result;
    });
    for (const t of teams) {
      for (const step of Object.values(t)) {
        expect(step.left).toBeCloseTo(t.before.left, 1);
        expect(step.width).toBeCloseTo(t.before.width, 1);
        expect(step.styleLeft).toBe(t.before.styleLeft);
        expect(step.styleWidth).toBe(t.before.styleWidth);
        expect(step.sizes).toHaveLength(4);
        expect(step.sizes.every(size => JSON.stringify(size) === JSON.stringify(t.before.sizes[0]))).toBe(true);
        expect(step.emptyAtTail).toBe(true);
      }
      expect(t.single.slots).toBe(1); expect(t.single.exits).toBe(1);
      expect(t.overlapping.slots).toBe(3); expect(t.overlapping.exits).toBe(3);
      expect(t.settled.exits).toBe(0);
      expect(t.restored.live).toHaveLength(4); expect(t.restored.slots).toBe(0);
      expect(t.moved.live.at(-1)).toBe(t.before.live[3]);
      expect(t.shuffled.live).toEqual([...t.moved.live].reverse());
      expect(t.wiped.slots).toBe(4); expect(t.wiped.live).toHaveLength(0);
      expect(t.final.exits).toBe(0); expect(t.final.slots).toBe(3);
    }
    await page.screenshot({ path: `artifacts/battle-form/roster-${width}.png` });
  });
}

test('real defeat events leave both portrait rows centered', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 }); await openBattle(page);
  const geometry = await page.evaluate(async () => {
    const app = (window as unknown as BattleWindow).__app;
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { CombatResolver } = await load('/src/engine/CombatResolver.ts');
    const { attachPassives } = await load('/src/engine/traits.ts');
    const measure = () => [app.leftTeamView, app.rightTeamView].map(view => ({ left: view.el.style.left, width: view.el.style.width }));
    const before = measure();
    const teams = app.getEngine().getState().teams;
    for (const reverse of [false, true]) {
      const attack = reverse ? teams.Right : teams.Left;
      const defend = reverse ? teams.Left : teams.Right;
      Object.assign(attack.characters[0], { attack: 1000, traitIds: [], statuses: [] });
      Object.assign(defend.characters[0], { hp: 1, armor: 0, traitIds: [], statuses: [] });
      attachPassives(attack.characters[0]); attachPassives(defend.characters[0]);
      const events = new CombatResolver().resolveSkullDamage(attack, defend, 3).events;
      await app.player.play(events);
    }
    await new Promise(resolve => setTimeout(resolve, 750));
    return { before, after: measure(), slots: [app.leftTeamView, app.rightTeamView].map(v => v.el.querySelectorAll('.gslot-empty').length) };
  });
  expect(geometry.after).toEqual(geometry.before); expect(geometry.slots).toEqual([1, 1]);
  await page.screenshot({ path: 'artifacts/battle-form/real-defeats-390.png' });
});

test('transformation refreshes the live detail and ignores stale opening text even without template metadata', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 }); await openBattle(page);
  const result = await page.evaluate(async () => {
    const app = (window as unknown as BattleWindow).__app;
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { troopToSummonTemplate } = await load('/src/data/troops.ts');
    const { transformTroopEffect } = await load('/src/engine/skills/effects/summon.ts');
    const { SeededRNG } = await load('/src/engine/rng.ts');
    const state = app.getEngine().getState(); const ch = state.teams.Left.characters[0];
    ch.spellName = 'STALE_SPELL'; ch.spellDescription = 'STALE_DESCRIPTION'; ch.displayTraitIds = ['stale-hero-trait'];
    app.openUnitSheet(ch.id);
    const template = troopToSummonTemplate('Emperina');
    const events = transformTroopEffect({ targets: [ch], ref: 'Emperina' }).apply({ state, casterId: ch.id,
      rng: new SeededRNG(42), nextGemId: () => 99999, resolveSummonRef: troopToSummonTemplate });
    await app.player.play(events);
    const detail = app.unitSheetData(ch.id);
    const withMetadata = app.skillDisplayTextOf(ch);
    // Legacy/custom resolvers may omit presentation metadata; the original host snapshot must not leak back.
    ch.spellName = undefined; ch.spellDescription = undefined;
    const withoutMetadata = app.skillDisplayTextOf(ch);
    return { expected: { name: template.spellName, description: template.spellDescription }, detail, withMetadata, withoutMetadata };
  });
  expect(result.withMetadata).toEqual(result.expected); expect(result.withoutMetadata).toEqual(result.expected);
  expect(result.detail.skillName).toBe(result.expected.name);
  expect(result.detail.skillDescription).toBe(result.expected.description);
  await expect(page.getByTestId('unit-sheet').locator('.usw-head-title h3')).toHaveText(result.expected.name);
  await expect(page.getByTestId('unit-sheet')).not.toContainText('STALE_');
  await page.screenshot({ path: 'artifacts/battle-form/transformed-detail-390.png' });
});
