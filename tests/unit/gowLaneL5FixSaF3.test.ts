// sa-F3 fix round A, lane L5: behaviour the four standard golden scenarios cannot show
// (ally race/kingdom/named troop conditions, pre-existing statuses, partial kills). Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES, DEFAULT_ALLIES } from '../helpers/gowCast';
import type { Character } from '@engine/types';

const st = (...ids: string[]) => ids.map(id => ({ id, turns: 99 })) as Character['statuses'];
const has = (c: Character, id: string) => c.statuses.some(s => s.id === id);
// Fresh status arrays: engine mutates statuses in place, shared default arrays would leak between casts.
const fresh = (c: Partial<Character>): Partial<Character> => ({ ...c, statuses: (c.statuses ?? []).map(s => ({ ...s })) });
const withEnemy = (i: number, over: Partial<Character>) => DEFAULT_ENEMIES.map((e, j) => fresh(j === i ? { ...e, ...over } : e));
const allies = (over: Partial<Character>) => [fresh({ ...DEFAULT_ALLIES[0], ...over }), fresh(DEFAULT_ALLIES[1])];

describe('L5 sa-F3: ally-group Bless weapons (race / kingdom filters)', () => {
  const rows: [string, Partial<Character>][] = [
    ['weapon:1653', { troopTypes: ['Monster'] }],
    ['weapon:1659', { troopTypes: ['Daemon'] }],
    ['weapon:1680', { troopTypes: ['Undead'] }],
    ['weapon:1687', { kingdom: '黑石' }],
    ['weapon:1690', { kingdom: '沃尔帕克' }],
    ['weapon:1699', { troopTypes: ['Elemental'] }],
    ['weapon:1702', { troopTypes: ['Mystic'] }],
    ['weapon:1714', { troopTypes: ['Construct'] }],
    ['weapon:1718', { kingdom: '聚沙之地' }],
  ];
  it.each(rows)('%s buffs and Blesses only matching allies', (key, match) => {
    const r = castSpell({ key, allies: allies(match) });
    const [a1, a2] = r.f.allies;
    expect(r.summary.units.A1).toContain('atk+11');
    expect(r.summary.units.A1).toContain('hp+11');
    expect(has(a1, 'blessed')).toBe(true);
    expect(r.summary.units.A2).toBeUndefined();
    expect(has(a2, 'blessed')).toBe(false);
  });
});

describe('L5 sa-F3: dispel before damage (R001)', () => {
  it('troop:6527 removes the target Barrier first, so the hit lands', () => {
    const r = castSpell({ key: 'troop:6527', enemies: withEnemy(1, { statuses: st('barrier') }) });
    expect(has(r.f.enemies[1], 'barrier')).toBe(false);
    expect(r.summary.units.E11).toContain('hp-3');
  });
  it('troop:6468 dispels a Barrier then deals damage boosted x4 per enemy Beast', () => {
    const enemies = withEnemy(1, { statuses: st('barrier') }).map((e, j) => (j >= 2 ? { ...e, troopTypes: ['Beast'] } : e));
    const r = castSpell({ key: 'troop:6468', enemies });
    expect(has(r.f.enemies[1], 'barrier')).toBe(false);
    expect(r.summary.order).toContain('dmg E11 21'); // 10 + 3 + 2 Beasts x4
  });
});

describe('L5 sa-F3: statuses, targets and kill branches', () => {
  it('troop:6576 still sacrifices itself when it holds a Barrier (native Dispel@Self first)', () => {
    const r = castSpell({ key: 'troop:6576', caster: { statuses: st('barrier') } });
    expect(r.f.caster.defeated || r.summary.units.C?.includes('DEAD')).toBe(true);
    expect(r.summary.units.A1).toContain('mag+2');
  });
  it('troop:6727 doubles on a Cursed target and always Curses', () => {
    const cursed = castSpell({ key: 'troop:6727', enemies: withEnemy(1, { statuses: st('curse') }) });
    expect(cursed.summary.order[0]).toBe('dmg E11 28');
    const plain = castSpell({ key: 'troop:6727' });
    expect(plain.summary.order).toEqual(['dmg E11 14', 'status E11 +curse']);
  });
  it('weapon:1696 gives +5 Attack/Life/Armor to all allies only with Immortal Tauraeus', () => {
    const r = castSpell({ key: 'weapon:1696', allies: allies({ name: '不朽的陶拉乌斯' }) });
    for (const u of ['A1', 'A2']) { expect(r.summary.units[u]).toContain('atk+5'); expect(r.summary.units[u]).toContain('arm+5'); expect(r.summary.units[u]).toContain('hp+5'); }
    expect(r.summary.units.C).toContain('atk+5');
    expect(castSpell({ key: 'weapon:1696' }).summary.units.A1).toBeUndefined();
  });
  it('weapon:1720 Submerges and Enchants all allies only with Immortal Thalassa', () => {
    const r = castSpell({ key: 'weapon:1720', allies: allies({ name: '不朽的塔拉萨' }) });
    for (const a of r.f.allies) { expect(has(a, 'submerged')).toBe(true); expect(has(a, 'enchanted')).toBe(true); }
    expect(castSpell({ key: 'weapon:1720' }).f.allies.some(a => has(a, 'submerged'))).toBe(false);
  });
  it('troop:6165 Freezes surviving enemies when any enemy (not only the first) dies', () => {
    // three 1-Life enemies so the random scatter surely kills one; the sturdy E13 must end Frozen
    const enemies = DEFAULT_ENEMIES.map((e, j) => fresh(j < 3 ? { ...e, hp: 1, maxHp: 1, armor: 0 } : e));
    const r = castSpell({ key: 'troop:6165', enemies });
    expect(r.summary.order.some(x => x.startsWith('defeat'))).toBe(true);
    expect(has(r.f.enemies[3], 'frozen')).toBe(true);
  });
  it('troop:7902 inflicts Terror on survivors when any enemy dies', () => {
    const r = castSpell({ key: 'troop:7902', enemies: withEnemy(1, { hp: 1, maxHp: 1, armor: 0 }) });
    const alive = r.f.enemies.filter(e => !e.defeated && e.hp > 0);
    expect(alive.length).toBeGreaterThan(0);
    for (const e of alive) expect(has(e, 'terror')).toBe(true);
    expect(castSpell({ key: 'troop:7902' }).f.enemies.some(e => has(e, 'terror'))).toBe(false);
  });
  it('troop:6403 doubles on an already Silenced target; alone, the second hit is doubled by the first Silence', () => {
    const pre = castSpell({ key: 'troop:6403', enemies: withEnemy(1, { statuses: st('silence') }) });
    expect(pre.summary.order[0]).toBe('dmg E11 24');
    const alone = castSpell({ key: 'troop:6403', enemies: [fresh(DEFAULT_ENEMIES[1])], target: 10 });
    expect(alone.summary.order).toEqual(['dmg E10 12', 'status E10 +silence', 'dmg E10 24', 'status E10 +silence']);
  });
  it('troop:7525 Curses first (removing Barrier), then the Life steal lands', () => {
    const r = castSpell({ key: 'troop:7525', enemies: withEnemy(0, { statuses: st('barrier') }) });
    expect(has(r.f.enemies[0], 'barrier')).toBe(false);
    expect(r.summary.units.E10).toContain('hp-15');
  });
});
