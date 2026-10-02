import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { newSave } from '../../src/meta/state/schema';
import { SaveStore } from '../../src/meta/state/save';
import { MockGateway } from '../../src/meta/gateway';
import { applySettlement } from '../../src/meta/systems/settlement';
import { planExploreEncounter } from '../../src/meta/systems/encounter';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { ARCANE_STONE_KEYS, STONE_COLORS } from '../../src/meta/data/materials';
import { EXPLORE_DROPS, exploreStoneChances } from '../../src/meta/data/economy';
import { kingdomArcaneKey, kingdomBoostedStoneColors, kingdomsForExploreStone, pickExploreStoneKey } from '../../src/meta/systems/explore';
import { SeededRNG } from '../../src/engine/rng';
import { questRewardsHtml, questModeLootHtml } from '../../src/meta/screens/questRewards';
import type { BattleResult } from '../../src/session/contract';

const kingdom = KINGDOM_ORDER[0]!;
const result = (seed: number): BattleResult => ({ schemaVersion: 1, battleId: `explore-${seed}`, requestId: 'r', rulesetVersion: '1',
  seed, winner: 'player', turns: 1, combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [] });
function stoneDrop(seed: number, enemyId?: number, stage = 0, tier = 1) {
  const save = newSave({ now: 0, starterTroopIds: [6000] });
  for (const rec of Object.values(save.collection)) rec.traits = [true, true, true];
  const plan = planExploreEncounter(kingdom, tier, seed, stage);
  if (enemyId !== undefined) plan.enemies[0]!.troopId = enemyId;
  const detail = applySettlement(save, result(seed), { plan, todayStart: 0, enemyByExternalId: new Map() });
  return detail.lines.find(line => line.key === 'explore-drop')?.mats?.traitstones ?? {};
}

