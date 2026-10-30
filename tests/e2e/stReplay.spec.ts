import {test,expect} from '@playwright/test';
import type {Page,FrameLocator} from '@playwright/test';
import type {BattleResult} from '../../src/session/contract';

test.use({contextOptions:{reducedMotion:'reduce'}});

async function install(page:Page):Promise<void>{
 await page.evaluate(async()=>{
   const entryPath='/src/sillytavern/hostEntry.ts';const domainPath='/src/sillytavern/save.ts';const contractPath='/src/session/contract.ts';
   const [entry,domain,contract]=await Promise.all([import(/* @vite-ignore */entryPath),import(/* @vite-ignore */domainPath),import(/* @vite-ignore */contractPath)]);
   let chatId='original';const vars:Record<string,Record<string,unknown>>={};
   const state={stat_data:{人物:{名称:'主角',当前生命值:25,生命值上限:100,临时生命值:7}}};
   const helpers={getContext:()=>({characterId:0,characters:[{avatar:'replay-card.png'}],chat:[{}],getCurrentChatId:()=>chatId}),getVariables:()=>vars[chatId]??{},updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>vars[chatId]=fn(vars[chatId]??{}),Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async()=>{throw new Error('replay should preserve ST HP');}}};
   const actor=(externalId:string,hp:number)=>({externalId,name:externalId,stats:{hp,attack:999,armor:0,magic:999},manaColors:['Blue'],manaCost:3,skillId:'gw_KnightsSword',initialHp:externalId==='hero'?25:hp});
   const party=[actor('hero',100)];
   const handle=await entry.installStHost({hostWindow:window,helpers,hostId:'replay-test',battleUrl:new URL('/sillytavern-battle.html',location.href).href,prepareReplay:async()=>({party})});
   let {save}=await handle.service.current();
   if(!save){
     save=await handle.service.create();
     const request={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'story',requestId:'story-request',seed:42,playerTeam:party,enemyTeam:[actor('enemy',1)],rules:{turnStart:[{side:'player',mana:{amount:3,targets:['hero']}}]}};
     const result={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'story',requestId:'story-request',seed:42,winner:'player',turns:1,combatants:[{externalId:'hero',side:'player',hp:25,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:1,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'story-digest',eventSummary:[]};
     const encounter=domain.recordEncounter(request,[{sourceId:'enemy-source',abilityId:'sword-ability',abilityName:'剑击',rank:4,enemyExternalId:'enemy'}],'normal','encounter');
     await handle.service.repository.update(save.id,save.revision,(draft:unknown)=>domain.settleSave(draft,{kind:'story',encounter,request,result,events:[]}));
   }
   Object.assign(window,{replayHost:handle,switchReplayChat:(id:string)=>{chatId=id;},readReplaySt:()=>structuredClone(state)});await handle.open();
 });
 await page.locator('#st-match3-host-root').getByRole('tab',{name:'往昔再现',exact:true}).click();
}

async function cancelUnfinishedReplay(page:Page):Promise<void>{
 await page.frameLocator('#st-match3-replay-root iframe').locator('body').evaluate(()=>{
  const params=new URLSearchParams(location.search);
  window.parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},params.get('parentOrigin')!);
 });
 await expect(page.locator('#st-match3-replay-root')).toHaveCount(0);
}

/** Retain the original resources and result before ACK can destroy the App. */
async function observeReplayLifecycle(frame:FrameLocator):Promise<void>{
 const initial=await frame.locator('body').evaluate(()=>{
   const win=window as any;const app=win.__stReplayApp;
   const observed=win.__replayLifecycle={app,ticker:app.app.ticker,canvas:document.querySelector('#app canvas')!,ackCount:0,outcome:undefined as {result:BattleResult;events:unknown[]}|undefined};
   const finish=app.onBattleFinished;
   app.onBattleFinished=(result:BattleResult)=>{
     observed.outcome={result:structuredClone(result),events:app.exportEvents()};
     finish(result);
   };
   const params=new URLSearchParams(location.search);
   window.addEventListener('message',event=>{
     const data=event.data;const result=observed.outcome?.result;
     if(event.source===parent&&event.origin===params.get('parentOrigin')&&data?.channel==='match3:st-replay:v1'&&data.nonce===params.get('nonce')&&data.type==='ack'&&result&&data.battleId===result.battleId&&data.requestId===result.requestId)observed.ackCount++;
   });
   return {destroyed:app.destroyed,tickerStarted:observed.ticker.started,canvasConnected:observed.canvas.isConnected};
 });
 expect(initial).toEqual({destroyed:false,tickerStarted:true,canvasConnected:true});
}

