import { describe, expect, it } from 'vitest';
import { MetaHost, type RecordBatch, type SaveRepository } from '../../src/meta/server/host';
import { defaultEnv } from '../../src/meta/server/env';
import { assembleRaw, saveToRecords, type SaveRecords } from '../../src/meta/state/records';
import { newSave } from '../../src/meta/state/schema';
import { correctGraydoveRetirementMail, updateGraydoveRetirementWording } from '../../src/meta/systems/retiredTroops';

const now = Date.UTC(2026, 9, 9);
class Repo implements SaveRepository {
  records: SaveRecords;
  failWrite = false;
  constructor(save = baseSave()) { this.records = saveToRecords(save); }
  async load() { return { records: new Map(this.records), warning: null }; }
  async write(batch: RecordBatch) {
    if (this.failWrite) throw new Error('write failed');
    const next = new Map(this.records);
    for (const key of batch.del) next.delete(key);
    for (const [key, value] of batch.set) next.set(key, value);
    this.records = next;
  }
  async hash() {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(assembleRaw(this.records))));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
}
function baseSave() {
  const save = newSave({ now });
  save.collection['7622'] = { copies: 0, level: 20, ascension: 0, traits: [true, false, false], locked: false };
  save.gachaWishlist.troopIds = [7446];
  save.teams = [{ name: 'pilot', members: [{ kind: 'troop', troopId: 7622 }, { kind: 'hero' }], bannerKingdomId: null }];
  return save;
}
const hostOf = (repo: Repo) => new MetaHost(repo, defaultEnv({ now: () => now + 1000 }), { fresh: 'new', flushDelayMs: 0 });

