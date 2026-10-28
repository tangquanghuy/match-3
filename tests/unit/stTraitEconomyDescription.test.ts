import {beforeAll,describe,expect,it} from 'vitest';
import {TROOPS} from '../../src/data/troops';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {ExtensionRegistry} from '../../src/engine/registry';
import {SeededRNG} from '../../src/engine/rng';
import {applyBigMatchTriggers,applyColorMatchTriggers,attachPassives,registerDynamicTraits} from '../../src/engine/traits';
import type {TraitDefinition} from '../../src/engine/traits';
import {BaseColor,PlayerSide,colorGem,skullGem} from '../../src/engine/types';
import type {Character,GemType} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {dmg,extraTurn,explodeAt} from '../../src/engine/skills/builders';
import {creditGoldForSide,debitGoldForSide,battleGoldCap} from '../../src/engine/battleGold';
import {creditBattleSouls,battleSoulCap} from '../../src/engine/battleSouls';
import {adaptedTrait,adaptedTraitDescription} from '../../src/sillytavern/enemyBlueprint';
import {describeAdaptedTrait} from '../../src/sillytavern/traitDescription';
import {traitEconomyIssues} from '../../src/sillytavern/economyAvailability';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';

// Expected facts are reviewed against engine execution, not produced by the renderer under test.
const catalogCases:[string,string[]][]=[
 ['greedy',['每组配对 4 颗','基础 2 点战斗金币']],
 ['extremegreed',['每组配对 4 颗','基础 4 点战斗金币']],
 ['pillageandplunder',['每组配对 4 颗','基础 20 点战斗金币']],
 ['necromancy',['收益加成 +50%','仅持有者在左方','floor(200×总倍率)']],
 ['necromaster',['收益加成 +150%','右方持有者不贡献灵魂倍率']],
 ['merchant',['收益加成 +25%','左方与右方分别计算','floor(500×总倍率)']],
 ['moneybags',['收益加成 +100%','阵亡或被击晕均不撤销快照']],
 ['valuable',['行动末尾处理阵亡事件','基础 25 点战斗金币','每名死者至多结算一次']],
 ['pickpocket',['骷髅头伤害事件','仍存活','基础 10 点战斗金币','仅法术伤害不触发']],
 ['darkensouls',['骷髅头配对在伤害结算后','基础 3 点战斗灵魂','双方共享']],
 ['soulverdict',['含自身','技能效果执行前','基础 3 点战斗灵魂']],
 ['goldenhoard',['真实换手','额外回合延续不触发','基础 5 点战斗金币']],
 ['soulgatherer',['持续伤害结算前','基础 4 点战斗灵魂']],
 ['old_meepo_earth_bind',['真实换手','基础 20 点战斗金币','攻击归零']],
 ['defender',['仅在 PvP 模式','右方防守队','全体存活角色','护甲增加 3 点']],
 ['siege',['仅在 PvP 模式','左方进攻队','全体存活角色','攻击增加 2 点']],
 ['virtueofhonor',['仅在 PvP 模式','为持有者自身','当前与最大生命各增加 10 点','魔力增加 10 点']],
];
const codes=catalogCases.map(([code])=>code);
const economicFields=['onSkullMatchEconomy','onBigMatchEconomy','turnStartEconomy','onDamagedEconomy','onAllyCastEconomy','onDeathEconomy','battleEconomyGain','mode','pvpBonus'];
const fixture=(effects:Partial<TraitDefinition>):TraitDefinition=>({code:'desc:fixture',name:'SOURCE_NAME_SENTINEL',description:'SOURCE_PROSE_SENTINEL',...effects});
const character=(id:number,traits:string[]=[],over:Partial<Character>={}):Character=>({
 id,name:`actor-${id}`,maxHp:500,hp:500,armor:0,attack:5,magic:0,mana:10,manaCost:10,
 colors:[BaseColor.Red],skillId:'idle',traitIds:traits.map(code=>codes.includes(code)?`st:${code}`:code),statuses:[],defeated:false,...over,
});
function traitBattleRequest(traitIds:string[],mode?:'pvp'):BattleRequest {
 const snapshot=(externalId:string)=>({externalId,name:externalId,skillId:'gw_KnightsSword',manaCost:10,manaColors:[BaseColor.Red],stats:{hp:500,armor:0,attack:5,magic:0}});
 return {schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'description-gate',requestId:'description-gate',seed:11,
  ...(mode?{mode}:{}),playerTeam:[{...snapshot('player'),traitIds}],enemyTeam:[snapshot('enemy')]};
}
function harness(options:{left?:Character[];right?:Character[];side?:PlayerSide;match?:{size:number;skull?:boolean};pvp?:boolean}={}){
 let gid=1000;const nextId=()=>gid++;const board=new BoardModel();
 const palette=[BaseColor.Green,BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple];
 const put=(row:number,col:number,type:GemType)=>board.set({row,col},{id:nextId(),type});
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)put(row,col,colorGem(palette[(row+col)%4]!));
 if(options.match){
  const gem=()=>options.match!.skull?skullGem():colorGem(BaseColor.Red);
  for(let col=0;col<8;col++)put(7,col,col<options.match.size&&col!==2?gem():colorGem(palette[col%4]!));
  put(6,2,gem());put(5,2,colorGem(BaseColor.Blue));
 }
 const state=createGameState(board,{player:PlayerSide.Left,characters:options.left??[character(0)]},
  {player:PlayerSide.Right,characters:options.right??[character(4)]},options.side??PlayerSide.Left);
 const registry=new ExtensionRegistry();registry.prototypes.set('idle',{segments:[dmg('enemyFront',1,0)]});
 const engine=new TurnEngine(state,new SeededRNG(options.match&&!options.match.skull?5:11),nextId,registry,engine=>{
  // Isolate trait credits from native match Gold in these trigger probes.
  engine.skullChance=0;engine.setAutomaticMatchEconomyEnabled(false);engine.pvpMode=!!options.pvp;
 });
 return {state,engine,registry,swap:()=>engine.resolveSwap({row:7,col:2},{row:6,col:2})};
}
const gains=(events:GameEvent[])=>events.filter(event=>event.type==='economy-gain');

