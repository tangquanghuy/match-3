import { resolveBattleMaps } from './battleMaps';
import { invasionVictoryGold } from './invasionGold';
import { rollPvpGlory } from '../data/pvpGlory';
import { INVASION_MATCHMAKING } from '../data/invasionMatchmaking';
import { INVASION_FRENZY, rollInvasionFrenzy, type FrenzyMultiplier } from '../data/invasionFrenzy';
import { INVASION_RANKS, INVASION_WEEKLY_VP_DECAY, invasionRankAt, INVASION_VP_BY_DIFFICULTY } from '../data/invasionRanks';
import { grantBattleRewards, type BattleRewards } from './battleRewards';
/** Local PvP: weekly VP ranks, weekly gem claims, unlimited free rerolls.
 * Weekly leaderboard VP is separate. See docs/GOW-INVASION-RANKS.md.
 */
import { buildTieredDefense, buildFrenzyDefense, INVASION_DIFFICULTIES, type InvasionDifficulty } from '../data/invasionDifficulty';
import { BANNERS } from '../data/banners';
import { equippedBannerOf } from './banners';
import { SeededRNG } from '../../engine/rng';
import { getTroopById, knownTroopTypes } from '../../data/troops';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../session/contract';
import type { BattleRequest, BattleResult, CombatantSnapshot } from '../../session/contract';
import { validateBattleRequest } from '../../session/validateRequest';
import { fail, type MetaFailure } from '../types';
import type { MetaSave } from '../state/schema';
import {
  INVASION,
} from '../data/economy';
import { fnv1a32 } from '../data/hash';
import { teamStatPower } from './combatPower';
import { WEEK_MS } from '../data/events';
import { buildMetaRegistry, buildPlayerSnapshots, enemyToSnapshot, metaKnownTraitIds } from './battleBridge';
import { earn, earnMaterials } from './wallet';
import type { EncounterEnemy } from './encounter';
import {
  buildInvasionRoster, captureMirrorRecord, mirrorEnemyTeam, pushRecentOpponent, shouldPublish, standingsFresh, teamPower,
  type MirrorPlayerInfo, type MirrorPoolEntry, type MirrorRecord, type StandingEntry, type VpReport,
} from './invasionMirrors';

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
  /** 入侵金币原有的四项属性评分；战力扩展不改动金币曲线。 */
  statRating?: number;
  /** Enemy league snapshot; optional for saves created before the gold rebalance. */
  league?: number;
  /** Random strengthened encounter flag; the weekly leaderboard itself is not rerolled. */
  frenzy: boolean;
  frenzyMultiplier: 1 | FrenzyMultiplier;
  /** 当前推演 VP（随时刻，见 mirrorVpAt） */
  vp: number;
  /** 周末终值 VP（榜单预测 / 周结排名） */
  finalVp: number;
  /** 防守队（固定 4 人） */
  defense: MirrorDefender[];
  archetypeId: string;
  archetypeName: string;
  strategy: string;
  roles: readonly string[];
  difficulty: InvasionDifficulty;
  provenance: string;
  sourceRow: number | null;
  bannerKingdom: string | null;
  /** 真人镜像专有：对方出战时的完整战斗快照（缺省 = 人机） */
  player?: MirrorPlayerInfo;
}

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

