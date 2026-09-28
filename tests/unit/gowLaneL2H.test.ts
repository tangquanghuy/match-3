// sa-H lane L2 (random branches / random statuses) review round 8: seed sweeps for the cases the four
// standard golden scenarios cannot show (per-target rolls, PrefNotPrev with a lone enemy, chances, branch weights).
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, type CastOpts } from '../helpers/gowCast';
import { RANDOM_NEGATIVE_STATUS_POOL, RANDOM_POSITIVE_STATUS_POOL } from '@engine/skills/effects/status';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { BaseColor } from '@engine/types';
const choose = (o: CastOpts, branch: number) => { const f = setupCast(o); f.engine.setBranchChooser(new FixedBranchChooser(branch)); return summarize(f, f.cast()).order; };
const SEEDS = 300;
const orderOf = (o: CastOpts) => { const s = castSpell(o).summary; const i = s.order.indexOf('~cascade~'); return i < 0 ? s.order : s.order.slice(0, i); };
const statusesOn = (order: string[], who: string) => order.filter(l => l.startsWith(`status ${who} +`)).map(l => l.split('+')[1]);
const within = (got: number, share: number, label: string) => { expect(got, label).toBeGreaterThan(share * 0.6); expect(got, label).toBeLessThan(share * 1.4); };
const ONE_ENEMY = [{ hp: 900, maxHp: 900, armor: 0 }];

describe('sa-H L2 B01', () => {
  it('troop:6658 every ally (caster included) gets one positive status', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const o = orderOf({ key: 'troop:6658', seed });
      for (const w of ['C', 'A1', 'A2']) { const s = statusesOn(o, w); expect(s.length).toBe(1); expect(RANDOM_POSITIVE_STATUS_POOL).toContain(s[0]); }
    }
  });
  it('troop:7047 each of the last 2 enemies rolls its own random status, then both are Poisoned', () => {
    let differ = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const o = orderOf({ key: 'troop:7047', seed });
      const a = statusesOn(o, 'E12'), b = statusesOn(o, 'E13');
      expect(a.length).toBe(2); expect(b.length).toBe(2); expect(a[1]).toBe('poison'); expect(b[1]).toBe('poison');
      expect(RANDOM_NEGATIVE_STATUS_POOL).toContain(a[0]); expect(RANDOM_NEGATIVE_STATUS_POOL).toContain(b[0]);
      if (a[0] !== b[0]) differ++;
      expect(statusesOn(o, 'E10').length + statusesOn(o, 'E11').length).toBe(0);
    }
    expect(differ).toBeGreaterThan(70);
    // a lone enemy is both "last 2": one random status + Poison, not two random statuses
    const o = orderOf({ key: 'troop:7047', enemies: ONE_ENEMY });
    expect(statusesOn(o, 'E10').length).toBe(2);
  });
  it('troop:6706 second hit is RandomPrefNotPrev: never the first target while others live; repeats a lone enemy', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const hits = orderOf({ key: 'troop:6706', seed }).filter(l => l.startsWith('dmg ')).map(l => l.split(' ')[1]);
      expect(hits.length).toBe(2); expect(hits[0]).not.toBe(hits[1]);
    }
    const o = orderOf({ key: 'troop:6706', enemies: ONE_ENEMY });
    expect(o.filter(l => l === 'dmg E10 11').length).toBe(2);
    expect(statusesOn(o, 'E10').length).toBe(2);
  });
  it('troop:6159 Treasure Map with 20% chance', () => {
    let maps = 0;
    for (let seed = 1; seed <= SEEDS; seed++) if (castSpell({ key: 'troop:6159', seed }).summary.economy.maps) maps++;
    within(maps / SEEDS, 0.2, 'maps');
  });
  it('troop:6659 ABC-DEF: 1/2 enemy branch, 1/2 ally branch; second status 50%', () => {
    const t = { e1: 0, e2: 0, a1: 0, a2: 0 };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:6659', seed });
      expect(o.filter(l => l.startsWith('dmg ')).length).toBe(4);
      const e = statusesOn(o, 'E11').length, a = statusesOn(o, 'A2').length;
      expect(e === 0 || a === 0).toBe(true);
      if (e === 1) t.e1++; if (e === 2) t.e2++; if (a === 1) t.a1++; if (a === 2) t.a2++;
    }
    for (const [k, v] of Object.entries(t)) within(v / SEEDS, 0.25, `6659 ${k}`);
  });
});

