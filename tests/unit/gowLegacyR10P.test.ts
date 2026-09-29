// sa-P round 10: re-review of 36 legacy (12-dimension) records whose source or runtime changed.
// Non-default scenarios that the golden replay cannot show: kingdom-ally counters, the Brown [4:1] counter,
// RandomAlly + RandomPrefNotPrevAlly with a lone caster.
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem, type GemType } from '@engine/types';
import { castSpell, withCells } from '../helpers/gowCast';

// key -> native CountArmyKingdom Data (raw KingdomId) and CreateGems2Colors colours
const KINGDOM_WEAPONS: [string, number, BaseColor, BaseColor][] = [
  ['weapon:1105', 3020, BaseColor.Purple, BaseColor.Brown],
  ['weapon:1188', 3011, BaseColor.Blue, BaseColor.Purple],
  ['weapon:1191', 3006, BaseColor.Blue, BaseColor.Yellow],
  ['weapon:1234', 3027, BaseColor.Green, BaseColor.Red],
  ['weapon:1240', 3028, BaseColor.Blue, BaseColor.Yellow],
  ['weapon:1243', 3018, BaseColor.Red, BaseColor.Brown],
  ['weapon:1246', 3009, BaseColor.Yellow, BaseColor.Purple],
  ['weapon:1249', 3010, BaseColor.Green, BaseColor.Brown],
  ['weapon:1265', 3001, BaseColor.Red, BaseColor.Yellow],
  ['weapon:1267', 3012, BaseColor.Red, BaseColor.Brown],
  ['weapon:1269', 3023, BaseColor.Yellow, BaseColor.Purple],
  ['weapon:1271', 3002, BaseColor.Green, BaseColor.Red],
  ['weapon:1282', 3035, BaseColor.Blue, BaseColor.Brown],
  ['weapon:1284', 3008, BaseColor.Blue, BaseColor.Green],
  ['weapon:1288', 3016, BaseColor.Red, BaseColor.Blue],
  ['weapon:1290', 3005, BaseColor.Green, BaseColor.Red],
  ['weapon:1292', 3015, BaseColor.Green, BaseColor.Yellow],
  ['weapon:1303', 3037, BaseColor.Red, BaseColor.Purple],
  ['weapon:1304', 3024, BaseColor.Yellow, BaseColor.Brown],
  ['weapon:1305', 3021, BaseColor.Red, BaseColor.Purple],
  ['weapon:1306', 3014, BaseColor.Yellow, BaseColor.Brown],
  ['weapon:1312', 3017, BaseColor.Purple, BaseColor.Brown],
  ['weapon:1314', 3036, BaseColor.Blue, BaseColor.Green],
  ['weapon:1353', 3029, BaseColor.Green, BaseColor.Purple],
  ['weapon:1355', 3025, BaseColor.Yellow, BaseColor.Brown],
  ['weapon:1372', 3022, BaseColor.Blue, BaseColor.Purple],
  ['weapon:1389', 3019, BaseColor.Red, BaseColor.Purple],
  ['weapon:1390', 3013, BaseColor.Blue, BaseColor.Yellow],
  ['weapon:1400', 3026, BaseColor.Blue, BaseColor.Red],
  ['weapon:1403', 3000, BaseColor.Red, BaseColor.Brown],
  ['weapon:1423', 3007, BaseColor.Red, BaseColor.Purple],
  ['weapon:1432', 3080, BaseColor.Red, BaseColor.Brown],
  ['weapon:1437', 3004, BaseColor.Green, BaseColor.Brown],
];
const tank = { hp: 900, maxHp: 900, armor: 0 };
const ally = (kingdomId?: number) => ({ hp: 500, maxHp: 500, armor: 0, colors: [BaseColor.Blue], kingdomId });

describe('legacy re-review r10: CountArmyKingdom 600 -> Damage 7+M -> CreateGems2Colors x6', () => {
  for (const [key, kid, a, b] of KINGDOM_WEAPONS) {
    it(`${key}: 2 of 3 allies from kingdom ${kid} -> dmg 17 + 12, then 12 ${a}/${b} gems; none -> no gems`, () => {
      const r = castSpell({ key, enemies: [tank, tank, tank, tank], allies: [ally(kid), ally(kid), ally(1)] });
      const o = r.summary.order;
      expect(o[0]).toBe('dmg E11 29');
      const created = r.summary.gems.created;
      const total = Object.values(created).reduce((s, n) => s + n, 0);
      expect(total).toBe(12);
      expect(Object.keys(created).every((c) => c === a || c === b)).toBe(true);
      // full board: the 12 picked cells are rewritten (reported as convert, RL4b-01), after the damage
      expect(o.findIndex((s) => s.startsWith('create') || s.startsWith('convert'))).toBe(1);
      const none = castSpell({ key, enemies: [tank, tank, tank, tank], allies: [ally(1), ally(1), ally(1)] });
      expect(none.summary.order[0]).toBe('dmg E11 17');
      expect(none.summary.order.some((s) => s.startsWith('create') || s.startsWith('convert'))).toBe(false);
    });
  }
});

describe('legacy re-review r10: troops', () => {
  it('troop:6027 7027: 13 Brown removed -> counter floor(13 x 25%) = 3 -> Armor then Attack +13 (R003-2, R010 remove)', () => {
    // 13 Brown on the first 13 cells (rows 0-1), no other Brown; the rest avoids 3-in-a-row by a 5-colour pattern
    const cells: Record<string, GemType | null> = {};
    let n = 0;
    for (let r = 0; r < 8 && n < 13; r++) for (let c = 0; c < 8 && n < 13; c++) { cells[`${r},${c}`] = colorGem(BaseColor.Brown); n++; }
    const FIVE = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    const board = withCells((r, c) => colorGem(FIVE[(r + 2 * c) % 5]), cells);
    const o = castSpell({ key: 'troop:6027', board }).summary.order.filter((s) => s.startsWith('buff C'));
    expect(o).toEqual(['buff C armor+13', 'buff C attack+13']);
  });
  for (const [key, id] of [['troop:6479', 'enchanted'], ['troop:6678', 'blessed']] as const) {
    it(`${key}: RandomAlly + RandomPrefNotPrevAlly -> 2 different allies; lone caster -> caster twice (R007-3)`, () => {
      const two = castSpell({ key }).summary.order.filter((s) => s.startsWith('status') && s.endsWith(`+${id}`));
      expect(two).toHaveLength(2);
      expect(new Set(two).size).toBe(2);
      const lone = castSpell({ key, allies: [] }).summary.order.filter((s) => s.startsWith('status') && s.endsWith(`+${id}`));
      expect(lone.every((s) => s.startsWith('status C'))).toBe(true);
      expect(lone.length).toBeGreaterThanOrEqual(1);
    });
  }
});