/** (weekStart, league) → 29 个镜像（同参数必复现；互不重名） */
export function buildBracket(weekStart: number, league: number): InvasionMirror[] {
  const rng = new SeededRNG(fnv1a32(`invasion-${weekStart >>> 0}:${league}`));
  league = Math.min(9, Math.max(0, Math.floor(league)));
  const templateOffset = fnv1a32(`invasion-templates:${weekStart}:${league}`);
  const [vpMin, vpMax] = LEAGUE_VP_RANGE[Math.min(Math.max(league, 0), LEAGUE_VP_RANGE.length - 1)]!;
  const usedNames = new Set<string>();
  const mirrors: InvasionMirror[] = [];
  for (let i = 0; i < INVASION.bracketSize; i++) {
    const strength = rng.next();
    const difficulty = INVASION_DIFFICULTIES[i % 3]!;
    const template = buildTieredDefense(
      difficulty === 'easy' ? fnv1a32(`adaptive-${weekStart}:${league}:${i}`) : templateOffset,
      league, difficulty, Math.floor(i / 3),
    );
    const level = template.level;
    const defense: MirrorDefender[] = template.troops.map((troopId, slot) => ({ troopId, level, tier: slot === 0 ? 'elite' : 'minion' }));
    let name = `${NAME_PREFIX[rng.nextInt(NAME_PREFIX.length)]}${NAME_CORE[rng.nextInt(NAME_CORE.length)]}${NAME_TITLE[rng.nextInt(NAME_TITLE.length)]}`;
    let suffix = 2;
    while (usedNames.has(name)) name = `${name}${suffix++}`;
    usedNames.add(name);
    const snapshots = defense.map((d, index) => enemyToSnapshot(getTroopById(d.troopId)!, d, index));
    const rating = teamPower(snapshots);
    const statRating = teamStatPower(snapshots);
    const finalVp = Math.round((vpMin + (vpMax - vpMin) * strength) * (0.85 + rng.next() * 0.3));
    mirrors.push({
      id: `bot-${i + 1}`,
      name,
      rating, statRating, league,
      frenzy: false, frenzyMultiplier: 1,
      vp: 0,
      finalVp,
      difficulty, provenance: template.provenance, sourceRow: template.sourceRow, bannerKingdom: template.bannerKingdom,
      defense, archetypeId: template.id, archetypeName: template.name, strategy: template.strategy, roles: template.roles,
    });
  }
  return mirrors;
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
  /** true = 真人指挥官（服务端周榜）；否则为补位人机 */
  real?: boolean;
}

/**
 * 某周某联赛的对手行（不含玩家本人）：服务端周榜里有真人就先用真人，
 * 不足 bracketSize 的名额由确定性人机补齐（取 buildBracket 前 N 个）。
 * final = 用人机的周末终值（周结名次）；否则按时刻推演。
 */
export function opponentStandingRows(save: MetaSave, weekStart: number, league: number, now: number, final = false): StandingRow[] {
  const cache = save.invasion.standings;
  const real = cache && cache.weekStart === weekStart && cache.league === league
    ? cache.rows.slice(0, INVASION.bracketSize) : [];
  const bots = buildBracket(weekStart, league).slice(0, INVASION.bracketSize - real.length);
  return [
    ...real.map(r => ({ id: `pl-${r.ownerKey}`, name: r.name, vp: r.vp, frenzy: false, isPlayer: false, real: true })),
    ...bots.map(m => ({ id: m.id, name: m.name, vp: final ? m.finalVp : mirrorVpAt(m, now, weekStart), frenzy: false, isPlayer: false })),
  ];
}

export function invasionStandings(save: MetaSave, now: number, weekStart: number): { rows: StandingRow[]; placement: number } {
  const rows: StandingRow[] = [
    { id: 'player', name: '你', vp: save.invasion.vp, frenzy: false, isPlayer: true },
    ...opponentStandingRows(save, weekStart, save.invasion.league, now),
  ].sort((a, b) => b.vp - a.vp);
  const placement = rows.findIndex((r) => r.isPlayer) + 1;
  return { rows, placement };
}

