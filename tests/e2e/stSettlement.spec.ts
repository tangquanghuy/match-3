import {test,expect,type Page} from '@playwright/test';
import type {StSave} from '../../src/sillytavern/save';
import type {BattleRequest,BattleResult} from '../../src/session/contract';

test.use({contextOptions:{reducedMotion:'reduce'}});

test('ST visible settlement agrees with persisted currency and material credits, including retry and defeat',async({page})=>{
 await page.goto('/sillytavern.html');
 const first=await page.evaluate(async()=>{
   const paths=['/src/sillytavern/save.ts','/src/sillytavern/saveRepository.ts','/src/sillytavern/settlementView.ts','/src/session/contract.ts'];
   const [domain,storage,view,contract]=await Promise.all(paths.map(p=>import(/* @vite-ignore */p)));
   const repository=await storage.StSaveRepository.open();const chat={hostId:location.origin,characterId:'hero',chatId:'story'};let save=await repository.create(chat,'visible');
   const actor=(externalId:string)=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:['Blue'],manaCost:3,skillId:'gw_KnightsSword'});
   const request:BattleRequest={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'win',requestId:'win-request',seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]} as BattleRequest;
   const result:BattleResult={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'win',requestId:'win-request',seed:42,winner:'player',turns:3,combatants:[{externalId:'hero',side:'player',hp:70,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'digest-win',eventSummary:[]};
   const encounter={id:'encounter',storyBattleId:'win',enemyTeam:request.enemyTeam,sources:[{sourceId:'source',abilityId:'active:one',abilityName:'冰矢',rank:4,enemyExternalId:'enemy'}],difficulty:'normal',seed:42};
   const input={kind:'story',encounter,request,result,events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:5},{kind:'currency',id:'gems',name:'宝石',quantity:3},{kind:'material',id:'iron',name:'铁矿石',quantity:2}]};
   save=await repository.update(save.id,save.revision,(draft:StSave)=>{domain.settleSave(draft,input);});
   const afterFirst=structuredClone(save.balances);const receipt=structuredClone(save.settlements[0]);save=await repository.update(save.id,save.revision,(draft:StSave)=>{domain.settleSave(draft,input);});
   view.renderStSettlement(document.querySelector('#st-preview'),save.settlements[0]);repository.close();return {afterFirst,afterRetry:save.balances,receipt:save.settlements[0],originalReceipt:receipt,receiptCount:save.settlements.length,wins:save.sources[0].wins};
 });
 expect(first.afterFirst).toEqual({'currency:gems':8,'material:iron':2});expect(first.afterRetry).toEqual(first.afterFirst);
 expect(first.receipt).toEqual(first.originalReceipt);expect(first.receiptCount).toBe(1);expect(first.wins).toBe(1);
 expect(first.receipt.grants).toEqual([
  {kind:'fragment',id:'source',name:'enemy的灵魂碎片',quantity:1},
  {kind:'currency',id:'gems',name:'宝石',quantity:5},
  {kind:'currency',id:'gems',name:'宝石',quantity:3},
  {kind:'material',id:'iron',name:'铁矿石',quantity:2},
 ]);
 const result=page.locator('main.result-screen');
 await expect(result).toBeVisible();await expect(result.getByRole('heading',{name:/战\s*斗\s*胜\s*利/,level:1})).toBeVisible();
 const cards=result.getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward');
 await expect(cards).toHaveText([/\+1\s*enemy的灵魂碎片/,/\+5\s*宝石/,/\+3\s*宝石/,/\+2\s*铁矿石/]);
 for(const index of [0,1,2,3])await expect(cards.nth(index)).toBeVisible();
 expect(first.receipt.report.units.find((unit:{externalId:string})=>unit.externalId==='hero')).toMatchObject({side:'player',initialHp:100,initialMaxHp:100,finalHp:70,finalMaxHp:100,initialHpPercent:100,finalHpPercent:70,hpLostPercentagePoints:30,finallyDefeated:false});
 await expect(result.getByRole('region',{name:'本场战果'})).toHaveCount(0);
 await expect(result.getByRole('region',{name:'战斗资源记录'})).toHaveCount(0);
 await expect(result).not.toContainText('生命净损失');
 const loss=await page.evaluate(async()=>{
   const paths=['/src/sillytavern/save.ts','/src/sillytavern/saveRepository.ts','/src/sillytavern/settlementView.ts'];const [domain,storage,view]=await Promise.all(paths.map(p=>import(/* @vite-ignore */p)));
   const repository=await storage.StSaveRepository.open();let save=(await repository.list())[0] as StSave;const old=save.settlements[0]!;
   const result={...old.result,battleId:'loss',requestId:'loss-request',winner:'enemy',combatants:old.result.combatants.map(unit=>unit.side==='player'?{...unit,hp:0,defeated:true}:{...unit,hp:unit.maxHp,defeated:false}),defeatedExternalIds:['hero'],actionLogDigest:'digest-loss'};const request={...old.request,battleId:'loss',requestId:'loss-request'};
   const encounter={...save.encounters[0]!,id:'lost-encounter',storyBattleId:'loss'};
   save=await repository.update(save.id,save.revision,(draft:StSave)=>{domain.settleSave(draft,{kind:'story',encounter,request,result,events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:999}]});});
   const receipt=structuredClone(save.settlements[1]);
   save=await repository.update(save.id,save.revision,(draft:StSave)=>{domain.settleSave(draft,{kind:'story',encounter,request,result,events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:9999}]});});
   view.renderStSettlement(document.querySelector('#st-preview'),save.settlements[1]);repository.close();return {balances:save.balances,grants:save.settlements[1]!.grants,receipt:save.settlements[1],originalReceipt:receipt,receiptCount:save.settlements.length,wins:save.sources[0].wins};
 });
 expect(loss.balances).toEqual(first.afterFirst);expect(loss.grants).toEqual([]);
 expect(loss.receipt).toEqual(loss.originalReceipt);expect(loss.receiptCount).toBe(2);expect(loss.wins).toBe(1);
 expect(loss.receipt.report.units.find((unit:{externalId:string})=>unit.externalId==='hero')).toMatchObject({initialHp:100,finalHp:0,hpLostPercentagePoints:100,finallyDefeated:true});
 await expect(result).toBeVisible();await expect(result.getByRole('heading',{name:/战\s*斗\s*失\s*败/,level:1})).toBeVisible();
 await expect(result.locator('.settlement-grant')).toHaveCount(0);await expect(result).not.toContainText('本场没有获得');
 await expect(result.getByRole('region',{name:'本场战果'})).toHaveCount(0);
});


