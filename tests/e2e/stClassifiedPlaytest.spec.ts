import {test,expect,type Page} from '@playwright/test';
import type {BattleRequest} from '../../src/session/contract';
import type {EnemyFormation} from '../../src/sillytavern/enemyFormation';

const formationKey='st.enemy-formation-preview.v1';
const challengeName='挑战已保存的组装编队';
type ObservedBattleWindow=Window & {__classifiedPlaytestRequest?:BattleRequest};

async function readSaves(page:Page){
 return page.evaluate(async()=>{
  const path='/src/sillytavern/saveRepository.ts';
  const {StSaveRepository}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/saveRepository');
  const repo=await StSaveRepository.open();
  try{return await repo.list();}finally{repo.close();}
 });
}

async function seedIndependentBlueprint(page:Page):Promise<void>{
 await page.evaluate(async()=>{
  const portraitsPath='/src/sillytavern/portraits.ts',blueprintPath='/src/sillytavern/enemyBlueprint.ts',troopsPath='/src/data/troops.ts';
  const {PORTRAITS,savePortrait}=await import(/* @vite-ignore */portraitsPath) as typeof import('../../src/sillytavern/portraits');
  const {compileEnemyBlueprint}=await import(/* @vite-ignore */blueprintPath) as typeof import('../../src/sillytavern/enemyBlueprint');
  const {getTroopById}=await import(/* @vite-ignore */troopsPath) as typeof import('../../src/data/troops');
  const portrait=PORTRAITS.find(p=>p.troopId===6048)!,active=getTroopById(6048)!;
  const blueprint=compileEnemyBlueprint({
   portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),
   recipeTroopId:6004,assembly:{version:1,activeTroopId:6048,traitCodes:active.traits.map(trait=>trait.code)},
   externalId:'assembled-guard',level:20,difficulty:1,
  });
  localStorage.setItem('st.enemy-preview.v1',JSON.stringify(blueprint));
 });
}

test('saved classified formation starts directly with the saved party and preserves independent active, traits and order in request and pending',async({page})=>{
 test.setTimeout(60_000);
 await page.addInitScript(()=>{
  window.addEventListener('message',event=>{
   if(event.source===window.parent&&event.origin===location.origin&&event.data?.channel==='match3:st-replay:v1'&&event.data.type==='start'){
    (window as ObservedBattleWindow).__classifiedPlaytestRequest=structuredClone(event.data.request);
   }
  });
 });
 await page.goto('/sillytavern.html');
 await expect(page.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('classified');
 await seedIndependentBlueprint(page);await page.reload();
 await expect(page.getByRole('combobox',{name:'能力配方',exact:true})).toHaveValue('6004');
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('21');
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 const formation=page.getByRole('region',{name:'本场敌人编队',exact:true});
 await formation.getByRole('listitem',{name:'位置 2',exact:true}).getByRole('button',{name:'上移',exact:true}).click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as EnemyFormation,formationKey);
 expect(saved.members.map(member=>member.level)).toEqual([21,20]);
 for(const member of saved.members){
  expect(member.recipeId).toBe('enemy:6004');expect(member.assembly?.activeTroopId).toBe(6048);
  expect(member.assembly?.traitCodes.length).toBeGreaterThan(0);
  expect(member.snapshot.traitIds).toEqual(member.assembly!.traitCodes.map(code=>'st:'+code));
  expect(Object.keys(member.snapshot.traitNames??{})).toEqual(member.snapshot.traitIds);
  expect(member.snapshot.skillId).toBeTruthy();expect(member.snapshot.spellDescription).toBeTruthy();
 }
 await page.goto('/sillytavern-playtest.html');
 await page.locator('#st-match3-host-root').getByRole('button',{name:'创建当前聊天存档',exact:true}).click();
 const challenge=page.getByRole('button',{name:challengeName,exact:true}),example=page.getByRole('button',{name:'开始示例遭遇',exact:true});
 await challenge.click();
 const battle=page.frameLocator('iframe[title="剧情三消战场"]');
 await expect(battle.locator('.gcard.enemy')).toHaveCount(2,{timeout:30_000});
 const frame=page.frames().find(candidate=>candidate.url().includes('sillytavern-battle.html'))!;
 const request=await frame.evaluate(()=>(window as ObservedBattleWindow).__classifiedPlaytestRequest);
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备',exact:true})).toHaveCount(0);
 expect(request).toBeTruthy();
 expect(request!.playerTeam[0]).toMatchObject({externalId:'/人物',skillId:'gw_KnightsSword'});
 expect(request!.enemyTeam).toEqual(saved.members.map(member=>member.snapshot));
 expect(request!.seed).toBe(20261024);
 const saves=await readSaves(page);expect(saves).toHaveLength(1);
 const pending=saves[0].pendingStory!;expect(pending).toBeTruthy();
 expect(pending.difficulty).toBe('组装编队试玩');expect(pending.request).toEqual(request);
 expect(pending.sources.map(source=>({sourceId:source.sourceId,abilityId:source.abilityId,enemyExternalId:source.enemyExternalId}))).toEqual(
  saved.members.map(member=>({sourceId:member.sourceId,abilityId:member.abilityId,enemyExternalId:member.snapshot.externalId})));
 expect(saves[0].pendingReplay).toBeUndefined();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey)).toEqual(saved);
 await expect(challenge).toBeDisabled();await expect(example).toBeDisabled();
 await page.frameLocator('#st-match3-story-root iframe').locator('body').evaluate(()=>{
  const params=new URLSearchParams(location.search);
  window.parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'cancel'},params.get('parentOrigin')!);
 });
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 await expect(challenge).toBeEnabled();await expect(example).toBeEnabled();
 expect(await readSaves(page)).toEqual(saves);
 expect(saves[0].settlements).toEqual([]);
});

