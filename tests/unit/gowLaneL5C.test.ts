// sa-C lane L5 review round 3: conditions the standard golden scenarios cannot show. Real TurnEngine casts.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES, DEFAULT_ALLIES } from '../helpers/gowCast';
type St = { id: string; turns: number }[];
const st = (...ids: string[]) => ids.map(id => ({ id, turns: 99 })) as unknown as St;
const enemies = (over: Record<number, object>) => DEFAULT_ENEMIES.map((e, i) => ({ ...e, ...(over[i] ?? {}) }));
const allies = (over: Record<number, object>) => DEFAULT_ALLIES.map((a, i) => ({ ...a, ...(over[i] ?? {}) }));
const dmgs = (order: string[]) => order.filter(x => x.startsWith('dmg ')).map(x => { const [, who, n] = x.split(' '); return { who, n: Number(n) }; });
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

describe('L5 sa-C B01', () => {
  it('troop:6800 CountAttackArmorLife 34% (R003) on top of the (M/2+1)-(M+3) roll; Enraged on kill', () => {
    for (const seed of seeds.slice(0, 10)) {
      const r = castSpell({ key: 'troop:6800', magic: 0, seed, caster: { attack: 0, armor: 0, hp: 1000, maxHp: 1000 } });
      const [d] = dmgs(r.summary.order);
      expect(d.who).toBe('E11');
      expect(d.n).toBeGreaterThanOrEqual(341); expect(d.n).toBeLessThanOrEqual(343); // 1..3 + floor(1000 x 34 / 100)
    }
  });
  it('troop:6791 Faerie Fire all enemies only when the target had Hunter\'s Mark (counted before the damage)', () => {
    const marked = castSpell({ key: 'troop:6791', enemies: enemies({ 1: { statuses: st('marked') } }) });
    expect(marked.summary.order).toEqual(['dmg E11 14', 'status E10 +faerie-fire', 'status E11 +faerie-fire', 'status E12 +faerie-fire', 'status E13 +faerie-fire']);
    const killed = castSpell({ key: 'troop:6791', enemies: enemies({ 1: { hp: 1, statuses: st('marked') } }) });
    expect(killed.summary.order.filter(x => x.startsWith('status'))).toEqual(['status E10 +faerie-fire', 'status E12 +faerie-fire', 'status E13 +faerie-fire']);
    expect(castSpell({ key: 'troop:6791' }).summary.order).toEqual(['dmg E11 14']);
  });
  it('troop:7900 three RandomEnemy/RandomPrefNotPrev waves: never the same enemy twice in a row, repeats allowed', () => {
    let repeat = false;
    for (const seed of seeds) {
      const d = dmgs(castSpell({ key: 'troop:7900', seed }).summary.order);
      expect(d.slice(0, 3).map(x => x.n)).toEqual([10, 10, 10]);
      for (let i = 1; i < 3; i++) expect(d[i].who).not.toBe(d[i - 1].who);
      if (d[0].who === d[2].who) repeat = true;
    }
    expect(repeat).toBe(true);
  });
  it('troop:7578 target hit + three waves (RandomEnemy may hit the target), each with its own roll; Bleeding x3', () => {
    let repeat = false, split = false, target = false;
    for (const seed of seeds) {
      const d = dmgs(castSpell({ key: 'troop:7578', seed }).summary.order);
      expect(d[0].who).toBe('E11'); expect(d).toHaveLength(4);
      for (const x of d) { expect(x.n).toBeGreaterThanOrEqual(3); expect(x.n).toBeLessThanOrEqual(15); } // 3 - round(13.3 + 2)
      for (let i = 2; i < 4; i++) expect(d[i].who).not.toBe(d[i - 1].who);
      if (d[1].who === d[3].who) repeat = true;
      if (new Set(d.slice(1).map(x => x.n)).size > 1) split = true;
      if (d[1].who === 'E11') target = true;
    }
    expect(repeat && split && target).toBe(true);
    const bled = castSpell({ key: 'troop:7578', enemies: enemies({ 0: { statuses: st('bleed') }, 2: { statuses: st('bleed') } }) });
    for (const x of dmgs(bled.summary.order)) { expect(x.n).toBeGreaterThanOrEqual(9); expect(x.n).toBeLessThanOrEqual(21); } // + 2 x 3
  });
  it('troop:7581 five waves boosted x3 per Frozen enemy', () => {
    const r = castSpell({ key: 'troop:7581', enemies: enemies({ 0: { statuses: st('frozen') }, 1: { statuses: st('frozen') } }) });
    expect(dmgs(r.summary.order).map(x => x.n)).toEqual([14, 14, 14, 14, 14]); // 2 + 6 + 2 x 3
  });
  it('troop:7901 scatter total boosted x3 per Cursed enemy', () => {
    const r = castSpell({ key: 'troop:7901', enemies: enemies({ 0: { statuses: st('curse') }, 3: { statuses: st('curse') } }) });
    expect(dmgs(r.summary.order).reduce((a, x) => a + x.n, 0)).toBe(39); // 8 + 25 + 2 x 3
  });
  it('troop:6624 true splash boosted x2 per Submerged ally; a Submerged caster counts itself (P-B-action-status-self-count)', () => {
    const r = castSpell({ key: 'troop:6624', allies: allies({ 0: { statuses: st('submerged') }, 1: { statuses: st('submerged') } }) });
    expect(r.summary.order.slice(0, 3)).toEqual(['dmg E11 16 (splash)', 'dmg E10 8 (splash)', 'dmg E12 8 (splash)']);
    const self = castSpell({ key: 'troop:6624', caster: { statuses: st('submerged') } });
    expect(self.summary.order).toEqual(['remove C -submerged', 'dmg E11 14 (splash)', 'dmg E10 7 (splash)', 'dmg E12 7 (splash)']);
  });
});

