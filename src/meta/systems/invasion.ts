/**
 * 入侵 PvP（素材批 2026-09-19）——官方排位 PvP 的单机适配（世界观包装沿用「入侵」）。
 *
 * 官方口径（考据见 design/EVENTS-INVASION-DESIGN.md §1.3）：
 *  - 打的是**其他玩家防守队的 AI 镜像**；本作 29 个镜像由代码构筑，数据形状
 *    （InvasionMirror）= 未来 D1 里一行真人玩家数据（id 换玩家 id、vp 由服务端同步），
 *    屏层与结算逻辑零返工——这正是网关「mock 后端 ↔ D1」预留缝的入侵侧落点。
 *  - 联赛 10 级官阶、30 人小组、每周 VP 排名、晋级/降级区名次表照抄官方；
 *  - VP 计分：官方基础分表 + min/max 夹紧 + 速胜/存活/额外回合加分（每类取最高）；
 *    4/5 消计数与一击必杀不可得（eventSummary 只有类型计数），差异已记录（DESIGN §4 G5）；
 *  - 荣耀主产（官方「排位主产荣耀」）：20 荣耀=1 荣耀箱；每日入侵首胜加成。
 *
 * 确定性：榜单、对手、VP 曲线全部由 (weekStart, league) 种子派生——同周同联赛
 * 同时刻必复现同一份榜单（单测锁定）。
 */
import { SeededRNG } from '../../engine/rng';
import { getTroopById, knownTroopTypes } from '../../data/troops';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../session/contract';
import type { BattleRequest, BattleResult, CombatantSnapshot } from '../../session/contract';
import { validateBattleRequest } from '../../session/validateRequest';
import { fail, type MetaFailure } from '../types';
import type { MetaSave } from '../state/schema';
import {
  INVASION,
  INVASION_LEAGUES,
  INVASION_SEASON_REWARDS,
  INVASION_VP_TABLE,
  INVASION_ZONES,
  invasionInitialLeague,
} from '../data/economy';
import { fnv1a32 } from '../data/hash';
import { WEEK_MS } from '../data/events';
import { allKingdoms, kingdomTroopPool } from '../data/kingdoms';
import { KNOWN_TRAIT_CODES } from '../data/traitIndex';
import { buildMetaRegistry, buildPlayerSnapshots, enemyToSnapshot } from './battleBridge';
import { earn } from './wallet';
import type { EncounterEnemy, EnemyTier } from './encounter';

// ---------------------------------------------------------------------------
// 镜像对手池（D1 预留的核心形状）
// ---------------------------------------------------------------------------

/** 防守队成员（与出敌条目同形；镜像=纯部队队，真人主角位留待 D1 接入后扩展） */
export type MirrorDefender = EncounterEnemy;

/**
 * 一个「对手玩家」的镜像。本作由代码构筑；D1 时代同形状字段由服务端下发：
 * id → 玩家 id，vp → 服务端同步的本周积分，defense → 玩家防守队快照。
 */
export interface InvasionMirror {
  /** 'bot-N'（D1 时代 = 真人玩家 id） */
  id: string;
  name: string;
  /** 防守评分（展示 + 宿敌判定的强度近似） */
  rating: number;
  /** 血怒对手：打它 VP×2（官方 Blood Frenzy 语义；每周标 2 人） */
  frenzy: boolean;
  /** 当前推演 VP（随时刻，见 mirrorVpAt） */
  vp: number;
  /** 周末终值 VP（榜单预测 / 周结排名） */
  finalVp: number;
  /** 防守队（3~4 人） */
  defense: MirrorDefender[];
}

/** 联赛 → 防守队强度带（设计值） */
const LEAGUE_DEFENSE: ReadonlyArray<{ rarityBand: [number, number]; levelBase: number; boss: boolean }> = [
  { rarityBand: [0, 2], levelBase: 8, boss: false },
  { rarityBand: [0, 2], levelBase: 12, boss: false },
  { rarityBand: [1, 3], levelBase: 16, boss: true },
  { rarityBand: [1, 3], levelBase: 20, boss: true },
  { rarityBand: [2, 4], levelBase: 24, boss: true },
  { rarityBand: [2, 4], levelBase: 28, boss: true },
  { rarityBand: [3, 5], levelBase: 32, boss: true },
  { rarityBand: [3, 5], levelBase: 36, boss: true },
  { rarityBand: [3, 5], levelBase: 40, boss: true },
  { rarityBand: [4, 5], levelBase: 44, boss: true },
];

