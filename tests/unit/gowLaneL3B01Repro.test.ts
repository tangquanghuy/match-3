// Lane L3 batch B01 REPRO (sa-L3): discrepancy reproductions, NOT signoff evidence.
// L3-001 Elemental-birth family (8632/8633/8634/8635): native Cause* precedes Damage (R001).
// L3-002 Frostling 7431: native spell Target Enemy (chosen), GenerateMana StatusAmount 4 (fixed 4).
// L3-003 Eternal Sentinel 8795: native CreateGems2Colors GoodGargoyle/BadGargoyle (mix of both tiers).
// L3-004 skill mana gain ignores Silence (official: Silence prevents gaining any mana).
import {describe,it,expect} from 'vitest';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide,colorGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const PAT=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
function setup(o:{skill:string;cost:number;allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number;magic?:number}){
 const board=new BoardModel();let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:colorGem(PAT[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[BaseColor.Blue],magic:o.magic??10});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster,...allies]},{player:PlayerSide.Right,characters:enemies});
 let gid=5000;const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 return {state,engine,caster,allies,enemies,cast:()=>engine.castSkill(caster.id)};
}
const created=(ev:GameEvent[])=>{const out:GemType[]=[];for(const e of ev){
 if(e.type==='gem-create')for(const s of e.spawns)out.push(s.gemType);
 if(e.type==='gem-transform')for(const s of e.changes)out.push(s.to);}return out;};
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId]:[]);

describe('L3-001 elemental-birth family: Cause* before Damage (native order, R001)',()=>{
 for(const [spell,status] of [['8632','entangle'],['8633','burning'],['8634','frozen'],['8635','stun']] as const){
  it(`${spell}: status-apply precedes skill-damage; a killed enemy still received ${status}`,()=>{
   const f=setup({skill:spell,cost:11,magic:0,enemies:[{},{},{hp:2},{}]});const victim=f.enemies[2];const ev=f.cast();
   const si=ev.findIndex(e=>e.type==='status-apply'),di=ev.findIndex(e=>e.type==='skill-damage');
   expect(si).toBeGreaterThanOrEqual(0);expect(si).toBeLessThan(di);
   expect(applied(ev)).toContainEqual([12,status]);expect(victim.defeated).toBe(true);
  });
 }
});

describe('L3-002 Frostling 7431',()=>{
 it('freezes and webs the CHOSEN enemy (native spell Target Enemy / FromTarget)',()=>{
  for(const target of [10,11,12,13]){
   const f=setup({skill:'7431',cost:8,target});const ev=f.cast();
   expect(applied(ev)).toEqual([[target,'frozen'],[target,'web']]);
  }
 });
 it('gains a fixed 4 Mana (StatusAmount 4), not half of the mana bar, when the bar is not 8',()=>{
  const f=setup({skill:'7431',cost:8});f.caster.manaCost=12;f.caster.mana=12;f.cast();
  expect(f.caster.mana).toBe(4);
 });
});

describe('L3-003 Eternal Sentinel 8795 Good/Bad Gargoyle mix',()=>{
 it('over seeds both tiers (1 good, 2 evil) are created',()=>{
  const tiers=new Set<number|undefined>();
  for(let seed=1;seed<=12;seed++){
   const f=setup({skill:'8795',cost:11,seed});const ev=f.cast();
   for(const t of created(ev))if(t.kind==='special'&&t.spec.kind==='gargoyleGem')tiers.add(t.spec.tier);
  }
  expect([...tiers].sort()).toEqual([1,2]);
 });
});

describe('L3-004 Silence blocks spell mana gain',()=>{
 it('7431 is irrelevant (caster cannot be silenced); an ally mana grant (8925 half mana) skips a silenced ally',()=>{
  const f=setup({skill:'8925',cost:12,target:1,allies:[{manaCost:12,mana:0,statuses:[{id:'silence',turns:3}]}]});f.cast();
  expect(f.allies[0].mana).toBe(0);
 });
});
