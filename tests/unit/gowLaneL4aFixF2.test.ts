// sa-F2 fix round A (lane L4a): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, setupCast, summarize } from '../helpers/gowCast';

describe('L4a fix F2: dispel before self-kill / storm condition', () => {
  // troop:6457 spell 7635: native 3:Dispel@Self then 4:Damage@Self 10000
  it('troop:6457 destroys itself even with Barrier', () => {
    const r = castSpell({ key: 'troop:6457', caster: { statuses: [{ id: 'barrier', turns: 99 }] as never } });
    expect(r.summary.units.C).toContain('DEAD');
    expect(r.summary.order).toContain('defeat C');
  });
  // weapon:1277 spell 8153: TrueDamage@FromTarget 4+M ; TrueDamage@AllEnemies [AddForAnyStorm 15] ; RemoveStorm
  it('weapon:1277 with a Storm: +15 true damage to all enemies, then the Storm ends', () => {
    const f = setupCast({ key: 'weapon:1277' });
    f.engine.debugSetStorm(BaseColor.Red, f.side);
    const s = summarize(f, f.cast());
    expect(s.order.filter(x => x.startsWith('dmg'))).toEqual(['dmg E11 14', 'dmg E10 15 (all)', 'dmg E11 15 (all)', 'dmg E12 15 (all)', 'dmg E13 15 (all)']);
    expect(s.order.some(x => x.startsWith('storm none'))).toBe(true);
  });
  it('weapon:1277 without a Storm: chosen enemy only', () => {
    const r = castSpell({ key: 'weapon:1277' });
    expect(r.summary.order.filter(x => x.startsWith('dmg'))).toEqual(['dmg E11 14']);
  });
});

describe('L4a fix F2: position-relative targets', () => {
  // troop:7009 spell 8541: native IncreaseAttack@AboveSelf 1 +Mx1 ; IncreaseSpellPower@BelowSelf 3
  it('troop:7009 gives [Magic + 1] Attack to allies above and 3 Magic to allies below', () => {
    const r = castSpell({ key: 'troop:7009', before: [{}, {}] });
    const order = r.summary.order.filter(x => x.startsWith('buff'));
    expect(order).toEqual(['buff A5 attack+11', 'buff A6 attack+11', 'buff A1 magic+3', 'buff A2 magic+3']);
    // negative: magic 0 -> attack +1, magic buff unchanged; caster itself untouched
    const r0 = castSpell({ key: 'troop:7009', before: [{}], magic: 0 });
    expect(r0.summary.order.filter(x => x.startsWith('buff'))).toEqual(['buff A5 attack+1', 'buff A1 magic+3', 'buff A2 magic+3']);
    expect(r0.summary.units.C).toBeUndefined();
  });
});
