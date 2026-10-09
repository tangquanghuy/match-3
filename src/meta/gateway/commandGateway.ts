import type { RegionalAction, RegionalPlanArgs } from '../systems/regionalPvp';
import type { MaterialShopRequest } from '../systems/materialShop';
/**
 * 命令网关：把 MetaGateway 的每个方法翻译成一条命令，经 MetaTransport 送到权威核心。
 * 客户端只保存权威存档的副本（current()），从不自己改存档。
 */
import type { BattleResult } from '@session/contract';
import { MetaSaveError, type StorageLike } from '../state/save';
import { applyPatch } from '../state/records';
import type { MetaSave } from '../state/schema';
import type { EventTypeId } from '../data/events';
import type { MetaFailure } from '../types';
import type {
  CommandArgs,
  CommandResult,
  CommandType,
  CollectionModifierAction,
  MetaCommand,
  TeamInput,
} from '../server/protocol';
import { LocalTransport, type LocalTransportOptions, type MetaTransport } from './transport';
import type { GatewaySnapshot, GatewayUpdate, MetaDevTools, MetaGateway } from './types';

export class CommandGateway implements MetaGateway {
  readonly backend: 'local' | 'remote';
  readonly dev: MetaDevTools | null;
  private save: MetaSave | null = null;
  /** serverNow - Date.now()：展示用时钟的校准量 */
  private skew = 0;

  constructor(private readonly transport: MetaTransport) {
    this.backend = transport.kind;
    this.dev = transport.allowDev ? this.devTools() : null;
  }

  // —— 生命周期 ——

  async load(): Promise<GatewaySnapshot> {
    const reply = await this.transport.load();
    this.save = reply.save;
    this.calibrate(reply.serverNow);
    return { save: reply.save, fresh: reply.fresh, warning: reply.warning };
  }

  /** 操作回执/网络恢复用的只读同步，与页面启动时放弃旧战斗分开。 */
  async sync(): Promise<GatewaySnapshot> {
    const reply = await this.transport.load({ preservePendingBattle: true });
    if (!this.save || reply.save.revision >= this.save.revision) {
      this.save = reply.save;
      this.calibrate(reply.serverNow);
    }
    return { save: this.current(), fresh: reply.fresh, warning: reply.warning };
  }

  current(): MetaSave {
    if (!this.save) throw new Error('Meta 网关尚未 load()');
    return this.save;
  }

  now(): number {
    return Date.now() + this.skew;
  }

  exportSaveJson(): string {
    return JSON.stringify(this.current());
  }

  // —— 系统 ——

  regionalAction(args: RegionalAction) { return this.cmd('regionalAction', args); }
  planRegionalBattle(args: RegionalPlanArgs) { return this.plan('planRegionalBattle', args); }
  markMaterialsSeen() { return this.cmd('markMaterialsSeen', {}); }
  readMail(id: string) { return this.cmd('readMail', { id }); }
  claimMail(id: string) { return this.cmd('claimMail', { id }); }
  claimAllMail() { return this.cmd('claimAllMail', {}); }
  chooseMailMythic(id: string, troopId: number) { return this.cmd('chooseMailMythic', { id, troopId }); }
  markMapSeen(level: number) { return this.cmd('markMapSeen', { level }); }
  createCharacter(input: import('../state/character').CreateCharacterInput) { return this.cmd('createCharacter', input); }
  setCharacterPortrait(portrait: string) { return this.cmd('setCharacterPortrait', { portrait }); }

  async resetToNewGame(): Promise<GatewaySnapshot> {
    const { save } = await this.cmd('resetToNewGame', {});
    return { save, fresh: true, warning: null };
  }

  // —— 养成 ——

  levelUpTroop(troopId: number, targetLevel?: number) { return this.cmd('levelUpTroop', { troopId, targetLevel }); }
  ascendTroop(troopId: number) { return this.cmd('ascendTroop', { troopId }); }
  unlockTroopTrait(troopId: number, slot: number) { return this.cmd('unlockTroopTrait', { troopId, slot }); }
  decomposeTroop(troopId: number) { return this.cmd('decomposeTroop', { troopId }); }
  setTroopLocked(troopId: number, locked: boolean) { return this.cmd('setTroopLocked', { troopId, locked }); }
  setTroopFavorite(troopId: number, favorite: boolean) { return this.cmd('setTroopFavorite', { troopId, favorite }); }

