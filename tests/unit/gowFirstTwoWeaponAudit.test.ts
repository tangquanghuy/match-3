// Stored English/native + official 9.4 weapon changes. Scoped, not whole-skill approval.
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
// @ts-expect-error Node independent native-source index
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {PlayerSide} from '@engine/types';
import {spellDescription} from '../../src/data/combatText';
import weapons from '../../src/data/weapons.json';
import {damageFixture} from '../helpers/damageFixture';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[{id:1008,spellId:7074,ref:'IcyGlaive',base:3,cost:8},{id:1023,spellId:7089,ref:'GlaiveOfStorms',base:5,cost:9}];
function fixture(c:typeof cases[number],side:PlayerSide,magic=11,armor=0,count=4){
 const f=damageFixture(9,0,Array.from({length:count},()=>({armor})));
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 Object.assign(f.caster,{skillId:`gw_${c.ref}`,magic,mana:c.cost,manaCost:c.cost});
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 const chooser=vi.fn(()=>f.enemies.at(-1)?.id??99);engine.setTargetChooser({choose:chooser});
 const board=()=>{const cells:unknown[]=[];f.board.forEach((gem,pos)=>cells.push([pos,gem]));return JSON.stringify(cells);};
 return {...f,engine,chooser,board,side};
}
describe('Icy Glaive and Glaive of Storms: native first-two damage, no red-gem removal',()=>{
 for(const c of cases){
  it(`${c.id}/${c.spellId}: independent source, cost, color and exact final aliases`,()=>{
   const src=english.find((w:{id:number})=>w.id===c.id),w=weapons.find(w=>w.id===c.id)!;
   expect(src.stats.spell.desc).toBe(`Deal [Magic + ${c.base}] damage to the first 2 Enemies.`);
   expect(native.get(c.spellId).raw).toMatchObject({Cost:c.cost,Target:'None',SpellSteps:[{Type:'Damage',Target:'FirstTwoEnemies',SpellPowerMultiplier:1,Amount:c.base}]});
   expect(native.get(c.spellId).raw.SpellSteps).toHaveLength(1);
   expect(w.manaCost).toBe(c.cost);expect(w.manaColors).toEqual(['Yellow']);
   const expected={segments:[{kind:'damage',target:'enemyFirstN',n:2,scaling:{base:c.base,mult:1}}]};
   expect(registry.prototypes.get(`gw_${c.ref}`)).toEqual(expected);expect(registry.prototypes.get(String(c.spellId))).toEqual(expected);
   expect(spellDescription(c.spellId,w.spell.description)).toBe(`对前两名敌人造成 [魔法 + ${c.base}] 点伤害。`);
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,11,20])for(const armor of [0,10])for(const count of [1,2,3,4])it(`${c.id}: real cast ${side}, M=${magic}, armor=${armor}, enemies=${count}`,()=>{
   const f=fixture(c,side,magic,armor,count),before=f.board(),ev=f.engine.castSkill(0),hits=ev.filter(e=>e.type==='skill-damage');
   expect(hits.map(e=>e.targetId)).toEqual(f.enemies.slice(0,2).map(e=>e.id));expect(hits.map(e=>e.damage)).toEqual(Array(Math.min(2,count)).fill(magic+c.base));
   for(const e of f.enemies){const damage=e.id<12?magic+c.base:0;expect(e.armor).toBe(Math.max(0,armor-damage));expect(e.hp).toBe(1000-Math.max(0,damage-armor));}
   expect(f.chooser).not.toHaveBeenCalled();expect(f.board()).toBe(before);expect(f.caster.mana).toBe(0);
   expect(f.state.actionLog).toHaveLength(1);expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);
   expect(ev.some(e=>['gem-clear','gem-transform','economy-gain','extra-turn','summon','status-apply'].includes(e.type))).toBe(false);
   // Project casts currently retain the turn globally; original turn-consumption is a separate pending rule.
   expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right]){
   it(`${c.id}: a dead front slot does not consume one of two living targets (${side})`,()=>{
    const f=fixture(c,side);f.enemies[0].defeated=true;f.enemies[0].hp=0;
    expect(f.engine.castSkill(0).filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11,12]);expect(f.enemies[3].hp).toBe(1000);
   });
   it(`${c.id}: a front kill does not hit the replacement third enemy (${side})`,()=>{
    const f=fixture(c,side);f.enemies[0].hp=1;f.enemies[0].maxHp=1;
    const ev=f.engine.castSkill(0);expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([10,11]);expect(f.enemies[2].hp).toBe(1000);
   });
   it(`${c.id}: Barrier blocks only its bearer, without retarget (${side})`,()=>{
    const f=fixture(c,side);f.enemies[0].statuses.push({id:'barrier',turns:99});
    expect(f.engine.castSkill(0).filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11]);expect(f.enemies[0].hp).toBe(1000);expect(f.enemies[2].hp).toBe(1000);
    expect(f.enemies[0].statuses.some(s=>s.id==='barrier')).toBe(false);
   });
   it(`${c.id}: Web sets spell Magic to zero but leaves base damage (${side})`,()=>{
    const f=fixture(c,side);f.caster.statuses.push({id:'web',turns:99});
    expect(f.engine.castSkill(0).filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([c.base,c.base]);
   });
   it(`${c.id}: insufficient mana changes neither targets nor board (${side})`,()=>{
    const f=fixture(c,side),before=f.board();f.caster.mana=c.cost-1;expect(f.engine.castSkill(0)).toEqual([]);
    expect(f.caster.mana).toBe(c.cost-1);expect(f.enemies.map(e=>e.hp)).toEqual([1000,1000,1000,1000]);expect(f.board()).toBe(before);
   });
  }
 }
});
