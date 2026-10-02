/**
 * 每周活动 · 平台层（2026-09-29 玩法重做后）。
 *
 * 本文件只管六个活动共用的「账本」：周实例建档与重置、积分 → 印记、里程碑、商店、周常宝石、
 * 以及把出战 / 结算 / 非战斗动作分派给各活动自己的玩法状态机。
 *
 * **每个活动一套独立玩法**（实现见 systems/eventModes/）：
 *   invasion       三路兵线防守：截击逼近王都的兵团，其余兵团每场推进
 *   raidBoss       阶段血池 + 轮换出战：三阶段首领、参战部队本阶段疲惫、每周破绽色
 *   towerOfDoom    肉鸽爬塔：25 层三区分叉地图，遗物 / 塔金 / 营地 / 商人 / 奇遇
 *   factionAssault 领地征服：4×3 地块图逐块推进，占领地给战区加成，敌军定期反扑
 *   worldEvent     庆典棋盘：胜场换骰子，在环形棋盘上掷骰收集物资
 *   classTrials    规则挑战：每周 8 道改写规则的试炼，三星目标
 *
 * 与竞技场的对照：活动吃养成（主角/旗帜/王国加成全生效——走 buildBattleRequest），draft 不吃。
 */
import { eventShopPeriodOf } from './eventShopClock';
import { weekStartOf } from '../gateway/clock';
import type { EventWeekState, MetaSave } from '../state/schema';
import { getTroopById, TROOPS } from '../../data/troops';
import type { EventGoods, EventMilestone, EventTheme, EventTypeId } from '../data/events';
import {
  EVENT_MILESTONES, EVENT_MILESTONE_CURRENCY_BONUS, EVENT_WEEKLY_RULES, EVENT_LEGACY_GEMS_PAID, EVENT_SHARED_GOALS,
  EVENT_SHOP,
  EVENT_TOKEN_DIVISOR,
  EVENT_TOKEN_MIN_PER_WIN,
  EVENT_UNLOCK_HERO_LEVEL,
  EVENT_DIFFICULTY,
  eventThemeOf,
} from '../data/events';
import { KINGDOM_ORDER, kingdomTroopPool } from '../data/kingdoms';
import { fail, type MetaFailure } from '../types';
import { earn, earnMaterials } from './wallet';
import { addClassXp, classLevelOf } from './hero';
import { grantTroop, rarityTierOf } from './troopProgress';
import type { BridgeOutcome } from './battleBridge';
import type { EncounterPlan } from './encounter';
import { fnv1a32 } from '../data/hash';
import type { BattleResult } from '../../session/contract';
import type { EventActionResult, EventModeImpl, EventProgressLine, ModeCtx } from './eventModes/common';
import { EVENT_POINTS_CAP, isFailureLike } from './eventModes/common';
import { towerMode, abandonTower, type TowerState } from './eventModes/tower';
import { raidMode, type RaidState } from './eventModes/raid';
import { invasionMode, type InvasionState } from './eventModes/invasion';
import { factionMode, type FactionState } from './eventModes/faction';
import { worldMode, type WorldState } from './eventModes/world';
import { trialsMode, type TrialsState } from './eventModes/trials';

export type { EventActionResult, EventProgressLine } from './eventModes/common';
export { EVENT_POINTS_CAP } from './eventModes/common';
export { towerFloorLevel } from './eventModes/tower';
export { raidTierLevel, raidPoolOf, raidPointsFor } from './eventModes/raid';
export { factionMatchCount, FACTION_BUFF_ATTACK_PER, FACTION_BUFF_HP_PER } from './eventModes/faction';

/** 职业试炼单场积分封顶（新星加成可超出平台 120 上限） */
export const EVENT_TRIAL_POINTS_CAP = EVENT_POINTS_CAP * 2;

