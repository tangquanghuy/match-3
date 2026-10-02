import { describe, expect, it } from 'vitest';
import { getTroopById } from '../../src/data/troops';
import { enemyToSnapshot, troopToSnapshot, buildPlayerSnapshots, encounterPower } from '../../src/meta/systems/battleBridge';
import { combatantPower, teamPower } from '../../src/meta/systems/combatPower';
import { buildBracket, invasionPlayerPower } from '../../src/meta/systems/invasion';
import { newSave } from '../../src/meta/state/schema';

describe('战力', () => {
  it('同一部队的属性、品质、特质与法力效率各自提高评分', () => {
    const troop = getTroopById(6000)!;
    const rec = { copies: 0, level: 20, ascension: 0, traits: [false, false, false] as [boolean, boolean, boolean], locked: false };
    const base = troopToSnapshot(troop, rec, 'troop');
    const stats = combatantPower(base);
    expect(combatantPower({ ...base, stats: { ...base.stats, hp: base.stats.hp + 10 } })).toBe(stats + 10);
    expect(combatantPower({ ...base, manaCost: 12 })).toBeGreaterThan(combatantPower({ ...base, manaCost: 18 }));
    rec.ascension = 1;
    expect(combatantPower(troopToSnapshot(troop, rec, 'troop'))).toBe(stats + 12);
    rec.traits[0] = true;
    expect(combatantPower(troopToSnapshot(troop, rec, 'troop'))).toBeGreaterThan(stats + 12);
    const strongerEnemy = enemyToSnapshot(troop, { troopId: troop.id, level: 40, tier: 'minion' }, 0);
    expect(combatantPower(strongerEnemy)).toBeGreaterThan(combatantPower(troopToSnapshot(troop, rec, 'troop')));
  });

  it('玩家出战、敌人预览和入侵人机都使用同一份四人评分', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    const built = buildPlayerSnapshots(save);
    if (!built.ok) throw new Error(built.message);
    expect(invasionPlayerPower(save)).toBe(teamPower(built.playerTeam));
    const mirror = buildBracket(0, 0)[0]!;
    expect(mirror.rating).toBe(encounterPower(mirror.defense));
  });
});
