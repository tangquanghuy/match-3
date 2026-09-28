// sa-R6 lane L2 review round 2: every native Randomize branch is reached over seeds, and branch weights match the
// native Randomize groups (A-B-C -> 1/3 each, A+(B-C) -> A always + 1/2 each, ...).
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, reviewBoard, withCells, type CastOpts } from '../helpers/gowCast';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { specialGem } from '@engine/types';
import { setGoldForSide } from '@engine/battleGold';

const SEEDS = 300;
/** Spell-phase effect line (before the first cascade) per seed, tallied. */
function tally(o: CastOpts, n = SEEDS, norm = false): Map<string, number> {
  const m = new Map<string, number>();
  for (let seed = 1; seed <= n; seed++) {
    const s = castSpell({ ...o, seed }).summary; const i = s.order.indexOf('~cascade~');
    let line = (i < 0 ? s.order : s.order.slice(0, i)).join(' ; ') || '(none)';
    if (norm) line = line.replace(/convert [^;]*? -> /g, 'convert * -> ') + (s.extraTurn === 'skill' && !line.includes('extra-turn') ? ' ; extra-turn skill' : '');
    m.set(line, (m.get(line) ?? 0) + 1);
  }
  return m;
}
/** Branch -> expected share; every observed line must be listed and each share within +-40% of expected. */
type Row = { key: string; opts?: Omit<CastOpts, 'key'>; branches: Record<string, number>; norm?: boolean };
function checkRow({ key, opts, branches, norm }: Row) {
  const t = tally({ key, ...opts }, SEEDS, norm);
  expect([...t.keys()].sort()).toEqual(Object.keys(branches).sort());
  for (const [line, share] of Object.entries(branches)) {
    const got = (t.get(line) ?? 0) / SEEDS;
    expect(got, `${key} ${line}`).toBeGreaterThan(share * 0.6);
    expect(got, `${key} ${line}`).toBeLessThan(share * 1.4);
  }
}

describe('L2 R2 batch 01 (requeued lapsed signoffs)', () => {
  it.each<Row>([
    // 7348 Randomize A-B: StealMana (all, Amount 100) | StealLife [M+2]
    { key: 'troop:6206', branches: { 'dmg E11 12 ; buff C hp+12 max+12': 1 / 2, 'buff E11 mana-8 ; buff C mana+7': 1 / 2 } },
    // 8250 A-B-C: DecreaseMana 100% | StealAttack [M+1] | Silence
    { key: 'troop:6845', branches: { 'buff E11 mana-8': 1 / 3, 'buff E11 attack-11 ; buff C attack+11': 1 / 3, 'status E11 +silence': 1 / 3 } },
    // 8407 AB-CD: [M+3] + 15% self-kill | [M+3] x3 if I have a Mech (caster is a Mech) + 15% self-kill
    { key: 'troop:6929', branches: { 'dmg E11 13': 0.5 * 0.85, 'dmg E11 39': 0.5 * 0.85, 'dmg E11 13 ; dmg C 900 ; defeat C': 0.5 * 0.15, 'dmg E11 39 ; dmg C 900 ; defeat C': 0.5 * 0.15 } },
    // 8472 AB-CD: TrueDamage [M+1] + Burn | DestroyColor Bomb (none on the review board)
    { key: 'troop:6969', branches: { 'dmg E11 11 ; status E11 +burning': 1 / 2, '(none)': 1 / 2 } },
    // 8941 AB-CD-EF: each branch counts Web [x2]: -4 Magic | -4 Mana | steal [M+1] Life
    { key: 'troop:7329', branches: { 'buff E11 magic-4': 1 / 3, 'buff E11 mana-4': 1 / 3, 'dmg E11 11 ; buff C hp+11 max+11': 1 / 3 } },
    { key: 'troop:7329', opts: { board: withCells(reviewBoard, { '3,3': specialGem('web'), '5,1': specialGem('web') }) },
      branches: { 'buff E11 magic-8': 1 / 3, 'buff E11 mana-8': 1 / 3, 'dmg E11 15 ; buff C hp+15 max+15': 1 / 3 } },
    // 7194 AB-CD: both branches remove all Armor first, then Poison | [M+2]
    { key: 'weapon:1081', branches: { 'buff E11 armor-10 ; status E11 +poison': 1 / 2, 'buff E11 armor-10 ; dmg E11 12': 1 / 2 } },
  ])('$key branches and weights', checkRow);

  it.each<Row>([
    // 7787 A+(B-C-D-E-F): chosen colour -> Blue (default chosen Blue: no-op convert), then one of 5 storms (no Brown)
    { key: 'troop:6583', branches: Object.fromEntries(['Blue', 'Green', 'Red', 'Yellow', 'Purple'].map(c => [`convert Blue x11 -> Blue x11 ; storm ${c} set`, 1 / 5])) },
    // 7987 steal min(target Armor, [M+1]) Armor, give that much of a random Skill (R007: Attack/Armor/Life/Magic) to the first ally (caster)
    { key: 'troop:6652', branches: Object.fromEntries(['hp+10 max+10', 'attack+10', 'armor+10', 'magic+10'].map(s => [`buff E11 armor-10 ; buff C ${s}`, 1 / 4])) },
    { key: 'troop:6652', opts: { enemies: [{}, { hp: 900, maxHp: 900, armor: 30 }] },
      branches: Object.fromEntries(['hp+11 max+11', 'attack+11', 'armor+11', 'magic+11'].map(s => [`buff E11 armor-11 ; buff C ${s}`, 1 / 4])) },
    // 7954 [M+4] + 34% of my Armor (R003), then +3 to a random Skill of mine
    { key: 'troop:6630', opts: { caster: { armor: 50 } }, branches: Object.fromEntries(['hp+3 max+3', 'attack+3', 'armor+3', 'magic+3'].map(s => [`dmg E11 31 ; buff C ${s}`, 1 / 4])) },
  ])('$key branches and weights', checkRow);

  // 9211-9216 Doomed weapons: CreateGems count = CountArmyColor AllAllies 200 + AllEnemies 200 (2 per unit, no base)
  const W = [['weapon:1563', 'Blue'], ['weapon:1564', 'Green'], ['weapon:1565', 'Red'], ['weapon:1566', 'Yellow'], ['weapon:1567', 'Purple'], ['weapon:1568', 'Brown']] as const;
  it.each(W)('%s creates 2 %s gems per ally and enemy of that colour', (key, c) => {
    const col = c as never; const other = (c === 'Red' ? 'Blue' : 'Red') as never;
    const created = (o: Omit<CastOpts, 'key'>) => castSpell({ key, ...o }).summary.gems.created[c] ?? 0;
    // caster + 2 allies + 4 enemies of the colour = 7 -> 14 (enemies survive the 15 damage)
    expect(created({ colors: [col], allies: [{ colors: [col] }, { colors: [col] }], enemies: [0, 1, 2, 3].map(() => ({ hp: 500, maxHp: 500, colors: [col] })) })).toBe(14);
    // only the caster -> 2
    expect(created({ colors: [col], allies: [{ colors: [other] }], enemies: [0, 1, 2, 3].map(() => ({ hp: 500, maxHp: 500, colors: [other] })) })).toBe(2);
    // nobody of the colour -> none
    expect(created({ colors: [other], allies: [{ colors: [other] }], enemies: [0, 1, 2, 3].map(() => ({ hp: 500, maxHp: 500, colors: [other] })) })).toBe(0);
  });

  it('troop:6969 bomb branch destroys the Bomb gems on the board', () => {
    const board = withCells(reviewBoard, { '3,3': specialGem('bomb'), '6,1': specialGem('bomb') });
    const lines = [...tally({ key: 'troop:6969', board }, 40).keys()];
    expect(lines.some(l => l.startsWith('dmg E11 11 ; status E11 +burning'))).toBe(true);
    expect(lines.some(l => /^destroy 2 \(bomb x2\)/.test(l))).toBe(true);
  });
});