/** 六活动的玩法状态类型表 */
export interface EventModeStates {
  invasion: InvasionState;
  raidBoss: RaidState;
  towerOfDoom: TowerState;
  factionAssault: FactionState;
  worldEvent: WorldState;
  classTrials: TrialsState;
}

const MODES: { [K in EventTypeId]: EventModeImpl<EventModeStates[K]> } = {
  invasion: invasionMode,
  raidBoss: raidMode,
  towerOfDoom: towerMode,
  factionAssault: factionMode,
  worldEvent: worldMode,
  classTrials: trialsMode,
};

/** 主角是否已达活动解锁等级 */
export function eventsUnlocked(save: MetaSave): boolean {
  return save.hero.level >= EVENT_UNLOCK_HERO_LEVEL;
}

export const EVENT_LOCKED_MESSAGE = `活动需要主角 ${EVENT_UNLOCK_HERO_LEVEL} 级解锁`;

/** 普通段第 stage 阶段（0 起）的敌人等级 */
export function eventStageLevel(stage: number): number {
  const s = Math.min(Math.max(Math.floor(stage), 0), EVENT_DIFFICULTY.topStages - 1);
  return EVENT_DIFFICULTY.base + s * EVENT_DIFFICULTY.step;
}

/** 确保指定活动的本周实例存在（lazy 建档/周切重置，六活动互不借用进度）。 */
export function ensureEventWeek(save: MetaSave, weekStart: number, typeId: EventTypeId): EventWeekState {
  if (!save.eventWeeks[typeId] || save.eventWeeks[typeId].weekStart !== weekStart) {
    save.eventWeeks[typeId] = {
      weekStart, points: 0, claimed: [], wins: 0, tokens: 0, tokensEarned: 0,
      playRewards: 0, bought: {}, eventData: { revision: EVENT_WEEKLY_RULES.revision }, runTeam: null,
    };
  }
  const week = save.eventWeeks[typeId]!;
  if (typeof week.tokens !== 'number') week.tokens = 0;
  if (typeof week.tokensEarned !== 'number') week.tokensEarned = week.tokens;
  if (typeof week.playRewards !== 'number') week.playRewards = 0;
  if (!week.bought) week.bought = {};
  if (!week.eventData) week.eventData = {};
  if (week.runTeam === undefined) week.runTeam = null;
  // 升级当周保留素材领取和购买记录，只为宝石补差；旧档不会重复领取素材。
  if (!week.eventData.revision) {
    for (const i of week.claimed) week.eventData[`gemPaid${i}`] = EVENT_LEGACY_GEMS_PAID[typeId][i] ?? 0;
    if (typeId === 'towerOfDoom') week.eventData.towerPaidFloors = Math.min(EVENT_WEEKLY_RULES.towerFloors, week.eventData.floorBest ?? 0);
    week.eventData.revision = EVENT_WEEKLY_RULES.revision;
  }
  // 玩法状态机：缺失或结构不合法 → 按本周参数重建（旧版塔的冻结队伍一并作废）
  // 已校验过的状态对象不重复校验（也保证同一对象引用在一次结算内稳定）
  if (typeof week.mode === 'object' && week.mode !== null && VALIDATED.has(week.mode)) return week;
  const ctx = modeCtx(save, weekStart, typeId, week);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  const parsed = week.mode === undefined ? null : mode.sanitize(week.mode, ctx);
  if (!parsed) {
    week.mode = mode.init(ctx);
    if (typeId === 'towerOfDoom') week.runTeam = null;
  } else week.mode = parsed;
  VALIDATED.add(week.mode as object);
  return week;
}

const VALIDATED = new WeakSet<object>();

function modeCtx(save: MetaSave, weekStart: number, typeId: EventTypeId, week: EventWeekState): ModeCtx {
  return { save, week, weekStart, typeId, theme: eventThemeOf(typeId, weekStart) };
}

