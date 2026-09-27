// Worker-03 independent original snapshots and real TurnEngine casts; no shared suite edits.
// @ts-expect-error native ESM file
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
// @ts-expect-error node types supplied at runtime
import fs from 'node:fs';
import { describe,it,expect } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { BaseColor,PlayerSide,colorGem } from '@engine/types';
import { SeededRNG } from '@engine/rng';
import { damageFixture,damageCharacter } from '../helpers/damageFixture';
import { TROOPS } from '../../src/data/troops';
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const reg=new ExtensionRegistry();registerSkillLibrary(reg.prototypes);
const c={
 6058:{spell:7058,cost:9,colors:[BaseColor.Blue,BaseColor.Brown],literal:'Deal [Magic + 4] damage to a random Enemy, and create 7 Yellow Gems.',zh:'对 1 名随机的敌人造成 [魔法 + 4] 点伤害，并创造 7 颗黄色宝石。',steps:[{Type:'Damage',Target:'RandomEnemy',Amount:4,SpellPowerMultiplier:1},{Type:'CreateGems',Color1:'Yellow',Amount:7}]},
 6094:{spell:7164,cost:11,colors:[BaseColor.Red,BaseColor.Purple],literal:'Deal [Magic + 4] damage to an Enemy. If the Enemy is Undead, deal triple damage. Gain [Magic + 4] Soul(s).',zh:'对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人是不死族，则造成三倍伤害。获得 [魔法 + 4] 个灵魂。',steps:[{Type:'Damage',Target:'FromTarget',Amount:4,SpellPowerMultiplier:1,StatusModifier:'MultiplyForUndead',StatusAmount:3},{Type:'GiveSouls',Amount:4,SpellPowerMultiplier:1}]},
 7162:{spell:8737,cost:10,colors:[BaseColor.Yellow],literal:'Choose an Ally. Create 10 Gems of one of their Mana Colors.',zh:'选择一个盟友。创造10颗盟友对应法力颜色的宝石。',steps:[{Type:'CreateGems',Target:'FromTarget',Color1:'FromTarget',Amount:10}]},
 7306:{spell:8918,cost:12,colors:[BaseColor.Yellow,BaseColor.Purple],literal:'Convert Green Gems to Spirit Gems.',zh:'将所有绿色宝石转换成灵力宝石。',steps:[{Type:'ConvertGems',Color1:'Green',Color2:'Spirit',Amount:100}]},
 7322:{spell:8934,cost:13,colors:[BaseColor.Blue,BaseColor.Yellow],literal:'Deal [Magic + 5] true scatter damage. If there is a Storm, deal double damage.',zh:'造成 [魔法 + 5] 点真实散射伤害。若存在风暴，则造成双倍伤害。',steps:[{Type:'TrueScatterDamage',Target:'AllEnemies',Amount:5,SpellPowerMultiplier:1,StatusModifier:'MultiplyForAnyStorm',StatusAmount:2}]},
} as const;
type K=keyof typeof c;
function setup(id:K,side=PlayerSide.Left,magic=10,target=11,seed=42){const cfg=c[id],f=damageFixture();Object.assign(f.caster,{skillId:String(cfg.spell),mana:cfg.cost,manaCost:cfg.cost,colors:[...cfg.colors],magic});if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,reg);engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(target));return {...f,cast:()=>engine.castSkill(f.caster.id)};}
for(const id of [6058,6094,7162,7306,7322] as const)describe(`worker03 ${id} independent source and entry`,()=>{
 const v=c[id];it('English literal, native steps/cost, exact Chinese, mana colors and bound registry',()=>{const a=en.find((x:{id:number})=>x.id===id),n=native.get(v.spell).raw,t=TROOPS.find(x=>x.id===id);expect(a.stats.spell).toMatchObject({id:v.spell,desc:v.literal});expect(a.ManaCost).toBe(v.cost);expect(Object.keys(a._ManaColors_parsed).sort()).toEqual(v.colors.map(x=>`Color${x}`).sort());expect(n.Cost).toBe(v.cost);expect(n.SpellSteps).toHaveLength(v.steps.length);v.steps.forEach((s,i)=>expect(n.SpellSteps[i]).toMatchObject(s));expect(t).toMatchObject({id,manaCost:v.cost,manaColors:[...v.colors],spell:{id:v.spell,description:v.zh}});expect(reg.prototypes.has(String(v.spell))).toBe(true);});
 it('both sides low mana and silence prevent action and effects',()=>{for(const side of [PlayerSide.Left,PlayerSide.Right])for(const reason of ['low','silence']){const f=setup(id,side);if(reason==='low')f.caster.mana=v.cost-1;else f.caster.statuses=[{id:'silence',turns:2}];const before=f.board.clone();expect(f.cast()).toEqual([]);expect(f.state.actionLog).toHaveLength(0);expect(f.board).toEqual(before);expect(f.state.economy.souls).toBe(0);}});
});
describe('6058 random target damage then create seven yellow',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,10])it(`side ${side} M${magic}`,()=>{const f=setup(6058,side,magic);const ev=f.cast(),hits=ev.flatMap(e=>e.type==='skill-damage'?[e]:[]),spawns=ev.flatMap(e=>e.type==='gem-create'?e.spawns.map(g=>g.gemType):e.type==='gem-transform'?e.changes.map(g=>g.to):[]);expect(hits).toHaveLength(1);expect(hits[0].damage).toBe(magic+4);expect([10,11,12,13]).toContain(hits[0].targetId);expect(spawns).toHaveLength(7);expect(spawns.every(s=>JSON.stringify(s)===JSON.stringify(colorGem(BaseColor.Yellow)))).toBe(true);expect(ev.findIndex(e=>e.type==='gem-create'||e.type==='gem-transform')).toBeGreaterThan(ev.findIndex(e=>e.type==='skill-damage'));expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);});
 it('single living enemy is the only possible target',()=>{const f=setup(6058);f.enemies.forEach((e,i)=>{if(i!==2)e.defeated=true;});const ev=f.cast();expect(ev.flatMap(e=>e.type==='skill-damage'?[e.targetId]:[])).toEqual([12]);expect(ev.flatMap(e=>e.type==='gem-create'?e.spawns.map(x=>x.gemId):e.type==='gem-transform'?e.changes.map(x=>x.gemId):[])).toHaveLength(7);});
});
describe('6094 undead conditional damage and souls after damage',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const race of ['Human','Undead'])it(`${side} ${race}`,()=>{const f=setup(6094,side,10);f.enemies[1].troopTypes=[race];f.enemies[1].armor=50;const ev=f.cast(),hit=ev.flatMap(e=>e.type==='skill-damage'?[e]:[]);expect(hit.map(e=>[e.targetId,e.damage])).toEqual([[11,race==='Undead'?42:14]]);expect(f.state.economy.souls).toBe(14);expect(ev.findIndex(e=>e.type==='economy-gain')).toBeGreaterThan(ev.findIndex(e=>e.type==='skill-damage'));expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);});
 it('barrier absorbs damage but soul gain still resolves',()=>{const f=setup(6094);f.enemies[1].statuses=[{id:'barrier',turns:3}];const ev=f.cast();expect(ev.some(e=>e.type==='skill-damage')).toBe(false);expect(f.state.economy.souls).toBe(14);});
});
describe('7162 chosen ally supplies gem color',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`${side} blue ally against red ally`,()=>{const f=setup(7162,side,0,1);f.caster.colors=[BaseColor.Red];f.state.teams[side].characters.push(damageCharacter(1,{colors:[BaseColor.Blue]}),damageCharacter(2,{colors:[BaseColor.Red]}));const ev=f.cast(),spawns=ev.flatMap(e=>e.type==='gem-create'?e.spawns.map(g=>g.gemType):e.type==='gem-transform'?e.changes.map(g=>g.to):[]);expect(spawns).toHaveLength(10);expect(spawns.every(s=>JSON.stringify(s)===JSON.stringify(colorGem(BaseColor.Blue)))).toBe(true);expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);});
});
describe('7306 green -> spirit conversions',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const green of [0,7])it(`${side} green=${green}`,()=>{const f=setup(7306,side,0);for(let i=0;i<7;i++)if(green)f.board.set({row:i,col:0},{id:100+i,type:colorGem(BaseColor.Green)});const ev=f.cast(),changes=ev.flatMap(e=>e.type==='gem-transform'?e.changes:[]);expect(changes).toHaveLength(green);expect(changes.every(x=>JSON.stringify(x.from)===JSON.stringify(colorGem(BaseColor.Green))&&typeof x.to==='object'&&x.to.kind==='special'&&x.to.spec.kind==='spiritGem'&&x.to.spec.color===BaseColor.Green)).toBe(true);expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);});
});
describe('7322 true scatter storm shared pool',()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const storm of [false,true])it(`${side} storm=${storm}`,()=>{const f=setup(7322,side,10);f.enemies.forEach(e=>e.armor=80);if(storm)f.state.teams[side].storm={color:BaseColor.Red,turns:3,troopId:1};const ev=f.cast(),hits=ev.flatMap(e=>e.type==='skill-damage'?[e]:[]);expect(hits.reduce((sum,e)=>sum+e.damage,0)).toBe(storm?30:15);expect(hits.every(e=>e.resultingArmor===80)).toBe(true);expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);});
});




