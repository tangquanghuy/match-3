// Dedicated per-troop source and actual TurnEngine.castSkill evidence, not a shared spell-id inventory check.
// @ts-expect-error Node-only stored source fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Node native snapshot decoder
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:6548,spell:7742,cost:10,colors:[BaseColor.Green,BaseColor.Purple],text:'Deal [Magic + 4] damage to an enemy. Deal double damage if the enemy is Enraged.',base:4,position:'chosen',rider:'rage',order:'damage-only',nativeSteps:[{Type:'Damage',Target:'FromTarget',Amount:4,SpellPowerMultiplier:1,StatusModifier:'MultiplyForEnraged',StatusAmount:2}],segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1},condMult:{times:2,cond:{kind:'targetStatus',statusId:'rage'}}}]},
 {id:6048,spell:7048,cost:8,colors:[BaseColor.Red],text:'Deal [Magic + 2] damage to the first Enemy, and Silence them.',base:2,position:'front',rider:'silence',order:'damage-status',nativeSteps:[{Type:'Damage',Target:'FrontEnemy',Amount:2,SpellPowerMultiplier:1},{Type:'CauseSilence',Target:'FrontEnemy',Amount:1}],segments:[{kind:'damage',target:'enemyFront',scaling:{base:2,mult:1}},{kind:'status',target:'enemyFront',statusId:'silence',turns:3}]},
 {id:6164,spell:7290,cost:11,colors:[BaseColor.Green,BaseColor.Red],text:'Deal [Magic + 4] damage to an Enemy and Burn them.',base:4,position:'chosen',rider:'burning',order:'damage-status',nativeSteps:[{Type:'Damage',Target:'FromTarget',Amount:4,SpellPowerMultiplier:1},{Type:'CauseBurning',Target:'FromTarget',Amount:1}],segments:[{kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1}},{kind:'status',target:'enemyChosen',statusId:'burning',turns:3,magnitude:3}]},
 {id:6020,spell:7020,cost:8,colors:[BaseColor.Red],text:'Deal [Magic + 3] damage to an Enemy. If the Enemy is Poisoned, deal double damage. Then Poison them.',base:3,position:'chosen',rider:'poison',order:'damage-status',nativeSteps:[{Type:'Damage',Target:'FromTarget',Amount:3,SpellPowerMultiplier:1,StatusModifier:'MultiplyForPoison',StatusAmount:2},{Type:'CausePoison',Target:'FromTarget'}],segments:[{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1},condMult:{times:2,cond:{kind:'targetStatus',statusId:'poison'}}},{kind:'status',target:'enemyChosen',statusId:'poison',turns:3,magnitude:3}]},
] as const;
type Case=typeof cases[number];
function fixture(c:Case,side:PlayerSide=PlayerSide.Left,chosen=12,magic=11){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,magic,colors:[...c.colors]});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(chosen));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`worker-01 troop:${c.id} spell:${c.spell} full native step cast`,()=>{
 it('independent English clauses, SpellId, native ordered steps, original colours/cost, final Chinese and registered segments',()=>{
  const en=english.find((v:{id:number})=>v.id===c.id)!, final=TROOPS.find(v=>v.id===c.id)!, n=native.get(c.spell).raw;
  expect(en.SpellId).toBe(c.spell);expect(en.stats.spell.id).toBe(c.spell);expect(en.stats.spell.desc).toBe(c.text);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(x=>`Color${x}`).sort());
  expect(n.Id).toBe(c.spell);expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(c.nativeSteps.length);
  c.nativeSteps.forEach((step,i)=>expect(n.SpellSteps[i]).toMatchObject(step));
  expect(final).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(final.spell.description.length).toBeGreaterThan(6);
  expect(registry.prototypes.get(String(c.spell))).toEqual({segments:c.segments});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const chosen of (c.position==='front'?[10,13]:[10,13]))for(const magic of [0,11])
  it(`${side} chosen=${chosen} magic=${magic} positive real cast, correct target/order`,()=>{
   const f=fixture(c,side,chosen,magic),targetId=c.position==='front'?10:chosen;
   const events=f.cast(),hits=events.filter(e=>e.type==='skill-damage');
   expect(events[0]).toMatchObject({type:'skill-cast',skillId:String(c.spell)});
   expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[targetId,magic+c.base]]);
   expect(f.enemies.filter(e=>e.id!==targetId).every(e=>e.hp===1000&&e.statuses.length===0)).toBe(true);
   const status=events.findIndex(e=>e.type==='status-apply'&&e.statusId===c.rider&&e.targetId===targetId);
   if(c.rider==='rage') expect(status).toBe(-1);
   else {expect(status).toBeGreaterThanOrEqual(0);expect(events.findIndex(e=>e.type==='skill-damage')).toBeLessThan(status);}
   expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
   expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  });
 for(const reason of ['low-mana','silence'] as const)it(`${reason}: no spell cast, no step/event, no mana or turn change`,()=>{
  const f=fixture(c);if(reason==='low-mana')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  const before=f.enemies.map(e=>[e.hp,e.armor,e.statuses.length]);
  expect(f.cast()).toEqual([]);expect(f.enemies.map(e=>[e.hp,e.armor,e.statuses.length])).toEqual(before);
  expect(f.caster.mana).toBe(reason==='low-mana'?c.cost-1:c.cost);expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
 });
 if(c.rider==='rage'||c.rider==='poison')for(const afflicted of [false,true])it(`conditional ${c.rider} on TARGET=${afflicted} (not caster/other enemy)`,()=>{
  const f=fixture(c);f.caster.statuses=[{id:c.rider,turns:3}];f.enemies[1].statuses=[{id:c.rider,turns:3}];
  if(afflicted)f.enemies[2].statuses=[{id:c.rider,turns:3}];
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([(11+c.base)*(afflicted?2:1)]);
  if(c.rider==='poison')expect(ev.findIndex(e=>e.type==='skill-damage')).toBeLessThan(ev.findIndex(e=>e.type==='status-apply'&&e.targetId===12));
 });
 if(c.position==='front')it('defeated former front retargets to the next living enemy for BOTH steps',()=>{
  const f=fixture(c);f.enemies[0].hp=0;f.enemies[0].defeated=true;
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11]);
  expect(ev.flatMap(e=>e.type==='status-apply'&&e.statusId==='silence'?[e.targetId]:[])).toEqual([11]);
 });
 if(c.rider==='silence'||c.rider==='burning'||c.rider==='poison')it('Barrier absorbs damage while later native status step independently targets survivor',()=>{
  const f=fixture(c),i=c.position==='front'?0:2;f.enemies[i].statuses=[{id:'barrier',turns:3}];
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-damage')).toEqual([]);
  expect(ev.some(e=>e.type==='status-apply'&&e.statusId===c.rider&&e.targetId===f.enemies[i].id)).toBe(true);
  expect(f.enemies[i].hp).toBe(c.rider==='burning'?997:1000); // Burning ticks at turn end despite barrier blocking the spell hit.
 });
});


