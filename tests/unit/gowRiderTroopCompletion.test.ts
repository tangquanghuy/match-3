// Entity-specific consecutive damage/rider execution: silence previous random target and last-slot mana drain.
// @ts-expect-error Stored independent English source
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Native spell-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {SeededRNG} from '@engine/rng';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const reg=new ExtensionRegistry();registerSkillLibrary(reg.prototypes);
const cases=[
 {id:6043,spell:7043,cost:12,colors:[BaseColor.Red,BaseColor.Brown],desc:'Deal [Magic + 5] damage to a random Enemy, and Silence them.',first:'RandomEnemy',second:'CauseSilence'},
 {id:6083,spell:7153,cost:10,colors:[BaseColor.Purple,BaseColor.Brown],desc:'Deal [Magic + 5] damage to the last Enemy, and drain all Mana from them.',first:'LastEnemy',second:'DecreaseMana'},
] as const;
function setup(c:typeof cases[number],seed:number,side=PlayerSide.Left){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic:10});
 for(const e of f.enemies){e.manaCost=16;e.mana=8;}
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,reg);engine.skullChance=0;
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id} two-step real-cast target tracking`,()=>{
 it('original English/native and final troop bind, colors, cost and both ordered steps',()=>{
  const a=en.find((v:{id:number})=>v.id===c.id)!,n=native.get(c.spell).raw;
  expect(a.stats.spell.desc).toBe(c.desc);expect(a.stats.spell.id).toBe(c.spell);
  expect(a.ManaCost).toBe(c.cost);expect(Object.keys(a._ManaColors_parsed).sort()).toEqual(c.colors.map(v=>`Color${v}`).sort());
  expect(n.SpellSteps).toHaveLength(2);
  expect(n.SpellSteps[0]).toMatchObject({Type:'Damage',Target:c.first,Amount:5,SpellPowerMultiplier:1});
  expect(n.SpellSteps[1].Type).toBe(c.second);
  expect(TROOPS.find(t=>t.id===c.id)).toMatchObject({manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(reg.prototypes.get(String(c.spell))?.segments).toHaveLength(2);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`actual ${side}: only hit target receives follow-up rider`,()=>{
  const indices=new Set<number>();
  for(let seed=1;seed<=24;seed++){
   const f=setup(c,seed,side),before=f.enemies.map(e=>e.hp);
   const events=f.cast(),hits=events.filter(e=>e.type==='skill-damage');
   expect(hits).toHaveLength(1);expect(hits[0].damage).toBe(15);
   const targetId=hits[0].targetId,idx=targetId-10;indices.add(idx);
   expect(f.enemies.map((e,i)=>before[i]-e.hp)).toEqual([0,1,2,3].map(i=>i===idx?15:0));
   if(c.id===6043){expect(events.flatMap(e=>e.type==='status-apply' && e.statusId==='silence'?[e.targetId]:[])).toEqual([targetId]);
    // Casting hands the turn to the victim, who may immediately self-recover from Silence.
    const recovered=events.some(e=>e.type==='status-expire' && e.statusId==='silence' && e.targetId===targetId);
    expect(f.enemies.filter(e=>e.statuses.some(s=>s.id==='silence')).map(e=>e.id)).toEqual(recovered?[]:[targetId]);
   }else{expect(f.enemies.map(e=>e.mana)).toEqual([8,8,8,0]);expect(f.enemies.every(e=>e.statuses.every(s=>s.id!=='silence'))).toBe(true);}
   expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
   expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  }
  if(c.id===6043)expect(indices.size).toBeGreaterThan(1);else expect(indices).toEqual(new Set([3]));
 });
 it('full mana is drained only for the last slot; low mana and Silence block both native steps',()=>{
  const f=setup(c,42);f.enemies[3].mana=16;f.cast();
  expect(f.enemies[3].mana).toBe(c.id===6083?0:16);
  for(const reason of ['low','silence']){const b=setup(c,42);if(reason==='low')b.caster.mana=c.cost-1;else b.caster.statuses=[{id:'silence',turns:3}];
   expect(b.cast()).toEqual([]);expect(b.state.actionLog).toHaveLength(0);}
 });
});
