/**
 * 旗帜系统（M6）——解锁 / 装备 / 战斗加成提取。
 *
 * 官方口径（fandom Wiki「Kingdoms/Banners」）：旗帜在该王国**任务链全通（8/8）**后解锁，
 * 编队页可为每支预设队选一面；战斗中匹配旗帜加成色时，该色法力 ±N（每次匹配事件平展，
 * 惩罚色 -1，见 data/banners.ts 数据来源注）。
 *
 * 解锁状态**派生自任务进度**（kingdoms[].questsDone），不新增存档字段——删档重打任务链
 * 自然回收旗帜，与「任务推进」单一事实源。
 */
import { QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { BANNERS, bannerOf, type BannerDef } from '../data/banners';
import type { MetaSave, TeamPreset } from '../state/schema';

/** 旗帜是否已解锁：该王国任务链全通 */
export function bannerUnlocked(save: MetaSave, kingdom: string): boolean {
  return (save.kingdoms[kingdom]?.questsDone ?? 0) >= QUESTS_PER_KINGDOM;
}

/** 已解锁旗帜的王国名列表（按 BANNERS 表序 = 王国推进序） */
export function unlockedBanners(save: MetaSave): string[] {
  return Object.keys(BANNERS).filter((kingdom) => bannerUnlocked(save, kingdom));
}

/**
 * 某队伍当前生效的旗帜。null = 未装备 / 王国无旗帜 / 未解锁（最后一条是防御：
 * 存档被手改或任务进度回退时，桥接侧静默降级为无旗帜，不让坏数据进战斗契约）。
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
  if (!bannerUnlocked(save, bannerKingdomId)) return `旗帜未解锁：${bannerKingdomId}（需任务链 8/8 全通）`;
  return null;
}
