import { describe, expect, it, vi } from 'vitest';
import { buildDemoSave } from '../../src/meta/server/demo';
import { defaultEnv } from '../../src/meta/server/env';
import { MetaHost, type RecordBatch, type SaveRepository } from '../../src/meta/server/host';
import { MemoryMirrorStore, mirrorOwnerKey } from '../../src/meta/server/mirrorPool';
import { saveToRecords, recordsToSave, type SaveRecords } from '../../src/meta/state/records';
import { defenseRecord, defensePublicationStamp, queueDefensePublish } from '../../src/meta/systems/invasionDefense';
import { INVASION_MATCHMAKING } from '../../src/meta/data/invasionMatchmaking';

const NOW = Date.UTC(2026, 9, 1, 12);
class Repo implements SaveRepository {
  records: SaveRecords;
  batches: RecordBatch[] = [];
  failNext = false;
  constructor() {
    const save = buildDemoSave(NOW);
    save.invasion.defenseTeam = structuredClone(save.teams[0]!);
    this.records = saveToRecords(save);
  }
  async load() { return { records: new Map(this.records), warning: null }; }
  async write(batch: RecordBatch) {
    if (this.failNext) { this.failNext = false; throw new Error('disk offline'); }
    this.batches.push(batch);
    for (const k of batch.del) this.records.delete(k);
    for (const [k, v] of batch.set) this.records.set(k, v);
  }
}
function fixture() {
  let now = NOW;
  const repo = new Repo();
  const store = new MemoryMirrorStore();
  const pool = store.forOwner('defender');
  const publish = vi.spyOn(pool, 'publish');
  const reportVp = vi.spyOn(pool, 'reportVp');
  const schedule = vi.fn();
  const makeHost = (flushDelayMs = 0) => new MetaHost(repo,
    defaultEnv({ now: () => now, seed: () => 1234, allowDev: true }),
    { fresh: 'demo', mirrorPool: pool, schedule, flushDelayMs });
  return { repo, pool, store, publish, reportVp, schedule, makeHost, host: makeHost(),
    advance: (ms: number) => { now += ms; } };
}
const sync = { type: 'syncInvasionDefense', args: {} } as const;
const seen = { type: 'markMaterialsSeen', args: {} } as const;

