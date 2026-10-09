import { describe, expect, it } from 'vitest';
import { defaultEnv } from '../../src/meta/server/env';
import { MetaHost, type RecordBatch, type SaveRepository } from '../../src/meta/server/host';
import type { SaveRecords } from '../../src/meta/state/records';
import type { MailItem } from '../../src/meta/state/schema';
import { decodeSystemMail, deliverPendingSystemMail, type SystemMailRow } from '../../worker/src/systemMail';

const row: SystemMailRow = {
  id: 'national-day-2026', title: '国庆快乐', body: '国庆快乐',
  sent_at: 1_791_000_000_000, currencies_json: '{"gold":1000000,"gems":5000}',
  materials_json: '{}', class_xp: 0,
};

class Repo implements SaveRepository {
  records: SaveRecords | null = null;
  failWrite = false;
  async load() { return { records: this.records ? new Map(this.records) : null, warning: null }; }
  async write(batch: RecordBatch) {
    if (this.failWrite) throw new Error('write failed');
    const next = new Map(this.records ?? []);
    for (const key of batch.del) next.delete(key);
    for (const [key, value] of batch.set) next.set(key, value);
    this.records = next;
  }
}

function fakeDb() {
  const delivered: string[] = [];
  let failAck = false;
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all() { return { results: delivered.length ? [] : [row] }; },
            sql, params,
          };
        },
      };
    },
    async batch(statements: { params: unknown[] }[]) {
      if (failAck) throw new Error('D1 failed');
      for (const statement of statements) delivered.push(statement.params[1] as string);
      return [];
    },
  };
  return { db: db as unknown as Parameters<typeof deliverPendingSystemMail>[0], delivered, setFailAck(value: boolean) { failAck = value; } };
}

describe('database system mail', () => {
  it('decodes the holiday attachment into the existing mailbox format', () => {
    expect(decodeSystemMail(row)).toMatchObject({
      id: row.id, title: row.title, sentAt: row.sent_at,
      currencies: { gold: 1_000_000, gems: 5_000 }, claimedAt: null,
    });
  });

  it('delivers mythic selections from a campaign without putting them in materials', () => {
    expect(decodeSystemMail({ ...row, id: 'mythic-2026', mythic_choice: 2, materials_json: '{"traitstones":{"celestial":36}}' })).toMatchObject({
      mythicChoice: 2, materials: { traitstones: { celestial: 36 } }, claimedAt: null,
    });
  });

  it('persists once and can retry after D1 acknowledgement fails', async () => {
    const repo = new Repo();
    const host = new MetaHost(repo, defaultEnv({ now: () => row.sent_at }), { fresh: 'new' });
    const receiver = { receiveMail: (items: MailItem[]) => host.receiveMail(items) };
    const d1 = fakeDb();
    d1.setFailAck(true);
    await expect(deliverPendingSystemMail(d1.db, receiver, 'player-1')).rejects.toThrow('D1 failed');
    expect((await host.load()).save.mailbox.items).toHaveLength(1);
    d1.setFailAck(false);
    await deliverPendingSystemMail(d1.db, receiver, 'player-1');
    expect(d1.delivered).toEqual([row.id]);
    const restarted = new MetaHost(repo, defaultEnv({ now: () => row.sent_at }), { fresh: 'new' });
    expect((await restarted.load()).save.mailbox.items).toHaveLength(1);
  });

  it('commits a mythic grant and consumes its mail entitlement together across host restarts', async () => {
    const repo = new Repo();
    const now = row.sent_at;
    const host = new MetaHost(repo, defaultEnv({ now: () => now }), { fresh: 'new' });
    const mail = decodeSystemMail({ ...row, id: 'mythic-host-test', currencies_json: '{}',
      materials_json: '{"traitstones":{"celestial":18}}', mythic_choice: 1 });
    await host.receiveMail([mail]);
    expect((await host.execute({ type: 'chooseMailMythic', args: { id: mail.id, troopId: 7440 } })).result.ok).toBe(false);
    await host.execute({ type: 'claimMail', args: { id: mail.id } });
    const beforeChoice = new MetaHost(repo, defaultEnv({ now: () => now }), { fresh: 'new' });
    expect((await beforeChoice.load()).save.mailbox.items[0]).toMatchObject({ mythicChoice: 1 });
    expect((await beforeChoice.load()).save.materials.traitstones.celestial).toBe(18);
    repo.failWrite = true;
    await expect(host.execute({ type: 'chooseMailMythic', args: { id: mail.id, troopId: 7440 } })).rejects.toThrow('write failed');
    const afterFailedWrite = new MetaHost(repo, defaultEnv({ now: () => now }), { fresh: 'new' });
    expect((await afterFailedWrite.load()).save.mailbox.items[0]).toMatchObject({ mythicChoice: 1 });
    expect((await afterFailedWrite.load()).save.collection['7440']).toBeUndefined();
    repo.failWrite = false;
    expect((await afterFailedWrite.execute({ type: 'chooseMailMythic', args: { id: mail.id, troopId: 7440 } })).result)
      .toMatchObject({ ok: true, duplicate: false });
    const restarted = new MetaHost(repo, defaultEnv({ now: () => now }), { fresh: 'new' });
    const saved = (await restarted.load()).save;
    expect(saved.mailbox.items[0]!.mythicChoice ?? 0).toBe(0);
    expect(saved.collection['7440']).toBeDefined();
    expect(saved.materials.traitstones.celestial).toBe(18);
    expect((await restarted.execute({ type: 'chooseMailMythic', args: { id: mail.id, troopId: 7440 } })).result.ok).toBe(false);
    expect((await restarted.load()).save.collection['7440']?.copies).toBe(0);
  });

  it('does not acknowledge until a failed save write succeeds', async () => {
    const repo = new Repo();
    const host = new MetaHost(repo, defaultEnv({ now: () => row.sent_at }), { fresh: 'new' });
    const receiver = { receiveMail: (items: MailItem[]) => host.receiveMail(items) };
    const d1 = fakeDb();
    repo.failWrite = true;
    await expect(deliverPendingSystemMail(d1.db, receiver, 'player-1')).rejects.toThrow('write failed');
    expect(d1.delivered).toEqual([]);
    repo.failWrite = false;
    await deliverPendingSystemMail(d1.db, receiver, 'player-1');
    expect(d1.delivered).toEqual([row.id]);
    expect((await host.load()).save.mailbox.items).toHaveLength(1);
  });
});