for(const scenario of ['missing','invalid-json','empty','damaged-blueprint'] as const){
 test(`saved formation ${scenario} reports in page status without opening preparation or creating pending`,async({page})=>{
  await page.goto('/sillytavern-playtest.html');
  await page.locator('#st-match3-host-root').getByRole('button',{name:'创建当前聊天存档',exact:true}).click();
  if(scenario==='damaged-blueprint')await seedIndependentBlueprint(page);
  await page.evaluate(async({key,scenario})=>{
   if(scenario==='missing'){localStorage.removeItem(key);return;}
   if(scenario==='invalid-json'){localStorage.setItem(key,'{broken');return;}
   const formationPath='/src/sillytavern/enemyFormation.ts',contractPath='/src/session/contract.ts';
   const {FORMATION_VERSION,buildEnemyFormation}=await import(/* @vite-ignore */formationPath) as typeof import('../../src/sillytavern/enemyFormation');
   const {RULESET_VERSION}=await import(/* @vite-ignore */contractPath) as typeof import('../../src/session/contract');
   if(scenario==='damaged-blueprint'){
    const blueprint=JSON.parse(localStorage.getItem('st.enemy-preview.v1')!);
    const saved=buildEnemyFormation([blueprint,blueprint]);
    saved.members[1].snapshot.traitIds=[];
    localStorage.setItem(key,JSON.stringify(saved));return;
   }
   localStorage.setItem(key,JSON.stringify({version:FORMATION_VERSION,rulesetVersion:RULESET_VERSION,members:[]}));
  },{key:formationKey,scenario});
  const before=await readSaves(page);
  await page.getByRole('button',{name:challengeName,exact:true}).click();
  const status=page.locator('#playtest').getByRole('status');
  await expect(status).toContainText(scenario==='missing'?'尚未保存组装编队':'已保存的组装编队恢复失败');
  if(scenario==='empty')await expect(status).toContainText('需要 1 至 4 名成员');
  await expect(page.getByRole('button',{name:challengeName,exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'开始示例遭遇',exact:true})).toBeEnabled();
  await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备',exact:true})).toHaveCount(0);
  await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
  const after=await readSaves(page);expect(after).toEqual(before);
  expect(after[0].pendingStory).toBeUndefined();expect(after[0].pendingReplay).toBeUndefined();
 });
}
