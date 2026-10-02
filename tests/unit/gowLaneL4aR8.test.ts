/**
 * Lane L4a review round 8 (sa-A): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { BaseColor, colorGem, skullGem, specialGem } from '@engine/types';
import { castSpell, setupCast, summarize, reviewBoard, withCells, type BoardFn } from '../helpers/gowCast';

const countSpecial = (r: ReturnType<typeof castSpell>, kind: string) => {
  let n = 0;
  for (let rr = 0; rr < 8; rr++) for (let c = 0; c < 8; c++) {
    const g = r.f.board.get({ row: rr, col: c });
    if (g?.type.kind === 'special' && g.type.spec.kind === kind) n += 1;
  }
  return n;
};

describe('L4a R8 B01', () => {
  // weapon:1578 Frostbound (9300): CreateGems2Colors 16 Ghost>Freeze ; ExplodeGems 1 (spell Target None = random gem).
  it('weapon:1578 creates 16 Ghost/Freeze Gems and explodes one random gem (no chosen cell)', () => {
    const r = castSpell({ key: 'weapon:1578' });
    const c = r.summary.gems.created;
    expect((c.ghost ?? 0) + (c.freezeGem ?? 0)).toBe(16);
    expect(c.ghost).toBeGreaterThan(0); expect(c.freezeGem).toBeGreaterThan(0);
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBeGreaterThanOrEqual(1);
    const centres = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const ev = castSpell({ key: 'weapon:1578', seed }).events.find(e => e.type === 'gem-explode') as unknown as { cells: { pos: { row: number; col: number } }[] };
      centres.add(JSON.stringify(ev.cells.map(p => `${p.pos.row},${p.pos.col}`).sort()));
    }
    expect(centres.size).toBeGreaterThan(1); // not always the same (chosen) cell
  });
  // troop:7594 CrestedAva (9473): Damage@FromTarget 2+M [Tower x Ascension: R000 waived] ;
  // DecreaseSpellPower@FromTarget [AddForAnyStorm 5] ; StormRandom.
  it('troop:7594 removes 5 Magic from the target only when a Storm is already present', () => {
    const f = setupCast({ key: 'troop:7594' });
    f.engine.debugSetStorm(BaseColor.Red, f.side);
    const magic0 = f.enemies[1].magic;
    const s = summarize(f, f.cast());
    expect(s.order[0]).toBe('dmg E11 12');
    expect(f.enemies[1].magic).toBe(Math.max(0, magic0 - 5));
    const r = castSpell({ key: 'troop:7594' });
    expect(r.f.enemies[1].magic).toBe(magic0);
    expect(r.summary.order.some(o => /^storm \w+ set$/.test(o))).toBe(true);
  });
  // troop:6476 OwlRider (7663): Damage@WeakestEnemy 3+M ; DestroyColor Purple [AddForKill].
  it('troop:6476 destroys Purple only on a kill', () => {
    expect(castSpell({ key: 'troop:6476' }).summary.order.some(o => o.startsWith('destroy'))).toBe(false);
    const r = castSpell({ key: 'troop:6476', enemies: [{}, {}, { hp: 5, maxHp: 5, armor: 0 }, {}] });
    expect(r.summary.order).toContain('defeat E12');
    expect(r.summary.order.find(o => o.startsWith('destroy'))).toMatch(/^destroy \d+ \(Purple x\d+\)$/);
  });
});

/** exactly n gems of `color` (first n cells), the rest cycle four other colours without pre-made matches */
const exactly = (color: BaseColor, n: number): BoardFn => {
  const rest = [BaseColor.Red, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Blue, BaseColor.Brown].filter(c => c !== color).slice(0, 4);
  return (r, c) => (r * 8 + c < n ? colorGem(color) : colorGem(rest[(2 * r + c) % 4]));
};
const allBlue = (n: number) => exactly(BaseColor.Blue, n);
const allBrown = (n: number) => exactly(BaseColor.Brown, n);
const skullBoard: BoardFn = (r, c) => (r < 4 ? skullGem() : reviewBoard(r, c));

