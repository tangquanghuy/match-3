import { freshRegionalState } from '../../src/meta/state/regional';
import { describe, expect, it } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { isImmortal } from '../../src/data/immortals';
import { troopStatsAtLevel, TROOP_PROGRESSION, type StatKey } from '../../src/data/leveling';
import { enemyStatsAtLevel } from '../../src/meta/data/enemyDifficulty';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { totalSoulCost, soulCostForLevel } from '../../src/meta/data/economy';
import { planQuestEncounter, pickEnemies } from '../../src/meta/systems/encounter';
import { buildAdaptiveDefense, DEFENSE_TEMPLATES } from '../../src/meta/data/opponentTeams';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { levelCapOf, levelUp, troopStatsOf } from '../../src/meta/systems/troopProgress';
import { validateTeam, setTeamPreset } from '../../src/meta/systems/teamRules';
import { buildPlayerSnapshots } from '../../src/meta/systems/battleBridge';
import { kingdomTeamBonusOf } from '../../src/meta/systems/kingdomTeamBonus';
import { defenseRecord } from '../../src/meta/systems/invasionDefense';
import { captureMirrorRecord, usableEntry } from '../../src/meta/systems/invasionMirrors';
import { validateBattleRequest } from '../../src/session/validateRequest';

const immortals = TROOPS.filter(isImmortal);
const keys: StatKey[] = ['attack', 'armor', 'health', 'magic'];
const troop = getTroopById(7580)!;
const normalIds = [6000, 6004, 6028];
function fixture(ids = [troop.id, ...normalIds]) {
  const save = newSave({ now: 0, starterTroopIds: ids, currencies: { souls: 1000000 } });
  save.teams = [{ name: '不朽队', members: ids.map(troopId => ({ kind: 'troop' as const, troopId })), bannerKingdomId: null }];
  save.activeTeamIndex = 0;
  save.regional = {...freshRegionalState(), burningSouls: 1000};
  return save;
}

describe('Immortal project progression, shared by old records and new upgrades', () => {
  it('identifies all translated names by type, including the newest imported troops', () => {
    expect(immortals).toHaveLength(31);
    expect(isImmortal({ troopTypes: ['Dragon'] })).toBe(false);
    expect(isImmortal(undefined)).toBe(false);
  });
  it.each(immortals.map(t => [t.id, t] as const))('%s retains base and total, progresses monotonically to 30', (_id, t) => {
    expect(troopStatsAtLevel(t, 1)).toEqual(t.base);
    let previous = troopStatsAtLevel(t, 1);
    for (let level = 2; level <= 30; level++) {
      const stats = troopStatsAtLevel(t, level);
      for (const key of keys) {
        const total = TROOP_PROGRESSION[t.id]?.growth[key].reduce((a, b) => a + b, 0) ?? t[key] - t.base![key];
        expect(stats[key]).toBe(t.base![key] + Math.floor(total * (level - 1) / 29));
        expect(stats[key]).toBeGreaterThanOrEqual(previous[key]);
      }
      previous = stats;
    }
    expect(previous).toEqual(Object.fromEntries(keys.map(k => [k, t[k]])));
    expect(troopStatsAtLevel(t, 100)).toEqual(previous);
    expect(troopStatsAtLevel(t, 8).magic).toBeLessThan(previous.magic);
  });
  it('fixes the known Titanius early growth and applies the same curve to NPCs', () => {
    expect(troopStatsAtLevel(troop, 8)).toEqual({ attack: 26, armor: 36, health: 14, magic: 11 });
    expect(troopStatsAtLevel(troop, 20)).toEqual({ attack: 30, armor: 47, health: 18, magic: 17 });
    for (const lv of [1, 8, 20, 21, 30]) expect(enemyStatsAtLevel(troop, lv)).toEqual(troopStatsAtLevel(troop, lv));
    for (const k of keys) expect(enemyStatsAtLevel(troop, 60)[k]).toBe(troopStatsAtLevel(troop, 30)[k] * 2);
  });
  it('upgrades to 30 with increasing project soul costs; rejects 31 atomically', () => {
    const save = fixture();
    expect(levelCapOf(troop, save.collection[troop.id]!)).toBe(30);
    expect(soulCostForLevel(5, 30)).toBeGreaterThan(soulCostForLevel(5, 20));
    expect(levelUp(save, troop.id, 30)).toEqual({ ok: true, from: 1, to: 30, soulsSpent: totalSoulCost(5, 1, 30), burningSpent: 99 });
    const before = structuredClone(save);
    expect(levelUp(save, troop.id, 31)).toMatchObject({ ok: false, code: 'AT_CAP' });
    expect(save).toEqual(before);
    expect(levelCapOf(getTroopById(6000)!, save.collection[6000]!)).toBe(15);
  });
  it('re-reads old owned levels through the new rule without extra stat copies', () => {
    const save = fixture();
    save.collection[troop.id]!.level = 20;
    const restored = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(restored.collection[troop.id]).toEqual(save.collection[troop.id]);
    expect(restored.collectionTruth).toBeNull();
    expect(troopStatsOf(troop, restored.collection[troop.id]!)).toEqual(troopStatsAtLevel(troop, 20));
    const built = buildPlayerSnapshots(restored);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(built.message);
    const teamBonus = kingdomTeamBonusOf(restored, restored.teams[0]!.members);
    expect(built.playerTeam[0]!.stats).toMatchObject({ attack: 30 + teamBonus.attack, armor: 47 + teamBonus.armor, hp: 18 + teamBonus.health, magic: 17 + teamBonus.magic });
    restored.collection[troop.id]!.level = 30;
    expect(migrateSave(JSON.parse(JSON.stringify(restored))).collection[troop.id]!.level).toBe(30);
  });
});

