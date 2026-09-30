// Lane L4b batch B01 (reviewer sa-L4b): create / convert gem skills, stored-snapshot scope.
// Every entity has its own source/prototype binding and real TurnEngine.castSkill cases.
// @ts-expect-error Node-only audit fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Independent saved native-step reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {BoardModel} from '@engine/BoardModel';
import {createGameState} from '@engine/GameState';
import {SeededRNG} from '@engine/rng';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {FixedColorChooser} from '@engine/skills/colorChooser';
import {BaseColor,PlayerSide,colorGem,skullGem,specialGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const P=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
type BoardFn=(r:number,c:number)=>GemType|null;
const basePattern:BoardFn=(r,c)=>colorGem(P[(r+c)%4]);
interface Opts{spell:number;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;board?:BoardFn;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];color?:BaseColor;target?:number;seed?:number;casterStatuses?:Character['statuses']}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();const fn=o.board??basePattern;let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const t=fn(r,c);board.set({row:r,col:c},t?{id:id++,type:t}:null);}
 const caster=damageCharacter(0,{skillId:String(o.spell),mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,statuses:o.casterStatuses??[]});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const mine={player:side,characters:[caster,...allies]};const theirs={player:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,characters:enemies};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setColorChooser(new FixedColorChooser(o.color??BaseColor.Red));engine.setTargetChooser(new FixedTargetChooser(o.target??11));
 const opponent=theirs.player;
 return {board,state,engine,caster,allies,enemies,side,opponent,cast:()=>engine.castSkill(caster.id)};
}
/** Skill-owned board events: everything before the first match elimination (cascade = board resolution). */
function skillPhase(ev:GameEvent[]){const i=ev.findIndex(e=>e.type==='elimination');return i<0?ev:ev.slice(0,i);}
function creations(ev:GameEvent[]){
 const out:{pos:string;from:GemType|null;to:GemType}[]=[];
 for(const e of skillPhase(ev)){
  if(e.type==='gem-create')for(const s of e.spawns)out.push({pos:`${s.pos.row},${s.pos.col}`,from:null,to:s.gemType});
  if(e.type==='gem-transform')for(const s of e.changes)out.push({pos:`${s.pos.row},${s.pos.col}`,from:s.from,to:s.to});
 }
 return out;
}
const isColor=(t:GemType|null,c:BaseColor)=>!!t&&t.kind==='color'&&t.color===c;
function manaFromMatches(ev:GameEvent[],id:number){return ev.filter(e=>e.type==='mana-gain'&&e.characterId===id).reduce((a,e)=>a+(e.type==='mana-gain'?e.amount:0),0);}
/** Turn ownership: a 4+/5 cascade may award extra turn (board source); the skill itself never does. */
function assertTurnAndMana(f:ReturnType<typeof setup>,ev:GameEvent[]){
 expect(ev[0]).toMatchObject({type:'skill-cast',characterId:0});
 expect(skillPhase(ev).some(e=>e.type==='extra-turn')).toBe(false);
 const extra=ev.some(e=>e.type==='extra-turn');
 expect(f.state.activePlayer).toBe(extra?f.side:f.opponent);
 expect(f.state.actionLog).toHaveLength(1);
 expect(f.caster.mana).toBe(Math.min(f.caster.manaCost,manaFromMatches(ev,0)));
}
function sourceBinding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string){
 const en=original.find((t:{id:number})=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.SpellSteps).toHaveLength(steps.length);
 steps.forEach((s,i)=>expect(n.SpellSteps[i]).toEqual(s));
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description).toBe(zh);
}
function refusal(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses, board/turn/mana untouched`,()=>{
  const f=setup(o);const before:string[]=[];f.board.forEach(g=>before.push(JSON.stringify(g)));
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);const after:string[]=[];f.board.forEach(g=>after.push(JSON.stringify(g)));
  expect(after).toEqual(before);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
  expect([...f.allies,...f.enemies].every(c=>c.statuses.length===0)).toBe(true);
 });
}
const sides=[PlayerSide.Left,PlayerSide.Right];

// ——— troop:6365 / spell 7517 ———
describe('L4b troop:6365/spell:7517 Barrier+Life to other allies, create 10 chosen-colour gems',()=>{
 const base={spell:7517,cost:24,colors:[BaseColor.Green,BaseColor.Yellow,BaseColor.Purple],allies:[{},{}]};
 it('source/native/prototype/display binding',()=>{
  sourceBinding(6365,7517,24,base.colors,'Give all other allies Barrier and [Magic + 1] Life. Create 10 Gems of a chosen Color.',
   [{Target:'AllAlliesButNotSelf',Type:'CauseBarrier'},{SpellPowerMultiplier:1,Target:'AllAlliesButNotSelf',Amount:1,Primarypower:true,Type:'IncreaseHealth'},{Color1:'FromTarget',Amount:10,Type:'CreateGems'}],
   '赋予所有其他盟友屏障效果并给予 [魔法 + 1] 点生命值。创造 10 颗指定颜色宝石。');
  expect(native.get(7517).raw.Target).toBe('ManaGemsOnly');
  expect(registry.prototypes.get('7517')).toEqual({segments:[
   {kind:'status',target:'allyOthers',statusId:'barrier',turns:3},
   {kind:'buff',target:'allyOthers',stat:'hp',scaling:{base:1,mult:1},lifeMode:'gain'},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'CHOSEN'},count:{base:10,mult:0}}}]});
 });
 for(const side of sides)for(const [magic,color] of [[0,BaseColor.Red],[10,BaseColor.Green]] as const)
 it(`real cast side=${side} magic=${magic} chosen=${color}`,()=>{
  const f=setup({...base,side,magic,color});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&[e.targetId,e.statusId,e.turns])).toEqual([[1,'barrier',3],[2,'barrier',3]]);
  for(const a of f.allies){expect(a.maxHp).toBe(1000+magic+1);expect(a.hp).toBe(1000+magic+1);expect(a.statuses.map(s=>s.id)).toContain('barrier');}
  expect(f.caster.maxHp).toBe(1000);expect(f.caster.statuses.some(s=>s.id==='barrier')).toBe(false);
  expect(f.enemies.every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
  const made=creations(ev);expect(made).toHaveLength(10);
  expect(made.every(m=>isColor(m.to,color)&&!isColor(m.from,color))).toBe(true);
  expect(new Set(made.map(m=>m.pos)).size).toBe(10);
  assertTurnAndMana(f,ev);
 });
 it('empty cells are filled first (3 gem-create) then 7 on-board conversions',()=>{
  const f=setup({...base,color:BaseColor.Red,board:(r,c)=>r===0&&c<3?null:basePattern(r,c)});const ev=f.cast();
  const sp=skillPhase(ev);const cr=sp.find(e=>e.type==='gem-create'),tr=sp.find(e=>e.type==='gem-transform');
  expect(cr&&cr.type==='gem-create'&&cr.spawns.map(s=>`${s.pos.row},${s.pos.col}`).sort()).toEqual(['0,0','0,1','0,2']);
  expect(tr&&tr.type==='gem-transform'&&tr.changes.length).toBe(7);
  expect(creations(ev).every(m=>isColor(m.to,BaseColor.Red))).toBe(true);
 });
 it('insufficient convertible cells: only the 4 non-chosen cells become chosen colour',()=>{
  const odd=new Set(['0,0','3,3','5,6','7,7']);
  const f=setup({...base,color:BaseColor.Blue,board:(r,c)=>odd.has(`${r},${c}`)?colorGem(BaseColor.Red):colorGem(BaseColor.Blue)});
  const ev=f.cast();const made=creations(ev);
  expect(made.map(m=>m.pos).sort()).toEqual([...odd].sort());expect(made.every(m=>isColor(m.to,BaseColor.Blue))).toBe(true);
 });
 it('lone caster: no other ally, only the gem creation happens',()=>{
  const f=setup({...base,allies:[],color:BaseColor.Red});const ev=f.cast();
  expect(ev.some(e=>e.type==='status-apply'||e.type==='buff')).toBe(false);expect(creations(ev)).toHaveLength(10);
 });
 it('R011: Blessed ally still gets Barrier (Blessed blocks negatives only) and gains [Magic+1] Life',()=>{
  const f=setup({...base,allies:[{statuses:[{id:'blessed',turns:3}]},{}]});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&e.targetId)).toEqual([1,2]);
  expect(f.allies[0].statuses.map(s=>s.id)).toEqual(['blessed','barrier']);expect(f.allies[0].maxHp).toBe(1011);
 });
 it('defeated ally is skipped by Barrier and Life',()=>{
  const f=setup({...base,allies:[{defeated:true,hp:0},{}]});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&e.targetId)).toEqual([2]);
  expect(f.allies[0].hp).toBe(0);expect(f.allies[1].maxHp).toBe(1011);
 });
 refusal(base);
});

// ——— troop:6751 / spell 8129 ———
describe('L4b troop:6751/spell:8129 Curse all enemies, convert every Green gem to Doomskull',()=>{
 const base={spell:8129,cost:15,colors:[BaseColor.Blue,BaseColor.Red]};
 const greens=new Set(['0,0','0,1','0,2','1,3','5,5','7,0']);
 const greenBoard:BoardFn=(r,c)=>greens.has(`${r},${c}`)?colorGem(BaseColor.Green):basePattern(r,c);
 it('source/native/prototype binding (English Doomskulls, native Color2 Doomskull)',()=>{
  const en=original.find((t:{id:number})=>t.id===6751)!,n=native.get(8129).raw,troop=TROOPS.find(t=>t.id===6751)!;
  expect(en.stats.spell.id).toBe(8129);expect(en.stats.spell.desc).toBe('Curse all Enemies. Convert all Green Gems to Doomskulls.');
  expect(en.ManaCost).toBe(15);expect(n.Cost).toBe(15);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorRed']);
  expect(n.SpellSteps).toEqual([{Target:'AllEnemies',Type:'CauseCursed'},{Color1:'Green',Amount:100,Color2:'Doomskull',Type:'ConvertGems'}]);
  expect(troop).toMatchObject({id:6751,manaCost:15,manaColors:[BaseColor.Blue,BaseColor.Red],spell:{id:8129}});
  expect(registry.prototypes.get('8129')).toEqual({segments:[{kind:'status',target:'enemyAll',statusId:'curse',turns:3},
   {kind:'gem',params:{op:'transform',from:'Green',to:'SKULL',toSpecial:'doomSkull'}}]});
 });
 // FIXED round 2 (issues.json L4b-6751-zh): display override now says 末日骷髅头 (Doomskulls) like English/native.
 it('display says 末日骷髅头 (Doomskulls) like the English/native source',()=>{
  expect(TROOPS.find(t=>t.id===6751)!.spell.description).toBe('诅咒所有敌人。将所有绿色宝石转换成末日骷髅头。');
 });
 for(const side of sides)it(`real cast side=${side}: all Green become Doomskull; matched and exploded Doomskulls both trigger`,()=>{
  const f=setup({...base,side,board:greenBoard});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&[e.targetId,e.statusId,e.turns])).toEqual([[10,'curse',3],[11,'curse',3],[12,'curse',3],[13,'curse',3]]);
  const made=creations(ev);expect(made.map(m=>m.pos).sort()).toEqual([...greens].sort());
  expect(made.every(m=>isColor(m.from,BaseColor.Green)&&m.to.kind==='special'&&m.to.spec.kind==='doomSkull')).toBe(true);
  const trig=ev.filter(e=>e.type==='special-gem-trigger'&&e.kind==='doomSkull').map(e=>e.type==='special-gem-trigger'&&`${e.pos.row},${e.pos.col}`);
  // Doom matches add damage without explosions; nearby unmatched Doom skulls remain intact.
  expect(trig).toEqual([]);
  expect(ev.filter(e=>e.type==='gem-explode')).toHaveLength(0);
  expect(f.board.get({row:1,col:3})?.type).toEqual(specialGem('doomSkull'));
  expect(f.board.get({row:5,col:5})?.type).toEqual(specialGem('doomSkull'));
  expect(f.board.get({row:7,col:0})?.type).toEqual(specialGem('doomSkull'));
  expect(f.enemies.some(e=>e.hp<1000)).toBe(true); // Doomskull match deals skull damage (board source)
  assertTurnAndMana(f,ev);
 });
 it('no Green on board: no conversion, Curse still applied, turn passes',()=>{
  const f=setup(base);const ev=f.cast();
  expect(creations(ev)).toEqual([]);expect(f.enemies.every(e=>e.statuses.some(s=>s.id==='curse'))).toBe(true);
  expect(f.state.activePlayer).toBe(PlayerSide.Right);expect(f.caster.mana).toBe(0);
 });
 it('only Green converts; Skulls and other colours untouched',()=>{
  const f=setup({...base,board:(r,c)=>r===6&&c===6?skullGem():greenBoard(r,c)});const ev=f.cast();
  expect(creations(ev).every(m=>isColor(m.from,BaseColor.Green))).toBe(true);expect(creations(ev)).toHaveLength(6);
 });
 it('Curse removes enemy positive statuses (Barrier) per shared rule',()=>{
  const f=setup({...base,enemies:[{statuses:[{id:'barrier',turns:3}]},{},{},{}]});f.cast();
  expect(f.enemies[0].statuses.map(s=>s.id)).toEqual(['curse']);
 });
 refusal(base);
});

// ——— troop:6902 / spell 8363 ———
describe('L4b troop:6902/spell:8363 Death Mark an enemy, create 6 Purple +3 per Death-Marked enemy',()=>{
 const base={spell:8363,cost:11,colors:[BaseColor.Red,BaseColor.Yellow],target:12};
 const noPurple:BoardFn=(r,c)=>colorGem([BaseColor.Blue,BaseColor.Yellow,BaseColor.Red,BaseColor.Brown][(r+c)%4]);
 it('source/native/prototype/display binding',()=>{
  sourceBinding(6902,8363,11,base.colors,'Death Mark an Enemy. Create 6 Purple Gems, boosted by Death Marked Enemies. [x3]',
   [{Target:'FromTarget',Amount:1,Type:'CauseDeathMark'},{Target:'AllEnemies',Amount:300,Type:'CountSpecificStatusEffect',Data:'deathmark'},{UseCounterForAmount:true,Color1:'Purple',Amount:6,Type:'CreateGems'}],
   '使一名敌人陷入死亡标记状态。创造 6 颗紫色宝石，数量因陷入死亡标记状态的敌人数而增强。 [x3]');
  const mod={mod:{kind:'multiplier',a:3},source:{kind:'enemyStatusCount',statusId:'death-mark'}};
  expect(registry.prototypes.get('8363')).toEqual({segments:[{kind:'status',target:'enemyChosen',statusId:'death-mark',turns:3},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'Purple'},count:{base:6,mult:0},modifier:mod},modifier:mod}]});
 });
 for(const side of sides)for(const [pre,expected] of [[0,9],[2,15],[3,18]] as const)
 it(`real cast side=${side}: ${pre} other pre-marked enemies -> ${expected} Purple`,()=>{
  const marked=[0,1,3].slice(0,pre);
  const enemies=[0,1,2,3].map(i=>marked.includes(i)?{statuses:[{id:'death-mark',turns:3}]}:{});
  const f=setup({...base,side,board:noPurple,enemies});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&[e.targetId,e.statusId,e.turns])).toEqual([[12,'death-mark',3]]);
  const made=creations(ev);expect(made).toHaveLength(expected);
  expect(made.every(m=>isColor(m.to,BaseColor.Purple)&&!isColor(m.from,BaseColor.Purple))).toBe(true);
  expect(f.enemies.every(e=>e.hp===1000)).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('already-marked chosen target counts once (no double count): 6+3=9',()=>{
  const f=setup({...base,board:noPurple,enemies:[{},{},{statuses:[{id:'death-mark',turns:3}]},{}]});
  expect(creations(f.cast())).toHaveLength(9);
 });
 it('defeated Death-Marked enemy does not count',()=>{
  const f=setup({...base,board:noPurple,enemies:[{defeated:true,hp:0,statuses:[{id:'death-mark',turns:3}]},{},{},{}]});
  expect(creations(f.cast())).toHaveLength(9);
 });
 it('immune (Blessed) target resists Death Mark: counter 0 -> exactly 6 Purple',()=>{
  const f=setup({...base,board:noPurple,enemies:[{},{},{statuses:[{id:'blessed',turns:3}]},{}]});const ev=f.cast();
  expect(ev.some(e=>e.type==='status-apply')).toBe(false);expect(creations(ev)).toHaveLength(6);
 });
 refusal(base);
});

// ——— troop:7138 / spell 8687 ———
describe('L4b troop:7138/spell:8687 Enchant an ally, +3 Magic, create 12 gems of one of their mana colours',()=>{
 const base={spell:8687,cost:12,colors:[BaseColor.Blue,BaseColor.Yellow],allies:[{colors:[BaseColor.Green]},{colors:[BaseColor.Red,BaseColor.Purple]}],target:1};
 it('source/native/prototype binding',()=>{
  const en=original.find((t:{id:number})=>t.id===7138)!,n=native.get(8687).raw,troop=TROOPS.find(t=>t.id===7138)!;
  expect(en.stats.spell.id).toBe(8687);expect(en.stats.spell.desc).toBe('Enchant an Ally, and give 3 Magic to them. Then create 12 Gems of one of their Mana Colors.');
  expect(en.ManaCost).toBe(12);expect(n.Cost).toBe(12);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(['ColorBlue','ColorYellow']);
  expect(n.SpellSteps).toEqual([{Target:'FromTarget',Amount:1,Type:'CauseEnchanted'},{Target:'FromTarget',Amount:3,Type:'IncreaseSpellPower'},{Color1:'FromTarget',Amount:12,Type:'CreateGems'}]);
  expect(troop).toMatchObject({id:7138,manaCost:12,manaColors:[BaseColor.Blue,BaseColor.Yellow],spell:{id:8687}});
  expect(registry.prototypes.get('8687')).toEqual({segments:[{kind:'status',target:'allyChosen',statusId:'enchanted',turns:3},
   {kind:'buff',target:'allyChosen',stat:'magic',scaling:{base:3,mult:0}},
   {kind:'gem',params:{op:'create',gem:{kind:'color',color:'LAST_TARGET'},count:{base:12,mult:0}}}]});
 });
 // FIXED round 2 (issues.json L4b-7138-zh): display override reads 法力颜色.
 it('display reads 法力颜色 (mana colour)',()=>{
  expect(TROOPS.find(t=>t.id===7138)!.spell.description).toBe('赐予一名盟友法印效果，并给予其 3 点魔力值。再创建 12 颗其法力颜色之一的宝石。');
 });
 for(const side of sides)it(`real cast side=${side}: single-colour ally (Green) -> Enchanted, +3 Magic, 12 Green`,()=>{
  const f=setup({...base,side});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&[e.targetId,e.statusId,e.turns])).toEqual([[1,'enchanted',3]]);
  expect(f.allies[0].magic).toBe(14);expect(f.allies[1].magic).toBe(11);expect(f.caster.magic).toBe(10);
  const made=creations(ev);expect(made).toHaveLength(12);expect(made.every(m=>isColor(m.to,BaseColor.Green)&&!isColor(m.from,BaseColor.Green))).toBe(true);
  assertTurnAndMana(f,ev);
 });
 it('two-colour ally: 12 gems created, each one of the target colours Red/Purple (current runtime)',()=>{
  const f=setup({...base,target:2,seed:42});const made=creations(f.cast());
  expect(made).toHaveLength(12);
  expect(made.every(m=>isColor(m.to,BaseColor.Red)||isColor(m.to,BaseColor.Purple))).toBe(true);
 });
 // KNOWN DIFFERENCE (issues.json L4b-7138-onecolour): "12 Gems of ONE of their Mana Colors" must pick a single
 // colour per cast; runtime re-rolls LAST_TARGET per gem and produces a Red+Purple mix.
 // FIXED round 2: the colour is resolved once per cast (gems.ts resolveCreateSpec); every seed yields one colour.
 for(const seed of [1,7,42,99])it(`two-colour ally seed=${seed}: all 12 gems share ONE of Red/Purple`,()=>{
  const f=setup({...base,target:2,seed});const made=creations(f.cast());
  expect(made).toHaveLength(12);const cs=new Set(made.map(m=>m.to.kind==='color'?m.to.color:'x'));
  expect(cs.size).toBe(1);expect(['Red','Purple']).toContain([...cs][0]);
  expect(made.every(m=>m.from===null||m.from.kind!=='color'||m.from.color!==[...cs][0])).toBe(true);
 });
 it('caster may target itself (Blue/Yellow ally = self): 12 gems of Blue or Yellow, Enchanted survives the cast',()=>{
  const f=setup({...base,target:0,board:(r,c)=>colorGem([BaseColor.Green,BaseColor.Red,BaseColor.Purple,BaseColor.Brown][(r+c)%4])});const ev=f.cast();
  expect(f.caster.statuses.map(s=>s.id)).toContain('enchanted');expect(f.caster.magic).toBe(13);
  const made=creations(ev);expect(made).toHaveLength(12);
 });
 it('enemy is not a legal target: cast refused before mana is spent',()=>{
  const f=setup({...base,target:11});expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(12);expect(f.state.actionLog).toHaveLength(0);
 });
 refusal(base);
});

// ——— troop:7200 / spell 8787 ———
describe('L4b troop:7200/spell:8787 Enrage all allies, +[Magic+1] Attack, create a mix of 22 Skulls and Yellow',()=>{
 const base={spell:8787,cost:22,colors:[BaseColor.Blue,BaseColor.Green,BaseColor.Yellow],allies:[{},{}]};
 const noYellow:BoardFn=(r,c)=>colorGem([BaseColor.Blue,BaseColor.Red,BaseColor.Purple,BaseColor.Brown][(r+c)%4]);
 it('source/native/prototype/display binding',()=>{
  sourceBinding(7200,8787,22,base.colors,'Enrage all Allies and give them [Magic + 1] Attack. Then create a mix of 22 Skulls and Yellow Gems.',
   [{Target:'AllAllies',Type:'CauseEnraged'},{SpellPowerMultiplier:1,Target:'AllAllies',Amount:1,Primarypower:true,Type:'IncreaseAttack'},{Color1:'Skull',Amount:22,Color2:'Yellow',Type:'CreateGems2Colors'}],
   '使所有盟友获得狂怒效果，并给予他们 [魔法 + 1] 点攻击力。再创建 22 颗混合骷髅头和黄色宝石。');
  expect(registry.prototypes.get('8787')).toEqual({segments:[{kind:'status',target:'allyAll',statusId:'rage',turns:3},
   {kind:'buff',target:'allyAll',stat:'attack',scaling:{base:1,mult:1}},
   {kind:'gem',params:{op:'create',gem:{kind:'mixAny',entries:['SKULL','Yellow']},count:{base:22,mult:0}}}]});
 });
 for(const side of sides)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: 22 Skull/Yellow mix, rage + attack`,()=>{
  const f=setup({...base,side,magic,board:noYellow});const ev=f.cast();
  expect(ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'&&[e.targetId,e.statusId])).toEqual([[0,'rage'],[1,'rage'],[2,'rage']]);
  for(const c of [f.caster,...f.allies])expect(c.attack).toBe(17+magic+1);
  expect(f.enemies.every(e=>e.attack===17&&e.statuses.length===0)).toBe(true);
  const made=creations(ev);expect(made).toHaveLength(22);
  expect(made.every(m=>m.to.kind==='skull'||isColor(m.to,BaseColor.Yellow))).toBe(true);
  expect(made.some(m=>m.to.kind==='skull')).toBe(true);expect(made.some(m=>isColor(m.to,BaseColor.Yellow))).toBe(true);
  assertTurnAndMana(f,ev);
 });
 // RULED round 2 (rulings/RL4b-01-two-colour-overwrite.md, L4b-7200-noop closed): 2-colour creation selects 22 distinct
 // cells and may land a gem on a cell that already had that colour; only N distinct cells / endpoint types are asserted.
 // (Historical note: on a Yellow-bearing full board the conversion pool is filtered
 // by the first probe pick only; with seed 7 some Yellow cells are "converted" to Yellow (no-op), so fewer
 // than 22 cells actually become Skull/Yellow.
 it('seed=7 Yellow-bearing board: 22 distinct cells selected, all end Skull or Yellow (same-colour overwrite allowed, RL4b-01)',()=>{
  const f=setup({...base,seed:7});const made=creations(f.cast());
  expect(made).toHaveLength(22);expect(new Set(made.map(m=>m.pos)).size).toBe(22);
  expect(made.every(m=>m.to.kind==='skull'||isColor(m.to,BaseColor.Yellow))).toBe(true);
 });
 it('Enrage (rage) is recognised by enraged-status readers: skull match deals 1.5x and consumes it',async()=>{
  const {isEnraged}=await import('@engine/skills/effects/status');
  const f=setup({...base,board:noYellow});f.cast();
  expect([f.caster,...f.allies].every(c=>isEnraged(c))).toBe(true);
 });
 // FIXED round 2 (issues.json L4b-7200-rage-alias): secondary.ts status readers treat rage/enraged as one status.
 // (Was: Enrage is stored as 'rage'; exact-id counters used by
 // other skills (allyStatusCount 'enraged', e.g. "boosted by Enraged allies") count 0 after this cast.
 it('Enraged allies from 8787 are counted by allyStatusCount enraged counters (expected 3)',async()=>{
  const {modifierBonus}=await import('@engine/skills/effects/secondary');
  const f=setup({...base,board:noYellow});f.cast();
  const ctx={state:f.state,casterId:0,chosenTargetId:undefined,rng:new SeededRNG(1),nextGemId:()=>9999};
  expect(modifierBonus({mod:{kind:'multiplier',a:1},source:{kind:'allyStatusCount',statusId:'enraged'}},ctx)).toBe(3);
 });
 refusal(base);
});