beforeAll(()=>{
 registerDynamicTraits(codes.map(code=>adaptedTrait(code)!));
 registerDynamicTraits([
  fixture({code:'desc:five',onBigMatchEconomy:{currency:'gold',amount:7,minSize:5}}),
  fixture({code:'desc:low-min',onBigMatchEconomy:{currency:'gold',amount:7,minSize:2}}),
  fixture({code:'desc:dodge',dodgeChance:1}),
  fixture({code:'desc:pvp-gold',pvpEconomyGain:{currency:'gold',amount:7}}),
 ]);
});

describe('ST-04: all 17 retained economy/mode trait descriptions',()=>{
 it.each(catalogCases)('%s describes adapted fields completely', (code,facts)=>{
  const definition=adaptedTrait(code)!;const before=structuredClone(definition);
  const result=describeAdaptedTrait({...definition,name:'SOURCE_NAME_SENTINEL',description:'SOURCE_PROSE_SENTINEL'});
  expect(result.support).toBe('full');expect(result.diagnostics).toEqual([]);
  expect(result.effects.every(effect=>effect.support==='full')).toBe(true);
  for(const fact of facts)expect(result.description).toContain(fact);
  expect(result.description).not.toMatch(/SOURCE_.*_SENTINEL|待核对/);
  expect(definition).toEqual(before);expect(adaptedTraitDescription(code)).toEqual(result);
  expect(result.description).not.toMatch(/当前 ST 经济门禁限制使用|此处仅说明战斗内机制/);
  if(definition.mode==='pvp')expect(result.description).toContain('当前 ST 未提供 PvP 模式');
  else {
   expect(traitEconomyIssues(definition)).toEqual([]);
   expect(traitEconomyIssues(definition,{mode:'pvp'})).toEqual([]);
  }
 });
 it('covers exactly the real directory economy/mode cohort and leaves no partial descriptions',()=>{
  const directory=[...new Set(TROOPS.flatMap(troop=>troop.traits.map(t=>t.code)))].flatMap(code=>{
   const definition=adaptedTrait(code);return definition?[{code,definition}]:[];
  });
  const cohort=directory.filter(({definition})=>economicFields.some(field=>Object.hasOwn(definition,field)));
  expect(cohort.map(t=>t.code).sort()).toEqual([...codes].sort());expect(cohort).toHaveLength(17);
  expect(directory.filter(({definition})=>describeAdaptedTrait(definition).support!=='full').map(t=>t.code)).toEqual([]);
 });
 it.each(codes.filter(code=>adaptedTrait(code)!.mode!=='pvp'))('%s remains available through formal ST preparation with its complete description',code=>{
  expect(adaptedTraitDescription(code)!.support).toBe('full');
  expect(()=>prepareStBattle(traitBattleRequest([`st:${code}`]))).not.toThrow();
 });
 it.each([undefined,'pvp'] as const)('restricts completion economy only when the request enables PvP (mode=%s)',mode=>{
  const definition=fixture({pvpEconomyGain:{currency:'gold',amount:7}});
  const description=describeAdaptedTrait(definition);
  expect(description.support).toBe('full');expect(description.description).toContain('仅在 PvP 模式');
  const issues=traitEconomyIssues(definition,{mode});
  const prepare=()=>prepareStBattle(traitBattleRequest(['st:greedy','desc:pvp-gold'],mode));
  if(mode==='pvp'){
   expect(issues).toHaveLength(1);expect(issues[0]).toMatch(/竞技对战.*结算/);
   expect(prepare).toThrow(/竞技对战.*结算/);
  }else {
   expect(issues).toEqual([]);expect(prepare).not.toThrow();
  }
 });
});

