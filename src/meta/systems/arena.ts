/**
 * 竞技场 · 现开赛（M7，计划 §4.8 / ASSETS-NEEDED §4.9；2026-09-18 对照官方调研修正 draft）。
 *
 * 流程：报名（本周首场免费，其余 150 宝石——官方 150 宝石/次）→ draft 三轮 3 选 1
 * （固定稀有度阶梯：常规档→稀有档→史诗档各选 1，官方旧版 3C/3R/3UR 结构的六档适配）
 * → 限定编队（只排 draft 到手的 3 张的站位顺序，主角不出战）→ 连战 3 场（难度递增）
 * → 按最终胜场发奖（官方改版数字，economy.ARENA_REWARDS）。**卡即用即弃**：draft 卡
 * 不进 collection、不动预设队；官方「现开赛不吃王国加成」——draft 快照不带 statBonus/旗帜。
 *
 * 确定性：draft 选项与对手全部由 `draft.seed` 派生（同 seed 复现同一届现开赛）；
 * draft 卡等级口径 = 基础稀有度档的等级上限（公平卡组）、满配特质（过滤已实现）。
 */
import { getTroopById, knownTroopTypes, TROOPS, type TroopData } from '../../data/troops';
import { SeededRNG } from '../../engine/rng';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../session/contract';
import type { BattleRequest, BattleResult, CombatantSnapshot } from '../../session/contract';
import { validateBattleRequest } from '../../session/validateRequest';
import { fail, type MetaFailure } from '../types';
import type { ActiveDraft, MetaSave } from '../state/schema';
import { ARENA, ARENA_REWARDS, arenaDraftLevel } from '../data/economy';
import { KINGDOM_ORDER } from '../data/kingdoms';
import { buildMetaRegistry, enemyToSnapshot, metaKnownTraitIds, troopToSnapshot } from './battleBridge';
import { pickEnemies, type EnemyTier, type EncounterEnemy } from './encounter';
import { earn } from './wallet';

/** 档位 → 该档兵种（draft 三选一从全量数据按档取人） */
const BAND_TROOPS: TroopData[][] = (() => {
  const bands: TroopData[][] = [[], [], [], [], [], []];
  for (const t of TROOPS) bands[Math.min(Math.max(t.rarityIdx, 0), 5)]!.push(t);
  return bands;
})();

// ---------------------------------------------------------------------------
// 报名 / 弃赛
// ---------------------------------------------------------------------------

/** 报名开一届现开赛。free = 本周免费票尚未使用（weekStart 由调用方按本地周历算好传入）。 */
export function entryArena(
  save: MetaSave,
  seed: number,
  now: number,
  weekStart: number,
): { ok: true; free: boolean } | MetaFailure {
  if (save.arena.activeDraft) return fail('INVALID', '已有一届现开赛进行中');
  const free = save.arena.lastFreeEntryAt < weekStart;
  if (free) {
    save.arena.lastFreeEntryAt = now;
  } else if (save.currencies.gems < ARENA.entryFeeGems) {
    return fail('INSUFFICIENT', `宝石不足：报名费 ${ARENA.entryFeeGems}`);
  } else {
    save.currencies.gems -= ARENA.entryFeeGems;
  }
  save.arena.activeDraft = { seed: seed >>> 0, picked: [], stage: 'picking', wins: 0 };
  return { ok: true, free };
}

/** 弃赛：按当前胜场结算（已赢的照发），draft 卡整体清除 */
export function forfeitArena(
  save: MetaSave,
): { ok: true; wins: number; rewards: { gold: number; gems: number; goldKeys: number } } | MetaFailure {
  const draft = save.arena.activeDraft;
  if (!draft) return fail('INVALID', '没有进行中的现开赛');
  const rewards = finishRun(save, draft.wins);
  return { ok: true, wins: draft.wins, rewards };
}

// ---------------------------------------------------------------------------
// Draft（三轮 3 选 1，固定稀有度阶梯：低档→中档→高档各选 1）
// ---------------------------------------------------------------------------

export interface DraftOption {
  troopId: number;
  rarityIdx: number;
}

export interface DraftState {
  round: number;
  done: boolean;
  options: DraftOption[];
}

