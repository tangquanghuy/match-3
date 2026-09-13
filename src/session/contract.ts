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
  /** 关联法力颜色，任一色的匹配共同充能同一条法力条 */
  manaColors: BaseColor[];
  /** 释放技能所需法力总量 */
  manaCost: number;
  /** 必须是客户端已注册的技能 id（决策 6） */
  skillId: string;
  /** 必须是客户端已注册的特质 id；特质系统未上线前只接受空数组 */
  traitIds: string[];
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
}

/** 单个角色的战斗结束状态。 */
export interface CombatantResult {
  externalId: string;
  side: BattleSideName;
  hp: number;
  maxHp: number;
  armor: number;
  defeated: boolean;
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
  /** 本场召唤物数量，供宿主核对战斗过程而无需完整事件流 */
  summonedCount: number;
  /** 行动序列摘要，用于复现校验：同 seed + 同 digest 应得到同一场战斗 */
  actionLogDigest: string;
  eventSummary: BattleEventSummary[];
}