/** 读某活动本周的玩法状态（屏层渲染用；同时保证实例存在） */
export function eventModeState<K extends EventTypeId>(save: MetaSave, weekStart: number, typeId: K): EventModeStates[K] {
  return ensureEventWeek(save, weekStart, typeId).mode as EventModeStates[K];
}

/** 按 plan 找回活动上下文 */
function planCtx(save: MetaSave, plan: EncounterPlan): { ctx: ModeCtx; mode: EventModeImpl<unknown>; state: unknown } | null {
  const source = plan.source;
  if (source.kind !== 'event') return null;
  const typeId = source.typeId as EventTypeId;
  const week = ensureEventWeek(save, source.weekStart, typeId);
  return { ctx: modeCtx(save, source.weekStart, typeId, week), mode: MODES[typeId] as EventModeImpl<unknown>, state: week.mode };
}

/** 指定活动的本周主题（存档无关的纯读）。 */
export function currentEventTheme(weekStart: number, typeId: EventTypeId): EventTheme {
  return eventThemeOf(typeId, weekStart);
}

/** 下一场的基础敌人等级（页面展示用） */
export function eventNextLevel(save: MetaSave, weekStart: number, typeId: EventTypeId): { level: number; top: boolean } {
  const week = ensureEventWeek(save, weekStart, typeId);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  const level = mode.nextLevel(modeCtx(save, weekStart, typeId, week), week.mode);
  return { level, top: level >= EVENT_DIFFICULTY.topBase };
}

// ---------------------------------------------------------------------------
// 出战：计划 → 请求修改
// ---------------------------------------------------------------------------

/** 活动战斗出敌计划：action 为玩法动作（节点/兵团/地块/试炼 id）。seed 由网关注入（熵源） */
export function planEventEncounter(save: MetaSave, weekStart: number, seed: number, typeId: EventTypeId, action?: string): EncounterPlan | MetaFailure {
  const week = ensureEventWeek(save, weekStart, typeId);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  const planned = mode.plan(modeCtx(save, weekStart, typeId, week), week.mode, seed >>> 0, action);
  if (isFailureLike(planned)) return planned;
  let kingdom = planned.kingdom;
  if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
  return {
    kingdom,
    source: { kind: 'event', weekStart, typeId, choice: planned.choice },
    seed: seed >>> 0,
    enemies: planned.enemies,
    ...(planned.bonus?.length ? { bonus: planned.bonus } : {}),
  };
}

/** 出战前置校验（解锁、主角/职业、各玩法的阵容/条件要求） */
export function eventBattleReady(save: MetaSave, typeId: EventTypeId, hasHeroInTeam: boolean, action?: string, weekStart?: number): string | null {
  if (!eventsUnlocked(save)) return EVENT_LOCKED_MESSAGE;
  if (typeId === 'classTrials' && !hasHeroInTeam) return '职业试炼需要主角编入出战队伍';
  if (typeId === 'classTrials' && (!save.hero.classId || !save.hero.unlockedClasses.includes(save.hero.classId) || classLevelOf(save, save.hero.classId) < 1)) return '请先为主角装备职业，再进入职业试炼';
  const ws = weekStart ?? save.eventWeeks[typeId]?.weekStart;
  if (ws === undefined) return null;
  const week = ensureEventWeek(save, ws, typeId);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  return mode.ready?.(modeCtx(save, ws, typeId, week), week.mode, action) ?? null;
}

/** 活动玩法对出战请求的修改（在 buildBattleRequest 之后调用） */
export function applyEventBattleModifiers(save: MetaSave, outcome: BridgeOutcome): void {
  const found = planCtx(save, outcome.plan);
  if (!found) return;
  for (const snap of outcome.request.playerTeam) {
    const id = snap.externalId.match(/^p\d+-(\d+)$/)?.[1];
    const troop = id ? getTroopById(Number(id)) : undefined;
    const record = id ? save.collection[id] : undefined;
    snap.eventRarity = troop && record ? rarityTierOf(troop, record) : 0;
  }
  found.mode.modify(found.ctx, found.state, outcome);
}

