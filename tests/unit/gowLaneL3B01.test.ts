// Lane L3 batch B01 (sa-L3): turn / mana lane, stored-snapshot scope. Per-entity source/native/prototype
// binding + real TurnEngine.castSkill cases (both sides, boundaries, refusals). Evidence file (frozen on delivery).
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
import {BaseColor,PlayerSide,colorGem,type Character,type GemType} from '@engine/types';
import type {GameEvent} from '@engine/events';
import {damageCharacter} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';

const original=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const SIDES=[PlayerSide.Left,PlayerSide.Right] as const;
type BoardFn=(r:number,c:number)=>GemType|null;
/** (r+c)%4 diagonal pattern: no line of 3; each colour class is 16 isolated cells. */
const pattern=(cols:BaseColor[],over:Record<string,BaseColor>={}):BoardFn=>(r,c)=>colorGem(over[`${r},${c}`]??cols[(r+c)%4]);
interface Opts{skill:string;cost:number;colors:BaseColor[];side?:PlayerSide;magic?:number;board?:BoardFn;
 allies?:Partial<Character>[];enemies?:Partial<Character>[];target?:number;seed?:number;caster?:Partial<Character>}
function setup(o:Opts){
 const side=o.side??PlayerSide.Left;const board=new BoardModel();
 const fn=o.board??pattern([BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown]);let id=1;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const t=fn(r,c);board.set({row:r,col:c},t?{id:id++,type:t}:null);}
 const caster=damageCharacter(0,{skillId:o.skill,mana:o.cost,manaCost:o.cost,colors:[...o.colors],magic:o.magic??10,...o.caster});
 const allies=(o.allies??[]).map((a,i)=>damageCharacter(1+i,{mana:0,...a}));
 const enemies=(o.enemies??[{},{},{},{}]).map((e,i)=>damageCharacter(10+i,{mana:0,...e}));
 const mine={player:side,characters:[caster,...allies]};
 const theirs={player:side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left,characters:[...enemies]};
 const state=side===PlayerSide.Left?createGameState(board,mine,theirs):createGameState(board,theirs,mine,PlayerSide.Right);
 state.activePlayer=side;let gid=5000;
 const engine=new TurnEngine(state,new SeededRNG(o.seed??42),()=>gid++,registry);engine.skullChance=0;
 engine.setTargetChooser(new FixedTargetChooser(o.target??12));
 const hp0=enemies.map(e=>e.hp);
 return {board,state,engine,caster,allies,enemies,side,opponent:theirs.player,cast:()=>engine.castSkill(caster.id),
  loss:()=>enemies.map((e,i)=>hp0[i]-e.hp)};
}
const created=(ev:GameEvent[])=>{const out:GemType[]=[];for(const e of ev){
 if(e.type==='gem-create')for(const s of e.spawns)out.push(s.gemType);
 if(e.type==='gem-transform')for(const s of e.changes)out.push(s.to);}return out;};
const specials=(ev:GameEvent[],kind:string)=>created(ev).filter(t=>t.kind==='special'&&t.spec.kind===kind);
const applied=(ev:GameEvent[])=>ev.filter(e=>e.type==='status-apply').map(e=>e.type==='status-apply'?[e.targetId,e.statusId]:[]);
const skillExtra=(ev:GameEvent[])=>ev.filter(e=>e.type==='extra-turn'&&e.source==='skill').length;
const matchExtra=(ev:GameEvent[])=>ev.some(e=>e.type==='extra-turn'&&e.source!=='skill');
/** Turn bookkeeping after a real cast: one log entry; turn kept iff an extra turn was granted. */
function turnAfter(f:ReturnType<typeof setup>,ev:GameEvent[],skillExtraTurn:boolean){
 expect(ev[0]).toMatchObject({type:'skill-cast',characterId:0});
 expect(skillExtra(ev)).toBe(skillExtraTurn?1:0);
 expect(f.state.actionLog).toHaveLength(1);
 const kept=skillExtraTurn||matchExtra(ev);
 expect(f.state.activePlayer).toBe(kept?f.side:f.opponent);
 expect(f.state.actionLog[0].outcome).toBe(kept?'extra-turn':'switched');
}
function troopBinding(id:number,spell:number,cost:number,colors:BaseColor[],desc:string,steps:object[],zh:string,target:string){
 const en=original.find((t:{id:number})=>t.id===id)!,troop=TROOPS.find(t=>t.id===id)!,n=native.get(spell).raw;
 expect(en.stats.spell.id).toBe(spell);expect(en.stats.spell.desc).toBe(desc);expect(en.ManaCost).toBe(cost);
 expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(colors.map(x=>`Color${x}`).sort());
 expect(n.Cost).toBe(cost);expect(n.Target).toBe(target);expect(n.SpellSteps).toEqual(steps);
 expect(troop).toMatchObject({id,manaCost:cost,manaColors:[...colors],spell:{id:spell}});
 expect(troop.spell.description).toBe(zh);
}
function refusal(o:Opts){
 for(const mode of ['low-mana','silence'] as const)it(`${mode}: real entry refuses; no log, no turn change, mana kept`,()=>{
  const f=setup(o);
  if(mode==='low-mana')f.caster.mana=o.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?o.cost-1:o.cost);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(f.side);
  expect(f.enemies.every(e=>e.statuses.length===0&&e.hp===1000)).toBe(true);
 });
}

