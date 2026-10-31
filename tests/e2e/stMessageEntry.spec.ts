import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {fragmentDisplayName} from '../../src/sillytavern/abilityName';
import type {BattleRequest,BattleResult} from '../../src/session/contract';
import {installTavernChat,sentTavernMessages} from './tavernChat';

test.use({contextOptions:{reducedMotion:'reduce'}});
declare global {interface Window {messageEncounterFixture:{destroy():void};messageBattleRequest:BattleRequest}}
const design={assembly:'classified',manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20,difficulty:1,effects:[{effect:'damage',requirement:'required'}]};
const message=`前方的敌人拦住了去路。\n<match3>\n${JSON.stringify({version:1,difficulty:'普通',enemyDesigns:[design]})}\n</match3>`;
async function setup(page:Page,enabled=true,encounterMessage=message){
 await installTavernChat(page);
 await page.addInitScript(({message,enabled})=>{
  const chat=[{is_user:false,mes:message,send_date:'2026-10-24T21:00:00',swipe_id:0}];let variables:Record<string,unknown>={};
  let state=({stat_data:{人物:{名称:'消息测试',等级:20,当前生命值:180,生命值上限:200,临时生命值:0,AC:14,属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},战斗属性:{武器面板:{伤害骰:'2d6',等级系数:1,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},装备列表:{}},系统配置:{三消战斗模式:enabled}}});
  const helpers={getContext:()=>({characterId:0,characters:[{avatar:'message-test.png'}],chat,getCurrentChatId:()=> 'message-chat'}),getVariables:()=>structuredClone(variables),updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>{variables=fn(variables);return variables;},Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async(data:typeof state)=>{state=structuredClone(data);}}};
  Object.assign(window,{SillyTavern:{getContext:helpers.getContext},TavernHelper:helpers,Mvu:helpers.Mvu,messageFixture:{edit:(text:string)=>{chat[0]!.mes=text;},variables:()=>variables}});
 },{message:encounterMessage,enabled});
 await page.goto('/sillytavern-install.html');
 await mountMessage(page);
}
async function mountMessage(page:Page){
 await page.evaluate(()=>{const f=document.createElement('iframe');f.name='message-wrapper';f.srcdoc='<div id="message-root"></div>';document.body.append(f);});
 await expect.poll(()=>page.frame({name:'message-wrapper'})?.url()).toBe('about:srcdoc');
 await page.frame({name:'message-wrapper'})!.evaluate(async()=>{const path='/src/sillytavern/messageEntry.ts';const {mountMessageEncounter}=await import(/* @vite-ignore */path);window.messageEncounterFixture=await mountMessageEncounter({runtimeWindow:window,messageId:0,root:document.getElementById('message-root')!});});
}
function card(page:Page){return page.frameLocator('iframe[name="message-wrapper"]').frameLocator('iframe[title="剧情三消遭遇"]');}
const management=(page:Page)=>page.getByRole('dialog',{name:'三消编队、图鉴与魂片',exact:true});
async function prepareControlledBattle(page:Page){
 // Exercise the real message/host bridge with controlled engine output.
 await page.route('**/message-entry-battle-fixture.html*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>message entry battle fixture</title><script>
 const nonce=new URLSearchParams(location.search).get('nonce');
 addEventListener('message',event=>{if(event.data?.channel==='match3:st-replay:v1'&&event.data.nonce===nonce&&event.data.type==='start')window.messageBattleRequest=event.data.request;});
 parent.postMessage({channel:'match3:st-replay:v1',nonce,type:'ready'},location.origin);
 </script>`}));
 await setup(page);
 await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';
  const {openStPanel}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/panelEntry');
  await openStPanel({runtimeWindow:window,battleUrl:new URL('/message-entry-battle-fixture.html',location.href).href,show:false});
 });
}
async function repositoryState(page:Page){
 return page.evaluate(async()=>{
  const path='/src/sillytavern/saveRepository.ts';
  const {StSaveRepository}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/saveRepository');
  const repository=await StSaveRepository.open(indexedDB);
  try{return {saves:await repository.list(),outcomes:await repository.listReplayOutcomes()};}finally{repository.close();}
 });
}
async function completeMessageBattle(page:Page){
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 await expect.poll(()=>page.frames().some(frame=>frame.url().includes('/message-entry-battle-fixture.html'))).toBe(true);
 const frame=page.frames().find(frame=>frame.url().includes('/message-entry-battle-fixture.html'))!;
 await expect.poll(()=>frame.evaluate(()=>!!window.messageBattleRequest)).toBe(true);
 await frame.evaluate(()=>{
  const request=window.messageBattleRequest;
  const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,
   winner:'player',turns:2,combatants:[
    ...request.playerTeam.map(unit=>({externalId:unit.externalId,side:'player' as const,hp:unit.initialHp??unit.stats.hp,maxHp:unit.stats.hp,armor:unit.stats.armor,defeated:false,statuses:[]})),
    ...request.enemyTeam.map(unit=>({externalId:unit.externalId,side:'enemy' as const,hp:0,maxHp:unit.stats.hp,armor:0,defeated:true,statuses:[]}))],
   defeatedExternalIds:request.enemyTeam.map(unit=>unit.externalId),summonedCount:0,actionLogDigest:'message-entry-fixture-victory',economy:{gold:0,souls:0,gems:0,maps:0},eventSummary:[]};
  parent.postMessage({channel:'match3:st-replay:v1',nonce:new URLSearchParams(location.search).get('nonce'),type:'result',result,events:[]},location.origin);
 });
 const battle=page.locator('#st-match3-story-root');
 await expect(battle.locator('main.result-screen')).toBeVisible();
 await expect(battle.locator('#again')).toBeEnabled();
 await expect(battle.locator('.bar')).toBeHidden();
 await expect(management(page)).toBeHidden();
}
async function expectQuietMessage(page:Page){
 await expect(card(page).locator('#play')).toBeEnabled();
 await expect(card(page).locator('#status')).toBeEmpty();
 await expect(page.frameLocator('iframe[name="message-wrapper"]').getByRole('status')).toBeHidden();
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 await expect(management(page)).toBeHidden();
}

test('原消息协议渲染远端卡，点击直接进入战斗',async({page})=>{
 await setup(page);await expect(card(page).getByRole('region',{name:'敌方阵容'}).locator('.ec-unit')).toHaveCount(1);await expect(card(page).getByRole('button',{name:'重置本场（测试）'})).toBeHidden();
 await card(page).getByRole('button',{name:'进入战斗'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 await expect(page.locator('#st-match3-story-root')).toHaveCount(1);
 expect(await page.evaluate(()=>Object.keys((window as unknown as {messageFixture:{variables():Record<string,unknown>}}).messageFixture.variables()))).toContain('match3');
});
test('战斗结束关闭留在消息，重开仅见原生结算且不重奖，养成页由独立操作打开',async({page})=>{
 await prepareControlledBattle(page);
 await card(page).locator('#play').click();
 await completeMessageBattle(page);
 const original=await repositoryState(page);const receipt=original.saves[0]!.settlements[0]!;
 expect(original.saves).toHaveLength(1);expect(original.saves[0]!.settlements).toHaveLength(1);
 expect(receipt.grants.length).toBeGreaterThan(0);expect(original.outcomes).toEqual([]);
 await expect(card(page).locator('#play')).toBeDisabled();
 expect(await sentTavernMessages(page)).toEqual([]);
 await page.locator('#st-match3-story-root #again').click();
 await expectQuietMessage(page);
 // "继续" hands the readable report to the AI exactly once through the chat box.
 const sent=await sentTavernMessages(page);expect(sent).toHaveLength(1);
 // Soul fragments and learned abilities stay on the settlement page; the report leaves them out (2026-10-30).
 expect(sent[0]).toMatch(/^【三消战报】\n战斗结果：我方胜利/);expect(sent[0]).not.toContain('灵魂碎片');
 // This legacy design has no name, so the enemy keeps its existing generic label.
 expect(sent[0]).not.toMatch(/battleId|requestId|\/人物|active:v/);
 expect(await repositoryState(page)).toEqual(original);
 for(let i=0;i<2;i++){
  await card(page).locator('#play').click();
  const result=page.locator('#st-match3-story-root');
  await expect(result.locator('main.result-screen')).toBeVisible();
  await expect(result.locator('[data-battle-id]')).toHaveAttribute('data-battle-id',receipt.battleId);
  await expect(result.locator('iframe')).toHaveCount(0);
  await expect(management(page)).toBeHidden();
  await expect(card(page).locator('#play')).toBeDisabled();
  await expect(result.locator('.settlement-grant.rs-reward')).toHaveCount(receipt.grants.length+receipt.learnedAbilityIds.length);
  for(const grant of receipt.grants){
   const reward=result.locator('.settlement-grant.rs-reward').filter({has:page.getByText(grant.kind==='fragment'?fragmentDisplayName(grant.name):grant.name,{exact:true})});
   await expect(reward).toBeVisible();await expect(reward.locator('[data-count]')).toHaveText(`+${grant.quantity}`);
  }
  expect(await repositoryState(page)).toEqual(original);
  await result.locator('#again').click();
  expect(await sentTavernMessages(page)).toHaveLength(1);
  await expectQuietMessage(page);
  expect(await repositoryState(page)).toEqual(original);
 }
 await page.evaluate(async()=>{
  const path='/src/sillytavern/panelEntry.ts';
  const {openStPanel}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/panelEntry');
  await openStPanel({runtimeWindow:window});
 });
 await expect(management(page)).toBeVisible();
 await expect(management(page).getByRole('tab',{name:'编队与能力装配',exact:true})).toBeVisible();
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 expect(await repositoryState(page)).toEqual(original);
});

test('临时测试重置：撤回本场战果后同一楼可用同一场配置重新开战',async({page})=>{
 await prepareControlledBattle(page);
 const before=await repositoryState(page);
 await card(page).locator('#play').click();
 await completeMessageBattle(page);
 const firstRequest=await page.frames().find(frame=>frame.url().includes('/message-entry-battle-fixture.html'))!.evaluate(()=>window.messageBattleRequest);
 await page.locator('#st-match3-story-root #again').click();
 await expectQuietMessage(page);
 const reset=card(page).getByRole('button',{name:'重置本场（测试）'});
 await expect(reset).toBeVisible();
 const mirror=()=>page.evaluate(()=>(window as unknown as {messageFixture:{variables():Record<string,{storyResults?:Record<string,unknown>}>}}).messageFixture.variables().match3?.storyResults??{});
 expect(Object.keys(await mirror())).toEqual([firstRequest.battleId]);
 // First click only arms the button.
 await reset.click();
 await expect(card(page).getByRole('button',{name:'确认重置：撤回本场战果'})).toBeVisible();
 expect((await repositoryState(page)).saves[0]!.settlements).toHaveLength(1);
 await card(page).getByRole('button',{name:'确认重置：撤回本场战果'}).click();
 await expect(card(page).getByRole('button',{name:'进入战斗'})).toBeEnabled();
 await expect(card(page).getByRole('button',{name:'重置本场（测试）'})).toBeHidden();
 await expect(card(page).locator('#status')).toBeEmpty();
 const after=await repositoryState(page);
 expect(before.saves).toEqual([]);
 expect(after.saves[0]).toMatchObject({settlements:[],encounters:[],sources:[],learnedAbilityIds:[],balances:{},equippedAbilities:{}});
 expect(after.saves[0]!.pendingStory).toBeUndefined();
 expect(after.outcomes).toEqual([]);
 expect(await mirror()).toEqual({});
 // Same floor, same battle identity and seed.
 await card(page).locator('#play').click();
 await completeMessageBattle(page);
 const secondRequest=await page.frames().find(frame=>frame.url().includes('/message-entry-battle-fixture.html'))!.evaluate(()=>window.messageBattleRequest);
 expect(secondRequest.battleId).toBe(firstRequest.battleId);expect(secondRequest.seed).toBe(firstRequest.seed);
 expect(secondRequest.enemyTeam).toEqual(firstRequest.enemyTeam);
 expect((await repositoryState(page)).saves[0]!.settlements).toHaveLength(1);
});

test('消息重挂保留进行中战斗，关闭旧结算且不重复入账',async({page})=>{
 await prepareControlledBattle(page);
 await card(page).locator('#play').click();
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 const pending=await repositoryState(page);
 for(let i=0;i<2;i++){
  await page.frame({name:'message-wrapper'})!.evaluate(()=>window.messageEncounterFixture.destroy());
  await page.locator('iframe[name="message-wrapper"]').evaluate(el=>el.remove());
  await mountMessage(page);
  await expect(card(page).locator('#play')).toBeEnabled();
  await expect(card(page).locator('#status')).toBeEmpty();
  await expect(page.frameLocator('iframe[name="message-wrapper"]').getByRole('status')).toBeHidden();
  await expect(page.locator('#st-match3-story-root')).toHaveCount(1);
  await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
  await expect(management(page)).toBeHidden();
  expect(await repositoryState(page)).toEqual(pending);
 }
 await completeMessageBattle(page);
 await page.locator('#st-match3-story-root #again').click();
 await expectQuietMessage(page);
 const settled=await repositoryState(page);
 expect(settled.saves[0]!.pendingStory).toBeUndefined();
 expect(settled.saves[0]!.settlements).toHaveLength(1);expect(settled.outcomes).toEqual([]);
 await page.frame({name:'message-wrapper'})!.evaluate(()=>window.messageEncounterFixture.destroy());
 await page.locator('iframe[name="message-wrapper"]').evaluate(el=>el.remove());
 await mountMessage(page);
 await expectQuietMessage(page);
 expect(await repositoryState(page)).toEqual(settled);
 await card(page).locator('#play').click();
 await expect(page.locator('#st-match3-story-root main.result-screen')).toBeVisible();
 await expect(page.locator('#st-match3-story-root iframe')).toHaveCount(0);
 await expect(management(page)).toBeHidden();
 await page.locator('iframe[name="message-wrapper"]').evaluate(el=>el.remove());
 await mountMessage(page);
 await expectQuietMessage(page);
 await expect(card(page).getByRole('button',{name:'查看本场战果',exact:true})).toBeEnabled();
 expect(await repositoryState(page)).toEqual(settled);
 await card(page).getByRole('button',{name:'查看本场战果',exact:true}).click();
 await expect(page.locator('#st-match3-story-root main.result-screen')).toBeVisible();
 await expect(page.locator('#st-match3-story-root iframe')).toHaveCount(0);
 await page.locator('#st-match3-story-root #again').click();
 await expectQuietMessage(page);
 expect(await repositoryState(page)).toEqual(settled);
});

test('胜利页尚未继续时重新渲染消息，保留结算直到战报发出，并保持原收据',async({page})=>{
 await prepareControlledBattle(page);
 await card(page).locator('#play').click();
 await completeMessageBattle(page);
 const settled=await repositoryState(page);
 await page.locator('iframe[name="message-wrapper"]').evaluate(el=>el.remove());
 await mountMessage(page);
 // The HP writeback may re-render the message; the unsent report must not be dropped.
 await expect(page.locator('#st-match3-story-root main.result-screen')).toBeVisible();
 await expect(card(page).getByRole('button',{name:'查看本场战果',exact:true})).toBeVisible();
 expect(await sentTavernMessages(page)).toEqual([]);
 await page.locator('#st-match3-story-root #again').click();
 await expectQuietMessage(page);
 expect(await sentTavernMessages(page)).toHaveLength(1);
 expect(await repositoryState(page)).toEqual(settled);
 await card(page).locator('#play').click();
 await expect(page.locator('#st-match3-story-root main.result-screen')).toBeVisible();
 await expect(page.locator('#st-match3-story-root iframe')).toHaveCount(0);
 expect(await repositoryState(page)).toEqual(settled);
});

test('较早 ready 查询晚返回时保留玩家刚打开的新战果页',async({page})=>{
 await prepareControlledBattle(page);
 await card(page).locator('#play').click();await completeMessageBattle(page);
 await page.locator('#st-match3-story-root #again').click();await expectQuietMessage(page);
 const settled=await repositoryState(page);
 await page.evaluate(async()=>{
  const path='/src/sillytavern/saveRepository.ts';
  const {StSaveRepository}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/saveRepository');
  const original=StSaveRepository.prototype.list;
  let release!:()=>void;let delayed=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  StSaveRepository.prototype.list=async function(){
   const records=await original.call(this);
   if(!delayed){delayed=true;Object.assign(window,{messageStateDelayed:true});await gate;}
   return records;
  };
  Object.assign(window,{releaseMessageState:()=>{StSaveRepository.prototype.list=original;release();}});
 });
 await page.locator('iframe[name="message-wrapper"]').evaluate(el=>el.remove());await mountMessage(page);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {messageStateDelayed?:boolean}).messageStateDelayed)).toBe(true);
 await card(page).locator('#play').click();
 await expect(page.locator('#st-match3-story-root main.result-screen')).toBeVisible();
 await page.evaluate(()=>(window as unknown as {releaseMessageState():void}).releaseMessageState());
 await expect(card(page).getByRole('button',{name:'查看本场战果',exact:true})).toBeDisabled();
 await expect(page.locator('#st-match3-story-root main.result-screen')).toBeVisible();
 expect(await repositoryState(page)).toEqual(settled);
 await page.locator('#st-match3-story-root #again').click();await expectQuietMessage(page);
});

test('模式关闭时卡片报错且不创建存档',async({page})=>{
 await setup(page,false);await card(page).locator('#play').click();await expect(card(page).locator('#status')).toContainText('三消战斗模式已关闭');
 expect(await page.evaluate(()=>(window as unknown as {messageFixture:{variables():Record<string,unknown>}}).messageFixture.variables())).toEqual({});
});
test('渲染后编辑正文会阻止旧卡开战',async({page})=>{
 await setup(page);await expect(card(page).locator('#play')).toBeEnabled();
 await page.evaluate(()=>(window as unknown as {messageFixture:{edit(text:string):void}}).messageFixture.edit('正文已经变更'));
 await card(page).locator('#play').click();await expect(card(page).locator('#status')).toContainText('正文已编辑');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('卡片握手超时提供重试，重载成功后清除失败反馈',async({page})=>{
 await page.clock.install();
 let attempts=0;
 await page.route('**/sillytavern-encounter.html*',async route=>{
  if(++attempts===1)await route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'});
  else await route.continue();
 });
 await setup(page);
 const wrapper=page.frameLocator('iframe[name="message-wrapper"]');
 const retry=wrapper.getByRole('button',{name:'重试加载战斗入口',exact:true});
 await expect(retry).toBeHidden();
 await page.clock.fastForward(10_001);
 await expect(wrapper.getByRole('status')).toContainText('加载超时');await expect(retry).toBeVisible();
 await retry.click();
 await expect(card(page).locator('#play')).toBeEnabled();await expect(retry).toBeHidden();
 await page.clock.fastForward(20_000);
 await expect(wrapper.locator('p[role=status]')).toBeHidden();await expect(retry).toBeHidden();
 expect(attempts).toBe(2);
 expect(await page.evaluate(()=>(window as unknown as {messageFixture:{variables():Record<string,unknown>}}).messageFixture.variables())).toEqual({});
});

test('战斗打开时重复 ready 及卡片重载均保留 busy，返回后恢复按钮',async({page})=>{
 await page.route('**/src/render/battleAssets.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const BATTLE_ASSET_LABEL={};export async function preloadBattleAssets(){throw new Error("asset failure fixture");}'}));
 await setup(page);await card(page).locator('#play').click();await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 const encounter=()=>page.frames().find(frame=>frame.url().includes('/sillytavern-encounter.html'))!;
 await encounter().evaluate(()=>window.parent.postMessage({channel:'match3:message:v1',nonce:new URLSearchParams(location.hash.slice(1)).get('channel'),type:'ready'},location.origin));
 await expect(card(page).locator('#status')).toBeEmpty();await expect(card(page).locator('#play')).toBeDisabled();
 await encounter().evaluate(()=>location.reload());
 await expect(card(page).locator('.bl-head')).toHaveCount(0);
 await expect(card(page).locator('#status')).toBeEmpty();await expect(card(page).locator('#play')).toBeDisabled();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.frameLocator('iframe[title="剧情三消战场"]').getByRole('button',{name:'返回',exact:true}).click();
 await expect(card(page).locator('#play')).toBeEnabled();await expect(card(page).locator('#status')).toBeEmpty();
});

test('精简协议复用本体加载页后进入真实三消战场',async({page})=>{
 test.setTimeout(60_000);
 let releaseAssets!:()=>void;
 const assetsGate=new Promise<void>(resolve=>{releaseAssets=resolve;});
 await page.route('**/src/render/battleAssets.ts*',async route=>{await assetsGate;await route.continue();});
 const minimal={enemyDesigns:[{name:'卡洛斯·灰刃',race:'半精灵',manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20}]};
 await setup(page,true,`前方的敌人拦住了去路。\n<match3>\n${JSON.stringify(minimal)}\n</match3>`);
 await expect(card(page).locator('#status')).toBeEmpty();
 await expect(card(page).getByRole('region',{name:'敌方阵容'}).locator('.ec-unit')).toHaveAttribute('aria-label','卡洛斯·灰刃');
 await expect(card(page).getByRole('region',{name:'敌方阵容'}).locator('.ec-unit')).toHaveAttribute('title','卡洛斯·灰刃（杂兵 Lv.20）');await expect(card(page).locator('.ec-names')).toHaveCount(0);
 await card(page).getByRole('button',{name:'进入战斗'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const battlefield=page.frameLocator('iframe[title="剧情三消战场"]');
 await expect(battlefield.locator('.bl-screen')).toBeVisible();
 await expect(battlefield.locator('.bl-head,.bl-tip')).toHaveCount(0);
 await expect(battlefield.getByRole('progressbar',{name:'战斗资源加载'})).toBeVisible();
 await expect(battlefield.getByRole('region',{name:'敌方阵容'}).locator('.bl-unit')).toHaveAttribute('aria-label','卡洛斯·灰刃');
 await expect(battlefield.locator('.bl-unit figcaption')).toHaveCount(0);
 await expect(battlefield.getByRole('region',{name:'敌方阵容'})).toHaveText('');
 const portrait=battlefield.locator('.bl-side--enemy img');
 await expect.poll(()=>portrait.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expect(page.locator('#st-match3-story-root .bar')).toBeHidden();
 await page.screenshot({path:'.tmp/st-native-loading/battle-loading-desktop.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await expect(battlefield.locator('.bl-screen')).toBeVisible();
 expect(await battlefield.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'.tmp/st-native-loading/battle-loading-mobile.png',animations:'disabled'});
 releaseAssets();
 await expect(battlefield.locator('.bl-screen')).toHaveCount(0,{timeout:30_000});
 await expect(battlefield.locator('canvas')).toBeVisible();
 await expect(page.locator('#st-match3-story-root .bar')).toBeHidden();
 await expect(page.locator('#st-match3-story-root').getByRole('button',{name:'全屏',exact:true})).toHaveCount(0);
 await expect(battlefield.getByRole('button',{name:'全屏',exact:true})).toHaveCount(1);
 await battlefield.getByRole('button',{name:'全屏',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await page.evaluate(()=>document.exitFullscreen());
 await expect(battlefield.locator('.gcard .story-identity')).toHaveCount(0);
 await expect(battlefield.locator('.gcard.enemy .c-br')).toBeVisible();
 await expect(battlefield.locator('.gcard.enemy .gem')).toBeVisible();
 await battlefield.locator('.gcard.enemy').click();
 await expect(battlefield.getByTestId('unit-sheet').locator('.usw-name h2')).toHaveText('卡洛斯·灰刃');
 await expect(battlefield.getByTestId('unit-sheet').locator('.usw-name span')).toContainText('半精灵');
 await expect(battlefield.getByTestId('unit-sheet').locator('.usw-name span')).toContainText('20');
 await page.screenshot({path:'.tmp/st-enemy-identity/battle-name-race.png'});
});

for(const width of [530,320])test(`正文原生战前布局在 ${width}px 四人阵容无截断且同步高度`,async({page})=>{
 const enemyDesigns=Array.from({length:4},(_,i)=>({name:`遭遇敌人${i+1}`,race:'半精灵',manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20}));
 await setup(page,true,`<match3>\n${JSON.stringify({enemyDesigns})}\n</match3>`);
 await page.locator('iframe[name="message-wrapper"]').evaluate((el:HTMLIFrameElement,width)=>{el.style.width=`${width}px`;el.style.height='1200px';},width);
 await expect(card(page).locator('.ec-side--enemy .ec-unit')).toHaveCount(4);
 for(let i=0;i<4;i++)await expect(card(page).locator('.ec-side--enemy .ec-unit').nth(i)).toHaveAttribute('aria-label',enemyDesigns[i].name);
 // Compact strip: far shorter than the old 480px loading-screen card.
 expect(await card(page).locator('#encounter').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(260);
 expect(await card(page).locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
 await expect.poll(async()=>{
  const dimensions=await card(page).locator('#encounter').evaluate(el=>({content:el.getBoundingClientRect().height,viewport:window.innerHeight}));
  return Math.abs(dimensions.content-dimensions.viewport)<=1;
 }).toBe(true);
 await page.frameLocator('iframe[name="message-wrapper"]').locator('iframe[title="剧情三消遭遇"]').screenshot({path:`.tmp/st-native-loading/encounter-${width}.png`,animations:'disabled'});
 expect(await page.evaluate(()=>(window as unknown as {messageFixture:{variables():Record<string,unknown>}}).messageFixture.variables())).toEqual({});
});

test('本体预载失败可重试，返回后保留原本场待完成快照',async({page})=>{
 test.setTimeout(60_000);
 await page.addInitScript(()=>window.addEventListener('message',event=>{
  if(event.data?.channel==='match3:st-replay:v1'&&event.data.type==='start')Object.assign(window,{pendingRequestFixture:structuredClone(event.data.request)});
 }));
 let attempts=0;
 await page.route('**/src/render/battleAssets.ts*',async route=>{
  attempts++;
  await route.fulfill({contentType:'application/javascript',body:'export const BATTLE_ASSET_LABEL={};export async function preloadBattleAssets(){throw new Error("asset failure fixture");}'});
 });
 await setup(page);
 await card(page).locator('#play').click();
 const battlefield=page.frameLocator('iframe[title="剧情三消战场"]');
 await expect(battlefield.getByText('资源加载失败，请检查网络后重试')).toBeVisible();
 await expect(battlefield.locator('canvas')).toHaveCount(0);
 await battlefield.getByRole('button',{name:'重试',exact:true}).click();
 await expect(battlefield.getByRole('button',{name:'重试',exact:true})).toBeVisible();
 expect(attempts).toBeGreaterThan(0);
 const pending=await battlefield.locator('body').evaluate(()=>(window as unknown as {pendingRequestFixture:unknown}).pendingRequestFixture);
 expect(pending).toBeTruthy();
 await battlefield.getByRole('button',{name:'返回',exact:true}).click();
 await expect(page.locator('iframe[title="剧情三消战场"]')).toHaveCount(0);
 await expect(card(page).locator('#play')).toBeEnabled();
 await card(page).locator('#play').click();
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
 await expect(battlefield.getByRole('button',{name:'返回',exact:true})).toBeVisible();
 expect(await battlefield.locator('body').evaluate(()=>(window as unknown as {pendingRequestFixture:unknown}).pendingRequestFixture)).toEqual(pending);
});


for(const viewport of [{width:320,height:568},{width:667,height:375}])test(`本体加载失败在 ${viewport.width}×${viewport.height} 短屏无区域重叠且操作可滚动到达`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.route('**/src/render/battleAssets.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const BATTLE_ASSET_LABEL={};export async function preloadBattleAssets(){throw new Error("asset failure fixture");}'}));
 const enemyDesigns=Array.from({length:4},(_,i)=>({name:`遭遇敌人${i+1}`,race:'半精灵',manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20}));
 await setup(page,true,`<match3>\n${JSON.stringify({enemyDesigns})}\n</match3>`);
 await card(page).locator('#play').click();
 const battlefield=page.frameLocator('iframe[title="剧情三消战场"]');
 await expect(battlefield.getByRole('button',{name:'重试',exact:true})).toBeVisible();
 const bounds=await battlefield.locator('.bl-screen').evaluate(el=>{
  const versus=el.querySelector('.bl-versus')!.getBoundingClientRect();const foot=el.querySelector('.bl-foot')!.getBoundingClientRect();
  return {versusBottom:versus.bottom,footTop:foot.top};
 });
 expect(bounds.versusBottom).toBeLessThanOrEqual(bounds.footTop);
 await battlefield.getByRole('button',{name:'返回',exact:true}).click();await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
});
