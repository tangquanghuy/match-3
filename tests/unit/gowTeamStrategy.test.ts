import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { COMMUNITY_KINGDOM } from '../../src/data/communityTroops';
import { BaseColor } from '../../src/engine/types';
import { troopStrategy, strategyCoverage, strategyPickScore, buildTroopStrategy,
  manaLinkScore, arrangeStrategyDefense, defenseOrderScore } from '../../src/meta/data/troopStrategy';
import { adaptiveDefensePool, buildAdaptiveDefense, DEFENSE_TEMPLATES } from '../../src/meta/data/opponentTeams';
import { ARENA_OPPONENT_POLICIES, arenaOpponentPolicy, arenaOpponentPreview, draftArenaDefense } from '../../src/meta/systems/arena';
import { buildMetaRegistry } from '../../src/meta/systems/battleBridge';

describe('roster-wide strategy coverage, not an exhaustive combo promise', () => {
  it('every official/custom troop has a finite baseline evaluation and explicit coverage', () => {
    for (const t of TROOPS) {
      expect(troopStrategy(t.id).troopId).toBe(t.id);
      expect(Number.isFinite(strategyPickScore([], t.id))).toBe(true);
      expect(['spell-heuristic', 'baseline']).toContain(troopStrategy(t.id).coverage);
    }
    const coverage = strategyCoverage();
    expect(coverage.total).toBe(TROOPS.length);
    expect(coverage.spellHeuristic + coverage.baselineIds.length).toBe(coverage.total);
    console.info('STRATEGY_COVERAGE', JSON.stringify({ total: coverage.total, spellHeuristic: coverage.spellHeuristic,
      baseline: coverage.baselineIds.length, conditional: coverage.conditionalIds.length,
      adaptivePoolByLeague: Array.from({ length: 10 }, (_, i) => adaptiveDefensePool(i).length) }));
  });
  it('reads converter output rather than input, and does not confuse explosion with green-only supply', () => {
    expect(troopStrategy(6005).generatedColors).toEqual([BaseColor.Yellow]);
    expect(troopStrategy(6110).generatedColors).toEqual([BaseColor.Purple]);
    expect(troopStrategy(6638).generatedColors).toEqual([]);
    expect(troopStrategy(6638).broadMana).toBe(true);
    expect(manaLinkScore(6045, 6044)).toBeGreaterThan(manaLinkScore(6045, 6000));
    const t = getTroopById(6000)!;
    const make = (text: string) => buildTroopStrategy({ ...t, spell: { ...t.spell, description: text } });
    expect(make('将所有红色宝石转换成蓝色宝石。').generatedColors).toEqual([BaseColor.Blue]);
    expect(make('移除所有绿色宝石。').generator).toBe(false);
    expect(make('承受 2 点伤害。').damage).toBe(false);
    expect(make('使所有敌人眩晕。')).toMatchObject({ control: false, traitControl: true });
  });
  it('Arena ignores empowered/half-mana traits even if a caller supplies a trait count', () => {
    for (const id of [6638, 6751, 6863]) {
      expect(strategyPickScore([6419], id, { level: 15, traitCount: 3, arena: true }))
        .toBe(strategyPickScore([6419], id, { level: 15, traitCount: 0, arena: true }));
    }
    expect(strategyPickScore([], 6638, { level: 20, traitCount: 3, arena: false }))
      .toBeGreaterThan(strategyPickScore([], 6638, { level: 20, traitCount: 2, arena: false }));
    expect(getTroopById(6863)!.troopTypes).not.toContain('Elemental');
  });
  it('standing optimization preserves all cards, is deterministic and never worsens its own score', () => {
    for (const template of DEFENSE_TEMPLATES) {
      const order = arrangeStrategyDefense(template.troops);
      expect([...order].sort()).toEqual([...template.troops].sort());
      expect(defenseOrderScore(order)).toBeGreaterThanOrEqual(defenseOrderScore(template.troops));
      expect(arrangeStrategyDefense(order)).toEqual(order);
    }
    expect(arrangeStrategyDefense([])).toEqual([]);
  });
  it('generalist PvP broadens the roster but excludes custom, event-only and premature finishers', () => {
    const core = new Set(DEFENSE_TEMPLATES.flatMap(t => [...t.troops]));
    const pool = adaptiveDefensePool(9);
    expect(pool.filter(t => !core.has(t.id)).length).toBeGreaterThan(1000);
    for (let league = 0; league < 10; league++) {
      for (const t of adaptiveDefensePool(league)) {
        expect(t.kingdom).not.toBe(COMMUNITY_KINGDOM);
        expect(t.troopTypes.some(type => ['Boss', 'Doom', 'Castle', 'Immortal', 'Gnome'].includes(type))).toBe(false);
        if (league < 7) expect(t.spell.description).not.toMatch(/吞噬|击杀/);
        if (league < 3) expect(troopStrategy(t.id).generator && troopStrategy(t.id).extraTurn).toBe(false);
      }
    }
  });
  it('sampled generalist teams have implemented spells, an output and reproducible varied rosters', () => {
    const registry = buildMetaRegistry([]), used = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const team = buildAdaptiveDefense(seed, seed % 10, 20);
      expect(team).toEqual(buildAdaptiveDefense(seed, seed % 10, 20));
      expect(new Set(team.troops).size).toBe(4);
      expect(team.roles).toHaveLength(4);
      expect(team.troops.some(id => troopStrategy(id).damage || troopStrategy(id).skulls)).toBe(true);
      for (const id of team.troops) {
        used.add(id); expect(registry.prototypes.has(String(getTroopById(id)!.spell.id)), `troop ${id}`).toBe(true);
      }
    }
    expect(used.size).toBeGreaterThan(100);
  });
});