// ——— troop:7313 Relic Knight / spell 8925 (draft: L3-005 half-mana rounding, L3-006 Spirit colour) ———
describe('L3 troop:7313/spell:8925 Barrier an ally + half its mana; Knight -> 3 Spirit Gems',()=>{
 const base={skill:'8925',cost:12,colors:[BaseColor.Blue,BaseColor.Green],target:1};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7313,8925,12,base.colors,'Barrier an Ally, and give them Mana equal to half their Mana cost. If they are a Knight, create 3 Spirit Gems.',
   [{Target:'FromTarget',Amount:1,Type:'CauseBarrier'},{Target:'FromTarget',Type:'GenerateHalfMana'},
    {Target:'FromTarget',StatusAmount:3,Color1:'Spirit',StatusModifier:'AddForKnight',Type:'CreateGems'}],
   '赋予一名盟友屏障效果，并给予其半数法力值。若对方是一名骑士，则创造 3 颗灵力宝石。','Ally');
  expect(registry.prototypes.get('8925')).toEqual({segments:[
   {kind:'status',target:'allyChosen',statusId:'barrier',turns:3},
   {kind:'buff',target:'allyChosen',stat:'mana',scaling:{base:0,mult:0},halve:true},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'spiritGem',color:'Purple'}},count:{base:3,mult:0}},ifCond:{kind:'lastTargetRace',race:'Knight'}}]});
 });
 for(const side of SIDES)it(`real cast side=${side}: chosen Knight ally (cost 12) Barrier + 6 mana + 3 Spirit Gems; turn passes`,()=>{
  const f=setup({...base,side,allies:[{manaCost:12,troopTypes:['Knight']},{manaCost:10}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[1,'barrier']]);expect(f.allies[0].mana).toBe(6);expect(f.allies[1].mana).toBe(0);
  expect(specials(ev,'spiritGem')).toHaveLength(3);turnAfter(f,ev,false);
 });
 it('non-Knight ally: Barrier + half mana, no Spirit Gems; mana capped at cost (ally at 20/24 -> 24)',()=>{
  const f=setup({...base,allies:[{manaCost:24,mana:20,troopTypes:['Human']}]});const ev=f.cast();
  expect(applied(ev)).toEqual([[1,'barrier']]);expect(f.allies[0].mana).toBe(24);expect(specials(ev,'spiritGem')).toHaveLength(0);
 });
 it('self target: caster (Knight) mana 0 after paying -> +6; FIXED L3-004 silenced ally gains no mana',()=>{
  const a=setup({...base,target:0,caster:{troopTypes:['Knight']}});const ev=a.cast();
  expect(a.caster.mana).toBe(6);expect(specials(ev,'spiritGem')).toHaveLength(3);
  const b=setup({...base,allies:[{manaCost:12,statuses:[{id:'silence',turns:3}]}]});b.cast();
  expect(b.allies[0].mana).toBe(0);expect(b.allies[0].statuses.map(s=>s.id).sort()).toEqual(['barrier','silence']);
 });
 refusal({...base,allies:[{manaCost:12}]});
});

