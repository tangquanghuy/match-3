import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {prototypeEconomyIssues,traitEconomyIssues} from '../../src/sillytavern/economyAvailability';
import {validateStDerivedForms} from '../../src/sillytavern/derivedFormPreflight';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import * as catalogue from '../../src/sillytavern/enemyBlueprint';
import {ExtensionRegistry} from '../../src/engine/registry';
import {getTrait,registerDynamicTraits,attachPassives,applyBigMatchTriggers,applyCastRandomStatusTriggers} from '../../src/engine/traits';
import type {TraitDefinition} from '../../src/engine/traits';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import type {EffectSegment,SkillPrototype} from '../../src/engine/skills/prototypes';
import {executePrototype} from '../../src/engine/skills/prototypes';
import type {ModifierSource,ModifierSpec} from '../../src/engine/skills/effects/secondary';
import type {SummonTemplate} from '../../src/engine/skills/effects/summon';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {TROOPS} from '../../src/data/troops';
import {PERK_DYNAMIC_DEFS} from '../../src/meta/data/talentDefs';
import {applyStatus,RANDOM_NEGATIVE_STATUS_POOL,RANDOM_POSITIVE_STATUS_POOL} from '../../src/engine/skills/effects/status';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';

const safe:EffectSegment={kind:'buff',target:'allySelf',stat:'attack',scaling:{base:1,mult:0}};
const gain:EffectSegment={kind:'gainEconomy',currency:'souls',scaling:{base:1,mult:0}};
const damage:EffectSegment={kind:'damage',target:'enemyFront',scaling:{base:5,mult:0}};
const boost=(kind:ModifierSource['kind']):ModifierSpec=>({mod:{kind:'multiplier',a:1},source:{kind} as ModifierSource});
const actor=(externalId:string,skillId='idle'):CombatantSnapshot=>({externalId,name:externalId==='hero'?'主角':'对手',stats:{hp:100,attack:10,armor:0,magic:60},manaCost:3,manaColors:[BaseColor.Blue],skillId});
function request():BattleRequest {
 return {schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'economy-gate',requestId:'economy-gate-request',seed:4,playerTeam:[actor('hero')],enemyTeam:[actor('enemy')]};
}
function controlled(prototype:SkillPrototype={segments:[safe]}) {
 const battle=request();battle.playerTeam[0]!.skillId='root';
 const registry=new ExtensionRegistry();registry.prototypes.set('root',prototype);registry.prototypes.set('idle',{segments:[safe]});
 return {battle,registry,run:()=>validateStDerivedForms(battle,registry)};
}
function inline(skillId:string,traitIds?:string[]):SummonTemplate {
 return {name:'候选角色',maxHp:100,hp:100,attack:10,armor:0,magic:1,colors:[BaseColor.Blue],manaCost:3,mana:0,skillId,traitIds};
}
function errorOf(run:()=>unknown):string {
 try{run();}catch(error){return error instanceof Error?error.message:String(error);}
 throw new Error('Expected an unavailable dependency or mode');
}
afterEach(()=>vi.restoreAllMocks());

