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
