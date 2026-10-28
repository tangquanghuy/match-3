import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

// This fixture owns its helpers and IndexedDB setup; shared host fixtures stay untouched.
async function installStory(page:Page,restricted=false){
 await page.goto('/sillytavern.html');
 await page.evaluate(async(restricted)=>{
  const entryPath='/src/sillytavern/hostEntry.ts';const storyPath='/src/sillytavern/storySession.ts';
  const contractPath='/src/session/contract.ts';const runtimePath='/src/sillytavern/battleRuntime.ts';const typesPath='/src/engine/types.ts';
  const {installStHost}=await import(/* @vite-ignore */entryPath) as typeof import('../../src/sillytavern/hostEntry');
  const {beginStory}=await import(/* @vite-ignore */storyPath) as typeof import('../../src/sillytavern/storySession');
  const {BATTLE_SCHEMA_VERSION,RULESET_VERSION}=await import(/* @vite-ignore */contractPath);
  const {prepareStBattle}=await import(/* @vite-ignore */runtimePath);
  const {BaseColor}=await import(/* @vite-ignore */typesPath) as typeof import('../../src/engine/types');
  let chatId='story-chat';let variables:Record<string,unknown>={other:'preserve'};
  const state={stat_data:{人物:{名称:'主角',当前生命值:23,生命值上限:40,临时生命值:7}}};let writes=0;
  const helpers={getContext:()=>({characterId:0,characters:[{avatar:'story.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId}),
   getVariables:()=>structuredClone(variables),updateVariablesWith:(updater:(v:Record<string,unknown>)=>Record<string,unknown>)=>variables=updater(variables),
   Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async()=>{writes++;}}};
  const handle=await installStHost({hostWindow:window,helpers,hostId:'story-host'});const save=await handle.service.create();
  const actor=(externalId:string)=>({externalId,name:externalId,stats:{hp:40,attack:5,armor:0,magic:7},initialHp:23,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'});
  const request={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'unfinished-story',requestId:'unfinished-request',seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]};
  await handle.service.repository.update(save.id,save.revision,draft=>{
   draft.learnedAbilityIds=['gw_KnightsSword'];draft.equippedAbilities={hero:'gw_KnightsSword'};draft.balances={'material:kept':7};
   beginStory(draft,request,[{sourceId:'source',abilityId:'gw_KnightsSword',abilityName:'骑士剑技',rank:0,enemyExternalId:'enemy'}],'normal','encounter');
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
     combatants:[{externalId:'hero',side:'player' as const,hp:20,maxHp:40,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy' as const,hp:0,maxHp:40,armor:0,defeated:true,statuses:[]}],
     defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'actual-outcome',economy:{gold:0,souls:0,gems:0,maps:0},eventSummary:[{type:'defeat',count:1}]};
    await handle.service.stageReplayOutcome(current.id,ticket,result,[{type:'defeat',characterId:4}],current.chat,'story');
   }});
 },restricted);
 return page.locator('#st-match3-host-root');
}

test('old restricted story can be backed up or abandoned only after two explicit clicks',async({page})=>{
 const host=await installStory(page,true);
 expect(await page.evaluate(()=>(window as any).storyGateError)).not.toBe('');
 await expect(host.getByRole('button',{name:'导出备份',exact:true})).toBeVisible();
 await expect(host.getByText('旧版战斗配置可能暂受限制。',{exact:false})).toBeVisible();
 const before=await page.evaluate(async()=>({save:await (window as any).storyRead(),host:(window as any).storyState()}));
 await host.getByRole('button',{name:'放弃未结算剧情',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(before.save);
 await host.getByRole('button',{name:'确认放弃未结算剧情',exact:true}).click();
 await expect(host.getByText('待完成的剧情战斗',{exact:true})).toHaveCount(0);
 const after=await page.evaluate(async()=>({save:await (window as any).storyRead(),host:(window as any).storyState()}));
 const expected={...before.save,revision:before.save.revision+1,updatedAt:after.save.updatedAt};delete expected.pendingStory;
 expect(after.save).toEqual(expected);expect(after.host).toEqual(before.host);expect(after.host.writes).toBe(0);
 await page.evaluate(async()=>{await (window as any).storyHost.open();});
 await expect(host.getByRole('button',{name:'放弃未结算剧情',exact:true})).toHaveCount(0);
});

test('actual outcome queued between confirmation clicks blocks abandonment in real IndexedDB',async({page})=>{
 const host=await installStory(page);const before=await page.evaluate(()=>(window as any).storyRead());
 await host.getByRole('button',{name:'放弃未结算剧情',exact:true}).click();
 await page.evaluate(async()=>{await (window as any).storyQueue();});
 await host.getByRole('button',{name:'确认放弃未结算剧情',exact:true}).click();
 await expect(host.getByRole('status')).toContainText('待保存战果');
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(before);
 expect(await page.evaluate(async()=>(await (window as any).storyHost.service.repository.listReplayOutcomes()).length)).toBe(1);
});

test('a revision change between confirmation clicks keeps the story ticket',async({page})=>{
 const host=await installStory(page);
 await host.getByRole('button',{name:'放弃未结算剧情',exact:true}).click();
 const updated=await page.evaluate(async()=>{const h=(window as any).storyHost;const save=await (window as any).storyRead();return h.service.repository.update(save.id,save.revision,()=>{});});
 await host.getByRole('button',{name:'确认放弃未结算剧情',exact:true}).click();
 await expect(host.getByRole('status')).toContainText('存档已由其他页面更新');
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(updated);
});

test('switching chats at confirmation rejects the stale card without changing the original save',async({page})=>{
 const host=await installStory(page);const before=await page.evaluate(()=>(window as any).storyRead());
 await host.getByRole('button',{name:'放弃未结算剧情',exact:true}).click();
 await page.evaluate(()=>{
  (window as any).storySwitchChat();
  const buttons=document.querySelector('#st-match3-host-root')!.shadowRoot!.querySelectorAll('button');
  [...buttons].find(b=>b.textContent==='确认放弃未结算剧情')!.click();
 });
 await expect(host.getByRole('status')).toContainText('聊天已切换');
 expect(await page.evaluate(()=>(window as any).storyRead())).toEqual(before);
});
