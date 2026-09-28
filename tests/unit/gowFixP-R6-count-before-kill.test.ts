// sa-P review round 4: P-R6-count-before-kill (weapon:1563-1568 / spells 9211-9216).
// Closed by P-R1-count-at-native-step: alliesOfColor / enemiesOfColor carry atCastStart, so enemies killed by the
// preceding FirstTwoEnemies damage still count for the native CountArmyColor step-0 gem creation.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell } from '../helpers/gowCast';
const KEYS: Array<[string, BaseColor]> = [
  ['weapon:1563', BaseColor.Blue], ['weapon:1564', BaseColor.Green], ['weapon:1565', BaseColor.Red],
  ['weapon:1566', BaseColor.Yellow], ['weapon:1567', BaseColor.Purple], ['weapon:1568', BaseColor.Brown],
];
describe('P-R6-count-before-kill', () => {
  for (const [key, color] of KEYS) {
    it(`${key}: enemies killed by the damage still count (caster + 4 enemies -> 10 ${color} gems)`, () => {
      const r = castSpell({ key, colors: [color], allies: [{ colors: [color === BaseColor.Red ? BaseColor.Blue : BaseColor.Red] }],
        enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, colors: [color] })) });
      expect(r.f.enemies[0].defeated && r.f.enemies[1].defeated).toBe(true);
      expect(r.summary.gems.created[color] ?? 0).toBe(10);
    });
  }
});