describe('sa-H L2 B02', () => {
  it('troop:6232 1 sure + 4 x 50% random status rolls on the damaged enemy', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let seed = 1; seed <= SEEDS; seed++) {
      // statuses applied = rolls; count status-apply lines, duplicates of the same id still emit a line
      const f = setupCast({ key: 'troop:6232', seed }); const ev = f.cast();
      const n = ev.filter(e => e.type === 'status-apply' && e.targetId === 11).length;
      expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(5); counts[n]++;
    }
    within(counts[1] / SEEDS, 1 / 16, '1'); within(counts[3] / SEEDS, 6 / 16, '3'); within(counts[5] / SEEDS, 1 / 16, '5');
  });
  it('troop:7147 random status on every enemy only when the target dies', () => {
    expect(orderOf({ key: 'troop:7147' }).some(l => l.startsWith('status'))).toBe(false);
    const o = orderOf({ key: 'troop:7147', enemies: [{ hp: 900, maxHp: 900 }, { hp: 1, maxHp: 1, armor: 0 }, { hp: 900, maxHp: 900 }] });
    expect(statusesOn(o, 'E10').length).toBe(1); expect(statusesOn(o, 'E12').length).toBe(1); expect(statusesOn(o, 'E11').length).toBe(0);
  });
  it('troop:7737 Choose: A = -[M+2] Attack + Curse, B = -[M+2] random Skill + Death Mark', () => {
    expect(choose({ key: 'troop:7737' }, 0)).toEqual(['buff E11 attack-12', 'status E11 +curse']);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const o = choose({ key: 'troop:7737', seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 30, attack: 30, magic: 30 }] }, 1);
      expect(o[1]).toBe('status E11 +death-mark'); seen.add(o[0].replace(/-?\d+$/, ''));
      expect(o[0]).toMatch(/-12$/);
    }
    expect([...seen].sort()).toEqual(['buff E11 armor', 'buff E11 attack', 'buff E11 hp', 'buff E11 magic']);
  });
  it('troop:7881 -[M+1] Attack from enemies of the chosen colour, then 1/2 Purple | 1/2 Terror', () => {
    const enemies = [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Red] }, { colors: [BaseColor.Blue, BaseColor.Green] }];
    let terror = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:7881', seed, enemies });
      expect(o.slice(0, 2)).toEqual(['buff E10 attack-11', 'buff E12 attack-11']);
      expect(o[2]).toMatch(/^convert Blue x\d+ -> (Purple|terrorGem) x\d+$/);
      if (o[2].includes('terrorGem')) terror++;
    }
    within(terror / SEEDS, 0.5, 'terror');
  });
  it('troop:6947 -[M+1] Attack then three independent random statuses', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const f = setupCast({ key: 'troop:6947', seed }); const ev = f.cast();
      expect(ev.filter(e => e.type === 'status-apply' && e.targetId === 11).length).toBe(3);
    }
  });
});