describe('ST economy availability: own executable effects',()=>{
 it.each<EffectSegment>([
   gain,{kind:'gainEconomy',currency:'gold',scaling:{base:1,mult:0}},
   {kind:'gainEconomy',currency:'gems',scaling:{base:1,mult:0}},
   {kind:'gainEconomy',currency:'maps',scaling:{base:1,mult:0}},
   {kind:'spendEconomy',currency:'gold',scaling:{base:1,mult:0}},
   {kind:'stealGold',scaling:{base:1,mult:0}},
 ])('accepts native $kind $currency without dropping or rewriting it',segment=>{
   const prototype={segments:[damage,segment]};const f=controlled(prototype);
   const before=JSON.stringify({prototype,battle:f.battle});
   const next=vi.spyOn(SeededRNG.prototype,'next');
   expect(prototypeEconomyIssues(prototype)).toEqual([]);
   expect(f.run).not.toThrow();expect(next).not.toHaveBeenCalled();
   expect(JSON.stringify({prototype,battle:f.battle})).toBe(before);
 });
 it.each(['battleGold','enemyGold','bothGold','battleSouls','battleGems','battleMaps','goldStolen','goldSpent'] as const)('accepts the native %s counter without requiring a local credit segment',kind=>{
   const f=controlled({segments:[{...damage,modifier:boost(kind)}]});expect(f.run).not.toThrow();
 });
 it.each(['modifier','modifiers','chanceBoost','condition'] as const)('preserves native economy dependencies in %s',path=>{
   const segment:EffectSegment=path==='condition'?{...damage,ifCond:{kind:'allOf',of:[{kind:'economyAtLeast',currency:'souls',n:1}]}}:
     path==='modifiers'?{...damage,modifiers:[{mod:{kind:'multiplier',a:1},sourceGroups:[[{kind:'selfStat',stat:'magic'}],[{kind:'battleGold'}]]}]}:
     {...damage,[path]:boost('battleGold')};
   const f=controlled({segments:[segment]}),before=JSON.stringify(segment);expect(f.run).not.toThrow();expect(JSON.stringify(segment)).toBe(before);
 });
 it.each(['chanceBoost','ifCond'] as const)('accepts native outer oneOf %s without rewriting its branches',key=>{
   const segment:EffectSegment={kind:'oneOf',options:[[safe]],...(key==='chanceBoost'?{chanceBoost:boost('battleGold')}:{ifCond:{kind:'economyAtLeast' as const,currency:'gold' as const,n:1}})};
   const f=controlled({segments:[segment]}),before=JSON.stringify(segment);expect(f.run).not.toThrow();expect(JSON.stringify(segment)).toBe(before);
 });
 it.each(['oneOf','choose'] as const)('retains every %s economy branch and its zero-chance child',kind=>{
   const options:EffectSegment[][]=[[safe],[{...gain,chance:0}],[gain]];
   const branch:EffectSegment=kind==='choose'?{kind,options,labels:['一','二','三']}:{kind,options};
   const f=controlled({segments:[branch]}),before=JSON.stringify(branch);expect(f.run).not.toThrow();expect(JSON.stringify(branch)).toBe(before);
   options.pop();expect(f.run).not.toThrow();
 });
 it.each([0,-0.25])('prunes an unboosted chance %s economic segment after real damage',chance=>{
   const prototype={segments:[damage,{...gain,chance}]};const f=controlled(prototype);
   const character=(id:number):Character=>({id,name:'角色',maxHp:100,hp:100,attack:10,armor:0,magic:60,colors:[BaseColor.Blue],manaCost:3,mana:0,skillId:'root',statuses:[],defeated:false});
   const state=createGameState(new BoardModel(),{player:PlayerSide.Left,characters:[character(0)]},{player:PlayerSide.Right,characters:[character(1)]});
   const events=executePrototype(prototype,{state,casterId:0,rng:new SeededRNG(4),nextGemId:()=>0});
   expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',damage:5}));
   expect(events.some(event=>event.type==='economy-gain')).toBe(false);
   expect(prototypeEconomyIssues(prototype)).toEqual([]);expect(f.run).not.toThrow();
 });
 it('retains a zero-chance branch with a dynamic boost and ignores the current zero board count',()=>{
   const f=controlled({segments:[{...gain,chance:0,chanceBoost:boost('battleGold')}]});expect(f.run).not.toThrow();
 });
 it('prunes a target-relative condition on a targetless economic effect',()=>{
   const f=controlled({segments:[{...gain,ifCond:{kind:'targetStatus',statusId:'burn'}}]});expect(f.run).not.toThrow();
 });
 it('preserves economic conditions and kill gates for runtime evaluation',()=>{
   expect(controlled({segments:[{...gain,ifTargetDied:true}]}).run).not.toThrow();
   expect(controlled({segments:[{...gain,ifCond:{kind:'economyAtLeast',currency:'gold',n:999}}]}).run).not.toThrow();
 });
 it('expands choose before its unused probability and condition fields',()=>{
   const choice=Object.assign({kind:'choose' as const,options:[[safe]],labels:['继续']},
     {chance:0,chanceBoost:boost('battleGold'),ifCond:{kind:'economyAtLeast',currency:'gold',n:1}});
   const f=controlled({segments:[choice]});
   expect(f.run).not.toThrow();
 });
 it('honors modifier sourceGroups and sources precedence without blocking unused economy counters',()=>{
   for(const modifier of [
     {mod:{kind:'multiplier' as const,a:1},source:{kind:'battleGold' as const},sources:[{kind:'selfStat' as const,stat:'magic' as const}]},
     {mod:{kind:'multiplier' as const,a:1},source:{kind:'battleGold' as const},sources:[{kind:'battleSouls' as const}],sourceGroups:[[{kind:'selfStat' as const,stat:'magic' as const}]]},
   ])expect(controlled({segments:[{...damage,modifier}]}).run).not.toThrow();
 });
 it.each(['onDeathEconomy','battleEconomyGain','onBigMatchEconomy','onSkullMatchEconomy','turnStartEconomy','onAllyCastEconomy','onDamagedEconomy'] as const)('accepts native %s with its declared values',key=>{
   const code=`test-economy-${key}`;
   const trait={code,name:'原生收益',description:'描述完整且可用',[key]:key==='battleEconomyGain'?{currency:'gold',ratio:.5}:{currency:'souls',amount:3}} as TraitDefinition;
   registerDynamicTraits([trait]);const f=controlled();f.battle.playerTeam[0]!.traitIds=[code];
   const before=JSON.stringify({trait,battle:f.battle});expect(traitEconomyIssues(trait)).toEqual([]);expect(f.run).not.toThrow();expect(JSON.stringify({trait,battle:f.battle})).toBe(before);
 });
 it('checks a PvP-only credit only when that rule is active',()=>{
   const trait:TraitDefinition={code:'test-economy-pvp',name:'竞技收益',description:'收益',pvpEconomyGain:{currency:'gold',amount:3}};
   registerDynamicTraits([trait]);const f=controlled();f.battle.playerTeam[0]!.traitIds=[trait.code];
   expect(traitEconomyIssues(trait)).toEqual([]);expect(f.run).not.toThrow();
   f.battle.mode='pvp';expect(traitEconomyIssues(trait,{mode:'pvp'})).toEqual(['竞技对战战后货币结算']);expect(f.run).toThrow('尚未适配');
 });
 it('ignores metadata and partial descriptions rather than interpreting them as executable effects',()=>{
   const trait:TraitDefinition={code:'test-economy-text',name:'bootyGem',description:'gainEconomy battleGold 尚待核对'};
   registerDynamicTraits([trait]);const f=controlled();f.battle.playerTeam[0]!.traitIds=[trait.code];
   expect(traitEconomyIssues(trait)).toEqual([]);expect(f.run).not.toThrow();
 });
});

