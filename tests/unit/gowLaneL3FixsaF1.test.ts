// sa-F1 fix round A, lane L3: conditional parts the four standard scenarios cannot show.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize } from '../helpers/gowCast';
import { BaseColor, type Character } from '@engine/types';

const mana = (r: ReturnType<typeof castSpell>, id: number) => r.f.units.find(u => u.id === id)!.mana;

describe('L3 fix sa-F1: colour / race gated mana', () => {
  // troop:6871 GenerateQuarterMana@AllyColor Purple: floor(manaCost / 4) to Purple allies only.
  // Large mana costs so the cascade from the created Purple gems never hits the mana cap.
  it.each([
    { key: 'troop:6871', ally: { colors: [BaseColor.Purple], manaCost: 40 }, gain: 10 },
    { key: 'troop:6871', ally: { colors: [BaseColor.Purple], manaCost: 43 }, gain: 10 },
    { key: 'troop:6871', ally: { colors: [BaseColor.Red], manaCost: 40 }, gain: 0 },
  ])('$key quarter mana ally $ally.colors cost $ally.manaCost -> +$gain', ({ key, ally, gain }) => {
    const r = castSpell({ key, allies: [ally as Partial<Character>] });
    expect(r.summary.order.filter(o => o.startsWith('buff A1 mana'))).toEqual(gain ? [`buff A1 mana+${gain}`] : []);
  });

  // troop:7674 chosen enemy's colour: 4 + floor(gold x 10%) gems (gold 100 -> 14), then +10 gold.
  it.each([
    { target: 11, colours: ['Blue', 'Yellow'] },
    { target: 10, colours: ['Red'] },
  ])('troop:7674 destroys 14 gems of target $target colour', ({ target, colours }) => {
    const plenty = (r: number, c: number) => ({ kind: 'color', color: (r + c) % 2 ? BaseColor.Blue : (r % 2 ? BaseColor.Red : BaseColor.Yellow) }) as never;
    const r = castSpell({ key: 'troop:7674', target, board: plenty });
    const d = r.summary.order.find(o => o.startsWith('destroy'))!;
    expect(d).toMatch(/^destroy 14 \((\w+) x14\)$/);
    expect(colours).toContain(/\((\w+) x14\)/.exec(d)![1]);
    expect(r.summary.economy.gold).toBe(10);
  });

  // weapon:1177 CountMySouls 34 (R003: [3:1] = 34%) -> StealMana all -> Damage [Magic + 1] + floor(souls x 34%).
  it.each([{ souls: 30, dmg: 21 }, { souls: 0, dmg: 11 }, { souls: 3, dmg: 12 }])('weapon:1177 souls $souls -> dmg $dmg', ({ souls, dmg }) => {
    const f = setupCast({ key: 'weapon:1177' });
    f.state.economy.souls = souls;
    const o = summarize(f, f.cast()).order;
    expect(o).toEqual(['buff E11 mana-8', 'buff C mana+8', `dmg E11 ${dmg}`]);
  });

  // troop:7749 GenerateHalfManaConditional AddForTauros: half the chosen ally's mana cost only if it is a Tauros.
  it.each([
    { types: ['Tauros'], gain: 8 },
    { types: ['Human'], gain: 0 },
  ])('troop:7749 half mana for $types', ({ types, gain }) => {
    const r = castSpell({ key: 'troop:7749', allies: [{ troopTypes: types, manaCost: 16 }] });
    expect(mana(r, 1)).toBe(gain);
    expect(r.summary.units.A1).toContain('atk+11');
    expect(r.summary.units.A1).toContain('+barrier');
  });
});
