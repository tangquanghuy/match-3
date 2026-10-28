import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

type Mode='summonRef'|'summonRandom'|'transformSelf'|'transformOther'|'transformRandom'|'transformCopy'|'summonCopy'|'trait';
async function openRecipe(page:Page,mode:Mode){
  await page.goto('/sillytavern.html');
  const evidence=await page.evaluate(async mode=>{
    const load=(path:string)=>import(/* @vite-ignore */ path);
    const {TROOPS}=await load('/src/data/troops.ts') as typeof import('../../src/data/troops');
    const {PORTRAITS,savePortrait}=await load('/src/sillytavern/portraits.ts') as typeof import('../../src/sillytavern/portraits');
    const {adaptedPrototype,compileEnemyBlueprint}=await load('/src/sillytavern/enemyBlueprint.ts') as typeof import('../../src/sillytavern/enemyBlueprint');
    const {buildDerivedFormPreview}=await load('/src/sillytavern/derivedFormPreview.ts') as typeof import('../../src/sillytavern/derivedFormPreview');
    type Segment=import('../../src/engine/skills/prototypes').EffectSegment;
    const flat=(segments:Segment[]):Segment[]=>segments.flatMap(s=>[s,...(s.kind==='choose'||s.kind==='oneOf'?s.options.flatMap(flat):[])]);
    for(const troop of TROOPS){
      const p=PORTRAITS.find(p=>p.troopId===troop.id);if(!p)continue;
      const segments=flat(adaptedPrototype(troop.spell.id).segments);
      if(mode==='summonRef'&&!segments.some(s=>s.kind==='summon'&&'ref' in s.params.source))continue;
      if(mode==='summonRandom'&&!segments.some(s=>s.kind==='summon'&&'randomOf' in s.params.source&&s.params.source.randomOf.length>24))continue;
      if(mode==='transformSelf'&&!segments.some(s=>s.kind==='transformTroop'&&s.target==='allySelf'&&s.ref))continue;
      if(mode==='transformOther'&&!segments.some(s=>s.kind==='transformTroop'&&s.target!=='allySelf'&&s.ref))continue;
      if(mode==='transformRandom'&&!segments.some(s=>s.kind==='transformTroop'&&s.randomOf))continue;
      if(mode==='transformCopy'&&!segments.some(s=>s.kind==='transformTroop'&&s.copyOf))continue;
      if(mode==='summonCopy'&&!segments.some(s=>s.kind==='summonCopy'))continue;
      const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'preview-e2e',level:23,difficulty:1.2});
      const forms=buildDerivedFormPreview(blueprint);
      const formIndex=forms.findIndex(f=>{
        if(mode==='summonRef')return f.kind==='summon'&&!f.random&&f.candidates.length>0;
        if(mode==='summonRandom')return f.kind==='summon'&&f.random&&f.candidates.length>24;
        if(mode==='transformSelf')return f.kind==='transformTroop'&&!f.example&&f.candidates.length>0&&!f.random;
        if(mode==='transformOther')return f.kind==='transformTroop'&&f.example&&f.candidates.length>0&&!f.random;
        if(mode==='transformRandom')return f.kind==='transformTroop'&&f.random&&f.candidates.length>0;
        if(mode==='transformCopy')return f.kind==='transformTroop'&&f.candidates.length===0&&f.source.includes('复制来源');
        if(mode==='summonCopy')return f.kind==='summonCopy';
        if(mode==='trait')return f.kind==='trait'&&f.candidates.length>0;
        return false;
      });
      if(formIndex<0)continue;
      const form=forms[formIndex];
      localStorage.removeItem('st.portrait-preview.v1');localStorage.setItem('st.enemy-preview.v1',JSON.stringify(blueprint));
      return {blueprint,formIndex,form};
    }
    throw new Error(`No actual adapted recipe for ${mode}`);
  },mode);
  await page.reload();
  await expect(page.getByRole('region',{name:'召唤与变形预览'})).toBeVisible();
  return {...evidence,article:page.getByRole('region',{name:'召唤与变形预览'}).locator('article').nth(evidence.formIndex)};
}

