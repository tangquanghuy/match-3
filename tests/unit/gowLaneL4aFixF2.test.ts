// sa-F2 fix round A (lane L4a): cases the four standard golden scenarios cannot show.
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { BaseColor, specialGem } from '@engine/types';
import { castSpell, setupCast, summarize, withCells, reviewBoard, SCENARIOS } from '../helpers/gowCast';

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

describe('L4a fix F2: kill branches', () => {
  // troop:7345 spell 8973: ExplodeColor@FromTarget DeathMark [AddForKill 100]
  const board = withCells(reviewBoard, { '6,1': specialGem('deathMarkGem'), '2,2': specialGem('deathMarkGem') });
  it('troop:7345 kill -> explodes every Death Mark Gem', () => {
    const r = castSpell({ key: 'troop:7345', board, ...SCENARIOS.K });
    // two non-overlapping 3x3 explosions around (6,1) and (2,2)
    expect(r.summary.gems.exploded).toBe(18);
  });
  it('troop:7345 no kill -> Death Mark Gems stay', () => {
    const r = castSpell({ key: 'troop:7345', board });
    expect(r.summary.order.some(x => x.startsWith('explode'))).toBe(false);
  });
});

describe('L4a fix F2: troop:6623 (spell 7941) Silenced enemy -> Enchant other allies', () => {
  it('a Silenced enemy: allies (not the caster) become Enchanted; Life gain before the column explodes', () => {
    const enemies = [0, 1, 2, 3].map(i => ({ hp: 500, maxHp: 500, statuses: i === 2 ? [{ id: 'silence', turns: 99 }] as never : [] }));
    const r = castSpell({ key: 'troop:6623', enemies });
    expect(r.summary.order.filter(x => x.startsWith('status'))).toEqual(['status A1 +enchanted', 'status A2 +enchanted']);
    expect(r.summary.order.findIndex(x => x.startsWith('buff C hp+11'))).toBeLessThan(r.summary.order.findIndex(x => x.startsWith('explode')));
  });
  it('no Silenced enemy: no Enchant', () => {
    expect(castSpell({ key: 'troop:6623' }).summary.order.some(x => x.startsWith('status'))).toBe(false);
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
