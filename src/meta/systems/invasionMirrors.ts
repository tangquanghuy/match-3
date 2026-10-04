/**
 * 入侵真人镜像（纯逻辑；I/O 在 server/mirrorPool.ts 与 worker D1 实现）。
 *
 * 录制策略（参考背包乱斗 / SAP 的异步镜像）：
 *  1. 录什么：玩家**实际出击用的那支队**（出战票签发时由服务端从权威存档构建的战斗快照，
 *     含主角武器/天赋/王国加成/旗帜），客户端无法伪造；投降/丢票不录。
 *  2. 录到哪：按录制时所在联赛入池，(玩家, 联赛) 唯一、覆盖写。一路爬分的玩家会在
 *     每个经过的联赛各留一份「当时的队伍」，低段位因此天然有真人样本，且强度与该段位相称。
 *  3. 录多勤：阵容变了立即重录；阵容不变同联赛 30 分钟内不重复写（只为刷新活跃度与 VP）。
 *  4. 留多久：14 天（两个赛季）；取样按新近度加权，过期的由服务端清理。
 *
 * 匹配策略：
 *  - 三档槽位按联赛查表决定「这一槽试不试真人」（低段位人机为主，高段位中/高档全真人）；
 *  - 真人按「对手强度 / 我方强度」分档，优先同联赛、次选相邻联赛，越新越优先，前 N 名随机挑；
 *  - 窗口内不同玩家太少（池浅）→ 全部人机；排除自己、最近交手过的人、同一批里的重复；
 *  - 血怒槽按 frenzyRealShare 的独立概率换成真人：按该槽档位挑人，再整队套血怒属性加成与 VP 倍率。
 */
import { isImmortal, IMMORTAL_TEAM_LIMIT } from '../../data/immortals';
import { INVASION_MATCHMAKING as MM } from '../data/invasionMatchmaking';
import { INVASION_DIFFICULTIES, type InvasionDifficulty } from '../data/invasionDifficulty';
import { CATALOG_WEAPONS } from '../data/weaponCatalog';
import { INVASION_FRENZY, type FrenzyMultiplier } from '../data/invasionFrenzy';
import { STAT_LIMITS } from '../../session/validateRequest';
import { fnv1a32 } from '../data/hash';
import { SeededRNG } from '../../engine/rng';
import { getTroopById } from '../../data/troops';
import { RULESET_VERSION, type CombatantSnapshot } from '../../session/contract';
import type { MetaSave, TeamPreset } from '../state/schema';
import type { InvasionMirror, MirrorDefender } from './invasion';
import { teamPower, teamStatPower } from './combatPower';
export { teamPower } from './combatPower';

// ---------------------------------------------------------------------------
// 形状
// ---------------------------------------------------------------------------

/** 一份待入池的录制（权威核心产出，宿主负责写入共享池） */
export interface MirrorRecord {
  explicitDefense?: boolean;
  /** 录制时所在联赛（入池分桶键） */
  league: number;
  weekStart: number;
  /** 录制时的本周 VP（展示用） */
  vp: number;
  /** 队伍强度（与人机 rating 同口径） */
  power: number;
  heroLevel: number;
  bannerKingdom: string | null;
  /** 我方视角的战斗快照（出战时原样） */
  team: CombatantSnapshot[];
  /** 卡面展示用的部队列表（主角不在内） */
  defense: MirrorDefender[];
  /** 阵容指纹（节流：阵容不变不重录） */
  teamHash: string;
  recordedAt: number;
  ruleset: string;
}

/** 池里取回的一条（ownerKey 是不可逆的玩家句柄，不暴露真实 player_id） */
export interface MirrorPoolEntry extends MirrorRecord {
  ownerKey: string;
  name: string;
}

/** 宿主向共享池取样的条件 */
export interface MirrorPoolQuery {
  leagueMin: number;
  leagueMax: number;
  powerMin: number;
  powerMax: number;
  /** 只要 recordedAt >= since 的 */
  since: number;
  ruleset: string;
  limit: number;
}