test('ordinary summon shows indexed artwork, actual stats and active text and follows scaling edits',async({page})=>{
  const {article,form}=await openRecipe(page,'summonRef');const candidate=form.candidates[0],t=candidate.template!;
  await expect(article).toContainText(`生命 ${t.maxHp} · 攻击 ${t.attack} · 护甲 ${t.armor} · 魔力 ${t.magic}`);
  await expect(article).toContainText(t.spellName!);await expect(article).toContainText(t.spellDescription!);
  await expect(article).toContainText('等级 23 · 难度 ×1.2');await expect(article).toContainText(candidate.ref);
  const image=article.locator('img');await expect(image).toHaveAttribute('src',t.portraitUrl!);
  await expect(image).toHaveAttribute('data-portrait-state','available');
  await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('spinbutton',{name:'敌人等级'}).fill('31');await page.getByRole('spinbutton',{name:'敌人等级'}).press('Tab');
  await page.getByRole('spinbutton',{name:'难度倍率'}).fill('1.5');await page.getByRole('spinbutton',{name:'难度倍率'}).press('Tab');
  const expected=await page.evaluate(async ref=>{
    const path='/src/sillytavern/enemyBlueprint.ts';const {resolveAdaptedSummon}=await import(/* @vite-ignore */ path) as typeof import('../../src/sillytavern/enemyBlueprint');
    return resolveAdaptedSummon(ref,{level:31,difficulty:1.5})!;
  },candidate.ref);
  await expect(article).toContainText('模板等级 31 · 难度 ×1.5');
  await expect(article).toContainText(`生命 ${expected.maxHp} · 攻击 ${expected.attack} · 护甲 ${expected.armor} · 魔力 ${expected.magic}`);
});

test('large random pools expose every candidate, stable order and selectable final artwork on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const {article,form,blueprint}=await openRecipe(page,'summonRandom');
  const select=article.getByRole('combobox');await expect(select.locator('option')).toHaveCount(form.candidates.length);
  expect(form.candidates.length).toBeGreaterThan(24);
  const order=await select.locator('option').allTextContents();
  const last=form.candidates.at(-1)!;await select.selectOption(String(form.candidates.length-1));
  await expect(article).toContainText(`随机候选 ${form.candidates.length} / ${form.candidates.length}`);
  await expect(article).toContainText(last.ref);
  if(last.template?.portraitUrl)await expect(article.locator('img')).toHaveAttribute('src',last.template.portraitUrl);
  await expect(page.getByRole('region',{name:'召唤与变形预览'})).toContainText('不会固定战斗结果');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!))).toEqual(blueprint);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.reload();expect(await select.locator('option').allTextContents()).toEqual(order);
});

