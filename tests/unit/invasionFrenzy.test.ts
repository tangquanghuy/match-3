import { describe, it, expect } from 'vitest';
import { INVASION_FRENZY, rollInvasionFrenzy, type FrenzyMultiplier } from '../../src/meta/data/invasionFrenzy';
import { INVASION_DIFFICULTIES, buildFrenzyDefense } from '../../src/meta/data/invasionDifficulty';
import { INVASION_RANKS, INVASION_VP_BY_DIFFICULTY } from '../../src/meta/data/invasionRanks';
import { enemyStatsAtLevel, enemyEncounterStats, enemyTraitCount } from '../../src/meta/data/enemyDifficulty';
import { invasionCandidates, invasionStandings, invasionVictoryVp, ensureInvasionSeason, planInvasionBattle, settleInvasionBattle } from '../../src/meta/systems/invasion';
import { enemyToSnapshot } from '../../src/meta/systems/battleBridge';
import { buildDemoSave, MockGateway, memoryStorage, weekStartOf } from '../../src/meta/gateway';
import { SaveStore } from '../../src/meta/state/save';
import { getTroopById } from '../../src/data/troops';
import { manaLinkScore, troopStrategy } from '../../src/meta/data/troopStrategy';
import type { BattleResult, BattleRequest } from '../../src/session/contract';
const WEEK = weekStartOf(1726444800000);
function fresh(league = 0) {
  const save = buildDemoSave(WEEK); save.hero.level = 100;
  save.invasion.progressionVp = INVASION_RANKS[league * 3]!.vp;
  ensureInvasionSeason(save, WEEK, WEEK); return save;
}
function batch(league: number, slot: number, multiplier: FrenzyMultiplier) {
  for (let i=0;i<10000;i++) { const r=rollInvasionFrenzy(WEEK,league,i); if(r?.slot===slot && r.multiplier===multiplier)return i; }
  throw new Error('fixture not found');
}
const result = (request: BattleRequest): BattleResult => ({schemaVersion:1, rulesetVersion:request.rulesetVersion, requestId:request.requestId,
  battleId:request.battleId, seed:request.seed, winner:'player', turns:2, combatants:[], defeatedExternalIds:[],
  summonedCount:0, actionLogDigest:'', eventSummary:[]});

