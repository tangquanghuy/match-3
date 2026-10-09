import { defenseRecord, defensePublicationStamp, emptyDefenseLog } from '../systems/invasionDefense';
/**
 * 玩家 Actor：一个玩家一个实例，在线期间存档常驻内存。
 *
 * 成熟服务端的标准做法：
 *  - 读：首次请求时从存储整份载入，之后所有命令只改内存；
 *  - 写：命令提交后按记录做脏标记（state/records.ts），只回写改动的记录；
 *    关键命令（开箱/结算/入账，见 isCriticalCommand）提交即落盘，其余在
 *    flushDelayMs 内合并成一批落盘；每批原子写入，磁盘上永远是某个完整 revision；
 *  - 回：回执只带增量（SavePatch），不回传整份存档；
 *  - 同一玩家的命令严格串行（Durable Object 天然单线程；这里再加一层队列兜底）。
 *
 * 前提：**同一玩家同一时刻只有一个 Actor**（Durable Object 按玩家 id 路由即可保证；
 * 自建 Node 服务则需按玩家 id 粘滞到单进程）。多个 Actor 写同一份存储会互相覆盖。
 */
import type { MetaSave } from '../state/schema';
import type { MailItem } from '../state/schema';
import { MetaSaveError } from '../state/save';
import { assembleRaw, buildPatch, diffRecords, recordsToSave, saveToRecords, type RecordChanges, type SaveRecords } from '../state/records';
import { correctGraydoveRetirementMail, prepareTroopRetirementWithMail, retirementCompensations, updateGraydoveRetirementWording } from '../systems/retiredTroops';
import { hydrateGachaAudit } from '../systems/wishlist';
import { INVASION } from '../data/economy';
import { commandPoolNeeds, createFreshSave, runCommand, type CommandEffects, type CommandIo, type FreshSaveKind } from './core';
import type { ServerEnv } from './env';
import type { InvasionMirrorPool } from './mirrorPool';
import { weekStartOf } from '../gateway/clock';
import { ensureInvasionSeason, invasionPlayerPower } from '../systems/invasion';
import { invasionPoolNeedsExpansion, invasionPoolQuery } from '../systems/invasionMirrors';
import { isCriticalCommand, PLAN_COMMANDS, type CommandReply, type CommandType, type LoadReply, type SaveLoadOptions, type MetaCommand } from './protocol';
import { hydrateMailbox } from '../systems/mailbox';
import { hasBlockedWishlistIds, purgeBlockedWishlist } from '../systems/wishlist';

/** 一批原子写入：把存储从 fromRevision 推到 toRevision（null = 首次建档） */
export interface RecordBatch {
  fromRevision: number | null;
  toRevision: number;
  set: Map<string, string>;
  del: string[];
}

export interface SaveRepository {
  /** 读该玩家全部记录；null = 还没有存档 */
  load(): Promise<{ records: SaveRecords | null; warning: string | null }>;
  /** 原子写入一批记录（全成或全不成）。D1：batch；DO：transactionSync；本地：单次 setItem */
  write(batch: RecordBatch): Promise<void>;
}

export interface MetaHostOptions {
  /** 新玩家拿到的存档（远端恒为 'new'；本地开发默认 'demo'） */
  fresh: FreshSaveKind;
  /** 非关键命令的合并落盘延迟（ms）；0 = 每条命令提交后立即落盘 */
  flushDelayMs?: number;
  /** 延迟调度器（Worker/DO 可换成 alarm；测试注入手动时钟） */
  schedule?: (delayMs: number, run: () => void) => void;
  /** 入侵真人镜像共享池（已绑定本玩家身份）；缺省 = 对手全走人机 */
  mirrorPool?: InvasionMirrorPool;
  /** 池读写失败的日志出口（失败不影响命令本身） */
  onMirrorPoolError?: (error: unknown) => void;
}

export class MetaHost {
  private save: MetaSave | null = null;
  /** 内存中已提交状态的记录表（与 save 同步） */
  private records: SaveRecords = new Map();
  /** 已提交未落盘：key → 新内容（null = 删除） */
  private readonly dirty = new Map<string, string | null>();
  private persistedRevision: number | null = null;
  private flushScheduled = false;
  private queue: Promise<unknown> = Promise.resolve();
  private loadWarning: string | null = null;
  /** 已提交、待写共享池的副作用 */
  private readonly effects: CommandEffects[] = [];
  private createdFresh = false;
  /** Success-only cache. D1 also suppresses unchanged writes after a cold start. */
  private reportedVpKey: string | null = null;

  constructor(
    private readonly repo: SaveRepository,
    private readonly env: ServerEnv,
    private readonly options: MetaHostOptions,
  ) {}

