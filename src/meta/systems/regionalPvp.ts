import { resolveBattleMaps } from './battleMaps';
import { getTroopById } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import { levelCapFor } from '../data/economy';
import { rollPvpGlory } from '../data/pvpGlory';
import { REGION_ID, REGION_UNLOCK_LEVEL, REGION_TIERS, REGION_DUEL_SCALING, REGION_REWARDS, MONOLITHS, MONOLITH_LEVELS, regionDefinition, isRegionId, type RegionId } from '../data/regionalPvp';
import { freshRegionalState, type RegionalState, type RegionalBattleContext, type RegionOpponent, type RegionBattleKind, type RegionTier, type MonolithId } from '../state/regional';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION, type BattleRequest, type BattleResult, type CombatantSnapshot } from '../../session/contract';
import { STAT_LIMITS, validateBattleRequest } from '../../session/validateRequest';
import { knownTroopTypes } from '../../data/troops';
import { buildMetaRegistry, buildPlayerSnapshots, enemyToSnapshot, metaKnownTraitIds } from './battleBridge';
import { buildAdaptiveDefense } from '../data/opponentTeams';
import { fnv1a32 } from '../data/hash';
import { weekStartOf, todayStartOf } from '../gateway/clock';
import { WEEK_MS } from '../data/events';
import { usableEntry, mirrorFromEntry, mirrorEnemyTeam, type MirrorPoolEntry } from './invasionMirrors';
import { grantBattleRewards } from './battleRewards';
import { earn, earnMaterials } from './wallet';
import type { SettlementDetail } from './settlement';
import { equippedBannerOf } from './banners';
import { BANNERS } from '../data/banners';