describe('Graydove single-account serialized save trial', () => {
  it('atomically commits one removal and one compensation mail; rejects the original backup on retry', async () => {
    const repo = new Repo();
    const before = repo.records.get('meta')!;
    const revision = JSON.parse(before).revision as number;
    const hash = await repo.hash();
    const host = hostOf(repo);
    expect(await host.retireGraydove(revision, hash)).toMatchObject({ status: 'retired', revision: revision + 1,
      removed: [7622], affectedTeams: [0], mailId: 'retirement-2026-10-09:7622' });
    const after = await hostOf(repo).load({ preservePendingBattle: true });
    expect(after.save.collection['7622']).toBeUndefined();
    expect(after.save.gachaWishlist.troopIds).not.toContain(7446);
    expect(after.save.mailbox.items.filter(m => m.id === 'retirement-2026-10-09:7622')).toHaveLength(1);
    expect(after.save.mailbox.items.find(m => m.id === 'retirement-2026-10-09:7622')).toMatchObject({
      claimedAt: null, mythicChoice: 1, currencies: { gems: 2000 }, materials: { traitstones: { 'minor:green': 22, 'major:green': 16, celestial: 4 } },
    });
    expect(await host.retireGraydove(revision, hash)).toMatchObject({ status: 'stale' });
  });

  it('rejects same revision with modified content and a stale revision after live commands', async () => {
    const repo = new Repo();
    const revision = JSON.parse(repo.records.get('meta')!).revision as number;
    const hash = await repo.hash();
    repo.records.set('gachaWishlist', JSON.stringify({ troopIds: [7446, 6169], pursuit: { targetId: null, progress: 0, completed: 0, limit: 250 } }));
    expect(await hostOf(repo).retireGraydove(revision, hash)).toMatchObject({ status: 'stale' });
    const live = new Repo();
    const oldHash = await live.hash();
    const host = hostOf(live);
    await host.receiveMail([{ id: 'live', title: 'live', body: '', sentAt: now, readAt: null,
      claimedAt: null, currencies: {}, materials: {} }]);
    expect(await host.retireGraydove(revision, oldHash)).toMatchObject({ status: 'stale' });
  });

  it('defers an unsettled battle and never persists a partial write', async () => {
    const save = baseSave();
    save.pendingBattle = { mode: 'invasion' } as typeof save.pendingBattle;
    const repo = new Repo(save);
    const hash = await repo.hash();
    const rev = save.revision;
    expect(await hostOf(repo).retireGraydove(rev, hash)).toMatchObject({ status: 'pending-battle' });
    expect(await repo.hash()).toBe(hash);
    const clean = new Repo();
    const cleanHash = await clean.hash();
    clean.failWrite = true;
    const failedHost = hostOf(clean);
    await expect(failedHost.retireGraydove(rev, cleanHash)).rejects.toThrow('write failed');
    expect(await clean.hash()).toBe(cleanHash);
    clean.failWrite = false;
    expect(await failedHost.retireGraydove(rev, cleanHash)).toMatchObject({ status: 'retired' });
  });

  it('defers a well-formed pending battle ticket too', async () => {
    const save = baseSave();
    save.pendingBattle = { mode: 'arena', requestId: 'arena-1-0-0', issuedAt: now } as typeof save.pendingBattle;
    const repo = new Repo(save);
    const hash = await repo.hash();
    expect(await hostOf(repo).retireGraydove(save.revision, hash)).toMatchObject({ status: 'pending-battle' });
    expect(await repo.hash()).toBe(hash);
  });

  it('rejects unexpected second owner rather than mailing or editing a second card in the pilot', async () => {
    const save = baseSave();
    save.collection['7446'] = { ...save.collection['7622']! };
    const repo = new Repo(save);
    const hash = await repo.hash();
    expect(await hostOf(repo).retireGraydove(save.revision, hash)).toMatchObject({ status: 'unexpected-owner' });
    expect(await repo.hash()).toBe(hash);
  });
});
describe('backed-up general account retirement', () => {
  it('persists retirement IDs hidden by hydration in raw wishlist without changing old draw audits', async () => {
    const save = newSave({ now });
    const repo = new Repo(save);
    repo.records.set('gachaWishlist', JSON.stringify({ troopIds: [7446, 7622, 7251],
      pursuit: { targetId: 7446, progress: 12, completed: 0, limit: 200 } }));
    const auditLog = [{ at: now, kind: 'gem', seed: 42, troops: [7446], audit: {
      rulesVersion: 6, wishlistIds: [7446], reasons: ['normal'],
      pursuitBefore: { targetId: 7446, progress: 10, completed: 0, limit: 200 },
      pursuitAfter: { targetId: 7446, progress: 11, completed: 0, limit: 200 },
    } }];
    repo.records.set('gachaLog', JSON.stringify(auditLog));
    const hash = await repo.hash();
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision, hash)).toMatchObject({
      status: 'retired', mails: [], removed: [], revision: save.revision + 1,
    });
    expect(assembleRaw(repo.records).gachaWishlist).toMatchObject({ troopIds: [7251],
      pursuit: { targetId: null, progress: 12 } });
    expect(assembleRaw(repo.records).gachaLog).toEqual(auditLog);
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision + 1, await repo.hash())).toMatchObject({ status: 'already-retired' });
  });
  it('commits two different owner packages, preserves exact trait unlocks, and is CAS-idempotent', async () => {
    const save = baseSave();
    save.collection['7446'] = { copies: 0, level: 20, ascension: 0, traits: [true, true, false], locked: false };
    const repo = new Repo(save);
    const hash = await repo.hash();
    const host = hostOf(repo);
    expect(await host.retireBackedUpPlayer(save.revision, hash)).toMatchObject({ status: 'retired',
      removed: [7446, 7622], mails: ['retirement-2026-10-09:7446', 'retirement-2026-10-09:7622'] });
    const next = (await hostOf(repo).load({ preservePendingBattle: true })).save;
    expect(next.collection['7446']).toBeUndefined();
    expect(next.collection['7622']).toBeUndefined();
    expect(next.mailbox.items.filter(m => m.id.startsWith('retirement-2026-10-09:'))).toHaveLength(2);
    expect(next.mailbox.items.find(m => m.id.endsWith(':7622'))).toMatchObject({ mythicChoice: 1, currencies: { gems: 2000 },
      materials: { traitstones: { 'minor:green': 22, 'major:green': 16, celestial: 4 } } });
    expect(await host.retireBackedUpPlayer(save.revision, hash)).toMatchObject({ status: 'stale' });
  });
  it('only updates retired wishlist and cached opponents for the designated pending encounter', async () => {
    const save = baseSave();
    delete save.collection['7622'];
    save.teams = [];
    save.gachaWishlist.troopIds = [7446, 7251];
    save.gachaWishlist.pursuit.targetId = 7446;
    save.invasion.roster = { oldOpponent: 7446 } as unknown as typeof save.invasion.roster;
    save.pendingBattle = { mode: 'encounter', requestId: 'enc-1', issuedAt: now } as typeof save.pendingBattle;
    const repo = new Repo(save); const before = new Map(repo.records); const hash = await repo.hash();
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision, hash)).toMatchObject({ status: 'pending-battle' });
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision, hash, true)).toMatchObject({
      status: 'retired', revision: save.revision + 1, removed: [], mails: [], affectedTeams: [],
    });
    expect([...repo.records.keys()].filter(key => before.get(key) !== repo.records.get(key)).sort()).toEqual(['gachaWishlist', 'invasion', 'meta']);
    expect(repo.records.get('pendingBattle')).toBe(before.get('pendingBattle'));
    expect(assembleRaw(repo.records).gachaWishlist).toMatchObject({ troopIds: [7251], pursuit: { targetId: null } });
    expect((assembleRaw(repo.records).invasion as { roster: unknown }).roster).toBeNull();
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision, hash, true)).toMatchObject({ status: 'stale' });
  });
  it('keeps pending battle untouched when the player still owns a retired troop', async () => {
    const save = baseSave();
    save.pendingBattle = { mode: 'encounter', requestId: 'enc-1', issuedAt: now } as typeof save.pendingBattle;
    const repo = new Repo(save); const hash = await repo.hash();
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision, hash, true)).toMatchObject({ status: 'pending-battle' });
    expect(await repo.hash()).toBe(hash);
  });
  it('defers pending battles and does not overwrite existing retirement compensation', async () => {
    const save = baseSave();
    save.pendingBattle = { mode: 'arena' } as typeof save.pendingBattle;
    const repo = new Repo(save);
    const hash = await repo.hash();
    expect(await hostOf(repo).retireBackedUpPlayer(save.revision, hash)).toMatchObject({ status: 'pending-battle' });
    expect(await repo.hash()).toBe(hash);
    save.pendingBattle = null;
    save.mailbox.items.push({ id: 'retirement-2026-10-09:7622', title: 'existing', body: 'existing',
      sentAt: now, readAt: null, claimedAt: null, currencies: {}, materials: {}, mythicChoice: 1 });
    const conflicted = new Repo(save);
    const old = await conflicted.hash();
    expect(await hostOf(conflicted).retireBackedUpPlayer(save.revision, old)).toMatchObject({ status: 'mail-mismatch' });
    expect(await conflicted.hash()).toBe(old);
  });
});

