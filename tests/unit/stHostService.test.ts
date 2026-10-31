import {describe,it,expect,vi} from 'vitest';
import {BaseColor} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import {StHostAdapter} from '../../src/sillytavern/hostAdapter';
import type {TavernHelpers} from '../../src/sillytavern/hostAdapter';
import {StHostService} from '../../src/sillytavern/hostService';
import type {StSaveRepository,ReplayOutcome} from '../../src/sillytavern/saveRepository';
import {validateReplayOutcome} from '../../src/sillytavern/saveRepository';
import {createSave,emptyRoot,validateSave} from '../../src/sillytavern/save';
import type {StSave} from '../../src/sillytavern/save';
import {beginStory,completeStory} from '../../src/sillytavern/storySession';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';

function fixture(restricted=false){
 let chatId='chat-a';let variables:Record<string,unknown>={other:'preserve'};
 const data={stat_data:{人物:{名称:'主角',当前生命值:23,生命值上限:40,临时生命值:7}}};
 const writeVariables=vi.fn((updater:(v:Record<string,unknown>)=>Record<string,unknown>)=>variables=updater(variables));
 const replace=vi.fn(async()=>{});
 const helpers:TavernHelpers={getContext:()=>({characterId:0,characters:[{avatar:'card.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId}),
  getVariables:()=>structuredClone(variables),updateVariablesWith:writeVariables,Mvu:{getMvuData:()=>structuredClone(data),replaceMvuData:replace}};
 const adapter=new StHostAdapter(helpers,{} as Window,'host');const chat=adapter.binding();
 let stored=createSave(emptyRoot(),chat,'save');adapter.bindSave(stored);writeVariables.mockClear();
 const actor=(externalId:string):CombatantSnapshot=>({externalId,name:externalId,stats:{hp:40,attack:5,armor:0,magic:7},initialHp:23,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'});
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'history',requestId:'history-request',seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]};
 const sources=[{sourceId:'source',abilityId:'gw_KnightsSword',abilityName:'骑士剑技',rank:0,enemyExternalId:'enemy'}];
 const result=(request:BattleRequest):BattleResult=>({schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner:'player',turns:2,
  combatants:[{externalId:'hero',side:'player',hp:20,maxHp:40,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:40,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:request.battleId,economy:{gold:0,souls:0,gems:0,maps:0},eventSummary:[{type:'defeat',count:1}]});
 const events:GameEvent[]=[{type:'defeat',characterId:4}];
 beginStory(stored,request,sources,'normal','history-encounter');completeStory(stored,result(request),events);
 stored.learnedAbilityIds=['gw_KnightsSword'];stored.equippedAbilities={hero:'gw_KnightsSword'};stored.balances={'material:kept':7};
 const pendingRequest={...structuredClone(request),battleId:'pending',requestId:'pending-request'};
 beginStory(stored,pendingRequest,sources,'normal','pending-encounter');
 if(restricted)stored.pendingStory!.request.enemyTeam[0]!.skillId='st:7037';
 stored=validateSave(stored);
 const queue:ReplayOutcome[]=[];
 let beforeUpdate=()=>{};let afterList=()=>{};
 const list=vi.fn(async()=>{const saves=[structuredClone(stored)];afterList();return saves;});
 const update=vi.fn(async(id:string,revision:number,mutate:(draft:StSave)=>void,emptyQueue=false)=>{
  beforeUpdate();
  if(emptyQueue&&queue.some(o=>o.saveId===id))throw new Error('本场已有待保存战果，请先保存结果');
  if(id!==stored.id||revision!==stored.revision)throw new Error('存档版本已变化');
  const draft=structuredClone(stored);mutate(draft);draft.revision++;draft.updatedAt++;
  stored=validateSave(draft);return structuredClone(stored);
 });
 const repository={list,update} as unknown as StSaveRepository;const service=new StHostService(adapter,repository);
 const enqueue=()=>{const outcome:ReplayOutcome={version:1,kind:'story',saveId:stored.id,chat,ticket:structuredClone(stored.pendingStory!),result:result(stored.pendingStory!.request),events,createdAt:1};validateReplayOutcome(outcome,stored);queue.push(outcome);};
 return {service,adapter,chat,update,writeVariables,replace,data,queue,enqueue,
  get save(){return structuredClone(stored);},get variables(){return structuredClone(variables);},
  abandon:()=>service.abandonStory('pending',0,chat),switchChat:()=>{chatId='chat-b';},
  beforeUpdate:(fn:()=>void)=>{beforeUpdate=fn;},afterList:(fn:()=>void)=>{afterList=fn;},
  changeTicket:()=>{stored.pendingStory!.request.battleId='replacement';},advanceRevision:()=>{stored.revision++;}};
}

describe('ST host manually abandons an unsettled story',()=>{
 it('abandons an existing economic ticket while preserving balances, learning, history, HP and chat variables',async()=>{
  const f=fixture(true);const before=f.save;const data=structuredClone(f.data);const variables=f.variables;
  expect(()=>prepareStBattle(before.pendingStory!.request)).not.toThrow();
  expect(before.settlements).toHaveLength(1);expect(before.sources).toHaveLength(1);expect(before.encounters).toHaveLength(1);
  await f.abandon();
  const expected=structuredClone(before);delete expected.pendingStory;expected.revision++;expected.updatedAt++;
  expect(f.save).toEqual(expected);expect(f.data).toEqual(data);expect(f.variables).toEqual(variables);
  expect(f.replace).not.toHaveBeenCalled();expect(f.writeVariables).not.toHaveBeenCalled();
  expect(f.update).toHaveBeenCalledWith('save',0,expect.any(Function),true);
 });
 it('keeps both the ticket and an actual queued battle outcome',async()=>{
  const f=fixture();f.enqueue();const before=f.save;const queue=structuredClone(f.queue);
  await expect(f.abandon()).rejects.toThrow('待保存战果');expect(f.save).toEqual(before);expect(f.queue).toEqual(queue);
 });
 it('checks the outbox in the update transaction, including an outcome arriving after the read',async()=>{
  const f=fixture();const before=f.save;f.beforeUpdate(f.enqueue);
  await expect(f.abandon()).rejects.toThrow('待保存战果');expect(f.save).toEqual(before);expect(f.queue).toHaveLength(1);
 });
 it('rejects a different current chat before reading or updating its save',async()=>{
  const f=fixture();const before=f.save;f.switchChat();
  await expect(f.abandon()).rejects.toThrow('聊天已切换');expect(f.update).not.toHaveBeenCalled();expect(f.save).toEqual(before);
 });
 it('rejects a chat switch while reading the save',async()=>{
  const f=fixture();const before=f.save;f.afterList(f.switchChat);
  await expect(f.abandon()).rejects.toThrow('聊天已切换');expect(f.update).not.toHaveBeenCalled();expect(f.save).toEqual(before);
 });
 it('checks the chat again inside the mutation transaction',async()=>{
  const f=fixture();const before=f.save;f.beforeUpdate(f.switchChat);
  await expect(f.abandon()).rejects.toThrow('聊天已切换');expect(f.save).toEqual(before);
 });
 it('rejects a replaced battle ticket even at the expected revision',async()=>{
  const f=fixture();f.changeTicket();const before=f.save;
  await expect(f.abandon()).rejects.toThrow('待完成剧情已变化');expect(f.save).toEqual(before);
 });
 it('rejects a changed revision even when the battle ID is unchanged',async()=>{
  const f=fixture();f.advanceRevision();const before=f.save;
  await expect(f.abandon()).rejects.toThrow('版本已变化');expect(f.save).toEqual(before);
 });
 it('rejects revision changes occurring after the initial read',async()=>{
  const f=fixture();f.beforeUpdate(f.advanceRevision);
  await expect(f.abandon()).rejects.toThrow('版本已变化');expect(f.save.pendingStory?.request.battleId).toBe('pending');
 });
 it('rejects a second abandonment after the original ticket has gone',async()=>{
  const f=fixture();await f.abandon();const before=f.save;
  await expect(f.service.abandonStory('pending',before.revision,f.chat)).rejects.toThrow('待完成剧情已变化');expect(f.save).toEqual(before);
 });
});

describe('ST host weapon purchase',()=>{
 it('is blocked while a story battle is pending, before touching MVU',async()=>{
  const f=fixture();expect(f.save.pendingStory).toBeDefined();
  await expect(f.service.purchaseWeapon('gw_SkeletonKey')).rejects.toThrow('剧情战斗尚未结算');
  expect(f.replace).not.toHaveBeenCalled();
 });
});
