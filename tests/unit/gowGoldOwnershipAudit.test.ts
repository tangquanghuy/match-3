// Scoped Gold ownership/transfer evidence. Native counter ambiguities are not whole-skill approval.
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error Native source parser
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { PlayerSide, specialGem } from '@engine/types';
import { goldForSide, setGoldForSide } from '@engine/battleGold';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { executePrototype } from '@engine/skills/prototypes';
import { skill, stealGold, spendGold, gainGold, explodeAt, CELL, sacrifice } from '@engine/skills/builders';
import { resolveModifierCount, conditionMet } from '@engine/skills/effects/secondary';
import { TROOPS } from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
import { damageFixture } from '../helpers/damageFixture';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const ids=[7505,8087,8141,8568,8859,8904,9189,9783];
function fixture(id:number,side=PlayerSide.Left,magic=11,mine=7,enemy=20){
 const f=damageFixture();
 if(side===PlayerSide.Right){
  f.state.teams[PlayerSide.Left].characters=f.enemies;
  f.state.teams[PlayerSide.Right].characters=[f.caster];
  f.state.activePlayer=PlayerSide.Right;
 }
 const w=weapons.find(w=>w.spell.id===id),t=w??TROOPS.find(t=>t.spell.id===id)!;
 Object.assign(f.caster,{skillId:w?`gw_${w.referenceName}`:String(id),magic,mana:t.manaCost,manaCost:t.manaCost});
 setGoldForSide(f.state,side,mine);setGoldForSide(f.state,side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,enemy);
 f.ctx.castTracking={destroyed:[],transformed:0,drainedMana:0,enemyDeaths:0,allyDeaths:0};
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setTargetChooser({choose:()=>12});engine.setBranchChooser(new FixedBranchChooser(0));
 return {...f,engine,side};
}
function goldPair(f:ReturnType<typeof fixture>){return [goldForSide(f.state,f.side),goldForSide(f.state,f.side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left)];}
describe('Gold side-owned counters and available-balance transfer (scoped)',()=>{
 it('all eight installed native TakeEnemyGold spells retain an actual theft primitive',()=>{
  const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
  const installed=original.filter((t:{stats:{spell:{id:number}}})=>native.get(t.stats.spell.id)?.raw.SpellSteps?.some((s:{Type:string})=>s.Type==='TakeEnemyGold')).map((t:{stats:{spell:{id:number}}})=>t.stats.spell.id).sort((a:number,b:number)=>a-b);
  expect(installed).toEqual(ids.slice().sort((a,b)=>a-b));
  const flat=(ss:typeof registry.prototypes extends Map<string,infer P>?P extends {segments:infer S}?S:never:never):string[]=>ss.flatMap(s=>s.kind==='choose'||s.kind==='oneOf'?flat(s.options.flat()):[s.kind]);
  for(const id of ids)expect(flat(registry.prototypes.get(String(id))!.segments)).toContain('stealGold');
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const enemy of [0,1,4,5,13,49,50,51,100])it(`primitive transfer ${side}, enemy=${enemy}: min(request, available, cap), conservation, actual tracking`,()=>{
  const f=fixture(9783,side,11,7,enemy),amount=Math.min(enemy,13);
  const ev=executePrototype(skill(stealGold(2,1)),f.ctx);
  expect(goldPair(f)).toEqual([7+amount,enemy-amount]);
  expect((f.ctx.castTracking!.goldStolen??0)).toBe(amount);
  expect(ev.filter(e=>e.type==='economy-gain').map(e=>[e.side,e.amount])).toEqual(amount?[[side,amount]]:[]);
  expect(goldPair(f).reduce((a,b)=>a+b,0)).toBe(7+enemy);
  const second=executePrototype(skill(stealGold(200,0,{cap:5})),f.ctx),next=Math.min(enemy-amount,5);
  expect(goldPair(f)).toEqual([7+amount+next,enemy-amount-next]);
  expect(f.ctx.castTracking!.goldStolen??0).toBe(amount+next);expect(second.length).toBe(next?1:0);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const enemy of [0,1,100,250])it(`all transfer ${side}, enemy=${enemy}: own Gold is never used as theft amount`,()=>{
  const f=fixture(8141,side,11,17,enemy);executePrototype(skill(stealGold(0,0,{all:true})),f.ctx);
  expect(goldPair(f)).toEqual([17+enemy,0]);expect(f.ctx.castTracking!.goldStolen??0).toBe(enemy);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`gain, spend, thresholds and counts read caster side ${side}`,()=>{
  const f=fixture(9783,side,11,5,31);
  expect(resolveModifierCount({kind:'battleGold'},f.ctx)).toBe(5);expect(resolveModifierCount({kind:'enemyGold'},f.ctx)).toBe(31);expect(resolveModifierCount({kind:'bothGold'},f.ctx)).toBe(36);
  expect(conditionMet({kind:'economyAtLeast',currency:'gold',n:6},f.ctx)).toBe(false);
  executePrototype(skill(gainGold(4)),f.ctx);expect(goldPair(f)).toEqual([9,31]);
  expect(conditionMet({kind:'economyAtLeast',currency:'gold',n:6},f.ctx)).toBe(true);
  executePrototype(skill(spendGold()),f.ctx);expect(goldPair(f)).toEqual([0,31]);expect(f.ctx.castTracking!.goldSpent).toBe(9);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const id of ids)for(const enemy of [0,3,100])it(`real TurnEngine cast ${id}, ${side}, enemy=${enemy}`,()=>{
  const f=fixture(id,side,11,7,enemy),request=id===7505?15:id===8087?50:id===8568||id===8859?12:id===8904?13:id===9783?5:Infinity,amount=Math.min(enemy,request);
  const ev=f.engine.castSkill(f.caster.id);
  expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);expect(f.state.actionLog).toHaveLength(1);
  expect(goldPair(f)).toEqual([7+amount,enemy-amount]);
  expect(ev.flatMap(e=>e.type==='economy-gain'&&e.currency==='gold'?[[e.side,e.amount]]:[])).toEqual(amount?[[side,amount]]:[]);
  expect(f.caster.mana).toBe(0);
  if(id===8087||id===8904){
   expect(f.enemies[2].hp).toBe(1000-(13+(id===8087?amount:Math.floor(amount/50))));
   if(amount){const gain=ev.findIndex(e=>e.type==='economy-gain'),hit=ev.findIndex(e=>e.type==='skill-damage');expect(id===8087?gain>hit:gain<hit).toBe(true);}
  }
  if(id===7505)expect(f.enemies[2].hp).toBe(985);
  if(id===8568){expect(f.enemies[2].mana).toBe(8);expect(f.enemies[2].statuses.some(s=>s.id==='frozen')).toBe(true);}
  if(id===9189){
   expect(f.enemies[2].hp).toBeLessThanOrEqual(986);expect(f.enemies[2].statuses.some(s=>s.id==='bleed')).toBe(true);
   if(amount)expect(ev.findIndex(e=>e.type==='economy-gain')).toBeGreaterThan(ev.findIndex(e=>e.type==='status-apply'));
  }
  if(id===8141)expect(ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes)).toHaveLength(6+Math.min(amount,10));
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,11,20])for(const balances of [[0,0],[0,9],[9,0],[1,1],[3,5],[4,5],[100,100]])it(`equipped Golden Gun ${side}, M=${magic}, Gold=${balances}: combined boost rounded once`,()=>{
  const f=fixture(8073,side,magic,balances[0],balances[1]);
  // Only override two target draws; refill RNG remains live.
  vi.spyOn(f.ctx.rng,'nextInt').mockImplementationOnce(()=>0).mockImplementationOnce(()=>2);
  const ev=f.engine.castSkill(f.caster.id),amount=magic+3+Math.floor((balances[0]+balances[1])/2);
  const hits=ev.filter(e=>e.type==='skill-damage');expect(hits).toHaveLength(2);expect(new Set(hits.map(e=>e.targetId)).size).toBe(2);
  expect(hits.map(e=>e.damage)).toEqual([amount,amount]);expect(goldPair(f)).toEqual(balances);
 });
 it('Golden Gun native explicitly counts both sides and has two random damage steps',()=>{
  expect(native.get(8073).raw.SpellSteps).toMatchObject([{Type:'CountMyGold',Amount:50},{Type:'CountEnemyGold',Amount:50},{Type:'Damage',Target:'RandomEnemy',Amount:3},{Type:'Damage',Target:'RandomPrefNotPrevEnemy',Amount:3}]);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`9783 with no available Gold still damages, but never mints Gold (${side})`,()=>{
  const f=fixture(9783,side,11,100,0),ev=f.engine.castSkill(0);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([23]);expect(ev.some(e=>e.type==='economy-gain')).toBe(false);expect(goldPair(f)).toEqual([100,0]);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`Gold gain after enemy knockout uses the retained caster ownership ${side}`,()=>{
  const f=fixture(9783,side,11,7,20);f.enemies.forEach(c=>{c.hp=1;c.maxHp=1;});
  const ev=f.engine.castSkill(0);expect(ev.some(e=>e.type==='defeat')).toBe(true);expect(goldPair(f)).toEqual([12,15]);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const id of [9783,8087])it(`caster removed by reflection mid-cast retains Gold ownership ${id}, ${side}`,()=>{
  const f=fixture(id,side,11,7,20);f.caster.hp=1;f.caster.maxHp=1;
  f.enemies.forEach(c=>c.statuses.push({id:'reflect',turns:3}));
  const ev=f.engine.castSkill(0),stolen=id===8087?20:5;
  expect(ev.some(e=>e.type==='defeat'&&e.characterId===0)).toBe(true);
  expect(f.state.teams[side].characters.some(c=>c.id===0)).toBe(false);
  expect(goldPair(f)).toEqual([7+stolen,20-stolen]);
  expect(ev.filter(e=>e.type==='economy-gain').map(e=>e.side)).toEqual([side]);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`Gold sources, threshold and spend remain own-side after caster sacrifice ${side}`,()=>{
  const f=fixture(9783,side,11,7,20);
  executePrototype(skill(sacrifice('allySelf')),f.ctx);
  expect(f.state.teams[side].characters).toHaveLength(0);
  expect(resolveModifierCount({kind:'battleGold'},f.ctx)).toBe(7);
  expect(resolveModifierCount({kind:'enemyGold'},f.ctx)).toBe(20);
  expect(conditionMet({kind:'economyAtLeast',currency:'gold',n:8},f.ctx)).toBe(false);
  executePrototype(skill(spendGold()),f.ctx);
  expect(goldPair(f)).toEqual([0,20]);expect(f.ctx.castTracking!.goldSpent).toBe(7);
 });
 it('cancelled Fox Thief choice changes neither balance nor mana',()=>{
  const f=fixture(8859);f.engine.setBranchChooser(new FixedBranchChooser(null));const before=JSON.stringify(f.state);
  expect(f.engine.castSkill(0)).toEqual([]);expect(JSON.stringify(f.state)).toBe(before);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`Fox Thief stat branch leaves both Gold pools unchanged (${side})`,()=>{
  const f=fixture(8859,side);f.engine.setBranchChooser(new FixedBranchChooser(1));f.engine.castSkill(0);expect(goldPair(f)).toEqual([7,20]);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`Booty Gem destruction credits only destroying side ${side}`,()=>{
  const f=fixture(9783,side,11,7,20);registry.prototypes.set('gold-fixture',skill(explodeAt(CELL)));
  f.caster.skillId='gold-fixture';f.board.set({row:0,col:0},{id:91,type:specialGem('bootyGem')});
  f.engine.setCellChooser({choose:()=>({row:0,col:0})});
  const ev=f.engine.castSkill(0);expect(goldPair(f)).toEqual([17,20]);
  expect(ev.some(e=>e.type==='special-gem-trigger'&&e.kind==='bootyGem')).toBe(true);
  expect(ev.filter(e=>e.type==='economy-gain').map(e=>e.side)).toEqual([side]);
  registry.prototypes.delete('gold-fixture');
 });
});