describe('sa-H L2 B03', () => {
  it('troop:7186 drains 7 Mana from the chosen enemy, then 1/3 Death Mark | Silence | Curse on all enemies', () => {
    const t: Record<string, number> = {};
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:7186', seed, enemies: [{}, { mana: 20 }, {}] });
      expect(o[0]).toBe('buff E11 mana-7');
      const s = statusesOn(o, 'E10'); expect(s.length).toBe(1); expect(statusesOn(o, 'E12')).toEqual(s);
      t[s[0]] = (t[s[0]] ?? 0) + 1;
    }
    expect(Object.keys(t).sort()).toEqual(['curse', 'death-mark', 'silence']);
    for (const v of Object.values(t)) within(v / SEEDS, 1 / 3, '7186');
  });
  it('weapon:1296 A-B-C 1/3 each; Magic branch = round(Magic x 0.34) + 1 (native SpellPowerMultiplier 0.34)', () => {
    const t = { drain: 0, magic: 0, create: 0 };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'weapon:1296', seed });
      if (o[0]?.includes('mana-5')) t.drain++; else if (o[0]?.includes('magic+')) t.magic++; else if (/-> Purple x12$/.test(o[0] ?? '')) t.create++;
    }
    for (const [k, v] of Object.entries(t)) within(v / SEEDS, 1 / 3, `1296 ${k}`);
    const magicAt = (magic: number) => { for (let seed = 1; ; seed++) { const o = orderOf({ key: 'weapon:1296', seed, magic }); if (o[0]?.includes('magic+')) return o[0]; } };
    expect(magicAt(10)).toBe('buff A1 magic+4');
    expect(magicAt(25)).toBe('buff A1 magic+10'); // 1 + 8.5 -> 9.5 -> 10 (1/3 would give 9)
  });
  it('troop:6198 native order: random Skill loss, Disease, then Poison', () => {
    const o = orderOf({ key: 'troop:6198' });
    expect(o.findIndex(l => l === 'status E10 +disease')).toBeLessThan(o.findIndex(l => l === 'status E10 +poison'));
  });
  it('troop:7605 two independent [0.8M+1] random Skill rolls per enemy (x2 in Geheron), then one random negative status', () => {
    const run = (region?: string) => { const f = setupCast({ key: 'troop:7605', enemies: [{ hp: 900, maxHp: 900, armor: 50, attack: 50, magic: 50 }] });
      if (region) (f.state as { region?: string }).region = region; return summarize(f, f.cast()).order; };
    const plain = run(); expect(plain.filter(l => l.startsWith('buff E10')).map(l => l.replace(/^buff E10 \w+/, ''))).toEqual(['-9', '-9']);
    expect(statusesOn(plain, 'E10').length).toBe(1);
    const geh = run('Geheron'); expect(geh.filter(l => l.startsWith('buff E10')).map(l => l.replace(/^buff E10 \w+/, ''))).toEqual(['-18', '-18']);
  });
  it('troop:6993 repeats are RandomPrefNotPrev (never the immediately previous enemy; may return to the first)', () => {
    let back = 0;
    const enemies = [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, armor: 50, attack: 50, magic: 50 }));
    for (let seed = 1; seed <= 100; seed++) {
      const who = castSpell({ key: 'troop:6993', seed, enemies }).summary.order.filter(l => l.startsWith('buff E')).map(l => l.split(' ')[1]);
      expect(who.length).toBe(3); expect(who[0]).toBe('E11'); expect(who[1]).not.toBe(who[0]); expect(who[2]).not.toBe(who[1]);
      if (who[2] === who[0]) back++;
    }
    expect(back).toBeGreaterThan(15);
    const lone = castSpell({ key: 'troop:6993', enemies: [{ hp: 900, maxHp: 900, armor: 50, attack: 50, magic: 50 }] }).summary.order.filter(l => l.startsWith('buff E10'));
    expect(lone.length).toBe(3);
  });
});

