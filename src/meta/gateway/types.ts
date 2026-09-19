/**
 * Meta 数据网关（视觉屏 ↔ 逻辑核的唯一通道）。
 *
 * 设计口径（为将来切 Cloudflare D1 预留的缝）：
 *  - 屏层**只读**地消费纯函数（systems/data 全是 save 的纯函数，客户端本地算视图），
 *    一切**写入**走网关异步方法——方法签名刻意不要求调用方持有可变存档；
 *  - 每个写方法 = 未来 D1 模式下的一个 RPC 端点：服务器跑同一套纯 systems、
 *    返回同一形状的结果 + 新快照。今天 mock 后端 = SaveStore(localStorage) +
 *    本地 systems，写后落盘的语义与远端一致；
 *  - 所有方法 async：换 D1 时签名零变化，屏层零返工；
 *  - 时钟不由网关自取（`now` / `weekStart` 由调用方算好传入，可测、可复算），
 *    只有 `nextSeed()` 是网关的熵源（D1 模式下对应服务端掷种子）。
 */
import type { BattleResult } from '@session/index';
import type { MetaFailure } from '../types';
import type { ArenaSettleResult, ArenaBridgeOutcome, DraftState } from '../systems/arena';
import type { GachaDrawResult, GloryChestResult } from '../systems/gacha';
import type { SettlementContext, SettlementDetail } from '../systems/settlement';
import type { LevelUpResult, AscendResult, UnlockTraitResult, DecomposeResult } from '../systems/troopProgress';
import type { SetTeamResult } from '../systems/teamRules';
import type { BridgeOutcome } from '../systems/battleBridge';
import type { InvasionBridgeOutcome, InvasionSettleResult } from '../systems/invasion';
import type { EventBuyResult } from '../systems/events';
import type { EventTypeId } from '../data/events';
import type { TemperSaveResult } from '../systems/forgeOps';
import type { TeamMember, MetaSave } from '../state/schema';

/** load 的返回：save 是网关当前权威状态，屏层直接读 */
export interface GatewaySnapshot {
  save: MetaSave;
  /** true = 存储为空/损坏，给的是新档（mock 首次进入会铺演示数据） */
  fresh: boolean;
  /** 非 null = 发生过降级（主槽损坏回退备份等），UI 应告知 */
  warning: string | null;
}

/** 变更结果 + 变更后的权威存档（屏层拿它整体重渲染） */
export interface GatewayUpdate<T> {
  result: T;
  save: MetaSave;
}

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
  goldKeys: number;
}

/** 弃赛结果 */
export interface ArenaForfeit {
  wins: number;
  rewards: { gold: number; gems: number; goldKeys: number };
}

export interface MetaGateway {
  /** 'mock' = 本地 SaveStore + 纯 systems；'d1' = 未来远端 */
  readonly backend: 'mock' | 'd1';

  /** 启动加载。mock 后端首次进入（无存档）会铺演示档并落盘 */
  load(): Promise<GatewaySnapshot>;

  /** 当前权威存档（load 后可读；屏层渲染视图用） */
  current(): MetaSave;

  /** 熵源：抽卡/出敌/竞技场种子（mock 用 crypto，D1 由服务端掷） */
  nextSeed(): number;

  // —— 系统（设置屏） ——
  /** 导出当前存档 JSON（与导入口径一致） */
  exportSaveJson(): string;
  /** 导入存档 JSON；结构问题抛 MetaSaveError 由设置屏展示 */
  importSaveJson(text: string): Promise<GatewaySnapshot>;
  /** 重建演示档（mock 后端专用；D1 后端应拒绝或改为服务器操作） */
  resetToDemo(): Promise<GatewaySnapshot>;
  /** 重建全新档（起始队 + 起始货币，无演示进度） */
  resetToNewGame(): Promise<GatewaySnapshot>;
  setBattleDebug(on: boolean): Promise<GatewayUpdate<boolean>>;

  // —— 养成（M1） ——
  levelUpTroop(troopId: number): Promise<GatewayUpdate<LevelUpResult | MetaFailure>>;
  ascendTroop(troopId: number): Promise<GatewayUpdate<AscendResult | MetaFailure>>;
  unlockTroopTrait(troopId: number, slot: number): Promise<GatewayUpdate<UnlockTraitResult | MetaFailure>>;
  decomposeTroop(troopId: number): Promise<GatewayUpdate<DecomposeResult | MetaFailure>>;
  setTroopLocked(troopId: number, locked: boolean): Promise<GatewayUpdate<boolean | MetaFailure>>;

  // —— 编队（M1） ——
  saveTeam(index: number, team: TeamInput): Promise<GatewayUpdate<SetTeamResult>>;
  activateTeam(index: number): Promise<GatewayUpdate<number | MetaFailure>>;
  /** 删除预设队（至少保留一支；index 非法返回 INVALID） */
  deleteTeam(index: number): Promise<GatewayUpdate<number | MetaFailure>>;

