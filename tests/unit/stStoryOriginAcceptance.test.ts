import {describe,expect,it,vi} from 'vitest';
import {BaseColor} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,BattleResult} from '../../src/session/contract';
import {StHostAdapter} from '../../src/sillytavern/hostAdapter';
import type {MvuData,TavernContext,TavernHelpers} from '../../src/sillytavern/hostAdapter';
import {StHostService} from '../../src/sillytavern/hostService';
import {StSaveRepository,validateReplayOutcome} from '../../src/sillytavern/saveRepository';
import type {ReplayOutcome} from '../../src/sillytavern/saveRepository';
import {createSave,emptyRoot,validateSave} from '../../src/sillytavern/save';
import type {PendingStory,StSave} from '../../src/sillytavern/save';
import {completeStory} from '../../src/sillytavern/storySession';
import {prepareCurrentParty} from '../../src/sillytavern/partyPreparation';
import {buildStoryWritebackRecord} from '../../src/sillytavern/storyWriteback';
import type {StoryWritebackAck,StoryWritebackOrigin} from '../../src/sillytavern/storyWriteback';
import {stableJson} from '../../src/sillytavern/json';

const jsonClone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function deferred<T>() {
 let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}

/** Storage seam only: domain/service/adapter code is real. IndexedDB itself is covered by browser tests. */
function fixture() {
 const chat={hostId:'host',characterId:'avatar:card.png',chatId:'chat-a'};
 let stored=createSave(emptyRoot(),chat,'save',1);
 let queue:ReplayOutcome[]=[];
 let selectedChat='chat-a';
 const dataByChat:Record<string,MvuData>={
  'chat-a':{stat_data:{人物:{名称:'林',等级:20,生命值上限:200,当前生命值:100,临时生命值:0,AC:14,
   属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},
   战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},
   装备列表:{}},羁绊列表:{},系统配置:{战斗数值模式:'classic'},任务:{现状:'保留'}},display_data:{保留:true}},
  'chat-b':{stat_data:{人物:{当前生命值:11,生命值上限:11}}},
 };
 const variablesByChat:Record<string,Record<string,unknown>>={
  'chat-a':{other:{keep:true},match3:{version:1,saveId:'save',chat}},'chat-b':{other:'preserve'},
 };
 const context:TavernContext={characterId:0,characters:[{avatar:'card.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>selectedChat};
 const get=vi.fn(()=>structuredClone(dataByChat[selectedChat]!));
 const replace=vi.fn(async(data:MvuData)=>{dataByChat[selectedChat]=structuredClone(data);});
 const updateVariables=vi.fn((update:(v:Record<string,unknown>)=>Record<string,unknown>)=>{
  variablesByChat[selectedChat]=update(structuredClone(variablesByChat[selectedChat]!));
 });
 const helpers:TavernHelpers={getContext:()=>context,getVariables:()=>structuredClone(variablesByChat[selectedChat]!),
  updateVariablesWith:updateVariables,Mvu:{getMvuData:get,replaceMvuData:replace}};
 const tails=new Map<string,Promise<unknown>>();
 const locks=vi.fn((key:string,work:()=>Promise<unknown>)=>{
  const pending=(tails.get(key)??Promise.resolve()).catch(()=>{}).then(work);
  tails.set(key,pending.catch(()=>{}));return pending;
 });
 let nextId=0;
 const host={navigator:{locks:{request:locks}},crypto:{randomUUID:()=>`id-${++nextId}`}} as unknown as Window;
 const adapter=new StHostAdapter(helpers,host,'host');
 const source=adapter.read();
 const prepared=prepareCurrentParty(source);
 if(!prepared.ready)throw new Error(JSON.stringify(prepared.issues));
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'story',requestId:'story-request',seed:42,
  playerTeam:structuredClone(prepared.party),enemyTeam:[{externalId:'enemy',name:'骑士',stats:{hp:10,attack:1,armor:0,magic:1},
   manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'}]};
 const hero=request.playerTeam[0]!;
 const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,
  seed:request.seed,winner:'player',turns:2,combatants:[{externalId:hero.externalId,side:'player',hp:1,maxHp:hero.stats.hp,armor:0,defeated:false,statuses:[]},
   {externalId:'enemy',side:'enemy',hp:0,maxHp:10,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,
  actionLogDigest:'actual-story-digest',economy:{gold:99,souls:42,gems:3,maps:1},eventSummary:[{type:'defeat',count:1}]};
 const sources=[{sourceId:'enemy-source',abilityId:'ability',abilityName:'骑士剑技',rank:4,enemyExternalId:'enemy'}];
 const events:GameEvent[]=[{type:'skill-damage',casterId:0,targetId:4,range:'single',damage:10,hpLoss:10,resultingHp:0,resultingArmor:0},{type:'defeat',characterId:4}];
 const list=vi.fn(async()=>[structuredClone(stored)]);
 const listOutcomes=vi.fn(async()=>structuredClone(queue));
 const update=vi.fn(async(id:string,revision:number,action:(save:StSave)=>void,emptyQueue=false)=>{
  if(id!==stored.id||revision!==stored.revision)throw new Error('revision conflict');
  if(emptyQueue&&queue.some(o=>o.saveId===id))throw new Error('queued outcome');
  const draft=structuredClone(stored);action(draft);draft.revision++;draft.updatedAt++;
  stored=validateSave(draft);return structuredClone(stored);
 });
 const stage=vi.fn(async(outcome:ReplayOutcome)=>{
  validateReplayOutcome(outcome,stored);
  const old=queue.find(o=>o.result.battleId===outcome.result.battleId);
  const facts=(o:ReplayOutcome)=>({...o,createdAt:0});
  if(old&&stableJson(facts(old))!==stableJson(facts(outcome)))throw new Error('queued conflict');
  if(!old)queue.push(structuredClone(outcome));
 });
 const remove=vi.fn(async(battleId:string)=>{queue=queue.filter(o=>o.result.battleId!==battleId);});
 const repository={list,update,listReplayOutcomes:listOutcomes,stageReplayOutcome:stage,removeReplayOutcome:remove} as unknown as StSaveRepository;
 const service=new StHostService(adapter,repository);
 const begin=()=>service.beginStory(request,sources,'normal','encounter',source);
 const outcome=(ticket:PendingStory):ReplayOutcome=>({version:1,kind:'story',saveId:'save',chat:structuredClone(chat),ticket:structuredClone(ticket),
  result:structuredClone(result),events:structuredClone(events),createdAt:1});
 const stageStory=(ticket:PendingStory)=>service.stageReplayOutcome('save',ticket,result,events,chat,'story');
 const settle=()=>service.completeStory('save',result,events);
 const reopen=()=>new StHostService(new StHostAdapter(helpers,host,'host'),repository);
 // Story facts stay in the local receipt; the chat-level acknowledgement prevents a second HP write.
 const marker=()=>(((variablesByChat['chat-a']!['match3'] as Record<string,unknown>)['storyResults']??{}) as Record<string,StoryWritebackAck>)['story'];
 return {adapter,service,repository,request,result,sources,source,events,context,replace,updateVariables,get,locks,list,listOutcomes,update,stage,remove,
  begin,outcome,stageStory,settle,reopen,marker,
  get saved(){return structuredClone(stored);},get queue(){return structuredClone(queue);},
  get hero(){return dataByChat['chat-a']!.stat_data['人物'] as Record<string,unknown>;},
  get data(){return dataByChat['chat-a']!;},get variables(){return variablesByChat['chat-a']!;},
  switchChat:(id:string)=>{selectedChat=id;},
  reload:()=>{stored=validateSave(jsonClone(stored));queue=jsonClone(queue);},
  reprepare:()=>prepareCurrentParty(adapter.read()),
 };
}

/** Change a host value that moves the converted attack (st-party-v2: strength nudges attack) but not HP. */
function alterPanel(f:ReturnType<typeof fixture>):void {
 (f.hero['属性'] as Record<string,unknown>)['力量']=30;
}

describe('ST integrated story origin acceptance: freeze and side effects',()=>{
 it('freezes the real prepared party and host origin through JSON persistence and settlement retries',async()=>{
  const f=fixture();const before=f.adapter.read();const ticket=await f.begin();const original=jsonClone(ticket);
  expect(ticket.origin).toMatchObject({chat:before.chat,messageId:0,swipeId:0,fingerprint:before.fingerprint,saveId:'save',
   actors:[{externalId:'/人物',path:'/人物',current:100,max:200,temp:0}]});
  f.request.playerTeam[0]!.stats.attack=999;f.sources[0]!.abilityName='mutated';ticket.origin!.actors[0]!.current=0;ticket.request.seed=777;
  expect(f.saved.pendingStory).toEqual(original);f.reload();
  const receipt=await f.settle();expect(receipt.storyOrigin).toEqual(original.origin);expect(receipt.request).toEqual(original.request);
  const retry=await f.settle();expect(retry).toEqual(receipt);expect(f.saved.settlements).toHaveLength(1);expect(f.saved.sources[0]!.wins).toBe(1);
  receipt.storyOrigin!.actors[0]!.current=0;expect(f.saved.settlements[0]!.storyOrigin).toEqual(original.origin);
  expect(f.replace).not.toHaveBeenCalled();expect(f.updateVariables).not.toHaveBeenCalled();
 });
 it('stages and accounts a real receipt independently of the later HP writeback',async()=>{
  const f=fixture();const initial=structuredClone(f.data);const ticket=await f.begin();await f.stageStory(ticket);
  expect(f.saved.settlements).toEqual([]);expect(f.queue[0]!.ticket).toEqual(ticket);expect(f.saved.encounters).toEqual([]);
  const receipt=await f.settle();expect(receipt.grants).toEqual([{kind:'fragment',id:'enemy-source',name:'骑士的灵魂碎片',quantity:1}]);
  expect(f.saved.sources[0]!.wins).toBe(1);expect(f.saved.balances).toEqual({});expect(f.saved.encounters).toHaveLength(1);
  expect(f.data).toEqual(initial);expect(f.replace).not.toHaveBeenCalled();expect(f.updateVariables).not.toHaveBeenCalled();expect(f.queue).toHaveLength(1);
  // 1 battle HP left of the hero's match-3 maximum maps back onto the 200-point tavern maximum.
  await f.service.finishOutcome(receipt);expect(f.hero['当前生命值']).toBe(Math.round(200/f.request.playerTeam[0]!.stats.hp));expect(f.marker()).toMatchObject({battleId:receipt.battleId,resultDigest:receipt.resultDigest});expect(f.data.stat_data).not.toHaveProperty('三消战果');
  expect(f.queue).toEqual([]);expect(f.remove).toHaveBeenCalledTimes(1);
 });
 it('commits a defeat with its frozen origin, zero grants and no codex entry',async()=>{
  const f=fixture();f.result.winner='enemy';f.result.combatants[0]!.hp=0;f.result.combatants[0]!.defeated=true;f.result.defeatedExternalIds.push('/人物');
  const ticket=await f.begin();await f.stageStory(ticket);const receipt=await f.settle();expect(receipt.storyOrigin).toEqual(ticket.origin);
  expect(receipt.grants).toEqual([]);expect(f.saved.sources).toEqual([]);expect(f.saved.encounters).toEqual([]);
  await f.service.finishOutcome(receipt);expect(f.hero['当前生命值']).toBe(0);expect(f.marker()!.resultDigest).toBe(receipt.resultDigest);expect(receipt.report.fallenAllyIds).toContain('/人物');
 });
 it('keeps accounting and the durable outcome when current host variables conflict',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);alterPanel(f);
  const receipt=await f.settle();await expect(f.service.finishOutcome(receipt)).rejects.toThrow('指纹');
  expect(f.saved.settlements).toEqual([receipt]);expect(f.saved.sources[0]!.wins).toBe(1);expect(f.queue).toHaveLength(1);
  expect(f.remove).not.toHaveBeenCalled();expect(f.replace).not.toHaveBeenCalled();expect(f.hero['当前生命值']).toBe(100);
 });
 it('settles the original save after switching chat while isolating all host writes',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);f.switchChat('chat-b');
  const receipt=await f.settle();await expect(f.service.finishOutcome(receipt)).rejects.toThrow('切换');
  expect(f.saved.settlements).toEqual([receipt]);expect(f.queue).toHaveLength(1);expect(f.replace).not.toHaveBeenCalled();expect(f.updateVariables).not.toHaveBeenCalled();
  f.switchChat('chat-a');await f.reopen().retryReplayOutcome(jsonClone(f.queue[0]!));expect(f.saved.sources[0]!.wins).toBe(1);expect(f.queue).toEqual([]);
 });
 it('never writes story HP/facts for a committed replay receipt and rejects an injected origin at the adapter',async()=>{
  const f=fixture();await f.begin();const story=await f.settle();
  const ticket=await f.service.beginReplay('encounter',f.request.playerTeam,{},f.adapter.read());
  const result={...structuredClone(f.result),battleId:ticket.request.battleId,requestId:ticket.request.requestId};
  const receipt=await f.service.completeReplay('save',result,f.events);
  await f.service.finishOutcome(receipt);expect(f.replace).not.toHaveBeenCalled();expect(f.updateVariables).not.toHaveBeenCalled();expect(f.marker()).toBeUndefined();
  const injected={...receipt,storyOrigin:story.storyOrigin};
  await expect(f.adapter.writeStoryResult(story.storyOrigin!,injected)).rejects.toThrow('再现');
  expect(ticket.request.playerTeam[0]!.initialHp).toBe(ticket.request.playerTeam[0]!.stats.hp);
 });
});

const originCorruptions:[string,(origin:StoryWritebackOrigin)=>void][]=[
 ['other chat',o=>{o.chat.chatId='chat-b';}],['other save',o=>{o.saveId='other-save';}],['missing save ID',o=>{delete o.saveId;}],
 ['invalid message',o=>{o.messageId=-1;}],['invalid swipe',o=>{o.swipeId=-1;}],['inconsistent frozen HP',o=>{o.actors[0]!.current=99;}],
 ['nonzero temporary HP',o=>{o.actors[0]!.temp=1;}],['unbound actor path',o=>{o.actors[0]!.path='/任务';}],
 ['noncanonical fingerprint',o=>{o.fingerprint=JSON.stringify(JSON.parse(o.fingerprint),null,2);}],
];
describe('ST integrated story origin acceptance: imported provenance',()=>{
 it.each(originCorruptions)('rejects a pending origin with %s without mutating the supplied backup',async(_name,corrupt)=>{
  const f=fixture();await f.begin();const save=jsonClone(f.saved);corrupt(save.pendingStory!.origin!);const before=stableJson(save);
  expect(()=>validateSave(save)).toThrow();expect(stableJson(save)).toBe(before);expect(f.saved.encounters).toEqual([]);expect(f.saved.sources).toEqual([]);
 });
 it.each(originCorruptions)('rejects a settled origin with %s while retaining the actual durable receipt',async(_name,corrupt)=>{
  const f=fixture();await f.begin();const receipt=await f.settle();const save=jsonClone(f.saved);corrupt(save.settlements[0]!.storyOrigin!);
  expect(()=>validateSave(save)).toThrow();expect(f.saved.settlements).toEqual([receipt]);expect(f.replace).not.toHaveBeenCalled();
 });
 it.each(['pending','settled'] as const)('rejects a forged outbox origin against the authoritative %s record',async phase=>{
  const f=fixture();const ticket=await f.begin();if(phase==='settled')await f.settle();
  const outcome=f.outcome(ticket);(outcome.ticket as PendingStory).origin!.messageId++;
  await expect(f.service.importReplayOutcome(JSON.stringify(outcome))).rejects.toThrow('配置');
  expect(f.stage).not.toHaveBeenCalled();expect(f.queue).toEqual([]);expect(f.replace).not.toHaveBeenCalled();
 });
 it.each(['pending','settled'] as const)('rejects stripping the outbox origin against the authoritative %s record',async phase=>{
  const f=fixture();const ticket=await f.begin();if(phase==='settled')await f.settle();const outcome=f.outcome(ticket);delete (outcome.ticket as PendingStory).origin;
  expect(()=>validateReplayOutcome(outcome,f.saved)).toThrow('配置');expect(f.replace).not.toHaveBeenCalled();
 });
 it('accepts an unmodified old outcome after settlement and keeps the original receipt facts',async()=>{
  const f=fixture();const ticket=await f.begin();const receipt=await f.settle();const outcome=f.outcome(ticket);
  expect(()=>validateReplayOutcome(jsonClone(outcome),jsonClone(f.saved))).not.toThrow();
  const imported=await f.service.importReplayOutcome(JSON.stringify(outcome));f.reload();
  const restored=await f.reopen().retryReplayOutcome(imported);expect(restored).toEqual(receipt);expect(f.saved.sources[0]!.wins).toBe(1);expect(f.queue).toEqual([]);
 });
 it('rejects a bare forged codex entry with only an uncompleted story ticket',async()=>{
  const f=fixture();await f.begin();const winner=f.saved;completeStory(winner,f.result,f.events);const forged=f.saved;forged.encounters=winner.encounters;
  expect(()=>validateSave(forged)).toThrow('胜利');expect(f.saved.encounters).toEqual([]);
 });
 it('does not stage an imported outcome whose authoritative pending request has forged entry HP',async()=>{
  const f=fixture();await f.begin();const forged=jsonClone(f.saved);forged.pendingStory!.request.playerTeam[0]!.initialHp=1;
  const outcome=f.outcome(forged.pendingStory!);
  expect(()=>validateReplayOutcome(outcome,forged)).toThrow();
 });
 it('rejects an imported pending request whose entry HP no longer matches its frozen origin',async()=>{
  const f=fixture();await f.begin();const forged=jsonClone(f.saved);forged.pendingStory!.request.playerTeam[0]!.initialHp=1;
  expect(()=>validateSave(forged)).toThrow();
 });
});

describe('ST integrated story origin acceptance: durable retries',()=>{
 it.each(['mvu acknowledgement','mvu readback','chat acknowledgement','queue removal'] as const)('recovers across JSON reload after losing %s without double HP or rewards',async failure=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);const receipt=await f.settle();
  if(failure==='mvu acknowledgement'){
   const commit=f.replace.getMockImplementation()!;f.replace.mockImplementationOnce(async data=>{await commit(data);throw new Error('lost mvu acknowledgement');});
  }
  if(failure==='mvu readback'){
   const commit=f.replace.getMockImplementation()!;f.replace.mockImplementationOnce(async data=>{await commit(data);f.get.mockImplementationOnce(()=>{throw new Error('lost mvu readback');});});
  }
  if(failure==='chat acknowledgement')f.updateVariables.mockImplementationOnce(()=>{throw new Error('lost chat acknowledgement');});
  if(failure==='queue removal')f.remove.mockRejectedValueOnce(new Error('lost queue removal'));
  await expect(f.service.finishOutcome(receipt)).rejects.toThrow('lost');expect(f.queue).toHaveLength(1);
  // HP is already written; only the chat acknowledgement may still be missing.
  const written=f.hero['当前生命值'];expect(f.marker()===undefined).toBe(failure!=='queue removal');
  // Once acknowledged, later HP edits on the battle floor are never overwritten.
  if(failure==='queue removal')f.hero['当前生命值']=7;
  f.reload();const restored=await f.reopen().retryReplayOutcome(jsonClone(f.queue[0]!));
  expect(restored).toEqual(receipt);expect(f.hero['当前生命值']).toBe(failure==='queue removal'?7:written);expect(f.replace).toHaveBeenCalledTimes(1);expect(f.marker()).toBeDefined();
  expect(f.saved.settlements).toHaveLength(1);expect(f.saved.sources[0]!.wins).toBe(1);expect(f.queue).toEqual([]);
 });
 it('serializes double finish callbacks and leaves HP and reward progress committed once',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);const receipt=await f.settle();
  await Promise.all([f.service.finishOutcome(jsonClone(receipt)),f.reopen().finishOutcome(jsonClone(receipt))]);
  expect(f.replace).toHaveBeenCalledTimes(1);expect(f.updateVariables).toHaveBeenCalledTimes(1);expect(f.saved.sources[0]!.wins).toBe(1);
  expect(f.queue).toEqual([]);expect(f.marker()!.resultDigest).toBe(receipt.resultDigest);
 });
 it('retains the queue and already granted receipt if switching chat after the MVU commit',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);const receipt=await f.settle();const commit=f.replace.getMockImplementation()!;
  f.replace.mockImplementationOnce(async data=>{await commit(data);f.switchChat('chat-b');});
  await expect(f.service.finishOutcome(receipt)).rejects.toThrow('切换');expect(f.queue).toHaveLength(1);expect(f.marker()).toBeUndefined();
  f.switchChat('chat-a');f.reload();await f.reopen().retryReplayOutcome(f.queue[0]!);
  expect(f.replace).toHaveBeenCalledTimes(1);expect(f.queue).toEqual([]);expect(f.saved.sources[0]!.wins).toBe(1);expect(f.marker()).toBeDefined();
 });
});

