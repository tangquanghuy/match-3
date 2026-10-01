import { describe, expect, it, vi } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { isImmortal } from '../../src/data/immortals';
import { SeededRNG } from '../../src/engine/rng';
import * as kingdoms from '../../src/meta/data/kingdoms';
import { buildAdaptiveDefense, DEFENSE_TEMPLATES } from '../../src/meta/data/opponentTeams';
import { EVENT_TYPES, WEEK_MS } from '../../src/meta/data/events';
import { newSave } from '../../src/meta/state/schema';
import { pickEnemies, planExploreEncounter, repairLegacyRandomEnemyRoster } from '../../src/meta/systems/encounter';
import { arenaOpponentPreview } from '../../src/meta/systems/arena';
import { eventModeState, planEventEncounter } from '../../src/meta/systems/events';
import { towerNextBattle } from './helpers/eventDriver';

const immortals = TROOPS.filter(isImmortal);
const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
function check(ids: readonly number[]) {
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    expect(getTroopById(id)).toBeTruthy();
    expect(isImmortal(getTroopById(id)), `unexpected Immortal ${id}`).toBe(false);
  }
}
function fixture() {
  const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  save.hero.level = 50;
  return save;
}

describe('random NPCs outside regional PvP exclude Immortals', () => {
  it('shared event selector excludes them for every kingdom and rarity band without caller flags', () => {
    for (const kingdom of kingdoms.KINGDOM_ORDER) for (let seed = 0; seed < 64; seed++) {
      const enemies = pickEnemies(kingdom, 150, ['minion', 'elite', 'boss', 'boss'], new SeededRNG(seed));
      expect(enemies).toHaveLength(4);
      check(enemies.map(e => e.troopId));
    }
  });
  it('all 12 Explore tiers, all 6 stages and every kingdom exclude them, including final bosses', () => {
    for (const kingdom of kingdoms.KINGDOM_ORDER) for (let tier = 1; tier <= 12; tier++) {
      for (let stage = 0; stage < 6; stage++) for (let seed = 0; seed < 8; seed++) {
        const plan = planExploreEncounter(kingdom, tier, seed, stage);
        expect(plan.enemies).toHaveLength(4);
        check(plan.enemies.map(e => e.troopId));
      }
    }
  }, 30_000);
  it('global fallbacks remain excluded even if the local kingdom has only Immortals', () => {
    const spy = vi.spyOn(kingdoms, 'kingdomTroopPool').mockImplementation(() => [immortals[0]!]);
    try {
      check(pickEnemies('fixture', 150, ['boss', 'boss', 'elite', 'minion'], new SeededRNG(7)).map(e => e.troopId));
      for (let stage = 0; stage < 6; stage++) check(planExploreEncounter('fixture', 12, 7, stage).enemies.map(e => e.troopId));
    } finally { spy.mockRestore(); }
  });
  it('ordinary invasion NPC templates/adaptive squads and Arena opponents contain no Immortals', () => {
    for (const template of DEFENSE_TEMPLATES) check(template.troops);
    for (let seed = 0; seed < 64; seed++) {
      for (const league of [0, 3, 6, 9]) check(buildAdaptiveDefense(seed, league, 30).troops);
      for (let wins = 0; wins < 6; wins++) check(arenaOpponentPreview(seed, wins).enemies.map(e => e.troopId));
    }
  });
  it.each(EVENT_TYPES.map(t => t.id))('weekly %s plans use excluded pools across multiple weeks', type => {
    for (let n = 0; n < 12; n++) {
      const save = fixture(), week = WEEK + n * WEEK_MS;
      const action = type === 'towerOfDoom' ? towerNextBattle(save, week) : type === 'worldEvent' ? 'escort' : undefined;
      const plan = planEventEncounter(save, week, n, type, action);
      if ('ok' in plan) throw new Error(plan.message);
      check(plan.enemies.map(e => e.troopId));
    }
  });
  it('repairs all legacy Immortal ids deterministically without replacing ordinary members', () => {
    for (const immortal of immortals) {
      const ids = [immortal.id, 6000, 6004, 6028];
      const repaired = repairLegacyRandomEnemyRoster(ids, 77);
      check(repaired);
      expect(repaired.slice(1)).toEqual(ids.slice(1));
      expect(new Set(repaired).size).toBe(4);
      expect(repairLegacyRandomEnemyRoster(ids, 77)).toEqual(repaired);
      expect(repairLegacyRandomEnemyRoster(repaired, 90)).toEqual(repaired);
      expect(ids[0]).toBe(immortal.id);
    }
  });
  it('loaded invasion squads replace old Immortals without resetting wave, city or progress', () => {
    const save = fixture(), state = eventModeState(save, WEEK, 'invasion');
    state.wave = 6; state.city = 3; state.repelled = 17;
    state.squads[0]!.troops = [immortals[0]!.id, 6000, 6004, 6028];
    const original = structuredClone(state), restored = structuredClone(save);
    const loaded = eventModeState(restored, WEEK, 'invasion');
    check(loaded.squads[0]!.troops);
    const expected = structuredClone(original);
    expected.squads[0]!.troops[0] = loaded.squads[0]!.troops[0]!;
    expect(loaded).toEqual(expected);
    const plan = planEventEncounter(restored, WEEK, 1, 'invasion', `squad:${loaded.squads[0]!.id}`);
    if ('ok' in plan) throw new Error(plan.message);
    check(plan.enemies.map(e => e.troopId));
  });
  it('loaded raid boss and guards are repaired while preserving remaining HP and rewards', () => {
    const save = fixture(), state = eventModeState(save, WEEK, 'raidBoss');
    state.lineup = [immortals[0]!.id, 6000, immortals[1]!.id, 6028];
    state.hp = Math.floor(state.max / 3); state.bestHit = 73; state.attempts = 2; state.slain = 4;
    save.eventWeeks.raidBoss!.points = 345;
    const original = structuredClone(state), restored = structuredClone(save);
    const loaded = eventModeState(restored, WEEK, 'raidBoss');
    check(loaded.lineup);
    expect(loaded.lineup[1]).toBe(6000); expect(loaded.lineup[3]).toBe(6028);
    expect({ ...loaded, lineup: original.lineup }).toEqual(original);
    expect(restored.eventWeeks.raidBoss!.points).toBe(345);
    const plan = planEventEncounter(restored, WEEK, 1, 'raidBoss');
    if ('ok' in plan) throw new Error(plan.message);
    check(plan.enemies.map(e => e.troopId));
  });
});