/** 联赛 → 镜像周末终值 VP 区间（设计值：联赛越高卷得越凶） */
const LEAGUE_VP_RANGE: ReadonlyArray<[number, number]> = [
  [200, 600], [500, 1100], [900, 1800], [1400, 2600], [2000, 3600],
  [2800, 4800], [3600, 6200], [4600, 7800], [5800, 9600], [7200, 12000],
];

const NAME_PREFIX = [
  '暴怒的', '冷面的', '无眠的', '闪耀的', '阴沉的', '迅捷的', '古老的', '赤红的', '苍白的', '黢黑的',
  '欢愉的', '锈蚀的', '银装的', '狂风的', '碎浪的', '燃焰的', '霜寒的', '低语的', '孤高的', '血誓的',
] as const;
const NAME_CORE = [
  '凯尔', '瓦罗', '洛珊', '瑟兰', '莫德', '泰卡', '瑞恩', '格温', '艾达', '布伦',
  '菲奥', '杜兰', '诺克', '萨尔', '薇拉', '泽塔', '约恩', '基拉', '奥登', '韩娜',
] as const;
const NAME_TITLE = ['爵士', '男爵', '子爵', '伯爵', '统帅', '领主', '大师', '团长', '斗士', '猎人'] as const;

function defenseTierPlan(league: number, rng: SeededRNG): EnemyTier[] {
  const spec = LEAGUE_DEFENSE[Math.min(Math.max(league, 0), LEAGUE_DEFENSE.length - 1)]!;
  if (spec.boss) return ['elite', 'minion', rng.next() < 0.5 ? ('boss' as const) : ('elite' as const), 'minion' as const];
  return ['elite', 'minion', 'minion', 'minion'];
}

/** (weekStart, league) → 29 个镜像（同参数必复现；互不重名） */
export function buildBracket(weekStart: number, league: number): InvasionMirror[] {
  const rng = new SeededRNG(fnv1a32(`invasion-${weekStart >>> 0}:${league}`));
  const spec = LEAGUE_DEFENSE[Math.min(Math.max(league, 0), LEAGUE_DEFENSE.length - 1)]!;
  const [vpMin, vpMax] = LEAGUE_VP_RANGE[Math.min(Math.max(league, 0), LEAGUE_VP_RANGE.length - 1)]!;
  const usedNames = new Set<string>();
  const kingdoms = allKingdoms();
  const mirrors: InvasionMirror[] = [];
  for (let i = 0; i < INVASION.bracketSize; i++) {
    const strength = rng.next();
    const tierPlan = defenseTierPlan(league, rng);
    const defense = pickMirrorDefense(kingdoms, spec.rarityBand, spec.levelBase + rng.nextInt(5), tierPlan, rng);
    let name = `${NAME_PREFIX[rng.nextInt(NAME_PREFIX.length)]}${NAME_CORE[rng.nextInt(NAME_CORE.length)]}${NAME_TITLE[rng.nextInt(NAME_TITLE.length)]}`;
    let suffix = 2;
    while (usedNames.has(name)) name = `${name}${suffix++}`;
    usedNames.add(name);
    const rating = defense.reduce((sum, d) => {
      const troop = getTroopById(d.troopId);
      return sum + (troop ? (troop.rarityIdx + 1) * 30 + d.level * 3 : 0);
    }, 0);
    const finalVp = Math.round((vpMin + (vpMax - vpMin) * strength) * (0.85 + rng.next() * 0.3));
    mirrors.push({
      id: `bot-${i + 1}`,
      name,
      rating,
      frenzy: false,
      vp: 0,
      finalVp,
      defense,
    });
  }
  // 血怒：终值 VP 最高的 2 人（官方「打他们更疼更赚」的直观呈现）
  mirrors
    .slice()
    .sort((a, b) => b.finalVp - a.finalVp)
    .slice(0, INVASION.frenzyCount)
    .forEach((m) => {
      m.frenzy = true;
    });
  return mirrors;
}

/** 防守队取人：多王国混编（随机王国 × 稀有度带），避免「全服一个王国」的观感 */
function pickMirrorDefense(
  kingdoms: readonly string[],
  band: [number, number],
  level: number,
  tiers: readonly EnemyTier[],
  rng: SeededRNG,
): MirrorDefender[] {
  const chosen = new Set<number>();
  const out: MirrorDefender[] = [];
  for (const tier of tiers) {
    let min = band[0];
    let max = band[1];
    let pool: ReturnType<typeof kingdomTroopPool> = [];
    let guard = 0;
    do {
      const kingdom = kingdoms[rng.nextInt(kingdoms.length)]!;
      pool = kingdomTroopPool(kingdom, { min, max }).filter((t) => !chosen.has(t.id));
      if (pool.length === 0 && (min > 0 || max < 5)) {
        min = Math.max(0, min - 1);
        max = Math.min(5, max + 1);
      } else if (pool.length === 0) {
        break;
      }
    } while (pool.length === 0 && guard++ < 8);
    if (pool.length === 0) continue;
    const troop = pool[rng.nextInt(pool.length)]!;
    chosen.add(troop.id);
    out.push({ troopId: troop.id, level, tier });
  }
  return out;
}