describe('sa-H L2 B04', () => {
  it('troop:7284 Choose: A destroy Purple + first 2, B create 12 Purple + last 2', () => {
    const b = choose({ key: 'troop:7284' }, 1);
    expect(b[0]).toMatch(/-> Purple x12$|^create Purple x12/);
    expect(b.filter(l => l.startsWith('dmg ')).map(l => l.split(' ')[1])).toEqual(['E12', 'E13']);
  });
  it('troop:7281 Choose: column | row', () => {
    const f = (i: number) => { const s = setupCast({ key: 'troop:7281' }); s.engine.setBranchChooser(new FixedBranchChooser(i));
      const ev = s.cast(); const d = ev.find(e => e.type === 'gem-destroy') as { cells: { pos: { row: number; col: number } }[] } | undefined; return d?.cells.map(c => c.pos) ?? []; };
    const col = f(0), row = f(1);
    expect(col.length).toBe(8); expect(new Set(col.map(p => p.col)).size).toBe(1);
    expect(row.length).toBe(8); expect(new Set(row.map(p => p.row)).size).toBe(1);
  });
  it('troop:6959 AB+(C-D-E-F): column + scatter always, then 1/2 extra turn | 1/2 +12 Magic (not Mana)', () => {
    let extra = 0, mag = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = castSpell({ key: 'troop:6959', seed }).summary.order;
      if (o.includes('extra-turn skill')) extra++; if (o.includes('buff C magic+12')) mag++;
      expect(o.some(l => l.startsWith('buff C mana'))).toBe(false);
    }
    within(extra / SEEDS, 0.5, 'extra'); within(mag / SEEDS, 0.5, 'magic'); expect(extra + mag).toBe(SEEDS);
  });
  it('troop:7427 random row, [M+3] to the chosen enemy, 1 + 2 x 50% random statuses', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = setupCast({ key: 'troop:7427', seed }); const ev = f.cast();
      counts[ev.filter(e => e.type === 'status-apply' && e.targetId === 11).length]++;
    }
    expect(counts[0]).toBe(0); within(counts[1] / SEEDS, 0.25, '1'); within(counts[2] / SEEDS, 0.5, '2'); within(counts[3] / SEEDS, 0.25, '3');
  });
  it('troop:6948 ABC-DEF: explode [M+1] Green OR [M+1] Purple (1/2 each), never a mixed pool', () => {
    // Green only on row 0, no Purple on the board: the Purple branch explodes nothing
    const board = (r: number, c: number) => (r === 0 ? { kind: 'color', color: BaseColor.Green } : { kind: 'color', color: (c % 2 ? BaseColor.Red : BaseColor.Blue) }) as never;
    let exploded = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = castSpell({ key: 'troop:6948', seed, board }).summary.order;
      if (o.some(l => l.startsWith('explode'))) exploded++;
      expect(o.filter(l => l.startsWith('status E10'))).toEqual(['status E10 +curse', 'status E10 +web']);
    }
    within(exploded / SEEDS, 0.5, 'green branch');
  });
});

describe('sa-H L2 B05', () => {
  const G = (color: BaseColor) => ({ kind: 'color', color }) as never;
  it('troop:7847 one random colour (1/6 each), then 3 gems of that colour', () => {
    // Red board with 3 Blue gems: Red and Blue branches explode, the other 4 colours find nothing
    const board = (r: number, c: number) => (['1,1', '1,6', '6,3'].includes(`${r},${c}`) ? G(BaseColor.Blue) : G(BaseColor.Red));
    let none = 0;
    for (let seed = 1; seed <= SEEDS; seed++) if (!castSpell({ key: 'troop:7847', seed, board }).summary.order.some(l => l.startsWith('explode'))) none++;
    within(none / SEEDS, 4 / 6, 'no gem of the rolled colour');
  });
  it('troop:6390 AB-CD-EF: 2/3 explode Green, 1/3 random Skill to a random ally (x2 Goblin); extra turn always', () => {
    let explode = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = castSpell({ key: 'troop:6390', seed }).summary.order;
      expect(o).toContain('extra-turn skill');
      if (o[0].startsWith('explode')) explode++;
    }
    within(explode / SEEDS, 2 / 3, 'explode');
    const gob = { troopTypes: ['Goblin'] } as never;
    for (let seed = 1; seed <= 60; seed++) {
      const o = orderOf({ key: 'troop:6390', seed, caster: gob, allies: [gob, gob] });
      if (o[0].startsWith('buff')) expect(o[0]).toMatch(/(attack|armor|magic|hp)\+22/);
    }
  });
  it('troop:7296 Choose: explode [M+1] Purple | Mana Burn the first 2 enemies', () => {
    const b = choose({ key: 'troop:7296' }, 1);
    expect(b.filter(l => l.startsWith('dmg ')).map(l => l.split(' ')[1])).toEqual(['E10', 'E11']);
  });
  it('weapon:1385 ABC-DEF: explode the chosen row OR column (1/2), [M+4] to the first enemy, jumble enemies', () => {
    let rows = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = setupCast({ key: 'weapon:1385', seed }); const ev = f.cast();
      const ex = ev.find(e => e.type === 'gem-explode') as { cells: { pos: { row: number; col: number } }[] };
      const rs = new Set(ex.cells.map(c => c.pos.row)).size, cs = new Set(ex.cells.map(c => c.pos.col)).size;
      if (cs === 8 && rs < 8) rows++; else expect(rs).toBe(8);
      const o = summarize(f, ev).order; expect(o).toContain('shuffle theirs');
    }
    within(rows / SEEDS, 0.5, 'row');
  });
  it('troop:6247 explodes 2 random gems of any kind (skulls included)', () => {
    const skulls = (() => ({ kind: 'skull' })) as never;
    expect(castSpell({ key: 'troop:6247', board: skulls }).summary.order.some(l => l.startsWith('explode'))).toBe(true);
  });
});

