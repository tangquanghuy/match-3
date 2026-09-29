// sa-Q1 final wrap-up: issued skills of lanes L2 / L4a re-checked after the fixed primitives
// (sa-P fix rounds) and rulings R011-R016. Each case pins the behaviour the acceptance was based on.
import { describe, it, expect } from 'vitest';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';
const has = (order: string[], s: string) => order.some(x => x === s || x.startsWith(s));
const statOf = (line: string) => line.split(' ').pop()!.replace(/[+-]\d+$/, '');

describe('sa-Q1 B01: random Skill pool (R007-2), row count at cast start, precount explode, remove', () => {
  it('troop:6134 Dark Song: [M+6] dmg, 4 from a random Skill (Life in the pool), Daemon + Orc mana steals', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = castSpell({ key: 'troop:6134', seed }).summary;
      expect(s.order[0]).toBe('dmg E11 16');
      s.order.filter(x => x.startsWith('buff E11')).forEach(x => seen.add(statOf(x)));
    }
    expect(seen.has('hp')).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const both = castSpell({ key: 'troop:6134', enemies: [{ hp: 500, maxHp: 500 }, { hp: 500, maxHp: 500, mana: 30, troopTypes: ['Orc', 'Daemon'] } as never] }).summary;
    expect(both.order.filter(x => x.startsWith('buff C mana+6')).length).toBe(2);
  });
  it('troop:6171 Ghiralee: StealRandom before the damage; stolen Life grows caster Life + max; Mech x2', () => {
    const s = castSpell({ key: 'troop:6171' }).summary;
    expect(s.order).toEqual(['buff E11 hp-11', 'buff C hp+11 max+11', 'dmg E11 11']);
    const mech = castSpell({ key: 'troop:6171', enemies: [{ hp: 500, maxHp: 500 }, { hp: 500, maxHp: 500, armor: 0, troopTypes: ['Mech'] } as never] }).summary;
    expect(has(mech.order, 'dmg E11 22')).toBe(true);
  });
  it('troop:6182 Herald of Chaos: Blue in the chosen row counted at cast start, damage + drain, row destroyed last', () => {
    const s = castSpell({ key: 'troop:6182' }).summary;
    expect(s.order[0]).toBe('dmg E10 15'); // 1 + 10 + 2 x 2 Blue in the row
    expect(s.order[1]).toMatch(/^buff E10 (attack|armor|hp|magic)-15$/);
    expect(s.order[2]).toMatch(/^destroy 8 /);
  });
  it('troop:6398 Ancient Golem: Blue in the 3x3 block counted before the explosion, true damage lands first', () => {
    const s = castSpell({ key: 'troop:6398' }).summary;
    expect(s.order[0]).toBe('dmg E12 18');
    expect(s.order[1]).toBe('explode 9');
  });
  it('troop:6423 Cat Sith: chosen colour counted [3:1] before RemoveColor; removed gems give no mana', () => {
    const s = castSpell({ key: 'troop:6423' }).summary;
    expect(s.order.slice(0, 4)).toEqual(['buff E13 hp-14', 'buff E13 mana-4', 'buff C mana+4', 'destroy 11 (Blue x11)']);
    expect(Object.keys(s.units).some(u => u.startsWith('A') && (s.units[u] ?? '').includes('mana+'))).toBe(false);
  });
});

