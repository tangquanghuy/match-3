// worker-fast-02: seven entity-bound ordered native spells; no shared-review edits.
// @ts-expect-error independent saved English data
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error independent native spell source
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:6101,spell:7003,cost:9,colors:[BaseColor.Green,BaseColor.Yellow],description:"Deal [Magic + 3] damage to an Enemy. If the Enemy has Hunter's Mark, deal triple damage.",steps:['Damage'],base:3},
 {id:6373,spell:7525,cost:12,colors:[BaseColor.Purple,BaseColor.Brown],description:'Deal [Magic + 4] damage to an enemy. Deal triple damage if the enemy is Silenced.',steps:['Damage'],base:4},
 {id:6033,spell:7033,cost:6,colors:[BaseColor.Yellow,BaseColor.Purple],description:'Entangle an Enemy, and eliminate [Magic + 1] Armor from them.',steps:['CauseEntangle','DecreaseArmor'],base:1},
 {id:6073,spell:7143,cost:14,colors:[BaseColor.Blue,BaseColor.Yellow],description:'Silence all Enemies and myself.',steps:['CauseSilence','CauseSilence'],base:0},
 {id:6081,spell:7151,cost:11,colors:[BaseColor.Blue,BaseColor.Brown],description:'Give [Magic + 2] Attack to all Allies. Then Barrier the first Ally.',steps:['IncreaseAttack','CauseBarrier'],base:2},
 {id:6393,spell:7548,cost:10,colors:[BaseColor.Green,BaseColor.Red],description:'Deal [Magic + 6] damage to the first enemy, then Submerge myself.',steps:['Damage','CauseSubmerged'],base:6},
 {id:7425,spell:9119,cost:9,colors:[BaseColor.Green,BaseColor.Purple],description:'Create 8 Brown Gems and 8 Yellow Gems.',steps:['CreateGems','CreateGems'],base:8},
] as const;
type Case=typeof cases[number];
function setup(c:Case,side=PlayerSide.Left,magic=10){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic});
 const front=damageCharacter(1,{hp:120,attack:17,magic:4}),back=damageCharacter(2,{hp:150,attack:19,magic:7});
 const team=[front,f.caster,back];
 if(side===PlayerSide.Left) f.state.teams.Left.characters=team;
 else {f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=team;f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,front,back,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id} ordered native whole cast`,()=>{
 it('independent original English/native and final binding, mana and full registered segments',()=>{
  const en=english.find((v:{id:number})=>v.id===c.id)!,n=native.get(c.spell).raw,unit=TROOPS.find(t=>t.id===c.id)!;
  expect(en.stats.spell.desc).toBe(c.description);expect(en.stats.spell.id).toBe(c.spell);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(color=>`Color${color}`).sort());
  expect(n.Cost).toBe(c.cost);expect(n.SpellSteps.map((s:{Type:string})=>s.Type)).toEqual(c.steps);
  expect(unit).toMatchObject({manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(registry.prototypes.get(String(c.spell))?.segments).toHaveLength(c.steps.length);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`real ${side}: execute every step and target only the intended side`,()=>{
  for(const magic of [0,10]){
   const f=setup(c,side,magic);f.enemies[2].armor=c.id===6033?17:0;
   if(c.id===6101)f.enemies[2].statuses=[{id:'marked',turns:3}];
   if(c.id===6373)f.enemies[2].statuses=[{id:'silence',turns:3}];
   const events=f.cast();if(c.id!==7425) expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);if(c.id!==7425)expect(events.filter(e=>e.type==='extra-turn')).toHaveLength(0); // gem matches may grant ordinary cascade turns
   if(c.id===6101||c.id===6373){
    expect(events.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[12,3*(magic+c.base)]]);
    expect(f.enemies.filter(e=>e.hp<1000).map(e=>e.id)).toEqual([12]);
   }else if(c.id===6033){
    const status=events.findIndex(e=>e.type==='status-apply'&&e.statusId==='entangle'&&e.targetId===12);
    const armor=events.findIndex(e=>e.type==='buff'&&e.stat==='armor'&&e.targetId===12);
    expect(status).toBeGreaterThanOrEqual(0);expect(armor).toBeGreaterThan(status);
    expect(f.enemies[2].armor).toBe(17-(magic+1));expect(f.enemies.filter(e=>e.armor!==0).map(e=>e.id)).toEqual([12]);
   }else if(c.id===6073){
    const status=events.flatMap(e=>e.type==='status-apply'&&e.statusId==='silence'?[e.targetId]:[]);
    expect(status).toEqual([10,11,12,13,0]);
    expect(f.front.statuses.some(s=>s.id==='silence')).toBe(false);
    expect(f.back.statuses.some(s=>s.id==='silence')).toBe(false);
    expect(events.filter(e=>e.type==='skill-damage')).toHaveLength(0);
   }else if(c.id===6081){
    expect([f.front.attack,f.caster.attack,f.back.attack]).toEqual([17+magic+2,17+magic+2,19+magic+2]);
    expect(events.flatMap(e=>e.type==='buff'&&e.stat==='attack'?[e.targetId]:[])).toEqual([1,0,2]);
    expect(events.flatMap(e=>e.type==='status-apply'&&e.statusId==='barrier'?[e.targetId]:[])).toEqual([1]);
    expect(f.enemies.every(e=>e.attack===17)).toBe(true);
   }else if(c.id===6393){
    const hit=events.findIndex(e=>e.type==='skill-damage'&&e.targetId===10&&e.damage===magic+6);
    const dive=events.findIndex(e=>e.type==='status-apply'&&e.statusId==='submerged'&&e.targetId===0);
    expect(hit).toBeGreaterThanOrEqual(0);expect(dive).toBeGreaterThan(hit);
    expect(f.enemies.map(e=>e.hp)).toEqual([1000-magic-6,1000,1000,1000]);
   }else if(c.id===7425){
    const changes=events.flatMap(e=>e.type==='gem-create'?e.spawns.map(s=>s.gemType):e.type==='gem-transform'?e.changes.map(x=>x.to):[]);
    expect(changes.filter(g=>g.kind==='color'&&g.color===BaseColor.Brown)).toHaveLength(8);
    expect(changes.filter(g=>g.kind==='color'&&g.color===BaseColor.Yellow)).toHaveLength(8);
    expect(events.filter(e=>e.type==='skill-damage')).toHaveLength(0);
    expect(events.filter(e=>e.type==='extra-turn').map(e=>e.type==='extra-turn'?e.source:null)).toEqual(['match']); // deterministic board cascade, never spell-granted
   }
  }
 });
 it('blocked low mana and caster silence preserve mana, enemy/team stats, board, action',()=>{
  for(const reason of ['low','silence']){const f=setup(c),board=JSON.stringify(f.board),enemies=JSON.stringify(f.enemies),team=JSON.stringify([f.front,f.back]);
   if(reason==='low')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
   expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(reason==='low'?c.cost-1:c.cost);
   expect(JSON.stringify(f.enemies)).toBe(enemies);expect(JSON.stringify([f.front,f.back])).toBe(team);
   expect(JSON.stringify(f.board)).toBe(board);expect(f.state.actionLog).toHaveLength(0);
  }
 });
});
for(const id of [6101,6373] as const)describe(`troop:${id} conditional false/true and barrier`,()=>{
 const c=cases.find(x=>x.id===id)!;
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])it(`${side}, magic ${magic}, no status vs target status, armor and barrier`,()=>{
  for(const condition of [false,true]){
   const f=setup(c,side,magic),target=f.enemies[2];target.armor=3;
   if(condition)target.statuses=[{id:id===6101?'marked':'silence',turns:3}];
   const damage=(magic+c.base)*(condition?3:1),ev=f.cast();
   expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([damage]);
   expect(target.hp).toBe(1000-Math.max(0,damage-3));expect(f.enemies.filter(e=>e.hp!==1000).map(e=>e.id)).toEqual(damage>3?[12]:[]);
  }
  const guarded=setup(c,side,magic);guarded.enemies[2].statuses=[{id:'barrier',turns:3}];
  const ev=guarded.cast();expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(0);
  expect(guarded.enemies[2].hp).toBe(1000);expect(guarded.caster.mana).toBe(0);
 });
});

// Step ordering, target liveness, stat floors and board capacity for the remaining native branches.
describe('troop:6033 entangle precedes armor reduction even at the armor floor',()=>{
 const c=cases.find(v=>v.id===6033)!;
 for(const armor of [0,1,17])it('armor='+armor,()=>{
  const f=setup(c);f.enemies[2].armor=armor;
  const ev=f.cast(),status=ev.findIndex(e=>e.type==='status-apply'&&e.targetId===12&&e.statusId==='entangle');
  expect(status).toBeGreaterThanOrEqual(0);
  expect(f.enemies[2].armor).toBe(Math.max(0,armor-11));
  expect(f.enemies.filter(e=>e.id!==12).every(e=>e.armor===0&&!e.statuses.some(s=>s.id==='entangle'))).toBe(true);
 });
});
describe('troop:6073 all living enemies before self, never other allies',()=>{
 const c=cases.find(v=>v.id===6073)!;
 it('defeated enemy ignored, caster silence still applied last',()=>{
  const f=setup(c);f.enemies[3].defeated=true;f.enemies[3].hp=0;
  const applied=f.cast().flatMap(e=>e.type==='status-apply'&&e.statusId==='silence'?[e.targetId]:[]);
  expect(applied).toEqual([10,11,12,0]);expect(f.enemies[3].statuses).toEqual([]);
 });
});
describe('troop:6081 front ally is first living ally, even when its predecessor fell',()=>{
 const c=cases.find(v=>v.id===6081)!;
 it('skip dead front, buff living allies then barrier new front',()=>{
  const f=setup(c);f.front.defeated=true;f.front.hp=0;
  const ev=f.cast();expect(ev.flatMap(e=>e.type==='buff'&&e.stat==='attack'?[e.targetId]:[])).toEqual([0,2]);
  expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='barrier'?[e.targetId]:[])).toEqual([0]);
  expect(f.front.attack).toBe(17);expect(f.back.attack).toBe(31);
 });
});
describe('troop:6393 second step runs after a lethal or blocked first hit',()=>{
 const c=cases.find(v=>v.id===6393)!;
 for(const mode of ['lethal','barrier'] as const)it(mode,()=>{
  const f=setup(c);if(mode==='lethal')f.enemies[0].hp=1;else f.enemies[0].statuses=[{id:'barrier',turns:3}];
  const ev=f.cast();expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='submerged'?[e.targetId]:[])).toEqual([0]);
  expect(mode==='lethal'?ev.some(e=>e.type==='defeat'&&e.characterId===10):f.enemies[0].hp===1000).toBe(true);
  expect(f.enemies.slice(1).every(e=>e.hp===1000)).toBe(true);
 });
});
describe('troop:7425 native brown-before-yellow creation and full-board conversion',()=>{
 const c=cases.find(v=>v.id===7425)!;
 for(const side of [PlayerSide.Left,PlayerSide.Right])it('full board converts exactly eight of each in native sequence, not final board counts',()=>{
  const f=setup(c,side);const ev=f.cast();
  const changes=ev.flatMap(e=>e.type==='gem-create'?e.spawns.map(x=>x.gemType):e.type==='gem-transform'?e.changes.map(x=>x.to):[]);
  expect(changes.slice(0,8)).toEqual(Array(8).fill({kind:'color',color:BaseColor.Brown}));
  expect(changes.slice(8,16)).toEqual(Array(8).fill({kind:'color',color:BaseColor.Yellow}));
  expect(f.state.actionLog).toHaveLength(1);
 });
});
// Status scope and immunity are checked on the same real cast, not inferred from isolated helpers.
for (const id of [6033,6073,6081,6393] as const) describe(`troop:${id} status duration and Blessed boundary`,()=>{
 const c=cases.find(v=>v.id===id)!;
 for (const side of [PlayerSide.Left,PlayerSide.Right]) it(`${side}: three-turn status and Blessed blocks only the status step`,()=>{
  const normal=setup(c,side);
  const expected=id===6033?'entangle':id===6073?'silence':id===6081?'barrier':'submerged';
  const applied=normal.cast().filter(e=>e.type==='status-apply'&&e.statusId===expected);
  expect(applied.length).toBe(id===6073?5:1);
  expect(applied.every(e=>e.type==='status-apply'&&e.turns===3)).toBe(true);
  const f=setup(c,side);
  if(id===6033)f.enemies[2].statuses=[{id:'blessed',turns:3}];
  else if(id===6073){f.enemies[2].statuses=[{id:'blessed',turns:3}];f.caster.statuses=[{id:'blessed',turns:3}];}
  else if(id===6081)f.front.statuses=[{id:'blessed',turns:3}];
  else f.caster.statuses=[{id:'blessed',turns:3}];
  const events=f.cast(), status=events.filter(e=>e.type==='status-apply'&&e.statusId===expected);
  if(id===6033){expect(status).toHaveLength(0);expect(f.enemies[2].armor).toBe(0);}
  // R004 (sa-L5 2026-09-28): the caster's own Blessed ends when it casts (before the spell body),
  // so a self-targeted status now lands on the caster; an enemy's Blessed still blocks.
  if(id===6073){expect(status.flatMap(e=>e.type==='status-apply'?[e.targetId]:[])).toEqual([10,11,13,0]);}
  if(id===6081){expect(status).toHaveLength(0);expect(f.front.attack).toBe(29);}
  if(id===6393){expect(status).toHaveLength(1);expect(f.enemies[0].hp).toBe(984);}
  expect(f.state.actionLog).toHaveLength(1);
 });
});
