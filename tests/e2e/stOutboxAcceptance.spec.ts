import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import type {TavernHelpers} from '../../src/sillytavern/hostAdapter';
import type {StHostHandle} from '../../src/sillytavern/hostEntry';
import type {AbilitySource,PendingReplay} from '../../src/sillytavern/save';
import type {ReplayOutcome,StSaveRepository} from '../../src/sillytavern/saveRepository';

test.use({contextOptions:{reducedMotion:'reduce'}});

interface OutboxFixture {
 handle:StHostHandle;peer:StSaveRepository;saveId:string;ticket:PendingReplay;
 outcome:ReplayOutcome;backup:string;party:CombatantSnapshot[];
 storyRequest:BattleRequest;sources:AbilitySource[];
 failCleanup():void;restoreCleanup():void;launch():void;
 receiptVisibleBeforeCleanup?:boolean;
}
declare global {interface Window {__stOutboxAcceptance:OutboxFixture}}

// Every test uses a fresh browser context and real IndexedDB connections.
// Only fault scheduling and the launcher's iframe transport are controlled here.
async function install(page:Page):Promise<void>{
 await page.evaluate(async()=>{
   const entryPath='/src/sillytavern/hostEntry.ts';
   const domainPath='/src/sillytavern/save.ts';
   const repositoryPath='/src/sillytavern/saveRepository.ts';
   const contractPath='/src/session/contract.ts';
   const launcherPath='/src/sillytavern/replayLauncher.ts';
   const enginePath='/src/engine/types.ts';
   const entry=await import(/* @vite-ignore */entryPath) as typeof import('../../src/sillytavern/hostEntry');
   const domain=await import(/* @vite-ignore */domainPath) as typeof import('../../src/sillytavern/save');
   const repository=await import(/* @vite-ignore */repositoryPath) as typeof import('../../src/sillytavern/saveRepository');
   const contract=await import(/* @vite-ignore */contractPath) as typeof import('../../src/session/contract');
   const launcher=await import(/* @vite-ignore */launcherPath) as typeof import('../../src/sillytavern/replayLauncher');
   const {BaseColor}=await import(/* @vite-ignore */enginePath) as typeof import('../../src/engine/types');
   const variables:Record<string,unknown>={};
   const state={stat_data:{人物:{名称:'主角',当前生命值:100,生命值上限:100,临时生命值:0}}};
   const helpers:TavernHelpers={
     getContext:()=>({characterId:0,characters:[{avatar:'outbox-acceptance.png'}],chat:[{}],getCurrentChatId:()=>'outbox-chat'}),
     getVariables:()=>variables,
     updateVariablesWith:fn=>{const next={...fn(variables)};for(const key of Object.keys(variables))delete variables[key];Object.assign(variables,next);},
     Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async()=>{throw new Error('Replay must preserve host HP');}},
   };
   const actor=(externalId:string,hp:number):CombatantSnapshot=>({externalId,name:externalId,stats:{hp,attack:999,armor:0,magic:999},manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword',initialHp:hp});
   const party=[actor('hero',100)];
   const storyRequest:BattleRequest={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'outbox-story',requestId:'outbox-story-request',seed:42,playerTeam:party,enemyTeam:[actor('enemy',1)]};
   const sources:AbilitySource[]=[{sourceId:'enemy-source',abilityId:'sword-ability',abilityName:'剑击',rank:4,enemyExternalId:'enemy'}];
   const win=(request:BattleRequest):BattleResult=>({schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner:'player',turns:1,combatants:[{externalId:'hero',side:'player',hp:100,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:1,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'digest-'+request.battleId,eventSummary:[]});
   const handle=await entry.installStHost({hostWindow:window,helpers,hostId:'outbox-acceptance'});
   const repo=handle.service.repository;
   let {save}=await handle.service.current();
   if(!save){
     save=await handle.service.create();
     const encounter=domain.recordEncounter(storyRequest,sources,'normal','outbox-encounter');
     save=await repo.update(save.id,save.revision,draft=>{domain.settleSave(draft,{kind:'story',encounter,request:storyRequest,result:win(storyRequest),events:[]});});
   }
   const queued=(await repo.listReplayOutcomes()).find(o=>o.saveId===save!.id);
   const ticket=(queued?.ticket??save.pendingReplay??await handle.service.beginReplay('outbox-encounter',party)) as PendingReplay;
   const outcome:ReplayOutcome=queued??{version:1,saveId:save.id,chat:save.chat,ticket,result:win(ticket.request),events:[],createdAt:Date.now()};
   const peer=await repository.StSaveRepository.open();
   const raw=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('match3.sillytavern.v1',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const remove=repo.removeReplayOutcome.bind(repo);
   window.__stOutboxAcceptance={handle,peer,saveId:save.id,ticket,outcome,backup:await repo.export(save.id),party,storyRequest,sources,
     failCleanup:()=>{repo.removeReplayOutcome=battleId=>new Promise<void>((resolve,reject)=>{
       const tx=raw.transaction('replayOutbox','readwrite');
       tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('acceptance: outbox cleanup transaction aborted'));
       tx.objectStore('replayOutbox').delete(battleId);tx.abort();
     });},
     restoreCleanup:()=>{repo.removeReplayOutcome=remove;},
     launch:()=>{void launcher.openStReplay({hostWindow:window,service:handle.service,saveId:save!.id,chat:save!.chat,ticket,battleUrl:new URL('/__st_outbox_transport.html',location.href).href});},
   };
 });
}

async function state(page:Page){
 return page.evaluate(async()=>{const f=window.__stOutboxAcceptance;return {save:(await f.peer.list()).find(s=>s.id===f.saveId),queue:await f.peer.listReplayOutcomes()};});
}

test.beforeEach(async({page})=>{await page.goto('/sillytavern.html');await install(page);});

test('staging after an empty abandonment preflight atomically preserves the original ticket',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const f=window.__stOutboxAcceptance;const repo=f.handle.service.repository;
   const read=repo.listReplayOutcomes.bind(repo);let injected=false;let failure='';
   repo.listReplayOutcomes=async()=>{const before=await read();if(!injected){injected=true;await f.peer.stageReplayOutcome(f.outcome);}return before;};
   try{await f.handle.service.abandonReplay(f.outcome.result.battleId);}catch(error){failure=String(error);}finally{repo.listReplayOutcomes=read;}
   return {failure,injected};
 });
 expect(actual.injected).toBe(true);expect(actual.failure).toContain('待保存战果');
 const before=await state(page);expect(before.save?.pendingReplay).toEqual(before.queue[0]?.ticket);expect(before.queue).toHaveLength(1);
 await page.evaluate(async()=>{const f=window.__stOutboxAcceptance;await f.handle.service.retryReplayOutcome(f.outcome);});
 const after=await state(page);expect(after.queue).toHaveLength(0);expect(after.save?.sources[0]?.wins).toBe(2);expect(after.save?.settlements).toHaveLength(2);
});

