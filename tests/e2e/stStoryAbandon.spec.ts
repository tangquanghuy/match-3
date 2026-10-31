import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {installTavernChat,sentTavernMessages} from './tavernChat';

test.use({contextOptions:{reducedMotion:'reduce'}});

// This fixture owns its helpers and IndexedDB setup; shared host fixtures stay untouched.
async function installStory(page:Page,restricted=false){
 await installTavernChat(page);
 await page.goto('/sillytavern.html');
 await page.evaluate(async(restricted)=>{
  const entryPath='/src/sillytavern/hostEntry.ts';const storyPath='/src/sillytavern/storySession.ts';const writebackPath='/src/sillytavern/storyWriteback.ts';
  const contractPath='/src/session/contract.ts';const runtimePath='/src/sillytavern/battleRuntime.ts';const typesPath='/src/engine/types.ts';
  const {installStHost}=await import(/* @vite-ignore */entryPath) as typeof import('../../src/sillytavern/hostEntry');
  const {beginStory}=await import(/* @vite-ignore */storyPath) as typeof import('../../src/sillytavern/storySession');
  const {captureStoryWritebackOrigin}=await import(/* @vite-ignore */writebackPath) as typeof import('../../src/sillytavern/storyWriteback');
  const {BATTLE_SCHEMA_VERSION,RULESET_VERSION}=await import(/* @vite-ignore */contractPath);
  const {prepareStBattle}=await import(/* @vite-ignore */runtimePath);
  const {BaseColor}=await import(/* @vite-ignore */typesPath) as typeof import('../../src/engine/types');
  let chatId='story-chat';let variables:Record<string,unknown>={other:'preserve'};
  let state:{stat_data:Record<string,unknown>}={stat_data:{人物:{名称:'主角',当前生命值:23,生命值上限:40,临时生命值:0}}};let writes=0;
  const helpers={getContext:()=>({characterId:0,characters:[{avatar:'story.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId}),
   getVariables:()=>structuredClone(variables),updateVariablesWith:(updater:(v:Record<string,unknown>)=>Record<string,unknown>)=>variables=updater(variables),
   Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async(next:typeof state)=>{writes++;state=structuredClone(next);}}};
  const handle=await installStHost({hostWindow:window,helpers,hostId:'story-host'});const save=await handle.service.create();
  const actor=(externalId:string,name:string)=>({externalId,name,stats:{hp:40,attack:5,armor:0,magic:7},initialHp:23,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'});
  const request={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'unfinished-story',requestId:'unfinished-request',seed:42,playerTeam:[actor('/人物','主角')],enemyTeam:[actor('enemy','遗迹守卫')]};
  const origin=captureStoryWritebackOrigin((await handle.service.current()).snapshot,request.playerTeam);
  await handle.service.repository.update(save.id,save.revision,draft=>{
   draft.learnedAbilityIds=['gw_KnightsSword'];draft.balances={'material:kept':7};
   beginStory(draft,request,[{sourceId:'source',abilityId:'gw_KnightsSword',abilityName:'骑士剑技',rank:0,enemyExternalId:'enemy'}],'normal','encounter',origin);
   if(restricted)draft.pendingStory!.request.enemyTeam[0]!.skillId='st:7037';
  });
  await handle.open();
  const stored=(await handle.service.repository.list())[0]!;
  let gateError='';try{prepareStBattle(stored.pendingStory!.request);}catch(error){gateError=String(error);}
  Object.assign(window,{storyHost:handle,storyGateError:gateError,storySwitchChat:()=>{chatId='other-chat';},
   storyState:()=>structuredClone({state,variables,writes}),storyRead:async()=>(await handle.service.repository.list())[0],
   storyQueue:async()=>{
    const current=(await handle.service.repository.list())[0]!;const ticket=current.pendingStory!;const r=ticket.request;
    const result={schemaVersion:r.schemaVersion,rulesetVersion:r.rulesetVersion,battleId:r.battleId,requestId:r.requestId,seed:r.seed,winner:'player' as const,turns:2,
     combatants:[{externalId:'/人物',side:'player' as const,hp:20,maxHp:40,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy' as const,hp:0,maxHp:40,armor:0,defeated:true,statuses:[]}],
     defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'actual-outcome',economy:{gold:0,souls:0,gems:0,maps:0},eventSummary:[{type:'defeat',count:1}]};
    await handle.service.stageReplayOutcome(current.id,ticket,result,[{type:'defeat',characterId:4}],current.chat,'story');
   }});
 },restricted);
 return page.locator('#st-match3-host-root');
}

test('abandoning settles as a defeat, writes back facts and hands the report to the AI on continue',async({page})=>{
 // The surrender is built from the frozen request, without starting an engine.
 const host=await installStory(page,true);
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await expect(host.getByText('放弃按败北结算',{exact:false})).toBeVisible();
 const before=await page.evaluate(async()=>({save:await (window as any).storyRead(),host:(window as any).storyState()}));
 await host.getByRole('button',{name:'放弃战斗',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(before.save);
 await host.getByRole('button',{name:'确认放弃（按败北结算）',exact:true}).click();
 const result=page.locator('#st-match3-story-root main.result-screen');
 await expect(result).toBeVisible();
 await expect(result.getByRole('heading',{name:/战\s*斗\s*失\s*败/,level:1})).toBeVisible();
 await expect(result.locator('.settlement-grant')).toHaveCount(0);
 const after=await page.evaluate(async()=>({save:await (window as any).storyRead(),host:(window as any).storyState(),queue:(await (window as any).storyHost.service.repository.listReplayOutcomes()).length}));
 expect(after.save.pendingStory).toBeUndefined();expect(after.queue).toBe(0);
 expect(after.save.settlements).toHaveLength(1);
 expect(after.save.settlements[0]).toMatchObject({winner:'enemy',grants:[],learnedAbilityIds:[],result:{endReason:'surrender'}});
 expect(after.save.balances).toEqual(before.save.balances);expect(after.save.learnedAbilityIds).toEqual(before.save.learnedAbilityIds);
 expect(after.save.encounters).toEqual([]);expect(after.save.sources).toEqual([]);
 // Facts and unchanged HP go back through the normal writeback.
 expect(after.host.writes).toBe(1);expect(after.host.state.stat_data.人物.当前生命值).toBe(23);
 expect(after.host.state.stat_data).not.toHaveProperty('三消战果');expect(after.host.variables.match3.storyResults['unfinished-story'].battleId).toBe('unfinished-story');
 expect(after.host.variables.other).toBe('preserve');
 expect(await sentTavernMessages(page)).toEqual([]);
 await result.locator('#again').click();
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 const sent=await sentTavernMessages(page);expect(sent).toHaveLength(1);
 expect(sent[0]).toContain('【三消战报】');expect(sent[0]).toContain('我方放弃战斗，按败北结算');
 expect(sent[0]).toContain('- 遗迹守卫：仍可战斗');expect(sent[0]).not.toContain('三消养成所得');
 await page.evaluate(async()=>{await (window as any).storyHost.open();});
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await expect(host.getByRole('button',{name:'放弃战斗',exact:true})).toHaveCount(0);
});

test('actual outcome queued between confirmation clicks blocks abandonment in real IndexedDB',async({page})=>{
 const host=await installStory(page);const before=await page.evaluate(()=>(window as any).storyRead());
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await host.getByRole('button',{name:'放弃战斗',exact:true}).click();
 await page.evaluate(async()=>{await (window as any).storyQueue();});
 await host.getByRole('button',{name:'确认放弃（按败北结算）',exact:true}).click();
 await expect(host.getByRole('status')).toContainText('待保存战果');
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(before);
 expect(await page.evaluate(async()=>(await (window as any).storyHost.service.repository.listReplayOutcomes()).length)).toBe(1);
 expect(await sentTavernMessages(page)).toEqual([]);
});

test('switching chats at confirmation rejects the stale card without changing the original save',async({page})=>{
 const host=await installStory(page);const before=await page.evaluate(()=>(window as any).storyRead());
 await host.getByRole('tab',{name:'存档',exact:true}).click();
 await host.getByRole('button',{name:'放弃战斗',exact:true}).click();
 await page.evaluate(()=>{
  (window as any).storySwitchChat();
  const buttons=document.querySelector('#st-match3-host-root')!.shadowRoot!.querySelectorAll('button');
  [...buttons].find(b=>b.textContent==='确认放弃（按败北结算）')!.click();
 });
 await expect(host.getByRole('status')).toContainText('聊天已切换');
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(before);
});