/** 镜像在时刻 t 的推演 VP（错峰爬坡：各自在不同时点起步，周末全部到终值） */
export function mirrorVpAt(mirror: InvasionMirror, now: number, weekStart: number): number {
  const elapsed = Math.min(Math.max(now - weekStart, 0), WEEK_MS);
  return Math.round(mirror.finalVp * elapsed / WEEK_MS);
}

/** 给镜像刷当前时刻的 vp（屏层渲染前调用；不落存档） */
export function hydrateMirrorVp(mirrors: InvasionMirror[], now: number, weekStart: number): InvasionMirror[] {
  for (const m of mirrors) m.vp = mirrorVpAt(m, now, weekStart);
  return mirrors;
}

/** 榜单（玩家 + 29 镜像，按 VP 降序；placement 1 起） */
export interface StandingRow {
  id: string;
  name: string;
  vp: number;
  frenzy: boolean;
  isPlayer: boolean;
}

export function invasionStandings(save: MetaSave, now: number, weekStart: number): { rows: StandingRow[]; placement: number } {
  const mirrors = hydrateMirrorVp(buildBracket(weekStart, save.invasion.league), now, weekStart);
  const rows: StandingRow[] = [
    { id: 'player', name: '法露特（你）', vp: save.invasion.vp, frenzy: false, isPlayer: true },
    ...mirrors.map((m) => ({ id: m.id, name: m.name, vp: m.vp, frenzy: m.frenzy, isPlayer: false })),
  ].sort((a, b) => b.vp - a.vp);
  const placement = rows.findIndex((r) => r.isPlayer) + 1;
  return { rows, placement };
}

// ---------------------------------------------------------------------------
// 赛季（lazy 周结）
// ---------------------------------------------------------------------------

export type SeasonMovement = 'promote' | 'stay' | 'relegate';

export interface SeasonRollSummary {
  /** true = 结算了一个真实打过的赛季（0 场不降不发，官方「不打不降」） */
  played: boolean;
  fromLeague: number;
  toLeague: number;
  placement: number;
  movement: SeasonMovement;
  glory: number;
  gems: number;
}

/**
 * 进入入侵玩法前确保赛季是本周的：首次进入按主角等级定级（官方 Path 段映射）；
 * 跨周触发上周结算（名次 → 晋级/守级/降级 + 奖励）。幂等；同周内重复调用返回 null。
 */
export function ensureInvasionSeason(save: MetaSave, _now: number, weekStart: number): SeasonRollSummary | null {
  if (save.invasion.weekStart === weekStart) return null;

  // 首次进入：定级不发奖
  if (save.invasion.weekStart === 0) {
    save.invasion.league = invasionInitialLeague(save.hero.level);
    save.invasion.bestLeague = save.invasion.league;
    save.invasion.weekStart = weekStart;
    save.invasion.seed = fnv1a32(`invasion-${weekStart >>> 0}:${save.invasion.league}`);
    save.invasion.vp = 0;
    save.invasion.battles = 0;
    return null;
  }

  // 跨周：用上周种子与终值 VP 结算名次
  const fromLeague = save.invasion.league;
  const mirrors = buildBracket(save.invasion.weekStart, fromLeague);
  const placement = 1 + mirrors.filter((m) => m.finalVp > save.invasion.vp).length;
  const zone = INVASION_ZONES[fromLeague]!;
  const played = save.invasion.battles > 0;
  let movement: SeasonMovement = 'stay';
  if (played) {
    if (zone.promote > 0 && placement <= zone.promote && fromLeague < INVASION_LEAGUES.length - 1) movement = 'promote';
    else if (zone.relegate > 0 && placement >= zone.relegate && fromLeague > 0) movement = 'relegate';
  }
  const toLeague = movement === 'promote' ? fromLeague + 1 : movement === 'relegate' ? fromLeague - 1 : fromLeague;
  const rewards = played ? INVASION_SEASON_REWARDS[movement] : { glory: 0, gems: 0 };
  if (rewards.glory > 0 || rewards.gems > 0) {
    earn(save, { glory: rewards.glory, gems: rewards.gems });
  }
  if (played && movement === 'promote') {
    // 晋级材料包（DESIGN §2.5）
    for (const [key, n] of Object.entries(INVASION_SEASON_REWARDS.promoteMats.ingots)) {
      save.materials.ingots[key] = (save.materials.ingots[key] ?? 0) + n!;
    }
    save.materials.forgeScrolls += INVASION_SEASON_REWARDS.promoteMats.forgeScrolls;
    for (const [key, n] of Object.entries(INVASION_SEASON_REWARDS.promoteMats.traitstones)) {
      save.materials.traitstones[key] = (save.materials.traitstones[key] ?? 0) + n!;
    }
  }
  save.invasion.league = toLeague;
  save.invasion.bestLeague = Math.max(save.invasion.bestLeague, toLeague);
  save.invasion.seasonsPlayed += 1;
  save.invasion.weekStart = weekStart;
  save.invasion.seed = fnv1a32(`invasion-${weekStart >>> 0}:${toLeague}`);
  save.invasion.vp = 0;
  save.invasion.battles = 0;
  return {
    played,
    fromLeague,
    toLeague,
    placement,
    movement,
    glory: rewards.glory,
    gems: rewards.gems,
  };
}

