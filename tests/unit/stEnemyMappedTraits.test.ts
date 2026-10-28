import {WIGHT_SOURCE} from '../fixtures/stEnemyMappedSources';
import {describe,expect,it} from 'vitest';
import type {GameEvent} from '../../src/engine/events';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem,skullGem} from '../../src/engine/types';
import type {EffectSegment,SkillPrototype} from '../../src/engine/skills/prototypes';
import {
 alias,battle,cast,dummy,go,mappedSource,openingExpected,otherSide,stats,swap,
} from '../helpers/stMappedHarness';
import type {MappedRow,Run} from '../helpers/stMappedHarness';

// Ordinary mechanics only. Opening color/bond auras (including all of 6105) are
// covered by the generic mapped-source suite. Native rule references:
// traits.test.ts, traitCombatMechs.test.ts, traitEconomyAura.test.ts,
// economyEngine.test.ts and traitDeathSummon.test.ts.
// The oracle is the frozen source fixture; no adapted trait/prototype is read.
type FrozenTrait={
 code:string;
 dodgeChance?:number;
 battleStartManaRatio?:number;
 onDamagedGain?:{stat:'attack';amount:number};
 regen?:{stat:'hp';amount:number};
 onBigMatchGain?:{stat:'hp';amount:number};
 skullDamageReduction?:number;
 skullMultVsTroopType?:{troopType:string;mult:number};
 manaLink?:{color:BaseColor;amount:number};
 battleEconomyGain?:{currency:'souls';ratio:number};
 statusImmunities?:readonly string[];
 summonOnEnemyDeath?:{chance:number;troopId:number;referenceName:string;displayName:string};
 onBigMatchEconomy?:{currency:'gold';amount:number};
 enemyMasteryMult?:number;
};
function sourceTrait(row:MappedRow,code:string):FrozenTrait {
 const trait=(row.sourceTraits as readonly FrozenTrait[]).find(t=>t.code===code);
 if(!trait)throw new Error(`${row.enemyId}: missing frozen ${code}`);
 return trait;
}
const probe=(...segments:EffectSegment[]):SkillPrototype=>({segments});
const hit=(amount:number,trueDamage=false):EffectSegment=>({kind:'damage',target:'enemyChosen',scaling:{base:amount,mult:0},trueDamage});
const damageTo=(events:GameEvent[],id:number)=>events.filter(e=>e.type==='skull-damage'&&e.targetId===id);
const bigGroups=(events:GameEvent[])=>events.filter(e=>e.type==='elimination'&&e.cells.length>=4);
const hpBuffs=(events:GameEvent[],id:number)=>events.filter(e=>e.type==='buff'&&e.source==='trait'&&e.targetId===id&&e.stat==='hp');
const manaGains=(events:GameEvent[],id:number)=>events.filter(e=>e.type==='mana-gain'&&e.characterId===id);
const sides=[PlayerSide.Left,PlayerSide.Right];

// Reuse the native N-match stimulus. Only the board changes; the mapped subject
// keeps every compiled trait and its actual source skill throughout the battle.
function matchN(run:Run,size:number,color=BaseColor.Red) {
 const palette=[BaseColor.Green,BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple].filter(c=>c!==color);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)run.state.board.set({row,col},{id:row*8+col+1,type:colorGem(palette[(row+col)%palette.length]!)});
 for(let col=0;col<8;col++)run.state.board.set({row:7,col},{id:70+col,type:colorGem(col<size&&col!==2?color:palette[col%palette.length]!)});
 run.state.board.set({row:6,col:2},{id:62,type:colorGem(color)});
 run.state.board.set({row:5,col:2},{id:52,type:colorGem(palette[1]!)});
 return run.session.resolve({type:'swap',from:{row:7,col:2},to:{row:6,col:2}});
}

function firstMatch(events:GameEvent[],size:number) {
 const first=events.find(e=>e.type==='elimination');
 expect(first?.type).toBe('elimination');
 if(first?.type!=='elimination')throw new Error('Expected the real swap to eliminate gems');
 expect(first.cells).toHaveLength(size);
 return first;
}

