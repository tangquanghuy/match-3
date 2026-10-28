import {test,expect} from '@playwright/test';
import type {EnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import type {PortraitEntry,PortraitSelection} from '../../src/sillytavern/portraits';
import legacyDesign from '../fixtures/st-enemy-design-legacy-v1.json' with {type:'json'};

test('ST portrait preview filters exact dimensions and restores selected artwork',async({page})=>{
 await page.goto('/sillytavern.html');
 await expect(page.getByRole('heading',{name:'敌人组装预览',exact:true})).toBeVisible();
 await expect(page.getByRole('status').first()).toContainText('候选 1794 张');
 const card=page.getByRole('button',{name:'选择 Troop_K00_00',exact:true});
 await card.click();
 const image=page.getByRole('button',{name:'选择 Troop_K00_00',exact:true}).locator('img');
 await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await expect(page.getByRole('region',{name:'立绘筛选',exact:true}).getByRole('combobox')).toHaveCount(3);
 await expect(page.getByRole('combobox',{name:'法力颜色集合',exact:true})).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'形态',exact:true})).toHaveValue('类人');
 await page.getByRole('button',{name:'保存肖像配置',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.portrait-preview.v1')!) as PortraitSelection);
 expect(saved.query).not.toHaveProperty('manaColors');
 expect(Object.keys(saved.query).sort()).toEqual(['form','rank','role']);
 await page.reload();
 await expect(page.getByRole('heading',{name:'已选 Troop_K00_00',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'选择 Troop_K00_00',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('combobox',{name:'职责',exact:true})).toHaveValue('Generator');
 await page.getByRole('button',{name:'清空筛选',exact:true}).click();
 await expect(page.getByRole('status').first()).toContainText('候选 1794 张');
});

test('ST preview explains stale saved artwork and stays usable on narrow screens',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/sillytavern.html');
 await page.evaluate(()=>localStorage.setItem('st.portrait-preview.v1',JSON.stringify({version:1,query:{},assetId:'missing'})));
 await page.reload();
 await expect(page.getByRole('alert')).toContainText('已变更');
 await expect(page.getByRole('button',{name:'清空筛选',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});


test('ST assembler restores the exact ability, level, difficulty and numbers after reload',async({page})=>{
 await page.goto('/sillytavern.html');await page.getByRole('button',{name:'选择 Troop_K00_00',exact:true}).click();
 await expect(page.getByRole('region',{name:'敌人能力配置'})).toContainText('法力消耗');
 await page.getByRole('spinbutton',{name:'敌人等级'}).fill('31');await page.getByRole('spinbutton',{name:'敌人等级'}).blur();
 await page.getByRole('spinbutton',{name:'难度倍率'}).fill('1.4');await page.getByRole('spinbutton',{name:'难度倍率'}).blur();
 const detail=await page.getByRole('region',{name:'敌人能力配置'}).textContent();const recipe=await page.getByRole('combobox',{name:'能力配方'}).inputValue();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();await page.reload();
 await expect(page.getByRole('spinbutton',{name:'敌人等级'})).toHaveValue('31');await expect(page.getByRole('spinbutton',{name:'难度倍率'})).toHaveValue('1.4');await expect(page.getByRole('combobox',{name:'能力配方'})).toHaveValue(recipe);
 expect(await page.getByRole('region',{name:'敌人能力配置'}).textContent()).toBe(detail);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>{const key='st.enemy-preview.v1';const full=JSON.parse(localStorage.getItem(key)!) as EnemyBlueprint;full.snapshot.stats.hp++;localStorage.setItem(key,JSON.stringify(full));});await page.reload();
 await expect(page.getByRole('alert')).toContainText('已变更');await expect(page.getByRole('heading',{name:'已选 Troop_K00_00',exact:true})).toHaveCount(0);
});


test('ST artwork changes across original mana colors preserve the complete mechanical recipe after reload',async({page})=>{
 await page.goto('/sillytavern.html');
 const pair=await page.evaluate(async()=>{
   const modulePath='/src/sillytavern/portraits.ts';
   const {findPortraits,colorKey}=await import(/* @vite-ignore */modulePath) as typeof import('../../src/sillytavern/portraits');
   const groups=new Map<string,PortraitEntry[]>();
   for(const portrait of findPortraits({})){
    const key=[portrait.rank,portrait.form,portrait.role].join('|');
    const group=groups.get(key)??[];group.push(portrait);groups.set(key,group);
   }
   for(const group of groups.values()){
    const first=group[0];
    const second=group.find(p=>colorKey(p.manaColors)!==colorKey(first.manaColors));
    if(second)return {first,second};
   }
   throw new Error('Expected distinct artwork with matching rank/form/role and different original mana colors');
 });
 expect(pair.second).toMatchObject({rank:pair.first.rank,form:pair.first.form,role:pair.first.role});
 expect([...pair.second.manaColors].sort()).not.toEqual([...pair.first.manaColors].sort());
 expect(pair.second.contentHash).not.toBe(pair.first.contentHash);
 for(const [label,value] of [['稀有度',pair.first.rank],['形态',pair.first.form],['职责',pair.first.role]])await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);
 await page.getByRole('button',{name:`选择 ${pair.first.assetId}`,exact:true}).click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!) as EnemyBlueprint);
 const seeded=await page.evaluate(async()=>{
  const modulePath='/src/sillytavern/enemyBlueprint.ts';
  const {compileEnemyBlueprint}=await import(/* @vite-ignore */modulePath) as typeof import('../../src/sillytavern/enemyBlueprint');
  const original=JSON.parse(localStorage.getItem('st.enemy-preview.v1')!) as EnemyBlueprint;
  const result=compileEnemyBlueprint({portrait:original.portrait,recipeTroopId:Number(original.recipeId.slice(6)),assembly:original.assembly,externalId:original.snapshot.externalId,level:original.level,difficulty:original.difficulty,statVariationSeed:12345});
  localStorage.setItem('st.enemy-preview.v1',JSON.stringify(result));return result;
 });
 await page.reload();await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const first=await read();expect(first).toEqual(seeded);expect(first.statVariationSeed).toBe(12345);expect(first.descriptionAudit).toBeDefined();
 const detail=await page.getByRole('region',{name:'敌人能力配置',exact:true}).textContent();
 const secondCard=page.getByRole('button',{name:`选择 ${pair.second.assetId}`,exact:true});
 while(await secondCard.count()===0)await page.getByRole('button',{name:'再显示 24 张',exact:true}).click();
 await secondCard.click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const changed=await read();
 expect(first.portrait.assetId).toBe(pair.first.assetId);
 expect(changed.portrait.assetId).toBe(pair.second.assetId);
 expect(changed.portrait.query).not.toHaveProperty('manaColors');
 expect(changed.recipeId).toBe(first.recipeId);
 expect(changed.abilityId).toBe(first.abilityId);
 expect(changed.snapshot.manaColors).toEqual(first.snapshot.manaColors);
 expect(changed.snapshot.manaCost).toBe(first.snapshot.manaCost);
 expect(changed.snapshot.stats).toEqual(first.snapshot.stats);
 const mechanics=(value:EnemyBlueprint)=>{
  const {portrait:_portrait,snapshot,...blueprint}=value;
  const {portraitUrl:_portraitUrl,...combatant}=snapshot;
  void _portrait; void _portraitUrl;
  return {...blueprint,snapshot:combatant};
 };
 expect(mechanics(changed)).toEqual(mechanics(first));
 expect(await page.getByRole('region',{name:'敌人能力配置',exact:true}).textContent()).toBe(detail);
 await page.reload();
 await expect(page.getByRole('heading',{name:`已选 ${pair.second.assetId}`,exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'能力配方',exact:true})).toHaveValue(first.recipeId.slice(6));
 expect(await page.getByRole('region',{name:'敌人能力配置',exact:true}).textContent()).toBe(detail);
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await read()).toEqual(changed);
});

