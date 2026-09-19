/**
 * mock 网关：SaveStore(localStorage, 双槽防损) + 本地纯 systems。
 *
 * 职责边界：唯一持有可变 MetaSave 的地方。每个写方法 = 应用纯系统函数 →
 * 落盘 → 返回 { result, save }。将来切 D1 时换实现类，接口不动。
 */
import type { BattleResult } from '@session/index';
import { SaveStore, type StorageLike } from '../state/save';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { starterTroopIds } from '../data/economy';
import { newSave } from '../state/schema';
import { levelUp, ascend, unlockTrait, decompose, getRecord } from '../systems/troopProgress';
import { setTeamPreset } from '../systems/teamRules';
import { equipClass, equipWeapon, forgeCatalogWeapon as forgeCatalogWeaponOp } from '../systems/hero';
import { clearTalent, pickTalent, unlockHeroTrait } from '../systems/talents';
import { openGemChest, openGoldChest, openGloryChest } from '../systems/gacha';
import { upgradeKingdom, setExploreTier } from '../systems/kingdomOps';
import { collectTribute } from '../systems/tribute';
import type { SettlementContext } from '../systems/settlement';
import { temperWeaponOnSave } from '../systems/forgeOps';
import { planEventEncounter, currentEventTheme, eventBattleReady, buyEventGoods, applyEventBattleModifiers, abandonTowerRun } from '../systems/events';
import { planInvasionBattle, settleInvasionBattle } from '../systems/invasion';
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
import { questNodeUnlocked, planQuestEncounter, planExploreEncounter } from '../systems/encounter';
import { buildBattleRequest } from '../systems/battleBridge';
import { applySettlement } from '../systems/settlement';
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

  constructor(storage: StorageLike = typeof localStorage !== 'undefined' ? localStorage : memoryStorage()) {
    this.store = new SaveStore(storage);
  }

  // —— 生命周期 ——

  async load(): Promise<GatewaySnapshot> {
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

  // —— 系统 ——

  exportSaveJson(): string {
    return this.store.exportJson(this.save);
  }

  async importSaveJson(text: string): Promise<GatewaySnapshot> {
    this.save = this.store.importJson(text); // 结构问题抛 MetaSaveError
    this.store.persist(this.save);
    return { save: this.save, fresh: false, warning: null };
  }

  async resetToDemo(): Promise<GatewaySnapshot> {
    this.save = buildDemoSave(Date.now());
    this.store.persist(this.save);
    return { save: this.save, fresh: true, warning: null };
  }

  async resetToNewGame(): Promise<GatewaySnapshot> {
    this.save = newSave({ now: Date.now(), starterTroopIds: starterTroopIds() });
    this.store.persist(this.save);
    return { save: this.save, fresh: true, warning: null };
  }

  async setBattleDebug(on: boolean): Promise<GatewayUpdate<boolean>> {
    this.save.settings.battleDebug = on;
    this.persist();
    return { result: on, save: this.save };
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

  // —— 宝箱 ——

  async openChest(kind: 'gem' | 'gold' | 'glory', count: 1 | 10 = 1) {
    const seed = this.nextSeed();
    const result =
      kind === 'gem' ? openGemChest(this.save, seed, count)
      : kind === 'glory' ? openGloryChest(this.save, seed)
      : openGoldChest(this.save, seed);
    if (result.ok) this.persist();
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

  async planExploreBattle(kingdom: string) {
    const tier = this.save.kingdoms[kingdom]?.exploreTier ?? 1;
    const plan = planExploreEncounter(kingdom, tier, this.nextSeed());
    return buildBattleRequest(this.save, plan);
  }

  async applyBattleSettlement(result: BattleResult, ctx: SettlementContext) {
    const detail = applySettlement(this.save, result, ctx);
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

  async planEventBattle(_now: number, weekStart: number) {
    const theme = currentEventTheme(weekStart);
    const team = activeTeam(this.save);
    const hasHero = team?.members.some((m) => m.kind === 'hero') ?? false;
    const notReady = eventBattleReady(this.save, theme.type.id, hasHero);
    if (notReady) return fail('INVALID', notReady);
    const plan = planEventEncounter(this.save, weekStart, this.nextSeed());
    const outcome = buildBattleRequest(this.save, plan);
    // 活动玩法对面板的修改（阵营 buff / 塔层减员残血）：构建后、启动前应用
    if (outcome.ok) applyEventBattleModifiers(this.save, outcome);
    return outcome;
  }

  async abandonTowerRun(weekStart: number) {
    const result = abandonTowerRun(this.save, weekStart);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  async buyEventGoods(goodsId: string, _now: number, weekStart: number) {
    const result = buyEventGoods(this.save, goodsId, weekStart);
    if (result.ok) this.persist();
    return { result, save: this.save };
  }

  // —— 入侵 PvP（素材批 2026-09-19） ——

  async planInvasionBattle(mirrorId: string, now: number, weekStart: number) {
    return planInvasionBattle(this.save, mirrorId, this.nextSeed(), now, weekStart);
  }

  async settleInvasionBattle(result: BattleResult, mirrorId: string, now: number, weekStart: number, todayStart: number) {
    const settled = settleInvasionBattle(this.save, result, mirrorId, now, weekStart, todayStart);
    if (settled.ok) this.persist();
    return { result: settled, save: this.save };
  }

  // —— 内部 ——

  private persist(): void {
    this.store.persist(this.save);
  }
}