// These native seeded first rolls straddle both 20% dodge and 50% summon.
// Check the roll before the action, without consuming the battle RNG or replacing
// engine methods. Skull matching resolves its hit before gravity/refill.
function chanceBranch(run:Run,chance:number,success:boolean) {
 const roll=new SeededRNG(run.rng.getState()).next();
 expect(roll<chance).toBe(success);
}

describe('ST-04 mapped ordinary traits: 6016 Centaur Scout',()=>{
 const row=mappedSource(6016);
 for(const side of sides) {
  it(`fast fills the frozen fraction of source mana once on side ${side}`,()=>{
   const ratio=sourceTrait(row,'fast').battleStartManaRatio!;
   const run=battle(row,{side});
   expect(run.caster.mana).toBe(Math.floor(row.sourceTroop.manaCost*ratio));
   run.caster.mana=0;
   go(run,otherSide(side));go(run,side);
   expect(run.caster.mana).toBe(0);
  });
  for(const [seed,dodged] of [[7,true],[1,false]] as const)it(`agile ${dodged?'dodges':'takes'} an actual opposing skull match on side ${side}`,()=>{
   const chance=sourceTrait(row,'agile').dodgeChance!;
   const run=battle(row,{side,startSide:otherSide(side),seed,match:skullGem()});
   const before=stats(run.caster),foeAttack=run.inputs.opposing[0]!.stats.attack;
   chanceBranch(run,chance,dodged);
   const events=swap(run);firstMatch(events,3);
   expect(events.some(e=>e.type==='attack-struggle'&&e.reason==='dodge')).toBe(dodged);
   expect(damageTo(events,run.caster.id).map(e=>e.type==='skull-damage'?e.damage:0)).toEqual(dodged?[]:[foeAttack]);
   const damage=dodged?0:foeAttack;
   expect(stats(run.caster)).toEqual({...before,armor:Math.max(0,before.armor-damage),hp:before.hp-Math.max(0,damage-before.armor)});
   expect(run.session.recordedEvents()).toEqual(expect.arrayContaining(events));
  });
 }
});

describe('ST-04 mapped ordinary traits: 6026 Owlbear',()=>{
 const row=mappedSource(6026);
 for(const side of sides) {
  it(`frenzy gains source attack from a real skull hit on side ${side}`,()=>{
   const gain=sourceTrait(row,'frenzy').onDamagedGain!;
   const run=battle(row,{side,startSide:otherSide(side),match:skullGem(),opponents:[dummy('front',{stats:{hp:1000,armor:40,attack:4,magic:0}})]});
   const before=stats(run.caster),events=swap(run);firstMatch(events,3);
   expect(damageTo(events,run.caster.id)).toHaveLength(1);
   expect(run.caster.armor).toBe(before.armor-4);
   expect(run.caster.attack).toBe(before.attack+gain.amount);
   expect(events).toContainEqual(expect.objectContaining({type:'buff',source:'trait',targetId:run.caster.id,stat:gain.stat,amount:gain.amount}));
  });
  // Known native difference predating ST mapping: gainOnDamaged runs for skull hits only.
  // ST mapping preserves this existing native spell behavior; skull activation is tested above.
  it(`frenzy preserves native spell damage not triggering attack gain and respects a blocked hit on side ${side}`,()=>{
   const gain=sourceTrait(row,'frenzy').onDamagedGain!;
   const run=battle(row,{side,probe:probe(hit(4))});
   const before=stats(run.caster),events=cast(run,run.caster,run.foes[0]!);
   expect(events).toContainEqual(expect.objectContaining({type:'skill-damage',targetId:run.caster.id,damage:4}));
   expect(run.caster.armor).toBe(before.armor-4);
   expect(run.caster.attack).toBe(before.attack);
   expect(events.some(e=>e.type==='buff'&&e.source==='trait'&&e.targetId===run.caster.id&&e.stat===gain.stat)).toBe(false);
   const blocked=battle(row,{side,probe:probe({kind:'status',target:'enemyChosen',statusId:'barrier',turns:3},hit(4))});
   const blockedBefore=stats(blocked.caster),blockedEvents=cast(blocked,blocked.caster,blocked.foes[0]!);
   expect(blockedEvents).toContainEqual(expect.objectContaining({type:'status-expire',targetId:blocked.caster.id,statusId:'barrier',reason:'consumed'}));
   expect(blockedEvents.some(e=>e.type==='skill-damage'&&e.targetId===blocked.caster.id)).toBe(false);
   expect(stats(blocked.caster)).toEqual(blockedBefore);
  });
  it(`regeneration heals only at its own turn start, caps at max HP and stays quiet at full HP on side ${side}`,()=>{
   const regen=sourceTrait(row,'regeneration').regen!;
   const run=battle(row,{side});
   run.caster.hp-=2;
   const wounded=stats(run.caster);
   const opposing=run.session.passTurn();
   expect(run.state.activePlayer).toBe(otherSide(side));
   expect(run.caster.hp).toBe(wounded.hp);
   expect(hpBuffs(opposing,run.caster.id)).toEqual([]);
   const healed=run.session.passTurn();
   expect(run.state.activePlayer).toBe(side);
   expect(run.caster.hp).toBe(wounded.hp+regen.amount);
   expect(run.caster.maxHp).toBe(wounded.maxHp);
   expect(hpBuffs(healed,run.caster.id)).toContainEqual(expect.objectContaining({amount:regen.amount}));
   run.session.passTurn();run.session.passTurn();
   expect(run.caster.hp).toBe(wounded.maxHp);
   run.session.passTurn();
   const full=run.session.passTurn();
   expect(run.caster.hp).toBe(wounded.maxHp);
   expect(hpBuffs(full,run.caster.id)).toEqual([]);
  });
 }
});