/** 周榜真人快照是否可用（同周、同联赛、未过期） */
export function invasionStandingsFresh(save: MetaSave, weekStart: number, now: number): boolean {
  return standingsFresh(save.invasion.standings, weekStart, save.invasion.league, now);
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

/** Weekly rank VP decay and fresh claims; older week requests never rewind the ledger. */
export function ensureInvasionSeason(save: MetaSave, _now: number, weekStart: number): SeasonRollSummary | null {
  if (save.invasion.weekStart >= weekStart) return null;

  const fromLeague = save.invasion.league;
  const first = save.invasion.weekStart === 0;
  const played = !first && save.invasion.battles > 0;
  const placement = first ? 0 : 1 + opponentStandingRows(save, save.invasion.weekStart, fromLeague, _now, true)
    .filter(r => r.vp > save.invasion.vp).length;
  // Rank VP loses 2500 per elapsed week. The separate weekly leaderboard VP resets below.
  // A fresh claim ledger makes every rank at/below the carried VP claimable again.
  if (!first) {
    const elapsedWeeks = Math.max(1, Math.floor((weekStart - save.invasion.weekStart) / WEEK_MS));
    save.invasion.progressionVp = Math.max(0, save.invasion.progressionVp - INVASION_WEEKLY_VP_DECAY * elapsedWeeks);
    save.invasion.claimedRanks = [];
  }
  save.invasion.league = invasionRankAt(save.invasion.progressionVp).league;
  save.invasion.bestLeague = Math.max(save.invasion.bestLeague, save.invasion.league);
  if (!first) save.invasion.seasonsPlayed += 1;
  save.invasion.weekStart = weekStart;
  save.invasion.seed = fnv1a32(`invasion-${weekStart}:${save.invasion.league}`);
  save.invasion.vp = 0;
  save.invasion.battles = 0;
  save.invasion.roster = null;
  save.invasion.standings = null;
  return first ? null : { played, fromLeague, toLeague: save.invasion.league,
    placement, movement: 'stay', glory: 0, gems: 0 };

}

// ---------------------------------------------------------------------------
// 匹配与出战斗
// ---------------------------------------------------------------------------

/**
 * 当前三档对手。服务端组好的批次（可能含真人镜像）落在 save.invasion.roster，
 * 键（周/联赛/刷新序号）对得上就用它；否则回落纯人机推演（与旧版逐字节一致）。
 */
export function invasionCandidates(save: MetaSave, now: number, weekStart: number): InvasionMirror[] {
  const roster = save.invasion.roster;
  if (roster && invasionRosterFresh(save, weekStart, now)) {
    return roster.mirrors.map(m => {
      const snapshots = m.player?.team ?? m.defense.flatMap((d, index) => {
        const troop = getTroopById(d.troopId);
        return troop ? [enemyToSnapshot(troop, d, index)] : [];
      });
      return { ...m, rating: teamPower(snapshots), statRating: teamStatPower(snapshots),
        vp: m.player ? m.vp : mirrorVpAt(m, now, weekStart) };
    });
  }
  return botInvasionCandidates(save, now, weekStart);
}

export function invasionRosterFresh(save: MetaSave, weekStart: number, now: number): boolean {
  const roster = save.invasion.roster;
  return !!roster && roster.weekStart === weekStart && roster.league === save.invasion.league
    && roster.refresh === save.invasion.refreshCount
    && Number.isSafeInteger(roster.builtAt) && now >= roster.builtAt
    && now - roster.builtAt < INVASION_MATCHMAKING.republishMs
    && roster.playerPower === invasionPlayerPower(save);
}

/** 我方当前出战队的强度（与镜像 rating 同口径）；队伍不可用时为 0 */
export function invasionPlayerPower(save: MetaSave): number {
  const built = buildPlayerSnapshots(save);
  return built.ok ? teamPower(built.playerTeam) : 0;
}

/**
 * 组一批对手并落档（服务端在同步/刷新/结算时调用；pool = 宿主预取的共享池样本）。
 * replaceSlots：只重选这些槽位（打完一名真人后只换掉他，其余不动）。
 */
export function rebuildInvasionRoster(
  save: MetaSave,
  now: number,
  weekStart: number,
  pool: readonly MirrorPoolEntry[],
  seed: number,
  replaceSlots?: readonly number[],
): void {
  const fresh = invasionRosterFresh(save, weekStart, now);
  const mirrors = buildInvasionRoster({
    bots: botInvasionCandidates(save, now, weekStart),
    league: save.invasion.league,
    playerPower: invasionPlayerPower(save),
    pool,
    recent: save.invasion.recentOpponents,
    now,
    seed,
    ...(fresh && replaceSlots ? { existing: save.invasion.roster!.mirrors, replaceSlots } : {}),
  });
  save.invasion.roster = { weekStart, league: save.invasion.league, refresh: save.invasion.refreshCount, builtAt: now,
    playerPower: invasionPlayerPower(save), mirrors };
}

/** 周榜真人快照落档（rows = 宿主预取的同周同联赛真人，已排除本人；没有共享池时为空 → 全人机补位） */
export function refreshInvasionStandings(save: MetaSave, now: number, weekStart: number, rows: readonly StandingEntry[]): void {
  const seen = new Set<string>();
  const real = [...rows]
    .filter(r => r.ownerKey && !seen.has(r.ownerKey) && seen.add(r.ownerKey))
    .sort((a, b) => b.vp - a.vp || a.ownerKey.localeCompare(b.ownerKey))
    .slice(0, INVASION.bracketSize)
    .map(r => ({ ownerKey: r.ownerKey, name: r.name, vp: Math.max(0, Math.floor(r.vp)) }));
  save.invasion.standings = { weekStart, league: save.invasion.league, fetchedAt: now, rows: real };
}

/** 结算后上报的本周 VP（服务端权威值） */
export function invasionVpReport(save: MetaSave, now: number): VpReport {
  return { weekStart: save.invasion.weekStart, league: save.invasion.league, vp: save.invasion.vp, at: now };
}

/** Match simulated opponents on actual team strength; league still controls the draft and level floor. */
function balanceBotToPlayer(mirror: InvasionMirror, playerPower: number, league: number): InvasionMirror {
  if (playerPower <= 0) return mirror;
  const [lo, hi] = INVASION_MATCHMAKING.powerBands[mirror.difficulty];
  const frenzyScale = !mirror.frenzy ? 1 : mirror.frenzyMultiplier === 2 ? INVASION_FRENZY.stats[2] : INVASION_FRENZY.stats[1.5];
  const target = playerPower * (lo + hi) / 2 * frenzyScale;
  const evaluate = (level: number) => {
    const defense = mirror.defense.map(d => ({ ...d, level }));
    const snapshots = defense.map((d, i) => enemyToSnapshot(getTroopById(d.troopId)!, d, i));
    return { defense, rating: teamPower(snapshots), statRating: teamStatPower(snapshots) };
  };
  // The rank limits how far a high-league opponent can be weakened; Lv.100 is
  // the training ceiling. Levels are a result of matching strength, not a proxy for hero level.
  const minLevel = 1 + Math.min(9, Math.max(0, Math.floor(league)));
  let low = minLevel;
  let high = 100;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (evaluate(middle).rating < target) low = middle + 1;
    else high = middle;
  }
  const upper = evaluate(low);
  const lower = evaluate(Math.max(minLevel, low - 1));
  const chosen = Math.abs(lower.rating - target) <= Math.abs(upper.rating - target) ? lower : upper;
  return { ...mirror, ...chosen };
}

