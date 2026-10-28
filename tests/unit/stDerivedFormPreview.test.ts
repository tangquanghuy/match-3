import {describe, expect, it, vi} from 'vitest';
import {buildDerivedFormPreview} from '../../src/sillytavern/derivedFormPreview';
import type {DerivedPreviewBlueprint, DerivedPreviewServices} from '../../src/sillytavern/derivedFormPreview';
import {executePrototype} from '../../src/engine/skills/prototypes';
import type {EffectSegment, SkillPrototype} from '../../src/engine/skills/prototypes';
import type {EffectContext} from '../../src/engine/skills/effects/context';
import type {Character} from '../../src/engine/types';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import type {SummonTemplate} from '../../src/engine/skills/effects/summon';
import type {TraitDefinition} from '../../src/engine/traits';
import {adaptedPrototype, adaptedTrait, adaptedSummonPool, resolveAdaptedSummon, compileEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS, savePortrait} from '../../src/sillytavern/portraits';
import {TROOPS} from '../../src/data/troops';
import {BaseColor, PlayerSide} from '../../src/engine/types';
import {createSpecialGems} from '../../src/engine/skills/builders';

const blueprint:DerivedPreviewBlueprint={level:37,difficulty:1.6,snapshot:{skillId:'st:1',spellName:'测试主动',traitIds:[]}};
const template=(ref:string, scaling={level:20,difficulty:1}):SummonTemplate=>({
  name:`派生 ${ref}`,maxHp:100,hp:100,attack:25,armor:30,magic:17,colors:[],manaCost:12,mana:0,
  skillId:'st:2',spellName:'实际主动',spellDescription:'实际主动说明',portraitUrl:'/actual-indexed-image.webp',battleScaling:{...scaling},
});
function fixture(segments:EffectSegment[],extra:Partial<DerivedPreviewServices>={}) {
  const resolveSummon=vi.fn((ref:string,scaling:{level:number;difficulty:number})=>template(ref,scaling));
  return {resolveSummon,forms:buildDerivedFormPreview(blueprint,{prototype:()=>({segments}),resolveSummon,hasPortrait:()=>true,...extra})};
}
const summon=(ref:string):EffectSegment=>({kind:'summon',params:{source:{ref}}});
const triggerKeys=['summonOnDeath','summonOnAllyDeath','summonOnEnemyDeath','summonOnDamaged','summonOnAllyCast','turnStartSummon','onBigMatchSummon'];
function flatten(prototype:SkillPrototype):EffectSegment[] {
  return prototype.segments.flatMap(s=>[s,...(s.kind==='choose'||s.kind==='oneOf'?s.options.flatMap(segments=>flatten({segments})):[])]);
}

function executePreviewRecipe(segments:EffectSegment[]) {
  const character=(id:number):Character=>({id,name:`C${id}`,maxHp:100,hp:100,attack:10,armor:0,magic:10,
    colors:[BaseColor.Blue],manaCost:3,mana:0,skillId:'idle',statuses:[],defeated:false});
  const state=createGameState(new BoardModel(),{player:PlayerSide.Left,characters:[character(0)]},
    {player:PlayerSide.Right,characters:[character(1)]});
  const resolveSummonRef=vi.fn(()=>template('unit:1'));
  const ctx:EffectContext={state,casterId:0,rng:new SeededRNG(67),nextGemId:()=>0,chosenBranch:0,resolveSummonRef};
  return {state,events:executePrototype({segments},ctx),resolveSummonRef};
}

