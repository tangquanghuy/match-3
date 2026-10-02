import type { HeroTraitCost } from '../data/heroTraitCosts';
import type { RegionalAction, RegionalPlanArgs } from '../systems/regionalPvp';
import type { MaterialShopRequest, MaterialShopBuyResult } from '../systems/materialShop';
/**
 * Meta 数据网关（视觉屏 ↔ 权威核心的唯一通道）。
 *
 *  - 屏层**只读**地消费纯函数（systems/data 全是 save 的纯函数，客户端本地算视图），
 *    一切**写入**走网关异步方法；
 *  - 每个写方法 = 一条命令（server/protocol.ts），经 MetaTransport 送到权威核心：
 *    本地后端在浏览器内执行，远端后端 POST 给 Worker——屏层对两者无感；
 *  - 写方法没有时钟/种子参数：`now`、`weekStart`、随机种子都由核心所在环境决定。
 *    屏层渲染倒计时等视图用 `gateway.now()`（按服务器时刻校准过的时钟）；
 *  - 战斗：plan* 取出战票（核心登记 pendingBattle）→ 打完 settleBattle(result)。
 *    客户端只回传 BattleResult，结算上下文由核心按票据还原。
 */
import type { BattleResult } from '@session/contract';
import type { MetaFailure } from '../types';
import type { DraftState } from '../systems/arena';
import type { ChestLootResult, GachaDrawResult } from '../systems/gacha';
import type { LevelUpResult, AscendResult, UnlockTraitResult, DecomposeResult } from '../systems/troopProgress';
import type { SetTeamResult } from '../systems/teamRules';
import type { HuntMoveOk } from '../systems/treasureHunt';
import type { EventActionResult, EventBuyResult } from '../systems/events';
import type { EventTypeId } from '../data/events';
import type { TemperSaveResult } from '../systems/forgeOps';
import type { MetaSave, TreasureHuntState } from '../state/schema';
import type { CollectionModifierOk } from '../systems/collectionModifier';
import type { GiftClaimResult } from '../systems/gifts';
import type {
  ArenaForfeit,
  BattleSettlement,
  BattleTicket,
  CollectionModifierAction,
  TeamInput,
  TributeCollect,
  TributeHaul,
} from '../server/protocol';

export type {
  ArenaForfeit,
  BattleMode,
  BattleSettlement,
  BattleTicket,
  CollectionModifierAction,
  TeamInput,
  TributeCollect,
  TributeHaul,
} from '../server/protocol';

/** load 的返回：save 是权威状态的客户端副本，屏层直接读 */
export interface GatewaySnapshot {
  save: MetaSave;
  /** true = 刚建了新档（本地开发后端首次进入会铺演示数据） */
  fresh: boolean;
  /** 非 null = 发生过降级（主槽损坏回退备份等），UI 应告知 */
  warning: string | null;
}

/** 变更结果 + 变更后的权威存档（屏层拿它整体重渲染） */
export interface GatewayUpdate<T> {
  result: T;
  save: MetaSave;
}

type Ok<T extends object = object> = { ok: true } & T;

/** 开发者工具（仅本地后端提供；远端后端为 null） */
export interface MetaDevTools {
  /** 导入存档 JSON；结构问题以 MetaSaveError 抛出 */
  importSaveJson(text: string): Promise<GatewaySnapshot>;
  /** 重建演示档 */
  resetToDemo(): Promise<GatewaySnapshot>;
  setBattleDebug(on: boolean): Promise<GatewayUpdate<boolean>>;
  /** 临时改当前收藏。真实收集留在 collectionTruth，不会被解锁或还原初始覆盖。 */
  applyCollectionModifier(action: CollectionModifierAction): Promise<GatewayUpdate<CollectionModifierOk | MetaFailure>>;
}

export interface MetaGateway {
  regionalAction(args: RegionalAction): Promise<GatewayUpdate<{ ok: true } | MetaFailure>>;
  planRegionalBattle(args: RegionalPlanArgs): Promise<BattleTicket | MetaFailure>;
  /** 'local' = 浏览器内权威核心 + localStorage；'remote' = Worker + D1 */
  readonly backend: 'local' | 'remote';
  /** 开发者工具；远端后端为 null（屏层据此隐藏相关入口） */
  readonly dev: MetaDevTools | null;

  /** 页面启动加载：放弃上一页面遗留的未结算战斗。 */
  load(): Promise<GatewaySnapshot>;
  /** 当前页面内恢复/同步数据：保留战斗票，旧快照也不回退副本。 */
  sync(): Promise<GatewaySnapshot>;
  /** 当前权威存档的客户端副本（load 后可读；屏层渲染视图用，改它不影响权威状态） */
  current(): MetaSave;
  /** 按服务器时刻校准过的「现在」（视图倒计时/日界判定用） */
  now(): number;
  /** 导出当前存档 JSON */
  exportSaveJson(): string;

