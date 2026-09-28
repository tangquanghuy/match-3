// sa-R2 lane review round 1 (lane L4b + R009 giant/dragon items from L3): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, type BoardFn } from '../helpers/gowCast';

const colorGem = (color: BaseColor) => ({ kind: 'color', color }) as never;
const OTHERS = [BaseColor.Red, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
/** No-match board with exactly `n` = 30 gems of `hot` (rows 0-4 on (r+c)%3 != 0, plus row 5 cols 0/2/5). */
const hotBoard = (hot: BaseColor): BoardFn => {
  const others = OTHERS.includes(hot) ? [...OTHERS.filter(c => c !== hot), BaseColor.Blue] : OTHERS;
  return (r, c) => (r < 5 && (r + c) % 3 !== 0) || (r === 5 && [0, 2, 5].includes(c)) ? colorGem(hot) : colorGem(others[(2 * r + c) % 5]);
};
const countHot = (b: BoardFn, hot: BaseColor) => {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((b(r, c) as unknown as { color: BaseColor }).color === hot) n++;
  return n;
};

// R009: ConvertGems 5 <C> > Giant<C> / Dragon<C>. CountGems (step 0) precedes the conversion, so both the damage boost
// (giants, [x2]) and the extra-turn chance boost ([x2] giants, [x3] dragons) use the pre-conversion count.
const GIANTS = [['troop:7245', BaseColor.Blue], ['troop:7246', BaseColor.Green], ['troop:7247', BaseColor.Red],
  ['troop:7248', BaseColor.Yellow], ['troop:7249', BaseColor.Purple], ['troop:7250', BaseColor.Brown]] as const;
const DRAGONS = [['troop:7440', BaseColor.Blue], ['troop:7441', BaseColor.Green], ['troop:7442', BaseColor.Red],
  ['troop:7443', BaseColor.Yellow], ['troop:7444', BaseColor.Purple], ['troop:7445', BaseColor.Brown]] as const;

describe('R009 giant gem dragons (spells 8844-8849)', () => {
  it('fixture board has 30 hot gems', () => { for (const [, c] of GIANTS) expect(countHot(hotBoard(c), c)).toBe(30); });
  for (const [key, color] of GIANTS) it(`${key}: 5 ${color} -> giantGem/${color}, damage 15+6+2x30`, () => {
    const r = castSpell({ key, board: hotBoard(color) });
    expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 81 (all)`));
    expect(r.summary.order).toContain(`convert ${color} x5 -> giantGem/${color} x5`);
    // extra-turn roll precedes the conversion (same segment order as the dragon rows below, which prove it at 100%)
    expect(r.summary.order.at(-1)).toMatch(/^convert /);
  });
});

describe('R009 dragon gem dragons (spells 9132-9137)', () => {
  for (const [key, color] of DRAGONS) it(`${key}: 5 ${color} -> dragonGem/${color}; 30 ${color} -> 10% + 3x30 = 100% extra turn`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = castSpell({ key, board: hotBoard(color), seed });
      expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 31 (all)`));
      expect(r.summary.order).toContain(`convert ${color} x5 -> dragonGem/${color} x5`);
      expect(r.summary.order).toContain('extra-turn skill');
    }
  });
});