/** 存档里的当前对手批次（真人对手必须落档，客户端才能读到同一批） */
export interface InvasionRoster {
  weekStart: number;
  league: number;
  refresh: number;
  builtAt: number;
  playerPower: number;
  mirrors: InvasionMirror[];
}

/** 周榜上的一名真人（服务端权威 VP；ownerKey 同镜像池句柄） */
export interface StandingEntry {
  ownerKey: string;
  name: string;
  vp: number;
}

/** 宿主向周榜取样的条件（同周同联赛，VP 降序） */
export interface StandingsQuery {
  weekStart: number;
  league: number;
  limit: number;
}

/** 玩家本周 VP 上报（每场入侵结算后） */
export interface VpReport {
  weekStart: number;
  league: number;
  vp: number;
  at: number;
}

export interface InvasionStandingsCache {
  weekStart: number;
  league: number;
  fetchedAt: number;
  rows: StandingEntry[];
}

/** 周榜快照是否可用（同周、同联赛、未过期） */
export function standingsFresh(cache: InvasionStandingsCache | null, weekStart: number, league: number, now: number): boolean {
  return !!cache && cache.weekStart === weekStart && cache.league === league && now - cache.fetchedAt < MM.standingsTtlMs
    && now >= cache.fetchedAt;
}

/** InvasionMirror 上的真人附加信息 */
export interface MirrorPlayerInfo {
  ownerKey: string;
  team: CombatantSnapshot[];
  heroLevel: number;
  league: number;
  recordedAt: number;
}

// ---------------------------------------------------------------------------
// 录制
// ---------------------------------------------------------------------------

export function teamHash(team: readonly CombatantSnapshot[]): string {
  const shape = team.map(c => [c.templateId ?? 'hero', c.skillId ?? '', c.stats.hp, c.stats.attack, c.stats.armor, c.stats.magic,
    [...(c.traitIds ?? [])].sort().join(','), c.rarityIdx ?? 0, c.temperingLevel ?? 0]);
  return fnv1a32(JSON.stringify(shape)).toString(16);
}

/** 出战票签发时调用：把「这次出击的队」固化成一份录制 */
export function captureMirrorRecord(
  save: MetaSave,
  team: TeamPreset,
  playerTeam: readonly CombatantSnapshot[],
  bannerKingdom: string | null,
  now: number,
): MirrorRecord {
  const snapshots = structuredClone([...playerTeam]);
  const defense: MirrorDefender[] = [];
  for (const member of team.members) {
    if (member.kind !== 'troop') continue;
    const rec = save.collection[String(member.troopId)];
    if (!rec) continue;
    defense.push({
      troopId: member.troopId,
      level: rec.level,
      tier: defense.length === 0 ? 'elite' : 'minion',
      traitCount: rec.traits.filter(Boolean).length,
    });
  }
  return {
    league: save.invasion.league,
    weekStart: save.invasion.weekStart,
    vp: save.invasion.vp,
    power: teamPower(snapshots),
    heroLevel: save.hero.level,
    bannerKingdom,
    team: snapshots,
    defense,
    teamHash: teamHash(snapshots),
    recordedAt: now,
    ruleset: RULESET_VERSION,
  };
}

/** 节流：同联赛同阵容 republishMs 内不重录 */
export function shouldPublish(
  last: MetaSave['invasion']['lastPublish'],
  record: Pick<MirrorRecord, 'league' | 'teamHash'>,
  now: number,
): boolean {
  if (!last) return true;
  return last.league !== record.league || last.teamHash !== record.teamHash || now - last.at >= MM.republishMs;
}

// ---------------------------------------------------------------------------
// 取样条件
// ---------------------------------------------------------------------------

