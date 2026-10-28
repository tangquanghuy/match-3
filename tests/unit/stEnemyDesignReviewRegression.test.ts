import {describe,expect,it} from 'vitest';
import {getTroopById} from '../../src/data/troops';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import {SKILL_LIBRARY} from '../../src/engine/skills/library';
import {executePrototype} from '../../src/engine/skills/prototypes';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {
 applyColorMatchTriggers,applyTurnStartPassives,attachPassives,getTrait,
 passivesOf,registerDynamicTraits,
} from '../../src/engine/traits';
import type {TraitDefinition} from '../../src/engine/traits';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import type {CombatantSnapshot} from '../../src/session/contract';
import {
 adaptedPrototype,adaptedTrait,compileEnemyBlueprint,restoreEnemyBlueprint,
} from '../../src/sillytavern/enemyBlueprint';
import {
 compileEnemyDesign,inspectEnemyDesignSignature,restoreEnemyDesign,
} from '../../src/sillytavern/enemyDesign';
import type {EnemyDesignInput} from '../../src/sillytavern/enemyDesign';
import {PORTRAITS,ROLE_NAMES,colorKey,restorePortrait,savePortrait} from '../../src/sillytavern/portraits';

// Independent oracles are the source skill/trait definitions and emitted engine events.
// Automatic selection checks the source role; explicit blueprints pin the native execution recipes.
const strikerInput:EnemyDesignInput={
 manaColors:['Green','Yellow'],rank:'精锐',form:'人形',role:'Striker',level:20,difficulty:1,
 effects:[{effect:'damage',requirement:'required'},{effect:'debuff',requirement:'required'}],
};
const healer6026:EnemyDesignInput={
 manaColors:['Green','Brown'],rank:'杂兵',form:'类人',role:'Striker',level:20,difficulty:1,
 effects:[{effect:'heal',requirement:'required'}],
};
const mageInput:EnemyDesignInput={
 manaColors:['Green','Yellow'],rank:'领主',form:'类人',role:'Mage',level:20,difficulty:1,
 effects:[{effect:'damage',requirement:'required'}],
};

function sourceTraits(id:number):TraitDefinition[] {
 return getTroopById(id)!.traits.map(({code})=>{
  const value=adaptedTrait(code);
  expect(value,`real trait ${id}/${code} must survive adaptation`).toBeDefined();
  return value!;
 });
}
function bareSnapshot(id:number,traitIds:string[]=[]):CombatantSnapshot {
 return {externalId:`review-${id}`,name:`review-${id}`,stats:{hp:500,armor:0,attack:10,magic:10},
  manaColors:[BaseColor.Red],manaCost:10,traitIds};
}
function actorForTrait(trait:TraitDefinition) {
 registerDynamicTraits([trait]);
 const actor=snapshotToCharacter(bareSnapshot(0,[trait.code]),0);
 attachPassives(actor);return actor;
}
function cast(prototype:SkillPrototype,magic=10,snapshot:CombatantSnapshot=bareSnapshot(0)) {
 const caster=snapshotToCharacter(snapshot,0),ally=snapshotToCharacter(bareSnapshot(1),1),enemy=snapshotToCharacter(bareSnapshot(4),4);
 caster.magic=magic;
 for(const actor of [caster,ally,enemy])attachPassives(actor);
 const state=createGameState(new BoardModel(),{player:PlayerSide.Left,characters:[caster,ally]},
  {player:PlayerSide.Right,characters:[enemy]});
 let nextGemId=100;
 const events=executePrototype(prototype,{state,casterId:caster.id,rng:new SeededRNG(49),
  nextGemId:()=>nextGemId++,chosenTargetId:enemy.id});
 return {events,caster,ally,enemy};
}

