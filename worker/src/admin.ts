/** Read-only production save inspector. Never use the gameplay load/command path here. */
import type { Env } from './env';
import { adminPage } from './adminPage';
import { randomToken } from './session';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export interface AdminAccount {
  player_id: string;
  username: string;
  discord_id: string;
  created_at: number;
  last_login_at: number;
}

/** Tokens are supplied in a request header, not a URL or a cookie. Fail closed without a configured secret. */
export function adminTokenMatches(request: Request, configured?: string): boolean {
  if (!configured || configured.length < 32) return false;
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get('authorization') ?? '');
  if (!match || match[1].length !== configured.length) return false;
  let difference = 0;
  for (let i = 0; i < configured.length; i++) difference |= configured.charCodeAt(i) ^ match[1].charCodeAt(i);
  return difference === 0;
}

export async function handleAdmin(request: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === '/admin' && request.method === 'GET') {
    const nonce = randomToken();
    return new Response(adminPage.replaceAll('__ADMIN_NONCE__', nonce), {
      headers: {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      },
    });
  }

  if (!url.pathname.startsWith('/api/admin/')) return json({ error: 'not found' }, 404);
  if (!env.ADMIN_READ_TOKEN || env.ADMIN_READ_TOKEN.length < 32) return json({ error: 'not found' }, 404);
  if (!adminTokenMatches(request, env.ADMIN_READ_TOKEN)) return json({ error: 'unauthorized' }, 401);

  if (url.pathname === '/api/admin/lookup' && request.method === 'POST') {
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return json({ error: 'json only' }, 415);
    if (Number(request.headers.get('content-length') ?? 0) > 512) return json({ error: 'too large' }, 413);
    const text = await request.text();
    if (text.length > 512) return json({ error: 'too large' }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    const query = typeof body === 'object' && body !== null && 'query' in body && typeof body.query === 'string'
      ? body.query.trim() : '';
    if (!query || query.length > 64) return json({ error: 'query must be 1-64 characters' }, 400);
    const { results } = await env.DB.prepare(`
      SELECT player_id, username, discord_id, created_at, last_login_at FROM accounts
      WHERE player_id = ? OR instr(lower(username), lower(?)) > 0
      ORDER BY CASE WHEN lower(username) = lower(?) THEN 0 ELSE 1 END, username, player_id LIMIT 20
    `).bind(query, query, query).all<AdminAccount>();
    return json({ accounts: results });
  }

  const playerId = url.pathname.slice('/api/admin/player/'.length);
  if (request.method !== 'GET' || !url.pathname.startsWith('/api/admin/player/') || !UUID.test(playerId)) {
    return json({ error: 'not found' }, 404);
  }
  const account = await env.DB.prepare(`
    SELECT player_id, username, discord_id, created_at, last_login_at FROM accounts WHERE player_id = ?
  `).bind(playerId).first<AdminAccount>();
  if (!account) return json({ error: 'not found' }, 404);

  // Direct SQLite read: no auto-delivery, battle forfeiture, reward grant or implicit new save.
  const save = await env.PLAYERS.get(env.PLAYERS.idFromName(playerId)).inspectSave();
  const { results: systemMail } = await env.DB.prepare(`
    SELECT campaign.id, campaign.title, recipient.sent_at, recipient.delivered_at
    FROM system_mail_recipients AS recipient
    JOIN system_mail_campaigns AS campaign ON campaign.id = recipient.campaign_id
    WHERE recipient.player_id = ? ORDER BY recipient.sent_at DESC, campaign.id DESC
  `).bind(playerId).all<{ id: string; title: string; sent_at: number; delivered_at: number | null }>();
  return json({ account, save, systemMail, inspectedAt: Date.now() });
}
