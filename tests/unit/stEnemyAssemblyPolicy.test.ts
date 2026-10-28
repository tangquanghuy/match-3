import {describe,expect,it} from 'vitest';
import type {TroopData} from '../../src/data/troops';
import {BaseColor} from '../../src/engine/types';
import type {GemParams} from '../../src/engine/skills/effects/gems';
import type {ModifierSpec} from '../../src/engine/skills/effects/secondary';
import type {DamageSegment,DevourSegment,EffectSegment,GemSegment} from '../../src/engine/skills/prototypes';
import type {TraitDefinition} from '../../src/engine/traits';
import {
 enemyGenerationIssues,enemyProfileWeight,enemyTeamGenerationIssues,generationTraitIsReachable,
 primaryTaskPreserved,profileEnemyAssembly,
} from '../../src/sillytavern/enemyAssemblyPolicy';

const {Red,Blue,Green,Purple,Yellow}=BaseColor;
const troop:TroopData={
 id:1,name:'fixture',referenceName:'fixture',rarity:'Common',rarityIdx:0,kingdom:null,
 troopTypes:[],role:'Generator',attack:5,armor:5,health:10,magic:3,manaColors:[Red],manaCost:12,
 spell:{id:2,name:'fixture',description:'',meta:{scalings:[],raw:'',parsed:false}},traits:[],portrait:null,
};
const trait=(fields:Partial<TraitDefinition>):TraitDefinition=>({code:'fixture',name:'fixture',description:'',...fields});
const gem=(params:GemParams):GemSegment=>({kind:'gem',params});
const create=(color:BaseColor=Blue):GemSegment=>gem({op:'create',gem:{kind:'color',color},count:{base:5,mult:0}});
const clear=():GemSegment=>gem({op:'clear',mode:'destroy',target:{kind:'color',color:Red}});
const damage=(fields:Partial<DamageSegment>={}):DamageSegment=>({kind:'damage',target:'enemyFront',scaling:{base:5,mult:1},...fields});
const devour=(fields:Partial<DevourSegment>={}):DevourSegment=>({kind:'devour',target:'enemyFront',chance:.25,...fields});
const boost=(fields:Partial<ModifierSpec>={}):ModifierSpec=>({mod:{kind:'multiplier',a:2},source:{kind:'destroyedGems',color:Red},...fields});
const linkedCreate=(modifier=boost()):GemSegment=>gem({op:'create',gem:{kind:'color',color:Blue},count:{base:0,mult:0},modifier});
const profile=(segments:EffectSegment[]=[],traits:TraitDefinition[]=[])=>profileEnemyAssembly(troop,{segments},traits,[]);

 describe('enemy assembly output colors',()=>{
 it('counts transform destinations without including source filters or count sources',()=>{
  const actual=profile([gem({op:'transform',from:Red,to:Blue,count:{base:3,mult:0},
   countModifier:boost({source:{kind:'boardGems',color:Purple}})})]);
  expect(actual.generatedColors).toEqual([Blue]);
  expect(actual.selfMana).toBe(false);
  expect(enemyProfileWeight(actual,'杂兵',[Red])).toBeLessThan(enemyProfileWeight(actual,'杂兵',[Blue]));
 });
 it('counts only create endpoints, including mixed and special outputs',()=>{
  const actual=profile([
   linkedCreate(),gem({op:'create',gem:{kind:'mix',colors:[Green,Blue]},count:{base:5,mult:0}}),
   gem({op:'create',gem:{kind:'mixAny',entries:[Purple,'SKULL',{kind:'dragonGem',color:Yellow}]},count:{base:5,mult:0}}),
   gem({op:'create',gem:{kind:'mixSpecial',specs:[{kind:'spiritGem',color:Blue}]},count:{base:5,mult:0}}),
  ]);
  expect(actual.generatedColors).toEqual([Blue,Green,Purple,Yellow].sort());
  expect(actual.selfMana).toBe(false);
 });
 it('excludes colors used only to clear the board or scale skull creation',()=>{
  expect(profile([clear()]).generatedColors).toEqual([]);
  const actual=profile([gem({op:'create',gem:{kind:'skull'},count:{base:3,mult:0},modifier:boost()})]);
  expect(actual.generatedColors).toEqual([]);
  expect(actual.resourceGain).toBe(false);
  expect(actual.selfMana).toBe(false);
 });
 it('gives special transform destinations priority over the ordinary color endpoint',()=>{
  const actual=profile([gem({op:'transform',from:Purple,to:Red,toSpecial:'doomSkull'})]);
  expect(actual.generatedColors).toEqual([]);
  expect(actual.resourceGain).toBe(false);
  expect(actual.selfMana).toBe(false);
  expect(profile([gem({op:'transform',from:Red,to:Red,toSpecial:{kind:'spiritGem',color:Blue}})]).generatedColors).toEqual([Blue]);
 });
 it('resolves CASTER to its first color and leaves contextual outputs unresolved',()=>{
  expect(profile([gem({op:'transform',from:Blue,to:'CASTER'})]).generatedColors).toEqual([Red]);
  const actual=profileEnemyAssembly({...troop,manaColors:[Red,Blue]},
   {segments:[gem({op:'transform',from:Purple,to:'CASTER'}),gem({op:'transform',from:Yellow,to:'CHOSEN'})]},[],[]);
  expect(actual.generatedColors).toEqual([Red]);
  expect(actual.selfMana).toBe(true);
 });
 it('does not count zero-probability nested gem outputs',()=>{
  expect(profile([{kind:'oneOf',chance:0,options:[[create(Red)]]}]).generatedColors).toEqual([]);
 });
});

 describe('enemy assembly reachable high impact effects',()=>{
 it('treats extra-turn trait triggers as responses rather than granted turns',()=>{
  const actual=profile([devour(),create(Red)],[trait({
   onExtraTurnGain:{stat:'magic',amount:2},onExtraTurnStatus:{scope:'allAllies',id:'enchant',turns:2},
  })]);
  expect(actual.highImpact).toEqual(['devour']);
  expect(enemyGenerationIssues(actual,'首领','ordinary')).not.toContain('lethalManaLoop');
  expect(enemyTeamGenerationIssues([actual])).not.toContain('teamLethalManaLoop');
  expect(profile([{kind:'extraTurn'}]).highImpact).toEqual(['extraTurn']);
  expect(profile([{kind:'extraTurn',chance:0}]).highImpact).toEqual([]);
 });
 it.each([
  devour({chance:0}),devour({chance:0,chanceMult:{times:2,cond:{kind:'targetRace',race:'Beast'}}}),
  devour({chance:0,chanceBoost:boost({mod:{kind:'multiplier',a:0}})}),
  devour({chance:0,chanceBoost:boost({max:0})}),
  damage({execute:true,chance:0}),damage({execute:true,chance:0,chanceBoost:boost({sources:[]})}),
 ])('ignores statically unreachable lethal segments: %j',segment=>{
  const actual=profile([segment]);
  expect(actual.highImpact).toEqual([]);
  expect(actual.canAttack).toBe(false);
 });
 it('retains zero-base-chance devour and execute when their real boost can enable them',()=>{
  expect(profile([devour({chance:0,chanceBoost:boost()}),damage({execute:true,chance:0,chanceBoost:boost()})]).highImpact)
   .toEqual(['devour','execute']);
 });
 it('only includes reachable enemy effects, preserving alternatives without executing them',()=>{
  const actual=profile([
   {kind:'oneOf',chance:0,options:[[devour(),damage({execute:true})]]},
   {kind:'choose',labels:['execute','devour'],options:[[damage({execute:true,chance:0})],[devour({target:'allySelf'})]]},
  ]);
  expect(actual.highImpact).toEqual([]);
  expect(profile([{kind:'oneOf',options:[[devour()],[damage({execute:true})]]}]).highImpact).toEqual(['devour','execute']);
 });
 const lethalTraits:Partial<TraitDefinition>[]=[
  {onSkullHitDevour:{chance:.2}},{onSkullDamagedDevour:{chance:.2}},{onEnemyDeathDevour:{chance:.2}},
  {onBigMatchKill:{chance:.2,scope:'lastEnemy'}},{onSkullHitKill:{chance:.2,scope:'lastEnemy'}},
  {onEnemyDeathKill:{chance:.2,scope:'lastEnemy'}},{skullLethalChance:.2},
 ];
 it.each(lethalTraits)('requires positive probability for lethal traits: %j',fields=>{
  const [key,value]=Object.entries(fields)[0]!;
  const disabled=trait({[key]:typeof value==='object'&&value!==null?{...value,chance:0}:0});
  expect(profile([], [disabled]).highImpact).toEqual([]);
  expect(generationTraitIsReachable(disabled)).toBe(false);
  const enabled=trait(fields);
  expect(profile([], [enabled]).highImpact).toEqual([key.includes('Devour')?'devour':'execute']);
  expect(generationTraitIsReachable(enabled)).toBe(true);
 });
 it('does not derive lethal effects from immunity, descriptions or capability labels',()=>{
  const actual=profileEnemyAssembly(troop,{segments:[]},[trait({devourImmunity:true,description:'devour execute extraTurn'})],['devour','execute','extraTurn']);
  expect(actual.highImpact).toEqual([]);
 });
 it('retains lethal-loop detection for actual effects',()=>{
  const actual=profile([devour(),create(Red),{kind:'extraTurn'}]);
  expect(enemyGenerationIssues(actual,'传奇','ordinary')).toContain('lethalManaLoop');
  expect(enemyTeamGenerationIssues([actual])).toContain('teamLethalManaLoop');
 });
});

 describe('enemy assembly dependency complexity',()=>{
 it('merges a clear and downstream create driven by its destroyed gems',()=>{
  const actual=profile([clear(),linkedCreate(),damage()]);
  expect(actual.families).toEqual(['damage','gem:create','gem:destroy']);
  expect(actual.maxPathFamilies).toBe(2);
 });
 it.each([
  boost(),boost({sources:[{kind:'destroyedGems',color:Red},{kind:'destroyedGems',color:Blue}]}),
  boost({sourceGroups:[[{kind:'destroyedGems'}]]}),
 ])('honors all modifier source encodings: %j',modifier=>{
  expect(profile([clear(),linkedCreate(modifier)]).maxPathFamilies).toBe(1);
 });
 it('keeps independent creates, reverse order and mixed unrelated sources separate',()=>{
  expect(profile([clear(),create()]).maxPathFamilies).toBe(2);
  expect(profile([linkedCreate(),clear()]).maxPathFamilies).toBe(2);
  expect(profile([clear(),linkedCreate(boost({sources:[{kind:'destroyedGems'},{kind:'boardGems',color:Red}]}))]).maxPathFamilies).toBe(2);
 });
 it('does not merge when countRange bypasses the modifier',()=>{
  const ranged=linkedCreate();
  if(ranged.params.op!=='create')throw new Error('fixture must create');
  ranged.params.countRange={min:3,max:5};
  expect(profile([clear(),ranged]).maxPathFamilies).toBe(2);
 });
 it('counts dependencies within each branch rather than across alternatives',()=>{
  const actual=profile([{kind:'oneOf',options:[[clear(),linkedCreate()],[create(),damage()]]}]);
  expect(actual.maxPathFamilies).toBe(2);
  expect(profile([{kind:'choose',labels:['clear','create'],options:[[clear()],[linkedCreate()]]}]).maxPathFamilies).toBe(1);
 });
 it('retains independent effects around an empty branch and preserves input data',()=>{
  const prototype={segments:[damage(),{kind:'oneOf' as const,options:[]},clear(),linkedCreate()]};
  const before=structuredClone(prototype);
  expect(profileEnemyAssembly(troop,prototype,[],[]).maxPathFamilies).toBe(2);
  expect(prototype).toEqual(before);
 });
});

