// sa-P review round 2: P-R1-count-at-native-step.
// Native Count* army steps (CountArmyColor / CountArmyType / CountArmyKingdom) run at their own position, usually
// step 0, before any damage: a unit killed by an earlier segment of the same spell is still counted.
// Engine: army sources with atCastStart read castTracking.unitsAtCastStart.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell } from '../helpers/gowCast';

const tough = (o = {}) => ({ hp: 900, maxHp: 900, armor: 0, colors: [BaseColor.Red], ...o });
const frail = (o = {}) => ({ hp: 1, maxHp: 1, armor: 0, colors: [BaseColor.Red], ...o });
const explodes = (r: ReturnType<typeof castSpell>) => r.events.filter((e) => e.type === 'gem-explode').length;

describe('P-R1-count-at-native-step', () => {
  it('weapon:1158 Runeforger 7568: Brown enemy killed by the splash still adds one explosion', () => {
    const allies = [{ colors: [BaseColor.Red] }, { colors: [BaseColor.Red] }];
    const alive = castSpell({ key: 'weapon:1158', target: 11, allies, enemies: [tough(), tough({ colors: [BaseColor.Brown] }), tough(), tough()] });
    const killed = castSpell({ key: 'weapon:1158', target: 11, allies, enemies: [tough(), frail({ colors: [BaseColor.Brown] }), tough(), tough()] });
    expect(killed.f.enemies[1].defeated).toBe(true);
    expect(explodes(killed)).toBe(explodes(alive));
    expect(explodes(alive)).toBeGreaterThan(0);
  });
  it('troop:6593 Fallen Valdis 7797: Divine enemies killed by the damage still boost the Doomskull explosion', () => {
    const divine = (hp: number) => ({ ...(hp > 1 ? tough() : frail()), troopTypes: ['Divine'] });
    const r = castSpell({ key: 'troop:6593', enemies: [divine(1), divine(1), tough(), tough()] });
    expect(r.f.enemies[0].defeated && r.f.enemies[1].defeated).toBe(true);
    const seg = r.f.proto!.segments.find((s) => s.kind === 'gem') as { params: { modifier?: { source?: { atCastStart?: boolean } } } } | undefined;
    expect(seg?.params.modifier?.source?.atCastStart).toBe(true);
  });
  it('troop:7492 Amatiel 9237: Undead/Daemon enemies are counted before the Angel-gem explosion', () => {
    const r = castSpell({ key: 'troop:7492', enemies: [tough({ troopTypes: ['Undead'] }), tough({ troopTypes: ['Daemon'] }), tough(), tough()] });
    // [Magic 10 + 1] + 10 x 2 = 31 on every enemy (nobody dies before the damage here: sanity of the boost)
    expect(r.summary.order.filter((s) => s.startsWith('dmg')).every((s) => s.includes(' 31'))).toBe(true);
    const seg = r.f.proto!.segments.find((s) => s.kind === 'damage') as { params: { modifier?: { sources?: { atCastStart?: boolean }[] } } } | undefined;
    expect(seg?.params.modifier?.sources?.every((s) => s.atCastStart)).toBe(true);
  });
});
