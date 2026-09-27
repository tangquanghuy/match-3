// Lane L2 B03/B04 difference repro (NOT signoff evidence): L2-6416-branch-weights, L2-random-status-pools, L2-singlegem-cell.
import {describe,it,expect} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {SeededRNG} from '@engine/rng';
import {BaseColor} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {RANDOM_NEGATIVE_STATUS_POOL,RANDOM_POSITIVE_STATUS_POOL} from '@engine/skills/effects/status';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';

const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const OFFICIAL_POSITIVE=['barrier','blessed','enchanted','enraged','reflect','submerged'];
const OFFICIAL_NEGATIVE=['bleed','burning','curse','death-mark','disease','entangle','faerie-fire','frozen','marked','lycanthropy','poison','silence','stun','web','terror'];
function cast(spell:string,cost:number,seed:number,opts:{color?:BaseColor;cell?:{row:number;col:number}}={}){
 const f=damageFixture(0,0,[{},{},{},{}]);Object.assign(f.caster,{skillId:spell,mana:cost,manaCost:cost,magic:10});
 f.state.teams.Left.characters.push(damageCharacter(20,{mana:0,magic:3,statuses:[{id:'poison',turns:3,magnitude:3}]}));
 const e=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);e.skullChance=0;e.setTargetChooser(new FixedTargetChooser(12));
 if(opts.color)e.setColorChooser(new FixedColorChooser(opts.color));if(opts.cell)e.setCellChooser({choose:()=>opts.cell!});
 return {f,ev:e.castSkill(0) as unknown as Array<Record<string,unknown>>};
}
describe('L2-6416-branch-weights: A+(B-C-D-E-F) = Cleanse, Enchant, Magic, Cleanse, Enchant',()=>{
 it('Magic follow-up is 1/5, not 1/3 (500 seeds)',()=>{
  let magic=0;for(let s=1;s<=500;s++){const {f,ev}=cast('7574',13,s,{color:BaseColor.Blue});
   if(!ev.some(e=>e.type==='status-apply')&&!ev.some(e=>e.type==='status-cleanse')&&f.state.teams.Left.characters[1].magic>3)magic++;}
  expect(magic).toBeGreaterThanOrEqual(65);expect(magic).toBeLessThanOrEqual(135);
 });
});
describe('L2-random-status-pools: random status pools = official status list (official-status-effects.html)',()=>{
 it('default ally pool = 6 official positives; enemy pool = 15 official negatives (no charm)',()=>{
  expect([...RANDOM_POSITIVE_STATUS_POOL].sort()).toEqual([...OFFICIAL_POSITIVE].sort());
  expect([...RANDOM_NEGATIVE_STATUS_POOL].sort()).toEqual([...OFFICIAL_NEGATIVE].sort());
 });
 it("RandomPositiveStatusEffect (8938) never draws the 'rage' alias, so Enrage is not double-weighted",()=>{
  const ids=new Set<string>();for(let s=1;s<=300;s++)for(const e of cast('8938',16,s).ev)if(e.type==='status-apply')ids.add(String(e.statusId));
  expect(ids.has('rage')).toBe(false);
 });
});
describe('L2-singlegem-cell: ConvertGems BoardTarget SingleGem converts the chosen gem',()=>{
 for(const [spell,cost] of [['8722',10],['9197',12]] as const)it(`${spell}: the first transform is the chosen cell (2,5)`,()=>{
  const {ev}=cast(spell,cost,3,{cell:{row:2,col:5}});
  const t=ev.find(e=>e.type==='gem-transform') as {changes:Array<{pos:{row:number;col:number}}>};expect(t.changes.map(c=>c.pos)).toEqual([{row:2,col:5}]);
 });
});
void ({} as GameEvent);