describe('L4b B01', () => {
  // weapon:1625 / 1674: ConvertGems 100 FromTarget>Decay|Bleed converts only the chosen colour, not the whole board
  for (const [key, kind] of [['weapon:1625', 'decayGem'], ['weapon:1674', 'bleedGem']] as const) it(`${key}: chosen Red -> only Red gems become ${kind}`, () => {
    const r = castSpell({ key, color: BaseColor.Red });
    expect(r.summary.order[0]).toBe(`convert Red x9 -> ${kind} x9`);
  });
  it('weapon:1674: Burn + Bleed only enemies of the chosen colour (Red -> E10)', () => {
    const r = castSpell({ key: 'weapon:1674', color: BaseColor.Red });
    expect(r.summary.order.slice(1, 3)).toEqual(['status E10 +burning', 'status E10 +bleed']);
  });
  // troop:6842: CauseWeb@WeakestEnemy ; CausePoison@FromPrevious -> same enemy even when all are tied
  it('troop:6842: tied weakest -> Poison follows the Web target', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = castSpell({ key: 'troop:6842', seed, enemies: [0, 1, 2, 3].map(() => ({ hp: 100, maxHp: 100, armor: 0 })) });
      const st = r.summary.order.filter(x => x.startsWith('status'));
      expect(st[1].split(' ')[1]).toBe(st[0].split(' ')[1]);
    }
  });
  // troop:6399: ConvertGems 100 Blue>FromTarget
  it('troop:6399: chosen Red -> all Blue become Red; random ally gets Enchanted + 3 Magic', () => {
    const r = castSpell({ key: 'troop:6399', color: BaseColor.Red });
    expect(r.summary.order[0]).toBe('convert Blue x11 -> Red x11');
    const [s, b] = r.summary.order.slice(1, 3);
    expect(b).toBe(`buff ${s.split(' ')[1]} magic+3`);
  });
  // troop:6124 / 6256 / 6824: FromTarget colour
  for (const [key, to] of [['troop:6124', 'Green'], ['troop:6256', 'Brown'], ['troop:6824', 'Brown']] as const) it(`${key}: chosen Red -> Red x9 -> ${to}`, () => {
    expect(castSpell({ key, color: BaseColor.Red }).summary.order[0]).toBe(`convert Red x9 -> ${to} x9`);
  });
});

describe('L4b B03', () => {
  // weapon:1488 / 1487: CountArmyColor@AllEnemies 100 ; CreateGems Giant<C> (count only) ; Damage@EnemyColor ; Cause*@EnemyColor
  const four = (colors: BaseColor[][]) => colors.map(c => ({ hp: 500, maxHp: 500, armor: 0, colors: c }));
  for (const [key, color, status] of [['weapon:1488', BaseColor.Red, 'burning'], ['weapon:1487', BaseColor.Blue, 'frozen']] as const) {
    for (const n of [0, 1, 2, 3]) it(`${key}: ${n} ${color} enemies -> ${n} giant ${color}, each hit for 11 and +${status}`, () => {
      const enemies = four([0, 1, 2, 3].map(i => i < n ? [color] : [BaseColor.Purple]));
      const r = castSpell({ key, enemies });
      const created = r.summary.order.find(x => x.startsWith('convert'));
      if (n === 0) expect(created).toBeUndefined();
      else expect(created).toMatch(new RegExp(`-> giantGem/${color} x${n}$`));
      const ids = [10, 11, 12, 13].slice(0, n).map(i => `E${i}`);
      expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(ids.map(e => `dmg ${e} 11 (all)`));
      expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(ids.map(e => `status ${e} +${status}`));
    });
  }
  // troop:6129: CountArmor@FromTarget 25 ; CountMax 6 ; CreateGems 9 Skull ; DecreaseArmor 25. Count-before-decrease is
  // equivalent to counting the eliminated armor because the cap 6 = floor(25 / 4).
  for (const [arm, skulls, left] of [[0, 9, 0], [3, 9, 0], [12, 12, 0], [25, 15, 0], [40, 15, 15]] as const) it(`troop:6129: target armor ${arm} -> ${skulls} Skulls, armor left ${left}`, () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, armor: i === 1 ? arm : 0 }));
    const r = castSpell({ key: 'troop:6129', enemies });
    expect(r.summary.gems.created.skull).toBe(skulls);
    if (arm > 0) expect(r.summary.order[0]).toBe(`buff E11 armor-${Math.min(arm, 25)}`);
    expect(r.summary.order.at(-1)).toBe('buff C armor+10');
  });
});