describe('random invasion frenzy', () => {
  it('is optional per refresh, not a guaranteed slot; both multipliers and all slots occur', () => {
    const rolls = Array.from({length:10000},(_,i)=>rollInvasionFrenzy(WEEK,5,i));
    const hits=rolls.filter(r=>r!==null);
    expect(hits.length/rolls.length).toBeGreaterThan(.23); expect(hits.length/rolls.length).toBeLessThan(.27);
    expect(hits.filter(r=>r.multiplier===2).length/hits.length).toBeGreaterThan(.22);
    expect(hits.filter(r=>r.multiplier===2).length/hits.length).toBeLessThan(.28);
    expect(new Set(hits.map(r=>r.slot)).size).toBe(3);
    expect(rolls).toEqual(Array.from({length:10000},(_,i)=>rollInvasionFrenzy(WEEK,5,i)));
    expect(rolls.some((r,i)=>r===null && rolls[i+1]===null)).toBe(true);
  });
  for (const league of [0,4,9]) for (const [slot,difficulty] of INVASION_DIFFICULTIES.entries()) for (const multiplier of [1.5,2] as const) {
    it(`league ${league} ${difficulty} x${multiplier}: enhanced real stats, trained traits, accurate preview and payout`, () => {
      const save=fresh(league); save.invasion.refreshCount=batch(league,slot,multiplier);
      const beforeStandings=invasionStandings(save,WEEK,WEEK);
      const candidates=invasionCandidates(save,WEEK,WEEK); const m=candidates[slot]!;
      expect(candidates.filter(c=>c.frenzy)).toHaveLength(1);
      expect(m.frenzyMultiplier).toBe(multiplier); expect(m.bannerKingdom).toBeTruthy();
      expect(invasionVictoryVp(m)).toBe(INVASION_VP_BY_DIFFICULTY[difficulty]*multiplier);
      expect(invasionCandidates(save,WEEK+3600000,WEEK).map(c=>[c.id,c.defense,c.frenzyMultiplier])).toEqual(candidates.map(c=>[c.id,c.defense,c.frenzyMultiplier]));
      expect(invasionStandings(save,WEEK,WEEK)).toEqual(beforeStandings);
      const plan=planInvasionBattle(save,m.id,123,WEEK,WEEK); expect(plan.ok).toBe(true); if(!plan.ok)throw new Error(plan.message);
      let rating=0;
      for (const [i,d] of m.defense.entries()) {
        expect(d.statMultiplier).toBe(INVASION_FRENZY.stats[multiplier]);
        const troop=getTroopById(d.troopId)!; const base=enemyStatsAtLevel(troop,d.level);
        const boosted=enemyEncounterStats(troop,d.level,d.statMultiplier);
        expect(boosted.health).toBeGreaterThan(base.health);
        expect(boosted).toEqual(Object.fromEntries(Object.entries(base).map(([k,v])=>[k,Math.ceil(v*INVASION_FRENZY.stats[multiplier])])));
        const snapshot=enemyToSnapshot(troop,d,i);
        expect(plan.request.enemyTeam[i]).toEqual(snapshot);
        expect(snapshot.stats).toEqual({hp:boosted.health,armor:boosted.armor,attack:boosted.attack,magic:boosted.magic});
        expect(snapshot.manaCost).toBe(troop.manaCost);
        expect(snapshot.traitIds).toHaveLength(enemyTraitCount(d.level));
        rating+=boosted.health+boosted.armor+boosted.attack*2+boosted.magic*3;
      }
      expect(m.rating).toBe(rating);
      const ids=m.defense.map(d=>d.troopId);
      expect(ids.some(source=>ids.some(target=>source!==target && (troopStrategy(target).damage || troopStrategy(target).skulls) && manaLinkScore(source,target)>0))).toBe(true);
      const before=save.invasion.progressionVp;
      const settled=settleInvasionBattle(save,result(plan.request),m.id,WEEK,WEEK,WEEK);
      expect(settled).toMatchObject({ok:true,vpBase:INVASION_VP_BY_DIFFICULTY[difficulty],vpDelta:invasionVictoryVp(m),bonuses:{total:0}});
      expect(save.invasion.progressionVp-before).toBe(invasionVictoryVp(m));
    });
  }
  it('uses varied random teams rather than a handful of fixed decks', () => {
    for (const multiplier of [1.5,2] as const) {
      const teams=Array.from({length:24},(_,i)=>buildFrenzyDefense(i,9,'hard',multiplier));
      expect(new Set(teams.map(t=>t.troops.join(','))).size).toBeGreaterThan(20);
      expect(teams.every(t=>t.sourceRow===null)).toBe(true);
    }
  });
  it('frenzy survives save reload and a loss gives no bonus VP', async () => {
    const storage=memoryStorage(); const env={now:()=>WEEK};
    const g=new MockGateway(storage,env); await g.load(); await g.syncInvasionSeason();
    // 客户端副本改了不算数：夹具直接写进存储介质（相当于服务端数据）
    const save=structuredClone(g.current()); save.invasion.refreshCount=batch(save.invasion.league,2,2);
    new SaveStore(storage).persist(save);
    const m=invasionCandidates(save,WEEK,WEEK)[2]!;
    const next=new MockGateway(storage,env); await next.load();
    expect(invasionCandidates(next.current(),WEEK,WEEK)[2]).toEqual(m);
    const plan=await next.planInvasionBattle(m.id); if(!plan.ok)throw new Error(plan.message);
    const before=next.current().invasion.progressionVp;
    const out=await next.settleBattle({...result(plan.request),winner:'enemy'});
    expect(out.result).toMatchObject({ok:true,settled:{vpDelta:0}});
    expect(next.current().invasion.progressionVp).toBe(before);
  });
});