const tough = (o = {}) => ({ hp: 900, maxHp: 900, armor: 0, ...o });
const frail = (o = {}) => ({ hp: 1, maxHp: 1, armor: 0, ...o });
describe('sa-Q1 B02: count at native step, disputes kept (6621 / 6864), random pool, chosen-target colour', () => {
  it('troop:6593 Fallen Valdis: Silence Divine enemies; Divine enemies killed by the damage still boost the Doomskulls', () => {
    const DOOM = { kind: 'special', spec: { kind: 'doomSkull' } } as never;
    const board = (r: number, c: number) => ([7, 4].includes(r) && [0, 3, 6].includes(c) ? DOOM : ({ kind: 'color', color: ['Red', 'Green', 'Blue'][(r + c) % 3] } as never));
    const div = (e: object) => ({ ...e, troopTypes: ['Divine'] });
    const r = castSpell({ key: 'troop:6593', board, enemies: [div(frail()), div(frail()), div(tough()), tough()] });
    expect(r.summary.order.filter(s => s === 'trigger doomSkull').length).toBe(3 + 3);
    expect(r.summary.order).toContain('status E12 +silence');
    expect(r.summary.order).not.toContain('status E13 +silence');
  });
  it('troop:6621 Arcane Golem: explode, one random Stun per Yellow destroyed, Attack [M+1] (English; native UseCounter dispute)', () => {
    const s = castSpell({ key: 'troop:6621' }).summary;
    expect(s.order[0]).toBe('explode 9');
    expect(s.order.filter(x => x.endsWith('+stun')).length).toBe(1);
    expect(s.order[s.order.length - 1]).toBe('buff C attack+11');
  });
  it('troop:6776 Ahrimas: [M+4] damage, then two independent DecreaseRandom [M+4] rolls on the target', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = castSpell({ key: 'troop:6776', seed, enemies: [tough(), tough({ armor: 50, attack: 50, magic: 50 })] }).summary;
      expect(s.order[0]).toBe('dmg E11 14');
      const red = s.order.filter(x => x.startsWith('buff E11'));
      expect(red.length).toBe(2);
      red.forEach(x => { expect(x).toMatch(/-14$/); seen.add(statOf(x)); });
    }
    expect(seen.has('hp')).toBe(true);
  });
  it('troop:6864 Sylfrostenath: [M+1] to all, then 1-4 DISTINCT random enemies frozen (English; repeat dispute)', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const fr = castSpell({ key: 'troop:6864', seed, enemies: [tough(), tough(), tough(), tough()] }).summary.order.filter(x => x.endsWith('+frozen'));
      expect(new Set(fr).size).toBe(fr.length);
      counts.add(fr.length);
    }
    expect([...counts].every(n => n >= 1 && n <= 4)).toBe(true);
    expect(counts.size).toBeGreaterThan(2);
  });
  it('troop:6964 Storm Knight: Blue target -> destroy a column and +5 Attack BEFORE the true damage; otherwise damage only', () => {
    const blue = castSpell({ key: 'troop:6964', enemies: [tough(), tough({ colors: ['Blue'] })] }).summary;
    expect(blue.order[0]).toMatch(/^destroy 8 /);
    expect(blue.order.slice(1)).toEqual(['buff C attack+5', 'dmg E11 12']);
    const red = castSpell({ key: 'troop:6964', enemies: [tough(), tough({ colors: ['Red'] })] }).summary;
    expect(red.order).toEqual(['dmg E11 12']);
  });
});

describe('sa-Q1 B03: dual storm, Mithrilion order, row count, army count at cast start', () => {
  it('troop:7036 / troop:7038 Hellclaw: Red + Purple counted per source, Hellstorm = Red + Purple storm', () => {
    const a = castSpell({ key: 'troop:7036' });
    expect(a.summary.order[0]).toBe('dmg E11 30'); // 2 + 10 + board Red + Purple
    expect(a.f.state.teams[a.f.side].storm?.color2).toBe('Purple');
    const b = castSpell({ key: 'troop:7038' });
    expect(b.summary.order.slice(0, 2)).toEqual(['buff C attack+29', 'buff C hp+29 max+29']);
    expect(b.f.state.teams[b.f.side].storm?.color2).toBe('Purple');
  });
  it('troop:7057 Mithrilion: Armor first (native order), explode the 3x3, one random Barrier per Skull destroyed', () => {
    const s = castSpell({ key: 'troop:7057' }).summary;
    expect(s.order[0]).toBe('buff C armor+19');
    expect(s.order[1]).toBe('explode 9');
    expect(s.order.filter(x => x.endsWith('+barrier')).length).toBe(1); // 1 Skull in the default 3x3
  });
  it('troop:7316 Eye of Arges: Red / Brown / Skull of the exploded row counted before the explode, x8', () => {
    const s = castSpell({ key: 'troop:7316' }).summary;
    expect(s.order[0]).toBe('explode 24');
    expect(has(s.order, 'dmg E11 50')).toBe(true); // 6 + 20 + 8 x 3
  });
  it('troop:7492 Amatiel: Undead / Daemon enemies counted at cast start (x10 each), damage to all', () => {
    const s = castSpell({ key: 'troop:7492', enemies: [tough({ troopTypes: ['Undead'] }), tough({ troopTypes: ['Daemon'] }), tough(), tough()] }).summary;
    expect(s.order.filter(x => x.startsWith('dmg '))).toEqual(['dmg E10 31 (all)', 'dmg E11 31 (all)', 'dmg E12 31 (all)', 'dmg E13 31 (all)']);
  });
});