describe('Graydove existing-letter correction', () => {
  function oldLetterSave() {
    const save = baseSave();
    delete save.collection['7622'];
    save.mailbox.items.push({ id: 'retirement-2026-10-09:7622', title: '部队退役补偿',
      body: 'old', sentAt: now, readAt: null, claimedAt: null, currencies: {},
      materials: { traitstones: { 'minor:green': 90, 'major:green': 40, celestial: 18, 'runic:green': 12 } }, mythicChoice: 1 });
    return save;
  }
  it('updates only original unclaimed mail and revision, with stones for original unlocked slot', async () => {
    const save = oldLetterSave();
    const repo = new Repo(save);
    const hash = await repo.hash();
    const host = hostOf(repo);
    expect(await host.correctGraydoveMail(save.revision, hash)).toMatchObject({ status: 'corrected', revision: save.revision + 1 });
    const next = (await hostOf(repo).load({ preservePendingBattle: true })).save;
    const mail = next.mailbox.items.find(m => m.id === 'retirement-2026-10-09:7622')!;
    expect(mail).toMatchObject({ claimedAt: null, currencies: { gems: 2000 }, mythicChoice: 1,
      materials: { traitstones: { 'minor:green': 22, 'major:green': 16, celestial: 4 } } });
    expect(mail.body).toContain('菊药');
    expect(mail.body).toContain('星星丽斯');
    expect(mail.body).toContain('可肝活动');
    expect(next.currencies).toEqual(save.currencies);
    expect(next.mailbox.items).toHaveLength(1);
    expect(await host.correctGraydoveMail(save.revision, hash)).toMatchObject({ status: 'stale' });
    expect(() => correctGraydoveRetirementMail(next)).toThrow('precondition');
  });
  it('rejects already claimed / modified mail, pending battles, stale hash, and does not persist failed writes', async () => {
    const claimed = oldLetterSave(); claimed.mailbox.items[0]!.claimedAt = now;
    const repo = new Repo(claimed); const hash = await repo.hash();
    expect(await hostOf(repo).correctGraydoveMail(claimed.revision, hash)).toMatchObject({ status: 'mail-mismatch' });
    expect(await repo.hash()).toBe(hash);
    const clean = new Repo(oldLetterSave()); const original = await clean.hash();
    expect(await hostOf(clean).correctGraydoveMail(claimed.revision, 'a'.repeat(64))).toMatchObject({ status: 'stale' });
    clean.failWrite = true;
    const host = hostOf(clean);
    await expect(host.correctGraydoveMail(claimed.revision, original)).rejects.toThrow('write failed');
    expect(await clean.hash()).toBe(original);
    clean.failWrite = false;
    expect(await host.correctGraydoveMail(claimed.revision, original)).toMatchObject({ status: 'corrected' });
    const battle = oldLetterSave(); battle.pendingBattle = { mode: 'invasion' } as typeof battle.pendingBattle;
    const battleRepo = new Repo(battle);
    expect(await hostOf(battleRepo).correctGraydoveMail(battle.revision, await battleRepo.hash())).toMatchObject({ status: 'pending-battle' });
  });
});

