// Per-entity boundary evidence for the previously pending simple weapon reviews.
import {describe,expect,it} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const weapons=[
 {id:1003,spell:7068,cost:5,color:BaseColor.Yellow,kind:'random',base:6,mult:0.5},
 {id:1018,spell:7084,cost:10,color:BaseColor.Purple,kind:'all',base:1,mult:1},
 {id:1019,spell:7085,cost:7,color:BaseColor.Yellow,kind:'random',base:7,mult:1},
 {id:1020,spell:7086,cost:7,color:BaseColor.Purple,kind:'scatter',base:6,mult:1},
] as const;
function setup(c:typeof weapons[number],seed:number){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[c.color],magic:10});
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of weapons)describe(`weapon:${c.id} previously pending target and status boundaries`,()=>{
 if(c.kind==='random')it('different RNG seeds select different living enemies, always one full-value target',()=>{
  const selected=new Set<number>();
  for(let seed=1;seed<=32;seed++){
   const f=setup(c,seed),ev=f.cast(),hits=ev.filter(e=>e.type==='skill-damage');
   expect(hits).toHaveLength(1);
   expect(hits[0].damage).toBe(c.base+Math.round(10*c.mult));
   selected.add(hits[0].targetId);
   expect(f.enemies.filter(e=>e.hp<1000)).toHaveLength(1);
   expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(PlayerSide.Right);
  }
  expect(selected.size).toBeGreaterThan(1);
 });
 if(c.kind==='scatter')it('seed changes scatter allocation without multiplying the one shared pool',()=>{
  const patterns=new Set<string>();
  for(let seed=1;seed<=32;seed++){
   const f=setup(c,seed);f.cast();
   const loss=f.enemies.map(e=>1000-e.hp);
   expect(loss.reduce((a,b)=>a+b,0)).toBe(10+c.base);
   expect(loss.every(n=>Number.isInteger(n)&&n>=0)).toBe(true);
   patterns.add(loss.join(','));
  }
  expect(patterns.size).toBeGreaterThan(1);
 }); if(c.kind==='all'||c.kind==='scatter')for(const status of ['barrier','submerged'] as const)it(`${status}: blocked share does not spill onto other enemies`,()=>{
  const baseline=setup(c,42),blocked=setup(c,42);
  blocked.enemies[0].statuses=[{id:status,turns:3}];
  const before=baseline.cast().filter(e=>e.type==='skill-damage');
  const after=blocked.cast().filter(e=>e.type==='skill-damage');
  expect(before.length).toBeGreaterThan(0);
  expect(after.every(e=>e.targetId!==10)).toBe(true);
  expect(blocked.enemies[0].hp).toBe(1000);
  for(let i=1;i<4;i++)expect(blocked.enemies[i].hp).toBe(baseline.enemies[i].hp);
  expect(blocked.caster.mana).toBe(0);expect(blocked.state.activePlayer).toBe(PlayerSide.Right);
 });
});