test('ST legacy semantic artwork queries retain their full blueprint until the user edits',async({page})=>{
 await page.goto('/sillytavern.html');
 const saved=await page.evaluate(async fixture=>{
  const designPath='/src/sillytavern/enemyDesign.ts';
  const {restoreEnemyDesign}=await import(/* @vite-ignore */designPath) as typeof import('../../src/sillytavern/enemyDesign');
  const design=restoreEnemyDesign(fixture);
  localStorage.setItem('st.enemy-preview.v1',JSON.stringify(design.blueprint));
  localStorage.setItem('st.enemy-design-preview.v1',JSON.stringify(design));
  return design;
 },legacyDesign);
 expect(saved.blueprint.portrait.query.manaColors).toBeDefined();
 await page.reload();
 await expect(page.getByRole('region',{name:'战术设计结果',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'立绘筛选',exact:true}).getByRole('combobox')).toHaveCount(3);
 const candidates=await page.evaluate(async query=>{
  const portraitPath='/src/sillytavern/portraits.ts';
  const {findPortraits}=await import(/* @vite-ignore */portraitPath) as typeof import('../../src/sillytavern/portraits');
  return findPortraits({rank:query.rank,form:query.form,role:query.role}).length;
 },saved.blueprint.portrait.query);
 await expect(page.getByRole('status').filter({hasText:/^候选 /})).toContainText(`候选 ${candidates} 张`);
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const restored=await page.evaluate(()=>({
  blueprint:JSON.parse(localStorage.getItem('st.enemy-preview.v1')!) as EnemyBlueprint,
  design:JSON.parse(localStorage.getItem('st.enemy-design-preview.v1')!),
 }));
 expect(restored.blueprint).toEqual(saved.blueprint);expect(restored.design).toEqual(saved);
 await page.getByRole('combobox',{name:'形态',exact:true}).selectOption(saved.blueprint.portrait.query.form!);
 await page.getByRole('region',{name:'候选立绘',exact:true}).getByRole('button').first().click();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const edited=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!) as EnemyBlueprint);
 expect(edited.portrait.query).not.toHaveProperty('manaColors');
});