describe('ST economy availability: gems and battlefield rules',()=>{
 it.each<EffectSegment>([
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'bootyGem'}},count:{base:1,mult:0}}},
   {kind:'gem',params:{op:'create',gem:{kind:'mixSpecial',specs:[{kind:'angelGem'},{kind:'bootyGem'}]},count:{base:2,mult:0}}},
   {kind:'gem',params:{op:'create',gem:{kind:'mixAny',entries:[BaseColor.Blue,{kind:'bootyGem'}]},count:{base:2,mult:0}}},
   {kind:'gem',params:{op:'transform',from:BaseColor.Blue,to:BaseColor.Red,toSpecial:'bootyGem'}},
   {kind:'gem',params:{op:'transform',from:BaseColor.Blue,to:BaseColor.Red,toSpecial:{kind:'bootyGem',tier:3}}},
 ])('accepts native Booty $params.op effects intact',segment=>{const f=controlled({segments:[segment]}),before=JSON.stringify(segment);expect(f.run).not.toThrow();expect(JSON.stringify(segment)).toBe(before);});
 it('accepts trait-created Booty at zero and positive probability',()=>{
   const trait:TraitDefinition={code:'test-economy-booty',name:'赃物生成',description:'宝石',turnStartCreateSpecialGem:{gem:'bootyGem',count:1,chance:0}};
   registerDynamicTraits([trait]);const f=controlled();f.battle.playerTeam[0]!.traitIds=[trait.code];expect(f.run).not.toThrow();
   trait.turnStartCreateSpecialGem!.chance=1;registerDynamicTraits([trait]);expect(f.run).not.toThrow();
 });
 it.each(['turnStartCreateSpecialGem','turnStartColorToSpecial','battleStartConvertGems','onBigMatchCreateGem'] as const)('prunes zero-chance %s before expanding an economic environment pool',key=>{
   const f=controlled();f.registry.prototypes.set('economic',{segments:[gain]});
   const pool=vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:economy']);
   const resolve=vi.spyOn(catalogue,'resolveAdaptedSummon').mockReturnValue(inline('economic'));
   for(const gem of ['daemonicPortalGem','lycanthropyGem'] as const){
     const spec={gem,count:1,color:BaseColor.Blue,chance:0};
     const trait={code:`test-zero-${key}-${gem}`,name:'概率造宝石',description:'受控环境入口',[key]:spec} as TraitDefinition;
     registerDynamicTraits([trait]);f.battle.playerTeam[0]!.traitIds=[trait.code];
     expect(f.run).not.toThrow();expect(pool).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();
     spec.chance=1;registerDynamicTraits([trait]);expect(f.run).not.toThrow();expect(pool).toHaveBeenCalled();expect(resolve).toHaveBeenCalledWith('unit:economy',expect.anything());
     pool.mockClear();resolve.mockClear();
   }
 });
 it.each(['preset','drops','turnStart'] as const)('accepts native Booty introduced by %s rules without altering them',kind=>{
   const f=controlled();f.battle.rules=kind==='preset'?{board:{preset:[{gem:{kind:'bootyGem'},count:1}]}}:
     kind==='drops'?{board:{specialDrops:{chance:.1,pool:[{gem:{kind:'angelGem'},weight:1},{gem:{kind:'bootyGem'},weight:1}]}}}:
     {turnStart:[{side:'enemy',createGems:[{gem:{kind:'bootyGem'},count:1,chance:1}]}]};
   const before=JSON.stringify(f.battle);expect(f.run).not.toThrow();expect(JSON.stringify(f.battle)).toBe(before);
 });
 it('prunes disabled drop and turn-start dependencies without changing their gem pools',()=>{
   const f=controlled();f.battle.rules={board:{specialDrops:{chance:0,pool:[{gem:{kind:'lycanthropyGem'},weight:1}]}},turnStart:[{side:'enemy',createGems:[{gem:{kind:'daemonicPortalGem'},count:1,chance:0}]}]};
   const pool=vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:missing-rule']);
   const resolve=vi.spyOn(catalogue,'resolveAdaptedSummon').mockReturnValue(null);
   const before=JSON.stringify(f.battle);expect(f.run).not.toThrow();expect(JSON.stringify(f.battle)).toBe(before);
   expect(pool).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();
   f.battle.rules.board!.specialDrops!.chance=1;
   expect(f.run).toThrow('派生来源 unit:missing-rule 尚未登记');
 });
 it('honors zero drop weights and the native last-entry fallback for an all-zero pool',()=>{
   const f=controlled();const pool=[{gem:{kind:'angelGem' as const},weight:1},{gem:{kind:'lycanthropyGem' as const},weight:0}];
   vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:missing-fallback']);
   const resolve=vi.spyOn(catalogue,'resolveAdaptedSummon').mockReturnValue(null);
   f.battle.rules={board:{specialDrops:{chance:.1,pool}}};expect(f.run).not.toThrow();expect(resolve).not.toHaveBeenCalled();
   pool[0]!.weight=0;const before=JSON.stringify(f.battle);
   expect(f.run).toThrow('派生来源 unit:missing-fallback 尚未登记');
   expect(JSON.stringify(f.battle)).toBe(before);expect(pool.map(entry=>entry.weight)).toEqual([0,0]);
 });
});

