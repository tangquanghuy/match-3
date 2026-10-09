import { describe, expect, it } from 'vitest';
// @ts-expect-error node types are not installed in this browser project
import { readFileSync } from 'node:fs';
import { defaultEnv } from '../../src/meta/server/env';
import { MetaHost, type SaveRepository, type RecordBatch } from '../../src/meta/server/host';
import type { SaveRecords } from '../../src/meta/state/records';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { LIKES_9000_CODE, LIKES_9000_MAIL_ID, hasRedeemedLikes9000 } from '../../src/meta/systems/redeemCodes';

const now = 1_800_000_000_000;
const env = defaultEnv({ now: () => now, seed: () => 42 });
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

const command = { type: 'redeemCode', args: { code: LIKES_9000_CODE } } as const;

describe('per-save mail redemption', () => {
  it('uses the original 9000-likes campaign ID, text and attachment, without crediting the wallet on redemption', async () => {
    const sql = readFileSync('worker/campaigns/2026-10-06-creation-corridor-9000-likes.sql', 'utf8');
    const host = new MetaHost(new Repo(), env, { fresh: 'new' });
    const original = (await host.load()).save;
    const reply = await host.execute(command);
    expect(reply.result).toEqual({ ok: true, mailId: LIKES_9000_MAIL_ID });
    const updated = (await host.load()).save;
    expect(updated.currencies).toEqual(original.currencies);
    const mail = updated.mailbox.items.find(m => m.id === LIKES_9000_MAIL_ID)!;
    expect(sql).toContain(`'${LIKES_9000_MAIL_ID}'`);
    expect(sql).toContain(`'${mail.title}'`);
    expect(sql).toContain(`'${mail.body}'`);
    expect(sql).toContain('"gold":900000,"gems":4500');
    expect(mail).toMatchObject({ currencies: { gold: 900_000, gems: 4_500 }, claimedAt: null, readAt: null });
    expect((await host.execute(command)).result).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
    expect((await host.load()).save.mailbox.items.filter(m => m.id === LIKES_9000_MAIL_ID)).toHaveLength(1);
    expect((await host.execute({ type: 'claimMail', args: { id: LIKES_9000_MAIL_ID } })).result).toEqual({ ok: true });
    expect((await host.load()).save.currencies.gems).toBe(original.currencies.gems + 4500);
    expect((await host.execute(command)).result).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
  });

  it('serializes simultaneous redemptions so only one attachment is delivered', async () => {
    const host = new MetaHost(new Repo(), env, { fresh: 'new' });
    const replies = await Promise.all([host.execute(command), host.execute(command)]);
    expect(replies.filter(reply => reply.result.ok)).toHaveLength(1);
    expect((await host.load()).save.mailbox.items.filter(mail => mail.id === LIKES_9000_MAIL_ID)).toHaveLength(1);
  });
  it('detects previously delivered and already claimed 9000-like mail, including rehydrated saves', async () => {
    const repo = new Repo();
    const host = new MetaHost(repo, env, { fresh: 'new' });
    const mail = { id: LIKES_9000_MAIL_ID, title: '旧邮件', body: '已发', sentAt: now - 1,
      readAt: now - 1, claimedAt: now - 1, currencies: { gold: 900_000, gems: 4_500 }, materials: {} };
    expect(await host.receiveMail([mail])).toEqual([LIKES_9000_MAIL_ID]);
    const restarted = new MetaHost(repo, env, { fresh: 'new' });
    expect(hasRedeemedLikes9000((await restarted.load()).save)).toBe(true);
    expect((await restarted.execute(command)).result).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
    expect((await restarted.load()).save.mailbox.items).toHaveLength(1);
  });

  it('keeps one durable receipt across retries and resets the entitlement only with the entire save', async () => {
    const repo = new Repo();
    const host = new MetaHost(repo, env, { fresh: 'new' });
    repo.failWrite = true;
    await expect(host.execute(command)).rejects.toThrow('write failed');
    repo.failWrite = false;
    const restarted = new MetaHost(repo, env, { fresh: 'new' });
    expect(hasRedeemedLikes9000((await restarted.load()).save)).toBe(false);
    expect((await restarted.execute(command)).result.ok).toBe(true);
    // Delayed D1 delivery of the original campaign must acknowledge the same mail, not grant twice.
    expect(await restarted.receiveMail([{ id: LIKES_9000_MAIL_ID, title: 'old', body: 'old', sentAt: now - 1,
      readAt: null, claimedAt: null, currencies: { gold: 900_000, gems: 4_500 }, materials: {} }])).toEqual([LIKES_9000_MAIL_ID]);
    expect((await restarted.load()).save.mailbox.items.filter(m => m.id === LIKES_9000_MAIL_ID)).toHaveLength(1);
    expect((await restarted.execute({ type: 'resetToNewGame', args: {} })).result.ok).toBe(true);
    expect(hasRedeemedLikes9000((await restarted.load()).save)).toBe(false);
    expect((await restarted.execute(command)).result.ok).toBe(true);
    expect((await restarted.load()).save.mailbox.items.filter(m => m.id === LIKES_9000_MAIL_ID)).toHaveLength(1);
  });

  it('rejects unknown codes and ordinary reload does not reset usage', async () => {
    const save = newSave({ now });
    expect(hasRedeemedLikes9000(migrateSave(JSON.parse(JSON.stringify(save)), now))).toBe(false);
    const host = new MetaHost(new Repo(), env, { fresh: 'new' });
    expect((await host.execute({ type: 'redeemCode', args: { code: 'wrong' } })).result).toMatchObject({ ok: false, code: 'INVALID' });
    expect((await host.load()).save.mailbox.items).toHaveLength(0);
  });
});