describe('ST-04 mapped ordinary traits: 6027 Treant',()=>{
 const row=mappedSource(6027);
 for(const side of sides) {
  for(const size of [3,4,5])it(`big handles a real ${size}-match on side ${side}`,()=>{
   const gain=sourceTrait(row,'big').onBigMatchGain!;
   const run=battle(row,{side,seed:5}),before=openingExpected(run)[0]!;
   const allies=run.state.teams[side].characters.slice(1).map(c=>[c.hp,c.maxHp]);
   const events=matchN(run,size);firstMatch(events,size);
   const count=bigGroups(events).length;
   expect(count).toBe(size>=4?1:0);
   expect(run.caster.hp).toBe(before.hp+count*gain.amount);
   expect(run.caster.maxHp).toBe(before.maxHp+count*gain.amount);
   expect(hpBuffs(events,run.caster.id)).toHaveLength(count);
   expect(run.state.teams[side].characters.slice(1).map(c=>[c.hp,c.maxHp])).toEqual(allies);
  });
  it(`big ignores the opponent's actual four-match on side ${side}`,()=>{
   const run=battle(row,{side,startSide:otherSide(side),seed:5}),before=stats(run.caster);
   const events=matchN(run,4);firstMatch(events,4);
   expect(bigGroups(events)).toHaveLength(1);
   expect(stats(run.caster)).toEqual(before);
   expect(hpBuffs(events,run.caster.id)).toEqual([]);
  });
 }
});

// Native damage rounding and armor-first subtraction apply to both reductions.
for(const [id,code] of [[6027,'stoneskin'],[6029,'armored']] as const)describe(`ST-04 ${id} ${code}`,()=>{
 const row=mappedSource(id),reduction=sourceTrait(row,code).skullDamageReduction!;
 for(const side of sides)for(const attack of [1,2,10,11,12])it(`rounds ${attack} incoming skull damage and leaves spell damage intact on side ${side}`,()=>{
  const run=battle(row,{side,startSide:otherSide(side),match:skullGem(),opponents:[dummy('front',{stats:{hp:1000,armor:40,attack,magic:0}})],probe:probe(hit(4))});
  const before=stats(run.caster),events=swap(run),damage=Math.round(attack*(1-reduction));
  firstMatch(events,3);
  expect(damageTo(events,run.caster.id).map(e=>e.type==='skull-damage'?e.damage:0)).toEqual([damage]);
  expect(run.caster.armor).toBe(Math.max(0,before.armor-damage));
  expect(run.caster.hp).toBe(before.hp-Math.max(0,damage-before.armor));
  const spellBefore=stats(run.caster),spell=cast(run,run.caster,run.foes[0]!);
  expect(spell).toContainEqual(expect.objectContaining({type:'skill-damage',targetId:run.caster.id,damage:4}));
  expect(run.caster.hp+run.caster.armor).toBe(spellBefore.hp+spellBefore.armor-4);
 });
});

