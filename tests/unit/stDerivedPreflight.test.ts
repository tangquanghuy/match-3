import {afterEach,describe,expect,it,vi} from 'vitest';
import * as catalogue from '../../src/sillytavern/enemyBlueprint';
import {validateStDerivedForms} from '../../src/sillytavern/derivedFormPreflight';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {ExtensionRegistry} from '../../src/engine/registry';
import {registerDynamicTraits} from '../../src/engine/traits';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {executePrototype} from '../../src/engine/skills/prototypes';
import type {EffectContext} from '../../src/engine/skills/effects/context';
import type {Condition} from '../../src/engine/skills/effects/secondary';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import type {SkillPrototype,EffectSegment,SummonSegment} from '../../src/engine/skills/prototypes';
import type {SummonTemplate} from '../../src/engine/skills/effects/summon';
import type {TraitDefinition} from '../../src/engine/traits';

const passive:SkillPrototype={segments:[{kind:'buff',target:'allySelf',stat:'attack',scaling:{base:1,mult:0}}]};
const summon=(ref:string):SummonSegment=>({kind:'summon',params:{source:{ref}}});
const actor=(externalId:string,level:number,skillId:string):CombatantSnapshot=>({externalId,name:externalId,battleScaling:{level,difficulty:1},stats:{hp:100,attack:10,armor:10,magic:10},manaCost:3,manaColors:[BaseColor.Blue],skillId});
function fixture(player=actor('hero',7,'root'),enemy=actor('enemy',91,'idle')){
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'preflight',requestId:'preflight-request',seed:67,playerTeam:[player],enemyTeam:[enemy]};
 const registry=new ExtensionRegistry();registry.prototypes.set('idle',passive);
 const forms=new Map<string,{skillId:string;traitIds?:string[]}>();
 const resolver=vi.spyOn(catalogue,'resolveAdaptedSummon').mockImplementation((ref,source)=>{
   const form=forms.get(ref);if(!form)return null;
   const scaling=source&&'level' in source?source:source?.battleScaling??{level:20,difficulty:1};
   return {name:ref,maxHp:10,hp:10,attack:1,armor:0,magic:1,colors:[BaseColor.Blue],manaCost:3,mana:0,battleScaling:{...scaling},...form} satisfies SummonTemplate;
 });
 return {request,registry,forms,resolver,run:()=>validateStDerivedForms(request,registry)};
}
function executeControlled(prototype:SkillPrototype){
 const character=(id:number):Character=>({id,name:`C${id}`,maxHp:100,hp:100,attack:10,armor:0,magic:10,colors:[BaseColor.Blue],manaCost:3,mana:0,skillId:'idle',statuses:[],defeated:false});
 const state=createGameState(new BoardModel(),{player:PlayerSide.Left,characters:[character(0)]},{player:PlayerSide.Right,characters:[character(1)]});
 const resolveSummonRef=vi.fn(()=>null);
 const ctx:EffectContext={state,casterId:0,rng:new SeededRNG(67),nextGemId:()=>0,resolveSummonRef};
 const events=executePrototype(prototype,ctx);
 return {state,events,resolveSummonRef};
}
afterEach(()=>vi.restoreAllMocks());