// ---------------------------------------------------------------------------
// 结算：积分（开战时状态）→ 玩法推进
// ---------------------------------------------------------------------------

/** 单场活动积分（结算前调用：读的是开战时的玩法状态） */
export function eventBattlePoints(save: MetaSave, plan: EncounterPlan, result: BattleResult, victory: boolean): number {
  const found = planCtx(save, plan);
  if (!found) return 0;
  return Math.max(0, Math.round(found.mode.points(found.ctx, found.state, plan, result, victory)));
}

/** 每场活动战斗后的玩法状态推进。胜负都调用 */
export function eventBattleProgress(save: MetaSave, plan: EncounterPlan, result: BattleResult, victory: boolean): { lines: EventProgressLine[] } {
  const found = planCtx(save, plan);
  if (!found) return { lines: [] };
  return { lines: found.mode.progress(found.ctx, found.state, plan, result, victory) };
}

/** 职业试炼的职业经验倍率（常规 ×2，本场三星全达成 ×3）；其它活动 ×1 */
export function eventClassXpMultiplier(save: MetaSave, plan: EncounterPlan): number {
  if (plan.source.kind !== 'event' || plan.source.typeId !== 'classTrials') return 1;
  const state = ensureEventWeek(save, plan.source.weekStart, 'classTrials').mode as TrialsState;
  return state.lastPerfect ? 3 : 2;
}

/** 非战斗动作（选路、营地、商人、掷骰…）；失败不改存档 */
export function eventAction(save: MetaSave, weekStart: number, typeId: EventTypeId, action: string, seed: number): EventActionResult | MetaFailure {
  if (!eventsUnlocked(save)) return fail('PREREQ_LOCKED', EVENT_LOCKED_MESSAGE);
  const week = ensureEventWeek(save, weekStart, typeId);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  if (!mode.act) return fail('INVALID', '该活动没有可执行的操作');
  const before = JSON.stringify({ mode: week.mode, runTeam: week.runTeam, eventData: week.eventData, currencies: save.currencies, materials: save.materials, gifts: save.gifts });
  const result = mode.act(modeCtx(save, weekStart, typeId, week), week.mode, action, seed >>> 0);
  if (isFailureLike(result)) {
    const snap = JSON.parse(before) as { mode: unknown; runTeam: EventWeekState['runTeam']; eventData: EventWeekState['eventData']; currencies: MetaSave['currencies']; materials: MetaSave['materials']; gifts: MetaSave['gifts'] };
    // 原地还原玩法状态（保持对象引用稳定，屏层/调用方持有的引用不失效）
    const live = week.mode as Record<string, unknown>;
    for (const k of Object.keys(live)) delete live[k];
    Object.assign(live, snap.mode as Record<string, unknown>);
    week.runTeam = snap.runTeam; week.eventData = snap.eventData;
    save.currencies = snap.currencies; save.materials = snap.materials; save.gifts = snap.gifts;
  } else {
    const rewards = [
      ...claimEventMilestones(save, weekStart, typeId),
      ...claimEventWeeklyGems(save, weekStart, typeId),
    ];
    if (rewards.length) result.lines = [...(result.lines ?? []), ...rewards];
  }
  return result;
}

/** 主动放弃登塔：按已到达层数收尾发奖 */
export function abandonTowerRun(save: MetaSave, weekStart: number): { ok: true; floorReached: number; glory: number; scrolls: number } | MetaFailure {
  const week = ensureEventWeek(save, weekStart, 'towerOfDoom');
  return abandonTower(modeCtx(save, weekStart, 'towerOfDoom', week), week.mode as TowerState);
}

// ---------------------------------------------------------------------------
// 积分 / 里程碑（进度口径：世界事件=物资，其余=积分）
// ---------------------------------------------------------------------------