describe('L4a R8 B02', () => {
  // troop:6077 Behemoth (7147): Damage@AllEnemies 5+M ; DestroyGems 12 (any gem, Skulls are Gems: R013-5).
  it('troop:6077 random destroy can take Skulls', () => {
    const r = castSpell({ key: 'troop:6077', board: skullBoard });
    const d = r.summary.order.find(o => o.startsWith('destroy '))!;
    expect(d).toMatch(/^destroy 12 /);
    expect(d).toContain('skull');
  });
  // weapon:1055 Butcher's Knife (7121): Damage@LastEnemy 6+M ; ExplodeGems [AddForKill 1] (any gem).
  it('weapon:1055 explodes one gem only on a kill, Skulls eligible', () => {
    expect(castSpell({ key: 'weapon:1055' }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
    const k = castSpell({ key: 'weapon:1055', enemies: [{}, {}, {}, { hp: 1, maxHp: 1, armor: 0 }], board: skullBoard });
    expect(k.summary.order).toContain('defeat E13');
    expect(k.summary.order.some(o => o.startsWith('explode '))).toBe(true);
  });
  // troop:6342 Penguin (7494): Damage 3+M [MultiplyFor10BlueGems 3 = 13+ Blue, R003] ; StormBlue.
  // troop:6347 Troglodyte (7499): same with Brown ; StormBrown.
  it.each([
    ['troop:6342', allBlue, 'Blue'],
    ['troop:6347', allBrown, 'Brown'],
  ] as const)('%s triples at 13 %s-like gems, not at 12', (key, mk, storm) => {
    expect(castSpell({ key, board: mk(13) }).summary.order[0]).toBe('dmg E11 39');
    expect(castSpell({ key, board: mk(12) }).summary.order[0]).toBe('dmg E11 13');
    expect(castSpell({ key }).summary.order).toContain(`storm ${storm} set`);
  });
  // weapon:1160 Ice Staff (7578): Damage 4+M [MultiplyForStormBlue 2] ; StormBlue.
  it('weapon:1160 doubles only under an Icestorm', () => {
    const f = setupCast({ key: 'weapon:1160' }); f.engine.debugSetStorm(BaseColor.Blue, f.side);
    expect(summarize(f, f.cast()).order[0]).toBe('dmg E11 28');
    const g = setupCast({ key: 'weapon:1160' }); g.engine.debugSetStorm(BaseColor.Red, g.side);
    expect(summarize(g, g.cast()).order[0]).toBe('dmg E11 14');
  });
});

describe('L4a R8 B03-B04 storm family', () => {
  // troop:6343/6344/6345/6346 (7495-7498): Damage 3+M [MultiplyFor10<C>Gems 3 = 13+ gems, R003] ; Storm<C>.
  it.each([
    ['troop:6343', BaseColor.Green], ['troop:6344', BaseColor.Red], ['troop:6345', BaseColor.Yellow], ['troop:6346', BaseColor.Purple],
  ] as const)('%s triples at 13 %s gems and creates that storm', (key, color) => {
    expect(castSpell({ key, board: exactly(color, 13) }).summary.order[0]).toBe('dmg E11 39');
    expect(castSpell({ key, board: exactly(color, 12) }).summary.order[0]).toBe('dmg E11 13');
    expect(castSpell({ key }).summary.order).toContain(`storm ${color} set`);
  });
  // weapon:1161-1165 (7579-7583): Damage 4+M [MultiplyForStorm<C> 2] ; Storm<C>.
  it.each([
    ['weapon:1161', BaseColor.Green, BaseColor.Red], ['weapon:1162', BaseColor.Red, BaseColor.Green], ['weapon:1163', BaseColor.Yellow, BaseColor.Blue],
    ['weapon:1164', BaseColor.Purple, BaseColor.Yellow], ['weapon:1165', BaseColor.Brown, BaseColor.Purple],
  ] as const)('%s doubles only under its own %s storm', (key, own, other) => {
    const f = setupCast({ key }); f.engine.debugSetStorm(own, f.side);
    expect(summarize(f, f.cast()).order).toEqual(['dmg E11 28', `storm ${own} replaced`]);
    const g = setupCast({ key }); g.engine.debugSetStorm(other, g.side);
    expect(summarize(g, g.cast()).order[0]).toBe('dmg E11 14');
  });
  // troop:6376 BoneDaemon (7530): Damage 4+M [MultiplyForStormSkull 2] ; StormSkull (Bonestorm).
  it('troop:6376 doubles only under a Bonestorm', () => {
    const f = setupCast({ key: 'troop:6376' }); f.engine.debugSetStorm(BaseColor.Brown, f.side, 8, 'skull');
    expect(summarize(f, f.cast()).order[0]).toBe('dmg E11 28');
    const g = setupCast({ key: 'troop:6376' }); g.engine.debugSetStorm(BaseColor.Brown, g.side);
    expect(summarize(g, g.cast()).order[0]).toBe('dmg E11 14');
  });
});

describe('L4a R8 B05', () => {
  // troop:7460 (9177) / troop:7704 (9665): Damage 2+M [Tower x Ascension waived R000] ; DestroyColumn 1 (random, spell targets an enemy).
  // troop:6533 (7727): Damage 4+M [waived] ; DestroyRow 1.
  it.each([['troop:7460', 'dmg E11 12'], ['troop:7704', 'dmg E11 12'], ['troop:6533', 'dmg E11 14']] as const)('%s hits the chosen enemy, then destroys one random full line', (key, dmg) => {
    const lines = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const r = castSpell({ key, seed });
      expect(r.summary.order[0]).toBe(dmg);
      const ev = r.events.find(e => e.type === 'gem-destroy') as unknown as { cells: { pos: { row: number; col: number } }[] };
      expect(ev.cells).toHaveLength(8);
      const rows = new Set(ev.cells.map(c => c.pos.row)), cols = new Set(ev.cells.map(c => c.pos.col));
      expect(key === 'troop:6533' ? rows.size : cols.size).toBe(1);
      lines.add([...(key === 'troop:6533' ? rows : cols)].join());
    }
    expect(lines.size).toBeGreaterThan(1);
  });
  // troop:7426 (9120) DestroyGems 7 / troop:7585 (9464) DestroyGems 8: any gem incl. Skulls (R013-5).
  it.each([['troop:7426', 7, 'dmg E11 14'], ['troop:7585', 8, 'dmg E11 12']] as const)('%s destroys %i random gems, Skulls eligible', (key, n, dmg) => {
    const r = castSpell({ key, board: skullBoard });
    expect(r.summary.order[0]).toBe(dmg);
    const d = r.summary.order.find(o => o.startsWith('destroy '))!;
    expect(d.startsWith(`destroy ${n} `)).toBe(true);
    expect(d).toContain('skull');
  });
});

describe('L4a R8 B06', () => {
  // troop:6234 Dragon Moth (7375): Damage 1+M ; ExplodeColor Red [AddFor10RedGems 100 = 13+ Red, R003].
  it('troop:6234 explodes all Red only with 13+ Red Gems', () => {
    expect(castSpell({ key: 'troop:6234', board: exactly(BaseColor.Red, 12) }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
    const r = castSpell({ key: 'troop:6234', board: exactly(BaseColor.Red, 13) });
    expect(r.summary.order[0]).toBe('dmg E11 11');
    expect(r.summary.order[1]).toMatch(/^explode \d+$/);
    expect(Number(r.summary.order[1].split(' ')[1])).toBeGreaterThanOrEqual(13);
  });
  // troop:6500 (7687) Brown / 6591 (7795) Red / 6768 (8158) Red: ExplodeColor <C> 3 ; troop:6597 (7927): ExplodeColor Blue 2.
  it.each([['troop:6500', BaseColor.Brown, 'dmg E11 14'], ['troop:6591', BaseColor.Red, 'dmg E11 14'], ['troop:6768', BaseColor.Red, 'dmg E11 14'], ['troop:6597', BaseColor.Blue, 'dmg E11 12']] as const)(
    '%s explodes only %s gems (none on the board -> no explosion)', (key, color, dmg) => {
      const none = castSpell({ key, board: exactly(color, 0) });
      expect(none.summary.order).toEqual([dmg]);
      const r = castSpell({ key });
      expect(r.summary.order[0]).toBe(dmg);
      expect(r.summary.order[1]).toMatch(/^explode \d+$/);
    });
});

describe('L4a R8 B07', () => {
  // troop:7166 (8741) / troop:7761 (9746): Damage ; ExplodeColor FromTarget N (one of the target's mana colours; E11 = Yellow/Blue).
  it.each([['troop:7166', 'dmg E11 13'], ['troop:7761', 'dmg E11 12']] as const)('%s explodes gems of the target mana colours only', (key, dmg) => {
    const noneBoard: BoardFn = (r, c) => colorGem([BaseColor.Red, BaseColor.Green, BaseColor.Purple, BaseColor.Brown][(2 * r + c) % 4]);
    expect(castSpell({ key, board: noneBoard }).summary.order).toEqual([dmg]);
    const r = castSpell({ key });
    expect(r.summary.order[0]).toBe(dmg);
    expect(r.summary.order[1]).toMatch(/^explode \d+$/);
  });
  // troop:7434 (9128): ExplodeColor Web 3 ; troop:7715 (9676): ExplodeColor Doomskull 3.
  it.each([['troop:7434', 'web'], ['troop:7715', 'doomSkull']] as const)('%s explodes up to 3 %s gems, nothing else', (key, kind) => {
    expect(castSpell({ key }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
    const cells = ['0,2', '2,6', '4,4', '6,1'];
    const board = withCells(reviewBoard, Object.fromEntries(cells.map(k => [k, specialGem(kind as never)])));
    const r = castSpell({ key, board });
    expect(r.summary.order[0]).toBe('dmg E11 14');
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBeGreaterThanOrEqual(1);
    expect(countSpecial(r, kind)).toBeLessThanOrEqual(1);
  });
});

describe('L4a R8 B08', () => {
  // troop:7535 Ogre Ghost (9292): ExplodeColor Ghost 1 ; then Ghost 1 at 60% ; 50% ; 40% (independent native steps).
  it('troop:7535 explodes 1 Ghost Gem always and up to 3 more on independent 60/50/40% rolls', () => {
    const segs = (castSpell({ key: 'troop:7535' }).f.proto!.segments as unknown as { kind: string; chance?: number; params?: { target?: { special?: string } } }[]);
    expect(segs.map(s => s.kind)).toEqual(['damage', 'gem', 'gem', 'gem', 'gem']);
    expect(segs.slice(1).map(s => s.chance)).toEqual([undefined, 0.6, 0.5, 0.4]);
    expect(segs.slice(1).every(s => s.params?.target?.special === 'ghost')).toBe(true);
    const cells = ['0,2', '0,6', '4,1', '4,5', '7,1', '7,6'];
    const board = withCells(reviewBoard, Object.fromEntries(cells.map(k => [k, specialGem('ghost')])));
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = castSpell({ key: 'troop:7535', board, seed });
      expect(r.summary.order[0]).toBe('dmg E11 13');
      const n = r.summary.order.filter(o => o.startsWith('explode ')).length;
      expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4); counts.add(n);
    }
    expect(counts.size).toBeGreaterThan(1);
  });
  // troop:6755 (8134): Damage all 3+M ; ExplodeGems [AddForAnyStorm 5] (any gem incl. Skulls).
  it('troop:6755 explodes 5 random gems only with a Storm', () => {
    expect(castSpell({ key: 'troop:6755' }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
    const f = setupCast({ key: 'troop:6755', board: skullBoard }); f.engine.debugSetStorm(BaseColor.Red, f.side);
    const s = summarize(f, f.cast());
    expect(s.order.filter(o => o.startsWith('dmg'))).toHaveLength(4);
    expect(s.order.some(o => o.startsWith('explode '))).toBe(true);
    expect((f.proto!.segments[1] as unknown as { params: { target: { include: string } } }).params.target.include).toBe('all');
  });
  // weapon:1125 (7286): Damage@LastEnemy 7+M ; RemoveColor Green [AddForStormBrown] ; StormBrown.
  it('weapon:1125 removes all Green only under a Duststorm (checked before the new storm)', () => {
    const plain = castSpell({ key: 'weapon:1125' });
    expect(plain.summary.order).toEqual(['dmg E13 17', 'storm Brown set']);
    const f = setupCast({ key: 'weapon:1125' }); f.engine.debugSetStorm(BaseColor.Brown, f.side);
    const s = summarize(f, f.cast());
    expect(s.order[0]).toBe('dmg E13 17');
    expect(s.order[1]).toMatch(/^destroy \d+ \(Green x\d+\)$/);
    expect(s.units.A1 ?? '').not.toContain('mana'); // removed gems give no mana (R010)
  });
});

describe('L4a R8 B09', () => {
  // weapon:1275 (8145): Damage@LastEnemy 4+M [MultiplyForYellowTarget 3] ; StormPurple.
  it('weapon:1275 triples only against a Yellow last enemy', () => {
    expect(castSpell({ key: 'weapon:1275' }).summary.order).toEqual(['dmg E13 14', 'storm Purple set']);
    const enemies = [{}, {}, {}, { hp: 800, maxHp: 800, armor: 3, colors: [BaseColor.Yellow] }];
    expect(castSpell({ key: 'weapon:1275', enemies }).summary.order[0]).toBe('dmg E13 42');
  });
  // troop:7561 (9346): Damage@FrontEnemy 3+M ; TroopOrderBack@FrontEnemy ; DestroyGems BoardTarget Column (spell Target Board = chosen).
  it('troop:7561 destroys the chosen column after knocking the front enemy back', () => {
    const r = castSpell({ key: 'troop:7561', cell: { row: 5, col: 6 } });
    expect(r.summary.order.slice(0, 2)).toEqual(['dmg E10 13', 'move E10 back']);
    const ev = r.events.find(e => e.type === 'gem-destroy') as unknown as { cells: { pos: { row: number; col: number } }[] };
    expect(ev.cells).toHaveLength(8);
    expect(new Set(ev.cells.map(c => c.pos.col))).toEqual(new Set([6]));
  });
  // troop:7652 (9567): Damage@AllEnemies 1+M [AddForAnyStorm 10] (one hit) ; TroopOrderJumble ; StormBlue.
  it('troop:7652 adds 10 to the single all-enemy hit when a Storm exists', () => {
    expect(castSpell({ key: 'troop:7652' }).summary.order.filter(o => o.startsWith('dmg'))).toEqual(['dmg E10 11 (all)', 'dmg E11 11 (all)', 'dmg E12 11 (all)', 'dmg E13 11 (all)']);
    const f = setupCast({ key: 'troop:7652' }); f.engine.debugSetStorm(BaseColor.Red, f.side);
    const s = summarize(f, f.cast());
    expect(s.order.filter(o => o.startsWith('dmg'))).toEqual(['dmg E10 21 (all)', 'dmg E11 21 (all)', 'dmg E12 21 (all)', 'dmg E13 21 (all)']);
    expect(s.order).toContain('shuffle theirs');
    expect(s.order[s.order.length - 1]).toBe('storm Blue replaced');
  });
});

describe('L4a R8 B10', () => {
  // weapon:1370 (8409): DecreaseArmor@FromTarget [AddIfIHaveMech 30] ; Damage 6+M ; StormRedYellow (Electrostorm).
  it('weapon:1370 strips 30 Armor before the hit only with a Mech ally, then conjures a Red/Yellow storm', () => {
    const plain = castSpell({ key: 'weapon:1370' });
    expect(plain.summary.order[0]).toBe('dmg E11 16');
    const storm = plain.f.state.teams[plain.f.side].storm!;
    expect([storm.color, storm.color2]).toEqual([BaseColor.Red, BaseColor.Yellow]);
    const allies = [{ troopTypes: ['Mech'] }, {}];
    const enemies = [{}, { hp: 900, maxHp: 900, armor: 40 }, {}, {}];
    const r = castSpell({ key: 'weapon:1370', allies: allies as never, enemies });
    const i = r.summary.order.findIndex(o => o.startsWith('dmg E11'));
    expect(r.summary.order.slice(0, i).some(o => o.includes('armor-30') || o.startsWith('buff E11 armor'))).toBe(true);
    expect(r.f.enemies[1].armor).toBe(0); // 40 - 30 = 10, then 16 damage takes the last 10 Armor
    expect(r.f.enemies[1].hp).toBe(894);
  });
  // troop:6099 War Hound (7001): DecreaseAttack@FrontEnemy 1+M/2 ; ExplodeGems 2 (any gem incl. Skulls).
  it('troop:6099 explodes 2 random gems, Skulls eligible', () => {
    const r = castSpell({ key: 'troop:6099', board: skullBoard });
    expect(r.summary.order[0]).toBe('buff E10 attack-6');
    expect((r.f.proto!.segments[1] as unknown as { params: { target: { include: string } } }).params.target.include).toBe('all');
  });
});

describe('L4a R8 B11', () => {
  // troop:7334 (8957): DestroyColor 8 (no colour = 8 random Gems, Skulls eligible) ; CauseBarrier@FrontAlly.
  it('troop:7334 destroys 8 random gems incl. Skulls, then Barriers the front ally', () => {
    const r = castSpell({ key: 'troop:7334', board: skullBoard });
    expect(r.summary.order[0]).toMatch(/^destroy 8 .*skull/);
    expect(r.summary.order).toContain('status C +barrier');
  });
  // troop:7019 (8526): DestroyColor MostUsedManaEnemy 1+M ; CauseWeb@StrongestEnemy (life+armor, R005).
  it('troop:7019 destroys 11 gems of the most used enemy colour and Webs the strongest enemy', () => {
    const enemies = [{ colors: [BaseColor.Green] }, { colors: [BaseColor.Green, BaseColor.Red] }, { colors: [BaseColor.Green] }, { hp: 2000, maxHp: 2000, colors: [BaseColor.Blue] }];
    const r = castSpell({ key: 'troop:7019', enemies: enemies as never });
    expect(r.summary.order[0]).toMatch(/^destroy 11 \(Green x11\)$/);
    expect(r.summary.order).toContain('status E13 +web');
  });
  // troop:6040 (7040): DestroyColor chosen 1+M ; GiveGold 100 at 40%.  troop:6084 (7154): chosen 4+M ; Gold 5 ; Map at 20%.
  it('troop:6040 / troop:6084 economy rolls', () => {
    const matchGold = (r: ReturnType<typeof castSpell>) => r.events
      .flatMap(e => e.type === 'elimination' && e.cells.length >= 4
        ? [e.cells.length >= 5 ? 5 : 4] : []).reduce((sum, gain) => sum + gain, 0);
    let gold = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = castSpell({ key: 'troop:6040', seed });
      gold += (r.summary.economy.gold ?? 0) - matchGold(r);
    }
    expect(gold % 100).toBe(0); expect(gold).toBeGreaterThan(0); expect(gold).toBeLessThan(6000);
    const r = castSpell({ key: 'troop:6084' });
    expect(r.summary.order[0]).toMatch(/^destroy 11 \(Blue x11\)$/);
    expect(r.summary.economy.gold).toBe(5 + matchGold(r));
  });
});

describe('L4a R8 B12', () => {
  // troop:6485 (7672): DestroyColor chosen all ; IncreaseHealth@FromManaColor 1+M ; IncreaseSpellPower@FromManaColor 4.
  it('troop:6485 buffs only allies using the chosen colour', () => {
    const allies = [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Red] }];
    const r = castSpell({ key: 'troop:6485', allies: allies as never, caster: { colors: [BaseColor.Green] } });
    const buffs = r.summary.order.filter(o => o.startsWith('buff'));
    expect(buffs.every(b => b.startsWith('buff A1 '))).toBe(true);
    expect(buffs).toContain('buff A1 magic+4');
  });
  // troop:6482 (7669): DestroyColor chosen 8 ; TrueDamage@FromManaColorEnemy 5+M (E11 uses Blue).
  it('troop:6482 true-damages only enemies using the chosen colour', () => {
    const r = castSpell({ key: 'troop:6482' });
    expect(r.summary.order[0]).toBe('destroy 8 (Blue x8)');
    expect(r.summary.order.filter(o => o.startsWith('dmg'))).toEqual(['dmg E11 15 (all)']);
  });
  // troop:6709 (8066): DestroyGems Block5x5 (chosen) ; Curse ; Stun ; Bleed @FrontEnemy (native order).
  it('troop:6709 destroys a 5x5 block, then Curse, Stun, Bleed on the front enemy', () => {
    const r = castSpell({ key: 'troop:6709' });
    expect(r.summary.order[0]).toMatch(/^destroy 25 /);
    expect(r.summary.order.filter(o => o.startsWith('status'))).toEqual(['status E10 +curse', 'status E10 +stun', 'status E10 +bleed']);
  });
  // troop:6923 (8390): DestroyGems Diagonals ; Enchant RandomAlly then RandomPrefNotPrevAlly.
  it('troop:6923 Enchants two different allies when possible', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const st = castSpell({ key: 'troop:6923', seed }).summary.order.filter(o => o.startsWith('status'));
      expect(st).toHaveLength(2); expect(new Set(st).size).toBe(2);
    }
  });
  // troop:6312 (7462): DestroyGems 1+M (any gem incl. Skulls) ; Entangle random enemy.
  it('troop:6312 destroys 11 random gems, Skulls eligible', () => {
    const r = castSpell({ key: 'troop:6312', board: skullBoard });
    expect(r.summary.order[0]).toMatch(/^destroy 11 .*skull/);
  });
});

