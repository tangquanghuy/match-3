import { buyMaterialGoods } from '../systems/materialShop';
import { abandonExploreRun, advanceExploreRun, exploreBattleSeed, exploreRunMatches, maxExploreTier } from '../systems/explore';
import { mirrorFromEntry } from '../systems/invasionMirrors';
import { earn } from '../systems/wallet';
import { defenseRecord, accountDefenseLog, defenseEntryKey, validSnapshot, type DefenseLog } from '../systems/invasionDefense';
/**
 * Meta 权威核心：执行一条命令，产出结果与新存档。
 *
 * 这是整条 meta 管线里**唯一**会写 MetaSave 的地方。同一份代码有两个宿主：
 *  - 本地后端（gateway/localTransport.ts）：浏览器内执行，存储 = localStorage；
 *  - 远端后端（Cloudflare Worker）：按玩家读 D1 → executeCommand → 乐观锁写回。
 *
 * 约定：
 *  - 时钟与熵只来自 ServerEnv（命令里没有 now/seed，客户端无法影响）；
 *  - 执行前把 `save.savedAt` 设为命令时刻，systems 需要「现在」时读它；
 *  - **失败即不变**：结果是 MetaFailure 时 commit=false，宿主丢弃本次改动
 *    （宿主传入的是工作副本，见 runCommand）；
 *  - 战斗必须先 plan 取票（登记 pendingBattle）再 settle，一票一结，
 *    结算所需上下文全部取自票据而不是客户端。
 */
import { isCharacterGender, isCharacterPortrait } from '../state/character';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION, type BattleResult } from '@session/contract';
import { fail, type MetaFailure } from '../types';
import type { MetaSave, PendingBattle } from '../state/schema';
import { newSave } from '../state/schema';
import { parseSaveJson } from '../state/save';
import { INVASION, NEW_PLAYER_TROOP_IDS, STARTING_KINGDOM } from '../data/economy';
import { todayStartOf, weekStartOf } from '../gateway/clock';
import { claimGift, claimAllGifts } from '../systems/gifts';
import { restoreInitialCollection, restoreRealCollection, unlockKingdomTroops } from '../systems/collectionModifier';
import { levelUp, ascend, unlockTrait, decompose, getRecord } from '../systems/troopProgress';
import { setTeamPreset, activeTeam, validateTeam } from '../systems/teamRules';
import { claimWeapon, equipClass, equipWeapon, forgeCatalogWeapon } from '../systems/hero';
import { clearTalent, pickTalent, unlockHeroTrait } from '../systems/talents';
import { pickManaMastery } from '../systems/manaMastery';
import { setWishlist, setPursuitTarget } from '../systems/wishlist';
import { openGemChest, openGoldChest, openGloryChest } from '../systems/gacha';
import { upgradeKingdom, setExploreTier, exploreUnlocked, setHomeKingdom } from '../systems/kingdomOps';
import { collectAllTribute, collectTribute } from '../systems/tribute';
import { temperWeaponOnSave } from '../systems/forgeOps';
import {
  planEventEncounter,
  currentEventTheme,
  ensureEventWeek,
  eventBattleReady,
  buyEventGoods,
  applyEventBattleModifiers,
  abandonTowerRun,
  eventAction,
} from '../systems/events';
import {
  planInvasionBattle,
  settleInvasionBattle,
  refreshInvasionOpponents,
  claimInvasionRank,
  ensureInvasionSeason,
  invasionRosterFresh,
  rebuildInvasionRoster,
  afterInvasionSettle,
  invasionStandingsFresh,
  refreshInvasionStandings,
  invasionVpReport,
} from '../systems/invasion';
import type { MirrorPoolEntry, MirrorRecord, StandingEntry, VpReport } from '../systems/invasionMirrors';
import {
  entryArena,
  pickDraftCard,
  arrangeArenaTeam,
  startArenaBattles,
  forfeitArena,
  planArenaBattle,
  settleArenaBattle,
  currentDraftChoices,
} from '../systems/arena';
import {
  questNodeUnlocked,
  planQuestEncounter,
  planExploreEncounter,
  planTutorialEncounter,
  type EncounterEnemy,
} from '../systems/encounter';
import { buildBattleRequest, revalidateOutcome, type BridgeOutcome } from '../systems/battleBridge';
import { applySettlement } from '../systems/settlement';
import { beginHunt, commitMove } from '../systems/treasureHunt';
import type { Materials } from '../state/schema';
import { buildDemoSave } from './demo';
import type { ServerEnv } from './env';
import {
  isDevCommand,
  type BattleTicket,
  type CommandArgs,
  type CommandResult,
  type CommandType,
  type ForfeitResult,
  type MetaCommand,
} from './protocol';

