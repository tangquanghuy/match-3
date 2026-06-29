import type { Team, Character } from './types';
import type { SkullDamageEvent, DefeatEvent } from './events';

/** 战斗结算产出的事件 */
export interface CombatOutcome {
  events: (SkullDamageEvent | DefeatEvent)[];
}

/**
 * 战斗解析器（需求 14, 15）。
 * 普攻规则：攻击者与受击者均为各自队伍"队首存活角色"，敌我一致（需求 14.3）。
 */
export class CombatResolver {
  /** 取队伍中从上到下第一个未阵亡角色（队首存活角色） */
  static frontAlive(team: Team): Character | null {
    for (const ch of team.characters) {
      if (!ch.defeated) return ch;
    }
    return null;
  }

  /**
   * 结算一次骷髅匹配造成的伤害。
   * @param attackerTeam 当前玩家队伍（攻击方）
   * @param defenderTeam 敌方队伍（受击方）
   * @param skullCount 该匹配的骷髅数 N
   */
  resolveSkullDamage(
    attackerTeam: Team,
    defenderTeam: Team,
    skullCount: number,
  ): CombatOutcome {
    const events: (SkullDamageEvent | DefeatEvent)[] = [];

    const attacker = CombatResolver.frontAlive(attackerTeam);
    const target = CombatResolver.frontAlive(defenderTeam);
    if (!attacker || !target) return { events };

    // 伤害公式：队首攻击者攻击力 × 骷髅数（需求 14.1，封装为可替换策略）
    const damage = attacker.attack * skullCount;

    // 先扣护甲后扣血（需求 14.4）
    const absorbed = Math.min(target.armor, damage);
    target.armor -= absorbed;
    const hpDamage = damage - absorbed;
    target.hp = Math.max(0, target.hp - hpDamage);

    events.push({
      type: 'skull-damage',
      attackerId: attacker.id,
      targetId: target.id,
      damage,
      resultingHp: target.hp,
      resultingArmor: target.armor,
    });

    if (target.hp <= 0 && !target.defeated) {
      target.defeated = true;
      events.push({ type: 'defeat', characterId: target.id });
    }

    return { events };
  }

  /** 队伍是否全灭（需求 15.3） */
  static isWipedOut(team: Team): boolean {
    return team.characters.every((ch) => ch.defeated);
  }
}