// ---------------------------------------------------------------------------
// 匹配与出战斗
// ---------------------------------------------------------------------------

/** 当日候选（VP 最接近的 8 人按日轮换取 5；官方「打你联赛里的人」语义） */
export function invasionCandidates(save: MetaSave, now: number, weekStart: number): InvasionMirror[] {
  const mirrors = hydrateMirrorVp(buildBracket(weekStart, save.invasion.league), now, weekStart);
  const dayIndex = Math.floor((now - weekStart) / (24 * 3_600_000));
  const nearest = mirrors
    .map((m) => ({ m, gap: Math.abs(m.vp - save.invasion.vp) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 8)
    .map((e) => e.m);
  const offset = dayIndex % Math.max(nearest.length - INVASION.candidates + 1, 1);
  return nearest.slice(offset, offset + INVASION.candidates);
}

export interface InvasionBridgeOutcome {
  ok: true;
  request: BattleRequest;
  /** 对手镜像（结算回传用） */
  mirror: InvasionMirror;
  /** 本场可用注册表（headless 驱动/战斗层共用） */
  registry: ReturnType<typeof buildMetaRegistry>;
}

/** 对一只镜像的出战斗计划：我方=当前预设队（主角/旗帜/王国加成全生效），敌方=镜像防守队 */
export function planInvasionBattle(
  save: MetaSave,
  mirrorId: string,
  battleSeed: number,
  now: number,
  weekStart: number,
): InvasionBridgeOutcome | MetaFailure {
  ensureInvasionSeason(save, now, weekStart);
  if (save.hero.level < INVASION.unlockHeroLevel) {
    return fail('PREREQ_LOCKED', `入侵需要主角 ${INVASION.unlockHeroLevel} 级（当前 ${save.hero.level}）`);
  }
  const mirror = invasionCandidates(save, now, weekStart).find((m) => m.id === mirrorId);
  if (!mirror) return fail('INVALID', '该对手不在今日候选中');

  const built = buildPlayerSnapshots(save);
  if (!built.ok) return built;

  const enemyTeam: CombatantSnapshot[] = mirror.defense.map((d, index) => {
    const troop = getTroopById(d.troopId)!;
    return enemyToSnapshot(troop, d, index);
  });
  const request: BattleRequest = {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: `invasion-${weekStart >>> 0}`,
    requestId: `invasion-${mirror.id}-${save.invasion.battles}`,
    rulesetVersion: RULESET_VERSION,
    seed: battleSeed >>> 0,
    playerTeam: built.playerTeam,
    enemyTeam,
    mode: 'pvp',
  };
  const registry = buildMetaRegistry(
    [...built.playerTeam, ...enemyTeam].map((s) => s.skillId as string),
  );
  const check = validateBattleRequest(request, {
    knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]),
    knownTraitIds: KNOWN_TRAIT_CODES,
    knownTroopTypes: knownTroopTypes(),
  });
  if (!check.ok) {
    const first = check.issues[0];
    return fail('INVALID', `入侵战斗请求未过会话校验：${first ? `${first.code} ${first.message}` : ''}`);
  }
  return { ok: true, request, mirror, registry };
}

// ---------------------------------------------------------------------------
// 结算（VP 表为官方数值）
// ---------------------------------------------------------------------------

