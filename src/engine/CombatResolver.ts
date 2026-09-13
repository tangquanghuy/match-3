import type { Team, Character, StatGains } from './types';
import type { GameEvent } from './events';
import type { SeededRNG } from './rng';
import { canAttack, isFrozen, isEntangled, applyStatus, consumeBarrier } from './skills/effects/status';
import { passivesOf, skullDamageMultiplier } from './traits';

/** 战斗结算产出的事件 */
/** 就地施加一组被动增益并产出 buff 事件；生命同时抬上限。 */
function applyStatGains(char: Character, gains: StatGains, events: GameEvent[]): void {
  for (const stat of ['hp', 'armor', 'attack', 'magic'] as const) {
    const amount = gains[stat];
    if (amount === 0) continue;
    if (stat === 'hp') {
      char.maxHp += amount;
      char.hp = Math.min(char.maxHp, char.hp + amount);
    } else {
      char[stat] = Math.max(0, char[stat] + amount);
    }
    events.push({ type: 'buff', targetId: char.id, stat, amount });
  }
}

export interface CombatOutcome {
  /**
   * 用宽泛的 GameEvent 而不是骷髅三件套的联合类型：命中触发类特质（毒液）会在
   * 骷髅结算里顺带产出 status-apply，将来的反弹/召唤类特质同理。
   */
  events: GameEvent[];
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
    // 保留参数以稳定签名：GoW 规则下骷髅数不参与伤害乘算，
    // 4/5 连的收益是额外回合。将来若要加「每多一颗 +1」可直接在此启用。
    _skullCount: number,
    /** 闪避判定用的随机源；缺省时闪避特质不生效（纯逻辑单测可省略） */
    rng?: Pick<SeededRNG, 'next'>,
  ): CombatOutcome {
    const events: GameEvent[] = [];

    const attacker = CombatResolver.frontAlive(attackerTeam);
    const target = CombatResolver.frontAlive(defenderTeam);
    if (!attacker || !target) return { events };

    // 队首攻击者被控（冰冻/缠绕/击晕）→ 攻击落空、不造成伤害，只发"挣扎"事件（需求：只有队首能攻击）
    if (!canAttack(attacker)) {
      const reason = isFrozen(attacker) ? 'frozen' : isEntangled(attacker) ? 'entangle' : 'stun';
      events.push({ type: 'attack-struggle', attackerId: attacker.id, reason });
      return { events };
    }

    // 闪避特质（敏捷/轻巧）：命中判定在扣血之前，闪避成功等同攻击落空，
    // 因此受击类触发（狂暴）与命中类触发（毒液）都不生效。
    const dodgeChance = passivesOf(target).dodgeChance;
    if (dodgeChance > 0 && rng !== undefined && rng.next() < dodgeChance) {
      events.push({ type: 'attack-struggle', attackerId: attacker.id, reason: 'dodge' });
      return { events };
    }

    // 伤害公式对齐 Gems of War：一次骷髅匹配只触发一次普攻，伤害等于队首攻击者的攻击力，
    // 多消的骷髅不参与乘算（4/5 连的收益体现为额外回合，见 grantsExtraTurn）。
    // 原先用「攻击力 × 骷髅数」，在接入官方兵种数值后会让三连就打死满级角色。
    // 屠戮类倍率（龙族杀手/纵火狂/痛揍…）先放大，再由目标的减伤特质折算
    const raw = attacker.attack * skullDamageMultiplier(attacker, target);
    const damage = Math.max(0, Math.round(raw * passivesOf(target).skullDamageTaken));

    // 屏障：整发吸收后消失。等同于攻击落空，故与闪避走同一条出口——
    // 受击触发（狂暴）、命中触发（毒液）、反弹（荆棘）一律不启动。
    if (damage > 0) {
      const barrier = consumeBarrier(target);
      if (barrier.consumed) {
        events.push({ type: 'attack-struggle', attackerId: attacker.id, reason: 'barrier' });
        events.push(...barrier.events);
        return { events };
      }
    }

    // 先扣护甲后扣血（需求 14.4）；穿透护甲特质按概率直接跳过护甲
    const pierceChance = passivesOf(attacker).armorPierceChance;
    const piercing = pierceChance > 0 && rng !== undefined && rng.next() < pierceChance;
    const absorbed = piercing ? 0 : Math.min(target.armor, damage);
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

    // 受击触发（狂暴/兽人报甲…）：落空不触发，因此放在实际扣血之后
    const targetPassive = passivesOf(target);
    if (!target.defeated) applyStatGains(target, targetPassive.gainOnDamaged, events);
    // 命中触发：自身增益（国王之意…）+ 给目标附状态（毒液…）
    const attackerPassive = passivesOf(attacker);
    applyStatGains(attacker, attackerPassive.gainOnSkullHit, events);
    if (attackerPassive.inflictOnSkullHit && !target.defeated) {
      const inflicted = applyStatus(target, {
        id: attackerPassive.inflictOnSkullHit.id,
        turns: attackerPassive.inflictOnSkullHit.turns,
        ...(attackerPassive.inflictOnSkullHit.magnitude !== undefined
          ? { magnitude: attackerPassive.inflictOnSkullHit.magnitude }
          : {}),
      });
      events.push(...inflicted);
    }

    // 反弹特质（炼狱护甲/荆棘/米提护甲）：按减伤后的实际伤害折算反打攻击者。
    // 反弹伤害不再触发攻击者身上的反弹，避免两个反弹角色互相弹到死循环。
    const reflectRatio = targetPassive.reflectSkullRatio;
    if (reflectRatio > 0) {
      const reflected = Math.max(0, Math.round(damage * reflectRatio));
      if (reflected > 0 && !attacker.defeated) {
        const takenByArmor = Math.min(attacker.armor, reflected);
        attacker.armor -= takenByArmor;
        attacker.hp = Math.max(0, attacker.hp - (reflected - takenByArmor));
        events.push({
          type: 'skull-damage',
          attackerId: target.id,
          targetId: attacker.id,
          damage: reflected,
          resultingHp: attacker.hp,
          resultingArmor: attacker.armor,
        });
        if (attacker.hp <= 0 && !attacker.defeated) {
          attacker.defeated = true;
          events.push({ type: 'defeat', characterId: attacker.id });
        }
      }
    }

    if (target.hp <= 0 && !target.defeated) {
      target.defeated = true;
      events.push({ type: 'defeat', characterId: target.id });
    }

    return { events };
  }

  /** 队伍是否全灭（需求 15.3） */
  static isWipedOut(team: Team): boolean {
    const hasActive = team.characters.some((ch) => !ch.defeated);
    const hasQueued = (team.summonQueue?.length ?? 0) > 0;
    return !hasActive && !hasQueued;
  }
}