/** Special gem kinds/tiers on the board after the cast (e.g. 'gargoyleGem/1'). */
function specials(o: CastOpts): string[] {
  const r = castSpell(o); const out: string[] = [];
  r.f.board.forEach(g => { if (g && g.type.kind === 'special') out.push(`${g.type.spec.kind}/${(g.type.spec as { tier?: number }).tier ?? '-'}`); });
  return out.sort();
}
const choose = (o: CastOpts, branch: number) => { const f = setupCast(o); f.engine.setBranchChooser(new FixedBranchChooser(branch)); return summarize(f, f.cast()).order; };

describe('L2 R2 batch 02', () => {
  it.each<Row>([
    // 8172 AB+(CD-EF): [M+4] (+5 per ally/enemy death) to the target, then kill the first ally (caster) OR the first enemy
    { key: 'troop:6782', branches: { 'dmg E11 14 ; dmg E10 605 ; defeat E10': 1 / 2, 'dmg E11 14 ; dmg C 900 ; defeat C': 1 / 2 } },
    // 8218 ABC+(D-E-F): Freeze 2/3 (D, F), Burn 1/3 (E) -- fixed (was 1/2 each)
    { key: 'troop:6814', branches: { 'dmg E11 22 ; status E11 +frozen': 2 / 3, 'dmg E11 22 ; status E11 +burning': 1 / 3 } },
    // 8853 AB+(CD-EF): [M+3] to first enemy OR [M+3] Life to first ally; +9 Blue only with Captain Saltclaw
    { key: 'troop:7258', branches: { 'dmg E10 13': 1 / 2, 'buff C hp+13 max+13': 1 / 2 } },
    // 9514 DecreaseRandom [M+1] + 2 per Wargare ally (caster is one): R007 four-Skill pool, Life directly; Terror
    { key: 'troop:7614', branches: Object.fromEntries(['hp-13', 'attack-13', 'armor-10', 'magic-11'].map(s => [`buff E11 ${s} ; status E11 +terror`, 1 / 4])) },
  ])('$key branches and weights', checkRow);

  it('troop:7209 Good OR Evil Gargoyle (1/2 each), 7% extra turn per Brown gem counted before the creation', () => {
    const tiers = new Map<string, number>();
    for (let seed = 1; seed <= SEEDS; seed++) for (const s of specials({ key: 'troop:7209', seed })) tiers.set(s, (tiers.get(s) ?? 0) + 1);
    expect([...tiers.keys()].sort()).toEqual(['gargoyleGem/1', 'gargoyleGem/2']);
    expect(tiers.get('gargoyleGem/1')! / SEEDS).toBeGreaterThan(0.35);
    expect(tiers.get('gargoyleGem/2')! / SEEDS).toBeGreaterThan(0.35);
    // 15 Brown gems -> 105%: always an extra turn, even if the new gargoyle lands on a Brown gem
    const brown = (r: number, c: number) => (r < 2 || (r === 2 && c < -1) ? { kind: 'color', color: 'Brown' } : null) as never;
    const board = withCells(reviewBoard, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`${Math.floor(i / 8)},${i % 8}`, brown(0, 0)])));
    for (let seed = 1; seed <= 40; seed++) expect(castSpell({ key: 'troop:7209', seed, board }).summary.extraTurn).toBe('skill');
  });

  it('troop:7217 gargoyle on the chosen cell; one Poison on a random enemy per Green gem in the 3x3 (centre counted before it is replaced)', () => {
    const G = { kind: 'color', color: 'Green' } as never; const R = { kind: 'color', color: 'Red' } as never; const P = { kind: 'color', color: 'Purple' } as never;
    const around = (n: number, centre: boolean) => { const cells: Record<string, never> = {};
      const ring = ['2,2', '2,3', '2,4', '3,2', '3,4', '4,2', '4,3', '4,4'];
      // no line of three: ring alternates Red/Purple, Greens only on 2,2 / 2,4 / 4,3
      ring.forEach(k => { const [r, c] = k.split(',').map(Number); cells[k] = (r + c) % 2 ? P : R; });
      ['2,2', '2,4', '4,3'].slice(0, n).forEach(k => { cells[k] = G; }); cells['3,3'] = centre ? G : P; return withCells(reviewBoard, cells); };
    for (const [n, centre, poisons] of [[0, false, 0], [3, false, 3], [3, true, 4], [1, true, 2]] as const) {
      const targets = new Set<string>();
      for (let seed = 1; seed <= 30; seed++) {
        const r = castSpell({ key: 'troop:7217', seed, board: around(n, centre) });
        const ps = r.summary.order.filter(x => x.endsWith('+poison'));
        expect(ps).toHaveLength(poisons);
        ps.forEach(p => targets.add(p.split(' ')[1]));
        const g = r.f.board.get({ row: 3, col: 3 });
        expect(g?.type.kind === 'special' && g.type.spec.kind).toBe('gargoyleGem');
        expect(r.summary.extraTurn).toBe('skill');
      }
      if (poisons >= 3) expect(targets.size).toBeGreaterThan(2); // random pool = all enemies, not one
    }
    const tiers = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) tiers.add(specials({ key: 'troop:7217', seed }).join());
    expect([...tiers].sort()).toEqual(['gargoyleGem/1', 'gargoyleGem/2']);
  });

  it('troop:7292 Choose: [M+3] boosted by the target Attack OR Armor, 34% each (R003)', () => {
    const o = { key: 'troop:7292', enemies: [{}, { hp: 900, maxHp: 900, attack: 50, armor: 20 }] };
    expect(choose(o, 0)).toEqual(['dmg E11 30']); // 13 + floor(50 x 34%)
    expect(choose(o, 1)).toEqual(['dmg E11 19']); // 13 + floor(20 x 34%)
  });

  it('troop:6782 +5 per ally and enemy death', () => {
    const f = setupCast({ key: 'troop:6782', seed: 1 });
    (f.state as { battleDeaths?: Record<string, number> }).battleDeaths = { Left: 2, Right: 1 }; // 2 ally + 1 enemy deaths earlier
    expect(summarize(f, f.cast()).order[0]).toBe('dmg E11 29'); // 14 + 5 x 3
  });

  it('troop:7258 creates 9 Blue gems in both branches only with Captain Saltclaw', () => {
    const lines = [...new Set([...tally({ key: 'troop:7258', allies: [{ name: '盐爪船长' }, {}] }, 40).keys()].map(l => l.replace(/convert [^;]*? -> /, 'convert * -> ')))];
    expect(lines.sort()).toEqual(['buff C hp+13 max+13 ; convert * -> Blue x9', 'dmg E10 13 ; convert * -> Blue x9'].sort());
  });

  it('troop:7507 one Terror on a random enemy per Red ally (caster included), +10 Souls', () => {
    const red = castSpell({ key: 'troop:7507', allies: [{ colors: ['Red'] as never }, { colors: ['Red'] as never }] }).summary;
    expect(red.order.filter(x => x.endsWith('+terror'))).toHaveLength(3);
    const none = castSpell({ key: 'troop:7507', colors: ['Blue'] as never, allies: [{ colors: ['Blue'] as never }] }).summary;
    expect(none.order).toEqual(['souls+10']);
  });

  it('troop:7614 +2 per Wargare ally', () => {
    const lines = [...tally({ key: 'troop:7614', allies: [{ troopTypes: ['Wargare'] }, {}], enemies: [{}, { hp: 900, maxHp: 900, attack: 40 }] }, 60).keys()];
    expect(lines).toContain('buff E11 attack-15 ; status E11 +terror');
  });

  it('weapon:1361 [M+1] Armor always; one Barrier on a random ally per Daemon enemy', () => {
    expect(castSpell({ key: 'weapon:1361' }).summary.order).toEqual(['buff C armor+11']);
    const d = { hp: 500, maxHp: 500, troopTypes: ['Daemon'] };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const o = castSpell({ key: 'weapon:1361', seed, enemies: [d, d, {}, {}] }).summary.order;
      expect(o[0]).toBe('buff C armor+11');
      expect(o.slice(1).every(x => /^status (C|A\d) \+barrier$/.test(x))).toBe(true);
      expect(o.length).toBeGreaterThanOrEqual(2); // 2 barriers, a repeat on the same ally shows one event
      o.slice(1).forEach(x => seen.add(x.split(' ')[1]));
    }
    expect([...seen].sort()).toEqual(['A1', 'A2', 'C']);
  });
});

