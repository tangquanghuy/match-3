import {describe,expect,it} from 'vitest';
import {TROOPS} from '../../src/data/troops';
import {ExtensionRegistry} from '../../src/engine/registry';
import {applyColorMatchTriggers,applyPositionAuras,applyTurnStartPassives,attachPassives,getTrait,registerDynamicTraits} from '../../src/engine/traits';
import {ManaDistributor} from '../../src/engine/ManaDistributor';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {TurnEngine} from '../../src/engine/TurnEngine';
import type {TraitDefinition} from '../../src/engine/traits';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import type {Character,Team} from '../../src/engine/types';
import {adaptedTrait,adaptedTraitDescription,compileEnemyBlueprint,registerAdaptedCatalog} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';
import {describeAdaptedTrait} from '../../src/sillytavern/traitDescription';

const trait=(effects:Partial<TraitDefinition>):TraitDefinition=>({code:'fixture',name:'叙事名称',description:'来源故事文字不应充当机制说明',...effects});
const actor=(id:number,traitIds:string[]=[]):Character=>({id,name:'测试角色',maxHp:20,hp:20,attack:3,armor:0,magic:2,mana:0,manaCost:10,skillId:'fixture',colors:[BaseColor.Blue],traitIds,statuses:[],defeated:false});

describe('ST trait descriptions follow adapted runtime mechanics',()=>{
 it('renders trigger, target, signed values and shared combat terminology without source narrative',()=>{
  const source=trait({onDamagedGain:{stat:'magic',amount:2},onColorMatchGains:[{color:'Red',stat:'attack',amount:1},{color:'skull',stat:'armor',amount:2}],teamAura:{scope:'enemies',stat:'attack',amount:-3}});
  const before=structuredClone(source);const result=describeAdaptedTrait(source);
  expect(result.support).toBe('full');expect(source).toEqual(before);
  expect(result.description).toContain('自身受到骷髅头伤害后');
  expect(result.description).toContain('我方配对红色宝石时');expect(result.description).toContain('我方配对骷髅头时');
  expect(result.description).toContain('敌方全体存活角色');expect(result.description).toContain('-3');
  expect(result.description).not.toContain(source.name);expect(result.description).not.toContain(source.description);
 });
 it('uses abstract affinities and source references from actual adapted traits',()=>{
  const summon=adaptedTraitDescription('stormflock')!;
  expect(summon.support).toBe('full');expect(summon.description).toContain('召唤体 6754');expect(summon.description).toContain('35%');
  expect(summon.description).not.toContain('鸟妖');expect(summon.description).not.toContain('Harpy');
  const definition=adaptedTrait('hauntedcrown')!;
  expect(definition.allyStartMana?.troopType).toMatch(/^affinity:/);
  expect(definition.description).toContain('族群 #');expect(definition.description).toContain('50%');
 });
 it('preserves separate per-status rolls, joint probability and filtered random status pools',()=>{
  const base={scope:'randomEnemy' as const,statuses:[{id:'curse'},{id:'death-mark'}],turns:3,chance:.25};
  const independent=describeAdaptedTrait(trait({onBigMatchStatus:{...base,independentChance:true,minSize:5}}));
  expect(independent.support).toBe('full');expect(independent.description).toContain('5 颗及以上');expect(independent.description).toContain('逐个状态独立以 25% 概率');
  const together=describeAdaptedTrait(trait({onBigMatchStatus:{...base,randomMissingStatusCount:2}}));
  expect(together.support).toBe('full');expect(together.description).not.toContain('逐个状态独立');expect(together.description).toContain('2 个尚未具有的不同状态');
  const random=describeAdaptedTrait(trait({onBigMatchStatus:{...base,randomNegative:true}}));
  expect(random.description).toContain('一个随机可获得的负面状态');
 });
 it('distinguishes real troop death summons with full mana from a storm and its duration',()=>{
  const summoned=describeAdaptedTrait(trait({summonOnDeath:{chance:1,troopId:1,referenceName:'unit:1',displayName:'叙事名称',fullMana:true}}));
  expect(summoned.support).toBe('full');expect(summoned.description).toContain('满法力入场');expect(summoned.description).toContain('满员时不召唤');
  const storm=describeAdaptedTrait(trait({summonOnDeath:{chance:.5,troopId:9001,referenceName:'storm',displayName:'叙事名称',storm:{color:BaseColor.Red,turns:8}}}));
  expect(storm.support).toBe('full');expect(storm.description).toContain('50%');expect(storm.description).toContain('红色宝石');expect(storm.description).toContain('8 回合');expect(storm.description).not.toContain('空位');
 });
 it('describes the first color actually consumed by trait storms instead of promising a dual-color storm',()=>{
  const result=describeAdaptedTrait(trait({turnStartStorm:{referenceName:'mixed',displayName:'来源',colors:[BaseColor.Red,BaseColor.Blue]}}));
  expect(result.support).toBe('full');expect(result.description).toContain('红色宝石');expect(result.description).not.toContain('蓝色宝石');expect(result.description).toContain('8 回合');
 });
 it('keeps the source color separate from produced special-gem color and tier',()=>{
  const result=describeAdaptedTrait(trait({turnStartColorToSpecial:{color:BaseColor.Blue,gem:'dragonGem',gemColor:'Red',count:2,tier:3,chance:.35}}));
  expect(result.support).toBe('full');expect(result.description).toContain('35%');expect(result.description).toContain('2 颗随机蓝色宝石');expect(result.description).toContain('红色');expect(result.description).toContain('等级 3');
  const skull=describeAdaptedTrait(trait({turnStartCreateGem:{color:'skull'},turnStartColorToSpecial:{color:'skull',gem:'doomSkull',count:1}}));
  expect(skull.support).toBe('full');expect(skull.description).toContain('1 颗随机现存宝石替换为普通骷髅头');expect(skull.description).toContain('1 颗随机普通骷髅头转换为');
 });
 it('describes position auras as first occupancy, matching an actual reposition and repeat invocation',()=>{
  const spec=trait({code:'st:description-position',positionAura:{position:'front',scope:'allAllies',gains:{attack:2}}});
  registerDynamicTraits([spec]);const front=actor(1),holder=actor(2,[spec.code]);const granted=new Set<number>();
  expect(applyPositionAuras([[front,holder]],granted)).toEqual([]);
  applyPositionAuras([[holder,front]],granted);expect(holder.attack).toBe(5);expect(front.attack).toBe(5);
  expect(applyPositionAuras([[holder,front]],granted)).toEqual([]);
  expect(describeAdaptedTrait(spec).description).toContain('自身首次处于首位时');
 });
 it('uses random targets for enemy-death devour and attacker/recipient for skull triggers',()=>{
  const result=describeAdaptedTrait(trait({onEnemyDeathDevour:{chance:.2},onSkullHitDevour:{chance:.1},onSkullDamagedDevour:{chance:.3}}));
  expect(result.support).toBe('full');expect(result.description).toContain('20% 概率吞噬随机一名敌方存活角色');expect(result.description).toContain('10% 概率吞噬本次受击目标');expect(result.description).toContain('30% 概率吞噬本次攻击者');
 });
 describe.each([{label:'source catalog',adapted:false},{label:'ST catalog',adapted:true}])('$label runtime evidence',({adapted})=>{
  const catalog=(code:string)=>{
   const spec=adapted?adaptedTrait(code)!:getTrait(code)!;
   expect(spec,code).toBeDefined();
   if(adapted)registerDynamicTraits([spec]);
   const audit=adapted?adaptedTraitDescription(code)!:describeAdaptedTrait(spec);
   expect(audit.support,code).toBe('full');expect(audit.diagnostics,code).toEqual([]);
   if(adapted)expect(spec.description).toBe(audit.description);
   return {spec,audit};
  };
  it('hiddentrap uses yellow only as the trigger and requests a random explosion',()=>{
   const {spec,audit}=catalog('hiddentrap');
   expect(spec.onColorMatchExplodeGem).toEqual({color:BaseColor.Yellow,count:1});
   const holder=actor(1,[spec.code]);attachPassives(holder);
   const requests:unknown[]=[];
   const explodeSpec:NonNullable<NonNullable<Parameters<typeof applyColorMatchTriggers>[2]>['explodeSpec']>=request=>{requests.push(request);return [];};
   applyColorMatchTriggers([holder],BaseColor.Blue,{explodeSpec});expect(requests).toEqual([]);
   applyColorMatchTriggers([holder],BaseColor.Yellow,{explodeSpec});expect(requests).toEqual([{kind:'random',count:1}]);
   holder.defeated=true;applyColorMatchTriggers([holder],BaseColor.Yellow,{explodeSpec});expect(requests).toHaveLength(1);
   expect(audit.description).toContain('我方配对黄色宝石时');expect(audit.description).toContain('爆破最多 1 颗随机宝石');
   expect(audit.description).not.toContain('爆破最多 1 颗黄色宝石');
  });
  it.each([
   {code:'regeneration',hp:15,amount:1,healed:1,attack:3,armor:0},
   {code:'regeneration',hp:20,amount:1,healed:0,attack:3,armor:0},
   {code:'wildhorns',hp:15,amount:2,healed:2,attack:5,armor:2},
   {code:'wildhorns',hp:19,amount:2,healed:1,attack:5,armor:2},
   {code:'wildhorns',hp:20,amount:2,healed:0,attack:5,armor:2},
  ])('$code at $hp HP restores $healed without raising the cap',({code,hp,amount,healed,attack,armor})=>{
   const {spec,audit}=catalog(code);const holder=actor(1,[spec.code]);holder.hp=hp;attachPassives(holder);
   const events=applyTurnStartPassives([holder]);
   expect({hp:holder.hp,maxHp:holder.maxHp,attack:holder.attack,armor:holder.armor}).toEqual({hp:hp+healed,maxHp:20,attack,armor});
   expect(events.filter(e=>e.stat==='hp').map(e=>e.amount)).toEqual(healed?[healed]:[]);
   expect(audit.description).toContain(`恢复最多 ${amount} 点缺失生命（不增加最大生命）`);
   if(code==='wildhorns')expect(audit.description).toContain('获得 2 点攻击、护甲');
  });
  it.each([15,20])('hunger at %i HP grows current and maximum HP along with its other stats',(hp)=>{
   const {spec,audit}=catalog('hunger');const holder=actor(1,[spec.code]);holder.hp=hp;attachPassives(holder);
   expect(applyColorMatchTriggers([holder],BaseColor.Yellow)).toEqual([]);
   const events=applyColorMatchTriggers([holder],'skull');
   expect({hp:holder.hp,maxHp:holder.maxHp,armor:holder.armor,attack:holder.attack,magic:holder.magic}).toEqual({hp:hp+2,maxHp:22,armor:2,attack:5,magic:4});
   expect(events.map(e=>({type:e.type,stat:'stat' in e?e.stat:undefined,amount:'amount' in e?e.amount:undefined}))).toEqual([
    {type:'buff',stat:'hp',amount:2},{type:'buff',stat:'armor',amount:2},{type:'buff',stat:'attack',amount:2},{type:'buff',stat:'magic',amount:2},
   ]);
   expect(audit.description).toContain('当前与最大生命各增加 2 点');expect(audit.description).toContain('获得 2 点护甲、攻击、魔力');
   expect(audit.description).not.toContain('恢复');
  });
  it.each([
   {label:'base mana exhausted before holder',frontMana:0,holderMana:0,amount:3,expected:[3,0,0],gains:[[1,3]],bonus:false},
   {label:'holder receives base mana',frontMana:10,holderMana:0,amount:3,expected:[10,4,0],gains:[[2,4]],bonus:true},
   {label:'base mana overflows to holder',frontMana:9,holderMana:0,amount:3,expected:[10,3,0],gains:[[1,1],[2,3]],bonus:true},
   {label:'bonus fills last capacity',frontMana:10,holderMana:8,amount:1,expected:[10,10,0],gains:[[2,2]],bonus:true},
   {label:'base mana fills holder and overflow goes to ally',frontMana:10,holderMana:9,amount:3,expected:[10,10,2],gains:[[2,1],[3,2]],bonus:false},
   {label:'holder already full',frontMana:10,holderMana:10,amount:3,expected:[10,10,3],gains:[[3,3]],bonus:false},
   {label:'silenced holder skipped',frontMana:10,holderMana:0,amount:3,status:'silence',expected:[10,0,3],gains:[[3,3]],bonus:false},
   {label:'defeated holder skipped',frontMana:10,holderMana:0,amount:3,defeated:true,expected:[10,0,3],gains:[[3,3]],bonus:false},
   {label:'other associated color gives no link bonus',frontMana:10,holderMana:0,amount:3,color:BaseColor.Red,expected:[10,3,0],gains:[[2,3]],bonus:false},
   {label:'disease reduces base mana before bonus',frontMana:10,holderMana:0,amount:3,status:'disease',expected:[10,3,0],gains:[[2,3]],bonus:true},
   {label:'zero base mana gives no bonus',frontMana:10,holderMana:0,amount:0,expected:[10,0,0],gains:[],bonus:false},
  ])('waterlink: $label',({frontMana,holderMana,amount,color=BaseColor.Blue,status,defeated=false,expected,gains,bonus})=>{
   const {spec,audit}=catalog('waterlink');expect(spec.manaLink).toEqual({color:BaseColor.Blue,amount:1});
   const front=actor(1),holder=actor(2,[spec.code]),tail=actor(3);
   front.mana=frontMana;holder.mana=holderMana;holder.colors=[BaseColor.Blue,BaseColor.Red];holder.defeated=defeated;
   if(status)holder.statuses=[{id:status,turns:3}];
   attachPassives(holder);const team:Team={player:PlayerSide.Left,characters:[front,holder,tail]};
   const events=new ManaDistributor().distribute(team,PlayerSide.Left,color,amount);
   expect(team.characters.map(c=>c.mana)).toEqual(expected);
   const received=events.filter(e=>e.type==='mana-gain');expect(received.map(e=>[e.characterId,e.amount])).toEqual(gains);
   expect(received.filter(e=>e.traitActivations?.length).map(e=>e.characterId)).toEqual(bonus?[holder.id]:[]);
   if(status==='silence')expect(events).toContainEqual({type:'status-blocked',targetId:holder.id,statusId:'silence',reason:'mana'});
   if(status==='disease')expect(received[0]).toMatchObject({halved:true});
   expect(audit.description).toContain('自身实际收到蓝色宝石配对产生的基础法力后');
   expect(audit.description).toContain('自身额外获得最多 1 点法力');expect(audit.description).toContain('受自身剩余法力容量限制');
  });
  it.each([{label:'ally enters',full:false,enemyCast:false,triggered:true},{label:'full roster',full:true,enemyCast:false,triggered:false},{label:'enemy enters',full:false,enemyCast:true,triggered:false}])('summon responses require actual allied entry: $label',({full,enemyCast,triggered})=>{
   const gain=catalog('summoningritual'),storm=catalog('callnature');
   const holder=actor(1,[gain.spec.code,storm.spec.code]);const caster=actor(2);caster.skillId='description-summon';caster.mana=10;
   const allies=[holder,...(!enemyCast?[caster]:[])];
   if(full)allies.push(actor(3),actor(4));
   const enemies=enemyCast?[caster]:[actor(5)];const board=new BoardModel();
   const colors=[BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
   for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col+1,type:colorGem(colors[(row+col)%colors.length]!)});
   const state=createGameState(board,{player:PlayerSide.Left,characters:allies},{player:PlayerSide.Right,characters:enemies},enemyCast?PlayerSide.Right:PlayerSide.Left);
   const registry=new ExtensionRegistry();registry.prototypes.set(caster.skillId,{segments:[{kind:'summon',params:{source:{ref:'description-unit'}}}]});
   let gemId=100;const engine=new TurnEngine(state,new SeededRNG(11),()=>++gemId,registry);
   engine.setSummonResolver(()=>{const {id,defeated,statuses,...template}=actor(9);void id;void defeated;void statuses;return template;});
   const events=engine.castSkill(caster.id);const summons=events.filter(e=>e.type==='summon');
   expect(summons).toHaveLength(full?0:1);
   if(!full){expect(summons[0]).toMatchObject({destination:'field',player:enemyCast?PlayerSide.Right:PlayerSide.Left});expect(state.teams[enemyCast?PlayerSide.Right:PlayerSide.Left].characters.some(c=>c.id===summons[0]!.characterId)).toBe(true);}
   expect(holder.magic).toBe(triggered?10:2);
   expect(events.filter(e=>e.type==='storm-change')).toHaveLength(triggered?1:0);
   expect(gain.audit.description).toContain('我方部队被召唤并实际入场时');expect(storm.audit.description).toContain('我方部队被召唤并实际入场时');
  });
 });
 it('keeps partial known effects visible and exposes unknown structural paths without leaking values',()=>{
  const result=describeAdaptedTrait({...trait({onDamagedGain:{stat:'magic',amount:2,unmodeled:'SECRET'} as never}),unknownHook:{secret:'SECRET'}} as TraitDefinition);
  expect(result.support).toBe('partial');expect(result.description).toContain('2 点');expect(result.description).toContain('尚待核对');
  expect(result.diagnostics.map(d=>d.path)).toEqual(['trait.onDamagedGain.unmodeled','trait.unknownHook']);
  expect(JSON.stringify(result)).not.toContain('SECRET');
  expect(result.effects.every(e=>e.support==='partial')).toBe(true);
 });
 it('flags unknown vocabulary and invalid probability instead of declaring complete coverage',()=>{
  const result=describeAdaptedTrait(trait({dodgeChance:2,onDamagedGain:{stat:'futureStat',amount:1} as never}));
  expect(result.support).toBe('partial');expect(result.diagnostics.map(d=>d.path)).toContain('trait.dodgeChance');expect(result.diagnostics.map(d=>d.path)).toContain('trait.onDamagedGain.stats.0');
  expect(describeAdaptedTrait(trait({})).support).toBe('empty');
 });
 it('describes native economic mechanics without an added availability restriction',()=>{
  const result=describeAdaptedTrait(trait({onSkullMatchEconomy:{currency:'gold',amount:3}}));
  expect(result.support).toBe('full');expect(result.diagnostics).toEqual([]);
  expect(result.description).toContain('骷髅头配对在伤害结算后');
  expect(result.description).toContain('基础 3 点战斗金币');
  expect(result.description).not.toContain('当前 ST 经济门禁限制使用');
 });
 it('covers every retained catalog field structurally, isolates cached results and attaches audits to blueprints',()=>{
  let retained=0;
  for(const code of new Set(TROOPS.flatMap(t=>t.traits.map(tr=>tr.code)))){
   const adapted=adaptedTrait(code);if(!adapted)continue;retained++;
   const audit=adaptedTraitDescription(code)!;
   expect(audit.support,code).not.toBe('empty');expect(audit.description,code).toBe(adapted.description);
   expect(audit.effects.map(e=>e.field).sort(),code).toEqual(Object.keys(adapted).filter(k=>!['code','name','description','troops'].includes(k)&&adapted[k as keyof TraitDefinition]!==undefined).sort());
   audit.description='污染';audit.diagnostics.push({path:'bad',code:'unknown-field',message:'bad'});
   expect(adaptedTraitDescription(code)!.description).not.toBe('污染');expect(adaptedTraitDescription(code)!.diagnostics.some(d=>d.path==='bad')).toBe(false);
  }
  expect(retained).toBeGreaterThan(750);
  const p=PORTRAITS[0]!;const blueprint=compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'audit'});
  expect(blueprint.traitDescriptionAudit.map(a=>a.code)).toEqual(blueprint.snapshot.traitIds);
  registerAdaptedCatalog(new ExtensionRegistry());
  for(const code of blueprint.snapshot.traitIds??[])expect(getTrait(code)!.description).toBe(adaptedTrait(code.slice(3))!.description);
 });
});