/** Bleed stacks = magnitude of the single bleed status entry. */
const bleeds = (r: ReturnType<typeof castSpell>, id: number) => (r.f.enemies.find(e => e.id === id)!.statuses.find(s => s.id === 'bleed') as { magnitude?: number } | undefined)?.magnitude ?? 0;
describe('L5 sa-C B02', () => {
  it('troop:7783 / troop:7710 double damage only when the target already Bleeds; 7710 adds 2 stacks', () => {
    const on = { enemies: enemies({ 1: { statuses: st('bleed') } }) };
    expect(castSpell({ key: 'troop:7783', ...on }).summary.order[0]).toBe('dmg E11 26');
    expect(castSpell({ key: 'troop:7710', ...on }).summary.order[0]).toBe('dmg E11 26');
    expect(bleeds(castSpell({ key: 'troop:7710' }), 11)).toBe(2);
  });
  it('weapon:1250 Bleeds both of the first 2 enemies', () => {
    const r = castSpell({ key: 'weapon:1250' });
    expect(r.summary.order).toEqual(['dmg E10 14 (all)', 'dmg E11 14 (all)', 'status E10 +bleed', 'status E11 +bleed']);
  });
  it('weapon:1695 2 Bleed stacks; with Immortal Kveldulf in my team 1 more stack and Lycanthropy (not Curse)', () => {
    const plain = castSpell({ key: 'weapon:1695' });
    expect(bleeds(plain, 11)).toBe(2);
    const k = castSpell({ key: 'weapon:1695', allies: [...DEFAULT_ALLIES, { name: '不朽的克维尔杜尔夫' }] });
    expect(bleeds(k, 11)).toBe(3);
    expect(k.summary.order.filter(x => x.startsWith('status'))).toContain('status E11 +lycanthropy');
    expect(k.summary.order.join(' ')).not.toContain('curse');
  });
  it('weapon:1442 first + last, weapon:1443 last 2, weapon:1444 first 2 (+4 per Tempering on every hit)', () => {
    expect(castSpell({ key: 'weapon:1442' }).summary.order.slice(0, 2)).toEqual(['dmg E10 18', 'dmg E13 18']);
    expect(castSpell({ key: 'weapon:1442', caster: { temperingLevel: 2 } }).summary.order.slice(0, 2)).toEqual(['dmg E10 26', 'dmg E13 26']);
    expect(castSpell({ key: 'weapon:1443', caster: { temperingLevel: 1 } }).summary.order.slice(0, 2)).toEqual(['dmg E12 22 (all)', 'dmg E13 22 (all)']);
    expect(castSpell({ key: 'weapon:1444', caster: { temperingLevel: 1 } }).summary.order.slice(0, 2)).toEqual(['dmg E10 22 (all)', 'dmg E11 22 (all)']);
  });
  it('troop:6007 20% Burn lands on a random enemy (not the chosen one)', () => {
    const hit = new Set<string>();
    for (const seed of Array.from({ length: 120 }, (_, i) => i)) {
      for (const x of castSpell({ key: 'troop:6007', seed }).summary.order) if (x.startsWith('status')) hit.add(x);
    }
    expect(hit.size).toBeGreaterThan(1);
  });
});

describe('L5 sa-C B03', () => {
  it('troop:7331 25% Death Mark: one roll for both neighbours of the target (never exactly one)', () => {
    const seen = new Set<string>();
    for (const seed of Array.from({ length: 60 }, (_, i) => i)) {
      const s = castSpell({ key: 'troop:7331', seed }).summary.order.filter(x => x.startsWith('status')).join(',');
      seen.add(s);
    }
    expect([...seen].sort()).toEqual(['status E11 +death-mark', 'status E11 +death-mark,status E10 +death-mark,status E12 +death-mark'].sort());
  });
  it('weapon:1176 Death Mark Divine enemies, Disease Knight enemies', () => {
    const r = castSpell({ key: 'weapon:1176', enemies: enemies({ 0: { troopTypes: ['Divine'] }, 1: { troopTypes: ['Knight'] }, 2: { troopTypes: ['Divine', 'Knight'] } }) });
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(['status E10 +death-mark', 'status E12 +death-mark', 'status E11 +disease', 'status E12 +disease']);
  });
  it('troop:6389 triple damage on a Death Marked target', () => {
    expect(castSpell({ key: 'troop:6389', enemies: enemies({ 1: { statuses: st('death-mark') } }) }).summary.order[0]).toBe('dmg E11 36');
  });
  it('weapon:1124 Burn a random enemy, Disease a different one', () => {
    for (const seed of seeds) {
      const s = castSpell({ key: 'weapon:1124', seed }).summary.order.filter(x => x.startsWith('status')).map(x => x.split(' ')[1]);
      expect(s).toHaveLength(2); expect(s[0]).not.toBe(s[1]);
    }
  });
});
