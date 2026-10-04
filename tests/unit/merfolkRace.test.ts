import { describe, expect, it } from 'vitest';
import { getTroopById, troopToCharacter } from '../../src/data/troops';
import { applyBattleStartTraits, getTrait } from '../../src/engine/traits';
import { raceName } from '../../src/meta/data/races';
import { REGIONS } from '../../src/meta/data/regionalPvp';
import { typeCn } from '../../src/meta/screens/teamScreen';

function realTroop(id: number, position: number) {
  const data = getTroopById(id);
  if (!data) throw new Error(`Missing troop ${id}`);
  return troopToCharacter(data, position);
}

describe('特里同：海族种族和开局法力', () => {
  it('名册、世界事件和 PVP 都把 Merfolk 显示为「海族」', () => {
    for (const id of [7223, 6597, 6401, 6888, 6273]) {
      const troop = getTroopById(id)!;
      expect(troop.troopTypes).toContain('Merfolk');
      expect(typeCn(troop.troopTypes)).toContain('海族');
    }
    expect(raceName('Merfolk')).toBe('海族');
    expect(typeCn(['Wargare'])).toBe('狐人');
    expect(REGIONS.find((r) => r.id === 'BayOfStars')?.rules).toContainEqual({ kind: 'type', type: 'Merfolk', name: '海族' });
  });

  it('狐人的种族名称与特质文案一致，判定仍使用 Wargare 键', () => {
    expect(raceName('Wargare')).toBe('狐人');
    expect(getTrait('wargarebond')?.name).toBe('狐人族亲');
    expect(getTrait('wargarebond')?.description).toContain('狐人盟友');
    expect(getTroopById(6057)?.troopTypes).toContain('Wargare');
  });

  it('真实部队的海之希望只为海族（包括海洋生物、双种族与自身）补到一半法力', () => {
    expect(getTrait('seaofhope')?.allyStartMana).toEqual({ troopType: 'Merfolk', ratio: 0.5 });
    const triton = realTroop(7223, 0);
    const mermaid = realTroop(6597, 1);
    const hippocampus = realTroop(6401, 2);
    const wolf = realTroop(6057, 3);
    const enemy = realTroop(6402, 4);
    const allies = [triton, mermaid, hippocampus, wolf];
    applyBattleStartTraits(allies, [enemy]);
    for (const ally of allies.slice(0, 3)) expect(ally.mana).toBe(Math.floor(ally.manaCost / 2));
    expect(wolf.mana).toBe(0);
    expect(enemy.mana).toBe(0);
    applyBattleStartTraits(allies, [enemy]);
    expect(mermaid.mana).toBe(Math.floor(mermaid.manaCost / 2));
  });
});