  /**
   * 整份快照（登录/刷新页面/重同步时下发）。首次调用会载入或建档。
   * 防刷新重来：默认先将旧战斗判负/作废。命令存档序号重同步显式保留战斗票，
   * 否则出战回执因副本存档序号落后而触发同步时，会作废刚签发的新票。
   */
  load(options: SaveLoadOptions = {}): Promise<LoadReply> {
    return this.serial(async () => {
      await this.ensureLoaded();
      if (!options.preservePendingBattle && this.save?.pendingBattle) {
        this.commit({ type: 'forfeitPendingBattle', args: {} } as MetaCommand);
        await this.flushNow();
        await this.drainEffects();
      }
      await this.drainDefenseOutbox();
      const reply: LoadReply = { save: this.save!, fresh: this.createdFresh, warning: this.loadWarning, serverNow: this.env.now() };
      this.createdFresh = false;
      this.loadWarning = null;
      return reply;
    });
  }

  /** Called only by the authenticated Worker before a save load. Existing IDs acknowledge retries. */
  receiveMail(incoming: MailItem[]): Promise<string[]> {
    return this.serial(async () => {
      await this.ensureLoaded();
      const items = hydrateMailbox({ weeklyDoubleVersion: 1, classTrialXpVersion: 1, items: incoming }).items;
      if (items.length !== incoming.length) throw new Error('invalid system mail batch');
      const existing = new Set(this.save!.mailbox.items.map(item => item.id));
      const added = items.filter(item => !existing.has(item.id));
      if (added.length) {
        const next = structuredClone(this.save!);
        next.mailbox.items.push(...added);
        next.revision += 1;
        next.savedAt = this.env.now();
        this.apply(next);
      }
      await this.flushNow();
      return items.map(item => item.id);
    });
  }

  execute<K extends CommandType>(command: MetaCommand<K>): Promise<CommandReply<K>> {
    return this.serial(async () => {
      const start = await this.ensureLoaded();
      const startRecords = this.records;
      // 未结算就开新战斗（多标签页 / 跳过结算）：旧票先判负/作废，与刷新同口径
      const forfeited = PLAN_COMMANDS.has(command.type) && start.pendingBattle
        ? this.commit({ type: 'forfeitPendingBattle', args: {} } as MetaCommand)
        : false;
      const io = await this.prefetch(command);
      const outcome = runCommand(this.save!, command, this.env, io);
      const committed = outcome.commit ? this.apply(outcome.save) : false;
      if (outcome.effects) this.effects.push(outcome.effects);
      const failed = typeof outcome.result === 'object' && outcome.result !== null
        && 'ok' in outcome.result && outcome.result.ok === false;
      if (!committed && !forfeited && failed) {
        return { result: outcome.result, patch: null, revision: this.save!.revision, serverNow: this.env.now() };
      }

      if (forfeited || isCriticalCommand(command.type) || (this.options.flushDelayMs ?? 0) <= 0) await this.flushNow();
      else this.scheduleFlush();
      await this.drainEffects();

      return {
        result: outcome.result,
        patch: start.revision === this.save!.revision ? null
          : buildPatch(start.revision, this.save!.revision, diffRecords(startRecords, this.records)),
        revision: this.save!.revision,
        serverNow: this.env.now(),
      };
    });
  }

  /** 立即落盘所有脏记录（下线 / 实例回收前调用） */
  /** Production cleanup, serialized with live player commands. */
  /** One-account pilot: serialized with live commands, CAS against locally backed-up RAW save. */
  retireGraydove(expectedRevision: number, expectedRawSha256: string): Promise<
    { status: 'retired'; revision: number; removed: number[]; mailId: string; affectedTeams: number[] }
    | { status: 'stale' | 'pending-battle' | 'unexpected-owner' | 'already-retired'; revision: number | null }
  > {
    return this.serial(async () => {
      const { records } = await this.repo.load();
      if (!records) return { status: 'stale', revision: null };
      const raw = assembleRaw(records);
      const bytes = new TextEncoder().encode(JSON.stringify(raw));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const storedRevision = JSON.parse(records.get('meta') ?? '{}').revision as number | undefined;
      if (hash !== expectedRawSha256 || storedRevision !== expectedRevision ||
          this.dirty.size > 0 || (this.save && this.save.revision !== expectedRevision))
        return { status: 'stale', revision: storedRevision ?? null };
      // Inspect the backed-up raw ticket before hydration: malformed/old tickets may be
      // discarded by migration, but must not be silently treated as a settled battle.
      if (raw.pendingBattle != null) return { status: 'pending-battle', revision: storedRevision };
      const save = recordsToSave(records, this.env.now());
      if (save.revision !== expectedRevision || save.pendingBattle)
        return { status: 'stale', revision: save.revision };
      const packages = retirementCompensations(save);
      if (packages.length === 0 && save.mailbox.items.some(m => m.id === 'retirement-2026-10-09:7622'))
        return { status: 'already-retired', revision: save.revision };
      if (packages.length !== 1 || packages[0]!.troopId !== 7622 ||
          save.mailbox.items.some(m => m.id === 'retirement-2026-10-09:7622'))
        return { status: 'unexpected-owner', revision: save.revision };
      const result = prepareTroopRetirementWithMail(save, this.env.now());
      result.save.revision += 1;
      result.save.savedAt = this.env.now();
      const nextRecords = saveToRecords(result.save);
      const changes = diffRecords(records, nextRecords);
      // A failed write must not leave an in-memory mail or cleanup that a later
      // unrelated player command could accidentally flush.
      await this.repo.write({ fromRevision: expectedRevision, toRevision: result.save.revision,
        set: changes.set, del: changes.del });
      this.save = result.save;
      this.records = nextRecords;
      this.persistedRevision = result.save.revision;
      return { status: 'retired', revision: result.save.revision, removed: result.removedCollection,
        mailId: 'retirement-2026-10-09:7622', affectedTeams: result.affectedTeams };
    });
  }