describe('Graydove claimed-letter wording-only maintenance', () => {
  const oldPhrase = '星星丽思（游戏内名称：星星丽斯）和菊药';
  function oldClaimedSave() {
    const save = baseSave();
    delete save.collection['7622'];
    save.mailbox.items.push({ id: 'retirement-2026-10-09:7622', title: '部队暂时退役补偿：菊药',
      body: `由于${oldPhrase}过强暂时移除，未来将以可肝活动的形式回归。`,
      sentAt: now, readAt: now + 1, claimedAt: now + 2, currencies: { gems: 2000 },
      materials: { traitstones: { 'minor:green': 22, 'major:green': 16, celestial: 4 } }, mythicChoice: 1 });
    save.currencies.gems += 2000;
    return save;
  }
  it('repairs a claimed letter without reissuing attachments or consuming choice', async () => {
    const before = oldClaimedSave();
    const repo = new Repo(before); const hash = await repo.hash();
    const host = hostOf(repo);
    expect(await host.updateGraydoveMailWording(before.revision, hash)).toMatchObject({ status: 'wording-updated', revision: before.revision + 1 });
    const after = (await hostOf(repo).load({ preservePendingBattle: true })).save;
    const mail = after.mailbox.items[0]!;
    expect(mail.body).toContain('星星丽斯和菊药');
    expect(mail.body).not.toContain('星星丽思');
    expect({ ...mail, body: before.mailbox.items[0]!.body }).toEqual(before.mailbox.items[0]);
    expect(after.currencies).toEqual(before.currencies);
    expect(() => updateGraydoveRetirementWording(after)).toThrow('precondition');
    expect(await host.updateGraydoveMailWording(before.revision, hash)).toMatchObject({ status: 'stale' });
  });
  it('preserves original save if the storage transaction fails or mail text differs', async () => {
    const before = oldClaimedSave(); const repo = new Repo(before);
    const hash = await repo.hash(); repo.failWrite = true;
    await expect(hostOf(repo).updateGraydoveMailWording(before.revision, hash)).rejects.toThrow('write failed');
    expect(await repo.hash()).toBe(hash);
    const modified = oldClaimedSave(); modified.mailbox.items[0]!.body = 'other';
    const different = new Repo(modified); const otherHash = await different.hash();
    expect(await hostOf(different).updateGraydoveMailWording(modified.revision, otherHash)).toMatchObject({ status: 'mail-mismatch' });
    expect(await different.hash()).toBe(otherHash);
    const battle = oldClaimedSave(); battle.pendingBattle = { mode: 'invasion' } as typeof battle.pendingBattle;
    const battleRepo = new Repo(battle); const battleHash = await battleRepo.hash();
    expect(await hostOf(battleRepo).updateGraydoveMailWording(battle.revision, battleHash)).toMatchObject({ status: 'pending-battle' });
    expect(await battleRepo.hash()).toBe(battleHash);
  });
});

describe('one-account historical draw audit repair', () => {
  it('restores only six backed-up draw audits under revision+raw hash CAS', async () => {
    const original = baseSave();
    const audit = { rulesVersion: 6, wishlistIds: [7446], reasons: ['normal'] as const,
      pursuitBefore: { targetId: 7446, progress: 10, completed: 0, limit: 200 },
      pursuitAfter: { targetId: 7446, progress: 11, completed: 0, limit: 200 } };
    const log = Array.from({ length: 6 }, (_, i) => ({ at: now + i, kind: 'gem' as const, seed: i + 1,
      troops: [7251], audit: { ...audit, reasons: ['normal'] as ['normal'] } }));
    original.gachaLog = log;
    const repo = new Repo(original);
    const broken = log.map(({ audit: _audit, ...entry }) => entry);
    repo.records.set('gachaLog', JSON.stringify(broken));
    const hash = await repo.hash();
    const host = hostOf(repo);
    expect(await host.restoreRetiredGachaAudits(original.revision, hash, log)).toMatchObject({
      status: 'audit-restored', revision: original.revision + 1, restored: 6 });
    expect(assembleRaw(repo.records).gachaLog).toEqual(log);
    expect((await hostOf(repo).load({ preservePendingBattle: true })).save.gachaLog).toEqual(log);
    expect(await host.restoreRetiredGachaAudits(original.revision, hash, log)).toMatchObject({ status: 'stale' });
  });
});


