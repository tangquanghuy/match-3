// sa-B lane review round 3 (lane L4b): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor, specialGem, type GemType, type SpecialGemKind } from '@engine/types';
import { setGoldForSide } from '@engine/battleGold';
import { castSpell, setupCast, summarize, withCells, reviewBoard, type CastFixture } from '../helpers/gowCast';
const setGold = (f: CastFixture, g: number) => setGoldForSide(f.state, f.side, g);
/** review board with `n` copies of a special gem on row 7 (cols 0..n-1). */
const withSpecials = (kind: SpecialGemKind, n: number, tier?: number) => {
  const over: Record<string, GemType> = {};
  for (let c = 0; c < n; c++) over[`7,${c}`] = specialGem(kind, tier);
  return withCells(reviewBoard, over);
};
const dmgs = (o: string[]) => o.filter(x => x.startsWith('dmg'));
const castStorm = (key: string, board = reviewBoard) => {
  const f = setupCast({ key, board });
  f.engine.debugSetStorm(BaseColor.Red, f.side);
  return summarize(f, f.cast()).order;
};

describe('L4b R3 B01: damage boosted by special gems on the board', () => {
  // [key, gem, per gem (x N), base damage at Magic 10, target text]
  const rows: [string, SpecialGemKind, number, number][] = [
    ['troop:7600', 'daemonicPortalGem', 4, 12], ['troop:7635', 'decayGem', 2, 14], ['troop:7780', 'bleedGem', 4, 13],
    ['troop:7509', 'angelGem', 3, 14], ['troop:7538', 'ghost', 8, 13], ['troop:7590', 'angelGem', 6, 13],
    ['troop:7678', 'submergeGem', 2, 14], ['troop:7757', 'enrageGem', 2, 11],
  ];
  for (const [key, gem, per, base] of rows) it(`${key}: 2 ${gem} -> ${base} + ${per} x 2`, () => {
    expect(dmgs(castSpell({ key, board: withSpecials(gem, 2) }).summary.order)[0]).toBe(`dmg E11 ${base + 2 * per}`);
  });
  it('troop:7566: 2 Freeze Gems -> 12 + 4 = 16 to all enemies; Storm doubles -> 24 (12 x 2) on the default board', () => {
    expect(dmgs(castSpell({ key: 'troop:7566', board: withSpecials('freezeGem', 2) }).summary.order))
      .toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 16 (all)`));
    expect(dmgs(castStorm('troop:7566'))).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 24 (all)`));
  });
  it('troop:6869: Storm doubles 26 -> 52', () => {
    expect(dmgs(castStorm('troop:6869'))[0]).toBe('dmg E11 52');
  });
  it('troop:7635: count precedes the conversion (3 Blue -> Decay does not boost the same cast)', () => {
    const o = castSpell({ key: 'troop:7635' }).summary.order;
    expect(o).toEqual(['dmg E11 14', 'convert Blue x3 -> decayGem x3']);
  });
});

