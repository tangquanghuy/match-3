import {test,expect} from '@playwright/test';

const savedKey='st.enemy-design-preview.v1';

test('semantic enemy design compiles without internal IDs and restores the same complete result',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await expect(form.getByRole('combobox',{name:'组装方式',exact:true})).toHaveValue('classified');
 await expect(form).toContainText('种子用于复现；换种子可换战法');
 const effects=form.getByRole('checkbox',{includeHidden:true});
 expect(await effects.count()).toBeGreaterThan(2);
 expect(await effects.evaluateAll(nodes=>nodes.every(node=>!(node as HTMLInputElement).checked))).toBe(true);
 await expect(form.getByRole('checkbox',{name:'需要伤害',exact:true,includeHidden:true})).toBeHidden();
 const roleName=await form.getByRole('combobox',{name:'设计职责',exact:true}).locator('option:checked').innerText();
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 const detail=page.getByRole('region',{name:'敌人能力配置'});
 await expect(detail).toBeVisible();
 await expect(detail).toContainText('法力消耗');
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
 expect(saved.design).toMatchObject({assembly:'classified',effects:[]});
 expect(saved.blueprint.assembly).toMatchObject({version:2});
 const result=page.getByRole('region',{name:'战术设计结果'});
 expect(saved.signature.roles).toEqual([saved.design.role]);
 const source=await page.evaluate(async ({recipeId,manaColors})=>{
  const troopPath='/src/data/troops.ts',blueprintPath='/src/sillytavern/enemyBlueprint.ts';
  const {TROOPS}=await import(/* @vite-ignore */troopPath);
  const {adaptedPrototype,abilityIdentity}=await import(/* @vite-ignore */blueprintPath);
  const troop=TROOPS.find((t:{id:number})=>`enemy:${t.id}`===recipeId)!;
  return {role:troop.role,manaColors:troop.manaColors,manaCost:troop.manaCost,
   abilityId:abilityIdentity(adaptedPrototype(troop.spell.id),manaColors,troop.manaCost)};
 },{recipeId:saved.selection.recipeId,manaColors:saved.design.manaColors});
 expect(source.role).toBe(saved.design.role);
 expect(saved.blueprint.snapshot.manaColors).toEqual(saved.design.manaColors);
 expect(saved.blueprint.snapshot.manaCost).toBe(source.manaCost);
 expect(saved.blueprint.abilityId).toBe(source.abilityId);
 await expect(result.getByText(/^职责：/)).toHaveText(`职责：${roleName}`);
 for(const explanation of saved.signature.explanation)await expect(result).not.toContainText(explanation);
 await expect(detail).toContainText(saved.blueprint.snapshot.spellDescription);
 expect(saved.signature.effects.length).toBeGreaterThan(0);
 for(const label of await page.evaluate(async effects=>{
  const path='/src/sillytavern/enemyDesign.ts';const {ENEMY_DESIGN_VOCABULARY}=await import(/* @vite-ignore */path);
  return effects.map((effect:string)=>ENEMY_DESIGN_VOCABULARY.effects.find((item:{key:string})=>item.key===effect).label);
 },saved.signature.effects))await expect(result).toContainText(label);
 const blueprint=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!));
 await page.reload();
 await expect(page.getByRole('region',{name:'敌人能力配置'})).toBeVisible();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey)).toEqual(saved);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!))).toEqual(blueprint);
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await expect(page.getByRole('region',{name:'本场敌人编队'})).toContainText('1 / 4');
});

test('role-only classified designs reproduce from the seed and changing it selects another complete tactic',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 const compile=form.getByRole('button',{name:'编译战术设计',exact:true});
 const save=page.getByRole('button',{name:'保存完整敌人配置',exact:true});
 await compile.click();await save.click();
 const original=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
 await compile.click();await save.click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey)).toEqual(original);
 await form.getByRole('spinbutton',{name:'设计种子',exact:true}).fill('42');
 await compile.click();await save.click();
 const changed=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
 expect(changed.design).toEqual(original.design);expect(changed.design.effects).toEqual([]);
 expect(changed.selection).not.toEqual(original.selection);
 expect(changed.blueprint.assembly).toMatchObject({version:2});
 await form.getByRole('spinbutton',{name:'设计种子',exact:true}).fill(String(original.seed));
 await compile.click();await save.click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey)).toEqual(original);
});