/** Acceptance expectations: failures identify integration gaps; do not weaken them to match current behavior. */
describe('ST integrated story origin acceptance: stale preparation and receipt authority',()=>{
 it('rejects a panel changed after preparation confirmation but before service.beginStory',async()=>{
  const f=fixture();const prepared=jsonClone(f.request.playerTeam);alterPanel(f);
  expect(f.reprepare().party[0]!.stats.attack).not.toBe(prepared[0]!.stats.attack);
  expect(f.reprepare().party[0]!.stats.hp).toBe(prepared[0]!.stats.hp);
  expect(f.reprepare().party[0]!.initialHp).toBe(prepared[0]!.initialHp);
  await expect(f.begin()).rejects.toThrow();expect(f.saved.pendingStory).toBeUndefined();
 });
 it.each(['panel','equipment','message','swipe','save binding'] as const)('rejects a changed %s while awaiting the outbox read before the transaction',async field=>{
  const f=fixture();const entered=deferred<void>();const gate=deferred<ReplayOutcome[]>();
  f.listOutcomes.mockImplementationOnce(()=>{entered.resolve();return gate.promise;});
  const beginning=f.begin();await entered.promise;
  if(field==='panel')alterPanel(f);
  if(field==='equipment')f.hero['装备列表']={sword:{名称:'新武器'}};
  if(field==='message')f.context.chat=[{},{}];
  if(field==='swipe')f.context.chat=[{swipe_id:1}];
  if(field==='save binding')(f.variables['match3'] as Record<string,unknown>)['saveId']='another-save';
  gate.resolve([]);await expect(beginning).rejects.toThrow();expect(f.saved.pendingStory).toBeUndefined();
  expect(f.replace).not.toHaveBeenCalled();expect(f.updateVariables).not.toHaveBeenCalled();
 });
 it('also rejects an await-time change when using the implicit service snapshot',async()=>{
  const f=fixture();const entered=deferred<void>();const gate=deferred<ReplayOutcome[]>();
  f.listOutcomes.mockImplementationOnce(()=>{entered.resolve();return gate.promise;});
  const beginning=f.service.beginStory(f.request,f.sources,'normal','encounter');await entered.promise;alterPanel(f);gate.resolve([]);
  await expect(beginning).rejects.toThrow();expect(f.saved.pendingStory).toBeUndefined();
 });
 it('uses the prepared source to reject a pre-call panel change for replay without touching MVU',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);await f.service.finishOutcome(await f.settle());
  const snapshot=f.adapter.read();const party=f.reprepare().party;alterPanel(f);const writes=f.replace.mock.calls.length;
  await expect(f.service.beginReplay('encounter',party,{},snapshot)).rejects.toThrow();
  expect(f.saved.pendingReplay).toBeUndefined();expect(f.replace).toHaveBeenCalledTimes(writes);
 });
 it('rechecks the source inside the repository transaction callback after its asynchronous wait',async()=>{
  const f=fixture();const mutate=f.update.getMockImplementation()!;
  f.update.mockImplementationOnce(async(id,revision,action,emptyQueue)=>{await Promise.resolve();alterPanel(f);return mutate(id,revision,action,emptyQueue);});
  await expect(f.begin()).rejects.toThrow();expect(f.saved.pendingStory).toBeUndefined();
 });
 it('requires an actually committed repository receipt before any HP write or queue removal',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);
  const uncommitted=completeStory(f.saved,f.result,f.events);expect(f.saved.settlements).toEqual([]);
  const accepted=await f.service.finishOutcome(uncommitted).then(()=>true,()=>false);
  expect({accepted,hp:f.hero['当前生命值'],queued:f.queue.length,writes:f.replace.mock.calls.length,committed:f.saved.settlements.length})
   .toEqual({accepted:false,hp:100,queued:1,writes:0,committed:0});
 });
 it('checks the caller receipt against the durable receipt before accepting modified factual damage',async()=>{
  const f=fixture();const ticket=await f.begin();await f.stageStory(ticket);const receipt=await f.settle();
  const tampered=jsonClone(receipt);tampered.report.units[0]!.hpDamage+=50;
  expect(()=>buildStoryWritebackRecord(tampered.storyOrigin!,tampered)).not.toThrow();
  const accepted=await f.service.finishOutcome(tampered).then(()=>true,()=>false);
  expect(f.saved.settlements).toEqual([receipt]);
  expect({accepted,queued:f.queue.length,writes:f.replace.mock.calls.length,acknowledged:f.marker()})
   .toEqual({accepted:false,queued:1,writes:0,acknowledged:undefined});
 });
});
