// Lane L3 batch B05 REPRO (sa-L3): discrepancy reproductions, NOT signoff evidence.
// L3-014 multi-source ratio modifier floors the summed count once (native: one floor per Count step) — 8785.
// L3-015 GenerateMana UseCounterForAmount without Amount assembled as N + N x count (should be N x count).
// L3-016 Doomed weapon family "if the Enemy has a Doom, create 5 more" creates plain Skulls (native Color1 Doomskull).
// L3-017 Satyr 7032: native steal Armor->Magic precedes Damage (R001; the damage uses the raised Magic).
// L3-018 Blade Dancer 7035: native StealMagic; prototype steals Mana.
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
function setup(o:{skill:string;cost:number;allies?:Partial<Character>[];enemies?:Partial<Character>[];magic?:number;board?:(r:number,c:number)=>GemType}){
 const board=new BoardModel();let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)board.set({row:r,col:c},{id:id++,type:o.board?o.board(r,c):colorGem(PAT[(r+c)%4])});
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[BaseColor.Yellow],magic:o.magic??10});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const state=createGameState(board,{player:PlayerSide.Left,characters:[caster,...allies]},{player:PlayerSide.Right,characters:[...enemies]});
 let gid=5000;const engine=new TurnEngine(state,new SeededRNG(42),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(12));
 return {state,engine,caster,allies,enemies,cast:()=>engine.castSkill(caster.id)};
}
const created=(ev:GameEvent[])=>{const out:GemType[]=[];for(const e of ev){if(e.type==='gem-create')for(const s of e.spawns)out.push(s.gemType);
 if(e.type==='gem-transform')for(const s of e.changes)out.push(s.to);}return out;};

describe('L3-014 8785 per-source floor',()=>{
 // source-dispute (L3-014): kept as it.fails — runtime floors the combined count (L7 troop:6320 7470 accepted that口径).
 it.fails('2 Green allies (caster+1) and 2 Green gems -> 1 star (floor(2x.34)+floor(2x.34)=0 bonus), not 2',()=>{
  const G=['0,0','4,4'];
  const f=setup({skill:'8785',cost:12,allies:[{colors:[BaseColor.Green]}],board:(r,c)=>colorGem(G.includes(`${r},${c}`)?BaseColor.Green:PAT[(r+c)%4])});
  f.caster.colors=[BaseColor.Green];const ev=f.cast();
  expect(created(ev).filter(t=>t.kind==='special'&&t.spec.kind==='elementalStar')).toHaveLength(1);
 });
});
describe('L3-015 counter-only mana',()=>{
 it('9847: no bleeding enemy -> 0 mana (not 2)',()=>{const f=setup({skill:'9847',cost:13});f.cast();expect(f.caster.mana).toBe(0);});
 it('8638: no Elemental Star -> 0 mana',()=>{const f=setup({skill:'8638',cost:13});f.caster.manaCost=13;f.cast();expect(f.caster.mana).toBe(0);});
 it('8580: no Lycanthropy Gem -> others 0 mana',()=>{const f=setup({skill:'8580',cost:12,allies:[{manaCost:20}]});f.cast();expect(f.allies[0].mana).toBe(0);});
 for(const w of ['7952','7963','7973','8053','8077','8078'])it(`${w}: no enemy of the colour -> 0 mana`,()=>{
  const f=setup({skill:w,cost:18,enemies:[{colors:[]},{colors:[]},{colors:[]},{colors:[]}]});f.caster.manaCost=30;const ev=f.cast();
  expect(ev.filter(e=>e.type==='buff'&&e.stat==='mana'&&e.targetId===0)).toHaveLength(0);});
});
describe('L3-016 Doomed weapons create Doomskulls',()=>{
 for(const w of ['7952','7963','7973','8053','8077','8078'])it(`${w}: enemy Doom -> 5 extra Doomskulls, no plain Skulls created`,()=>{
  const f=setup({skill:w,cost:18,enemies:[{troopTypes:['Doom']},{},{},{}]});const ev=f.cast();
  expect(created(ev).filter(t=>t.kind==='skull')).toHaveLength(0);
 });
});
describe('L3-017 Satyr 7032 steal before damage',()=>{
 it('last enemy armor 2 -> caster Magic +2 then [Magic+4] = 16 at magic 10',()=>{
  const f=setup({skill:'7032',cost:8,enemies:[{},{},{},{armor:2}]});f.cast();
  expect(f.enemies[3].armor).toBe(0);expect(1000-f.enemies[3].hp).toBe(16);
 });
});
describe('L3-018 Blade Dancer 7035 steals Magic',()=>{
 it('random enemy loses 4 Magic, caster +4 Magic, no mana moved',()=>{
  const f=setup({skill:'7035',cost:11,enemies:[{mana:9,manaCost:20},{mana:9,manaCost:20},{mana:9,manaCost:20},{mana:9,manaCost:20}]});f.cast();
  expect(f.caster.magic).toBe(14);expect(f.enemies.map(e=>e.magic).sort()).toEqual([11,11,11,7]);expect(f.enemies.every(e=>e.mana===9)).toBe(true);
 });
});
