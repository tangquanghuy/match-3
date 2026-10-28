import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import type {StPanelHandle} from '../../src/sillytavern/panelEntry';
import type {TavernHelpers} from '../../src/sillytavern/hostAdapter';
import type {StSave} from '../../src/sillytavern/save';

interface PanelFixture {
 setEnabled(value:boolean):void;
 setChat(chat:string):void;
 setAccount(account:string):void;
 accountId(account?:string):string|null;
 readVariables():Record<string,unknown>;
}
type PanelWindow=Window & {panelFixture:PanelFixture;match3Panel?:StPanelHandle};
type PanelModule=typeof import('../../src/sillytavern/panelEntry');

async function setup(page:Page,enabled:boolean):Promise<void>{
 await page.addInitScript(enabled=>{
  let chat='panel-chat-A';let on=enabled;let account='account-A';
  const variables=()=>JSON.parse(sessionStorage.getItem(`panel-fixture-vars:${account}`)??'{}') as Record<string,Record<string,unknown>>;
  const accountStorage={getItem:(key:string)=>sessionStorage.getItem(`panel-fixture-storage:${account}:${key}`),setItem:(key:string,value:string)=>sessionStorage.setItem(`panel-fixture-storage:${account}:${key}`,value)};
  const helpers:TavernHelpers={
   getContext:()=>({accountStorage,characterId:0,characters:[{avatar:'native-panel.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chat}),
   getVariables:()=>structuredClone(variables()[chat]??{}),
   updateVariablesWith:updater=>{const next=variables();next[chat]=updater(structuredClone(next[chat]??{}));sessionStorage.setItem(`panel-fixture-vars:${account}`,JSON.stringify(next));return next[chat];},
   Mvu:{getMvuData:()=>({stat_data:{人物:{名称:'面板测试',等级:1,当前生命值:80,生命值上限:80,临时生命值:0},系统配置:{三消战斗模式:on}}}),replaceMvuData:async()=>{}},
  };
  Object.assign(window,{
   SillyTavern:{getContext:helpers.getContext},TavernHelper:helpers,Mvu:helpers.Mvu,
   panelFixture:{setEnabled:(value:boolean)=>{on=value;},setChat:(value:string)=>{chat=value;},setAccount:(value:string)=>{account=value;},accountId:(name=account)=>sessionStorage.getItem(`panel-fixture-storage:${name}:match3.host-account.v1`),readVariables:()=>structuredClone(variables())},
  });
 },enabled);
 await page.goto('/sillytavern-install.html');
}
async function open(page:Page):Promise<string|undefined>{
 return page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  try{await module.openStPanel({runtimeWindow:window});return undefined;}catch(error){return error instanceof Error?error.message:String(error);}
 });
}

test('disabled mode creates neither panel nor save; enabled entry binds automatically and rechecks mode',async({page})=>{
 await setup(page,false);
 expect(await open(page)).toContain('三消战斗模式已关闭');
 await expect(page.locator('#st-match3-host-root')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toEqual({});
 await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.setEnabled(true));
 expect(await open(page)).toBeUndefined();
 await expect(page.locator('#st-match3-host-root')).toHaveCount(1);
 const manager=page.locator('#st-match3-host-root section.management-page');
 await expect(manager).toBeVisible();
 await expect(manager).toHaveAttribute('aria-label','三消编队、图鉴与魂片');
 await expect(manager.getByRole('tab',{name:'编队与能力装配',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(manager.getByRole('dialog',{name:'编队与能力装配管理',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'三消存档',exact:true})).toHaveCount(0);
 const initial=await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables());
 expect(initial['panel-chat-A']).toHaveProperty('match3.saveId');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.setEnabled(false));
 expect(await open(page)).toContain('三消战斗模式已关闭');
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeHidden();
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toEqual(initial);
});

test('message iframes share one host panel and unloading its first caller preserves the manager',async({page})=>{
 await setup(page,true);
 for(const name of ['first-bottom','second-bottom']){
  await page.evaluate(name=>{const frame=document.createElement('iframe');frame.name=name;frame.srcdoc='<body>底部状态栏</body>';document.body.append(frame);},name);
  await expect.poll(()=>page.frame({name})?.url()).toBe('about:srcdoc');
  await page.frame({name})!.evaluate(async()=>{
   const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
   await module.openStPanel({runtimeWindow:window,hostWindow:window.parent});
  });
 }
 await expect(page.locator('#st-match3-host-root')).toHaveCount(1);
 await page.locator('iframe[name="first-bottom"]').evaluate(frame=>frame.remove());
 await page.evaluate(async()=>{await (window as unknown as PanelWindow).match3Panel!.open();});
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeVisible();
 await page.evaluate(()=>(window as unknown as PanelWindow).match3Panel!.destroy());
 await expect(page.locator('#st-match3-host-root')).toHaveCount(0);
 expect(await open(page)).toBeUndefined();
});

test('fourth chat preserves three bindings, opens deletion controls and permits explicit replacement',async({page})=>{
 await setup(page,true);
 for(const chat of ['panel-chat-A','panel-chat-B','panel-chat-C']){
  await page.evaluate(chat=>(window as unknown as PanelWindow).panelFixture.setChat(chat),chat);
  expect(await open(page)).toBeUndefined();
 }
 const previous=await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables());
 await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.setChat('panel-chat-D'));
 expect(await open(page)).toBeTruthy();
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toEqual(previous);
 await page.getByRole('tab',{name:'存档',exact:true}).click();
 const remove=page.getByRole('button',{name:'删除此存档',exact:true}).first();
 await remove.click();await page.getByRole('button',{name:'确认删除此存档',exact:true}).click();
 await expect(page.getByRole('button',{name:'确认删除此存档',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'删除此存档',exact:true})).toHaveCount(2);
 expect(await open(page)).toBeUndefined();
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toHaveProperty('panel-chat-D.match3.saveId');
});


async function slots(page:Page,account='account-A'):Promise<StSave[]> {
 return page.evaluate(async account=>{
  const namespace=(window as unknown as PanelWindow).panelFixture.accountId(account);
  if(!namespace)return [];
  const path='/src/sillytavern/saveRepository.ts';
  const {StSaveRepository}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/saveRepository');
  const repository=await StSaveRepository.open(window.indexedDB,namespace);
  try{return await repository.list();}finally{repository.close();}
 },account);
}

test('show false and pending inspection allocate no chat slots or bindings before opening',async({page})=>{
 await setup(page,true);
 const pending=await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  const handle=await module.openStPanel({runtimeWindow:window,show:false});
  return [await handle.hasPendingBattle(),await module.hasPendingStBattle({runtimeWindow:window})];
 });
 expect(pending).toEqual([false,false]);
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeHidden();
 expect(await slots(page)).toEqual([]);
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toEqual({});
 await page.reload();
 expect(await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  return module.hasPendingStBattle({runtimeWindow:window});
 })).toBe(false);
 expect(await slots(page)).toEqual([]);
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toEqual({});
});

