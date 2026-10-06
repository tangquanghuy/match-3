import { describe, expect, it, vi } from 'vitest';
import { adminTokenMatches, handleAdmin } from '../../worker/src/admin';
import type { Env } from '../../worker/src/env';

const key = 'a'.repeat(64);
const id = '7b4715d7-5d72-4950-aed5-a88f6834532b';
const account = { player_id: id, username: 'sszz', discord_id: '123456789', created_at: 100, last_login_at: 300 };
const persisted = { createdAt: 150, savedAt: 400, revision: 7, hero: { level: 66 }, mailbox: { items: [{ id: 'national-day-2026', claimedAt: 250 }] } };
const mail = [{ id: 'national-day-2026', title: '国庆快乐', sent_at: 180, delivered_at: 200 }];

function setup() {
  const inspectSave = vi.fn(async () => persisted);
  const load = vi.fn(() => { throw new Error('admin inspection must never load/settle the host'); });
  const prepare = vi.fn((sql: string) => ({
    bind: (..._args: unknown[]) => ({
      all: async () => ({ results: sql.includes('FROM accounts') ? [account] : mail }),
      first: async () => account,
    }),
  }));
  const env = {
    ADMIN_READ_TOKEN: key,
    DB: { prepare },
    PLAYERS: { idFromName: (name: string) => name, get: () => ({ inspectSave, load }) },
  } as unknown as Env;
  const request = (path: string, token: string | null, method = 'GET', body?: unknown) => new Request('https://example.test' + path, {
    method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { env, prepare, inspectSave, load, request };
}

describe('read-only admin save inspector', () => {
  it('rejects missing/incorrect secrets before touching data, and fails closed when unconfigured', async () => {
    const { env, prepare, request } = setup();
    expect(adminTokenMatches(request('/api/admin/player/' + id, key), key)).toBe(true);
    expect(adminTokenMatches(request('/api/admin/player/' + id, 'b'.repeat(64)), key)).toBe(false);
    expect((await handleAdmin(request('/api/admin/player/' + id, null), new URL('https://example.test/api/admin/player/' + id), env)).status).toBe(401);
    expect((await handleAdmin(request('/api/admin/player/' + id, 'b'.repeat(64)), new URL('https://example.test/api/admin/player/' + id), env)).status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
    env.ADMIN_READ_TOKEN = undefined;
    expect((await handleAdmin(request('/api/admin/player/' + id, key), new URL('https://example.test/api/admin/player/' + id), env)).status).toBe(404);
  });

  it('queries an exact save in the player DO instead of a mirror or gameplay load', async () => {
    const { env, inspectSave, load, request } = setup();
    const path = '/api/admin/player/' + id;
    const response = await handleAdmin(request(path, key), new URL('https://example.test' + path), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await response.json() as { account: typeof account; save: typeof persisted; systemMail: typeof mail };
    expect(result.account.username).toBe('sszz');
    expect(result.save.hero.level).toBe(66);
    expect(result.save.mailbox.items[0].claimedAt).toBe(250);
    expect(result.systemMail[0].delivered_at).toBe(200);
    expect(inspectSave).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it('supports searching nicknames and renders a non-cached, noindex-style admin page', async () => {
    const { env, request } = setup();
    const path = '/api/admin/lookup';
    const result = await handleAdmin(request(path, key, 'POST', { query: 'sszz' }), new URL('https://example.test' + path), env);
    expect((await result.json() as { accounts: typeof account[] }).accounts[0].player_id).toBe(id);
    const page = await handleAdmin(new Request('https://example.test/admin'), new URL('https://example.test/admin'), env);
    expect(page.headers.get('content-security-policy')).toContain("script-src 'nonce-");
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(await page.text()).toContain('线上玩家存档查询');
  });
});