describe('L2 R2 batch 03', () => {
  const S = { kind: 'skull' } as never;
  const Y = { kind: 'color', color: 'Yellow' } as never;
  it.each<Row>([
    // 8457 AB+(C-D-E-F): [M+4] + 34% of Skulls (5 -> 1), then extra turn (C, E) OR 7 Skulls (D, F): 1/2 each
    { key: 'troop:6957', branches: { 'dmg E11 15 ; convert * -> skull x7': 1 / 2, 'dmg E11 15 ; extra-turn skill': 1 / 2 } },
    // 9849 DecreaseRandom [M+1] + Daemonic Portal gems [1:1] (R007 pool), then 2 portals
    { key: 'troop:7808', branches: Object.fromEntries(['hp-11', 'attack-11', 'armor-10', 'magic-11'].map(s => [`buff E11 ${s} ; convert * -> daemonicPortalGem x2`, 1 / 4])) },
  ])('$key branches and weights', o => checkRow({ ...o, norm: true }));

  it('troop:7342 Choose: random Skill -[M+1] (+34% Angel gems), doubled on Daemons (A) or Undead (B)', () => {
    const d = { hp: 900, maxHp: 900, attack: 60, armor: 60, magic: 60, troopTypes: ['Daemon'] };
    const u = { ...d, troopTypes: ['Undead'] };
    const amount = (o: CastOpts, b: number) => Number(/-(\d+)$/.exec(choose(o, b)[0])![1]);
    expect(amount({ key: 'troop:7342', enemies: [{}, d] }, 0)).toBe(22);
    expect(amount({ key: 'troop:7342', enemies: [{}, d] }, 1)).toBe(11);
    expect(amount({ key: 'troop:7342', enemies: [{}, u] }, 1)).toBe(22);
    const angels = withCells(reviewBoard, { '0,1': specialGem('angelGem'), '0,2': specialGem('angelGem'), '0,3': specialGem('angelGem') });
    expect(amount({ key: 'troop:7342', enemies: [{}, u], board: angels }, 0)).toBe(12); // 11 + floor(3 x 34%)
  });

  it('troop:6287 destroys the chosen row; one Poison on a random enemy per Skull destroyed', () => {
    const board = withCells(reviewBoard, { '3,0': S, '3,5': S });
    const r = castSpell({ key: 'troop:6287', board, cell: { row: 3, col: 2 } });
    expect(r.summary.order[0]).toMatch(/^destroy 8 \(.*skull x2/);
    expect(r.summary.order.filter(x => x.endsWith('+poison'))).toHaveLength(2);
    const other = castSpell({ key: 'troop:6287', board, cell: { row: 5, col: 2 } }).summary.order;
    expect(other.filter(x => x.endsWith('+poison'))).toHaveLength(0);
  });

  it('troop:6313 destroys both diagonals through the chosen cell; one Barrier per Yellow destroyed', () => {
    // corner (0,0): one diagonal of 8 cells; reviewBoard main diagonal alternates Red/Yellow (skulls at 0,0 and 6,6)
    const r = castSpell({ key: 'troop:6313', cell: { row: 0, col: 0 } });
    expect(r.summary.order[0]).toMatch(/^destroy 8 /);
    const yellow = /Yellow x(\d+)/.exec(r.summary.order[0])?.[1] ?? '0';
    expect(r.summary.order.filter(x => x.endsWith('+barrier'))).toHaveLength(Number(yellow));
    const centre = castSpell({ key: 'troop:6313', cell: { row: 1, col: 6 } }).summary.order[0];
    expect(centre).not.toBe(r.summary.order[0]);
  });

  it('troop:6731 chosen row + column; knock back the 1st OR the 2nd enemy (1/2 each), then one hit on the first 2 (+4 per Green destroyed)', () => {
    let back1 = 0, back2 = 0; // full order (the destroyed cross may cascade before the knock-back)
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = castSpell({ key: 'troop:6731', seed }).summary.order.filter(x => x.startsWith('move') || / \(all\)$/.test(x));
      expect(o.filter(x => x.startsWith('move'))).toHaveLength(1);
      expect(o.filter(x => x.startsWith('dmg'))).toHaveLength(2); // exactly one damage step (2 targets)
      if (o[0] === 'move E10 back') back1++; else if (o[0] === 'move E11 back') back2++;
    }
    expect(back1 + back2).toBe(SEEDS);
    expect(back1 / SEEDS).toBeGreaterThan(0.35); expect(back2 / SEEDS).toBeGreaterThan(0.35);
    const r = castSpell({ key: 'troop:6731', seed: 42 });
    expect(r.summary.order[0]).toMatch(/^destroy 15 \(.*Green x2/); // row 3 + col 3 of the review board
    expect(r.summary.order).toContain('dmg E10 22 (all)');
  });

  it('troop:7805 explodes the chosen gem; [M+3] +3 per Yellow destroyed to a random enemy, random status on it', () => {
    const board = withCells(reviewBoard, { '2,2': Y, '2,4': Y, '4,2': Y, '4,4': Y, '3,3': Y });
    const o = castSpell({ key: 'troop:7805', board, cell: { row: 3, col: 3 } }).summary.order;
    expect(o[0]).toBe('explode 9');
    const yellow = 5 + [[2, 3], [3, 2], [3, 4], [4, 3]].filter(([r, c]) => (2 * r + c) % 6 === 3).length;
    const dmg = o.find(x => x.startsWith('dmg E1'))!;
    expect(Number(dmg.split(' ')[2])).toBe(13 + 3 * yellow);
    const tgt = dmg.split(' ')[1];
    expect(o[o.indexOf(dmg) + 1]).toMatch(new RegExp(`^status ${tgt} \\+`));
  });

  it('troop:6405 dispels all enemies, each loses [(M/2)+1] (+25% Blue gems) of its own random Skill, then all Blue explode', () => {
    const o = castSpell({ key: 'troop:6405' }).summary.order;
    expect(o.slice(0, 2)).toEqual(['remove E10 -rage', 'remove E13 -rage']);
    const skills = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = castSpell({ key: 'troop:6405', seed }).summary.order.filter(x => x.startsWith('buff E'));
      expect(s).toHaveLength(4);
      s.forEach(x => skills.add(x.split(' ')[2].replace(/-\d+$/, '')));
    }
    expect([...skills].sort()).toEqual(['armor', 'attack', 'hp', 'magic']);
  });

  it.each([
    ['weapon:1397', 'burning', 'Purple'], ['troop:7411', 'terror', 'Blue'],
  ] as const)('%s destroys the chosen line; one %s per %s gem destroyed', (key, st, color) => {
    const r = castSpell({ key, cell: { row: 3, col: 3 } });
    const n = Number(new RegExp(`${color} x(\\d+)`).exec(r.summary.order[0])?.[1] ?? 0);
    expect(r.summary.order.filter(x => x.endsWith(`+${st}`))).toHaveLength(n);
    if (key === 'troop:7411') expect(r.summary.order.at(-1)).toBe('status C +barrier');
  });
});

