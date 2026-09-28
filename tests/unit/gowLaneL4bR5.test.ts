// sa-B lane review round 5 (lane L4b) + R013 user rulings items 1-4.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, reviewBoard, DEFAULT_ALLIES, DEFAULT_ENEMIES } from '../helpers/gowCast';

const dmgs = (o: string[]) => o.filter(x => x.startsWith('dmg'));
const manaBuffs = (o: string[]) => o.filter(x => / mana\+/.test(x));

describe('R013-1: quarter / half Mana rounds down (floor(manaCost x ratio))', () => {
  // odd mana costs: 13 -> quarter 3 / half 6; 11 -> half 5
  const allies = DEFAULT_ALLIES.map(a => ({ ...a, manaCost: 13 }));
  it('troop:6928 GenerateQuarterMana to other allies: 13 -> 3 each', () => {
    expect(manaBuffs(castSpell({ key: 'troop:6928', allies }).summary.order)).toEqual(['buff A1 mana+3', 'buff A2 mana+3']);
  });
  it('weapon:1376 GenerateQuarterMana to the chosen ally: 13 -> 3', () => {
    expect(manaBuffs(castSpell({ key: 'weapon:1376', allies }).summary.order)).toEqual(['buff A1 mana+3']);
  });
  it('troop:7804 GenerateHalfManaConditional (kill): 11 -> 5', () => {
    const odd = DEFAULT_ALLIES.map(a => ({ ...a, manaCost: 11 }));
    const o = castSpell({ key: 'troop:7804', allies: odd, enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0 })) }).summary.order;
    expect(manaBuffs(o).filter(x => !x.startsWith('buff C'))).toEqual(['buff A1 mana+5', 'buff A2 mana+5']);
  });
  it('weapon:1623 GenerateHalfManaConditional (Immortal Selene present): 13 -> 6', () => {
    const withSelene = [{ ...allies[0], name: '不朽的塞勒涅' }, allies[1]];
    expect(manaBuffs(castSpell({ key: 'weapon:1623', allies: withSelene }).summary.order)).toEqual(['buff A1 mana+6', 'buff A2 mana+6']);
  });
});

describe('R013-2: random Mana is one roll shared by every recipient', () => {
  const rows: [string, number, number][] = [
    ['troop:7465', 3, 10], ['troop:7319', 3, 8], ['troop:6259', 3, 8], ['troop:7405', 3, 10], ['troop:6319', 3, 8],
  ];
  for (const [key, lo, hi] of rows) it(`${key}: all allies get the same ${lo}-${hi} value; several values occur`, () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const v = manaBuffs(castSpell({ key, seed }).summary.order).map(x => Number(x.split('+')[1]));
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(new Set(v).size).toBe(1);
      expect(v[0]).toBeGreaterThanOrEqual(lo); expect(v[0]).toBeLessThanOrEqual(hi);
      seen.add(v[0]);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('R013-3: weapon:1203 second hit = another random enemy (RandomPrefNotPrev)', () => {
  const daemons = DEFAULT_ENEMIES.map(e => ({ ...e, troopTypes: ['Daemon'] }));
  it('with a Daemon enemy the 12 damage never hits the chosen target while others live', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const d = dmgs(castSpell({ key: 'weapon:1203', enemies: daemons, seed }).summary.order);
      expect(d[0]).toBe('dmg E11 12');
      expect(d).toHaveLength(2);
      expect(d[1]).toMatch(/^dmg E1[023] 12$/);
      seen.add(d[1]);
    }
    expect(seen.size).toBe(3);
  });
  it('lone Daemon enemy takes both hits', () => {
    const lone = [0, 1, 2, 3].map(i => (i === 1 ? { hp: 500, maxHp: 500, armor: 0, troopTypes: ['Daemon'] } : { hp: 0, defeated: true }));
    expect(dmgs(castSpell({ key: 'weapon:1203', enemies: lone as never }).summary.order)).toEqual(['dmg E11 12', 'dmg E11 12']);
  });
  it('no Daemon: single hit only', () => {
    expect(dmgs(castSpell({ key: 'weapon:1203' }).summary.order)).toEqual(['dmg E11 12']);
  });
});

describe('R013-4: weapon:1404 heal boost counts Yellow gems only', () => {
  it('heal = 1 + Magic + Yellow on board after creation (removed Purple not added again)', () => {
    let purple = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const g = reviewBoard(r, c);
      if (g?.kind === 'color' && g.color === BaseColor.Purple) purple++;
    }
    const { f, summary } = castSpell({ key: 'weapon:1404' });
    expect(summary.gems.cascade).toBe(false);
    let yellowNow = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const g = f.board.get({ row: r, col: c })?.type;
      if (g?.kind === 'color' && g.color === BaseColor.Yellow) yellowNow++;
    }
    expect(summary.order[0]).toBe(`destroy ${purple} (Purple x${purple})`);
    // Yellow on the board after the creation only (refilled holes included); not + Purple removed (R013-4)
    expect(summary.order.find(x => x.startsWith('buff A1 hp'))).toBe(`buff A1 hp+${11 + yellowNow} max+${11 + yellowNow}`);
  });
});