for(const mode of ['transformSelf','transformOther','transformRandom'] as const){
  test(`${mode} shows actual form and correct owner or target scaling rule`,async({page})=>{
    const {article,form}=await openRecipe(page,mode);const candidate=form.candidates[0],t=candidate.template!;
    await expect(article).toContainText(form.example?'目标自身的等级与难度':'自身变形沿用本体');
    if(form.example)await expect(article).toContainText('同档示例');
    await expect(article).toContainText(`生命 ${t.maxHp}`);await expect(article).toContainText(t.spellDescription!);
    await expect(article.locator('img')).toHaveAttribute('src',t.portraitUrl!);
    await expect.poll(()=>article.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    if(form.candidates.length>1){
      await expect(article.getByRole('combobox').locator('option')).toHaveCount(form.candidates.length);
      await article.getByRole('combobox').selectOption(String(form.candidates.length-1));
      await expect(article).toContainText(form.candidates.at(-1)!.ref);
    }
  });
}
for(const mode of ['transformCopy','summonCopy'] as const){
  test(`${mode} states current snapshot source without invented results`,async({page})=>{
    const {article}=await openRecipe(page,mode);
    await expect(article).toContainText('复制来源');await expect(article).toContainText('实际快照');
    await expect(article).toContainText('当前不预设完整结果');await expect(article).toContainText('战斗中确定复制来源');
    await expect(article.locator('img')).toHaveCount(0);await expect(article.getByRole('combobox')).toHaveCount(0);
    await expect(article).not.toContainText('模板等级');
  });
}
test('structured trait summon displays source, probability, actual artwork and holder scaling',async({page})=>{
  const {article,form}=await openRecipe(page,'trait');const t=form.candidates[0].template!;
  await expect(article).toContainText('特质「');await expect(article).toContainText('概率');
  await expect(article).toContainText('持有者（本体）等级 23 · 难度 ×1.2');await expect(article).toContainText(t.spellDescription!);
  await expect(article.locator('img')).toHaveAttribute('src',t.portraitUrl!);
  await expect.poll(()=>article.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
// These references have real resolver templates but no indexed portrait. Exercise the
// production renderer directly, since a saved assembly cannot itself use a missing portrait.
test('all 21 absent assets stay explicitly missing despite a working generic placeholder',async({page})=>{
  await page.goto('/sillytavern.html');
  const forms=await page.evaluate(async()=>{
    const load=(path:string)=>import(/* @vite-ignore */ path);
    const {TROOPS}=await load('/src/data/troops.ts') as typeof import('../../src/data/troops');
    const {PORTRAITS}=await load('/src/sillytavern/portraits.ts') as typeof import('../../src/sillytavern/portraits');
    const {buildDerivedFormPreview,renderDerivedFormPreview}=await load('/src/sillytavern/derivedFormPreview.ts') as typeof import('../../src/sillytavern/derivedFormPreview');
    const missing=TROOPS.filter(t=>!PORTRAITS.some(p=>p.troopId===t.id));
    const forms=buildDerivedFormPreview({level:23,difficulty:1.2,snapshot:{skillId:'st:1'}},{prototype:()=>({segments:[{kind:'summon',params:{source:{randomOf:missing.map(t=>`unit:${t.id}`)}}}]})});
    document.querySelector('#st-preview')!.replaceChildren(renderDerivedFormPreview(forms));return forms;
  });
  const article=page.getByRole('region',{name:'召唤与变形预览'}).locator('article');const select=article.getByRole('combobox');
  await expect(select.locator('option')).toHaveCount(21);
  for(let i=0;i<forms[0].candidates.length;i++){
    await select.selectOption(String(i));const candidate=forms[0].candidates[i];
    await expect(article).toContainText(`缺少本地立绘资源（${candidate.ref}）`);
    await expect(article).toContainText('通用占位图不代表派生体实际图片');
    await expect(article.locator('img')).toHaveAttribute('data-portrait-state','missing');
    await expect(article.locator('img')).toHaveAttribute('src',/static\/hero\/character-unknown\.webp$/);
  }
  await expect.poll(()=>article.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('kingdom summons expose the complete real adapted roster in the same selector',async({page})=>{
  await page.goto('/sillytavern.html');
  const form=await page.evaluate(async()=>{
    const load=(path:string)=>import(/* @vite-ignore */ path);
    const {PORTRAITS,savePortrait}=await load('/src/sillytavern/portraits.ts') as typeof import('../../src/sillytavern/portraits');
    const {compileEnemyBlueprint,adaptedSummonPool}=await load('/src/sillytavern/enemyBlueprint.ts') as typeof import('../../src/sillytavern/enemyBlueprint');
    const {buildDerivedFormPreview,renderDerivedFormPreview}=await load('/src/sillytavern/derivedFormPreview.ts') as typeof import('../../src/sillytavern/derivedFormPreview');
    const p=PORTRAITS[0];const bp=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'kingdom-e2e',level:23,difficulty:1.2});
    const kingdom=bp.context.regionId!;const pool=adaptedSummonPool(kingdom);if(!pool.length)throw new Error('Expected real nonempty kingdom roster');
    const forms=buildDerivedFormPreview(bp,{prototype:()=>({segments:[{kind:'summon',params:{source:{randomOfKingdom:kingdom}}}]})});
    document.querySelector('#st-preview')!.replaceChildren(renderDerivedFormPreview(forms));return forms[0];
  });
  const article=page.getByRole('region',{name:'召唤与变形预览'}).locator('article');
  await expect(article).toContainText('区域随机池');await expect(article).toContainText('等级 23 · 难度 ×1.2');
  expect(form.candidates.length).toBeGreaterThan(1);await expect(article.getByRole('combobox').locator('option')).toHaveCount(form.candidates.length);
  await article.getByRole('combobox').selectOption(String(form.candidates.length-1));const last=form.candidates.at(-1)!;
  await expect(article).toContainText(last.ref);await expect(article).toContainText(last.template!.spellDescription!);
  await expect(article.locator('img')).toHaveAttribute('src',last.template!.portraitUrl!);
  await expect.poll(()=>article.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
for(const troopId of [7032,7035,6478]){
  test(`wolf paths for troop ${troopId} show delayed target scaling and the complete Beast roster`,async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.goto('/sillytavern.html');
    const evidence=await page.evaluate(async troopId=>{
      const load=(path:string)=>import(/* @vite-ignore */ path);
      const {PORTRAITS,savePortrait}=await load('/src/sillytavern/portraits.ts') as typeof import('../../src/sillytavern/portraits');
      const {compileEnemyBlueprint,adaptedSummonPool,adaptedPrototype,adaptedTrait}=await load('/src/sillytavern/enemyBlueprint.ts') as typeof import('../../src/sillytavern/enemyBlueprint');
      const {buildDerivedFormPreview}=await load('/src/sillytavern/derivedFormPreview.ts') as typeof import('../../src/sillytavern/derivedFormPreview');
      const p=PORTRAITS.find(p=>p.troopId===troopId)!;
      const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'wolf-e2e',level:23,difficulty:1.2});
      const forms=buildDerivedFormPreview(blueprint);
      localStorage.removeItem('st.portrait-preview.v1');localStorage.setItem('st.enemy-preview.v1',JSON.stringify(blueprint));
      return {blueprint,forms,pool:adaptedSummonPool('Beast'),prototype:adaptedPrototype(Number(blueprint.snapshot.skillId!.slice(3))),experiment:adaptedTrait('experiment')};
    },troopId);
    await page.reload();
    const region=page.getByRole('region',{name:'召唤与变形预览'});
    await expect(region).not.toContainText('当前配方没有召唤或角色变形');
    const expectedPaths=troopId===7032
      ?['active.0.lycanthropy','active.2.lycanthropy','trait.st:badtarot.onAllyCastRandomStatus.lycanthropy']
      :troopId===7035?['active.1.lycanthropy','trait.st:lycanthropy.turnStartColorToSpecial.lycanthropy']
      :['trait.st:experiment.onBigMatchStatus.lycanthropy'];
    expect(evidence.forms.map(f=>f.id)).toEqual(expectedPaths);
    await expect(region.locator('article')).toHaveCount(expectedPaths.length);
    if(troopId===7035){
      expect(evidence.prototype.segments[0]).toMatchObject({kind:'reduce',stat:'mana',modifier:{source:{kind:'boardSpecial',gem:'lycanthropyGem'}}});
      expect(evidence.prototype.segments[1]).toMatchObject({kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'lycanthropyGem'}}}});
      await expect(region.locator('article').first()).toContainText('第 2 段');
      await expect(region).not.toContainText('第 1 段');
    }
    if(troopId===6478){
      expect(evidence.blueprint.snapshot.traitIds).toContain('st:experiment');
      expect(evidence.experiment!.onBigMatchStatus).toMatchObject({scope:'randomEnemy',randomNegative:true});
      expect(evidence.experiment!.onBigMatchStatus!.statuses.map(s=>s.id)).toContain('lycanthropy');
      expect(evidence.experiment!.onBigMatchStatus!.statuses.length).toBeGreaterThan(1);
      await expect(region).toContainText('特质「实验」');await expect(region).toContainText('4 颗及以上');
      await expect(region).toContainText('随机负面状态池可能抽中狼化');
      await expect(region).toContainText('先成功施加狼化状态');
    }
    for(let i=0;i<evidence.forms.length;i++){
      const form=evidence.forms[i];const article=region.locator('article').nth(i);
      await expect(article.getByRole('heading',{name:'狼化延迟变形'})).toBeVisible();
      await expect(article).toContainText('持有者正常回合开始时，先进行状态解除检查');
      await expect(article).toContainText('检查后仍有狼化状态，才以 15%');await expect(article).toContainText('额外回合不重复判定');
      const source=article.locator('p').first();await expect(source).toContainText(form.source);
      await expect(source).not.toContainText(/params|gem|spec|kind|modifier|source|onAllyCastRandomStatus|onBigMatchStatus|turnStartColorToSpecial|lycanthropy/i);
      await expect(article).toContainText('目标自身的等级与难度');await expect(article).toContainText('同档示例');
      await expect(article).toContainText('Beast（野兽）');await expect(article).toContainText('法力归零');
      if(form.source.includes('狼化宝石')){
        await expect(article).toContainText('狼化宝石被匹配或摧毁时');await expect(article).toContainText('仅移除宝石不触发');await expect(article).toContainText('双方均可能受影响');
      }else if(form.id.startsWith('active.'))await expect(article).toContainText('随机 2 名敌人');
      const select=article.getByRole('combobox');await expect(select.locator('option')).toHaveCount(evidence.pool.length);
      const last=form.candidates.at(-1)!;await select.selectOption(String(form.candidates.length-1));
      await expect(article).toContainText(last.ref);await expect(article).toContainText(last.template!.spellDescription!);
      await expect(article.locator('img')).toHaveAttribute('src',last.template!.portraitUrl!);
      await expect.poll(()=>article.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!))).toEqual(evidence.blueprint);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}