  // —— 系统 ——
  /** 进入材料库后清除“有新材料”提示 */
  markMaterialsSeen(): Promise<GatewayUpdate<boolean>>;
  readMail(id: string): Promise<GatewayUpdate<Ok | MetaFailure>>;
  claimMail(id: string): Promise<GatewayUpdate<Ok | MetaFailure>>;
  claimAllMail(): Promise<GatewayUpdate<Ok<{ count: number }>>>;
  /** 记录地图迷雾揭幕已播到的等级 */
  markMapSeen(level: number): Promise<GatewayUpdate<number | MetaFailure>>;
  /** 重开：全新档（新手引导起步） */
  resetToNewGame(): Promise<GatewaySnapshot>;
  createCharacter(input: import('../state/character').CreateCharacterInput): Promise<GatewayUpdate<{ ok: true } | MetaFailure>>;
  setCharacterPortrait(portrait: string): Promise<GatewayUpdate<{ ok: true } | MetaFailure>>;

  // —— 养成 ——
  levelUpTroop(troopId: number, targetLevel?: number): Promise<GatewayUpdate<LevelUpResult | MetaFailure>>;
  ascendTroop(troopId: number): Promise<GatewayUpdate<AscendResult | MetaFailure>>;
  unlockTroopTrait(troopId: number, slot: number): Promise<GatewayUpdate<UnlockTraitResult | MetaFailure>>;
  decomposeTroop(troopId: number): Promise<GatewayUpdate<DecomposeResult | MetaFailure>>;
  setTroopLocked(troopId: number, locked: boolean): Promise<GatewayUpdate<boolean | MetaFailure>>;

  // —— 编队 ——
  saveTeam(index: number, team: TeamInput): Promise<GatewayUpdate<SetTeamResult>>;
  activateTeam(index: number): Promise<GatewayUpdate<number | MetaFailure>>;
  /** 删除预设队（至少保留一支；index 非法返回 INVALID） */
  deleteTeam(index: number): Promise<GatewayUpdate<number | MetaFailure>>;

