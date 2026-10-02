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
    const matchGold = r.events.flatMap(e => e.type === 'elimination' && e.cells.length >= 4
      ? [e.cells.length >= 5 ? 5 : 4] : []).reduce((sum, gain) => sum + gain, 0);
    expect(r.summary.economy.gold).toBe(10 + matchGold);
  });

  // weapon:1177 CountMySouls 34 (R003: [3:1] = 34%) -> StealMana all -> Damage [Magic + 1] + floor(souls x 34%).
  it.each([{ souls: 30, dmg: 21 }, { souls: 0, dmg: 11 }, { souls: 3, dmg: 12 }])('weapon:1177 souls $souls -> dmg $dmg', ({ souls, dmg }) => {
    const f = setupCast({ key: 'weapon:1177' });
    f.state.economy.souls = souls;
    const o = summarize(f, f.cast()).order;
    expect(o).toEqual(['buff E11 mana-8', 'buff C mana+8', `dmg E11 ${dmg}`]);
  });

  // troop:6146 native: 13+ Red check (R003) happens first, before the self damage and the gem destruction.
  it.each([{ red: 14, extra: true }, { red: 12, extra: false }])('troop:6146 $red Red gems -> extra turn $extra', ({ red, extra }) => {
    let n = 0;
    const board = (r: number, c: number) => {
      if ((r + c) % 2 === 0 && n < red) { n++; return { kind: 'color', color: BaseColor.Red } as never; }
      return { kind: 'color', color: [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow][(r + 2 * c) % 3] } as never;
    };
    const o = castSpell({ key: 'troop:6146', board }).summary.order;
    if (extra) expect(o.slice(0, 2)).toEqual(['extra-turn skill', 'dmg C 2']);
    else { expect(o[0]).toBe('dmg C 2'); expect(o).not.toContain('extra-turn skill'); }
  });

  // troop:7625 each hit drains the enemy it hit; Poisoned enemies lose double (16).
  it('troop:7625 drain follows the damaged enemy, x2 when Poisoned', () => {
    const poison = [{ id: 'poison', turns: 9 }];
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 900, maxHp: 900, mana: 30, statuses: i % 2 ? poison : [] }));
    const o = castSpell({ key: 'troop:7625', enemies }).summary.order;
    expect(o).toHaveLength(6);
    for (let i = 0; i < 6; i += 2) {
      const id = /^dmg (E1\d) 13$/.exec(o[i])![1];
      const poisoned = Number(id.slice(1)) % 2 === 1;
      expect(o[i + 1]).toBe(`buff ${id} mana-${poisoned ? 16 : 8}`);
    }
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
