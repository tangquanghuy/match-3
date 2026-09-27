// Single-entity clause review; shared fractional rounding and death order remain pending.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { attachPassives } from '@engine/traits';
import { spellDescription } from '../../src/data/combatText';
import { damageFixture } from '../helpers/damageFixture';
import troops from '../../src/data/troops.json';
const entity = troops.find(t => t.id === 6004)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t:{id:number}) => t.id === 6004);
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells).get(7004).raw;
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function setup(side = PlayerSide.Left, chosen = 12) {
  const f = damageFixture(); f.caster.skillId = String(entity.spell.id);
  f.caster.colors = [BaseColor.Red]; f.caster.mana = f.caster.manaCost = entity.manaCost;
  // No initial match, but a legal swap exists: no dead-board reshuffle masks spell-only changes.
  for (const [row,col,color] of [[0,0,BaseColor.Blue],[0,1,BaseColor.Blue],[0,2,BaseColor.Yellow],[1,2,BaseColor.Blue]] as const)
    f.board.set({row,col}, {id:row*8+col+1,type:colorGem(color)});
  if (side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies; f.state.teams.Right.characters = [f.caster]; f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry); engine.skullChance = 0;
  engine.setTargetChooser({choose:()=>chosen}); return {...f,engine,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Musketeer 6004 / Snipe 7004 source-complete damage clause (NOT whole-skill signoff)', () => {
  it('English, raw steps, cost, Red color, final binding and Chinese display are consistent', () => {
    expect(en.stats.spell.desc).toBe('Deal [Magic + 2] damage to an Enemy.');
    expect(native).toMatchObject({Cost:6,Target:'Enemy',SpellSteps:[{Type:'Damage',Target:'FromTarget',Amount:2,SpellPowerMultiplier:1,Primarypower:true}]});
    expect(native.SpellSteps).toHaveLength(1); expect(entity.manaCost).toBe(6); expect(entity.manaColors).toEqual(['Red']);
    expect(registry.prototypes.get('7004')?.segments).toEqual([{kind:'damage',target:'enemyChosen',scaling:{base:2,mult:1}}]);
    expect(spellDescription(7004,entity.spell.description)).toBe('对 1 名敌人造成 [魔法 + 2] 点伤害。');
  });
  for (const side of [PlayerSide.Left,PlayerSide.Right]) for (const chosen of [10,11,12,13])
    for (const magic of [0,1,11,20]) for (const armor of [0,5,30])
      it(side+' chosen='+chosen+' Magic='+magic+' armor='+armor, () => {
        const f=setup(side,chosen); f.caster.magic=magic; for(const t of f.enemies)t.armor=armor;
        const before=Array.from({length:64},(_,i)=>f.board.get({row:Math.floor(i/8),col:i%8})); const ev=f.cast();
        expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage,e.range])).toEqual([[chosen,magic+2,'single']]);
        for(const t of f.enemies){const d=t.id===chosen?magic+2:0;expect(t.hp).toBe(1000-Math.max(0,d-armor));expect(t.armor).toBe(Math.max(0,armor-d));expect(t.mana).toBe(16);expect(t.statuses).toEqual([]);}
        expect(f.caster.mana).toBe(0);expect(Array.from({length:64},(_,i)=>f.board.get({row:Math.floor(i/8),col:i%8}))).toEqual(before);
        expect(ev.some(e=>['gem-transform','gem-destroy','gem-explode','summon','troop-transform','extra-turn'].includes(e.type))).toBe(false);
      });
  for(const status of ['frozen','stun','entangle','web','silence']) for(const side of [PlayerSide.Left,PlayerSide.Right])
    it(side+' caster '+status+' follows official action restrictions',()=>{
      const f=setup(side);f.caster.statuses=[{id:status,turns:3}];const ev=f.cast();
      if(status==='silence'){expect(ev).toEqual([]);expect(f.caster.mana).toBe(6);}
      else {expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([status==='web'?2:13]);expect(f.caster.mana).toBe(0);}
    });
  for(const status of ['submerged','blessed','impervious','barrier','reflect','faerie-fire'])
    it('target '+status+' ordinary damage interaction at exact integer amounts',()=>{
      const f=setup();f.caster.magic=14;const t=f.enemies[2];t.armor=5;
      if(status==='impervious'){t.traitIds=['impervious'];attachPassives(t);} else t.statuses=[{id:status,turns:3}];
      const hits=f.cast().filter(e=>e.type==='skill-damage');
      if(status==='barrier'){expect(hits).toEqual([]);expect(t.hp).toBe(1000);expect(t.armor).toBe(5);expect(t.statuses).toEqual([]);}
      else {const d=status==='faerie-fire'?24:16;expect(hits.map(e=>[e.targetId,e.damage])).toEqual(status==='reflect'?[[12,16],[0,8]]:[[12,d]]);expect(t.hp).toBe(1000-(d-5));expect(t.armor).toBe(0);}
      expect(t.mana).toBe(16);
    });
  for(const trait of ['spellarmor','spellblock']) for(const stun of [false,true])
    it(trait+' reduction disabled by Stun='+stun+' using exact integer damage',()=>{
      const f=setup();f.caster.magic=14;const t=f.enemies[2];t.traitIds=[trait];attachPassives(t);
      if(stun)t.statuses=[{id:'stun',turns:3}];
      expect(f.cast().filter(e=>e.type==='skill-damage').map(e=>e.damage)).toEqual([stun?16:trait==='spellarmor'?12:8]);
    });
  it('lethal selected hit defeats only that enemy and emits one death, with no bonus hit/retarget/reward',()=>{
    const f=setup();f.enemies[2].hp=1;const ev=f.cast();
    expect(ev.filter(e=>e.type==='defeat')).toEqual([{type:'defeat',characterId:12}]);
    expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([12]);
    expect(f.caster.mana).toBe(0);expect(f.enemies.filter(e=>e.id!==12).every(e=>e.hp===1000)).toBe(true);
  });
  it('insufficient Mana and defeated caster produce no action and spend nothing',()=>{
    const f=setup();f.caster.mana=5;expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(5);
    f.caster.mana=6;f.caster.defeated=true;expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(6);
  });
  it('ordinary real cast spends the turn and records switched',()=>{
    const f=setup();f.cast();expect(f.state.activePlayer).toBe(PlayerSide.Right);
    expect(f.state.actionLog.at(-1)?.outcome).toBe('switched');
    // Latest user ruling: ordinary casts spend a turn.
  });
});

