// Whole-spell review: Phoenix Crossbow 7077, Sunbolt Javelin 7078, Elder Bow 7080.
// @ts-expect-error Node fixtures
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Independent native source reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {spellDescription} from '../../src/data/combatText';
import weapons from '../../src/data/weapons.json';
const en=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const old=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-weapon-list.html','utf8');
const update=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-4-5-weapon-balance.html','utf8');
const officialStatus=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:1011,spell:7077,ref:'PhoenixCrossbow',name:'Phoenix Crossbow',cost:9,color:'Green',base:3,oldBase:1,oldCost:10,desc:'Deal [Magic + 3] true damage to an Enemy.',kind:'TrueDamage',target:'FromTarget',trueDamage:true,random:false},
 {id:1012,spell:7078,ref:'SunboltJavelin',name:'Sunbolt Javelin',cost:9,color:'Yellow',base:5,oldBase:2,oldCost:9,desc:'Deal [Magic + 5] true damage to a random Enemy.',kind:'TrueDamage',target:'RandomEnemy',trueDamage:true,random:true},
 {id:1014,spell:7080,ref:'ElderBow',name:'Elder Bow',cost:8,color:'Green',base:5,oldBase:3,oldCost:8,desc:'Deal [Magic + 5] damage to an Enemy.',kind:'Damage',target:'FromTarget',trueDamage:false,random:false},
] as const;
function setup(c:typeof cases[number],alias:string,side:PlayerSide,selected=12){
 const f=damageFixture();f.caster.skillId=alias;f.caster.manaCost=f.caster.mana=c.cost;
 f.caster.colors=[c.color==='Green'?BaseColor.Green:BaseColor.Yellow];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(selected));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases) describe(`${c.name} weapon ${c.id} / native ${c.spell} whole spell`,()=>{
 it('three independently stored sources, updated official base, native single step, colors and two aliases',()=>{
  const weapon=weapons.find(w=>w.id===c.id)!;
  const english=en.find((w:{id:number})=>w.id===c.id);
  const spell=native.get(c.spell).raw;
  const guide=old.slice(old.indexOf(`<h2>${c.name}</h2>`),old.indexOf(`<h2>${c.name}</h2>`)+850);
  const patch=update.slice(update.indexOf(`<em>${c.name}</em>`),update.indexOf(`<em>${c.name}</em>`)+250);
  expect(guide).toContain(`Mana Cost:${c.oldCost}`);
  expect(guide).toContain(c.color);
  expect(guide).toContain(`[${c.oldBase}+Magic]`);
  expect(patch).toContain(`Base spell damage has been increased from ${c.oldBase} to ${c.base}`);
  if(c.id===1011)expect(patch).toContain('Mana cost has been reduced from 10 to 9');
  expect(english.stats.spell.desc).toBe(c.desc);
  expect(spell).toMatchObject({Id:c.spell,Cost:c.cost,Target:c.random?'None':'Enemy',SpellSteps:[{Type:c.kind,Target:c.target,Amount:c.base,SpellPowerMultiplier:1,Primarypower:true}]});
  expect(spell.SpellSteps).toHaveLength(1);
  expect(weapon).toMatchObject({id:c.id,referenceName:c.ref,manaCost:c.cost,manaColors:[c.color],spell:{id:c.spell}});
  const expected={segments:[{kind:'damage',target:c.random?'enemyRandom':'enemyChosen',scaling:{base:c.base,mult:1},...(c.trueDamage?{trueDamage:true}:{})}]};
  expect(registry.prototypes.get(String(c.spell))).toEqual(expected);
  expect(registry.prototypes.get(`gw_${c.ref}`)).toEqual(expected);
  expect(spellDescription(c.spell,weapon.spell.description)).toContain(`魔法 + ${c.base}`);
  expect(officialStatus).toContain('reduces a troop\'s Magic stat to 0');
 });
 for(const alias of [String(c.spell),`gw_${c.ref}`])for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,11,24])for(const armor of [0,7])
  it(`${alias}/${side}/M${magic}/A${armor}: one correctly targeted and scaled hit`,()=>{
   const f=setup(c,alias,side);f.caster.magic=magic;
   for(const enemy of f.enemies)enemy.armor=armor;
   const ev=f.cast();const hits=ev.filter(e=>e.type==='skill-damage');
   expect(hits).toHaveLength(1);
   if(hits[0].type!=='skill-damage')throw Error('missing damage');
   expect(hits[0].damage).toBe(magic+c.base);
   const target=hits[0].targetId;
   if(c.random)expect(f.enemies.map(e=>e.id)).toContain(target);
   else expect(target).toBe(12);
   for(const enemy of f.enemies){
    const hit=enemy.id===target;
    expect(enemy.armor).toBe(hit&&!c.trueDamage?Math.max(0,armor-magic-c.base):armor);
    expect(enemy.hp).toBe(1000-(hit?(c.trueDamage?magic+c.base:Math.max(0,magic+c.base-armor)):0));
   }
   expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
   expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
   expect(ev.some(e=>e.type==='gem-destroy'||e.type==='extra-turn'||e.type==='status-apply')).toBe(false);
  });
 it('Web leaves only fixed base; Barrier blocks exactly the one hit',()=>{
  const w=setup(c,String(c.spell),PlayerSide.Left);w.caster.magic=22;w.caster.statuses=[{id:'web',turns:3}];
  expect(w.cast().filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([c.base]);
  const b=setup(c,`gw_${c.ref}`,PlayerSide.Left);
  for(const e of b.enemies)e.statuses=[{id:'barrier',turns:3}];
  const events=b.cast();expect(events.some(e=>e.type==='skill-damage')).toBe(false);
  expect(b.enemies.every(e=>e.hp===1000&&e.armor===0)).toBe(true);
  expect(b.enemies.filter(e=>!e.statuses.some(s=>s.id==='barrier'))).toHaveLength(1);
 });
 it('death and target validity: one legal enemy is hit once',()=>{
  const f=setup(c,String(c.spell),PlayerSide.Left,12);
  for(const enemy of f.enemies.filter(e=>e.id!==12)){enemy.defeated=true;enemy.hp=0;}
  expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([12]);
  const lethal=setup(c,String(c.spell),PlayerSide.Left,12);lethal.enemies[2].hp=1;
  if(c.random){for(const enemy of lethal.enemies.filter(e=>e.id!==12)){enemy.hp=0;enemy.defeated=true;}}
  expect(lethal.cast().filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([12]);
 });
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: cast is blocked without spending turn`,()=>{
  const f=setup(c,String(c.spell),PlayerSide.Left);
  if(mode==='low-mana')f.caster.mana=c.cost-1;
  if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);
  expect(f.caster.mana).toBe(mode==='low-mana'?c.cost-1:c.cost);
 });
});