function choicesForRound(seed: number, round: number, exclude: ReadonlySet<number>): DraftOption[] {
  const rng = new SeededRNG((seed ^ ((round + 1) * 0x9e3779b9)) >>> 0);
  // 官方阶梯结构：第 1/2/3 轮分别在 低档/中档/高档 带内取人（ARENA.roundBands 注释）
  const band = ARENA.roundBands[Math.min(round, ARENA.roundBands.length - 1)]!;
  const options: DraftOption[] = [];
  const seen = new Set<number>();
  let guard = 0;
  while (options.length < ARENA.choicesPerRound && guard++ < 500) {
    const pool = BAND_TROOPS[band.min]!
      .concat(BAND_TROOPS[band.max]!)
      .filter((t) => !exclude.has(t.id) && !seen.has(t.id));
    if (pool.length === 0) break;
    const troop = pool[rng.nextInt(pool.length)]!;
    seen.add(troop.id);
    options.push({ troopId: troop.id, rarityIdx: troop.rarityIdx });
  }
  return options;
}

/** 当前轮的三选一（draft 结束/不在抽卡阶段返回 null） */
export function currentDraftChoices(save: MetaSave): DraftState | null {
  const draft = save.arena.activeDraft;
  if (!draft || draft.stage !== 'picking') return null;
  return {
    round: draft.picked.length,
    done: draft.picked.length >= ARENA.rounds,
    options: choicesForRound(draft.seed, draft.picked.length, new Set(draft.picked)),
  };
}

/** 锁定本轮选择；三轮选满后进入编队阶段 */
export function pickDraftCard(save: MetaSave, troopId: number): { ok: true; picked: number[] } | MetaFailure {
  const draft = requireDraft(save, 'picking');
  const state = currentDraftChoices(save);
  if (!state || state.done) return fail('INVALID', 'draft 已结束');
  if (!state.options.some((o) => o.troopId === troopId)) {
    return fail('INVALID', '该部队不在本轮三选一中');
  }
  draft.picked.push(troopId);
  if (draft.picked.length >= ARENA.rounds) draft.stage = 'building';
  return { ok: true, picked: [...draft.picked] };
}

/** 编队阶段：调整 3 张 draft 卡的站位顺序（队首吃骷髅） */
export function arrangeArenaTeam(save: MetaSave, order: number[]): { ok: true; picked: number[] } | MetaFailure {
  const draft = requireDraft(save, 'building');
  if (order.length !== draft.picked.length) return fail('INVALID', '站位数量与 draft 卡数不符');
  const remaining = new Set(draft.picked);
  for (const id of order) {
    if (!remaining.has(id)) return fail('INVALID', '站位序列必须是 draft 卡的重新排列');
    remaining.delete(id);
  }
  draft.picked = [...order];
  return { ok: true, picked: [...draft.picked] };
}