// ——— elemental-birth family (FIXED L3-001) ———
for(const [key,id,spell,colors,status,en,zh] of [
 ['troop:7098',7098,8633,[BaseColor.Red,BaseColor.Yellow],'burning','Burn','对一名敌人造成 [魔法 + 3] 点伤害，并燃烧他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。'],
 ['troop:7097',7097,8632,[BaseColor.Green,BaseColor.Red],'entangle','Entangle','对一名敌人造成 [魔法 + 3] 点伤害，并缠绕他。若敌人身亡，则创建 2 颗元素星，并获得一个额外回合。'],
] as const)describe(`L3 ${key}/spell:${spell} ${status} then [Magic+3]; on kill 2 Elemental Stars + extra turn`,()=>{
 const native0={Burn:'CauseBurning',Entangle:'CauseEntangle'}[en];
 const base={skill:String(spell),cost:11,colors:[...colors]};
 /** Burning ticks 3 at the victim's next turn start (turn passes to them); Entangle has no tick. */
 const tick=status==='burning'?3:0;
 it('source/native/prototype/display binding (native Cause* before Damage)',()=>{
  troopBinding(id,spell,11,base.colors,`Deal [Magic + 3] damage to an Enemy, and ${en} them. If the Enemy dies, create 2 Elemental Stars and gain an extra turn.`,
   [{Target:'FromTarget',Amount:1,Type:native0},
    {SpellPowerMultiplier:1,Target:'FromTarget',Amount:3,Primarypower:true,Type:'Damage',Delay:1},
    {StatusAmount:2,Color1:'ElementalStar',StatusModifier:'AddForKill',Type:'CreateGems',Delay:1},
    {Target:'Self',StatusAmount:100,StatusModifier:'AddForKill',Type:'ExtraTurnConditional'}],zh,'Enemy');
  expect(registry.prototypes.get(String(spell))).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:status,turns:3,...(status==='burning'?{magnitude:3}:{})},
   {kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},
   {kind:'gem',params:{op:'create',gem:{kind:'special',spec:{kind:'elementalStar'}},count:{base:2,mult:0}},ifTargetDied:true},
   {kind:'extraTurn',ifTargetDied:true}]});
 });
 for(const side of SIDES)for(const magic of [0,10])it(`real cast side=${side} magic=${magic}: survivor -> ${status} then -${magic+3} (+${tick} tick on their turn); no stars, turn passes`,()=>{
  const f=setup({...base,side,magic});const ev=f.cast();
  expect(applied(ev)).toEqual([[12,status]]);expect(f.loss()).toEqual([0,0,magic+3+tick,0]);
  const si=ev.findIndex(e=>e.type==='status-apply'),di=ev.findIndex(e=>e.type==='skill-damage');expect(si).toBeLessThan(di);
  expect(specials(ev,'elementalStar')).toHaveLength(0);turnAfter(f,ev,false);
 });
 for(const side of SIDES)it(`real cast side=${side}: kill (Life 3, magic 0) -> ${status} applied first, 2 Elemental Stars, skill extra turn`,()=>{
  const f=setup({...base,side,magic:0,enemies:[{},{},{hp:3},{}]});const victim=f.enemies[2];const ev=f.cast();
  expect(victim.defeated).toBe(true);expect(applied(ev)).toEqual([[12,status]]);
  expect(specials(ev,'elementalStar')).toHaveLength(2);turnAfter(f,ev,true);
 });
 it('Life 4 survives the hit at magic 0 (no stars / no extra turn); armor absorbs first; Barrier blocks the hit but not the status',()=>{
  const a=setup({...base,magic:0,enemies:[{},{},{hp:4},{}]});const ea=a.cast();
  expect(ea.some(e=>e.type==='defeat')).toBe(tick>0);expect(specials(ea,'elementalStar')).toHaveLength(0);expect(skillExtra(ea)).toBe(0);
  const b=setup({...base,magic:0,enemies:[{},{},{hp:20,armor:1},{}]});b.cast();expect(b.enemies[2].hp).toBe(18-tick);expect(b.enemies[2].armor).toBe(0);
  const c=setup({...base,magic:0,enemies:[{},{},{hp:20,statuses:[{id:'barrier',turns:3}]},{}]});const ec=c.cast();
  expect(c.enemies[2].hp).toBe(20-tick);expect(applied(ec)).toEqual([[12,status]]);expect(skillExtra(ec)).toBe(0);
 });
 it('frozen caster kills: stars still created, no spell extra turn (official Frozen)',()=>{
  const f=setup({...base,magic:0,enemies:[{},{},{hp:3},{}],caster:{statuses:[{id:'frozen',turns:3}]}});const ev=f.cast();
  expect(specials(ev,'elementalStar')).toHaveLength(2);expect(skillExtra(ev)).toBe(0);
 });
 refusal(base);
});

