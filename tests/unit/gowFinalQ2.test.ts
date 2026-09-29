// sa-Q2 final wrap-up: issued skills of lanes L1 / L3 / L4b / L5 / L6 / L7 re-checked after the fixed primitives
// (sa-P fix rounds) and rulings R010-R016. Each case pins the behaviour the acceptance was based on.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';

const has = (order: string[], s: string) => order.some(x => x === s || x.startsWith(s));

describe('sa-Q2 B01: Remove* family (P-F1-remove-gems, R010) + Sunbird rebirth', () => {
  it('troop:6076 Goblin King: counted before remove, 8 + floor(11/2) Life, goblin summon, extra turn', () => {
    const { summary: s } = castSpell({ key: 'troop:6076' });
    expect(s.order[0]).toBe('buff C hp+13 max+13');
    expect(has(s.order, 'destroy 11 (Blue x11)')).toBe(true);
    expect(s.summons.length).toBe(1);
    expect(s.extraTurn).toBe('skill');
  });
  it('troop:6207 Spirit Fox: drain 7 -> true damage 1+10+floor(9/2) -> remove Yellow (native order)', () => {
    const { summary: s } = castSpell({ key: 'troop:6207' });
    expect(s.order.slice(0, 3)).toEqual(['buff E11 mana-7', 'dmg E11 15', 'destroy 9 (Yellow x9)']);
  });
  it('troop:6328 Krystenax: 4+10+floor(11/2) to all enemies before the remove, Silver Drakon summoned', () => {
    const { summary: s } = castSpell({ key: 'troop:6328' });
    expect(s.order.slice(0, 4)).toEqual(['dmg E10 19 (all)', 'dmg E11 19 (all)', 'dmg E12 19 (all)', 'dmg E13 19 (all)']);
    expect(s.summons).toEqual(['troop:6321']);
  });
  it('troop:6970 Argos: remove chosen colour, dispel front enemy, drain mana by the removed count', () => {
    const { summary: s } = castSpell({ key: 'troop:6970', enemies: [{ hp: 600, maxHp: 600, mana: 30, colors: [], statuses: [{ id: 'rage', turns: 99 }] as never }] });
    expect(s.order[0]).toBe('destroy 11 (Blue x11)');
    expect(has(s.order, 'buff E10 mana-11')).toBe(true);
    expect(s.units.E10).toContain('-rage');
  });
  it('troop:6387 Sunbird: caster really dies, a fresh Sunbird is summoned (P-F1-summon-after-caster-death)', () => {
    const { summary: s } = castSpell({ key: 'troop:6387' });
    expect(s.units.C).toContain('DEAD');
    expect(s.summons).toEqual(['troop:6387']);
  });
});

describe('sa-Q2 B02: harness-leak items (fixed on main: fresh templates) + Doomclaw', () => {
  it('troop:6047 Black Beast: devour the chosen ally, heal to full, 6 Skulls', () => {
    const { f, summary: s } = castSpell({ key: 'troop:6047' });
    expect(s.order[0]).toMatch(/^dmg A1 \d+ devoured$/);
    expect(f.caster.hp).toBe(f.caster.maxHp);
    expect(s.gems.created.skull).toBe(6);
  });
  it('troop:6326 Princess Elspeth: 11 gems of the chosen ally colour, ally killed, knight summoned', () => {
    const { summary: s } = castSpell({ key: 'troop:6326' });
    expect(s.gems.created.Blue).toBe(11);
    expect(s.units.A1).toContain('DEAD');
    expect(s.summons.length).toBe(1);
  });
  it('troop:7625 Mantichoras: 3 true hits (prefer not previous), 8 mana drain each, doubled on a poisoned enemy', () => {
    const poisoned = { hp: 500, maxHp: 500, mana: 30, statuses: [{ id: 'poison', turns: 99 }] as never };
    const { summary: s } = castSpell({ key: 'troop:7625', enemies: [poisoned, { hp: 500, maxHp: 500, mana: 30 }] });
    const dmg = s.order.filter(x => x.startsWith('dmg '));
    expect(dmg.length).toBe(3);
    expect(dmg.every(x => x.endsWith(' 13'))).toBe(true);
    const drains = s.order.filter(x => x.startsWith('buff '));
    expect(drains.filter(x => x.startsWith('buff E10')).every(x => x.endsWith('mana-16'))).toBe(true);
    expect(drains.filter(x => x.startsWith('buff E11')).every(x => x.endsWith('mana-8'))).toBe(true);
  });
  it('troop:6410 Doomclaw: separate 25% devours of the NEXT enemy below then above (not the whole column)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { summary: s } = castSpell({ key: 'troop:6410', target: 12, seed });
      expect(s.order[0]).toBe('dmg E12 18');
      s.order.filter(x => x.endsWith('devoured')).forEach(x => seen.add(x.split(' ')[1]));
      const dev = s.order.filter(x => x.endsWith('devoured')).map(x => x.split(' ')[1]);
      if (dev.length === 2) expect(dev).toEqual(['E13', 'E11']);
    }
    expect([...seen].sort()).toEqual(['E11', 'E13']); // E10 (two above) never devoured
  });
});

