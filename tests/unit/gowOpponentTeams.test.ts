import { invasionPoolLeague } from '../../src/meta/data/invasionDifficulty';
import { COMMUNITY_DEFENSES } from '../../src/meta/data/communityDefenses';
import { describe, it, expect } from 'vitest';
import { getTroopById } from '../../src/data/troops';
import { DEFENSE_TEMPLATES, PVP_LEVEL_BASES, adaptiveDefensePool } from '../../src/meta/data/opponentTeams';
import { enemyTraitCount } from '../../src/meta/data/enemyDifficulty';
import { buildBracket, invasionCandidates, planInvasionBattle } from '../../src/meta/systems/invasion';
import { buildMetaRegistry, enemyToSnapshot } from '../../src/meta/systems/battleBridge';
import { buildDemoSave } from '../../src/meta/server/demo';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave } from '../../src/meta/state/save';
import { openGloryChest } from '../../src/meta/systems/gacha';
import { ARENA_REWARDS } from '../../src/meta/data/economy';
import { arenaOpponentPreview, currentDraftChoices, entryArena, pickDraftCard, startArenaBattles, planArenaBattle, settleArenaBattle, arrangeArenaTeam } from '../../src/meta/systems/arena';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION, type BattleResult } from '../../src/session/contract';

const WEEK = 1726444800000;
const result = (winner: 'player' | 'enemy'): BattleResult => ({
  schemaVersion: BATTLE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION,
  battleId: 'arena-fixture', requestId: 'arena-fixture', seed: 1, winner, turns: 1,
  combatants: [], defeatedExternalIds: [], summonedCount: 0,
  actionLogDigest: '', eventSummary: [],
});
function drafted(seed = 123) {
  const s = buildDemoSave(WEEK);
  expect(entryArena(s, seed, WEEK, WEEK).ok).toBe(true);
  for (let r = 0; r < 4; r++) pickDraftCard(s, currentDraftChoices(s)!.options[0]!.troopId);
  return s;
}

describe('GOW coordinated invasion opponents', () => {
  it('all curated spells have real registered implementations, with support and damage roles', () => {
    const registry = buildMetaRegistry([]); // no fallback IDs injected
    for (const team of DEFENSE_TEMPLATES) {
      expect(team.roles).toHaveLength(4);
      expect(team.roles.some(r => /供魔|爆破/.test(r))).toBe(true);
      const troops = team.troops.map(id => getTroopById(id)!);
      expect(troops.some(t => /伤害|击杀/.test(t.spell.description))).toBe(true);
      for (const t of troops) expect(registry.prototypes.has(String(t.spell.id)), `${team.id}: ${t.name}`).toBe(true);
    }
  });
  it('four members, league-gated archetypes, bounded levels and traits across 200 brackets', () => {
    for (let league = 0; league < 10; league++) for (let w = 0; w < 20; w++) {
      const bracket = buildBracket(WEEK + w * 604800000, league);
      expect(new Set(bracket.map(m => m.archetypeId)).size).toBeGreaterThanOrEqual(3);
      for (const m of bracket) {
        if (m.archetypeId?.startsWith('adaptive-')) {
          const eligible = new Set(adaptiveDefensePool(invasionPoolLeague(league, m.difficulty)).map(t => t.id));
          expect(m.defense).toHaveLength(4);
          expect(new Set(m.defense.map(d => d.troopId)).size).toBe(4);
          for (const d of m.defense) expect(eligible.has(d.troopId)).toBe(true);
        } else if (m.difficulty === 'hard') {
          const t = COMMUNITY_DEFENSES.find(t => t.id === m.archetypeId)!;
          expect(league).toBeGreaterThanOrEqual(t.minLeague); expect(league).toBeLessThanOrEqual(t.maxLeague);
          expect(m.defense.map(d => d.troopId)).toEqual(t.troops);
        } else throw new Error('Expected random roster or reviewed hard reference');
        for (const [i, d] of m.defense.entries()) {
          expect(d.level).toBeGreaterThanOrEqual(PVP_LEVEL_BASES[league]!);
          expect(d.level).toBeLessThanOrEqual(PVP_LEVEL_BASES[league]! + 4);
          const snap = enemyToSnapshot(getTroopById(d.troopId)!, d, i);
          expect(snap.traitIds!.length).toBeLessThanOrEqual(enemyTraitCount(d.level));
          if (d.level < 10) expect(snap.traitIds).toEqual([]);
        }
      }
    }
    expect(buildBracket(WEEK, 9)).toEqual(buildBracket(WEEK, 9));
    expect(buildBracket(WEEK, 9).filter(m => m.sourceRow !== null)).toHaveLength(2);
  });
  it('invasion preview and actual battle share the same snapshots at every league', () => {
    for (let league = 0; league < 10; league++) {
      const save = buildDemoSave(WEEK); save.hero.level = 100;
      save.invasion.weekStart = WEEK; save.invasion.league = league;
      for (const m of invasionCandidates(save, WEEK + 1, WEEK)) {
        const battle = planInvasionBattle(save, m.id, 123, WEEK + 1, WEEK);
        expect(battle.ok).toBe(true); if (!battle.ok) continue;
        expect(battle.request.enemyTeam).toEqual(m.defense.map((d, i) => enemyToSnapshot(getTroopById(d.troopId)!, d, i)));
      }
    }
  });
});