describe('ST-04 mapped ordinary traits: 6029 Paladin',()=>{
 const row=mappedSource(6029);
 for(const side of sides) {
  for(const matches of [true,false])it(`dragonslayer ${matches?'matches':'excludes'} mechanical affinity on side ${side}`,()=>{
   const rule=sourceTrait(row,'dragonslayer').skullMultVsTroopType!;
   const target=dummy('front',{name:matches?'unrelated narrative name':rule.troopType,troopTypes:[alias(matches?rule.troopType:'Beast')]});
   const run=battle(row,{side,match:skullGem(),opponents:[target,dummy('back')]}),before=stats(run.foes[0]!);
   const attack=openingExpected(run)[0]!.attack,events=swap(run),damage=attack*(matches?rule.mult:1);
   firstMatch(events,3);
   expect(damageTo(events,run.foes[0]!.id).map(e=>e.type==='skull-damage'?e.damage:0)).toEqual([damage]);
   expect(run.foes[0]!.hp+run.foes[0]!.armor).toBe(before.hp+before.armor-damage);
   expect(stats(run.foes[1]!)).toEqual({hp:1000,maxHp:1000,armor:40,attack:12,magic:0,mana:0});
  });
  for(const yellow of [true,false])it(`airlink ${yellow?'adds its yellow bonus':'leaves green unchanged'} after a real three-match on side ${side}`,()=>{
   const link=sourceTrait(row,'airlink').manaLink!,color=yellow?link.color:BaseColor.Green;
   const run=battle(row,{side,match:colorGem(color)}),events=swap(run),amount=3+(yellow?link.amount:0);
   firstMatch(events,3);
   expect(run.caster.mana).toBe(amount);
   expect(manaGains(events,run.caster.id)).toEqual([expect.objectContaining({color,amount,player:side})]);
   expect(run.foes.every(c=>c.mana===0)).toBe(true);
  });
 }
});

describe('ST-04 mapped ordinary traits: 6074 Keeper of Souls',()=>{
 const row=mappedSource(6074);
 for(const side of sides) {
  for(const requested of [9,201])it(`necromancy applies the native player-only multiplier and cap to ${requested} live souls with holder on side ${side}`,()=>{
   const ratio=sourceTrait(row,'necromancy').battleEconomyGain!.ratio;
   const run=battle(row,{side,allies:[dummy('collector')],opponents:[dummy('opposing-collector')],probe:probe({kind:'gainEconomy',currency:'souls',scaling:{base:requested,mult:0}})});
   const multiplier=1+(side===PlayerSide.Left?ratio:0),expected=Math.min(Math.floor(200*multiplier),Math.floor(requested*multiplier));
   const collector=run.byName(side===PlayerSide.Left?'collector':'opposing-collector');
   const events=cast(run,run.caster,collector);
   expect(run.state.economy.souls).toBe(expected);
   expect(events.filter(e=>e.type==='economy-gain'&&e.currency==='souls')).toEqual([expect.objectContaining({amount:expected,side:PlayerSide.Left})]);
   expect(run.state.economy.gold).toBe(0);
   expect(run.session.recordedEvents()).toEqual(expect.arrayContaining(events));
  });
  for(const statusId of sourceTrait(row,'undying').statusImmunities!)it(`undying blocks ${statusId} in a hostile spell with a susceptible control on side ${side}`,()=>{
   const run=battle(row,{side,probe:probe({kind:'status',target:'enemyAll',statusId,turns:3})});
   const events=cast(run,run.caster,run.foes[0]!);
   expect(events).toContainEqual(expect.objectContaining({type:'status-blocked',targetId:run.caster.id,statusId,reason:'immune'}));
   expect(events).toContainEqual(expect.objectContaining({type:'status-apply',targetId:run.byName('plain').id,statusId}));
   expect(run.caster.statuses.some(s=>s.id===statusId)).toBe(false);
  });
  it(`undying still accepts an unrelated negative status on side ${side}`,()=>{
   const run=battle(row,{side,probe:probe({kind:'status',target:'enemyChosen',statusId:'burning',turns:3})});
   const events=cast(run,run.caster,run.foes[0]!);
   expect(events).toContainEqual(expect.objectContaining({type:'status-apply',targetId:run.caster.id,statusId:'burning'}));
   expect(events.some(e=>e.type==='status-blocked'&&e.targetId===run.caster.id&&e.statusId==='burning')).toBe(false);
  });
 }
});