/** 纯人机三档（确定性推演；真人池为空或本地模式时就是最终批次） */
export function botInvasionCandidates(save: MetaSave, now: number, weekStart: number): InvasionMirror[] {
  const refresh = save.invasion.refreshCount;
  const draftSeed = refresh === 0 ? weekStart : fnv1a32(`reroll:${weekStart}:${refresh}`);
  const mirrors = hydrateMirrorVp(buildBracket(draftSeed, save.invasion.league), now, weekStart);
  const playerPower = invasionPlayerPower(save);
  const frenzy = rollInvasionFrenzy(weekStart, save.invasion.league, refresh);
  return INVASION_DIFFICULTIES.map((difficulty, slot) => {
    const band = mirrors.filter(m => m.difficulty === difficulty);
    let mirror = band[refresh % band.length]!;
    if (frenzy?.slot === slot) {
      const template = buildFrenzyDefense(draftSeed, save.invasion.league, difficulty, frenzy.multiplier);
      const defense: MirrorDefender[] = template.troops.map((troopId, index) => ({
        troopId, level: template.level, tier: index === 0 ? 'elite' : 'minion', statMultiplier: INVASION_FRENZY.stats[frenzy.multiplier],
      }));
      const snapshots = defense.map((d, index) => enemyToSnapshot(getTroopById(d.troopId)!, d, index));
      const rating = teamPower(snapshots);
      const statRating = teamStatPower(snapshots);
      mirror = { ...mirror, defense, rating, statRating, frenzy: true, frenzyMultiplier: frenzy.multiplier,
        archetypeId: template.id, archetypeName: template.name, strategy: template.strategy, roles: template.roles,
        sourceRow: null, provenance: template.provenance, bannerKingdom: template.bannerKingdom };
    }
    mirror = balanceBotToPlayer(mirror, playerPower, save.invasion.league);
    // Bind identity to the week, league and refresh batch so stale encounters stay invalid.
    return { ...mirror, id: `${mirror.id}-w${weekStart}-l${save.invasion.league}-r${refresh}` };
  });
}