async function seedPendingStory(page:Page):Promise<void>{
 await page.evaluate(async()=>{
  const fixture=(window as unknown as PanelWindow).panelFixture;
  const repositoryPath='/src/sillytavern/saveRepository.ts';const contractPath='/src/session/contract.ts';const typesPath='/src/engine/types.ts';
  const {StSaveRepository}=await import(/* @vite-ignore */repositoryPath) as typeof import('../../src/sillytavern/saveRepository');
  const {BATTLE_SCHEMA_VERSION,RULESET_VERSION}=await import(/* @vite-ignore */contractPath) as typeof import('../../src/session/contract');
  const repository=await StSaveRepository.open(window.indexedDB,fixture.accountId()!);
  const save=(await repository.list())[0]!;
  const {BaseColor}=await import(/* @vite-ignore */typesPath) as typeof import('../../src/engine/types');
  const unit=(externalId:string)=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'});
  try{await repository.update(save.id,save.revision,draft=>{
   draft.pendingStory={encounterId:'refresh-encounter',difficulty:'refresh-test',sources:[{sourceId:'refresh-source',abilityId:'active:refresh',abilityName:'刷新能力',rank:4,enemyExternalId:'refresh-enemy'}],
    request:{schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'refresh-battle',requestId:'refresh-request',seed:42,playerTeam:[unit('/人物')],enemyTeam:[unit('refresh-enemy')]}};
  });}finally{repository.close();}
 });
}

