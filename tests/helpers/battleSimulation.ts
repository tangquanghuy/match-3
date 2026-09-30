import { BATTLE_SKULL_DROPS } from '@engine/skullDrops';
/**
 * 确定性 AI 对 AI 战斗模拟（棋盘手感调参用，零 DOM）。
 *
 * 与 App.init 同口径搭建引擎：独立模式 4v4 配置 + 完整技能库 + 召唤解析 + 骷髅率 0.16；
 * 双方都由同一套 AI 驱动，AI 与引擎共用一条种子化 RNG（与 App 一致）。
 * 同一 seed 列表 → 同一份统计，可直接做基线/调参对比。
 */
import { BoardGenerator } from '@engine/boardGen';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { implementedTraitIds, setSummonTemplateResolver } from '@engine/traits';
import { chooseEnemySwap } from '@engine/ai';
import { chooseAiAction, hasBigMatchSwap } from '@engine/aiPolicy';
import { MatchState, PlayerSide } from '@engine/types';
import type { BattleAction } from '@engine/types';
import { BATTLE_SKULL_CHANCE } from '@engine/comboBias';
import type { GameEvent } from '@engine/events';
import { TROOPS, knownTroopTypes, troopToSummonTemplate } from '../../src/data/troops';
import { assignBattleRequest, loadStandaloneRequest, mapRequestToTeams } from '@session/index';
import type { BattleRequest } from '@session/index';
import { applyRequestBoardPreset, engineRulesOf } from '@session/rules';
import { buildBattleRequest, newSave, planQuestEncounter } from '../../src/meta';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';

export interface SimConfig {
  label: string;
  /** fixture = 独立模式 4v4 配置；meta = 任务关出敌（王国/关卡按 seed 轮转） */
  scenario: 'fixture' | 'meta';
  /** legacy = 旧 chooseEnemySwap（只交换）；priority = aiPolicy 新优先级（含施法） */
  policy: 'legacy' | 'priority';
  comboBias: number;
  setupBias: number;
  skullChance?: number;
}

export interface SimStats {
  label: string;
  battles: number;
  actions: number;
  decisionPoints: number;
  /** 行动方存在 4+ 交换的决策点占比（全部决策点 / 回合首个决策点 / 额外回合中的决策点） */
  bigSwapShare: number;
  bigSwapShareTurnStart: number;
  bigSwapShareInStreak: number;
  /** 每 100 次行动的 4 连 / 5 连（直线 ≥5）/ L·T 消除组数（含连锁） */
  match4Per100: number;
  match5Per100: number;
  matchLTPer100: number;
  /** 行动结束仍是同一方（额外回合）的占比 */
  extraTurnShare: number;
  /** 额外回合里由施法带来的占比 */
  castExtraTurnShare: number;
  /** 回合首个决策点 / 额外回合中的决策点，行动后再得额外回合的概率 */
  extraAfterTurnStart: number;
  extraAfterInStreak: number;
  /** 交换行动的平均连锁深度（1 = 无连锁） */
  meanCascadeDepth: number;
  /** 每场同一方最长连续额外回合数的 p95 / max，及 ≥5 连续额外回合的对局占比 */
  streakP95: number;
  streakMax: number;
  streak5BattleShare: number;
  /** 只算交换带来的连续额外回合（施法打断）≥5 的对局占比——排除技能自带额外回合的内容循环 */
  swapStreak5BattleShare: number;
  /** 决策点棋盘上骷髅（含末日骷髅族）占比均值 */
  skullBoardShare: number;
  actionsPerBattle: number;
  /** 每场回合数：只算换手（行动后轮到对方），额外回合不计——玩家连着动不会觉得磨叽 */
  turnsPerBattle: number;
  castsPerBattle: { left: number; right: number };
  /** 未分胜负（触顶）的对局数 */
  unfinished: number;
  leftWins: number;
}

const MAX_ACTIONS = 800;

function makeRegistry(): { registry: ExtensionRegistry; knownSkillIds: Set<string> } {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  return { registry, knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]) };
}

function isSkullish(type: { kind: string; spec?: { kind: string } }): boolean {
  return type.kind === 'skull'
    || (type.kind === 'special' && (type.spec?.kind === 'doomSkull' || type.spec?.kind === 'uberDoomSkull'));
}

interface BattleTrace {
  actions: number;
  decisionPoints: number;
  freshPoints: number;
  bigSwapPoints: number;
  bigSwapFreshPoints: number;
  match4: number;
  match5: number;
  matchLT: number;
  extraTurns: number;
  castExtraTurns: number;
  freshExtraTurns: number;
  swapActions: number;
  cascadeDepthSum: number;
  longestStreak: number;
  longestSwapStreak: number;
  skullShareSum: number;
  casts: { left: number; right: number };
  finished: boolean;
  leftWon: boolean;
}

/** 独立模式 4v4（index.html 那一场）：同一对阵，只换 seed */
function fixtureBattle(seed: number): { request: BattleRequest; registry: ExtensionRegistry } {
  const { registry, knownSkillIds } = makeRegistry();
  const request = loadStandaloneRequest({
    knownSkillIds,
    knownTraitIds: new Set(implementedTraitIds()),
    knownTroopTypes: knownTroopTypes(),
  });
  request.seed = seed;
  assignBattleRequest(request);
  return { request, registry };
}

