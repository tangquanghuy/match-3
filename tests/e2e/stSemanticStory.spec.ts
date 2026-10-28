import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import type {StHostHandle} from '../../src/sillytavern/hostEntry';
import type {BattleResult} from '../../src/session/contract';

test.use({contextOptions:{reducedMotion:'reduce'}});

interface SemanticReceiptFixture {
 handle:StHostHandle;
 design:typeof import('../../src/sillytavern/enemyDesign').DEFAULT_ENEMY_DESIGN_INPUT;
 play?:Promise<unknown>;
 error?:string;
}
declare global {interface Window {
 semanticStory:SemanticReceiptFixture;
 semanticReceiptMessage:{channel:string;nonce:string|null;type:string;result:BattleResult;events:[]};
 semanticDuplicateAcks:number;
}}


async function install(page:Page){
 await page.goto('/sillytavern.html');
 await page.evaluate(async()=>{
  const entry='/src/sillytavern/hostEntry.ts',design='/src/sillytavern/enemyDesign.ts';
  const {installStHost}=await import(/* @vite-ignore */entry);
  const {DEFAULT_ENEMY_DESIGN_INPUT}=await import(/* @vite-ignore */design);
  let variables:Record<string,unknown>={};
  const state={stat_data:{人物:{名称:'旅人',等级:20,生命值上限:200,当前生命值:200,临时生命值:0,AC:14,属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},装备列表:{}},羁绊列表:{},系统配置:{战斗数值模式:'classic'}}};
  const handle=await installStHost({hostWindow:window,hostId:'semantic-story',battleUrl:new URL('/sillytavern-battle.html',location.href).href,helpers:{
   getContext:()=>({characterId:0,characters:[{avatar:'semantic-story.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>'semantic-chat'}),
   getVariables:()=>structuredClone(variables),updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>{variables=fn(structuredClone(variables));},
   Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async(next:any)=>Object.assign(state,next)},
  }});
  await handle.service.create();
  (window as any).semanticStory={handle,design:DEFAULT_ENEMY_DESIGN_INPUT};
 });
}

test('host accepts a semantic encounter and freezes the compiled roster in a real battle',async({page})=>{
 await install(page);
 await page.evaluate(()=>{
  const f=(window as any).semanticStory;
  f.play=f.handle.playStory({enemyDesigns:[f.design,{...f.design,level:1}],difficulty:'普通',seed:42}).catch((error:Error)=>{f.error=error.message;});
 });
 await expect(page.frameLocator('iframe[title="剧情三消战场"]').locator('.gcard.enemy')).toHaveCount(2,{timeout:30_000});
 const pending=await page.evaluate(async()=>{
  const f=(window as any).semanticStory;return (await f.handle.service.current()).save.pendingStory;
 });
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
 expect(pending.request.playerTeam[0]).toMatchObject({externalId:'/人物',skillId:'gw_KnightsSword'});
 expect(pending.request.seed).toBe(42);
 expect(pending.request.enemyTeam.map((e:any)=>e.externalId)).toEqual(['enemy-1','enemy-2']);
 expect(pending.sources.map((s:any)=>s.enemyExternalId)).toEqual(['enemy-1','enemy-2']);
 expect(pending.request.enemyTeam.every((e:any)=>e.skillId.startsWith('st:')&&e.traitIds.length>0)).toBe(true);
 expect(await page.evaluate(()=>(window as any).semanticStory.error)).toBeUndefined();
});

test('invalid semantic member rejects before party preparation or pending battle creation',async({page})=>{
 await install(page);
 const error=await page.evaluate(async()=>{
  const f=(window as any).semanticStory;
  try{await f.handle.playStory({enemyDesigns:[f.design,{...f.design,form:'未知'}],difficulty:'普通',seed:42});}
  catch(error){return (error as Error).message;}
 });
 expect(error).toContain('form');
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
 expect(await page.evaluate(async()=>((await (window as any).semanticStory.handle.service.current()).save.pendingStory))).toBeUndefined();
 await expect(page.locator('iframe[title="剧情三消战场"]')).toHaveCount(0);
});

for(const kind of ['semantic','blueprint'] as const){
 test(`over-budget ${kind} encounter rejects before party preparation or pending creation`,async({page})=>{
  await install(page);
  const result=await page.evaluate(async(kind)=>{
   const f=(window as any).semanticStory;
   const modulePath='/src/sillytavern/enemyDesign.ts';
   const {compileEnemyEncounterPlan}=await import(/* @vite-ignore */modulePath);
   const compiled=compileEnemyEncounterPlan([f.design,f.design],{seed:42});
   const cap=compiled.budget.totalPower-1;
   const input=kind==='semantic'?{enemyDesigns:[f.design,f.design]}:{enemies:compiled.members.map((m:any)=>m.blueprint)};
   try{await f.handle.playStory({...input,difficulty:'普通',seed:42,budgetPolicy:{version:1,id:'host-test',maxTeamPower:cap}});}
   catch(error){return {message:(error as Error).message,cap,actual:compiled.budget.totalPower};}
  },kind);
  expect(result!.message).toContain('超过整队上限');
  expect(result!.message).toContain(String(result!.actual));expect(result!.message).toContain(String(result!.cap));
  await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
  expect(await page.evaluate(async()=>((await (window as any).semanticStory.handle.service.current()).save.pendingStory))).toBeUndefined();
  await expect(page.locator('iframe[title="剧情三消战场"]')).toHaveCount(0);
 });
}

test('semantic story renders the committed native receipt and duplicate delivery keeps its grants unchanged',async({page})=>{
 await install(page);
 await page.evaluate(()=>{
  const f=window.semanticStory;
  f.play=f.handle.playStory({enemyDesigns:[{...f.design,level:1}],difficulty:'普通',seed:42}).catch((error:Error)=>{f.error=error.message;});
 });
 const frame=page.frameLocator('iframe[title="剧情三消战场"]');
 await expect(frame.locator('.gcard.enemy')).toHaveCount(1,{timeout:30_000});
 const request=await page.evaluate(async()=>((await window.semanticStory.handle.service.current()).save!.pendingStory!.request));
 // Control battle facts at the bridge; the existing real-cast tests cover engine completion.
 await frame.locator('body').evaluate((_,request)=>{
  const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner:'player',turns:1,
   combatants:[...request.playerTeam.map((unit)=>({externalId:unit.externalId,side:'player' as const,hp:unit.initialHp??unit.stats.hp,maxHp:unit.stats.hp,armor:unit.stats.armor,defeated:false,statuses:[]})),...request.enemyTeam.map((unit)=>({externalId:unit.externalId,side:'enemy' as const,hp:0,maxHp:unit.stats.hp,armor:0,defeated:true,statuses:[]}))],
   defeatedExternalIds:request.enemyTeam.map((unit)=>unit.externalId),summonedCount:0,actionLogDigest:'semantic-native-receipt',eventSummary:[]};
  const message={channel:'match3:st-replay:v1',nonce:new URLSearchParams(location.search).get('nonce'),type:'result',result,events:[] as []};
  window.semanticReceiptMessage=message;parent.postMessage(message,location.origin);
 },request);
 const battle=page.locator('#st-match3-story-root');const result=battle.locator('main.result-screen');
 await expect(result).toBeVisible();await expect(result.getByRole('heading',{name:/战\s*斗\s*胜\s*利/,level:1})).toBeVisible();
 await expect(battle.locator('.bar')).toBeHidden();await expect(battle.getByRole('status')).toBeHidden();
 await expect(result.locator('#again')).toBeVisible();await expect(result.locator('#again')).toBeEnabled();
 const committed=await page.evaluate(async()=>((await window.semanticStory.handle.service.current()).save));
 const receipt=committed!.settlements[0]!;expect(receipt.battleId).toBe(request.battleId);expect(receipt.grants.length).toBeGreaterThan(0);
 const cards=result.getByRole('region',{name:'本场实际获得',exact:true}).locator('.settlement-grant.rs-reward');
 await expect(cards).toHaveCount(receipt.grants.length+receipt.learnedAbilityIds.length);
 for(const grant of receipt.grants){
  const card=cards.filter({has:page.getByText(grant.name,{exact:true})});
  await expect(card).toBeVisible();await expect(card.locator('[data-count]')).toHaveText(`+${grant.quantity}`);
 }
 await expect(result.getByRole('region',{name:'本场战果',exact:true})).toHaveCount(0);
 await expect(result.getByRole('region',{name:'战斗资源记录',exact:true})).toHaveCount(0);
 await frame.locator('body').evaluate(()=>{
  window.semanticDuplicateAcks=0;window.addEventListener('message',event=>{if(event.data?.type==='ack')window.semanticDuplicateAcks++;});
  parent.postMessage(window.semanticReceiptMessage,location.origin);parent.postMessage(window.semanticReceiptMessage,location.origin);
 });
 await expect.poll(()=>frame.locator('body').evaluate(()=>window.semanticDuplicateAcks)).toBeGreaterThanOrEqual(2);
 expect(await page.evaluate(async()=>((await window.semanticStory.handle.service.current()).save))).toEqual(committed);
 expect(await page.evaluate(async()=>(await window.semanticStory.handle.service.repository.listReplayOutcomes()).length)).toBe(0);
 await result.locator('#again').click();await expect(battle).toHaveCount(0);
});
