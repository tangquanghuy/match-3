// Lane L3 batch B03 REPRO (sa-L3): discrepancy reproductions, NOT signoff evidence.
// L3-011 DRACOS-1337 7395: native CauseStun -> CauseSilence; prototype silence first (Stun disables immunity traits, R001).
// L3-012 Jellymaid 9816: native second triple targets RandomPrefNotPrevAlly; prototype re-rolls allyRandom (may repeat).
import {describe,it,expect} from 'vitest';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,colorGem,type Character} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const PAT=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
function setup(o:{skill:string;cost:number;allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number}){
 const board=new BoardModel();let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:colorGem(PAT[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[BaseColor.Green]});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster,...allies]},{player:PlayerSide.Right,characters:enemies});
 let gid=5000;const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 return {state,engine,caster,allies,enemies,cast:()=>engine.castSkill(caster.id)};
}
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId]:[]);

describe('L3-011 DRACOS-1337 7395 Stun before Silence',()=>{
 it('stun-apply precedes silence-apply (native order)',()=>{
  const f=setup({skill:'7395',cost:15});const ev=f.cast();
  expect(applied(ev).slice(0,2)).toEqual([[12,'stun'],[12,'silence']]);
 });
});

describe('L3-012 Jellymaid 9816 second ally prefers a different ally',()=>{
 it('with 3 allies + caster, two distinct allies are submerged on every seed',()=>{
  for(let seed=1;seed<=20;seed++){
   const f=setup({skill:'9816',cost:12,seed,allies:[{},{},{}]});const ev=f.cast();
   const subs=applied(ev).filter(a=>a[1]==='submerged').map(a=>a[0]);
   expect(new Set(subs).size).toBe(2);
  }
 });
});