describe('Immortal team restrictions', () => {
  it('blocks saving and starting legacy two-Immortal teams without deleting owned troops', () => {
    const save = fixture([7571, 7580, 6000, 6004]);
    expect(validateTeam(save, save.teams[0]!).issues).toContainEqual(expect.objectContaining({ code: 'IMMORTAL_LIMIT' }));
    const before = structuredClone(save);
    expect(setTeamPreset(save, 0, save.teams[0]!)).toMatchObject({ ok: false });
    expect(buildPlayerSnapshots(save)).toMatchObject({ ok: false, message: expect.stringContaining('最多') });
    save.invasion.defenseTeam = save.teams[0]!;
    expect(defenseRecord(save, 0)).toBeNull();
    expect(save.collection).toEqual(before.collection);
  });
  it('accepts one Immortal and screens invalid historical mirror teams', () => {
    const save = fixture();
    expect(validateTeam(save, save.teams[0]!).ok).toBe(true);
    const built = buildPlayerSnapshots(save);
    if (!built.ok) throw new Error(built.message);
    const record = captureMirrorRecord(save, built.team, built.playerTeam, null, 0);
    const entry = { ...record, ownerKey: 'owner', name: 'Player' };
    expect(usableEntry(entry, 0)).toBe(true);
    entry.team[1] = { ...entry.team[0]!, externalId: 'second', templateId: '7571' };
    expect(usableEntry(entry, 0)).toBe(false);
    const result = validateBattleRequest({ playerTeam: entry.team, enemyTeam: built.playerTeam }, { knownSkillIds: new Set() });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected invalid team');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'immortal-limit', path: 'playerTeam' }));
  });
  it('all normal main-story kingdoms/nodes exclude Immortals across deterministic seeds', () => {
    for (const kingdom of KINGDOM_ORDER) for (let node = 1; node <= 8; node++) for (let seed = 0; seed < 64; seed++) {
      const plan = planQuestEncounter(kingdom, node, seed);
      expect(plan.enemies).toHaveLength(4);
      expect(plan.enemies.some(e => isImmortal(getTroopById(e.troopId)))).toBe(false);
    }
  }, 30000);
  it('shared enemy selection and adaptive NPC defense never select two Immortals', () => {
    for (let seed = 0; seed < 100; seed++) {
      const picked = pickEnemies(immortals[0]!.kingdom!, 30, ['boss', 'boss', 'boss', 'boss'], new SeededRNG(seed));
      expect(picked.filter(e => isImmortal(getTroopById(e.troopId))).length).toBeLessThanOrEqual(1);
      for (const league of [0, 5, 9]) {
        const defense = buildAdaptiveDefense(seed, league, 30);
        expect(defense.troops.filter(id => isImmortal(getTroopById(id))).length).toBeLessThanOrEqual(1);
      }
    }
    for (const t of DEFENSE_TEMPLATES) expect(t.troops.filter(id => isImmortal(getTroopById(id))).length).toBeLessThanOrEqual(1);
  });
});
