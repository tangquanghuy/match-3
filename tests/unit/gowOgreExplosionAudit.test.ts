// Ogre 6000 / Boulder 7131: per-entity English, native and saved historical official source review.
// @ts-expect-error Node fixture reader
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native source fixture
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem, specialGem, type GemType } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { spellDescription } from '../../src/data/combatText';
import troops from '../../src/data/troops.json';
const troop = troops.find(t=>t.id===6000)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((t:{id:number})=>t.id===6000);
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7131).raw;
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html','utf8');
const registry = new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const spell = registry.prototypes.get('7131')!;
function cast(gem:GemType,side=PlayerSide.Left) {
  const f=damageFixture();
  f.caster.skillId='7131'; f.caster.mana=f.caster.manaCost=6; f.caster.colors=[BaseColor.Blue];
  for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
  f.board.set({row:3,col:3},{id:400,type:gem});
  if(side===PlayerSide.Right) {
    f.state.teams.Left.characters=f.enemies;
    f.state.teams.Right.characters=[f.caster];
    f.state.activePlayer=side;
  }
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  return {...f,events:engine.castSkill(f.caster.id)};
}
describe('Ogre 6000 / Boulder 7131 source and battle review',()=>{
  it('saved English, native and historical official source agree on an unrestricted random Gem; cost/colour/display align',()=>{
    const section=guide.slice(guide.indexOf('<h2>Ogre</h2>'),guide.indexOf('<h2>Orc</h2>'));
    expect(section).toContain('Boulder</big></b>  (Cost:6');
    const patch = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-4-0-patch-notes.json','utf8'));
    expect(patch.posts[0].username).toBe('Sirrian');
    expect(patch.posts[0].cooked).toContain('Mana gain from Explosions has been reduced from 70% to 50%');
    expect(patch.posts[0].cooked).toContain('Mana gain from any gem cascade after an explosion will still get 100%');
    expect(section).toContain('Explode a random gem, destroying other gems around it.');
    expect(en.stats.spell.desc).toBe('Explode a random Gem.');
    expect(native).toMatchObject({Id:7131,Cost:6,Target:'None',SpellSteps:[{Type:'ExplodeGems',Amount:1}]});
    expect(native.SpellSteps).toHaveLength(1);
    expect(troop.manaCost).toBe(6);expect(troop.manaColors).toEqual(['Blue']);
    expect(spell.segments).toEqual([{kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'randomGems',count:{base:1,mult:0},include:'all'}}}]);
    expect(spellDescription(7131,troop.spell.description)).toBe('随机选择一颗宝石爆破，摧毁其周围的其他宝石。');
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right])for(const [label,gem] of [
    ['normal-colour',colorGem(BaseColor.Red)],
    ['normal-skull',{kind:'skull',variant:'normal'} as const],
    ['special-web',specialGem('web')],
  ] as const)it(`${side}: ${label} is eligible as the only Gem in a real cast`,()=>{
    const f=cast(gem,side);
    const event=f.events.find((e):e is Extract<typeof e,{type:'gem-explode'}>=>e.type==='gem-explode');
    expect(event?.cells).toEqual([{pos:{row:3,col:3},gemId:400,gemType:gem}]);
    expect(f.events[0]).toMatchObject({type:'skill-cast',skillId:'7131'});
    expect(f.caster.mana).toBe(0);
    expect(f.state.actionLog).toHaveLength(1);
    expect(f.events.some(e=>e.type==='turn-end'||e.type==='extra-turn')).toBe(true);
  });
  it('a central anchor destroys itself and exactly its eight neighbouring occupied cells',()=>{
    const f=damageFixture();f.caster.skillId='7131';f.caster.mana=f.caster.manaCost=6;
    for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
    for(let row=2;row<=4;row++)for(let col=2;col<=4;col++)f.board.set({row,col},{id:row*8+col+1,type:colorGem(BaseColor.Red)});
    const seed=Array.from({length:500},(_,i)=>i+1).find(i=>new SeededRNG(i).nextInt(9)===4)!;
    const engine=new TurnEngine(f.state,new SeededRNG(seed),f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const blast=events.find((e):e is Extract<typeof e,{type:'gem-explode'}>=>e.type==='gem-explode');
    expect(blast?.cells).toHaveLength(9);
    expect(new Set(blast!.cells.map(c=>`${c.pos.row},${c.pos.col}`))).toEqual(new Set(Array.from({length:9},(_,i)=>`${2+Math.floor(i/3)},${2+i%3}`)));
  });
  for (const n of [1,2,3,4] as const) it(`${n} blue gems in explosion give floor(${n}/2) Blue mana before cascade`,()=>{
    const f=damageFixture();f.caster.skillId='7131';f.caster.mana=f.caster.manaCost=6;f.caster.colors=[BaseColor.Blue];
    for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
    for(let i=0;i<n;i++)f.board.set({row:3+Math.floor(i/2),col:3+i%2},{id:500+i,type:colorGem(BaseColor.Blue)});
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const gravity=events.findIndex(e=>e.type==='gravity');
    expect(gravity).toBeGreaterThan(0);
    const directGain=events.slice(0,gravity).filter((e):e is Extract<typeof e,{type:'mana-gain'}>=>e.type==='mana-gain'&&e.characterId===f.caster.id);
    expect(directGain.reduce((sum,e)=>sum+e.amount,0)).toBe(Math.floor(n/2));
    expect(events.find(e=>e.type==='gem-explode'&&e.cells.length===n)).toBeDefined();
  });
  it('two neighbouring skulls damage the first enemy once as a spell, independently of Ogre Attack',()=>{
    const f=damageFixture();f.caster.skillId='7131';f.caster.mana=f.caster.manaCost=6;f.caster.attack=999;
    for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
    for(let i=0;i<2;i++)f.board.set({row:3,col:3+i},{id:600+i,type:{kind:'skull',variant:'normal'}});
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const skull=events.find(e=>e.type==='skill-damage'&&e.skullBurst?.normal===2);
    expect(skull).toBeDefined();expect(f.enemies[0].hp).toBe(998);
  });
  it('a corner anchor explodes only the four in-bounds corner cells',()=>{
    const f=damageFixture();f.caster.skillId='7131';f.caster.mana=f.caster.manaCost=6;
    for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
    for(let row=0;row<2;row++)for(let col=0;col<2;col++)f.board.set({row,col},{id:800+row*2+col,type:colorGem(BaseColor.Blue)});
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const blast=events.find((e):e is Extract<typeof e,{type:'gem-explode'}>=>e.type==='gem-explode');
    expect(blast?.cells.map(c=>`${c.pos.row},${c.pos.col}`).sort()).toEqual(['0,0','0,1','1,0','1,1']);
  });
  it('right-side Ogre owns the half-mana return from two adjacent Blue gems',()=>{
    const f=damageFixture();f.caster.skillId='7131';f.caster.mana=f.caster.manaCost=6;f.caster.colors=[BaseColor.Blue];
    f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=PlayerSide.Right;
    for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},null);
    f.board.set({row:3,col:3},{id:710,type:colorGem(BaseColor.Blue)});
    f.board.set({row:3,col:4},{id:711,type:colorGem(BaseColor.Blue)});
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const beforeGravity=events.slice(0,events.findIndex(e=>e.type==='gravity'));
    expect(beforeGravity.filter(e=>e.type==='mana-gain')).toEqual([expect.objectContaining({characterId:f.caster.id,player:PlayerSide.Right,color:BaseColor.Blue,amount:1})]);
  });
  for(const reason of ['low-mana','silence'] as const)it(reason+' prevents the cast before RNG and board changes',()=>{
    const f=damageFixture();f.caster.skillId='7131';f.caster.manaCost=6;f.caster.mana=reason==='low-mana'?5:6;
    if(reason==='silence')f.caster.statuses=[{id:'silence',turns:3}];
    const before=f.ctx.rng.getState();const boardBefore=f.board.get({row:0,col:0});
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);
    expect(engine.castSkill(f.caster.id)).toEqual([]);
    expect(f.ctx.rng.getState()).toEqual(before);expect(f.board.get({row:0,col:0})).toEqual(boardBefore);
    expect(f.caster.mana).toBe(reason==='low-mana'?5:6);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(f.state.actionLog).toHaveLength(0);
  });
});



