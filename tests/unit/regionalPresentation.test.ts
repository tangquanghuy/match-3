import { describe, expect, it } from 'vitest';
import type { CombatantSnapshot } from '../../src/session/contract';
import { regionalPortraitStats } from '../../src/meta/screens/regionalPresentation';

const snapshot: CombatantSnapshot = {
  externalId: 'preview-enemy', templateId: '6029', name: '敌方部队',
  stats: { attack: 45, armor: 62, hp: 123, magic: 27 },
  manaColors: ['Blue', 'Purple'] as CombatantSnapshot['manaColors'], manaCost: 14,
};

describe('regional preview portrait stats', () => {
  it('renders five fields directly from the modified combat snapshot', () => {
    const html = regionalPortraitStats(snapshot);
    expect(html.match(/data-stat=/g)).toHaveLength(5);
    for (const label of ['攻击 45', '护甲 62', '生命 123', '魔力 27', '法力消耗 14']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('preserves zero and large values without deriving catalog or arena stats', () => {
    const html = regionalPortraitStats({ ...snapshot, manaCost: 0, stats: { attack: 0, armor: 999, hp: 1234, magic: 0 } });
    for (const label of ['攻击 0', '护甲 999', '生命 1234', '魔力 0', '法力消耗 0']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