describe('sa-H L2 B06', () => {
  const explodedSpan = (key: string, seed: number, cell = { row: 3, col: 3 }) => {
    const f = setupCast({ key, seed, cell }); const ev = f.cast();
    const ex = ev.find(e => e.type === 'gem-explode') as { cells: { pos: { row: number; col: number } }[] };
    return { rows: new Set(ex.cells.map(c => c.pos.row)), cols: new Set(ex.cells.map(c => c.pos.col)), order: summarize(f, ev).order };
  };
  it('troop:6981 AB-CD: explode the CHOSEN row or column (1/2), then last enemy to the front', () => {
    let rows = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = explodedSpan('troop:6981', seed, { row: 0, col: 7 });
      // chosen gem at row 0 / col 7: row branch spans rows 0-1, column branch spans cols 6-7
      if (s.cols.size === 8) { rows++; expect([...s.rows].sort()).toEqual([0, 1]); } else expect([...s.cols].sort()).toEqual([6, 7]);
      expect(s.order).toContain('move E13 front');
    }
    within(rows / SEEDS, 0.5, 'row');
  });
  it('weapon:1418 extra turn + 3 potions of ONE colour (1/5 each of Blue/Green/Red/Yellow/Purple)', () => {
    const t: Record<string, number> = {};
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = castSpell({ key: 'weapon:1418', seed }).summary;
      expect(s.extraTurn).toBe('skill');
      const kinds = Object.keys(s.gems.created); expect(kinds.length).toBe(1); expect(s.gems.created[kinds[0]]).toBe(3);
      t[kinds[0]] = (t[kinds[0]] ?? 0) + 1;
    }
    expect(Object.keys(t).sort()).toEqual(['Blue', 'Green', 'Purple', 'Red', 'Yellow'].map(c => `manaPotionGem/${c}`));
    for (const v of Object.values(t)) within(v / SEEDS, 1 / 5, '1418');
  });
  it('troop:7582 Choose B: other allies gain round(0.75M)+1 to all four Skills', () => {
    const b = choose({ key: 'troop:7582' }, 1);
    expect(b.filter(l => l.startsWith('buff C'))).toEqual([]);
    expect(b.filter(l => l.startsWith('buff A1')).map(l => l.replace(' max+9', ''))).toEqual(['buff A1 attack+9', 'buff A1 armor+9', 'buff A1 hp+9', 'buff A1 magic+9']);
  });
  it('troop:7713 Choose B: 10 gems of the chosen ally colour, then Enchant that ally', () => {
    const b = choose({ key: 'troop:7713' }, 1);
    expect(b[0]).toMatch(/-> Blue x10$|^create Blue x10/); expect(b[1]).toBe('status A1 +enchanted');
  });
  it('troop:7740 AB-CD-EF 1/3 each: heal+Bless allies | [M+7] + Curse enemies | explode Gargoyle gems', () => {
    let heal = 0, dmg = 0, other = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:7740', seed });
      if (o[0]?.startsWith('buff C hp+17')) heal++; else if (o[0] === 'dmg E10 17 (all)') dmg++; else other++;
    }
    within(heal / SEEDS, 1 / 3, 'heal'); within(dmg / SEEDS, 1 / 3, 'dmg'); within(other / SEEDS, 1 / 3, 'gargoyle');
  });
});