const destroyCells = (r: ReturnType<typeof castSpell>) =>
  (r.events.find(e => e.type === 'gem-destroy') as unknown as { cells: { pos: { row: number; col: number } }[] }).cells.map(c => c.pos);

describe('L4a R8 B13', () => {
  // troop:7228 (8823) DestroyGems 1+M ; troop:6676 (8022) DestroyGems 8: any gem incl. Skulls (R013-5).
  it.each([['troop:7228', 11], ['troop:6676', 8]] as const)('%s destroys %i random gems, Skulls eligible', (key, n) => {
    const r = castSpell({ key, board: skullBoard });
    expect(r.summary.order[0]).toMatch(new RegExp(`^destroy ${n} .*skull`));
  });
  // weapon:1452 Shock Hammer (8721): DestroyGems BoardTarget Column (chosen) ; CreateGems 6 Bomb ; ScatterDamage 6+M.
  it('weapon:1452 destroys only the chosen column', () => {
    const r = castSpell({ key: 'weapon:1452', cell: { row: 2, col: 5 } });
    const cells = destroyCells(r);
    expect(cells).toHaveLength(8);
    expect(new Set(cells.map(c => c.col))).toEqual(new Set([5]));
    expect(r.summary.gems.created.bomb).toBe(6);
  });
  // troop:6042 (7042) DestroyGems Column (chosen) ; 9 Brown ; +1+M Armor.  troop:6544 (7738) chosen Row ; FirstTwoEnemies 3+M.
  it('troop:6042 / troop:6544 clear the chosen line', () => {
    const a = castSpell({ key: 'troop:6042', cell: { row: 1, col: 2 } });
    expect(new Set(destroyCells(a).map(c => c.col))).toEqual(new Set([2]));
    const b = castSpell({ key: 'troop:6544', cell: { row: 6, col: 2 } });
    expect(new Set(destroyCells(b).map(c => c.row))).toEqual(new Set([6]));
    expect(b.summary.order.filter(o => o.startsWith('dmg'))).toEqual(['dmg E10 13 (all)', 'dmg E11 13 (all)']);
  });
});