describe('sa-Q1 B04: R011 positives on Blessed, Dark Witch dispute, Bad Gargoyles, R016-1, Bear Totem remove', () => {
  it('troop:7739 Cosmo: scatter [M+6]; an already Blessed ally still receives the positive statuses (R011)', () => {
    const bl = [{ id: 'blessed', turns: 3 }] as never;
    let got = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = castSpell({ key: 'troop:7739', seed, allies: [{ hp: 100, maxHp: 100, statuses: bl }] }).summary;
      expect(s.order.filter(x => x.endsWith('(scatter)')).reduce((a, x) => a + Number(x.split(' ')[2]), 0)).toBe(16);
      got += s.order.filter(x => x.startsWith('status A1 +') && !x.endsWith('+blessed')).length;
    }
    expect(got).toBeGreaterThan(5);
  });
  it('troop:7850 Dark Witch: boosted x2 by Cursed and Webbed ENEMIES (English; native web count on allies), then Curse + Web', () => {
    const st = (id: string) => [{ id, turns: 3 }] as never;
    const s = castSpell({ key: 'troop:7850', enemies: [tough({ statuses: st('curse') }), tough({ statuses: st('web') }), tough()] }).summary;
    expect(s.order[0]).toMatch(/^buff E11 (attack|armor|hp|magic)-15$/); // 1 + 10 + 2 x (1 cursed + 1 webbed)
    expect(s.order.slice(1)).toEqual(['status E11 +curse', 'status E11 +web']);
  });
  it('troop:7851 Seditius: [M+4] + 2 x Red, then explode 3 BAD Gargoyles only', () => {
    expect(castSpell({ key: 'troop:7851' }).summary.order).toEqual(['dmg E11 32']);
    const garg = (tier: number) => ({ kind: 'special', spec: { kind: 'gargoyleGem', tier } }) as never;
    const spread = ['0,0', '0,3', '0,6', '3,0', '3,3', '3,6', '6,0'];
    const board = withCells(reviewBoard, Object.fromEntries(spread.map((k, i) => [k, garg(i < 4 ? 2 : 1)])));
    const r = castSpell({ key: 'troop:7851', board });
    const n = { 1: 0, 2: 0 } as Record<number, number>;
    r.f.board.forEach(g => { if (g && g.type.kind === 'special' && g.type.spec.kind === 'gargoyleGem') n[g.type.spec.tier ?? 1] += 1; });
    expect(n).toEqual({ 1: 3, 2: 1 });
  });
  it('troop:7884 Bok Singefur: [M+4] damage, then ONE uniform 2-5 gem explosion (R016-1)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = castSpell({ key: 'troop:7884', seed }).summary;
      expect(s.order[0]).toBe('dmg E11 14');
      expect(s.order.filter(x => x.startsWith('explode ')).length).toBe(1);
    }
  });
  it('weapon:1102 Bear Totem: [M] damage, +1 Magic + floor(Green/3) counted before RemoveColor, removed gems give no mana', () => {
    const s = castSpell({ key: 'weapon:1102' }).summary;
    expect(s.order).toEqual(['dmg E11 10', 'buff C magic+5', 'destroy 13 (Green x13)']);
    expect(Object.keys(s.units).some(u => u.startsWith('A') && (s.units[u] ?? '').includes('mana+'))).toBe(false);
  });
});