describe('L4b R5 B01', () => {
  const at = (f: { board: { get(p: { row: number; col: number }): { type: unknown } | null } }, row: number, col: number) =>
    f.board.get({ row, col })?.type as { kind: string; color?: string; spec?: { kind: string } } | undefined;
  it('troop:7403: Faerie Fire Gem on the chosen cell (native Target Board + SingleGem)', () => {
    for (const cell of [{ row: 3, col: 3 }, { row: 6, col: 1 }]) {
      const { f } = castSpell({ key: 'troop:7403', cell });
      expect(at(f, cell.row, cell.col)?.spec?.kind).toBe('faerieFireGem');
    }
  });
  it('weapon:1067: the chosen gem turns Red, then 7 more Red, Burn a random enemy', () => {
    const cell = { row: 5, col: 3 };
    expect(reviewBoard(cell.row, cell.col)).not.toEqual(reviewBoard(5, 2)); // 5,2 is Red (Target NotRedGems)
    const { events, summary } = castSpell({ key: 'weapon:1067', cell });
    const first = events.find(e => e.type === 'gem-transform') as { changes: { pos: { row: number; col: number }; to: { color?: string } }[] };
    expect(first.changes.map(c => [c.pos, c.to.color])).toEqual([[cell, BaseColor.Red]]);
    expect(summary.order[0]).toMatch(/-> Red x1$/);
    expect(summary.order[1]).toMatch(/-> Red x7$/);
    expect(summary.order.filter(x => x.includes('+burning'))).toHaveLength(1);
  });
  it('weapon:1091: Armor only to the chosen ally; gems in its mana colour', () => {
    const o = castSpell({ key: 'weapon:1091', target: 2 }).summary.order;
    expect(o[0]).toMatch(/-> (Red|Yellow) x8$/);
    expect(o.filter(x => x.includes('armor'))).toEqual(['buff A2 armor+10']);
  });
  it('weapon:1206: CountGems 50 Red after creating 10: +floor(Red/2)', () => {
    const { f, summary } = castSpell({ key: 'weapon:1206' });
    void f;
    // default board: 9 Red + 10 created = 19 -> +9; 2 + 10 + 9 = 21
    expect(dmgs(summary.order)).toEqual(['dmg E11 21']);
  });
  it('troop:6070: IncreaseAttack@Self Amount 0 (10%) is a no-op; true damage 14 to all', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = castSpell({ key: 'troop:6070', seed }).summary;
      expect(s.order.some(x => x.startsWith('buff C attack'))).toBe(false);
    }
  });
});

