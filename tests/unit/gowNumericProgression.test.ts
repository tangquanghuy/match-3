import { describe, it, expect } from 'vitest';
import rawSource from '../../data/raw/troops.gow.zh.json?raw';
import { TROOPS, getTroopById, troopToSummonTemplate } from '../../src/data/troops';
import { TROOP_PROGRESSION, troopStatsAtLevel } from '../../src/data/leveling';
import { enemyLevel, enemyStatsAtLevel, enemyTraitCount } from '../../src/meta/data/enemyDifficulty';
import { enemyToSnapshot } from '../../src/meta/systems/battleBridge';
import { traitUnlockCost, totalSoulCost } from '../../src/meta/data/economy';
import { ARCANE_STONE_KEYS, parseStoneKey, stoneName } from '../../src/meta/data/materials';
import { KINGDOM_ORDER, exploreEnemyLevel, questEnemyLevel } from '../../src/meta/data/kingdoms';
import { newSave } from '../../src/meta/state/schema';
import { ensureEventWeek, planEventEncounter, eventBattleProgress } from '../../src/meta/systems/events';
import { buildBracket } from '../../src/meta/systems/invasion';
import { entryArena, currentDraftChoices, pickDraftCard, startArenaBattles, planArenaBattle } from '../../src/meta/systems/arena';
import { STAT_LIMITS } from '../../src/session/validateRequest';
import { applySettlement } from '../../src/meta/systems/settlement';
import { planExploreEncounter } from '../../src/meta/systems/encounter';
import type { BattleResult } from '../../src/session/contract';

const WEEK = 1_700_000_000_000;
const result = (winner: 'player' | 'enemy' = 'player'): BattleResult => ({
  schemaVersion: 1, battleId: 'b', requestId: 'r', rulesetVersion: '1.0.0', seed: 42,
  winner, turns: 1, combatants: [], defeatedExternalIds: [], summonedCount: 0,
  actionLogDigest: '', eventSummary: [],
});

describe('Imported per-troop progression', () => {
  it('all 1798 source rows preserve every individual level gain and trait recipe', () => {
    const raw = JSON.parse(rawSource);
    const fields = { health: 'Health', armor: 'Armor', attack: 'Attack', magic: 'SpellPower' } as const;
    const colors = ['blue', 'green', 'red', 'yellow', 'purple', 'brown'];
    expect(Object.keys(TROOP_PROGRESSION)).toHaveLength(raw.troops.length);
    for (const source of raw.troops) {
      const troop = getTroopById(source.id)!;
      expect(troop).toBeTruthy();
      for (let level = 1; level <= 20; level++) {
        const stats = troopStatsAtLevel(troop, level);
        for (const [stat, field] of Object.entries(fields)) {
          const expected = (source.raw_data[`${field}_Base`] ?? 0)
            + source.raw_data[`${field}Increase`].slice(0, level).reduce((a: number, b: number) => a + b, 0);
          expect(stats[stat as keyof typeof fields], `${source.id}/${stat}/${level}`).toBe(expected);
        }
      }
      source.raw_data.Traitstones.forEach((stones: { Id: number; Required: number }[], slot: number) => {
        const expected = Object.fromEntries(stones.map(({ Id, Required }) => [
          Id === 39 ? 'celestial' : Id >= 18 ? ARCANE_STONE_KEYS[Id - 18] : `${['minor', 'major', 'runic'][Math.floor(Id / 6)]}:${colors[Id % 6]}`,
          Required,
        ]));
        if (stones.length) expect(traitUnlockCost(slot + 1, 'blue', troop.id)).toEqual({ gold: 0, stones: expected });
      });
    }
  });
  it('arcane recipes parse and have readable names; all resource tiers are valid', () => {
    expect(ARCANE_STONE_KEYS).toHaveLength(21);
    for (const key of ARCANE_STONE_KEYS) {
      expect(parseStoneKey(key)?.tier).toBe('arcane');
      expect(stoneName(key)).not.toBe(key);
    }
    for (const row of Object.values(TROOP_PROGRESSION)) for (const recipe of row.traits) {
      for (const key of Object.keys(recipe)) expect(parseStoneKey(key), key).not.toBeNull();
    }
    expect(parseStoneKey('minor:blue:garbage')).toBeNull();
    expect(parseStoneKey('arcane:blue:garbage')).toBeNull();
  });
  it('soul totals are bounded project tuning, not exponential rarity multipliers', () => {
    expect(totalSoulCost(0, 1, 20)).toBeGreaterThan(3000);
    expect(totalSoulCost(5, 1, 20)).toBeLessThan(10000);
    expect(totalSoulCost(5, 1, 20) / totalSoulCost(0, 1, 20)).toBeCloseTo(2, 1);
  });
});

