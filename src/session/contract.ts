/**
 * AIRP ↔ 三消战斗客户端的版本化数据契约（需求 2、3；设计 §4）。
 *
 * 这一层是应用层 DTO，故意不复用引擎的 `Character`：
 *  - 引擎用本场内部 numeric id，宿主用稳定 `externalId`，两者由 session 层映射。
 *  - 引擎结构会随内容迭代变动（statuses、summonQueue 等），不能直接暴露给宿主。
 *  - 宿主只应看到本场结算所需字段，永久养成数据仍归 AIRP。
 */
import type { BaseColor } from '@engine/types';

/** DTO 结构版本。字段语义发生不兼容变化时才递增。 */
export const BATTLE_SCHEMA_VERSION = 1;

/**
 * 规则解释版本。回合顺序、结算次序、法力/伤害公式等发生行为变化时递增，
 * 用于让宿主知道同一份 request 在不同客户端版本下可能得出不同结果。
 */
export const RULESET_VERSION = '1.0.0';

/** 战斗中的一方。宿主视角固定为 player / enemy，不暴露引擎的 Left/Right。 */
export type BattleSideName = 'player' | 'enemy';

/** 宿主下发的单个参战角色快照。只描述本场，不含等级/经验等永久数据。 */
export interface CombatantSnapshot {
  /** 宿主侧稳定标识，结果按它回传 */
  externalId: string;
  /** 宿主侧模板/兵种标识，仅作追溯，客户端不依赖它取数值 */
  templateId?: string;
  name: string;
  portraitUrl?: string;
  /** 等级文本仅供展示（需求 7.6：客户端不做永久升级） */
  levelLabel?: string;
  stats: {
    hp: number;
    attack: number;
    armor: number;
    magic: number;
  };
  /**
   * 种族/类型（对齐 GoW 的 `TroopType`，如 `Beast`/`Knight`），一至两个。
   *
   * 种族光环（族亲 / 之盾，共 49 个特质）按它筛选受益对象；省略则该角色不吃族亲光环。
   * 可选字段，老宿主不传即可，因此不构成 `schemaVersion` 不兼容变更。
   */
  troopTypes?: string[];
  /**
   * 王国归属（对齐 GoW `KingdomId` → kingdoms 数据的王国名）。原语 Wave4 批：
   * 引擎条件 kingdomOf 与 modifier 来源 alliesOfKingdom/enemiesOfKingdom 按它筛选。
   * 可选字段，老宿主不传即可（该角色不属于任何王国），不构成 `schemaVersion` 不兼容变更。
   */
  kingdom?: string;
  /** 关联法力颜色，任一色的匹配共同充能同一条法力条 */
  manaColors: BaseColor[];
  /** 释放技能所需法力总量 */
  manaCost: number;
  /**
   * 敌我阶级（AIRP 分拣用）：杂兵 / 精英 / 首领 / 领主 / 传奇。
   * 接受中文原文或英文键（minion/elite/boss/lord/legendary）。
   * 提供了 tier 时，分拣引擎会自动补齐缺失的 skillId / traitIds（按阶级+种族的规则池）；
   * 显式给出的 skillId / traitIds 优先，分拣不覆盖。
   */
  tier?: string;
  /**
   * 技能 id（必须是客户端已注册的技能）。**与 tier 二选一**：
   * 显式给出时按它执行；省略时必须给 tier，由分拣引擎按阶级分配。
   */
  skillId?: string;
  /**
   * 被动特质 code 列表（必须是客户端已注册的特质）。可选：
   * 省略时若提供了 tier，由分拣引擎按阶级+种族自动编配；显式给出的优先。
   */
  traitIds?: string[];
}

/** 宿主发起一场战斗的请求。 */
export interface BattleRequest {
  schemaVersion: typeof BATTLE_SCHEMA_VERSION;
  battleId: string;
  requestId: string;
  /** 宿主期望的规则版本；与客户端不一致时由校验层给出明确错误 */
  rulesetVersion: string;
  /** 确定性随机种子，同 seed + 同行动序列必须复现同一场战斗 */
  seed: number;
  playerTeam: CombatantSnapshot[];
  enemyTeam: CombatantSnapshot[];
  /**
   * 玩家方旗帜加成（GoW 王国旗帜语义；meta M6）。形如 `{ Red: 2, Yellow: 1, Brown: -1 }`：
   * 玩家方匹配对应色宝石时，该色法力按**每次匹配事件**平展 ±N（不逐宝石、不放大，
   * 惩罚色向下保底 0）。可选字段，省略 = 无旗帜，不构成 schemaVersion 变更。
   */
  playerBanner?: { boosts: Partial<Record<BaseColor, number>> };
  /**
   * 战斗模式（可选，加性字段）。'pvp' = 竞技场对战（官方 PvP 场景映射）：
   * 引擎在该场启用 pvpBonus 类特质（exemplar「PvP 战斗中获得 5 点攻击力」等）与
   * PvP 结算经济（bloodandglory 的荣耀映射）。既有请求不传即无影响。
   */
  mode?: 'pvp';
}

/** 单个角色的战斗结束状态。 */
export interface CombatantResult {
  externalId: string;
  side: BattleSideName;
  hp: number;
  maxHp: number;
  armor: number;
  defeated: boolean;
  /** 逃跑离场（DECISIONS 四项拍板③）：不按击杀记账、不进 defeatedExternalIds */
  fled?: boolean;
  /** 结束时仍存续的状态与剩余回合 */
  statuses: { id: string; turns: number }[];
}

/** 事件摘要：按事件类型计数，避免把完整事件流塞进结果。 */
export interface BattleEventSummary {
  type: string;
  count: number;
}

/** 客户端回传的战斗结果。 */
export interface BattleResult {
  schemaVersion: typeof BATTLE_SCHEMA_VERSION;
  battleId: string;
  requestId: string;
  /** 实际执行本场的客户端规则版本 */
  rulesetVersion: string;
  seed: number;
  winner: BattleSideName;
  /** 完成的回合数。额外回合不另计一回合，故一个回合可能包含多次行动 */
  turns: number;
  /** 只包含 request 下发的角色；场上召唤物不属于宿主资产，见 summonedCount */
  combatants: CombatantResult[];
  defeatedExternalIds: string[];
  /** 逃跑离场的角色（DECISIONS 四项拍板③）：与阵亡区分，不计入 defeatedExternalIds */
  fledExternalIds?: string[];
  /** 本场召唤物数量，供宿主核对战斗过程而无需完整事件流 */
  summonedCount: number;
  /**
   * 战场经济三币总额（DECISIONS 四项拍板①）：金币/灵魂/宝石共用池的最终值
   * （战后经济特质加成已放大）。可选字段，老宿主忽略即可。
   */
  economy?: { gold: number; souls: number; gems: number };
  /** 行动序列摘要，用于复现校验：同 seed + 同 digest 应得到同一场战斗 */
  actionLogDigest: string;
  eventSummary: BattleEventSummary[];
}