  // —— 编队 ——

  saveTeam(index: number, team: TeamInput) { return this.cmd('saveTeam', { index, team }); }
  activateTeam(index: number) { return this.cmd('activateTeam', { index }); }
  deleteTeam(index: number) { return this.cmd('deleteTeam', { index }); }

  // —— 主角 ——

  equipHeroClass(classId: string) { return this.cmd('equipHeroClass', { classId }); }
  equipHeroWeapon(weaponId: string) { return this.cmd('equipHeroWeapon', { weaponId }); }
  forgeCatalogWeapon(weaponId: string) { return this.cmd('forgeCatalogWeapon', { weaponId }); }
  claimHeroWeapon(weaponId: string) { return this.cmd('claimHeroWeapon', { weaponId }); }
  pickHeroTalent(classId: string, tierIndex: number, talentCode: string) {
    return this.cmd('pickHeroTalent', { classId, tierIndex, talentCode });
  }
  clearHeroTalent(classId: string, tierIndex: number) { return this.cmd('clearHeroTalent', { classId, tierIndex }); }
  unlockHeroTrait(slot: number, classId?: string) { return this.cmd('unlockHeroTrait', { slot, ...(classId ? { classId } : {}) }); }
  pickManaMastery(color: string) { return this.cmd('pickManaMastery', { color }); }
  temperWeapon(weaponId: string) { return this.cmd('temperWeapon', { weaponId }); }

  // —— 愿望单 / 宝箱 ——

  setWishlist(ids: readonly number[]) { return this.cmd('setWishlist', { ids: [...ids] }); }
  setPursuitTarget(id: number | null) { return this.cmd('setPursuitTarget', { id }); }
  openChest(kind: 'gem' | 'gold' | 'glory', count = 1, opts: { buyMissingKeys?: boolean } = {}) {
    return this.cmd('openChest', { kind, count, buyMissingKeys: opts.buyMissingKeys === true });
  }

  // —— 王国 ——

  upgradeKingdomLevel(kingdom: string) { return this.cmd('upgradeKingdomLevel', { kingdom }); }
  collectKingdomTribute(kingdom: string) { return this.cmd('collectKingdomTribute', { kingdom }); }
  collectAllTribute() { return this.cmd('collectAllTribute', {}); }
  setHomeKingdom(kingdom: string | null) { return this.cmd('setHomeKingdom', { kingdom }); }
  abandonKingdomExplore(kingdom: string) { return this.cmd('abandonKingdomExplore', { kingdom }); }
  setKingdomExploreTier(kingdom: string, tier: number) { return this.cmd('setKingdomExploreTier', { kingdom, tier }); }

  // —— 竞技场 ——

  enterArena() { return this.cmd('enterArena', {}); }
  pickDraftCard(troopId: number) { return this.cmd('pickDraftCard', { troopId }); }
  arrangeDraftTeam(order: number[]) { return this.cmd('arrangeDraftTeam', { order }); }
  startDraftBattles() { return this.cmd('startDraftBattles', {}); }
  forfeitDraft() { return this.cmd('forfeitDraft', {}); }

  // —— 战斗 ——

  planQuestBattle(kingdom: string, node: number) { return this.plan('planQuestBattle', { kingdom, node }); }
  planTutorialBattle() { return this.plan('planTutorialBattle', {}); }
  planExploreBattle(kingdom: string) { return this.plan('planExploreBattle', { kingdom }); }
  planEventBattle(typeId: EventTypeId, choice?: string) {
    return this.plan('planEventBattle', choice === undefined ? { typeId } : { typeId, choice });
  }
  planArenaBattle() { return this.plan('planArenaBattle', {}); }
  planInvasionRevenge(key: string) { return this.plan('planInvasionRevenge', { key }); }
  claimInvasionDefense() { return this.cmd('claimInvasionDefense', {}); }
  planInvasionBattle(mirrorId: string) { return this.plan('planInvasionBattle', { mirrorId }); }
  settleBattle(result: BattleResult) { return this.cmd('settleBattle', { result }); }