/** 里程碑进度值 */
export function eventMetricOf(save: MetaSave, weekStart: number, typeId: EventTypeId): { label: string; value: number } {
  const week = ensureEventWeek(save, weekStart, typeId);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  return mode.metric?.(modeCtx(save, weekStart, typeId, week), week.mode) ?? { label: '积分', value: week.points };
}

export interface EventMilestoneGain {
  index: number;
  milestone: EventMilestone;
}

/** 结算后新达标的里程碑（调用方负责入账；value 为含本场的进度总量） */
export function eventMilestonesReached(
  typeId: EventTypeId,
  value: number,
  alreadyClaimed: readonly number[],
): EventMilestoneGain[] {
  const table = EVENT_MILESTONES[typeId];
  const claimed = new Set(alreadyClaimed);
  const gains: EventMilestoneGain[] = [];
  for (let i = 0; i < table.length; i++) {
    if (claimed.has(i)) continue;
    if (value >= table[i]!.points) gains.push({ index: i, milestone: table[i]! });
  }
  return gains;
}

/** 战斗和非战斗进度共用领取账本；每周每档仅入账一次。宝石使用独立旧档兼容账本。 */
export function claimEventMilestones(save: MetaSave, weekStart: number, typeId: EventTypeId): EventProgressLine[] {
  const week = ensureEventWeek(save, weekStart, typeId);
  const metric = eventMetricOf(save, weekStart, typeId).value;
  return eventMilestonesReached(typeId, metric, week.claimed).map(({ index, milestone: m }) => {
    week.claimed.push(index);
    week.eventData[`currencyBonusPaid${index}`] = 1;
    const deltas = earn(save, {
      gold: m.gold ?? 0, souls: m.souls ?? 0, goldKeys: m.goldKeys ?? 0, glory: m.glory ?? 0,
    });
    const mats = earnMaterials(save, m.mats ?? {});
    return {
      label: `里程碑 · ${m.label}`, deltas, mats,
      note: typeId === 'worldEvent' ? `${m.points} 物资达成` : `${m.points} 分达成`,
    };
  });
}

/** 活动页读模型：里程碑进度 + 总览一句话 */
export interface EventPageState {
  metric: { label: string; value: number };
  summary: string;
}

export function eventPageState(save: MetaSave, weekStart: number, typeId: EventTypeId): EventPageState {
  const week = ensureEventWeek(save, weekStart, typeId);
  const mode = MODES[typeId] as EventModeImpl<unknown>;
  const ctx = modeCtx(save, weekStart, typeId, week);
  return { metric: eventMetricOf(save, weekStart, typeId), summary: mode.summary(ctx, week.mode) };
}

// ---------------------------------------------------------------------------
// 活动商店（官方活动币商店的单机适配：代币 = 胜场产出，跨周作废）
// ---------------------------------------------------------------------------

/** 单场胜局的代币产出（设计值：max(3, floor(points/10))，30~120 分 → 3~12 代币） */
export function eventTokensFor(points: number): number {
  return Math.max(EVENT_TOKEN_MIN_PER_WIN, Math.floor(points / EVENT_TOKEN_DIVISOR));
}

/** 本周货架（读模型：带剩余库存；屏层直接渲染） */
export interface EventShopRow {
  goods: EventGoods;
  /** 剩余可购次数（限量货）；null = 无限量 */
  stockLeft: number | null;
}