test('ST preview persists complete economic trait mechanics using native battle execution',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/sillytavern.html');
 const fixture=await page.evaluate(async()=>{
  const portraitsPath='/src/sillytavern/portraits.ts',blueprintPath='/src/sillytavern/enemyBlueprint.ts',troopsPath='/src/data/troops.ts';
  const {PORTRAITS}=await import(/* @vite-ignore */portraitsPath) as typeof import('../../src/sillytavern/portraits');
   const {adaptedTrait,adaptedTraitDescription}=await import(/* @vite-ignore */blueprintPath) as typeof import('../../src/sillytavern/enemyBlueprint');
   const {TROOPS}=await import(/* @vite-ignore */troopsPath) as typeof import('../../src/data/troops');
  const troop=TROOPS.find(t=>PORTRAITS.some(p=>p.troopId===t.id)&&t.traits.some(tr=>tr.code==='greedy'&&adaptedTraitDescription(tr.code)?.support==='full'))!;
  const p=PORTRAITS.find(p=>p.troopId===troop.id)!;
  return {id:troop.id,assetId:p.assetId,rank:p.rank,form:p.form,role:p.role,traits:troop.traits.map(tr=>adaptedTrait(tr.code)).filter((trait):trait is NonNullable<typeof trait>=>trait!==undefined)};
 });
 for(const [label,value] of [['稀有度',fixture.rank],['形态',fixture.form],['职责',fixture.role]])await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);
 await page.getByRole('button',{name:`选择 ${fixture.assetId}`,exact:true}).click();
 await page.getByRole('combobox',{name:'能力配方'}).selectOption(String(fixture.id));
 const detail=page.getByRole('region',{name:'敌人能力配置'});
 await expect(detail).not.toContainText('部分特质效果尚待核对');
 await expect(detail).not.toContainText('当前 ST 经济门禁限制使用');
 await expect(detail.getByRole('alert')).toHaveCount(0);
 await expect(detail.locator('p:visible').filter({hasText:/^贪婪：/})).toContainText('基础 2 点战斗金币');
 for(const trait of fixture.traits){
  const rules=detail.locator('details').filter({has:page.getByText(`${trait.name}详细规则`,{exact:true})});
  if(await rules.count()){
   await expect(rules).not.toHaveAttribute('open','');
   await expect(rules.locator('p')).not.toBeVisible();
   await rules.locator('summary').click();
   await expect(rules.locator('p')).toBeVisible();
   await expect(rules).toContainText('向下取整');
   await expect(rules).toContainText('基础 2 点战斗金币');
   await expect(rules).not.toContainText('floor(');
   await expect(rules).not.toContainText('左方');
   await rules.locator('summary').click();
  }else await expect(detail).toContainText(`${trait.name}：${trait.description}`);
 }
 await expect(detail).not.toContainText('trait.');
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!) as EnemyBlueprint);
 expect(saved.traitDescriptionAudit.every(a=>a.support==='full'&&a.diagnostics.length===0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.reload();await expect(page.getByRole('region',{name:'敌人能力配置'})).not.toContainText('当前 ST 经济门禁限制使用');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!))).toEqual(saved);
});