describe('ST economy availability: full derived closure',()=>{
 it.each(['template','skill','trait'] as const)('rejects an actually missing derived %s atomically without RNG consumption',missing=>{
   const f=controlled({segments:[{kind:'summon',params:{source:{ref:'unit:missing'}}}]});
   const template=inline(missing==='skill'?'missing-skill':'idle',missing==='trait'?['test-actually-missing-trait']:undefined);
   vi.spyOn(catalogue,'resolveAdaptedSummon').mockReturnValue(missing==='template'?null:template);
   const before=JSON.stringify({battle:f.battle,prototypes:[...f.registry.prototypes],template});
   const next=vi.spyOn(SeededRNG.prototype,'next');
   expect(errorOf(f.run)).toMatch(missing==='template'?/派生来源 unit:missing 尚未登记/:missing==='skill'?/派生主动 missing-skill 尚未登记/:/派生特质 test-actually-missing-trait 尚未登记/);
   expect(JSON.stringify({battle:f.battle,prototypes:[...f.registry.prototypes],template})).toBe(before);
   expect(next).not.toHaveBeenCalled();
 });
 it('continues checking a missing dependency after an ordinary economic segment',()=>{
   const f=controlled({segments:[gain,{kind:'summon',params:{source:{template:inline('missing-after-income')}}}]});
   expect(f.run).toThrow('派生主动 missing-after-income 尚未登记');
 });
 it('applies the PvP-only payout boundary to derived traits while accepting ordinary mode',()=>{
   const code='test-derived-pvp-income';
   registerDynamicTraits([{code,name:'派生竞技收益',description:'竞技收益',pvpEconomyGain:{currency:'gold',amount:3}}]);
   const f=controlled({segments:[gain,{kind:'summon',params:{source:{template:inline('idle',[code])}}}]});
   const before=JSON.stringify(f.battle);expect(f.run).not.toThrow();expect(JSON.stringify(f.battle)).toBe(before);
   f.battle.mode='pvp';expect(f.run).toThrow(/召唤.*特质「派生竞技收益」.*竞技对战.*货币/);
 });
 it.each(['summon','randomSummon','kingdom','transform','inline'] as const)('accepts a reachable native economic candidate through %s intact',kind=>{
   const f=controlled();f.registry.prototypes.set('economic',{segments:[gain]});
   const economic=inline('economic');const refs=['unit:safe','unit:economy'];
   const resolve=vi.spyOn(catalogue,'resolveAdaptedSummon').mockImplementation(ref=>ref==='unit:economy'?economic:inline('idle'));
   const pool=vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(refs);
   const segment:EffectSegment=kind==='transform'?{kind:'transformTroop',target:'enemyAll',randomOf:refs}:
     kind==='inline'?{kind:'summon',params:{source:{template:economic}}}:
     {kind:'summon',params:{source:kind==='summon'?{ref:'unit:economy'}:kind==='randomSummon'?{randomOf:refs}:{randomOfKingdom:100001}}};
   f.registry.prototypes.set('root',{segments:[segment]});const before=JSON.stringify({refs,segment});
   expect(f.run).not.toThrow();expect(JSON.stringify({refs,segment})).toBe(before);
   if(kind==='kingdom')expect(pool).toHaveBeenCalledWith(100001);
   if(kind!=='inline')expect(resolve).toHaveBeenCalledWith('unit:economy',expect.anything());
 });
 it.each(['summonCopy','transformCopy'] as const)('follows a %s into a new scaling context and its economic descendants',kind=>{
   const f=controlled();f.battle.playerTeam[0]!.battleScaling={level:7,difficulty:1};f.battle.enemyTeam[0]!.battleScaling={level:91,difficulty:1};
   const copy:EffectSegment=kind==='summonCopy'?{kind:'summonCopy',target:'enemyChosen'}:{kind:'transformTroop',target:'allySelf',copyOf:'enemyChosen'};
   f.registry.prototypes.set('root',{segments:[copy]});
   f.registry.prototypes.set('idle',{segments:[{kind:'transformTroop',target:'enemyAll',ref:'unit:context'}]});
   f.registry.prototypes.set('economic',{segments:[gain]});
   const resolve=vi.spyOn(catalogue,'resolveAdaptedSummon').mockImplementation((_ref,source)=>inline(source&&'level'in source&&source.level===91?'economic':'safe'));
   f.registry.prototypes.set('safe',{segments:[safe]});expect(f.run).not.toThrow();
   expect(resolve).toHaveBeenCalledWith('unit:context',{level:91,difficulty:1});
 });
 it('retains a derived native economy trait with a harmless active',()=>{
   registerDynamicTraits([{code:'test-economy-child',name:'派生收益',description:'部分说明',onAllyCastEconomy:{currency:'souls',amount:3}}]);
   const f=controlled({segments:[{kind:'summon',params:{source:{template:inline('idle',['test-economy-child'])}}}]});
   expect(f.run).not.toThrow();expect(getTrait('test-economy-child')!.onAllyCastEconomy).toEqual({currency:'souls',amount:3});
 });
 it.each(['portal','lycanthropy'] as const)('accepts native economy candidates in the %s environmental pool without narrowing it',kind=>{
   const f=controlled();f.registry.prototypes.set('economic',{segments:[gain]});
   const refs=['unit:safe','unit:economy'];vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(refs);
   vi.spyOn(catalogue,'resolveAdaptedSummon').mockImplementation(ref=>inline(ref==='unit:economy'?'economic':'idle'));
   f.battle.rules={board:{preset:[{gem:{kind:kind==='portal'?'daemonicPortalGem':'lycanthropyGem'},count:1}]}};
   expect(f.run).not.toThrow();expect(refs).toEqual(['unit:safe','unit:economy']);
 });
 it('leaves a zero-chance economic child unresolved and consumes no randomness',()=>{
   const f=controlled({segments:[damage,{kind:'summon',params:{source:{ref:'unit:economy'}},chance:0}]});
   const resolve=vi.spyOn(catalogue,'resolveAdaptedSummon');const next=vi.spyOn(SeededRNG.prototype,'next');
   expect(f.run).not.toThrow();expect(resolve).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
 });
});

