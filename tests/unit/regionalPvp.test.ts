import { battleMapDrop } from '../../src/meta/systems/battleMaps';
import { MetaHost, type SaveRepository, type RecordBatch } from '../../src/meta/server/host';
import { saveToRecords, recordsToSave } from '../../src/meta/state/records';
import { buildPlayerSnapshots } from '../../src/meta/systems/battleBridge';
import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { newSave, type MetaSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { regionalAction, regionalFrenzy, ensureRegional, planRegional, previewRegionalBattle, previewRegionalEnemy, settleRegional, regionLegal, activeRegions, regionOpen, nextRegionWeek, regionalRule, buildRegionalOpponents } from '../../src/meta/systems/regionalPvp';
import { REGION_DUEL_SCALING, REGION_TIERS, burningSoulCost, REGIONS, REGION_REVISION, type RegionId } from '../../src/meta/data/regionalPvp';
import { freshRegionalState, hydrateRegionalState } from '../../src/meta/state/regional';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { WEEK_MS } from '../../src/meta/data/events';
import { runCommand } from '../../src/meta/server/core';
import { defaultEnv } from '../../src/meta/server/env';
import { levelUp } from '../../src/meta/systems/troopProgress';
import { RULESET_VERSION, type BattleResult } from '../../src/session/contract';
import { captureMirrorRecord } from '../../src/meta/systems/invasionMirrors';
const NOW=Date.UTC(2026,9,1,12);
function fixture(now=NOW):MetaSave {
 const ids=TROOPS.filter(t=>regionLegal({templateId:String(t.id),troopTypes:t.troopTypes},weekStartOf(now))&&!t.troopTypes.includes('Immortal')&&t.rarityIdx>=3).slice(0,4).map(t=>t.id);
 const s=newSave({now,starterTroopIds:ids,currencies:{souls:1000000}});s.hero.level=100;
 s.teams=[{name:'区域队',members:ids.map(troopId=>({kind:'troop' as const,troopId})),bannerKingdomId:null}];s.activeTeamIndex=0;
 for(const r of Object.values(s.collection)){r.level=20;r.ascension=3;r.traits=[true,true,true];}
 expect(regionalAction(s,{action:'sync'},now)).toEqual({ok:true});return s;
}
function victory(id='fixture',winner:'player'|'enemy'='player'):BattleResult {return {schemaVersion:1,rulesetVersion:RULESET_VERSION,requestId:id,battleId:'fixture',seed:1,winner,turns:8,combatants:[],defeatedExternalIds:[],summonedCount:0,actionLogDigest:'fixture',eventSummary:[]};}
function duel(s:MetaSave,now=NOW,tier=0){const p=planRegional(s,{kind:'duel',opponentId:s.regional!.regions.WintersReach.opponents[tier]!.id},now,1);if(!p.ok)throw new Error(p.message);return p;}
describe('independent regional PvP',()=>{
 it.each([0,1,2,3])('builds legal mature squads for weekly restriction %s',offset=>{
  const now=NOW+offset*9*WEEK_MS,s=fixture(now),r=s.regional!;
  expect(r.regions.WintersReach.opponents).toHaveLength(3);
  for(const o of r.regions.WintersReach.opponents){expect(o.team).toHaveLength(4);expect(o.team.every(c=>regionLegal(c,r.week))).toBe(true);expect(new Set(o.team.map(c=>c.templateId)).size).toBe(4);const p=duel(s,now,o.tier);expect(p.request.enemyTeam).toEqual(previewRegionalEnemy(o,now));expect(p.request.region).toBe('WintersReach');expect(p.request.rules?.board?.specialDrops?.chance).toBe(.05);expect(p.request.enemyTeam[0]!.stats.hp).toBe(Math.ceil(o.team[0]!.stats.hp*REGION_DUEL_SCALING[o.tier].hp*(regionalFrenzy(now)?1.5:1)));}
 });
 it('uses eligible real mirrors and no repeated owner in a batch',()=>{
  const s=fixture(),built=buildPlayerSnapshots(s);if(!built.ok)throw new Error(built.message);for(const c of built.playerTeam){c.stats.hp+=11;c.stats.armor+=11;}const record=captureMirrorRecord(s,built.team,built.playerTeam,null,NOW);expect(record).toBeTruthy();
  regionalAction(s,{action:'refresh'},NOW,[{...record,ownerKey:'real',name:'真实指挥官'}]);
  expect(s.regional!.regions.WintersReach.opponents.filter(o=>o.mirror?.player?.ownerKey==='real')).toHaveLength(1);
 });
 it('rejects low-level/illegal teams and resource shortages without a partial charge',()=>{
  const s=fixture();s.hero.level=49;expect(planRegional(s,{kind:'citadel'},NOW,1).ok).toBe(false);s.hero.level=100;
  s.regional!.sigils=0;const before=structuredClone(s);expect(planRegional(s,{kind:'citadel'},NOW,1).ok).toBe(false);expect(s).toEqual(before);
  s.regional!.energy=0;expect(planRegional(s,{kind:'monolith',monolith:'ward'},NOW,1).ok).toBe(false);
  s.teams[0]!.members[0]={kind:'troop',troopId:6000};expect(planRegional(s,{kind:'duel',opponentId:s.regional!.regions.WintersReach.opponents[0]!.id},NOW,1).ok).toBe(false);
 });
 it('persists region state; old saves get defaults without granting fuel',()=>{
  const s=fixture();s.regional!.burningSouls=13;const restored=migrateSave(JSON.parse(JSON.stringify(s)));expect(restored.regional!.burningSouls).toBe(13);expect(restored.regional!.regions.WintersReach.opponents).toHaveLength(3);
  delete s.regional;expect(migrateSave(JSON.parse(JSON.stringify(s))).regional).toEqual(freshRegionalState());
 });
 it('grants fixed victory gold plus battle collections and energy after two duel wins',()=>{
  const s=fixture(),gold=s.currencies.gold,energy=s.regional!.energy;
  const p=duel(s);settleRegional(s,{...victory(),economy:{gold:17,souls:5,gems:2,maps:1}},p.context,NOW);
  expect(s.currencies.gold-gold).toBe(1817);expect(s.regional!.energy).toBe(energy);
  regionalAction(s,{action:'sync'},NOW);const q=duel(s);settleRegional(s,victory(),q.context,NOW);expect(s.regional!.energy).toBe(energy+1);
 });
 it('unlocks five monolith stages, adds one hour per victory and excludes its own buff',()=>{
  const s=fixture();s.regional!.energy=10;let firstHp=0;
  for(let i=0;i<5;i++){const p=planRegional(s,{kind:'monolith',monolith:'vigor'},NOW,1);if(!p.ok)throw new Error(p.message);if(!i)firstHp=p.request.playerTeam[0]!.stats.hp;else expect(p.request.playerTeam[0]!.stats.hp).toBe(firstHp);expect(p.request.enemyTeam[0]!.levelLabel).toBe(`Lv.${[20,40,80,150,300][i]}`);settleRegional(s,victory(),p.context,NOW);}
  expect(s.regional!.monoliths.vigor).toEqual({level:5,expires:NOW+5*3600000});expect(planRegional(s,{kind:'monolith',monolith:'vigor'},NOW,1).ok).toBe(false);
  expect(duel(s).request.playerTeam[0]!.stats.hp).toBe(Math.ceil(firstHp*1.5));
 });
 it.each(['player','enemy'] as const)('guardian %s cycles after four wins and uses a distinct guardian, not an Immortal',winner=>{
  const s=fixture();for(let i=0;i<5;i++){const p=planRegional(s,{kind:'citadel'},NOW,1);if(!p.ok)throw new Error(p.message);if(i===4)expect(getTroopById(Number(p.request.enemyTeam[0]!.templateId))!.troopTypes).not.toContain('Immortal');settleRegional(s,victory('fixture',i===4?winner:'player'),p.context,NOW);}
  expect(s.regional!.regions.WintersReach.citadel.stage).toBe(0);expect(s.regional!.regions.WintersReach.citadel.cycles).toBe(winner==='player'?1:0);expect(s.regional!.burningSouls).toBe(winner==='player'?3:0);expect(s.regional!.sigils).toBe(1);
 });
 it('gates high rewards on real guardian wins and claims exactly once',()=>{
  const s=fixture();s.regional!.vp=99999;expect(regionalAction(s,{action:'claim',index:2},NOW).ok).toBe(false);s.regional!.guardianWins=1;
  expect(regionalAction(s,{action:'claim',index:2},NOW).ok).toBe(true);const after=structuredClone(s);expect(regionalAction(s,{action:'claim',index:2},NOW).ok).toBe(false);expect(s).toEqual(after);
 });
 it('preserves permanent fuel but not progress across week; old ticket gives no new-week VP',()=>{
  const s=fixture(),p=duel(s);s.regional!.burningSouls=12;s.regional!.vp=900;settleRegional(s,victory(),p.context,NOW+WEEK_MS);expect(s.regional!.burningSouls).toBe(12);expect(s.regional!.vp).toBe(0);expect(s.regional!.history[0]!.vp).toBe(0);
 });
 it('authoritative ticket rejects mismatch and duplicate settlement',()=>{
  const env=defaultEnv({now:()=>NOW,seed:()=>1}),s=fixture(),p=runCommand(s,{type:'planRegionalBattle',args:{kind:'citadel'}},env);expect(p.result.ok).toBe(true);expect(p.save.pendingBattle?.mode).toBe('regional');expect(s.pendingBattle).toBeNull();
  expect(runCommand(p.save,{type:'settleBattle',args:{result:victory('wrong')}},env).commit).toBe(false);
  const result=victory(p.save.pendingBattle!.requestId),out=runCommand(p.save,{type:'settleBattle',args:{result}},env);expect(out.result.ok).toBe(true);expect(out.save.pendingBattle).toBeNull();expect(out.save.regional!.regions.WintersReach.citadel.stage).toBe(1);expect(runCommand(out.save,{type:'settleBattle',args:{result}},env).commit).toBe(false);
 });
 it('daily reset tops up sigils without resetting ongoing city progress',()=>{const s=fixture();s.regional!.sigils=1;s.regional!.regions.WintersReach.citadel.stage=3;ensureRegional(s,NOW+86400000);expect(s.regional!.sigils).toBe(6);expect(s.regional!.regions.WintersReach.citadel.stage).toBe(3);});
 it('burning souls are additional atomic upgrade costs, ordinary troops unaffected',()=>{
  const s=fixture();s.collection['7581']={level:1,ascension:0,copies:0,traits:[false,false,false],locked:false};const before=structuredClone(s);expect(levelUp(s,7581,30).ok).toBe(false);expect(s).toEqual(before);expect(burningSoulCost(1,30)).toBe(99);
  s.regional!.burningSouls=99;expect(levelUp(s,7581,30)).toMatchObject({ok:true,burningSpent:99});expect(s.regional!.burningSouls).toBe(0);
 });
});

describe('regional duel difficulty separation',()=>{
 it.each([0,1])('applies the new scaling to cached opponents, preview and battle (day +%s)',offset=>{
  const now=NOW+offset*86400000,s=fixture(now);
  // Round-trip an already generated roster: no refresh or save reset is required.
  const restored=migrateSave(JSON.parse(JSON.stringify(s)));
  const before=structuredClone(restored);
  const frenzy=regionalFrenzy(now)?1.5:1;
  for(const o of restored.regional!.regions.WintersReach.opponents){
   const args={kind:'duel' as const,opponentId:o.id};
   const preview=previewRegionalBattle(restored,args,now),battle=planRegional(restored,args,now,123);
   if(!preview.ok||!battle.ok)throw new Error('expected playable duel');
   expect(battle.request.enemyTeam).toEqual(preview.request.enemyTeam);
   expect(battle.request.enemyTeam).toEqual(previewRegionalEnemy(o,now));
   for(const [i,c] of battle.request.enemyTeam.entries()){
    for(const key of ['hp','armor','attack','magic'] as const){
     expect(c.stats[key]).toBe(Math.ceil(o.team[i]!.stats[key]*REGION_DUEL_SCALING[o.tier][key]*frenzy));
    }
    expect(c.manaCost).toBe(o.team[i]!.manaCost);
   }
   expect(battle.context.opponent.gold).toBe(o.gold);
   expect(battle.context.opponent.vp).toBe(o.vp);
  }
  expect(restored).toEqual(before);
 });
 it('has strictly separated tiers on the same baseline, including real mirror snapshots',()=>{
  const s=fixture(),built=buildPlayerSnapshots(s);if(!built.ok)throw new Error(built.message);
  for(const c of built.playerTeam){c.stats.hp+=100;c.stats.armor+=100;}
  const record=captureMirrorRecord(s,built.team,built.playerTeam,null,NOW);
  buildRegionalOpponents(s,NOW,[{...record,ownerKey:'difficulty-test',name:'mirror'}]);
  const mirror=s.regional!.regions.WintersReach.opponents.find(o=>o.mirror)!;
  expect(mirror).toBeTruthy();
  const teams=([0,1,2] as const).map(tier=>previewRegionalEnemy({...mirror,tier},NOW,'CentralSpire'));
  expect(teams[0]!.map(c=>c.stats)).toEqual(mirror.team.map(c=>c.stats));
  for(let i=0;i<4;i++)for(const key of ['hp','armor','attack','magic'] as const){
   const base=mirror.team[i]!.stats[key];
   expect(teams[1]![i]!.stats[key]).toBe(Math.ceil(base*REGION_DUEL_SCALING[1][key]));
   expect(teams[2]![i]!.stats[key]).toBe(Math.ceil(base*REGION_TIERS[2][key]));
   if(base>0){
    expect(teams[0]![i]!.stats[key]).toBeLessThan(teams[1]![i]!.stats[key]);
    expect(teams[1]![i]!.stats[key]).toBeLessThan(teams[2]![i]!.stats[key]);
   }
  }
 });
 it.each([0,1,2] as const)('preserves selected citadel tier %s and cycle scaling',tier=>{
  const s=fixture(),o=s.regional!.regions.WintersReach.opponents[tier]!;
  s.regional!.regions.WintersReach.citadel.cycles=3;
  const args={kind:'citadel' as const,opponentId:o.id};
  const preview=previewRegionalBattle(s,args,NOW),battle=planRegional(s,args,NOW,123);
  if(!preview.ok||!battle.ok)throw new Error('expected playable citadel');
  expect(battle.request.enemyTeam).toEqual(preview.request.enemyTeam);
  for(const [i,c] of battle.request.enemyTeam.entries())for(const key of ['hp','armor','attack','magic'] as const){
   expect(c.stats[key]).toBe(Math.ceil(o.team[i]!.stats[key]*REGION_TIERS[tier][key]*(regionalFrenzy(NOW)?1.5:1)*1.3));
  }
 });
});

describe('regional persistence and preview boundaries',()=>{
 class Repo implements SaveRepository {
  records=saveToRecords(fixture());
  async load(){return {records:new Map(this.records),warning:null};}
  async write(batch:RecordBatch){for(const k of batch.del)this.records.delete(k);for(const [k,v] of batch.set)this.records.set(k,v);}
 }
 const host=(repo:Repo)=>new MetaHost(repo,defaultEnv({now:()=>NOW,seed:()=>123}),{fresh:'new',schedule:()=>{}});
 it('writes a ticket and sigil atomically; revision sync preserves it, refresh forfeits once',async()=>{
  const repo=new Repo(),a=host(repo);
  expect((await a.execute({type:'planRegionalBattle',args:{kind:'citadel'}})).result.ok).toBe(true);
  let disk=recordsToSave(repo.records);expect(disk.pendingBattle?.mode).toBe('regional');expect(disk.regional!.sigils).toBe(5);
  const restarted=host(repo);expect((await restarted.load({preservePendingBattle:true})).save.pendingBattle?.mode).toBe('regional');
  await restarted.load();disk=recordsToSave(repo.records);expect(disk.pendingBattle).toBeNull();expect(disk.regional!.history).toHaveLength(1);expect(disk.regional!.sigils).toBe(5);
  await host(repo).load();expect(recordsToSave(repo.records).regional!.history).toHaveLength(1);
 });
 it('serializes concurrent reward claims and persists permanent fuel across restart',async()=>{
  const repo=new Repo(),s=fixture();s.regional!.vp=150;repo.records=saveToRecords(s);const a=host(repo);
  const results=await Promise.all([a.execute({type:'regionalAction',args:{action:'claim',index:0}}),a.execute({type:'regionalAction',args:{action:'claim',index:0}})]);
  expect(results.filter(r=>r.result.ok)).toHaveLength(1);expect(recordsToSave(repo.records).regional!.burningSouls).toBe(5);
  const loaded=(await host(repo).load()).save;expect(loaded.regional!.claimed).toEqual([0]);expect(loaded.regional!.burningSouls).toBe(5);
 });
 it('rejects stale selected citadel opponents without consuming sigils',()=>{
  const s=fixture(),before=structuredClone(s);expect(planRegional(s,{kind:'citadel',opponentId:'stale'},NOW,1).ok).toBe(false);expect(s).toEqual(before);
 });
 it('can inspect enemies with an incompatible team and no entry currency, without mutating the save',()=>{
  const s=fixture(),bad=TROOPS.find(t=>!regionLegal({templateId:String(t.id),troopTypes:t.troopTypes},s.regional!.week))!;
  s.collection[bad.id]={level:20,ascension:3,copies:0,traits:[true,true,true],locked:false};s.teams[0]!.members[0]={kind:'troop',troopId:bad.id};s.regional!.sigils=0;
  const before=structuredClone(s);expect(planRegional(s,{kind:'citadel'},NOW,1).ok).toBe(false);const preview=previewRegionalBattle(s,{kind:'citadel'},NOW);expect(preview.ok).toBe(true);expect(s).toEqual(before);
 });
});


describe('multi-region atlas and shared progression',()=>{
 function squad(s:MetaSave,region:RegionId,now:number){
  const ids=TROOPS.filter(t=>regionLegal({templateId:String(t.id),troopTypes:t.troopTypes},weekStartOf(now),region)&&!t.troopTypes.includes('Immortal')&&t.rarityIdx>=3).slice(0,4).map(t=>t.id);
  expect(ids).toHaveLength(4);
  s.teams[0]!.members=ids.map(troopId=>({kind:'troop',troopId}));
  for(const id of ids)s.collection[id]={level:20,ascension:3,copies:0,traits:[true,true,true],locked:false};
 }
 it('keeps central open, rotates exactly two regions and eventually opens every region',()=>{
  const seen=new Set<string>(),week=weekStartOf(NOW);
  for(let i=0;i<9;i++){
   const current=week+i*WEEK_MS,open=activeRegions(current);
   expect(open).toHaveLength(3);expect(new Set(open).size).toBe(3);expect(open[0]).toBe('CentralSpire');
   for(const id of open)seen.add(id);
   for(const r of REGIONS){const next=nextRegionWeek(r.id,current);expect(next).toBeGreaterThanOrEqual(current);expect(regionOpen(r.id,next)).toBe(true);}
  }
  expect(seen.size).toBe(10);
 });
 it.each(REGIONS.map(r=>[r.id] as const))('%s builds legal mature NPCs and valid battle requests for every rule',region=>{
  const s=fixture();const seen=new Set<string>();
  for(let i=0;i<36;i++){
   const now=NOW+i*WEEK_MS,week=weekStartOf(now);if(!regionOpen(region,week))continue;
   const key=JSON.stringify(regionalRule(week,region).restriction);if(seen.has(key))continue;seen.add(key);
   squad(s,region,now);expect(regionalAction(s,{action:'sync',region},now).ok).toBe(true);
   for(const o of s.regional!.regions[region].opponents){
    expect(o.team).toHaveLength(4);expect(new Set(o.team.map(c=>c.templateId)).size).toBe(4);
    expect(o.team.every(c=>regionLegal(c,week,region))).toBe(true);
    expect(o.team.filter(c=>c.troopTypes?.includes('Immortal')).length).toBeLessThanOrEqual(1);
    const p=planRegional(s,{region,kind:'duel',opponentId:o.id},now,1);
    if(!p.ok)throw new Error(`${region} ${key}: ${p.message}`);
    expect(p.request.region).toBe(region);expect(p.context.region).toBe(region);
    expect(p.request.enemyTeam).toEqual(previewRegionalEnemy(o,now,region));
    if(region==='CentralSpire')expect(p.request.rules?.board).toBeUndefined();
   }
   s.regional!.regions[region].citadel.stage=4;
   for(const args of [{region,kind:'citadel' as const},{region,kind:'monolith' as const,monolith:'wisdom' as const}]){
    const preview=previewRegionalBattle(s,args,now);if(!preview.ok)throw new Error(`${region} ${args.kind}: ${preview.message}`);
    expect(preview.request.region).toBe(region);expect(preview.request.enemyTeam).toHaveLength(4);
   }
  }
  expect(seen.size).toBe(new Set(REGIONS.find(r=>r.id===region)!.rules.map(r=>JSON.stringify(r))).size);
 });
 it('checks hero weapon colors, kingdom and own-region immortal exemptions',()=>{
  const week=weekStartOf(NOW),colorRule=regionalRule(week,'Aidania').restriction;
  if(colorRule.kind!=='color')throw new Error('color fixture');
  expect(regionLegal({templateId:'hero',troopTypes:[],manaColors:[colorRule.color]},week,'Aidania')).toBe(true);
  expect(regionLegal({templateId:'hero',troopTypes:[],manaColors:[]},week,'Aidania')).toBe(false);
  expect(regionLegal({templateId:'hero',troopTypes:[]},week,'CentralSpire')).toBe(true);
  expect(regionLegal({templateId:'7580',troopTypes:[],manaColors:[]},week,'Aidania')).toBe(true);
  expect(regionLegal({templateId:'7581',troopTypes:[],manaColors:[]},week,'Aidania')).toBe(false);
  const r=REGIONS.find(r=>r.id==='AncientKhet')!;
  for(let i=0;i<4;i++){const w=week+i*WEEK_MS,rule=regionalRule(w,r.id).restriction;if(rule.kind==='kingdom'){
   expect(regionLegal({templateId:'fixture',troopTypes:[],kingdom:rule.kingdom},w,r.id)).toBe(true);
   expect(regionLegal({templateId:'fixture',troopTypes:[],kingdom:'elsewhere'},w,r.id)).toBe(false);
  }}
 });
 it('rejects unknown or closed regions and cross-region opponent IDs without charging',()=>{
  const s=fixture(),closed=REGIONS.find(r=>!regionOpen(r.id,weekStartOf(NOW)))!.id;
  for(const region of [closed,'InvalidRegion' as RegionId]){
   expect(regionalAction(s,{action:'sync',region},NOW).ok).toBe(false);
   expect(planRegional(s,{kind:'citadel',region},NOW,1).ok).toBe(false);
  }
  regionalAction(s,{action:'sync',region:'CentralSpire'},NOW);
  const before=structuredClone(s);
  expect(planRegional(s,{kind:'citadel',region:'CentralSpire',opponentId:s.regional!.regions.WintersReach.opponents[0]!.id},NOW,1).ok).toBe(false);
  expect(s).toEqual(before);
 });
 it('settles to the ticket region, retains other opponents and shares energy and weekly claims',()=>{
  const s=fixture();regionalAction(s,{action:'sync',region:'CentralSpire'},NOW);
  const central=structuredClone(s.regional!.regions.CentralSpire),p=duel(s);
  settleRegional(s,victory('winter'),p.context,NOW);
  expect(s.regional!.regions.CentralSpire).toEqual(central);
  expect(s.regional!.regions.WintersReach.wins).toBe(1);
  const p2=planRegional(s,{region:'CentralSpire',kind:'duel',opponentId:central.opponents[0]!.id},NOW,1);
  if(!p2.ok)throw new Error(p2.message);settleRegional(s,victory('central'),p2.context,NOW);
  expect(s.regional!.duelWins).toBe(2);expect(s.regional!.energy).toBe(7);
  expect(s.regional!.history.map(h=>h.region)).toEqual(['CentralSpire','WintersReach']);
  s.regional!.vp=150;expect(regionalAction(s,{action:'claim',index:0},NOW).ok).toBe(true);
  expect(regionalAction(s,{action:'claim',index:0},NOW).ok).toBe(false);
 });
 it('shares sigils and caps guardian fuel across regions, while tracking separate citadels',()=>{
  const s=fixture();
  for(let i=0;i<6;i++){
   const region:RegionId=i%2?'CentralSpire':'WintersReach';
   s.regional!.regions[region].citadel.stage=4;
   const p=planRegional(s,{region,kind:'citadel'},NOW,1);if(!p.ok)throw new Error(p.message);
   settleRegional(s,victory(`guardian-${i}`),p.context,NOW);
  }
  expect(s.regional!.sigils).toBe(0);expect(s.regional!.guardianWins).toBe(6);expect(s.regional!.burningSouls).toBe(15);
  expect(s.regional!.regions.CentralSpire.citadel.cycles).toBe(3);expect(s.regional!.regions.WintersReach.citadel.cycles).toBe(3);
  expect(planRegional(s,{region:'CentralSpire',kind:'citadel'},NOW,1).ok).toBe(false);
 });
 it('migrates legacy winter progress, claims, fuel and tickets without resetting the shared cap',()=>{
  const s=fixture(),p=duel(s),raw={...s.regional!,revision:1,...s.regional!.regions.WintersReach,regions:undefined,guardianWins:undefined,burningSouls:11,claimed:[0],citadel:{stage:3,cycles:4,best:4}};
  s.regional=hydrateRegionalState(raw);
  expect(s.regional.revision).toBe(REGION_REVISION);expect(s.regional.guardianWins).toBe(4);expect(s.regional.burningSouls).toBe(11);expect(s.regional.claimed).toEqual([0]);
  expect(s.regional.regions.WintersReach.citadel.stage).toBe(3);expect(s.regional.regions.WintersReach.opponents).toEqual([]);
  expect(s.regional.regions.CentralSpire.wins).toBe(0);
  const context={...p.context,revision:1,region:undefined};settleRegional(s,victory(),context,NOW);
  expect(s.regional.regions.WintersReach.wins).toBe(1);
  expect(hydrateRegionalState(JSON.parse(JSON.stringify(s.regional)))).toEqual(s.regional);
 });
 it('keeps unexpired buffs on weekly reset and does not invalidate new-week opponents for an old ticket',()=>{
  const s=fixture(),p=duel(s);s.regional!.monoliths.vigor={level:2,expires:NOW+2*WEEK_MS};
  const next=NOW+WEEK_MS;ensureRegional(s,next);buildRegionalOpponents(s,next,[],'CentralSpire');
  const before=structuredClone(s.regional!.regions.CentralSpire);
  settleRegional(s,victory(),p.context,next);
  expect(s.regional!.regions.CentralSpire).toEqual(before);expect(s.regional!.vp).toBe(0);
  expect(s.regional!.monoliths.vigor.level).toBe(2);
 });
});


describe('battle map payout integration', () => {
 it.each([
   ['win-drop', 0, 'player', undefined, 1],
   ['win-skill-and-drop', 1, 'player', undefined, 2],
   ['win-cap', 99, 'player', undefined, 2],
   ['defeat-skills', 99, 'enemy', undefined, 2],
   ['defeat-no-drop', 0, 'enemy', undefined, 0],
   ['surrender', 99, 'enemy', 'surrender', 0],
 ] as const)('%s', (_name, maps, winner, endReason, expected) => {
  const requestId = Array.from({ length: 10000 }, (_, i) => `map-integration-${i}`).find(requestId => battleMapDrop({ requestId, winner: 'player' }) === 1)!;
  expect(requestId).toBeTruthy();
  const r: BattleResult = { schemaVersion: 1, rulesetVersion: '1.1.0', battleId: 'map-integration', requestId, seed: 1,
    winner, endReason, turns: 1, combatants: [], defeatedExternalIds: [], summonedCount: 0,
    actionLogDigest: '', eventSummary: [], economy: { gold: 0, souls: 0, gems: 0, maps } };

  const s = fixture(), p = duel(s), before = s.materials.treasureMaps;
  const detail = settleRegional(s, r, p.context, NOW);
  expect(s.materials.treasureMaps - before).toBe(expected);
  expect(detail.lines.reduce((sum, l) => sum + (l.mats?.treasureMaps ?? 0), 0)).toBe(expected);
 });
});