/**
 * meta 出敌对打（game.html 任务关的真实兵种/等级/技能）：两个王国同档关卡的出敌队伍互打，
 * 王国与关卡（1-4）随序号轮转——AI 对 AI 的对阵大体势均力敌，对局长度才有参考意义。
 */
function metaBattle(seed: number, index: number): { request: BattleRequest; registry: ExtensionRegistry } {
  const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  const node = 1 + (index % 4);
  const kingdomA = KINGDOM_ORDER[index % KINGDOM_ORDER.length];
  const kingdomB = KINGDOM_ORDER[(index * 7 + 3) % KINGDOM_ORDER.length];
  const a = buildBattleRequest(save, planQuestEncounter(kingdomA, node, seed));
  const b = buildBattleRequest(save, planQuestEncounter(kingdomB, node, seed ^ 0x5bd1e995));
  if (!a.ok) throw new Error(a.message);
  if (!b.ok) throw new Error(b.message);
  const request: BattleRequest = {
    ...b.request,
    seed,
    playerTeam: a.request.enemyTeam.map((s) => ({ ...s, externalId: `sim-left-${s.externalId}` })),
  };
  // 与 App.init 同口径：完整技能库打底，meta 注册表覆盖其上
  const { registry } = makeRegistry();
  for (const source of [a.registry, b.registry]) {
    for (const [id, proto] of source.prototypes) registry.prototypes.set(id, proto);
    for (const [id, effect] of source.skills) registry.skills.set(id, effect);
  }
  return { request, registry };
}

function isGameOver(state: { state: MatchState }): boolean {
  return state.state === MatchState.GameOver;
}

