/** Read-only production save inspector. Never use the gameplay load/command path here. */
import type { Env } from './env';
import { adminPage } from './adminPage';
import { randomToken } from './session';
import { siteMetrics } from './siteMetrics';
import { hydrateSave } from '../../src/meta/state/save';
import { replaceRetiredMirror, type StoredRetirementMirror } from '../../src/meta/systems/retiredMirror';

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

  if (url.pathname.startsWith('/api/admin/replace-backed-up-mirror/') && request.method === 'POST') {
    const playerId = url.pathname.slice('/api/admin/replace-backed-up-mirror/'.length);
    if (!UUID.test(playerId)) return json({ error: 'not found' }, 404);
    const extra = new Request(url, { headers: { authorization: request.headers.get('x-maintenance-authorization') ?? '' } });
    if (!adminTokenMatches(request, env.ADMIN_READ_TOKEN) || !env.ADMIN_MAINTENANCE_TOKEN ||
        env.ADMIN_READ_TOKEN === env.ADMIN_MAINTENANCE_TOKEN ||
        !adminTokenMatches(extra, env.ADMIN_MAINTENANCE_TOKEN)) return json({ error: 'unauthorized' }, 401);
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return json({ error: 'json only' }, 415);
    const text = await request.text();
    if (text.length > 400) return json({ error: 'too large' }, 413);
    let body: { league?: unknown; recordedAt?: unknown; snapshotRef?: unknown; snapshotSha256?: unknown };
    try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    if (!body || !Number.isSafeInteger(body.league) || !Number.isSafeInteger(body.recordedAt) ||
        typeof body.snapshotRef !== 'string' || body.snapshotRef.length > 100 ||
        typeof body.snapshotSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(body.snapshotSha256))
      return json({ error: 'bad precondition' }, 400);
    const row = await env.DB.prepare(`SELECT m.snapshot, m.snapshot_ref, m.recorded_at, s.snapshot AS blob
      FROM invasion_mirrors m LEFT JOIN mirror_snapshots s ON s.snapshot_key = m.snapshot_ref
      WHERE m.player_id = ? AND m.league = ?`).bind(playerId, body.league).first<{
        snapshot: string; snapshot_ref: string | null; recorded_at: number; blob: string | null;
      }>();
    if (!row || row.snapshot_ref !== body.snapshotRef || row.recorded_at !== body.recordedAt || row.snapshot !== '{}')
      return json({ status: 'stale' }, 409);
    const source = row.blob;
    if (!source) return json({ status: 'missing-snapshot' }, 409);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== body.snapshotSha256) return json({ status: 'stale' }, 409);
    const raw = await env.PLAYERS.get(env.PLAYERS.idFromName(playerId)).inspectSave();
    if (!raw) return json({ status: 'missing-save' }, 409);
    let replacement: ReturnType<typeof replaceRetiredMirror>;
    try { replacement = replaceRetiredMirror(hydrateSave(raw, Date.now()), JSON.parse(source) as StoredRetirementMirror); }
    catch { return json({ status: 'invalid-mirror' }, 409); }
    const serialized = JSON.stringify(replacement.snapshot);
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    const nextRef = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    // Immutable snapshot first; the league row CAS rejects concurrent publishes.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO mirror_snapshots (snapshot_key, snapshot, first_player_id, created_at)
        VALUES (?, ?, ?, ?) ON CONFLICT (snapshot_key) DO NOTHING`).bind(nextRef, serialized, playerId, Date.now()),
      env.DB.prepare(`UPDATE invasion_mirrors SET snapshot_ref = ?, power = ?
        WHERE player_id = ? AND league = ? AND snapshot_ref = ? AND recorded_at = ? AND snapshot = '{}'`)
        .bind(nextRef, Math.round(replacement.power), playerId, body.league, body.snapshotRef, body.recordedAt),
    ]);
    // D1 may report zero affected rows in batch metadata despite committing the CAS update.
    // Confirm the authoritative row instead of misreporting a successful replacement.
    const committed = await env.DB.prepare(`SELECT snapshot_ref, recorded_at, power FROM invasion_mirrors
      WHERE player_id = ? AND league = ?`).bind(playerId, body.league).first<{ snapshot_ref: string; recorded_at: number; power: number }>();
    if (committed?.snapshot_ref !== nextRef || committed.recorded_at !== body.recordedAt ||
        committed.power !== Math.round(replacement.power)) return json({ status: 'stale' }, 409);
    return json({ status: 'replaced', snapshotRef: nextRef, league: body.league, power: Math.round(replacement.power) });
  }

  if (url.pathname.startsWith('/api/admin/retire-backed-up-player/') && request.method === 'POST') {
    const playerId = url.pathname.slice('/api/admin/retire-backed-up-player/'.length);
    if (!UUID.test(playerId)) return json({ error: 'not found' }, 404);
    const extra = new Request(url, { headers: { authorization: request.headers.get('x-maintenance-authorization') ?? '' } });
    if (!adminTokenMatches(request, env.ADMIN_READ_TOKEN) || !env.ADMIN_MAINTENANCE_TOKEN ||
        env.ADMIN_READ_TOKEN === env.ADMIN_MAINTENANCE_TOKEN ||
        !adminTokenMatches(extra, env.ADMIN_MAINTENANCE_TOKEN)) return json({ error: 'unauthorized' }, 401);
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return json({ error: 'json only' }, 415);
    const text = await request.text();
    if (text.length > 256) return json({ error: 'too large' }, 413);
    let body: { expectedRevision?: unknown; expectedRawSha256?: unknown };
    try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    if (!body || !Number.isSafeInteger(body.expectedRevision) || typeof body.expectedRawSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(body.expectedRawSha256)) return json({ error: 'bad precondition' }, 400);
    const account = await env.DB.prepare('SELECT player_id FROM accounts WHERE player_id = ?')
      .bind(playerId).first<{ player_id: string }>();
    if (!account) return json({ error: 'not found' }, 404);
    const actor = env.PLAYERS.get(env.PLAYERS.idFromName(playerId));
    const result = await actor.retireBackedUpPlayer(body.expectedRevision as number, body.expectedRawSha256, playerId);
    return json(result, result.status === 'retired' ? 200 : 409);
  }

  if ((url.pathname === '/api/admin/retire-graydove' || url.pathname === '/api/admin/correct-graydove-mail' || url.pathname === '/api/admin/update-graydove-mail-wording' || url.pathname === '/api/admin/send-graydove-mythic-choice') && request.method === 'POST') {
    // Only the inspected Graydove account; no caller-supplied player ID.
    // A separately configured maintenance secret gates the existing read token.
    const extra = new Request(url, { headers: { authorization: request.headers.get('x-maintenance-authorization') ?? '' } });
    if (!adminTokenMatches(request, env.ADMIN_READ_TOKEN) || !env.ADMIN_MAINTENANCE_TOKEN ||
        env.ADMIN_READ_TOKEN === env.ADMIN_MAINTENANCE_TOKEN ||
        !adminTokenMatches(extra, env.ADMIN_MAINTENANCE_TOKEN)) return json({ error: 'unauthorized' }, 401);
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return json({ error: 'json only' }, 415);
    const raw = await request.text();
    if (raw.length > 256) return json({ error: 'too large' }, 413);
    let body: { expectedRevision?: unknown; expectedRawSha256?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
    if (!body || !Number.isSafeInteger(body.expectedRevision) || typeof body.expectedRawSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(body.expectedRawSha256)) return json({ error: 'bad precondition' }, 400);
    const playerId = 'b072954c-914d-4e38-bf87-c4ed70aa7343';
    const account = await env.DB.prepare('SELECT username FROM accounts WHERE player_id = ?')
      .bind(playerId).first<{ username: string }>();
    if (!account?.username.startsWith('\u7070\u9e20')) return json({ error: 'account mismatch' }, 409);
    const actor = env.PLAYERS.get(env.PLAYERS.idFromName(playerId));
    if (url.pathname === '/api/admin/send-graydove-mythic-choice') {
      const result = await actor.sendGraydoveMythicChoice(body.expectedRevision as number, body.expectedRawSha256, playerId);
      return json(result, result.status === 'sent' ? 200 : 409);
    }
    if (url.pathname === '/api/admin/update-graydove-mail-wording') {
      const result = await actor.updateGraydoveMailWording(body.expectedRevision as number, body.expectedRawSha256, playerId);
      return json(result, result.status === 'wording-updated' ? 200 : 409);
    }
    if (url.pathname === '/api/admin/correct-graydove-mail') {
      const result = await actor.correctGraydoveMail(body.expectedRevision as number, body.expectedRawSha256, playerId);
      return json(result, result.status === 'corrected' ? 200 : 409);
    }
    const result = await actor.retireGraydove(body.expectedRevision as number, body.expectedRawSha256, playerId);
    return json(result, result.status === 'retired' ? 200 : 409);
  }

  if (!url.pathname.startsWith('/api/admin/')) return json({ error: 'not found' }, 404);
  if (!env.ADMIN_READ_TOKEN || env.ADMIN_READ_TOKEN.length < 32) return json({ error: 'not found' }, 404);
  if (!adminTokenMatches(request, env.ADMIN_READ_TOKEN)) return json({ error: 'unauthorized' }, 401);

  if (url.pathname === '/api/admin/traffic' && request.method === 'GET') {
    return json({ inspectedAt: Date.now(), ...await siteMetrics(env.DB) });
  }
  if (url.pathname.startsWith('/api/admin/traffic/player/')) {
    const playerId = url.pathname.slice('/api/admin/traffic/player/'.length);
    if (request.method !== 'GET' || !UUID.test(playerId)) return json({ error: 'not found' }, 404);
    const now = Date.now();
    const presence = await env.DB.prepare(`SELECT total_ms, last_seen, active FROM player_presence WHERE player_id = ?`)
      .bind(playerId).first<{ total_ms: number; last_seen: number; active: number }>();
    const { results: hours } = await env.DB.prepare(`SELECT hour_start, active_ms FROM player_active_hourly
      WHERE player_id = ? AND hour_start >= ? ORDER BY hour_start DESC LIMIT 24`)
      .bind(playerId, Math.floor(now / 3600000) * 3600000 - 23 * 3600000)
      .all<{ hour_start: number; active_ms: number }>();
    return json({ presence, hours, inspectedAt: now });
  }

  if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
    const now = Date.now();
    const loginSince = now - 24 * 3600000;
    // The existing view counts the current UTC hour plus the previous 23 buckets.
    const accounts = await env.DB.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN last_login_at >= ? THEN 1 ELSE 0 END) AS logged_in_24h
      FROM accounts
    `).bind(loginSince).first<{ total: number; logged_in_24h: number | null }>();
    const writes = await env.DB.prepare(`
      SELECT COUNT(*) AS players, COALESCE(SUM(writes_24h), 0) AS count,
             COALESCE(SUM(payload_bytes_24h), 0) AS bytes FROM player_writes_24h
    `).first<{ players: number; count: number; bytes: number }>();
    const { results: leaderboard } = await env.DB.prepare(`
      SELECT player_id, username, writes_24h, payload_bytes_24h, mirror_writes_24h,
             defense_writes_24h, weekly_writes_24h, snapshot_writes_24h
      FROM player_writes_24h ORDER BY writes_24h DESC, player_id LIMIT 50
    `).all();
    const { results: recentLogins } = await env.DB.prepare(`
      SELECT player_id, username, last_login_at FROM accounts
      ORDER BY last_login_at DESC, player_id LIMIT 20
    `).all();
    return json({ inspectedAt: now, accounts: { total: accounts?.total ?? 0, loggedIn24h: accounts?.logged_in_24h ?? 0 },
      writes: { players: writes?.players ?? 0, count: writes?.count ?? 0, bytes: writes?.bytes ?? 0 },
      leaderboard, recentLogins });
  }

  if (url.pathname.startsWith('/api/admin/writes/')) {
    const playerId = url.pathname.slice('/api/admin/writes/'.length);
    if (request.method !== 'GET' || !UUID.test(playerId)) return json({ error: 'not found' }, 404);
    const account = await env.DB.prepare(`SELECT player_id, username, last_login_at FROM accounts WHERE player_id = ?`)
      .bind(playerId).first<Pick<AdminAccount, 'player_id' | 'username' | 'last_login_at'>>();
    if (!account) return json({ error: 'not found' }, 404);
    const hourStart = Math.floor(Date.now() / 3600000) * 3600000;
    const { results: hours } = await env.DB.prepare(`
      SELECT hour_start, SUM(write_count) AS writes, SUM(payload_bytes) AS bytes,
             SUM(CASE WHEN source = 'mirror' THEN write_count ELSE 0 END) AS mirror,
             SUM(CASE WHEN source = 'defense' THEN write_count ELSE 0 END) AS defense,
             SUM(CASE WHEN source = 'weekly' THEN write_count ELSE 0 END) AS weekly,
             SUM(CASE WHEN source = 'snapshot' THEN write_count ELSE 0 END) AS snapshot
      FROM player_write_hourly WHERE player_id = ? AND hour_start >= ?
      GROUP BY hour_start ORDER BY hour_start DESC LIMIT 24
    `).bind(playerId, hourStart - 23 * 3600000).all();
    return json({ account, hours, inspectedAt: Date.now() });
  }

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