// Check role-first selection separately from execution of each complete native recipe.
describe('independent enemy design review: real mechanical recipes',()=>{
 it.each([['Striker',strikerInput,6035],['Mage',mageInput,6069]] as const)(
  'keeps automatic %s recipes within the requested source role',(_role,input,oldCrossRoleId)=>{
   expect(getTroopById(oldCrossRoleId)!.role).not.toBe(input.role);
   for(const seed of [0,1,49]){
    const result=compileEnemyDesign({...input,assembly:'classified'},{seed,externalId:'review-enemy'});
    const source=getTroopById(Number(result.selection.recipeId.slice(6)))!;
    expect(source.role).toBe(input.role);
    expect(result.blueprint.snapshot.role).toBe(input.role);
    expect(result.signature.roles).toEqual([input.role]);
    expect(result.generation?.primaryRole).toBe(input.role);
    expect(result.generation?.profile.sourceTroopId).toBe(source.id);
    expect(result.blueprint.assembly?.activeTroopId).toBe(source.id);
    expect(result.selection.recipeId).not.toBe(`enemy:${oldCrossRoleId}`);
    const {entry}=restorePortrait(result.blueprint.portrait);
    expect({manaColors:colorKey(entry.manaColors),rank:entry.rank,form:entry.form,role:entry.role}).toEqual({
     manaColors:colorKey(input.manaColors),rank:input.rank,form:input.form,role:input.role,
    });
    const actual=inspectEnemyDesignSignature(adaptedPrototype(source.spell.id),result.blueprint.assembly!.traitCodes.map(code=>adaptedTrait(code)!));
    expect(actual.effects).toEqual(result.signature.effects);
    expect(actual.effects).toEqual(expect.arrayContaining(input.effects.map(e=>e.effect)));
    expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
   }
  });

 it('keeps source 6035 native Warrior recipe and executes its full damage and magic theft',()=>{
  const source=getTroopById(6035)!,native=SKILL_LIBRARY[source.spell.id]!;
  expect(source.role).toBe('Warrior');
  expect(native.segments).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'damage',target:'enemyAll',scaling:{base:4,mult:1}}),
   expect.objectContaining({kind:'reduce',stat:'magic',scaling:{base:4,mult:0},gainStat:'magic'}),
  ]));
  const portrait=PORTRAITS.find(p=>p.troopId===source.id)!;
  const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:source.role!},portrait),recipeTroopId:source.id,externalId:'review-enemy'});
  expect(blueprint.recipeId).toBe('enemy:6035');
  const {entry}=restorePortrait(blueprint.portrait);
  expect(entry.troopId).toBe(source.id);expect(entry.role).toBe(source.role);
  expect(blueprint.snapshot.role).toBe(source.role);
  expect(blueprint.snapshot.name).toBe(`${ROLE_NAMES[entry.role as keyof typeof ROLE_NAMES]} review-enemy`);
  expect(blueprint.snapshot.skillId).toBe(`st:${source.spell.id}`);
  expect(blueprint.snapshot.manaCost).toBe(source.manaCost);
  expect(colorKey(blueprint.snapshot.manaColors)).toBe(colorKey(source.manaColors));
  expect(blueprint.snapshot.traitIds).toEqual(source.traits.map(t=>`st:${t.code}`));
  expect(adaptedPrototype(source.spell.id)).toEqual(native);
  for(const {code}of source.traits){
   const original=getTrait(code)!,adapted=adaptedTrait(code)!;
   for(const [key,value]of Object.entries(original)){
    if(!['code','name','description','troops'].includes(key))expect(adapted[key as keyof TraitDefinition],key).toEqual(value);
   }
  }
  registerDynamicTraits(sourceTraits(source.id));
  const execution=cast(adaptedPrototype(source.spell.id),10,blueprint.snapshot);
  expect(execution.events.some(e=>e.type==='skill-damage'&&e.damage>0&&e.targetId===execution.enemy.id)).toBe(true);
  expect(execution.enemy.magic).toBe(6);
  expect(execution.caster.magic).toBe(14);
  const signature=inspectEnemyDesignSignature(adaptedPrototype(source.spell.id),sourceTraits(source.id));
  expect(signature.roles).toContain('Striker');expect(signature.roles).not.toContain('Warrior');
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
 });

 it('allows a different source role without relaxing the selected artwork query or recipe color/rank',()=>{
  const entry=PORTRAITS.find(p=>p.troopId===6476)!;
  const query={manaColors:['Green','Yellow'],rank:'精锐',form:'人形',role:'Striker'};
  const portrait=savePortrait(query,entry);
  const compiled=compileEnemyBlueprint({portrait,recipeTroopId:6035,externalId:'cross-role'});
  expect(compiled.recipeId).toBe('enemy:6035');expect(compiled.snapshot.role).toBe('Striker');
  expect(()=>savePortrait({...query,role:'Warrior'},entry)).toThrow();
  expect(()=>savePortrait({...query,form:'野兽'},entry)).toThrow();
  expect(()=>compileEnemyBlueprint({portrait,recipeTroopId:6026,externalId:'wrong-colors'})).toThrow();
  expect(()=>compileEnemyBlueprint({portrait,recipeTroopId:6069,externalId:'wrong-rank'})).toThrow();
 });

 it('accepts source 6026 for required heal and really restores missing HP without changing maximum HP',()=>{
  const source=getTroopById(6026)!,native=getTrait('regeneration')!;
  expect(source.traits.map(t=>t.code)).toContain(native.code);
  expect(native.regen).toEqual({stat:'hp',amount:1});
  const result=compileEnemyDesign(healer6026,{seed:1,externalId:'review-enemy'});
  const selected=getTroopById(Number(result.selection.recipeId.slice(6)))!;
  expect(selected.role).toBe(healer6026.role);
  expect(result.blueprint.snapshot.role).toBe(healer6026.role);
  expect(result.signature.effects).toContain('heal');
  const portrait=PORTRAITS.find(p=>p.troopId===source.id)!;
  const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:source.role!},portrait),recipeTroopId:source.id,externalId:'review-enemy'});
  expect(blueprint.recipeId).toBe('enemy:6026');
  expect(blueprint.snapshot.role).toBe(source.role);
  expect(blueprint.snapshot.traitIds).toEqual(source.traits.map(t=>`st:${t.code}`));
  registerDynamicTraits(sourceTraits(source.id));
  const actor=snapshotToCharacter(blueprint.snapshot,0);attachPassives(actor);
  actor.hp-=10;const missingBefore=actor.maxHp-actor.hp,maxHp=actor.maxHp;
  const events=applyTurnStartPassives([actor]);
  expect(actor.maxHp).toBe(maxHp);expect(actor.maxHp-actor.hp).toBe(missingBefore-native.regen!.amount);
  expect(events).toEqual(expect.arrayContaining([expect.objectContaining({type:'buff',targetId:0,stat:'hp',amount:1})]));
  expect(inspectEnemyDesignSignature(adaptedPrototype(source.spell.id),sourceTraits(source.id)).effects).toContain('heal');
  expect(restoreEnemyDesign(JSON.parse(JSON.stringify(result)))).toEqual(result);
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
 });

 it('keeps source 6069 native Assassin recipe and its range damage increases with magic',()=>{
  const source=getTroopById(6069)!,native=SKILL_LIBRARY[source.spell.id]!;
  expect(source.role).toBe('Assassin');
  const damage=native.segments.find(s=>s.kind==='damage')!;
  expect(damage.kind).toBe('damage');if(damage.kind!=='damage')throw new Error('source 6069 needs native damage');
  expect(damage.scaling).toEqual({base:0,mult:0});
  expect(damage.rangeSpec).toEqual({min:{base:4,mult:.5},max:{base:9,mult:1}});
  const portrait=PORTRAITS.find(p=>p.troopId===source.id)!;
  const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:source.role!},portrait),recipeTroopId:source.id,externalId:'review-enemy'});
  expect(blueprint.recipeId).toBe('enemy:6069');
  expect(blueprint.snapshot.role).toBe(source.role);
  expect(blueprint.snapshot.skillId).toBe(`st:${source.spell.id}`);
  expect(blueprint.snapshot.traitIds).toEqual(source.traits.map(t=>`st:${t.code}`));
  expect(inspectEnemyDesignSignature(native,sourceTraits(source.id)).roles).toContain('Mage');
  expect(adaptedPrototype(source.spell.id)).toEqual(native);
  registerDynamicTraits(sourceTraits(source.id));
  const low=cast(native,0,blueprint.snapshot),high=cast(native,10,blueprint.snapshot);
  const lowDamage=500-low.enemy.hp,highDamage=500-high.enemy.hp;
  expect(lowDamage).toBeGreaterThanOrEqual(4);expect(lowDamage).toBeLessThanOrEqual(9);
  expect(highDamage).toBeGreaterThanOrEqual(9);expect(highDamage).toBeLessThanOrEqual(19);
  expect(highDamage).toBeGreaterThan(lowDamage);
  expect(high.events).toEqual(expect.arrayContaining([expect.objectContaining({type:'skill-damage',targetId:4,damage:highDamage})]));
  expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
 });

 it('does not infer Mage from a scalar that the actual fixed damage range overrides',()=>{
  const prototype:SkillPrototype={segments:[{kind:'damage',target:'enemyFront',scaling:{base:0,mult:10},
   rangeSpec:{min:{base:7,mult:0},max:{base:7,mult:0}}}]};
  expect(500-cast(prototype,0).enemy.hp).toBe(7);expect(500-cast(prototype,10).enemy.hp).toBe(7);
  expect(inspectEnemyDesignSignature(prototype,[]).roles).not.toContain('Mage');
 });
});