function vpBand(avgLevel: number): { base: number; min: number; max: number } {
  const row = INVASION_VP_TABLE.find((r) => avgLevel <= r.maxLevel) ?? INVASION_VP_TABLE[INVASION_VP_TABLE.length - 1]!;
  return { base: row.base, min: row.min, max: row.max };
}

/** 官方加分项（每类取最高）：速胜 / 存活 / 额外回合 */
export function invasionVpBonuses(result: BattleResult): { speed: number; survivors: number; extraTurns: number; total: number } {
  const best = <T extends { bonus: number }>(rows: readonly T[], hit: (r: T) => boolean): number =>
    rows.filter(hit).reduce((acc, r) => Math.max(acc, r.bonus), 0);
  const speed = best(INVASION.speedBonuses, (r) => result.turns <= r.maxTurns);
  const playerAlive = result.combatants.filter((c) => c.side === 'player' && !c.defeated).length;
  const survivors = best(INVASION.survivorBonuses, (r) => playerAlive >= r.survivors);
  const extraCount = result.eventSummary.find((e) => e.type === 'extra-turn')?.count ?? 0;
  const extraTurns = best(INVASION.extraTurnBonuses, (r) => extraCount >= r.count);
  return { speed, survivors, extraTurns, total: speed + survivors + extraTurns };
}

export interface InvasionSettleResult {
  ok: true;
  victory: boolean;
  /** 未计入加成与血怒倍率的官方基础 VP */
  vpBase: number;
  /** 本场 VP 变化（败北为负） */
  vpDelta: number;
  vp: number;
  league: number;
  leagueName: string;
  placement: number;
  glory: number;
  gold: number;
  /** 命中的加分项（结算展示） */
  bonuses: { speed: number; survivors: number; extraTurns: number; total: number };
  /** 每日入侵首胜 */
  firstWinToday: boolean;
  /** 对手是否宿敌（当前榜单前 5） */
  rival: boolean;
}

/** 结算一场入侵战斗：VP/荣耀/黄金入账，官阶榜单即时刷新 */
export function settleInvasionBattle(
  save: MetaSave,
  result: BattleResult,
  mirrorId: string,
  now: number,
  weekStart: number,
  todayStart: number,
): InvasionSettleResult | MetaFailure {
  ensureInvasionSeason(save, now, weekStart);
  const candidates = invasionCandidates(save, now, weekStart);
  const mirror = candidates.find((m) => m.id === mirrorId);
  if (!mirror) return fail('INVALID', '该对手不在今日候选中');
  const standings = invasionStandings(save, now, weekStart);
  const rival = standings.rows.slice(0, 5).some((r) => r.id === mirrorId);

  const victory = result.winner === 'player';
  save.invasion.battles += 1;
  let vpDelta = 0;
  let vpBase = 0;
  let glory = 0;
  let gold = 0;
  let bonuses: ReturnType<typeof invasionVpBonuses> = { speed: 0, survivors: 0, extraTurns: 0, total: 0 };
  let firstWinToday = false;

  if (victory) {
    const avgLevel =
      mirror.defense.reduce((sum, d) => sum + d.level, 0) / Math.max(mirror.defense.length, 1);
    const band = vpBand(avgLevel);
    vpBase = band.base;
    bonuses = invasionVpBonuses(result);
    vpDelta = Math.min(Math.max(band.base + bonuses.total, band.min), band.max);
    if (mirror.frenzy) vpDelta *= 2;
    glory += INVASION.gloryPerWin;
    if (rival) glory += INVASION.gloryRivalBonus;
    if (save.invasion.lastWinDay < todayStart) {
      glory += INVASION.gloryFirstWinOfDay;
      save.invasion.lastWinDay = todayStart;
      firstWinToday = true;
    }
    gold = 40 + Math.floor(mirror.rating / 10);
    save.invasion.vp += vpDelta;
  } else {
    const loss = Math.min(INVASION.vpLoss, save.invasion.vp);
    vpDelta = loss === 0 ? 0 : -loss; // 避免 -0 进结算展示
    save.invasion.vp += vpDelta;
    gold = 20; // 战败保底（与 DEFEAT_CONSOLATION 同手感）
  }
  if (glory > 0 || gold > 0) earn(save, { glory, gold });
  save.stats.goldEarned += gold;

  const after = invasionStandings(save, now, weekStart);
  return {
    ok: true,
    victory,
    vpBase,
    vpDelta,
    vp: save.invasion.vp,
    league: save.invasion.league,
    leagueName: INVASION_LEAGUES[save.invasion.league]!,
    placement: after.placement,
    glory,
    gold,
    bonuses,
    firstWinToday,
    rival,
  };
}
