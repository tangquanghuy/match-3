/**
 * Lane L3 review (sa-F, round 7): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell, entitySkill, setupCast, sixColourBoard, withCells } from '../helpers/gowCast';
import { BaseColor, colorGem } from '@engine/types';
import type { Character } from '@engine/types';
type E = Partial<Character>;
const st = (...ids: string[]) => ids.map(id => ({ id, turns: 3 })) as Character['statuses'];
const en = (extra: E = {}): E => ({ hp: 100, maxHp: 100, armor: 0, mana: 0, colors: [BaseColor.Red], ...extra });
const order = (r: ReturnType<typeof castSpell>) => r.summary.order;

describe('sa-F B01: counted status mana / extra turn', () => {
  it('troop:6454 Hind (7632): 2 Mana per Entangled enemy, counted before the kill; 4 Entangled = 100% extra turn', () => {
    const r = castSpell({ key: 'troop:6454', target: 10, enemies: [en({ hp: 1, maxHp: 1, statuses: st('entangle') }), en({ statuses: st('entangle') }), en()] });
    expect(order(r)[0]).toBe('buff C mana+4');
    expect(order(r)).toContain('defeat E10');
    const all = castSpell({ key: 'troop:6454', enemies: [0, 1, 2, 3].map(() => en({ statuses: st('entangle') })) });
    expect(order(all)[0]).toBe('buff C mana+8');
    expect(all.summary.extraTurn).toBe('skill');
    const none = castSpell({ key: 'troop:6454', enemies: [en(), en()] });
    expect(order(none).filter(o => o.includes('mana') || o.startsWith('extra-turn'))).toEqual([]);
  });
  it('weapon:1211 StoneAegis (7806): 8 Attack and 2 Mana per enemy Barrier, no base', () => {
    const r = castSpell({ key: 'weapon:1211', enemies: [en({ statuses: st('barrier') }), en({ statuses: st('barrier') }), en()] });
    expect(order(r).filter(o => o.includes('attack') || o.includes('mana'))).toEqual([
      'buff C attack+16', 'buff A1 attack+16', 'buff A2 attack+16', 'buff C mana+4', 'buff A1 mana+4', 'buff A2 mana+4']);
  });
  it('troop:6897 ArachnaeanWatcher (8358): Life 1 + Magic + 6 per Webbed enemy; quarter Mana to the other allies only', () => {
    const r = castSpell({ key: 'troop:6897', enemies: [en({ statuses: st('web') }), en({ statuses: st('web') }), en()] });
    expect(order(r)[0]).toBe('buff C hp+23 max+23');
    expect(order(r).filter(o => o.includes('mana')).map(o => o.split(' ')[1])).toEqual(['A1', 'A2']);
  });
  it('troop:7806 SetauriSkulk (9847): a Bleeding target killed by the true damage still counts', () => {
    const r = castSpell({ key: 'troop:7806', target: 10, enemies: [en({ hp: 1, maxHp: 1, statuses: st('bleed') }), en({ statuses: st('bleed') }), en()] });
    expect(order(r)[0]).toBe('buff C mana+4');
    expect(order(r)).toContain('defeat E10');
  });
  it('troop:7074 HelgorTheGuardian (8602): 1-3 Red Mana Potions; 50% extra turn only when an enemy is Burning', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const burning = seeds.map(seed => castSpell({ key: 'troop:7074', seed, enemies: [en({ statuses: st('burning') }), en()] }));
    const extra = burning.filter(r => r.summary.extraTurn === 'skill').length;
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThan(seeds.length);
    for (const r of burning) {
      const potions = order(r).find(o => o.includes('manaPotionGem/Red'));
      expect(potions).toMatch(/-> manaPotionGem\/Red x[123]$/);
    }
    const cold = seeds.map(seed => castSpell({ key: 'troop:7074', seed, enemies: [en(), en()] }));
    expect(cold.every(r => r.summary.extraTurn === null)).toBe(true);
  });
});

describe('sa-F B02: create gems + extra turn / mana', () => {
  // sixColourBoard has 10 Purple; three extra isolated Purple make exactly 13. (3,3) is Yellow, (0,4) is Purple.
  const purple13 = withCells(sixColourBoard, { '0,0': colorGem(BaseColor.Purple), '7,7': colorGem(BaseColor.Purple), '4,0': colorGem(BaseColor.Purple) });
  it('troop:6111 Aziris (7181): only the selected gem becomes a Skull; 6 Mana at 13+ Purple, counted after the transform (native step 1)', () => {
    const r = castSpell({ key: 'troop:6111', board: purple13 });
    expect(order(r)[0]).toBe('convert Yellow x1 -> skull x1');
    expect(order(r)[1]).toBe('buff C mana+6');
    const few = castSpell({ key: 'troop:6111', board: sixColourBoard });
    expect(order(few).filter(o => o.includes('mana'))).toEqual([]);
    const selPurple = castSpell({ key: 'troop:6111', board: purple13, cell: { row: 0, col: 4 } });
    expect(order(selPurple)[0]).toBe('convert Purple x1 -> skull x1');
    expect(order(selPurple).filter(o => o.includes('mana'))).toEqual([]);
  });
  it('troop:6863 QueenBeetrix (8282): extra turn and half Mana are independent 40% rolls', () => {
    const half = Math.floor(entitySkill('troop:6863').cost / 2);
    const runs = Array.from({ length: 40 }, (_, i) => castSpell({ key: 'troop:6863', seed: i + 1 }));
    const mana = (x: ReturnType<typeof castSpell>) => order(x).includes(`buff C mana+${half}`);
    const extra = (x: ReturnType<typeof castSpell>) => x.summary.extraTurn === 'skill';
    expect(runs.some(x => extra(x) && !mana(x))).toBe(true);
    expect(runs.some(x => !extra(x) && mana(x))).toBe(true);
    expect(runs.some(x => !extra(x) && !mana(x))).toBe(true);
    for (const x of runs) expect(order(x).filter(o => o.startsWith('dmg')).reduce((s, o) => s + Number(o.split(' ')[2]), 0)).toBe(26);
  });
  it('troop:6190 Tassarion (7331): one cast only (native DisableMySpell@Self)', () => {
    const f = setupCast({ key: 'troop:6190' });
    expect(f.cast().length).toBeGreaterThan(0);
    f.state.activePlayer = f.side; f.caster.mana = f.caster.manaCost;
    expect(f.cast()).toEqual([]);
  });
  it('troop:7714 DesertOx (9675) / troop:7774 CountGobula (9780): the mix totals 10 / 14 gems', () => {
    for (const [key, n] of [['troop:7714', 10], ['troop:7774', 14]] as const) {
      for (const seed of [1, 2, 3]) {
        const c = castSpell({ key, seed }).summary.gems.created;
        expect(Object.values(c).reduce((s, v) => s + v, 0)).toBe(n);
      }
    }
  });
});

describe('sa-F B03: statuses / mana drain / storm mana', () => {
  it('troop:6278 SirSnothelm (7424): Entangle then Web (native order), extra turn', () => {
    const r = castSpell({ key: 'troop:6278' });
    expect(order(r)).toEqual(['dmg E11 13', 'status E11 +entangle', 'status E11 +web', 'extra-turn skill']);
  });
  it('troop:6867 Solari (8289): Curse + Death Mark only on an Undead target, quarter Mana to the other allies last', () => {
    const undead = castSpell({ key: 'troop:6867', target: 10, enemies: [en({ troopTypes: ['Undead'] }), en()] });
    expect(order(undead).slice(0, 3)).toEqual(['dmg E10 13', 'status E10 +curse', 'status E10 +death-mark']);
    expect(order(undead).slice(3).map(o => o.split(' ')[1])).toEqual(['A1', 'A2']);
    const plain = castSpell({ key: 'troop:6867', target: 10, enemies: [en(), en()] });
    expect(order(plain).filter(o => o.startsWith('status'))).toEqual([]);
  });
  it('troop:6896 Thaumataur (8356): only Purple enemies; one shared 1-3 roll for the drain', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = castSpell({ key: 'troop:6896', seed, enemies: [en({ mana: 9, colors: [BaseColor.Purple] }), en({ mana: 9 }), en({ mana: 9, colors: [BaseColor.Purple] })] });
      const drains = order(r).filter(o => o.includes('mana'));
      expect(drains.map(o => o.split(' ')[1])).toEqual(['E10', 'E12']);
      expect(new Set(drains.map(o => o.split(' ')[2])).size).toBe(1);
      expect(drains[0]).toMatch(/mana-[123]$/);
    }
  });
  it('troop:6834 Finesse (8239): second hit prefers another enemy; Yellow target doubled; 6 Mana to other allies only with a Storm', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const r = castSpell({ key: 'troop:6834', seed, target: 10, enemies: [en({ hp: 500, maxHp: 500, colors: [BaseColor.Yellow] }), en({ hp: 500, maxHp: 500 })] });
      expect(order(r).filter(o => o.startsWith('dmg'))).toEqual(['dmg E10 26', 'dmg E11 13']);
    }
    const f = setupCast({ key: 'troop:6834' });
    f.state.teams.Right.storm = { color: BaseColor.Red, turns: 3, troopId: 0 };
    const ev = f.cast();
    const buffs = ev.filter(e => e.type === 'buff' && e.stat === 'mana') as Array<{ targetId: number; amount: number }>;
    expect(buffs.map(b => [b.targetId, b.amount])).toEqual([[1, 6], [2, 6]]);
    expect(order(castSpell({ key: 'troop:6834' })).filter(o => o.includes('mana'))).toEqual([]);
  });
});

describe('sa-F B04: mana drain / random second hit / self-sacrifice', () => {
  it('troop:7291 SableSpiritbane (8865): drains 5 Mana (not Magic)', () => {
    const r = castSpell({ key: 'troop:7291', target: 10, enemies: [en({ mana: 9, magic: 4 }), en()] });
    expect(order(r)).toEqual(['dmg E10 14', 'buff E10 mana-5']);
  });
  it('troop:6804 Gravitas (8207): drain all Mana then Curse only for Undead or Daemon', () => {
    for (const race of ['Undead', 'Daemon']) {
      const r = castSpell({ key: 'troop:6804', target: 10, enemies: [en({ mana: 7, troopTypes: [race] }), en()] });
      expect(order(r)).toEqual(['dmg E10 13', 'buff E10 mana-7', 'status E10 +curse']);
    }
    const plain = castSpell({ key: 'troop:6804', target: 10, enemies: [en({ mana: 7, troopTypes: ['Human'] }), en()] });
    expect(order(plain)).toEqual(['dmg E10 13']);
  });
  it('troop:6128 Hobgoblin (7229): second hit is another enemy while one is alive', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const r = castSpell({ key: 'troop:6128', seed, target: 10, enemies: [en(), en()] });
      expect(order(r).filter(o => o.startsWith('dmg'))).toEqual(['dmg E10 13', 'dmg E11 13']);
    }
  });
  it('troop:6214 DwarvenSlayer (7356): dies even behind a Barrier (native two Damage@Self 10000)', () => {
    const r = castSpell({ key: 'troop:6214', caster: { statuses: st('barrier') } });
    expect(order(r)).toContain('defeat C');
  });
});

describe('sa-F B05: kill-conditional extra turn', () => {
  it('troop:6477 SisterOfShadows (7664): extra turn when either of the 2 weakest dies, none otherwise', () => {
    const second = castSpell({ key: 'troop:6477', enemies: [en({ hp: 5, maxHp: 5 }), en({ hp: 1, maxHp: 1 }), en({ hp: 500, maxHp: 500 })] });
    expect(order(second).filter(o => o.startsWith('dmg')).map(o => o.split(' ')[1])).toEqual(['E11', 'E10']);
    expect(second.summary.extraTurn).toBe('skill');
    const firstOnly = castSpell({ key: 'troop:6477', enemies: [en({ hp: 1, maxHp: 1 }), en({ hp: 50, maxHp: 50 }), en({ hp: 500, maxHp: 500 })] });
    expect(firstOnly.summary.extraTurn).toBe('skill');
    const none = castSpell({ key: 'troop:6477', enemies: [en({ hp: 50, maxHp: 50 }), en({ hp: 60, maxHp: 60 }), en()] });
    expect(none.summary.extraTurn).toBeNull();
  });
});

describe('sa-F B06: independent chance rolls', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  it('troop:6680 Sharptooth (8026): 30% extra turn and 30% 12 Mana are independent', () => {
    const runs = seeds.map(seed => castSpell({ key: 'troop:6680', seed }));
    const mana = (x: ReturnType<typeof castSpell>) => order(x).includes('buff C mana+12');
    const extra = (x: ReturnType<typeof castSpell>) => x.summary.extraTurn === 'skill';
    expect(runs.some(x => extra(x) && !mana(x))).toBe(true);
    expect(runs.some(x => !extra(x) && mana(x))).toBe(true);
    expect(runs.some(x => !extra(x) && !mana(x))).toBe(true);
  });
  it('troop:7017 Huanglong (8548): five independent 50% rolls (Attack, extra turn, Barrier, Enchanted, Blessed)', () => {
    const runs = seeds.map(seed => castSpell({ key: 'troop:7017', seed }));
    const sig = (x: ReturnType<typeof castSpell>) => [order(x).includes('buff C attack+11'), x.summary.extraTurn === 'skill',
      ...['barrier', 'enchanted', 'blessed'].map(s => order(x).includes(`status C +${s}`))].map(Number).join('');
    expect(new Set(runs.map(sig)).size).toBeGreaterThan(8);
  });
  it('troop:6761 CatBurglar (8143): 20 Gold + extra turn when either of the last 2 dies', () => {
    const r = castSpell({ key: 'troop:6761', enemies: [en(), en({ hp: 1, maxHp: 1 }), en({ hp: 500, maxHp: 500 })] });
    expect(r.summary.economy.gold).toBe(20);
    expect(r.summary.extraTurn).toBe('skill');
    const none = castSpell({ key: 'troop:6761', enemies: [en(), en(), en()] });
    expect(none.summary.extraTurn).toBeNull();
    expect(none.summary.economy.gold).toBeUndefined();
  });
});