  // —— 主角（M5/v2：38 官方职业 + 天赋树） ——
  equipHeroClass(classId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  equipHeroWeapon(weaponId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  /** 熔炉锻造：按配方消耗灵魂+黄金，解锁目录武器（gw_*） */
  forgeCatalogWeapon(weaponId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  /** 天赋档位选取（tierIndex 0..6，三树选一；可随时改配） */
  pickHeroTalent(
    classId: string,
    tierIndex: number,
    talentCode: string,
  ): Promise<GatewayUpdate<{ ok: true; classId: string; tierIndex: number } | MetaFailure>>;
  clearHeroTalent(
    classId: string,
    tierIndex: number,
  ): Promise<GatewayUpdate<{ ok: true; classId: string; tierIndex: number } | MetaFailure>>;
  /** 职业专属特质槽解锁（1~3 顺序解锁，金+魂） */
  unlockHeroTrait(
    slot: number,
  ): Promise<GatewayUpdate<{ ok: true; slot: number; cost: { gold: number; souls: number } } | MetaFailure>>;

  // —— 宝箱（M4/荣耀箱） ——
  /**
   * 开箱。**count 是原子批量**：整批成交或一张不动（CH-1）。
   * - 'gem'：count 只能 1|10（十连保底 Epic+）；
   * - 'gold'：count 1~10（钥匙只够 7 抽时可显式开 7 次）；
   * - 'glory'：忽略 count。
   */
  openChest(kind: 'gem' | 'gold' | 'glory', count?: number): Promise<GatewayUpdate<GachaDrawResult | GloryChestResult | MetaFailure>>;

  // —— 王国经营（M3） ——
  upgradeKingdomLevel(kingdom: string): Promise<GatewayUpdate<number | MetaFailure>>;
  collectKingdomTribute(kingdom: string, now: number): Promise<GatewayUpdate<TributeCollect>>;
  setKingdomExploreTier(kingdom: string, tier: number): Promise<GatewayUpdate<number | MetaFailure>>;

  // —— 竞技场（M7） ——
  /** 报名开一届现开赛（免费票按 weekStart 判定） */
  enterArena(now: number, weekStart: number): Promise<GatewayUpdate<boolean | MetaFailure>>;
  /** 三选一取卡（DraftState 供屏层画剩余轮次） */
  pickDraftCard(troopId: number): Promise<GatewayUpdate<DraftState | MetaFailure>>;
  /** 站位排序确认（必须是 draft 卡重排） */
  arrangeDraftTeam(order: number[]): Promise<GatewayUpdate<number[] | MetaFailure>>;
  startDraftBattles(): Promise<GatewayUpdate<boolean | MetaFailure>>;
  /** 弃赛：按已得胜场收官发奖 */
  forfeitDraft(): Promise<GatewayUpdate<ArenaForfeit | MetaFailure>>;
  /** 第 wins 场对手计划（纯读，按 draft seed 可复现） */
  planArenaBattle(): Promise<ArenaBridgeOutcome | MetaFailure>;
  /** 结算一场竞技场战斗（胜场累计 / 收官发奖） */
  settleArenaBattle(result: BattleResult): Promise<GatewayUpdate<ArenaSettleResult | MetaFailure>>;

  // —— 战斗闭环（M2） ——
  /** 任务关出战计划（只读组合：出敌 + 过会话校验的请求） */
  planQuestBattle(kingdom: string, node: number): Promise<BridgeOutcome | MetaFailure>;
  /** 探索出战计划（档位取存档当前 exploreTier） */
  planExploreBattle(kingdom: string): Promise<BridgeOutcome | MetaFailure>;
  /** 结算入账（击杀/胜利/首胜/任务推进/战败保底逐行明细） */
  applyBattleSettlement(
    result: BattleResult,
    ctx: SettlementContext,
  ): Promise<GatewayUpdate<SettlementDetail>>;

  // —— 淬炼（素材批 2026-09-19；WEAPON-FORGE-DESIGN F2） ——
  /** 武器淬炼 +1 级（钢锭/符卷/黄金原子扣账，写回 weaponTempering） */
  temperWeapon(weaponId: string): Promise<GatewayUpdate<TemperSaveResult | MetaFailure>>;

  // —— 每周活动（素材批 2026-09-19） ——
  /** 指定活动的出战计划（主题出敌 + 结算所需 plan；plan.source.kind === 'event'） */
  planEventBattle(now: number, weekStart: number, typeId: EventTypeId): Promise<BridgeOutcome | MetaFailure>;

  /** 主动放弃登塔（按败北同口径收尾发奖；= 未来 D1 端点） */
  abandonTowerRun(weekStart: number): Promise<GatewayUpdate<{ ok: true; floorReached: number; glory: number; scrolls: number } | MetaFailure>>;
  /** 活动商店购买（代币扣账 + 素材/货币入账 + 已购计数；= 未来 D1 端点） */
  buyEventGoods(
    goodsId: string,
    now: number,
    weekStart: number,
    typeId: EventTypeId,
  ): Promise<GatewayUpdate<EventBuyResult | MetaFailure>>;

  // —— 入侵 PvP（素材批 2026-09-19） ——
  /** 对一只镜像对手的出战斗计划（候选校验 + 过会话校验；跨周 lazy 周结在此触发） */
  planInvasionBattle(
    mirrorId: string,
    now: number,
    weekStart: number,
  ): Promise<InvasionBridgeOutcome | MetaFailure>;
  /** 结算一场入侵战斗（VP 官方表 + 荣耀/黄金入账 + 跨周 lazy 周结在此触发） */
  settleInvasionBattle(
    result: BattleResult,
    mirrorId: string,
    now: number,
    weekStart: number,
    todayStart: number,
  ): Promise<GatewayUpdate<InvasionSettleResult | MetaFailure>>;
}

/** 屏层便捷守卫：result 是否失败（MetaFailure） */
export function isFailure(result: unknown): result is MetaFailure {
  return typeof result === 'object' && result !== null && (result as MetaFailure).ok === false;
}
