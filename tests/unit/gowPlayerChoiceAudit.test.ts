// @ts-expect-error Node source access
import fs from 'node:fs';
import {describe, it, expect, vi} from 'vitest';
// @ts-expect-error Independent source snapshot parser
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {registerSkillLibrary} from '@engine/skills/library';
import {executePrototype} from '@engine/skills/prototypes';
import {AiBranchChooser, FixedBranchChooser, selectSkillBranch} from '@engine/skills/branchChooser';
import {chooseSkill, skill, dmg, createGems, destroyChosenCol, heal} from '@engine/skills/builders';
import {prototypeNeedsCell} from '@engine/skills/cellChooser';
import {prototypeNeedsColor} from '@engine/skills/colorChooser';
import {prototypeChosenTargetMode} from '@engine/skills/targetChooser';
import {BaseColor, PlayerSide, SPIRIT_GEM_DRAIN} from '@engine/types';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {damageFixture, damageCharacter} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import troops from '../../src/data/troops.json';
import {troopToSummonTemplate} from '../../src/data/troops';
import {spellDescription} from '../../src/data/combatText';
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const repaired = [8300, 8855, 8857, 8858, 9204, 8860, 8862, 8867, 8868, 8896, 8898, 9366, 9818, 8623, 8876, 8951, 8967, 9401, 9467, 9657, 9640, 8863, 8866, 8899, 10058, 9017, 9674, 9813, 8900];
function fixture(id: number, branch: number | null = 0) {
 const f = damageFixture(0,12);
 const weapon = weapons.find(t=>t.spell.id===id);
 const entity = weapon ?? troops.find(t=>t.spell.id === id)!;
 f.caster.skillId = weapon ? `gw_${entity.referenceName}` : String(id);
 f.caster.mana = f.caster.manaCost = entity.manaCost;
 f.ctx.resolveSummonRef = troopToSummonTemplate;
 f.ctx.chosenBranch = branch ?? undefined; f.ctx.chosenCell = {row:2,col:5};
 const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
 engine.setSummonResolver(troopToSummonTemplate);
 engine.setBranchChooser(new FixedBranchChooser(branch));
 engine.setTargetChooser({choose:()=>11}); engine.setCellChooser({choose:()=>({row:2,col:5})});
 return {...f, engine, proto: registry.prototypes.get(f.caster.skillId)!, cast:()=>engine.castSkill(0)};
}
describe('native Choose: source-backed branch repairs (not whole-skill certification)',()=>{
 for (const id of repaired) it(`${id}: native ABC-DEF means one player choice; two ordered branches`,()=>{
  expect(native.get(id).raw.Randomize).toBe([8868,9818,10058].includes(id)?'Choose:AB-CDEF':'Choose:ABC-DEF');
  const f = fixture(id); expect(f.proto.segments).toHaveLength(1);
  expect(f.proto.segments[0]).toMatchObject({kind:'choose',options:[expect.any(Array),expect.any(Array)]});
 });
 for(const id of repaired) for (const branch of [null,-1,2,0.5,NaN]) it(`${id}: cancelled/invalid ${branch} never spends mana or executes cast triggers`,()=>{
  const f = fixture(id,branch); const before = JSON.stringify(f.state); const rng = vi.spyOn(f.ctx.rng,'next');
  expect(f.cast()).toEqual([]); expect(JSON.stringify(f.state)).toBe(before); expect(rng).not.toHaveBeenCalled();
 });
 for(const id of repaired) it(`${id}: direct execution with no choice also has no effects`,()=>{
  const f = fixture(id,null);const before=JSON.stringify(f.state);
  expect(executePrototype(f.proto,f.ctx)).toEqual([]);expect(JSON.stringify(f.state)).toBe(before);
 });
 for(const branch of [0,1]) it(`8300: branch ${branch} creates OR destroys exactly 9 green`,()=>{
  expect(native.get(8300).raw.SpellSteps.filter((s:{Type:string})=>s.Type !== 'None')).toMatchObject([
   {Type:'CreateGems',Color1:'Green',Amount:9},{Type:'DestroyColor',Color1:'Green',Amount:9}]);
  const f=fixture(8300,branch); const ev=executePrototype(f.proto,f.ctx);
  if(branch===0){ expect(ev.filter(e=>e.type==='gem-destroy')).toHaveLength(0);
   expect(ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes)).toHaveLength(9);
  } else {expect(ev.filter(e=>e.type==='gem-transform')).toHaveLength(0);
   expect(ev.filter(e=>e.type==='gem-destroy').flatMap(e=>e.cells)).toHaveLength(9);}
 });
 for(const branch of [0,1]) it(`8855: branch ${branch} destroys only the selected line`,()=>{
  expect(native.get(8855).raw.SpellSteps.filter((s:{Type:string})=>s.Type!=='None').map((s:{BoardTarget:string})=>s.BoardTarget)).toEqual(['Column','Row']);
  const f=fixture(8855,branch); const cells=executePrototype(f.proto,f.ctx).filter(e=>e.type==='gem-destroy').flatMap(e=>e.cells);
  expect(cells).toHaveLength(8);expect(cells.every(c=>branch===0?c.pos.col===5:c.pos.row===2)).toBe(true);
 });
 for(const branch of [0,1]) it(`8858: branch ${branch} uses first OR last two enemies after the matching gem effect`,()=>{
  const source=native.get(8858).raw.SpellSteps.filter((s:{Type:string})=>s.Type!=='None');
  expect(source).toMatchObject([{Type:'DestroyColor',Color1:'Purple',Amount:100},{Type:'Damage',Target:'FirstTwoEnemies',Amount:4,SpellPowerMultiplier:1},
   {Type:'CreateGems',Color1:'Purple',Amount:12},{Type:'Damage',Target:'LastTwoEnemies',Amount:4,SpellPowerMultiplier:1}]);
  const f=fixture(8858,branch),ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual((branch===0?[10,11]:[12,13]).map(id=>[id,15]));
  expect(ev[0].type).toBe(branch===0?'gem-destroy':'gem-transform');
  expect(ev.some(e=>e.type===(branch===0?'gem-transform':'gem-destroy'))).toBe(false);
 });
 // Half-mana rounding and IncreaseHealth vs heal-max rules are separate unresolved shared-rule dimensions.
 for(const branch of [0,1]) it(`8857: branch ${branch} affects life OR other allies' mana, never both`,()=>{
  expect(native.get(8857).raw.SpellSteps.filter((s:{Type:string})=>s.Type!=='None')).toMatchObject([
   {Type:'IncreaseHealth',Target:'AllAllies',Amount:1,SpellPowerMultiplier:1},{Type:'GenerateHalfMana',Target:'AllAlliesButNotSelf'}]);
  const f=fixture(8857,branch); f.caster.hp=900;f.caster.mana=0;
  const ally=damageCharacter(1,{hp:900,mana:0,manaCost:16});f.state.teams[PlayerSide.Left].characters.push(ally);
  const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='buff').map(e=>[e.targetId,e.stat,e.amount])).toEqual(branch===0?[[0,'hp',12],[1,'hp',12]]:[[1,'mana',8]]);
 });
 for(const branch of [0,1]) for(const magic of [1,11,21]) for(const target of [10,11,13]) it(`9204 branch=${branch} magic=${magic} target=${target}: 8 lightning gems and one ordinary splash`,()=>{
  const src=native.get(9204).raw;
  expect(src.Cost).toBe(14); expect(src.SpellSteps[branch===0?0:3]).toMatchObject({Type:'CreateGems',Amount:8,Color1:branch===0?'LightningBlue':'LightningYellow'});
  expect(src.SpellSteps[branch===0?1:4]).toMatchObject({Type:'SplashHighDamage',Amount:3,SpellPowerMultiplier:1,Target:'FromTarget'});
  const f=fixture(9204,branch);f.caster.magic=magic;f.ctx.chosenTargetId=target;
  const ev=executePrototype(f.proto,f.ctx); const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  expect(changes).toHaveLength(8); expect(changes.every(c=>c.to.kind==='special' && c.to.spec.kind===(branch===0?'lightningRow':'lightningCol'))).toBe(true);
  const hit=ev.filter(e=>e.type==='skill-damage');
  expect(hit.map(e=>[e.targetId,e.damage])).toEqual([target,...[target-1,target+1].filter(id=>id>=10&&id<=13)].map((id,i)=>[id,i===0?magic+3:(magic+3)/2]));
  expect(ev[0].type).toBe('gem-transform');
 });
 for(const branch of [0,1]) it(`9204 real weapon binding + TurnEngine pipeline branch ${branch}`,()=>{
  const f=fixture(9204,branch),ev=f.cast();
  expect(ev[0]).toMatchObject({type:'skill-cast',skillId:f.caster.skillId});
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,14],[10,7],[12,7]]);
  const first=ev.find(e=>e.type==='gem-transform');expect(first?.type).toBe('gem-transform');
  if(first?.type==='gem-transform'){expect(first.changes).toHaveLength(8);expect(first.changes.every(c=>c.to.kind==='special' && c.to.spec.kind===(branch===0?'lightningRow':'lightningCol'))).toBe(true);}
  expect(f.state.actionLog).toHaveLength(1);
 });
 for(const branch of [0,1]) it(`8860 choice ${branch}: magic gain never also amplifies a scatter cast`,()=>{
  expect(native.get(8860).raw.SpellSteps.filter((s:{Type:string})=>s.Type!=='None')).toMatchObject([{Type:'IncreaseSpellPower',Amount:3},{Type:'ScatterDamage',SpellPowerMultiplier:1,Amount:6}]);
  const f=fixture(8860,branch); const ev=executePrototype(f.proto,f.ctx);
  const hits=ev.filter(e=>e.type==='skill-damage');
  expect(hits.reduce((a,e)=>a+e.damage,0)).toBe(branch===0?0:17);
  expect(f.caster.magic).toBe(branch===0?14:11);
 });
 for(const branch of [0,1]) it(`8862 choice ${branch}: true vs normal splash, blue-gem boost x2`,()=>{
  const f=fixture(8862,branch);f.enemies.forEach(e=>e.armor=100);
  let blue=0;f.board.forEach(g=>{if(g?.type.kind==='color'&&g.type.color===BaseColor.Blue)blue++;});
  const source=native.get(8862).raw.SpellSteps;
  expect(source[branch===0?0:3]).toMatchObject({Type:'CountGems',Color1:'Blue',Amount:200});
  expect(source[branch===0?1:4]).toMatchObject({Type:branch===0?'TrueDamage':'SplashHighDamage',Amount:4,SpellPowerMultiplier:1});
  const amount=15+blue*2,ev=executePrototype(f.proto,f.ctx),hits=ev.filter(e=>e.type==='skill-damage');
  expect(hits.map(e=>[e.targetId,e.damage])).toEqual(branch===0?[[11,amount]]:[[11,amount],[10,Math.floor(amount/2)],[12,Math.floor(amount/2)]]);
  expect(f.enemies[1].hp).toBe(branch===0?1000-amount:1000);
 });
 for(const branch of [0,1]) it(`8867 choice ${branch}: selected damage or all armor removal`,()=>{
  expect(native.get(8867).raw.SpellSteps[3]).toMatchObject({Type:'DecreaseArmor',Target:'FromTarget',Amount:1000});
  const f=fixture(8867,branch);f.enemies[1].armor=500;
  const ev=executePrototype(f.proto,f.ctx);expect(f.enemies[1].armor).toBe(branch===0?486:0);
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(branch===0?1:0);
 });
 for(const branch of [0,1]) it(`8868 choice ${branch}: freeze gems + extra-turn signal or armor steal`,()=>{
  const source=native.get(8868).raw.SpellSteps;expect(source.slice(0,2)).toMatchObject([{Type:'CreateGems',Amount:3,Color1:'Freeze'},{Type:'ExtraTurn'}]);
  const f=fixture(8868,branch);f.enemies.forEach(e=>e.armor=30);const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='extra-turn')).toHaveLength(branch===0?1:0);
  expect(f.caster.armor).toBe(branch===0?0:12);
  if(branch===0){const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);expect(changes).toHaveLength(3);expect(changes.every(c=>c.to.kind==='special'&&c.to.spec.kind==='freezeGem')).toBe(true);}
  else expect(ev.some(e=>e.type==='gem-transform')).toBe(false);
 });
 for(const branch of [0,1]) it(`8896 choice ${branch}: damage then Shadow Fox OR +5 magic (not mana)`,()=>{
  expect(native.get(8896).raw.SpellSteps).toMatchObject([{Type:'Damage'},{Type:'Summoning',Amount:7297},{Type:'None'},{Type:'Damage'},{Type:'IncreaseSpellPower',Amount:5}]);
  const f=fixture(8896,branch);f.caster.mana=0;const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[11,14]]);
  expect(f.caster.magic).toBe(branch===0?11:16);expect(f.caster.mana).toBe(0);
  expect(ev.filter(e=>e.type==='summon')).toHaveLength(branch===0?1:0);
 });
 for(const branch of [0,1]) it(`8898 choice ${branch}: yellow -> spirit OR skull`,()=>{
  expect(native.get(8898).raw.SpellSteps[branch===0?0:3]).toMatchObject({Type:'ConvertGems',Color1:'Yellow',Color2:branch===0?'Spirit':'Skull'});
  const f=fixture(8898,branch);const changes=executePrototype(f.proto,f.ctx).filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  expect(changes.length).toBeGreaterThan(0);expect(changes.every(c=>c.from.kind==='color'&&c.from.color===BaseColor.Yellow)).toBe(true);
  expect(changes.every(c=>branch===0?c.to.kind==='special'&&c.to.spec.kind==='spiritGem':c.to.kind==='skull')).toBe(true);
 });
 for(const branch of [0,1]) it(`9366 choice ${branch}: only the selected color pair converts`,()=>{
  const source=native.get(9366).raw.SpellSteps;expect(source[branch===0?0:3]).toMatchObject({Color1:branch===0?'Blue':'Brown',Color2:'Green'});
  const f=fixture(9366,branch);const changes=executePrototype(f.proto,f.ctx).filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  expect(changes.length).toBeGreaterThan(0);
  expect(changes.every(c=>c.from.kind==='color'&&(branch===0?[BaseColor.Blue,BaseColor.Red]:[BaseColor.Brown,BaseColor.Purple]).includes(c.from.color))).toBe(true);
 });
 for(const branch of [0,1]) it(`9818 choice ${branch}: both requested enemies hit before doomskull conversion`,()=>{
  expect(native.get(9818).raw.Randomize).toBe('Choose:AB-CDEF');
  expect(native.get(9818).raw.SpellSteps[branch===0?0:2]).toMatchObject({Type:'Damage',Target:branch===0?'FirstTwoEnemies':'LastTwoEnemies',Amount:4,SpellPowerMultiplier:1});
  const f=fixture(9818,branch),ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual((branch===0?[10,11]:[12,13]).map(id=>[id,15]));
  expect(ev[0].type).toBe('skill-damage');
  const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  expect(changes.every(c=>c.from.kind==='color'&&c.from.color===(branch===0?BaseColor.Green:BaseColor.Red)&&c.to.kind==='special'&&c.to.spec.kind==='doomSkull')).toBe(true);
 });
 for(const branch of [0,1]) it(`8623 choice ${branch}: stars and only associated status side`,()=>{
  expect(native.get(8623).raw.SpellSteps[branch===0?0:3]).toMatchObject({Type:'CreateGems',Color1:branch===0?'ElementalStar':'LightDarkStar',Amount:branch===0?6:7});
  const f=fixture(8623,branch),ev=executePrototype(f.proto,f.ctx),changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  expect(changes).toHaveLength(branch===0?6:7);expect(changes.every(c=>c.to.kind==='special'&&c.to.spec.kind===(branch===0?'elementalStar':'umbralStar'))).toBe(true);
  expect(f.caster.statuses.some(s=>s.id==='blessed')).toBe(branch===0);
  expect(f.enemies.every(e=>e.statuses.some(s=>s.id==='curse'))).toBe(branch===1);
 });
 for(const branch of [0,1]) it(`8876 choice ${branch}: selected color vs selected cell`,()=>{
  const f=fixture(8876,branch);f.ctx.chosenColor=BaseColor.Red;
  expect(native.get(8876).raw.SpellSteps[branch===0?0:3]).toMatchObject({Type:branch===0?'ConvertGems':'ExplodeGems'});
  const p=selectSkillBranch(f.proto,branch)!;expect(prototypeNeedsColor(p)).toBe(branch===0);expect(prototypeNeedsCell(p)).toBe(branch===1);
  const ev=executePrototype(f.proto,f.ctx);expect(ev.some(e=>e.type==='gem-explode')).toBe(branch===1);
  if(branch===0){const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);expect(changes).toHaveLength(12);expect(changes.every(c=>c.to.kind==='color'&&c.to.color===BaseColor.Red)).toBe(true);}
 });
 for(const branch of [0,1]) it(`8951 choice ${branch}: spirit gems + restored extra turn OR double-magic true damage`,()=>{
  expect(native.get(8951).raw.SpellSteps).toMatchObject([{Type:'CreateGems',Color1:'Spirit',Amount:8},{Type:'ExtraTurn'},{Type:'None'},{Type:'TrueDamage',Target:'RandomEnemy',Amount:3,SpellPowerMultiplier:2}]);
  const f=fixture(8951,branch);f.enemies.forEach(e=>e.armor=100);const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='extra-turn')).toHaveLength(branch===0?1:0);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual(branch===0?[]:[25]);
  expect(f.enemies.reduce((a,e)=>a+1000-e.hp,0)).toBe(branch===0?0:25);
  if(branch===0)expect(ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes)).toHaveLength(8);
 });

 for(const id of repaired) it(`${id}: player description explicitly presents alternatives`,()=>{
  const desc=spellDescription(id,'raw source');expect(desc).toMatch(/^选择一项：/);expect(desc).toContain('；或');expect(desc).not.toContain('&&');
 });
 for(const branch of [0,1]) it(`9467 choice ${branch}: portal gems OR explosion followed by Spirit Fox`,()=>{
  expect(native.get(9467).raw.SpellSteps).toMatchObject([{Type:'CreateGems',Color1:'DaemonicPortal',Amount:2},{Type:'None'},{Type:'None'},{Type:'ExplodeGems',Amount:1},{Type:'Summoning',Amount:6207}]);
  const f=fixture(9467,branch),ev=executePrototype(f.proto,f.ctx);
  expect(ev.some(e=>e.type==='gem-explode')).toBe(branch===1);expect(ev.filter(e=>e.type==='summon')).toHaveLength(branch===1?1:0);
  if(branch===0){const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);expect(changes).toHaveLength(2);expect(changes.every(c=>c.to.kind==='special'&&c.to.spec.kind==='daemonicPortalGem')).toBe(true);}
  else {expect(ev.filter(e=>e.type==='summon').map(e=>e.troopId)).toEqual([6207]);expect(f.state.teams.Left.characters[1].skillId).toBe(troopToSummonTemplate('SpiritFox')!.skillId);expect(ev.findIndex(e=>e.type==='gem-explode')).toBeLessThan(ev.findIndex(e=>e.type==='summon'));}
 });
 for(const branch of [0,1]) it(`9401 choice ${branch}: mana and barrier OR other-allies stats (life cap remains separate)`,()=>{
  expect(native.get(9401).raw.SpellSteps[branch===0?0:3]).toMatchObject(branch===0?{Type:'GenerateMana',Amount:8,Target:'AllAllies'}:{Type:'IncreaseAllStats',SpellPowerMultiplier:0.75,Amount:1,Target:'AllAlliesButNotSelf'});
  const f=fixture(9401,branch);f.caster.magic=12;f.caster.mana=0;
  const ally=damageCharacter(1,{mana:0,hp:500});f.state.teams.Left.characters.push(ally);
  executePrototype(f.proto,f.ctx);
  expect(f.caster.magic).toBe(12);expect(f.caster.mana).toBe(branch===0?8:0);
  expect(ally.mana).toBe(branch===0?8:0);expect(ally.statuses.some(s=>s.id==='barrier')).toBe(branch===0);
  expect([ally.attack,ally.armor,ally.hp,ally.magic]).toEqual(branch===0?[17,0,500,11]:[27,10,510,21]);
 });
 for(const branch of [0,1]) for(const race of ['Daemon','Undead','Human']) it(`8967 choice ${branch}, ${race}: one random-stat reduction and only selected race doubles`,()=>{
  const source=native.get(8967).raw.SpellSteps;
  expect(source[branch===0?0:3]).toMatchObject({Type:'CountGems',Color1:'Angel',Amount:34});
  expect(source[branch===0?1:4]).toMatchObject({Type:'DecreaseRandom',StatusModifier:branch===0?'MultiplyForDaemon':'MultiplyForUndead',Amount:1,SpellPowerMultiplier:1});
  const f=fixture(8967,branch);f.enemies[1].attack=100;f.enemies[1].troopTypes=[race];
  // Zero Angel gems avoids signing off the unresolved general ratio rounding rule.
  const rng=vi.spyOn(f.ctx.rng,'nextInt').mockReturnValue(0);const ev=executePrototype(f.proto,f.ctx);
  expect(rng).toHaveBeenCalledTimes(1);expect(ev.filter(e=>e.type==='buff').map(e=>[e.targetId,e.amount])).toEqual([[11,-12*(race===(branch===0?'Daemon':'Undead')?2:1)]]);
 });
 for(const branch of [0,1]) it(`9657 choice ${branch}: chosen-color gems and matching side only`,()=>{
  expect(native.get(9657).raw.SpellSteps[branch===0?0:3]).toMatchObject({Type:'ConvertGems',Color1:'FromTarget',Color2:branch===0?'Enchant':'Entangle',Amount:10});
  const f=fixture(9657,branch);f.ctx.chosenColor=BaseColor.Green;
  const ally=damageCharacter(1,{colors:[BaseColor.Blue]});f.state.teams.Left.characters.push(ally);f.enemies[0].colors=[BaseColor.Blue];
  const ev=executePrototype(f.proto,f.ctx),changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  expect(changes).toHaveLength(10);expect(changes.every(c=>c.from.kind==='color'&&c.from.color===BaseColor.Green&&c.to.kind==='special'&&c.to.spec.kind===(branch===0?'enchantedGem':'entangleGem'))).toBe(true);
  expect(f.caster.statuses.some(s=>s.id==='blessed')).toBe(branch===0);expect(ally.statuses).toEqual([]);
  expect(f.enemies[0].statuses).toEqual([]);expect(f.enemies.slice(1).every(e=>e.statuses.some(s=>s.id==='curse'))).toBe(branch===1);
  expect(prototypeNeedsColor(selectSkillBranch(f.proto,branch)!)).toBe(true);
 });
 for(const branch of [0,1]) it(`9640 choice ${branch}: reduce and apply matching status to same selected enemy`,()=>{
  expect(native.get(9640).raw.SpellSteps[branch===0?0:3]).toMatchObject({Type:branch===0?'DecreaseAttack':'DecreaseRandom',Target:'FromTarget',Amount:2,SpellPowerMultiplier:1});
  const f=fixture(9640,branch);f.enemies[1].armor=100;const rng=vi.spyOn(f.ctx.rng,'nextInt').mockReturnValue(1);
  const ev=executePrototype(f.proto,f.ctx);expect(rng).toHaveBeenCalledTimes(branch===0?0:1);
  expect(ev.filter(e=>e.type==='buff').map(e=>[e.targetId,e.stat,e.amount])).toEqual([[11,branch===0?'attack':'armor',-13]]);
  expect(f.enemies[1].statuses.map(s=>s.id)).toEqual([branch===0?'curse':'death-mark']);
  expect(f.enemies.filter(e=>e.id!==11).every(e=>e.statuses.length===0)).toBe(true);
 });
 it('8863 true damage branch does not summon',()=>{
  expect(native.get(8863).raw.SpellSteps[0]).toMatchObject({Type:'TrueDamage',Target:'AllEnemies',Amount:5,SpellPowerMultiplier:1});
  const f=fixture(8863,0);f.enemies.forEach(e=>e.armor=100);const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([10,11,12,13].map(id=>[id,16]));
  expect(f.enemies.every(e=>e.hp===984&&e.armor===100)).toBe(true);expect(ev.some(e=>e.type==='summon')).toBe(false);
 });
 for(const rolls of [[0.1,0.1],[0.1,0.9],[0.9,0.1],[0.9,0.9]]) it(`8863 summon branch: independent 50% rolls ${rolls}`,()=>{
  expect(native.get(8863).raw.SpellSteps.slice(3)).toMatchObject([{Type:'SummoningTarget',Amount:7288},{Type:'SummoningTarget',Amount:7288,PercentageChance:50},{Type:'SummoningTarget',Amount:7288,PercentageChance:50}]);
  const f=fixture(8863,1),rng=vi.spyOn(f.ctx.rng,'next').mockReturnValueOnce(rolls[0]).mockReturnValueOnce(rolls[1]);
  const ev=executePrototype(f.proto,f.ctx),count=1+rolls.filter(x=>x<0.5).length;
  expect(rng).toHaveBeenCalledTimes(2);expect(ev.filter(e=>e.type==='summon')).toHaveLength(count);expect(ev.some(e=>e.type==='skill-damage')).toBe(false);
  expect(ev.filter(e=>e.type==='summon').map(e=>e.troopId)).toEqual(Array(count).fill(7288));
  expect(f.state.teams.Left.characters.slice(1).map(c=>c.skillId)).toEqual(Array(count).fill(troopToSummonTemplate('VulpphireHunter')!.skillId));
 });

 for(const branch of [0,1]) it(`8866 choice ${branch}: chosen enemy attack or armor, both at 3:1`,()=>{
  expect(native.get(8866).raw.SpellSteps[branch===0?0:3]).toMatchObject({Type:branch===0?'CountAttack':'CountArmor',Target:'FromTarget',Amount:34});
  const f=fixture(8866,branch);f.enemies.forEach(e=>{e.attack=300;e.armor=900;});f.enemies[1].attack=30;f.enemies[1].armor=90;
  const hits=executePrototype(f.proto,f.ctx).filter(e=>e.type==='skill-damage');expect(hits.map(e=>[e.targetId,e.damage])).toEqual([[11,branch===0?24:44]]);
 });
 for(const branch of [0,1]) it(`8899 choice ${branch}: all-enemy true damage OR boosted weakest-enemy true damage`,()=>{
  const raw=native.get(8899).raw.SpellSteps;
  expect(raw[branch===0?0:5]).toMatchObject({Type:'TrueDamage',Amount:1,Target:branch===0?'AllEnemies':'WeakestEnemy'});
  expect(raw.slice(3,5)).toMatchObject([{Type:'CountGems',Color1:'Red',Amount:200},{Type:'CountGems',Color1:'Spirit',Amount:200,UseCounterForAmount:true}]);
  const f=fixture(8899,branch);f.enemies.forEach(e=>e.armor=100);f.enemies[2].hp=200;
  f.board.set({row:0,col:0},{id:1,type:{kind:'color',color:BaseColor.Red}});
  f.board.set({row:0,col:1},{id:2,type:{kind:'special',spec:{kind:'spiritGem',color:BaseColor.Purple}}});
  const hits=executePrototype(f.proto,f.ctx).filter(e=>e.type==='skill-damage');
  expect(hits.map(e=>[e.targetId,e.damage])).toEqual(branch===0?[10,11,12,13].map(id=>[id,12]):[[12,16]]);
 });
 for(const branch of [0,1]) it(`10058 choice ${branch}: restored magic formula and both last enemies OR full healing and extra-turn signal`,()=>{
  const raw=native.get(10058).raw.SpellSteps;
  expect(raw).toMatchObject([{Type:'CountLife',Target:'Self',Amount:100},{Type:'Damage',Target:'LastTwoEnemies',SpellPowerMultiplier:1,Amount:2},{Type:'CauseEntangle',Target:'AllEnemies'},{Type:'Heal',Target:'Self',Amount:1000},{Type:'ExtraTurn'}]);
  const f=fixture(10058,branch);f.caster.hp=400;const ev=executePrototype(f.proto,f.ctx);
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual(branch===0?[[12,413],[13,413]]:[]);
  expect(f.caster.hp).toBe(branch===0?400:1000);expect(f.enemies.every(e=>e.statuses.some(s=>s.id==='entangle'))).toBe(branch===1);
  expect(ev.filter(e=>e.type==='extra-turn')).toHaveLength(branch===1?1:0);
 });
 for(const branch of [0,1]) for(const chosen of [10,11,13]) it(`9017 choice ${branch}: selected anchor ${chosen} remains independent of other branch`,()=>{
  const raw=native.get(9017).raw.SpellSteps;expect(raw.slice(3)).toMatchObject([{Type:'Damage',Target:'AboveTarget',Amount:4,SpellPowerMultiplier:2},{Type:'Damage',Target:'BelowTarget',Amount:4,SpellPowerMultiplier:2}]);
  const f=fixture(9017,branch);f.ctx.chosenTargetId=chosen;f.enemies.forEach(e=>e.armor=100);
  expect(prototypeChosenTargetMode(selectSkillBranch(f.proto,branch)!)).toBe('enemyChosen');
  const ev=executePrototype(f.proto,f.ctx),target=f.enemies.find(e=>e.id===chosen)!;
  expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual((branch===0?[chosen]:[10,11,12,13].filter(id=>id!==chosen)).map(id=>[id,26]));
  expect(target.mana).toBe(branch===0?0:16);expect(target.statuses.some(s=>s.id==='death-mark')).toBe(branch===0);
  expect(target.hp).toBe(branch===0?974:1000);
 });
 for(const branch of [0,1]) it(`9674 choice ${branch}: separate ally input for life/barrier OR creation/enchant`,()=>{
  expect(native.get(9674).raw.Target).toBe('Ally');
  expect(native.get(9674).raw.SpellSteps[3]).toMatchObject({Type:'CreateGems',Color1:'FromTarget',Amount:10});
  const f=fixture(9674,branch),ally=damageCharacter(1,{hp:500,colors:[BaseColor.Blue]});f.state.teams.Left.characters.push(ally);f.ctx.chosenTargetId=1;
  expect(prototypeChosenTargetMode(selectSkillBranch(f.proto,branch)!)).toBe('allyChosen');expect(prototypeNeedsColor(selectSkillBranch(f.proto,branch)!)).toBe(false);
  const ev=executePrototype(f.proto,f.ctx);expect(ally.hp).toBe(branch===0?513:500);expect(ally.statuses.map(s=>s.id)).toEqual([branch===0?'barrier':'enchanted']);
  const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);expect(changes).toHaveLength(branch===0?0:10);expect(changes.every(c=>c.to.kind==='color'&&c.to.color===BaseColor.Blue)).toBe(true);
  expect(f.caster.statuses).toEqual([]);
 });
 for(const branch of [0,1]) it(`9813 choice ${branch}: self enchant does not replace enemy color anchor`,()=>{
  expect(native.get(9813).raw.Target).toBe('Enemy');expect(native.get(9813).raw.SpellSteps.slice(3)).toMatchObject([{Type:'CauseEnchanted',Target:'Self'},{Type:'ConvertGems',Color1:'FromTarget',Color2:'Yellow'}]);
  const f=fixture(9813,branch);f.caster.magic=12;f.enemies[1].colors=[BaseColor.Blue];
  expect(prototypeChosenTargetMode(selectSkillBranch(f.proto,branch)!)).toBe('enemyChosen');expect(prototypeNeedsColor(selectSkillBranch(f.proto,branch)!)).toBe(false);
  const ev=executePrototype(f.proto,f.ctx);expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual(branch===0?[[11,22]]:[]);
  expect(f.caster.statuses.some(s=>s.id==='enchanted')).toBe(branch===1);const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);
  if(branch===1){expect(changes.length).toBeGreaterThan(0);expect(changes.every(c=>c.from.kind==='color'&&c.from.color===BaseColor.Blue&&c.to.kind==='color'&&c.to.color===BaseColor.Yellow)).toBe(true);}else expect(changes).toHaveLength(0);
 });
 for(const branch of [0,1]) it(`8900 choice ${branch}: chosen enemy color (not arbitrary board color) OR boosted damage`,()=>{
  expect(native.get(8900).raw.Target).toBe('Enemy');expect(native.get(8900).raw.SpellSteps[0]).toMatchObject({Type:'ConvertGems',Color1:'FromTarget',Color2:'Spirit'});
  const f=fixture(8900,branch);f.enemies[1].colors=[BaseColor.Blue];
  f.board.set({row:0,col:0},{id:1,type:{kind:'special',spec:{kind:'spiritGem',color:BaseColor.Purple}}});
  expect(prototypeChosenTargetMode(selectSkillBranch(f.proto,branch)!)).toBe('enemyChosen');expect(prototypeNeedsColor(selectSkillBranch(f.proto,branch)!)).toBe(false);
  const ev=executePrototype(f.proto,f.ctx);expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual(branch===0?[]:[[11,17]]);
  const changes=ev.filter(e=>e.type==='gem-transform').flatMap(e=>e.changes);if(branch===0){expect(changes.length).toBeGreaterThan(0);expect(changes.every(c=>c.from.kind==='color'&&c.from.color===BaseColor.Blue&&c.to.kind==='special'&&c.to.spec.kind==='spiritGem'&&c.to.spec.color===BaseColor.Blue)).toBe(true);}else expect(changes).toHaveLength(0);
 });
 for(const id of [9017,9674,9813,8900]) for(const branch of [0,1]) it(`${id} branch ${branch}: engine actually requests the native target side`,()=>{
  const f=fixture(id,branch);if(id===9674)f.state.teams.Left.characters.push(damageCharacter(1));
  const target=vi.fn((_mode: string)=>id===9674?1:11);f.engine.setTargetChooser({choose:target});f.cast();expect(target).toHaveBeenCalledTimes(1);expect(target.mock.calls[0][0]).toBe(id===9674?'allyChosen':'enemyChosen');
 });
 it('requirements come only from selected branch (color / target / board cell)',()=>{
  const p=skill(chooseSkill(['color','ally','column'],[createGems('CHOSEN',3,0)],[heal('allyChosen',4)],[destroyChosenCol()]));
  const selected=[0,1,2].map(i=>selectSkillBranch(p,i)!);
  expect(selected.map(prototypeNeedsColor)).toEqual([true,false,false]);
  expect(selected.map(prototypeChosenTargetMode)).toEqual([null,'allyChosen',null]);
  expect(selected.map(prototypeNeedsCell)).toEqual([false,false,true]);
 });
 it('engine does not ask a target chooser for the unselected target branch',()=>{
  const f=fixture(8855,0); const r=new ExtensionRegistry();
  r.prototypes.set('choice-fixture',skill(chooseSkill(['self-contained','target'],[createGems(BaseColor.Green,1,0)],[dmg('enemyChosen',4)])));
  f.caster.skillId='choice-fixture'; const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,r);
  engine.setBranchChooser(new FixedBranchChooser(0)); const target=vi.fn(()=>11);engine.setTargetChooser({choose:target});engine.castSkill(0);expect(target).not.toHaveBeenCalled();
 });
 it('AI has a deterministic valid policy, and player index 1 is not re-randomized',()=>{
  expect(new AiBranchChooser().choose(['A','B'])).toBe(0);
  const f=fixture(8857,1),rng=vi.spyOn(f.ctx.rng,'nextInt');executePrototype(f.proto,f.ctx);expect(rng).not.toHaveBeenCalled();
 });
});



