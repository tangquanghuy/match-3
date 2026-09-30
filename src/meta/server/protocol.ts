/**
 * Meta 命令协议（客户端 ↔ 权威核心的线协议）。
 *
 * 每条写操作 = 一条 JSON 可序列化的命令；权威核心（server/core.ts）执行它并返回
 * `{ result, save }`。本地后端在浏览器里直接调用核心；远端后端把同一条命令 POST 给
 * Worker，Worker 调用同一个核心，存储换成 D1。
 *
 * 协议里**没有**时钟与种子：`now` / `weekStart` / `todayStart` / 随机种子一律由核心
 * 所在环境提供（ServerEnv），客户端改本机时间或塞种子都不会影响结算。
 */
import type { BattleRequest, BattleResult } from '@session/contract';
import type { MetaFailure } from '../types';
import type { ArenaSettleResult, DraftState } from '../systems/arena';
import type { ChestLootResult, GachaDrawResult } from '../systems/gacha';
import type { SettlementDetail } from '../systems/settlement';
import type { LevelUpResult, AscendResult, UnlockTraitResult, DecomposeResult } from '../systems/troopProgress';
import type { SetTeamResult } from '../systems/teamRules';
import type { InvasionMirror, InvasionSettleResult } from '../systems/invasion';
import type { HuntMoveOk } from '../systems/treasureHunt';
import type { EventActionResult, EventBuyResult } from '../systems/events';
import type { EventTypeId } from '../data/events';
import type { TemperSaveResult } from '../systems/forgeOps';
import type { EncounterEnemy, EncounterSource } from '../systems/encounter';
import type { TeamMember, MetaSave, TreasureHuntState } from '../state/schema';
import type { SavePatch } from '../state/records';
import type { CollectionModifierOk } from '../systems/collectionModifier';
import type { GiftClaimResult } from '../systems/gifts';
import type { TributeTreasury } from '../systems/tribute';
import type { ArenaRewards } from '../data/economy';

// ---------------------------------------------------------------------------
// 载荷与结果形状
// ---------------------------------------------------------------------------

/** 预设队写入载荷（与 teamRules.setTeamPreset 对齐） */
export interface TeamInput {
  name: string;
  members: TeamMember[];
  bannerKingdomId: string | null;
}

/** 进贡收取结果（tribute.collectTribute 的 collected） */
export interface TributeCollect {
  hours: number;
  hits: number;
  gold: number;
  souls: number;
  glory: number;
  goldKeys: number;
}

/** 一键收取全部进贡的结果 */
export type TributeHaul = TributeTreasury;

/** 弃赛结果 */
export interface ArenaForfeit {
  wins: number;
  rewards: ArenaRewards;
}

export type BattleMode = 'quest' | 'explore' | 'event' | 'arena' | 'invasion';

/**
 * 出战票：核心已登记为待结算（MetaSave.pendingBattle），客户端拿 request 开打，
 * 打完只回传 BattleResult。其余字段只用于展示（加载页标题、结算页返回路径）。
 */
export interface BattleTicket {
  ok: true;
  mode: BattleMode;
  request: BattleRequest;
  kingdom: string;
  /** quest/explore/event 的出敌来源；arena/invasion 为 null */
  source: EncounterSource | null;
  /** 入侵对手；其余为 null */
  mirror: InvasionMirror | null;
  /** 竞技场对手出敌条目（展示）；其余为空 */
  opponents: EncounterEnemy[];
}

/** 结算结果（按战斗来源分派） */
export type BattleSettlement =
  | { ok: true; kind: 'encounter'; detail: SettlementDetail; source: EncounterSource; kingdom: string }
  | { ok: true; kind: 'arena'; settled: ArenaSettleResult }
  | { ok: true; kind: 'invasion'; settled: InvasionSettleResult; mirror: InvasionMirror };

export interface ForfeitResult {
  ok: true;
  /** none = 没有票；discarded = 任务/探索票作废；defeat = 按败北结算 */
  outcome: 'none' | 'discarded' | 'defeat';
  settlement: BattleSettlement | null;
}

/** 出战票类命令（开新票前会先把未结算的旧票判负/作废） */
export const PLAN_COMMANDS: ReadonlySet<string> = new Set([
  'planQuestBattle', 'planTutorialBattle', 'planExploreBattle', 'planEventBattle', 'planArenaBattle', 'planInvasionBattle',
]);