declare global {
 interface Window {
  settlementPresentation:{
   reopen():void;
   dispose():void;
   setContinueEnabled(enabled:boolean):void;
   snapshot():{receiptUnchanged:boolean;saveUnchanged:boolean;continued:number};
  };
 }
}

/** A real committed legacy receipt; presentation must never rewrite its names or balances. */
async function mountPresentation(page:Page,count=1,learned=false,legacy=false){
 await page.goto('/sillytavern.html');
 return page.evaluate(async({count,learned,legacy})=>{
  const paths=['/src/sillytavern/save.ts','/src/sillytavern/settlementView.ts','/src/session/contract.ts'];
  const [domain,view,contract]=await Promise.all(paths.map(path=>import(/* @vite-ignore */path)));
  const actor=(externalId:string)=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:['Blue'],manaCost:3,skillId:'gw_KnightsSword'});
  const request:BattleRequest={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'presentation',requestId:'presentation-request',seed:42,playerTeam:[actor('hero')],enemyTeam:[{...actor('enemy'),name:'遗迹守卫'}]} as BattleRequest;
  const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:42,winner:'player',turns:1,combatants:[{externalId:'hero',side:'player',hp:100,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'presentation-digest',eventSummary:[]};
  const source={sourceId:'source-08hzkdw',abilityId:'active:08hzkdw',abilityName:'敌方前2名伤害〔08hzkdw〕',rank:4,enemyExternalId:'enemy'};
  const save:StSave=domain.createSave(domain.emptyRoot(),{hostId:location.origin,characterId:'hero',chatId:'presentation'},'presentation');
  if(learned)save.sources.push({sourceId:source.sourceId,abilityId:source.abilityId,abilityName:source.abilityName,rank:source.rank,wins:4});
  const encounter=domain.recordEncounter(request,[source],'normal','presentation-encounter');
  const receipt=domain.settleSave(save,{kind:'story',request,result,encounter,events:[],storyGrants:Array.from({length:count-1},(_,i)=>({kind:'material',id:`long-material-${i}`,name:`结算材料${i+1}：${'完整名称'.repeat(12)}〔08hzkdw〕`,quantity:i+2}))});
  if(legacy){receipt.grants[0].name=`${source.abilityName}灵魂碎片`;save.settlements[0].grants[0].name=receipt.grants[0].name;}
  const receiptBefore=JSON.stringify(receipt),saveBefore=JSON.stringify(save);
  const mount=document.querySelector<HTMLElement>('#st-preview')!;
  mount.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:10020';
  let continued=0;
  let resultView=view.renderStSettlement(mount,receipt,{onContinue:()=>{continued++;},sources:encounter.sources});
  window.settlementPresentation={
   reopen(){resultView=view.renderStSettlement(mount,receipt,{onContinue:()=>{continued++;},sources:encounter.sources});},
   dispose(){resultView.dispose();},
   setContinueEnabled(enabled){resultView.setContinueEnabled(enabled);},
   snapshot:()=>({receiptUnchanged:receiptBefore===JSON.stringify(receipt),saveUnchanged:saveBefore===JSON.stringify(save),continued}),
  };
  return {receipt:structuredClone(receipt),balances:structuredClone(save.balances)};
 },{count,learned,legacy});
}

