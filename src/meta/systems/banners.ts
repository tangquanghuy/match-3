/**
 * 旗帜系统——王国开放即解锁，可为每支预设队装备一面。
 * 解锁与地图共用冒险者等级门槛，不依赖任务进度或稀疏的王国存档条目。
 */
import { kingdomUnlockLevel } from '../data/kingdoms';
import { BANNERS, bannerOf, type BannerDef } from '../data/banners';
import type { MetaSave, TeamPreset } from '../state/schema';

/** 旗帜是否已解锁：对应王国已开放且存在旗帜定义 */
export function bannerUnlocked(save: MetaSave, kingdom: string): boolean {
  return !!bannerOf(kingdom) && save.hero.level >= kingdomUnlockLevel(kingdom);
}

/** 已解锁旗帜的王国名列表（按 BANNERS 表序 = 王国推进序） */
export function unlockedBanners(save: MetaSave): string[] {
  return Object.keys(BANNERS).filter((kingdom) => bannerUnlocked(save, kingdom));
}

/**
 * 某队伍当前生效的旗帜。null = 未装备 / 王国无旗帜 / 未解锁（最后一条是防御：
 * 存档被手改或王国尚未开放时，桥接侧静默降级为无旗帜，不让坏数据进战斗契约）。
 */
export function equippedBannerOf(save: MetaSave, team: Pick<TeamPreset, 'bannerKingdomId'>): BannerDef | null {
  const kingdom = team.bannerKingdomId;
  if (!kingdom) return null;
  if (!bannerUnlocked(save, kingdom)) return null;
  return bannerOf(kingdom);
}

/** 装备校验（setTeamPreset 用）：null 合法（不挂旗帜）；其余必须是已解锁王国的旗帜 */
export function bannerEquipIssue(save: MetaSave, bannerKingdomId: string | null): string | null {
  if (bannerKingdomId === null) return null;
  if (!bannerOf(bannerKingdomId)) return `未知旗帜：${bannerKingdomId}`;
  if (!bannerUnlocked(save, bannerKingdomId)) return `旗帜未解锁：${bannerKingdomId}（拥有该王国后解锁）`;
  return null;
}
