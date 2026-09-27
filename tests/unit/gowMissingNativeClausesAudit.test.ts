// Narrow source-and-cast checks: not whole-skill original acceptance.
// @ts-expect-error Node source snapshots outside app tsconfig
import fs from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
// @ts-expect-error Native source parser outside app bundle
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture,damageCharacter} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import troops from '../../src/data/troops.json';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const ledger=JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json','utf8'));
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const lookup=(id:number)=>weapons.find(w=>w.spell.id===id)!;
function fixture(id:number) {
 const f=damageFixture();const w=lookup(id);f.caster.skillId=`gw_${w.referenceName}`;f.caster.manaCost=f.caster.mana=w.manaCost;
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 return {...f,w,engine,proto:registry.prototypes.get(f.caster.skillId)!,cast:()=>engine.castSkill(f.caster.id)};
}
const main=(events:ReturnType<ReturnType<typeof fixture>['cast']>)=>events.filter(e=>['gem-create','gem-transform','gem-destroy','gem-explode','status-apply','status-cleanse','extra-turn','buff','skill-damage'].includes(e.type));
describe('previously missing native clauses: source, registration and cast (scoped)',()=>{
 const requirements=[
  [7187,['CreateGems','Cleanse','IncreaseHealth'],['gem','cleanse','buff']],
  [8517,['IncreaseHealth','CreateGems','IncreaseHealth','ExtraTurn','IncreaseHealth','ExplodeGems'],['oneOf']],
  [8843,['CreateGems','CreateGems','CreateGems','CreateGems','ExtraTurn'],['gem','gem','gem','gem','extraTurn']],
  [8947,['CreateGems','ExtraTurn'],['gem','extraTurn']],
 ] as const;
 for(const [id,steps,kinds] of requirements)it(`${id}: English, original steps, registered effects and generator agree`,()=>{
  expect(english.find((x:{stats:{spell:{id:number}}})=>x.stats.spell.id===id)?.stats.spell.desc).toBeTruthy();
  expect(native.get(id)?.raw.SpellSteps.map((s:{Type:string})=>s.Type)).toEqual(steps);
  expect(registry.prototypes.get(`gw_${lookup(id).referenceName}`)?.segments.map(s=>s.kind)).toEqual(kinds);
 });
 it('7187 cast creates seven red gems, cleanses every ally, then heals one random ally',()=>{
  const f=fixture(7187);f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1,{hp:900,statuses:[{id:'poison',turns:3}]}));
  f.caster.hp=900;f.caster.statuses=[{id:'poison',turns:3}];
  const ev=main(f.cast());
  expect(ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[])).toHaveLength(7);
  expect(ev.filter(e=>e.type==='status-cleanse').map(e=>e.type==='status-cleanse'?e.targetId:null).sort()).toEqual([0,1]);
  expect(ev.findIndex(e=>e.type==='gem-transform')).toBeLessThan(ev.findIndex(e=>e.type==='status-cleanse'));
  expect(ev.findIndex(e=>e.type==='status-cleanse')).toBeLessThan(ev.findIndex(e=>e.type==='buff'&&e.stat==='hp'));
 });
 const colors=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(const [i,color] of colors.entries())it(`${8254+i}: native colored stun and cleanse, normal and Doom branches`,()=>{
  const id=8254+i;const f=fixture(id);
  const steps=native.get(id)?.raw.SpellSteps;
  expect(steps.map((x:{Type:string})=>x.Type)).toEqual(['SplashHeavyDamage','CauseStun','Cleanse','ExplodeGems']);
  expect(steps[1]).toMatchObject({Target:'EnemyColor',Data:String(i)});
  expect(steps[2]).toMatchObject({Target:'AllyColor',Data:String(i)});
  expect(english.find((x:{stats:{spell:{id:number}}})=>x.stats.spell.id===id)?.stats.spell.desc).toContain('Cleanse all');
  expect(f.proto.segments.map(s=>s.kind)).toEqual(['damage','status','cleanse','gem','gem']);
  f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1,{colors:[color],statuses:[{id:'poison',turns:3}]}));
  f.state.teams[PlayerSide.Left].characters.push(damageCharacter(2,{colors:[BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown].filter(c=>c!==color),statuses:[{id:'poison',turns:3}]}));
  f.caster.colors=[BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown].filter(c=>c!==color);
  f.enemies[0].colors=[color];f.enemies.slice(1).forEach(e=>e.colors=[BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown].filter(c=>c!==color));
  const ev=main(f.cast());
  expect(ev.filter(e=>e.type==='status-apply'&&e.statusId==='stun').map(e=>e.type==='status-apply'?e.targetId:null)).toEqual([10]);
  expect(ev.filter(e=>e.type==='status-cleanse').map(e=>e.type==='status-cleanse'?e.targetId:null)).toEqual([1]);
  expect(ev.filter(e=>e.type==='gem-explode')).toHaveLength(1);
  const none=fixture(id);none.caster.colors=[BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown].filter(c=>c!==color);
  none.enemies.forEach(e=>e.colors=[BaseColor.Red,BaseColor.Blue,BaseColor.Green,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown].filter(c=>c!==color));
  expect(main(none.cast()).filter(e=>e.type==='status-apply'||e.type==='status-cleanse')).toHaveLength(0);
  const doom=fixture(id);doom.enemies[0].troopTypes=['Doom'];
  expect(main(doom.cast()).filter(e=>e.type==='gem-explode')).toHaveLength(2);
 });
 it('8517: three exclusive cast branches, each heals once',()=>{
  expect(native.get(8517)?.raw.Randomize).toBe('AB-CD-EF');
  for(let selected=0;selected<3;selected++){
   const f=fixture(8517);f.caster.hp=900;
   const prev=f.ctx.rng.nextInt.bind(f.ctx.rng);vi.spyOn(f.ctx.rng,'nextInt').mockImplementation(n=>n===3?selected:prev(n));
   const events=main(f.cast());const types=events.map(e=>e.type);
   expect(types.filter(t=>t==='buff')).toHaveLength(1);
   expect(types.includes('gem-transform')).toBe(selected===0);
   expect(types.includes('extra-turn')).toBe(selected===1);
   expect(types.includes('gem-explode')).toBe(selected===2);
  }
 });
 it('8843: four dragon colors x 2 then extra turn; 8947: six web gems then extra turn',()=>{
  for(const [id,expected] of [[8843,['DragonBlue','DragonGreen','DragonRed','DragonBrown']],[8947,['Web']]] as const){
   const ev=main(fixture(id).cast());
   const creates=ev.filter(e=>e.type==='gem-transform');
   expect(creates).toHaveLength(expected.length);
   expect(creates.map(e=>e.type==='gem-transform'?e.changes.length:null)).toEqual(expected.map(()=>id===8843?2:6));
   expect(ev.some(e=>e.type==='extra-turn'&&e.source==='skill')).toBe(true);
   expect(ev.findIndex(e=>e.type==='gem-transform')).toBeLessThan(ev.findIndex(e=>e.type==='extra-turn'));
  }
 });
 it('8957 Eleanor: English/native two steps and real cast barriers only front surviving ally',()=>{
  const src=ledger.rows?.find((x:{kind:string;spellId:number})=>x.kind==='troop'&&x.spellId===8957)
   ?? ledger.find?.((x:{kind:string;spellId:number})=>x.kind==='troop'&&x.spellId===8957);
  expect(src?.source?.englishDescription).toContain('Barrier the first Ally');
  expect(native.get(8957)?.raw.SpellSteps).toMatchObject([{Type:'DestroyColor',Amount:8},{Type:'CauseBarrier',Target:'FrontAlly'}]);
  expect(troops.find(t=>t.id===7334)?.spell.description).toContain('\u5c4f\u969c');
  const f=damageFixture();const t=troops.find(t=>t.id===7334)!;
  f.caster.skillId=String(t.spell.id);f.caster.mana=f.caster.manaCost=t.manaCost;
  f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1));
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  const ev=main(engine.castSkill(f.caster.id));
  expect(ev.findIndex(e=>e.type==='gem-destroy')).toBeLessThan(ev.findIndex(e=>e.type==='status-apply'&&e.statusId==='barrier'));
  expect(ev.filter(e=>e.type==='gem-destroy').flatMap(e=>e.type==='gem-destroy'?e.cells:[])).toHaveLength(8);
  expect(ev.filter(e=>e.type==='status-apply'&&e.statusId==='barrier').map(e=>e.type==='status-apply'?e.targetId:null)).toEqual([0]);
 });
});
