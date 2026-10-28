import {afterEach,describe,expect,it,vi} from 'vitest';
import {CombatResolver} from '../../src/engine/CombatResolver';
import {attachPassives,passivesOf} from '../../src/engine/traits';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import {executePrototype} from '../../src/engine/skills/prototypes';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {TROOPS,getTroopById} from '../../src/data/troops';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import type {TraitDefinition} from '../../src/engine/traits';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';
import {stableJson} from '../../src/sillytavern/json';
import * as adaptation from '../../src/sillytavern/enemyBlueprint';
import {compileEnemyDesign,restoreEnemyDesign,DEFAULT_ENEMY_DESIGN_INPUT,ENEMY_DESIGN_VOCABULARY,enemyDesignPrompt,EnemyDesignError,inspectEnemyDesignSignature,measureEnemyDesignComplexity} from '../../src/sillytavern/enemyDesign';
import type {EnemyDesignInput,CompiledEnemyDesign} from '../../src/sillytavern/enemyDesign';

const options={seed:6004,externalId:'enemy-1'};
const damage:SkillPrototype={segments:[{kind:'damage',target:'enemyFront',scaling:{base:8,mult:1}}]};
const defaultInput=():EnemyDesignInput=>structuredClone(DEFAULT_ENEMY_DESIGN_INPUT);
function expectSourceRole(result:CompiledEnemyDesign){
 const source=getTroopById(Number(result.selection.recipeId.slice(6)))!;
 expect(source.role).toBe(result.design.role);
 expect(result.blueprint.snapshot.role).toBe(result.design.role);
 expect(result.generation?.primaryRole).toBe(result.design.role);
 expect(result.generation?.profile.sourceTroopId).toBe(source.id);
 return source;
}
function inputFor(id:number,effect='damage'):EnemyDesignInput{
 const p=PORTRAITS.find(p=>p.troopId===id)!;
 return {manaColors:[...p.manaColors],rank:p.rank,form:p.form,role:p.role,level:20,difficulty:1,effects:[{effect,requirement:'required'}]};
}
function expectCode(action:()=>unknown,code:string,path?:string):EnemyDesignError{
 try{action();}catch(error){expect(error).toBeInstanceOf(EnemyDesignError);const result=error as EnemyDesignError;
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({code,...(path?{path}:{})})]));return result;}
 throw new Error(`Expected ${code}`);
}
afterEach(()=>vi.restoreAllMocks());