describe('L4b R3 B02', () => {
  const boosts: [string, SpecialGemKind, number, string][] = [
    ['troop:7873', 'freezeGem', 2, 'dmg E11 16'], ['weapon:1570', 'angelGem', 2, 'dmg E11 23'],
    ['troop:7568', 'stoneBlock', 2, 'dmg E11 21'], ['troop:7716', 'curseGem', 2, 'dmg E12 19'],
    ['weapon:1713', 'volcanoGem', 2, 'dmg E12 21'],
  ];
  for (const [key, gem, n, line] of boosts) it(`${key}: ${n} ${gem} -> ${line}`, () => {
    expect(dmgs(castSpell({ key, board: withSpecials(gem, n) }).summary.order)[0]).toBe(line);
  });
  it('weapon:1613: 2 Daemonic Portals -> 13 + 6 = 19 to the first two enemies', () => {
    expect(dmgs(castSpell({ key: 'weapon:1613', board: withSpecials('daemonicPortalGem', 2) }).summary.order))
      .toEqual(['dmg E10 19 (all)', 'dmg E11 19 (all)']);
  });
  it('troop:6318 / 7595 / 7848: self buffs boosted by Bomb x3 / Portal x6 / Lycanthropy x8', () => {
    expect(castSpell({ key: 'troop:6318', board: withSpecials('bomb', 2) }).summary.order[0]).toBe('buff C armor+21');
    expect(castSpell({ key: 'troop:7595', board: withSpecials('daemonicPortalGem', 2) }).summary.order[0]).toBe('buff C armor+24');
    expect(castSpell({ key: 'troop:7848', board: withSpecials('lycanthropyGem', 2) }).summary.order[0]).toBe('buff C attack+27');
  });
  it('troop:7568: CreateGemsRange 1 -> 1 or 2 Stone Blocks, both occur', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) seen.add(castSpell({ key: 'troop:7568', seed }).summary.gems.created.stoneBlock ?? 0);
    expect([...seen].sort()).toEqual([1, 2]);
  });
  // Native RandomEnemy + RandomPrefNotPrevEnemy chain (R007-3): a lone enemy takes every hit.
  const lone = [0, 1, 2, 3].map(i => (i === 2 ? { hp: 500, maxHp: 500, armor: 0 } : { hp: 0, defeated: true }));
  for (const [key, hits] of [['troop:7596', 2], ['troop:7716', 2], ['weapon:1713', 3]] as const) it(`${key}: lone enemy takes ${hits} hits`, () => {
    expect(dmgs(castSpell({ key, enemies: lone as never }).summary.order)).toHaveLength(hits);
  });
  it('weapon:1713: PrefNotPrev only avoids the previous target (third hit can repeat the first)', () => {
    let repeat = false;
    for (let seed = 1; seed <= 40 && !repeat; seed++) {
      const t = dmgs(castSpell({ key: 'weapon:1713', seed }).summary.order).map(x => x.split(' ')[1]);
      expect(t[1]).not.toBe(t[0]); expect(t[2]).not.toBe(t[1]);
      repeat = t[2] === t[0];
    }
    expect(repeat).toBe(true);
  });
  it('troop:7596: a kill on the second hit alone still creates 2 Daemonic Portals', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const enemies = [0, 1, 2, 3].map(() => ({ hp: 500, maxHp: 500, armor: 0 }));
      const f = setupCast({ key: 'troop:7596', seed, enemies });
      const s = summarize(f, f.cast());
      const [first, second] = dmgs(s.order).map(x => x.split(' ')[1]);
      expect(first).not.toBe(second);
      expect(s.gems.created.daemonicPortalGem ?? 0).toBe(0);
      // make the second target 1 hp: only it dies
      const g = setupCast({ key: 'troop:7596', seed, enemies: enemies.map((e, i) => (`E${10 + i}` === second ? { ...e, hp: 1 } : e)) });
      const t = summarize(g, g.cast());
      expect(t.order).toContain(`defeat ${second}`);
      expect(t.order).not.toContain(`defeat ${first}`);
      expect(t.gems.created.daemonicPortalGem).toBe(2);
    }
  });
  it('troop:7595: native order Yellow -> Spirit before the 2 Portals are created', () => {
    const o = castSpell({ key: 'troop:7595' }).summary.order;
    expect(o[1]).toMatch(/^convert Yellow x9 -> spiritGem\/Yellow x9$/);
    expect(o[2]).toMatch(/-> daemonicPortalGem x2$/);
  });
});