describe('eight further native Choose:ABC-DEF repairs (scoped, not whole-skill acceptance)', () => {
 const ids = [8856, 8859, 8897, 9014, 9185, 9745, 8869, 8879];
 it('9014: both native summon branches use the full local Dragon roster, not a truncated pool', () => {
  const f = fixture(9014);
  const expected = troops.filter(t => t.troopTypes?.includes('Dragon')).map(t => t.referenceName).sort();
  for (const branch of [0, 1]) {
   const choice = f.proto.segments[0]; expect(choice.kind).toBe('choose');
   if (choice.kind !== 'choose') continue;
   const summon = choice.options[branch].find(s => s.kind === 'summon');
   expect(summon?.kind).toBe('summon');
   if (summon?.kind === 'summon') {
    expect('randomOf' in summon.params.source).toBe(true);
    if ('randomOf' in summon.params.source) expect([...summon.params.source.randomOf].sort()).toEqual(expected);
   }
  }
 });
 // R017 (user ruling): 9185 counts Blue gems per English/zh
 for (const branch of [0, 1]) for (const yellow of [0, 1]) it(`9185 branch ${branch}: exactly 7% per blue gem (count ${yellow}), no flat 7%`, () => {
  const f = fixture(9185, branch);
  for (let row=0; row<8; row++) for (let col=0; col<8; col++)
   f.board.set({row,col}, {id:row*8+col+1,type:{kind:'color',color:BaseColor.Red}});
  if (yellow) f.board.set({row:7,col:7},{id:64,type:{kind:'color',color:BaseColor.Blue}});
  vi.spyOn(f.ctx.rng,'next').mockReturnValue(0);
  const ev = executePrototype(f.proto,f.ctx);
  expect(ev.filter(e => e.type === 'extra-turn')).toHaveLength(yellow);
 });
 for (const id of ids) {
  it(`${id}: original declares two exclusive branches, and cancellation preserves state and mana`, () => {
   expect(native.get(id).raw.Randomize).toBe('Choose:ABC-DEF');
   const f = fixture(id, null), before = JSON.stringify(f.state);
   expect(f.proto.segments).toMatchObject([{ kind:'choose', options:[expect.any(Array),expect.any(Array)] }]);
   expect(f.cast()).toEqual([]); expect(JSON.stringify(f.state)).toBe(before);
  });
  for (const branch of [0, 1]) it(`${id}: branch ${branch} goes through TurnEngine exactly once`, () => {
   const f = fixture(id, branch);
   if (id === 8859) { f.enemies.forEach(e => e.armor = 40); f.state.enemyGold = 50; }
   if (id === 9745) f.board.set({ row: 0, col: 0 }, { id: 100, type: {kind:'color', color:BaseColor.Red} });
   if (id === 8869) f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1));
   const ev = f.cast();
   expect(ev.filter(e => e.type === 'skill-cast')).toHaveLength(1);
   expect(f.state.actionLog).toHaveLength(1);
   if (![8897, 9014, 9185].includes(id) && !(id === 9745 && branch === 0)) expect(f.caster.mana).toBe(id === 8879 && branch === 1 ? 6 : 0);
   if (id === 8856) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual([
     'Damage','Damage','Damage','DecreaseSpellPower','DecreaseSpellPower','DecreaseSpellPower']);
    const hits = ev.filter(e => e.type === 'skill-damage');
    expect(hits).toHaveLength(branch === 0 ? 3 : 0);
    expect(new Set(hits.map(h => h.targetId)).size).toBe(hits.length);
    expect(f.enemies.filter(e => e.magic === 8)).toHaveLength(branch === 1 ? 3 : 0);
   } else if (id === 8859) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual([
     'CountEnemyGold','TakeEnemyGold','GiveGold','StealRandomStat']);
    expect(ev.some(e => e.type === 'economy-gain')).toBe(branch === 0);
    expect(f.enemies.some(e => e.magic < 11 || e.armor < 40 || e.hp < 1000 || e.attack < 17)).toBe(branch === 1);
   } else if (id === 8897) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual(['ExplodeColor','ManaBurn']);
    expect(ev.some(e => e.type === 'gem-explode')).toBe(branch === 0);
    expect(f.enemies.slice(0,2).every(e => e.mana === 16)).toBe(true);
    expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId,e.damage])).toEqual(branch === 1 ? [[10,27],[11,27]] : []);
   } else if (id === 9014) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual([
     'CreateGems','SummoningType','CreateGems','SummoningType']);
    const changes = ev.filter(e => e.type === 'gem-transform').flatMap(e => e.changes);
    expect(changes).toHaveLength(7);
    expect(changes.every(c => c.to.kind === 'special' && c.to.spec.kind === 'dragonGem' &&
      c.to.spec.color === (branch === 0 ? BaseColor.Blue : BaseColor.Green))).toBe(true);
    expect(ev.filter(e => e.type === 'summon')).toHaveLength(1);
   } else if (id === 9185) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type === 'CountGems').map((s:{Color1:string}) => s.Color1)).toEqual(['Yellow','Yellow']);
    const changes = ev.filter(e => e.type === 'gem-transform').flatMap(e => e.changes);
    expect(changes).toHaveLength(1);
    expect(changes[0].to.kind === 'special' && changes[0].to.spec.kind === (branch === 0 ? 'lightningRow' : 'lightningCol')).toBe(true);
   } else if (id === 9745) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual(['ConvertGems','CauseCursed','ManaBurn']);
    const changes = ev.filter(e => e.type === 'gem-transform').flatMap(e => e.changes);
    if (branch === 0) {
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every(c => c.from.kind === 'color' && c.to.kind === 'special' && c.to.spec.kind === 'spiritGem' && c.to.spec.color === c.from.color)).toBe(true);
    }
    else expect(changes).toHaveLength(0);
    expect(f.enemies[1].statuses.some(s => s.id === 'curse')).toBe(branch === 1);
    const spiritsMatched = ev.filter(e => e.type === 'special-gem-trigger' && e.kind === 'spiritGem').length;
    if (branch === 0) expect(spiritsMatched).toBeGreaterThan(0);
    else expect(spiritsMatched).toBe(0);
    expect(f.enemies[1].mana).toBe(Math.max(0, 16 - spiritsMatched * SPIRIT_GEM_DRAIN));
    expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId,e.damage])).toEqual(branch === 1 ? [[11,27]] : []);
   } else if (id === 8869) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual(['IncreaseArmor','CauseBarrier']);
    expect(f.caster.armor).toBe(branch === 0 ? 12 : 0);
    expect(f.caster.statuses.some(s => s.id === 'barrier')).toBe(false); // description: OTHER allies
    expect(f.state.teams[PlayerSide.Left].characters[1].statuses.some(s => s.id === 'barrier')).toBe(branch === 1);
   } else if (id === 8879) {
    expect(native.get(id).raw.SpellSteps.filter((s:{Type:string}) => s.Type !== 'None').map((s:{Type:string}) => s.Type)).toEqual(['StealMagic','Damage','StealMana','Damage']);
    expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[13,branch === 0 ? 17 : 14]]);
    expect(f.enemies[3].magic).toBe(branch === 0 ? 8 : 11);
    expect(f.enemies[3].mana).toBe(branch === 1 ? 10 : 16);
   }
  });
 }
});
