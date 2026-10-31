import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {abilityDisplayName,fragmentDisplayName} from '../../src/sillytavern/abilityName';
import type {StHostHandle} from '../../src/sillytavern/hostEntry';
import type {MessageEncounterSource} from '../../src/sillytavern/messageSource';
import type {BattleResult} from '../../src/session/contract';
import type {SettlementReceipt} from '../../src/sillytavern/save';
import {installTavernChat} from './tavernChat';

test.use({contextOptions:{reducedMotion:'reduce'}});

const design={name:'卡洛斯·灰刃',race:'半精灵',manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20};
const message=`守卫等待迎战。\n<match3>\n${JSON.stringify({enemyDesigns:[design]})}\n</match3>`;
interface MessageStoryFixture {
 host:StHostHandle;
 source(messageId?:number):MessageEncounterSource;
 start(messageId?:number):void;
 appendSamePlanMessage():void;
 done:boolean;
 error:string;
 editPlan():void;
 narrate():void;
 /** The newest floor (report / AI reply) has no MVU variables yet. */
 dropVariables():void;
 makeResult():Promise<BattleResult>;
}
declare global {interface Window {messageStoryFixture:MessageStoryFixture}}

async function setup(page:Page,createSave=true){
 // The bridge receives controlled battle facts; engine behavior has separate regressions.
 await page.route('**/message-battle-fixture.html*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>message battle fixture</title>'}));
 await installTavernChat(page);
 await page.goto('/sillytavern.html');
 await page.evaluate(async ({message,createSave})=>{
  const load=(path:string)=>import(/* @vite-ignore */path);
  const {installStHost}=await load('/src/sillytavern/hostEntry.ts') as typeof import('../../src/sillytavern/hostEntry');
  const {readMessageSource}=await load('/src/sillytavern/messageSource.ts') as typeof import('../../src/sillytavern/messageSource');
  const chat=[{mes:message,is_user:false,is_system:false,send_date:'2026-10-24T12:00:00',swipe_id:0}];
  let variables:Record<string,unknown>={};let noVariables=false;
  let state={stat_data:{人物:{名称:'桥测试主角',等级:20,当前生命值:180,生命值上限:200,临时生命值:0,AC:14,属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},装备列表:{}},系统配置:{三消战斗模式:true}}};
  const helpers={getContext:()=>({characterId:0,characters:[{avatar:'message-story.png'}],chat,getCurrentChatId:()=> 'message-story-chat'}),
   getVariables:()=>structuredClone(variables),updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>variables=fn(variables),
   Mvu:{getMvuData:()=>noVariables?{} as typeof state:structuredClone(state),replaceMvuData:async(data:typeof state)=>{state=structuredClone(data);}}};
  const host=await installStHost({hostWindow:window,helpers,hostId:'message-story-host',battleUrl:new URL('/message-battle-fixture.html',location.href).href,launcher:false,requireModeEnabled:true});
  if(createSave)await host.service.create();
  const fixture:MessageStoryFixture={host,done:false,error:'',source:(messageId=chat.length-1)=>readMessageSource(helpers.getContext(),messageId),
   start(messageId){fixture.done=false;fixture.error='';void host.playMessageStory(fixture.source(messageId)).catch(error=>{fixture.error=String(error.message);}).finally(()=>{fixture.done=true;});},
   appendSamePlanMessage(){chat.push({...chat[0]!,send_date:'2026-10-24T12:01:00'});},
   editPlan(){chat[0]!.mes=chat[0]!.mes.replace('"level":20','"level":21');},
   narrate(){chat[0]!.mes='新的旁白。\n'+chat[0]!.mes;},
   dropVariables(){noVariables=true;},
   async makeResult(){
    const {save}=await host.service.current();const request=save!.pendingStory!.request;
    return {schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,
     winner:'player',turns:2,combatants:[
      ...request.playerTeam.map(unit=>({externalId:unit.externalId,side:'player' as const,hp:unit.initialHp??unit.stats.hp,maxHp:unit.stats.hp,armor:unit.stats.armor,defeated:false,statuses:[]})),
      ...request.enemyTeam.map(unit=>({externalId:unit.externalId,side:'enemy' as const,hp:0,maxHp:unit.stats.hp,armor:0,defeated:true,statuses:[]}))],
     defeatedExternalIds:request.enemyTeam.map(unit=>unit.externalId),summonedCount:0,actionLogDigest:'message-story-fixture-victory',economy:{gold:0,souls:0,gems:0,maps:0},eventSummary:[]};
   }};
  window.messageStoryFixture=fixture;
 },{message,createSave});
}
async function startNew(page:Page){
 await page.evaluate(()=>window.messageStoryFixture.start());
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function closeBattle(page:Page){
 const battle=page.locator('#st-match3-story-root');
 if(await battle.locator('main.result-screen').isVisible())await battle.locator('#again').click();
 else await page.frames().find(frame=>frame.url().includes('/message-battle-fixture.html'))!.evaluate(()=>{
  const params=new URLSearchParams(location.search);
  window.parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},params.get('parentOrigin')!);
 });
 await expect.poll(()=>page.evaluate(()=>window.messageStoryFixture.done)).toBe(true);
 expect(await page.evaluate(()=>window.messageStoryFixture.error)).toBe('');
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'三消编队、图鉴与魂片',exact:true})).toBeHidden();
}
const saveOf=(page:Page)=>page.evaluate(async()=> (await window.messageStoryFixture.host.service.current()).save!);
async function completeBattle(page:Page,result?:BattleResult){
 result??=await page.evaluate(()=>window.messageStoryFixture.makeResult());
 const frame=page.frames().find(frame=>frame.url().includes('/message-battle-fixture.html'))!;
 await frame.evaluate(result=>{
  const nonce=new URL(location.href).searchParams.get('nonce');
  parent.postMessage({channel:'match3:st-replay:v1',nonce,type:'result',result,events:[]},location.origin);
 },result);
 const battle=page.locator('#st-match3-story-root');
 await expect(battle.locator('main.result-screen')).toBeVisible();
 await expect(battle.getByRole('heading',{name:/战\s*斗\s*胜\s*利/,level:1})).toBeVisible();
 await expect(battle.locator('.bar')).toBeHidden();
 await expect(battle.getByRole('status')).toBeHidden();
 await expect(battle.getByRole('button',{name:'导出本场战果'})).toBeHidden();
 await expect(battle.locator('#again')).toBeVisible();
 await expect(battle.locator('#again')).toBeEnabled();
 await expect(page.getByRole('dialog',{name:'三消编队、图鉴与魂片',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>window.messageStoryFixture.done)).toBe(false);
 return result;
}

async function expectReceipt(page:Page,receipt:SettlementReceipt){
 const detail=page.locator('#st-match3-story-root');
 await expect(detail).toHaveCount(1);
 await expect(detail.locator('main.result-screen')).toBeVisible();
 await expect(detail.locator('[data-battle-id]')).toHaveAttribute('data-battle-id',receipt.battleId);
 await expect(detail.locator('iframe')).toHaveCount(0);
 await expect(detail.locator('.settlement-grant.rs-reward')).toHaveCount(receipt.grants.length+receipt.learnedAbilityIds.length);
 for(const grant of receipt.grants){
  const card=detail.locator('.settlement-grant.rs-reward').filter({has:page.getByText(grant.kind==='fragment'?fragmentDisplayName(grant.name):grant.name,{exact:true})});
  await expect(card).toBeVisible();await expect(card.locator('[data-count]')).toHaveText(`+${grant.quantity}`);
 }
 for(const id of receipt.learnedAbilityIds){
  const card=detail.locator('.settlement-grant.rs-reward').filter({has:page.getByText(abilityDisplayName(receipt.learnedAbilityNames[id]??id),{exact:true})});
  await expect(card).toBeVisible();await expect(card.locator('[data-count]')).toHaveText('+1');
 }
 await expect(detail.locator('#again')).toBeVisible();
 await expect(detail.locator('#again')).toBeEnabled();
 await expect(page.getByRole('dialog',{name:'三消编队、图鉴与魂片',exact:true})).toBeHidden();
 expect(await page.evaluate(()=>window.messageStoryFixture.done)).toBe(false);
 expect(await page.evaluate(()=>window.messageStoryFixture.error)).toBe('');
}

test('新聊天首次预览即建档并显示敌方立绘，开战使用同一存档与同一批敌人',async({page})=>{
 await setup(page,false);
 const preview=await page.evaluate(async()=>{
  const fixture=window.messageStoryFixture;
  const before=(await fixture.host.service.current()).save;
  // Two strips rendering at once must not create two saves.
  const [first,second]=await Promise.all([fixture.host.messageStoryLineup(fixture.source()),fixture.host.messageStoryLineup(fixture.source())]);
  const saves=await fixture.host.service.repository.list();
  return {before:!!before,first,second,saves:saves.length,saveId:saves[0]?.id};
 });
 expect(preview.before).toBe(false);
 expect(preview.saves).toBe(1);
 expect(preview.first?.enemy).toHaveLength(1);
 expect(preview.first?.enemy[0]?.portraitUrl).toMatch(/\/static\/portraits\/.+\.webp$/);
 expect(preview.second).toEqual(preview.first);
 await startNew(page);
 const pending=await page.evaluate(async()=>{const {save}=await window.messageStoryFixture.host.service.current();return {saveId:save!.id,enemy:save!.pendingStory!.request.enemyTeam.map(unit=>unit.portraitUrl)};});
 expect(pending.saveId).toBe(preview.saveId);
 expect(pending.enemy.map(url=>new URL(url!,'http://x').pathname)).toEqual(preview.first!.enemy.map(unit=>new URL(unit.portraitUrl!).pathname));
});
test('同消息复用原 pending 快照与稳定标识，旁白变化不改变计划，并发不重复准备',async({page})=>{
 await setup(page);
 const preparingError=await page.evaluate(async()=>{
  const fixture=window.messageStoryFixture;fixture.start();
  try{await fixture.host.playMessageStory(fixture.source());return '';}catch(error){return (error as Error).message;}
 });
 expect(preparingError).toContain('正在准备或打开');
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const launched=await saveOf(page);
 expect(await page.evaluate(async()=>{
  const fixture=window.messageStoryFixture;
  try{await fixture.host.playMessageStory(fixture.source());return '';}catch(error){return (error as Error).message;}
 })).toContain('正在准备或打开');
 await expect(page.locator('iframe[title="剧情三消战场"]')).toHaveCount(1);
 const before=await saveOf(page);
 expect(before).toEqual(launched);
 // Check the actual persisted launch request against the same selected recipes without variation.
 const standardStats=await page.evaluate(async seed=>{
  const load=(path:string)=>import(/* @vite-ignore */path);
  const {compileEnemyEncounterPlan}=await load('/src/sillytavern/enemyDesign.ts') as typeof import('../../src/sillytavern/enemyDesign');
  const {compileEnemyBlueprint}=await load('/src/sillytavern/enemyBlueprint.ts') as typeof import('../../src/sillytavern/enemyBlueprint');
  const {parseRuntimeEncounter}=await load('/src/sillytavern/runtimeProtocol.ts') as typeof import('../../src/sillytavern/runtimeProtocol');
  const plan=parseRuntimeEncounter(window.messageStoryFixture.source().text);
  return compileEnemyEncounterPlan(plan.enemyDesigns,{seed}).members.map(({blueprint})=>compileEnemyBlueprint({portrait:blueprint.portrait,recipeTroopId:Number(blueprint.recipeId.slice(6)),assembly:blueprint.assembly,externalId:blueprint.snapshot.externalId,level:blueprint.level,difficulty:blueprint.difficulty}).snapshot.stats);
 },before.pendingStory!.request.seed);
 before.pendingStory!.request.enemyTeam.forEach((enemy,index)=>{
  expect(enemy.stats).not.toEqual(standardStats[index]);
  for(const key of ['hp','attack','armor','magic'] as const){
   expect(Math.abs(enemy.stats[key]-standardStats[index]![key])).toBeLessThanOrEqual(standardStats[index]![key]*.10+.5);
  }
 });
 const expected=await page.evaluate(async()=>{
  const load=(path:string)=>import(/* @vite-ignore */path);
  const {stableJson}=await load('/src/sillytavern/json.ts') as typeof import('../../src/sillytavern/json');
  const {parseRuntimeEncounter}=await load('/src/sillytavern/runtimeProtocol.ts') as typeof import('../../src/sillytavern/runtimeProtocol');
  const fixture=window.messageStoryFixture;const source=fixture.source();const {save}=await fixture.host.service.current();
  const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
  const identity=[save!.id,source.chatId,source.characterId,source.messageId,source.messageIdentity,source.swipeId];
  return {battleId:await hash(stableJson(identity)),requestId:await hash(stableJson([identity,parseRuntimeEncounter(source.text)]))};
 });
 expect(before.pendingStory!.request).toMatchObject({...expected,seed:Number.parseInt(expected.battleId.slice(0,8),16)});
 await closeBattle(page);
 await page.evaluate(()=>{window.messageStoryFixture.narrate();window.messageStoryFixture.start();});
 await expect(page.locator('iframe[title="剧情三消战场"]')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const resumed=await saveOf(page);
 expect(resumed.pendingStory).toEqual(before.pendingStory);
 expect(resumed.revision).toBe(before.revision);
 await closeBattle(page);
});

test('同消息 pending 的计划变化报错，保留原 ticket 和余额',async({page})=>{
 await setup(page);await startNew(page);await closeBattle(page);
 const before=await saveOf(page);
 await page.evaluate(()=>{window.messageStoryFixture.editPlan();window.messageStoryFixture.start();});
 await expect.poll(()=>page.evaluate(()=>window.messageStoryFixture.done)).toBe(true);
 expect(await page.evaluate(()=>window.messageStoryFixture.error)).toContain('遭遇内容已变化');
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await saveOf(page)).toEqual(before);
});

test('同消息重开仅显示原生结算，关闭才结束调用，多次打开不重奖，变更计划仍报错',async({page})=>{
 await setup(page);await startNew(page);const result=await completeBattle(page);
 const original=await saveOf(page);const receipt=original.settlements[0]!;
 await completeBattle(page,result);
 expect(await saveOf(page)).toEqual(original);
 expect(receipt.grants.length).toBeGreaterThan(0);
 for(const grant of receipt.grants){
  if(grant.kind==='fragment')expect(original.sources.find(source=>source.sourceId===grant.id)?.wins).toBe(grant.quantity);
  else expect(original.balances[`${grant.kind}:${grant.id}`]).toBe(grant.quantity);
 }
 await closeBattle(page);
 for(let i=0;i<2;i++){
  await page.evaluate(()=>window.messageStoryFixture.start());
  await expectReceipt(page,receipt);
  expect(await saveOf(page)).toEqual(original);
  await closeBattle(page);
  expect(await saveOf(page)).toEqual(original);
 }
 await page.evaluate(()=>{window.messageStoryFixture.editPlan();window.messageStoryFixture.start();});
 await expect.poll(()=>page.evaluate(()=>window.messageStoryFixture.done)).toBe(true);
 expect(await page.evaluate(()=>window.messageStoryFixture.error)).toContain('已有结算，但遭遇内容已变化');
 expect(await saveOf(page)).toEqual(original);
});

test('待保存 outbox 优先提示保存，保持原 pending 且不开战',async({page})=>{
 await setup(page);await startNew(page);await closeBattle(page);
 await page.evaluate(async()=>{
  const fixture=window.messageStoryFixture;const {save}=await fixture.host.service.current();
  await fixture.host.service.stageReplayOutcome(save!.id,save!.pendingStory!,await fixture.makeResult(),[],save!.chat,'story');
 });
 const before=await saveOf(page);
 await page.evaluate(()=>window.messageStoryFixture.start());
 await expect.poll(()=>page.evaluate(()=>window.messageStoryFixture.done)).toBe(true);
 expect(await page.evaluate(()=>window.messageStoryFixture.error)).toContain('已有待保存战果');
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 expect(await saveOf(page)).toEqual(before);
 expect(await page.evaluate(async()=> (await window.messageStoryFixture.host.service.repository.listReplayOutcomes()).length)).toBe(1);
});


test('不同消息的相同计划分别开战结算，各自 receipt 可重复查看且不重奖',async({page})=>{
 await setup(page);await startNew(page);await completeBattle(page);await closeBattle(page);
 const first=await saveOf(page);const firstReceipt=first.settlements[0]!;
 await page.evaluate(()=>window.messageStoryFixture.appendSamePlanMessage());
 const sources=await page.evaluate(()=>({first:window.messageStoryFixture.source(0),second:window.messageStoryFixture.source()}));
 expect(sources.second.text).toBe(sources.first.text);
 expect(sources.second.messageId).not.toBe(sources.first.messageId);
 await startNew(page);
 const pending=await saveOf(page);const secondRequest=pending.pendingStory!.request;
 expect(pending.id).toBe(first.id);
 expect(secondRequest.battleId).not.toBe(firstReceipt.battleId);
 expect(secondRequest.requestId).not.toBe(firstReceipt.requestId);
 expect(pending.settlements).toEqual(first.settlements);
 await completeBattle(page);await closeBattle(page);
 const settled=await saveOf(page);
 expect(settled.pendingStory).toBeUndefined();
 expect(settled.settlements).toHaveLength(2);
 expect(settled.settlements[0]).toEqual(firstReceipt);
 expect(settled.settlements[1]).toMatchObject({battleId:secondRequest.battleId,requestId:secondRequest.requestId,winner:'player'});
 for(const source of settled.sources){
  const granted=settled.settlements.flatMap(receipt=>receipt.grants).filter(grant=>grant.kind==='fragment'&&grant.id===source.sourceId).reduce((sum,grant)=>sum+grant.quantity,0);
  expect(source.wins).toBe(granted);
 }
 expect(settled.settlements[1]!.grants.length).toBeGreaterThan(0);
 expect(await page.evaluate(async()=> (await window.messageStoryFixture.host.service.repository.listReplayOutcomes()).length)).toBe(0);
 for(const messageId of [0,1]){
  await page.evaluate(messageId=>window.messageStoryFixture.start(messageId),messageId);
  await expectReceipt(page,settled.settlements[messageId]!);
  expect(await saveOf(page)).toEqual(settled);
  await closeBattle(page);
  expect(await saveOf(page)).toEqual(settled);
 }
});


test('旧消息 pending 在正文和管理面板都阻止恢复，保留原档且不生成同步队列',async({page})=>{
 await setup(page);await startNew(page);await closeBattle(page);
 const before=await saveOf(page);
 await page.evaluate(()=>{window.messageStoryFixture.appendSamePlanMessage();window.messageStoryFixture.start(0);});
 await expect.poll(()=>page.evaluate(()=>window.messageStoryFixture.done)).toBe(true);
 expect(await page.evaluate(()=>window.messageStoryFixture.error)).toContain('最新');
 await page.evaluate(()=>window.messageStoryFixture.host.open());
 await page.getByRole('tab',{name:'存档',exact:true}).click();
 await page.getByRole('button',{name:'重新开始剧情战斗',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'剧情原始消息、swipe、存档绑定或角色变量已变化'})).toBeVisible();
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 expect(await saveOf(page)).toEqual(before);
 expect(await page.evaluate(async()=> (await window.messageStoryFixture.host.service.repository.listReplayOutcomes()).length)).toBe(0);
 await expect(page.getByRole('button',{name:'放弃战斗',exact:true})).toBeEnabled();
});


