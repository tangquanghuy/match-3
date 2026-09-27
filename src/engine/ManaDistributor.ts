import type { Team, BaseColor } from './types';
import type { ManaGainEvent } from './events';
import { PlayerSide } from './types';
import { canGainMana, hasStatus } from './skills/effects/status';
import { manaLinkBonus } from './traits';

/**
 * 法力分配器（需求 10, 11, 12）—— 单一法力条模型（照搬《Gems of War》）。
 *
 * 每个角色只有一条法力（Character.mana），关联的任一颜色（Character.colors）
 * 都能为这条法力充能，累积到 manaCost 即满。
 *
 * 分配规则：从上到下顺序吸收。某色匹配产出的法力，按队伍索引 0→3 依次填充，
 * 只喂给「关联该色且未满」的角色；某角色喂满后，剩余法力溢出给下一个符合条件者；
 * 无人可接则丢弃。一次匹配的总量恒等于消除宝石数（不放大），因此不会永动。
 */
export class ManaDistributor {
  /**
   * 为某玩家分配一次颜色法力产出。
   * @returns 产生的 mana-gain 事件（每个实际接收者一个）
   */
  distribute(
    team: Team,
    player: PlayerSide,
    color: BaseColor,
    amount: number,
  ): ManaGainEvent[] {
    const events: ManaGainEvent[] = [];
    let remaining = amount;

    for (const ch of team.characters) {
      if (remaining <= 0) break;
      if (ch.defeated) continue; // 跳过阵亡（需求 12.3）

      if (!ch.colors.includes(color)) continue; // 不吃此色，跳过（需求 12.2）

      if (!canGainMana(ch)) continue; // 被沉默：跳过充能，法力流向下一个能吃该色的队友

      const need = ch.manaCost - ch.mana;
      if (need <= 0) continue; // 已满，流向下一个（需求 12.4）

      const give = Math.min(remaining, need);
      // Disease halves mana gained. The matched gems are still consumed; only
      // the recipient's actual gain is reduced (ceil, per official 1.0.9 patch notes).
      const actualGive = hasStatus(ch, 'disease')
        ? Math.ceil(give / 2)
        : give;
      ch.mana += actualGive; // 不超过上限 manaCost（需求 10.4）
      remaining -= give;

      // 法力灵链特质：匹配该色时额外充能。额外量不从 remaining 里扣——
      // 灵链本身就是「额外」，扣的话等于把队友的法力挪给自己，与官方语义不符。
      const bonus = Math.min(manaLinkBonus(ch, color), ch.manaCost - ch.mana);
      if (bonus > 0) ch.mana += bonus;

      events.push({
        type: 'mana-gain',
        color,
        amount: actualGive + bonus,
        characterId: ch.id,
        player,
      });
    }

    // remaining > 0 且无人可接 → 丢弃（需求 12.5）
    return events;
  }

  /** 角色技能是否可释放：法力累积达到需求总量（需求 16.1） */
  static isSkillCastable(mana: number, manaCost: number): boolean {
    return mana >= manaCost;
  }
}