test('abandonment that commits first rejects late staging and the pending backup can be restored',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const f=window.__stOutboxAcceptance;await f.handle.service.abandonReplay(f.outcome.result.battleId);
   let failure='';try{await f.peer.stageReplayOutcome(f.outcome);}catch(error){failure=String(error);}
   const before={save:(await f.peer.list())[0],queue:await f.peer.listReplayOutcomes()};
   await f.handle.service.delete(f.saveId);await f.handle.service.import(f.backup);
   await f.handle.service.importReplayOutcome(JSON.stringify(f.outcome));await f.handle.service.retryReplayOutcome(f.outcome);
   return {failure,before};
 });
 expect(actual.failure).toContain('原始战斗配置');expect(actual.before.queue).toHaveLength(0);expect(actual.before.save.pendingReplay).toBeUndefined();
 const after=await state(page);expect(after.queue).toHaveLength(0);expect(after.save?.sources[0]?.wins).toBe(2);expect(after.save?.settlements).toHaveLength(2);
});

for(const kind of ['replay','story'] as const){
 test(`${kind} start rechecks a result staged after its empty preflight in the write transaction`,async({page})=>{
   const actual=await page.evaluate(async(kind)=>{
     const f=window.__stOutboxAcceptance;const repo=f.handle.service.repository;
     const read=repo.listReplayOutcomes.bind(repo);let injected=false;let failure='';
     repo.listReplayOutcomes=async()=>{const before=await read();if(!injected){injected=true;await f.peer.stageReplayOutcome(f.outcome);}return before;};
     try{
       if(kind==='replay')await f.handle.service.beginReplay('outbox-encounter',f.party);
       else await f.handle.service.beginStory({...f.storyRequest,battleId:'next-story',requestId:'next-story-request'},f.sources,'normal','next-encounter');
     }catch(error){failure=String(error);}finally{repo.listReplayOutcomes=read;}
     return {failure,injected,ticket:f.ticket};
   },kind);
   expect(actual.injected).toBe(true);expect(actual.failure).toContain('待保存战果');
   const after=await state(page);expect(after.queue).toHaveLength(1);expect(after.save?.pendingReplay).toEqual(actual.ticket);expect(after.save?.pendingStory).toBeUndefined();expect(after.save?.sources[0]?.wins).toBe(1);
 });
}