describe('sa-Q2 B03: fixed chosen-target conditions / counts', () => {
  const big = { hp: 2000, maxHp: 2000, armor: 0, mana: 0 };
  it('troop:6483 Sol Zara: Life compared before the hit -> 30 Souls then 3 x 13 damage (P-F3-prehit-target-compare)', () => {
    const { summary: s } = castSpell({ key: 'troop:6483', enemies: [big, big] });
    expect(s.economy.souls).toBe(30);
    expect(s.order.filter(x => x.startsWith('dmg'))).toEqual(['dmg E11 39']);
    const low = castSpell({ key: 'troop:6483', enemies: [{ hp: 50, maxHp: 50 }, { hp: 50, maxHp: 50 }] }).summary;
    expect(low.economy.souls).toBe(10);
  });
  it('troop:6587 Urska Dragoon: +10 only on an already damaged target; surviving damaged target -> Enraged (P-F3-lasttarget-damaged)', () => {
    const hurt = castSpell({ key: 'troop:6587', enemies: [big, { hp: 500, maxHp: 900, armor: 0 }] }).summary;
    expect(hurt.order[0]).toBe('dmg E11 24');
    expect(hurt.units.C).toContain('+rage');
    const armorOnly = castSpell({ key: 'troop:6587', magic: 0 }).summary; // 4 damage all on armor -> not damaged
    expect(armorOnly.units.C ?? '').not.toContain('+rage');
  });
  it('troop:6704 Shaman of Set: asks for a colour; one Red per gem of it (P-R2-chosen-color-modifier)', () => {
    const { summary: s } = castSpell({ key: 'troop:6704' });
    expect(s.gems.created.Red).toBe(11);
    expect(s.order.some(x => x.endsWith('+bleed'))).toBe(true);
  });
  it('troop:6936 Royal Assassin: +10 per listed status on the target (P-R3-target-status-count)', () => {
    const st = (ids: string[]) => ids.map(id => ({ id, turns: 3 })) as never;
    const { summary: s } = castSpell({ key: 'troop:6936', enemies: [big, { ...big, statuses: st(['poison', 'stun', 'curse']) }] });
    expect(s.order[0]).toBe('dmg E11 43');
  });
  it('weapon:1427 Elemental Reach: +12 per Entangled / Burning / Frozen / Stunned on the target', () => {
    const st = (ids: string[]) => ids.map(id => ({ id, turns: 3 })) as never;
    const { summary: s } = castSpell({ key: 'weapon:1427', enemies: [big, { ...big, statuses: st(['burning', 'frozen']) }] });
    expect(s.order[0]).toBe('dmg E11 37');
  });
});

describe('sa-Q2 B04: next-up target, gargoyle tier, Spirit gems (R016-7), Hanged Man', () => {
  it('troop:6982 Mechataur: armor [3:1] boost, independent 30% Silence on target / next up / next down', () => {
    const boosted = castSpell({ key: 'troop:6982', caster: { armor: 30 } }).summary;
    expect(boosted.order[0]).toBe('dmg E11 23 (splash)');
    const hit = new Set<string>();
    let multi = false;
    for (let seed = 1; seed <= 10; seed++) {
      const sil = castSpell({ key: 'troop:6982', seed }).summary.order.filter(x => x.endsWith('+silence')).map(x => x.split(' ')[1]);
      sil.forEach(x => hit.add(x)); if (sil.length > 1) multi = true;
      expect(sil.every(x => ['E10', 'E11', 'E12'].includes(x))).toBe(true);
    }
    expect([...hit].sort()).toEqual(['E10', 'E11', 'E12']);
    expect(multi).toBe(true);
  });
  it('troop:7210 Xenith: 5 Doomskulls, no board gargoyles -> no boost', () => {
    expect(castSpell({ key: 'troop:7210' }).summary.gems.created.doomSkull).toBe(5);
  });
  it('troop:7308 Chiron / troop:7309 Spirittooth: Spirit gems are Purple spirit gems (R016-7)', () => {
    const a = castSpell({ key: 'troop:7308' }).summary;
    expect(a.gems.created).toMatchObject({ Yellow: 8, 'spiritGem/Purple': 8 });
    expect(a.units.C).toContain('+enchanted');
    const b = castSpell({ key: 'troop:7309' }).summary;
    expect(b.order[0]).toBe('dmg E11 13');
    expect(b.gems.created['spiritGem/Purple']).toBe(3);
  });
  it('troop:7363 Hanged Man: 2 Booty gems (English, dispute kept) and 7% per Blue gem counted before creation', () => {
    const s = castSpell({ key: 'troop:7363' }).summary;
    expect(s.gems.created.bootyGem).toBe(2);
    expect(s.order[0]).toBe('extra-turn skill');
    // 1 Blue gem -> 7%: most seeds give no extra turn
    const oneBlue = (r: number, c: number) => (r === 0 && c === 0 ? { kind: 'color', color: 'Blue' } : { kind: 'color', color: (r + c) % 2 ? 'Red' : 'Green' }) as never;
    let extra = 0;
    for (let seed = 1; seed <= 20; seed++) if (castSpell({ key: 'troop:7363', board: oneBlue, seed }).summary.extraTurn) extra++;
    expect(extra).toBeLessThan(6);
  });
});