describe('ST derived-form preflight (controlled closure boundaries)',()=>{
 it.each([0,-0.25])('prunes an unboosted chance %s summon after damage without changing the ticket or prototype',chance=>{
   const f=fixture();
   const prototype:SkillPrototype={segments:[{kind:'damage',target:'enemyFront',scaling:{base:5,mult:0}},{...summon('unit:missing'),chance}]};
   f.registry.prototypes.set('root',prototype);
   const runtime=executeControlled(prototype);
   expect(runtime.events.filter(event=>event.type==='skill-damage')).toEqual([expect.objectContaining({damage:5})]);
   expect(runtime.state.teams[PlayerSide.Right].characters[0]!.hp).toBe(95);
   expect(runtime.resolveSummonRef).not.toHaveBeenCalled();
   const before=JSON.stringify({request:f.request,prototype});
   const next=vi.spyOn(SeededRNG.prototype,'next');
   expect(f.run).not.toThrow();expect(f.resolver).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
   expect(JSON.stringify({request:f.request,prototype})).toBe(before);
 });
 it.each([undefined,0,-0.25])('keeps a chance %s summon reachable when it has a dynamic chanceBoost',chance=>{
   const f=fixture();
   const prototype:SkillPrototype={segments:[{...summon('unit:missing'),chance,chanceBoost:{mod:{kind:'multiplier',a:100},source:{kind:'selfStat',stat:'attack'}}}]};
   f.registry.prototypes.set('root',prototype);
   // Attack 10 supplies +1000 percentage points: all three bases clamp to probability 1.
   expect(executeControlled(prototype).resolveSummonRef).toHaveBeenCalledWith('unit:missing',expect.anything());
   expect(f.run).toThrow(/unit:missing.*\u7b49\u7ea7 7/);
 });
 it('keeps a dynamic boost conservative even when the controlled board currently supplies zero',()=>{
   const f=fixture();
   const prototype:SkillPrototype={segments:[{...summon('unit:missing'),chance:0,chanceBoost:{mod:{kind:'multiplier',a:1},source:{kind:'boardGems',color:BaseColor.Blue}}}]};
   f.registry.prototypes.set('root',prototype);
   expect(executeControlled(prototype).resolveSummonRef).not.toHaveBeenCalled();
   expect(f.run).toThrow('unit:missing');
 });
 it.each([undefined,0.000001,1])('still checks an unboosted chance %s summon that may execute',chance=>{
   const f=fixture();
   const prototype:SkillPrototype={segments:[{...summon('unit:missing'),chance}]};
   f.registry.prototypes.set('root',prototype);
   if(chance===undefined||chance===1)expect(executeControlled(prototype).resolveSummonRef).toHaveBeenCalled();
   expect(f.run).toThrow('unit:missing');
 });
 it('prunes an entire zero-probability oneOf subtree, including inline forms and environmental dependencies',()=>{
   const f=fixture();
   const pool=vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:missing']);
   const prototype:SkillPrototype={segments:[{kind:'oneOf',chance:0,options:[
     [summon('unit:missing')],
     [{kind:'transformTroop',target:'enemyAll',ref:'unit:missing'}],
     [{kind:'summon',params:{source:{template:{name:'inline',maxHp:10,hp:10,attack:1,armor:0,magic:1,colors:[BaseColor.Blue],manaCost:3,mana:0,skillId:'missing-inline-active'}}}}],
     [{kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'daemonicPortalGem'}},count:{base:1,mult:0}}}],
     [{kind:'status',target:'enemyAll',statusId:'lycanthropy',turns:1}],
   ]}]};
   f.registry.prototypes.set('root',prototype);
   expect(executeControlled(prototype).events).toEqual([]);
   expect(f.run).not.toThrow();expect(f.resolver).not.toHaveBeenCalled();expect(pool).not.toHaveBeenCalled();
 });
 it.each(['oneOf','choose'] as const)('prunes dead children inside %s while checking every reachable sibling',kind=>{
   const f=fixture();f.forms.set('unit:live',{skillId:'idle'});
   const options:EffectSegment[][]=[[{...summon('unit:dead'),chance:0}],[summon('unit:live')],[summon('unit:missing')]];
   const branch:EffectSegment=kind==='choose'?{kind,labels:['dead','live','missing'],options}:{kind,options};
   const prototype:SkillPrototype={segments:[kind==='choose'?branch:{kind:'oneOf',options:[[branch]]}]};
   f.registry.prototypes.set('root',prototype);
   expect(f.run).toThrow('unit:missing');
   expect(f.resolver.mock.calls.map(([ref])=>ref)).toEqual(['unit:live','unit:missing']);
 });
 it.each<Condition>([
   {kind:'targetRace',race:'Daemon'},
   {kind:'not',cond:{kind:'targetStatus',statusId:'burn'}},
   {kind:'anyOf',of:[{kind:'targetHpDamaged'},{kind:'selfHpDamaged'}]},
   {kind:'allOf',of:[{kind:'targetColor',color:BaseColor.Blue}]},
 ])('prunes target-relative condition $kind on a segment with no target',ifCond=>{
   const f=fixture();
   const prototype:SkillPrototype={segments:[{kind:'oneOf',ifCond,options:[[summon('unit:missing')]]},{...summon('unit:missing'),ifCond}]};
   f.registry.prototypes.set('root',prototype);
   expect(executeControlled(prototype).events).toEqual([]);
   expect(f.run).not.toThrow();expect(f.resolver).not.toHaveBeenCalled();
 });
 it.each<{name:string;segment:EffectSegment}>([
   {name:'caster health',segment:{...summon('unit:missing'),ifCond:{kind:'selfHpDamaged'}}},
   {name:'previous target death',segment:{...summon('unit:missing'),ifTargetDied:true}},
   {name:'target race',segment:{kind:'transformTroop',target:'enemyFront',ref:'unit:missing',ifCond:{kind:'targetRace',race:'Daemon'}}},
   {name:'zero summon count',segment:{kind:'summon',params:{source:{ref:'unit:missing'},countRange:{min:0,max:0}}}},
 ])('retains dependency checks for $name',({segment})=>{
   const f=fixture();f.registry.prototypes.set('root',{segments:[segment]});
   // summonEffect resolves its template before checking countRange, even when count is zero.
   if(segment.kind==='summon'&&segment.params.countRange)
     expect(executeControlled({segments:[segment]}).resolveSummonRef).toHaveBeenCalledWith('unit:missing',expect.anything());
   expect(f.run).toThrow('unit:missing');
 });
 it('walks nested branches and terminates cycles while preserving the missing-source path',()=>{
   const f=fixture();f.forms.set('unit:a',{skillId:'cycle'});f.forms.set('unit:b',{skillId:'cycle'});
   f.registry.prototypes.set('root',{segments:[summon('unit:a')]});
   f.registry.prototypes.set('cycle',{segments:[{kind:'oneOf',options:[[summon('unit:b')],[summon('unit:missing')]]}]});
   expect(f.run).toThrow(/hero.*unit:missing.*等级 7/);
   expect(f.resolver.mock.calls.filter(([ref])=>ref==='unit:a')).toHaveLength(1);
 });
 it('keeps self transformation local while checking an opponent transformation at target scaling',()=>{
   const f=fixture();f.forms.set('unit:form',{skillId:'idle'});
   f.registry.prototypes.set('root',{segments:[{kind:'transformTroop',target:'allySelf',ref:'unit:form'}]});
   f.run();expect(f.resolver.mock.calls.map(([,s])=>s)).toEqual([{level:7,difficulty:1}]);
   f.resolver.mockClear();f.registry.prototypes.set('root',{segments:[{kind:'transformTroop',target:'enemyAll',ref:'unit:form'}]});
   f.run();expect(f.resolver.mock.calls.map(([,s])=>s)).toEqual([{level:91,difficulty:1}]);
 });
 it('rechecks target rules when a copied opposing form brings a new level to the party',()=>{
   const f=fixture();f.forms.set('unit:form',{skillId:'idle'});
   f.registry.prototypes.set('root',{segments:[{kind:'transformTroop',target:'allyAll',ref:'unit:form'},{kind:'summonCopy',target:'enemyChosen'}]});
   f.run();expect(f.resolver.mock.calls.map(([,s])=>s)).toEqual([{level:7,difficulty:1},{level:91,difficulty:1}]);
 });
 it('follows copied active abilities and their child summons instead of assuming copies add no dependencies',()=>{
   const f=fixture();f.forms.set('unit:child',{skillId:'idle'});
   f.registry.prototypes.set('root',{segments:[{kind:'transformTroop',target:'allySelf',copyOf:'enemyChosen'}]});
   f.registry.prototypes.set('idle',{segments:[summon('unit:child')]});
   expect(f.run).not.toThrow();expect(f.resolver).toHaveBeenCalledWith('unit:child',{level:91,difficulty:1});
 });
 it('checks the entire weighted and kingdom pools, including their final candidate',()=>{
   const f=fixture();f.forms.set('unit:first',{skillId:'idle'});
   vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:first','unit:last']);
   f.registry.prototypes.set('root',{segments:[{kind:'summon',params:{source:{randomOfKingdom:100001}}}]});
   expect(f.run).toThrow('unit:last');
   f.registry.prototypes.set('root',{segments:[{kind:'summon',params:{source:{randomOf:['unit:first','unit:first','unit:last']}}}]});
   expect(f.run).toThrow('unit:last');
 });
 it.each(['summonOnDeath','summonOnAllyDeath','summonOnEnemyDeath','summonOnDamaged','summonOnAllyCast','turnStartSummon','onBigMatchSummon'] as const)('checks %s at holder scaling',key=>{
   const f=fixture();f.registry.prototypes.set('root',passive);
   const code=`test-preflight-${key}`;registerDynamicTraits([{code,name:key,description:key,[key]:{chance:1,referenceName:'unit:missing',displayName:'missing',troopId:-1}} as TraitDefinition]);
   f.request.playerTeam[0]!.traitIds=[code];expect(f.run).toThrow(/unit:missing.*等级 7/);
 });
 it('ignores non-character storm summons and disabled summon traits',()=>{
   const f=fixture();f.registry.prototypes.set('root',passive);
   registerDynamicTraits([{code:'test-preflight-storm',name:'storm',description:'storm',summonOnDeath:{chance:0,referenceName:'unit:missing',displayName:'missing',troopId:-1},summonOnEnemyDeath:{chance:1,referenceName:'unit:storm',displayName:'storm',troopId:-1,storm:{kind:'color',color:BaseColor.Blue}}} as unknown as TraitDefinition]);
   f.request.playerTeam[0]!.traitIds=['test-preflight-storm'];expect(f.run).not.toThrow();expect(f.resolver).not.toHaveBeenCalled();
 });
 it('checks board-created Daemons and delayed transformations without consuming RNG or changing the ticket',()=>{
   const f=fixture();f.registry.prototypes.set('root',passive);f.forms.set('unit:environment',{skillId:'idle'});
   const pool=vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:environment']);
   f.request.rules={board:{preset:[{gem:{kind:'daemonicPortalGem'},count:1},{gem:{kind:'lycanthropyGem'},count:1}]}};
   const before=JSON.stringify(f.request);f.run();expect(pool).toHaveBeenCalledWith('Daemon');expect(pool).toHaveBeenCalledWith('Beast');
   expect(f.resolver).toHaveBeenCalledWith('unit:environment',{level:7,difficulty:1});expect(f.resolver).toHaveBeenCalledWith('unit:environment',{level:91,difficulty:1});
   expect(JSON.stringify(f.request)).toBe(before);
 });
 it('checks every portal Daemon at both initial-team averages, including unscaled participants',()=>{
   const f=fixture();f.registry.prototypes.set('root',passive);
   const peer=actor('peer',10,'idle');peer.battleScaling!.difficulty=2;
   const unscaled=actor('unscaled',1,'idle');delete unscaled.battleScaling;
   f.request.playerTeam.push(peer,unscaled);
   const opponent=actor('opponent',88,'idle');opponent.battleScaling!.difficulty=3;
   f.request.enemyTeam.push(opponent);
   for(const ref of ['unit:daemon:first','unit:daemon:last'])f.forms.set(ref,{skillId:'idle'});
   vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:daemon:first','unit:daemon:last']);
   f.request.rules={board:{preset:[{gem:{kind:'daemonicPortalGem'},count:1}]}};
   const before=JSON.stringify(f.request);const next=vi.spyOn(SeededRNG.prototype,'next');
   expect(f.run).not.toThrow();
   // ceil((7 + 10 + 20) / 3) = 13; ceil((91 + 88) / 2) = 90: neither is a participant level.
   expect(f.resolver.mock.calls).toEqual([
     ['unit:daemon:first',{level:13,difficulty:4/3}],['unit:daemon:last',{level:13,difficulty:4/3}],
     ['unit:daemon:first',{level:90,difficulty:2}],['unit:daemon:last',{level:90,difficulty:2}],
   ]);
   expect(next).not.toHaveBeenCalled();expect(JSON.stringify(f.request)).toBe(before);
 });
 it('rejects a Daemon available at individual levels but missing at the frozen average',()=>{
   const f=fixture();f.registry.prototypes.set('root',passive);
   f.request.playerTeam.push(actor('peer',10,'idle'));
   for(const ref of ['unit:daemon:first','unit:daemon:last'])f.forms.set(ref,{skillId:'idle'});
   vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:daemon:first','unit:daemon:last']);
   const resolve=f.resolver.getMockImplementation()!;
   f.resolver.mockImplementation((ref,source)=>ref==='unit:daemon:last'&&source&&'level'in source&&source.level===9?null:resolve(ref,source));
   f.request.rules={board:{preset:[{gem:{kind:'daemonicPortalGem'},count:1}]}};
   expect(f.run).toThrow(/unit:daemon:last.*\u7b49\u7ea7 9/);
 });
 it('follows a portal Daemon active and its children at the frozen average',()=>{
   const f=fixture();f.registry.prototypes.set('root',passive);
   f.request.playerTeam.push(actor('peer',10,'idle'));
   f.forms.set('unit:daemon',{skillId:'portal-active'});f.forms.set('unit:child',{skillId:'idle'});
   f.registry.prototypes.set('portal-active',{segments:[summon('unit:child')]});
   vi.spyOn(catalogue,'adaptedSummonPool').mockReturnValue(['unit:daemon']);
   f.request.rules={board:{preset:[{gem:{kind:'daemonicPortalGem'},count:1}]}};
   expect(f.run).not.toThrow();
   expect(f.resolver.mock.calls).toEqual([
     ['unit:daemon',{level:9,difficulty:1}],['unit:daemon',{level:91,difficulty:1}],
     ['unit:child',{level:9,difficulty:1}],['unit:child',{level:91,difficulty:1}],
   ]);
 });
 it('keeps portal averages frozen after opposing copies while lycanthropy follows new target contexts',()=>{
   const f=fixture();f.registry.prototypes.set('root',{segments:[{kind:'status',target:'allyAll',statusId:'lycanthropy',turns:1},{kind:'summonCopy',target:'enemyAll'}]});
   f.request.playerTeam.push(actor('peer',10,'idle'));
   const opponent=actor('opponent',88,'idle');opponent.battleScaling!.difficulty=3;
   f.request.enemyTeam.push(opponent);
   f.forms.set('unit:daemon',{skillId:'idle'});f.forms.set('unit:beast',{skillId:'idle'});
   vi.spyOn(catalogue,'adaptedSummonPool').mockImplementation(kind=>kind==='Daemon'?['unit:daemon']:['unit:beast']);
   f.request.rules={board:{preset:[{gem:{kind:'daemonicPortalGem'},count:1}]}};
   expect(f.run).not.toThrow();
   expect(f.resolver.mock.calls.filter(([ref])=>ref==='unit:daemon')).toEqual([
     ['unit:daemon',{level:9,difficulty:1}],['unit:daemon',{level:90,difficulty:2}],
   ]);
   expect(f.resolver).toHaveBeenCalledWith('unit:beast',{level:91,difficulty:1});
   expect(f.resolver).toHaveBeenCalledWith('unit:beast',{level:88,difficulty:3});
   expect(f.resolver).toHaveBeenCalledWith('unit:beast',{level:9,difficulty:1});
   expect(f.resolver).toHaveBeenCalledWith('unit:beast',{level:90,difficulty:2});
 });
 it('does not treat a status immunity as a transformation producer',()=>{
   const f=fixture();f.registry.prototypes.set('root',passive);
   registerDynamicTraits([{code:'test-preflight-immunity',name:'immune',description:'immune',statusImmunities:['lycanthropy']}]);
   f.request.playerTeam[0]!.traitIds=['test-preflight-immunity'];expect(f.run).not.toThrow();expect(f.resolver).not.toHaveBeenCalled();
 });
 it('adds owner and child details to resolver stat errors before the runtime is constructed',()=>{
   const f=fixture();f.registry.prototypes.set('root',{segments:[summon('unit:oversized')]});
   f.resolver.mockImplementation(()=>{throw new Error('护甲 1000 超出当前规则范围 0–999');});
   expect(f.run).toThrow(/hero.*unit:oversized.*等级 7.*护甲 1000.*开战前/);
 });
 it('uses real ST registry preparation to reject a registered custom skill with a missing child',()=>{
   vi.restoreAllMocks();const f=fixture();vi.restoreAllMocks();
   // Existing dynamic traits are a supported extension point; the child is deliberately absent.
   registerDynamicTraits([{code:'test-preflight-runtime',name:'runtime',description:'runtime',summonOnDeath:{chance:1,troopId:-1,referenceName:'unit:missing',displayName:'missing'}}]);
   f.request.playerTeam[0]!.skillId='gw_KnightsSword';f.request.enemyTeam[0]!.skillId='gw_KnightsSword';f.request.playerTeam[0]!.traitIds=['test-preflight-runtime'];
   expect(()=>prepareStBattle(f.request)).toThrow('unit:missing');
 });
});
