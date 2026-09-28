// Shared real-cast harness self-test (tests/helpers/gowCast.ts), checked against skills already reviewed by hand.
import { describe, it, expect } from 'vitest';
import { castSpell, entitySkill, registry, summaryLine, sixColourBoard } from '../helpers/gowCast';
import { BaseColor, PlayerSide } from '@engine/types';

describe('gowCast harness', () => {
  it('binds troops by spell id and weapons by gw_<referenceName>, as the game does', () => {
    expect(entitySkill('troop:6614')).toMatchObject({ skill: '7946', cost: 7, colors: [BaseColor.Brown], kind: 'troop' });
    const w = entitySkill('weapon:1013');
    expect(w.skill).toMatch(/^gw_/); expect(w.numericSkill).toBe('7079');
    expect(registry.prototypes.get(w.skill)).toBeDefined();
  });
  it('six-colour default board has no line of three', () => {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
      const a = sixColourBoard(r, c), b = sixColourBoard(r, c + 1), d = sixColourBoard(r, c + 2);
      expect(a && b && d && a.kind === 'color' && b.kind === 'color' && d.kind === 'color' && a.color === b.color && b.color === d.color).toBe(false);
    }
  });
  it('troop:6614 Gain 20 Gold: economy +20 for the caster side only, mana spent, turn passes', () => {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const { summary } = castSpell({ key: 'troop:6614', side });
      expect(summary.economy).toEqual({ gold: 20, goldMine: 20 }); expect(summary.casterMana).toBe(0); expect(summary.turnKept).toBe(false);
      expect(Object.keys(summary.units).filter(k => k.startsWith('E'))).toEqual([]);
    }
  });
  it('troop:6352 two strongest enemies (R005 Life+Armor): E11 (900) and E13 (803) are hit, nobody else', () => {
    const { summary } = castSpell({ key: 'troop:6352', magic: 0 });
    expect(summary.order.filter(x => x.startsWith('dmg')).map(x => x.split(' ')[1]).sort()).toEqual(['E11', 'E13']);
    expect(summaryLine(summary)).toContain('dmg E11');
  });
  it('casts are isolated: statuses applied in one cast never leak into the defaults or the next cast', async () => {
    const { DEFAULT_ALLIES, DEFAULT_ENEMIES } = await import('../helpers/gowCast');
    const before = JSON.stringify([DEFAULT_ALLIES, DEFAULT_ENEMIES]);
    const first = summaryLine(castSpell({ key: 'troop:6352' }).summary);
    castSpell({ key: 'troop:6025' }); castSpell({ key: 'troop:7375' }); // Barrier/Enchant on allies
    expect(JSON.stringify([DEFAULT_ALLIES, DEFAULT_ENEMIES])).toBe(before);
    expect(summaryLine(castSpell({ key: 'troop:6352' }).summary)).toBe(first);
  });
  it('under-mana cast is refused', () => {
    const { summary } = castSpell({ key: 'troop:6614', caster: { mana: 3 } });
    expect(summary.refused).toBe(true); expect(summaryLine(summary)).toBe('REFUSED');
  });
});