function eventTroop(theme: EventTheme, periodIndex: number, role: NonNullable<EventGoods['troopRole']>) {
  const candidates = TROOPS.filter((troop) => {
    if (role === 'siegebreaker' || role === 'godslayer') return troop.traits.some((trait) => trait?.code === role);
    if (role === 'faction') return troop.kingdom === theme.kingdom && troop.rarityIdx >= 2 && troop.rarityIdx <= 4;
    return troop.troopTypes.includes(theme.bonusRace ?? '') && troop.rarityIdx === 3;
  });
  const themed = theme.kingdom && (role === 'siegebreaker' || role === 'godslayer')
    ? candidates.filter((troop) => troop.kingdom === theme.kingdom)
    : [];
  const pool = themed.length ? themed : candidates.length ? candidates : TROOPS.filter((troop) =>
    role === 'faction' ? troop.kingdom === theme.kingdom : troop.troopTypes.includes(theme.bonusRace ?? ''));
  if (!pool.length) throw new Error(`活动商店缺少可用兵种：${theme.type.id}/${role}`);
  const offset = fnv1a32(`${theme.type.id}-${role}`);
  return pool[((offset + periodIndex) % pool.length + pool.length) % pool.length]!;
}

export function eventShopOf(save: MetaSave, weekStart: number, typeId: EventTypeId, now = weekStart) {
  const period = eventShopPeriodOf(now);
  // Freeze this shelf's theme through its two-day window, including Monday midnight.
  const theme = currentEventTheme(weekStartOf(period.start), typeId);
  const week = ensureEventWeek(save, weekStart, typeId);
  save.eventShops ??= {};
  const previous = save.eventShops[typeId];
  if (!previous || previous.periodStart !== period.start) {
    save.eventShops[typeId] = {
      periodStart: period.start,
      // Legacy weekly-only saves retain existing purchases until the next restock.
      bought: previous ? {} : { ...week.bought },
    };
  }
  const stock = save.eventShops[typeId]!;
  const rows = EVENT_SHOP[theme.type.id]!.map((baseGoods) => {
    const troop = baseGoods.troopRole ? eventTroop(theme, period.index, baseGoods.troopRole) : undefined;
    const goods = troop ? { ...baseGoods, troopId: troop.id, name: troop.name, blurb: ({
      siegebreaker: '攻城手 · 入侵专精', godslayer: '神祇杀手 · 首领专精',
      faction: `阵营精选 · ${theme.kingdom}`, race: `种族精选 · ${theme.bonusRace}`,
    } as Record<NonNullable<EventGoods['troopRole']>, string>)[baseGoods.troopRole!] } : baseGoods;
    return {
      goods,
      stockLeft: goods.stock === null ? null : Math.max(0, goods.stock - (stock.bought[goods.id] ?? 0)),
    };
  });
  return { theme, week, stock, period, rows };
}

export type EventBuyResult =
  | { ok: true; goodsId: string; tokensSpent: number; tokensLeft: number; stockLeft: number | null }
  | MetaFailure;

/** 购买一件货架商品：代币原子扣账 → 素材/货币入账 → 已购计数 +1 */
export function buyEventGoods(save: MetaSave, goodsId: string, weekStart: number, typeId: EventTypeId, now = weekStart, expectedPeriodStart?: number): EventBuyResult {
  if (expectedPeriodStart !== undefined && expectedPeriodStart !== eventShopPeriodOf(now).start) {
    return fail('INVALID', '货品已刷新，请确认新货架后兑换');
  }
  if (!eventsUnlocked(save)) return fail('PREREQ_LOCKED', EVENT_LOCKED_MESSAGE);
  const shop = eventShopOf(save, weekStart, typeId, now);
  const row = shop.rows.find((r) => r.goods.id === goodsId);
  if (!row) return fail('INVALID', '该商品不在此活动货架');
  if (row.stockLeft !== null && row.stockLeft <= 0) return fail('SOLD_OUT', '该商品本期已售罄');
  if (row.goods.classXp && (!save.hero.classId || !save.hero.unlockedClasses.includes(save.hero.classId) || classLevelOf(save, save.hero.classId) <= 0)) {
    return fail('PREREQ_LOCKED', '请先解锁并装备一个职业');
  }
  const week = shop.week;
  if (week.tokens < row.goods.cost) {
    return fail('INSUFFICIENT', `活动印记不足：需要 ${row.goods.cost}，现有 ${week.tokens}`);
  }
  week.tokens -= row.goods.cost;
  week.bought[goodsId] = (week.bought[goodsId] ?? 0) + 1;
  shop.stock.bought[goodsId] = (shop.stock.bought[goodsId] ?? 0) + 1;
  const g = row.goods;
  earn(save, { gold: g.gold ?? 0, souls: g.souls ?? 0, gems: g.gems ?? 0, goldKeys: g.goldKeys ?? 0, glory: g.glory ?? 0 });
  earnMaterials(save, g.mats ?? {});
  if (g.troopId) grantTroop(save, g.troopId, 1);
  if (g.classXp && save.hero.classId) addClassXp(save, save.hero.classId, g.classXp);
  const stockLeft = g.stock === null ? null : g.stock - shop.stock.bought[goodsId]!;
  return { ok: true, goodsId, tokensSpent: g.cost, tokensLeft: week.tokens, stockLeft };
}

