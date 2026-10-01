import { resolveBattleMaps } from './battleMaps';
import { grantBattleRewards, type BattleRewards } from './battleRewards';
/** Four-pick normal Arena: level 15, no traits/bonuses, six wins or two losses. */
import { getTroopById, knownTroopTypes, TROOPS, type TroopData } from '../../data/troops';
import { isImmortal } from '../../data/immortals';
import { COMMUNITY_KINGDOM } from '../../data/communityTroops';
import { SeededRNG } from '../../engine/rng';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../session/contract';
import type { BattleRequest, BattleResult, CombatantSnapshot } from '../../session/contract';
import { validateBattleRequest } from '../../session/validateRequest';
import { fail, type MetaFailure } from '../types';
import type { ActiveDraft, MetaSave } from '../state/schema';
import { ARENA, ARENA_REWARDS, arenaDraftLevel, type ArenaRewards } from '../data/economy';
import { KINGDOM_ORDER, QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { buildMetaRegistry, enemyToSnapshot, metaKnownTraitIds, troopToSnapshot } from './battleBridge';
import { type EncounterEnemy } from './encounter';
import { arenaPickScore, arrangeDraftDefense } from '../data/opponentTeams';
import { earn, earnMaterials, spend } from './wallet';

/** 档位 → 该档兵种（draft 三选一从全量数据按档取人） */
const BAND_TROOPS: TroopData[][] = (() => {
  const bands: TroopData[][] = [[], [], [], [], [], []];
  for (const t of TROOPS) {
    if (t.kingdom !== COMMUNITY_KINGDOM && !isImmortal(t)) bands[Math.min(Math.max(t.rarityIdx, 0), 5)]!.push(t);
  }
  return bands;
})();

// ---------------------------------------------------------------------------
// 报名 / 弃赛
// ---------------------------------------------------------------------------

/** Official unlock: complete the Broken Spire questline. */
export function arenaUnlocked(save: MetaSave): boolean {
  return (save.kingdoms['破碎尖塔']?.questsDone ?? 0) >= QUESTS_PER_KINGDOM;
}

/** 每届支付黄金；保留 free=false 返回字段以兼容网关。 */
export function entryArena(
  save: MetaSave,
  seed: number,
  _now: number,
  _weekStart: number,
): { ok: true; free: boolean } | MetaFailure {
  if (save.arena.activeDraft) return fail('INVALID', '已有一届现开赛进行中');
  if (!arenaUnlocked(save)) return fail('INVALID', '完成破碎尖塔任务链后解锁竞技场');
  const paid = spend(save, { gold: ARENA.entryFeeGold });
  if (!paid.ok) return paid;
  save.arena.activeDraft = { seed: seed >>> 0, picked: [], stage: 'picking', wins: 0, losses: 0, rulesVersion: 2 };
  return { ok: true, free: false };
}

/** 弃赛：按当前胜场结算（已赢的照发），draft 卡整体清除 */
export function forfeitArena(
  save: MetaSave,
): { ok: true; wins: number; rewards: ArenaRewards } | MetaFailure {
  const draft = save.arena.activeDraft;
  if (!draft) return fail('INVALID', '没有进行中的现开赛');
  const rewards = finishRun(save, draft.wins);
  return { ok: true, wins: draft.wins, rewards };
}

// ---------------------------------------------------------------------------
// Draft（四轮 3 选 1，普通→稀有→超稀有→史诗各选 1）
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
  // 每轮固定一种基础稀有度，升阶不影响选秀池。
  const band = ARENA.roundBands[Math.min(round, ARENA.roundBands.length - 1)]!;
  const options: DraftOption[] = [];
  const seen = new Set<number>();
  let guard = 0;
  while (options.length < ARENA.choicesPerRound && guard++ < 500) {
    const pool = BAND_TROOPS[band.min]!
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

/** 锁定本轮选择；四轮选满后进入编队阶段 */
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

/** 首场前及场间可调整站位；fighting 是整届连战阶段，单场是否在打由票据判断。 */
export function arrangeArenaTeam(save: MetaSave, order: number[]): { ok: true; picked: number[] } | MetaFailure {
  const draft = save.arena.activeDraft;
  if (!draft) return fail('INVALID', '没有进行中的现开赛');
  if (draft.stage !== 'building' && draft.stage !== 'fighting') return fail('INVALID', '请先完成四轮选牌');
  if (save.pendingBattle?.mode === 'arena') return fail('INVALID', '本场战斗尚未结算，请结算后调整站位');
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

export interface ArenaBridgeOutcome {
  ok: true;
  request: BattleRequest;
  /** 对手出敌条目（对账/展示用） */
  opponents: EncounterEnemy[];
  kingdom: string;
  registry: ReturnType<typeof buildMetaRegistry>;
}

/** 第 wins 场对手：王国从推进序掷取；等级、人数、稀有度带全程对称；请求过会话校验 */
export function planArenaBattle(save: MetaSave, battleSeed: number): ArenaBridgeOutcome | MetaFailure {
  let draft: ActiveDraft;
  try {
    draft = requireDraft(save, 'fighting');
  } catch (e) {
    return fail('INVALID', (e as Error).message);
  }
  if (draft.picked.length !== ARENA.rounds) return fail('INVALID', '请先完成四轮选牌');
  const { kingdom, enemies } = arenaOpponentPreview(draft.seed, draft.wins, draft.losses ?? 0);

  // 我方 = draft 卡（双方固定15级、关闭特质），主角不出战
  const playerTeam: CombatantSnapshot[] = draft.picked.map((troopId, index) => {
    const troop = getTroopById(troopId)!;
    const rec = {
      copies: 0,
      level: arenaDraftLevel(troop.rarityIdx),
      ascension: 0,
      traits: [false, false, false] as [boolean, boolean, boolean],
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
    arenaRules: true,
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: `arena-${draft.seed}`,
    requestId: `arena-${draft.seed}-${draft.wins}-${draft.losses ?? 0}`,
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
  return { ok: true, request, opponents: enemies, kingdom, registry };
}

function finishRun(save: MetaSave, wins: number): ArenaRewards {
  const rewards = ARENA_REWARDS[Math.min(Math.max(wins, 0), ARENA_REWARDS.length - 1)]!;
  earn(save, rewards);
  save.stats.goldEarned += rewards.gold;
  save.stats.soulsEarned += rewards.souls;
  save.arena.seasonWins += wins;
  save.arena.bestRun = Math.max(save.arena.bestRun, wins);
  save.arena.activeDraft = null;
  return { ...rewards };
}

export interface ArenaSettleResult {
  battleRewards: BattleRewards;
  ok: true;
  /** 本场是否获胜 */
  victory: boolean;
  losses: number;
  /** 当前胜场 */
  wins: number;
  /** true = 本届现开赛已结束（6 胜或 2 败），奖励已入账、draft 已清 */
  runOver: boolean;
  rewards: ArenaRewards;
  /** Actual in-battle collection, separate from the run reward table. */
  collected: { gold: number; souls: number; gems: number; maps: number };
}

/** 结算一场竞技场战斗：胜则累计胜场，两败或打满 6 胜即收官发奖、清 draft */
export function settleArenaBattle(save: MetaSave, result: BattleResult): ArenaSettleResult | MetaFailure {
  let draft: ActiveDraft;
  try {
    draft = requireDraft(save, 'fighting');
  } catch (e) {
    return fail('INVALID', (e as Error).message);
  }
  const amount = (n: number | undefined): number => n !== undefined && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const collected = { gold: amount(result.economy?.gold), souls: amount(result.economy?.souls), gems: amount(result.economy?.gems), maps: resolveBattleMaps(result).total };
  earn(save, { gold: collected.gold, souls: collected.souls, gems: collected.gems });
  earnMaterials(save, { treasureMaps: collected.maps });
  save.stats.goldEarned += collected.gold;
  save.stats.soulsEarned += collected.souls;
  const battleRewards = grantBattleRewards(save, result);
  const victory = result.winner === 'player';
  if (victory) draft.wins += 1;
  else draft.losses = (draft.losses ?? 0) + 1;
  const losses = draft.losses ?? 0;
  const runOver = losses >= ARENA.lossesToFinish || draft.wins >= ARENA.winsToFinish;
  const rewards = runOver ? finishRun(save, draft.wins) : { gold: 0, souls: 0, gloryKeys: 0, trophies: 0 };
  return { ok: true, victory, wins: draft.wins, losses, runOver, rewards, collected, battleRewards };
}

/** Local opponent skill progression requested for this project, NOT official matchmaking.
 * Winning improves draft decisions, never level/traits, rarity, pool size or future-pick knowledge.
 */
export const ARENA_OPPONENT_POLICIES = [
  { label: '初试选秀', smartPickChance: 0,    arrangeChance: 0 },
  { label: '基础选牌', smartPickChance: .15, arrangeChance: .10 },
  { label: '输出意识', smartPickChance: .30, arrangeChance: .25 },
  { label: '兼顾供魔', smartPickChance: .45, arrangeChance: .40 },
  { label: '进阶编队', smartPickChance: .60, arrangeChance: .55 },
  { label: '熟练选秀', smartPickChance: .75, arrangeChance: .70 },
] as const;
export function arenaOpponentPolicy(wins: number) {
  const index = Number.isFinite(wins) ? Math.min(5, Math.max(0, Math.floor(wins))) : 0;
  return ARENA_OPPONENT_POLICIES[index]!;
}
/** Separate seeded decisions make progression testable against identical visible draft options. */
export function draftArenaDefense(seed: number, wins: number) {
  const choicesRng = new SeededRNG(seed >>> 0);
  const decisionRng = new SeededRNG((seed ^ 0x85ebca6b) >>> 0);
  const policy = arenaOpponentPolicy(wins);
  const picked: number[] = [];
  const rounds: { options: number[]; picked: number; smart: boolean; score: number }[] = [];
  for (let round = 0; round < ARENA.rounds; round++) {
    const options = choicesForRound(choicesRng.nextInt(0x7fffffff), round, new Set(picked));
    const randomOption = options[decisionRng.nextInt(options.length)]!;
    const smart = decisionRng.next() < policy.smartPickChance;
    const ranked = [...options].sort((a, b) => arenaPickScore(picked, b.troopId) - arenaPickScore(picked, a.troopId));
    const choice = smart ? ranked[0]! : randomOption;
    rounds.push({ options: options.map(o => o.troopId), picked: choice.troopId, smart, score: arenaPickScore(picked, choice.troopId) });
    picked.push(choice.troopId);
  }
  const shuffled = [...picked];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = decisionRng.nextInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const arranged = decisionRng.next() < policy.arrangeChance;
  return { troops: arranged ? arrangeDraftDefense(shuffled) : shuffled, rounds, arranged, policy };
}
/** Shared preview/request roster. A loss changes the opponent, not the skill tier. */
export function arenaOpponentPreview(seed: number, wins: number, losses = 0): {
  kingdom: string; enemies: EncounterEnemy[]; policy: ReturnType<typeof arenaOpponentPolicy>;
} {
  // Distinguish e.g. 1 win/0 losses from 0 wins/1 loss without raising difficulty on a loss.
  const rng = new SeededRNG((seed ^ ((wins + 1) * 0x9e3779b9) ^ (losses * 0x27d4eb2d)) >>> 0);
  const kingdom = KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;
  const draft = draftArenaDefense(rng.nextInt(0x7fffffff), wins);
  return {
    kingdom, policy: draft.policy,
    enemies: draft.troops.map(troopId => ({ troopId, level: ARENA.level, tier: 'minion', traitCount: 0 })),
  };
}
