/**
 * 入侵真人镜像匹配调参表（systems/invasionMirrors.ts 消费）。
 *
 * 参考异步 PvP 的通行做法（背包乱斗 / Super Auto Pets / 酒馆战棋式「镜像对手」）：
 *  - 录的是「玩家真实打过的那支队」，按录制时所在段位入池；
 *  - 同一玩家每个段位只保留最新一份（覆盖写），爬分路上自然给低段位留下真人样本；
 *  - 匹配优先同段位、按双方队伍强度比分档，池子不够深就退回人机，不让少数人反复出现；
 *  - 低段位以人机为主，段位越高真人占比越高，高段位只在低档留少量人机。
 */
import type { InvasionDifficulty } from './invasionDifficulty';

const DAY_MS = 24 * 60 * 60 * 1000;

export const INVASION_MATCHMAKING = {
  /**
   * 各联赛（0 青铜 … 9 钻石）三个槽位 [低, 中, 高] 尝试真人镜像的概率。
   * 高段位中/高档恒为真人（池够深时）；人机只在低档保留少量。
   */
  realSlotShare: [
    [0, 0.15, 0.25],
    [0, 0.2, 0.35],
    [0.05, 0.3, 0.45],
    [0.1, 0.4, 0.6],
    [0.15, 0.5, 0.75],
    [0.2, 0.65, 0.9],
    [0.3, 0.8, 1],
    [0.4, 1, 1],
    [0.5, 1, 1],
    [0.6, 1, 1],
  ] as ReadonlyArray<readonly [number, number, number]>,
  /**
   * 血怒槽改用真人镜像的概率（按联赛）。选中后按该槽原档位挑人（比较的是未加成强度），
   * 再对其整队四维乘血怒倍率（×1.5 → +25%，×2 → +50%，与人机血怒同口径），VP 倍率照旧。
   */
  frenzyRealShare: [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85] as readonly number[],
  /** 对手强度 / 我方强度 落在哪个区间算哪一档（区间内越靠中心越优先） */
  powerBands: {
    easy: [0.7, 0.95],
    normal: [0.9, 1.1],
    hard: [1.05, 1.4],
  } as Record<InvasionDifficulty, readonly [number, number]>,
  /** 各档优先的段位偏移（相对我方联赛）；超出范围每差一级加罚分 */
  leagueReach: {
    easy: [-2, 0],
    normal: [-1, 1],
    hard: [0, 2],
  } as Record<InvasionDifficulty, readonly [number, number]>,
  /** 段位偏离罚分（每级） */
  leaguePenalty: 0.5,
  /** 快照年龄罚分（满 maxAgeMs 时的罚分；越新越优先） */
  agePenalty: 0.3,
  /** 在最优的前 N 名里随机挑一个，避免同强度的人被固定刷到 */
  topPicks: 3,
  /** One compatible owner is enough to attempt a real opponent; recent-opponent filtering still applies. */
  minDistinctOwners: 1,
  /** 快照有效期：两个赛季 */
  maxAgeMs: 14 * DAY_MS,
  /** 最近交手过的真人不再匹配（按 ownerKey） */
  recentCap: 12,
  /** 同段位同阵容的重复录制节流（阵容变了立即重录） */
  republishMs: 30 * 60 * 1000,
  /** 周榜真人快照的有效期：过期后进入入侵页会重取一次 */
  standingsTtlMs: 5 * 60 * 1000,
  /** 服务端一次取样上限 */
  queryLimit: 60,
  /** 服务端取样的强度粗筛区间（比各档区间宽，留给纯逻辑细分） */
  queryPower: [0.5, 1.6] as readonly [number, number],
  /** 服务端取样的段位窗口（相对我方联赛） */
  queryLeagues: [-2, 2] as readonly [number, number],
} as const;