describe('L4a R8 B14', () => {
  // troop:7378 (9020) DestroyGems 8 ; troop:6421 (7594) DestroyGems 7: any gem incl. Skulls.
  it.each([['troop:7378', 8], ['troop:6421', 7]] as const)('%s destroys %i random gems, Skulls eligible', (key, n) => {
    expect(castSpell({ key, board: skullBoard }).summary.order[0]).toMatch(new RegExp(`^destroy ${n} .*skull`));
  });
  // troop:7470 (9187): DestroyGems Column ; Damage@LastEnemy 3+M ; Stun ; TroopOrderFront@LastEnemy ; TroopOrderFront@Self.
  it('troop:7470 pulls the last enemy to the front, then itself (native order)', () => {
    const r = castSpell({ key: 'troop:7470', allies: [{}, {}], before: [{}] });
    const moves = r.summary.order.filter(o => o.startsWith('move'));
    expect(moves[0]).toMatch(/^move E13 /);
    expect(moves[1]).toMatch(/^move C /);
    expect(r.summary.order).toContain('status E13 +stun');
  });
  // troop:6774 (8164): DestroyGems Block5x5 ; Damage@RandomEnemy 3+M ; Stun@FromPrevious.  troop:6254 (7397): Row ; knock front back.
  it('troop:6774 stuns the same random enemy it hit', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const o = castSpell({ key: 'troop:6774', seed }).summary.order;
      const hit = o.find(x => x.startsWith('dmg'))!.split(' ')[1];
      expect(o).toContain(`status ${hit} +stun`);
    }
  });
});