// ——— troop:6285 Frostling / spell 7431 (FIXED L3-002) ———
describe('L3 troop:6285/spell:7431 Freeze + Web the chosen enemy; +4 Mana if 13+ Blue',()=>{
 const base={skill:'7431',cost:8,colors:[BaseColor.Blue]};
 const B=[BaseColor.Blue,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 const blues=(n:number)=>{const over:Record<string,BaseColor>={};let k=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((r+c)%4===0&&k++>=n)over[`${r},${c}`]=BaseColor.Green;return pattern(B,over);};
 it('source/native/prototype/display binding (zh 「恢复一半的法力值」 = 4 for this cost-8 troop)',()=>{
  troopBinding(6285,7431,8,base.colors,'Freeze and Web an Enemy. If there are 13 or more Blue Gems, gain 4 Mana.',
   [{Target:'FromTarget',Type:'CauseFrozen'},{Target:'FromTarget',Type:'CauseWeb'},
    {Target:'Self',StatusAmount:4,StatusModifier:'AddFor10BlueGems',Type:'GenerateMana'}],
   '冻结一名敌人并使其陷入织网状态。如果板面上有 13 颗或更多蓝色宝石，则自身恢复一半的法力值。','Enemy');
  expect(registry.prototypes.get('7431')).toEqual({segments:[
   {kind:'status',target:'enemyChosen',statusId:'frozen',turns:3},{kind:'status',target:'lastTarget',statusId:'web',turns:3},
   {kind:'buff',target:'allySelf',stat:'mana',scaling:{base:4,mult:0},ifCond:{kind:'boardAtLeast',color:'Blue',n:13}}]});
 });
 for(const side of SIDES)for(const target of [10,13])it(`real cast side=${side} target=${target}: chosen enemy Frozen + Webbed; 16 Blue -> caster mana 4; turn passes`,()=>{
  const f=setup({...base,side,target,board:blues(16)});const ev=f.cast();
  expect(applied(ev)).toEqual([[target,'frozen'],[target,'web']]);expect(f.caster.mana).toBe(4);turnAfter(f,ev,false);
 });
 it('R003 threshold: 13 Blue -> +4; 12 Blue -> +0; fixed 4 is independent of Magic and of the mana bar',()=>{
  const a=setup({...base,board:blues(13)});a.cast();expect(a.caster.mana).toBe(4);
  const b=setup({...base,board:blues(12)});b.cast();expect(b.caster.mana).toBe(0);
  const c=setup({...base,board:blues(16),magic:0,caster:{manaCost:12}});c.caster.mana=12;c.cast();expect(c.caster.mana).toBe(4);
 });
 it('Web zeroes the target Magic; dead chosen enemy cannot be targeted (cast refused)',()=>{
  const f=setup({...base,board:blues(16)});f.cast();expect(f.enemies[2].statuses.map(s=>s.id)).toContain('web');
  const g=setup({...base,board:blues(16),enemies:[{},{},{hp:0,defeated:true},{}]});expect(g.cast()).toEqual([]);expect(g.caster.mana).toBe(8);
 });
 refusal({...base,board:blues(16)});
});

// ——— troop:7208 Eternal Sentinel / spell 8795 (FIXED L3-003) ———
describe('L3 troop:7208/spell:8795 Freeze a random enemy, 3 Good/Evil Gargoyle Gems, extra turn',()=>{
 const base={skill:'8795',cost:11,colors:[BaseColor.Yellow,BaseColor.Purple]};
 it('source/native/prototype/display binding',()=>{
  troopBinding(7208,8795,11,base.colors,'Freeze a random Enemy. Create 3 Gargoyle Gems, and gain an extra turn.',
   [{Target:'RandomEnemy',Amount:1,Type:'CauseFrozen',Delay:1},
    {Color1:'GoodGargoyle',Amount:3,Color2:'BadGargoyle',Type:'CreateGems2Colors'},{Target:'Self',Type:'ExtraTurn'}],
   '冻结一名随机敌人。创造 3 颗石像鬼宝石并获得一个额外回合。','None');
  expect(registry.prototypes.get('8795')).toEqual({segments:[
   {kind:'status',target:'enemyRandom',statusId:'frozen',turns:3},
   {kind:'gem',params:{op:'create',gem:{kind:'mixSpecial',specs:[{kind:'gargoyleGem',tier:1},{kind:'gargoyleGem',tier:2}]},count:{base:3,mult:0}}},
   {kind:'extraTurn'}]});
 });
 for(const side of SIDES)it(`real cast side=${side}: one living enemy Frozen, exactly 3 Gargoyle Gems, skill extra turn`,()=>{
  const f=setup({...base,side});const ev=f.cast();
  const fr=applied(ev);expect(fr).toHaveLength(1);expect(fr[0][1]).toBe('frozen');expect([10,11,12,13]).toContain(fr[0][0]);
  expect(specials(ev,'gargoyleGem')).toHaveLength(3);turnAfter(f,ev,true);
 });
 it('tiers: over seeds both Good (1) and Evil (2) Gargoyles appear, never untiered',()=>{
  const tiers=new Set<number|undefined>();
  for(let seed=1;seed<=12;seed++){const f=setup({...base,seed});for(const t of specials(f.cast(),'gargoyleGem'))if(t.kind==='special')tiers.add(t.spec.tier);}
  expect([...tiers].sort()).toEqual([1,2]);
 });
 it('random freeze skips dead enemies; frozen caster keeps the gems but loses the spell extra turn',()=>{
  const a=setup({...base,enemies:[{hp:0,defeated:true},{hp:0,defeated:true},{},{hp:0,defeated:true}]});expect(applied(a.cast())).toEqual([[12,'frozen']]);
  const b=setup({...base,caster:{statuses:[{id:'frozen',turns:3}]}});const ev=b.cast();
  expect(specials(ev,'gargoyleGem')).toHaveLength(3);expect(skillExtra(ev)).toBe(0);
 });
 refusal(base);
});
