import {describe,it,expect,vi} from 'vitest';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import {StHostAdapter} from '../../src/sillytavern/hostAdapter';
import type {MvuData,TavernContext,TavernHelpers} from '../../src/sillytavern/hostAdapter';
import {captureStoryWritebackOrigin,validateStoryWritebackOrigin,writebackStory,STORY_RESULTS_FIELD} from '../../src/sillytavern/storyWriteback';
import type {StoryWritebackRecord} from '../../src/sillytavern/storyWriteback';
import {createSave,emptyRoot,recordEncounter,settleSave} from '../../src/sillytavern/save';
import type {SettlementReceipt} from '../../src/sillytavern/save';
import {companionMemberRef} from '../../src/sillytavern/partyPreparation';
import {stableJson} from '../../src/sillytavern/json';

const friendName='甲~/乙';const friendRef=companionMemberRef(friendName);
function unit(externalId:string,hp:number,initialHp:number):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp,attack:10,armor:0,magic:7},initialHp,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'};
}
function receiptFor(request:BattleRequest,result:BattleResult,events:readonly GameEvent[]):SettlementReceipt {
 const save=createSave(emptyRoot(),{hostId:'host',characterId:'avatar:card.png',chatId:'chat-a'},'save');
 return settleSave(save,{kind:'story',encounter:recordEncounter(request,[],'normal','encounter'),request,result,events});
}
function fixture() {
 let chatId='chat-a';let failReads=0;
 const dataByChat:Record<string,MvuData>={
   'chat-a':{stat_data:{人物:{名称:'主角',当前生命值:37,生命值上限:99,临时生命值:0,SP:8},羁绊列表:{[friendName]:{当前生命值:40,生命值上限:40,同行誓约:true,其他:'保留'}},任务:{现状:'保留'}},display_data:{keep:true}},
   'chat-b':{stat_data:{人物:{当前生命值:11,生命值上限:11}}},
 };
 const variablesByChat:Record<string,Record<string,unknown>>={
   'chat-a':{other:{keep:true},match3:{version:1,saveId:'save',chat:{hostId:'host',characterId:'avatar:card.png',chatId:'chat-a'},keep:'保留'}},
   'chat-b':{other:'other-chat'},
 };
 const ctx:TavernContext={characterId:0,characters:[{avatar:'card.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId};
 const get=vi.fn(()=>{if(failReads>0){failReads--;throw new Error('readback failed');}return structuredClone(dataByChat[chatId]!);});
 const replace=vi.fn(async(next:MvuData)=>{dataByChat[chatId]=structuredClone(next);});
 const update=vi.fn((updater:(variables:Record<string,unknown>)=>Record<string,unknown>)=>{variablesByChat[chatId]=updater(structuredClone(variablesByChat[chatId]!));});
 const helpers:TavernHelpers={getContext:()=>ctx,getVariables:()=>structuredClone(variablesByChat[chatId]!),updateVariablesWith:update,Mvu:{getMvuData:get,replaceMvuData:replace}};
 const tails=new Map<string,Promise<unknown>>();
 const requestLock=vi.fn((name:string,work:()=>Promise<unknown>)=>{
   const operation=(tails.get(name)??Promise.resolve()).catch(()=>{}).then(work);tails.set(name,operation.catch(()=>{}));return operation;
 });
 const host={navigator:{locks:{request:requestLock}}} as unknown as Window;
 const adapter=new StHostAdapter(helpers,host,'host');
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'battle',requestId:'request',seed:42,playerTeam:[unit('/人物',7,3),unit(friendRef,80,80)],enemyTeam:[unit('enemy',10,10)]};
 const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner:'player',turns:3,combatants:[{externalId:'/人物',side:'player',hp:1,maxHp:7,armor:0,defeated:false,statuses:[]},{externalId:friendRef,side:'player',hp:0,maxHp:80,armor:0,defeated:true,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:10,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:[friendRef,'enemy'],summonedCount:0,actionLogDigest:'digest',eventSummary:[{type:'defeat',count:3}]};
 const events:GameEvent[]=[{type:'skill-damage',casterId:4,targetId:0,range:'single',damage:3,hpLoss:3,resultingHp:0,resultingArmor:0},{type:'defeat',characterId:0},{type:'buff',targetId:0,stat:'hp',amount:1,revived:true},{type:'defeat',characterId:1},{type:'defeat',characterId:4}];
 const origin=()=>captureStoryWritebackOrigin(adapter.read(),request.playerTeam);
 return {adapter,helpers,host,ctx,get,replace,update,requestLock,request,result,events,origin,
   receipt:()=>receiptFor(request,result,events),
   get data(){return dataByChat['chat-a']!;},get variables(){return variablesByChat['chat-a']!;},
   get hero(){return dataByChat['chat-a']!.stat_data['人物'] as Record<string,unknown>;},
   switchChat:(id:string)=>{chatId=id;},failRead:()=>{failReads=1;},
   setData:(data:MvuData)=>{dataByChat['chat-a']=structuredClone(data);},
   marker:()=>((dataByChat['chat-a']!.stat_data[STORY_RESULTS_FIELD]??{}) as Record<string,StoryWritebackRecord>)['battle'],
   mirror:()=>((variablesByChat['chat-a']!['match3'] as Record<string,unknown>)['storyResults'] as Record<string,StoryWritebackRecord>|undefined)?.['battle'],
 };
}

describe('ST frozen story writeback origin',()=>{
 it('captures JSON-persistable canonical member pointers and validates against the frozen host snapshot',()=>{
   const f=fixture();const snapshot=f.adapter.read();const origin=captureStoryWritebackOrigin(snapshot,f.request.playerTeam);
   expect(origin).toMatchObject({chat:snapshot.chat,messageId:0,swipeId:0,fingerprint:snapshot.fingerprint,saveId:'save',actors:[{externalId:'/人物',path:'/人物',current:37,max:99,temp:0},{externalId:friendRef,path:friendRef,current:40,max:40,temp:0}]});
   const restored=JSON.parse(JSON.stringify(origin));expect(validateStoryWritebackOrigin(restored)).toEqual(origin);
   snapshot.statData['人物']={};f.request.playerTeam[0]!.name='changed';expect(origin.actors[0]!.current).toBe(37);expect(f.replace).not.toHaveBeenCalled();
 });
 it('requires zero temporary HP and the actual prepared entry HP',()=>{
   const f=fixture();f.hero['临时生命值']=1;expect(f.origin).toThrow('临时');f.hero['临时生命值']=0;f.request.playerTeam[0]!.initialHp=7;expect(f.origin).toThrow('入场 HP');
 });
 it.each(['current','max','temp','path','duplicate','fingerprint','message','extra'] as const)('rejects imported origin corruption: %s',field=>{
   const f=fixture();const origin=f.origin();
   if(field==='current')origin.actors[0]!.current=10;if(field==='max')origin.actors[0]!.max=200;if(field==='temp')origin.actors[0]!.temp=1;if(field==='path')origin.actors[0]!.path='/任务';if(field==='duplicate')origin.actors.push(structuredClone(origin.actors[0]!));if(field==='fingerprint')origin.fingerprint='{}';if(field==='message')origin.messageId=-1;if(field==='extra')Object.assign(origin,{result:'forged'});
   expect(()=>validateStoryWritebackOrigin(origin)).toThrow();
 });
 it('rejects inherited actors and invalid JSON pointer escaping',()=>{
   const f=fixture();for(const ref of ['/羁绊列表/constructor','/羁绊列表/甲~2乙','/人物/当前生命值','hero']){
     f.request.playerTeam=[unit(ref,10,10)];expect(f.origin).toThrow();
   }
 });
 it('supports literal prototype-like own member names without prototype mutation',async()=>{
   const f=fixture();const bonds=f.data.stat_data['羁绊列表'] as Record<string,unknown>;
   Object.defineProperty(bonds,'__proto__',{value:{当前生命值:40,生命值上限:40},enumerable:true,writable:true});
   const ref=companionMemberRef('__proto__');f.request.playerTeam[1]!.externalId=ref;f.result.combatants[1]!.externalId=ref;f.result.defeatedExternalIds=[ref,'enemy'];
   await writebackStory(f.adapter,f.origin(),f.receipt());expect((f.data.stat_data['羁绊列表'] as Record<string,Record<string,unknown>>)['__proto__']!['当前生命值']).toBe(0);expect(Object.hasOwn({},'当前生命值')).toBe(false);
 });
});

describe('ST story HP and authoritative factual writeback',()=>{
 it('atomically commits HP with facts, mirrors them in chat match3, and preserves unrelated fields',async()=>{
   const f=fixture();const before=structuredClone(f.data);const receipt=f.receipt();const origin=f.origin();const returned=await writebackStory(f.adapter,JSON.parse(JSON.stringify(origin)),receipt);
   expect(returned.status).toBe('applied');expect(f.hero['当前生命值']).toBe(14);expect(f.hero['生命值上限']).toBe(99);expect(f.hero['临时生命值']).toBe(0);
   const friend=(f.data.stat_data['羁绊列表'] as Record<string,Record<string,unknown>>)[friendName]!;expect(friend['当前生命值']).toBe(0);expect(friend['同行誓约']).toBe(true);expect(friend['其他']).toBe('保留');
   expect(f.data.display_data).toEqual(before.display_data);expect(f.data.stat_data['任务']).toEqual(before.stat_data['任务']);expect(f.hero['SP']).toBe(8);expect(f.variables['other']).toEqual({keep:true});expect((f.variables['match3'] as Record<string,unknown>)['keep']).toBe('保留');
   expect(f.marker()).toEqual(returned.record);expect(f.mirror()).toEqual(returned.record);expect(f.marker()!.report).toEqual(receipt.report);expect(f.marker()!.result).toEqual(receipt.result);
   expect(f.marker()!.report).toMatchObject({defeatedEnemyIds:['enemy'],fallenAllyIds:['/人物',friendRef],revivedAllyIds:['/人物']});expect(f.marker()!.report.units[0]).toMatchObject({fellCount:1,revivedCount:1,hpDamage:3,finallyDefeated:false});
   expect(f.replace).toHaveBeenCalledTimes(1);const payload=f.replace.mock.calls[0]![0];expect(payload.stat_data[STORY_RESULTS_FIELD]).toBeDefined();expect((payload.stat_data['人物'] as Record<string,unknown>)['当前生命值']).toBe(14);
   returned.record.report.units[0]!.hpDamage=999;expect(f.marker()!.report.units[0]!.hpDamage).toBe(3);expect(receipt.report.units[0]!.hpDamage).toBe(3);
 });
 it('preserves the original current HP when the entry and final battle ratios are unchanged',async()=>{
   const f=fixture();f.result.combatants[0]!.hp=3;await f.adapter.writeStoryResult(f.origin(),f.receipt());expect(f.hero['当前生命值']).toBe(37);
 });
 it('converts the final percentage using final battle max HP, leaving frozen ST max HP alone',async()=>{
   const f=fixture();f.result.combatants[0]!.hp=7;f.result.combatants[0]!.maxHp=14;await writebackStory(f.adapter,f.origin(),f.receipt());expect(f.hero['当前生命值']).toBe(50);expect(f.hero['生命值上限']).toBe(99);
 });
 it('keeps a surviving actor at least at one ST HP despite rounding',async()=>{
   const f=fixture();f.hero['当前生命值']=1;f.hero['生命值上限']=1;f.request.playerTeam[0]!.stats.hp=1000;f.request.playerTeam[0]!.initialHp=1000;f.result.combatants[0]!.maxHp=1000;await writebackStory(f.adapter,f.origin(),f.receipt());expect(f.hero['当前生命值']).toBe(1);
 });
 it('writes actual defeat HP and facts with zero story rewards',async()=>{
   const f=fixture();f.result.winner='enemy';f.result.combatants[0]!.hp=0;f.result.combatants[0]!.defeated=true;f.result.defeatedExternalIds.push('/人物');const receipt=f.receipt();await writebackStory(f.adapter,f.origin(),receipt);expect(f.hero['当前生命值']).toBe(0);expect(f.marker()!.report.winner).toBe('enemy');expect(receipt.grants).toEqual([]);
 });
 it('rejects replay receipts without reading or writing the host',async()=>{
   const f=fixture();const receipt=f.receipt();receipt.kind='replay';const origin=f.origin();f.get.mockClear();await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('再现');expect(f.get).not.toHaveBeenCalled();expect(f.replace).not.toHaveBeenCalled();
 });
 it.each(['digest','request','fact','roster','report-list','winner','extra-result','defeated-list'] as const)('rejects inconsistent receipt %s',field=>{
   const f=fixture();const receipt=f.receipt();const origin=f.origin();
   if(field==='digest')receipt.resultDigest='forged';if(field==='request')receipt.request.requestId='forged';if(field==='fact')receipt.report.units[0]!.finalHp=99;if(field==='roster')receipt.result.combatants.pop();if(field==='report-list')receipt.report.revivedAllyIds=[];if(field==='winner')receipt.winner='enemy';if(field==='extra-result')Object.assign(receipt.result,{forged:'stripped'});if(field==='defeated-list')receipt.result.defeatedExternalIds=[];
   return expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow();
 });
});

describe('ST story writeback conflicts and retry durability',()=>{
 it.each(['chat','message','swipe','variable','binding'] as const)('rejects a changed %s before writing',async field=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();if(field==='chat')f.switchChat('chat-b');if(field==='message')f.ctx.chat=[{},{}];if(field==='swipe')f.ctx.chat=[{swipe_id:1}];if(field==='variable')f.hero['SP']=9;if(field==='binding')(f.variables['match3'] as Record<string,unknown>)['saveId']='other-save';
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow();expect(f.replace).not.toHaveBeenCalled();expect(f.hero['当前生命值']).toBe(37);expect(f.marker()).toBeUndefined();expect(receipt.report.units[0]!.finalHp).toBe(1);
 });
 it('requires a bound chat and the host lock before modifying MVU',async()=>{
   const f=fixture();const origin=f.origin();delete f.variables['match3'];await expect(writebackStory(f.adapter,origin,f.receipt())).rejects.toThrow('绑定');expect(f.replace).not.toHaveBeenCalled();
   Object.assign(f.host.navigator,{locks:undefined});await expect(writebackStory(f.adapter,origin,f.receipt())).rejects.toThrow('锁');
 });
 it('serializes simultaneous submissions under the same host lock and writes HP exactly once',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();const results=await Promise.all([writebackStory(f.adapter,origin,receipt),writebackStory(f.adapter,origin,receipt)]);
   expect(results.map(r=>r.status)).toEqual(['applied','already-applied']);expect(f.replace).toHaveBeenCalledTimes(1);expect(f.update).toHaveBeenCalledTimes(1);expect(f.requestLock).toHaveBeenCalledTimes(2);expect(f.requestLock.mock.calls[0]![0]).toBe(f.requestLock.mock.calls[1]![0]);expect(f.hero['当前生命值']).toBe(14);
 });
 it('retries chat confirmation failure using the MVU marker and preserves subsequently edited HP',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();f.update.mockImplementationOnce(updater=>{updater(structuredClone(f.variables));});
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('尚未确认');expect(f.marker()).toBeDefined();expect(f.mirror()).toBeUndefined();expect(f.hero['当前生命值']).toBe(14);
   f.hero['当前生命值']=9;const reopened=new StHostAdapter(f.helpers,f.host,'host');const result=await writebackStory(reopened,JSON.parse(JSON.stringify(origin)),JSON.parse(JSON.stringify(receipt)));
   expect(result.status).toBe('already-applied');expect(f.replace).toHaveBeenCalledTimes(1);expect(f.hero['当前生命值']).toBe(9);expect(f.mirror()).toEqual(f.marker());
 });
 it('retries an MVU successful commit followed by a rejected write promise without applying HP again',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();f.replace.mockImplementationOnce(async next=>{f.setData(next);throw new Error('write acknowledgement lost');});
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('acknowledgement');expect(f.marker()).toBeDefined();expect((await writebackStory(f.adapter,origin,receipt)).status).toBe('already-applied');expect(f.replace).toHaveBeenCalledTimes(1);
 });
 it('recovers from an MVU readback failure after successful atomic commit',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();f.replace.mockImplementationOnce(async next=>{f.setData(next);f.failRead();});
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('readback');expect(f.marker()).toBeDefined();await writebackStory(f.adapter,origin,receipt);expect(f.replace).toHaveBeenCalledTimes(1);expect(f.hero['当前生命值']).toBe(14);
 });
 it('does not repeat either write when chat update committed but its acknowledgement rejected',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();const normal=f.update.getMockImplementation()!;
   f.update.mockImplementationOnce(updater=>{normal(updater);throw new Error('chat acknowledgement lost');});await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('acknowledgement');
   await writebackStory(f.adapter,origin,receipt);expect(f.replace).toHaveBeenCalledTimes(1);expect(f.update).toHaveBeenCalledTimes(1);
 });
 it('rejects schema stripping of the marker and retains the supplied result for conflict handling',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();const before=stableJson(receipt);
   f.replace.mockImplementationOnce(async next=>{const stripped=structuredClone(next);delete stripped.stat_data[STORY_RESULTS_FIELD];f.setData(stripped);});
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('未持久化');expect(f.mirror()).toBeUndefined();expect(stableJson(receipt)).toBe(before);await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('指纹');expect(f.replace).toHaveBeenCalledTimes(1);
 });
 it('detects a silently discarded HP write even when a marker was retained',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();f.replace.mockImplementationOnce(async next=>{(next.stat_data['人物'] as Record<string,unknown>)['当前生命值']=37;f.setData(next);});
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('未持久化');expect(f.mirror()).toBeUndefined();
 });
 it('handles chat switching after MVU commit and resumes only in the original chat',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();f.replace.mockImplementationOnce(async next=>{f.setData(next);f.switchChat('chat-b');});
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('切换');expect(f.marker()).toBeDefined();expect(f.mirror()).toBeUndefined();f.switchChat('chat-a');await writebackStory(f.adapter,origin,receipt);expect(f.replace).toHaveBeenCalledTimes(1);expect(f.mirror()).toEqual(f.marker());
 });
 it.each(['marker','mirror'] as const)('rejects a conflicting persisted %s and leaves HP alone',async field=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();await writebackStory(f.adapter,origin,receipt);const stored=field==='marker'?f.marker()!:f.mirror()!;stored.resultDigest='conflicting';f.hero['当前生命值']=9;
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('冲突');expect(f.replace).toHaveBeenCalledTimes(1);expect(f.hero['当前生命值']).toBe(9);
 });
 it('rejects a chat acknowledgement with a missing MVU marker instead of applying HP again',async()=>{
   const f=fixture();const origin=f.origin();const receipt=f.receipt();await writebackStory(f.adapter,origin,receipt);delete f.data.stat_data[STORY_RESULTS_FIELD];await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow('标记缺失');expect(f.replace).toHaveBeenCalledTimes(1);
 });
});