const realRegistry=new ExtensionRegistry();
beforeAll(()=>{catalogue.registerStSkillLibrary(realRegistry.prototypes);catalogue.registerAdaptedCatalog(realRegistry);});
function realRequest():BattleRequest {
 const battle=request();battle.playerTeam[0]!.skillId='gw_KnightsSword';battle.enemyTeam[0]!.skillId='gw_KnightsSword';return battle;
}
describe('ST economy availability: real catalogue and weapon bypasses',()=>{
 it.each(['st:7037','7037'])('prepares the original soul-generating active %s intact',skillId=>{
   const prototype=realRegistry.prototypes.get(skillId)!;
   expect(prototype.segments).toContainEqual({kind:'gainEconomy',currency:'souls',scaling:{base:1,mult:1}});
   const battle=realRequest();battle.playerTeam[0]!.skillId=skillId;
   const before=JSON.stringify({battle,prototype});expect(prepareStBattle(battle).registry.prototypes.get(skillId)).toEqual(prototype);expect(JSON.stringify({battle,prototype})).toBe(before);
 });
 it.each(['st:soulverdict','soulverdict','st:goldenhoard','goldenhoard'])('prepares the original %s economy trait with its native values',id=>{
   const trait=getTrait(id)!;expect(trait).toBeDefined();
   expect(trait.onAllyCastEconomy??trait.turnStartEconomy).toEqual(id.includes('soulverdict')?{currency:'souls',amount:3}:{currency:'gold',amount:5});
   const battle=realRequest();battle.enemyTeam[0]!.traitIds=[id];
   expect(()=>prepareStBattle(battle)).not.toThrow();
 });
 it.each(['gw_SkeletonKey','gw_BronzelockPistol','gw_TheRubyMacaque','gw_Lodestar'])('prepares the real native economy weapon %s intact',skillId=>{
   const battle=realRequest();battle.playerTeam[0]!.skillId=skillId;
   expect(realRegistry.prototypes.has(skillId)).toBe(true);
   const prototype=realRegistry.prototypes.get(skillId)!,before=JSON.stringify({prototype,battle});
   expect(prepareStBattle(battle).registry.prototypes.get(skillId)).toEqual(prototype);
   expect(JSON.stringify({prototype,battle})).toBe(before);
 });
 it('keeps legal native weapons playable and retains all registered abilities and random pools',()=>{
   const battle=realRequest();battle.playerTeam[0]!.skillId='gw_Mang';const before=realRegistry.prototypes.size;
   const beasts=catalogue.adaptedSummonPool('Beast');const daemons=catalogue.adaptedSummonPool('Daemon');
   expect(()=>prepareStBattle(battle)).not.toThrow();expect(realRegistry.prototypes.size).toBe(before);
   expect(catalogue.adaptedSummonPool('Beast')).toEqual(beasts);expect(catalogue.adaptedSummonPool('Daemon')).toEqual(daemons);
   expect(realRegistry.prototypes.has('st:7037')).toBe(true);
 });
 it('retains all 1821 ordinary catalogue entries and their complete derived dependencies',()=>{
   for(const troop of TROOPS){
     const form=catalogue.resolveAdaptedSummon(`unit:${troop.id}`)!;const battle=realRequest();
     battle.enemyTeam[0]={...battle.enemyTeam[0]!,skillId:form.skillId,traitIds:form.traitIds,battleScaling:form.battleScaling};
     const prototype=realRegistry.prototypes.get(form.skillId!)!,before=JSON.stringify({form,prototype,battle});
     expect(prototypeEconomyIssues(prototype),`troop ${troop.id}`).toEqual([]);
     for(const id of form.traitIds??[])expect(traitEconomyIssues(getTrait(id)!),`troop ${troop.id} trait ${id}`).toEqual([]);
     expect(()=>validateStDerivedForms(battle,realRegistry),`troop ${troop.id}`).not.toThrow();
     expect(JSON.stringify({form,prototype,battle})).toBe(before);
   }
   expect(TROOPS).toHaveLength(1821);
 });
});