test('战胜后的姓名和种族保存在图鉴并用于往昔再现准备',async({page})=>{
 await setup(page);await startNew(page);await completeBattle(page);await closeBattle(page);
 const save=await saveOf(page);
 expect(save.encounters[0]!.enemyTeam[0]).toMatchObject({name:design.name,race:design.race});
 await page.evaluate(()=>window.messageStoryFixture.host.open());
 await page.getByRole('tab',{name:'往昔再现',exact:true}).click();
 const bestiary=page.getByRole('region',{name:'往昔再现',exact:true});
 await expect(bestiary).toContainText(design.name);
 await bestiary.getByText('查看原场敌方配置',{exact:true}).click();
 await expect(bestiary.getByText(`种族：${design.race}`,{exact:true})).toBeVisible();
 await bestiary.getByRole('button',{name:'重复挑战',exact:true}).click();
 await expect(page.locator('iframe[title="往昔再现战场"]')).toBeVisible();
 await expect(page.getByRole('dialog',{name:'往昔再现队伍准备',exact:true})).toHaveCount(0);
 const replay=await saveOf(page);
 expect(replay.pendingReplay!.request.enemyTeam).toEqual(save.encounters[0]!.enemyTeam);
 expect(replay.pendingReplay!.request.enemyTeam[0]).toMatchObject({name:design.name,race:design.race});
 await page.frames().find(frame=>frame.url().includes('/message-battle-fixture.html'))!.evaluate(()=>{
  const params=new URLSearchParams(location.search);
  parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},location.origin);
 });
 await expect(page.locator('#st-match3-replay-root')).toHaveCount(0);
 expect(await saveOf(page)).toEqual(replay);
 expect(replay.encounters).toEqual(save.encounters);
});

test('继续发出战报后，最新楼层暂无 MVU 变量也不把错误显示到战斗入口',async({page})=>{
 await setup(page);await startNew(page);await completeBattle(page);
 // "继续" sends the report; the new floor has no variables until MVU processes it.
 await page.evaluate(()=>window.messageStoryFixture.dropVariables());
 await closeBattle(page);
});