describe('economy descriptions retain explicit diagnostics for unknown structure and values',()=>{
 it.each([
  [{onSkullMatchEconomy:{currency:'maps',amount:2}},'trait.onSkullMatchEconomy.currency'],
  [{turnStartEconomy:{currency:'gems',amount:1}},'trait.turnStartEconomy.currency'],
  [{battleEconomyGain:{currency:'gems',ratio:1}},'trait.battleEconomyGain.currency'],
  [{onBigMatchEconomy:{currency:'gold',amount:1,minSize:'5'}},'trait.onBigMatchEconomy.minSize'],
  [{onBigMatchEconomy:{currency:'gold',amount:1,minSize:null}},'trait.onBigMatchEconomy.minSize'],
  [{onBigMatchEconomy:{currency:'gold',amount:1,minSize:4.5}},'trait.onBigMatchEconomy.minSize'],
  [{onDamagedEconomy:{currency:'gold',amount:-1}},'trait.onDamagedEconomy.amount'],
  [{onDeathEconomy:{currency:'gold',amount:NaN}},'trait.onDeathEconomy.amount'],
  [{onAllyCastEconomy:{currency:'souls',amount:Infinity}},'trait.onAllyCastEconomy.amount'],
  [{battleEconomyGain:{currency:'souls',ratio:-.5}},'trait.battleEconomyGain.ratio'],
  [{battleEconomyGain:{currency:'souls',ratio:Infinity}},'trait.battleEconomyGain.ratio'],
  [{mode:'future-mode'},'trait.mode'],
  [{pvpBonus:{phase:'future-phase',gains:{armor:2}}},'trait.pvpBonus.phase'],
  [{pvpBonus:{phase:'battle',gains:{armor:-2}}},'trait.pvpBonus.gains.armor'],
 ] as const)('reports unsupported values at their actual path (%j)',(effects,path)=>{
  const result=describeAdaptedTrait(fixture(effects as never));
  expect(result.support).toBe('partial');expect(result.diagnostics).toContainEqual(expect.objectContaining({path,code:'unsupported-value'}));
  expect(result.description).not.toContain('SOURCE_PROSE_SENTINEL');
 });
 it('reports unknown economy keys, nested stat keys and top-level hooks without leaking values',()=>{
  const result=describeAdaptedTrait(fixture({onBigMatchEconomy:{currency:'gold',amount:2,wallet:'SECRET'},
   pvpBonus:{phase:'battle',gains:{armor:2,mana:9}},futureEconomy:'SECRET'} as never));
  expect(result.support).toBe('partial');
  expect(result.diagnostics.map(d=>[d.path,d.code])).toEqual([
   ['trait.onBigMatchEconomy.wallet','unknown-field'],['trait.pvpBonus.gains.mana','unknown-field'],['trait.futureEconomy','unknown-field'],
  ]);expect(JSON.stringify(result)).not.toContain('SECRET');
 });
 it('supports zero, ratios above 100%, and shared gems without borrowing the map cap',()=>{
  const result=describeAdaptedTrait(fixture({onSkullMatchEconomy:{currency:'gems',amount:0},battleEconomyGain:{currency:'souls',ratio:1.5}}));
  expect(result.support).toBe('full');expect(result.description).toContain('+150%');
  expect(result.description).toContain('双方共享的战斗钻石池');expect(result.description).toContain('基础量为 0 时不入账');
  expect(result.description).toContain('无战斗内数量上限');
 });
});