/** 跨活动周目标集中在入侵周实例的命名键中，随同一周锚点重置。 */
export function eventWeeklySummary(save: MetaSave, weekStart: number) {
  const ledger = ensureEventWeek(save, weekStart, 'invasion');
  const wins = Object.values(save.eventWeeks).reduce((sum, w) => sum + (w?.weekStart === weekStart ? w.wins : 0), 0);
  const goals = EVENT_SHARED_GOALS.map((goal, i) => ({ ...goal, claimed: ledger.eventData[`sharedClaim${i}`] === 1 }));
  return { wins, goals, earned: goals.reduce((sum, g) => sum + (g.claimed ? g.gems : 0), 0) };
}

/** 宝石与素材分账；旧版已领里程碑只补新增货币与宝石差额。 */
export function claimEventWeeklyGems(save: MetaSave, weekStart: number, typeId: EventTypeId): EventProgressLine[] {
  const week = ensureEventWeek(save, weekStart, typeId);
  const metric = eventMetricOf(save, weekStart, typeId).value;
  const lines: EventProgressLine[] = [];
  EVENT_MILESTONES[typeId].forEach((m, i) => {
    if (metric < m.points && !week.claimed.includes(i)) return;
    if (week.claimed.includes(i) && week.eventData[`currencyBonusPaid${i}`] !== 1) {
      const deltas = earn(save, { gold: EVENT_MILESTONE_CURRENCY_BONUS.gold[i]!, souls: EVENT_MILESTONE_CURRENCY_BONUS.souls[i]! });
      week.eventData[`currencyBonusPaid${i}`] = 1;
      lines.push({ label: `里程碑增补 · ${m.label}`, deltas });
    }
    const paid = week.eventData[`gemPaid${i}`] ?? 0;
    const gems = Math.max(0, (m.gems ?? 0) - paid);
    if (gems > 0) {
      earn(save, { gems }); week.eventData[`gemPaid${i}`] = paid + gems;
      lines.push({ label: `周常宝石 · ${m.label}`, deltas: { gems } });
    }
  });
  const summary = eventWeeklySummary(save, weekStart);
  const ledger = ensureEventWeek(save, weekStart, 'invasion');
  summary.goals.forEach((g, i) => {
    if (!g.claimed && summary.wins < g.wins) return;
    const currencyPaid = ledger.eventData[`sharedCurrencyPaid${i}`] === 1;
    if (g.claimed && currencyPaid) return;
    const deltas = earn(save, { gems: g.claimed ? 0 : g.gems, gold: currencyPaid ? 0 : g.gold, souls: currencyPaid ? 0 : g.souls });
    ledger.eventData[`sharedClaim${i}`] = 1;
    ledger.eventData[`sharedCurrencyPaid${i}`] = 1;
    lines.push({ label: `每周远征 · 累计${g.wins}胜`, deltas, note: '六种活动共同推进，周一刷新' });
  });
  return lines;
}