for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:900,height:320}]){
 for(const count of [1,4,5]){
  test(`ST committed presentation ${viewport.width}x${viewport.height}: ${count} long rewards fit the native summary`,async({page})=>{
   await page.setViewportSize(viewport);
   const committed=await mountPresentation(page,count);
   const result=page.locator('main.result-screen');
   const cards=result.locator('.settlement-grant');
   await expect(result).toHaveAttribute('data-result-mode','committed');
   await expect(cards).toHaveCount(count);
   await expect(cards.first()).toHaveText(/\+1\s*遗迹守卫的灵魂碎片/);
   await expect(cards.first()).toHaveAttribute('data-grant-id','source-08hzkdw');
   if(count>1)await expect(cards.nth(1)).toContainText('〔08hzkdw〕'); // Material names are not ability metadata.
   for(let i=0;i<count;i++){
    await expect(cards.nth(i).locator('[data-count]')).toHaveAttribute('data-count',String(committed.receipt.grants[i].quantity));
    await expect(cards.nth(i)).toHaveAttribute('data-grant-id',committed.receipt.grants[i].id);
   }
   const metrics=await result.evaluate(root=>{
    const box=(selector:string)=>root.querySelector(selector)!.getBoundingClientRect();
    const title=box('#resultTitle'),strip=box('#standardRewards'),art=box('.rs-banner-art img'),screen=root.getBoundingClientRect();
    const scroll=root.querySelector('#resultScroll')!;
    const horizontalOverflow=[...root.querySelectorAll<HTMLElement>('.rs-reward')].some(card=>card.scrollWidth>card.clientWidth+1);
    return {gap:strip.top-title.bottom,artOverlap:art.bottom-strip.top,screenHeight:screen.height,scrollOverflow:scroll.scrollWidth-scroll.clientWidth,horizontalOverflow};
   });
   expect(metrics.gap).toBeGreaterThanOrEqual(0);
   // The reward strip starts below the banner's zodiac art instead of covering it.
   expect(metrics.artOverlap).toBeLessThanOrEqual(1);
   expect(metrics.screenHeight).toBeLessThanOrEqual(viewport.height);
   expect(metrics.scrollOverflow).toBeLessThanOrEqual(1);
   expect(metrics.horizontalOverflow).toBe(false);
   const scroll=result.getByRole('region',{name:'结算奖励',exact:true});
   await scroll.evaluate(node=>{node.scrollTop=node.scrollHeight;});
   await expect(cards.last()).toBeInViewport();
   const again=result.getByRole('button',{name:'继续',exact:true});
   await expect(again).toBeInViewport();await again.click();
   expect(await page.evaluate(()=>window.settlementPresentation.snapshot())).toEqual({receiptUnchanged:true,saveUnchanged:true,continued:1});
  });
 }
}