describe('sa-H L2 B07', () => {
  it('troop:6157 AB-CD: heal chosen ally, then 6 gems of THAT ally colour | +2 Magic to it', () => {
    let create = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = castSpell({ key: 'troop:6157', seed, colors: [BaseColor.Yellow] }).summary; // caster Yellow, chosen A1 Blue
      expect(s.order[0]).toBe('buff A1 hp+11 max+11');
      if (s.order.includes('buff A1 magic+2')) continue;
      create++; expect(s.gems.created).toEqual({ Blue: 6 });
    }
    within(create / SEEDS, 0.5, 'create');
  });
  it('troop:7283 Choose B: other allies gain floor(manaCost / 2) Mana', () => {
    const b = choose({ key: 'troop:7283', allies: [{ manaCost: 13 }, { manaCost: 16 }] }, 1);
    expect(b).toEqual(['buff A1 mana+6', 'buff A2 mana+8']);
  });
  it('troop:6625 +4 Attack only with 13+ Blue gems; explode chosen row | column 1/2', () => {
    const blue = (() => ({ kind: 'color', color: BaseColor.Blue })) as never;
    expect(orderOf({ key: 'troop:6625' }).some(l => l.startsWith('buff C attack'))).toBe(false);
    expect(orderOf({ key: 'troop:6625', board: blue })).toContain('buff C attack+4');
    let rows = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = setupCast({ key: 'troop:6625', seed, cell: { row: 0, col: 7 } }); const ev = f.cast();
      const ex = ev.find(e => e.type === 'gem-explode') as { cells: { pos: { row: number; col: number } }[] };
      if (new Set(ex.cells.map(c => c.pos.col)).size === 8) rows++;
    }
    within(rows / SEEDS, 0.5, 'row');
  });
});

describe('sa-H L2 B08', () => {
  it('troop:7226 every ally gains [M+1] Life and one positive status each', () => {
    const o = orderOf({ key: 'troop:7226', seed: 3 });
    for (const w of ['C', 'A1', 'A2']) expect(o).toContain(`buff ${w} hp+11 max+11`);
    for (const w of ['C', 'A1', 'A2']) expect(RANDOM_POSITIVE_STATUS_POOL).toContain(statusesOn(o, w)[0]);
  });
  it('weapon:1146 chosen ally: one random Skill +[M+1], Barrier, 3-15 Mana', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'weapon:1146', seed, allies: [{ manaCost: 30 }, {}] });
      expect(o.filter(l => /^buff A1 (hp|attack|armor|magic)\+/.test(l)).length).toBe(1);
      expect(o).toContain('status A1 +barrier');
      const m = Number(o.find(l => l.startsWith('buff A1 mana+'))!.split('+')[1]); expect(m).toBeGreaterThanOrEqual(3); expect(m).toBeLessThanOrEqual(15); seen.add(m);
    }
    expect(seen.has(3) && seen.has(15)).toBe(true);
  });
  it('troop:6817 each of the 3 grants gives the whole [(M/2)+1] to ONE random Skill', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const buffs = castSpell({ key: 'troop:6817', seed }).summary.order.filter(l => /^buff \w+ (hp|attack|armor|magic)\+/.test(l));
      // one line per grant (whole amount to one Skill); a grant can raise the caster's Magic before the next one
      expect(buffs.length).toBe(3); expect(buffs[0]).toMatch(/^buff A1 \w+\+6( max\+6)?$/);
    }
  });
  it('troop:7012 +4 Magic first, then 1/3 Life | damage all (uses boosted Magic) | +10 Magic', () => {
    const t = { life: 0, dmg: 0, mag: 0 };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:7012', seed }); expect(o[0]).toBe('buff C magic+4');
      if (o[1] === 'buff C hp+15 max+15') t.life++; else if (o[1] === 'dmg E10 15 (all)') t.dmg++; else if (o[1] === 'buff C magic+10') t.mag++;
    }
    for (const [k, v] of Object.entries(t)) within(v / SEEDS, 1 / 3, `7012 ${k}`);
  });
  it('troop:7286 Choose B: [M+6] scatter damage', () => {
    const b = choose({ key: 'troop:7286' }, 1);
    expect(b.filter(l => l.includes('(scatter)')).reduce((s, l) => s + Number(l.split(' ')[2]), 0)).toBe(16);
  });
});