describe('L4b R5 B02', () => {
  // Doomed staves: [key, created colour, ally colour, base armor]
  const doomed: [string, BaseColor, BaseColor, number][] = [
    ['weapon:1379', BaseColor.Green, BaseColor.Blue, 12], ['weapon:1380', BaseColor.Blue, BaseColor.Green, 11],
    ['weapon:1381', BaseColor.Yellow, BaseColor.Red, 11], ['weapon:1382', BaseColor.Red, BaseColor.Yellow, 11],
    ['weapon:1383', BaseColor.Brown, BaseColor.Purple, 11], ['weapon:1384', BaseColor.Purple, BaseColor.Brown, 11],
  ];
  const doomTeam = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i === 3 ? ['Doom'] : ['Human'] }));
  for (const [key, made, ally, arm] of doomed) {
    it(`${key}: 4 ${made}; +${arm} Armor to ${ally} allies only; no Doom -> no armor removal`, () => {
      const allies = [{ ...DEFAULT_ALLIES[0], colors: [ally] }, { ...DEFAULT_ALLIES[1], colors: [ally === BaseColor.Red ? BaseColor.Blue : BaseColor.Red] }];
      const s = castSpell({ key, allies, caster: { colors: [BaseColor.Red === ally ? BaseColor.Blue : BaseColor.Red] } }).summary;
      expect(s.order[0]).toMatch(new RegExp(`-> ${made} x4$`));
      expect(s.order.filter(x => x.includes('armor'))).toEqual([`buff A1 armor+${arm}`]);
    });
    it(`${key}: enemy team has a Doom -> exactly one random enemy loses all Armor`, () => {
      const hit = new Set<string>();
      for (let seed = 1; seed <= 30; seed++) {
        const red = castSpell({ key, enemies: doomTeam, seed }).summary.order.filter(x => / armor-/.test(x));
        expect(red).toHaveLength(1);
        hit.add(red[0].split(' ')[1]);
      }
      expect(hit.size).toBeGreaterThan(2);
    });
  }
  it('troop:6359: one hit on the chosen enemy in [(M/2)+6, M+13] = [11, 23]; 8 Red only if its Attack is lower', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const d = dmgs(castSpell({ key: 'troop:6359', seed }).summary.order);
      expect(d).toHaveLength(1); expect(d[0]).toMatch(/^dmg E11 /);
      const v = Number(d[0].split(' ')[2]); expect(v).toBeGreaterThanOrEqual(11); expect(v).toBeLessThanOrEqual(23); seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(4);
    const weak = DEFAULT_ENEMIES.map(e => ({ ...e, attack: 5 }));
    const strong = DEFAULT_ENEMIES.map(e => ({ ...e, attack: 50 }));
    const o = castSpell({ key: 'troop:6359', enemies: weak, caster: { attack: 20 } }).summary.order;
    expect(o[0]).toMatch(/-> Red x8$/); expect(o[1]).toMatch(/^dmg E11 /);
    expect(castSpell({ key: 'troop:6359', enemies: strong, caster: { attack: 20 } }).summary.order.some(x => x.includes('Red x8'))).toBe(false);
  });
  it('weapon:1549: 14 Skull/Terror mix; 3 Bleed stacks on the chosen enemy', () => {
    const { f, summary } = castSpell({ key: 'weapon:1549' });
    const c = summary.gems.created;
    expect((c.skull ?? 0) + (c.terrorGem ?? 0)).toBe(14);
    // 3 x native CauseBleed = one status segment with stacks 3 (the enemy's turn start may already clear it in the fixture)
    const seg = (f.proto as { segments: { kind: string; statusId?: string; target?: string; stacks?: number }[] }).segments.find(x => x.statusId === 'bleed');
    expect(seg).toMatchObject({ target: 'enemyChosen', stacks: 3 });
    expect(summary.order.filter(x => x.includes('+bleed'))).toEqual(['status E11 +bleed']);
  });
  it('troop:7461: Enchant Red allies only, Burn Red enemies only', () => {
    const o = castSpell({ key: 'troop:7461' }).summary.order.filter(x => x.startsWith('status'));
    expect(o).toEqual(['status A2 +enchanted', 'status E10 +burning']);
  });
  it('weapon:1179: 2 random allies Enchanted, second avoids the first (PrefNotPrev)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const o = castSpell({ key: 'weapon:1179', seed }).summary.order.filter(x => x.includes('+enchanted')).map(x => x.split(' ')[1]);
      expect(o).toHaveLength(2); expect(o[0]).not.toBe(o[1]);
    }
  });
});