test('ST embedded settlement retains auto height and fits the space below a visible toolbar',async({page})=>{
 await page.setViewportSize({width:900,height:320});
 await mountPresentation(page,5);
 const mount=page.locator('#st-preview');
 await mount.evaluate(node=>{node.style.cssText='position:relative;width:100%;height:auto;min-height:0;padding:0;border:0';});
 expect(await mount.evaluate(node=>node.getBoundingClientRect().height)).toBe(360);
 expect(await page.locator('main.result-screen').evaluate(node=>node.getBoundingClientRect().height)).toBe(360);
 await mount.evaluate(node=>{node.style.cssText='position:fixed;top:52px;left:0;width:100%;height:calc(100% - 52px);min-height:0;padding:0;border:0;z-index:10020';});
 const result=page.locator('main.result-screen');
 expect(await result.evaluate(node=>node.getBoundingClientRect().height)).toBe(268);
 expect(await result.evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(320);
 await result.getByRole('region',{name:'结算奖励',exact:true}).evaluate(node=>{node.scrollTop=node.scrollHeight;});
 await expect(result.locator('.settlement-grant').last()).toBeInViewport();
 const again=result.getByRole('button',{name:'继续',exact:true});
 await expect(again).toBeInViewport();await again.click();
 expect(await page.evaluate(()=>window.settlementPresentation.snapshot())).toEqual({receiptUnchanged:true,saveUnchanged:true,continued:1});
});

test('ST legacy fragment receipts resolve the recorded enemy without rewriting grants or learning identities',async({page})=>{
 const committed=await mountPresentation(page,1,true,true);
 expect(committed.receipt.grants[0]).toMatchObject({id:'source-08hzkdw',name:'敌方前2名伤害〔08hzkdw〕灵魂碎片',quantity:1});
 expect(committed.receipt.learnedAbilityNames['active:08hzkdw']).toBe('敌方前2名伤害〔08hzkdw〕');
 const cards=page.locator('.settlement-grant');
 for(let reopen=0;reopen<2;reopen++){
  await expect(cards).toHaveText([/\+1\s*遗迹守卫的灵魂碎片/,/\+1\s*敌方前2名伤害/]);
  await expect(cards.nth(1)).toHaveAttribute('data-grant-id','active:08hzkdw');
  await page.evaluate(()=>window.settlementPresentation.reopen());
 }
 const names=await page.evaluate(async()=>{
  const path='/src/sillytavern/abilityName.ts';const {abilityDisplayName,fragmentDisplayName}=await import(/* @vite-ignore */path);
  return {
   abilities:['伤害〔08hzkdw〕','伤害 [08HZKDW]','伤害〔123456〕','伤害〔12345678〕','伤害〔08hzkdw〕附注','伤害〔技能名称啊啊啊〕'].map(abilityDisplayName),
   fragments:['伤害〔08hzkdw〕灵魂碎片','伤害 [08HZKDW]灵魂碎片','伤害〔08hzkdw〕附注灵魂碎片','材料〔08hzkdw〕','伤害〔123456〕灵魂碎片'].map(fragmentDisplayName),
  };
 });
 expect(names.abilities).toEqual(['伤害','伤害','伤害〔123456〕','伤害〔12345678〕','伤害〔08hzkdw〕附注','伤害〔技能名称啊啊啊〕']);
 expect(names.fragments).toEqual(['伤害灵魂碎片','伤害灵魂碎片','伤害〔08hzkdw〕附注灵魂碎片','材料〔08hzkdw〕','伤害〔123456〕灵魂碎片']);
 expect(await page.evaluate(()=>window.settlementPresentation.snapshot())).toEqual({receiptUnchanged:true,saveUnchanged:true,continued:0});
});

test('ST native continue disabled state and page motion preference survive shadow hosting and reopen',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await mountPresentation(page);
 const again=page.getByRole('button',{name:'继续',exact:true});
 await page.evaluate(()=>window.settlementPresentation.setContinueEnabled(false));
 await expect(again).toBeDisabled();await expect(again).toHaveCSS('opacity','0.42');await expect(again).toHaveCSS('cursor','not-allowed');
 await page.evaluate(()=>window.settlementPresentation.setContinueEnabled(true));
 await expect(again).toBeEnabled();await expect(again).toHaveCSS('opacity','1');await again.click();
 const particle=page.locator('.rs-particles i').first();
 await page.evaluate(()=>{document.documentElement.dataset.motion='full';});
 await expect(particle).toHaveCSS('animation-name','rs-ember');
 await page.evaluate(()=>{document.documentElement.dataset.motion='reduced';});
 await expect(particle).toHaveCSS('animation-name','none');await expect(page.locator('.rs-particles')).toBeHidden();
 await page.evaluate(()=>window.settlementPresentation.reopen());
 await expect(particle).toHaveCSS('animation-name','none');
 await page.evaluate(()=>{document.documentElement.dataset.motion='full';});
 await expect(particle).toHaveCSS('animation-name','rs-ember');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(particle).toHaveCSS('animation-name','none');
 expect(await page.evaluate(()=>window.settlementPresentation.snapshot())).toEqual({receiptUnchanged:true,saveUnchanged:true,continued:1});
 await page.evaluate(()=>window.settlementPresentation.dispose());
 await expect(page.locator('main.result-screen')).toHaveCount(0);
});
