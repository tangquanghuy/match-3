import {restoreBattleEconomyAudit} from '../engine/battleEconomyLedger';
import type {CombatantSnapshot} from '../session/contract';
import {buildStBattleReport} from './battleReport';
import type {StBattleReport} from './battleReport';
import type {HostSnapshot,StHostAdapter} from './hostAdapter';
import {stableJson} from './json';
import {chatKey} from './save';
import {storyInitialHp} from './storyHp';
import type {ChatBinding,SettlementReceipt} from './save';

export interface StoryWritebackActor {externalId:string;path:string;current:number;max:number;temp:number}
export interface StoryWritebackOrigin {
 chat:ChatBinding;messageId:number;swipeId:number;fingerprint:string;saveId?:string;
 actors:StoryWritebackActor[];
}
export interface StoryWritebackRecord {
 version:1;chat:ChatBinding;messageId:number;swipeId:number;saveId?:string;
 battleId:string;requestId:string;resultDigest:string;
 actors:(StoryWritebackActor&{nextCurrent:number})[];
 result:SettlementReceipt['result'];report:StBattleReport;
}
export interface StoryWritebackResult {status:'applied'|'already-applied';record:StoryWritebackRecord;snapshot:HostSnapshot}
/** Removed MVU field: earlier versions copied every story result into stat_data. */
const LEGACY_STORY_RESULTS_FIELD='三消战果';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
const nonempty=(v:unknown):v is string=>typeof v==='string'&&!!v.trim();
const escapePointer=(key:string):string=>key.replace(/~/g,'~0').replace(/\//g,'~1');
function actorAt(statData:Record<string,unknown>,path:string):Record<string,unknown> {
 if(typeof path!=='string')throw new Error('剧情成员路径有误');
 let keys:string[];
 if(path==='/人物')keys=['人物'];
 else {
   const parts=path.split('/');
   if(parts.length!==3||parts[0]!==''||parts[1]!=='羁绊列表'||!parts[2]||/~(?![01])/.test(parts[2]))throw new Error('剧情成员必须使用准备模块的 JSON pointer 路径');
   const name=parts[2].replace(/~1/g,'/').replace(/~0/g,'~');
   if(`/羁绊列表/${escapePointer(name)}`!==path)throw new Error('剧情成员路径编码有误');
   keys=['羁绊列表',name];
 }
 let node:unknown=statData;
 for(const key of keys){if(!object(node)||!Object.hasOwn(node,key))throw new Error('剧情参战角色已不存在：'+path);node=node[key];}
 if(!object(node))throw new Error('剧情参战角色格式有误：'+path);
 return node;
}
function actorOrigin(statData:Record<string,unknown>,path:string):StoryWritebackActor {
 const actor=actorAt(statData,path);const current=actor['当前生命值'];const max=actor['生命值上限'];const temp=actor['临时生命值']===undefined?0:actor['临时生命值'];
 if(!integer(current)||!integer(max,1)||current>max||!integer(temp))throw new Error('剧情角色生命值格式有误：'+path);
 if(temp!==0)throw new Error('当前剧情回写仅支持临时 HP 为零的角色');
 return {externalId:path,path,current,max,temp};
}
/** Validate a JSON-restored origin against its own frozen variable snapshot. Never reads the live host. */
export function validateStoryWritebackOrigin(value:unknown):StoryWritebackOrigin {
 if(!object(value)||Object.keys(value).some(k=>!['chat','messageId','swipeId','fingerprint','saveId','actors'].includes(k))||!integer(value.messageId)||!integer(value.swipeId)||!nonempty(value.fingerprint)||!Array.isArray(value.actors)||value.actors.length<1||value.actors.length>4||(value.saveId!==undefined&&!nonempty(value.saveId)))throw new Error('剧情回写原始快照格式有误');
 const origin=value as unknown as StoryWritebackOrigin;chatKey(origin.chat);
 if(Object.keys(origin.chat).some(k=>!['hostId','characterId','chatId'].includes(k)))throw new Error('剧情聊天绑定字段有误');
 let frozen:unknown;try {frozen=JSON.parse(origin.fingerprint);}catch {throw new Error('剧情回写变量指纹有误');}
 if(!object(frozen)||stableJson(frozen)!==origin.fingerprint)throw new Error('剧情回写变量指纹有误');
 const ids=new Set<string>();
 for(const actor of origin.actors){
   if(!object(actor)||Object.keys(actor).some(k=>!['externalId','path','current','max','temp'].includes(k))||!nonempty(actor.path)||actor.externalId!==actor.path||ids.has(actor.path)||stableJson(actorOrigin(frozen,actor.path))!==stableJson(actor))throw new Error('剧情回写成员与冻结快照不一致或重复');
   ids.add(actor.path);
 }
 return structuredClone(origin);
}
/** Capture this before beginning the story and persist it with the pending ticket / outcome. */
export function captureStoryWritebackOrigin(snapshot:HostSnapshot,playerTeam:readonly CombatantSnapshot[]):StoryWritebackOrigin {
 if(stableJson(snapshot.statData)!==snapshot.fingerprint)throw new Error('剧情原始变量与指纹不一致');
 const origin=validateStoryWritebackOrigin({chat:structuredClone(snapshot.chat),messageId:snapshot.messageId,swipeId:snapshot.swipeId,fingerprint:snapshot.fingerprint,...(snapshot.saveId?{saveId:snapshot.saveId}:{}),actors:playerTeam.map(p=>actorOrigin(snapshot.statData,p.externalId))});
 validateStoryWritebackParty(origin,playerTeam);
 return origin;
}
export function validateStoryWritebackParty(origin:StoryWritebackOrigin,party:readonly CombatantSnapshot[]):void {
 if(party.length!==origin.actors.length||new Set(party.map(p=>p.externalId)).size!==party.length)throw new Error('剧情回写参战队伍不一致');
 for(const actor of origin.actors){
   const unit=party.find(p=>p.externalId===actor.externalId);
   if(!unit||!integer(unit.stats?.hp,1)||!integer(unit.initialHp??unit.stats.hp)||storyInitialHp(unit.stats.hp,actor.current,actor.max)!==(unit.initialHp??unit.stats.hp))throw new Error('剧情入场 HP 与冻结宿主角色不一致');
 }
}
/** Pure write plan. The actual receipt, rather than a caller supplied result ID, owns idempotence. */
export function buildStoryWritebackRecord(value:StoryWritebackOrigin,receipt:SettlementReceipt):StoryWritebackRecord {
 const origin=validateStoryWritebackOrigin(value);
 if(receipt.kind!=='story')throw new Error('往昔再现战果不写回剧情');
 const {request,result,report}=receipt;
 if(!request||!result||!report||!nonempty(receipt.battleId)||!nonempty(receipt.requestId)||!nonempty(receipt.resultDigest)||receipt.battleId!==request.battleId||receipt.battleId!==result.battleId||receipt.requestId!==request.requestId||receipt.requestId!==result.requestId||receipt.resultDigest!==result.actionLogDigest||receipt.winner!==result.winner||result.seed!==request.seed||result.rulesetVersion!==request.rulesetVersion||result.schemaVersion!==request.schemaVersion||!['player','enemy'].includes(result.winner)||!integer(result.turns))throw new Error('剧情回写收据与原始战斗不一致');
 validateStoryWritebackParty(origin,request.playerTeam);
 if(!Array.isArray(result.combatants)||result.combatants.length!==request.playerTeam.length+request.enemyTeam.length||new Set(result.combatants.map(u=>u.externalId)).size!==result.combatants.length)throw new Error('剧情战果缺少原始参战者');
 if(Object.keys(result).some(k=>!['schemaVersion','battleId','requestId','rulesetVersion','seed','winner','endReason','playerTurns','turns','combatants','defeatedExternalIds','fledExternalIds','summonedCount','economy','economyAudit','actionLogDigest','eventSummary'].includes(k))||!integer(result.seed)||!integer(result.summonedCount)||!Array.isArray(result.eventSummary)||result.eventSummary.some(e=>!object(e)||Object.keys(e).some(k=>!['type','count'].includes(k))||!nonempty(e.type)||!integer(e.count))||(result.playerTurns!==undefined&&!integer(result.playerTurns))||(result.endReason!==undefined&&!['surrender','turn-limit','objective'].includes(result.endReason)))throw new Error('剧情战果字段有误');
 if(result.economy!==undefined&&(!object(result.economy)||!['gold','souls','gems'].every(k=>integer((result.economy as unknown as Record<string,unknown>)[k]))||Object.entries(result.economy).some(([k,v])=>!['gold','souls','gems','maps'].includes(k)||!integer(v))))throw new Error('剧情战场经济格式有误');
 if(result.economyAudit!==undefined){
   const audit=restoreBattleEconomyAudit(result.economyAudit);const economy=result.economy;
   if(!economy||audit.final.leftGold!==economy.gold||audit.final.souls!==economy.souls||audit.final.gems!==economy.gems||audit.final.maps!==(economy.maps??0))throw new Error('剧情战斗资源记录与战果货币不一致');
 }
 for(const unit of result.combatants){
   if(!object(unit)||Object.keys(unit).some(k=>!['externalId','side','hp','maxHp','armor','defeated','fled','statuses'].includes(k))||!nonempty(unit.externalId)||!['player','enemy'].includes(unit.side)||!integer(unit.hp)||!integer(unit.maxHp,1)||unit.hp>unit.maxHp||!integer(unit.armor)||typeof unit.defeated!=='boolean'||(unit.fled!==undefined&&typeof unit.fled!=='boolean')||(unit.defeated&&(unit.hp!==0||unit.fled))||!Array.isArray(unit.statuses)||unit.statuses.some(status=>!object(status)||Object.keys(status).some(k=>!['id','turns'].includes(k))||!nonempty(status.id)||!integer(status.turns)))throw new Error('剧情终局生命状态有误');
 }
 const ids=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(nonempty)&&new Set(value).size===value.length;
 if(!ids(result.defeatedExternalIds)||stableJson([...result.defeatedExternalIds].sort())!==stableJson(result.combatants.filter(u=>u.defeated&&!u.fled).map(u=>u.externalId).sort())||(result.fledExternalIds!==undefined&&(!ids(result.fledExternalIds)||result.fledExternalIds.some(id=>!result.combatants.some(u=>u.externalId===id&&u.fled&&!u.defeated)))))throw new Error('剧情击败或逃离名单与终态不一致');
 const baseline=buildStBattleReport(request,result,[]);
 if(Object.keys(report).some(k=>!['version','battleId','winner','turns','units','defeatedEnemyIds','fallenAllyIds','revivedAllyIds'].includes(k))||!Array.isArray(report.units)||report.units.length!==baseline.units.length||report.version!==1||report.battleId!==baseline.battleId||report.winner!==baseline.winner||report.turns!==baseline.turns)throw new Error('剧情事实战报与收据不一致');
 const cumulative=['fellCount','revivedCount','hpDamage','hpHealing','hpGrowth'] as const;
 for(const [i,unit]of report.units.entries()){
   const expected=baseline.units[i]!;
   if(!object(unit)||Object.keys(unit).some(k=>!Object.hasOwn(expected,k)))throw new Error('剧情事实战报角色字段有误');
   for(const key of Object.keys(expected) as (keyof typeof expected)[])if(!(cumulative as readonly string[]).includes(key)&&unit[key]!==expected[key])throw new Error('剧情事实战报与角色终态不一致');
   for(const key of cumulative)if(!integer(unit[key]))throw new Error('剧情事实战报累计值有误');
   if(unit.revivedCount>unit.fellCount||unit.fellCount<(unit.finallyDefeated?1:0))throw new Error('剧情倒下与复起记录有误');
 }
 for(const [key,ids]of [
   ['defeatedEnemyIds',report.units.filter(u=>u.side==='enemy'&&u.finallyDefeated&&!u.fled).map(u=>u.externalId)],
   ['fallenAllyIds',report.units.filter(u=>u.side==='player'&&u.fellCount>0).map(u=>u.externalId)],
   ['revivedAllyIds',report.units.filter(u=>u.side==='player'&&u.revivedCount>0).map(u=>u.externalId)],
 ] as const)if(stableJson(report[key])!==stableJson(ids))throw new Error('剧情事实名单与战报不一致');
 const actors=origin.actors.map(actor=>{
   const initial=request.playerTeam.find(p=>p.externalId===actor.externalId)!;
   const final=result.combatants.find(p=>p.side==='player'&&p.externalId===actor.externalId)!;
   const unchanged=final.hp*initial.stats.hp===(initial.initialHp??initial.stats.hp)*final.maxHp;
   const nextCurrent=final.hp===0?0:unchanged?actor.current:Math.min(actor.max,Math.max(1,Math.round(actor.max*final.hp/final.maxHp)));
   return {...actor,nextCurrent};
 });
 return structuredClone({version:1,chat:origin.chat,messageId:origin.messageId,swipeId:origin.swipeId,...(origin.saveId?{saveId:origin.saveId}:{}),battleId:receipt.battleId,requestId:receipt.requestId,resultDigest:receipt.resultDigest,actors,result,report});
}
/**
 * Only HP goes into MVU. Battle facts stay in the local save receipt; the chat-level
 * `match3.storyResults` acknowledgement (StoryWritebackAck) prevents a second HP write.
 * A legacy `三消战果` marker left by older versions is dropped in the same write.
 */
export function applyStoryWritebackRecord(statData:Record<string,unknown>,record:StoryWritebackRecord):Record<string,unknown> {
 const next=structuredClone(statData);
 for(const actor of record.actors){
   const {nextCurrent,...before}=actor;
   if(stableJson(actorOrigin(next,actor.path))!==stableJson(before))throw new Error('剧情角色生命状态已变化');
   actorAt(next,actor.path)['当前生命值']=nextCurrent;
 }
 delete next[LEGACY_STORY_RESULTS_FIELD];
 return next;
}
/** True when every actor already carries this battle's resulting HP with unchanged max and temporary HP. */
export function storyWritebackApplied(statData:Record<string,unknown>,record:StoryWritebackRecord):boolean {
 try{
   return record.actors.every(({nextCurrent,...before})=>stableJson(actorOrigin(statData,before.path))===stableJson({...before,current:nextCurrent}));
 }catch{return false;}
}
/** Compact chat-level acknowledgement of one applied story writeback. Not stored in MVU. */
export interface StoryWritebackAck {version:1;battleId:string;requestId:string;resultDigest:string;messageId:number;swipeId:number}
export function storyWritebackAck(record:StoryWritebackRecord):StoryWritebackAck {
 return {version:1,battleId:record.battleId,requestId:record.requestId,resultDigest:record.resultDigest,messageId:record.messageId,swipeId:record.swipeId};
}
/** Older versions mirrored the full record; both shapes carry battleId and resultDigest. */
export function storyWritebackAckMatches(stored:unknown,record:StoryWritebackRecord):boolean {
 return object(stored)&&stored.battleId===record.battleId&&stored.resultDigest===record.resultDigest;
}
/**
 * Temporary test tool: put the pre-battle HP back (from the receipt's frozen origin) and drop a
 * legacy `三消战果` entry for this battle if one exists.
 */
export function revertStoryWriteback(statData:Record<string,unknown>,battleId:string,actors:readonly {path:string;current:number}[]):Record<string,unknown> {
 const next=structuredClone(statData);
 for(const actor of actors){
   if(!nonempty(actor.path)||!integer(actor.current))throw new Error('剧情战果角色记录有误');
   actorAt(next,actor.path)['当前生命值']=actor.current;
 }
 const legacy=next[LEGACY_STORY_RESULTS_FIELD];
 if(object(legacy)&&Object.hasOwn(legacy,battleId)){const rest={...legacy};delete rest[battleId];next[LEGACY_STORY_RESULTS_FIELD]=rest;}
 return next;
}
/** Host calls this only for committed story receipts. Persist origin and receipt until it succeeds. */
export function writebackStory(adapter:StHostAdapter,origin:StoryWritebackOrigin,receipt:SettlementReceipt):Promise<StoryWritebackResult> {
 return adapter.writeStoryResult(origin,receipt);
}