describe('L4b R3 B03', () => {
  const total = (o: string[]) => dmgs(o).reduce((a, x) => a + Number(x.split(' ')[2]), 0);
  it('troop:6167: weakest ally A1 healed 10 + floor(9 Purple x 34%) = 13; convert-first order is equivalent (count = converted)', () => {
    const o = castSpell({ key: 'troop:6167' }).summary.order;
    expect(o.slice(0, 2)).toEqual(['convert Purple x9 -> Yellow x9', 'buff A1 hp+13 max+13']);
  });
  it('troop:7632: 2 Decaying Gems -> 27 + 20 = 47 scatter total', () => {
    expect(total(castSpell({ key: 'troop:7632', board: withSpecials('decayGem', 2) }).summary.order)).toBe(47);
  });
  it('weapon:1585: boosted by Entangle Gems on the board (2 -> 18 + 16 = 34), not by Entangled enemies', () => {
    expect(total(castSpell({ key: 'weapon:1585', board: withSpecials('entangleGem', 2) }).summary.order)).toBe(34);
    const tangled = [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, armor: 0, statuses: [{ id: 'entangle', turns: 99 }] }));
    expect(total(castSpell({ key: 'weapon:1585', enemies: tangled as never }).summary.order)).toBe(18);
  });
  it('troop:7790: with a Storm, create 4 Yellow then convert all Yellow to Purple', () => {
    const o = castStorm('troop:7790');
    expect(o.filter(x => x.startsWith('convert'))).toHaveLength(2);
    expect(o.find(x => x.startsWith('convert') && x.endsWith('-> Yellow x4'))).toBeTruthy();
    expect(o.find(x => x.startsWith('convert Yellow x'))).toMatch(/^convert Yellow x13 -> Purple x13$/);
  });
  it('troop:7824: 2 Poison Gems -> 18 + 16 = 34 scatter total, then jumble, then 4 Green -> Poison', () => {
    const o = castSpell({ key: 'troop:7824', board: withSpecials('poisonGem', 2) }).summary.order;
    expect(total(o)).toBe(34);
    expect(o.slice(-2)).toEqual(['shuffle theirs', 'convert Green x4 -> poisonGem x4']);
  });
  it('troop:6104: steals 10 + floor(11 Blue x 34%) = 13 Attack and converts Blue (not Yellow) to Purple', () => {
    const o = castSpell({ key: 'troop:6104' }).summary.order;
    expect(o).toEqual(['convert Blue x11 -> Purple x11', 'buff E11 attack-13', 'buff C attack+13']);
  });
  it('troop:7192 / weapon:1468: true damage boosted by Stone Blocks (x5 / x2)', () => {
    expect(dmgs(castSpell({ key: 'troop:7192', board: withSpecials('stoneBlock', 2) }).summary.order)[0]).toBe('dmg E11 23');
    expect(dmgs(castSpell({ key: 'weapon:1468', board: withSpecials('stoneBlock', 2) }).summary.order)[0]).toBe('dmg E11 17');
  });
  it('troop:7192: target killed -> 8 gems of one of its colours (Yellow/Blue) still become Stone Blocks', () => {
    const enemies = [{ colors: [BaseColor.Red] }, { colors: [BaseColor.Yellow, BaseColor.Blue] }, { colors: [BaseColor.Purple] }, { colors: [BaseColor.Green] }]
      .map(e => ({ ...e, hp: 1, maxHp: 1, armor: 0 }));
    const o = castSpell({ key: 'troop:7192', enemies }).summary.order;
    expect(o).toContain('defeat E11');
    expect(o.find(x => x.startsWith('convert'))).toMatch(/^convert (Yellow|Blue) x8 -> stoneBlock x8$/);
  });
  it('troop:7046: 2 Lycanthropy Gems -> 6 Doomskulls; first and last enemies take 12 true damage', () => {
    const r = castSpell({ key: 'troop:7046', board: withSpecials('lycanthropyGem', 2) }).summary;
    expect(dmgs(r.order)).toEqual(['dmg E10 12', 'dmg E13 12']);
    expect(r.gems.created.doomSkull).toBe(6);
  });
});

