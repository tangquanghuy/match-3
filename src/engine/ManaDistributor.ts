import type { Team, BaseColor } from './types';
import type { ManaGainEvent } from './events';
import { PlayerSide } from './types';

/**
 * 法力分配器（需求 10, 11, 12）。
 * 核心机制：从上到下顺序吸收。一种颜色的法力按队伍索引 0→3 依次填充，
 * 跳过阵亡与不吃此色的角色，填满则溢出给下一个符合条件者，无人可接则丢弃。
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

      const required = ch.manaRequirement[color];
      if (required === undefined) continue; // 不吃此色，跳过（需求 12.2）

      const current = ch.manaPool[color] ?? 0;
      const need = required - current;
      if (need <= 0) continue; // 该色已满，流向下一个（需求 12.4）

      const give = Math.min(remaining, need);
      ch.manaPool[color] = current + give; // 不超过上限（需求 10.4）
      remaining -= give;

      events.push({
        type: 'mana-gain',
        color,
        amount: give,
        characterId: ch.id,
        player,
      });
    }

    // remaining > 0 且无人可接 → 丢弃（需求 12.5）
    return events;
  }

  /** 角色技能是否可释放：每种所需颜色都已满（需求 16.1） */
  static isSkillCastable(
    manaRequirement: import('./types').ManaRequirement,
    manaPool: import('./types').ManaPool,
  ): boolean {
    for (const key of Object.keys(manaRequirement) as BaseColor[]) {
      const required = manaRequirement[key] ?? 0;
      const current = manaPool[key] ?? 0;
      if (current < required) return false;
    }
    return true;
  }
}