/** Shared by preview and settlement; no performance bonus or difficulty double-counting. */
export function invasionVictoryVp(mirror: Pick<InvasionMirror, 'difficulty' | 'frenzyMultiplier'>): number {
  return INVASION_VP_BY_DIFFICULTY[mirror.difficulty] * mirror.frenzyMultiplier;
}

export function refreshInvasionOpponents(save: MetaSave, now: number, weekStart: number): { ok: true } | MetaFailure {
  if (save.hero.level < INVASION.unlockHeroLevel) return fail('PREREQ_LOCKED', `主角达到 ${INVASION.unlockHeroLevel} 级后开放入侵`);
  ensureInvasionSeason(save, now, weekStart);
  save.invasion.refreshCount = (save.invasion.refreshCount + 1) % Number.MAX_SAFE_INTEGER;
  return { ok: true };
}

export function claimInvasionRank(save: MetaSave, id: string): { ok: true; gems: number } | MetaFailure {
  if (save.hero.level < INVASION.unlockHeroLevel) return fail('PREREQ_LOCKED', `主角达到 ${INVASION.unlockHeroLevel} 级后开放入侵`);
  const rank = INVASION_RANKS.find(r => r.id === id);
  if (!rank || save.invasion.progressionVp < rank.vp) return fail('PREREQ_LOCKED', '尚未达到该官阶');
  if (save.invasion.claimedRanks.includes(id)) return fail('INVALID', '该官阶奖励已领取');
  save.invasion.claimedRanks.push(id);
  earn(save, { gems: rank.gems });
  return { ok: true, gems: rank.gems };
}

export interface InvasionBridgeOutcome {
  ok: true;
  request: BattleRequest;
  /** 对手镜像（结算回传用） */
  mirror: InvasionMirror;
  /** 本场可用注册表（headless 驱动/战斗层共用） */
  registry: ReturnType<typeof buildMetaRegistry>;
  /** 本次出击队的镜像录制（结算后入池） */
  attacker: MirrorRecord;
}