describe('ST-04 mapped ordinary traits: 6098 Peasant',()=>{
 const row=mappedSource(6098);
 for(const side of sides) {
  for(const size of [3,4,5])it(`greedy credits actual ${size}-match gold to the matching side ${side}`,()=>{
   const gain=sourceTrait(row,'greedy').onBigMatchEconomy!;
   const run=battle(row,{side,seed:5}),events=matchN(run,size);firstMatch(events,size);
   const groups=bigGroups(events);
   expect(groups).toHaveLength(size>=4?1:0);
   const gains=events.filter(e=>e.type==='economy-gain'&&e.currency===gain.currency);
   expect(gains.map(e=>e.type==='economy-gain'?[e.amount,e.side]:[])).toEqual(size>=4?[[size,side],[gain.amount,side]]:[]);
   const total=size>=4?size+gain.amount:0;
   expect(run.state.economy.gold).toBe(side===PlayerSide.Left?total:0);
   expect(run.state.enemyGold).toBe(side===PlayerSide.Right?total:0);
   expect(run.session.recordedEvents()).toEqual(expect.arrayContaining(gains));
  });
  it(`greedy excludes an opposing four-match with holder on side ${side}`,()=>{
   const run=battle(row,{side,startSide:otherSide(side),seed:5}),events=matchN(run,4);firstMatch(events,4);
   expect(events.filter(e=>e.type==='economy-gain'&&e.currency==='gold')).toEqual([expect.objectContaining({amount:4,side:otherSide(side)})]);
   expect(run.state.economy.gold).toBe(side===PlayerSide.Right?4:0);
   expect(run.state.enemyGold).toBe(side===PlayerSide.Left?4:0);
  });
  for(const size of [3,4])it(`jinx halves opponent mana from a real ${size}-match with holder on side ${side}`,()=>{
   const factor=sourceTrait(row,'jinx').enemyMasteryMult!;
   const run=battle(row,{side,startSide:otherSide(side),seed:5,opponents:[dummy('receiver',{manaColors:[BaseColor.Red]})]}),events=matchN(run,size);
   firstMatch(events,size);
   const expected=Math.floor(size*factor),receiver=run.foes[0]!;
   expect(receiver.mana).toBe(expected);
   expect(manaGains(events,receiver.id)).toEqual([expect.objectContaining({color:BaseColor.Red,amount:expected,player:otherSide(side)})]);
   expect(run.caster.mana).toBe(0);
  });
  it(`jinx does not suppress its own team's mana on side ${side}`,()=>{
   const run=battle(row,{side,seed:5,allies:[dummy('receiver',{manaColors:[BaseColor.Red]})]}),events=matchN(run,4);
   firstMatch(events,4);
   expect(run.byName('receiver').mana).toBe(4);
   expect(manaGains(events,run.byName('receiver').id)).toEqual([expect.objectContaining({color:BaseColor.Red,amount:4,player:side})]);
  });
 }
});