describe('NPC difficulty and snapshot agreement', () => {
  it.each([[1, 0], [9, 0], [10, 1], [14, 1], [15, 2], [19, 2], [20, 3], [100, 3]])('level %i trains %i traits', (level, count) => {
    const troop = getTroopById(6000)!;
    const snap = enemyToSnapshot(troop, { troopId: troop.id, level, tier: 'boss' }, 0);
    expect(enemyTraitCount(level)).toBe(count);
    expect(snap.displayTraitIds).toEqual(troop.traits.slice(0, count).map(t => t.code));
    expect(snap.traitIds!.every(id => snap.displayTraitIds!.includes(id))).toBe(true);
    expect(snap.levelLabel).toBe(`Lv.${level}`);
    expect(snap.stats.hp).toBe(enemyStatsAtLevel(troop, level).health);
  });
  it('high levels grow past 100 and stay inside battle contract for every troop', () => {
    for (const troop of TROOPS) {
      let prior = 0;
      for (const level of [20, 50, 100, 200, 500, 1000]) {
        const stats = enemyStatsAtLevel(troop, level);
        expect(stats.health).toBeGreaterThanOrEqual(prior);
        prior = stats.health;
        expect(stats.health).toBeLessThanOrEqual(STAT_LIMITS.hp.max);
        for (const key of ['attack', 'armor', 'magic'] as const) expect(stats[key]).toBeLessThanOrEqual(STAT_LIMITS[key].max);
      }
    }
    const troop = getTroopById(6000)!;
    expect(enemyStatsAtLevel(troop, 200).health).toBeGreaterThan(enemyStatsAtLevel(troop, 100).health);
    expect(enemyLevel(Infinity)).toBe(1);
    expect(enemyLevel(10001)).toBe(1000);
  });
  it('every kingdom advances from main story into six strictly harder tiers', () => {
    for (const kingdom of KINGDOM_ORDER) {
      let prior = questEnemyLevel(kingdom, 8);
      for (let tier = 1; tier <= 6; tier++) {
        const level = exploreEnemyLevel(kingdom, tier);
        expect(level).toBeGreaterThan(prior);
        prior = level;
      }
    }
  });
});