/** 对一只镜像的出战斗计划：我方=当前预设队（主角/旗帜/王国加成全生效），敌方=镜像防守队 */
export function planInvasionBattle(
  save: MetaSave,
  mirrorId: string,
  battleSeed: number,
  now: number,
  weekStart: number,
  revengeMirror?: InvasionMirror,
): InvasionBridgeOutcome | MetaFailure {
  ensureInvasionSeason(save, now, weekStart);
  if (save.hero.level < INVASION.unlockHeroLevel) {
    return fail('PREREQ_LOCKED', `入侵需要主角 ${INVASION.unlockHeroLevel} 级（当前 ${save.hero.level}）`);
  }
  const mirror = revengeMirror ?? invasionCandidates(save, now, weekStart).find((m) => m.id === mirrorId);
  if (!mirror) return fail('INVALID', '对手已刷新，请重新选择');

  const built = buildPlayerSnapshots(save);
  if (!built.ok) return built;

  // 真人镜像：原样使用对方出战时的快照；人机：按防守条目推导
  const enemyTeam: CombatantSnapshot[] = mirror.player
    ? mirrorEnemyTeam(mirror)
    : mirror.defense.map((d, index) => {
      const troop = getTroopById(d.troopId)!;
      return enemyToSnapshot(troop, d, index);
    });
  if (enemyTeam.length === 0) return fail('INVALID', '对手数据已失效，请刷新对手');
  const request: BattleRequest = {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: `invasion-${weekStart >>> 0}`,
    requestId: `invasion-${weekStart}-${save.invasion.league}-${mirror.id}-${save.invasion.battles}`,
    rulesetVersion: RULESET_VERSION,
    seed: battleSeed >>> 0,
    playerTeam: built.playerTeam,
    enemyTeam,
    mode: 'pvp',
  };
  const playerBanner = equippedBannerOf(save, built.team);
  if (playerBanner) request.playerBanner = { boosts: { ...playerBanner.boosts } };
  const enemyBanner = mirror.bannerKingdom ? BANNERS[mirror.bannerKingdom] : null;
  if (enemyBanner) request.enemyBanner = { boosts: { ...enemyBanner.boosts } };
  const registry = buildMetaRegistry(
    [...built.playerTeam, ...enemyTeam].map((s) => s.skillId as string),
  );
  const check = validateBattleRequest(request, {
    knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]),
    knownTraitIds: metaKnownTraitIds(),
    knownTroopTypes: knownTroopTypes(),
  });
  if (!check.ok) {
    const first = check.issues[0];
    return fail('INVALID', `入侵战斗请求未过会话校验：${first ? `${first.code} ${first.message}` : ''}`);
  }
  const attacker = captureMirrorRecord(save, built.team, built.playerTeam, playerBanner ? built.team.bannerKingdomId ?? null : null, now);
  return { ok: true, request, mirror, registry, attacker };
}

/**
 * 结算后的镜像记账（核心在 settleInvasionBattle 之后调用）：
 *  - 打的是真人 → 记入最近对手，并把这一槽换人（不能对着同一个人反复刷分）；
 *  - 联赛变了 → 整批重组；
 *  - 正常打完（非投降）→ 返回本次出击队的录制，交宿主入池（节流见 shouldPublish）。
 */
export function afterInvasionSettle(
  save: MetaSave,
  pending: { mirror: InvasionMirror; attacker?: MirrorRecord },
  result: BattleResult,
  now: number,
  weekStart: number,
  pool: readonly MirrorPoolEntry[] | undefined,
  seed: number,
): MirrorRecord | null {
  const owner = pending.mirror.player?.ownerKey;
  if (owner) save.invasion.recentOpponents = pushRecentOpponent(save.invasion.recentOpponents, owner);
  if (pool) {
    if (!invasionRosterFresh(save, weekStart, now)) rebuildInvasionRoster(save, now, weekStart, pool, seed);
    else if (owner) {
      const slot = save.invasion.roster!.mirrors.findIndex(m => m.id === pending.mirror.id);
      if (slot >= 0) rebuildInvasionRoster(save, now, weekStart, pool, seed, [slot]);
    }
  }
  const record = pending.attacker;
  if (!record || result.endReason === 'surrender') return null;
  if (!shouldPublish(save.invasion.lastPublish, record, now)) return null;
  save.invasion.lastPublish = { league: record.league, teamHash: record.teamHash, at: now };
  // VP 取结算后的值（榜单展示更贴近现状）；联赛仍按出击时的分桶
  return { ...record, vp: save.invasion.vp, recordedAt: now };
}

// ---------------------------------------------------------------------------
// 结算（项目周进度：固定三档 VP）
// ---------------------------------------------------------------------------