  // —— 馈赠 ——

  claimGift(id: string) { return this.cmd('claimGift', { id }); }
  claimAllGifts() { return this.cmd('claimAllGifts', {}); }

  // —— 每周活动 ——

  abandonTowerRun() { return this.cmd('abandonTowerRun', {}); }
  eventAction(typeId: EventTypeId, action: string) { return this.cmd('eventAction', { typeId, action }); }
  buyMaterialGoods(request: MaterialShopRequest, expectedQuote: string) { return this.cmd('buyMaterialGoods', { request, expectedQuote }); }
  buyEventGoods(goodsId: string, typeId: EventTypeId, expectedPeriodStart?: number) {
    return this.cmd('buyEventGoods', expectedPeriodStart === undefined ? { goodsId, typeId } : { goodsId, typeId, expectedPeriodStart });
  }

  // —— 入侵 ——

  syncInvasionSeason() { return this.cmd('syncInvasionSeason', {}); }
  setInvasionDefense(index: number) { return this.cmd('setInvasionDefense', { index }); }
  syncInvasionDefense() { return this.cmd('syncInvasionDefense', {}); }
  refreshInvasionOpponents() { return this.cmd('refreshInvasionOpponents', {}); }
  claimInvasionRank(id: string, expectedWeek?: number) {
    return this.cmd('claimInvasionRank', expectedWeek === undefined ? { id } : { id, expectedWeek });
  }

  // —— 寻宝 ——

  finishTreasureHunt() { return this.cmd('finishTreasureHunt', {}); }
  startTreasureHunt() { return this.cmd('startTreasureHunt', {}); }
  playTreasureHunt(from: number, to: number) { return this.cmd('playTreasureHunt', { from, to }); }

  // —— 内部 ——

  private async cmd<K extends CommandType>(type: K, args: CommandArgs<K>): Promise<GatewayUpdate<CommandResult<K>>> {
    const reply = await this.transport.send({ type, args } as unknown as MetaCommand<K>);
    this.calibrate(reply.serverNow);
    if (reply.patch) {
      const save = this.current();
      // 晚到的旧回执已被更新的快照覆盖，不回退副本，也不触发刷新判负。
      if (reply.patch.to > save.revision) {
        if (reply.patch.from === save.revision) applyPatch(save, reply.patch);
        else {
          // 只读取权威快照；load() 的页面刷新语义会作废正在进行的战斗。
          await this.sync();
        }
      }
    } else if (reply.revision !== undefined && reply.revision > this.current().revision) {
      // Another tab, or a lost reply followed by an idempotent retry.
      await this.sync();
    }
    return { result: reply.result, save: this.current() };
  }

  private async plan<K extends CommandType>(type: K, args: CommandArgs<K>): Promise<CommandResult<K>> {
    return (await this.cmd(type, args)).result;
  }

  private calibrate(serverNow: number): void {
    if (Number.isFinite(serverNow)) this.skew = serverNow - Date.now();
  }

  private devTools(): MetaDevTools {
    const snapshot = (save: MetaSave, fresh: boolean): GatewaySnapshot => ({ save, fresh, warning: null });
    return {
      importSaveJson: async (text: string) => {
        const { result, save } = await this.cmd('dev.importSave', { json: text });
        const failure = result as unknown as MetaFailure;
        if (failure.ok === false) throw new MetaSaveError(failure.message);
        return snapshot(save, false);
      },
      resetToDemo: async () => snapshot((await this.cmd('dev.resetToDemo', {})).save, true),
      setBattleDebug: (on: boolean) => this.cmd('dev.setBattleDebug', { on }),
      applyCollectionModifier: (action: CollectionModifierAction) => this.cmd('dev.collectionModifier', { action }),
    };
  }
}

/** 本地后端网关（浏览器内权威核心 + localStorage）。测试可注入固定时钟/种子。 */
export class MockGateway extends CommandGateway {
  constructor(storage?: StorageLike, options: LocalTransportOptions = {}) {
    super(new LocalTransport(storage, options));
  }
}