export type CollectionModifierAction =
  | { kind: 'unlock-kingdom'; kingdom: string }
  | { kind: 'restore-real' }
  | { kind: 'restore-initial' };

// ---------------------------------------------------------------------------
// 命令表：type → { 载荷, 结果 }
// ---------------------------------------------------------------------------

type Ok<T extends object = object> = { ok: true } & T;

export interface CommandTable {
  // —— 系统 ——
  markMaterialsSeen: { args: object; result: boolean };
  markMapSeen: { args: { level: number }; result: number };
  resetToNewGame: { args: object; result: Ok };

  // —— 养成 ——
  levelUpTroop: { args: { troopId: number; targetLevel?: number }; result: LevelUpResult | MetaFailure };
  ascendTroop: { args: { troopId: number }; result: AscendResult | MetaFailure };
  unlockTroopTrait: { args: { troopId: number; slot: number }; result: UnlockTraitResult | MetaFailure };
  decomposeTroop: { args: { troopId: number }; result: DecomposeResult | MetaFailure };
  setTroopLocked: { args: { troopId: number; locked: boolean }; result: boolean | MetaFailure };

  // —— 编队 ——
  saveTeam: { args: { index: number; team: TeamInput }; result: SetTeamResult };
  activateTeam: { args: { index: number }; result: number | MetaFailure };
  deleteTeam: { args: { index: number }; result: number | MetaFailure };

  // —— 主角 ——
  equipHeroClass: { args: { classId: string }; result: string | MetaFailure };
  equipHeroWeapon: { args: { weaponId: string }; result: string | MetaFailure };
  forgeCatalogWeapon: { args: { weaponId: string }; result: string | MetaFailure };
  claimHeroWeapon: { args: { weaponId: string }; result: string | MetaFailure };
  pickHeroTalent: {
    args: { classId: string; tierIndex: number; talentCode: string };
    result: Ok<{ classId: string; tierIndex: number }> | MetaFailure;
  };
  clearHeroTalent: {
    args: { classId: string; tierIndex: number };
    result: Ok<{ classId: string; tierIndex: number }> | MetaFailure;
  };
  unlockHeroTrait: {
    args: { slot: number };
    result: Ok<{ slot: number; cost: { gold: number; souls: number } }> | MetaFailure;
  };
  pickManaMastery: { args: { color: string }; result: Ok<{ color: string; value: number }> | MetaFailure };
  temperWeapon: { args: { weaponId: string }; result: TemperSaveResult | MetaFailure };

  // —— 愿望单 / 宝箱 ——
  setWishlist: { args: { ids: number[] }; result: Ok | MetaFailure };
  setPursuitTarget: { args: { id: number | null }; result: Ok | MetaFailure };
  openChest: {
    args: { kind: 'gem' | 'gold' | 'glory'; count: number; buyMissingKeys: boolean };
    result: GachaDrawResult | ChestLootResult | MetaFailure;
  };

  // —— 王国 ——
  upgradeKingdomLevel: { args: { kingdom: string }; result: number | MetaFailure };
  collectKingdomTribute: { args: { kingdom: string }; result: TributeCollect };
  collectAllTribute: { args: object; result: TributeHaul };
  setHomeKingdom: { args: { kingdom: string | null }; result: string | null | MetaFailure };
  setKingdomExploreTier: { args: { kingdom: string; tier: number }; result: number | MetaFailure };

  // —— 竞技场 ——
  enterArena: { args: object; result: boolean | MetaFailure };
  pickDraftCard: { args: { troopId: number }; result: DraftState | MetaFailure };
  arrangeDraftTeam: { args: { order: number[] }; result: number[] | MetaFailure };
  startDraftBattles: { args: object; result: boolean | MetaFailure };
  forfeitDraft: { args: object; result: ArenaForfeit | MetaFailure };