describe('ST-04 mapped ordinary traits: 6074 Soul Legion death pipeline',()=>{
 const row=mappedSource(6074),spec=sourceTrait(row,'soullegion').summonOnEnemyDeath!;
 const lethal=probe(hit(1000,true));
 for(const side of sides) {
  for(const [level,difficulty] of [[1,1],[20,1],[20,1.5],[7,1.3]] as const)for(const [seed,success] of [[7,true],[1,false]] as const)it(`enemy death ${success?'summons':'fails its summon roll'} at ${level}@${difficulty} on side ${side}`,()=>{
   const run=battle(row,{side,level,difficulty,seed,allies:[dummy('killer')],probe:lethal});
   const before=run.state.teams[side].characters.map(stats),victim=run.byName('chosen');
   chanceBranch(run,spec.chance,success);
   const expectedRng=new SeededRNG(run.rng.getState());expectedRng.next();
   const events=cast(run,victim,run.byName('killer'));
   expect(events).toContainEqual({type:'defeat',characterId:victim.id});
   expect(run.foes.some(c=>c.id===victim.id)).toBe(false);
   const summons=events.filter(e=>e.type==='summon');
   expect(summons).toHaveLength(success?1:0);
   expect(run.state.teams[side].characters.slice(0,2).map(stats)).toEqual(before);
   expect(run.state.teams[side].characters).toHaveLength(success?3:2);
   expect(run.rng.getState()).toBe(expectedRng.getState());
   if(success) {
    const summoned=run.state.teams[side].characters[2]!;
    expect(summons[0]).toMatchObject({player:side,troopId:spec.troopId,characterId:summoned.id,slot:2,destination:'field'});
    expect(summoned).toMatchObject({mechanicalIdentity:`unit:${spec.troopId}`,battleScaling:{level,difficulty},mana:0,defeated:false,statuses:[]});
    expect(summoned.name).not.toContain(spec.displayName);
    expect(summoned.name).not.toContain(spec.referenceName);
    const panel=(WIGHT_SOURCE.stats as Record<string,{hp:number;armor:number;attack:number;magic:number}>)[`${level}@${difficulty}`]!;
    expect(stats(summoned)).toEqual({...panel,maxHp:panel.hp,mana:0});
    expect(summoned).toMatchObject({skillId:`st:${WIGHT_SOURCE.sourceTroop.spell.id}`,manaCost:WIGHT_SOURCE.sourceTroop.manaCost,colors:WIGHT_SOURCE.sourceTroop.manaColors,traitIds:WIGHT_SOURCE.sourceTroop.traits.map(t=>`st:${t.code}`),troopTypes:WIGHT_SOURCE.sourceTroop.troopTypes.map(alias)});
    expect(events.findIndex(e=>e.type==='defeat'&&e.characterId===victim.id)).toBeLessThan(events.findIndex(e=>e.type==='summon'));
    expect(summons[0]?.form).toMatchObject({id:summoned.id,name:summoned.name,mechanicalIdentity:`unit:${spec.troopId}`,battleScaling:{level,difficulty}});
    expect(run.state.teams[otherSide(side)].characters.some(c=>c.mechanicalIdentity===`unit:${spec.troopId}`)).toBe(false);
   }
   expect(run.session.recordedEvents()).toEqual(expect.arrayContaining(events));
   // The derived form is checked against a separately frozen source and growth oracle.
  });
  for(const [seed,success] of [[7,true],[1,false]] as const)it(`full team remains at four after a ${success?'successful':'failed'} Soul Legion roll on side ${side}`,()=>{
   // summonEffect.test.ts: full active teams discard the summon, without queueing.
   const run=battle(row,{side,seed,allies:[dummy('killer'),dummy('spare-1'),dummy('spare-2')],probe:lethal});
   const before=run.state.teams[side].characters.map(stats),victim=run.byName('chosen');
   chanceBranch(run,spec.chance,success);
   const expectedRng=new SeededRNG(run.rng.getState());expectedRng.next();
   const events=cast(run,victim,run.byName('killer'));
   expect(events).toContainEqual({type:'defeat',characterId:victim.id});
   expect(events.filter(e=>e.type==='summon')).toEqual([]);
   expect(run.state.teams[side].characters.map(stats)).toEqual(before);
   expect(run.state.teams[side].characters).toHaveLength(4);
   expect(run.state.teams[side].summonQueue??[]).toEqual([]);
   expect(run.rng.getState()).toBe(expectedRng.getState());
  });
  for(const holderDies of [false,true])it(`Soul Legion ignores ${holderDies?'its own':'another ally death'} on side ${side}`,()=>{
   const run=battle(row,{side,seed:7,allies:[dummy('ally'),dummy('spare')],probe:lethal});
   const victim=holderDies?run.caster:run.byName('ally'),rng=run.rng.getState();
   const events=cast(run,victim,run.foes[0]!);
   expect(events).toContainEqual({type:'defeat',characterId:victim.id});
   expect(events.some(e=>e.type==='summon')).toBe(false);
   expect(Object.values(run.state.teams).flatMap(t=>t.characters).some(c=>c.mechanicalIdentity===`unit:${spec.troopId}`)).toBe(false);
   expect(run.rng.getState()).toBe(rng);
  });
 }
});