describe('ST04 semantic enemy compiler: real catalogue',()=>{
 it('compiles the UI default with real damage and independent artwork/recipe bindings',()=>{
  const result=compileEnemyDesign(defaultInput(),options);
  expect(result.design).toEqual(DEFAULT_ENEMY_DESIGN_INPUT);
  expect(result.signature.roles).toContain('Striker');expect(result.signature.effects).toContain('damage');
  const source=expectSourceRole(result);
  const recipe=adaptation.adaptedPrototype(source.spell.id);
  expect(recipe.segments.some(s=>s.kind==='damage')).toBe(true);
  expect(result.blueprint.assembly).toEqual({version:2,manaColors:result.design.manaColors,activeTroopId:source.id,traitCodes:expect.any(Array)});
  expect(result.blueprint.snapshot.traitIds).toEqual(result.blueprint.assembly!.traitCodes.map(code=>`st:${code}`));
  expect(result.generation?.groupWeight).toBeGreaterThan(0);expect(result.generation?.recipeWeight).toBeGreaterThan(0);
  expect(result.blueprint).toEqual(adaptation.compileEnemyBlueprint({portrait:result.blueprint.portrait,recipeTroopId:source.id,assembly:result.blueprint.assembly,externalId:options.externalId,level:20,difficulty:1}));
  expect(result.selection).toEqual({portraitAssetId:result.blueprint.portrait.assetId,recipeId:result.blueprint.recipeId,abilityId:result.blueprint.abilityId,traitIds:result.blueprint.snapshot.traitIds});
  expect(result.blueprint.snapshot.portraitUrl).toContain(result.selection.portraitAssetId);
 });
 it('has a tank whose actual adapted effects prove defense, beyond a source role label',()=>{
  const result=compileEnemyDesign(inputFor(6003,'armor'),options);
  expect(result.signature.roles).toContain('Defender');
  expect(result.signature.effects).toContain('armor');
  expect(result.signature.evidence.some(e=>['armor','barrier','damageReduction'].includes(e.effect))).toBe(true);
  const source=expectSourceRole(result);
  const traits=result.blueprint.assembly!.traitCodes.map(code=>adaptation.adaptedTrait(code)!);
  const actual=inspectEnemyDesignSignature(adaptation.adaptedPrototype(source.spell.id),traits);
  expect(actual.effects).toEqual(result.signature.effects);expect(actual.evidence).toEqual(result.signature.evidence);
  expect(result.signature.roles).toEqual([result.design.role]);
 });
 it('executes the compiled damage and tank reduction through the existing combat engine',()=>{
  const tank=compileEnemyDesign(inputFor(6003,'damageReduction'),options);
  const striker=compileEnemyDesign(defaultInput(),options);
  const attacker=snapshotToCharacter(striker.blueprint.snapshot,0);
  const defender=snapshotToCharacter(tank.blueprint.snapshot,4);
  attachPassives(attacker);attachPassives(defender);
  const incoming=passivesOf(defender).skullDamageTaken;
  expect(incoming).toBeLessThan(1);
  const left={player:PlayerSide.Left,characters:[attacker]},right={player:PlayerSide.Right,characters:[defender]};
  const resolved=new CombatResolver().resolveSkullDamage(left,right,3);
  const hit=resolved.events.find(e=>e.type==='skull-damage');
  expect(hit?.type).toBe('skull-damage');
  if(hit?.type==='skull-damage')expect(hit.damage).toBe(Math.round(attacker.attack*incoming));
  const source=getTroopById(Number(striker.selection.recipeId.slice(6)))!;
  const before=defender.hp+defender.armor;
  const events=executePrototype(adaptation.adaptedPrototype(source.spell.id),{
   state:createGameState(new BoardModel(),left,right),casterId:0,rng:new SeededRNG(6004),nextGemId:()=>100,
   chosenTargetId:defender.id,resolveSummonRef:adaptation.resolveAdaptedSummon,resolveKingdomSummonRefs:adaptation.adaptedSummonPool,
  });
  expect(events.some(e=>e.type==='skill-damage')).toBe(true);
  expect(defender.hp+defender.armor).toBeLessThan(before);
 });
 it('can bind a real image to a different real recipe while retaining exact image morphology',()=>{
  const results=Array.from({length:12},(_,seed)=>compileEnemyDesign(inputFor(6003,'damageReduction'),{...options,seed}));
  expect(results.some(result=>result.selection.recipeId!==`enemy:${result.blueprint.portrait.troopId}`)).toBe(true);
  for(const result of results){expectSourceRole(result);expect(result.blueprint.portrait.query.form).toBe(inputFor(6003).form);}
 });
 it('is stable across serialized inputs and repeated calls with the same seed',()=>{
  const first=compileEnemyDesign(defaultInput(),options);
  expect(compileEnemyDesign(JSON.parse(JSON.stringify(defaultInput())),options)).toEqual(first);
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(first)))).toEqual(first);
 });
 it('keeps rank and shape exact and permits another visual role when the requested one has no artwork',()=>{
  for(const seed of [0,1,49,6004,2147483647]){
   const result=compileEnemyDesign(defaultInput(),{...options,seed});
   expectSourceRole(result);
   const entry=PORTRAITS.find(p=>p.assetId===result.blueprint.portrait.assetId)!;
   expect(entry.form).toBe('人形');expect(result.blueprint.snapshot.manaColors).toEqual(['Red']);expect(entry.rank).toBe('杂兵');expect(entry.role).toBe('Striker');
  }
  const missing=ENEMY_DESIGN_VOCABULARY.ranks.flatMap(rank=>ENEMY_DESIGN_VOCABULARY.forms.flatMap(form=>ENEMY_DESIGN_VOCABULARY.roles.map(role=>({rank:rank.key,form:form.key,role:role.key})))).find(q=>!PORTRAITS.some(p=>p.rank===q.rank&&p.form===q.form&&p.role===q.role))!;
  const impossible={...defaultInput(),...missing};
  const fallback=compileEnemyDesign(impossible,options);expectSourceRole(fallback);
  const picture=PORTRAITS.find(p=>p.assetId===fallback.selection.portraitAssetId)!;
  expect(picture.rank).toBe(missing.rank);expect(picture.form).toBe(missing.form);expect(picture.role).not.toBe(missing.role);
  expect(fallback.blueprint.snapshot.role).toBe(missing.role);
 });
 it('does not let narrative weight alter selected mechanics, artwork, costs or stats',()=>{
  const low=compileEnemyDesign({...defaultInput(),storyWeight:0},options);
  const high=compileEnemyDesign({...defaultInput(),storyWeight:1000},options);
  expect(high.blueprint).toEqual(low.blueprint);expect(high.selection).toEqual(low.selection);
  expect(high.signature).toEqual(low.signature);expect(high.complexity).toEqual(low.complexity);
  expect(high.design.storyWeight).toBe(1000);
 });
 it('separates level/difficulty scaling from rank and narrative weight',()=>{
  const base=compileEnemyDesign(defaultInput(),options);
  const scaled=compileEnemyDesign({...defaultInput(),level:30,difficulty:2},options);
  expect(scaled.selection).toEqual(base.selection);
  expect(scaled.blueprint.snapshot.stats.hp).toBeGreaterThan(base.blueprint.snapshot.stats.hp);
  expect(scaled.design.rank).toBe('杂兵');
 });
 it('reports complexity as measured and uncalibrated for ordinary and legendary recipes',()=>{
  const ordinary=compileEnemyDesign(defaultInput(),options);
  const p=PORTRAITS.find(p=>p.rank==='传奇'&&p.role==='Striker')!;
  const legendary=compileEnemyDesign(inputFor(p.troopId),options);
  for(const result of [ordinary,legendary]){
   expect(result.complexity.calibration).toBe('uncalibrated');expect(result.complexity.activeCount).toBe(1);
   expect(result.diagnostics.some(d=>d.code==='complexity_uncalibrated')).toBe(true);
   const source=getTroopById(Number(result.selection.recipeId.slice(6)))!;
   expect(result.complexity.traitCount).toBe(result.blueprint.snapshot.traitIds?.length);
   expect(result.complexity.effectSegments).toBeGreaterThanOrEqual(adaptation.adaptedPrototype(source.spell.id).segments.length);
  }
 });
 it.each(['summon','transform'])('retains a real %s recipe and its complete adapted mechanics',effect=>{
  let result:CompiledEnemyDesign|undefined;
  for(const p of PORTRAITS){
   const source=getTroopById(p.troopId)!;
   const prototype=adaptation.adaptedPrototype(source.spell.id);
   const traits=source.traits.flatMap(t=>{const adapted=adaptation.adaptedTrait(t.code);return adapted?[adapted]:[];});
   const signature=inspectEnemyDesignSignature(prototype,traits);
   if(!signature.roles.includes(p.role)||!signature.effects.includes(effect))continue;
   try{result=compileEnemyDesign(inputFor(p.troopId,effect),options);break;}catch(error){expect(error).toBeInstanceOf(EnemyDesignError);}
  }
  expect(result).toBeDefined();if(!result)return;
  expect(result.signature.effects).toContain(effect);
  const troop=expectSourceRole(result);
  expect(result.blueprint).toEqual(adaptation.compileEnemyBlueprint({portrait:result.blueprint.portrait,recipeTroopId:troop.id,assembly:result.blueprint.assembly,externalId:options.externalId,level:20,difficulty:1}));
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
 });
 it('shares serializable vocabulary, fields, enum labels and diagnostics with the prompt',()=>{
  const prompt=enemyDesignPrompt();
  expect(JSON.parse(JSON.stringify(ENEMY_DESIGN_VOCABULARY))).toEqual(ENEMY_DESIGN_VOCABULARY);
  for(const entry of ENEMY_DESIGN_VOCABULARY.effects){expect(prompt).toContain(entry.key);expect(prompt).toContain(entry.label);}
  for(const key of Object.keys(ENEMY_DESIGN_VOCABULARY.fields))expect(prompt).toContain(key);
  expect(prompt).toContain(ENEMY_DESIGN_VOCABULARY.diagnostics.no_exact_match);
  expect(ENEMY_DESIGN_VOCABULARY.roles).toHaveLength(9);expect(ENEMY_DESIGN_VOCABULARY.forms).toHaveLength(5);expect(ENEMY_DESIGN_VOCABULARY.ranks).toHaveLength(5);
 });
});