  // —— 战斗（出战票 → 结算） ——
  planQuestBattle: { args: { kingdom: string; node: number }; result: BattleTicket | MetaFailure };
  planTutorialBattle: { args: object; result: BattleTicket | MetaFailure };
  planExploreBattle: { args: { kingdom: string }; result: BattleTicket | MetaFailure };
  planEventBattle: { args: { typeId: EventTypeId; choice?: string }; result: BattleTicket | MetaFailure };
  planArenaBattle: { args: object; result: BattleTicket | MetaFailure };
  planInvasionBattle: { args: { mirrorId: string }; result: BattleTicket | MetaFailure };
  settleBattle: { args: { result: BattleResult }; result: BattleSettlement | MetaFailure };
  /**
   * 放弃当前出战票：竞技场/入侵/活动按败北结算，任务/探索直接作废。
   * 宿主在「刷新页面（load）」和「未结算就开新战斗」时自动执行，客户端也可主动发（认输）。
   */
  forfeitPendingBattle: { args: object; result: ForfeitResult };

  // —— 馈赠 ——
  claimGift: { args: { id: string }; result: GiftClaimResult };
  claimAllGifts: { args: object; result: GiftClaimResult };

  // —— 每周活动 ——
  abandonTowerRun: {
    args: object;
    result: Ok<{ floorReached: number; glory: number; scrolls: number }> | MetaFailure;
  };
  /** 活动玩法的非战斗动作（爬塔选路/营地/商人/奇遇/遗物、庆典棋盘掷骰等） */
  eventAction: { args: { typeId: EventTypeId; action: string }; result: EventActionResult | MetaFailure };
  buyEventGoods: {
    args: { goodsId: string; typeId: EventTypeId; expectedPeriodStart?: number };
    result: EventBuyResult | MetaFailure;
  };

  // —— 入侵 ——
  syncInvasionSeason: { args: object; result: Ok };
  refreshInvasionOpponents: { args: object; result: Ok | MetaFailure };
  claimInvasionRank: { args: { id: string; expectedWeek?: number }; result: Ok<{ gems: number }> | MetaFailure };

  // —— 寻宝 ——
  startTreasureHunt: { args: object; result: Ok<{ state: TreasureHuntState }> | MetaFailure };
  playTreasureHunt: { args: { from: number; to: number }; result: HuntMoveOk | MetaFailure };

  // —— 开发者命令（远端后端默认拒绝：ServerEnv.allowDev） ——
  'dev.importSave': { args: { json: string }; result: Ok };
  'dev.resetToDemo': { args: object; result: Ok };
  'dev.setBattleDebug': { args: { on: boolean }; result: boolean };
  'dev.collectionModifier': { args: { action: CollectionModifierAction }; result: CollectionModifierOk | MetaFailure };
}

export type CommandType = keyof CommandTable;
export type CommandArgs<K extends CommandType> = CommandTable[K]['args'];
export type CommandResult<K extends CommandType> = CommandTable[K]['result'];

/** 线上的一条命令 */
export type MetaCommand<K extends CommandType = CommandType> = K extends CommandType
  ? { type: K; args: CommandArgs<K> }
  : never;

/**
 * 命令回执：结果 + 存档增量 + 服务器时刻（客户端据此校准展示用时钟）。
 * patch = null：命令失败或无改动，客户端副本不变。完整存档只在 load 时下发一次。
 */
export interface CommandReply<K extends CommandType = CommandType> {
  result: CommandResult<K>;
  patch: SavePatch | null;
  serverNow: number;
}

/**
 * 关键命令：产出随机结果或资源入账。提交后**立即**落盘再回执——
 * 否则服务端重启丢掉未落盘的开箱，玩家就能「重抽」。其余命令合并延迟落盘。
 */
const CRITICAL_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  'resetToNewGame',
  'openChest',
  'settleBattle',
  'forfeitPendingBattle',
  'collectKingdomTribute',
  'collectAllTribute',
  'claimGift',
  'claimAllGifts',
  'buyEventGoods',
  'eventAction',
  'abandonTowerRun',
  'forfeitDraft',
  'enterArena',
  'claimInvasionRank',
  'startTreasureHunt',
  'playTreasureHunt',
  'dev.importSave',
  'dev.resetToDemo',
  'dev.collectionModifier',
]);

export function isCriticalCommand(type: CommandType): boolean {
  return CRITICAL_COMMANDS.has(type);
}

/** 启动加载回执 */
export interface LoadReply {
  save: MetaSave;
  /** true = 刚为该玩家建了新档 */
  fresh: boolean;
  /** 非 null = 发生过降级（本地主槽损坏回退备份等） */
  warning: string | null;
  serverNow: number;
}

export function isDevCommand(type: string): boolean {
  return type.startsWith('dev.');
}