describe('Arena win-based imperfect draft skill, never a stat ramp', () => {
  it('six policy tiers increase strictly and never reach perfect play', () => {
    expect(ARENA_OPPONENT_POLICIES).toHaveLength(6);
    expect(arenaOpponentPolicy(-1)).toEqual(ARENA_OPPONENT_POLICIES[0]);
    expect(arenaOpponentPolicy(100)).toEqual(ARENA_OPPONENT_POLICIES[5]);
    for (let i = 1; i < 6; i++) {
      expect(ARENA_OPPONENT_POLICIES[i]!.smartPickChance).toBeGreaterThan(ARENA_OPPONENT_POLICIES[i-1]!.smartPickChance);
      expect(ARENA_OPPONENT_POLICIES[i]!.arrangeChance).toBeGreaterThan(ARENA_OPPONENT_POLICIES[i-1]!.arrangeChance);
      expect(ARENA_OPPONENT_POLICIES[i]!.smartPickChance).toBeLessThan(1);
    }
  });
  it('same offers, no extra rerolls or future picks: selection and ordering improve statistically', () => {
    const smart = Array(6).fill(0), arranged = Array(6).fill(0), scores = Array(6).fill(0);
    for (let seed = 0; seed < 256; seed++) {
      const first = draftArenaDefense(seed, 0);
      expect(first.arranged).toBe(false); expect(first.rounds.every(r => !r.smart)).toBe(true);
      for (let wins = 0; wins < 6; wins++) {
        const d = draftArenaDefense(seed, wins);
        expect(d.rounds.map(r => r.options)).toEqual(first.rounds.map(r => r.options));
        expect(d.troops).toHaveLength(4);
        for (const [round, r] of d.rounds.entries()) {
          expect(r.options).toHaveLength(3); expect(r.options).toContain(r.picked);
          expect(getTroopById(r.picked)!.rarityIdx).toBe(round);
          expect(getTroopById(r.picked)!.kingdom).not.toBe(COMMUNITY_KINGDOM);
          smart[wins] += Number(r.smart); scores[wins] += r.score;
        }
        arranged[wins] += Number(d.arranged);
      }
    }
    for (let w = 1; w < 6; w++) {
      expect(smart[w]).toBeGreaterThan(smart[w-1]);
      expect(arranged[w]).toBeGreaterThan(arranged[w-1]);
      expect(scores[w]).toBeGreaterThan(scores[w-1]);
    }
    expect(smart[5]).toBeLessThan(256 * 4); expect(arranged[5]).toBeLessThan(256);
    console.info('ARENA_PROGRESSION', JSON.stringify({ smart, arranged, meanPickScore: scores.map(n => n / 1024) }));
  });
  it('each win/loss bracket stays fixed level and traitless; losses change seed, not tier', () => {
    for (let wins = 0; wins < 6; wins++) {
      const a = arenaOpponentPreview(678, wins, 0), b = arenaOpponentPreview(678, wins, 1);
      expect(a.policy).toEqual(b.policy); expect(a.enemies).not.toEqual(b.enemies);
      for (const preview of [a, b]) for (const troop of preview.enemies) {
        expect(troop.level).toBe(15); expect(troop.traitCount).toBe(0);
      }
      expect(arenaOpponentPreview(678, wins, 0)).toEqual(a);
    }
  });
});