describe('independent enemy design review: ordinary passive signatures',()=>{
 it.each([[7167,'firewall'],[7344,'armorofheaven'],[7837,'dwarvenfortress']] as const)(
  'reports the armor that real source %i actually gains on its native match color', (id,code)=>{
   expect(getTroopById(id)!.traits.map(t=>t.code)).toContain(code);
   const original=getTrait(code)!,trait=adaptedTrait(code)!,gain=original.onColorMatchGain!;
   expect(gain.stat).toBe('armor');expect(gain.amount).toBeGreaterThan(0);
   expect(trait.onColorMatchGain).toEqual(gain);
   const actor=actorForTrait(trait),before=actor.armor;
   const wrongColor=gain.color===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
   expect(applyColorMatchTriggers([actor],wrongColor)).toEqual([]);expect(actor.armor).toBe(before);
   const events=applyColorMatchTriggers([actor],gain.color as BaseColor);
   expect(actor.armor).toBe(before+gain.amount);
   expect(events).toEqual(expect.arrayContaining([expect.objectContaining({type:'buff',stat:'armor',amount:gain.amount})]));
   const signature=inspectEnemyDesignSignature({segments:[]},[trait]);
   expect(signature.effects).toContain('armor');expect(signature.roles).toContain('Defender');
   expect(signature.roles).not.toContain('Support');
  });

 it('keeps both differently sized match gains of real source 10004 and proves them in the engine',()=>{
  const source=getTroopById(10004)!,original=getTrait('counterflame')!,trait=adaptedTrait('counterflame')!;
  expect(source.traits.map(t=>t.code)).toContain(original.code);
  expect(original.onColorMatchGains).toEqual([
   {color:'Red',stat:'attack',amount:2},{color:'Red',stat:'armor',amount:1},
  ]);
  expect(trait.onColorMatchGains).toEqual(original.onColorMatchGains);
  const actor=actorForTrait(trait),attack=actor.attack,armor=actor.armor;
  applyColorMatchTriggers([actor],BaseColor.Red);
  expect(actor.attack).toBe(attack+2);expect(actor.armor).toBe(armor+1);
  const signature=inspectEnemyDesignSignature({segments:[{kind:'damage',target:'enemyFront',scaling:{base:1,mult:0}}]},[trait]);
  expect(signature.effects).toContain('armor');expect(signature.roles).toEqual(expect.arrayContaining(['Defender','Warrior']));
  expect(signature.effects).not.toContain('allyBuff');expect(signature.roles).not.toContain('Warmaster');
 });

 it('does not confuse ordinary match HP gains with restoration of missing HP',()=>{
  const original=getTrait('hunger')!,trait=adaptedTrait('hunger')!;
  expect([original.onColorMatchGain!.stat,...(original.onColorMatchGain!.alsoStats??[])]).toContain('hp');
  const actor=actorForTrait(trait);actor.hp-=10;const maxHp=actor.maxHp,missing=actor.maxHp-actor.hp;
  applyColorMatchTriggers([actor],'skull');
  expect(actor.maxHp).toBe(maxHp+original.onColorMatchGain!.amount);
  expect(actor.maxHp-actor.hp).toBe(missing);
  expect(inspectEnemyDesignSignature({segments:[]},[trait]).effects).not.toContain('heal');
 });

 it.each([
  [6244,'voracious','onSkullHitDevour'],[7623,'consumefuel','onSkullDamagedDevour'],[7653,'bloodyfeast','onEnemyDeathDevour'],
 ] as const)('retains real source %i passive devour and its native probability', (id,code,key)=>{
  expect(getTroopById(id)!.traits.map(t=>t.code)).toContain(code);
  const native=getTrait(code)!,trait=adaptedTrait(code)!,trigger=native[key]!;
  expect(trigger.chance).toBeGreaterThan(0);expect(trigger.chance).toBeLessThan(1);
  expect(trait[key]).toEqual(trigger);
  const actor=actorForTrait(trait);expect(passivesOf(actor)[key]).toEqual(trigger);
  expect(inspectEnemyDesignSignature({segments:[]},[trait]).effects).toContain('devour');
  const impossible:TraitDefinition={...trait,code:`review-zero-${code}`,[key]:{chance:0}};
  expect(inspectEnemyDesignSignature({segments:[]},[impossible]).effects).not.toContain('devour');
 });
});