test('queue recovery renders committed named grants after cleanup abort, then survives reload and retries once',async({page})=>{
 await page.evaluate(async()=>{const f=window.__stOutboxAcceptance;await f.peer.stageReplayOutcome(f.outcome);f.failCleanup();await f.handle.open();});
 const host=page.locator('#st-match3-host-root');
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await host.getByRole('button',{name:'保存本场战果',exact:true}).click();
 await expect(host.getByRole('region',{name:'刚保存的本场结算'}).getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward')).toHaveText(/\+1\s*enemy的灵魂碎片/);
 await expect(host.getByRole('status')).toContainText('acceptance: outbox cleanup transaction aborted');
 const committed=await state(page);expect(committed.queue).toHaveLength(1);expect(committed.save?.sources[0]?.wins).toBe(2);expect(committed.save?.settlements).toHaveLength(2);expect(committed.save?.pendingReplay).toBeUndefined();
 const receipt=committed.save!.settlements.find(r=>r.battleId===committed.queue[0].result.battleId)!;
 expect(receipt.grants).toEqual([{kind:'fragment',id:'enemy-source',name:'enemy的灵魂碎片',quantity:1}]);
 await page.reload();await install(page);await page.evaluate(async()=>{await window.__stOutboxAcceptance.handle.open();});
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await expect(host.getByRole('region',{name:'待保存战果'})).toBeVisible();
 await host.getByRole('button',{name:'保存本场战果',exact:true}).click();
 await expect(host.getByRole('region',{name:'刚保存的本场结算'}).getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward')).toHaveText(/\+1\s*enemy的灵魂碎片/);
 await expect(host.getByRole('region',{name:'待保存战果'})).toHaveCount(0);
 const after=await state(page);expect(after.save).toMatchObject({sources:committed.save!.sources,balances:committed.save!.balances,settlements:committed.save!.settlements});expect(after.queue).toHaveLength(0);
});

test('launcher shows the committed receipt before cleanup and retries an aborted cleanup without duplicate grants',async({page})=>{
 await page.route('**/__st_outbox_transport.html*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>outbox transport fixture</body></html>'}));
 await page.evaluate(()=>{
   const f=window.__stOutboxAcceptance;f.failCleanup();const finish=f.handle.service.finishOutcome.bind(f.handle.service);
   f.handle.service.finishOutcome=async receipt=>{const detail=document.querySelector('#st-match3-replay-root')!.shadowRoot!.querySelector<HTMLElement>('.settlement')!;const native=detail.firstElementChild?.shadowRoot?.querySelector<HTMLElement>('main.result-screen');f.receiptVisibleBeforeCleanup=!detail.hidden&&!!native&&native.getBoundingClientRect().height>0&&!!native.querySelector('.settlement-grant.rs-reward')?.textContent?.includes('enemy的灵魂碎片');await finish(receipt);};
   f.launch();
 });
 const replay=page.locator('#st-match3-replay-root');
 const outcome=await page.evaluate(()=>window.__stOutboxAcceptance.outcome);
 await page.frameLocator('iframe[title="往昔再现战场"]').locator('body').evaluate((_,outcome)=>{parent.postMessage({channel:'match3:st-replay:v1',nonce:new URLSearchParams(location.search).get('nonce'),type:'result',result:outcome.result,events:outcome.events},location.origin);},outcome);
 await expect(replay.getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward')).toHaveText(/\+1\s*enemy的灵魂碎片/);
 await expect(replay.getByRole('status')).toContainText('本场奖励已入账');await expect(replay.getByRole('status')).toContainText('acceptance: outbox cleanup transaction aborted');
 await expect(replay.locator('#again')).toBeEnabled();
 await expect(replay.getByRole('button',{name:'继续',exact:true})).toHaveCount(1);
 await expect(replay.getByRole('button',{name:'导出本场战果'})).toBeVisible();
 expect(await page.evaluate(()=>window.__stOutboxAcceptance.receiptVisibleBeforeCleanup)).toBe(true);
 const committed=await state(page);expect(committed.queue).toHaveLength(1);expect(committed.save?.sources[0]?.wins).toBe(2);
 await page.evaluate(()=>window.__stOutboxAcceptance.restoreCleanup());await replay.getByRole('button',{name:'重试保存战果'}).click();
 await expect(replay.locator('main.result-screen')).toBeVisible();
 await expect(replay.locator('.bar')).toBeHidden();
 await expect(replay.getByRole('status')).toBeHidden();
 await expect(replay.getByRole('button',{name:'导出本场战果'})).toBeHidden();
 await expect(replay.locator('#again')).toBeEnabled();
 const after=await state(page);expect(after.queue).toHaveLength(0);expect(after.save?.settlements).toEqual(committed.save?.settlements);expect(after.save?.sources).toEqual(committed.save?.sources);expect(after.save?.balances).toEqual(committed.save?.balances);
 await replay.locator('#again').click();await expect(replay).toHaveCount(0);
});

test('a matching old receipt remains authoritative with a newer pending replay, and both service starts block its queue',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const f=window.__stOutboxAcceptance;const service=f.handle.service;
   const receipt=await service.completeReplay(f.saveId,f.outcome.result,f.outcome.events);
   const next=await service.beginReplay('outbox-encounter',f.party);
   await service.importReplayOutcome(JSON.stringify(f.outcome));
   const failures:string[]=[];
   for(const start of [()=>service.beginReplay('outbox-encounter',f.party),()=>service.beginStory({...f.storyRequest,battleId:'next-story',requestId:'next-story-request'},f.sources,'normal','next-encounter')]){
     try{await start();failures.push('unexpected success');}catch(error){failures.push(String(error));}
   }
   const retried=await service.retryReplayOutcome(f.outcome);return {receipt,retried,next,failures};
 });
 expect(actual.failures).toHaveLength(2);for(const failure of actual.failures)expect(failure).toContain('待处理战果');expect(actual.retried).toEqual(actual.receipt);
 const after=await state(page);expect(after.queue).toHaveLength(0);expect(after.save?.pendingReplay).toEqual(actual.next);expect(after.save?.sources[0]?.wins).toBe(2);expect(after.save?.settlements).toHaveLength(2);
});