describe('ST story writeback with battle economy audit',()=>{
 function withAudit(result:BattleResult,recorded:boolean):void {
   const initial={leftGold:0,rightGold:0,souls:0,gems:0,maps:0};
   result.economy={gold:recorded?10:0,souls:0,gems:0};
   result.economyAudit={version:1,initial,final:{...initial,leftGold:recorded?10:0},entries:recorded?[{
     sequence:1,actionIndex:0,currency:'gold',account:PlayerSide.Left,side:PlayerSide.Left,actorId:0,
     source:'skill-gain',operation:'gain',requested:10,before:0,after:10,delta:10,cap:500,multiplier:1,
   }]:[]};
 }
 it.each([false,true])('persists the audited story fact and retries without duplicate HP or currency writes: recorded=%s',async recorded=>{
   const f=fixture();withAudit(f.result,recorded);const origin=f.origin();const receipt=f.receipt();
   const first=await writebackStory(f.adapter,origin,receipt);
   expect(first.status).toBe('applied');expect(f.marker()!.result.economyAudit).toEqual(receipt.result.economyAudit);
   expect(f.hero['当前生命值']).toBe(14);const frozen=stableJson(f.data);
   const retry=await writebackStory(f.adapter,origin,JSON.parse(JSON.stringify(receipt)));
   expect(retry.status).toBe('already-applied');expect(stableJson(f.data)).toBe(frozen);
   expect(f.replace).toHaveBeenCalledTimes(1);expect(f.update).toHaveBeenCalledTimes(1);
   first.record.result.economyAudit!.final.leftGold=999;
   expect(f.marker()!.result.economyAudit!.final.leftGold).toBe(recorded?10:0);
 });
 it.each(['entry','balance','missing-economy'] as const)('rejects corrupt audit before any host write: %s',async field=>{
   const f=fixture();withAudit(f.result,true);const origin=f.origin();const receipt=f.receipt();
   if(field==='entry')receipt.result.economyAudit!.entries[0]!.delta=99;
   if(field==='balance')receipt.result.economy!.gold=9;
   if(field==='missing-economy')delete receipt.result.economy;
   await expect(writebackStory(f.adapter,origin,receipt)).rejects.toThrow();
   expect(f.replace).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();expect(f.hero['当前生命值']).toBe(37);
 });
});