const gem = (c: string) => (c === 'Skull' ? { kind: 'skull' } : { kind: 'color', color: c }) as never;
/** 3x3 around (3,3): `n` ring cells + optionally the centre of `colour`, the rest alternating two other colours. */
const around = (colour: string, n: number, centre: boolean) => {
  const [a, b] = ['Red', 'Purple', 'Blue', 'Green'].filter(c => c !== colour);
  const ring = ['2,2', '2,3', '2,4', '3,2', '3,4', '4,2', '4,3', '4,4'];
  const cells: Record<string, never> = {};
  ring.forEach(k => { const [r, c] = k.split(',').map(Number); cells[k] = gem((r + c) % 2 ? a : b); });
  ['2,2', '2,4', '4,3'].slice(0, n).forEach(k => { cells[k] = gem(colour); });
  cells['3,3'] = gem(centre ? colour : a);
  return withCells(reviewBoard, cells);
};
type GolemRow = readonly [key: string, colour: string, status: string, side: 'ally' | 'enemy'];
/** One status per `colour` gem in the chosen 3x3 (centre included), each on a random unit of `side`. */
function checkGolem([key, colour, st, side]: GolemRow) {
  for (const [n, centre, want] of [[0, false, 0], [3, false, 3], [3, true, 4], [1, true, 2]] as const) {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const o = castSpell({ key, seed, board: around(colour, n, centre), cell: { row: 3, col: 3 } }).summary.order;
      expect(o[0]).toBe('explode 9');
      const hits = o.filter(x => x.endsWith(`+${st}`));
      hits.forEach(h => targets.add(h.split(' ')[1]));
      // enemy pool: one event per application; ally pool: a repeat on a unit that already has it may merge
      if (side === 'enemy') expect(hits).toHaveLength(want); else expect(hits.length).toBeLessThanOrEqual(want);
      if (want) expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(h => (side === 'ally' ? /^status (C|A\d) / : /^status E1\d /).test(h))).toBe(true);
    }
    if (want >= 3) expect(targets.size).toBeGreaterThan(2); // random per application over the whole side
  }
}