describe('worker03 batchB extra cast boundaries',()=>{
 it('6058 random selection changes with seed; barrier stops chosen damage but gem step still resolves',()=>{
  const chosen=new Set<number>();for(let seed=1;seed<=12;seed++){const f=setup(6058,PlayerSide.Left,10,11,seed);const ev=f.cast();ev.forEach(e=>{if(e.type==='skill-damage')chosen.add(e.targetId)});}expect(chosen.size).toBeGreaterThan(1);
  const f=setup(6058);f.enemies.forEach((e,i)=>{if(i!==2)e.defeated=true;});f.enemies[2].statuses=[{id:'barrier',turns:3}];const ev=f.cast();expect(ev.some(e=>e.type==='skill-damage')).toBe(false);expect(ev.flatMap(e=>e.type==='gem-create'?e.spawns.map(x=>x.gemId):e.type==='gem-transform'?e.changes.map(x=>x.gemId):[])).toHaveLength(7);
 });
 it('6094 lethal spell hit still grants souls; full armor eats hp damage',()=>{
  const f=setup(6094);f.enemies[1].armor=0;f.enemies[1].hp=1;const ev=f.cast();expect(ev.some(e=>e.type==='defeat'&&e.characterId===11)).toBe(true);expect(ev.some(e=>e.type==='economy-gain'&&e.currency==='souls'&&e.amount===14)).toBe(true);expect(f.state.economy.souls).toBe(14);
 });
 it('7162 ten gem creation fills empty slots first (chosen ally blue)',()=>{
  const f=setup(7162,PlayerSide.Left,0,1);f.state.teams.Left.characters.push(damageCharacter(1,{colors:[BaseColor.Blue]}));for(let row=0;row<2;row++)for(let col=0;col<5;col++)f.board.set({row,col},null);
  const ev=f.cast();expect(ev.flatMap(e=>e.type==='gem-create'?e.spawns:[])).toHaveLength(10);expect(ev.some(e=>e.type==='gem-transform')).toBe(false);expect(ev.flatMap(e=>e.type==='gem-create'?e.spawns:[]).every(g=>JSON.stringify(g.gemType)===JSON.stringify(colorGem(BaseColor.Blue)))).toBe(true);
 });
 it('7306 seven converted cells have matching board types, unchanged non-green gems',()=>{
  const f=setup(7306);for(let i=0;i<7;i++)f.board.set({row:i,col:0},{id:100+i,type:colorGem(BaseColor.Green)});const old=f.board.get({row:0,col:1})?.type;const ev=f.cast(),changes=ev.flatMap(e=>e.type==='gem-transform'?e.changes:[]);expect(changes).toHaveLength(7);expect(changes.every(ch=>ch.from.kind==='color'&&ch.from.color===BaseColor.Green&&ch.to.kind==='special'&&ch.to.spec.kind==='spiritGem'&&ch.to.spec.color===BaseColor.Green)).toBe(true);expect(old?.kind).toBe('color');
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])it(`7322 ${side} single survivor entire scatter pool bypasses armor`,()=>{
  const f=setup(7322,side);f.enemies.forEach((e,i)=>{if(i!==2)e.defeated=true;});f.enemies[2].armor=100;const ev=f.cast();expect(ev.flatMap(e=>e.type==='skill-damage'?[[e.targetId,e.damage,e.resultingArmor]]:[])).toEqual([[12,15,100]]);
 });
});


describe('worker03 batchB remaining negative and scatter edges',()=>{
 it('7162 invalid selected ally does not create gems or spend mana',()=>{const f=setup(7162,PlayerSide.Left,0,999);f.state.teams.Left.characters.push(damageCharacter(1,{colors:[BaseColor.Blue]}));const ev=f.cast();expect(ev.some(e=>e.type==='gem-create'||e.type==='gem-transform')).toBe(false);expect(f.caster.mana).toBe(10);});
 for(const seed of [17,23])for(const storm of [false,true])it(`7322 seed ${seed} storm ${storm} totals and barrier target`,()=>{const f=setup(7322,PlayerSide.Left,10,11,seed);f.enemies[1].statuses=[{id:'barrier',turns:3}];if(storm)f.state.teams.Left.storm={color:BaseColor.Red,turns:3,troopId:1};const ev=f.cast(),hits=ev.flatMap(e=>e.type==='skill-damage'?[e]:[]);expect(hits.reduce((n,e)=>n+e.damage,0)).toBeLessThanOrEqual(storm?30:15);expect(hits.every(e=>e.range==='scatter')).toBe(true);expect(f.caster.mana).toBe(0);});
});