/** Request a wider rank window only when nearby ranks lack distinct, power-compatible players. */
export function invasionPoolNeedsExpansion(
  pool: readonly MirrorPoolEntry[], league: number, playerPower: number, now: number, recent: readonly string[],
): boolean {
  if (playerPower <= 0) return false;
  const eligible = new Map<string, MirrorPoolEntry>();
  for (const entry of pool) {
    if (recent.includes(entry.ownerKey) || !usableEntry(entry, now)) continue;
    const previous = eligible.get(entry.ownerKey);
    if (!previous || Math.abs(entry.league - league) < Math.abs(previous.league - league)
      || (Math.abs(entry.league - league) === Math.abs(previous.league - league) && entry.recordedAt > previous.recordedAt)) {
      eligible.set(entry.ownerKey, entry);
    }
  }
  if (eligible.size < 3) return true;
  return INVASION_DIFFICULTIES.some(difficulty => {
    const [lo, hi] = MM.powerBands[difficulty];
    return ![...eligible.values()].some(entry => {
      const ratio = teamPower(entry.team) / playerPower;
      const scaled = ratio * lowerLeagueMultiplier(league, entry.league, ratio, lo);
      return scaled >= lo && scaled <= hi;
    });
  });
}

/** 宿主据此向共享池取样；`leagueSlack` 给结算用（结算后可能升一个联赛） */
export function invasionPoolQuery(league: number, playerPower: number, now: number, leagueSlack = 0): MirrorPoolQuery {
  return {
    leagueMin: Math.max(0, league + MM.queryLeagues[0]),
    leagueMax: Math.min(9, league + MM.queryLeagues[1] + leagueSlack),
    powerMin: Math.floor(playerPower * MM.queryPower[0]),
    powerMax: Math.ceil(playerPower * MM.queryPower[1]),
    since: now - MM.maxAgeMs,
    ruleset: RULESET_VERSION,
    limit: MM.queryLimit,
  };
}

// ---------------------------------------------------------------------------
// 匹配
// ---------------------------------------------------------------------------

const WEAPON_IDS = new Set(CATALOG_WEAPONS.filter(w => w.skill).map(w => w.id));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 池条目能否上场：规则版本、时效、4 人、部队/武器仍在目录、数值合法 */
export function compatibleMirrorRuleset(version: string): boolean {
  const parse = (value: string) => /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
  const current = parse(RULESET_VERSION);
  const candidate = parse(version);
  return !!current && !!candidate && candidate[0] === current[0]
    && candidate[1]! <= current[1]! && current[1]! - candidate[1]! <= 1;
}

export function usableEntry(entry: MirrorPoolEntry, now: number): boolean {
  if (!compatibleMirrorRuleset(entry.ruleset) || now - entry.recordedAt > MM.maxAgeMs) return false;
  if (!Array.isArray(entry.team) || entry.team.length !== 4 || !finite(entry.power) || entry.power <= 0) return false;
  if (entry.team.filter(c => isImmortal(getTroopById(Number(c?.templateId)))).length > IMMORTAL_TEAM_LIMIT) return false;
  return entry.team.every((c) => {
    if (!c || typeof c !== 'object' || !c.stats) return false;
    if (![c.stats.hp, c.stats.attack, c.stats.armor, c.stats.magic].every(finite) || c.stats.hp <= 0) return false;
    if (c.templateId !== undefined) return getTroopById(Number(c.templateId)) !== undefined;
    return c.skillId === 'none' || (c.skillId !== undefined && WEAPON_IDS.has(c.skillId));
  });
}

const ID_SUFFIX = /-w\d+-l\d+-r\d+$/;

/** 池条目 → 本批次的对手（difficulty 由相对强度决定，id 继承批次后缀以防旧票） */
export function mirrorFromEntry(entry: MirrorPoolEntry, difficulty: InvasionDifficulty, suffix: string): InvasionMirror {
  return {
    id: `pl-${entry.ownerKey}${suffix}`,
    name: entry.name,
    rating: teamPower(entry.team),
    statRating: teamStatPower(entry.team),
    league: entry.league,
    frenzy: false,
    frenzyMultiplier: 1,
    vp: entry.vp,
    finalVp: entry.vp,
    defense: entry.defense.map(d => ({ ...d })),
    archetypeId: `player:${entry.ownerKey}`,
    archetypeName: '真人镜像',
    strategy: '其他指挥官的防守队伍',
    roles: [],
    difficulty,
    provenance: '真人镜像',
    sourceRow: null,
    bannerKingdom: entry.bannerKingdom,
    player: {
      ownerKey: entry.ownerKey,
      team: structuredClone(entry.team),
      heroLevel: entry.heroLevel,
      league: entry.league,
      recordedAt: entry.recordedAt,
    },
  };
}