describe('sa-H L2 B09', () => {
  it('weapon:1622 2 Faerie Fire + 2 Entangle + 3/3/2 Bleed on distinct random enemies per native step, then the hit', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const o = orderOf({ key: 'weapon:1622', seed });
      const st = o.filter(l => l.startsWith('status '));
      expect(st.length).toBe(12);
      const groups = [st.slice(0, 2), st.slice(2, 4), st.slice(4, 7), st.slice(7, 10), st.slice(10, 12)];
      for (const g of groups) expect(new Set(g.map(l => l.split(' ')[1])).size).toBe(g.length);
      expect(groups.map(g => g[0].split('+')[1])).toEqual(['faerie-fire', 'entangle', 'bleed', 'bleed', 'bleed']);
      expect(o[12]).toMatch(/^dmg E11 \d+$/);
    }
  });
  it('troop:6121 [(M/2)+5]-[M+10] to a random enemy, +12 to one random Skill, 50% extra turn', () => {
    let extra = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = castSpell({ key: 'troop:6121', seed, enemies: [{ hp: 900, maxHp: 900, armor: 0 }] }).summary;
      const d = Number(s.order[0].split(' ')[2]); expect(d).toBeGreaterThanOrEqual(10); expect(d).toBeLessThanOrEqual(20);
      expect(s.order.filter(l => /^buff C \w+\+12/.test(l)).length).toBe(1);
      if (s.extraTurn === 'skill') extra++;
    }
    within(extra / SEEDS, 0.5, 'extra');
  });
  it('weapon:1621 native order: the hit first, then Faerie Fire x2 and Entangle x2 on random enemies', () => {
    const o = orderOf({ key: 'weapon:1621' });
    expect(o[0]).toMatch(/^dmg E11/); expect(o.slice(1).every(l => l.startsWith('status'))).toBe(true);
  });
  it('weapon:1237 1 + 60% + 50% + 50% random negative statuses, then 4 gems of the target colour explode', () => {
    let total = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = setupCast({ key: 'weapon:1237', seed }); const ev = f.cast();
      total += ev.filter(e => e.type === 'status-apply' && e.targetId === 11).length;
    }
    within(total / SEEDS, 2.6, 'mean statuses');
  });
});