// ---------------------------------------------------------------------------
// 新档
// ---------------------------------------------------------------------------

export type FreshSaveKind = 'new' | 'demo';

/** 新玩家存档：'new' = 真实开局（新手引导起步），'demo' = 本地开发演示进度 */
export function createFreshSave(kind: FreshSaveKind, now: number): MetaSave {
  return kind === 'demo'
    ? buildDemoSave(now)
    : newSave({ now, starterTroopIds: NEW_PLAYER_TROOP_IDS, tutorial: true });
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

export interface CommandOutcome<K extends CommandType = CommandType> {
  result: CommandResult<K>;
  /** 提交后的存档（commit=false 时为原存档，未改动） */
  save: MetaSave;
  /** true = 宿主应落盘（revision 已 +1） */
  commit: boolean;
  /** 提交后由宿主执行的外部副作用（仅 commit=true 时有意义） */
  effects?: CommandEffects;
}

/** 宿主在命令前预取、传给核心的外部数据（核心保持同步纯函数） */
export interface CommandIo {
  defenseLog?: DefenseLog;
  /** 入侵真人镜像池样本；undefined = 宿主没有共享池（本地/测试），对手全走人机 */
  mirrorPool?: readonly MirrorPoolEntry[];
  /** 本周同联赛的真人周榜（已排除本人）；undefined = 没取（沿用存档快照或人机补位） */
  standings?: readonly StandingEntry[];
}

export interface CommandEffects {
  /** 待写入共享池的入侵镜像录制 */
  publishMirror?: MirrorRecord;
  /** 待写入周榜的本周 VP */
  reportVp?: VpReport;
}

/** 这条命令需要宿主预取哪些共享数据（避免每条命令都查共享库） */
export function commandPoolNeeds(save: MetaSave, command: MetaCommand, now: number): { mirrors: boolean; standings: boolean } {
  const week = weekStartOf(now);
  // 跨周时核心会先周结，旧快照必然失效
  const standings = save.invasion.weekStart < week || !invasionStandingsFresh(save, week, now);
  switch (command.type) {
    case 'refreshInvasionOpponents':
      return { mirrors: true, standings };
    case 'syncInvasionSeason':
      return { mirrors: save.invasion.weekStart < week || !invasionRosterFresh(save, week), standings };
    case 'settleBattle':
      return { mirrors: save.pendingBattle?.mode === 'invasion', standings: false };
    default:
      return { mirrors: false, standings: false };
  }
}

/**
 * 宿主入口：在工作副本上执行命令；成功则提交（revision+1），失败则原样返回旧档。
 * 传入的 `save` 不会被修改。
 */
export function runCommand<K extends CommandType>(
  save: MetaSave,
  command: MetaCommand<K>,
  env: ServerEnv,
  io: CommandIo = {},
): CommandOutcome<K> {
  if (isDevCommand(command.type) && !env.allowDev) {
    return { result: fail('FORBIDDEN', '该操作仅开发环境可用') as CommandResult<K>, save, commit: false };
  }
  if (env.requireCharacter && !save.character && !['createCharacter', 'resetToNewGame'].includes(command.type) && !isDevCommand(command.type)) {
    return { result: fail('PREREQ_LOCKED', '请先创建角色') as CommandResult<K>, save, commit: false };
  }
  const now = env.now();
  const work = structuredClone(save);
  work.savedAt = now;
  let result: CommandResult<K>;
  let next: MetaSave;
  const effects: CommandEffects = {};
  try {
    ({ result, save: next } = execute(work, command as MetaCommand, env, now, io, effects) as { result: CommandResult<K>; save: MetaSave });
  } catch (error) {
    // 系统层抛错（越界参数等）按失败处理，不落半截状态
    const message = error instanceof Error ? error.message : String(error);
    return { result: fail('INVALID', message) as CommandResult<K>, save, commit: false };
  }
  if (isFailureResult(result)) return { result, save, commit: false };
  next.savedAt = now;
  next.revision = save.revision + 1;
  return { result, save: next, commit: true, ...(Object.keys(effects).length > 0 ? { effects } : {}) };
}

function isFailureResult(result: unknown): result is MetaFailure {
  return typeof result === 'object' && result !== null && (result as MetaFailure).ok === false;
}

interface Executed {
  result: unknown;
  /** 通常就是传入的工作副本；整档替换类命令（重开/导入）返回新对象 */
  save: MetaSave;
}

function execute(save: MetaSave, command: MetaCommand, env: ServerEnv, now: number, io: CommandIo, effects: CommandEffects): Executed {
  const weekStart = weekStartOf(now);
  const todayStart = todayStartOf(now);
  const done = (result: unknown): Executed => ({ result, save });
  const materialsBefore = snapshotMaterials(save);
  const withMaterials = (result: unknown): Executed => {
    if (!isFailureResult(result)) markMaterialGains(save, materialsBefore);
    return done(result);
  };

  switch (command.type) {
    // —— 系统 ——
    case 'markMaterialsSeen':
      save.materialsUnread = false;
      return done(false);
    case 'markMapSeen': {
      const { level } = command.args as CommandArgs<'markMapSeen'>;
      if (!Number.isInteger(level) || level < 0 || level > save.hero.level) return done(fail('INVALID', '等级不合法'));
      save.mapSeenLevel = Math.max(save.mapSeenLevel ?? 0, level);
      return done(save.mapSeenLevel);
    }
    case 'createCharacter': {
      if (save.character) return done(fail('ALREADY_UNLOCKED', '角色已创建'));
      const { gender, portrait } = command.args;
      const name = env.accountName?.();
      if (!name || name.length > 128) return done(fail('FORBIDDEN', '请重新登录后创建角色'));
      if (!isCharacterGender(gender) || !isCharacterPortrait(portrait)) return done(fail('INVALID', '请选择性别和有效的角色立绘'));
      save.character = { name, gender, portrait };
      return done({ ok: true });
    }
    case 'resetToNewGame':
      return { result: { ok: true }, save: rebase(createFreshSave('new', now), save) };

    // —— 养成 ——
    case 'levelUpTroop': {
      const { troopId, targetLevel } = command.args as CommandArgs<'levelUpTroop'>;
      const rec = getRecord(save, troopId);
      if (!rec) return done(fail('NOT_OWNED', '尚未拥有该部队'));
      return done(levelUp(save, troopId, targetLevel === undefined ? rec.level + 1 : targetLevel));
    }
    case 'ascendTroop':
      return done(ascend(save, (command.args as CommandArgs<'ascendTroop'>).troopId));
    case 'unlockTroopTrait': {
      const { troopId, slot } = command.args as CommandArgs<'unlockTroopTrait'>;
      return done(unlockTrait(save, troopId, slot));
    }
    case 'decomposeTroop':
      return done(decompose(save, (command.args as CommandArgs<'decomposeTroop'>).troopId));
    case 'setTroopLocked': {
      const { troopId, locked } = command.args as CommandArgs<'setTroopLocked'>;
      const rec = getRecord(save, troopId);
      if (!rec) return done(fail('NOT_OWNED', '尚未拥有该部队'));
      rec.locked = locked === true;
      return done(rec.locked);
    }

    // —— 编队 ——
    case 'saveTeam': {
      const { index, team } = command.args as CommandArgs<'saveTeam'>;
      return done(setTeamPreset(save, index, team));
    }
    case 'activateTeam': {
      const { index } = command.args as CommandArgs<'activateTeam'>;
      if (!Number.isInteger(index) || index < 0 || index >= save.teams.length) {
        return done(fail('INVALID', '预设队序号不存在'));
      }
      save.activeTeamIndex = index;
      return done(index);
    }
    case 'deleteTeam': {
      const { index } = command.args as CommandArgs<'deleteTeam'>;
      if (save.teams.length <= 1) return done(fail('INVALID', '至少保留一支预设队'));
      if (!Number.isInteger(index) || index < 0 || index >= save.teams.length) {
        return done(fail('INVALID', '预设队序号不存在'));
      }
      save.teams.splice(index, 1);
      if (save.activeTeamIndex >= save.teams.length) save.activeTeamIndex = 0;
      return done(save.activeTeamIndex);
    }

    // —— 主角 ——
    case 'equipHeroClass': {
      const r = equipClass(save, (command.args as CommandArgs<'equipHeroClass'>).classId);
      return done(r.ok ? r.classId : r);
    }
    case 'equipHeroWeapon': {
      const r = equipWeapon(save, (command.args as CommandArgs<'equipHeroWeapon'>).weaponId);
      return done(r.ok ? r.weaponId : r);
    }
    case 'forgeCatalogWeapon': {
      const r = forgeCatalogWeapon(save, (command.args as CommandArgs<'forgeCatalogWeapon'>).weaponId);
      return done(r.ok ? r.weaponId : r);
    }
    case 'claimHeroWeapon': {
      const r = claimWeapon(save, (command.args as CommandArgs<'claimHeroWeapon'>).weaponId);
      return done(r.ok ? r.weaponId : r);
    }
    case 'pickHeroTalent': {
      const { classId, tierIndex, talentCode } = command.args as CommandArgs<'pickHeroTalent'>;
      return done(pickTalent(save, classId, tierIndex, talentCode));
    }
    case 'clearHeroTalent': {
      const { classId, tierIndex } = command.args as CommandArgs<'clearHeroTalent'>;
      return done(clearTalent(save, classId, tierIndex));
    }
    case 'unlockHeroTrait':
      return done(unlockHeroTrait(save, (command.args as CommandArgs<'unlockHeroTrait'>).slot));
    case 'pickManaMastery':
      return done(pickManaMastery(save, (command.args as CommandArgs<'pickManaMastery'>).color));
    case 'temperWeapon':
      return done(temperWeaponOnSave(save, (command.args as CommandArgs<'temperWeapon'>).weaponId));

    // —— 愿望单 / 宝箱 ——
    case 'setWishlist':
      return done(setWishlist(save, (command.args as CommandArgs<'setWishlist'>).ids));
    case 'setPursuitTarget':
      return done(setPursuitTarget(save, (command.args as CommandArgs<'setPursuitTarget'>).id));
    case 'openChest': {
      const { kind, count, buyMissingKeys } = command.args as CommandArgs<'openChest'>;
      const seed = env.seed();
      const result = kind === 'gem' ? openGemChest(save, seed, count)
        : kind === 'glory' ? openGloryChest(save, seed, count)
          : kind === 'gold' ? openGoldChest(save, seed, count, { buyMissingKeys })
            : fail('INVALID', '未知宝箱');
      return withMaterials(result);
    }

    // —— 王国 ——
    case 'upgradeKingdomLevel': {
      const r = upgradeKingdom(save, (command.args as CommandArgs<'upgradeKingdomLevel'>).kingdom);
      return done(r.ok ? r.level : r);
    }
    case 'collectKingdomTribute':
      return done(collectTribute(save, (command.args as CommandArgs<'collectKingdomTribute'>).kingdom, now).collected);
    case 'collectAllTribute':
      return done(collectAllTribute(save, now).haul);
    case 'setHomeKingdom': {
      const r = setHomeKingdom(save, (command.args as CommandArgs<'setHomeKingdom'>).kingdom);
      return done(r.ok ? r.home : r);
    }
    case 'abandonKingdomExplore': {
      const { kingdom } = command.args as CommandArgs<'abandonKingdomExplore'>;
      const r = abandonExploreRun(save, kingdom);
      return done(r.ok ? true : r);
    }
    case 'setKingdomExploreTier': {
      const { kingdom, tier } = command.args as CommandArgs<'setKingdomExploreTier'>;
      const r = setExploreTier(save, kingdom, tier);
      return done(r.ok ? r.tier : r);
    }

    // —— 竞技场 ——
    case 'enterArena': {
      const r = entryArena(save, env.seed(), now, weekStart);
      return done(r.ok ? r.free : r);
    }
    case 'pickDraftCard': {
      const r = pickDraftCard(save, (command.args as CommandArgs<'pickDraftCard'>).troopId);
      if (!r.ok) return done(r);
      return done(currentDraftChoices(save) ?? { round: save.arena.activeDraft?.picked.length ?? 0, done: true, options: [] });
    }
    case 'arrangeDraftTeam': {
      const r = arrangeArenaTeam(save, (command.args as CommandArgs<'arrangeDraftTeam'>).order);
      return done(r.ok ? r.picked : r);
    }
    case 'startDraftBattles': {
      const r = startArenaBattles(save);
      return done(r.ok ? true : r);
    }
    case 'forfeitDraft': {
      const r = forfeitArena(save);
      if (r.ok && save.pendingBattle?.mode === 'arena') save.pendingBattle = null;
      return done(r.ok ? { wins: r.wins, rewards: r.rewards } : r);
    }

    // —— 战斗：出战票 ——
    case 'planQuestBattle': {
      const { kingdom, node } = command.args as CommandArgs<'planQuestBattle'>;
      if (!questNodeUnlocked(save, kingdom, node)) {
        return done(fail('LOCKED', `「${kingdom}」第 ${node} 关尚未解锁：只能打下一关`));
      }
      return done(issueEncounter(save, buildBattleRequest(save, planQuestEncounter(kingdom, node, env.seed())), 'quest', now));
    }
    case 'planTutorialBattle': {
      if (save.onboarding.step !== 'battle') return done(fail('INVALID', '新手试炼已完成'));
      const outcome = buildBattleRequest(save, planTutorialEncounter(STARTING_KINGDOM, env.seed()));
      if (outcome.ok) {
        // 新手试炼：生命仅增至 1.2 倍，保留低攻击配置
        for (const enemy of outcome.request.enemyTeam) {
          enemy.stats.hp = Math.max(1, Math.ceil(enemy.stats.hp * 1.2));
          enemy.stats.attack = Math.max(1, Math.floor(enemy.stats.attack * 0.35));
        }
      }
      return done(issueEncounter(save, outcome, 'quest', now));
    }
    case 'planExploreBattle': {
      const { kingdom } = command.args as CommandArgs<'planExploreBattle'>;
      if (!exploreUnlocked(save, kingdom)) return done(fail('PREREQ_LOCKED', '先通关该王国主线'));
      const entry = save.kingdoms[kingdom]!;
      const tier = entry.exploreRun?.tier ?? Math.min(Math.max(entry.exploreTier || 1, 1), maxExploreTier(save));
      if (!entry.exploreRun) {
        const seed = env.seed() >>> 0;
        entry.exploreRun = { id: `explore-${now}-${seed}`, tier, stage: 0, seed };
        entry.exploreTier = tier;
      }
      const run = entry.exploreRun;
      return done(issueEncounter(save, buildBattleRequest(save,
        planExploreEncounter(kingdom, run.tier, exploreBattleSeed(run), run.stage, run.id)), 'explore', now));
    }
    case 'planEventBattle': {
      const { typeId, choice } = command.args as CommandArgs<'planEventBattle'>;
      ensureEventWeek(save, weekStart, typeId);
      const theme = currentEventTheme(weekStart, typeId);
      const hasHero = activeTeam(save)?.members.some((m) => m.kind === 'hero') ?? false;
      const notReady = eventBattleReady(save, theme.type.id, hasHero, choice, weekStart);
      if (notReady) return done(fail('INVALID', notReady));
      const plan = planEventEncounter(save, weekStart, env.seed(), typeId, choice);
      if (!plan || 'ok' in plan) return done(plan ?? fail('INVALID', '当前无法出战'));
      const outcome = buildBattleRequest(save, plan);
      if (!outcome.ok) return done(outcome);
      applyEventBattleModifiers(save, outcome);
      if (outcome.request.playerTeam.length === 0) return done(fail('INVALID', '本轮已无可出战的成员'));
      const invalid = revalidateOutcome(outcome);
      if (invalid) return done(invalid);
      return done(issueEncounter(save, outcome, 'event', now));
    }
    case 'planArenaBattle': {
      const outcome = planArenaBattle(save, env.seed());
      if (!outcome.ok) return done(outcome);
      save.pendingBattle = { mode: 'arena', requestId: outcome.request.requestId, issuedAt: now };
      const ticket: BattleTicket = {
        ok: true, mode: 'arena', request: outcome.request, kingdom: outcome.kingdom,
        source: null, mirror: null, opponents: outcome.opponents,
      };
      return done(ticket);
    }
    case 'planInvasionRevenge':
    case 'planInvasionBattle': {
      let revengeKey: string | undefined;
      let revengeMirror: import('../systems/invasion').InvasionMirror | undefined;
      if (command.type === 'planInvasionRevenge') {
        if (!io.defenseLog) return done(fail('INVALID', '战报同步失败，请稍后重试'));
        ensureInvasionSeason(save, now, weekStart);
        accountDefenseLog(save, io.defenseLog, weekStart);
        effects.reportVp = invasionVpReport(save, now);
        revengeKey = (command.args as CommandArgs<'planInvasionRevenge'>).key;
        const entry = io.defenseLog.entries.find(e => defenseEntryKey(e) === revengeKey);
        const used = save.invasion.defenseProgress.results.find(r => r.key === revengeKey)?.revenge;
        if (!entry || entry.defenderWon || entry.revenge || entry.at < save.createdAt || used) return done(fail('INVALID', '这场记录没有可用的复仇机会'));
        if (!validSnapshot(entry.attackerSnapshot, now)) return done(fail('INVALID', '对方阵容已过期，请挑战其他对手'));
        revengeMirror = mirrorFromEntry({ ...entry.attackerSnapshot, ownerKey: entry.attacker, name: entry.name }, 'normal', `-revenge-${entry.sequence ?? entry.at}`);
      }
      const mirrorId = revengeMirror?.id ?? (command.args as CommandArgs<'planInvasionBattle'>).mirrorId;
      const outcome = planInvasionBattle(save, mirrorId, env.seed(), now, weekStart, revengeMirror);
      if (!outcome.ok) return done(outcome);
      save.pendingBattle = {
        mode: 'invasion', requestId: outcome.request.requestId, issuedAt: now, mirror: structuredClone(outcome.mirror),
        attacker: outcome.attacker, ...(revengeKey ? { revengeKey } : {}),
      };
      if (revengeKey) {
        const row = save.invasion.defenseProgress.results.find(r => r.key === revengeKey);
        if (row) row.revenge = 'pending';
        else save.invasion.defenseProgress.results.push({ key: revengeKey, vpDelta: 0, revenge: 'pending' });
      }
      const ticket: BattleTicket = {
        ok: true, mode: 'invasion', request: outcome.request, kingdom: '入侵战',
        source: null, mirror: outcome.mirror, opponents: [],
      };
      return done(ticket);
    }

    // —— 战斗：结算 ——
    case 'settleBattle':
      return withMaterials(settle(save, (command.args as CommandArgs<'settleBattle'>).result, now, weekStart, todayStart, io, effects, env));
    case 'forfeitPendingBattle':
      return withMaterials(forfeit(save, now, weekStart, todayStart, io, effects, env));

    // —— 馈赠 ——
    case 'claimGift':
      return withMaterials(claimGift(save, (command.args as CommandArgs<'claimGift'>).id, env.seed()));
    case 'claimAllGifts':
      return withMaterials(claimAllGifts(save, env.seed()));

    // —— 每周活动 ——
    case 'abandonTowerRun':
      return withMaterials(abandonTowerRun(save, weekStart));
    case 'eventAction': {
      const { typeId, action } = command.args as CommandArgs<'eventAction'>;
      return withMaterials(eventAction(save, weekStart, typeId, action, env.seed()));
    }
    case 'buyMaterialGoods': {
      const { request, expectedQuote } = command.args as CommandArgs<'buyMaterialGoods'>;
      return withMaterials(buyMaterialGoods(save, request, expectedQuote));
    }
    case 'buyEventGoods': {
      const { goodsId, typeId, expectedPeriodStart } = command.args as CommandArgs<'buyEventGoods'>;
      return withMaterials(buyEventGoods(save, goodsId, weekStart, typeId, now, expectedPeriodStart));
    }

    // —— 入侵 ——
    case 'setInvasionDefense': {
      if (save.hero.level < INVASION.unlockHeroLevel) return done(fail('PREREQ_LOCKED', '入侵尚未解锁'));
      const { index } = command.args as CommandArgs<'setInvasionDefense'>;
      if (!Number.isInteger(index) || index < 0 || index >= save.teams.length) return done(fail('INVALID', '请选择有效队伍'));
      const team = save.teams[index]!;
      const check = validateTeam(save, team);
      if (!check.ok) return done(fail('INVALID', check.issues.map(i => i.message).join('；')));
      ensureInvasionSeason(save, now, weekStart);
      save.invasion.defenseTeam = structuredClone(team);
      const record = defenseRecord(save, now);
      if (!record) return done(fail('INVALID', '防守队伍数据无效'));
      save.invasion.defensePublishPending = true;
      save.invasion.lastPublish = { league: record.league, teamHash: record.teamHash, at: now };
      return done({ ok: true });
    }
    case 'claimInvasionDefense':
    case 'syncInvasionDefense': {
      if (!io.defenseLog) return done(fail('INVALID', '战报同步失败，请稍后重试'));
      ensureInvasionSeason(save, now, weekStart);
      accountDefenseLog(save, io.defenseLog, weekStart);
      effects.reportVp = invasionVpReport(save, now);
      if (defenseRecord(save, now)) save.invasion.defensePublishPending = true;
      if (command.type === 'syncInvasionDefense') return done({ ok: true });
      const reward = { ...save.invasion.defenseProgress.rewards };
      if (reward.gold === 0 && reward.souls === 0 && reward.glory === 0) return done({ ok: true, ...reward });
      earn(save, reward);
      save.stats.goldEarned += reward.gold;
      save.invasion.defenseProgress.rewards = { gold: 0, souls: 0, glory: 0 };
      return done({ ok: true, ...reward });
    }
    case 'syncInvasionSeason':
      ensureInvasionSeason(save, now, weekStart);
      if (save.hero.level >= INVASION.unlockHeroLevel) {
        const team = activeTeam(save);
        if (!save.invasion.defenseTeam && team && validateTeam(save, team).ok) save.invasion.defenseTeam = structuredClone(team);
        const record = defenseRecord(save, now);
        if (record) save.invasion.defensePublishPending = true;
      }
      // 批次过期（跨周/升联赛/首次进入）→ 组新批次落档，客户端据此展示（含真人镜像）
      if (!invasionRosterFresh(save, weekStart)) rebuildInvasionRoster(save, now, weekStart, io.mirrorPool ?? [], env.seed());
      // 周榜：宿主取到了就换新；快照失效又没取到（无共享池）→ 空快照，全人机补位
      if (io.standings || !invasionStandingsFresh(save, weekStart, now)) refreshInvasionStandings(save, now, weekStart, io.standings ?? []);
      return done({ ok: true });
    case 'refreshInvasionOpponents': {
      const r = refreshInvasionOpponents(save, now, weekStart);
      if (r.ok && save.pendingBattle?.mode === 'invasion') save.pendingBattle = null;
      if (r.ok) rebuildInvasionRoster(save, now, weekStart, io.mirrorPool ?? [], env.seed());
      if (r.ok && io.standings) refreshInvasionStandings(save, now, weekStart, io.standings);
      return done(r);
    }
    case 'claimInvasionRank': {
      const { id, expectedWeek } = command.args as CommandArgs<'claimInvasionRank'>;
      ensureInvasionSeason(save, now, weekStart);
      if (expectedWeek !== undefined && expectedWeek !== save.invasion.weekStart) {
        return done(fail('INVALID', '新一周已开始，请刷新官阶页面'));
      }
      return done(claimInvasionRank(save, id));
    }

    // —— 寻宝 ——
    case 'startTreasureHunt':
      return done(beginHunt(save, env.seed()));
    case 'playTreasureHunt': {
      const { from, to } = command.args as CommandArgs<'playTreasureHunt'>;
      return withMaterials(commitMove(save, from, to));
    }

    // —— 开发者命令（runCommand 已按 env.allowDev 拦截） ——
    case 'dev.importSave': {
      const imported = parseSaveJson((command.args as CommandArgs<'dev.importSave'>).json, now);
      imported.pendingBattle = null;
      return { result: { ok: true }, save: rebase(imported, save) };
    }
    case 'dev.resetToDemo':
      return { result: { ok: true }, save: rebase(createFreshSave('demo', now), save) };
    case 'dev.setBattleDebug': {
      save.settings.battleDebug = (command.args as CommandArgs<'dev.setBattleDebug'>).on === true;
      return done(save.settings.battleDebug);
    }
    case 'dev.collectionModifier': {
      const { action } = command.args as CommandArgs<'dev.collectionModifier'>;
      const r = action.kind === 'unlock-kingdom'
        ? unlockKingdomTroops(save, action.kingdom)
        : action.kind === 'restore-real'
          ? restoreRealCollection(save)
          : restoreInitialCollection(save);
      return done(r);
    }
  }
  const unknown: never = command;
  return done(fail('INVALID', `未知命令 ${(unknown as { type: string }).type}`));
}

/** 整档替换时沿用旧档的 revision 链（乐观锁不能倒退） */
function rebase(next: MetaSave, prev: MetaSave): MetaSave {
  next.revision = prev.revision;
  return next;
}

// ---------------------------------------------------------------------------
// 战斗票
// ---------------------------------------------------------------------------

function issueEncounter(
  save: MetaSave,
  outcome: BridgeOutcome | MetaFailure,
  mode: 'quest' | 'explore' | 'event',
  now: number,
): BattleTicket | MetaFailure {
  if (!outcome.ok) return outcome;
  // A retry keeps its enemy seed, but must never reuse a consumed ticket identity.
  if (outcome.plan.source.kind === 'explore') outcome.request.requestId += `-r${save.revision + 1}`;
  const enemies: Record<string, EncounterEnemy> = {};
  for (const [id, enemy] of outcome.enemyByExternalId) enemies[id] = enemy;
  save.pendingBattle = {
    mode: 'encounter',
    requestId: outcome.request.requestId,
    issuedAt: now,
    plan: structuredClone(outcome.plan),
    enemies,
  };
  return {
    ok: true,
    mode,
    request: outcome.request,
    kingdom: outcome.plan.kingdom,
    source: outcome.plan.source,
    mirror: null,
    opponents: [],
  };
}

/**
 * 防「刷新重来」：开打后没交结果就丢票 = 认输。
 * 有代价的战斗（竞技场败场、入侵掉 VP、活动/登塔收尾）按败北走正常结算；
 * 任务/探索无门票也无败北惩罚，直接作废（不发战败保底，避免刷保底）。
 */
function forfeit(
  save: MetaSave, now: number, weekStart: number, todayStart: number,
  io: CommandIo = {}, effects: CommandEffects = {}, env?: ServerEnv,
): ForfeitResult | MetaFailure {
  const pending = save.pendingBattle;
  if (!pending) return { ok: true, outcome: 'none', settlement: null };
  if (pending.mode === 'encounter' && pending.plan.source.kind !== 'event') {
    advanceExploreRun(save, pending.plan.kingdom, pending.plan.source, false);
    save.pendingBattle = null;
    return { ok: true, outcome: 'discarded', settlement: null };
  }
  const surrender: BattleResult = {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    // 活动结算按 battleId 去重，与出战请求保持一致
    battleId: pending.mode === 'encounter' ? `meta-${pending.plan.seed}` : pending.requestId,
    requestId: pending.requestId,
    rulesetVersion: RULESET_VERSION,
    seed: 0,
    winner: 'enemy',
    endReason: 'surrender',
    turns: 0,
    combatants: [],
    defeatedExternalIds: [],
    summonedCount: 0,
    actionLogDigest: 'forfeit',
    eventSummary: [],
  };
  const settlement = settle(save, surrender, now, weekStart, todayStart, io, effects, env);
  if (!settlement.ok) return settlement;
  return { ok: true, outcome: 'defeat', settlement };
}

/** 结算只认当前票：requestId / 规则版本对不上一律拒绝，结算后票作废 */
function settle(
  save: MetaSave,
  result: BattleResult,
  now: number,
  weekStart: number,
  todayStart: number,
  io: CommandIo = {},
  effects: CommandEffects = {},
  env?: ServerEnv,
): CommandResult<'settleBattle'> {
  const pending: PendingBattle | null = save.pendingBattle;
  if (!pending) return fail('INVALID', '没有待结算的战斗（已结算或已过期）');
  if (!result || typeof result !== 'object' || result.requestId !== pending.requestId) {
    return fail('INVALID', '战斗结果与当前出战票不符');
  }
  if (result.rulesetVersion !== RULESET_VERSION) return fail('INVALID', '战斗规则版本不一致，请刷新页面');
  if (pending.mode === 'encounter' && !exploreRunMatches(save, pending.plan.kingdom, pending.plan.source)) {
    return fail('INVALID', '探索轮次已结束，请返回探索页面');
  }
  save.pendingBattle = null;

  if (pending.mode === 'arena') {
    const settled = settleArenaBattle(save, result);
    return settled.ok ? { ok: true, kind: 'arena', settled } : settled;
  }
  if (pending.mode === 'invasion') {
    const settled = settleInvasionBattle(save, result, pending.mirror.id, now, weekStart, todayStart, pending.mirror);
    if (!settled.ok) return settled;
    ensureInvasionSeason(save, now, weekStart);
    const record = afterInvasionSettle(save, pending, result, now, weekStart, io.mirrorPool, env?.seed() ?? now);
    const configured = defenseRecord(save, now);
    if (configured) save.invasion.defensePublishPending = true;
    else if (!save.invasion.defenseTeam && record) effects.publishMirror = record;
    const defender = pending.mirror.player?.ownerKey;
    if (defender) save.invasion.defenseOutbox.push({
      id: `${pending.requestId}:${pending.issuedAt}`,
      defender, at: now, defenderWon: !settled.victory,
      ...((configured ?? pending.attacker) ? { attackerSnapshot: configured ?? pending.attacker } : {}),
      ...(pending.revengeKey ? { revenge: true } : {}),
      surrendered: result.endReason === 'surrender', frenzy: pending.mirror.frenzy,
    });
    if (pending.revengeKey) {
      const row = save.invasion.defenseProgress.results.find(r => r.key === pending.revengeKey);
      if (row) row.revenge = settled.victory ? 'won' : 'lost';
    }
    // 每场都上报（含投降/丢票：它们同样改变 VP）
    effects.reportVp = invasionVpReport(save, now);
    return { ok: true, kind: 'invasion', settled, mirror: pending.mirror };
  }
  const enemyByExternalId = new Map(Object.entries(pending.enemies));
  const detail = applySettlement(save, result, { plan: pending.plan, enemyByExternalId, todayStart });
  // 新手试炼获胜 → 引导进入「领取馈赠」；战败留在本步重打
  const source = pending.plan.source;
  if (source.kind === 'quest' && source.tutorial && detail.victory && save.onboarding.step === 'battle') {
    save.onboarding.step = 'gift';
  }
  return { ok: true, kind: 'encounter', detail, source, kingdom: pending.plan.kingdom };
}

// ---------------------------------------------------------------------------
// 「有新素材」提示
// ---------------------------------------------------------------------------

function snapshotMaterials(save: MetaSave): Materials {
  return {
    ingots: { ...save.materials.ingots },
    forgeScrolls: save.materials.forgeScrolls,
    traitstones: { ...save.materials.traitstones },
    treasureMaps: save.materials.treasureMaps,
  };
}

function markMaterialGains(save: MetaSave, before: Materials): void {
  const after = save.materials;
  const grew = (a: Record<string, number>, b: Record<string, number>): boolean =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].some((k) => (b[k] ?? 0) > (a[k] ?? 0));
  if (
    grew(before.ingots, after.ingots)
    || grew(before.traitstones, after.traitstones)
    || after.forgeScrolls > before.forgeScrolls
    || after.treasureMaps > before.treasureMaps
  ) {
    save.materialsUnread = true;
  }
}
