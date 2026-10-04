import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`repeatable boss ingots appear on the battle result ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/game.html#result', { waitUntil: 'domcontentloaded' });
    const awarded = await page.evaluate(async () => {
      const load = (p: string) => import(/* @vite-ignore */ p);
      const { ResultScreen } = await load('/src/meta/screens/resultScreen.ts');
      const { newSave } = await load('/src/meta/state/schema.ts');
      const { WEEK_MS, EVENT_UNLOCK_HERO_LEVEL } = await load('/src/meta/data/events.ts');
      const { ensureEventWeek, eventAction, planEventEncounter } = await load('/src/meta/systems/events.ts');
      const { rollRaidIngotReward } = await load('/src/meta/systems/eventModes/raid.ts');
      const { applySettlement } = await load('/src/meta/systems/settlement.ts');
      const { INGOT_NAMES } = await load('/src/meta/data/materials.ts');
      const weekStart = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
      const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
      save.hero.level = EVENT_UNLOCK_HERO_LEVEL;
      ensureEventWeek(save, weekStart, 'raidBoss');
      eventAction(save, weekStart, 'raidBoss', 'ingot-tier:12', 1);
      const seed = Array.from({ length: 200 }, (_, index) => index + 1)
        .find(n => Object.keys(rollRaidIngotReward(12, n).ingots ?? {}).length > 1)!;
      const plan = planEventEncounter(save, weekStart, seed, 'raidBoss', 'ingot');
      const battle = { schemaVersion: 1, battleId: `raid-ingot-ui-${seed}`, requestId: 'r',
        rulesetVersion: '1', seed, winner: 'player', turns: 4, combatants: [],
        defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [] };
      const detail = applySettlement(save, battle, { plan, todayStart: weekStart, enemyByExternalId: new Map() });
      const ingots = detail.lines.find(line => line.mats?.ingots)?.mats?.ingots ?? {};
      const repeat = applySettlement(save, battle, { plan, todayStart: weekStart, enemyByExternalId: new Map() });
      const inventory = structuredClone(save.materials.ingots);
      const screen = new ResultScreen();
      screen.setDetail(detail, { kingdom: '', sourceLabel: 'boss', returnHash: '#events/raidBoss' });
      document.querySelector('#stage')!.innerHTML = screen.html();
      screen.mount({ save: () => save, navigate: () => {} });
      return { ingots: Object.entries(ingots).map(([key, amount]) => ({ key, name: INGOT_NAMES[key], amount })),
        inventory: Object.entries(ingots).every(([key, n]) => inventory[key] === n),
        noReplayReward: repeat.lines.every(line => !line.mats?.ingots) };
    });
    expect(awarded.ingots.length).toBeGreaterThan(1);
    expect(awarded.inventory).toBe(true);
    expect(awarded.noReplayReward).toBe(true);
    for (const ingot of awarded.ingots) {
      const card = page.locator(`[data-battle-material="ingot:${ingot.key}"]`);
      await expect(card).toContainText(ingot.name);
      await expect(card.locator('strong')).toHaveText(`+${ingot.amount}`);
      await expect.poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
  });
}