/** 真人镜像 → 敌方战斗快照（重编 externalId，主角改用对方名字） */
export function mirrorEnemyTeam(mirror: InvasionMirror): CombatantSnapshot[] {
  return (mirror.player?.team ?? []).map((c, index) => {
    const copy = structuredClone(c);
    copy.externalId = `e${index}-${c.templateId ?? 'hero'}`;
    if (c.templateId === undefined) copy.name = mirror.name;
    delete copy.initialHp;
    return copy;
  });
}

export interface RosterInput {
  /** 人机候选（按 easy/normal/hard 顺序，已带批次后缀） */
  bots: InvasionMirror[];
  league: number;
  /** 我方强度；<=0 表示无法评估，全部走人机 */
  playerPower: number;
  pool: readonly MirrorPoolEntry[];
  /** 最近交手过的 ownerKey */
  recent: readonly string[];
  now: number;
  seed: number;
  /** 只重选这些槽位（其余沿用 existing）；缺省 = 全部重选 */
  existing?: InvasionMirror[];
  replaceSlots?: readonly number[];
}

/** 组一批三档对手：按联赛概率决定每槽试不试真人，真人按相对强度分档挑选，挑不到就用人机 */
export function buildInvasionRoster(input: RosterInput): InvasionMirror[] {
  const { bots, now } = input;
  const league = Math.min(9, Math.max(0, Math.floor(input.league)));
  const rng = new SeededRNG(input.seed >>> 0);
  const replace = (slot: number) => !input.existing || !input.replaceSlots || input.replaceSlots.includes(slot);
  const kept = input.existing ?? [];
  const taken = new Set<string>(input.recent);
  bots.forEach((_, slot) => {
    const key = !replace(slot) ? kept[slot]?.player?.ownerKey : undefined;
    if (key) taken.add(key);
  });

  const usable = input.playerPower > 0
    ? input.pool.filter(e => usableEntry(e, now)).map(e => ({ ...e, power: teamPower(e.team) })) : [];
  // 同一玩家多个联赛都有快照时，只留离我方联赛最近、最新的一份
  const byOwner = new Map<string, MirrorPoolEntry>();
  for (const e of usable) {
    const prev = byOwner.get(e.ownerKey);
    const dist = Math.abs(e.league - league);
    if (!prev || dist < Math.abs(prev.league - league) || (dist === Math.abs(prev.league - league) && e.recordedAt > prev.recordedAt)) {
      byOwner.set(e.ownerKey, e);
    }
  }
  const deepEnough = byOwner.size >= MM.minDistinctOwners;

  return bots.map((bot, slot) => {
    if (!replace(slot) && kept[slot]) return kept[slot]!;
    const difficulty = INVASION_DIFFICULTIES[slot] ?? bot.difficulty;
    // 血怒槽走独立概率：命中则挑一名真人，再给整队套血怒加成
    const share = bot.frenzy ? MM.frenzyRealShare[league] ?? 0 : MM.realSlotShare[league]![slot] ?? 0;
    // 先掷骰再判断，保证同种子下「是否尝试真人」与池深无关
    const roll = rng.next();
    if (!deepEnough || roll >= share) return bot;
    const suffix = bot.id.match(ID_SUFFIX)?.[0] ?? '';
    const [lo, hi] = MM.powerBands[difficulty];
    const center = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    const [reachLo, reachHi] = MM.leagueReach[difficulty];
    const scored = [...byOwner.values()]
      .filter(e => !taken.has(e.ownerKey))
      .map(e => {
        const multiplier = lowerLeagueMultiplier(league, e.league, e.power / input.playerPower, lo);
        const ratio = e.power * multiplier / input.playerPower;
        if (ratio < lo || ratio > hi) return null;
        const offset = e.league - league;
        const leagueMiss = offset < reachLo ? reachLo - offset : offset > reachHi ? offset - reachHi : 0;
        const age = Math.min(1, Math.max(0, (now - e.recordedAt) / MM.maxAgeMs));
        return { e, multiplier, score: Math.abs(ratio - center) / half + leagueMiss * MM.leaguePenalty + age * MM.agePenalty };
      })
      .filter((x): x is { e: MirrorPoolEntry; multiplier: number; score: number } => x !== null)
      .sort((a, b) => a.score - b.score || a.e.ownerKey.localeCompare(b.e.ownerKey));
    if (scored.length === 0) return bot;
    // Cross-rank samples are a fallback, not competition for available nearby opponents.
    const nearby = scored.filter(x => x.e.league >= league + MM.queryLeagues[0]
      && x.e.league <= league + MM.queryLeagues[1]);
    const choices = nearby.length ? nearby : scored;
    const pick = choices[rng.nextInt(Math.min(MM.topPicks, choices.length))]!;
    taken.add(pick.e.ownerKey);
    let mirror = mirrorFromEntry(pick.e, difficulty, suffix);
    if (pick.multiplier > 1) mirror = scaleMirror(mirror, pick.multiplier);
    return bot.frenzy && bot.frenzyMultiplier !== 1 ? applyFrenzy(mirror, bot.frenzyMultiplier) : mirror;
  });
}