describe('Mode progression', () => {
  it('legacy event saves seed difficulty from existing wins', () => {
    const save = newSave();
    for (const type of ['worldEvent', 'classTrials'] as const) {
      const week = ensureEventWeek(save, WEEK, type);
      week.wins = 37;
      delete week.eventData.worldWins;
      delete week.eventData.trialWins;
      const plan = planEventEncounter(save, WEEK, 2, type);
      expect(plan.enemies[0].level).toBeGreaterThanOrEqual(190);
      expect(week.wins).toBe(37);
    }
  });
  it('raid advances by five, tower by five per floor, and PvP coordinated top leagues stay within level 32–36', () => {
    const save = newSave();
    const raid = ensureEventWeek(save, WEEK, 'raidBoss');
    for (const tier of [1, 2, 20, 50]) {
      raid.eventData.bossTier = tier;
      raid.eventData.bossHp = 0;
      expect(planEventEncounter(save, WEEK, 1, 'raidBoss').enemies[0].level).toBe(8 + (tier - 1) * 5);
    }
    const tower = ensureEventWeek(save, WEEK, 'towerOfDoom');
    tower.eventData.runActive = 1;
    for (const floor of [1, 5, 15, 25]) {
      tower.eventData.floor = floor;
      expect(planEventEncounter(save, WEEK, 1, 'towerOfDoom').enemies[0].level).toBe(5 + (floor - 1) * 5);
    }
    for (const [league, base] of [[0, 8], [4, 18], [9, 32]]) {
      for (const mirror of buildBracket(WEEK, league)) {
        for (const enemy of mirror.defense) {
          expect(enemy.level).toBeGreaterThanOrEqual(base);
          expect(enemy.level).toBeLessThanOrEqual(base + 4);
        }
        expect(mirror.rating).toBe(mirror.defense.reduce((sum, enemy) => {
          const stats = enemyStatsAtLevel(getTroopById(enemy.troopId)!, enemy.level);
          return sum + stats.health + stats.armor + stats.attack * 2 + stats.magic * 3;
        }, 0));
      }
    }
  });

  it('invasion cycles never reset difficulty; faction advances every completed three-room stage', () => {
    const save = newSave();
    const inv = ensureEventWeek(save, WEEK, 'invasion');
    let prior = 0;
    for (let cleared = 0; cleared < 12; cleared++) for (let line = 1; line <= 3; line++) {
      inv.eventData.invRepelled = cleared;
      inv.eventData.invLine = line;
      const level = planEventEncounter(save, WEEK, 1, 'invasion', 'hold').enemies[0].level;
      expect(level).toBeGreaterThan(prior);
      prior = level;
    }
    const faction = ensureEventWeek(save, WEEK, 'factionAssault');
    for (let wins = 0; wins < 15; wins++) {
      faction.eventData.assaultWins = wins;
      expect(planEventEncounter(save, WEEK, 1, 'factionAssault', 'flank').enemies[0].level).toBe(20 + Math.floor(wins / 3) * 10);
    }
  });
  it.each(['worldEvent', 'classTrials'] as const)('%s wins advance actual settlement counters; losses do not reduce difficulty', type => {
    const save = newSave();
    let prior = 0;
    for (let i = 0; i < 12; i++) {
      const plan = planEventEncounter(save, WEEK, 1, type);
      expect(plan.enemies[0].level).toBeGreaterThan(prior);
      prior = plan.enemies[0].level;
      eventBattleProgress(save, plan, result(), true);
    }
    const before = planEventEncounter(save, WEEK, 1, type);
    eventBattleProgress(save, before, result('enemy'), false);
    expect(planEventEncounter(save, WEEK, 1, type).enemies[0].level).toBe(before.enemies[0].level);
  });
  it('arena normalizes both teams and summon/transform templates, not the rest of PvP', () => {
    const save = newSave();
    save.kingdoms['破碎尖塔'] = { level: 1, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    entryArena(save, 123, WEEK + 1, WEEK);
    for (let i = 0; i < 4; i++) pickDraftCard(save, currentDraftChoices(save)!.options[0].troopId);
    startArenaBattles(save);
    for (let wins = 0; wins < 3; wins++) {
      save.arena.activeDraft!.wins = wins;
      const battle = planArenaBattle(save, 9);
      expect(battle.ok).toBe(true);
      if (!battle.ok) throw new Error(battle.message);
      expect(battle.request.arenaRules).toBe(true);
      expect(battle.request.playerTeam.length).toBe(battle.request.enemyTeam.length);
      for (const snap of [...battle.request.playerTeam, ...battle.request.enemyTeam]) {
        expect(snap.levelLabel).toBe('Lv.15');
        expect(snap.traitIds).toEqual([]);
        expect(snap.displayTraitIds).toEqual([]);
      }
    }
    const troop = getTroopById(6000)!;
    const summon = troopToSummonTemplate(troop.referenceName, true)!;
    expect(summon.traitIds).toEqual([]);
    expect(summon.hp).toBe(troopStatsAtLevel(troop, 15).health);
    expect(troopToSummonTemplate(troop.referenceName)!.traitIds!.length).toBeGreaterThan(0);
  });
  it('new arcane/celestial costs remain earnable through exploration', () => {
    const save = newSave({ starterTroopIds: [6000] });
    const rec = save.collection['6000'];
    rec.traits = [true, true, false];
    const recipe = traitUnlockCost(3, 'blue', 6000).stones;
    save.materials.traitstones = { ...recipe, 'arcane:blue:blue': 0 };
    const plan = planExploreEncounter(KINGDOM_ORDER[0], 1, 7);
    applySettlement(save, result(), { plan, enemyByExternalId: new Map(), todayStart: 0 });
    expect(save.materials.traitstones['arcane:blue:blue']).toBe(1);
  });
});