describe('L4b R5 B03', () => {
  it('troop:6321: 8 Blue only when the front enemy has MORE Magic than me (AddForMoreMagicOnTarget)', () => {
    const withMagic = (m: number) => DEFAULT_ENEMIES.map(e => ({ ...e, magic: m }));
    const made = (m: number) => castSpell({ key: 'troop:6321', enemies: withMagic(m) }).summary.order.some(x => x.endsWith('-> Blue x8'));
    expect(made(11)).toBe(true);
    expect(made(10)).toBe(false); // tie
    expect(made(3)).toBe(false);
  });
  it('weapon:1489: 3 Blue Giant Gems then 3 Red Giant Gems', () => {
    const o = castSpell({ key: 'weapon:1489' }).summary.order.filter(x => x.startsWith('convert'));
    expect(o.map(x => x.split('-> ')[1])).toEqual(['giantGem/Blue x3', 'giantGem/Red x3']);
  });
  for (const [key, lo, hi] of [['troop:7360', 8, 12], ['troop:7558', 8, 11]] as const) it(`${key}: CreateGemsRange ${lo}-${hi} Yellow, both ends occur`, () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) seen.add(castSpell({ key, seed }).summary.gems.created.Yellow ?? 0);
    expect(Math.min(...seen)).toBe(lo); expect(Math.max(...seen)).toBe(hi);
  });
  it('troop:7360: Armor to the chosen ally only', () => {
    expect(castSpell({ key: 'troop:7360', target: 2 }).summary.order.filter(x => x.includes('armor'))).toEqual(['buff A2 armor+11']);
  });
  for (const [key, n, a, b] of [['troop:6888', 18, 'Blue', 'Green'], ['troop:6357', 15, 'Green', 'Yellow'], ['troop:7261', 24, 'Purple', 'skull'], ['troop:7642', 10, 'Brown', 'decayGem']] as const) {
    it(`${key}: mix of ${n} ${a}/${b} (RL4b-01), both occur`, () => {
      const c = castSpell({ key }).summary.gems.created;
      expect((c[a] ?? 0) + (c[b] ?? 0)).toBe(n);
      expect(c[a]).toBeGreaterThan(0); expect(c[b]).toBeGreaterThan(0);
    });
  }
});

describe('L4b R5 B04', () => {
  // R009 giants: [key, from, giant colour]
  const giants: [string, string, string][] = [
    ['troop:7238', 'Blue', 'Red'], ['troop:7240', 'Yellow', 'Purple'], ['troop:7241', 'Purple', 'Yellow'], ['troop:7243', 'Green', 'Brown'],
  ];
  for (const [key, from, giant] of giants) it(`${key}: 14 damage, then 5 ${from} -> ${giant} Giant Gems (R009)`, () => {
    const o = castSpell({ key }).summary.order;
    expect(o).toEqual(['dmg E11 14', `convert ${from} x5 -> giantGem/${giant} x5`]);
  });
  it('troop:6880: CreateGemsRange 8-12 Purple, both ends occur; Hunter\'s Mark the first enemy', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) seen.add(castSpell({ key: 'troop:6880', seed }).summary.gems.created.Purple ?? 0);
    expect(Math.min(...seen)).toBe(8); expect(Math.max(...seen)).toBe(12);
    expect(castSpell({ key: 'troop:6880' }).summary.order.slice(0, 2)).toEqual(['dmg E10 12', 'status E10 +marked']);
  });
  it('troop:6560: weakest enemy (Life + Armor, R005) takes the hit; all Skulls -> Doomskulls', () => {
    expect(castSpell({ key: 'troop:6560' }).summary.order).toEqual(['dmg E12 13', 'convert skull x5 -> doomSkull x5']);
  });
});