test('pending inspection after refresh restores persisted work without opening or allocating another slot',async({page})=>{
 await setup(page,true);expect(await open(page)).toBeUndefined();
 const [before]=await slots(page);
 await seedPendingStory(page);
 const seeded=await slots(page);expect(seeded).toHaveLength(1);
 await page.reload();
 expect(await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  return module.hasPendingStBattle({runtimeWindow:window});
 })).toBe(true);
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeHidden();
 const restored=await slots(page);expect(restored).toEqual(seeded);expect(restored[0]!.id).toBe(before!.id);
 // Pending work is per chat; a probe in a new chat must not auto-create its slot.
 await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.setChat('unopened-chat'));
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).match3Panel!.hasPendingBattle())).toBe(false);
 expect(await slots(page)).toEqual(seeded);
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).not.toHaveProperty('unopened-chat');
});

test('account switch reopens a destroyed manager in its own database and restores the original binding',async({page})=>{
 await setup(page,true);expect(await open(page)).toBeUndefined();const original=await slots(page);
 await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.setAccount('account-B'));
 // Exercise the destroyed getter path after the host account watcher has fired.
 await expect(page.locator('#st-match3-host-root')).toHaveCount(0);
 expect(await open(page)).toBeUndefined();
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeVisible();
 const second=await slots(page,'account-B');expect(second).toHaveLength(1);expect(second[0]!.id).not.toBe(original[0]!.id);
 expect(await slots(page)).toEqual(original);
 await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.setAccount('account-A'));
 await expect(page.locator('#st-match3-host-root')).toHaveCount(0);
 expect(await open(page)).toBeUndefined();expect(await slots(page)).toEqual(original);
 expect(await slots(page,'account-B')).toEqual(second);
});

test('immediate account switch opens without using the previous account repository',async({page})=>{
 await setup(page,true);expect(await open(page)).toBeUndefined();const original=await slots(page);
 const error=await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  (window as unknown as PanelWindow).panelFixture.setAccount('account-B');
  // Switch and open in the same task, before the 400ms background watcher.
  try{await module.openStPanel({runtimeWindow:window});return undefined;}catch(error){return (error as Error).message;}
 });
 const firstAccount=await slots(page);const secondAccount=await slots(page,'account-B');
 expect({error,firstAccount,secondAccountIds:secondAccount.map(save=>save.id)}).toEqual({error:undefined,firstAccount:original,secondAccountIds:[expect.any(String)]});
});


test('immediate account switch probes pending work in the new account without allocating slots',async({page})=>{
 await setup(page,true);expect(await open(page)).toBeUndefined();
 const firstAccount=await slots(page);
 await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  (window as unknown as PanelWindow).panelFixture.setAccount('account-B');
  await module.openStPanel({runtimeWindow:window});
 });
 await seedPendingStory(page);const secondAccount=await slots(page,'account-B');
 await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  (window as unknown as PanelWindow).panelFixture.setAccount('account-A');
  await module.openStPanel({runtimeWindow:window});
 });
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 const pending=await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  (window as unknown as PanelWindow).panelFixture.setAccount('account-B');
  // Read in the same task as the switch; A has no pending work, B does.
  return module.hasPendingStBattle({runtimeWindow:window});
 });
 expect(pending).toBe(true);
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeHidden();
 expect(await slots(page)).toEqual(firstAccount);
 expect(await slots(page,'account-B')).toEqual(secondAccount);
});

test('a failed hidden installation can retry on the same panel handle without creating a slot',async({page})=>{
 await setup(page,true);
 const result=await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';const module=await import(/* @vite-ignore */path) as PanelModule;
  const handle=await module.openStPanel({runtimeWindow:window,show:false});
  const blocker=document.createElement('div');blocker.id='st-match3-host-root';document.body.append(blocker);
  let error:string|undefined;
  try{await handle.hasPendingBattle();}catch(reason){error=(reason as Error).message;}finally{blocker.remove();}
  const pending=await handle.hasPendingBattle();
  return {error,pending,sameHandle:(window as unknown as PanelWindow).match3Panel===handle};
 });
 expect(result).toEqual({error:'三消存档入口已经打开',pending:false,sameHandle:true});
 await expect(page.locator('#st-match3-host-root')).toHaveCount(1);
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeHidden();
 expect(await slots(page)).toEqual([]);
 expect(await page.evaluate(()=>(window as unknown as PanelWindow).panelFixture.readVariables())).toEqual({});
 expect(await open(page)).toBeUndefined();
 await expect(page.locator('#st-match3-host-root section.management-page')).toBeVisible();
 expect(await slots(page)).toHaveLength(1);
});