describe('ST04 derived form preview',()=>{
  it('matches runtime reachability for zero-base wolf chances with and without a dynamic boost',()=>{
    const wolf:EffectSegment={kind:'status',target:'enemyFront',statusId:'lycanthropy',turns:3,chance:0};
    // Attack 10 supplies exactly +100 percentage points; no RNG or primitive is mocked.
    const chanceBoost={mod:{kind:'multiplier' as const,a:10},source:{kind:'selfStat' as const,stat:'attack' as const}};
    const boosted:EffectSegment={...wolf,chanceBoost};
    const cases:EffectSegment[][]=[[boosted],[{kind:'oneOf',chance:0,chanceBoost,options:[[{...wolf,chance:1}]]}],[wolf]];
    for(const [index,segments]of cases.entries()){
      const before=JSON.stringify(segments);const runtime=executePreviewRecipe(segments);
      const reachable=index<2;
      expect(runtime.events.filter(e=>e.type==='status-apply')).toEqual(reachable
        ?[expect.objectContaining({targetId:1,statusId:'lycanthropy',turns:3})]:[]);
      expect(runtime.state.teams[PlayerSide.Right].characters[0].statuses).toEqual(reachable?[{id:'lycanthropy',turns:3}]:[]);
      const {forms}=fixture(segments,{summonPool:()=>['unit:1']});
      expect(forms).toHaveLength(reachable?1:0);
      if(reachable){expect(forms[0].candidates.map(c=>c.ref)).toEqual(['unit:1']);expect(forms[0].example).toBe(true);}
      expect(JSON.stringify(segments)).toBe(before);
    }
  });
  it('matches runtime pruning of an unreachable oneOf before visiting children while preserving choose expansion',()=>{
    const wolf:EffectSegment={kind:'status',target:'enemyFront',statusId:'lycanthropy',turns:3};
    const blocked:EffectSegment={kind:'oneOf',chance:0,options:[[wolf,summon('unit:1')]]};
    const runtime=executePreviewRecipe([blocked]);
    expect(runtime.events).toEqual([]);expect(runtime.resolveSummonRef).not.toHaveBeenCalled();
    expect(runtime.state.teams[PlayerSide.Right].characters[0].statuses).toEqual([]);
    const pool=vi.fn(()=>['unit:1']);const preview=fixture([blocked],{summonPool:pool});
    expect(preview.forms).toEqual([]);expect(pool).not.toHaveBeenCalled();expect(preview.resolveSummon).not.toHaveBeenCalled();
    // Unlike oneOf, choose is replaced by the selected branch before chance/condition gates.
    const choice={kind:'choose' as const,labels:['狼化'],chance:0,ifCond:{kind:'targetRace' as const,race:'Beast'},options:[[wolf]]};
    const selected=executePreviewRecipe([choice]);
    expect(selected.events.filter(e=>e.type==='status-apply')).toEqual([expect.objectContaining({targetId:1,statusId:'lycanthropy'})]);
    expect(selected.state.teams[PlayerSide.Right].characters[0].statuses).toEqual([{id:'lycanthropy',turns:3}]);
    expect(fixture([choice],{summonPool:()=>['unit:1']}).forms).toHaveLength(1);
    // The shared static gate also excludes target-relative conditions on targetless oneOf nodes.
    const noTarget:EffectSegment={...blocked,chance:1,ifCond:choice.ifCond};
    expect(executePreviewRecipe([noTarget]).events).toEqual([]);
    expect(fixture([noTarget],{summonPool:pool}).forms).toEqual([]);
  });
  it('keeps ordinary summons and passes exact blueprint scaling to the resolver',()=>{
    const {forms,resolveSummon}=fixture([summon('unit:42')]);
    expect(resolveSummon).toHaveBeenCalledTimes(1);expect(resolveSummon).toHaveBeenCalledWith('unit:42',{level:37,difficulty:1.6});
    expect(forms[0]).toMatchObject({kind:'summon',example:false,candidates:[{ref:'unit:42',template:{spellName:'实际主动',spellDescription:'实际主动说明',battleScaling:{level:37,difficulty:1.6}}}]});
    expect(forms[0].rule).toContain('等级 37 · 难度 ×1.6');expect(forms[0].source).toContain('测试主动');
  });
  it('exposes every random candidate in numeric reference order and retains draw weights',()=>{
    const refs=Array.from({length:80},(_,i)=>`unit:${80-i}`);refs.push('unit:2');
    const input:EffectSegment={kind:'summon',params:{source:{randomOf:refs}}};const {forms}=fixture([input]);
    expect(forms[0].random).toBe(true);expect(forms[0].candidates).toHaveLength(80);
    expect(forms[0].candidates.slice(0,3).map(c=>c.ref)).toEqual(['unit:1','unit:2','unit:3']);
    expect(forms[0].candidates[1].weight).toBe(2);expect(forms[0].candidates.at(-1)?.ref).toBe('unit:80');
    expect(refs[0]).toBe('unit:80');expect(fixture([input]).forms).toEqual(forms);
  });
  it.each(['region:3',100002])('uses the actual adapted kingdom pool %s',kingdom=>{
    const summonPool=vi.fn(()=>['unit:9','unit:1']);
    const {forms}=fixture([{kind:'summon',params:{source:{randomOfKingdom:kingdom}}}],{summonPool});
    expect(summonPool).toHaveBeenCalledTimes(1);expect(summonPool).toHaveBeenCalledWith(kingdom);
    expect(forms[0].candidates.map(c=>c.ref)).toEqual(['unit:1','unit:9']);expect(forms[0].source).toContain(String(kingdom));
  });
  it('uses owner scaling for self transformations and labels other transformations as examples',()=>{
    const {forms,resolveSummon}=fixture([
      {kind:'transformTroop',target:'allySelf',ref:'unit:1',fullMana:true},
      {kind:'transformTroop',target:'enemyChosen',randomOf:['unit:9','unit:2']},
      {kind:'transformTroop',target:'allyChosen',ref:'unit:3'},
    ]);
    expect(forms.map(f=>f.example)).toEqual([false,true,true]);expect(forms[0].rule).toContain('自身变形沿用本体等级 37');expect(forms[0].rule).toContain('法力回满');
    for(const form of forms.slice(1)){expect(form.rule).toContain('目标自身的等级与难度');expect(form.rule).toContain('同档示例');}
    expect(forms[1].source).toContain('选定的一名敌人');expect(forms[1].candidates.map(c=>c.ref)).toEqual(['unit:2','unit:9']);
    expect(resolveSummon.mock.calls.every(([,s])=>s.level===37&&s.difficulty===1.6)).toBe(true);
  });
  it('describes snapshot copy sources without inventing images, stats or outcomes',()=>{
    const {forms,resolveSummon}=fixture([
      {kind:'transformTroop',target:'allySelf',copyOf:'enemyChosen',fullMana:true},
      {kind:'summonCopy',target:'allyChosen'}, {kind:'summonCopy',target:'allySelf'},
    ]);
    expect(resolveSummon).not.toHaveBeenCalled();expect(forms.every(f=>f.candidates.length===0)).toBe(true);
    expect(forms[0].source).toContain('选定的一名敌人');expect(forms[0].rule).toContain('实际快照');expect(forms[0].rule).toContain('法力回满');
    expect(forms[1].source).toContain('选定的一名盟友');expect(forms[1].rule).toContain('法力归零');expect(forms[2].source).toContain('施法者自身');
  });
  it('retains nested random and chosen branches, conditions and counts',()=>{
    const {forms}=fixture([{kind:'choose',labels:['甲','乙'],options:[
      [{kind:'oneOf',options:[[summon('unit:1')],[{kind:'transformTroop',target:'allySelf',ref:'unit:2'}]]}],
      [{kind:'summon',chance:.3,ifTargetDied:true,params:{source:{ref:'unit:3'},countRange:{min:1,max:3},position:'front'}}],
    ]}]);
    expect(forms).toHaveLength(3);expect(new Set(forms.map(f=>f.id)).size).toBe(3);
    expect(forms[0].source).toContain('选择分支 1');expect(forms[0].source).toContain('随机分支 1');
    expect(forms[2].description).toContain('30%');expect(forms[2].description).toContain('阵亡');expect(forms[2].description).toContain('首位');expect(forms[2].rule).toContain('1–3');
  });
  it('reads all seven structured trait triggers, excluding storm-only and descriptive text',()=>{
    const trait={code:'st:test',name:'结构召唤',description:'召唤说明',...Object.fromEntries(triggerKeys.map(key=>[key,{referenceName:'unit:5',troopId:5,displayName:'副体',chance:.25,minSize:5,fullMana:true}]))} as TraitDefinition;
    const forms=buildDerivedFormPreview({...blueprint,snapshot:{traitIds:['st:test','st:storm','st:words']}},{
      trait:code=>code==='test'?trait:code==='storm'?{code:'storm',name:'风暴',description:'创造风暴',summonOnDeath:{chance:1,referenceName:'unit:999',displayName:'风暴',troopId:999,storm:{color:'Blue',turns:3}}} as TraitDefinition:{code:'words',name:'文字',description:'召唤一名盟友'},
      resolveSummon:ref=>template(ref),hasPortrait:()=>true,
    });
    expect(forms).toHaveLength(7);expect(forms.every(f=>f.kind==='trait'&&f.fullMana)).toBe(true);expect(forms.every(f=>f.source.includes('25%'))).toBe(true);
    expect(forms.at(-1)?.source).toContain('配对 5 颗及以上');expect(forms.find(f=>f.id.endsWith('.summonOnDamaged'))?.source).toContain('骷髅伤害');
  });
  it('keeps unresolved candidates visible and isolates resolver failures',()=>{
    const {forms}=fixture([{kind:'summon',params:{source:{randomOf:['unit:3','unit:1','unit:2']}}}],{
      resolveSummon:ref=>{if(ref==='unit:1')throw new Error('属性越界');return ref==='unit:2'?null:template(ref);},
    });
    expect(forms[0].candidates).toHaveLength(3);expect(forms[0].candidates[0].error).toBe('属性越界');
    expect(forms[0].candidates[1].template).toBeNull();expect(forms[0].candidates[2].template).not.toBeNull();
  });
  it('handles empty pools and recipes without derived effects',()=>{
    expect(fixture([]).forms).toEqual([]);
    const {forms}=fixture([{kind:'summon',params:{source:{randomOfKingdom:'region:0'}}}],{summonPool:()=>[]});
    expect(forms).toHaveLength(1);expect(forms[0].candidates).toEqual([]);
  });
  it('uses embedded templates without re-resolving or rescaling',()=>{
    const actual=template('inline',{level:9,difficulty:.5});const {forms,resolveSummon}=fixture([{kind:'summon',params:{source:{template:actual}}}]);
    expect(resolveSummon).not.toHaveBeenCalled();expect(forms[0].candidates[0].template).toEqual(actual);expect(forms[0].rule).toContain('以模板为准');
  });
  it('marks all 21 absent local assets as missing even when the resolver supplies a placeholder',()=>{
    const portraitIds=new Set(PORTRAITS.map(p=>p.troopId));const missing=TROOPS.filter(t=>!portraitIds.has(t.id));expect(missing).toHaveLength(21);
    const forms=buildDerivedFormPreview(blueprint,{prototype:()=>({segments:missing.map(t=>summon(`unit:${t.id}`))})});
    for(const form of forms){const candidate=form.candidates[0];expect(candidate.hasPortrait).toBe(false);expect(candidate.template).not.toBeNull();
      expect(candidate.template?.portraitUrl).toContain('static/hero/character-unknown.webp');expect(candidate.template?.battleScaling).toEqual({level:37,difficulty:1.6});}
  });
  it('matches real adapted active recipes, indexed artwork, actual stats and active descriptions',()=>{
    const byKind=new Map<string,typeof TROOPS[number]>();
    for(const troop of TROOPS){
      if(!PORTRAITS.some(p=>p.troopId===troop.id))continue;
      for(const segment of flatten(adaptedPrototype(troop.spell.id))){
        let kind:string=segment.kind;
        if(segment.kind==='summon')kind+=':'+Object.keys(segment.params.source)[0];
        else if(segment.kind==='transformTroop')kind+=':'+(segment.copyOf?'copyOf':segment.ref?'ref':'randomOf');
        if(['summon','transformTroop','summonCopy'].includes(segment.kind)&&!byKind.has(kind))byKind.set(kind,troop);
      }
    }
    expect([...byKind.keys()]).toEqual(expect.arrayContaining(['summon:ref','summon:randomOf','transformTroop:ref','transformTroop:randomOf','transformTroop:copyOf','summonCopy']));
    console.info('ST04_DERIVED_PREVIEW_RECIPES',JSON.stringify(Object.fromEntries([...byKind].map(([kind,troop])=>[kind,troop.id]))));
    for(const troop of byKind.values()){
      const p=PORTRAITS.find(p=>p.troopId===troop.id)!;
      const compiled=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'derived-test',level:29,difficulty:1.3});
      const forms=buildDerivedFormPreview(compiled);expect(forms.length).toBeGreaterThan(0);
      for(const candidate of forms.flatMap(f=>f.candidates)){
        expect(candidate.template).toEqual(resolveAdaptedSummon(candidate.ref,{level:29,difficulty:1.3}));
        if(candidate.hasPortrait)expect(candidate.template?.portraitUrl).toMatch(/static\/portraits\/[^/]+\.webp$/);
      }
    }
  },20000);
  it.each([[7032,8553],[7035,8565]])('previews only real wolf producers for troop %s / skill %s', (troopId,skillId)=>{
    const p=PORTRAITS.find(p=>p.troopId===troopId)!;
    const compiled=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'wolf-preview',level:29,difficulty:1.3});
    expect(compiled.snapshot.skillId).toBe(`st:${skillId}`);
    const before=JSON.stringify(compiled);const forms=buildDerivedFormPreview(compiled);
    const active=forms.filter(f=>f.id.startsWith('active.'));
    const gem=active.find(f=>f.source.includes('狼化宝石')&&f.description.includes('创造'))!;
    expect(gem).toBeDefined();expect(gem.source).toContain('双方');
    expect(gem.rule).toContain('被匹配或摧毁时');expect(gem.rule).toContain('仅移除宝石不触发');
    if(troopId===7032){
      expect(forms.map(f=>f.id)).toEqual(['active.0.lycanthropy','active.2.lycanthropy','trait.st:badtarot.onAllyCastRandomStatus.lycanthropy']);
      const status=active.find(f=>f.id==='active.0.lycanthropy')!;
      expect(status.source).toContain('随机 2 名敌人');expect(status.description).toContain('3回合');
    }else{
      // The real first segment counts wolf gems to scale mana loss; only segment 2 produces gems.
      const segments=adaptedPrototype(skillId).segments;
      expect(segments[0]).toMatchObject({kind:'reduce',stat:'mana',modifier:{source:{kind:'boardSpecial',gem:'lycanthropyGem'}}});
      expect(fixture([segments[0]]).forms).toEqual([]);
      expect(forms.map(f=>f.id)).toEqual(['active.1.lycanthropy','trait.st:lycanthropy.turnStartColorToSpecial.lycanthropy']);
      expect(active).toHaveLength(1);expect(active[0].source).toContain('第 2 段');
    }
    const pool=adaptedSummonPool('Beast');expect(pool.length).toBeGreaterThan(24);
    for(const form of forms){
      expect(form).toMatchObject({kind:'transformTroop',title:'狼化延迟变形',random:true,example:true,fullMana:false});
      expect(form.rule).toContain('正常回合开始');expect(form.rule).toContain('先进行状态解除检查');
      expect(form.rule).toContain('检查后仍有狼化状态，才以 15%');expect(form.rule).toContain('额外回合不重复判定');
      expect(form.rule).toContain('目标自身的等级与难度');expect(form.rule).toContain('同档示例');
      expect(form.source).toContain('Beast');expect(form.rule).toContain('法力归零');
      expect(form.source).not.toMatch(/params|gem|spec|kind|modifier|source|onAllyCastRandomStatus|turnStartColorToSpecial|lycanthropy/i);
      expect(new Set(form.candidates.map(c=>c.ref))).toEqual(new Set(pool));
      for(const candidate of form.candidates)expect(candidate.template).toEqual(resolveAdaptedSummon(candidate.ref,{level:29,difficulty:1.3}));
    }
    expect(JSON.stringify(compiled)).toBe(before);expect(buildDerivedFormPreview(compiled)).toEqual(forms);
    console.info('ST04_WOLF_PREVIEW',JSON.stringify({troopId,skillId,paths:forms.map(f=>({id:f.id,source:f.source})),candidates:pool.length}));
  });
  it('keeps the real Magnus 6478 experiment pool as one conditional wolf path',()=>{
    const p=PORTRAITS.find(p=>p.troopId===6478)!;
    const compiled=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'magnus-preview',level:29,difficulty:1.3});
    expect(compiled.snapshot.traitIds).toContain('st:experiment');
    const trait=adaptedTrait('experiment')!;
    expect(trait.onBigMatchStatus).toMatchObject({scope:'randomEnemy',randomNegative:true});
    expect(trait.onBigMatchStatus!.statuses.map(s=>s.id)).toContain('lycanthropy');
    expect(trait.onBigMatchStatus!.statuses.length).toBeGreaterThan(1);
    const forms=buildDerivedFormPreview(compiled);
    expect(forms).toHaveLength(1);expect(forms[0].id).toBe('trait.st:experiment.onBigMatchStatus.lycanthropy');
    expect(forms[0].source).toContain(`特质「${trait.name}」`);expect(forms[0].source).toContain('4 颗及以上');
    expect(forms[0].source).not.toMatch(/onBigMatchStatus|statuses|randomNegative|params|gem|spec|kind|modifier|source/);
    expect(forms[0].rule).toContain('随机负面状态池可能抽中狼化');expect(forms[0].rule).toContain('先成功施加狼化状态');
    expect(new Set(forms[0].candidates.map(c=>c.ref))).toEqual(new Set(adaptedSummonPool('Beast')));
    // Removing wolf from this actual configured pool removes its only wolf possibility.
    const withoutWolf={...trait,onBigMatchStatus:{...trait.onBigMatchStatus!,statuses:trait.onBigMatchStatus!.statuses.filter(s=>s.id!=='lycanthropy')}};
    expect(buildDerivedFormPreview({...compiled,snapshot:{traitIds:['st:experiment']}},{trait:()=>withoutWolf})).toEqual([]);
    console.info('ST04_MAGNUS_PREVIEW',JSON.stringify({paths:forms.map(f=>f.source),poolSize:trait.onBigMatchStatus!.statuses.length,candidates:forms[0].candidates.length}));
  });
  it.each([8571,8580,8582])('does not turn real skill %s wolf-gem counters into producers',skillId=>{
    const prototype=adaptedPrototype(skillId);expect(JSON.stringify(prototype)).toContain('lycanthropyGem');
    const summonPool=vi.fn(()=>['unit:1']);
    expect(buildDerivedFormPreview({...blueprint,snapshot:{skillId:`st:${skillId}`,traitIds:[]}},{summonPool})).toEqual([]);
    expect(summonPool).not.toHaveBeenCalled();
  });
  it('distinguishes actual skill 8583 destruction from removal and conversion input from output',()=>{
    const prototype=adaptedPrototype(8583);
    const segment=prototype.segments.find(s=>s.kind==='gem'&&s.params.op==='clear')!;
    expect(segment).toMatchObject({kind:'gem',params:{op:'clear',mode:'destroy',target:{kind:'special',gem:'lycanthropyGem'}}});
    expect(fixture([segment],{summonPool:()=>['unit:1']}).forms).toHaveLength(1);
    if(segment.kind!=='gem'||segment.params.op!=='clear')throw new Error('Expected actual wolf destruction');
    const remove:EffectSegment={...segment,params:{...segment.params,mode:'remove'}};
    expect(fixture([remove]).forms).toEqual([]);
    const input:EffectSegment={kind:'gem',params:{op:'transform',fromSpecial:'lycanthropyGem',to:BaseColor.Purple}};
    const output:EffectSegment={kind:'gem',params:{op:'transform',from:BaseColor.Purple,to:BaseColor.Purple,toSpecial:'lycanthropyGem'}};
    expect(fixture([input]).forms).toEqual([]);
    const forms=fixture([output],{summonPool:()=>['unit:1']}).forms;expect(forms).toHaveLength(1);
    expect(forms[0].source).toContain('转换为狼化宝石');
  });
  it.each(['lycanthropy','wolf','wolf-form'])('recognizes the %s status alias without rolling a transformation',statusId=>{
    const pool=vi.fn(()=>['unit:9','unit:2','unit:2']);
    const {forms,resolveSummon}=fixture([{kind:'status',target:'enemyChosen',statusId,turns:3,chance:.5}],{summonPool:pool});
    expect(pool).toHaveBeenCalledWith('Beast');expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({kind:'transformTroop',random:true,example:true,fullMana:false,candidates:[{ref:'unit:2',weight:2},{ref:'unit:9',weight:1}]});
    expect(forms[0].source).toContain('选定的一名敌人');expect(forms[0].description).toContain('50%');
    expect(forms[0].rule).toContain('正常回合开始');expect(forms[0].rule).toContain('检查后仍有狼化状态');
    expect(resolveSummon).toHaveBeenCalledWith('unit:9',{level:37,difficulty:1.6});
  });
  it('preserves delayed self scaling and last-target uncertainty',()=>{
    const {forms}=fixture([
      {kind:'status',target:'allySelf',statusId:'wolf',turns:3},
      {kind:'status',target:'lastTargets',statusId:'wolf-form',turns:3},
    ],{summonPool:()=>['unit:1']});
    expect(forms[0].example).toBe(false);expect(forms[0].rule).toContain('自身变形沿用本体等级 37');
    expect(forms[1].example).toBe(true);expect(forms[1].source).toContain('最近一段的全部目标');
    expect(forms[1].rule).toContain('目标自身的等级与难度');
  });
  it('keeps delayed status and gem paths in nested chosen and random branches',()=>{
    const {forms}=fixture([{kind:'choose',labels:['狼化','召唤'],options:[
      [{kind:'oneOf',options:[[{kind:'status',target:'enemyRandom',statusId:'lycanthropy',turns:3}],[createSpecialGems({kind:'lycanthropyGem'},2)]]}],
      [summon('unit:1')],
    ]}],{summonPool:()=>['unit:2']});
    expect(forms).toHaveLength(3);expect(new Set(forms.map(f=>f.id)).size).toBe(3);
    for(const form of forms.slice(0,2))expect(form.source).toContain('选择分支 1');
    expect(forms[0].source).toContain('随机分支 1');expect(forms[1].source).toContain('随机分支 2');
    expect(forms[1].rule).toContain('施加狼化状态');
  });
  it.each([
    {target:'enemyRandom',expected:true}, {target:'lastTargets',expected:true},
    {target:'allySelf',expected:false}, {target:'allyChosen',expected:false},
    {target:'enemyAll',pool:'positive',expected:false}, {target:'enemyAll',allPositive:true,expected:false},
  ] as const)('follows the preflight random-status pool boundary: %j',({expected,...segment})=>{
    const {forms}=fixture([{kind:'randomStatus',...segment}],{summonPool:()=>['unit:1']});
    expect(forms).toHaveLength(expected?1:0);
    if(expected){expect(forms[0].source).toContain('随机负面状态');expect(forms[0].rule).toContain('抽中狼化');}
  });
  it('reads executable trait status and gem hooks once per trigger',()=>{
    const traits:Record<string,Partial<TraitDefinition>>={
      status:{onDamagedStatus:{statusId:'wolf',turns:3}},
      list:{turnStartStatus:{target:'randomEnemy',statuses:[{id:'lycanthropy'}],turns:3}},
      self:{onAllyCastStatus:{scope:'self',statuses:[{id:'wolf-form'}],turns:3}},
      negative:{onBigMatchStatus:{scope:'randomEnemy',statuses:[{id:'lycanthropy'}],turns:3,randomNegative:true}},
      missing:{onBigMatchStatus:{scope:'randomEnemy',statuses:[{id:'lycanthropy'},{id:'burning'}],turns:3,randomMissingStatusCount:2}},
      cast:{onAllyCastRandomStatus:{scope:'randomEnemy'}},
      create:{turnStartCreateSpecialGem:{gem:'lycanthropyGem',count:1}},
      convert:{turnStartColorToSpecial:{color:BaseColor.Purple,gem:'lycanthropyGem',count:1}},
    };
    const forms=buildDerivedFormPreview({...blueprint,snapshot:{traitIds:Object.keys(traits).map(code=>`st:${code}`)}},{
      trait:code=>({code,name:code,description:`触发说明 ${code}`,...traits[code]} as TraitDefinition),
      summonPool:()=>['unit:1'],resolveSummon:ref=>template(ref),hasPortrait:()=>true,
    });
    expect(forms).toHaveLength(8);expect(new Set(forms.map(f=>f.id)).size).toBe(8);
    expect(forms.every(f=>f.source.includes('特质「')&&f.description.includes('触发说明'))).toBe(true);
    expect(forms.find(f=>f.id.includes('list.'))?.source).toContain('随机一名敌人');
    expect(forms.find(f=>f.id.includes('self.'))?.example).toBe(false);
    expect(forms.find(f=>f.id.includes('status.'))?.example).toBe(false);
    for(const code of ['create','convert'])expect(forms.find(f=>f.id.includes(`${code}.`))?.source).toContain('双方');
  });
  it('excludes immunity, skull damage bonuses, positive trait pools and prose mentions',()=>{
    const trait={code:'excluded',name:'不产生变形',description:'狼化 lycanthropyGem',statusImmunities:['lycanthropy'],
      unknownDependency:{gem:'lycanthropyGem'},skullMultVsStatus:{status:'lycanthropy',mult:2},skullMultVsStatusList:[{status:'wolf',mult:2}],
      onAllyCastRandomStatus:{scope:'randomAlly'},onBigMatchStatus:{scope:'randomEnemy',statuses:[],turns:3,randomNegative:true},
      turnStartStatus:{target:'randomAlly',statuses:[{id:'blessed'}],turns:3,randomPositive:true},
    } as TraitDefinition;
    const summonPool=vi.fn(()=>['unit:1']);
    expect(buildDerivedFormPreview({...blueprint,snapshot:{traitIds:['st:excluded']}},{trait:()=>trait,summonPool})).toEqual([]);
    expect(summonPool).not.toHaveBeenCalled();
  });
  it('keeps empty and failed Beast candidates visible without mutation or RNG',()=>{
    const segment:EffectSegment={kind:'status',target:'enemyChosen',statusId:'lycanthropy',turns:3};const before=JSON.stringify(segment);
    const rng=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('preview consumed RNG');});
    try{
      const overrides={summonPool:()=>['unit:3','unit:2','unit:1'],resolveSummon:(ref:string)=>{if(ref==='unit:1')throw new Error('属性越界');return ref==='unit:2'?null:template(ref);}};
      const {forms}=fixture([segment],overrides);
      expect(forms[0].candidates.map(c=>c.ref)).toEqual(['unit:1','unit:2','unit:3']);
      expect(forms[0].candidates[0].error).toBe('属性越界');expect(forms[0].candidates[1].template).toBeNull();
      expect(fixture([segment],overrides).forms).toEqual(forms);
      const empty=fixture([segment],{summonPool:()=>[]}).forms;expect(empty).toHaveLength(1);expect(empty[0].candidates).toEqual([]);
      expect(JSON.stringify(segment)).toBe(before);expect(rng).not.toHaveBeenCalled();
    }finally{rng.mockRestore();}
  });
  it('preserves real adapted trait references and holder scaling',()=>{
    const troop=TROOPS.find(t=>t.traits.some(tr=>{const adapted=adaptedTrait(tr.code);return adapted&&triggerKeys.some(key=>key in adapted);}))!;
    const forms=buildDerivedFormPreview({...blueprint,snapshot:{traitIds:troop.traits.map(tr=>`st:${tr.code}`)}});
    expect(forms.some(f=>f.kind==='trait')).toBe(true);
    for(const candidate of forms.flatMap(f=>f.candidates))expect(candidate.template).toEqual(resolveAdaptedSummon(candidate.ref,{level:37,difficulty:1.6}));
  });
});