describe('Graydove extra mythic-only mail', () => {
  function eligible() {
    const save = baseSave();
    delete save.collection['7622'];
    save.mailbox.items.push({ id: 'retirement-2026-10-09:7622', title: 'existing', body: 'existing',
      sentAt: now, readAt: now, claimedAt: now, currencies: { gems: 2000 }, materials: {}, mythicChoice: 0 });
    save.mailbox.items.push({ id: 'graydove-extra-mythic-choice-2026-10-09', title: 'first', body: 'first',
      sentAt: now, readAt: now, claimedAt: now, currencies: {}, materials: {}, mythicChoice: 0 });
    save.invasion.roster = { oldOpponent: 7622 } as unknown as typeof save.invasion.roster;
    return save;
  }
  it('atomically grants only one independent choice, clears cached opponents, preserves previous compensation', async () => {
    const repo = new Repo(eligible()); const hash = await repo.hash(); const revision = JSON.parse(repo.records.get('meta')!).revision as number;
    const host = hostOf(repo);
    expect(await host.sendGraydoveMythicChoice(revision, hash)).toMatchObject({ status: 'sent', revision: revision + 1 });
    const next = (await hostOf(repo).load({ preservePendingBattle: true })).save;
    expect(next.invasion.roster).toBeNull();
    expect(next.mailbox.items).toHaveLength(3);
    expect(next.mailbox.items[0]).toMatchObject({ id: 'retirement-2026-10-09:7622', claimedAt: now, currencies: { gems: 2000 } });
    expect(next.mailbox.items[1]).toMatchObject({ id: 'graydove-extra-mythic-choice-2026-10-09', claimedAt: now });
    expect(next.mailbox.items[2]).toMatchObject({ id: 'graydove-extra-mythic-choice-2026-10-09-2',
      currencies: {}, materials: {}, mythicChoice: 1, claimedAt: null });
    expect(await host.sendGraydoveMythicChoice(revision, hash)).toMatchObject({ status: 'stale' });
    expect(await hostOf(repo).sendGraydoveMythicChoice(next.revision, await repo.hash())).toMatchObject({ status: 'already-sent' });
    expect(next.currencies).toEqual(eligible().currencies);
  });
  it('does not write when ticket exists, original mail is absent, hash is stale, or write fails', async () => {
    const battle = eligible(); battle.pendingBattle = { mode: 'invasion' } as typeof battle.pendingBattle;
    const pending = new Repo(battle);
    expect(await hostOf(pending).sendGraydoveMythicChoice(battle.revision, await pending.hash())).toMatchObject({ status: 'pending-battle' });
    expect((await hostOf(pending).load({ preservePendingBattle: true })).save.mailbox.items).toHaveLength(2);
    const missing = eligible(); missing.mailbox.items = [];
    const missingFirst = eligible(); missingFirst.mailbox.items.pop();
    const withoutFirst = new Repo(missingFirst);
    expect(await hostOf(withoutFirst).sendGraydoveMythicChoice(missingFirst.revision, await withoutFirst.hash())).toMatchObject({ status: 'mail-mismatch' });
    const absent = new Repo(missing);
    expect(await hostOf(absent).sendGraydoveMythicChoice(missing.revision, await absent.hash())).toMatchObject({ status: 'mail-mismatch' });
    const repo = new Repo(eligible()); const hash = await repo.hash(); const rev = eligible().revision;
    expect(await hostOf(repo).sendGraydoveMythicChoice(rev, 'f'.repeat(64))).toMatchObject({ status: 'stale' });
    repo.failWrite = true;
    await expect(hostOf(repo).sendGraydoveMythicChoice(rev, hash)).rejects.toThrow('write failed');
    expect(await repo.hash()).toBe(hash);
  });
});