test('manual effects remain optional, survive restore and can be cleared for automatic generation',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByText('高级：手动约束效果',{exact:true}).click();
 const damage=form.getByRole('checkbox',{name:'需要伤害',exact:true});
 await damage.check();
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const manual=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
 expect(manual.design.effects).toEqual([{effect:'damage',requirement:'required'}]);
 await page.reload();await expect(damage).toBeVisible();await expect(damage).toBeChecked();
 await damage.uncheck();
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).design.effects,savedKey)).toEqual([]);
 await form.getByRole('button',{name:'恢复已保存的战术设计',exact:true}).click();
 await expect(form.getByRole('checkbox',{name:'需要伤害',exact:true,includeHidden:true})).not.toBeChecked();
 await expect(form.getByRole('checkbox',{name:'需要伤害',exact:true,includeHidden:true})).toBeHidden();
});

test('an impossible explicit effect keeps the prior saved design and leaves the draft editable at 390px',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const before=await page.evaluate(key=>localStorage.getItem(key),savedKey);
 // The small, red, human striker catalog cannot provide every tactical effect at once.
 await form.getByText('高级：手动约束效果',{exact:true}).click();
 for(const checkbox of await form.getByRole('checkbox').all())await checkbox.check();
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(form.getByRole('alert')).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),savedKey)).toBe(before);
 expect(await form.getByRole('checkbox').count()).toBeGreaterThan(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('invalid saved semantic design reports a reason while retaining the normal portrait controls',async({page})=>{
 await page.goto('/sillytavern.html');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:999})),savedKey);
 await page.reload();
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByRole('button',{name:'恢复已保存的战术设计',exact:true}).click();
 await expect(form.getByRole('alert')).toBeVisible();
 await expect(page.getByRole('button',{name:'清空筛选',exact:true})).toBeVisible();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey)).toEqual({version:999});
});


test('saved design restores its own inputs and manual blueprint edits discard stale semantics',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByRole('spinbutton',{name:'设计等级',exact:true}).fill('17');
 await form.getByRole('spinbutton',{name:'设计种子',exact:true}).fill('42');
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 await page.reload();
 await expect(form.getByRole('spinbutton',{name:'设计等级',exact:true})).toHaveValue('17');
 await expect(form.getByRole('spinbutton',{name:'设计种子',exact:true})).toHaveValue('42');
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('18');
 await expect(page.getByRole('region',{name:'战术设计结果'})).toHaveCount(0);
 await form.getByRole('button',{name:'恢复已保存的战术设计',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'敌人等级',exact:true})).toHaveValue('17');
 await expect(form.getByRole('spinbutton',{name:'设计等级',exact:true})).toHaveValue('17');
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('18');
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await page.evaluate(key=>localStorage.getItem(key),savedKey)).toBeNull();
 await page.reload();
 await expect(page.getByRole('spinbutton',{name:'敌人等级',exact:true})).toHaveValue('18');
 await expect(page.getByRole('region',{name:'战术设计结果'})).toHaveCount(0);
});

test('failed semantic storage write preserves both previously saved records',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const before=await page.evaluate(key=>[localStorage.getItem(key),localStorage.getItem('st.enemy-preview.v1')],savedKey);
 await form.getByRole('spinbutton',{name:'设计种子',exact:true}).fill('43');
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.evaluate(key=>{
  const original=Storage.prototype.setItem;let failed=false;
  Storage.prototype.setItem=function(k:string,v:string){
   if(this===localStorage&&k===key&&!failed){failed=true;throw new DOMException('Storage quota reached','QuotaExceededError');}
   return original.call(this,k,v);
  };
 },savedKey);
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Storage quota reached');
 expect(await page.evaluate(key=>[localStorage.getItem(key),localStorage.getItem('st.enemy-preview.v1')],savedKey)).toEqual(before);
 await page.reload();
 await expect(form.getByRole('spinbutton',{name:'设计种子',exact:true})).toHaveValue('6004');
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
});