describe('探索特质石抽取与首通奖励', () => {
  it('同一结算种子不受敌方队首主色影响，所有六色都可掉落', () => {
    const leads = STONE_COLORS.map(color => TROOPS.find(t => t.manaColors[0] === color.base)!.id);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const expected = stoneDrop(seed, leads[0]);
      Object.keys(expected).forEach(key => seen.add(key));
      for (const lead of leads.slice(1)) expect(stoneDrop(seed, lead)).toEqual(expected);
    }
    for (const color of STONE_COLORS) expect(seen).toContain(`minor:${color.key}`);
  });
  it('小怪每场固定四颗，初级颜色约 75% 偏向王国旗帜', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 6000; seed++) {
      for (const [key, n] of Object.entries(stoneDrop(seed))) counts[key] = (counts[key] ?? 0) + n;
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(6000 * (EXPLORE_DROPS.stoneRollsByStage[0] + EXPLORE_DROPS.extraBasicStoneRolls));
    const favored = new Set(kingdomBoostedStoneColors(kingdom));
    const minorTotal = Object.entries(counts).reduce((sum, [key, n]) => sum + (key.startsWith('minor:') ? n : 0), 0);
    const favoredTotal = Object.entries(counts).reduce((sum, [key, n]) => sum + (key.startsWith('minor:') && favored.has(key.slice(6)) ? n : 0), 0);
    expect(favoredTotal / minorTotal).toBeGreaterThan(0.71);
    expect(favoredTotal / minorTotal).toBeLessThan(0.79);
    const majorTotal = Object.entries(counts).reduce((sum, [key, n]) => sum + (key.startsWith('major:') ? n : 0), 0);
    expect(majorTotal / total).toBeGreaterThan(0.13);
    expect(majorTotal / total).toBeLessThan(0.17);
    expect(Object.keys(counts).some(key => key.startsWith('runic:'))).toBe(true);
    expect(Object.keys(counts).some(key => key.startsWith('arcane:'))).toBe(true);
    for (const color of STONE_COLORS) expect(counts[`minor:${color.key}`]).toBeGreaterThan(0);
  });
  it('按王国旗帜加权颜色候选，缺少加成色候选时仍可抽取', () => {
    const preferred = kingdomBoostedStoneColors(kingdom)[0]!;
    const other = STONE_COLORS.find(color => !kingdomBoostedStoneColors(kingdom).includes(color.key))!.key;
    const keys = [`major:${preferred}`, `major:${other}`];
    const rng = new SeededRNG(17);
    const picks = Array.from({ length: 4000 }, () => pickExploreStoneKey(kingdom, keys, rng));
    const favored = picks.filter(key => key === keys[0]).length;
    expect(favored / picks.length).toBeGreaterThan(0.72);
    expect(favored / picks.length).toBeLessThan(0.78);
    expect(pickExploreStoneKey(kingdom, [keys[1]!], rng)).toBe(keys[1]);
    expect(pickExploreStoneKey(kingdom, [], rng)).toBeNull();
    expect(kingdomsForExploreStone(keys[0]!)).toContain(kingdom);
  });
  it('双色秘法石同时列出首通固定产地和其他旗帜匹配王国', () => {
    const key = ARCANE_STONE_KEYS.find(stone => kingdomsForExploreStone(stone).some(k => kingdomArcaneKey(k) !== stone));
    expect(key).toBeDefined();
    const matches = kingdomsForExploreStone(key!);
    expect(matches.some(k => kingdomArcaneKey(k) === key)).toBe(true);
    expect(matches.some(k => kingdomArcaneKey(k) !== key)).toBe(true);
    for (const k of matches) {
      expect(key!.split(':').slice(1).some(color => kingdomBoostedStoneColors(k).includes(color))).toBe(true);
    }
    const boosted = kingdomBoostedStoneColors(kingdom);
    const rng = new SeededRNG(17);
    const picks = Array.from({ length: 4000 }, () => pickExploreStoneKey(kingdom, ARCANE_STONE_KEYS, rng));
    const favored = picks.filter(key => key?.split(':').slice(1).some(color => boosted.includes(color))).length;
    expect(favored / picks.length).toBeGreaterThan(0.72);
    expect(favored / picks.length).toBeLessThan(0.78);
  });
  it.each(['hard', 'veryHard'] as const)('%s 奖励预览标明本王国更易掉落的颜色', mode => {
    for (const k of KINGDOM_ORDER) for (const node of [1, 2, 3]) {
      const html = questRewardsHtml(k, mode, node);
      for (const color of STONE_COLORS) expect(html).toContain(`data-reward="stone:minor:${color.key}"`);
      expect(html).toContain('本王国旗帜加成色，更易掉落');
      expect(html).not.toContain('队首');
      expect(questModeLootHtml(k, mode)).toContain('75% 优先本王国旗帜加成色');
    }
  });
  it.each([1, 2, 3, 4, 5, 6])('档位%i已通关仍可重新签票，材料和胜利奖励再次入账，首通只领一次', async tier => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: tier, exploreUnlockedTier: 12, lastTributeAt: 0 };
    new SaveStore(storage).persist(save);
    const gateway = new MockGateway(storage);
    await gateway.load();
    for (let attempt = 0; attempt < 2; attempt++) for (let stage = 0; stage < 6; stage++) {
      const ticket = await gateway.planExploreBattle(kingdom);
      if (!ticket.ok) throw new Error(ticket.message);
      const { request } = ticket;
      const settled = (await gateway.settleBattle({ ...result(request.seed), requestId: request.requestId, battleId: request.battleId, rulesetVersion: request.rulesetVersion })).result;
      if (!settled.ok || settled.kind !== 'encounter') throw new Error('expected encounter settlement');
      expect(settled.detail.lines.some(l => l.key === 'victory')).toBe(true);
      expect(settled.detail.lines.some(l => l.key === 'explore-drop')).toBe(true);
      expect(settled.detail.lines.some(l => l.key === 'kingdom-first-clear')).toBe(attempt === 0 && stage === 5);
    }
  });
  it('掉落不依赖持有部队的特质缺口', () => {
    const saveA = newSave({ now: 0, starterTroopIds: [6000] });
    const saveB = structuredClone(saveA);
    saveA.collection['6000']!.traits = [false, false, false];
    saveB.collection['6000']!.traits = [true, true, true];
    const ctx = { plan: planExploreEncounter(kingdom, 1, 7), todayStart: 0, enemyByExternalId: new Map() };
    const a = applySettlement(saveA, result(7), ctx).lines.find(line => line.key === 'explore-drop')?.mats?.traitstones;
    const b = applySettlement(saveB, result(7), ctx).lines.find(line => line.key === 'explore-drop')?.mats?.traitstones;
    expect(a).toEqual(b);
  });
  it('首领六颗、最终 Boss 八颗基础石，首通额外一颗对应王国秘法', () => {
    expect(Object.values(stoneDrop(29, undefined, 4)).reduce((sum, n) => sum + n, 0)).toBe(6);
    const boss = stoneDrop(29, undefined, 5);
    expect(Object.values(boss).reduce((sum, n) => sum + n, 0)).toBe(9);
    expect(boss[kingdomArcaneKey(kingdom)]).toBeGreaterThanOrEqual(1);
  });
  it('难度 12 圣辉单次 0.96%，符文按每级基础概率增加 20%', () => {
    expect(exploreStoneChances(1)).toMatchObject({ major: 0.15, runic: 0.02, arcane: 0.01, celestial: 0.002 });
    expect(exploreStoneChances(12).celestial).toBeCloseTo(0.0096);
    expect(exploreStoneChances(12).runic).toBeCloseTo(0.064);
  });
});
