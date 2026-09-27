// Independent native six-branch oracle plus actual TurnEngine casts. Not whole-skill certification.
// @ts-expect-error Node snapshot access
import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error Node native index
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { MONGO_FEY_REFS } from '@engine/skills/curated/batch-acceptance';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide } from '@engine/types';
import { TROOPS, troopToSummonTemplate } from '../../src/data/troops';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function fixture(branch:number, magic=11, selection?:number) {
 const f=damageFixture();Object.assign(f.caster,{skillId:'7493',magic,hp:40,maxHp:100,mana:13,manaCost:13});
 f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1,{hp:40,maxHp:100}));
 const original=f.ctx.rng.nextInt.bind(f.ctx.rng);const draw=vi.spyOn(f.ctx.rng,'nextInt');
 draw.mockImplementationOnce(n=>{expect(n).toBe(6);return branch;});
 if(selection!==undefined)draw.mockImplementationOnce(n=>{expect(n).toBe(branch===1?MONGO_FEY_REFS.length:branch===4?2:4);return selection;});
 draw.mockImplementation(original);
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setSummonResolver(troopToSummonTemplate);
 return {...f,draw,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Mongo native branch restoration (scoped)',()=>{
 it('native snapshot defines exactly A-B-C-D-E-F, not invented project buffs',()=>{
  expect(english.find((t:{stats:{spell:{id:number}}})=>t.stats.spell.id===7493).stats.spell.desc).toBe('Something random happens.');
  expect(native.get(7493).raw).toMatchObject({Cost:13,Randomize:'A-B-C-D-E-F',SpellSteps:[
   {Type:'Consume',Target:'RandomEnemy'},{Type:'TransformType',Target:'Self',Data:'fey'},
   {Type:'RandomStatusEffect',Target:'AllEnemies'},{Type:'ExplodeGems',Amount:10},
   {Type:'IncreaseAllStats',Target:'RandomAlly',Amount:10,SpellPowerMultiplier:1},
   {Type:'SplashHeavyDamage',Target:'RandomEnemy',Amount:2,SpellPowerMultiplier:1}]});
  const branches=registry.prototypes.get('7493')!.segments[0];
  expect(branches.kind).toBe('oneOf');if(branches.kind!=='oneOf')throw new Error('branches missing');
  expect(branches.options.map(b=>b.map(s=>s.kind))).toEqual([['devour'],['transformTroop'],['randomStatus'],['gem'],['buff','buff','buff','buff'],['damage']]);
 });
 it('Fey transform roster is precisely installed original Fey and every reference resolves',()=>{
  const sourceIds=new Set(english.filter((t:{TroopType:string;TroopType2:string})=>[t.TroopType,t.TroopType2].includes('Fey')).map((t:{id:number})=>t.id));
  const installed=TROOPS.filter(t=>sourceIds.has(t.id));
  expect(MONGO_FEY_REFS).toEqual(installed.map(t=>t.referenceName));expect(new Set(MONGO_FEY_REFS).size).toBe(MONGO_FEY_REFS.length);
  for(const ref of MONGO_FEY_REFS)expect(troopToSummonTemplate(ref)).not.toBeNull();
  // Two source-snapshot Fey (7910/7911) are absent from the installed original roster.
  expect(english.filter((t:{id:number})=>sourceIds.has(t.id)&&!TROOPS.some(r=>r.id===t.id)).map((t:{id:number})=>t.id).sort()).toEqual([7910,7911]);
 });
 for(const target of [0,1,3])it(`A: selects one enemy for Consume, target index ${target}; other branches absent`,()=>{
  const f=fixture(0,11,target);const ev=f.cast();
  expect(ev.flatMap(e=>e.type==='defeat'?[e.characterId]:[])).toEqual([10+target]);
  expect(f.state.teams[PlayerSide.Right].characters.map(c=>c.id)).toEqual([10,11,12,13].filter(id=>id!==10+target));
  expect(f.state.teams[PlayerSide.Right].characters.every(c=>c.hp===1000)).toBe(true);
  expect(ev.some(e=>e.type==='troop-transform'||e.type==='gem-explode'||e.type==='status-apply')).toBe(false);
  // Shared devour stat growth/barrier/immunity behavior is separately pending, not certified here.
 });
 for(const selected of [0,72,144])it(`B: transforms only the caster to installed Fey index ${selected}`,()=>{
  const f=fixture(1,11,selected),ref=MONGO_FEY_REFS[selected],template=troopToSummonTemplate(ref)!;const ev=f.cast();
  expect(ev.flatMap(e=>e.type==='troop-transform'?[e.targetId]:[])).toEqual([0]);
  expect([f.caster.name,f.caster.skillId,f.caster.maxHp,f.caster.mana]).toEqual([template.name,template.skillId,template.maxHp,0]);
  expect(f.caster.troopTypes).toContain('Fey');expect(f.state.teams[PlayerSide.Left].characters[1].skillId).toBe('20007');
  expect(ev.some(e=>e.type==='skill-damage'||e.type==='gem-explode')).toBe(false);
 });
 it('C: applies one random negative status to each living enemy only',()=>{
  const f=fixture(2),ev=f.cast();
  expect(ev.flatMap(e=>e.type==='status-apply'?[e.targetId]:[]).sort()).toEqual([10,11,12,13]);
  expect(f.enemies.every(c=>c.statuses.length===1)).toBe(true);expect(f.caster.statuses).toHaveLength(0);
  expect(ev.some(e=>e.type==='skill-damage'||e.type==='gem-explode'||e.type==='troop-transform')).toBe(false);
 });
 it('D: requests 10 random all-type explosion centers, not 3',()=>{
  const p=registry.prototypes.get('7493')!.segments[0];if(p.kind!=='oneOf')throw new Error('branches missing');
  expect(p.options[3]).toEqual([{kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'randomGems',count:{base:10,mult:0},include:'all'}}}]);
  const f=fixture(3),ev=f.cast();expect(ev.filter(e=>e.type==='gem-explode')).toHaveLength(1);
  expect(ev.some(e=>e.type==='troop-transform'||e.type==='status-apply')).toBe(false);
 });
 for(const magic of [0,1,11,20])for(const selected of [0,1])it(`E: one bound Ally gets all four M+10 stats, M=${magic}, index ${selected}`,()=>{
  const f=fixture(4,magic,selected),target=f.state.teams[PlayerSide.Left].characters[selected],other=f.state.teams[PlayerSide.Left].characters[1-selected];
  const before={attack:target.attack,armor:target.armor,hp:target.hp,maxHp:target.maxHp,magic:target.magic};
  const otherBefore={attack:other.attack,armor:other.armor,hp:other.hp,maxHp:other.maxHp,magic:other.magic};const ev=f.cast(),amount=magic+10;
  expect([target.attack,target.armor,target.hp,target.maxHp,target.magic]).toEqual([before.attack+amount,before.armor+amount,before.hp+amount,before.maxHp+amount,before.magic+amount]);
  expect({attack:other.attack,armor:other.armor,hp:other.hp,maxHp:other.maxHp,magic:other.magic}).toEqual(otherBefore);
  expect(ev.flatMap(e=>e.type==='buff'?[{target:e.targetId,stat:e.stat,amount:e.amount}]:[])).toEqual(['attack','armor','hp','magic'].map(stat=>({target:selected,stat,amount})));
  expect(ev.some(e=>e.type==='skill-damage'||e.type==='troop-transform'||e.type==='gem-explode')).toBe(false);
 });
 for(const magic of [0,1,11,20])for(const selected of [0,1,3])it(`F: M+2 heavy splash with 75% adjacent damage, M=${magic}, center ${selected}`,()=>{
  const f=fixture(5,magic,selected),ev=f.cast(),amount=magic+2;
  for(let i=0;i<4;i++)expect(f.enemies[i].hp).toBe(1000-(i===selected?amount:Math.abs(i-selected)===1?Math.floor(amount*.75):0));
  expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(selected===1?3:2);
  expect(ev.some(e=>e.type==='troop-transform'||e.type==='gem-explode'||e.type==='status-apply')).toBe(false);
 });
});
