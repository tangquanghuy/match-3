import {test,expect} from '@playwright/test';
import legacy from '../fixtures/st-enemy-design-legacy-v1.json' with {type:'json'};
import type {EnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';

const blueprintKey='st.enemy-preview.v1';
const designKey='st.enemy-design-preview.v1';
const formationKey='st.enemy-formation-preview.v1';

test('new classified design keeps its modules through renders, edits, formation reorder and reload',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await expect(form.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('classified');
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const original=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey);
 expect(original.assembly).toMatchObject({version:2});
 expect(original.snapshot.traitIds).toEqual(original.assembly.traitCodes.map((code:string)=>'st:'+code));
 const design=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey);
 expect(design.design.assembly).toBe('classified');expect(design.blueprint).toEqual(original);
 await page.reload();
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('21');
 await expect(page.getByRole('region',{name:'战术设计结果'})).toHaveCount(0);
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 const formation=page.getByRole('region',{name:'本场敌人编队',exact:true});
 await formation.getByRole('listitem',{name:'位置 2',exact:true}).getByRole('button',{name:'上移',exact:true}).click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey);
 expect(saved.members.map((member:EnemyBlueprint)=>member.level)).toEqual([21,20]);
 for(const member of saved.members){
  expect(member.assembly).toEqual(original.assembly);expect(member.abilityId).toBe(original.abilityId);expect(member.sourceId).toBe(original.sourceId);
  for(const field of ['skillId','spellName','spellDescription','manaCost','manaColors','traitIds','traitNames','mechanicalIdentity','troopTypes','kingdom','kingdomId','portraitUrl'] as const)expect(member.snapshot[field]).toEqual(original.snapshot[field]);
 }
 expect(saved.members[1].snapshot).toEqual({...original.snapshot,externalId:'enemy-2',name:original.snapshot.name.replace('enemy-1','enemy-2')});
 await page.reload();
 await expect(formation.getByRole('listitem')).toHaveCount(2);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey)).toEqual(saved);
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey)).toEqual(original);
});

test('a full assembled blueprint restores its independent active and keeps modules on a compatible artwork change',async({page})=>{
 await page.goto('/sillytavern.html');
 const fixture=await page.evaluate(async({blueprintKey,designKey})=>{
  const portraitsPath='/src/sillytavern/portraits.ts',blueprintPath='/src/sillytavern/enemyBlueprint.ts',troopsPath='/src/data/troops.ts';
  const {PORTRAITS,savePortrait}=await import(/* @vite-ignore */portraitsPath) as typeof import('../../src/sillytavern/portraits');
  const {compileEnemyBlueprint}=await import(/* @vite-ignore */blueprintPath) as typeof import('../../src/sillytavern/enemyBlueprint');
  const {getTroopById}=await import(/* @vite-ignore */troopsPath) as typeof import('../../src/data/troops');
  // Chassis and active share native rarity and colors; artwork uses rank/form/role.
  const portrait=PORTRAITS.find(p=>p.troopId===6048)!,alternative=PORTRAITS.find(p=>p.troopId===6130)!;
  const active=getTroopById(6048)!;
  const blueprint=compileEnemyBlueprint({portrait:savePortrait({rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),recipeTroopId:6004,
   assembly:{version:1,activeTroopId:6048,traitCodes:active.traits.map(trait=>trait.code)},externalId:'encounter-guard',level:20,difficulty:1});
  localStorage.setItem(blueprintKey,JSON.stringify(blueprint));localStorage.removeItem(designKey);
  return {blueprint,alternative:alternative.assetId};
 },{blueprintKey,designKey});
 await page.reload();
 await expect(page.getByRole('combobox',{name:'能力配方',exact:true})).toHaveValue('6004');
 await expect(page.getByRole('region',{name:'敌人能力配置',exact:true})).toContainText(fixture.blueprint.snapshot.spellDescription!);
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey)).toEqual(fixture.blueprint);
 const alternative=page.getByRole('button',{name:'选择 '+fixture.alternative,exact:true});
 while(await alternative.count()===0)await page.getByRole('button',{name:'再显示 24 张',exact:true}).click();
 await alternative.click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const changed=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey);
 expect(changed.portrait.assetId).toBe(fixture.alternative);expect(changed.recipeId).toBe('enemy:6004');
 expect(changed.assembly).toEqual(fixture.blueprint.assembly);expect(changed.abilityId).toBe(fixture.blueprint.abilityId);expect(changed.sourceId).toBe(fixture.blueprint.sourceId);
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await page.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const formation=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey);
 expect(formation.members).toEqual([{...changed,snapshot:{...changed.snapshot,externalId:'enemy-1',name:changed.snapshot.name.replace('encounter-guard','enemy-1')}}]);
 await page.reload();
 await expect(page.getByRole('listitem',{name:'位置 1',exact:true})).toContainText(changed.snapshot.spellDescription);
 await page.getByRole('combobox',{name:'能力配方',exact:true}).selectOption('6130');
 await expect(page.getByRole('status').filter({hasText:'已切换底板'})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const native=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey);
 expect(native.recipeId).toBe('enemy:6130');expect(native.assembly).toBeUndefined();expect(native.sourceId).toBe('enemy:6130');
 await page.reload();await expect(page.getByRole('combobox',{name:'能力配方',exact:true})).toHaveValue('6130');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey)).toEqual(formation);
});