export type RegionalAction = { action: 'sync' | 'refresh'; region?:RegionId } | { action:'claim'; index:number };
export interface RegionalPlanArgs { region?:RegionId; kind: RegionBattleKind; opponentId?: string; monolith?: MonolithId }
export const HOME_IMMORTALS = [7581,7651,7860];
const HOUR=3600000;
export function regionalState(save: MetaSave): RegionalState { return save.regional ?? freshRegionalState(); }
export function regionalProgress(save:MetaSave,region:RegionId=REGION_ID) {return regionalState(save).regions[region];}
const ROTATION:readonly RegionId[]=['WintersReach','Aidania','AncientKhet','Southwild','BayOfStars','Geheron','MarajiExpanse','SummerIsle','BrokenLands'];
const ROTATION_EPOCH=Date.UTC(2026,8,27,16);
export function activeRegions(week:number):RegionId[] {
 const index=((Math.floor((week-ROTATION_EPOCH)/WEEK_MS)*2)%ROTATION.length+ROTATION.length)%ROTATION.length;
 return ['CentralSpire',ROTATION[index]!,ROTATION[(index+1)%ROTATION.length]!];
}
export function regionOpen(region:RegionId,week:number):boolean {return activeRegions(week).includes(region);}
export function nextRegionWeek(region:RegionId,week:number):number {
 for(let offset=0;offset<=ROTATION.length;offset++)if(regionOpen(region,week+offset*WEEK_MS))return week+offset*WEEK_MS;
 return week;
}
export function regionalRule(week:number,region:RegionId=REGION_ID) {
 const def=regionDefinition(region)!,index=Math.abs(Math.floor(week/WEEK_MS));
 const rule=def.rules[index%def.rules.length]!;
 const name=rule.kind==='none'?'自由配队':rule.kind==='color'?`${rule.name}色部队与武器`:rule.kind==='type'?rule.name:rule.kingdom;
 return {restriction:rule,name,gem:def.gems.length?def.gems[index%def.gems.length]!:null};
}
export function regionalFrenzy(now:number,region:RegionId=REGION_ID):boolean {
 if(region==='CentralSpire'||!regionOpen(region,weekStartOf(now)))return false;
 const featured=activeRegions(weekStartOf(now)).slice(1);
 return featured[Math.abs(Math.floor(todayStartOf(now)/86400000))%featured.length]===region;
}
type RegionalMember=Pick<CombatantSnapshot,'templateId'|'troopTypes'> & Partial<Pick<CombatantSnapshot,'manaColors'|'kingdom'>>;
export function regionLegal(c:RegionalMember,week:number,region:RegionId=REGION_ID):boolean {
 const def=regionDefinition(region);if(!def)return false;
 if(def.homes.includes(Number(c.templateId)))return true;
 const r=regionalRule(week,region).restriction,t=getTroopById(Number(c.templateId));
 if(r.kind==='none')return true;
 if(r.kind==='color')return (c.manaColors??t?.manaColors??[]).includes(r.color);
 if(r.kind==='kingdom')return (c.kingdom??t?.kingdom)===r.kingdom;
 return (c.troopTypes??t?.troopTypes??[]).includes(r.type);
}
export function regionalTeamIssue(save:MetaSave,week:number,region:RegionId=REGION_ID):string|null {
 const built=buildPlayerSnapshots(save);if(!built.ok)return built.message;
 const bad=built.playerTeam.filter(c=>!regionLegal(c,week,region));
 return bad.length?`本周限定${regionalRule(week,region).name}：${bad.map(c=>c.name).join('、')}不符合规则`:null;
}
export function ensureRegional(save: MetaSave, now: number): RegionalState {
  const old=save.regional ?? freshRegionalState(), week=weekStartOf(now), day=todayStartOf(now);
  if(old.week!==week) {
    save.regional={...freshRegionalState(),week, burningSouls:old.burningSouls,energy:old.energy, day:old.day,sigils:old.sigils,history:old.history,recent:old.recent,monoliths:old.monoliths};
  } else save.regional=old;
  const s=save.regional;
  if(s.day<day) {s.day=day;s.sigils=6;}
  for(const buff of Object.values(s.monoliths)) if(buff.expires<=now) {buff.level=0;buff.expires=0;}
  return s;
}
function boost(team: CombatantSnapshot[], factors:CombatantSnapshot['stats'], frenzy:boolean, cycle=0): CombatantSnapshot[] {
  return team.map(c=>({...structuredClone(c),stats:Object.fromEntries(Object.entries(c.stats).map(([k,v])=>{
    const key=k as keyof CombatantSnapshot['stats'];
    return [key,Math.min(STAT_LIMITS[key].max,Math.ceil(v*factors[key]*(frenzy?1.5:1)*(1+Math.min(cycle,20)*.1)))];
  })) as CombatantSnapshot['stats']}));
}
function npcTeam(week:number, seed:number, region:RegionId): CombatantSnapshot[] {
  const draft=buildAdaptiveDefense(seed,9,30,{ rarityWeights:[0,0,1,3,8,6],sampleSize:64,jitter:2,exploration:.03,requireManaSupport:true },t=>regionLegal({templateId:String(t.id),troopTypes:t.troopTypes,manaColors:t.manaColors,kingdom:t.kingdom??undefined},week,region));
  return draft.troops.map((id,i)=>{
    const t=getTroopById(id)!,level=levelCapFor(t.rarityIdx,3), stats=troopStatsAtLevel(t,level);
    const c=enemyToSnapshot(t,{troopId:id,level,tier:'elite',traitCount:3},i);
    c.stats={hp:stats.health+11,armor:stats.armor+11,attack:stats.attack+10,magic:stats.magic+10};
    return c;
  });
}
export function buildRegionalOpponents(save: MetaSave, now:number, pool:readonly MirrorPoolEntry[]=[],region:RegionId=REGION_ID): RegionOpponent[] {
  const s=ensureRegional(save,now),p=s.regions[region],used=new Set<string>();
  const valid=pool.filter(e=>usableEntry(e,now)&&e.team.every(c=>regionLegal(c,s.week,region))&&!s.recent.includes(e.ownerKey)
    &&e.team.reduce((n,c)=>n+c.stats.hp+c.stats.armor,0)>=240);
  p.opponents=([0,1,2] as const).map(tier=>{
    const seed=fnv1a32(`${region}:${s.week}:${p.refresh}:${tier}`);
    const choices=valid.filter(e=>!used.has(e.ownerKey));
    const entry=choices.length ? choices[seed%choices.length] : undefined;
    if(entry) used.add(entry.ownerKey);
    const mirror=entry ? mirrorFromEntry(entry,(['easy','normal','hard'] as const)[tier],`-${region}-${p.refresh}`) : undefined;
    const team=mirror ? mirrorEnemyTeam(mirror) : npcTeam(s.week,seed,region);
    return {id:`${region}-${s.week}-${p.refresh}-${tier}`,name:mirror?.name ?? `${regionDefinition(region)!.name} · ${['守备军','远征军','禁卫军'][tier]}`,tier,
      team, ...(mirror?{mirror}:{}), strategy:mirror?'指挥官防守镜像':'区域守卫 · 成熟养成与完整特质',gold:REGION_TIERS[tier].gold,vp:REGION_TIERS[tier].vp};
  });
  return p.opponents;
}
export function previewRegionalEnemy(opponent:RegionOpponent, now:number,region:RegionId=REGION_ID):CombatantSnapshot[] {return boost(opponent.team,REGION_DUEL_SCALING[opponent.tier],regionalFrenzy(now,region));}
export function regionalAction(save:MetaSave,args:RegionalAction,now:number,pool:readonly MirrorPoolEntry[]=[]):{ok:true}|MetaFailure {
  if(save.hero.level<REGION_UNLOCK_LEVEL) return fail('PREREQ_LOCKED',`永生战域在主角 ${REGION_UNLOCK_LEVEL} 级开放`);
  if(!args || typeof args !== 'object') return fail('INVALID','未知区域操作');
  const s=ensureRegional(save,now);
  if(args.action==='claim') {
    const reward=REGION_REWARDS[args.index];
    if(!Number.isInteger(args.index)||!reward) return fail('INVALID','奖励不存在');
    if(s.claimed.includes(args.index)) return fail('ALREADY_UNLOCKED','本周奖励已领取');
    if(s.vp<reward.vp||s.guardianWins<reward.cycles) return fail('PREREQ_LOCKED','区域积分或城塞挑战尚未达成');
    earn(save,{gold:reward.gold,gems:reward.gems,souls:reward.souls});
    s.burningSouls+=reward.burning;s.claimed.push(args.index);return {ok:true};
  }
  if(args.action!=='sync'&&args.action!=='refresh') return fail('INVALID','未知区域操作');
  const region=args.region??REGION_ID;
  if(!isRegionId(region))return fail('INVALID','区域不存在');
  if(!regionOpen(region,s.week))return fail('PREREQ_LOCKED','该战区本周休整，请选择开放战区');
  const p=s.regions[region];
  if(args.action==='refresh')p.refresh++;
  if(args.action==='refresh'||p.opponents.length!==3)buildRegionalOpponents(save,now,pool,region);
  return {ok:true};
}