describe('L4b R3 B04', () => {
  it('troop:6354: other allies Magic 5 + 7 -> 11 + floor(12 x 50%) = 17 (caster Magic excluded)', () => {
    const o = castSpell({ key: 'troop:6354', allies: [{ magic: 5 }, { magic: 7 }] }).summary.order;
    expect(o).toEqual(['convert Blue x11 -> skull x11', 'convert Brown x8 -> Yellow x8', 'dmg E11 17']);
  });
  it('troop:7490: steal is capped by the target Magic (CountMagic@FromTarget, CountMaxWithMagic 1+M)', () => {
    const enemies = [{}, { magic: 5 }, {}, {}];
    const o = castSpell({ key: 'troop:7490', enemies }).summary.order;
    expect(o.slice(1)).toEqual(['buff E11 magic-5', 'buff C hp+5 max+5']);
  });
  const gold = (key: string, g: number) => { const f = setupCast({ key }); setGold(f, g); return summarize(f, f.cast()); };
  it('troop:6480 / 6762: 6 + floor(gold x 25% / 20%), capped at +8', () => {
    expect(gold('troop:6480', 12).gems.created.Red).toBe(9);
    expect(gold('troop:6480', 1000).gems.created.Red).toBe(14);
    expect(gold('troop:6762', 12).gems.created.skull).toBe(8);
    expect(gold('troop:6762', 0).gems.created.skull).toBe(6);
  });
  it('troop:7789 / 7751: damage boosted by my Gold at [10:1] / [4:1] (gold 37)', () => {
    expect(dmgs(gold('troop:7789', 37).order)[0]).toBe('dmg E11 17');
    expect(dmgs(gold('troop:7751', 37).order)[0]).toBe('dmg E11 22');
  });
  it('troop:6274: 2 Treasure Maps -> 8 + 8 = 16 Skulls; 20% chance to gain a map', () => {
    const f = setupCast({ key: 'troop:6274' }); f.state.economy.maps = 2;
    expect(summarize(f, f.cast()).gems.created.skull).toBe(16);
    let gained = 0;
    for (let seed = 1; seed <= 200; seed++) { const g = setupCast({ key: 'troop:6274', seed }); const m0 = g.state.economy.maps; g.cast(); gained += g.state.economy.maps - m0; }
    expect(gained).toBeGreaterThan(20); expect(gained).toBeLessThan(65);
  });
  it('troop:7903: 23 Souls -> 12 + 4 = 16 to all enemies, then 5 Blue -> Ghost', () => {
    const f = setupCast({ key: 'troop:7903' }); f.state.economy.souls = 23;
    const o = summarize(f, f.cast()).order;
    expect(dmgs(o)).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 16 (all)`));
    expect(o.at(-1)).toBe('convert Blue x5 -> ghost x5');
  });
  it('troop:7641: 2 Cursed enemies -> 3 + 2 = 5 Yellow become Purple Dragon Gems, then Curse + Death Mark one random enemy', () => {
    const cursed = [0, 1, 2, 3].map(i => (i < 2 ? { statuses: [{ id: 'curse', turns: 99 }] } : {}));
    const o = castSpell({ key: 'troop:7641', enemies: cursed as never }).summary.order;
    expect(o[0]).toBe('convert Yellow x5 -> dragonGem/Purple x5');
  });
});

describe('L4b R3 B05: status counters', () => {
  const withStatus = (id: string, n: number, extra: Partial<Record<string, unknown>> = {}) =>
    [0, 1, 2, 3].map(i => ({ hp: 900, maxHp: 900, armor: 0, ...extra, ...(i < n ? { statuses: [{ id, turns: 99 }] } : {}) })) as never;
  it('troop:7257: one Death Marked enemy -> 5 of each skull kind, one create per kind (CountMax 1)', () => {
    const r = castSpell({ key: 'troop:7257', enemies: withStatus('death-mark', 2) }).summary;
    expect(r.order.filter(x => x.startsWith('convert'))).toHaveLength(3);
    expect(r.gems.created).toMatchObject({ skull: 5, doomSkull: 5, uberDoomSkull: 5 });
    expect(castSpell({ key: 'troop:7257' }).summary.gems.created).toMatchObject({ skull: 4, doomSkull: 4, uberDoomSkull: 4 });
  });
  it('troop:6299: Death Marked ally or enemy -> also Yellow -> Skull', () => {
    expect(castSpell({ key: 'troop:6299', enemies: withStatus('death-mark', 1) }).summary.order[1]).toBe('convert Yellow x9 -> skull x9');
    expect(castSpell({ key: 'troop:6299', allies: [{ statuses: [{ id: 'death-mark', turns: 99 }] as never }] }).summary.order[1])
      .toBe('convert Yellow x9 -> skull x9');
    expect(castSpell({ key: 'troop:6299' }).summary.order.filter(x => x.startsWith('convert'))).toEqual(['convert Green x13 -> Purple x13']);
  });
  it('troop:7729: 1 Blessed ally + 2 Blessed enemies -> 13 + 15 = 28 to all', () => {
    const o = castSpell({ key: 'troop:7729', enemies: withStatus('blessed', 2), allies: [{ statuses: [{ id: 'blessed', turns: 99 }] as never }] }).summary.order;
    expect(dmgs(o)).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 28 (all)`));
  });
  it('troop:7768: damage is not boosted; 2 Poisoned + 1 Diseased enemies -> mix of 16 + 3 = 19 Green/Red', () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 900, maxHp: 900, armor: 0,
      statuses: i === 0 ? [{ id: 'poison', turns: 99 }, { id: 'disease', turns: 99 }] : i === 1 ? [{ id: 'poison', turns: 99 }] : [] })) as never;
    const r = castSpell({ key: 'troop:7768', enemies }).summary;
    expect(dmgs(r.order)).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 18 (all)`));
    const mix = r.order.find(x => x.startsWith('convert'))!;
    const n = [...mix.matchAll(/-> .*$/g)][0][0].match(/x(\d+)/g)!.map(x => Number(x.slice(1))).reduce((a, b) => a + b, 0);
    expect(n).toBe(19);
  });
  it('troop:7814: 1 Cursed ally + 1 Cursed enemy -> A1 armor 11 + 6 = 17', () => {
    const o = castSpell({ key: 'troop:7814', enemies: withStatus('curse', 1), allies: [{ statuses: [{ id: 'curse', turns: 99 }] as never }] }).summary.order;
    expect(o[0]).toBe('buff A1 armor+17');
  });
  it('troop:7742: default (E10, E13 Enraged) -> 14 + 20 = 34 main, second hit prefers another enemy', () => {
    const o = dmgs(castSpell({ key: 'troop:7742' }).summary.order);
    expect(o[0]).toBe('dmg E11 34 (splash)');
    expect(o.filter(x => x.endsWith(' 34 (splash)'))).toHaveLength(2);
    expect(o[3]).not.toBe('dmg E11 34 (splash)');
  });
  const creates: [string, string, number, number, string][] = [
    ['troop:6568', 'burning', 3, 5, 'Red'], ['troop:6579', 'frozen', 2, 5, 'Blue'], ['troop:7408', 'terror', 2, 7, 'Blue'], ['troop:6703', 'bleed', 2, 6, 'skull'],
  ];
  for (const [key, st, per, base, gem] of creates) it(`${key}: 2 ${st} enemies -> ${base} + ${per} x 2 ${gem}`, () => {
    expect(castSpell({ key, enemies: withStatus(st, 2) }).summary.gems.created[gem]).toBe(base + 2 * per);
  });
});

describe('L4b R3 B06', () => {
  const st = (id: string, n: number) =>
    [0, 1, 2, 3].map(i => ({ hp: 900, maxHp: 900, armor: 0, ...(i < n ? { statuses: [{ id, turns: 99 }] } : {}) })) as never;
  it('troop:6865: 2 Frozen enemies -> 6 + 4 = 10 Blue, then first/last take 13 + 2 x 21 Blue = 55', () => {
    const r = castSpell({ key: 'troop:6865', enemies: st('frozen', 2) }).summary;
    expect(r.gems.created.Blue).toBe(10);
    expect(dmgs(r.order)).toEqual(['dmg E10 55', 'dmg E13 55']);
  });
  // Virtue family: CountSpecificStatusEffect 400 <status> ; CreateGems2Colors 15 <C>>chosen ; buff all other allies (counter)
  const virtues: [string, string, string, string[]][] = [
    ['troop:6266', 'stun', 'Brown', ['buff A1 armor+21', 'buff A2 armor+21']],
    ['troop:6263', 'burning', 'Red', ['buff A1 attack+17', 'buff A2 attack+17']],
    ['troop:6262', 'entangle', 'Green', ['buff A1 hp+19 max+19', 'buff A2 hp+19 max+19']],
    ['troop:6261', 'frozen', 'Blue', ['buff A1 hp+14 max+14', 'buff A2 hp+14 max+14', 'buff A1 attack+14', 'buff A2 attack+14']],
  ];
  for (const [key, status, color, buffs] of virtues) it(`${key}: 2 ${status} enemies -> other allies +8; 15 ${color}/chosen gems`, () => {
    const r = castSpell({ key, enemies: st(status, 2), color: BaseColor.Purple }).summary;
    expect(r.order.filter(x => x.startsWith('buff'))).toEqual(buffs);
    const conv = r.order.find(x => x.startsWith('convert'))!;
    expect(conv).toMatch(new RegExp(`-> .*(${color}|Purple)`));
    const total = conv.split('->')[1].match(/x(\d+)/g)!.map(x => Number(x.slice(1))).reduce((a, b) => a + b, 0);
    expect(total).toBe(15);
  });
  it('troop:6338: 2 Frozen enemies -> 16 + 8 = 24; kill -> 10 Blue', () => {
    expect(dmgs(castSpell({ key: 'troop:6338', enemies: st('frozen', 2) }).summary.order)[0]).toBe('dmg E11 24');
    expect(castSpell({ key: 'troop:6338', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0 })) }).summary.gems.created.Blue).toBe(10);
  });
  // Faerie Fire itself makes its holder take x1.5 damage (engine status rule), so E10/E11 show 42.
  it('troop:7679: 2 Faerie Fired enemies -> 16 + 12 = 28 to all (x1.5 on the Faerie Fired); 3 Skulls -> x2 Wildcards', () => {
    const f = setupCast({ key: 'troop:7679', enemies: st('faerie-fire', 2) });
    const o = summarize(f, f.cast()).order;
    expect(dmgs(o)).toEqual(['dmg E10 42 (all)', 'dmg E11 42 (all)', 'dmg E12 28 (all)', 'dmg E13 28 (all)']);
    const wild: number[] = [];
    f.board.forEach(g => { const s = g?.type as { kind: string; spec?: { kind: string; tier?: number } } | undefined; if (s?.kind === 'special' && s.spec?.kind === 'wildcard') wild.push(s.spec.tier ?? 2); }); // MatchResolver: untiered wildcard = x2
    expect(wild.length).toBeGreaterThanOrEqual(3);
    expect(new Set(wild)).toEqual(new Set([2]));
  });
  it('troop:7832: +2 per Entangled enemy applies to every enemy (2 Entangled -> 12 + 4 = 16 each)', () => {
    expect(dmgs(castSpell({ key: 'troop:7832', enemies: st('entangle', 2) }).summary.order)).toEqual(['E10', 'E11', 'E12', 'E13'].map(e => `dmg ${e} 16 (all)`));
  });
  it('troop:6364: 2 Burning enemies -> 9 + 2 = 11 Purple', () => {
    expect(castSpell({ key: 'troop:6364', enemies: st('burning', 2) }).summary.gems.created.Purple).toBe(11);
  });
  // troop:6692 issued (P-B-action-status-self-count): a Submerged caster is not counted. Ally part only:
  it('troop:6692: A1 Submerged -> 6 + 3 = 9 Blue', () => {
    expect(castSpell({ key: 'troop:6692', allies: [{ statuses: [{ id: 'submerged', turns: 99 }] as never }] }).summary.gems.created.Blue).toBe(9);
  });
});

describe('L4b R3 B07', () => {
  const st = (id: string, n: number) =>
    [0, 1, 2, 3].map(i => ({ hp: 900, maxHp: 900, armor: 0, ...(i < n ? { statuses: [{ id, turns: 99 }] } : {}) })) as never;
  it('troop:7263: 2 Cursed enemies -> 9 + 2 = 11 Cursed Gems', () => {
    expect(castSpell({ key: 'troop:7263', enemies: st('curse', 2) }).summary.gems.created.curseGem).toBe(11);
  });
  it('weapon:1231: 2 Webbed enemies -> 5 + 6 = 11 Purple', () => {
    expect(castSpell({ key: 'weapon:1231', enemies: st('web', 2) }).summary.gems.created.Purple).toBe(11);
  });
  // Doom family: count Death Marked (x6) BEFORE Death Marking everyone, then create 8 of the colour.
  for (const [key, color] of [['troop:6661', 'Blue'], ['troop:6662', 'Green'], ['troop:6663', 'Red'], ['troop:6664', 'Yellow'], ['troop:6665', 'Purple'], ['troop:6666', 'Brown']] as const) {
    it(`${key}: 2 Death Marked -> 14 + 12 = 26, then all Death Marked, 8 ${color}`, () => {
      const r = castSpell({ key, enemies: st('death-mark', 2) }).summary;
      expect(dmgs(r.order)).toEqual(['dmg E11 26']);
      expect(r.gems.created[color]).toBe(8);
      expect(castSpell({ key }).summary.order[0]).toBe('dmg E11 14');
    });
  }
});

describe('L4b R3 B08', () => {
  const st = (id: string, n: number) =>
    [0, 1, 2, 3].map(i => ({ hp: 900, maxHp: 900, armor: 0, ...(i < n ? { statuses: [{ id, turns: 99 }] } : {}) })) as never;
  const total = (o: string[]) => dmgs(o).reduce((a, x) => a + Number(x.split(' ')[2]), 0);
  it('troop:6408 / 7458: 2 Entangled / Webbed enemies -> 30 + 20 = 50 scatter total', () => {
    expect(total(castSpell({ key: 'troop:6408', enemies: st('entangle', 2) }).summary.order)).toBe(50);
    expect(total(castSpell({ key: 'troop:7458', enemies: st('web', 2) }).summary.order)).toBe(50);
  });
  it('troop:7053: counts enemies with a status (one enemy with 2 statuses -> +2 Purple, not +4)', () => {
    const enemies = [{ statuses: [{ id: 'poison', turns: 99 }, { id: 'burning', turns: 99 }] }, {}, {}, {}] as never;
    expect(castSpell({ key: 'troop:7053', enemies }).summary.gems.created.Purple).toBe(9 + 2);
    expect(castSpell({ key: 'troop:7053' }).summary.gems.created.Purple).toBe(9 + 4);
  });
  it('troop:7092 / weapon:1526: the selected cell (3,3) becomes the special gem', () => {
    for (const [key, kind, tier] of [['troop:7092', 'elementalStar', undefined], ['weapon:1526', 'wildcard', 3]] as const) {
      const f = setupCast({ key, cell: { row: 3, col: 3 } });
      f.cast();
      const g = f.board.get({ row: 3, col: 3 })?.type as { kind: string; spec?: { kind: string; tier?: number } };
      expect(g.kind).toBe('special'); expect(g.spec?.kind).toBe(kind);
      if (tier) expect(g.spec?.tier).toBe(tier);
    }
  });
  it('troop:6362: 7 chosen-colour gems; Barrier only Wargare allies', () => {
    const r = castSpell({ key: 'troop:6362', color: BaseColor.Red, allies: [{ troopTypes: ['Wargare'] }, { troopTypes: ['Human'] }] as never }).summary;
    expect(r.gems.created.Red).toBe(7);
    expect(r.order.filter(x => x.startsWith('status'))).toEqual(['status C +barrier', 'status A1 +barrier']);
  });
  it('troop:6697: 50% chance rolls once for the whole team (all or none), both outcomes occur', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const n = castSpell({ key: 'troop:6697', seed }).summary.order.filter(x => x.endsWith('+rage')).length;
      expect([0, 3]).toContain(n); seen.add(n);
    }
    expect([...seen].sort()).toEqual([0, 3]);
  });
  it('weapon:1167: the Submerged random ally is the one that gains 1 Magic', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const o = castSpell({ key: 'weapon:1167', seed }).summary.order;
      const who = o.find(x => x.endsWith('+submerged'))!.split(' ')[1];
      expect(o).toContain(`buff ${who} magic+1`);
    }
  });
});

describe('L4b R3 B09', () => {
  it('troop:6112: chosen ally A2 (Red/Yellow) -> 11 gems of one of its colours; Cleanse + 17 Life to A2', () => {
    const r = castSpell({ key: 'troop:6112', target: 2, allies: [{}, { colors: [BaseColor.Red, BaseColor.Yellow], statuses: [{ id: 'poison', turns: 99 }] as never }] }).summary;
    const conv = r.order.find(x => x.startsWith('convert'))!;
    expect(conv).toMatch(/-> (Red|Yellow) x11$/);
    expect(r.order.filter(x => !x.startsWith('convert') && !x.startsWith('~') && !x.startsWith('extra'))).toEqual(['cleanse A2 -poison', 'buff A2 hp+17 max+17']);
  });
  it('troop:6890: 1 Bleed + 1 Death Mark guaranteed, each second one at 25% (targets may repeat)', () => {
    let second = 0; const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const o = castSpell({ key: 'troop:6890', seed, enemies: [0, 1, 2, 3].map(() => ({ hp: 900, maxHp: 900, armor: 0 })) }).summary.order;
      const bleeds = o.filter(x => x.startsWith('status') && x.endsWith('+bleed')).length;
      const marks = o.filter(x => x.startsWith('status') && x.endsWith('+death-mark')).length;
      expect(bleeds).toBeGreaterThanOrEqual(1); expect(marks).toBeGreaterThanOrEqual(1);
      second += (bleeds - 1) + (marks - 1);
    }
    // 2N rolls at 25%, minus repeats on an already Bled/Marked enemy (no new status line): well below 50%
    expect(second / (2 * N)).toBeGreaterThan(0.12); expect(second / (2 * N)).toBeLessThan(0.3);
  });
  it('troop:7082: creates 2 Yellow first (native step 0), then all 11 Yellow -> Uber Doomskulls; strongest = Life + Armor', () => {
    expect(castSpell({ key: 'troop:7082' }).summary.order.slice(0, 2)).toEqual(['convert Blue x1, Green x1 -> Yellow x2', 'convert Yellow x11 -> uberDoomSkull x11']);
    const enemies = [{ hp: 100, armor: 0 }, { hp: 500, maxHp: 500, armor: 450 }, { hp: 100, armor: 0 }, { hp: 900, maxHp: 900, armor: 0 }];
    expect(castSpell({ key: 'troop:7082', enemies }).summary.order.slice(2)).toEqual(['status E11 +curse', 'status E11 +web', 'status E11 +poison']);
  });
  it('troop:7082: tied strongest -> Web and Poison follow the Cursed enemy', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const o = castSpell({ key: 'troop:7082', seed, enemies: [0, 1, 2, 3].map(() => ({ hp: 500, maxHp: 500, armor: 0 })) }).summary.order.slice(2, 5);
      const who = o[0].split(' ')[1];
      expect(o).toEqual([`status ${who} +curse`, `status ${who} +web`, `status ${who} +poison`]);
    }
  });
  it('troop:7020: most used ally mana colour (3 Purple users) -> 10 Purple, then 8 Skulls', () => {
    const r = castSpell({ key: 'troop:7020', caster: { colors: [BaseColor.Purple, BaseColor.Green] }, allies: [{ colors: [BaseColor.Purple] }, { colors: [BaseColor.Purple, BaseColor.Red] }] }).summary;
    expect(r.gems.created.Purple).toBe(10);
    expect(r.gems.created.skull).toBe(8);
  });
});
