import { setWishlist, setPursuitTarget } from '../systems/wishlist';
/**
 * mock 网关：SaveStore(localStorage, 双槽防损) + 本地纯 systems。
 *
 * 职责边界：唯一持有可变 MetaSave 的地方。每个写方法 = 应用纯系统函数 →
 * 落盘 → 返回 { result, save }。将来切 D1 时换实现类，接口不动。
 */
import { weekStartOf } from './clock';
import type { InvasionMirror } from '../systems/invasion';
import type { BattleResult } from '@session/index';
import { SaveStore, type StorageLike } from '../state/save';
import type { Materials, MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { starterTroopIds, STARTING_KINGDOM } from '../data/economy';
import { claimGift, claimAllGifts } from '../systems/gifts';
import {
  restoreInitialCollection,
  restoreRealCollection,
  unlockKingdomTroops,
} from '../systems/collectionModifier';
import type { EventTypeId } from '../data/events';
import { newSave } from '../state/schema';
import { levelUp, ascend, unlockTrait, decompose, getRecord } from '../systems/troopProgress';
import { setTeamPreset } from '../systems/teamRules';
import { claimWeapon, equipClass, equipWeapon, forgeCatalogWeapon as forgeCatalogWeaponOp } from '../systems/hero';
import { clearTalent, pickTalent, unlockHeroTrait } from '../systems/talents';
import { pickManaMastery } from '../systems/manaMastery';
import { openGemChest, openGoldChest, openGloryChest } from '../systems/gacha';
import { upgradeKingdom, setExploreTier, exploreUnlocked, setHomeKingdom } from '../systems/kingdomOps';
import { collectAllTribute, collectTribute } from '../systems/tribute';
import type { SettlementContext } from '../systems/settlement';
import { temperWeaponOnSave } from '../systems/forgeOps';
import { planEventEncounter, currentEventTheme, ensureEventWeek, eventBattleReady, buyEventGoods, applyEventBattleModifiers, abandonTowerRun, eventAction } from '../systems/events';
import { planInvasionBattle, settleInvasionBattle, refreshInvasionOpponents, claimInvasionRank, ensureInvasionSeason } from '../systems/invasion';
import { activeTeam } from '../systems/teamRules';
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
import { questNodeUnlocked, planQuestEncounter, planExploreEncounter, planTutorialEncounter } from '../systems/encounter';
import { buildBattleRequest } from '../systems/battleBridge';
import { applySettlement } from '../systems/settlement';
import { beginHunt, commitMove } from '../systems/treasureHunt';
import { buildDemoSave } from './demo';
import type {
  GatewaySnapshot,
  GatewayUpdate,
  MetaGateway,
  TeamInput,
  TributeCollect,
  ArenaForfeit,
} from './types';

/** 无 localStorage 环境（测试/SSR 兜底）的内存 StorageLike */
export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

export class MockGateway implements MetaGateway {
  readonly backend = 'mock' as const;
  private readonly store: SaveStore;
  private save!: MetaSave;
  private pendingInvasion: { requestId: string; mirrorId: string; weekStart: number; mirror: InvasionMirror } | null = null;

  constructor(storage: StorageLike = typeof localStorage !== 'undefined' ? localStorage : memoryStorage()) {
    this.store = new SaveStore(storage);
  }

  // —— 生命周期 ——

  async load(): Promise<GatewaySnapshot> {
    this.pendingInvasion = null;
    const loaded = this.store.load();
    if (!loaded.fresh) {
      this.save = loaded.save;
      return { save: this.save, fresh: false, warning: loaded.warning };
    }
    // 无存档/双槽皆损：铺演示档（外壳首次进入即有完整可玩进度）
    this.save = buildDemoSave(Date.now());
    this.store.persist(this.save);
    const warning = loaded.warning ? `${loaded.warning}；已改铺演示进度` : null;
    return { save: this.save, fresh: true, warning };
  }

  nextSeed(): number {
    const c = globalThis.crypto;
    if (typeof c?.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return buf[0]! >>> 0;
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  current(): MetaSave {
    return this.save;
  }

  async markMaterialsSeen() {
    this.save.materialsUnread = false;
    this.persist();
    return { result: false, save: this.save };
  }

  // —— 系统 ——

  exportSaveJson(): string {
    return this.store.exportJson(this.save);
  }

  async importSaveJson(text: string): Promise<GatewaySnapshot> {
    this.pendingInvasion = null;
    this.save = this.store.importJson(text); // 结构问题抛 MetaSaveError
    this.store.persist(this.save);
    return { save: this.save, fresh: false, warning: null };
  }

  async resetToDemo(): Promise<GatewaySnapshot> {
    this.pendingInvasion = null;
    this.save = buildDemoSave(Date.now());
    this.store.persist(this.save);
    return { save: this.save, fresh: true, warning: null };
  }

  async resetToNewGame(): Promise<GatewaySnapshot> {
    this.save = newSave({ now: Date.now(), starterTroopIds: starterTroopIds(), tutorial: true });
    this.store.persist(this.save);
    return { save: this.save, fresh: true, warning: null };
  }

  async setBattleDebug(on: boolean): Promise<GatewayUpdate<boolean>> {
    this.save.settings.battleDebug = on;
    this.persist();
    return { result: on, save: this.save };
  }

  async applyCollectionModifier(action: { kind: 'unlock-kingdom'; kingdom: string } | { kind: 'restore-real' } | { kind: 'restore-initial' }) {
    const result = action.kind === 'unlock-kingdom'
      ? unlockKingdomTroops(this.save, action.kingdom)
      : action.kind === 'restore-real'
        ? restoreRealCollection(this.save)
        : restoreInitialCollection(this.save);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  // —— 养成 ——

  async levelUpTroop(troopId: number) {
    const rec = getRecord(this.save, troopId);
    if (!rec) return { result: fail('NOT_OWNED', '尚未拥有该部队') as MetaFailure, save: this.save };
    const result = levelUp(this.save, troopId, rec.level + 1);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async ascendTroop(troopId: number) {
    const result = ascend(this.save, troopId);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async unlockTroopTrait(troopId: number, slot: number) {
    const result = unlockTrait(this.save, troopId, slot);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async decomposeTroop(troopId: number) {
    const result = decompose(this.save, troopId);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async setTroopLocked(troopId: number, locked: boolean) {
    const rec = getRecord(this.save, troopId);
    if (!rec) return { result: fail('NOT_OWNED', '尚未拥有该部队') as MetaFailure, save: this.save };
    rec.locked = locked;
    this.persist();
    return { result: locked, save: this.save };
  }

  // —— 编队 ——

  async saveTeam(index: number, team: TeamInput) {
    const result = setTeamPreset(this.save, index, team);
    this.persist();
    return { result, save: this.save };
  }

  async activateTeam(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.save.teams.length) {
      return { result: fail('INVALID', '预设队序号不存在') as MetaFailure, save: this.save };
    }
    this.save.activeTeamIndex = index;
    this.persist();
    return { result: index, save: this.save };
  }

  async deleteTeam(index: number) {
    if (this.save.teams.length <= 1) {
      return { result: fail('INVALID', '至少保留一支预设队') as MetaFailure, save: this.save };
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.save.teams.length) {
      return { result: fail('INVALID', '预设队序号不存在') as MetaFailure, save: this.save };
    }
    this.save.teams.splice(index, 1);
    if (this.save.activeTeamIndex >= this.save.teams.length) this.save.activeTeamIndex = 0;
    this.persist();
    return { result: this.save.activeTeamIndex, save: this.save };
  }

  // —— 主角 ——

  async equipHeroClass(classId: string) {
    const result = equipClass(this.save, classId);
    const normalized = result.ok ? result.classId : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async forgeCatalogWeapon(weaponId: string) {
    const result = forgeCatalogWeaponOp(this.save, weaponId);
    const normalized = result.ok ? result.weaponId : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async claimHeroWeapon(weaponId: string) {
    const result = claimWeapon(this.save, weaponId);
    const normalized = result.ok ? result.weaponId : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async equipHeroWeapon(weaponId: string) {
    const result = equipWeapon(this.save, weaponId);
    const normalized = result.ok ? result.weaponId : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  /** 天赋选取（每档三树选一，可随时改配——v2 官方口径） */
  async pickHeroTalent(classId: string, tierIndex: number, talentCode: string) {
    const result = pickTalent(this.save, classId, tierIndex, talentCode);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async clearHeroTalent(classId: string, tierIndex: number) {
    const result = clearTalent(this.save, classId, tierIndex);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  /** 职业专属特质槽解锁（金+魂，费用同部队特质槽） */
  async unlockHeroTrait(slot: number) {
    const result = unlockHeroTrait(this.save, slot);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async pickManaMastery(color: string) {
    const result = pickManaMastery(this.save, color);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async setWishlist(ids: readonly number[]) {
    const result = setWishlist(this.save, ids);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }
  async setPursuitTarget(id: number | null) {
    const result = setPursuitTarget(this.save, id);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  // —— 宝箱 ——

  /** 开箱：count 为原子批量（gem/glory 只接 1|10，gold 接 1~10），见 types.openChest */
  async openChest(kind: 'gem' | 'gold' | 'glory', count = 1) {
    const before = this.materialSnapshot();
    const seed = this.nextSeed();
    const result =
      kind === 'gem' ? openGemChest(this.save, seed, count)
      : kind === 'glory' ? openGloryChest(this.save, seed, count)
      : openGoldChest(this.save, seed, count);
    if (result.ok) {
      this.markMaterialGains(before);
      this.persist();
    }
    return { result, save: this.save };
  }

  // —— 王国经营 ——

  async upgradeKingdomLevel(kingdom: string) {
    const result = upgradeKingdom(this.save, kingdom);
    const normalized = result.ok ? result.level : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async collectKingdomTribute(kingdom: string, now: number) {
    const { ok, collected } = collectTribute(this.save, kingdom, now);
    const result: TributeCollect = collected;
    if (ok) this.persist();
    return { result, save: this.save };
  }

  async collectAllTribute(now: number) {
    const { haul } = collectAllTribute(this.save, now);
    this.persist();
    return { result: haul, save: this.save };
  }

  async setHomeKingdom(kingdom: string | null) {
    const result = setHomeKingdom(this.save, kingdom);
    const normalized = result.ok ? result.home : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async setKingdomExploreTier(kingdom: string, tier: number) {
    const result = setExploreTier(this.save, kingdom, tier);
    const normalized = result.ok ? result.tier : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  // —— 竞技场 ——

  async enterArena(now: number, weekStart: number) {
    const result = entryArena(this.save, this.nextSeed(), now, weekStart);
    const normalized = result.ok ? result.free : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async pickDraftCard(troopId: number) {
    const result = pickDraftCard(this.save, troopId);
    if (!result.ok) return { result, save: this.save };
    this.persist();
    const state = currentDraftChoices(this.save);
    return {
      result:
        state ?? { round: this.save.arena.activeDraft?.picked.length ?? 0, done: true, options: [] },
      save: this.save,
    };
  }

  async arrangeDraftTeam(order: number[]) {
    const result = arrangeArenaTeam(this.save, order);
    const normalized = result.ok ? result.picked : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async startDraftBattles() {
    const result = startArenaBattles(this.save);
    const normalized = result.ok ? true : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async forfeitDraft() {
    const result = forfeitArena(this.save);
    const normalized: ArenaForfeit | MetaFailure = result.ok
      ? { wins: result.wins, rewards: result.rewards }
      : result;
    if (result.ok) this.persist();
    return { result: normalized, save: this.save };
  }

  async planArenaBattle() {
    return planArenaBattle(this.save, this.nextSeed());
  }

  async settleArenaBattle(result: BattleResult) {
    const settled = settleArenaBattle(this.save, result);
    if (settled.ok) this.persist();
    return { result: settled, save: this.save };
  }

  // —— 战斗闭环 ——

  async planQuestBattle(kingdom: string, node: number) {
    if (!questNodeUnlocked(this.save, kingdom, node)) {
      return fail('LOCKED', `「${kingdom}」第 ${node} 关尚未解锁：只能打下一关`);
    }
    const plan = planQuestEncounter(kingdom, node, this.nextSeed());
    return buildBattleRequest(this.save, plan);
  }

  /** 新手引导试炼战：两名半血半攻的 Lv.1 杂兵 */
  async planTutorialBattle() {
    if (this.save.onboarding.step !== 'battle') return fail('INVALID', '新手试炼已完成');
    const plan = planTutorialEncounter(STARTING_KINGDOM, this.nextSeed());
    const outcome = buildBattleRequest(this.save, plan);
    if (outcome.ok) {
      for (const enemy of outcome.request.enemyTeam) {
        enemy.stats.hp = Math.max(1, Math.ceil(enemy.stats.hp * 0.5));
        enemy.stats.attack = Math.max(1, Math.floor(enemy.stats.attack * 0.5));
      }
    }
    return outcome;
  }

  async claimGift(id: string) {
    const result = claimGift(this.save, id, this.nextSeed());
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async claimAllGifts() {
    const result = claimAllGifts(this.save, this.nextSeed());
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async planExploreBattle(kingdom: string) {
    if (!exploreUnlocked(this.save, kingdom)) {
      return fail('PREREQ_LOCKED', '先通关该王国主线');
    }
    const stored = this.save.kingdoms[kingdom]?.exploreTier ?? 0;
    const tier = stored >= 1 ? stored : 1;
    const plan = planExploreEncounter(kingdom, tier, this.nextSeed());
    return buildBattleRequest(this.save, plan);
  }

  async applyBattleSettlement(result: BattleResult, ctx: SettlementContext) {
    const before = this.materialSnapshot();
    const detail = applySettlement(this.save, result, ctx);
    // 新手试炼获胜 → 引导进入「领取馈赠」；战败留在本步重打
    if (ctx.plan.source.kind === 'quest' && ctx.plan.source.tutorial && detail.victory && this.save.onboarding.step === 'battle') {
      this.save.onboarding.step = 'gift';
    }
    this.markMaterialGains(before);
    this.persist();
    return { result: detail, save: this.save };
  }

  // —— 淬炼（素材批 2026-09-19） ——

  async temperWeapon(weaponId: string) {
    const result = temperWeaponOnSave(this.save, weaponId);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  // —— 每周活动（素材批 2026-09-19） ——

  async planEventBattle(_now: number, weekStart: number, typeId: EventTypeId, choice?: string) {
    ensureEventWeek(this.save, weekStart, typeId);
    const theme = currentEventTheme(weekStart, typeId);
    const team = activeTeam(this.save);
    const hasHero = team?.members.some((m) => m.kind === 'hero') ?? false;
    const notReady = eventBattleReady(this.save, theme.type.id, hasHero, choice, weekStart);
    if (notReady) return fail('INVALID', notReady);
    const beforeWeek = structuredClone(this.save.eventWeeks[typeId]!);
    const plan = planEventEncounter(this.save, weekStart, this.nextSeed(), typeId, choice);
    if (!plan || 'ok' in plan) {
      this.save.eventWeeks[typeId] = beforeWeek;
      return plan as MetaFailure;
    }
    const outcome = buildBattleRequest(this.save, plan);
    if (outcome.ok) {
      applyEventBattleModifiers(this.save, outcome);
      if (outcome.request.playerTeam.length === 0) {
        this.save.eventWeeks[typeId] = beforeWeek;
        return fail('INVALID', '本轮已无可出战的成员');
      }
      this.persist();
    } else this.save.eventWeeks[typeId] = beforeWeek;
    return outcome;
  }

  async eventAction(_now: number, weekStart: number, typeId: EventTypeId, action: string) {
    const before = this.materialSnapshot();
    const result = eventAction(this.save, weekStart, typeId, action, this.nextSeed());
    if (result.ok) {
      this.markMaterialGains(before);
      this.persist();
    }
    return { result, save: this.save };
  }

  async abandonTowerRun(weekStart: number) {
    const before = this.materialSnapshot();
    const result = abandonTowerRun(this.save, weekStart);
    if (result.ok) {
      this.markMaterialGains(before);
      this.persist();
    }
    return { result, save: this.save };
  }

  async buyEventGoods(goodsId: string, now: number, weekStart: number, typeId: EventTypeId, expectedPeriodStart?: number) {
    const before = this.materialSnapshot();
    const result = buyEventGoods(this.save, goodsId, weekStart, typeId, now, expectedPeriodStart);
    if (result.ok) {
      this.markMaterialGains(before);
      this.persist();
    }
    return { result, save: this.save };
  }

  // —— 入侵 PvP（素材批 2026-09-19） ——

  async syncInvasionSeason(now: number, weekStart: number) {
    ensureInvasionSeason(this.save, now, weekStart);
    this.persist();
    return { result: { ok: true as const }, save: this.save };
  }

  async refreshInvasionOpponents(now: number, weekStart: number) {
    const result = refreshInvasionOpponents(this.save, now, weekStart);
    if (result.ok) { this.pendingInvasion = null; this.persist(); }
    return { result, save: this.save };
  }

  async claimInvasionRank(id: string, now = Date.now(), expectedWeek?: number) {
    const week = weekStartOf(now);
    ensureInvasionSeason(this.save, now, week);
    this.persist();
    if (expectedWeek !== undefined && expectedWeek !== this.save.invasion.weekStart) {
      return { result: fail('INVALID', '新一周已开始，请刷新官阶页面'), save: this.save };
    }
    const result = claimInvasionRank(this.save, id);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async planInvasionBattle(mirrorId: string, now: number, weekStart: number) {
    const plan = planInvasionBattle(this.save, mirrorId, this.nextSeed(), now, weekStart);
    this.pendingInvasion = plan.ok ? { requestId: plan.request.requestId, mirrorId, weekStart, mirror: structuredClone(plan.mirror) } : null;
    this.persist();
    return plan;
  }

  async settleInvasionBattle(result: BattleResult, mirrorId: string, now: number, weekStart: number, todayStart: number) {
    const pending = this.pendingInvasion;
    if (!pending || pending.requestId !== result.requestId || pending.mirrorId !== mirrorId) {
      return { result: fail('INVALID', '战斗已结算或对手已刷新'), save: this.save };
    }
    const before = this.materialSnapshot();
    // Preserve the launched roster; credit victories to the settlement week, never roll state backward.
    const settled = settleInvasionBattle(this.save, result, mirrorId, now, weekStart, todayStart, pending.mirror);
    if (settled.ok) {
      this.pendingInvasion = null;
      ensureInvasionSeason(this.save, now, weekStart);
      this.markMaterialGains(before);
      this.persist();
    }
    return { result: settled, save: this.save };
  }

  async startTreasureHunt(seed: number) {
    const result = beginHunt(this.save, seed);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async playTreasureHunt(from: number, to: number) {
    const before = this.materialSnapshot();
    const result = commitMove(this.save, from, to);
    if (result.ok) {
      this.markMaterialGains(before);
      this.persist();
    }
    return { result, save: this.save };
  }

  // —— 内部 ——

  private materialSnapshot(): Materials {
    return {
      ingots: { ...this.save.materials.ingots },
      forgeScrolls: this.save.materials.forgeScrolls,
      traitstones: { ...this.save.materials.traitstones },
      treasureMaps: this.save.materials.treasureMaps,
    };
  }

  private markMaterialGains(before: Materials): void {
    const after = this.save.materials;
    const keys = new Set([...Object.keys(before.ingots), ...Object.keys(after.ingots)]);
    for (const key of keys) {
      if ((after.ingots[key] ?? 0) > (before.ingots[key] ?? 0)) {
        this.save.materialsUnread = true;
        return;
      }
    }
    if (after.forgeScrolls > before.forgeScrolls || after.treasureMaps > before.treasureMaps) {
      this.save.materialsUnread = true;
      return;
    }
    const stoneKeys = new Set([...Object.keys(before.traitstones), ...Object.keys(after.traitstones)]);
    for (const key of stoneKeys) {
      if ((after.traitstones[key] ?? 0) > (before.traitstones[key] ?? 0)) {
        this.save.materialsUnread = true;
        return;
      }
    }
  }

  private persist(): void {
    this.store.persist(this.save);
  }
}