function traitRuntimeActors(code:string):[Character,Character] {
 const make=(id:number,traitIds:string[]=[]):Character=>({id,...inline('gw_KnightsSword',traitIds),statuses:[],defeated:false});
 const holder=make(0,[code]),foe=make(1);attachPassives(holder);attachPassives(foe);return [holder,foe];
}
function bigMatchStatuses(code:string):string[] {
 return Array.from({length:100},(_,seed)=>{
   const [holder,foe]=traitRuntimeActors(code);
   return applyBigMatchTriggers([holder],{size:4,enemyTeam:[foe],rng:new SeededRNG(seed+1),applyStatus})
     .flatMap(event=>event.type==='status-apply'?[event.statusId]:[]);
 }).flat();
}
function traitRequest(trait:TraitDefinition):BattleRequest {
 registerDynamicTraits([trait]);const battle=realRequest();battle.playerTeam[0]!.traitIds=[trait.code];return battle;
}
describe('ST economy availability: runtime status pools and trait probability gates',()=>{
 it('allows the actual elementalforce fixed pool: 100 seeds apply 200 statuses and never reach economic Beast 6118',()=>{
   const trait=PERK_DYNAMIC_DEFS.find(def=>def.code==='elementalforce')!;
   const battle=traitRequest(trait),statuses=bigMatchStatuses(trait.code);
   expect(statuses).toHaveLength(200);
   expect([...new Set(statuses)].sort()).toEqual(['burning','entangle','frozen','stun']);
   expect(catalogue.adaptedSummonPool('Beast')).toContain('unit:6118');
   const economicBeast=catalogue.resolveAdaptedSummon('unit:6118')!;
   expect(economicBeast.traitIds!.some(id=>getTrait(id)?.battleEconomyGain!==undefined)).toBe(true);
   expect(traitEconomyIssues(trait)).toEqual([]);
   const pool=vi.spyOn(catalogue,'adaptedSummonPool');
   expect(()=>prepareStBattle(battle)).not.toThrow();expect(pool).not.toHaveBeenCalled();
 });
 it.each([{randomNegative:true},{randomMissingStatusCount:2}])('uses the declared fixed statuses for %j without assuming a global negative pool',mode=>{
   const trait:TraitDefinition={code:`test-fixed-negative-${Object.keys(mode)[0]}`,name:'固定负面池',description:'固定池',
     onBigMatchStatus:{scope:'randomEnemy',statuses:[{id:'stun'},{id:'frozen'}],turns:3,...mode}};
   const battle=traitRequest(trait),statuses=bigMatchStatuses(trait.code);
   expect(statuses).toHaveLength('randomNegative'in mode?100:200);
   expect([...new Set(statuses)].sort()).toEqual(['frozen','stun']);
   expect(()=>prepareStBattle(battle)).not.toThrow();
   trait.onBigMatchStatus!.statuses=[...trait.onBigMatchStatus!.statuses,{id:'lycanthropy'}];registerDynamicTraits([trait]);
   expect(bigMatchStatuses(trait.code)).toContain('lycanthropy');
   expect(()=>prepareStBattle(battle)).not.toThrow();
 });
 it('retains the actual experiment negative pool containing lycanthropy and its economic derived closure',()=>{
   const trait=getTrait('experiment')!;
   expect(trait.onBigMatchStatus!.statuses.map(status=>status.id)).toEqual([...RANDOM_NEGATIVE_STATUS_POOL]);
   const statuses=bigMatchStatuses(trait.code);expect(statuses).toContain('lycanthropy');
   const battle=realRequest();battle.playerTeam[0]!.traitIds=[trait.code];
   expect(()=>prepareStBattle(battle)).not.toThrow();
 });
 it.each(['self','randomAlly','allAllies','allEnemies','randomEnemy','firstEnemy'] as const)('matches the actual onBigMatchStatus zero-chance gate for %s',scope=>{
   const trait:TraitDefinition={code:`test-zero-wolf-${scope}`,name:'零概率狼化',description:'概率状态',
     onBigMatchStatus:{scope,statuses:[{id:'lycanthropy'}],turns:3,chance:0}};
   const battle=traitRequest(trait);expect(bigMatchStatuses(trait.code)).toEqual([]);
   const pool=vi.spyOn(catalogue,'adaptedSummonPool');
   expect(()=>prepareStBattle(battle)).not.toThrow();expect(pool).not.toHaveBeenCalled();
   trait.onBigMatchStatus!.chance=1;registerDynamicTraits([trait]);
   expect(bigMatchStatuses(trait.code)).toHaveLength(100);
   expect(()=>prepareStBattle(battle)).not.toThrow();expect(pool).toHaveBeenCalledWith('Beast');
 });
 it('matches per-status independent zero probability on the actual randomEnemy branch',()=>{
   const trait:TraitDefinition={code:'test-independent-zero-wolf',name:'独立概率狼化',description:'概率状态',
     onBigMatchStatus:{scope:'randomEnemy',statuses:[{id:'lycanthropy'}],turns:3,chance:0,independentChance:true}};
   const battle=traitRequest(trait);expect(bigMatchStatuses(trait.code)).toEqual([]);
   expect(()=>prepareStBattle(battle)).not.toThrow();
   trait.onBigMatchStatus!.chance=1;registerDynamicTraits([trait]);
   expect(bigMatchStatuses(trait.code)).toHaveLength(100);expect(()=>prepareStBattle(battle)).not.toThrow();
 });
 it('keeps independentChance conservative outside the runtime randomEnemy probability branch',()=>{
   const trait:TraitDefinition={code:'test-independent-self-wolf',name:'独立概率自身狼化',description:'运行边界',
     onBigMatchStatus:{scope:'self',statuses:[{id:'lycanthropy'}],turns:3,chance:0,independentChance:true}};
   const battle=traitRequest(trait);expect(bigMatchStatuses(trait.code)).toHaveLength(100);
   expect(()=>prepareStBattle(battle)).not.toThrow();
 });
 it.each(['randomEnemy','randomAlly'] as const)('retains the runtime global status pool for onAllyCastRandomStatus %s',scope=>{
   const trait:TraitDefinition={code:`test-cast-pool-${scope}`,name:'施法随机状态',description:'全局池',onAllyCastRandomStatus:{scope}};
   const battle=traitRequest(trait);
   const statuses=Array.from({length:100},(_,seed)=>{
     const [holder,foe]=traitRuntimeActors(trait.code);
     return applyCastRandomStatusTriggers([holder],[foe],{rng:new SeededRNG(seed+1),applyStatus,
       poolOf:side=>side==='randomEnemy'?RANDOM_NEGATIVE_STATUS_POOL:RANDOM_POSITIVE_STATUS_POOL})
       .flatMap(event=>event.type==='status-apply'?[event.statusId]:[]);
   }).flat();
   expect(statuses).toHaveLength(100);
   if(scope==='randomEnemy'){
     expect(statuses).toContain('lycanthropy');expect(()=>prepareStBattle(battle)).not.toThrow();
   }else{
     expect(statuses).not.toContain('lycanthropy');expect(()=>prepareStBattle(battle)).not.toThrow();
   }
 });
});