export function previewRegionalBattle(save:MetaSave,args:RegionalPlanArgs,now:number) {
  return prepareRegional(structuredClone(save),args,now,0,true);
}
export function planRegional(save:MetaSave,args:RegionalPlanArgs,now:number,seed:number) {
  return prepareRegional(save,args,now,seed,false);
}
function prepareRegional(save:MetaSave,args:RegionalPlanArgs,now:number,seed:number,preview:boolean):{ok:true;request:BattleRequest;context:RegionalBattleContext}|MetaFailure {
  if(save.hero.level<REGION_UNLOCK_LEVEL) return fail('PREREQ_LOCKED',`需要主角 ${REGION_UNLOCK_LEVEL} 级`);
  if(!args || !['duel','citadel','monolith'].includes(args.kind)) return fail('INVALID','未知区域战斗');
  const region=args.region??REGION_ID;
  if(!isRegionId(region))return fail('INVALID','区域不存在');
  const s=ensureRegional(save,now),p=s.regions[region],def=regionDefinition(region)!,built=buildPlayerSnapshots(save);
  if(!regionOpen(region,s.week))return fail('PREREQ_LOCKED','该战区本周休整，请选择开放战区');
  if(!built.ok) return built;
  const issue=regionalTeamIssue(save,s.week,region);if(issue&&!preview) return fail('INVALID',issue);
  if(p.opponents.length!==3) buildRegionalOpponents(save,now,[],region);
  const selected=p.opponents.find(o=>o.id===args.opponentId);
  const monolith=MONOLITHS.find(m=>m.id===args.monolith);
  if((args.kind==='duel'||(args.kind==='citadel'&&p.citadel.stage<4&&args.opponentId!==undefined))&&!selected) return fail('INVALID','对手已变化，请重新选择');
  if(!preview&&args.kind==='citadel'&&s.sigils<1) return fail('INSUFFICIENT','今日城塞符印已用完');
  if(args.kind==='monolith'&&(!monolith||(!preview&&s.energy<1))) return fail('INSUFFICIENT','选择巨石碑并准备至少 1 点碑能');
  const step=args.kind==='monolith'?s.monoliths[monolith!.id].level:args.kind==='citadel'?p.citadel.stage:0;
  if(args.kind==='monolith'&&step>=5) return fail('MAXED','此巨石碑已达到最高阶');
  const guardian=args.kind==='citadel'&&step===4;
  const tier:RegionTier=args.kind==='duel'?selected!.tier:args.kind==='citadel'?(guardian?2:selected?.tier??2):Math.min(2,Math.floor(step/2)) as RegionTier;
  const opponent:RegionOpponent=structuredClone(selected && (args.kind==='duel'||(args.kind==='citadel'&&!guardian))?selected : p.opponents[tier]!);
  if(args.kind==='monolith'||guardian) {
    opponent.team=npcTeam(s.week,fnv1a32(`${region}:${s.week}:${args.kind}:${step}:${p.citadel.cycles}:${args.monolith??''}`),region);
    delete opponent.mirror;
    opponent.name=args.kind==='monolith'?`${monolith!.name}守卫`:guardian?`${def.name}守护者`:'城塞守军';
    opponent.tier=tier;
  }
  if(guardian&&region==='WintersReach') {
    const t=getTroopById(6338)!,c=enemyToSnapshot(t,{troopId:t.id,level:30,tier:'boss',traitCount:3},0),stats=troopStatsAtLevel(t,30);
    c.stats={hp:stats.health+11,armor:stats.armor+11,attack:stats.attack+10,magic:stats.magic+10};opponent.team[0]=c;
  }
  if(args.kind==='citadel'&&!guardian&&!selected){
    opponent.team=npcTeam(s.week,fnv1a32(`${region}:${s.week}:citadel:${step}:${p.citadel.cycles}`),region);delete opponent.mirror;opponent.name='城塞守军';
  }
  const frenzy=args.kind!=='monolith'&&regionalFrenzy(now,region);
  const factors=args.kind==='duel'?REGION_DUEL_SCALING[tier]:REGION_TIERS[tier];
  let enemy=boost(opponent.team,factors,frenzy,args.kind==='citadel'?p.citadel.cycles:0);
  if(args.kind==='monolith') enemy=opponent.team.map((c,i)=>enemyToSnapshot(getTroopById(Number(c.templateId))!,{troopId:Number(c.templateId),level:MONOLITH_LEVELS[step]!,tier:'elite',traitCount:3},i));
  const player=structuredClone(built.playerTeam);
  if(args.kind!=='monolith') for(const def of MONOLITHS) {
    const b=s.monoliths[def.id];
    if(b.expires>now) for(const c of player)c.stats[def.stat]=Math.min(STAT_LIMITS[def.stat].max,Math.ceil(c.stats[def.stat]*(1+b.level*.1)));
  }
  const special=regionalRule(s.week,region).gem;
  const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,
    battleId:`${region}-${now}-${save.revision}`,requestId:`${region}-${now}-${save.revision}-${seed>>>0}`,seed:seed>>>0,
    playerTeam:player,enemyTeam:enemy,region,...(args.kind!=='monolith'?{mode:'pvp' as const}:{}),
    ...(special?{rules:{board:{preset:[{gem:special.gem,count:3}],specialDrops:{chance:.05,pool:[{gem:special.gem,weight:1}]}}}}:{})};
  const banner=equippedBannerOf(save,built.team);if(banner)request.playerBanner={boosts:{...banner.boosts}};
  const enemyBanner=opponent.mirror?.bannerKingdom ? BANNERS[opponent.mirror.bannerKingdom] : null;
  if(enemyBanner)request.enemyBanner={boosts:{...enemyBanner.boosts}};
  const registry=buildMetaRegistry([...player,...enemy].map(c=>String(c.skillId)));
  const check=validateBattleRequest(request,{knownSkillIds:new Set([...registry.skills.keys(),...registry.prototypes.keys()]),knownTraitIds:metaKnownTraitIds(),knownTroopTypes:knownTroopTypes()});
  if(!check.ok)return fail('INVALID',`区域战斗校验失败：${check.issues[0]?.message??''}`);
  const gold=args.kind==='monolith'?400:guardian?5000:REGION_TIERS[tier].gold;
  const vp=args.kind==='monolith'?0:(guardian?100:REGION_TIERS[tier].vp)*(frenzy?2:1);
  const context:RegionalBattleContext={region,week:s.week,revision:s.revision,kind:args.kind,tier,opponent,frenzy,step,
    ...(monolith?{monolith:monolith.id}:{}),reward:{gold,souls:guardian?600:args.kind==='monolith'?100:300,glory:rollPvpGlory(tier, request.requestId, guardian?6:2)},vp,burning:guardian&&s.guardianWins<5?3:0};
  if(!preview){if(args.kind==='monolith')s.energy--;if(args.kind==='citadel')s.sigils--;}
  return {ok:true,request,context};
}
export function settleRegional(save:MetaSave,result:BattleResult,c:RegionalBattleContext,now:number):SettlementDetail {
  const s=ensureRegional(save,now),region=c.region??REGION_ID,p=s.regions[region],win=result.winner==='player',current=!!p&&c.week===s.week&&(c.revision===s.revision||(c.revision===1&&!c.region));
  const base=grantBattleRewards(save,result);
  const detail:SettlementDetail={victory:win,lines:[{key:win?'victory':'defeat',label:win?'战斗胜利':'战斗结束',deltas:{gold:base.gold,souls:base.souls}}],xpGained:base.xpGained,heroLevelsGained:base.heroLevelsGained,classLevelUp:base.classLevelUp,classUnlocked:null,questProgress:null,troopRewards:[],firstWinClaimed:false};
  if(result.endReason!=='surrender') {
    const n=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.floor(v)):0;
    const collected={gold:n(result.economy?.gold),souls:n(result.economy?.souls),gems:n(result.economy?.gems)};
    const maps=resolveBattleMaps(result).total;
    earn(save,collected);earnMaterials(save,{treasureMaps:maps});
    detail.lines.push({key:'battle-collect',label:'战斗收集',deltas:collected,mats:{treasureMaps:maps}});
  }
  if(win) {
    const reward={...c.reward,gold:Math.max(0,(c.reward.gold??0)-base.gold),souls:Math.max(0,(c.reward.souls??0)-base.souls)};
    earn(save,reward);detail.lines.push({key:'battle-bonus',label:c.opponent.name,deltas:reward});
    if(current){s.vp+=c.vp;s.wins++;p.vp+=c.vp;p.wins++;if(c.kind==='duel'){s.duelWins++;if(s.duelWins%2===0)s.energy=Math.min(10,s.energy+1);}}
  }
  if(current&&c.kind==='monolith'&&win&&c.monolith){const b=s.monoliths[c.monolith];b.level=Math.min(5,c.step+1);b.expires=Math.max(now,b.expires)+HOUR;}
  if(current&&c.kind==='citadel') {
    if(c.step===4){if(win){p.citadel.cycles++;s.guardianWins++;p.citadel.best=Math.max(p.citadel.best,p.citadel.cycles);}p.citadel.stage=0;}
    else if(win)p.citadel.stage=Math.min(4,p.citadel.stage+1);
  }
  if(current&&win&&c.burning&&s.guardianWins<=5){s.burningSouls+=c.burning;detail.burningSouls=c.burning;}
  if(c.opponent.mirror?.player){s.recent.push(c.opponent.mirror.player.ownerKey);s.recent=s.recent.slice(-12);}
  s.history.unshift({region,id:result.requestId,name:c.opponent.name,kind:c.kind,victory:win,vp:current&&win?c.vp:0,at:now});s.history=s.history.slice(0,30);
  if(current&&c.kind!=='monolith'){p.refresh++;p.opponents=[];}
  detail.lines.push({key:'event-progress',label:current?`区域积分 +${win?c.vp:0}`:'上周战斗 · 不计入本周进度',deltas:{}});
  return detail;
}