describe('sa-H L2 B10', () => {
  it('weapon:1239 [M+8] scatter, then every ally 1 + 50% positive statuses', () => {
    const o = orderOf({ key: 'weapon:1239' });
    expect(o.filter(l => l.includes('(scatter)')).reduce((s, l) => s + Number(l.split(' ')[2]), 0)).toBe(18);
  });
  it('troop:7593 round(1.25M)+6 = 19 scatter (convention:R006-C1), random status on every enemy', () => {
    const o = orderOf({ key: 'troop:7593' });
    expect(o.filter(l => l.includes('(scatter)')).reduce((s, l) => s + Number(l.split(' ')[2]), 0)).toBe(19);
    for (const w of ['E10', 'E11', 'E12', 'E13']) expect(statusesOn(o, w).length).toBe(1);
  });
  it('weapon:1503 Choose B: steal 6 Mana from the last enemy, then [M+3] to it', () => {
    expect(choose({ key: 'weapon:1503' }, 1)).toEqual(['buff E13 mana-6', 'buff C mana+6', 'dmg E13 13']);
  });
  it('troop:7253 AB-CD-EF: steal (10 Magic | 20 Armor | 20 Life) BEFORE the [(M x 2)+4] true damage', () => {
    const t: Record<string, number> = {};
    const enemies = [{}, { hp: 900, maxHp: 900, armor: 30, magic: 20 }];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:7253', seed, enemies });
      const k = o[0].startsWith('buff E11 magic-10') ? 'magic' : o[0].startsWith('buff E11 armor-20') ? 'armor' : o[0].startsWith('dmg E11 20') ? 'life' : 'other';
      t[k] = (t[k] ?? 0) + 1;
      expect(o[o.length - 1]).toBe(k === 'magic' ? 'dmg E11 44' : 'dmg E11 24');
    }
    expect(Object.keys(t).sort()).toEqual(['armor', 'life', 'magic']);
    for (const v of Object.values(t)) within(v / SEEDS, 1 / 3, '7253');
  });
  it('troop:6818 Green storm, then 1/3 Disease | Poison | Entangle on all enemies', () => {
    const t: Record<string, number> = {};
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:6818', seed }); expect(o[0]).toMatch(/^storm Green/);
      const s = statusesOn(o, 'E11'); expect(s.length).toBe(1); t[s[0]] = (t[s[0]] ?? 0) + 1;
    }
    expect(Object.keys(t).sort()).toEqual(['disease', 'entangle', 'poison']);
    for (const v of Object.values(t)) within(v / SEEDS, 1 / 3, '6818');
  });
});

describe('sa-H L2 B11', () => {
  it('troop:6610 Darkstorm, then 1/3 Disease | Freeze | Stun on all enemies', () => {
    const t: Record<string, number> = {};
    for (let seed = 1; seed <= SEEDS; seed++) { const s = statusesOn(orderOf({ key: 'troop:6610', seed }), 'E12'); t[s[0]] = (t[s[0]] ?? 0) + 1; }
    expect(Object.keys(t).sort()).toEqual(['disease', 'frozen', 'stun']);
    for (const v of Object.values(t)) within(v / SEEDS, 1 / 3, '6610');
  });
  it('troop:7794 Choose B: Enchant self, convert one of the chosen enemy colours to Yellow', () => {
    const b = choose({ key: 'troop:7794' }, 1);
    expect(b[0]).toBe('status C +enchanted'); expect(b[1]).toMatch(/^convert (Yellow|Blue) x\d+ -> Yellow x\d+$/);
  });
  it('troop:7298 Choose B: weakest enemy takes [M+1] + 2 per Red gem + 2 per Spirit gem', () => {
    const board = (r: number, c: number) => ({ kind: 'color', color: r === 0 && c < 3 ? BaseColor.Red : BaseColor.Blue }) as never;
    const b = choose({ key: 'troop:7298', board }, 1);
    expect(b[0]).toBe('dmg E12 17'); // E12 weakest (300 + 12); 11 + 3 Red x2
  });
  it('troop:7746 kill -> 1 + 50% + 50% random negative statuses on the other enemies', () => {
    let total = 0;
    const enemies = [{ hp: 900, maxHp: 900 }, { hp: 1, maxHp: 1, armor: 0 }, { hp: 900, maxHp: 900 }];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = setupCast({ key: 'troop:7746', seed, enemies }); const ev = f.cast();
      total += ev.filter(e => e.type === 'status-apply' && e.targetId === 10).length;
    }
    within(total / SEEDS, 2, 'mean');
    expect(orderOf({ key: 'troop:7746' }).some(l => l.startsWith('status'))).toBe(false);
  });
});
