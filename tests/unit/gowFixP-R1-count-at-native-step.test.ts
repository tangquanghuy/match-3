// sa-P review round 2: P-R1-count-at-native-step.
// Native Count* army steps (CountArmyColor / CountArmyType / CountEnemies) run at their own position, usually
// step 0, before any damage: a unit killed by an earlier segment of the same spell is still counted.
// Engine: army sources with atCastStart read castTracking.unitsAtCastStart.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import type { GemType } from '@engine/types';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';

const tough = (o = {}) => ({ hp: 900, maxHp: 900, armor: 0, colors: [BaseColor.Red], ...o });
const frail = (o = {}) => ({ hp: 1, maxHp: 1, armor: 0, colors: [BaseColor.Red], ...o });
const explodeCount = (r: ReturnType<typeof castSpell>) => {
  const e = r.summary.order.find((s) => s.startsWith('explode'));
  return e ? Number(e.split(' ')[1]) : 0;
};
const DOOM: GemType = { kind: 'special', spec: { kind: 'doomSkull' } } as GemType;

describe('P-R1-count-at-native-step', () => {
  it('weapon:1158 Runeforger 7568: Brown enemy killed by the splash still adds one explosion', () => {
    const allies = [{ colors: [BaseColor.Red] }, { colors: [BaseColor.Red] }];
    const alive = castSpell({ key: 'weapon:1158', target: 11, allies, enemies: [tough(), tough({ colors: [BaseColor.Brown] }), tough(), tough()] });
    const killed = castSpell({ key: 'weapon:1158', target: 11, allies, enemies: [tough(), frail({ colors: [BaseColor.Brown] }), tough(), tough()] });
    expect(killed.f.enemies[1].defeated).toBe(true);
    expect(explodeCount(alive)).toBeGreaterThan(0);
    expect(explodeCount(killed)).toBe(explodeCount(alive));
  });
  it('troop:6593 Fallen Valdis 7797: Divine enemies killed by the damage still boost the Doomskull explosion', () => {
    // 6 Doomskulls far enough apart that one explosion never reaches another
    const board = withCells(reviewBoard, Object.fromEntries(['7,0', '7,3', '7,6', '4,0', '4,3', '4,6'].map((k) => [k, DOOM])));
    const divine = (e: object) => ({ ...e, troopTypes: ['Divine'] });
    const triggers = (r: ReturnType<typeof castSpell>) => r.summary.order.filter((s) => s === 'trigger doomSkull').length;
    const r = castSpell({ key: 'troop:6593', board, enemies: [divine(frail()), divine(frail()), tough(), tough()] });
    expect(r.f.enemies[0].defeated && r.f.enemies[1].defeated).toBe(true);
    expect(triggers(r)).toBe(3 + 2);
    expect(triggers(castSpell({ key: 'troop:6593', board, enemies: [tough(), tough(), tough(), tough()] }))).toBe(3);
  });
  it('troop:6115 Ranger 7207: scatter is boosted by the enemies alive at cast start (chosen target killed first)', () => {
    const r = castSpell({ key: 'troop:6115', target: 11, enemies: [tough(), frail(), tough(), tough()] });
    expect(r.f.enemies[1].defeated).toBe(true);
    const scatter = r.summary.order.filter((s) => s.endsWith('(scatter)')).reduce((a, s) => a + Number(s.split(' ')[2]), 0);
    expect(scatter).toBe(8 + 4 * 4);
  });
});