test('optional member budget stays outside semantic inputs and restores with a measured native reference score',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByRole('textbox',{name:'单体参考战力上限',exact:true}).fill('1000000');
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(page.getByLabel('敌人参考战力',{exact:true})).toContainText('尚未平衡标定');
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
 expect(saved.design).not.toHaveProperty('maxMemberPower');expect(saved.design).not.toHaveProperty('budgetPolicy');
 expect(saved.budget.policy.maxMemberPower).toBe(1000000);expect(saved.budget.calibration).toBe('uncalibrated');
 await expect(page.getByLabel('敌人参考战力',{exact:true})).toContainText(String(saved.budget.members[0].power));
 const before=await page.evaluate(key=>[localStorage.getItem(key),localStorage.getItem('st.enemy-preview.v1')],savedKey);
 await form.getByRole('textbox',{name:'单体参考战力上限',exact:true}).fill('0');
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('上限');
 expect(await page.evaluate(key=>[localStorage.getItem(key),localStorage.getItem('st.enemy-preview.v1')],savedKey)).toEqual(before);
 await page.reload();await expect(form.getByRole('textbox',{name:'单体参考战力上限',exact:true})).toHaveValue('1000000');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('formation budget persists through save, reload, reorder and removal and rejects additions atomically',async({page})=>{
 await page.goto('/sillytavern.html');
 await page.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const power=await page.evaluate(async key=>{
  const modulePath='/src/meta/systems/combatPower.ts';const {combatantPower}=await import(/* @vite-ignore */modulePath);
  return combatantPower(JSON.parse(localStorage.getItem(key)!).snapshot);
 },'st.enemy-preview.v1');
 const formation=page.getByRole('region',{name:'本场敌人编队'});
 await formation.getByRole('textbox',{name:'整队参考战力上限',exact:true}).fill(String(power*2));
 await formation.getByRole('button',{name:'应用编队预算',exact:true}).click();
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const before=await page.evaluate(()=>localStorage.getItem('st.enemy-formation-preview.v1'));
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await expect(formation.getByRole('alert')).toContainText('超过整队上限');await expect(formation).toContainText('2 / 4');
 expect(await page.evaluate(()=>localStorage.getItem('st.enemy-formation-preview.v1'))).toBe(before);
 await page.reload();await expect(formation.getByRole('textbox',{name:'整队参考战力上限',exact:true})).toHaveValue(String(power*2));
 await formation.getByRole('button',{name:'下移',exact:true}).first().click();
 await formation.getByRole('button',{name:'移除',exact:true}).first().click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-formation-preview.v1')!));
 expect(saved.members).toHaveLength(1);expect(saved.budgetPolicy.maxTeamPower).toBe(power*2);expect(saved.members[0].snapshot.externalId).toBe('enemy-1');
 await expect(formation).toContainText('尚未平衡标定');
 await formation.getByRole('textbox',{name:'整队参考战力上限',exact:true}).fill('0');
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();await expect(formation.getByRole('alert')).toContainText('超过整队上限');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-formation-preview.v1')!))).toEqual(saved);
 await formation.getByRole('textbox',{name:'整队参考战力上限',exact:true}).fill('');
 await formation.getByRole('button',{name:'应用编队预算',exact:true}).click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-formation-preview.v1')!))).not.toHaveProperty('budgetPolicy');
});


test('empty formation retains its optional budget across saving, reloading and adding the next member',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'}),formation=page.getByRole('region',{name:'本场敌人编队'});
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await formation.getByRole('textbox',{name:'整队参考战力上限',exact:true}).fill('1000000');
 await formation.getByRole('button',{name:'应用编队预算',exact:true}).click();
 await formation.getByRole('button',{name:'移除',exact:true}).click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('st.enemy-formation-preview.v1'))).toBeNull();
 await page.reload();await expect(formation).toContainText('0 / 4');
 await expect(formation.getByRole('textbox',{name:'整队参考战力上限',exact:true})).toHaveValue('1000000');
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-formation-preview.v1')!));
 expect(saved.members).toHaveLength(1);expect(saved.budgetPolicy.maxTeamPower).toBe(1000000);
 expect(await page.evaluate(()=>localStorage.getItem('st.enemy-formation-empty-budget-preview.v1'))).toBeNull();
});