/** Legacy performance breakdown, retained for compatibility; weekly VP no longer uses it. */
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
  battleRewards: BattleRewards;
  collected: { gold: number; souls: number; gems: number; maps: number };
  ok: true;
  victory: boolean;
  /** 当前难度的固定胜利 VP */
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
  /** 对手是否宿敌（刷新批次中的高 VP 对手） */
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
  launchedMirror?: InvasionMirror,
): InvasionSettleResult | MetaFailure {
  ensureInvasionSeason(save, now, weekStart);
  const candidates = invasionCandidates(save, now, weekStart);
  const mirror = launchedMirror?.id === mirrorId ? launchedMirror : candidates.find((m) => m.id === mirrorId);
  if (!mirror) return fail('INVALID', '对手已刷新，请重新选择');
  const standings = invasionStandings(save, now, weekStart);
  const rival = mirror.vp >= (standings.rows.filter(r => !r.isPlayer)[4]?.vp ?? Infinity);

  const battleRewards = grantBattleRewards(save, result);
  const amount = (n: number | undefined) => n !== undefined && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const collected = result.endReason === 'surrender' ? { gold: 0, souls: 0, gems: 0, maps: 0 }
    : { gold: amount(result.economy?.gold), souls: amount(result.economy?.souls), gems: amount(result.economy?.gems), maps: resolveBattleMaps(result).total };
  earn(save, { gold: collected.gold, souls: collected.souls, gems: collected.gems });
  earnMaterials(save, { treasureMaps: collected.maps });
  save.stats.goldEarned += collected.gold;
  save.stats.soulsEarned += collected.souls;
  const victory = result.winner === 'player';
  save.invasion.battles += 1;
  save.gifts.invasionBattles += 1; // 馈赠：累计入侵场数（不随赛季清零）
  let vpDelta = 0;
  let vpBase = 0;
  let glory = 0;
  let gold = 0;
  const bonuses: ReturnType<typeof invasionVpBonuses> = { speed: 0, survivors: 0, extraTurns: 0, total: 0 };
  let firstWinToday = false;

  if (victory) {
    vpBase = INVASION_VP_BY_DIFFICULTY[mirror.difficulty];
    vpDelta = invasionVictoryVp(mirror);
    glory += rollPvpGlory(INVASION_DIFFICULTIES.indexOf(mirror.difficulty), `${mirror.id}:${save.invasion.battles}`);
    if (rival) glory += INVASION.gloryRivalBonus;
    if (save.invasion.lastWinDay < todayStart) {
      glory += INVASION.gloryFirstWinOfDay;
      save.invasion.lastWinDay = todayStart;
      firstWinToday = true;
    }
    // The preview already includes the common victory gold paid above.
    gold = Math.max(0, invasionVictoryGold(mirror) - battleRewards.gold);
    save.invasion.vp += vpDelta;
  } else {
    const loss = Math.min(INVASION.vpLoss, save.invasion.vp);
    vpDelta = loss === 0 ? 0 : -loss; // 避免 -0 进结算展示
    save.invasion.vp += vpDelta;
    gold = 0; // Common battleRewards already paid defeat consolation.
  }
  if (glory > 0 || gold > 0) earn(save, { glory, gold });
  save.stats.goldEarned += gold;

  save.invasion.progressionVp = Math.min(Number.MAX_SAFE_INTEGER, save.invasion.progressionVp + Math.max(0, vpDelta));
  const rank = invasionRankAt(save.invasion.progressionVp);
  save.invasion.league = rank.league;
  save.invasion.bestLeague = Math.max(save.invasion.bestLeague, rank.league);
  const after = invasionStandings(save, now, weekStart);
  return {
    ok: true,
    victory,
    battleRewards,
    collected,
    vpBase,
    vpDelta,
    vp: save.invasion.vp,
    league: save.invasion.league,
    leagueName: rank.name,
    placement: after.placement,
    glory,
    gold,
    bonuses,
    firstWinToday,
    rival,
  };
}
