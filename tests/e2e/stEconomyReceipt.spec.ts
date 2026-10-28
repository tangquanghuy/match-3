import {test,expect} from '@playwright/test';
import type {BattleRequest,BattleResult} from '../../src/session/contract';
import type {BattleEconomyAudit} from '../../src/engine/battleEconomyLedger';
import type {SettlementReceipt,StSave} from '../../src/sillytavern/save';

test.use({contextOptions:{reducedMotion:'reduce'}});

declare global {interface Window {readSettlementScroll():{continued:number;unchanged:boolean}}}

for(const winner of ['player','enemy'] as const){
 test(`ST economy receipt: ${winner} keeps battle records separate from committed grants across retry and reopen`,async({page})=>{
   await page.goto('/sillytavern.html');
   const first=await page.evaluate(async(winner)=>{
     const paths=['/src/sillytavern/save.ts','/src/sillytavern/saveRepository.ts','/src/sillytavern/settlementView.ts','/src/session/contract.ts'];
     const [domain,storage,view,contract]=await Promise.all(paths.map(path=>import(/* @vite-ignore */path)));
     const repository=await storage.StSaveRepository.open();
     let save:StSave=await repository.create({hostId:location.origin,characterId:'hero',chatId:winner},`economy-${winner}`);
     const actor=(externalId:string)=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:['Blue'],manaCost:3,skillId:'gw_KnightsSword'});
     const request:BattleRequest={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:`battle-${winner}`,requestId:`request-${winner}`,seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]} as BattleRequest;
     const initial={leftGold:0,rightGold:0,souls:0,gems:0,maps:0};
     // Independent Gold accounts and enemy-triggered changes to shared resources.
     const economyAudit:BattleEconomyAudit={version:1,initial,final:{leftGold:23,rightGold:14,souls:4,gems:3,maps:1},entries:[
       {sequence:1,actionIndex:0,currency:'gold',account:'Left',side:'Left',source:'skill-gain',operation:'gain',multiplier:1,cap:500,requested:25,before:0,after:25,delta:25},
       {sequence:2,actionIndex:0,currency:'gold',account:'Right',side:'Right',source:'trait',operation:'gain',multiplier:1,cap:500,requested:19,before:0,after:19,delta:19},
       {sequence:3,actionIndex:0,currency:'souls',account:'shared',side:'Right',source:'skill-gain',operation:'gain',multiplier:1,cap:200,requested:4,before:0,after:4,delta:4},
       {sequence:4,actionIndex:0,currency:'gems',account:'shared',side:'Right',source:'booty-gem',operation:'gain',requested:3,before:0,after:3,delta:3},
       {sequence:5,actionIndex:0,currency:'maps',account:'shared',side:'Left',source:'skill-gain',operation:'gain',cap:2,requested:1,before:0,after:1,delta:1},
       {sequence:6,actionIndex:0,currency:'gold',account:'Left',side:'Left',source:'skill-spend',operation:'spend',requested:7,before:25,after:18,delta:-7},
       {sequence:7,actionIndex:0,currency:'gold',account:'Right',side:'Left',source:'skill-theft',actorId:0,operation:'steal-debit',transferId:7,requested:5,before:19,after:14,delta:-5},
       {sequence:8,actionIndex:0,currency:'gold',account:'Left',side:'Left',source:'skill-theft',actorId:0,operation:'steal-credit',transferId:7,multiplier:1,cap:500,requested:5,before:18,after:23,delta:5},
     ]} as BattleEconomyAudit;
     const result:BattleResult={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:request.battleId,requestId:request.requestId,seed:42,winner,turns:3,
       combatants:[{externalId:'hero',side:'player',hp:winner==='player'?100:0,maxHp:100,armor:0,defeated:winner==='enemy',statuses:[]},{externalId:'enemy',side:'enemy',hp:winner==='player'?0:100,maxHp:100,armor:0,defeated:winner==='player',statuses:[]}],
       defeatedExternalIds:[winner==='player'?'enemy':'hero'],summonedCount:0,actionLogDigest:`digest-${winner}`,eventSummary:[],economy:{gold:23,souls:4,gems:3,maps:1},economyAudit};
     const encounter=domain.recordEncounter(request,[{sourceId:'ice',abilityId:'active:ice',abilityName:'冰矢',rank:4,enemyExternalId:'enemy'}],'normal','encounter');
     const input={kind:'story',request,result,encounter,events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:5},{kind:'material',id:'iron',name:'铁矿石',quantity:2}]};
     save=await repository.update(save.id,save.revision,(draft:StSave)=>{draft.balances={'currency:gems':11};domain.settleSave(draft,input);});
     const afterFirst=structuredClone(save.balances);const receipt=structuredClone(save.settlements[0]);
     save=await repository.update(save.id,save.revision,(draft:StSave)=>{domain.settleSave(draft,{...input,storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:999}]});});
     const beforeRender=JSON.stringify(save);const originalRandom=Math.random;
     Math.random=()=>{throw new Error('unexpected settlement roll');};
     try{view.renderStSettlement(document.querySelector('#st-preview'),save.settlements[0]);}finally{Math.random=originalRandom;}
     repository.close();
     return {afterFirst,afterRetry:save.balances,receipt,storedReceipt:save.settlements[0],renderUnchanged:beforeRender===JSON.stringify(save),sources:save.sources};
   },winner);
   const expectedWallet=winner==='player'?{'currency:gems':16,'material:iron':2}:{'currency:gems':11};
   expect(first.afterFirst).toEqual(expectedWallet);expect(first.afterRetry).toEqual(expectedWallet);
   expect(first.storedReceipt).toEqual(first.receipt);expect(first.renderUnchanged).toBe(true);
   expect(first.sources).toHaveLength(winner==='player'?1:0);
   const result=page.locator('main.result-screen');
   const grants=result.getByRole('region',{name:'本场实际获得',exact:true});
   await expect(result).toBeVisible();
   await expect(result.getByRole('heading',{name:winner==='player'?/战\s*斗\s*胜\s*利/:/战\s*斗\s*失\s*败/,level:1})).toBeVisible();
   await expect(result.locator('#rewardRows')).toHaveAttribute('aria-label','本场实际获得');
   await expect(page.getByRole('region',{name:'战斗资源记录',exact:true})).toHaveCount(0);
   await expect(page.getByRole('region',{name:'本场战果',exact:true})).toHaveCount(0);
   await expect(result.locator('.settlement-economy-entry')).toHaveCount(0);
   await expect(result).not.toContainText('本场没有获得');
   const audit=first.receipt.result.economyAudit!;
   expect(audit.version).toBe(1);
   expect(audit.initial).toEqual({leftGold:0,rightGold:0,souls:0,gems:0,maps:0});
   expect(audit.final).toEqual({leftGold:23,rightGold:14,souls:4,gems:3,maps:1});
   expect(first.receipt.result.economy).toEqual({gold:23,souls:4,gems:3,maps:1});
   expect(audit.entries).toMatchObject([
     {sequence:1,currency:'gold',account:'Left',side:'Left',source:'skill-gain',operation:'gain',before:0,after:25,delta:25},
     {sequence:2,currency:'gold',account:'Right',side:'Right',source:'trait',operation:'gain',before:0,after:19,delta:19},
     {sequence:3,currency:'souls',account:'shared',side:'Right',source:'skill-gain',operation:'gain',before:0,after:4,delta:4},
     {sequence:4,currency:'gems',account:'shared',side:'Right',source:'booty-gem',operation:'gain',before:0,after:3,delta:3},
     {sequence:5,currency:'maps',account:'shared',side:'Left',source:'skill-gain',operation:'gain',before:0,after:1,delta:1},
     {sequence:6,currency:'gold',account:'Left',side:'Left',source:'skill-spend',operation:'spend',before:25,after:18,delta:-7},
     {sequence:7,currency:'gold',account:'Right',side:'Left',source:'skill-theft',operation:'steal-debit',transferId:7,before:19,after:14,delta:-5},
     {sequence:8,currency:'gold',account:'Left',side:'Left',source:'skill-theft',operation:'steal-credit',transferId:7,before:18,after:23,delta:5},
   ]);
   expect(first.receipt.grants).toEqual(winner==='player'?[
     {kind:'fragment',id:'ice',name:'enemy的灵魂碎片',quantity:1},
     {kind:'currency',id:'gems',name:'宝石',quantity:5},
     {kind:'material',id:'iron',name:'铁矿石',quantity:2},
   ]:[]);
   const expectedCards=winner==='player'?[/\+1\s*enemy的灵魂碎片/,/\+5\s*宝石/,/\+2\s*铁矿石/]:[];
   await expect(grants.locator('.settlement-grant.rs-reward')).toHaveText(expectedCards);
   if(winner==='player')await expect(grants).toBeVisible();
   const firstCards=await result.locator('.settlement-grant.rs-reward').allTextContents();
   await page.reload();
   const restored=await page.evaluate(async()=>{
     const paths=['/src/sillytavern/save.ts','/src/sillytavern/saveRepository.ts','/src/sillytavern/settlementView.ts'];
     const [domain,storage,view]=await Promise.all(paths.map(path=>import(/* @vite-ignore */path)));
     const repository=await storage.StSaveRepository.open();let save:StSave=(await repository.list())[0];
     const old=save.settlements[0]!;const receipt=structuredClone(old);
     save=await repository.update(save.id,save.revision,(draft:StSave)=>{domain.settleSave(draft,{kind:'story',encounter:domain.recordEncounter(old.request,[],'normal',old.encounterId),request:old.request,result:old.result,events:[]});});
     view.renderStSettlement(document.querySelector('#st-preview'),save.settlements[0]);repository.close();
     return {balances:save.balances,receipts:save.settlements.length,receipt:save.settlements[0],unchanged:JSON.stringify(save.settlements[0])===JSON.stringify(receipt)};
   });
   expect(restored).toEqual({balances:expectedWallet,receipts:1,receipt:first.receipt,unchanged:true});
   await expect(result).toBeVisible();
   await expect(result.getByRole('heading',{name:winner==='player'?/战\s*斗\s*胜\s*利/:/战\s*斗\s*失\s*败/,level:1})).toBeVisible();
   await expect(grants.locator('.settlement-grant.rs-reward')).toHaveText(expectedCards);
   expect(await result.locator('.settlement-grant.rs-reward').allTextContents()).toEqual(firstCards);
 });
}

