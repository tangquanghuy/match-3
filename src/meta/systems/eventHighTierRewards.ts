/** 只由实际战斗胜利/首领血池击破调用，不使用积分或历史最高层推断。 */
import { EVENT_HIGH_TIER_REWARDS, TOWER_BOSS_REWARDS, eventArcaneBundle, towerBossRewardKey } from '../data/events';
import type { EventWeekState, MetaSave } from '../state/schema';
import type { EventProgressLine } from './eventModes/common';
import { earnMaterials } from './wallet';

/** 只在对应区域首领胜利时调用；不按最高层补发，也不等待遗物选择。 */
export function rewardTowerBoss(save: MetaSave, week: EventWeekState, floor: number): EventProgressLine[] {
  const reward = TOWER_BOSS_REWARDS.find(row => row.floor === floor);
  if (!reward) return [];
  const key = towerBossRewardKey(floor);
  if (week.eventData[key]) return [];
  const mats = earnMaterials(save, reward.mats);
  week.eventData[key] = 1;
  return [{
    key: 'tower-boss-clear',
    label: `第 ${reward.zone} 区通关材料（第 ${floor} 层首领）`, deltas: {}, mats,
    note: '本周首次击败该区首领 · 钢锭与特质石已入账 · 独立于原有奖励',
  }];
}

export function rewardTowerHighTier(save: MetaSave, week: EventWeekState, floor: number): EventProgressLine[] {
  // 个别层是营地/商人；越过阈值后的首场胜利才发，不因走到非战斗节点发奖。
  return EVENT_HIGH_TIER_REWARDS.tower.filter(row => row.floor <= floor).flatMap(reward => {
    const key = `arcaneTower${reward.floor}`;
    if (week.eventData[key]) return [];
    week.eventData[key] = 1;
    const mats = earnMaterials(save, { traitstones: {
      ...eventArcaneBundle('towerOfDoom', reward.amount),
      ...(reward.celestial ? { celestial: reward.celestial } : {}),
    } });
    return [{ label: `${reward.floor} 层高阶特质奖励`, deltas: {}, mats, note: `本周首次在第 ${reward.floor} 层或以上战斗获胜` }];
  });
}

export function rewardRaidHighTier(save: MetaSave, week: EventWeekState, level: number, tier: number): EventProgressLine[] {
  const rules = EVENT_HIGH_TIER_REWARDS.raid;
  // 每个阶层仅计一次，且与前四次普通讨伐奖励完全独立。
  if (level < rules.minLevel || tier <= (week.eventData.arcaneRaidTier ?? 0)) return [];
  week.eventData.arcaneRaidTier = tier;
  const arcaneCount = week.eventData.arcaneRaidKills ?? 0;
  const celestialCount = week.eventData.celestialRaidKills ?? 0;
  const arcane = arcaneCount < rules.weeklyKills;
  const celestial = level >= rules.celestialMinLevel && celestialCount < rules.celestialWeeklyKills;
  if (!arcane && !celestial) return [];
  if (arcane) week.eventData.arcaneRaidKills = arcaneCount + 1;
  if (celestial) week.eventData.celestialRaidKills = celestialCount + 1;
  const mats = earnMaterials(save, { traitstones: {
    ...(arcane ? eventArcaneBundle('raidBoss', rules.amount) : {}),
    ...(celestial ? { celestial: 1 } : {}),
  } });
  return [{ label: `Lv.${level} 首领高阶特质奖励`, deltas: {}, mats, note: '高难讨伐独立周奖励' }];
}