// Expectations: saved English Stealthy trait and official Stun rule, plus atomic input contract.
describe('Musketeer chosen-target preflight and Stealthy/Stun boundary review', () => {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    for (const selection of [null, 999, 0, 12]) {
      it(side + ' cancelled/stale/friendly/defeated target ' + selection + ' spends no action', () => {
        const f = setup(side);
        if (selection === 12) f.enemies[2].defeated = true;
        f.caster.statuses = [{ id: 'enchanted', turns: 3 }];
        f.engine.setTargetChooser({ choose: () => selection });
        const before = JSON.stringify(f.state); const rng = f.ctx.rng.getState();
        expect(f.cast()).toEqual([]);
        expect(JSON.stringify(f.state)).toBe(before);
        expect(f.ctx.rng.getState()).toBe(rng);
      });
    }
    it(side + ' hidden enemy with another visible enemy is not a valid chosen target', () => {
      const f = setup(side); f.enemies[2].traitIds = ['stealthy']; attachPassives(f.enemies[2]);
      const before = JSON.stringify(f.state);
      expect(f.cast()).toEqual([]); expect(JSON.stringify(f.state)).toBe(before);
    });
    it(side + ' Stun disables Stealthy trait and makes that enemy selectable', () => {
      const f = setup(side); const target = f.enemies[2];
      target.traitIds = ['stealthy']; attachPassives(target); target.statuses = [{ id: 'stun', turns: 3 }];
      expect(f.cast().filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[12, 13]]);
      expect(f.caster.mana).toBe(0);
    });
    it(side + ' all remaining enemies Stealthy permits an explicit selection', () => {
      const f = setup(side); for (const t of f.enemies) { t.traitIds = ['stealthy']; attachPassives(t); }
      expect(f.cast().filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[12, 13]]);
    });
    it(side + ' chosen input is requested exactly once before mana is spent', () => {
      const f = setup(side); let calls = 0;
      f.engine.setTargetChooser({ choose: () => { calls++; expect(f.caster.mana).toBe(6); return 12; } });
      expect(f.cast().filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual([12]);
      expect(calls).toBe(1);
    });
  }
});

describe('Musketeer odd-damage Reflect through the actual cast entry', () => {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    it(side + ' M=11 direct 13 damage reflects floor(13/2)=6', () => {
      const f = setup(side); f.enemies[2].statuses = [{ id: 'reflect', turns: 3 }]; f.caster.armor = 5;
      const ev = f.cast();
      expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[12, 13], [0, 6]]);
      expect(f.caster.hp).toBe(999); expect(f.caster.armor).toBe(0); expect(f.caster.mana).toBe(0);
      expect(f.state.activePlayer).not.toBe(side);
    });
    it(side + ' cancelling a RNG-using chooser restores RNG and the entire state', () => {
      const f = setup(side); const rng = f.ctx.rng.getState(); const before = JSON.stringify(f.state);
      f.engine.setTargetChooser({ choose: (_mode, _state, _caster, random) => { random.next(); return null; } });
      expect(f.cast()).toEqual([]); expect(f.ctx.rng.getState()).toBe(rng); expect(JSON.stringify(f.state)).toBe(before);
    });
  }
});


describe('Musketeer 6004 reflected hit into caster Barrier at the actual battle entry', () => {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    it(side + ' original spell damages enemy; reflected damage consumes caster Barrier instead of killing caster', () => {
      const f = setup(side); const victim = f.enemies[2]; f.caster.hp = 1; f.caster.armor = 0;
      f.caster.statuses = [{ id: 'barrier', turns: 3 }, { id: 'reflect', turns: 3 }];
      victim.statuses = [{ id: 'reflect', turns: 3 }];
      const ev = f.cast();
      expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[12, 13]]);
      expect(ev.filter(e => e.type === 'status-expire').map(e => [e.targetId, e.statusId])).toEqual([[0, 'barrier'], [12, 'reflect']]);
      expect(f.caster.hp).toBe(1); expect(f.caster.defeated).toBe(false); expect(f.caster.mana).toBe(0);
      expect(f.state.activePlayer).not.toBe(side);
    });
  }
});