async function expectReplayRuntimeReleased(frame:FrameLocator):Promise<void>{
 await expect.poll(()=>frame.locator('body').evaluate(()=>{
   const observed=(window as any).__replayLifecycle;
   return {acknowledged:observed.ackCount>0,destroyed:observed.app.destroyed,tickerStarted:observed.ticker.started,canvasConnected:observed.canvas.isConnected,canvasCount:document.querySelectorAll('#app canvas').length,loadingCount:document.querySelectorAll('.bl-screen').length};
 })).toEqual({acknowledged:true,destroyed:true,tickerStarted:false,canvasConnected:false,canvasCount:0,loadingCount:0});
}

async function resubmitReleasedReplay(frame:FrameLocator):Promise<void>{
 await frame.locator('body').evaluate(()=>{
   const observed=(window as any).__replayLifecycle;
   if(!observed.outcome)throw new Error('Expected a cached completed battle before resubmitting');
   observed.ackCount=0;
   const params=new URLSearchParams(location.search);
   const data={channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'result',...observed.outcome};
   parent.postMessage(data,params.get('parentOrigin')!);parent.postMessage(data,params.get('parentOrigin')!);
 });
 await expect.poll(()=>frame.locator('body').evaluate(()=>(window as any).__replayLifecycle.ackCount)).toBeGreaterThanOrEqual(2);
}

test('successful replay ACK destroys the App, stops its ticker and removes the canvas before continue; duplicate results stay idempotent',async({page})=>{
 test.setTimeout(60_000);
 await page.addInitScript(()=>{localStorage.setItem('battle.skipCastConfirm','1');localStorage.setItem('battle.speed','4');});
 await page.goto('/sillytavern.html');await install(page);
 await page.locator('#st-match3-host-root').getByRole('button',{name:'重复挑战'}).click();
 const replay=page.locator('#st-match3-replay-root');const frame=page.frameLocator('#st-match3-replay-root iframe');
 await expect(frame.locator('.gcard.ally')).toHaveCount(1,{timeout:30_000});
 await page.waitForFunction(()=>{const app=(document.querySelector('#st-match3-replay-root')!.shadowRoot!.querySelector('iframe')!.contentWindow as any).__stReplayApp;return app&&!app.startupPlaying&&!app.player.isPlaying()&&app.engine.getState().activePlayer==='Left';});
 await observeReplayLifecycle(frame);
 await frame.locator('body').evaluate(()=>{const app=(window as any).__stReplayApp;const caster=app.engine.getState().teams.Left.characters[0];caster.mana=caster.manaCost;void app.castPlayerSkill(caster.id);});
 if(await frame.locator('.aim-overlay').count())await frame.locator('.gcard.enemy').first().click();
 await expect(replay.locator('main.result-screen')).toBeVisible({timeout:30_000});
 await expect(replay.locator('#again')).toBeEnabled();await expect(replay.locator('iframe')).toBeHidden();
 await expectReplayRuntimeReleased(frame);
 const grants=replay.getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward');
 await expect(grants).toHaveText(/\+1\s*enemy的灵魂碎片/);
 const readSaved=()=>page.evaluate(async()=>{const service=(window as any).replayHost.service;return {save:(await service.current()).save,queue:await service.repository.listReplayOutcomes()};});
 const committed=await readSaved();
 expect(committed.save.pendingReplay).toBeUndefined();expect(committed.save.sources[0].wins).toBe(2);expect(committed.save.settlements).toHaveLength(2);expect(committed.queue).toHaveLength(0);
 await resubmitReleasedReplay(frame);
 expect(await readSaved()).toEqual(committed);await expect(grants).toHaveText(/\+1\s*enemy的灵魂碎片/);
 await expectReplayRuntimeReleased(frame);
 await replay.locator('#again').click();await expect(replay).toHaveCount(0);
});