  // —— 主角 ——
  equipHeroClass(classId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  equipHeroWeapon(weaponId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  /** 熔炉锻造：按配方消耗灵魂+黄金，解锁目录武器（gw_*） */
  forgeCatalogWeapon(weaponId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  /** 按官方获取途径领取武器（精通/职业/王国/宝石商店直购；熔炉白名单除外） */
  claimHeroWeapon(weaponId: string): Promise<GatewayUpdate<string | MetaFailure>>;
  /** 天赋档位选取（tierIndex 0..6，三树选一；可随时改配） */
  pickHeroTalent(classId: string, tierIndex: number, talentCode: string): Promise<GatewayUpdate<Ok<{ classId: string; tierIndex: number }> | MetaFailure>>;
  clearHeroTalent(classId: string, tierIndex: number): Promise<GatewayUpdate<Ok<{ classId: string; tierIndex: number }> | MetaFailure>>;
  /** 职业专属特质槽解锁（1~3 顺序解锁，金+魂） */
  unlockHeroTrait(slot: number, classId?: string): Promise<GatewayUpdate<Ok<{ slot: number; cost: HeroTraitCost }> | MetaFailure>>;
  /** 升级后的法力精通二选一 */
  pickManaMastery(color: string): Promise<GatewayUpdate<Ok<{ color: string; value: number }> | MetaFailure>>;
  /** 武器淬炼 +1 级（钢锭/符卷/黄金原子扣账） */
  temperWeapon(weaponId: string): Promise<GatewayUpdate<TemperSaveResult | MetaFailure>>;

  // —— 愿望单 / 宝箱 ——
  setWishlist(ids: readonly number[]): Promise<GatewayUpdate<Ok | MetaFailure>>;
  setPursuitTarget(id: number | null): Promise<GatewayUpdate<Ok | MetaFailure>>;
  /**
   * 开箱。**count 是原子批量**：整批成交或一张不动（CH-1）。
   * - 'gem'：count 只能 1|10（十连保底稀有或以上）；
   * - 'gold'：count 1~10；钥匙不足时带 buyMissingKeys 用黄金补齐；
   * - 'glory'：count 只能 1|10。
   */
  openChest(
    kind: 'gem' | 'gold' | 'glory',
    count?: number,
    opts?: { buyMissingKeys?: boolean },
  ): Promise<GatewayUpdate<GachaDrawResult | ChestLootResult | MetaFailure>>;

  // —— 王国 ——
  upgradeKingdomLevel(kingdom: string): Promise<GatewayUpdate<number | MetaFailure>>;
  collectKingdomTribute(kingdom: string): Promise<GatewayUpdate<TributeCollect>>;
  /** 一键收取全部已开放王国的进贡 */
  collectAllTribute(): Promise<GatewayUpdate<TributeHaul>>;
  /** 设为主城（进贡翻倍）；null = 取消 */
  setHomeKingdom(kingdom: string | null): Promise<GatewayUpdate<string | null | MetaFailure>>;
  abandonKingdomExplore(kingdom: string): Promise<GatewayUpdate<boolean | MetaFailure>>;
  setKingdomExploreTier(kingdom: string, tier: number): Promise<GatewayUpdate<number | MetaFailure>>;

  // —— 竞技场 ——
  /** 报名开一届现开赛 */
  enterArena(): Promise<GatewayUpdate<boolean | MetaFailure>>;
  /** 三选一取卡 */
  pickDraftCard(troopId: number): Promise<GatewayUpdate<DraftState | MetaFailure>>;
  /** 站位排序确认（必须是 draft 卡重排） */
  arrangeDraftTeam(order: number[]): Promise<GatewayUpdate<number[] | MetaFailure>>;
  startDraftBattles(): Promise<GatewayUpdate<boolean | MetaFailure>>;
  /** 弃赛：按已得胜场收官发奖 */
  forfeitDraft(): Promise<GatewayUpdate<ArenaForfeit | MetaFailure>>;

  // —— 战斗：出战票 → 结算 ——
  planQuestBattle(kingdom: string, node: number): Promise<BattleTicket | MetaFailure>;
  /** 新手引导试炼战（仅引导第一步可用） */
  planTutorialBattle(): Promise<BattleTicket | MetaFailure>;
  /** 探索出战（档位取存档当前 Hard/VH 关） */
  planExploreBattle(kingdom: string): Promise<BattleTicket | MetaFailure>;
  /** 指定活动的出战 */
  planEventBattle(typeId: EventTypeId, choice?: string): Promise<BattleTicket | MetaFailure>;
  /** 竞技场下一场 */
  planArenaBattle(): Promise<BattleTicket | MetaFailure>;
  /** 入侵：对一只镜像对手出战 */
  planInvasionRevenge(key: string): Promise<BattleTicket | MetaFailure>;
  claimInvasionDefense(): Promise<GatewayUpdate<Ok<{ gold: number; souls: number; glory: number }> | MetaFailure>>;
  planInvasionBattle(mirrorId: string): Promise<BattleTicket | MetaFailure>;
  /** 结算当前出战票（一票一结；票不符/已结算返回 INVALID） */
  settleBattle(result: BattleResult): Promise<GatewayUpdate<BattleSettlement | MetaFailure>>;

  // —— 馈赠 ——
  claimGift(id: string): Promise<GatewayUpdate<GiftClaimResult>>;
  claimAllGifts(): Promise<GatewayUpdate<GiftClaimResult>>;

  // —— 每周活动 ——
  /** 主动放弃登塔（按败北同口径收尾发奖） */
  abandonTowerRun(): Promise<GatewayUpdate<Ok<{ floorReached: number; glory: number; scrolls: number }> | MetaFailure>>;
  /** 活动玩法的非战斗动作（爬塔选路/营地/商人/奇遇/遗物、庆典棋盘掷骰等）。失败不改存档 */
  eventAction(typeId: EventTypeId, action: string): Promise<GatewayUpdate<EventActionResult | MetaFailure>>;
  /** 材料商店购买；服务端重算配方/价格，拒绝过期报价。 */
  buyMaterialGoods(request: MaterialShopRequest, expectedQuote: string): Promise<GatewayUpdate<MaterialShopBuyResult>>;
  /** 活动商店购买；expectedPeriodStart = 屏层看到的货架期（换期时拒绝，防买错） */
  buyEventGoods(goodsId: string, typeId: EventTypeId, expectedPeriodStart?: number): Promise<GatewayUpdate<EventBuyResult | MetaFailure>>;

  // —— 入侵 ——
  syncInvasionSeason(): Promise<GatewayUpdate<Ok>>;
  setInvasionDefense(index: number): Promise<GatewayUpdate<Ok | MetaFailure>>;
  syncInvasionDefense(): Promise<GatewayUpdate<Ok | MetaFailure>>;
  refreshInvasionOpponents(): Promise<GatewayUpdate<Ok | MetaFailure>>;
  /** expectedWeek = 屏层看到的赛季周（跨周时拒绝） */
  claimInvasionRank(id: string, expectedWeek?: number): Promise<GatewayUpdate<Ok<{ gems: number }> | MetaFailure>>;

  // —— 寻宝 ——
  /** 消耗 1 张藏宝图开始寻宝。已有未完成的一局时不重复扣图。 */
  startTreasureHunt(): Promise<GatewayUpdate<Ok<{ state: TreasureHuntState }> | MetaFailure>>;
  /** 主动结束并一次性结算当前棋盘。 */
  finishTreasureHunt(): Promise<GatewayUpdate<HuntMoveOk | MetaFailure>>;
  /** 交换相邻两格。步数归零时在同一次写入里开奖。 */
  playTreasureHunt(from: number, to: number): Promise<GatewayUpdate<HuntMoveOk | MetaFailure>>;
}

/** 屏层便捷守卫：result 是否失败（MetaFailure） */
export function isFailure(result: unknown): result is MetaFailure {
  return typeof result === 'object' && result !== null && (result as MetaFailure).ok === false;
}