/**
 * 真人镜像套血怒：整队四维 × INVASION_FRENZY.stats[倍率]（向上取整、按会话上限封顶，
 * 与 enemyEncounterStats 同口径），rating 随之重算；VP 倍率由 frenzyMultiplier 生效。
 */
function lowerLeagueMultiplier(own: number, rival: number, powerRatio: number, bandMin: number): number {
  if (rival >= own || powerRatio <= 0) return 1;
  // A lower-rank team with sufficient real power needs no artificial boost.
  return Math.min(1.5, Math.max(1, bandMin / powerRatio));
}

function scaleMirror(mirror: InvasionMirror, scale: number): InvasionMirror {
  const team = (mirror.player?.team ?? []).map(c => ({ ...c, stats: {
    hp: Math.min(STAT_LIMITS.hp.max, Math.ceil(c.stats.hp * scale)),
    attack: Math.min(STAT_LIMITS.attack.max, Math.ceil(c.stats.attack * scale)),
    armor: Math.min(STAT_LIMITS.armor.max, Math.ceil(c.stats.armor * scale)),
    magic: Math.min(STAT_LIMITS.magic.max, Math.ceil(c.stats.magic * scale)),
  } }));
  return { ...mirror, rating: teamPower(team), statRating: teamStatPower(team),
    defense: mirror.defense.map(d => ({ ...d, statMultiplier: (d.statMultiplier ?? 1) * scale })),
    player: mirror.player ? { ...mirror.player, team } : mirror.player };
}

export function applyFrenzy(mirror: InvasionMirror, multiplier: FrenzyMultiplier): InvasionMirror {
  const scale = INVASION_FRENZY.stats[multiplier];
  const boosted = scaleMirror(mirror, scale);
  return {
    ...boosted,
    frenzy: true,
    frenzyMultiplier: multiplier,
    rating: boosted.rating,
    // 卡面「基础属性提升 N%」读 defense[].statMultiplier
    defense: boosted.defense,
    player: boosted.player,
  };
}

/** 最近交手名单（新的在前，去重，封顶） */
export function pushRecentOpponent(recent: readonly string[], ownerKey: string): string[] {
  return [ownerKey, ...recent.filter(k => k !== ownerKey)].slice(0, MM.recentCap);
}