describe('L4b B04', () => {
  // weapon:1180-1185 Doomed books: CountArmyColor@AllEnemies 600 -> 6 gems per enemy of the colour; +5 Magic if an enemy is a Doom
  const DOOMED = [['weapon:1180', BaseColor.Blue], ['weapon:1181', BaseColor.Green], ['weapon:1182', BaseColor.Red],
    ['weapon:1183', BaseColor.Yellow], ['weapon:1184', BaseColor.Purple], ['weapon:1185', BaseColor.Brown]] as const;
  for (const [key, color] of DOOMED) it(`${key}: 2 ${color} enemies -> 12 ${color}/Skull gems; Doom enemy -> +8 Magic`, () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, colors: i < 2 ? [color] : [color === BaseColor.Red ? BaseColor.Blue : BaseColor.Red], troopTypes: i === 3 ? ['Doom'] : [] }));
    const r = castSpell({ key, enemies });
    const g = r.summary.gems.created;
    expect((g[color] ?? 0) + (g.skull ?? 0)).toBe(12);
    expect(r.summary.order.filter(x => x.startsWith('buff'))).toEqual(['C', 'A1', 'A2'].map(u => `buff ${u} magic+8`));
  });
  // weapon:1193 / 1501: CountArmyKingdom@AllAllies 600 -> +6 damage and 6 mix gems per kingdom ally
  for (const [key, kingdom, colors] of [['weapon:1193', '圣唐', [BaseColor.Red, BaseColor.Yellow]], ['weapon:1501', '沃尔帕克', [BaseColor.Blue, BaseColor.Green]]] as const) {
    for (const n of [1, 2]) it(`${key}: ${n} ${kingdom} allies -> ${17 + 6 * n} damage, ${6 * n} gems`, () => {
      const allies = [{ kingdom: n >= 1 ? kingdom : 'x' }, { kingdom: n >= 2 ? kingdom : 'x' }];
      const r = castSpell({ key, allies });
      expect(r.summary.order[0]).toBe(`dmg E11 ${17 + 6 * n}`);
      const g = r.summary.gems.created;
      expect((g[colors[0]] ?? 0) + (g[colors[1]] ?? 0)).toBe(6 * n);
    });
  }
  // weapon:1646: CauseBleed@RandomEnemy + 3 x RandomPrefNotPrevEnemy; +4 Enrage Gems with Immortal Ang'Rak
  it('weapon:1646: two enemies alive -> 4 Bleeds alternating between them', () => {
    const enemies = [{ hp: 500, maxHp: 500 }, { hp: 500, maxHp: 500 }];
    const st = castSpell({ key: 'weapon:1646', enemies }).summary.order.filter(x => x.startsWith('status') && x.includes('bleed')).map(x => x.split(' ')[1]);
    expect(st).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(st[i]).not.toBe(st[i - 1]);
  });
  it("weapon:1646: Immortal Ang'Rak ally -> 13 Enrage Gems", () => {
    const r = castSpell({ key: 'weapon:1646', allies: [{ name: '不朽的安格拉克' }, {}] });
    expect(r.summary.order.filter(x => x.startsWith('convert') && x.includes('enrageGem')).map(x => Number(x.match(/enrageGem x(\d+)/)![1])).reduce((a, b) => a + b, 0)).toBe(13);
  });
  // weapon:1682: Maratus -> Red>Web first; damage 2 + M + 3 per Webbed enemy
  it('weapon:1682: Immortal Maratus + 2 Webbed enemies -> Red to Web, then 18 damage each', () => {
    const web = [{ id: 'web', turns: 99 }] as never;
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, statuses: i < 2 ? web : [] }));
    const r = castSpell({ key: 'weapon:1682', enemies, allies: [{ name: '不朽的马拉图斯' }, {}] });
    expect(r.summary.order[0]).toBe('convert Red x9 -> web x9');
    expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 18 (all)`));
  });
  // troop:7267: Blue > DragonGreen; Krystenax present -> Dragon allies +4 Magic
  it('troop:7267: Blue -> green dragon gems; Krystenax -> Dragon allies +4 Magic', () => {
    const r = castSpell({ key: 'troop:7267', allies: [{ name: '克里斯坦纳斯', troopTypes: ['Dragon'] }, { troopTypes: ['Human'] }] });
    expect(r.summary.order[0]).toBe('convert Blue x11 -> dragonGem/Green x11');
    expect(r.summary.order.filter(x => x.startsWith('buff'))).toEqual(expect.arrayContaining(['buff A1 magic+4']));
    expect(r.summary.order.filter(x => x.startsWith('buff A2'))).toEqual([]);
  });
});