describe('ST04 explicit effects and semantic errors',()=>{
 it('never weakens required intents and only relaxes an explicitly preferred effect',()=>{
  vi.spyOn(adaptation,'adaptedPrototype').mockImplementation(()=>structuredClone(damage));
  vi.spyOn(adaptation,'adaptedTrait').mockReturnValue(undefined);
  const input:EnemyDesignInput={...defaultInput(),effects:[{effect:'damage',requirement:'required'},{effect:'barrier',requirement:'required'}]};
  const failure=expectCode(()=>compileEnemyDesign(input,options),'required_effect_unavailable','effects');
  expect(JSON.stringify(failure.diagnostics)).toContain('barrier');
  input.effects[1]!.requirement='preferred';
  const result=compileEnemyDesign(input,options);
  expect(result.signature.effects).not.toContain('barrier');
  expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'preferred_effect_unmet',details:{effect:'barrier'}}));
 });
 it('retains the real source Defender task when independently assembling traits',()=>{
  const result=compileEnemyDesign({...inputFor(6003),effects:[],assembly:'classified'},options);
  const source=expectSourceRole(result),prototype=adaptation.adaptedPrototype(source.spell.id);
  const nativeTraits=source.traits.map(t=>adaptation.adaptedTrait(t.code)!);
  const native=inspectEnemyDesignSignature(prototype,nativeTraits);
  const tasks=['armor','barrier','damageReduction','heal'].filter(effect=>native.effects.includes(effect));
  expect(tasks.length).toBeGreaterThan(0);
  const selected=result.blueprint.assembly!;
  expect(selected.activeTroopId).toBe(source.id);
  const actual=inspectEnemyDesignSignature(prototype,selected.traitCodes.map(code=>adaptation.adaptedTrait(code)!));
  expect(actual.effects).toEqual(result.signature.effects);
  expect(tasks.some(effect=>actual.effects.includes(effect))).toBe(true);
  expect(result.signature.roles).toEqual(['Defender']);
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
 });
 it('retains ordinary native economy mechanics without stripping effects',()=>{
  const economic:SkillPrototype={segments:[...damage.segments,{kind:'gainEconomy',currency:'gold',scaling:{base:3,mult:0}}]};
  const spy=vi.spyOn(adaptation,'adaptedPrototype').mockReturnValue(economic);
  const before=stableJson(economic);
  const result=compileEnemyDesign(defaultInput(),options);
  expect(result.blueprint.snapshot.skillId).toBeTruthy();
  expect(stableJson(economic)).toBe(before);expect(spy).toHaveBeenCalled();
 });
 it('reports unknown active mechanisms/empty recipes before battle',()=>{
  vi.spyOn(adaptation,'adaptedPrototype').mockReturnValue({segments:[]});
  expectCode(()=>compileEnemyDesign(defaultInput(),options),'mechanism_unavailable');
 });
 it.each(['troopID','portraitID','recipeID','lineageRef','sameLineageAs'])('rejects runtime internal/narrative field %s',key=>{
  expectCode(()=>compileEnemyDesign({...defaultInput(),[key]:'internal'},options),'unknown_field',key);
 });
 it.each([['rank','Mythic'],['role','Healer'],['form','四足兽']])('rejects unknown %s enum with vocabulary-generated diagnostics',(field,value)=>{
  const error=expectCode(()=>compileEnemyDesign({...defaultInput(),[field]:value},options),'invalid_enum',field);
  expect(error.message).toContain(ENEMY_DESIGN_VOCABULARY.diagnostics.invalid_enum);
 });
 it.each([[],['Red','Red'],['Orange']].map(manaColors=>({manaColors})))('rejects invalid color sets $manaColors',({manaColors})=>{
  expectCode(()=>compileEnemyDesign({...defaultInput(),manaColors},options),'invalid_value','manaColors');
 });
 it.each([['level',0],['level',101],['level',1.5],['difficulty',0],['difficulty',11],['difficulty',NaN],['storyWeight',-1]])('rejects invalid %s value %s',(field,value)=>{
  expectCode(()=>compileEnemyDesign({...defaultInput(),[field]:value},options),'invalid_value',field);
 });
 it('normalizes omitted or undefined effects to the same role-first design as an empty array',()=>{
  const {effects,...input}=defaultInput();
  expect(effects).toEqual([]);
  const explicit=compileEnemyDesign({...input,effects:[]},options);
  expectSourceRole(explicit);
  expect(compileEnemyDesign(input,options)).toEqual(explicit);
  expect(compileEnemyDesign({...input,effects:undefined},options)).toEqual(explicit);
 });
 it('rejects null, unknown, duplicated or extra intent fields',()=>{
  expectCode(()=>compileEnemyDesign({...defaultInput(),effects:null},options),'invalid_value','effects');
  expectCode(()=>compileEnemyDesign({...defaultInput(),effects:[{effect:'fire',requirement:'required'}]},options),'invalid_enum','effects[0].effect');
  expectCode(()=>compileEnemyDesign({...defaultInput(),effects:[{effect:'damage',requirement:'maybe'}]},options),'invalid_enum','effects[0].requirement');
  expectCode(()=>compileEnemyDesign({...defaultInput(),effects:[{effect:'damage',requirement:'required',recipeId:'enemy:6004'}]},options),'unknown_field','effects[0].recipeId');
  expectCode(()=>compileEnemyDesign({...defaultInput(),effects:[{effect:'damage',requirement:'required'},{effect:'damage',requirement:'preferred'}]},options),'invalid_value','effects[1]');
 });
 it.each([NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])('requires a reproducible integer seed %s',seed=>{
  expectCode(()=>compileEnemyDesign(defaultInput(),{...options,seed}),'invalid_value','seed');
 });
});