test('a fixed pre-policy save restores exactly and recompiles as a complete native recipe under new weights',async({page})=>{
 await page.goto('/sillytavern.html');
 expect(legacy).not.toHaveProperty('generation');expect(legacy.design).not.toHaveProperty('assembly');
 const restored=await page.evaluate(async({blueprintKey,designKey,fixture})=>{
  const designPath='/src/sillytavern/enemyDesign.ts';
  const {restoreEnemyDesign}=await import(/* @vite-ignore */designPath);
  const design=restoreEnemyDesign(fixture);
  localStorage.setItem(blueprintKey,JSON.stringify(design.blueprint));localStorage.setItem(designKey,JSON.stringify(design));
  return design;
 },{blueprintKey,designKey,fixture:legacy});
 expect(restored).toEqual(legacy);expect(restored.blueprint.assembly).toBeUndefined();
 await page.reload();
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 const detail=page.getByRole('region',{name:'敌人能力配置'});
 await expect(form.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('native');
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await expect(detail).toContainText(legacy.blueprint.snapshot.spellDescription);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey)).toEqual(legacy);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey)).toEqual(legacy.blueprint);
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const native=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey);
 const expectedInputs:Record<string,unknown>={...legacy.design,assembly:'native'};
 delete expectedInputs.storyWeight; // Historical metadata is absent from the current encounter form.
 expect(native.design).toEqual(expectedInputs);
 expect(native.generation).toMatchObject({primaryRole:legacy.design.role});
 expect(native.design.assembly).toBe('native');expect(native.blueprint.assembly).toBeUndefined();
 const source=await page.evaluate(async saved=>{
  const troopPath='/src/data/troops.ts',blueprintPath='/src/sillytavern/enemyBlueprint.ts',designPath='/src/sillytavern/enemyDesign.ts';
  const {TROOPS}=await import(/* @vite-ignore */troopPath);
  const {compileEnemyBlueprint,adaptedPrototype,adaptedTrait}=await import(/* @vite-ignore */blueprintPath);
  const {inspectEnemyDesignSignature,restoreEnemyDesign}=await import(/* @vite-ignore */designPath);
  const troop=TROOPS.find((t:{id:number})=>`enemy:${t.id}`===saved.selection.recipeId)!;
  return {role:troop.role,traitIds:troop.traits.filter((t:{code:string})=>adaptedTrait(t.code)).map((t:{code:string})=>'st:'+t.code),
    omittedTraits:troop.traits.filter((t:{code:string})=>!adaptedTrait(t.code)).map((t:{name:string})=>t.name),sourceTraitCount:troop.traits.length,
   signature:inspectEnemyDesignSignature(adaptedPrototype(troop.spell.id),troop.traits.map((t:{code:string})=>adaptedTrait(t.code)).filter(Boolean)),
   blueprint:compileEnemyBlueprint({portrait:saved.blueprint.portrait,recipeTroopId:troop.id,externalId:saved.externalId,
    level:saved.design.level,difficulty:saved.design.difficulty}),restored:restoreEnemyDesign(saved)};
 },native);
 expect(source.role).toBe(native.design.role);expect(native.signature.roles).toEqual([source.role]);
 expect(native.blueprint).toEqual(source.blueprint);expect(source.restored).toEqual(native);
 expect(source.traitIds.length+source.omittedTraits.length).toBe(source.sourceTraitCount);
 expect(native.blueprint.omittedMechanisms).toEqual(expect.arrayContaining(source.omittedTraits));
 expect(native.selection.traitIds).toEqual(source.traitIds);
 expect(native.blueprint.snapshot.traitIds).toEqual(source.traitIds);
 expect(native.signature.effects).toEqual(source.signature.effects);
 await expect(detail).toContainText(native.blueprint.snapshot.spellDescription);
 await expect(form.getByLabel('组装方式说明',{exact:true})).toContainText('保留同一来源的主动与特质');
 await form.getByRole('combobox',{name:'组装方式',exact:true}).selectOption('classified');
 await expect(form.getByLabel('组装方式说明',{exact:true})).toContainText('按职责加权选择主动技能与特质');
 await form.getByRole('button',{name:'恢复已保存的战术设计',exact:true}).click();
 await expect(form.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('native');
 await page.reload();
 await expect(form.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('native');
 await expect(detail).toContainText(native.blueprint.snapshot.spellDescription);
 for(const name of Object.values(native.blueprint.snapshot.traitNames))await expect(detail).toContainText(String(name));
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey)).toEqual(native);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),blueprintKey)).toEqual(native.blueprint);
});