describe('L4a R8 B15', () => {
  // troop:6139 (7253): DestroyGems RowAndColumn (chosen Purple) ; IncreaseAllStats@AllAlliesButNotSelf 1.
  it('troop:6139 clears one cross and gives +1 to every Skill of the other allies only', () => {
    const r = castSpell({ key: 'troop:6139' });
    expect(r.summary.order[0]).toMatch(/^destroy 15 /);
    const buffs = r.summary.order.filter(o => o.startsWith('buff'));
    expect(buffs.some(b => b.startsWith('buff C '))).toBe(false);
    expect(buffs.filter(b => b.startsWith('buff A1 '))).toHaveLength(4);
  });
  // troop:6746 (8116): DestroyGems Block5x5 ; SplashHeavy@RandomEnemy 8+M ; 50% Splash@RandomPrefNotPrevEnemy 8+M (native order).
  it('troop:6746 destroys the block before the heavy splash', () => {
    const r = castSpell({ key: 'troop:6746' });
    expect(r.summary.order[0]).toMatch(/^destroy 25 /);
    const iDmg = r.summary.order.findIndex(o => o.startsWith('dmg '));
    expect(iDmg).toBeGreaterThan(0);
    expect(r.summary.order[iDmg]).toMatch(/^dmg E1\d 18 \(splash\)$/);
  });
  // troop:7136 (8685): DestroyGems BoardTarget Column (chosen) ; TrueDamage@LastEnemy 2+M ; Submerge self.
  it('troop:7136 destroys the chosen column', () => {
    const r = castSpell({ key: 'troop:7136', cell: { row: 4, col: 1 } });
    expect(new Set(destroyCells(r).map(c => c.col))).toEqual(new Set([1]));
    expect(r.summary.order).toContain('status C +submerged');
  });
  // troop:7879 (9954): DestroyRow 3 random ; 3 Ghost ; 3 Barrier Gems.
  it('troop:7879 destroys 3 distinct random rows', () => {
    const cells = destroyCells(castSpell({ key: 'troop:7879' }));
    expect(new Set(cells.map(c => c.row)).size).toBe(3);
    expect(cells).toHaveLength(24);
  });
});