test('ST assembler preserves the complete native economic design', async ({ page }) => {
 await page.goto('/sillytavern.html');
 const portrait = await page.evaluate(async () => {
   const portraitPath = '/src/sillytavern/portraits.ts'; const troopPath = '/src/data/troops.ts';
   const { PORTRAITS } = await import(/* @vite-ignore */portraitPath) as typeof import('../../src/sillytavern/portraits');
   const { TROOPS } = await import(/* @vite-ignore */troopPath) as typeof import('../../src/data/troops');
   const troop = TROOPS.find(t => t.spell.id === 7037)!; const p = PORTRAITS.find(p => p.troopId === troop.id)!;
   return { assetId: p.assetId, rank: p.rank, role: p.role, form: p.form };
 });
 for (const [label, value] of [['稀有度', portrait.rank], ['形态', portrait.form], ['职责', portrait.role]])
   await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
 await page.getByRole('button', { name: `选择 ${portrait.assetId}`, exact: true }).click();
 const alert = page.getByRole('region', { name: '敌人能力配置' }).getByRole('alert');
  await expect(alert).toHaveCount(0);
 await page.getByRole('button', { name: '保存完整敌人配置', exact: true }).click();
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('st.enemy-preview.v1')!) as EnemyBlueprint);
 expect(saved.snapshot.skillId).toBe('st:7037');
 await page.reload(); await expect(page.getByRole('region', { name: '敌人能力配置' }).getByRole('alert')).toHaveCount(0);
 expect(await page.evaluate(() => JSON.parse(localStorage.getItem('st.enemy-preview.v1')!))).toEqual(saved);
});

test('ST applying and reopening a saved semantic design preserves its stat variation',async({page})=>{
 await page.goto('/sillytavern.html');
 const expected=await page.evaluate(async()=>{
  const path='/src/sillytavern/enemyDesign.ts';
  const {compileEnemyDesign,DEFAULT_ENEMY_DESIGN_INPUT}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/enemyDesign');
  const design=compileEnemyDesign(DEFAULT_ENEMY_DESIGN_INPUT,{seed:1,externalId:'varied-enemy',statVariationSeed:12345});
  localStorage.setItem('st.enemy-design-preview.v1',JSON.stringify(design));return design;
 });
 await page.reload();await page.getByRole('button',{name:'恢复已保存的战术设计',exact:true}).click();
 await expect(page.getByRole('region',{name:'战术设计结果',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const read=()=>page.evaluate(()=>({blueprint:JSON.parse(localStorage.getItem('st.enemy-preview.v1')!),design:JSON.parse(localStorage.getItem('st.enemy-design-preview.v1')!)}));
 expect(await read()).toEqual({blueprint:expected.blueprint,design:expected});
 await page.reload();await expect(page.getByRole('region',{name:'战术设计结果',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 expect(await read()).toEqual({blueprint:expected.blueprint,design:expected});
});