test('incomplete budget text stays visible and preserves saved limits until explicitly cleared',async({page})=>{
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'}),formation=page.getByRole('region',{name:'本场敌人编队'});
 const memberCap=form.getByRole('textbox',{name:'单体参考战力上限',exact:true});
 await memberCap.fill('1000000');await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const savedDesign=await page.evaluate(key=>localStorage.getItem(key),savedKey);
 await memberCap.fill('1e');await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('maxMemberPower');await expect(memberCap).toHaveValue('1e');
 expect(await page.evaluate(key=>localStorage.getItem(key),savedKey)).toBe(savedDesign);
 await form.getByRole('button',{name:'恢复已保存的战术设计',exact:true}).click();
 await expect(memberCap).toHaveValue('1000000');
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 const power=await page.evaluate(async()=>{
  const modulePath='/src/meta/systems/combatPower.ts';const {combatantPower}=await import(/* @vite-ignore */modulePath);
  return combatantPower(JSON.parse(localStorage.getItem('st.enemy-preview.v1')!).snapshot);
 });
 const teamCap=formation.getByRole('textbox',{name:'整队参考战力上限',exact:true});
 await teamCap.fill(String(power));await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const savedFormation=await page.evaluate(()=>localStorage.getItem('st.enemy-formation-preview.v1'));
 await teamCap.fill('1e');await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 await expect(formation.getByRole('alert')).toContainText('maxTeamPower');await expect(teamCap).toHaveValue('1e');
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await expect(formation).toContainText('1 / 4');await expect(teamCap).toHaveValue('1e');
 expect(await page.evaluate(()=>localStorage.getItem('st.enemy-formation-preview.v1'))).toBe(savedFormation);
 await page.reload();await expect(teamCap).toHaveValue(String(power));
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await expect(formation.getByRole('alert')).toContainText('超过整队上限');
 await teamCap.fill('');await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 await expect(formation).toContainText('2 / 4');
});