describe('independent enemy design review: effective target tracking',()=>{
 it('does not move lastTarget through an ally segment that never executes',()=>{
  const prototype:SkillPrototype={segments:[
   {kind:'damage',target:'enemyFront',scaling:{base:5,mult:0}},
   {kind:'buff',target:'allyOthers',stat:'attack',scaling:{base:1,mult:0},chance:0},
   {kind:'status',target:'lastTarget',statusId:'barrier',turns:1},
  ]};
  const execution=cast(prototype);
  expect(execution.enemy.statuses.some(s=>s.id==='barrier')).toBe(true);
  expect(execution.caster.statuses).toEqual([]);expect(execution.ally.statuses).toEqual([]);
  expect(execution.ally.attack).toBe(10);
  expect(execution.events.filter(e=>e.type==='status-apply')).toEqual([
   expect.objectContaining({type:'status-apply',targetId:4,statusId:'barrier'}),
  ]);
  const signature=inspectEnemyDesignSignature(prototype,[]);
  expect(signature.effects).toContain('damage');
  expect(signature.effects).not.toContain('barrier');expect(signature.effects).not.toContain('allyBuff');
  expect(signature.roles).toEqual(['Striker']);
  expect(signature.evidence.some(e=>e.path==='active.segments[1]'||e.effect==='barrier'||e.effect==='allyBuff')).toBe(false);
 });

 it('still recognizes real ally protection when the intermediate ally segment actually executes',()=>{
  const prototype:SkillPrototype={segments:[
   {kind:'damage',target:'enemyFront',scaling:{base:5,mult:0}},
   {kind:'buff',target:'allyOthers',stat:'attack',scaling:{base:1,mult:0},chance:1},
   {kind:'status',target:'lastTarget',statusId:'barrier',turns:1},
  ]};
  const execution=cast(prototype);
  expect(execution.ally.statuses.some(s=>s.id==='barrier')).toBe(true);
  expect(execution.enemy.statuses).toEqual([]);expect(execution.ally.attack).toBe(11);
  const signature=inspectEnemyDesignSignature(prototype,[]);
  expect(signature.effects).toEqual(expect.arrayContaining(['damage','barrier','allyBuff']));
  expect(signature.roles).toEqual(expect.arrayContaining(['Defender','Striker','Support']));
 });
});