describe('L2 R2 batch 04 (golems: CountGems Block3x3 -> ExplodeGems SingleGem -> InflictEffectOnRandomTroops)', () => {
  it.each<GolemRow>([
    ['troop:7204', 'Brown', 'barrier', 'ally'], ['troop:7266', 'Yellow', 'silence', 'enemy'], ['troop:6371', 'Purple', 'enraged', 'ally'],
    ['troop:6797', 'Skull', 'reflect', 'ally'], ['troop:6725', 'Purple', 'curse', 'enemy'], ['troop:6972', 'Red', 'burning', 'enemy'],
    ['troop:6284', 'Blue', 'frozen', 'enemy'], ['troop:6653', 'Green', 'entangle', 'enemy'], ['troop:6989', 'Skull', 'barrier', 'ally'],
  ])('%s explodes the chosen 3x3; one %s per %s gem in it (centre included) on a random %s', (...row) => checkGolem(row));

  it('troop:6972 native order: Armor before Life (independent self buffs)', () => {
    const o = castSpell({ key: 'troop:6972' }).summary.order;
    expect(o.slice(-2)).toEqual(['buff C armor+11', 'buff C hp+11 max+11']);
  });
});

describe('L2 R2 batch 05', () => {
  it.each<GolemRow>([['troop:6458', 'Green', 'submerged', 'ally']])('%s explodes the chosen 3x3; one %s per %s gem in it on a random %s', (...row) => checkGolem(row));

  it('troop:7125 extra turn always, then 2 Wish | damage all | heal others | 3 Wish (native AB+(C-D-E-F), 1/4 each)', () => {
    const t = new Map<string, number>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = castSpell({ key: 'troop:7125', seed }).summary;
      expect(s.order[0]).toBe('extra-turn skill');
      const o = s.order.join(' ; ');
      const b = /-> wish x2\b/.test(o) ? 'wish2' : /-> wish x3\b/.test(o) ? 'wish3' : o.includes('(all)') ? 'dmg' : /buff A1 hp\+11/.test(o) ? 'heal' : o;
      t.set(b, (t.get(b) ?? 0) + 1);
    }
    expect([...t.keys()].sort()).toEqual(['dmg', 'heal', 'wish2', 'wish3']);
    for (const n of t.values()) { expect(n / SEEDS).toBeGreaterThan(0.15); expect(n / SEEDS).toBeLessThan(0.35); }
    // Wish gems [x5] on damage and heal
    const board = withCells(reviewBoard, { '3,3': specialGem('wish'), '5,5': specialGem('wish') });
    const lines = [...tally({ key: 'troop:7125', board }, 60).keys()].join('\n');
    expect(lines).toContain('dmg E10 21 (all)');
    expect(lines).toContain('buff A1 hp+21 max+21');
  });

  it('troop:6369 all allies +[M+1] +34% of Brown gems (R003), one random positive status on a random ally', () => {
    // review board: 8 Brown -> floor(8 x 34%) = 2
    expect(castSpell({ key: 'troop:6369' }).summary.order.slice(0, 3)).toEqual(['buff C hp+13 max+13', 'buff A1 hp+13 max+13', 'buff A2 hp+13 max+13']);
    const brown = withCells(reviewBoard, Object.fromEntries(['0,1', '0,3', '0,5', '0,7', '1,0', '1,2', '1,4'].map(k => [k, gem('Brown')])));
    const n = Number(/hp\+(\d+)/.exec(castSpell({ key: 'troop:6369', board: brown }).summary.order[0])![1]) - 11;
    expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(5); // 8..15 Brown -> 2..5, never 3 per gem
    const who = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const st = castSpell({ key: 'troop:6369', seed }).summary.order.filter(x => x.startsWith('status '));
      expect(st).toHaveLength(1);
      who.add(st[0].split(' ')[1]);
    }
    expect([...who].sort()).toEqual(['A1', 'A2', 'C']);
  });

  it('troop:7530 one Barrier on a random ally per Ghost gem on the board, then [M+1] Armor', () => {
    const board = withCells(reviewBoard, { '3,3': specialGem('ghost'), '5,1': specialGem('ghost'), '6,4': specialGem('ghost') });
    const who = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const o = castSpell({ key: 'troop:7530', seed, board }).summary.order;
      expect(o.at(-1)).toBe('buff C armor+11');
      const b = o.filter(x => x.endsWith('+barrier'));
      expect(b.length).toBeGreaterThan(0); expect(b.length).toBeLessThanOrEqual(3);
      b.forEach(x => who.add(x.split(' ')[1]));
    }
    expect([...who].sort()).toEqual(['A1', 'A2', 'C']);
  });

  it('troop:7829 Either [M+4] heavy splash (75%) on a random enemy +3 per Poison gem, OR all Yellow -> Poison gems (1/2 each)', () => {
    let conv = 0; const centres = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = castSpell({ key: 'troop:7829', seed }).summary.order;
      if (o[0] === 'convert Yellow x9 -> poisonGem x9') { conv++; continue; }
      expect(o[0]).toMatch(/^dmg E1\d 14 \(splash\)$/);
      expect(o.slice(1).every(x => / 10 \(splash\)$/.test(x))).toBe(true); // floor(14 x 75%)
      centres.add(o[0].split(' ')[1]);
    }
    expect(conv / SEEDS).toBeGreaterThan(0.35); expect(conv / SEEDS).toBeLessThan(0.65);
    expect(centres.size).toBe(4);
    const board = withCells(reviewBoard, { '3,3': specialGem('poisonGem'), '5,5': specialGem('poisonGem') });
    const lines = [...tally({ key: 'troop:7829', board }, 40).keys()];
    expect(lines.some(l => /^dmg E1\d 20 \(splash\)/.test(l))).toBe(true);
  });

  it('troop:7041 steals [M+2] Life from the target; one Death Mark on a random enemy per Lycanthropy gem', () => {
    const board = withCells(reviewBoard, { '3,3': specialGem('lycanthropyGem'), '5,1': specialGem('lycanthropyGem'), '6,4': specialGem('lycanthropyGem') });
    const who = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const o = castSpell({ key: 'troop:7041', seed, board }).summary.order;
      expect(o.slice(0, 2)).toEqual(['dmg E11 12', 'buff C hp+12 max+12']);
      const d = o.filter(x => x.endsWith('+death-mark'));
      expect(d).toHaveLength(3);
      d.forEach(x => who.add(x.split(' ')[1]));
    }
    expect(who.size).toBe(4);
  });

  it('troop:7288 Choose: [M+4] true damage OR [M+4] splash (50%), both +2 per Blue gem', () => {
    expect(choose({ key: 'troop:7288' }, 0)).toEqual(['dmg E11 36']);
    const s = choose({ key: 'troop:7288' }, 1);
    expect(s[0]).toBe('dmg E11 36 (splash)');
    expect(s.slice(1).sort()).toEqual(['dmg E10 18 (splash)', 'dmg E12 18 (splash)']);
  });
});

