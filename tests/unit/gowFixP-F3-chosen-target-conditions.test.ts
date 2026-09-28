// P-F3-lasttarget-damaged (troop:6587, spell 7791) and P-F3-prehit-target-compare (troop:6483, spell 7670):
// global conditions on the native FromTarget (the chosen enemy), independent of which segment ran last.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';

const rageOnCaster = (order: string[]) => order.filter(l => l === 'status C +rage').length;

describe('P-F3-lasttarget-damaged: 7791 Damage [AddForDamaged 10] -> Enrage@Self [AddForKill] -> CountSet@FromTarget [AddForDamaged] -> Enrage@Self', () => {
  it('full-Life target survives the hit (now damaged) -> caster Enraged', () => {
    const r = castSpell({ key: 'troop:6587' });
    expect(r.summary.order.some(l => l.startsWith('dmg E11'))).toBe(true);
    expect(rageOnCaster(r.summary.order)).toBe(1);
  });
  it('target fully healed and hit fully absorbed by Barrier -> not damaged -> no Rage', () => {
    const r = castSpell({ key: 'troop:6587', enemies: [{}, { hp: 900, maxHp: 900, armor: 10, statuses: [{ id: 'barrier', turns: 99 }] }, {}, {}] });
    expect(rageOnCaster(r.summary.order)).toBe(0);
  });
});

describe('P-F3-prehit-target-compare: 7670 CountSet [AddForMoreLifeOnTarget 20] -> GiveSouls 10 -> Damage [MultiplyForMoreLifeOnTarget 3]', () => {
  it('Life compared before the hit: E11 900 > caster 890 -> souls 30 and x3 damage even though the hit drops E11 below 890', () => {
    const r = castSpell({ key: 'troop:6483', caster: { hp: 890 } });
    expect(r.summary.economy.souls).toBe(30);
    const hit = r.summary.order.find(l => l.startsWith('dmg E11'));
    expect(hit).toBe('dmg E11 39');
    // native order: souls before damage
    const iSouls = r.summary.order.findIndex(l => /souls/.test(l));
    const iDmg = r.summary.order.findIndex(l => l.startsWith('dmg E11'));
    if (iSouls >= 0) expect(iSouls).toBeLessThan(iDmg);
  });
  it('E11 Life not above the caster -> souls 10 and plain damage', () => {
    const r = castSpell({ key: 'troop:6483', caster: { hp: 950 } });
    expect(r.summary.economy.souls).toBe(10);
    expect(r.summary.order.find(l => l.startsWith('dmg E11'))).toBe('dmg E11 13');
  });
});
