import { describe, expect, it } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { applyStatus } from '@engine/skills/effects/status';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 10,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function team(side: PlayerSide, characters: Character[]): Team {
  return { player: side, characters };
}

describe('GoW special skull statuses', () => {
  const combat = new CombatResolver();

  it('Charm redirects the skull hit to the next living ally', () => {
    const attacker = makeChar(0);
    const ally = makeChar(1);
    const enemy = makeChar(4);
    applyStatus(attacker, { id: 'charm', turns: 2 });

    const out = combat.resolveSkullDamage(team(PlayerSide.Left, [attacker, ally]), team(PlayerSide.Right, [enemy]), 3);

    expect(ally.hp).toBe(45);
    expect(enemy.hp).toBe(50);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'skull-damage', targetId: ally.id }));
  });

  it('Enraged multiplies skull damage by 1.5 and emits expiry', () => {
    const attacker = makeChar(0);
    const enemy = makeChar(4);
    applyStatus(attacker, { id: 'rage', turns: 2 });

    const out = combat.resolveSkullDamage(team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [enemy]), 3);

    expect(enemy.hp).toBe(42);
    expect(attacker.statuses).toEqual([]);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'status-expire', targetId: attacker.id, statusId: 'rage' }));
  });
});