test('ST economy receipt: old results and empty audits preserve native cards and actual grants',async({page})=>{
 await page.goto('/sillytavern.html');
 const snapshots=await page.evaluate(async()=>{
   const paths=['/src/sillytavern/save.ts','/src/sillytavern/settlementView.ts','/src/session/contract.ts'];
   const [domain,view,contract]=await Promise.all(paths.map(path=>import(/* @vite-ignore */path)));
   const actor=(externalId:string)=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:['Blue'],manaCost:3,skillId:'gw_KnightsSword'});
   const request:BattleRequest={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'old',requestId:'old-request',seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]} as BattleRequest;
   const result:BattleResult={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'old',requestId:'old-request',seed:42,winner:'player',turns:1,combatants:[{externalId:'hero',side:'player',hp:100,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'old-digest',eventSummary:[]};
   const save=domain.createSave(domain.emptyRoot(),{hostId:location.origin,characterId:'hero',chatId:'old'},'old');
   const receipt:SettlementReceipt=domain.settleSave(save,{kind:'story',request,result,encounter:domain.recordEncounter(request,[],'normal','old-encounter'),events:[],storyGrants:[{kind:'currency',id:'gems',name:'宝石',quantity:7}]});
   const restored=domain.validateSave(JSON.parse(JSON.stringify(save)));const mount=document.querySelector('#st-preview');
   const cards=()=>Array.from(mount!.firstElementChild!.shadowRoot!.querySelectorAll('.settlement-grant.rs-reward'),card=>card.textContent);
   view.renderStSettlement(mount,restored.settlements[0]);const oldCards=cards();
   const balances={leftGold:9,rightGold:71,souls:3,gems:2,maps:0};
   const empty=structuredClone(receipt);empty.result.economy={gold:9,souls:3,gems:2};empty.result.economyAudit={version:1,initial:{...balances},final:{...balances},entries:[]};
   restored.settlements[0]=empty;const checked=domain.validateSave(restored);
   view.renderStSettlement(mount,checked.settlements[0]);
   return {oldCards,emptyCards:cards(),balances:checked.balances,receipt:checked.settlements[0]};
 });
 expect(snapshots.oldCards).toHaveLength(1);expect(snapshots.oldCards).toEqual(snapshots.emptyCards);
 expect(snapshots.receipt.result.economyAudit!.entries).toEqual([]);expect(snapshots.balances).toEqual({'currency:gems':7});
 await expect(page.getByRole('region',{name:'战斗资源记录',exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'本场实际获得',exact:true}).locator('.settlement-grant.rs-reward')).toHaveText(/\+7\s*宝石/);
});

