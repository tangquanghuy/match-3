// sa-P review round 2: P-R3-target-status-count + P-R3-ally-status-excl-self.
// - native CountSpecificStatusEffect@FromTarget (one step per status, each +1) counts the listed statuses on the chosen
//   target at cast start: weapon:1427 Elemental Reach 8640 (+12 each), troop:6936 Royal Assassin 8417 (+10 each).
// - native CountSpecificStatusEffect@AllAlliesButNotSelf: troop:7791 Immortal Khaomani 9808 ignores a Blessed caster.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';

const st = (...ids: string[]) => ids.map((id) => ({ id, turns: 3 }));
const e = (statuses: { id: string; turns: number }[] = []) => ({ hp: 900, maxHp: 900, armor: 0, statuses });
const dmgTo = (r: ReturnType<typeof castSpell>, who: string) => r.summary.order.filter((s) => s.startsWith(`dmg ${who} `)).map((s) => Number(s.split(' ')[2]));

describe('P-R3 status counts', () => {
  it('weapon:1427 8640: +12 per listed status on the target (burning + frozen -> +24)', () => {
    const r = castSpell({ key: 'weapon:1427', target: 11, enemies: [e(), e(st('burning', 'frozen')), e(), e()] });
    expect(dmgTo(r, 'E11')).toEqual([13 + 24]);
  });
  it('troop:6936 8417: only the target statuses count (poisoned E10 does not boost the hit on E11)', () => {
    const clean = castSpell({ key: 'troop:6936', target: 11, enemies: [e(st('poison')), e(), e(), e()] });
    expect(dmgTo(clean, 'E11')).toEqual([13]);
    const two = castSpell({ key: 'troop:6936', target: 11, enemies: [e(), e(st('poison', 'stun')), e(), e()] });
    expect(dmgTo(two, 'E11')).toEqual([13 + 20]);
  });
  it('troop:7791 9808: a Blessed caster is not one of the "other Allies"', () => {
    const plain = castSpell({ key: 'troop:7791', enemies: [e(), e(), e(), e()] });
    const blessed = castSpell({ key: 'troop:7791', enemies: [e(), e(), e(), e()], caster: { statuses: st('blessed') } });
    expect(dmgTo(blessed, 'E10')).toEqual(dmgTo(plain, 'E10'));
    const ally = castSpell({ key: 'troop:7791', enemies: [e(), e(), e(), e()], allies: [{ statuses: st('blessed') }, {}] });
    expect(dmgTo(ally, 'E10')[0]).toBeGreaterThan(dmgTo(plain, 'E10')[0]);
  });
});

// P-R3-precast-compare: troop:7533 9291 compares Armor with the chosen target before the hit (native step 0).
describe('P-R3-precast-compare', () => {
  const barrier = (r: ReturnType<typeof castSpell>) => r.f.caster.statuses.some((s) => s.id === 'barrier');
  it('troop:7533 9291: 5 Armor vs target 10 -> no Barrier even though the hit strips the target Armor', () => {
    const r = castSpell({ key: 'troop:7533', target: 11, caster: { armor: 5 } });
    expect(r.summary.order.findIndex((s) => s.startsWith('dmg E11'))).toBeGreaterThanOrEqual(0);
    expect(barrier(r)).toBe(false);
  });
  it('troop:7533 9291: 20 Armor vs target 10 -> Barrier, granted before the damage', () => {
    const r = castSpell({ key: 'troop:7533', target: 11, caster: { armor: 20 } });
    expect(barrier(r)).toBe(true);
    const o = r.summary.order;
    expect(o.findIndex((s) => s.includes('barrier'))).toBeLessThan(o.findIndex((s) => s.startsWith('dmg E11')));
  });
});