describe('enemy assembly native primary task',()=>{
 it('requires a native anchor before permitting a replacement trait kit',()=>{
  expect(primaryTaskPreserved('Generator',[],['damage'])).toBe(false);
  expect(primaryTaskPreserved('Generator',['damage'],['damage','mana'])).toBe(false);
  expect(primaryTaskPreserved('Unknown',['damage'],['damage'])).toBe(false);
 });
 it('checks evidence within the existing primary role without reclassifying it',()=>{
  expect(primaryTaskPreserved('Generator',['damage','mana'],['damage'])).toBe(false);
  expect(primaryTaskPreserved('Generator',['damage','mana'],['mana'])).toBe(true);
  expect(primaryTaskPreserved('Striker',['damage'],['mana'])).toBe(false);
 });
 it('rejects replacing ally support with self-healing',()=>{
  for(const anchor of ['allyBuff','allyHeal','allyCleanse']){
   expect(primaryTaskPreserved('Support',[anchor,'heal'],['heal'])).toBe(false);
  }
  expect(primaryTaskPreserved('Support',['heal'],['heal'])).toBe(false);
 });
 it('rejects replacing protection with self-healing',()=>{
  for(const anchor of ['armor','barrier','damageReduction']){
   expect(primaryTaskPreserved('Defender',[anchor,'heal'],['heal'])).toBe(false);
  }
  expect(primaryTaskPreserved('Defender',['heal'],['heal'])).toBe(false);
 });
 it('rejects replacing mana generation with skull-only gem creation or conversion',()=>{
  for(const anchor of ['mana','colorGem','gemExplode']){
   expect(primaryTaskPreserved('Generator',[anchor,'gemCreate','gemConvert'],['gemCreate','gemConvert'])).toBe(false);
  }
  expect(primaryTaskPreserved('Generator',['gemCreate','gemConvert'],['gemCreate','gemConvert'])).toBe(false);
 });
 it.each([
  ['Support','allyBuff'],['Support','allyHeal'],['Support','allyCleanse'],['Support','summon'],
  ['Defender','armor'],['Defender','barrier'],['Defender','damageReduction'],
  ['Generator','mana'],['Generator','colorGem'],['Generator','gemExplode'],
 ])('retains native %s task evidence through %s', (role,anchor)=>{
  expect(primaryTaskPreserved(role,[anchor,'heal','gemCreate'],[anchor])).toBe(true);
 });
});