  /** Account-scoped retirement: caller first persists a local copy of the exact raw save.
   *  Revision + SHA-256 are both checked under the player command serialization lock. */
  retireBackedUpPlayer(expectedRevision: number, expectedRawSha256: string, allowPendingEncounterReferences = false): Promise<{
    status: string; revision: number | null; removed?: number[]; mails?: string[]; affectedTeams?: number[];
  }> {
    return this.serial(async () => {
      const { records } = await this.repo.load();
      if (!records) return { status: 'stale', revision: null };
      const raw = assembleRaw(records);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const storedRevision = JSON.parse(records.get('meta') ?? '{}').revision as number | undefined;
      if (hash !== expectedRawSha256 || storedRevision !== expectedRevision || this.dirty.size > 0 ||
          (this.save && this.save.revision !== expectedRevision))
        return { status: 'stale', revision: storedRevision ?? null };
      if (raw.pendingBattle != null) {
        // This path is enabled solely for the designated deferred encounter account.
        // Keep its battle ticket, rewards, collection and draw audits untouched.
        if (!allowPendingEncounterReferences || (raw.pendingBattle as { mode?: string }).mode !== 'encounter')
          return { status: 'pending-battle', revision: storedRevision ?? null };
        const pendingSave = recordsToSave(records, this.env.now());
        const retired = new Set([7446, 7622]);
        if (Object.keys(pendingSave.collection).some(id => retired.has(Number(id))) ||
            Object.keys(pendingSave.collectionTruth ?? {}).some(id => retired.has(Number(id))) ||
            pendingSave.teams.some(team => team.members.some(m => m.kind === 'troop' && retired.has(m.troopId))) ||
            pendingSave.invasion.defenseTeam?.members.some(m => m.kind === 'troop' && retired.has(m.troopId)) ||
            pendingSave.favoriteTroopIds.some(id => retired.has(id)))
          return { status: 'pending-battle', revision: storedRevision ?? null };
        const wishlist = raw.gachaWishlist as { troopIds?: number[]; pursuit?: { targetId?: number | null } } | undefined;
        const invasion = raw.invasion as { roster?: unknown } | undefined;
        if (!wishlist || !Array.isArray(wishlist.troopIds) || !invasion ||
            (!wishlist.troopIds.some(id => retired.has(id)) &&
             !retired.has(wishlist.pursuit?.targetId ?? -1) &&
             !/7446|7622/.test(JSON.stringify(invasion.roster ?? null))))
          return { status: 'pending-battle', revision: storedRevision ?? null };
        const cleaned = structuredClone(wishlist);
        cleaned.troopIds = cleaned.troopIds!.filter(id => !retired.has(id));
        if (cleaned.pursuit && retired.has(cleaned.pursuit.targetId ?? -1)) cleaned.pursuit.targetId = null;
        const nextRevision = expectedRevision + 1;
        const nextRecords = new Map(records);
        nextRecords.set('gachaWishlist', JSON.stringify(cleaned));
        nextRecords.set('invasion', JSON.stringify({ ...invasion, roster: null }));
        nextRecords.set('meta', JSON.stringify({ ...JSON.parse(records.get('meta')!), savedAt: this.env.now(), revision: nextRevision }));
        const changes = diffRecords(records, nextRecords);
        await this.repo.write({ fromRevision: expectedRevision, toRevision: nextRevision, set: changes.set, del: changes.del });
        this.save = recordsToSave(nextRecords, this.env.now());
        this.records = nextRecords;
        this.persistedRevision = nextRevision;
        return { status: 'retired', revision: nextRevision, removed: [], mails: [], affectedTeams: [] };
      }
      const save = recordsToSave(records, this.env.now());
      if (save.revision !== expectedRevision || save.pendingBattle)
        return { status: 'stale', revision: save.revision };
      const ids = new Set([7446, 7622]);
      const references = [...Object.keys(save.collection), ...Object.keys(save.collectionTruth ?? {})].some(id => ids.has(Number(id))) ||
        save.teams.some(team => team.members.some(m => m.kind === 'troop' && ids.has(m.troopId))) ||
        !!save.invasion.defenseTeam?.members.some(m => m.kind === 'troop' && ids.has(m.troopId)) ||
        save.favoriteTroopIds.some(id => ids.has(id)) || save.gachaWishlist.troopIds.some(id => ids.has(id)) ||
        ids.has(save.gachaWishlist.pursuit.targetId ?? -1) ||
        (save.invasion.roster !== null && /"(?:7446|7622)"/.test(JSON.stringify(save.invasion.roster)));
      if (!references) {
        // Hydration hides retired wishlist IDs, but the original records can still contain
        // them. Persist the raw cleanup without rewriting any historical draw audits.
        const wishlist = raw.gachaWishlist as { troopIds?: number[]; pursuit?: { targetId?: number | null } } | undefined;
        if (!wishlist || (!wishlist.troopIds?.some(id => ids.has(id)) &&
            !ids.has(wishlist.pursuit?.targetId ?? -1)))
          return { status: 'already-retired', revision: save.revision };
        const cleaned = structuredClone(wishlist);
        if (Array.isArray(cleaned.troopIds)) cleaned.troopIds = cleaned.troopIds.filter(id => !ids.has(id));
        if (ids.has(cleaned.pursuit?.targetId ?? -1) && cleaned.pursuit) cleaned.pursuit.targetId = null;
        const nextRevision = expectedRevision + 1;
        const nextRecords = new Map(records);
        nextRecords.set('gachaWishlist', JSON.stringify(cleaned));
        nextRecords.set('meta', JSON.stringify({ ...JSON.parse(records.get('meta')!), savedAt: this.env.now(), revision: nextRevision }));
        const changes = diffRecords(records, nextRecords);
        await this.repo.write({ fromRevision: expectedRevision, toRevision: nextRevision, set: changes.set, del: changes.del });
        this.save = recordsToSave(nextRecords, this.env.now());
        this.records = nextRecords;
        this.persistedRevision = nextRevision;
        return { status: 'retired', revision: nextRevision, removed: [], mails: [], affectedTeams: [] };
      }
      const packages = retirementCompensations(save);
      if (packages.some(pkg => save.mailbox.items.some(m => m.id === `retirement-2026-10-09:${pkg.troopId}`)))
        return { status: 'mail-mismatch', revision: save.revision };
      const result = prepareTroopRetirementWithMail(save, this.env.now());
      result.save.revision += 1;
      result.save.savedAt = this.env.now();
      const nextRecords = saveToRecords(result.save);
      const changes = diffRecords(records, nextRecords);
      await this.repo.write({ fromRevision: expectedRevision, toRevision: result.save.revision,
        set: changes.set, del: changes.del });
      this.save = result.save;
      this.records = nextRecords;
      this.persistedRevision = result.save.revision;
      return { status: 'retired', revision: result.save.revision, removed: result.removedCollection,
        mails: packages.map(pkg => `retirement-2026-10-09:${pkg.troopId}`), affectedTeams: result.affectedTeams };
    });
  }