describe('sa-Q1 B05: StealRandom weapons, Runeforger cast-start count, RemoveColor weapons', () => {
  it('weapon:1104 Eye of Xathenos: steal 5 of a random Skill first, then [M+6] (x3 vs Fey)', () => {
    const s = castSpell({ key: 'weapon:1104', target: 11 }).summary;
    expect(s.order).toEqual(['buff E11 hp-5', 'buff C hp+5 max+5', 'dmg E11 16']);
    const fey = castSpell({ key: 'weapon:1104', target: 11, enemies: [tough(), tough({ troopTypes: ['Fey'] })] }).summary;
    expect(has(fey.order, 'dmg E11 48')).toBe(true);
  });
  it('weapon:1107 Staff of Madness: steal 1 random Skill from every enemy, then [M+1] to all', () => {
    const st = { armor: 20, attack: 20, magic: 5 };
    const s = castSpell({ key: 'weapon:1107', enemies: [tough(st), tough(st), tough(st)] }).summary;
    const firstDmg = s.order.findIndex(x => x.startsWith('dmg '));
    expect(s.order.slice(0, firstDmg).filter(x => x.startsWith('buff E')).length).toBe(3);
    // stolen Magic lands before the damage (native order), so the hit is 11 + Magic stolen
    const stolenMagic = s.order.slice(0, firstDmg).filter(x => x.startsWith('buff C magic+')).length;
    const d = 11 + stolenMagic;
    expect(s.order.slice(firstDmg)).toEqual([`dmg E10 ${d} (all)`, `dmg E11 ${d} (all)`, `dmg E12 ${d} (all)`]);
  });
  it('weapon:1158 Runeforger: Brown enemy killed by the splash still adds an explosion (counted at cast start)', () => {
    const allies = [{ colors: ['Red'] }, { colors: ['Red'] }] as never;
    const n = (e: object[]) => { const x = castSpell({ key: 'weapon:1158', target: 11, allies, enemies: e as never }).summary.order.find(s => s.startsWith('explode')); return x ? Number(x.split(' ')[1]) : 0; };
    const alive = n([tough({ colors: ['Red'] }), tough({ colors: ['Brown'] }), tough({ colors: ['Red'] })]);
    expect(alive).toBeGreaterThan(0);
    expect(n([tough({ colors: ['Red'] }), frail({ colors: ['Brown'] }), tough({ colors: ['Red'] })])).toBe(alive);
  });
  it('weapon:1174 Titania\'s Fan: cleanse + heal other allies [M+1] + floor(Blue/3), then remove Blue (no mana)', () => {
    const s = castSpell({ key: 'weapon:1174' }).summary;
    expect(s.order.slice(0, 4)).toEqual(['cleanse A1 -poison', 'buff A1 hp+14 max+14', 'buff A2 hp+14 max+14', 'destroy 11 (Blue x11)']);
    expect(has(s.order, 'buff C hp')).toBe(false);
    expect(Object.keys(s.units).some(u => (s.units[u] ?? '').includes('mana+'))).toBe(false);
  });
  it('weapon:1230 Axe of the Spire: [M+5] + floor(Brown/3), x2 vs Elemental, Brown removed last without mana', () => {
    const s = castSpell({ key: 'weapon:1230' }).summary;
    expect(s.order.slice(0, 2)).toEqual(['dmg E11 17', 'destroy 8 (Brown x8)']);
    expect(Object.keys(s.units).some(u => (s.units[u] ?? '').includes('mana+'))).toBe(false);
    const el = castSpell({ key: 'weapon:1230', enemies: [tough(), tough({ troopTypes: ['Elemental'] })] }).summary;
    expect(el.order[0]).toBe('dmg E11 34');
  });
});

describe('sa-Q1 B06: kill-gated positives (R011), Scarab, Indrajit dual storm, Elixir (R016-3)', () => {
  it('weapon:1255 Summer\'s Wonder: no kill -> no statuses; kill -> 2 positives per ally, a Blessed ally still gets them (R011)', () => {
    expect(castSpell({ key: 'weapon:1255' }).summary.order.every(x => x.includes('(scatter)'))).toBe(true);
    const bl = [{ id: 'blessed', turns: 3 }] as never;
    let got = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = castSpell({ key: 'weapon:1255', seed, allies: [{ hp: 100, maxHp: 100, statuses: bl }], enemies: [frail(), frail()] }).summary;
      got += s.order.filter(x => x.startsWith('status A1 +') && !x.endsWith('+blessed')).length;
    }
    expect(got).toBeGreaterThan(4);
  });
  it('weapon:1377 Scarab of Nefertani: DecreaseRandom [M+1] then Curse, Death Mark, Disease on the chosen enemy', () => {
    const s = castSpell({ key: 'weapon:1377', target: 11 }).summary;
    expect(s.order[0]).toMatch(/^buff E11 (attack|armor|hp|magic)-11$/);
    expect(s.order.slice(1)).toEqual(['status E11 +curse', 'status E11 +death-mark', 'status E11 +disease']);
  });
  it('weapon:1391 Indrajit\'s Claw: true damage 2 + M + 2 x (Red + Purple) to the last enemy, Red + Purple Hellstorm', () => {
    const r = castSpell({ key: 'weapon:1391' });
    expect(r.summary.order[0]).toMatch(/^dmg E1\d 48$/);
    expect(r.f.state.teams[r.f.side].storm?.color2).toBe('Purple');
  });
  it('weapon:1396 Experimental Elixir: every branch heals [M+1] (R016-3), then Red gems / extra turn / one explosion', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = castSpell({ key: 'weapon:1396', seed }).summary;
      expect(s.order[0]).toBe('buff C hp+11 max+11');
      if (s.extraTurn) kinds.add('turn');
      else if (s.gems.created.Red === 7) kinds.add('create');
      else if (has(s.order, 'explode')) kinds.add('explode');
    }
    expect([...kinds].sort()).toEqual(['create', 'explode', 'turn']);
  });
});