function runBattle(cfg: SimConfig, seed: number, index: number): BattleTrace {
  const { request, registry } = cfg.scenario === 'meta' ? metaBattle(seed, index) : fixtureBattle(seed);
  const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(request);
  const rng = new SeededRNG(seed);
  let nextId = 100000;
  const idGen = () => nextId++;
  const skullChance = cfg.skullChance ?? BATTLE_SKULL_CHANCE;
  const board = new BoardGenerator(rng, idGen, request.rules?.board?.skullChance ?? skullChance, cfg.setupBias, BATTLE_SKULL_DROPS).generate();
  applyRequestBoardPreset(board, request, rng);
  const state = createGameState(board, playerTeam, enemyTeam);
  const engine = new TurnEngine(state, rng, idGen, registry);
  engine.setSummonResolver((ref) => troopToSummonTemplate(ref, request.arenaRules));
  engine.setSummonKingdomResolver((kingdom) => TROOPS.filter((t) => (typeof kingdom === 'number' ? t.kingdomId === kingdom : t.kingdom === kingdom)).map((t) => t.referenceName));
  engine.setDaemonPool(TROOPS.filter((t) => t.troopTypes.includes('Daemon')).map((t) => t.referenceName));
  engine.setBeastPool(TROOPS.filter((t) => t.troopTypes.includes('Beast')).map((t) => t.referenceName));
  setSummonTemplateResolver((spec) => troopToSummonTemplate(spec.referenceName, request.arenaRules));
  engine.skullChance = skullChance;
  engine.skullDropMix = BATTLE_SKULL_DROPS;
  engine.comboBias = cfg.comboBias;
  engine.applyRules(engineRulesOf(request, idMap));
  engine.takeInitialEvents();

  const trace: BattleTrace = {
    actions: 0, decisionPoints: 0, freshPoints: 0, bigSwapPoints: 0, bigSwapFreshPoints: 0, match4: 0, match5: 0, matchLT: 0,
    extraTurns: 0, castExtraTurns: 0, freshExtraTurns: 0, swapActions: 0, cascadeDepthSum: 0, longestStreak: 0, longestSwapStreak: 0, skullShareSum: 0,
    casts: { left: 0, right: 0 }, finished: false, leftWon: false,
  };
  let streakSide: PlayerSide | null = null;
  let streak = 0;
  let swapStreak = 0;
  let passes = 0;

  while (trace.actions < MAX_ACTIONS && state.state !== MatchState.GameOver) {
    if (state.state !== MatchState.AwaitingInput) break;
    const side = state.activePlayer;
    trace.decisionPoints++;
    const fresh = streakSide !== side;
    if (fresh) trace.freshPoints++;
    if (hasBigMatchSwap(state, side)) {
      trace.bigSwapPoints++;
      if (fresh) trace.bigSwapFreshPoints++;
    }
    let skulls = 0;
    state.board.forEach((gem) => { if (gem && isSkullish(gem.type)) skulls++; });
    trace.skullShareSum += skulls / (BoardModel.ROWS * BoardModel.COLS);

    let action: BattleAction | null = null;
    if (cfg.policy === 'legacy') {
      const swap = chooseEnemySwap(state.board, rng);
      if (swap) action = { type: 'swap', from: swap.a, to: swap.b };
    } else {
      action = chooseAiAction({ state, side, rng, registry })?.action ?? null;
    }
    let events: GameEvent[] = action ? engine.resolveAction(action) : [];
    if (action?.type === 'cast' && events.length === 0) {
      action = chooseAiAction({ state, side, rng, registry, allowCast: false })?.action ?? null;
      events = action ? engine.resolveAction(action) : [];
    }
    if (!action || events.length === 0) {
      // 无可行动作：空过（引擎死局检测会洗牌），防止死循环
      engine.passTurn();
      if (++passes > 20) break;
      continue;
    }
    trace.actions++;
    if (action.type === 'cast') trace.casts[side === PlayerSide.Left ? 'left' : 'right']++;
    let depth = 0;
    for (const ev of events) {
      if (ev.type !== 'elimination') continue;
      depth = Math.max(depth, ev.chainCount);
      if (ev.shape === 'T' || ev.shape === 'L') trace.matchLT++;
      else if (ev.shape === 'line4plus') {
        if (ev.cells.length >= 5) trace.match5++;
        else trace.match4++;
      }
    }
    if (action.type === 'swap') {
      trace.swapActions++;
      trace.cascadeDepthSum += Math.max(1, depth);
    }
    // resolveAction 会改 state.state；经函数读取，避开循环头的类型收窄
    const extra = !isGameOver(state) && state.activePlayer === side;
    if (extra) {
      trace.extraTurns++;
      if (action.type === 'cast') trace.castExtraTurns++;
      if (fresh) trace.freshExtraTurns++;
      streak = streakSide === side ? streak + 1 : 1;
      swapStreak = action.type === 'swap' ? (streakSide === side ? swapStreak + 1 : 1) : 0;
      streakSide = side;
      trace.longestStreak = Math.max(trace.longestStreak, streak);
      trace.longestSwapStreak = Math.max(trace.longestSwapStreak, swapStreak);
    } else {
      streak = 0;
      swapStreak = 0;
      streakSide = null;
    }
  }
  trace.finished = state.state === MatchState.GameOver;
  trace.leftWon = state.winner === PlayerSide.Left;
  return trace;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function simulate(cfg: SimConfig, seeds: readonly number[]): SimStats {
  const traces = seeds.map((seed, index) => runBattle(cfg, seed, index));
  const sum = (f: (t: BattleTrace) => number) => traces.reduce((acc, t) => acc + f(t), 0);
  const actions = sum((t) => t.actions);
  const decisionPoints = sum((t) => t.decisionPoints);
  const swapActions = sum((t) => t.swapActions);
  const streaks = traces.map((t) => t.longestStreak);
  const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    label: cfg.label,
    battles: traces.length,
    actions,
    decisionPoints,
    bigSwapShare: round(sum((t) => t.bigSwapPoints) / decisionPoints),
    bigSwapShareTurnStart: round(sum((t) => t.bigSwapFreshPoints) / sum((t) => t.freshPoints)),
    bigSwapShareInStreak: round(
      (sum((t) => t.bigSwapPoints) - sum((t) => t.bigSwapFreshPoints))
      / Math.max(1, decisionPoints - sum((t) => t.freshPoints))),
    match4Per100: round((100 * sum((t) => t.match4)) / actions, 2),
    match5Per100: round((100 * sum((t) => t.match5)) / actions, 2),
    matchLTPer100: round((100 * sum((t) => t.matchLT)) / actions, 2),
    extraTurnShare: round(sum((t) => t.extraTurns) / actions),
    castExtraTurnShare: round(sum((t) => t.castExtraTurns) / Math.max(1, sum((t) => t.extraTurns))),
    extraAfterTurnStart: round(sum((t) => t.freshExtraTurns) / sum((t) => t.freshPoints)),
    extraAfterInStreak: round((sum((t) => t.extraTurns) - sum((t) => t.freshExtraTurns)) / Math.max(1, decisionPoints - sum((t) => t.freshPoints))),
    meanCascadeDepth: round(sum((t) => t.cascadeDepthSum) / swapActions),
    streakP95: percentile(streaks, 0.95),
    streakMax: Math.max(0, ...streaks),
    streak5BattleShare: round(streaks.filter((s) => s >= 5).length / traces.length),
    swapStreak5BattleShare: round(traces.filter((t) => t.longestSwapStreak >= 5).length / traces.length),
    skullBoardShare: round(sum((t) => t.skullShareSum) / decisionPoints),
    actionsPerBattle: round(actions / traces.length, 1),
    turnsPerBattle: round((actions - sum((t) => t.extraTurns)) / traces.length, 1),
    castsPerBattle: {
      left: round(sum((t) => t.casts.left) / traces.length, 2),
      right: round(sum((t) => t.casts.right) / traces.length, 2),
    },
    unfinished: traces.filter((t) => !t.finished).length,
    leftWins: traces.filter((t) => t.leftWon).length,
  };
}

/** 固定 seed 序列（与 App 的 battleRequest.seed 同为 32 位整数） */
export function simSeeds(count: number, base = 20260928): number[] {
  return Array.from({ length: count }, (_, i) => (base + i * 7919) >>> 0);
}