describe('L2 R2 batch 06', () => {
  /** Cast with my gold / souls preset. */
  const castEco = (o: CastOpts, eco: { gold?: number; souls?: number }) => {
    const f = setupCast(o);
    if (eco.gold !== undefined) setGoldForSide(f.state, f.side, eco.gold);
    if (eco.souls !== undefined) f.state.economy.souls = eco.souls;
    return summarize(f, f.cast()).order;
  };

  it.each<Row>([
    // 9316 ABC-DEF: [M+3] +50% of my Gold to the last enemy, then extra turn OR +20 Gold
    { key: 'troop:7548', branches: { 'dmg E13 63 ; extra-turn skill': 1 / 2, 'dmg E13 63 ; gold+20': 1 / 2 } },
    // 7460 ABC-DEF: [M+4] + all my Gold (spent) to the target OR [M+4] to all enemies + 80 Gold
    { key: 'troop:6310', branches: { 'dmg E11 114': 1 / 2, 'dmg E10 14 (all) ; dmg E11 14 (all) ; dmg E12 14 (all) ; dmg E13 14 (all) ; gold+80': 1 / 2 } },
    // 8321 AB+(CD-EF): [M+1] Armor (+5 per Burning and per Diseased enemy), then Burn all OR Disease all -- fixed (was always Burn)
    { key: 'weapon:1317', branches: Object.fromEntries(['burning', 'disease'].map(s => [`buff C armor+11 ; ${[10, 11, 12, 13].map(e => `status E${e} +${s}`).join(' ; ')}`, 1 / 2])) },
    // 8549 DecreaseRandom [M+1] on the target: R007 four-Skill pool
    { key: 'troop:7022', branches: Object.fromEntries(['hp-11', 'attack-11', 'armor-10', 'magic-11'].map(s => [`buff E11 ${s} ; destroy 9 (Yellow x9)`, 1 / 4])) },
  ])('$key branches and weights', o => checkRow({ ...o, norm: true }));

  it('troop:7926 Choose: [M+2] + my Life to the last 2 enemies OR Entangle all, heal me to full, extra turn', () => {
    expect(choose({ key: 'troop:7926' }, 0)).toEqual(['dmg E12 912 (all)', 'dmg E13 912 (all)', 'defeat E12', 'defeat E13']);
    const b = choose({ key: 'troop:7926' }, 1);
    expect(b.slice(0, 4)).toEqual(['status E10 +entangle', 'status E11 +entangle', 'status E12 +entangle', 'status E13 +entangle']);
    expect(b).toContain('buff C hp+100');
    expect(b).toContain('extra-turn skill');
  });

  it('troop:6916 steals min(target Magic, [M+1]) Magic; each ally gains it on ONE random Skill (R007) -- fixed (was spread per point)', () => {
    const skills = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const o = castSpell({ key: 'troop:6916', seed }).summary.order;
      expect(o[0]).toBe('buff E11 magic-11');
      const g = o.slice(1);
      expect(g.map(x => x.split(' ')[1])).toEqual(['C', 'A1', 'A2']);
      g.forEach(x => { expect(x).toMatch(/ (hp\+11 max\+11|attack\+11|armor\+11|magic\+11)$/); skills.add(x.split(' ')[2].replace(/[+-].*/, '')); });
    }
    expect([...skills].sort()).toEqual(['armor', 'attack', 'hp', 'magic']);
    const low = castSpell({ key: 'troop:6916', enemies: [{}, { hp: 900, maxHp: 900, magic: 4 }] }).summary.order;
    expect(low[0]).toBe('buff E11 magic-4');
    expect(low.slice(1).every(x => /\+4( max\+4)?$/.test(x))).toBe(true);
  });

  it('troop:7556 one Disease per 10 Gold counted BEFORE the [M+1] Gold gain -- fixed (was after)', () => {
    const n = (gold: number) => castEco({ key: 'troop:7556' }, { gold }).filter(x => x.endsWith('+disease')).length;
    expect(n(100)).toBe(10);
    expect(n(95)).toBe(9); // 95 + 11 = 106 would give 10
    expect(n(9)).toBe(0);
    expect(castEco({ key: 'troop:7556' }, { gold: 100 }).at(-1)).toBe('gold+11');
  });

  it('troop:7022 +50% of my Souls on the random Skill reduction; Yellow gems removed', () => {
    const o = castEco({ key: 'troop:7022' }, { souls: 21 });
    expect(o[0]).toMatch(/^buff E11 (hp|attack|armor|magic)-(21|10)$/); // 11 + floor(21 x 50%); Armor capped at its 10
  });

  it('troop:7850 chosen enemy: -[M+1] random Skill +2 per Cursed and per Webbed enemy, then Curse + Web it -- fixed (was a random enemy)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const o = castSpell({ key: 'troop:7850', seed, target: 12 }).summary.order;
      expect(o[0]).toMatch(/^buff E12 /);
      expect(o.slice(1)).toEqual(['status E12 +curse', 'status E12 +web']);
    }
    const cw = [{ statuses: [{ id: 'curse', turns: 3 }] }, { hp: 900, maxHp: 900, attack: 60, armor: 60, magic: 60, statuses: [{ id: 'web', turns: 3 }, { id: 'curse', turns: 3 }] }, {}, {}] as never;
    expect(castSpell({ key: 'troop:7850', enemies: cw }).summary.order[0]).toMatch(/^buff E11 \w+-17$/); // 11 + 2 x (2 cursed + 1 webbed)
  });

  it('weapon:1317 Armor counts Burning AND Diseased enemies (+5 each)', () => {
    const e = [{ statuses: [{ id: 'burning', turns: 3 }] }, { hp: 900, maxHp: 900, statuses: [{ id: 'disease', turns: 3 }] }, {}, {}] as never;
    expect(castSpell({ key: 'weapon:1317', enemies: e }).summary.order[0]).toBe('buff C armor+21');
  });

  it('troop:6264 15 Yellow/chosen gems; each other ally +[M+2] (+4 per Silenced enemy) on one random Skill', () => {
    const e = [{ statuses: [{ id: 'silence', turns: 3 }] }, {}, {}, {}] as never;
    const o = castSpell({ key: 'troop:6264', enemies: e }).summary.order;
    expect(o[0]).toMatch(/-> Blue x\d+, Yellow x\d+$/);
    expect(o.slice(1).map(x => x.split(' ')[1])).toEqual(['A1', 'A2']);
    expect(o.slice(1).every(x => / (hp\+16 max\+16|attack\+16|armor\+16|magic\+16)$/.test(x))).toBe(true);
  });

  it('troop:7496 two different random enemies (RandomEnemy + RandomPrefNotPrevEnemy); the same one twice if only one is alive (R007-3)', () => {
    const pairs = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const t = castSpell({ key: 'troop:7496', seed }).summary.order.map(x => x.split(' ')[1]);
      expect(t).toHaveLength(2); expect(t[0]).not.toBe(t[1]); pairs.add(t.join());
    }
    expect(pairs.size).toBeGreaterThan(8);
    const solo = [{ hp: 900, maxHp: 900, attack: 50, armor: 50, magic: 50 }, { hp: 0, maxHp: 900, defeated: true }] as never;
    const o = castSpell({ key: 'troop:7496', enemies: solo }).summary.order;
    expect(o.map(x => x.split(' ')[1])).toEqual(['E10', 'E10']);
    const big = [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, attack: 60, armor: 60, magic: 60 }));
    const enraged = castSpell({ key: 'troop:7496', enemies: big, allies: [{ statuses: [{ id: 'enraged', turns: 3 }] }, {}] as never }).summary.order;
    expect(enraged).toHaveLength(2);
    expect(enraged.every(x => /-14$/.test(x))).toBe(true); // 11 + 3 x 1 enraged ally
  });
});