describe('ST04 conservative actual effect inspection and full measurements',()=>{
 it('uses real reduction traits to prove tank mechanics and ignores inert source wording',()=>{
  const trait:TraitDefinition={code:'test',name:'坦克',description:'屏障治疗召唤',skullDamageReduction:0.25};
  const signature=inspectEnemyDesignSignature(damage,[trait]);
  expect(signature.roles).toContain('Defender');expect(signature.effects).toContain('damageReduction');
  expect(signature.effects).not.toContain('heal');expect(signature.effects).not.toContain('summon');
  expect(inspectEnemyDesignSignature(damage,[{...trait,skullDamageReduction:0}]).roles).not.toContain('Defender');
 });
 it('does not infer Assassin from ordinary single-target damage or Generator from skull generation',()=>{
  expect(inspectEnemyDesignSignature(damage,[]).roles).not.toContain('Assassin');
  const skulls:SkillPrototype={segments:[{kind:'gem',params:{op:'create',gem:{kind:'skull'},count:{base:8,mult:0}}}]};
  expect(inspectEnemyDesignSignature(skulls,[]).effects).toContain('gemCreate');
  expect(inspectEnemyDesignSignature(skulls,[]).roles).not.toContain('Generator');
 });
 it('recognizes actual colored gem production, healing and structured trait status lists',()=>{
  const recipe:SkillPrototype={segments:[
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:BaseColor.Blue},count:{base:4,mult:0}}},
   {kind:'buff',target:'allyAll',stat:'hp',lifeMode:'heal',scaling:{base:3,mult:1}},
  ]};
  const traits:TraitDefinition[]=[{code:'structured',name:'structured',description:'',
   battleStartStatus:{target:'self',statuses:[{id:'barrier'}],turns:1},
   turnStartStatus:{target:'randomEnemy',statuses:[{id:'silence'}],turns:1},
  }];
  const signature=inspectEnemyDesignSignature(recipe,traits);
  expect(signature.roles).toEqual(expect.arrayContaining(['Generator','Support','Defender','Warlock']));
  expect(signature.effects).toEqual(expect.arrayContaining(['gemCreate','heal','barrier','control']));
  expect(inspectEnemyDesignSignature({segments:[{kind:'buff',target:'allySelf',stat:'hp',lifeMode:'gain',scaling:{base:10,mult:0}}]},[]).effects).not.toContain('heal');
 });
 it.each([false,true])('recognizes random ally attributes without promising a specific stat (oneSkill=%s)',oneSkill=>{
  const recipe:SkillPrototype={segments:[{kind:'randomStat',target:'allyChosen',scaling:{base:3,mult:0},oneSkill}]};
  const signature=inspectEnemyDesignSignature(recipe,[]);
  expect(signature.effects).toEqual(['allyBuff']);expect(signature.roles).toEqual(['Support']);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStat',target:'allySelf',scaling:{base:3,mult:0},oneSkill}]},[]).effects).toEqual([]);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStat',target:'allyAll',scaling:{base:0,mult:0}}]},[]).effects).toEqual([]);
 });
 it('classifies native random status pools without promising one status from the pool',()=>{
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStatus',target:'enemyAll'}]},[]).effects).toEqual(['debuff']);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStatus',target:'allyChosen'}]},[]).effects).toEqual(['allyBuff']);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStatus',target:'enemyAll',pool:'positive'}]},[]).effects).toEqual([]);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStatus',target:'enemyAll',allPositive:true}]},[]).effects).toEqual([]);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStatus',target:'allyAll',allPositive:true}]},[]).effects).toEqual(['barrier','allyBuff']);
  expect(inspectEnemyDesignSignature({segments:[{kind:'randomStatus',target:'enemyAll',chance:0}]},[]).effects).toEqual([]);
 });
 it.each(['CHOSEN','CASTER','ENEMY','TRACKED_ENEMY','LAST_TARGET','ENEMY_MOST_USED','ALLY_MOST_USED','CHOSEN_TARGET'] as const)('recognizes native dynamic color source %s while keeping skulls separate',color=>{
  const recipe:SkillPrototype={segments:[{kind:'gem',params:{op:'create',gem:{kind:'color',color},count:{base:9,mult:0}}}]};
  const before=stableJson(recipe);
  expect(inspectEnemyDesignSignature(recipe,[]).roles).toContain('Generator');
  expect(stableJson(recipe)).toBe(before);
 });
 it('opens the real 6817 random-ally and target-color recipe through the semantic compiler',()=>{
  const prototype=adaptation.adaptedPrototype(8216),before=stableJson(prototype);
  const signature=inspectEnemyDesignSignature(prototype,[]);
  expect(signature.roles).toEqual(['Generator','Support']);
  expect(signature.effects).toEqual(['allyBuff','gemCreate']);
  const input={...inputFor(6817,'gemCreate'),effects:[{effect:'gemCreate',requirement:'required'},{effect:'allyBuff',requirement:'required'}]} satisfies EnemyDesignInput;
  expect(getTroopById(6817)!.role).toBe('Support');expect(input.role).toBe('Support');
  const result=compileEnemyDesign(input,{seed:6817,externalId:'enemy-6817'});
  expectSourceRole(result);
  expect(result.signature.roles).toEqual(['Support']);
  const portrait=PORTRAITS.find(p=>p.troopId===6817)!;
  const blueprint=adaptation.compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),recipeTroopId:6817,externalId:'enemy-6817'});
  expect(blueprint.snapshot.skillId).toBe('st:8216');
  expect(adaptation.restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
  expect(result.signature.effects).toEqual(expect.arrayContaining(['gemCreate','allyBuff']));
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
  expect(stableJson(prototype)).toBe(before);
 });
 it('does not advertise one-branch-only effects as required capabilities',()=>{
  const branch:SkillPrototype={segments:[{kind:'oneOf',options:[damage.segments,[{kind:'status',target:'allySelf',statusId:'barrier',turns:1}]]}]};
  const signature=inspectEnemyDesignSignature(branch,[]);
  expect(signature.effects).not.toContain('damage');expect(signature.effects).not.toContain('barrier');
  expect(signature.evidence).toEqual(expect.arrayContaining([expect.objectContaining({effect:'barrier'})]));
  const shared:SkillPrototype={segments:[{kind:'choose',labels:['A','B'],options:[damage.segments,[...damage.segments,{kind:'status',target:'allySelf',statusId:'barrier',turns:1}]]}]};
  expect(inspectEnemyDesignSignature(shared,[]).effects).toContain('damage');
  expect(inspectEnemyDesignSignature(shared,[]).effects).not.toContain('barrier');
 });
 it('excludes provably unreachable effects from signatures but still measures and preserves them',()=>{
  const recipe:SkillPrototype={segments:[...damage.segments,{kind:'status',target:'allySelf',statusId:'barrier',turns:1,chance:0}]};
  expect(inspectEnemyDesignSignature(recipe,[]).effects).not.toContain('barrier');
  expect(measureEnemyDesignComplexity(recipe,[]).effectSegments).toBe(2);
  expect(recipe.segments).toHaveLength(2);
 });
 it('measures nested branches and traits without reducing them to a capped score',()=>{
  const recipe:SkillPrototype={segments:[{kind:'oneOf',options:[damage.segments,[{kind:'choose',labels:['a','b'],options:[damage.segments,[{kind:'status',target:'enemyFront',statusId:'silence',turns:2,chance:0.5}]]}]]}]};
  const before=stableJson(recipe);
  const complexity=measureEnemyDesignComplexity(recipe,[{code:'r',name:'r',description:'',skullDamageReduction:0.5,regen:{stat:'armor',amount:2}}]);
  expect(complexity).toMatchObject({activeCount:1,traitCount:1,effectSegments:5,branchCount:4,conditionalCount:1,traitMechanisms:2,calibration:'uncalibrated'});
  expect(stableJson(recipe)).toBe(before);
 });
 it('inspects every real adapted prototype without mutating catalogue skills or excluding complex families',()=>{
  const kinds=new Set<string>();
  for(const t of TROOPS){
   const recipe=adaptation.adaptedPrototype(t.spell.id),before=stableJson(recipe);
   const traits=t.traits.flatMap(tr=>{const adapted=adaptation.adaptedTrait(tr.code);return adapted?[adapted]:[];});
   recipe.segments.forEach(s=>kinds.add(s.kind));
   const complexity=measureEnemyDesignComplexity(recipe,traits);
   expect(complexity.effectSegments).toBeGreaterThanOrEqual(recipe.segments.length);
   inspectEnemyDesignSignature(recipe,traits);expect(stableJson(recipe)).toBe(before);
  }
  expect(kinds.has('transformTroop')).toBe(true);expect(kinds.has('summon')).toBe(true);expect(kinds.has('oneOf')).toBe(true);
 },30000);
});