for(const first of ['delete','stage'] as const){
 test(`${first} wins the delete/stage transaction race without an orphan outcome; backup recovery remains usable`,async({page})=>{
   const actual=await page.evaluate(async(first)=>{
     const f=window.__stOutboxAcceptance;const repo=f.handle.service.repository;
     const operations=first==='delete'?[repo.delete(f.saveId),f.peer.stageReplayOutcome(f.outcome)]:[f.peer.stageReplayOutcome(f.outcome),repo.delete(f.saveId)];
     const results=await Promise.allSettled(operations);
     const before={saves:await repo.list(),queue:await repo.listReplayOutcomes()};
     if(first==='delete'){await f.handle.service.import(f.backup);await f.handle.service.importReplayOutcome(JSON.stringify(f.outcome));}
     // A concurrent delete must remain blocked while retry still has a queued result.
     const retryAndDelete=await Promise.allSettled([f.handle.service.retryReplayOutcome(f.outcome),f.peer.delete(f.saveId)]);
     return {results:results.map(r=>({status:r.status,error:r.status==='rejected'?String(r.reason):''})),before,retryAndDelete:retryAndDelete.map(r=>({status:r.status,error:r.status==='rejected'?String(r.reason):''}))};
   },first);
   expect(actual.results.map(r=>r.status)).toEqual(['fulfilled','rejected']);
   if(first==='delete'){expect(actual.results[1].error).toContain('原存档已删除');expect(actual.before.saves).toHaveLength(0);expect(actual.before.queue).toHaveLength(0);}
   else{expect(actual.results[1].error).toContain('待保存战果');expect(actual.before.saves).toHaveLength(1);expect(actual.before.queue).toHaveLength(1);}
   expect(actual.retryAndDelete.map(r=>r.status)).toEqual(['fulfilled','rejected']);expect(actual.retryAndDelete[1].error).toContain('待保存战果');
   const after=await state(page);expect(after.queue).toHaveLength(0);expect(after.save?.sources[0]?.wins).toBe(2);expect(after.save?.settlements).toHaveLength(2);expect(after.save?.pendingReplay).toBeUndefined();
 });
}

test('staging and backup import reject a changed complete ticket or conflicting committed result without changing durable facts',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const f=window.__stOutboxAcceptance;const service=f.handle.service;const failures:string[]=[];
   const changed=structuredClone(f.outcome);changed.ticket.encounterId='different-encounter';
   for(const action of [()=>f.peer.stageReplayOutcome(changed),()=>service.importReplayOutcome(JSON.stringify(changed))]){
     try{await action();failures.push('unexpected success');}catch(error){failures.push(String(error));}
   }
   const before=await f.peer.listReplayOutcomes();
   await f.peer.stageReplayOutcome(f.outcome);await service.retryReplayOutcome(f.outcome);
   const committed=(await f.peer.list()).find(s=>s.id===f.saveId)!;
   const conflict=structuredClone(f.outcome);conflict.result.actionLogDigest='conflicting-result';
   for(const action of [()=>f.peer.stageReplayOutcome(conflict),()=>service.importReplayOutcome(JSON.stringify(conflict))]){
     try{await action();failures.push('unexpected success');}catch(error){failures.push(String(error));}
   }
   return {failures,before,committed};
 });
 expect(actual.before).toHaveLength(0);expect(actual.failures).toHaveLength(4);for(const failure of actual.failures)expect(failure).not.toBe('unexpected success');
 expect(actual.failures[0]).toContain('原始战斗配置');expect(actual.failures[1]).toContain('原始战斗配置');
 const after=await state(page);expect(after.queue).toHaveLength(0);expect(after.save).toEqual(actual.committed);
});
