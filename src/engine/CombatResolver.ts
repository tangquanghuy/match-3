import type { Team, Character, StatGains } from './types';
import type { GameEvent } from './events';
import type { SeededRNG } from './rng';
import {
  canAttack, isFrozen, isEntangled, isEnraged, isCharmed,
  applyStatus, consumeBarrier, RAGE_STATUS_IDS,
  hasStatus, REFLECT_STATUS_ID, reflectDamageAmount, consumeReflect,
} from './skills/effects/status';
import { passivesOf, skullDamageMultiplier } from './traits';

/** 战斗结算产出的事件 */
/** 就地施加一组被动增益并产出 buff 事件；生命同时抬上限；法力按上限夹取。 */
function applyStatGains(char: Character, gains: StatGains, events: GameEvent[]): void {
  for (const stat of ['hp', 'armor', 'attack', 'magic', 'mana'] as const) {
    const amount = gains[stat];
    if (amount === 0) continue;
    if (stat === 'hp') {
      char.maxHp += amount;
      char.hp = Math.min(char.maxHp, char.hp + amount);
    } else if (stat === 'mana') {
      // 法力增益按法力上限夹取（zornsfury「在自身受到伤害时获得 4 点法力值」），
      // 实际入账量按夹取后的差值发事件。
      const before = char.mana;
      char.mana = Math.max(0, Math.min(char.manaCost, char.mana + amount));
      const delta = char.mana - before;
      if (delta !== 0) events.push({ type: 'buff', targetId: char.id, stat, amount: delta });
      continue;
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

  private static frontAliveExcept(team: Team, excludedId: number): Character | null {
    for (const ch of team.characters) {
      if (ch.id !== excludedId && !ch.defeated) return ch;
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
    /**
     * 闪避判定用的随机源；缺省时闪避特质不生效（纯逻辑单测可省略）
     */
    rng?: Pick<SeededRNG, 'next'>,
    /** 附加固定伤害（末日骷髅匹配 +5）：计入攻击方倍率之后、目标减伤之前 */
    bonusDamage = 0,
  ): CombatOutcome {
    const events: GameEvent[] = [];

    const attacker = CombatResolver.frontAlive(attackerTeam);
    // Charm makes the front troop attack its own next living ally. If it is
    // alone, fall back to the opposing front troop so the match can resolve.
    const target = attacker && isCharmed(attacker)
      ? (CombatResolver.frontAliveExcept(attackerTeam, attacker.id) ?? CombatResolver.frontAlive(defenderTeam))
      : CombatResolver.frontAlive(defenderTeam);
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
    // 屠戮类倍率（龙族杀手/纵火狂/痛揍…）先放大，附加固定伤害（末日骷髅 +5）随后叠加，
    // 再由目标的减伤特质折算
    const enraged = isEnraged(attacker);
    const raw = attacker.attack * skullDamageMultiplier(attacker, target) * (enraged ? 1.5 : 1) + bonusDamage;
    // Enraged ignores enemy traits, including skull damage reduction.
    const damage = Math.max(0, Math.round(raw * (enraged ? 1 : passivesOf(target).skullDamageTaken)));

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
    if (!enraged && !target.defeated) {
      applyStatGains(target, targetPassive.gainOnDamaged, events);
      // 承伤队伍光环（virtueofhumility「当自身生命值承受伤害时，所有盟友获得 2 点护甲值和
      // 魔法值」）：与 gainOnDamaged 同一触发点，受益者为受击者一方存活盟友
      //（'all'=全队/种族名）。目标可能在攻击方（被魅惑打自己人），按归属取队伍。
      const aura = targetPassive.onDamagedTypeAura;
      if (aura) {
        const ownTeam = attackerTeam.characters.includes(target) ? attackerTeam : defenderTeam;
        for (const member of ownTeam.characters) {
          if (member.defeated) continue;
          if (aura.troopType !== 'all' && !(member.troopTypes ?? []).includes(aura.troopType)) continue;
          applyStatGains(member, { hp: 0, armor: 0, attack: 0, magic: 0, mana: 0, ...aura.gains }, events);
        }
      }
    }
    // 受击附状态（aquatic「在自身受到伤害时使自身下潜」）：与受击增益同一触发口径
    //（同为落空不触发），施加走 applyStatus（免疫在施加口拦截）；下潜=不可被指定
    //（UNTARGETABLE_STATUS_IDS），回合尾随持有者方状态结算递减。
    if (!enraged && !target.defeated && targetPassive.onDamagedStatus) {
      const s = targetPassive.onDamagedStatus;
      events.push(...applyStatus(target, { id: s.statusId, turns: s.turns }));
    }
    // 受击使对方首位陷入状态（接线批 deathray 死光「在自身生命值受损时，使敌方第一名敌人
    // 陷入死亡标记效果」）：与 onDamagedStatus 同一触发口径（落空不触发、激怒无视敌方
    // 特质）；目标=持有者对面阵营的队伍序首位存活（确定性、零随机消耗）——受魅惑反打时
    // 按持有者归属取对面（与 onDamagedTypeAura 同款裁定）。
    if (!enraged && !target.defeated && targetPassive.onDamagedEnemyStatus) {
      const foeTeam = attackerTeam.characters.includes(target) ? defenderTeam : attackerTeam;
      const first = CombatResolver.frontAlive(foeTeam);
      if (first) {
        const s = targetPassive.onDamagedEnemyStatus;
        events.push(...applyStatus(first, { id: s.id, turns: s.turns }));
      }
    }
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
    // 命中附状态·多条版（接线批 brokenjaw 断颚「使第一位敌人陷入出血和沉默状态」）：
    // 与单条版同一触发口径（伤害实际成立后结算），条目按描述顺序逐条施加。
    if (attackerPassive.inflictOnSkullHitList && !target.defeated) {
      for (const s of attackerPassive.inflictOnSkullHitList) {
        events.push(...applyStatus(target, {
          id: s.id,
          turns: s.turns,
          ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}),
        }));
      }
    }
    // 命中窃法（接线批 siphon 吸星大法「在造成骷髅头伤害时，窃取敌人法力值」，官方
    // RawData Modifier=1）：从本次受击目标削多少偷多少（目标夹零；manashield 免疫在
    // 削减口整体跳过——不削也不偷），自己按 manaCost 夹取回灌，实际入账量发事件。
    if (attackerPassive.onSkullHitStealMana && !target.defeated
      && !passivesOf(target).manaOpsImmunity) {
      const stolen = Math.min(attackerPassive.onSkullHitStealMana, target.mana);
      if (stolen > 0) {
        target.mana -= stolen;
        events.push({ type: 'buff', targetId: target.id, stat: 'mana', amount: -stolen });
        const before = attacker.mana;
        attacker.mana = Math.min(attacker.manaCost, attacker.mana + stolen);
        const gained = attacker.mana - before;
        if (gained > 0) events.push({ type: 'buff', targetId: attacker.id, stat: 'mana', amount: gained });
      }
    }

    // 承受骷髅伤害附状态（毒孢子族）：被打时反手给攻击者上状态。
    // 与受击增益同口径：闪避/屏障/挣扎路径在上面已提前返回，走到这里说明伤害实际成立。
    if (!enraged && targetPassive.inflictOnSkullDamaged && !attacker.defeated) {
      const s = targetPassive.inflictOnSkullDamaged;
      events.push(...applyStatus(attacker, {
        id: s.id,
        turns: s.turns,
        ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}),
      }));
    }

    // 承受骷髅伤害附状态·多条版（双状态诅咒族 frozencurse 等）：逐条施加，
    // 与单条版同一触发口径（enraged 攻击者不吃反手状态）。
    if (!enraged && !attacker.defeated) {
      for (const s of targetPassive.inflictOnSkullDamagedList ?? []) {
        events.push(...applyStatus(attacker, {
          id: s.id,
          turns: s.turns,
          ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}),
        }));
      }
    }

    // 反弹特质（炼狱护甲/荆棘/米提护甲）：按减伤后的实际伤害折算反打攻击者。
    // 反弹伤害不再触发攻击者身上的反弹，避免两个反弹角色互相弹到死循环。
    const reflectRatio = enraged ? 0 : targetPassive.reflectSkullRatio;
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

    // 反弹状态（GoW Reflect，gowhead 步骤名 Mirror）：所受伤害 50% 反弹（至少 1 点），
    // 受一次伤害后消失。与特质反弹（按比例）可叠加；激怒只无视特质，不免疫状态反弹。
    // 屏障整发吸收的「攻击落空」路径在上面已提前返回，不会走到这里。
    if (damage > 0 && !attacker.defeated && hasStatus(target, REFLECT_STATUS_ID)) {
      const reflected = reflectDamageAmount(damage);
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
      events.push(...consumeReflect(target));
      if (attacker.hp <= 0 && !attacker.defeated) {
        attacker.defeated = true;
        events.push({ type: 'defeat', characterId: attacker.id });
      }
    }

    if (target.hp <= 0 && !target.defeated) {
      target.defeated = true;
      events.push({ type: 'defeat', characterId: target.id });
    }

    // 骷髅即死/猎杀（职业天赋 bullseye「15% 几率一击致命」/ assassinate「造成骷髅伤害时
    // 10% 猎杀最后一名敌人」）：伤害实际成立（非闪避/屏障/挣扎路径）后判定。即死=本次
    // 受击目标无论剩余生命直接阵亡；猎杀=敌方队伍序末位存活（defeat 出编队管线照常）。
    // 概率经同一条种子化 rng（无 rng 不生效，与闪避判定同口径）；目标已阵亡则跳过。
    if (!target.defeated && rng !== undefined) {
      const lethal = passivesOf(attacker).skullLethalChance ?? 0;
      if (lethal > 0 && rng.next() < lethal) {
        target.hp = 0;
        target.defeated = true;
        events.push({ type: 'defeat', characterId: target.id });
      } else {
        const killSpec = passivesOf(attacker).onSkullHitKill;
        if (killSpec && rng.next() < killSpec.chance) {
          const foes = defenderTeam.characters.filter((c) => !c.defeated && c.id !== target.id);
          const last = foes[foes.length - 1];
          if (last) {
            last.hp = 0;
            last.defeated = true;
            events.push({ type: 'defeat', characterId: last.id });
          }
        }
      }
    }

    if (enraged) {
      // Capture the active rage aliases before removing them so the presentation
      // layer receives one expiry event for every status instance that ended.
      const consumed = attacker.statuses.filter((s) => RAGE_STATUS_IDS.has(s.id));
      attacker.statuses = attacker.statuses.filter((s) => !RAGE_STATUS_IDS.has(s.id));
      for (const status of consumed) {
        events.push({ type: 'status-expire', targetId: attacker.id, statusId: status.id });
      }
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