for(const row of [
 {id:6341,seed:3,colors:'Yellow,Brown',form:'野兽'},
 {id:7038,seed:6,colors:'Red,Yellow',form:'类人'},
]){
 test(`native role-only ${row.colors} ${row.form} compiles with unchecked effects, persists and joins the formation`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/sillytavern.html');
  const form=page.getByRole('region',{name:'按战术设计敌人'});
  await form.getByLabel('组装方式',{exact:true}).selectOption('native');
  await form.getByLabel('设计法力颜色',{exact:true}).selectOption(row.colors);
  await form.getByLabel('设计档位',{exact:true}).selectOption('首领');
  await form.getByLabel('设计形态',{exact:true}).selectOption(row.form);
  await form.getByLabel('设计职责',{exact:true}).selectOption('Warrior');
  await form.getByLabel('设计种子',{exact:true}).fill(String(row.seed));
  expect(await form.getByRole('checkbox',{includeHidden:true}).evaluateAll(nodes=>nodes.every(node=>!(node as HTMLInputElement).checked))).toBe(true);
  await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
  await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
  expect(saved.design).toMatchObject({assembly:'native',role:'Warrior',effects:[]});
  expect(saved.blueprint.assembly).toBeUndefined();
  expect(saved.signature.roles).toEqual(['Warrior']);
  const source=await page.evaluate(async saved=>{
   const troopPath='/src/data/troops.ts',blueprintPath='/src/sillytavern/enemyBlueprint.ts',designPath='/src/sillytavern/enemyDesign.ts';
   const {TROOPS}=await import(/* @vite-ignore */troopPath);
   const {compileEnemyBlueprint,adaptedPrototype,adaptedTrait}=await import(/* @vite-ignore */blueprintPath);
   const {inspectEnemyDesignSignature}=await import(/* @vite-ignore */designPath);
   const troop=TROOPS.find((t:{id:number})=>`enemy:${t.id}`===saved.selection.recipeId)!;
   return {role:troop.role,traitIds:troop.traits.filter((t:{code:string})=>adaptedTrait(t.code)).map((t:{code:string})=>'st:'+t.code),
    omittedTraits:troop.traits.filter((t:{code:string})=>!adaptedTrait(t.code)).map((t:{name:string})=>t.name),sourceTraitCount:troop.traits.length,
    signature:inspectEnemyDesignSignature(adaptedPrototype(troop.spell.id),troop.traits.map((t:{code:string})=>adaptedTrait(t.code)).filter(Boolean)),
    blueprint:compileEnemyBlueprint({portrait:saved.blueprint.portrait,recipeTroopId:troop.id,externalId:saved.externalId,
     level:saved.design.level,difficulty:saved.design.difficulty})};
  },saved);
  expect(source.role).toBe('Warrior');
  expect(saved.blueprint).toEqual(source.blueprint);
  expect(source.traitIds.length+source.omittedTraits.length).toBe(source.sourceTraitCount);
  expect(saved.blueprint.omittedMechanisms).toEqual(expect.arrayContaining(source.omittedTraits));
  expect(saved.selection.traitIds).toEqual(source.traitIds);
  expect(saved.blueprint.snapshot.traitIds).toEqual(source.traitIds);
  expect(saved.signature.effects).toEqual(source.signature.effects);
  await expect(page.getByRole('region',{name:'敌人能力配置'})).toContainText(saved.blueprint.snapshot.spellDescription);
  await page.reload();
  await expect(form.getByLabel('组装方式',{exact:true})).toHaveValue('native');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey)).toEqual(saved);
  expect(await form.getByRole('checkbox',{includeHidden:true}).evaluateAll(nodes=>nodes.every(n=>!(n as HTMLInputElement).checked))).toBe(true);
  await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
  const formation=page.getByRole('region',{name:'本场敌人编队'});
  await expect(formation).toContainText('1 / 4');
  await expect(formation).toContainText(saved.blueprint.snapshot.spellDescription);
  for(const name of Object.values(saved.blueprint.snapshot.traitNames))await expect(formation).toContainText(String(name));
  expect(errors).toEqual([]);
 });
}

for(const example of [
 {rank:'精锐',form:'人形',role:'Assassin',palette:'Green,Purple'},
 {rank:'传奇',form:'人形',role:'Warmaster',palette:'Red,Yellow,Brown'},
 {rank:'传奇',form:'异形体',role:'Warlock',palette:'Blue,Purple,Brown'},
])test(`previously missing ${example.rank}/${example.form}/${example.role} compiles and survives save/reload`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 for(const [name,value]of [['设计档位',example.rank],['设计形态',example.form],['设计职责',example.role],['设计法力颜色',example.palette]])await form.getByRole('combobox',{name,exact:true}).selectOption(value);
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const first=await page.evaluate(()=>({design:JSON.parse(localStorage.getItem('st.enemy-design-preview.v1')!),blueprint:JSON.parse(localStorage.getItem('st.enemy-preview.v1')!)}));
 expect(first.blueprint.snapshot.role).toBe(example.role);expect(first.blueprint.snapshot.manaColors).toEqual(example.palette.split(','));
 expect(first.blueprint.assembly).toMatchObject({version:2,manaColors:example.palette.split(',')});
 expect(first.blueprint.portrait.query).toMatchObject({rank:example.rank,form:example.form});
 await page.reload();await expect(page.getByRole('region',{name:'敌人能力配置'})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await page.evaluate(()=>({design:JSON.parse(localStorage.getItem('st.enemy-design-preview.v1')!),blueprint:JSON.parse(localStorage.getItem('st.enemy-preview.v1')!)}))).toEqual(first);
 expect(errors).toEqual([]);
});