test('actual replay frame saves named fragments once to its original chat and leaves ST HP intact',async({page})=>{
 test.setTimeout(60_000);
 await page.addInitScript(()=>{localStorage.setItem('battle.skipCastConfirm','1');localStorage.setItem('battle.speed','4');});
 await page.goto('/sillytavern.html');await install(page);
 const host=page.locator('#st-match3-host-root');await host.getByRole('button',{name:'重复挑战'}).click();
 const replay=page.locator('#st-match3-replay-root');const frame=page.frameLocator('iframe[title="往昔再现战场"]');
 await expect(frame.locator('.gcard.ally')).toHaveCount(1,{timeout:30_000});await expect(frame.locator('.gcard.enemy')).toHaveCount(1);
 const snapshot=await page.evaluate(()=>{const win=document.querySelector<HTMLIFrameElement>('#st-match3-replay-root')!.shadowRoot!.querySelector('iframe')!.contentWindow as any;return win.__stReplayApp.getBattleRequest();});
 expect(snapshot.playerTeam[0].initialHp).toBe(100);expect(snapshot.enemyTeam[0].stats.hp).toBe(1);
 await page.evaluate(async()=>{const host=(window as any).replayHost;(window as any).switchReplayChat('other');await host.service.create();const repo=host.service.repository;const original=repo.update.bind(repo);let failOnce=true;repo.update=(...args:unknown[])=>{if(failOnce){failOnce=false;return Promise.reject(new Error('测试：存档暂时忙碌'));}return original(...args);};});
 // Only this frame and nonce may deliver the result, even for a valid pending battle ID.
 await page.evaluate(()=>{const root=document.querySelector('#st-match3-replay-root')!;const iframe=root.shadowRoot!.querySelector('iframe')!;const nonce=new URL(iframe.src).searchParams.get('nonce');window.postMessage({channel:'match3:st-replay:v1',nonce,type:'result',result:{battleId:'fake',requestId:'fake'},events:[]},location.origin);});
 await page.waitForFunction(()=>{const win=document.querySelector('#st-match3-replay-root')!.shadowRoot!.querySelector('iframe')!.contentWindow as any;const app=win.__stReplayApp;return app&&!app.startupPlaying&&!app.player.isPlaying()&&app.engine.getState().activePlayer==='Left';});
 await observeReplayLifecycle(frame);
 // Drive a real legal cast through App; only the test's initial mana setup is artificial.
 await frame.locator('body').evaluate(()=>{const app=(window as any).__stReplayApp;const caster=app.engine.getState().teams.Left.characters[0];caster.mana=caster.manaCost;void app.castPlayerSkill(caster.id);});
 if(await frame.locator('.aim-overlay').count())await frame.locator('.gcard.enemy').first().click();
 await expect(replay.getByRole('status')).toHaveText('测试：存档暂时忙碌 · 战果已暂存，可返回后重试',{timeout:30_000});
 await expect(replay.getByRole('button',{name:'导出本场战果'})).toBeVisible();
 const beforeRetry=await page.evaluate(async()=>{const saves=await (window as any).replayHost.service.repository.list();return saves.find((s:any)=>s.chat.chatId==='original');});expect(beforeRetry.sources[0].wins).toBe(1);expect(beforeRetry.pendingReplay).toBeDefined();await replay.getByRole('button',{name:'重试保存战果'}).click();
 await expect(replay.locator('main.result-screen')).toBeVisible({timeout:30_000});
 await expect(replay.getByRole('heading',{name:/战\s*斗\s*胜\s*利/,level:1})).toBeVisible();
 await expect(replay.locator('.bar')).toBeHidden();
 await expect(replay.getByRole('status')).toBeHidden();
 await expect(replay.getByRole('button',{name:'导出本场战果'})).toBeHidden();
 await expect(replay.locator('#again')).toBeVisible();
 await expect(replay.getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward')).toHaveText(/\+1\s*enemy的灵魂碎片/);await expect(replay.locator('.settlement-grant')).toHaveCount(1);
 await expectReplayRuntimeReleased(frame);
 await resubmitReleasedReplay(frame);
 const saved=await page.evaluate(async()=>({saves:await (window as any).replayHost.service.repository.list(),state:(window as any).readReplaySt()}));
 const original=saved.saves.find((s:any)=>s.chat.chatId==='original');const other=saved.saves.find((s:any)=>s.chat.chatId==='other');
 expect(original.sources[0].wins).toBe(2);expect(original.settlements).toHaveLength(2);expect(original.pendingReplay).toBeUndefined();expect(original.balances).toEqual({});expect(other.settlements).toHaveLength(0);
 expect(saved.state.stat_data.人物).toEqual({名称:'主角',当前生命值:25,生命值上限:100,临时生命值:7});
 await replay.locator('#again').click();await host.getByRole('tab',{name:'存档',exact:true}).click();await expect(host.getByText('当前 · other')).toBeVisible();
});

test('unfinished replay survives reopening and manual abandonment grants nothing',async({page})=>{
 await page.goto('/sillytavern.html');await install(page);const host=page.locator('#st-match3-host-root');
 await host.getByRole('button',{name:'重复挑战'}).click();await cancelUnfinishedReplay(page);
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await expect(host.getByRole('button',{name:'重新开始本场'})).toBeVisible();
 const before=await page.evaluate(async()=>(await (window as any).replayHost.service.current()).save.pendingReplay);
 await page.reload();await install(page);await host.getByRole('tab',{name:'存档',exact:true}).click();await expect(host.getByRole('button',{name:'重新开始本场'})).toBeVisible();
 expect(await page.evaluate(async()=>(await (window as any).replayHost.service.current()).save.pendingReplay)).toEqual(before);
 await host.getByRole('button',{name:'重新开始本场'}).click();await cancelUnfinishedReplay(page);
 await host.getByRole('button',{name:'放弃本场',exact:true}).click();await host.getByRole('button',{name:'确认放弃本场'}).click();await host.getByRole('tab',{name:'往昔再现',exact:true}).click();await expect(host.getByRole('button',{name:'重复挑战'})).toBeVisible();
 const after=await page.evaluate(async()=>(await (window as any).replayHost.service.current()).save);expect(after.pendingReplay).toBeUndefined();expect(after.sources[0].wins).toBe(1);expect(after.settlements).toHaveLength(1);
});


test('durable replay outcome survives host reload, blocks abandonment, and retries once with visible grants',async({page})=>{
 test.setTimeout(60_000);
 await page.addInitScript(()=>{localStorage.setItem('battle.skipCastConfirm','1');localStorage.setItem('battle.speed','4');});
 await page.goto('/sillytavern.html');await install(page);
 const host=page.locator('#st-match3-host-root');await host.getByRole('button',{name:'重复挑战'}).click();
 const replay=page.locator('#st-match3-replay-root');const frame=page.frameLocator('iframe[title="往昔再现战场"]');
 await expect(frame.locator('.gcard.ally')).toHaveCount(1,{timeout:30_000});
 await page.evaluate(()=>{(window as any).replayHost.service.repository.update=()=>Promise.reject(new Error('模拟结算存储暂时失败'));});
 await page.waitForFunction(()=>{const app=(document.querySelector('#st-match3-replay-root')!.shadowRoot!.querySelector('iframe')!.contentWindow as any).__stReplayApp;return app&&!app.startupPlaying&&!app.player.isPlaying()&&app.engine.getState().activePlayer==='Left';});
 await frame.locator('body').evaluate(()=>{const app=(window as any).__stReplayApp;const caster=app.engine.getState().teams.Left.characters[0];caster.mana=caster.manaCost;void app.castPlayerSkill(caster.id);});
 if(await frame.locator('.aim-overlay').count())await frame.locator('.gcard.enemy').first().click();
 await expect(replay.getByRole('status')).toContainText('战果已暂存',{timeout:30_000});
 const queued=await page.evaluate(async()=>{const service=(window as any).replayHost.service;const [outcome]=await service.repository.listReplayOutcomes();let abandon='';try{await service.abandonReplay(outcome.result.battleId);}catch(e){abandon=String(e);}let deletion='';try{await service.delete(outcome.saveId);}catch(e){deletion=String(e);}return {id:outcome.result.battleId,abandon,deletion};});
 expect(queued.abandon).toContain('已有实际战果');expect(queued.deletion).toContain('待保存战果');
 await page.reload();await install(page);
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await expect(host.getByRole('region',{name:'待保存战果'})).toBeVisible();
 await expect(host.getByRole('button',{name:'重新开始本场'})).toHaveCount(0);
 await host.getByRole('button',{name:'保存本场战果'}).click();
 await expect(host.getByRole('region',{name:'刚保存的本场结算'}).getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward')).toHaveText(/\+1\s*enemy的灵魂碎片/);
 const state=await page.evaluate(async()=>{const service=(window as any).replayHost.service;return {save:(await service.current()).save,queue:await service.repository.listReplayOutcomes()};});
 expect(state.queue).toHaveLength(0);expect(state.save.pendingReplay).toBeUndefined();expect(state.save.sources[0].wins).toBe(2);expect(state.save.settlements.filter((r:any)=>r.battleId===queued.id)).toHaveLength(1);
 await page.reload();await install(page);await expect(host.getByRole('region',{name:'待保存战果'})).toHaveCount(0);
});