  /** CAS-backed repair of historical draw audits from locally captured pre-incident saves. */
  restoreRetiredGachaAudits(expectedRevision: number, expectedRawSha256: string, originalLog: unknown): Promise<{ status: string; revision: number | null; restored?: number }> {
    return this.serial(async () => {
      const { records } = await this.repo.load();
      if (!records) return { status: 'stale', revision: null };
      const raw = assembleRaw(records);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const revision = JSON.parse(records.get('meta') ?? '{}').revision as number | undefined;
      if (hash !== expectedRawSha256 || revision !== expectedRevision || this.dirty.size > 0 ||
          (this.save && this.save.revision !== expectedRevision)) return { status: 'stale', revision: revision ?? null };
      if (raw.pendingBattle != null) return { status: 'pending-battle', revision: revision ?? null };
      if (!Array.isArray(originalLog) || !Array.isArray(raw.gachaLog) || originalLog.length > 50 || raw.gachaLog.length > 50)
        return { status: 'audit-mismatch', revision: revision ?? null };
      const previous = new Map<string, unknown>();
      for (const entry of originalLog) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { status: 'audit-mismatch', revision: revision ?? null };
        const { audit, ...identity } = entry as Record<string, unknown>;
        const key = JSON.stringify(identity);
        if (previous.has(key)) return { status: 'audit-mismatch', revision: revision ?? null };
        if (audit !== undefined) {
          const count = Array.isArray(identity.troops) ? identity.troops.length : -1;
          if (!hydrateGachaAudit(audit, count)) return { status: 'audit-mismatch', revision: revision ?? null };
        }
        previous.set(key, audit);
      }
      let restored = 0;
      const nextLog = (raw.gachaLog as Record<string, unknown>[]).map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const { audit, ...identity } = entry;
        const key = JSON.stringify(identity);
        if (audit !== undefined || !previous.has(key) || previous.get(key) === undefined) return entry;
        restored++;
        return { ...entry, audit: previous.get(key) };
      });
      if (!restored || nextLog.includes(null)) return { status: 'audit-mismatch', revision: revision ?? null };
      const nextRevision = expectedRevision + 1;
      const nextRecords = new Map(records);
      nextRecords.set('gachaLog', JSON.stringify(nextLog));
      nextRecords.set('meta', JSON.stringify({ ...JSON.parse(records.get('meta')!), savedAt: this.env.now(), revision: nextRevision }));
      const changes = diffRecords(records, nextRecords);
      await this.repo.write({ fromRevision: expectedRevision, toRevision: nextRevision, set: changes.set, del: changes.del });
      this.save = recordsToSave(nextRecords, this.env.now());
      this.records = nextRecords;
      this.persistedRevision = nextRevision;
      return { status: 'audit-restored', revision: nextRevision, restored };
    });
  }

  /** A second one-time mythic choice for Graydove; raw SHA-256 + revision CAS, one atomic commit. */
  sendGraydoveMythicChoice(expectedRevision: number, expectedRawSha256: string): Promise<{
    status: 'sent' | 'stale' | 'pending-battle' | 'mail-mismatch' | 'already-sent'; revision: number | null; mailId?: string;
  }> {
    return this.serial(async () => {
      const { records } = await this.repo.load();
      if (!records) return { status: 'stale', revision: null };
      const raw = assembleRaw(records);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const revision = JSON.parse(records.get('meta') ?? '{}').revision as number | undefined;
      if (hash !== expectedRawSha256 || revision !== expectedRevision || this.dirty.size > 0 ||
          (this.save && this.save.revision !== expectedRevision)) return { status: 'stale', revision: revision ?? null };
      if (raw.pendingBattle != null) return { status: 'pending-battle', revision: revision ?? null };
      const save = recordsToSave(records, this.env.now());
      if (save.revision !== expectedRevision || save.pendingBattle) return { status: 'stale', revision: save.revision };
      const id = 'graydove-extra-mythic-choice-2026-10-09-2';
      if (save.mailbox.items.some(mail => mail.id === id)) return { status: 'already-sent', revision: save.revision, mailId: id };
      if (save.mailbox.items.filter(mail => mail.id === 'retirement-2026-10-09:7622').length !== 1 ||
          save.mailbox.items.filter(mail => mail.id === 'graydove-extra-mythic-choice-2026-10-09').length !== 1 ||
          save.collection['7622'] || save.collection['7446'] || save.collectionTruth?.['7622'] || save.collectionTruth?.['7446'])
        return { status: 'mail-mismatch', revision: save.revision };
      const next = structuredClone(save);
      next.mailbox.items.push({ id, title: '\u7070\u9e20\u4e13\u5c5e\uff1a\u795e\u8bdd\u90e8\u961f\u81ea\u9009',
        body: '\u4e3a\u7070\u9e20\u5355\u72ec\u8865\u53d1\u4e00\u4efd\u795e\u8bdd\u90e8\u961f\u81ea\u9009\u3002\u9886\u53d6\u9644\u4ef6\u540e\u53ef\u67e5\u770b\u795e\u8bdd\u90e8\u961f\u8be6\u60c5\u5e76\u786e\u8ba4\u9009\u62e9\uff1b\u9009\u62e9\u6210\u529f\u3001\u90e8\u961f\u8fdb\u5165\u6536\u85cf\u540e\u624d\u6d88\u8017\u81ea\u9009\u8d44\u683c\u3002',
        sentAt: this.env.now(), readAt: null, claimedAt: null, currencies: {}, materials: {}, mythicChoice: 1 });
      // Old opponent snapshots may still contain retired troops; discard only this cached matchmaking roster.
      next.invasion.roster = null;
      next.revision += 1;
      next.savedAt = this.env.now();
      const nextRecords = saveToRecords(next);
      const changes = diffRecords(records, nextRecords);
      await this.repo.write({ fromRevision: expectedRevision, toRevision: next.revision, set: changes.set, del: changes.del });
      this.save = next;
      this.records = nextRecords;
      this.persistedRevision = next.revision;
      return { status: 'sent', revision: next.revision, mailId: id };
    });
  }

  /** One-account repair: CAS against a fresh raw backup, then atomically replace ONLY the unclaimed letter. */
  correctGraydoveMail(expectedRevision: number, expectedRawSha256: string): Promise<
    { status: 'corrected'; revision: number; mailId: string } |
    { status: 'stale' | 'pending-battle' | 'mail-mismatch'; revision: number | null }
  > {
    return this.serial(async () => {
      const { records } = await this.repo.load();
      if (!records) return { status: 'stale', revision: null };
      const raw = assembleRaw(records);
      const bytes = new TextEncoder().encode(JSON.stringify(raw));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const storedRevision = JSON.parse(records.get('meta') ?? '{}').revision as number | undefined;
      if (hash !== expectedRawSha256 || storedRevision !== expectedRevision ||
          this.dirty.size > 0 || (this.save && this.save.revision !== expectedRevision))
        return { status: 'stale', revision: storedRevision ?? null };
      if (raw.pendingBattle != null) return { status: 'pending-battle', revision: storedRevision ?? null };
      const save = recordsToSave(records, this.env.now());
      if (save.revision !== expectedRevision || save.pendingBattle)
        return { status: 'stale', revision: save.revision };
      let next: MetaSave;
      try { next = correctGraydoveRetirementMail(save); }
      catch { return { status: 'mail-mismatch', revision: save.revision }; }
      next.revision += 1;
      next.savedAt = this.env.now();
      const nextRecords = saveToRecords(next);
      const changes = diffRecords(records, nextRecords);
      await this.repo.write({ fromRevision: expectedRevision, toRevision: next.revision,
        set: changes.set, del: changes.del });
      this.save = next;
      this.records = nextRecords;
      this.persistedRevision = next.revision;
      return { status: 'corrected', revision: next.revision, mailId: 'retirement-2026-10-09:7622' };
    });
  }

  /** Fixed player, one-time wording-only change; respects claimed attachment state. */
  updateGraydoveMailWording(expectedRevision: number, expectedRawSha256: string): Promise<
    { status: 'wording-updated'; revision: number; mailId: string } |
    { status: 'stale' | 'pending-battle' | 'mail-mismatch'; revision: number | null }
  > {
    return this.serial(async () => {
      const { records } = await this.repo.load();
      if (!records) return { status: 'stale', revision: null };
      const raw = assembleRaw(records);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      const storedRevision = JSON.parse(records.get('meta') ?? '{}').revision as number | undefined;
      if (hash !== expectedRawSha256 || storedRevision !== expectedRevision ||
          this.dirty.size > 0 || (this.save && this.save.revision !== expectedRevision))
        return { status: 'stale', revision: storedRevision ?? null };
      if (raw.pendingBattle != null) return { status: 'pending-battle', revision: storedRevision ?? null };
      const save = recordsToSave(records, this.env.now());
      if (save.revision !== expectedRevision || save.pendingBattle) return { status: 'stale', revision: save.revision };
      let next: MetaSave;
      try { next = updateGraydoveRetirementWording(save); }
      catch { return { status: 'mail-mismatch', revision: save.revision }; }
      next.revision += 1;
      next.savedAt = this.env.now();
      const nextRecords = saveToRecords(next);
      const changes = diffRecords(records, nextRecords);
      await this.repo.write({ fromRevision: expectedRevision, toRevision: next.revision,
        set: changes.set, del: changes.del });
      this.save = next;
      this.records = nextRecords;
      this.persistedRevision = next.revision;
      return { status: 'wording-updated', revision: next.revision, mailId: 'retirement-2026-10-09:7622' };
    });
  }

  removeBlockedWishlist(): Promise<void> {
    return this.serial(async () => {
      await this.ensureLoaded();
      if (hasBlockedWishlistIds(this.save!.gachaWishlist)) {
        const next = structuredClone(this.save!);
        purgeBlockedWishlist(next);
        next.revision += 1;
        next.savedAt = this.env.now();
        this.apply(next);
      }
      await this.flushNow();
    });
  }

  flush(): Promise<void> {
    return this.serial(async () => { await this.flushNow(); await this.drainDefenseOutbox(); });
  }

  /** 已提交未落盘的记录数（监控/测试用） */
  get pendingRecords(): number {
    return this.dirty.size;
  }

  // —— 内部 ——

  /** 需要时向共享池取样（只在入侵同步/刷新/结算时查） */
  private async prefetch(command: MetaCommand): Promise<CommandIo> {
    const pool = this.options.mirrorPool;
    const save = this.save!;
    const now = this.env.now();
    if (command.type === 'syncInvasionDefense' || command.type === 'claimInvasionDefense' || command.type === 'planInvasionRevenge') {
      if (!pool) return { defenseLog: emptyDefenseLog(now, weekStartOf(now)) };
      try { return { defenseLog: await pool.defenseLog(now, weekStartOf(now), save.invasion.defenseProgress.cursor) }; }
      catch (error) { this.options.onMirrorPoolError?.(error); return {}; }
    }
    if (!pool) return {};
    const needs = commandPoolNeeds(save, command, now);
    if (!needs.mirrors && !needs.standings) return {};
    // 跨周时核心会先周结（联赛可能重算），在只含入侵字段的副本上预演一遍取联赛
    const probe = { invasion: { ...save.invasion, claimedRanks: [...save.invasion.claimedRanks] } } as MetaSave;
    const week = weekStartOf(now);
    ensureInvasionSeason(probe, now, week);
    const league = probe.invasion.league;
    const guard = <T>(p: Promise<T>): Promise<T | undefined> => p.catch((error) => {
      this.options.onMirrorPoolError?.(error);
      return undefined;
    });
    const power = needs.mirrors ? invasionPlayerPower(save) : 0;
    const slack = command.type === 'settleBattle' ? 1 : 0; // 结算后可能升一个联赛
    const query = invasionPoolQuery(league, power, now, slack);
    if (command.type === 'regionalAction') Object.assign(query, { leagueMin: 0, leagueMax: 9, powerMin: 1, powerMax: 100000, limit: 60 });
    const [nearby, standings] = await Promise.all([
      !needs.mirrors ? undefined : power <= 0 ? [] : guard(pool.sample(query)),
      needs.standings ? guard(pool.standings({ weekStart: week, league, limit: INVASION.bracketSize })) : undefined,
    ]);
    let mirrorPool = nearby;
    if (nearby && (query.leagueMin > 0 || query.leagueMax < 9)
      && invasionPoolNeedsExpansion(nearby, league, power, now, save.invasion.recentOpponents)) {
      const expanded = await guard(pool.sample({ ...query, leagueMin: 0, leagueMax: 9 }));
      if (expanded) {
        const combined = new Map<string, (typeof expanded)[number]>();
        for (const entry of [...nearby, ...expanded]) {
          const key = `${entry.ownerKey}:${entry.league}`;
          if (!combined.has(key) || entry.recordedAt > combined.get(key)!.recordedAt) combined.set(key, entry);
        }
        mirrorPool = [...combined.values()];
      }
    }
    return {
      ...(mirrorPool ? { mirrorPool } : {}),
      ...(standings ? { standings } : {}),
    };
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureLoaded(): Promise<MetaSave> {
    if (this.save) return this.save;
    const now = this.env.now();
    const { records, warning } = await this.repo.load();
    this.loadWarning = warning;
    if (records) {
      try {
        const save = recordsToSave(records, now);
        const storedRevision = save.revision;
        const oldWishlist = records.get('gachaWishlist');
        // Bump the revision if hydration removes blocked troops; clients with an old cache resync.
        if (oldWishlist && hasBlockedWishlistIds(JSON.parse(oldWishlist))) {
          save.revision += 1;
          save.savedAt = now;
        }
        const normalized = saveToRecords(save);
        // 清洗改写过的记录（字段补默认等）随下一批落盘
        this.markDirty(diffRecords(records, normalized));
        this.records = normalized;
        this.persistedRevision = storedRevision;
        this.save = save;
        if (save.revision !== storedRevision) await this.flushNow();
        return save;
      } catch (error) {
        if (!(error instanceof MetaSaveError)) throw error;
        this.loadWarning = warning ? `${warning}；存档无法读取，已重建` : '存档无法读取，已重建';
      }
    }
    const created = createFreshSave(this.options.fresh, now);
    this.records = saveToRecords(created);
    this.markDirty(diffRecords(records ?? new Map(), this.records));
    this.save = created;
    this.createdFresh = true;
    await this.flushNow();
    return created;
  }

  /** 执行并（成功时）提交一条内部命令；返回是否提交 */
  private commit(command: MetaCommand): boolean {
    const outcome = runCommand(this.save!, command, this.env);
    if (!outcome.commit) return false;
    if (outcome.effects) this.effects.push(outcome.effects);
    return this.apply(outcome.save);
  }

  /**
   * 存档落定后再写共享池（镜像录制 / 周榜 VP）：池写失败只丢这一份，不回滚命令。
   * 同一批里多次 VP 上报只写最后一次。
   */
  private async drainEffects(): Promise<void> {
    await this.drainDefenseOutbox();
    const queued = this.effects.splice(0);
    const pool = this.options.mirrorPool;
    if (!pool || queued.length === 0) return;
    const onError = (error: unknown) => this.options.onMirrorPoolError?.(error);
    const lastVp = [...queued].reverse().find(e => e.reportVp)?.reportVp;
    await Promise.all([
      ...queued.filter(e => e.publishMirror).map(e => pool.publish(e.publishMirror!).catch(onError)),
      lastVp ? this.reportVpIfChanged(pool, lastVp).catch(onError) : undefined,
    ]);
  }

  private async reportVpIfChanged(pool: InvasionMirrorPool, report: NonNullable<CommandEffects['reportVp']>): Promise<void> {
    const key = `${report.weekStart}:${report.league}:${Math.round(report.vp)}`;
    if (key === this.reportedVpKey) return;
    // A lost acknowledgement may have changed D1: do not retain an older success.
    this.reportedVpKey = null;
    await pool.reportVp(report);
    this.reportedVpKey = key;
  }

  /** Delivery is at-least-once; shared storage deduplicates by attacker + authoritative ticket. */
  private async drainDefenseOutbox(): Promise<void> {
    const pool = this.options.mirrorPool;
    const reports = this.save?.invasion.defenseOutbox ?? [];
    const publish = this.save?.invasion.defensePublishPending ?? false;
    if (!pool || (reports.length === 0 && !publish)) return;
    await this.flushNow(); // persist result + outbox before touching shared storage
    const delivered = new Set<string>();
    let published: MetaSave['invasion']['lastDefensePublish'] = null;
    if (publish) {
      const record = defenseRecord(this.save!, this.env.now());
      if (record) {
        try { await pool.publish(record); published = defensePublicationStamp(record); }
        catch (error) { this.options.onMirrorPoolError?.(error); }
      }
    }
    // Bounded batch: a storage outage must not create an unbounded burst on reconnect.
    for (const report of reports.slice(0, 20)) {
      try { await pool.recordDefense(report); delivered.add(report.id); }
      catch (error) { this.options.onMirrorPoolError?.(error); break; }
    }
    if (delivered.size || published) {
      const next = structuredClone(this.save!);
      if (published) {
        next.invasion.defensePublishPending = false;
        next.invasion.lastDefensePublish = published;
      }
      next.invasion.defenseOutbox = next.invasion.defenseOutbox.filter(r => !delivered.has(r.id));
      next.revision += 1;
      this.apply(next);
      await this.flushNow();
    }
    if (this.save!.invasion.defenseOutbox.length || this.save!.invasion.defensePublishPending) {
      // Worker alarm / local scheduler retries even if no further player commands arrive.
      const schedule = this.options.schedule ?? ((ms: number, run: () => void) => void setTimeout(run, ms));
      schedule(30_000, () => { void this.flush().catch(error => this.options.onMirrorPoolError?.(error)); });
    }
  }

  /** 把新存档设为已提交状态并标脏 */
  private apply(next: MetaSave): true {
    const records = saveToRecords(next);
    this.markDirty(diffRecords(this.records, records));
    this.save = next;
    this.records = records;
    return true;
  }

  private markDirty(changes: RecordChanges): void {
    for (const [key, text] of changes.set) this.dirty.set(key, text);
    for (const key of changes.del) this.dirty.set(key, null);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.dirty.size === 0) return;
    this.flushScheduled = true;
    const schedule = this.options.schedule ?? ((ms, run) => void setTimeout(run, ms));
    schedule(this.options.flushDelayMs ?? 0, () => {
      this.flushScheduled = false;
      void this.flush().catch(() => this.scheduleFlush());
    });
  }

  private async flushNow(): Promise<void> {
    if (this.dirty.size === 0 || !this.save) return;
    const batch: RecordBatch = {
      fromRevision: this.persistedRevision,
      toRevision: this.save.revision,
      set: new Map(),
      del: [],
    };
    const snapshot = new Map(this.dirty);
    for (const [key, text] of snapshot) {
      if (text === null) batch.del.push(key);
      else batch.set.set(key, text);
    }
    this.dirty.clear();
    try {
      await this.repo.write(batch);
      this.persistedRevision = batch.toRevision;
    } catch (error) {
      // 写失败：放回脏表（期间更新的记录以新值为准），等下一次落盘重试
      for (const [key, text] of snapshot) if (!this.dirty.has(key)) this.dirty.set(key, text);
      throw error;
    }
  }
}
