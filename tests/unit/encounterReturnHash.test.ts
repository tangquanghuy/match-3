import { describe, expect, it } from 'vitest';
import { encounterReturnHash } from '../../src/meta/shell/battleLauncher';

describe('battle result return route', () => {
  it('returns ingot challenges to the forge tab, other bosses to the boss tab', () => {
    const event = { kind: 'event' as const, weekStart: 1, typeId: 'raidBoss' };
    expect(encounterReturnHash({ ...event, choice: 'ingot:5' }, '')).toBe('#events/raidBoss/forge');
    expect(encounterReturnHash({ ...event, choice: 'boss:1' }, '')).toBe('#events/raidBoss');
    expect(encounterReturnHash({ ...event, choice: 'ingot:1', typeId: 'towerOfDoom' }, '')).toBe('#events/towerOfDoom');
  });
});