describe('L4a R8 B16', () => {
  // troop:6707 Plague Rat (8064): ExplodeColor Brown 1+M ; Disease@RandomEnemy ; Poison@FromPrevious ; Disease@RandomPrefNotPrevEnemy ; Poison@FromPrevious.
  it('troop:6707 Diseases then Poisons the same two different enemies', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const st = castSpell({ key: 'troop:6707', seed }).summary.order.filter(o => o.startsWith('status'));
      expect(st).toHaveLength(4);
      const [d1, p1, d2, p2] = st.map(s => s.split(' '));
      expect([d1[2], p1[2], d2[2], p2[2]]).toEqual(['+disease', '+poison', '+disease', '+poison']);
      expect(p1[1]).toBe(d1[1]); expect(p2[1]).toBe(d2[1]); expect(d2[1]).not.toBe(d1[1]);
    }
  });
  // troop:6021 (7021): ExplodeColor Green 1+M ; Poison RandomEnemy + RandomNotPrevEnemy (2 different).
  it('troop:6021 poisons two different enemies', () => {
    const st = castSpell({ key: 'troop:6021' }).summary.order.filter(o => o.startsWith('status'));
    expect(st).toHaveLength(2); expect(new Set(st).size).toBe(2);
  });
  // weapon:1056 (7122): ExplodeColor Brown [Magic] ; troop:6019 (7019): Yellow 1+M then Cleanse all allies ; troop:6540 (7734): all Red, Cleanse, +1+M Life.
  it('troop:6019 / troop:6540 cleanse after the explosion', () => {
    for (const key of ['troop:6019', 'troop:6540']) {
      const o = castSpell({ key }).summary.order;
      const iEx = o.findIndex(x => x.startsWith('explode')), iCl = o.findIndex(x => x.startsWith('cleanse') || x.startsWith('remove'));
      expect(iEx).toBe(0); expect(iCl).toBeGreaterThan(iEx);
    }
    expect(castSpell({ key: 'weapon:1056', magic: 0 }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
  });
});
