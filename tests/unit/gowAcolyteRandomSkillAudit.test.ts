// Acolyte 6009 / Unearth Secrets 7009: scoped source and real-cast checks, NOT whole acceptance.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { randomStatEffect } from '@engine/skills/effects/buff';
import { spellDescription } from '../../src/data/combatText';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import troops from '../../src/data/troops.json';
const troop = troops.find(t => t.id === 6009)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: {id:number}) => t.id === 6009);
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7009).raw;
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', 'utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);

describe('Acolyte 6009 / 7009 scoped original-source checks', () => {
  it('stored English and native agree with historical official wording on cost, colours, creation and one Skill', () => {
    const historical = guide.slice(guide.indexOf('<h2>Acolyte</h2>'), guide.indexOf('<h2>Acolyte</h2>') + 7000);
    expect(historical).toContain('Create 9 Brown Gems. Increase a random Skill by [0+Magic].');
    expect(historical).toContain('(Cost:10');
    expect(en.stats.spell.desc).toBe('Create 9 Brown Gems. Gain [Magic] points to a random Skill.');
    expect(native.SpellSteps).toEqual([
      { Color1:'Brown', Amount:9, Type:'CreateGems' },
      { SpellPowerMultiplier:1, Target:'Self', Primarypower:true, Type:'IncreaseRandom' },
    ]);
    expect(troop.manaCost).toBe(10);
    expect(troop.manaColors).toEqual(['Blue','Purple']);
    expect(spellDescription(7009,troop.spell.description)).toBe('创造 9 颗棕色宝石。自身一项随机属性获得 [魔法] 点。');
    expect(registry.prototypes.get('7009')?.segments).toMatchObject([
      { kind:'gem' },{ kind:'randomStat', target:'allySelf', oneSkill:true, scaling:{base:0,mult:1} },
    ]);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) it(`${side}: battle cast creates exactly 9 Brown gems then buffs only one caster Skill`, () => {
    const f=damageFixture(); f.caster.skillId='7009'; f.caster.manaCost=f.caster.mana=10; f.caster.magic=11;
    f.caster.colors=[BaseColor.Blue,BaseColor.Purple];
    if (side===PlayerSide.Left) {f.state.teams.Left.characters=[f.caster];}
    else {f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
    const before={attack:f.caster.attack,armor:f.caster.armor,hp:f.caster.hp,maxHp:f.caster.maxHp,magic:f.caster.magic};
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const creation=events.find(e=>e.type==='gem-transform');
    expect(creation).toMatchObject({type:'gem-transform'});
    if(creation?.type!=='gem-transform')throw Error('missing creation event');
    expect(creation.changes).toHaveLength(9);
    expect(creation.changes.every(x=>x.to.kind==='color'&&x.to.color===BaseColor.Brown)).toBe(true);
    expect(new Set(creation.changes.map(x=>`${x.pos.row},${x.pos.col}`)).size).toBe(9);
    const buffs=events.filter((e):e is Extract<typeof e,{type:'buff'}>=>e.type==='buff' && e.targetId===f.caster.id);
    expect(buffs).toHaveLength(1);expect(buffs[0].amount).toBe(11);
    const key=buffs[0].stat;expect(key).not.toBe('mana');
    for(const stat of ['attack','armor','hp','magic'] as const) expect(f.caster[stat]).toBe(before[stat]+(stat===key?11:0));
    expect(f.caster.maxHp).toBe(before.maxHp+(key==='hp'?11:0));
    expect(events.indexOf(creation)).toBeLessThan(events.indexOf(buffs[0]));
    expect(f.caster.mana).toBe(0);
    expect(events.some(e=>e.type==='turn-end'||e.type==='extra-turn')).toBe(true);
    expect(f.state.actionLog).toHaveLength(1);
  });
  it('each of the four random Skills takes the complete [Magic] points, including max Life growth', () => {
    for (const [index,stat] of (['attack','armor','hp','magic'] as const).entries()) {
      const seed=Array.from({length:100},(_,i)=>i+1).find(i=>new SeededRNG(i).nextInt(4)===index)!;
      const f=damageFixture();f.caster.magic=11;f.caster.hp=19;f.caster.maxHp=23;
      f.ctx.rng.setState(new SeededRNG(seed).getState());
      const before={attack:f.caster.attack,armor:f.caster.armor,hp:f.caster.hp,maxHp:f.caster.maxHp,magic:f.caster.magic};
      const events=randomStatEffect({targets:[f.caster],scaling:{base:0,mult:1},oneSkill:true}).apply(f.ctx);
      expect(events).toEqual([{type:'buff',targetId:f.caster.id,stat,amount:11,...(stat==='hp'?{maxHpGain:11}:{})}]);
      for(const key of ['attack','armor','hp','magic'] as const)expect(f.caster[key]).toBe(before[key]+(key===stat?11:0));
      expect(f.caster.maxHp).toBe(before.maxHp+(stat==='hp'?11:0));
    }
  });
  for(const mode of ['zero-magic','web'] as const)it(mode+' preserves the fixed nine gems but grants no [Magic] Skill increase',()=>{
    const f=damageFixture();f.caster.skillId='7009';f.caster.manaCost=f.caster.mana=10;
    f.caster.magic=mode==='web'?23:0;
    if(mode==='web')f.caster.statuses=[{id:'web',turns:3}];
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    expect(events.some(e=>e.type==='gem-transform'||e.type==='gem-create')).toBe(true);
    expect(events.some(e=>e.type==='buff'&&e.targetId===f.caster.id)).toBe(false);
    expect(f.caster.mana).toBe(0);
  });
  for(const reason of ['low-mana','silence'] as const)it(reason+' blocks without spending Mana, moving gems or passing turn',()=>{
    const f=damageFixture();f.caster.skillId='7009';f.caster.manaCost=10;f.caster.mana=reason==='low-mana'?9:10;
    if(reason==='silence')f.caster.statuses=[{id:'silence',turns:3}];
    const before=f.board.get({row:0,col:0})?.type;
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);
    expect(engine.castSkill(f.caster.id)).toEqual([]);
    expect(f.caster.mana).toBe(reason==='low-mana'?9:10);
    expect(f.board.get({row:0,col:0})?.type).toEqual(before);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(f.state.actionLog).toHaveLength(0);
  });
  it('an all-Brown board contains no eligible replacement gems yet still applies the stat increase',()=>{
    const f=damageFixture();f.caster.skillId='7009';f.caster.manaCost=f.caster.mana=10;f.caster.magic=11;
    for(let row=0;row<8;row++)for(let col=0;col<8;col++)f.board.set({row,col},{id:row*8+col+1,type:{kind:'color',color:BaseColor.Brown}});
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    expect(events.some(e=>e.type==='gem-create'||e.type==='gem-transform')).toBe(false);
    expect(events.filter(e=>e.type==='buff'&&e.targetId===f.caster.id)).toHaveLength(1);
    expect(f.caster.mana).toBe(0);
  });

  it('nine created Brown gems forming a 4+ match keep the action, rather than a free cast',()=>{
    const f=damageFixture();f.caster.skillId='7009';f.caster.manaCost=f.caster.mana=10;f.caster.magic=11;
    for(let col=0;col<8;col++)f.board.set({row:0,col},null);
    f.board.set({row:1,col:0},null);
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    expect(events.some(e=>e.type==='gem-create')).toBe(true);
    expect(events.some(e=>e.type==='extra-turn'&&e.source==='match')).toBe(true);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(f.state.actionLog).toHaveLength(1);
    expect(f.state.actionLog[0].outcome).toBe('extra-turn');
  });

  it('three open cells plus a full board distribute all nine created gems without duplicating positions',()=>{
    const f=damageFixture();f.caster.skillId='7009';f.caster.manaCost=f.caster.mana=10;f.caster.magic=11;
    for(let col=0;col<3;col++)f.board.set({row:0,col},null);
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const events=engine.castSkill(f.caster.id);
    const created=events.filter((e):e is Extract<typeof e,{type:'gem-create'}>=>e.type==='gem-create');
    const transformed=events.filter((e):e is Extract<typeof e,{type:'gem-transform'}>=>e.type==='gem-transform');
    expect(created[0]?.spawns).toHaveLength(3);
    expect(transformed[0]?.changes).toHaveLength(6);
    expect(new Set([...created[0].spawns.map(x=>`${x.pos.row},${x.pos.col}`),...transformed[0].changes.map(x=>`${x.pos.row},${x.pos.col}`)]).size).toBe(9);
  });

});