/** 编队确认 → 进入连战 */
export function startArenaBattles(save: MetaSave): { ok: true } | MetaFailure {
  requireDraft(save, 'building');
  save.arena.activeDraft!.stage = 'fighting';
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 连战与结算
// ---------------------------------------------------------------------------

function requireDraft(save: MetaSave, stage: ActiveDraft['stage']): ActiveDraft {
  const draft = save.arena.activeDraft;
  if (!draft) throw new Error('没有进行中的现开赛');
  if (draft.stage !== stage) throw new Error(`阶段错误：期望 ${stage}，实际 ${draft.stage}`);
  return draft;
}

function opponentTiers(wins: number, size: number): EnemyTier[] {
  if (wins <= 0) return Array.from({ length: size }, () => 'minion' as const);
  if (wins === 1) return ['elite' as const, ...Array.from({ length: size - 1 }, () => 'minion' as const)];
  return [
    'elite' as const,
    ...Array.from({ length: Math.max(size - 2, 0) }, () => 'minion' as const),
    'boss' as const,
  ];
}

export interface ArenaBridgeOutcome {
  ok: true;
  request: BattleRequest;
  /** 对手出敌条目（对账/展示用） */
  opponents: EncounterEnemy[];
  kingdom: string;
}

/** 第 wins 场对手：王国从推进序掷取、等级与规模递增；请求过会话校验 */
export function planArenaBattle(save: MetaSave, battleSeed: number): ArenaBridgeOutcome | MetaFailure {
  let draft: ActiveDraft;
  try {
    draft = requireDraft(save, 'fighting');
  } catch (e) {
    return fail('INVALID', (e as Error).message);
  }
  const wins = Math.min(draft.wins, ARENA.opponentLevels.length - 1);
  const rng = new SeededRNG((draft.seed ^ ((wins + 1) * 0x9e3779b9)) >>> 0);
  const kingdom = KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;
  const level = ARENA.opponentLevels[wins]!;
  const size = ARENA.opponentSizes[wins]!;
  const enemies = pickEnemies(kingdom, level, opponentTiers(wins, size), rng);

  // 我方 = draft 卡（等级=稀有度档上限，满配特质过滤已实现），主角不出战
  const playerTeam: CombatantSnapshot[] = draft.picked.map((troopId, index) => {
    const troop = getTroopById(troopId)!;
    const rec = {
      copies: 0,
      level: arenaDraftLevel(troop.rarityIdx),
      ascension: 0,
      traits: [true, true, true] as [boolean, boolean, boolean],
      locked: false,
    };
    return troopToSnapshot(troop, rec, `a${index}-${troop.id}`);
  });
  const enemyTeam: CombatantSnapshot[] = enemies.map((enemy, index) => {
    const troop = getTroopById(enemy.troopId)!;
    return enemyToSnapshot(troop, enemy, index);
  });

  const request: BattleRequest = {
    // 竞技场对战 = 本作的 PvP 场景（官方 PvP 类天赋 exemplar/bloodandglory 在此生效）
    mode: 'pvp' as const,
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: `arena-${draft.seed}`,
    requestId: `arena-${draft.seed}-${draft.wins}`,
    rulesetVersion: RULESET_VERSION,
    seed: battleSeed >>> 0,
    playerTeam,
    enemyTeam,
  };
  const registry = buildMetaRegistry(
    [...playerTeam, ...enemyTeam].map((s) => s.skillId as string),
  );
  const check = validateBattleRequest(request, {
    knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]),
    knownTraitIds: metaKnownTraitIds(),
    knownTroopTypes: knownTroopTypes(),
  });
  if (!check.ok) {
    const first = check.issues[0];
    return fail('INVALID', `竞技场战斗请求未过会话校验：${first ? `${first.code} ${first.message}` : ''}`);
  }
  return { ok: true, request, opponents: enemies, kingdom };
}

function finishRun(save: MetaSave, wins: number): { gold: number; gems: number; goldKeys: number } {
  const rewards = ARENA_REWARDS[Math.min(Math.max(wins, 0), ARENA_REWARDS.length - 1)]!;
  if (rewards.gold > 0 || rewards.gems > 0 || rewards.goldKeys > 0) {
    earn(save, { gold: rewards.gold, gems: rewards.gems, goldKeys: rewards.goldKeys });
    save.stats.goldEarned += rewards.gold;
  }
  save.arena.seasonWins += wins;
  save.arena.bestRun = Math.max(save.arena.bestRun, wins);
  save.arena.activeDraft = null;
  return { ...rewards };
}

export interface ArenaSettleResult {
  ok: true;
  /** 本场是否获胜 */
  victory: boolean;
  /** 当前胜场 */
  wins: number;
  /** true = 本届现开赛已结束（3 胜打满或败北），奖励已入账、draft 已清 */
  runOver: boolean;
  rewards: { gold: number; gems: number; goldKeys: number };
}

/** 结算一场竞技场战斗：胜则累计胜场，负或打满 3 胜即收官发奖、清 draft */
export function settleArenaBattle(save: MetaSave, result: BattleResult): ArenaSettleResult | MetaFailure {
  let draft: ActiveDraft;
  try {
    draft = requireDraft(save, 'fighting');
  } catch (e) {
    return fail('INVALID', (e as Error).message);
  }
  const victory = result.winner === 'player';
  if (victory) draft.wins += 1;
  const runOver = !victory || draft.wins >= ARENA.rounds;
  const rewards = runOver ? finishRun(save, draft.wins) : { gold: 0, gems: 0, goldKeys: 0 };
  return { ok: true, victory, wins: draft.wins, runOver, rewards };
}