for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:900,height:320}]){
 test(`native settlement ${viewport.width}x${viewport.height}: rewards scroll while continue stays visible`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/sillytavern.html');
  const committed=await page.evaluate(async()=>{
   const load=(path:string)=>import(/* @vite-ignore */path);
   const [domain,view,contract]=await Promise.all(['/src/sillytavern/save.ts','/src/sillytavern/settlementView.ts','/src/session/contract.ts'].map(load));
   const actor=(externalId:string)=>({externalId,name:externalId,stats:{hp:100,attack:10,armor:0,magic:5},manaColors:['Blue'],manaCost:3,skillId:'gw_KnightsSword'});
   const request:BattleRequest={schemaVersion:contract.BATTLE_SCHEMA_VERSION,rulesetVersion:contract.RULESET_VERSION,battleId:'scroll-battle',requestId:'scroll-request',seed:42,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]} as BattleRequest;
   const result:BattleResult={schemaVersion:request.schemaVersion,rulesetVersion:request.rulesetVersion,battleId:request.battleId,requestId:request.requestId,seed:42,winner:'player',turns:1,combatants:[{externalId:'hero',side:'player',hp:100,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy',side:'enemy',hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}],defeatedExternalIds:['enemy'],summonedCount:0,actionLogDigest:'scroll-digest',eventSummary:[]};
   const save=domain.createSave(domain.emptyRoot(),{hostId:location.origin,characterId:'hero',chatId:'scroll'},'scroll');
   const receipt:SettlementReceipt=domain.settleSave(save,{kind:'story',request,result,encounter:domain.recordEncounter(request,[],'normal','scroll-encounter'),events:[],storyGrants:Array.from({length:60},(_,index)=>({kind:'material',id:`material-${index}`,name:`结算材料${index+1}：${'完整材料名称'.repeat(8)}`,quantity:index+1}))});
   const mount=document.querySelector<HTMLElement>('#st-preview')!;
   mount.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:10020';
   let continued=0;const before=JSON.stringify(save);
   view.renderStSettlement(mount,receipt,{onContinue:()=>{continued++;}});
   Object.assign(window,{readSettlementScroll:()=>({continued,unchanged:before===JSON.stringify(save)})});
   return {grants:receipt.grants,balances:save.balances};
  });
  const result=page.locator('main.result-screen');const scroll=result.getByRole('region',{name:'结算奖励',exact:true});
  const cards=result.getByRole('region',{name:'本场实际获得',exact:true}).locator('.settlement-grant.rs-reward');
  const again=result.getByRole('button',{name:'继续',exact:true});
  await expect(result).toBeVisible();await expect(result.getByRole('heading',{name:/战\s*斗\s*胜\s*利/,level:1})).toBeVisible();
  await expect(cards).toHaveCount(committed.grants.length);
  expect(await cards.evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1))).toBe(true);await expect(again).toHaveAttribute('id','again');
  await expect(again).toBeInViewport();await expect(again).toBeEnabled();
  await expect(cards.first()).toHaveText(/\+1\s*结算材料1/);
  await expect(cards.last()).toHaveText(/\+60\s*结算材料60/);
  expect(committed.balances).toEqual(Object.fromEntries(committed.grants.map(grant=>[`${grant.kind}:${grant.id}`,grant.quantity])));
  await expect.poll(()=>scroll.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
  await scroll.hover();await page.mouse.wheel(0,500);
  await expect.poll(()=>scroll.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await scroll.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await expect(cards.last()).toBeInViewport();await expect(again).toBeInViewport();
  await expect(result.getByRole('region',{name:'战斗资源记录',exact:true})).toHaveCount(0);
  await expect(result.getByRole('region',{name:'本场战果',exact:true})).toHaveCount(0);
  await again.click();
  expect(await page.evaluate(()=>window.readSettlementScroll())).toEqual({continued:1,unchanged:true});
 });
}