describe('native engine probes substantiate ownership, multipliers, caps and trigger timing',()=>{
 it('snapshots additive side-owned gold ratios and only Left soul ratios, with floor and cap on each credit',()=>{
  const left=character(0,['merchant','moneybags','necromancy','necromaster']);
  const right=character(4,['merchant','necromaster']);const f=harness({left:[left],right:[right]});
  expect(f.state.battleGoldGainRatios).toEqual({[PlayerSide.Left]:1.25,[PlayerSide.Right]:.25});
  expect(f.state.battleSoulGainRatio).toBe(2);
  expect(creditGoldForSide(f.state,PlayerSide.Left,3)).toBe(6);
  expect(creditGoldForSide(f.state,PlayerSide.Right,3)).toBe(3);
  expect(creditBattleSouls(f.state,3,{source:'trait',side:PlayerSide.Right})).toBe(9);
  expect(battleGoldCap(f.state,PlayerSide.Left)).toBe(1125);expect(battleSoulCap(f.state)).toBe(600);
  expect(creditGoldForSide(f.state,PlayerSide.Left,10000)).toBe(1119);
  expect(creditGoldForSide(f.state,PlayerSide.Left,1)).toBe(0);
  debitGoldForSide(f.state,PlayerSide.Left,7,{source:'direct',side:PlayerSide.Left});
  expect(creditGoldForSide(f.state,PlayerSide.Left,10)).toBe(7);
  expect(creditBattleSouls(f.state,10000)).toBe(591);expect(creditBattleSouls(f.state,1)).toBe(0);
  left.defeated=true;left.statuses.push({id:'stun',turns:3});
  expect(f.state.battleGoldGainRatios?.[PlayerSide.Left]).toBe(1.25);expect(battleSoulCap(f.state)).toBe(600);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('credits big matches to their holder side, separately per holder (%s)',side=>{
  const holders=[character(0,['greedy']),character(1,['extremegreed'])];
  const f=harness({side,match:{size:4},...(side===PlayerSide.Left?{left:holders}:{right:holders})});
  expect(gains(f.swap())).toEqual([
   {type:'economy-gain',currency:'gold',amount:2,side},{type:'economy-gain',currency:'gold',amount:4,side},
  ]);expect(f.state.economy.gold).toBe(side===PlayerSide.Left?6:0);expect(f.state.enemyGold??0).toBe(side===PlayerSide.Right?6:0);
 });
 it.each([3,4,5])('uses group thresholds, rather than the size of the whole action (%i)',size=>{
  const f=harness({left:[character(0,['desc:five'])],match:{size}});
  expect(gains(f.swap())).toEqual(size===5?[{type:'economy-gain',currency:'gold',amount:7,side:PlayerSide.Left}]:[]);
  const lower=describeAdaptedTrait(fixture({onBigMatchEconomy:{currency:'gold',amount:7,minSize:2}}));
  expect(lower.description).toContain('每组配对 4 颗');
  const g=harness({left:[character(0,['desc:low-min'])],match:{size}});
  expect(gains(g.swap()).length).toBe(size>=4?1:0);
 });
 it('does not add two separate three-matches into an economic big match',()=>{
  const f=harness({left:[character(0,['greedy'])],match:{size:3}});
  f.state.board.set({row:6,col:3},{id:9001,type:colorGem(BaseColor.Blue)});
  f.state.board.set({row:6,col:4},{id:9002,type:colorGem(BaseColor.Blue)});
  expect(gains(f.swap())).toEqual([]);
 });
 it('checks active holders and does not treat colored matches as skull matches',()=>{
  const live=character(0,['darkensouls','greedy']);const stunned=character(1,['darkensouls','greedy'],{statuses:[{id:'stun',turns:5}]});
  const dead=character(2,['darkensouls','greedy'],{defeated:true,hp:0});
  for(const holder of [live,stunned,dead])attachPassives(holder);
  const recorded:[string,number][]=[];const gainEconomy=(currency:string,amount:number):GameEvent[]=>{recorded.push([currency,amount]);return [];};
  applyColorMatchTriggers([live,stunned,dead],BaseColor.Red,{gainEconomy});expect(recorded).toEqual([]);
  applyColorMatchTriggers([live,stunned,dead],'skull',{gainEconomy});expect(recorded).toEqual([['souls',3]]);
  recorded.length=0;applyBigMatchTriggers([live,stunned,dead],{size:4,gainEconomy});expect(recorded).toEqual([['gold',2]]);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('skull matches credit shared souls after damage, even when Barrier absorbs (%s)',side=>{
  const holder=character(0,['darkensouls']);const defender=character(4,[],{statuses:[{id:'barrier',turns:3}]});
  const f=harness({side,match:{size:3,skull:true},...(side===PlayerSide.Left?{left:[holder],right:[defender]}:{right:[holder],left:[defender]})});
  const events=f.swap();const barrierIndex=events.findIndex(e=>e.type==='attack-struggle'&&e.reason==='barrier');
  expect(barrierIndex).toBeGreaterThanOrEqual(0);expect(events.findIndex(e=>e.type==='economy-gain')).toBeGreaterThan(barrierIndex);
  expect(gains(events)).toEqual([{type:'economy-gain',currency:'souls',amount:3,side}]);expect(f.state.economy.souls).toBe(3);
 });
 it('exploding skulls is not matching skulls',()=>{
  const f=harness({left:[character(0,['darkensouls'])]});
  f.state.board.set({row:4,col:4},{id:9000,type:skullGem()});
  f.registry.prototypes.set('idle',{segments:[explodeAt({row:4,col:4})]});
  expect(gains(f.engine.castSkill(0)).filter(e=>e.currency==='souls')).toEqual([]);expect(f.state.economy.souls).toBe(0);
 });
 it.each([
  ['armor-only',{armor:20},5,10],['barrier',{statuses:[{id:'barrier',turns:3}]},5,0],
  ['fatal',{hp:1},5,0],['stunned',{statuses:[{id:'stun',turns:3}]},5,0],['zero-damage',{},0,10],
  ['dodge',{traitIds:['st:pickpocket','desc:dodge']},5,0],
 ] as [string,Partial<Character>,number,number][])('damaged economy follows skull events and survival: %s',(_label,over,attack,expected)=>{
  const f=harness({left:[character(0,[],{attack})],right:[character(4,['pickpocket'],over),character(5)],match:{size:3,skull:true}});
  const events=f.swap();expect(gains(events)).toEqual(expected?[{type:'economy-gain',currency:'gold',amount:expected,side:PlayerSide.Right}]:[]);
  expect(f.state.enemyGold??0).toBe(expected);expect(f.state.economy.gold).toBe(0);
 });
 it('spell damage does not trigger pickpocket',()=>{
  const f=harness({right:[character(4,['pickpocket'])]});expect(gains(f.engine.castSkill(0))).toEqual([]);
 });
 it('turn-start credits omit opening and extra turns, then run before incoming damage-over-time',()=>{
  const right=character(4,['goldenhoard'],{statuses:[{id:'poison',turns:3}]});
  const f=harness({left:[character(0,['soulgatherer'])],right:[right]});
  expect(gains(f.engine.takeInitialEvents())).toEqual([]);expect(f.state.economy.souls).toBe(0);
  f.registry.prototypes.set('idle',{segments:[extraTurn()]});
  expect(gains(f.engine.castSkill(0))).toEqual([]);expect(f.state.activePlayer).toBe(PlayerSide.Left);
  const events=f.engine.passTurn();expect(gains(events)).toEqual([{type:'economy-gain',currency:'gold',amount:5,side:PlayerSide.Right}]);
  const dotIndex=events.findIndex(e=>e.type==='status-tick'&&e.statusId==='poison');expect(dotIndex).toBeGreaterThan(events.findIndex(e=>e.type==='economy-gain'));
  expect(gains(f.engine.passTurn())).toEqual([{type:'economy-gain',currency:'souls',amount:4,side:PlayerSide.Left}]);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('self and ally casts grant souls before the skill, while enemy or rejected casts do not (%s)',side=>{
  const holder=character(0,['soulverdict']);const ally=character(1);const enemy=character(4);
  const f=harness({side,...(side===PlayerSide.Left?{left:[holder,ally],right:[enemy]}:{right:[holder,ally],left:[enemy]})});
  const observed:number[]=[];f.registry.skills.set('idle',{apply(state){observed.push(state.economy.souls);return [];}});
  expect(gains(f.engine.castSkill(holder.id))).toEqual([{type:'economy-gain',currency:'souls',amount:3,side}]);expect(observed).toEqual([3]);
  expect(gains(f.engine.castSkill(enemy.id))).toEqual([]);expect(observed).toEqual([3,3]);
  expect(gains(f.engine.castSkill(ally.id))).toEqual([{type:'economy-gain',currency:'souls',amount:3,side}]);expect(observed).toEqual([3,3,6]);
  f.engine.passTurn();expect(f.engine.castSkill(holder.id)).toEqual([]);expect(observed).toEqual([3,3,6]);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('death grants retain the deceased owner and execute once at action end (%s)',side=>{
  const holder=character(4,['valuable'],{hp:1});
  const f=harness({side:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,match:{size:3,skull:true},
   ...(side===PlayerSide.Left?{left:[holder,character(5)],right:[character(0)]}:{right:[holder,character(5)],left:[character(0)]})});
  const events=f.swap();expect(gains(events)).toEqual([{type:'economy-gain',currency:'gold',amount:25,side}]);
  expect(events.findIndex(e=>e.type==='economy-gain')).toBeGreaterThan(events.findIndex(e=>e.type==='defeat'));
  expect(gains(f.engine.passTurn())).toEqual([]);
 });
});

describe('PvP phase and target explanations agree with native mode-gated execution',()=>{
 it.each([false,true])('applies role-matched team bonuses and personal battle bonuses once (PvP=%s)',pvp=>{
  const left=[character(0,['siege','defender','virtueofhonor']),character(1,['siege'])];
  const right=[character(4,['siege','defender','virtueofhonor']),character(5,['defender'])];
  const f=harness({left,right,pvp});f.engine.takeInitialEvents();
  const snapshot=()=>[...left,...right].map(c=>({hp:c.hp,maxHp:c.maxHp,attack:c.attack,armor:c.armor,magic:c.magic}));
  expect(snapshot()).toEqual(pvp?[
   {hp:510,maxHp:510,attack:19,armor:10,magic:10},{hp:500,maxHp:500,attack:9,armor:0,magic:0},
   {hp:510,maxHp:510,attack:15,armor:16,magic:10},{hp:500,maxHp:500,attack:5,armor:6,magic:0},
  ]:[0,1,4,5].map(()=>({hp:500,maxHp:500,attack:5,armor:0,magic:0})));
  const before=snapshot();expect(f.engine.takeInitialEvents()).toEqual([]);expect(snapshot()).toEqual(before);
 });
 it.each([false,true])('PvP completion grants are separate from capped, multiplied collection (PvP=%s)',pvp=>{
  const description=describeAdaptedTrait(fixture({pvpEconomyGain:{currency:'gold',amount:7}}));
  expect(description.support).toBe('full');expect(description.description).toContain('投降不触发');
  expect(description.description).toContain('右方持有者不触发');expect(description.description).toContain('当前 ST 未提供 PvP 模式');
  const f=harness({pvp,left:[character(0,['moneybags','desc:pvp-gold'])],right:[character(4,['desc:pvp-gold'],{hp:1})]});
  f.state.economy.gold=1000;f.engine.castSkill(0);
  expect(f.state.winner).toBe(PlayerSide.Left);expect(f.state.economy.gold).toBe(pvp?1007:1000);
  expect(f.state.enemyGold??0).toBe(0);expect(f.engine.castSkill(0)).toEqual([]);
  expect(f.state.economy.gold).toBe(pvp?1007:1000);
 });
 it('surrender bypasses the PvP completion bonus',()=>{
  const f=harness({pvp:true,left:[character(0,['desc:pvp-gold'])]});
  expect(gains(f.engine.surrender(PlayerSide.Right))).toEqual([]);expect(f.state.economy.gold).toBe(0);
 });
 it('excludes defeated or stunned holders and defeated team targets at the opening',()=>{
  const left=[character(0,['siege'],{statuses:[{id:'stun',turns:4}]}),character(1,['siege'],{defeated:true,hp:0}),character(2,['siege'])];
  const f=harness({left,pvp:true});f.engine.takeInitialEvents();expect(left.map(c=>c.attack)).toEqual([7,5,7]);
 });
});
