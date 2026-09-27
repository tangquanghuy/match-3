// Lane L5 round 3 re-judge evidence (sa-L5, 2026-09-28): status durations under rulings/R004
// for keys held in draft by L5-004 / L5-005 / L5-014 in B01-B04. Each case does a real
// TurnEngine.castSkill on both sides, then drives the holders' turn-start ticks:
//   - failed self-cleanse rolls: nothing expires (no 3-turn cap), turns counter untouched;
//   - one successful roll: every recoverable negative leaves together, Poison and positives stay;
//   - positive statuses end only on their trigger (Enraged: skull damage; Submerged: holder acts).
// Everything else about these keys is covered by the frozen B01-B04 files.
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {CombatResolver} from '@engine/CombatResolver';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {tickStatuses,endActionStatuses} from '@engine/skills/effects/status';
import {PlayerSide,type Character} from '@engine/types';
import type {SeededRNG} from '@engine/rng';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right];
const roll=(v:number)=>({next:()=>v,nextInt:()=>0}) as unknown as SeededRNG;
const POSITIVE=new Set(['barrier','blessed','enchanted','enraged','rage','reflect','submerged']);

interface Case{key:string;skill:string;chosen?:number;magic?:number;
  /** expected status ids per character id right after the cast (subset check on listed ids) */
  expect:Record<number,string[]>}
const CASES:Case[]=[
 {key:'weapon:1368',skill:'8403',chosen:12,expect:{0:['barrier'],12:['silence']}},
 {key:'troop:6406',skill:'7561',chosen:1,expect:{1:['barrier','submerged']}},
 {key:'weapon:1369',skill:'8404',chosen:1,expect:{0:['barrier'],1:['enchanted']}},
 {key:'weapon:1142',skill:'7338',expect:{}},
 {key:'weapon:1436',skill:'8668',chosen:12,expect:{
  0:['barrier','enchanted','enraged','reflect','submerged','blessed'],
  12:['curse','poison','burning','bleed','silence','frozen','stun','entangle','web','disease','death-mark','faerie-fire','marked','terror','lycanthropy']}},
 {key:'troop:6249',skill:'7392',expect:{10:['death-mark'],13:['death-mark']}},
 {key:'weapon:1147',skill:'7444',chosen:11,expect:{11:['death-mark']}},
 {key:'troop:6229',skill:'7371',expect:{}},
 {key:'troop:6217',skill:'7359',chosen:12,expect:{12:['disease']}},
 {key:'troop:6924',skill:'8393',expect:{0:['rage'],1:['rage'],2:['rage'],10:['rage'],11:['rage'],12:['rage'],13:['rage']}},
 {key:'troop:6546',skill:'7740',expect:{13:['rage']}},
 {key:'weapon:1072',skill:'7185',expect:{10:['entangle']}},
 {key:'troop:6219',skill:'7361',chosen:11,expect:{11:['stun']}},
 {key:'troop:6222',skill:'7364',chosen:12,expect:{12:['stun']}},
];

function setup(c:Case,side:PlayerSide){
 const f=damageFixture();
 Object.assign(f.caster,{skillId:c.skill,mana:40,manaCost:40,magic:c.magic??2});
 const allies=[damageCharacter(1,{mana:0}),damageCharacter(2,{mana:0})];
 const mine=[f.caster,...allies];
 const other=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
 f.state.teams[side].characters=mine;f.state.teams[other].characters=f.enemies;f.state.activePlayer=side;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 if(c.chosen!==undefined)engine.setTargetChooser(new FixedTargetChooser(c.chosen));
 const all=()=>[...mine,...f.enemies];
 return {...f,engine,mine,all,cast:()=>engine.castSkill(0)};
}
const snap=(cs:Character[])=>cs.map(c=>[c.id,c.statuses.map(s=>`${s.id}:${s.turns}`).join(',')]);

describe('L5 round 3: R004 durations on real casts (L5-004 / L5-005 / L5-014)',()=>{
 for(const c of CASES)for(const side of SIDES)
 it(`${c.key} ${side}: statuses from the cast persist past 3+ owner turn starts; one successful roll clears all recoverable negatives`,()=>{
  const f=setup(c,side);
  const ev=f.cast();
  expect(ev[0]).toMatchObject({type:'skill-cast'});
  for(const [id,list] of Object.entries(c.expect)){
   const ch=f.all().find(x=>x.id===Number(id))!;
   expect(ch.statuses.map(s=>s.id)).toEqual(expect.arrayContaining(list));
  }
  const holders=f.all().filter(ch=>!ch.defeated&&ch.statuses.length>0);
  expect(holders.length).toBeGreaterThan(0);
  const before=snap(holders);
  for(let t=0;t<6;t++)for(const h of holders)tickStatuses(h,roll(0.99));
  expect(snap(holders)).toEqual(before);
  for(const h of holders){
   const negatives=h.statuses.filter(s=>!POSITIVE.has(s.id)&&s.id!=='poison').map(s=>s.id);
   const staying=h.statuses.filter(s=>POSITIVE.has(s.id)||s.id==='poison').map(s=>s.id);
   const out=tickStatuses(h,roll(0));
   expect(h.statuses.map(s=>s.id)).toEqual(staying);
   expect(out.filter(e=>e.type==='status-expire').map(e=>e.type==='status-expire'&&e.statusId)).toEqual(negatives);
  }
 });

 it('troop:6924 / troop:6546: Enraged has no timer and ends when the holder deals skull damage',()=>{
  for(const [c,holder] of [[CASES.find(x=>x.key==='troop:6924')!,10],[CASES.find(x=>x.key==='troop:6546')!,13]] as const){
   const f=setup(c,PlayerSide.Left);f.cast();
   const h=f.enemies.find(e=>e.id===holder)!;
   for(let t=0;t<6;t++)tickStatuses(h,roll(0));
   expect(h.statuses.map(s=>s.id)).toEqual(['rage']);
   const foe=damageCharacter(99);
   new CombatResolver().resolveSkullDamage({player:PlayerSide.Right,characters:[h]},{player:PlayerSide.Left,characters:[foe]},3);
   expect(foe.hp).toBe(1000-Math.round(17*1.5));
   expect(h.statuses).toEqual([]);
  }
 });

 it('troop:6406: Submerged on the chosen ally ends when that ally casts (real castSkill), not on a timer',()=>{
  const c=CASES.find(x=>x.key==='troop:6406')!;
  const f=setup(c,PlayerSide.Left);f.cast();
  const ally=f.mine[1];
  for(let t=0;t<6;t++)tickStatuses(ally,roll(0));
  expect(ally.statuses.map(s=>s.id)).toEqual(['barrier','submerged']);
  // hand the turn back to the ally's side and let the ally cast its own spell
  f.state.activePlayer=PlayerSide.Left;
  Object.assign(ally,{skillId:'8403',mana:40,manaCost:40});
  f.engine.setTargetChooser(new FixedTargetChooser(12));
  const ev=f.engine.castSkill(ally.id);
  expect(ev.some(e=>e.type==='status-expire'&&e.targetId===1&&e.statusId==='submerged')).toBe(true);
  expect(ally.statuses.map(s=>s.id)).toEqual(['barrier']);
  expect(endActionStatuses(ally)).toEqual([]);
 });
});