describe('official Arena lifecycle and persistence', () => {
  it('quest unlock is checked before charging', () => {
    const save = newSave(); const before = structuredClone(save);
    expect(entryArena(save, 1, WEEK, WEEK).ok).toBe(false); expect(save).toEqual(before);
  });
  it('preview is a legal four-card fixed-level opponent and changes after a loss', () => {
    const save = drafted(); startArenaBattles(save);
    const battle = planArenaBattle(save, 42); expect(battle.ok).toBe(true);
    if (!battle.ok) return;
    const preview = arenaOpponentPreview(123, 0, 0);
    expect(battle.request.enemyTeam).toEqual(preview.enemies.map((d, i) => enemyToSnapshot(getTroopById(d.troopId)!, d, i)));
    expect(preview.enemies.map(d => getTroopById(d.troopId)!.rarityIdx).sort()).toEqual([0,1,2,3]);
    expect([...battle.request.playerTeam, ...battle.request.enemyTeam].every(s => s.traitIds!.length === 0)).toBe(true);
    expect(settleArenaBattle(save, result('enemy'))).toMatchObject({ runOver: false, losses: 1 });
    const next = planArenaBattle(save, 43); expect(next.ok).toBe(true);
    if (next.ok) expect(next.request.requestId).not.toBe(battle.request.requestId);
    expect(arenaOpponentPreview(123, 0, 1)).not.toEqual(preview);
  });
  it.each([0,1,2,3,4,5,6])('%i wins pays the official tier exactly once, with no gems', wins => {
    const s = drafted(wins + 1); startArenaBattles(s);
    const before = { ...s.currencies };
    const perBattle = { gold: 0, souls: 0 };
    const settle = (winner: 'player' | 'enemy') => {
      const outcome = settleArenaBattle(s, result(winner));
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        perBattle.gold += outcome.battleRewards.gold;
        perBattle.souls += outcome.battleRewards.souls;
      }
      return outcome;
    };
    let settled;
    for (let i = 0; i < wins; i++) settled = settle('player');
    if (wins < 6) { settle('enemy'); settled = settle('enemy'); }
    expect(settled).toMatchObject({ runOver: true, rewards: ARENA_REWARDS[wins] });
    for (const [key, amount] of Object.entries(ARENA_REWARDS[wins]!)) expect(s.currencies[key as keyof typeof before] - before[key as keyof typeof before]).toBe(amount + (key === 'gold' || key === 'souls' ? perBattle[key] : 0));
    expect(s.currencies.gems).toBe(before.gems); expect(s.arena.activeDraft).toBeNull();
    const after = { ...s.currencies }; expect(settleArenaBattle(s, result('player')).ok).toBe(false); expect(s.currencies).toEqual(after);
  });
  it('battle collection is paid on both outcomes and is separate from run prizes', () => {
    const save = drafted(); startArenaBattles(save);
    const before = { ...save.currencies }; const maps = save.materials.treasureMaps;
    const settled = settleArenaBattle(save, { ...result('enemy'), economy: { gold: 12, souls: 7, gems: 0, maps: 1 } });
    expect(settled).toMatchObject({
      runOver: false, collected: { gold: 12, souls: 7, gems: 0, maps: 1 }, rewards: { gold: 0, souls: 0, gloryKeys: 0, trophies: 0 },
    });
    if (!settled.ok) throw new Error('Expected settlement');
    expect(save.currencies.gold).toBe(before.gold + 12 + settled.battleRewards.gold);
    expect(save.currencies.souls).toBe(before.souls + 7 + settled.battleRewards.souls);
    expect(save.materials.treasureMaps).toBe(maps + 1);
  });
  it('partial draft is persisted after every gateway selection', async () => {
    const storage = memoryStorage(); const gw = new MockGateway(storage, { now: () => WEEK }); await gw.load();
    const entered = await gw.enterArena();
    const id = currentDraftChoices(entered.save)!.options[0]!.troopId;
    await gw.pickDraftCard(id);
    const reload = await new MockGateway(storage).load();
    expect(reload.save.arena.activeDraft!.picked).toEqual([id]);
    expect(reload.save.currencies.gold).toBe(entered.save.currencies.gold);
  });
  it('reordered complete team and losses survive hydration; legacy drafts restart free', () => {
    const s = drafted(); const reversed = [...s.arena.activeDraft!.picked].reverse();
    arrangeArenaTeam(s, reversed); startArenaBattles(s); settleArenaBattle(s, result('enemy'));
    const restored = hydrateSave(JSON.parse(JSON.stringify(s)));
    expect(restored.arena.activeDraft).toEqual(s.arena.activeDraft);
    const legacy = JSON.parse(JSON.stringify(s)); delete legacy.arena.activeDraft.rulesVersion;
    legacy.arena.activeDraft.picked = reversed.slice(0,3);
    const migrated = hydrateSave(legacy);
    expect(migrated.arena.activeDraft).toMatchObject({ stage: 'picking', picked: [], rulesVersion: 2 });
    expect(migrated.currencies).toEqual(s.currencies);
  });
});

describe('Arena glory keys are spendable', () => {
  it('key-only opening works at zero glory', () => {
    const s = newSave(); s.currencies.gloryKeys = 1;
    expect(openGloryChest(s, 42)).toMatchObject({ ok: true, spent: { gloryKeys: 1, glory: 0 } });
    expect(s.currencies.gloryKeys).toBe(0);
  });
  it('mixed ten-pack uses keys before glory', () => {
    const s = newSave(); s.currencies.gloryKeys = 3; s.currencies.glory = 140;
    expect(openGloryChest(s, 42, 10)).toMatchObject({ ok: true, spent: { gloryKeys: 3, glory: 140 } });
    expect(s.currencies.gloryKeys).toBe(0); expect(s.currencies.glory).toBe(0);
  });
  it('insufficient mixed payment changes nothing', () => {
    const s = newSave(); s.currencies.gloryKeys = 3; s.currencies.glory = 139;
    const before = structuredClone(s); expect(openGloryChest(s, 42, 10).ok).toBe(false); expect(s).toEqual(before);
  });
});