test('changing portrait rank clears incompatible modules and semantic ownership without changing the formation',async({page})=>{
 await page.goto('/sillytavern.html');
 await page.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await page.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const formation=await page.evaluate(key=>localStorage.getItem(key),formationKey);
 const original=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as EnemyBlueprint,blueprintKey);
 expect(original.assembly).toBeDefined();
 const rank=page.getByRole('combobox',{name:'稀有度',exact:true});
 await expect(rank).toHaveValue(original.portrait.query.rank!);
 const next=await rank.evaluate((select:HTMLSelectElement)=>{
  const option=[...select.options].find(option=>option.value&&option.value!==select.value&&!option.disabled);
  if(!option)throw new Error('Expected an available artwork rank different from the assembled blueprint');
  return option.value;
 });
 await rank.selectOption(next);
 await expect(page.getByRole('region',{name:'敌人能力配置',exact:true})).toHaveCount(0);
 await page.getByRole('region',{name:'候选立绘'}).getByRole('button').first().click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const native=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!) as EnemyBlueprint,blueprintKey);
 expect(native.portrait.query.rank).toBe(next);expect(native.portrait.query.rank).not.toBe(original.portrait.query.rank);
 expect(native.portrait.query).not.toHaveProperty('manaColors');
 expect(native.recipeId).toBe(`enemy:${native.portrait.troopId}`);
 expect(native.assembly).toBeUndefined();expect(native.sourceId).toBe(native.recipeId);
 expect(await page.evaluate(key=>localStorage.getItem(key),designKey)).toBeNull();
 expect(await page.evaluate(key=>localStorage.getItem(key),formationKey)).toBe(formation);
});


test('classified tactical effects and their complete modules survive save, reload and formation',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByText('高级：手动约束效果',{exact:true}).click();
 await form.getByRole('checkbox',{name:'需要减伤',exact:true}).check();
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey);
 expect(saved.design.assembly).toBe('classified');
 expect(saved.design.effects).toEqual([{effect:'damageReduction',requirement:'required'}]);
 expect(saved.signature.effects).toEqual(expect.arrayContaining(['damage','damageReduction']));
 expect(saved.blueprint.assembly.traitCodes.length).toBeGreaterThan(0);
 expect(saved.blueprint.snapshot.traitIds).toEqual(saved.blueprint.assembly.traitCodes.map((code:string)=>'st:'+code));
 await page.reload();
 await expect(form.getByRole('checkbox',{name:'需要减伤',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey)).toEqual(saved);
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await page.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const formation=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey);
 expect(formation.members).toEqual([saved.blueprint]);
 await page.reload();
 const member=page.getByRole('listitem',{name:'位置 1',exact:true});
 await expect(member).toContainText(saved.blueprint.snapshot.spellDescription);
 for(const name of Object.values(saved.blueprint.snapshot.traitNames))await expect(member).toContainText(String(name));
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey)).toEqual(formation);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});


for(const category of [
 {colors:'Yellow,Brown',form:'野兽',seed:3},
 {colors:'Red,Yellow',form:'类人',seed:6},
]){
 test(`classified role-only ${category.colors} ${category.form} uses category rules and restores all modules`,async({page})=>{
  await page.goto('/sillytavern.html');
  const form=page.getByRole('region',{name:'按战术设计敌人'});
  await form.getByRole('combobox',{name:'设计法力颜色',exact:true}).selectOption(category.colors);
  await form.getByRole('combobox',{name:'设计档位',exact:true}).selectOption('首领');
  await form.getByRole('combobox',{name:'设计形态',exact:true}).selectOption(category.form);
  await form.getByRole('combobox',{name:'设计职责',exact:true}).selectOption('Warrior');
  await form.getByRole('spinbutton',{name:'设计种子',exact:true}).fill(String(category.seed));
  expect(await form.getByRole('checkbox',{includeHidden:true}).evaluateAll(nodes=>nodes.every(node=>!(node as HTMLInputElement).checked))).toBe(true);
  await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
  await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
  await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey);
  expect(saved.design).toMatchObject({assembly:'classified',manaColors:category.colors.split(','),rank:'首领',form:category.form,role:'Warrior',effects:[]});
  expect(saved.signature.roles).toContain('Warrior');
  expect(saved.blueprint.assembly).toMatchObject({version:2});
  expect(saved.blueprint.snapshot.traitIds).toEqual(saved.blueprint.assembly.traitCodes.map((code:string)=>'st:'+code));
  await page.reload();
  await expect(form.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('classified');
  for(const checkbox of await form.getByRole('checkbox',{includeHidden:true}).all())await expect(checkbox).not.toBeChecked();
  await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
  await page.getByRole('button',{name:'保存当前编队',exact:true}).click();
  const formation=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),formationKey);
  expect(formation.members).toEqual([saved.blueprint]);
  await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
  await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),designKey)).toEqual(saved);
 });
}
