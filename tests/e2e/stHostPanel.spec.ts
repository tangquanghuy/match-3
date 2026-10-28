import {test,expect} from '@playwright/test';
import type {Page,Locator} from '@playwright/test';
import type {InstallStHostOptions,StHostHandle,StoryPlan,ReplayParty} from '../../src/sillytavern/hostEntry';
import type {TavernHelpers} from '../../src/sillytavern/hostAdapter';
import type {BattleRequest,BattleResult} from '../../src/session/contract';

interface PanelFixture {
 handle:StHostHandle;
 plan:StoryPlan;
 party:ReplayParty;
 helpers:TavernHelpers;
 controller:AbortController;
 state:{stat_data:{系统配置:Record<string,unknown>;人物:Record<string,unknown>}};
 setMode(value:unknown):void;
 setChat(value:string):void;
 seedEncounter():Promise<void>;
 result(request:BattleRequest):BattleResult;
}
declare global {interface Window {stHostPanelFixture:PanelFixture}}

async function install(page:Page,options:{launcher?:boolean;requireModeEnabled?:boolean;mode?:boolean;flipReplayMode?:boolean;companionCount?:number}={}) {
 await page.goto('/sillytavern.html');
 await page.evaluate(async options=>{
  const load=(path:string)=>import(/* @vite-ignore */path);
  const {installStHost}=await load('/src/sillytavern/hostEntry.ts') as typeof import('../../src/sillytavern/hostEntry');
  const {prepareCurrentParty,partyAbilityChoices}=await load('/src/sillytavern/partyPreparation.ts') as typeof import('../../src/sillytavern/partyPreparation');
  const {compileEnemyBlueprint}=await load('/src/sillytavern/enemyBlueprint.ts') as typeof import('../../src/sillytavern/enemyBlueprint');
  const {PORTRAITS,savePortrait}=await load('/src/sillytavern/portraits.ts') as typeof import('../../src/sillytavern/portraits');
  const {settleSave}=await load('/src/sillytavern/save.ts') as typeof import('../../src/sillytavern/save');
  const {BATTLE_SCHEMA_VERSION,RULESET_VERSION}=await load('/src/session/contract.ts') as typeof import('../../src/session/contract');
  const actor=()=>({名称:'主角',等级:20,生命值上限:200,当前生命值:100,临时生命值:0,AC:14,
   属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},
   战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},装备列表:{}});
  const companion=()=>({...actor(),同行誓约:true,三消:{颜色:['Purple','Green']}});
  const bonds=options.companionCount===undefined?{同伴甲:companion()}:Object.fromEntries(Array.from({length:options.companionCount},(_,index)=>[`同伴${String(index+1).padStart(2,'0')}`,companion()]));
  const state={stat_data:{人物:actor(),羁绊列表:bonds,系统配置:{三消战斗模式:options.mode} as Record<string,unknown>}};
  let chatId='panel-chat';const variables:Record<string,Record<string,unknown>>={};
  const helpers:TavernHelpers={getContext:()=>({characterId:0,characters:[{avatar:'panel.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId}),
   getVariables:()=>structuredClone(variables[chatId]??{}),
   updateVariablesWith:fn=>variables[chatId]=fn(structuredClone(variables[chatId]??{})),
   Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async next=>{Object.assign(state,structuredClone(next));}}};
  const controller=new AbortController();
  const handle=await installStHost({hostWindow:window,helpers,hostId:'panel-tests',battleUrl:new URL('/sillytavern-battle.html',location.href).href,
   launcher:options.launcher,requireModeEnabled:options.requireModeEnabled,signal:controller.signal,
   ...(options.flipReplayMode?{prepareReplay:async()=>{state.stat_data.系统配置.三消战斗模式=false;return fixture.party;}}:{})});
  const save=await handle.service.create();
  await handle.service.repository.update(save.id,save.revision,draft=>{draft.learnedAbilityIds=[partyAbilityChoices()[1]!.abilityId];});
  const current=await handle.service.current();
  const party=prepareCurrentParty(current.snapshot,{mode:'replay',save:current.save}).party;
  const portrait=PORTRAITS[0]!;const query={manaColors:[...portrait.manaColors],rank:portrait.rank,form:portrait.form,role:portrait.role};
  const enemy=compileEnemyBlueprint({portrait:savePortrait(query,portrait),externalId:'panel-enemy',level:1,difficulty:1});
  const fixture:PanelFixture={handle,helpers,controller,state,party:{party},plan:{enemies:[enemy],difficulty:'面板测试',seed:42},
   setMode:value=>{state.stat_data.系统配置.三消战斗模式=value;},setChat:value=>{chatId=value;},
   result:request=>({schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner:'player',turns:3,
    combatants:[...request.playerTeam.map(unit=>({externalId:unit.externalId,side:'player' as const,hp:unit.stats.hp,maxHp:unit.stats.hp,armor:0,defeated:false,statuses:[]})),
     ...request.enemyTeam.map(unit=>({externalId:unit.externalId,side:'enemy' as const,hp:0,maxHp:unit.stats.hp,armor:0,defeated:true,statuses:[]}))],
    defeatedExternalIds:request.enemyTeam.map(unit=>unit.externalId),summonedCount:0,actionLogDigest:'panel-digest',eventSummary:[]}),
   seedEncounter:async()=>{
    const current=(await handle.service.current()).save!;
    const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'panel-story',requestId:'panel-story-request',seed:42,playerTeam:party,enemyTeam:[enemy.snapshot]};
    const encounter={id:'panel-encounter',storyBattleId:request.battleId,enemyTeam:request.enemyTeam,sources:[{sourceId:'panel-source',abilityId:'active:panel-source',abilityName:'面板测试能力',rank:4,enemyExternalId:'panel-enemy'}],difficulty:'面板测试',seed:42};
    await handle.service.repository.update(current.id,current.revision,draft=>{settleSave(draft,{kind:'story',encounter,request,result:fixture.result(request),events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:8},{kind:'material',id:'iron',name:'铁矿石',quantity:2}]});});
   }};
  window.stHostPanelFixture=fixture;
 },options);
}
const host=(page:Page)=>page.locator('#st-match3-host-root');
const panel=(page:Page)=>host(page).locator('section.management-page');
const management=(page:Page)=>panel(page).getByRole('dialog',{name:'编队与能力装配管理',exact:true});
async function selectTab(page:Page,name:string){await panel(page).getByRole('tab',{name,exact:true}).click();}
async function open(page:Page){await page.evaluate(()=>window.stHostPanelFixture.handle.open());}
async function saveState(page:Page){return page.evaluate(async()=>(await window.stHostPanelFixture.handle.service.current()).save!);}