describe('write optimization and reliable no-op handling', () => {
  it('writes zero records and makes zero mirror/VP writes on repeated unchanged defense sync', async () => {
    const f = fixture();
    const first = await f.host.execute(sync);
    expect(first.result).toEqual({ ok: true });
    expect(f.publish).toHaveBeenCalledTimes(1);
    expect(f.reportVp).toHaveBeenCalledTimes(1);
    f.repo.batches.length = 0;
    for (let i = 0; i < 10; i++) {
      f.advance(31_000);
      const reply = await f.host.execute(sync);
      expect(reply.patch).toBeNull();
      expect(reply.revision).toBe(first.revision);
    }
    expect(f.repo.batches).toEqual([]);
    expect(f.publish).toHaveBeenCalledTimes(1);
    expect(f.reportVp).toHaveBeenCalledTimes(1);
    expect(f.host.pendingRecords).toBe(0);
  });
  it('does not rewrite a seen marker or schedule empty delayed flushes', async () => {
    const f = fixture();
    await f.host.load(); await f.host.flush(); f.repo.batches.length = 0;
    const host = f.makeHost(500);
    const reply = await host.execute(seen);
    expect(reply.patch).toBeNull();
    expect(f.repo.batches).toEqual([]);
    expect(f.schedule).not.toHaveBeenCalled();
  });
  it('persists a real unread change once and retries a failed write on an idempotent command', async () => {
    const f = fixture();
    const save = recordsToSave(f.repo.records, NOW); save.materialsUnread = true;
    f.repo.records = saveToRecords(save);
    f.repo.failNext = true;
    await expect(f.host.execute(seen)).rejects.toThrow('disk offline');
    expect(f.host.pendingRecords).toBeGreaterThan(0);
    const reply = await f.host.execute(seen);
    expect(reply.patch).toBeNull();
    expect(reply.revision).toBe(save.revision + 1);
    expect(f.repo.batches).toHaveLength(1);
    expect(f.host.pendingRecords).toBe(0);
    expect(recordsToSave(f.repo.records, NOW).materialsUnread).toBe(false);
    await f.host.execute(seen);
    expect(f.repo.batches).toHaveLength(1);
  });
  it('keeps acknowledged publication across cold starts, with a 30-minute heartbeat', async () => {
    const f = fixture();
    await f.host.execute(sync);
    expect(recordsToSave(f.repo.records, NOW).invasion.lastDefensePublish).not.toBeNull();
    const restarted = f.makeHost();
    await restarted.load(); await restarted.flush(); f.repo.batches.length = 0;
    f.advance(INVASION_MATCHMAKING.republishMs - 1);
    expect((await restarted.execute(sync)).patch).toBeNull();
    expect(f.repo.batches).toEqual([]);
    expect(f.publish).toHaveBeenCalledTimes(1);
    f.advance(1); await restarted.execute(sync);
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect(f.repo.batches).toHaveLength(2); // pending snapshot + durable acknowledgement
  });
  it('does not acknowledge failed publication and retries persisted outbox on restart', async () => {
    const f = fixture();
    f.publish.mockRejectedValueOnce(new Error('pool offline'));
    await f.host.execute(sync);
    const stored = recordsToSave(f.repo.records, NOW);
    expect(stored.invasion.defensePublishPending).toBe(true);
    expect(stored.invasion.lastDefensePublish).toBeNull();
    expect(f.schedule).toHaveBeenCalled();
    await f.makeHost().load();
    const ack = recordsToSave(f.repo.records, NOW);
    expect(ack.invasion.defensePublishPending).toBe(false);
    expect(ack.invasion.lastDefensePublish).not.toBeNull();
    expect(f.publish).toHaveBeenCalledTimes(2);
  });
  it('retries failed VP effects even when the retry needs no save changes', async () => {
    const f = fixture();
    f.reportVp.mockRejectedValueOnce(new Error('pool offline'));
    await f.host.execute(sync); f.repo.batches.length = 0;
    f.advance(1000);
    expect((await f.host.execute(sync)).patch).toBeNull();
    expect(f.repo.batches).toEqual([]);
    expect(f.reportVp).toHaveBeenCalledTimes(2);
    await f.host.execute(sync);
    expect(f.reportVp).toHaveBeenCalledTimes(2);
  });
  it('accounts new defense rewards exactly once and stays write-free after reloading populated history', async () => {
    const f = fixture();
    await f.host.execute(sync);
    await f.store.forOwner('attacker').recordDefense({ id: 'ticket', at: NOW + 1000,
      defender: mirrorOwnerKey('defender'), defenderWon: true, surrendered: false, frenzy: false });
    f.advance(2000);
    await f.host.execute(sync);
    const saved = recordsToSave(f.repo.records, NOW + 2000);
    expect(saved.invasion.defenseProgress.rewards.gold).toBe(100);
    expect(saved.invasion.defenseProgress.cursor).toBeGreaterThan(0);
    expect(f.publish).toHaveBeenCalledTimes(2); // VP changed
    const restarted = f.makeHost();
    await restarted.load(); await restarted.flush(); f.repo.batches.length = 0;
    expect((await restarted.execute(sync)).patch).toBeNull();
    expect(f.repo.batches).toEqual([]);
    const claimed = await restarted.execute({ type: 'claimInvasionDefense', args: {} });
    expect(claimed.result).toMatchObject({ ok: true, gold: 100 });
    f.repo.batches.length = 0;
    const duplicate = await restarted.execute({ type: 'claimInvasionDefense', args: {} });
    expect(duplicate.result).toMatchObject({ ok: true, gold: 0 });
    expect(duplicate.patch).toBeNull(); expect(f.repo.batches).toEqual([]);
  });
  it('does not rewrite an identical defense deployment', async () => {
    const f = fixture();
    await f.host.execute(sync); f.repo.batches.length = 0;
    f.advance(1000);
    const reply = await f.host.execute({ type: 'setInvasionDefense', args: { index: 0 } });
    expect(reply.result).toEqual({ ok: true });
    expect(reply.patch).toBeNull();
    expect(f.repo.batches).toEqual([]);
    expect(f.publish).toHaveBeenCalledTimes(1);
  });
  it('replays publication when D1 accepted it but the local acknowledgement failed', async () => {
    const f = fixture();
    f.publish.mockImplementationOnce(async record => {
      await f.store.forOwner('defender').publish(record);
      f.repo.failNext = true;
    });
    await expect(f.host.execute(sync)).rejects.toThrow('disk offline');
    const stored = recordsToSave(f.repo.records, NOW);
    expect(stored.invasion.defensePublishPending).toBe(true);
    expect(stored.invasion.lastDefensePublish).toBeNull();
    await f.makeHost().load();
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect(recordsToSave(f.repo.records, NOW).invasion.defensePublishPending).toBe(false);
  });
  it('invalidates an old successful VP cache after a lost acknowledgement (A -> B -> A)', async () => {
    const f = fixture();
    await f.host.execute(sync);
    const baseline = f.reportVp.mock.calls[0]![0].vp;
    f.reportVp.mockImplementationOnce(async report => {
      await f.store.forOwner('defender').reportVp(report);
      throw new Error('lost acknowledgement');
    });
    const attacker = f.store.forOwner('attacker');
    await attacker.recordDefense({ id: 'win', at: NOW + 1000, defender: mirrorOwnerKey('defender'),
      defenderWon: true, surrendered: false, frenzy: false });
    f.advance(2000); await f.host.execute(sync);
    await attacker.recordDefense({ id: 'loss', at: NOW + 3000, defender: mirrorOwnerKey('defender'),
      defenderWon: false, surrendered: false, frenzy: false });
    f.advance(2000); await f.host.execute(sync);
    expect(f.reportVp.mock.calls.map(([r]) => r.vp)).toEqual([baseline, baseline + 2, baseline]);
  });
  it('migrates absent or malformed publication stamps to null without losing pending delivery', () => {
    const repo = new Repo();
    for (const stamp of [undefined, { fingerprint: 'bad', at: NOW },
      { fingerprint: '01234567', at: -1 }, { fingerprint: '01234567', at: 1.5 }]) {
      const raw = JSON.parse(repo.records.get('invasion')!);
      raw.lastDefensePublish = stamp; raw.defensePublishPending = true;
      const records = new Map(repo.records); records.set('invasion', JSON.stringify(raw));
      const hydrated = recordsToSave(records, NOW);
      expect(hydrated.invasion.lastDefensePublish).toBeNull();
      expect(hydrated.invasion.defensePublishPending).toBe(true);
    }
  });
  it('compares all published fields except recordedAt and never cancels pending delivery', () => {
    const save = buildDemoSave(NOW);
    save.invasion.defenseTeam = structuredClone(save.teams[0]!);
    const record = defenseRecord(save, NOW)!;
    const stamp = defensePublicationStamp(record);
    expect(defensePublicationStamp({ ...record, recordedAt: NOW + 1 }).fingerprint).toBe(stamp.fingerprint);
    for (const change of [{ league: record.league + 1 }, { vp: record.vp + 1 },
      { weekStart: record.weekStart + 604800000 }, { ruleset: 'changed' }, { heroLevel: record.heroLevel + 1 },
      { team: [...record.team].reverse() }]) {
      expect(defensePublicationStamp({ ...record, ...change }).fingerprint).not.toBe(stamp.fingerprint);
    }
    save.invasion.lastDefensePublish = stamp;
    queueDefensePublish(save, NOW + 1);
    expect(save.invasion.defensePublishPending).toBe(false);
    save.invasion.defensePublishPending = true;
    queueDefensePublish(save, NOW + 2);
    expect(save.invasion.defensePublishPending).toBe(true);
    save.invasion.defensePublishPending = false;
    queueDefensePublish(save, NOW - 1);
    expect(save.invasion.defensePublishPending).toBe(true);
  });
});
