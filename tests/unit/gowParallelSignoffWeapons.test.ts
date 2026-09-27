// Per-entity stored-source and real TurnEngine coverage for parallel signoff candidates.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
const original=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:1001,spell:7067,ref:'ScoutsBow',cost:5,color:BaseColor.Green,base:4,mult:0.5,kind:'Damage',target:'FromTarget',mapped:'enemyChosen',range:'single',english:'Deal [(Magic / 2) + 4] damage to an Enemy.'},
 {id:1002,spell:7064,ref:'WarriorsAxe',cost:5,color:BaseColor.Red,base:5,mult:0.5,kind:'Damage',target:'FrontEnemy',mapped:'enemyFront',range:'single',english:'Deal [(Magic / 2) + 5] damage to the first Enemy.'},
 {id:1003,spell:7068,ref:'HuntersSpear',cost:5,color:BaseColor.Yellow,base:6,mult:0.5,kind:'Damage',target:'RandomEnemy',mapped:'enemyRandom',range:'single',english:'Deal [(Magic / 2) + 6] damage to a random Enemy.'},
 {id:1004,spell:7069,ref:'WizardsWand',cost:5,color:BaseColor.Purple,base:6,mult:0.5,kind:'ScatterDamage',target:'AllEnemies',mapped:'enemyAll',range:'scatter',english:'Deal [(Magic / 2) + 6] scatter damage.'},
 {id:1017,spell:7083,ref:'BloodyAxe',cost:7,color:BaseColor.Red,base:6,mult:1,kind:'Damage',target:'FrontEnemy',mapped:'enemyFront',range:'single',english:'Deal [Magic + 6] damage to the first Enemy.'},
 {id:1018,spell:7084,ref:'WickedScythe',cost:10,color:BaseColor.Purple,base:1,mult:1,kind:'Damage',target:'AllEnemies',mapped:'enemyAll',range:'all',english:'Deal [Magic + 1] damage to all Enemies.'},
 {id:1019,spell:7085,ref:'PiercingLance',cost:7,color:BaseColor.Yellow,base:7,mult:1,kind:'Damage',target:'RandomEnemy',mapped:'enemyRandom',range:'single',english:'Deal [Magic + 7] damage to a random Enemy.'},
 {id:1020,spell:7086,ref:'SpiritStaff',cost:7,color:BaseColor.Purple,base:6,mult:1,kind:'ScatterDamage',target:'AllEnemies',mapped:'enemyAll',range:'scatter',english:'Deal [Magic + 6] scatter damage.'},
] as const;
function setup(c:typeof cases[number],alias:string,side:PlayerSide,magic=10){
 const f=damageFixture();Object.assign(f.caster,{skillId:alias,mana:c.cost,manaCost:c.cost,colors:[c.color],magic});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`signoff weapon:${c.id}/spell:${c.spell}`,()=>{
 it('independent English, native step, binding, both aliases, mana and spell description',()=>{
  const o=original.find((v:{id:number})=>v.id===c.id)!;
  const w=weapons.find(v=>v.id===c.id)!;
  const n=native.get(c.spell).raw;
  expect(o.stats.spell.desc).toBe(c.english);
  expect(n).toMatchObject({Id:c.spell,Cost:c.cost,SpellSteps:[{Type:c.kind,Target:c.target,Amount:c.base,SpellPowerMultiplier:c.mult}]});
  expect(n.SpellSteps).toHaveLength(1);
  expect(w).toMatchObject({id:c.id,referenceName:c.ref,manaCost:c.cost,manaColors:[c.color],spell:{id:c.spell}});
  const expected={segments:[{kind:'damage',target:c.mapped,scaling:{base:c.base,mult:c.mult},...(c.range==='single'?{}:{range:c.range})}]};
  expect(registry.prototypes.get(String(c.spell))).toEqual(expected);
  expect(registry.prototypes.get(`gw_${c.ref}`)).toEqual(expected);
  expect(w.spell.description).toContain(c.mult===0.5?`[(魔法 / 2) + ${c.base}]`:`[魔法 + ${c.base}]`);
  if(c.range==='scatter')expect(w.spell.description).toContain('散射');
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const alias of [String(c.spell),`gw_${c.ref}`])for(const magic of [0,1,10,11])
 it(`real cast ${side}/${alias}/magic=${magic}: correct targets, damage, cost and action`,()=>{
  const f=setup(c,alias,side,magic);const before=f.enemies.map(e=>e.hp);
  const events=f.cast(),hits=events.filter(e=>e.type==='skill-damage');
  const damage=Math.round(c.base+magic*c.mult),loss=f.enemies.map((e,i)=>before[i]-e.hp);
  if(c.range==='all')expect(loss).toEqual([damage,damage,damage,damage]);
  else if(c.range==='scatter'){
   expect(loss.reduce((a,b)=>a+b,0)).toBe(damage);
   expect(loss.every(v=>v>=0)).toBe(true);
  }else{
   expect(loss.reduce((a,b)=>a+b,0)).toBe(damage);
   expect(loss.filter(v=>v>0)).toHaveLength(1);
   if(c.mapped==='enemyFront')expect(loss[0]).toBe(damage);
   if(c.mapped==='enemyChosen')expect(loss[2]).toBe(damage);
  }
  expect(hits.length).toBeGreaterThan(0);
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
  expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  expect(events.some(e=>e.type==='status-apply'||e.type==='extra-turn')).toBe(false);
 });
 it('Web removes Magic while preserving fixed base damage',()=>{
  const f=setup(c,`gw_${c.ref}`,PlayerSide.Left,11);f.caster.statuses=[{id:'web',turns:3}];
  const events=f.cast(),loss=f.enemies.map(e=>1000-e.hp);
  if(c.range==='all')expect(loss).toEqual([c.base,c.base,c.base,c.base]);
  else expect(loss.reduce((a,b)=>a+b,0)).toBe(c.base);
  expect(events.filter(e=>e.type==='skill-damage').length).toBeGreaterThan(0);
 });
 it('defeated enemies are excluded and lethal cast defeats only the living target',()=>{
  const f=setup(c,String(c.spell),PlayerSide.Left,10);
  const keep=c.mapped==='enemyChosen'?2:c.mapped==='enemyFront'?1:2;
  for(const [i,e] of f.enemies.entries())if(i!==keep){e.defeated=true;e.hp=0;}
  f.enemies[keep].hp=1;
  const events=f.cast();
  expect(events.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([10+keep]);
  expect(events.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([10+keep]);
 }); for(const mode of ['low-mana','silence'] as const)it(`${mode}: real cast blocked without consuming action`,()=>{
  const f=setup(c,`gw_${c.ref}`,PlayerSide.Left);
  if(mode==='low-mana')f.caster.mana=c.cost-1;
  else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.caster.mana).toBe(mode==='low-mana'?c.cost-1:c.cost);
 });
});