test('defaults retain the floating launcher and permit an unset mode',async({page})=>{
 await install(page);
 await host(page).getByRole('button',{name:'三消存档',exact:true}).click();
 await expect(panel(page)).toBeVisible();
 await expect(panel(page)).toHaveAttribute('aria-label','三消编队、图鉴与魂片');
 await expect(panel(page).getByRole('heading',{name:'编队与养成',exact:true})).toBeVisible();
 await host(page).getByRole('button',{name:'关闭',exact:true}).click();
 await expect(host(page).getByRole('button',{name:'三消存档',exact:true})).toBeFocused();
});

for(const viewport of [{width:1280,height:720},{width:390,height:844}])test(`standalone management fills ${viewport.width}px and shows only the active tab`,async({page})=>{
 await page.setViewportSize(viewport);await install(page,{launcher:false});
 await page.evaluate(()=>window.stHostPanelFixture.seedEncounter());await open(page);
 await expect(panel(page)).toHaveAttribute('aria-label','三消编队、图鉴与魂片');
 await expect.poll(()=>panel(page).boundingBox()).toEqual({x:0,y:0,...viewport});
 const tabs=panel(page).getByRole('tablist');
 await expect(tabs.getByRole('tab')).toHaveText(['编队','魂片收藏','往昔再现','战斗记录','存档']);
 await expect(tabs.getByRole('tab',{name:'编队与能力装配',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(management(page)).toBeVisible();
 await expect(panel(page).getByRole('button',{name:'剧情挑战',exact:true,includeHidden:true})).toHaveCount(0);
 await expect(panel(page).locator('[aria-label="确认剧情挑战"]')).toHaveCount(0);
 const regions=['魂片收藏','往昔再现','战斗记录','存档槽位'];
 for(const name of regions)await expect(panel(page).locator(`section[aria-label="${name}"]`)).toBeHidden();
 const before=await saveState(page);
 for(const [tab,region] of [['魂片收藏','魂片收藏'],['往昔再现','往昔再现'],['战斗记录','战斗记录'],['存档','存档槽位']] as const){
  await selectTab(page,tab);
  await expect(tabs.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');
  await expect(tabs.locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(management(page)).toBeHidden();
  for(const name of regions){
   const section=panel(page).locator(`section[aria-label="${name}"]`);
   if(name===region)await expect(section).toBeVisible();else await expect(section).toBeHidden();
  }
 }
 await selectTab(page,'编队与能力装配');await expect(management(page)).toBeVisible();
 expect(await saveState(page)).toEqual(before);
});

test('management tabs support keyboard navigation and restore the embedded formation',async({page})=>{
 await install(page,{launcher:false});await open(page);
 const tabs=panel(page).getByRole('tablist');const formation=tabs.getByRole('tab',{name:'编队与能力装配',exact:true});
 await formation.focus();await formation.press('ArrowRight');
 await expect(tabs.getByRole('tab',{name:'魂片收藏',exact:true})).toBeFocused();
 await expect(management(page)).toBeHidden();
 await tabs.getByRole('tab',{name:'魂片收藏',exact:true}).press('End');
 await expect(tabs.getByRole('tab',{name:'存档',exact:true})).toHaveAttribute('aria-selected','true');
 await tabs.getByRole('tab',{name:'存档',exact:true}).press('Home');
 await expect(formation).toBeFocused();await expect(management(page)).toBeVisible();
});
test('launcher false exposes the management panel only through its handle',async({page})=>{
 await install(page,{launcher:false,requireModeEnabled:true,mode:true});
 await expect(host(page).locator('button.launch')).toHaveCount(0);
 await open(page);
 await expect(management(page)).toBeVisible();
 await host(page).getByRole('button',{name:'关闭',exact:true}).click();
 await expect(panel(page)).toBeHidden();
 await open(page);
 await selectTab(page,'存档');
 await expect(host(page).getByText('1 / 3 个槽位已使用',{exact:true})).toBeVisible();
});

for(const value of [undefined,false,'true',1])test(`strict mode rejects ${String(value)} on open using the latest MVU value`,async({page})=>{
 await install(page,{launcher:false,requireModeEnabled:true,mode:true});
 await page.evaluate(value=>window.stHostPanelFixture.setMode(value),value);
 const alert=page.waitForEvent('dialog');const opening=open(page);const dialog=await alert;
 expect(dialog.message()).toContain('三消战斗模式已关闭');await dialog.accept();await opening;
 await expect(panel(page)).toBeHidden();
 await page.evaluate(()=>window.stHostPanelFixture.setMode(true));await open(page);
 await expect(panel(page)).toBeVisible();
});

test('new story and replay starts use the current mode after the panel opens',async({page})=>{
 await install(page,{requireModeEnabled:true,mode:true});await open(page);
 await page.evaluate(()=>window.stHostPanelFixture.setMode(false));
 const before=await saveState(page);
 const errors=await page.evaluate(async()=>{
  const f=window.stHostPanelFixture;const errors:string[]=[];
  for(const start of [()=>f.handle.playStory(f.plan),()=>f.handle.playReplay('panel-encounter',f.party)]){
   try{await start();errors.push('started');}catch(error){errors.push((error as Error).message);}
  }return errors;
 });
 expect(errors).toEqual([expect.stringContaining('三消战斗模式已关闭'),expect.stringContaining('三消战斗模式已关闭')]);
 expect(await saveState(page)).toEqual(before);
 await expect(page.locator('#st-match3-story-root,#st-match3-replay-root')).toHaveCount(0);
 expect(await saveState(page)).not.toHaveProperty('pendingStory');expect(await saveState(page)).not.toHaveProperty('pendingReplay');
});

test('direct story start rechecks a mode disabled while rereading the saved party',async({page})=>{
 await install(page,{requireModeEnabled:true,mode:true});await open(page);
 await page.evaluate(()=>{
  const f=window.stHostPanelFixture;const current=f.handle.service.current.bind(f.handle.service);let reads=0;
  f.handle.service.current=async()=>{
   const result=await current();
   if(++reads===2){f.setMode(false);f.handle.service.current=current;}
   return result;
  };
  void f.handle.playStory(f.plan).catch(error=>{document.body.dataset.panelError=(error as Error).message;});
 });
 await expect(page.locator('body')).toHaveAttribute('data-panel-error',/三消战斗模式已关闭/);
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备',exact:true})).toHaveCount(0);
 expect(await saveState(page)).not.toHaveProperty('pendingStory');await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
});

test('replay rechecks the mode after a custom asynchronous party provider',async({page})=>{
 await install(page,{requireModeEnabled:true,mode:true,flipReplayMode:true});
 await page.evaluate(()=>window.stHostPanelFixture.seedEncounter());await open(page);
 await selectTab(page,'往昔再现');
 await host(page).getByRole('button',{name:'重复挑战',exact:true}).click();
 await expect(host(page).getByRole('status')).toContainText('三消战斗模式已关闭');
 expect(await saveState(page)).not.toHaveProperty('pendingReplay');await expect(page.locator('#st-match3-replay-root')).toHaveCount(0);
});

for(const mode of ['story','replay'] as const){
 for(const invalid of ['missing-member','invalid-stats'] as const)test(`direct ${mode} rejects ${invalid} without creating pending or changing rewards`,async({page})=>{
  await install(page,{requireModeEnabled:true,mode:true});
  if(mode==='replay')await page.evaluate(()=>window.stHostPanelFixture.seedEncounter());
  await open(page);
  if(mode==='replay')await selectTab(page,'往昔再现');
  await page.evaluate(async invalid=>{
   const f=window.stHostPanelFixture;const {save}=await f.handle.service.current();
   if(invalid==='missing-member')await f.handle.service.repository.update(save!.id,save!.revision,draft=>{
    draft.partyPreparation={memberRefs:['/人物','/羁绊列表/已离队'],baseAbilities:{},weaponBindings:{}};
   });
   else f.state.stat_data.人物.生命值上限='invalid';
  },invalid);
  const before=await saveState(page);
  if(mode==='story')await page.evaluate(()=>{
   const f=window.stHostPanelFixture;void f.handle.playStory(f.plan).catch(error=>{document.body.dataset.panelError=(error as Error).message;});
  });
  else await host(page).getByRole('button',{name:'重复挑战',exact:true}).click();
  const expected=invalid==='missing-member'?'当前人物/羁绊列表中没有角色':'生命值上限';
  if(mode==='story')await expect(page.locator('body')).toHaveAttribute('data-panel-error',new RegExp(expected));
  else await expect(host(page).getByRole('status')).toContainText(expected);
  await expect(page.getByRole('dialog',{name:/剧情战斗队伍准备|往昔再现队伍准备/})).toHaveCount(0);
  await expect(page.locator('#st-match3-story-root,#st-match3-replay-root')).toHaveCount(0);
  expect(await saveState(page)).toEqual(before);
  expect(before.pendingStory).toBeUndefined();expect(before.pendingReplay).toBeUndefined();
  expect(await page.evaluate(()=>window.stHostPanelFixture.handle.service.repository.listReplayOutcomes())).toEqual([]);
 });

 test(`direct ${mode} reads the latest saved order, learned equipment and host stats`,async({page})=>{
  await install(page,{requireModeEnabled:true,mode:true});
  if(mode==='replay')await page.evaluate(()=>window.stHostPanelFixture.seedEncounter());
  await open(page);
  if(mode==='replay')await selectTab(page,'往昔再现');
  const before=await saveState(page);
  await page.evaluate(async mode=>{
   const f=window.stHostPanelFixture;const current=f.handle.service.current.bind(f.handle.service);
   const update=async()=>{
    const {save}=await current();
    await f.handle.service.repository.update(save!.id,save!.revision,draft=>{
     draft.partyPreparation={memberRefs:['/羁绊列表/同伴甲','/人物'],baseAbilities:{},weaponBindings:{}};
     draft.equippedAbilities['/羁绊列表/同伴甲']=draft.learnedAbilityIds[0]!;
    });
    Object.assign(f.state.stat_data.人物,{等级:21,生命值上限:240,当前生命值:73});
   };
   if(mode==='story'){
    // Change both sources after the initial read, before automatic preparation rereads them.
    f.handle.service.current=async()=>{f.handle.service.current=current;const stale=await current();await update();return stale;};
    void f.handle.playStory(f.plan).catch(error=>{document.body.dataset.panelError=(error as Error).message;});
   }else await update(); // The replay button still holds the save rendered before this update.
  },mode);
  if(mode==='replay')await host(page).getByRole('button',{name:'重复挑战',exact:true}).click();
  const root=mode==='story'?'#st-match3-story-root':'#st-match3-replay-root';
  await expect(page.frameLocator(`${root} iframe`).locator('.gcard.ally')).toHaveCount(2);
  await expect(page.getByRole('dialog',{name:/剧情战斗队伍准备|往昔再现队伍准备/})).toHaveCount(0);
  const after=await saveState(page);const ticket=mode==='story'?after.pendingStory!:after.pendingReplay!;
  const expected=await page.evaluate(async mode=>{
   const path='/src/sillytavern/partyPreparation.ts';
   const {prepareCurrentParty}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/partyPreparation');
   const {snapshot,save}=await window.stHostPanelFixture.handle.service.current();
   const prepared=prepareCurrentParty(snapshot,{...save!.partyPreparation,save,mode});
   return {ready:prepared.ready,party:prepared.party};
  },mode);
  expect(expected.ready).toBe(true);expect(ticket.request.playerTeam).toEqual(expected.party);
  expect(ticket.request.playerTeam.map(unit=>unit.externalId)).toEqual(['/羁绊列表/同伴甲','/人物']);
  const hero=ticket.request.playerTeam[1]!;
  if(mode==='story')expect(hero.initialHp).toBeLessThan(hero.stats.hp);
  else expect(hero.initialHp).toBe(hero.stats.hp);
  expect(after.equippedAbilities['/羁绊列表/同伴甲']).toBe(after.learnedAbilityIds[0]);
  expect(after.settlements).toEqual(before.settlements);expect(after.balances).toEqual(before.balances);
  await page.frameLocator(`${root} iframe`).locator('body').evaluate(()=>{
   const params=new URLSearchParams(location.search);
   parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},location.origin);
  });
  await expect(page.locator(root)).toHaveCount(0);expect(await saveState(page)).toEqual(after);
 });
}

test('management persists ordered members and learned equipment without starting a battle',async({page})=>{
 await install(page,{launcher:false,requireModeEnabled:true,mode:true});
 await page.evaluate(()=>window.stHostPanelFixture.seedEncounter());
 await page.evaluate(()=>{const f=window.stHostPanelFixture;f.state.stat_data.人物.当前生命值=0;f.state.stat_data.人物.临时生命值=7;});
 await open(page);const before=await saveState(page);const dialog=management(page);
 await expect(dialog).toBeVisible();
 await dialog.locator('.mini[data-member-ref="/羁绊列表/同伴甲"]').click();
 const companion=dialog.locator('.member-config[data-member-ref="/羁绊列表/同伴甲"]');
 await expect(companion).toBeVisible();
 await expect(dialog.locator('.member-config')).toHaveCount(1);
 await dialog.locator('.inspect').getByRole('button',{name:'加入队伍',exact:true}).click();
 await companion.getByRole('combobox',{name:'基础主动能力',exact:true}).selectOption({index:1});
 await companion.getByRole('combobox',{name:'装配已学能力',exact:true}).selectOption({index:1});
 await dialog.locator('.slot-wrap[data-member-ref="/羁绊列表/同伴甲"]').getByRole('button',{name:'上移',exact:true}).click();
 await dialog.getByRole('button',{name:'保存编队与能力装配',exact:true}).click();
 await expect.poll(async()=>(await saveState(page)).partyPreparation?.memberRefs).toEqual(['/羁绊列表/同伴甲','/人物']);
 await expect(panel(page)).toBeVisible();await expect(management(page)).toBeVisible();
 const after=await saveState(page);
 expect(after.partyPreparation!.memberRefs).toEqual(['/羁绊列表/同伴甲','/人物']);
 expect(after.equippedAbilities['/羁绊列表/同伴甲']).toBe(after.learnedAbilityIds[0]);
 expect(after).not.toHaveProperty('pendingStory');expect(after).not.toHaveProperty('pendingReplay');
 expect(after.balances).toEqual(before.balances);expect(after.settlements).toEqual(before.settlements);expect(after.sources).toEqual(before.sources);
 await expect(page.locator('#st-match3-story-root,#st-match3-replay-root')).toHaveCount(0);
 await selectTab(page,'魂片收藏');await selectTab(page,'编队与能力装配');
 await expect(management(page).locator('.slot-wrap').first()).toHaveAttribute('data-member-ref','/羁绊列表/同伴甲');
 await management(page).locator('.mini[data-member-ref="/羁绊列表/同伴甲"]').click();
 await expect(management(page).locator('.member-config[data-member-ref="/羁绊列表/同伴甲"]').getByRole('combobox',{name:'装配已学能力',exact:true})).toHaveValue(after.learnedAbilityIds[0]!);
 await management(page).locator('.inspect').getByRole('button',{name:'移出队伍',exact:true}).click();
 await expect(management(page).locator('.slot-wrap[data-member-ref="/羁绊列表/同伴甲"]')).toHaveCount(0);
 await management(page).getByRole('button',{name:'取消',exact:true}).click();
 await expect(panel(page)).toBeVisible();await expect(management(page)).toBeVisible();
 await expect(management(page).locator('.slot-wrap').first()).toHaveAttribute('data-member-ref','/羁绊列表/同伴甲');
 expect(await saveState(page)).toEqual(after);
});

test('management rejects a chat switch, clears its old editor and preserves existing settings',async({page})=>{
 await install(page,{mode:true,requireModeEnabled:true});await open(page);const before=await saveState(page);
 const dialog=management(page);const confirm=dialog.getByRole('button',{name:'保存编队与能力装配',exact:true});await expect(confirm).toBeEnabled();
 await confirm.evaluate(button=>{window.stHostPanelFixture.setChat('other-chat');(button as HTMLButtonElement).click();});
 await expect(dialog).toHaveCount(0);
 await expect(host(page).getByRole('status')).toContainText('当前聊天已切换');
 await expect(host(page).getByRole('button',{name:'创建当前聊天存档',exact:true})).toBeVisible();
 await page.evaluate(()=>window.stHostPanelFixture.setChat('panel-chat'));
 expect((await saveState(page)).partyPreparation).toEqual(before.partyPreparation);
 expect((await saveState(page)).equippedAbilities).toEqual(before.equippedAbilities);
});

test('pending replay restoration and saving actual rewards continue after mode is disabled',async({page})=>{
 await install(page,{mode:true,requireModeEnabled:true});
 await page.evaluate(async()=>{const f=window.stHostPanelFixture;await f.seedEncounter();await f.handle.service.beginReplay('panel-encounter',f.party.party);});await open(page);
 const before=await saveState(page);
 await page.evaluate(()=>{const f=window.stHostPanelFixture;f.setMode(false);void f.handle.playReplay('panel-encounter',{party:[]});});
 await expect(page.locator('#st-match3-replay-root iframe')).toBeVisible();
 await page.frameLocator('#st-match3-replay-root iframe').locator('body').evaluate(()=>{
  const params=new URLSearchParams(location.search);
  window.parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},params.get('parentOrigin')!);
 });
 await expect(page.locator('#st-match3-replay-root')).toHaveCount(0);
 await expect(panel(page)).toBeVisible();
 await page.evaluate(async()=>{
  const f=window.stHostPanelFixture;const save=(await f.handle.service.current()).save!;const ticket=save.pendingReplay!;
  await f.handle.service.stageReplayOutcome(save.id,ticket,f.result(ticket.request),[],save.chat);
  // Refresh through the existing UI path; reopening the panel itself is mode gated.
 });
 await selectTab(page,'存档');
 await host(page).getByRole('button',{name:'刷新',exact:true}).click();
 await host(page).getByRole('button',{name:'保存本场战果',exact:true}).click();
 const receipt=host(page).getByRole('region',{name:'刚保存的本场结算',exact:true});
 await expect(receipt).toContainText('面板测试能力灵魂碎片');
 const after=await saveState(page);expect(after).not.toHaveProperty('pendingReplay');
 expect(after.settlements).toHaveLength(before.settlements.length+1);expect(after.sources[0]!.wins).toBe(before.sources[0]!.wins+1);
 await expect(host(page).getByRole('button',{name:'保存本场战果',exact:true})).toHaveCount(0);
});

for(const runtimeLifecycle of [undefined,false])test(`helper pagehide lifecycle respects runtimeLifecycle=${String(runtimeLifecycle)}`,async({page})=>{
 await install(page,{launcher:false});
 await page.evaluate(()=>window.stHostPanelFixture.handle.destroy());
 await page.evaluate(()=>{const frame=document.createElement('iframe');frame.name='stHostPanel-helper';document.body.append(frame);});
 const frame=page.frame({name:'stHostPanel-helper'})!;
 await frame.evaluate(async runtimeLifecycle=>{
  const path='/src/sillytavern/hostEntry.ts';const {installStHost}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/hostEntry');
  const f=window.parent.stHostPanelFixture;
  f.handle=await installStHost({hostWindow:window.parent,helpers:f.helpers,hostId:'panel-tests',launcher:false,runtimeLifecycle,signal:f.controller.signal} satisfies InstallStHostOptions);
  await f.handle.open();window.dispatchEvent(new PageTransitionEvent('pagehide'));
 },runtimeLifecycle);
 if(runtimeLifecycle===undefined){await expect(host(page)).toHaveCount(0);expect(await page.evaluate(()=>window.stHostPanelFixture.handle.destroyed)).toBe(true);return;}
 expect(await page.evaluate(()=>window.stHostPanelFixture.handle.destroyed)).toBe(false);
 await expect(panel(page)).toBeVisible();
 await page.evaluate(async()=>{const f=window.stHostPanelFixture;await f.handle.open();await f.handle.service.repository.list();});
 await expect(panel(page)).toBeVisible();
 await page.evaluate(()=>window.stHostPanelFixture.controller.abort());await expect(host(page)).toHaveCount(0);
 expect(await page.evaluate(()=>window.stHostPanelFixture.handle.destroyed)).toBe(true);
});

test('top host pagehide still clears a detached runtime panel',async({page})=>{
 await install(page,{launcher:false});
 await page.evaluate(async()=>{
  const f=window.stHostPanelFixture;f.handle.destroy();
  const path='/src/sillytavern/hostEntry.ts';const {installStHost}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/hostEntry');
  f.handle=await installStHost({hostWindow:window,helpers:f.helpers,hostId:'panel-tests',launcher:false,runtimeLifecycle:false});
  const bottom=document.createElement('iframe');document.body.append(bottom);bottom.remove();
  await f.handle.open();
 });
 await expect(panel(page)).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await expect(host(page)).toHaveCount(0);
});


test('regression: queued settlement stays in saves when its async save finishes on another tab',async({page})=>{
 await install(page,{mode:true,requireModeEnabled:true});
 await page.evaluate(async()=>{
  const f=window.stHostPanelFixture;await f.seedEncounter();
  const ticket=await f.handle.service.beginReplay('panel-encounter',f.party.party);
  const save=(await f.handle.service.current()).save!;
  await f.handle.service.stageReplayOutcome(save.id,ticket,f.result(ticket.request),[],save.chat);
  const retry=f.handle.service.retryReplayOutcome.bind(f.handle.service);
  f.handle.service.retryReplayOutcome=async outcome=>{
   // Hold the real save until the user has selected a different page.
   await new Promise<void>(resolve=>{
    window.addEventListener('panel-release-outcome-save',()=>resolve(),{once:true});
    document.body.dataset.panelOutcomeSaveStarted='true';
   });
   return retry(outcome);
  };
 });
 const before=await saveState(page);await open(page);await selectTab(page,'存档');
 await host(page).getByRole('button',{name:'保存本场战果',exact:true}).click();
 await expect(page.locator('body')).toHaveAttribute('data-panel-outcome-save-started','true');
 await selectTab(page,'魂片收藏');
 await page.evaluate(()=>window.dispatchEvent(new Event('panel-release-outcome-save')));
 const receipt=panel(page).locator('[role="region"][aria-label="刚保存的本场结算"]');
 await expect(receipt).toHaveCount(1);await expect(receipt).toBeHidden();
 await expect(panel(page).getByRole('tab',{name:'魂片收藏',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(panel(page).getByRole('region',{name:'魂片收藏',exact:true})).toBeVisible();
 const after=await saveState(page);
 expect(after.pendingReplay).toBeUndefined();expect(after.settlements).toHaveLength(before.settlements.length+1);
 expect(after.sources[0]!.wins).toBe(before.sources[0]!.wins+1);
 expect(await page.evaluate(()=>window.stHostPanelFixture.handle.service.repository.listReplayOutcomes())).toEqual([]);
 await selectTab(page,'存档');
 await expect(receipt).toBeVisible();
 await expect(receipt.getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward')).toHaveText(/\+1\s*面板测试能力灵魂碎片/);
 await expect(host(page).getByRole('button',{name:'保存本场战果',exact:true})).toHaveCount(0);
});

test('regression: direct replay remounts the active party editor after startup failure and cancellation',async({page})=>{
 await page.route('**/sillytavern-battle.html?**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>panel replay transport</body>'}));
 await install(page,{mode:true,requireModeEnabled:true});
 await page.evaluate(()=>window.stHostPanelFixture.seedEncounter());await open(page);
 await expect(management(page).getByRole('button',{name:'保存编队与能力装配',exact:true})).toBeEnabled();
 const originalEditor=await management(page).elementHandle();const before=await saveState(page);
 const failure=await page.evaluate(async()=>{
  const f=window.stHostPanelFixture;const begin=f.handle.service.beginReplay.bind(f.handle.service);
  f.handle.service.beginReplay=async()=>{throw new Error('fixture replay startup failure');};
  try{await f.handle.playReplay('panel-encounter',f.party);return 'unexpected success';}
  catch(error){return String(error);}finally{f.handle.service.beginReplay=begin;}
 });
 expect(failure).toContain('fixture replay startup failure');
 expect(await originalEditor!.evaluate(node=>node.isConnected)).toBe(false);
 await expect(panel(page)).toBeVisible();await expect(management(page)).toHaveCount(1);
 await expect(management(page).getByRole('button',{name:'保存编队与能力装配',exact:true})).toBeEnabled();
 expect(await saveState(page)).toEqual(before);
 const restoredEditor=await management(page).elementHandle();
 await page.evaluate(()=>{
  const f=window.stHostPanelFixture;
  void f.handle.playReplay('panel-encounter',f.party).then(
   ()=>{document.body.dataset.panelReplayFinished='true';},
   error=>{document.body.dataset.panelReplayError=String(error);}
  );
 });
 const battle=page.locator('#st-match3-replay-root');
 await expect(battle.locator('iframe')).toBeVisible();await expect(panel(page)).toBeHidden();
 expect(await restoredEditor!.evaluate(node=>node.isConnected)).toBe(false);
 const pending=(await saveState(page)).pendingReplay;expect(pending).toBeTruthy();
 await page.frameLocator('#st-match3-replay-root iframe').locator('body').evaluate(()=>{
  const params=new URLSearchParams(location.search);
  parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},params.get('parentOrigin')!);
 });
 await expect(page.locator('body')).toHaveAttribute('data-panel-replay-finished','true');
 await expect(page.locator('body')).not.toHaveAttribute('data-panel-replay-error',/.+/);
 await expect(battle).toHaveCount(0);await expect(panel(page)).toBeVisible();
 await expect(panel(page).getByRole('tab',{name:'编队与能力装配',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(management(page)).toHaveCount(1);
 await expect(management(page).getByRole('button',{name:'保存编队与能力装配',exact:true})).toBeEnabled();
 const after=await saveState(page);
 expect(after.pendingReplay).toEqual(pending);expect(after.partyPreparation).toEqual(before.partyPreparation);
 expect(after.equippedAbilities).toEqual(before.equippedAbilities);expect(after.settlements).toEqual(before.settlements);
 expect(after.balances).toEqual(before.balances);expect(after.sources).toEqual(before.sources);
});


// Check every clipping ancestor, including the outer management panel across the embedded shadow root.
async function expectUnclipped(control:Locator){
 await control.scrollIntoViewIfNeeded();
 await expect(control).toBeVisible();
 await expect(control).toBeInViewport({ratio:0.98});
 const clipped=await control.evaluate(element=>{
  const rect=element.getBoundingClientRect();const failures:string[]=[];
  const parent=(node:Element):Element|null=>node.parentElement??((node.getRootNode() as ShadowRoot).host??null);
  for(let ancestor=parent(element);ancestor;ancestor=parent(ancestor)){
   const style=getComputedStyle(ancestor);const bounds=ancestor.getBoundingClientRect();
   if(/auto|scroll|hidden|clip/.test(style.overflowY)&&(rect.top<bounds.top-1||rect.bottom>bounds.bottom+1))failures.push(`${ancestor.className}: vertical ${rect.top}..${rect.bottom} outside ${bounds.top}..${bounds.bottom}`);
   if(/auto|scroll|hidden|clip/.test(style.overflowX)&&(rect.left<bounds.left-1||rect.right>bounds.right+1))failures.push(`${ancestor.className}: horizontal ${rect.left}..${rect.right} outside ${bounds.left}..${bounds.right}`);
  }
  return failures;
 });
 expect(clipped).toEqual([]);
}

test('regression: native roster pagination keeps desktop details and configuration reachable after search',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await install(page,{launcher:false,companionCount:12});await open(page);
 const dialog=management(page);const cards=dialog.locator('.mini');const roster=dialog.locator('.panel.roster');
 const pager=dialog.locator('.pager');const next=pager.getByRole('button',{name:'下一页',exact:true});
 const previous=pager.getByRole('button',{name:'上一页',exact:true});const label=dialog.locator('#pageLabel');
 const search=dialog.getByPlaceholder('搜索成员');
 await expect(dialog.locator('#ownedCount')).toHaveText('13');await expect(cards).toHaveCount(12);
 const grid=await cards.evaluateAll(elements=>{
  const rects=elements.map(el=>el.getBoundingClientRect());
  return {columns:new Set(rects.map(r=>Math.round(r.left))).size,rows:new Set(rects.map(r=>Math.round(r.top))).size};
 });
 expect(grid).toEqual({columns:6,rows:2});
 await expect(pager).toBeVisible();await expect(label).toHaveText('1 / 2');await expect(previous).toBeDisabled();
 await next.click();await expect(label).toHaveText('2 / 2');await expect(cards).toHaveCount(1);await expect(next).toBeDisabled();
 const lastCard=dialog.locator('.mini[data-member-ref="/羁绊列表/同伴12"]');
 await lastCard.click();await expect(dialog.locator('.inspect-name > b')).toHaveText('同伴12');
 const configuration=dialog.locator('.member-config[data-member-ref="/羁绊列表/同伴12"]');
 const base=configuration.getByRole('combobox',{name:'基础主动能力',exact:true});
 const learned=configuration.getByRole('combobox',{name:'装配已学能力',exact:true});
 await expectUnclipped(base);await base.selectOption({index:1});
 await expectUnclipped(learned);await learned.selectOption({index:1});
 const selected={base:await base.inputValue(),learned:await learned.inputValue()};
 await expectUnclipped(dialog.locator('.inspect-name > b'));
 await search.fill('同伴');await expect(cards).toHaveCount(12);await expect(label).toHaveText('1 / 1');await expect(pager).toBeHidden();
 await dialog.locator('.mini[data-member-ref="/羁绊列表/同伴01"]').click();
 await expect(dialog.locator('.inspect-name > b')).toHaveText('同伴01');
 await expectUnclipped(dialog.locator('.member-config[data-member-ref="/羁绊列表/同伴01"]').getByRole('combobox',{name:'基础主动能力',exact:true}));
 await search.fill('');await expect(label).toHaveText('1 / 2');await expect(previous).toBeDisabled();
 await next.click();await expect(label).toHaveText('2 / 2');
 await dialog.locator('.filter-tab[data-filter="hero"]').click();
 await expect(cards).toHaveCount(1);await expect(cards.first()).toHaveAttribute('data-member-ref','/人物');
 await expect(label).toHaveText('1 / 1');await expect(pager).toBeHidden();
 await dialog.locator('.filter-tab[data-filter="all"]').click();
 await expect(label).toHaveText('1 / 2');await expect(cards).toHaveCount(12);await expect(previous).toBeDisabled();
 await next.click();await lastCard.click();
 await expect(base).toHaveValue(selected.base);await expect(learned).toHaveValue(selected.learned);
 // A shorter desktop must retain a scroll path to controls below the roster and details.
 await page.setViewportSize({width:1440,height:650});
 await previous.click();await expect(cards).toHaveCount(12);
 await dialog.locator('.mini[data-member-ref="/羁绊列表/同伴01"]').click();
 const shortConfiguration=dialog.locator('.member-config[data-member-ref="/羁绊列表/同伴01"]');
 const shortBase=shortConfiguration.getByRole('combobox',{name:'基础主动能力',exact:true});
 const shortLearned=shortConfiguration.getByRole('combobox',{name:'装配已学能力',exact:true});
 await expect.poll(()=>roster.evaluate(el=>getComputedStyle(el).overflowY)).toMatch(/auto|scroll/);
 await expect.poll(()=>roster.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
 await expectUnclipped(dialog.locator('.inspect-name > b'));
 await expectUnclipped(shortBase);await expectUnclipped(shortLearned);
 await expect.poll(()=>roster.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await shortLearned.selectOption({index:1});await expect(shortLearned).not.toHaveValue('');
 expect((await saveState(page)).partyPreparation).toBeUndefined();
});

test('regression: mobile dragging across the embedded shadow root scrolls management content toward its top edge',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await install(page,{launcher:false,companionCount:12});await open(page);
 const dialog=management(page);const content=panel(page).locator('.management-content');const cards=dialog.locator('.mini');
 await expect(cards).toHaveCount(12);
 expect(await cards.evaluateAll(elements=>new Set(elements.map(el=>Math.round(el.getBoundingClientRect().left))).size)).toBe(4);
 const bounds=(await content.boundingBox())!;
 const area={left:Math.max(0,bounds.x),right:Math.min(390,bounds.x+bounds.width),top:Math.max(0,bounds.y),bottom:Math.min(844,bounds.y+bounds.height)};
 expect(area.bottom-area.top).toBeGreaterThan(200);
 await page.mouse.move((area.left+area.right)/2,area.bottom-80);await page.mouse.wheel(0,650);
 await expect.poll(()=>content.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
 const visibleCardIndex=()=>cards.evaluateAll((elements,area)=>elements.findIndex(el=>{
  const r=el.getBoundingClientRect();return r.top>=area.top+24&&r.bottom<=area.bottom-24&&r.left>=area.left&&r.right<=area.right;
 }),area);
 await expect.poll(visibleCardIndex).toBeGreaterThanOrEqual(0);
 const card=cards.nth(await visibleCardIndex());await expect(card).toBeVisible();await expect(card).toBeInViewport({ratio:0.98});
 expect(await card.evaluate(el=>{
  const root=el.getRootNode();return root instanceof ShadowRoot&&root.host.closest('.management-content')!==null;
 })).toBe(true);
 const source=(await card.boundingBox())!;const x=source.x+source.width/2;const y=source.y+source.height/2;
 expect(y).toBeGreaterThan(area.top+24);expect(y).toBeLessThan(area.bottom-24);
 const before=await content.evaluate(el=>el.scrollTop);
 await page.mouse.move(x,y);await page.mouse.down();
 try{
  await page.mouse.move(x+12,y,{steps:3});
  const ghost=host(page).locator('.team-drag-ghost');await expect(ghost).toBeVisible();
  const ghostBounds=(await ghost.boundingBox())!;expect(ghostBounds.width).toBeGreaterThan(0);expect(ghostBounds.height).toBeGreaterThan(0);
  // Do not wheel or programmatically scroll while holding the card: only pointer edge scrolling may move this ancestor.
  await page.mouse.move(x,area.top+8,{steps:12});
  await expect.poll(()=>content.evaluate(el=>el.scrollTop)).toBeLessThan(before-40);
 }finally{await page.mouse.up();}
 await expect(host(page).locator('.team-drag-ghost')).toHaveCount(0);
 await expect(dialog.locator('.slot-wrap[data-member-ref]')).toHaveCount(1);
 await expect(dialog.locator('.slot-wrap[data-member-ref]')).toHaveAttribute('data-member-ref','/人物');
 expect((await saveState(page)).partyPreparation).toBeUndefined();
});


test('regression: generated gem ability names and selected companion details show player text',async({page})=>{
 await install(page,{launcher:false});await open(page);
 const dialog=management(page);
 await dialog.locator('.mini[data-member-ref="/羁绊列表/同伴甲"]').click();
 const base=dialog.getByRole('combobox',{name:'基础主动能力',exact:true});
 const ability=await page.evaluate(async()=>{
  const load=(path:string)=>import(/* @vite-ignore */path);
  const {partyAbilityChoices}=await load('/src/sillytavern/partyPreparation.ts') as typeof import('../../src/sillytavern/partyPreparation');
  const candidate=partyAbilityChoices().find(a=>!a.availabilityIssues?.length&&a.name.startsWith('爆破随机')&&a.description.includes('max(0,round(1))'));
  if(!candidate)throw new Error('Expected the native random explosion recipe');
  return candidate.abilityId;
 });
 expect(await base.locator('option').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/\b(?:max|min|round|floor)\s*\(/)]));
 await base.selectOption(ability);
 await expect(dialog.locator('.inspect-spell strong')).toContainText('爆破随机');
 await expect(dialog.locator('.inspect-spell strong')).not.toContainText('round(');
 await expect(dialog.locator('.inspect-copy > p')).toContainText('随机1颗');
 await expect(dialog.locator('.inspect-copy > p')).not.toContainText('max(');
});
