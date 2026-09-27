// Worker-04 board/extra-turn entity-specific real cast signoff (stored-snapshot scope).
// @ts-expect-error Node snapshot read within Vitest.
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Native MJS spell index.
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:7163,spell:8738,cost:10,colors:[BaseColor.Brown],desc:'Convert all Green Gems to Skulls.',steps:[{Type:'ConvertGems',Color1:'Green',Color2:'Skull',Amount:100}],segments:[{kind:'gem',params:{op:'transform',from:'Green',to:'SKULL'}}]},
 {id:7151,spell:8710,cost:12,colors:[BaseColor.Yellow,BaseColor.Brown],desc:'Convert all Gems of a Chosen Color to Burning Gems.',steps:[{Type:'ConvertGems',Color1:'FromTarget',Color2:'Burning',Amount:100}],segments:[{kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL',toSpecial:'burningGem'}}]},
 {id:6039,spell:7039,cost:7,colors:[BaseColor.Blue,BaseColor.Purple],desc:'Jumble the Board. Gain an extra turn.',steps:[{Type:'JumbleBoard'},{Type:'ExtraTurn',Amount:100}],segments:[{kind:'shuffleBoard'},{kind:'extraTurn'}]},
] as const;
function fixture(c:typeof cases[number],side:PlayerSide,greenCount=9){
 const f=damageFixture(0,greenCount);Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors]});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;engine.setColorChooser(new FixedColorChooser(BaseColor.Green));
 return {...f,engine,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`troop:${c.id}/${c.spell} stored English/native board entry`,()=>{
 it('full English, native ordered steps, exact entity cost/colours, display and final prototype',()=>{
  const en=original.find((t:{id:number})=>t.id===c.id)!, troop=TROOPS.find(t=>t.id===c.id)!,n=native.get(c.spell).raw;
  expect(en.stats.spell.id).toBe(c.spell);expect(en.stats.spell.desc).toBe(c.desc);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(x=>`Color${x}`).sort());
  expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(c.steps.length);
  c.steps.forEach((step,i)=>expect(n.SpellSteps[i]).toMatchObject(step));
  expect(troop).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(troop.spell.description.trim().length).toBeGreaterThan(5);
  expect(registry.prototypes.get(String(c.spell))).toEqual({segments:c.segments});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const greenCount of [0,9])it(`real ${side}, initial green=${greenCount}`,()=>{
  const f=fixture(c,side,greenCount),before=new Map<number,{pos:string,type:string}>();
  f.board.forEach((gem,pos)=>{if(gem)before.set(gem.id,{pos:`${pos.row},${pos.col}`,type:JSON.stringify(gem.type)});});
  const ev=f.cast();expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);
  if(c.id===6039){
   const shuffled=ev.filter(e=>e.type==='reshuffle');expect(shuffled).toHaveLength(1);
   const after:string[]=[];f.board.forEach((gem)=>{if(gem)after.push(`${gem.id}:${JSON.stringify(gem.type)}`);});
   expect(after.sort()).toEqual([...before.entries()].map(([id,x])=>`${id}:${x.type}`).sort());
   expect([...before.entries()].some(([id,x])=>{let position='';f.board.forEach((gem,pos)=>{if(gem?.id===id)position=`${pos.row},${pos.col}`;});return position!==x.pos;})).toBe(true);
   expect(ev.filter(e=>e.type==='extra-turn')).toHaveLength(1);
   expect(f.state.activePlayer).toBe(side);expect(f.state.actionLog[0].outcome).toBe('extra-turn');
  }else{
   const changed=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
   const greens=[...before.values()].filter(v=>v.type===JSON.stringify({kind:'color',color:BaseColor.Green})).map(v=>v.pos).sort();
   expect(changed.map(x=>`${x.pos.row},${x.pos.col}`).sort()).toEqual(greens);
   if(c.id===7163)expect(changed.every(x=>x.to.kind==='skull')).toBe(true);
   else expect(changed.every(x=>x.to.kind==='special'&&x.to.spec.kind==='burningGem')).toBe(true);
   // A deliberately full Green row produces a 4+ match, so the board may award
   // an extra turn; this is board resolution, not a native ExtraTurn step.
   const extra=ev.some(e=>e.type==='extra-turn');
   expect(f.state.activePlayer).toBe(extra?side:(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left));
   expect(f.state.actionLog[0].outcome).toBe(extra?'extra-turn':'switched');
   if(greenCount===0)expect(extra).toBe(false);
  }
  expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
 });
 if(c.id===7151)for(const side of [PlayerSide.Left,PlayerSide.Right])it(`chosen Blue ${side}: only Blue, not Green/other colors, becomes Burning`,()=>{
  const f=fixture(c,side,9);f.engine.setColorChooser(new FixedColorChooser(BaseColor.Blue));
  const positions:string[]=[];f.board.forEach((gem,pos)=>{if(gem?.type.kind==='color'&&gem.type.color===BaseColor.Blue)positions.push(`${pos.row},${pos.col}`);});
  expect(positions.length).toBeGreaterThan(0);
  const ev=f.cast(),changed=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
  expect(changed.map(x=>`${x.pos.row},${x.pos.col}`).sort()).toEqual(positions.sort());
  expect(changed.every(x=>x.to.kind==='special'&&x.to.spec.kind==='burningGem')).toBe(true);
  expect(f.caster.mana).toBe(0);
 }); for(const mode of ['low-mana','silence'] as const)it(`${mode} real entry refuses, leaves board and turn`,()=>{
  const f=fixture(c,PlayerSide.Left,9),before:string[]=[];f.board.forEach((gem)=>before.push(JSON.stringify(gem)));
  if(mode==='low-mana')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);const after:string[]=[];f.board.forEach((gem)=>after.push(JSON.stringify(gem)));
  expect(after).toEqual(before);expect(f.caster.mana).toBe(mode==='low-mana'?c.cost-1:c.cost);
  expect(f.state.activePlayer).toBe(PlayerSide.Left);expect(f.state.actionLog).toHaveLength(0);
 });
});