describe('ST04 persisted semantic design integrity',()=>{
 const mutations:[string,(saved:CompiledEnemyDesign)=>void][]=[
  ['semantic weight',s=>{s.design.storyWeight=2;}],['seed',s=>{s.seed++;}],['external id',s=>{s.externalId='changed';}],
  ['stats',s=>{s.blueprint.snapshot.stats.hp++;}],['image',s=>{s.selection.portraitAssetId='edited';}],
  ['recipe',s=>{s.selection.recipeId='enemy:6000';}],['ability',s=>{s.selection.abilityId='edited';}],
  ['traits',s=>{s.selection.traitIds.push('edited');}],['signature',s=>{s.signature.effects.push('barrier');}],
  ['evidence',s=>{s.signature.evidence[0]!.detail='edited';}],['complexity',s=>{s.complexity.effectSegments++;}],
  ['diagnostics',s=>{s.diagnostics=[];}],['portrait query',s=>{s.blueprint.portrait.query.form='野兽';}],
  ['integrity',s=>{s.integrity='changed';}],['version',s=>{s.version=99 as 1;}],['ruleset',s=>{s.rulesetVersion='old';}],
 ];
 it.each(mutations)('checks %s against the entire canonical saved result',(_name,mutate)=>{
  const saved=compileEnemyDesign(defaultInput(),options);mutate(saved);
  expectCode(()=>restoreEnemyDesign(saved),'invalid_save');
 });
 it('checks extra nested fields as well as edits and validates a JSON roundtrip',()=>{
  const saved=compileEnemyDesign(defaultInput(),options);
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  const extra={...saved,selection:{...saved.selection,hidden:true}};
  expectCode(()=>restoreEnemyDesign(extra),'invalid_save');
 });
});
