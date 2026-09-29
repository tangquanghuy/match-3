import { INVASION_FRENZY, rollInvasionFrenzy, type FrenzyMultiplier } from '../data/invasionFrenzy';
import { INVASION_RANKS, invasionRankAt, INVASION_VP_BY_DIFFICULTY } from '../data/invasionRanks';
import { grantBattleRewards, type BattleRewards } from './battleRewards';
/** Local PvP: weekly VP ranks, weekly gem claims, unlimited free rerolls.
 * Weekly leaderboard VP is separate. See docs/GOW-INVASION-RANKS.md.
 */
import { buildTieredDefense, buildFrenzyDefense, INVASION_DIFFICULTIES, type InvasionDifficulty } from '../data/invasionDifficulty';
import { BANNERS } from '../data/banners';
import { equippedBannerOf } from './banners';
import { enemyEncounterStats } from '../data/enemyDifficulty';
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
import { WEEK_MS } from '../data/events';
import { buildMetaRegistry, buildPlayerSnapshots, enemyToSnapshot, metaKnownTraitIds } from './battleBridge';
import { earn, earnMaterials } from './wallet';
import type { EncounterEnemy } from './encounter';

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
    const rating = defense.reduce((sum, d) => {
      const troop = getTroopById(d.troopId);
      if (!troop) return sum;
      const stats = enemyEncounterStats(troop, d.level);
      return sum + stats.health + stats.armor + stats.attack * 2 + stats.magic * 3;
    }, 0);
    const finalVp = Math.round((vpMin + (vpMax - vpMin) * strength) * (0.85 + rng.next() * 0.3));
    mirrors.push({
      id: `bot-${i + 1}`,
      name,
      rating,
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
}

export function invasionStandings(save: MetaSave, now: number, weekStart: number): { rows: StandingRow[]; placement: number } {
  const mirrors = hydrateMirrorVp(buildBracket(weekStart, save.invasion.league), now, weekStart);
  const rows: StandingRow[] = [
    { id: 'player', name: '你', vp: save.invasion.vp, frenzy: false, isPlayer: true },
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

/** Lazy weekly reset of rank VP and claims; older week requests never rewind the ledger. */
export function ensureInvasionSeason(save: MetaSave, _now: number, weekStart: number): SeasonRollSummary | null {
  if (save.invasion.weekStart >= weekStart) return null;

  const fromLeague = save.invasion.league;
  const first = save.invasion.weekStart === 0;
  const played = !first && save.invasion.battles > 0;
  const placement = first ? 0 : 1 + buildBracket(save.invasion.weekStart, fromLeague)
    .filter(m => m.finalVp > save.invasion.vp).length;
  // Each new week starts a fresh VP track and claim ledger, without automatic payouts.
  if (!first) { save.invasion.progressionVp = 0; save.invasion.claimedRanks = []; }
  save.invasion.league = invasionRankAt(save.invasion.progressionVp).league;
  save.invasion.bestLeague = Math.max(save.invasion.bestLeague, save.invasion.league);
  if (!first) save.invasion.seasonsPlayed += 1;
  save.invasion.weekStart = weekStart;
  save.invasion.seed = fnv1a32(`invasion-${weekStart}:${save.invasion.league}`);
  save.invasion.vp = 0;
  save.invasion.battles = 0;
  return first ? null : { played, fromLeague, toLeague: save.invasion.league,
    placement, movement: 'stay', glory: 0, gems: 0 };

}

// ---------------------------------------------------------------------------
// 匹配与出战斗
// ---------------------------------------------------------------------------

/** Refresh changes the roster, not the weekly leaderboard. Read-only calls stay stable. */
export function invasionCandidates(save: MetaSave, now: number, weekStart: number): InvasionMirror[] {
  const refresh = save.invasion.refreshCount;
  const draftSeed = refresh === 0 ? weekStart : fnv1a32(`reroll:${weekStart}:${refresh}`);
  const mirrors = hydrateMirrorVp(buildBracket(draftSeed, save.invasion.league), now, weekStart);
  const frenzy = rollInvasionFrenzy(weekStart, save.invasion.league, refresh);
  return INVASION_DIFFICULTIES.map((difficulty, slot) => {
    const band = mirrors.filter(m => m.difficulty === difficulty);
    let mirror = band[refresh % band.length]!;
    if (frenzy?.slot === slot) {
      const template = buildFrenzyDefense(draftSeed, save.invasion.league, difficulty, frenzy.multiplier);
      const defense: MirrorDefender[] = template.troops.map((troopId, index) => ({
        troopId, level: template.level, tier: index === 0 ? 'elite' : 'minion', statMultiplier: INVASION_FRENZY.stats[frenzy.multiplier],
      }));
      const rating = defense.reduce((sum, d) => {
        const stats = enemyEncounterStats(getTroopById(d.troopId)!, d.level, d.statMultiplier);
        return sum + stats.health + stats.armor + stats.attack * 2 + stats.magic * 3;
      }, 0);
      mirror = { ...mirror, defense, rating, frenzy: true, frenzyMultiplier: frenzy.multiplier,
        archetypeId: template.id, archetypeName: template.name, strategy: template.strategy, roles: template.roles,
        sourceRow: null, provenance: template.provenance, bannerKingdom: template.bannerKingdom };
    }
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
  if (!mirror) return fail('INVALID', '对手已刷新，请重新选择');

  const built = buildPlayerSnapshots(save);
  if (!built.ok) return built;

  const enemyTeam: CombatantSnapshot[] = mirror.defense.map((d, index) => {
    const troop = getTroopById(d.troopId)!;
    return enemyToSnapshot(troop, d, index);
  });
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
  return { ok: true, request, mirror, registry };
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
    : { gold: amount(result.economy?.gold), souls: amount(result.economy?.souls), gems: amount(result.economy?.gems), maps: amount(result.economy?.maps) };
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
  let bonuses: ReturnType<typeof invasionVpBonuses> = { speed: 0, survivors: 0, extraTurns: 0, total: 0 };
  let firstWinToday = false;

  if (victory) {
    vpBase = INVASION_VP_BY_DIFFICULTY[mirror.difficulty];
    vpDelta = invasionVictoryVp(mirror);
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
