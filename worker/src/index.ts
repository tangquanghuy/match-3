/**
 * Worker 入口：
 *  - /auth/*      Discord OAuth2 登录、登出、当前账号；
 *  - /api/meta/*  鉴权后转发到该玩家的 Durable Object（GET /save 整份快照，POST /command 执行命令）；
 *  - /            封面页（登录 + 用户协议）；登录成功后跳 /game；
 *  - 其余         静态资源（ASSETS）。
 */
import type { CommandReply } from '../../src/meta/server/protocol';
import type { Env } from './env';
import {
  cookie,
  createSession,
  OAUTH_STATE_COOKIE,
  randomToken,
  readCookie,
  SESSION_COOKIE,
  verifySession,
} from './session';

import { TERMS_VERSION } from '../../src/legal/terms';
import { deliverPendingSystemMail } from './systemMail';
import { handleAdmin } from './admin';

export { PlayerActor } from './playerActor';

/** 登录成功先回封面页：在那里把游戏资源预热进缓存，完成后自动跳 /game（见 src/cover/preload.ts） */
const AFTER_LOGIN_PAGE = '/?login=1';
const MAX_COMMAND_BYTES = 64 * 1024;

const json = (body: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const redirect = (location: string, cookies: string[] = []): Response => {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      // 封面页（登录 + 用户协议）
      if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/cover', url), request));
      if (url.pathname === '/admin' || url.pathname.startsWith('/api/admin/')) return await handleAdmin(request, url, env);
      if (url.pathname.startsWith('/auth/')) return await handleAuth(request, url, env);
      if (url.pathname.startsWith('/api/meta/')) return await handleMeta(request, url, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('request failed', url.pathname, error);
      return json({ error: 'internal' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// 鉴权
// ---------------------------------------------------------------------------

async function currentPlayer(request: Request, env: Env): Promise<string | null> {
  return verifySession(env.SESSION_SECRET, readCookie(request, SESSION_COOKIE), Date.now());
}

/** 写操作只接受同源请求（SameSite=Lax 之外再加一道 CSRF 防线） */
function sameOrigin(request: Request, url: URL): boolean {
  return request.headers.get('origin') === url.origin;
}

async function handleAuth(request: Request, url: URL, env: Env): Promise<Response> {
  switch (url.pathname) {
    case '/auth/login': {
      // 登录前必须在封面页同意当前版本的用户协议
      if (Number(url.searchParams.get('terms')) !== TERMS_VERSION) return redirect('/?error=terms');
      const devName = url.searchParams.get('dev');
      if (devName !== null) {
        // 本地开发专用：免 Discord 登录。线上 DEV_LOGIN 为空，此分支不可达
        if (env.DEV_LOGIN !== '1') return json({ error: 'dev login disabled' }, 403);
        if (!/^[\w-]{1,32}$/.test(devName)) return json({ error: 'bad name' }, 400);
        return loginAs(env, `dev:${devName}`, devName);
      }
      if (!env.DISCORD_CLIENT_ID) return json({ error: 'discord not configured' }, 500);
      const state = randomToken();
      const authorize = new URL('https://discord.com/oauth2/authorize');
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
      authorize.searchParams.set('scope', 'identify');
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
      authorize.searchParams.set('prompt', 'none');
      return redirect(authorize.toString(), [cookie(OAUTH_STATE_COOKIE, state, 600, '/auth')]);
    }

    case '/auth/callback': {
      const clearState = cookie(OAUTH_STATE_COOKIE, '', 0, '/auth');
      if (url.searchParams.get('error')) return redirect('/?error=denied', [clearState]);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const expected = readCookie(request, OAUTH_STATE_COOKIE);
      if (!code || !state || !expected || state !== expected) return redirect('/?error=state', [clearState]);
      const token = await exchangeCode(env, code, `${url.origin}/auth/callback`);
      const user = token ? await discordUser(token) : null;
      if (!user) return redirect('/?error=discord', [clearState]);
      const response = await loginAs(env, user.id, user.global_name ?? user.username);
      response.headers.append('set-cookie', clearState);
      return response;
    }

    case '/auth/logout': {
      if (request.method !== 'POST' || !sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
      return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
    }

    case '/auth/me': {
      const playerId = await currentPlayer(request, env);
      if (!playerId) return json({ error: 'unauthorized' }, 401);
      const row = await env.DB.prepare('SELECT username, terms_version FROM accounts WHERE player_id = ?')
        .bind(playerId).first<{ username: string; terms_version: number }>();
      if (!row) return json({ error: 'unauthorized' }, 401);
      return json({ playerId, username: row.username, termsAccepted: row.terms_version >= TERMS_VERSION });
    }
  }
  return json({ error: 'not found' }, 404);
}

/** 按外部身份找/建账号，记录同意的协议版本，签发会话并跳进游戏 */
async function loginAs(env: Env, externalId: string, username: string): Promise<Response> {
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT player_id FROM accounts WHERE discord_id = ?').bind(externalId).first<{ player_id: string }>();
  let playerId = existing?.player_id;
  if (playerId) {
    await env.DB.prepare('UPDATE accounts SET username = ?, last_login_at = ?, terms_version = ?, terms_agreed_at = ? WHERE player_id = ?')
      .bind(username, now, TERMS_VERSION, now, playerId).run();
  } else {
    playerId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO accounts (player_id, discord_id, username, created_at, last_login_at, terms_version, terms_agreed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(playerId, externalId, username, now, now, TERMS_VERSION, now).run();
  }
  const session = await createSession(env.SESSION_SECRET, playerId, now);
  return redirect(AFTER_LOGIN_PAGE, [cookie(SESSION_COOKIE, session.token, session.maxAge)]);
}

async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<string | null> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string };
  return body.access_token ?? null;
}

async function discordUser(accessToken: string): Promise<{ id: string; username: string; global_name?: string | null } | null> {
  const response = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string; username?: string; global_name?: string | null };
  return user.id && user.username ? { id: user.id, username: user.username, global_name: user.global_name } : null;
}

// ---------------------------------------------------------------------------
// 存档 API
// ---------------------------------------------------------------------------

async function handleMeta(request: Request, url: URL, env: Env): Promise<Response> {
  const playerId = await currentPlayer(request, env);
  if (!playerId) return json({ error: 'unauthorized' }, 401);
  const actor = env.PLAYERS.get(env.PLAYERS.idFromName(playerId));

  if (url.pathname === '/api/meta/save' && request.method === 'GET') {
    try {
      await deliverPendingSystemMail(env.DB, actor, playerId);
    } catch (error) {
      console.error('system mail delivery failed', playerId, error);
    }
    return json(await actor.load(url.searchParams.get('sync') === '1', playerId));
  }

  if (url.pathname === '/api/meta/command' && request.method === 'POST') {
    if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'json only' }, 415);
    const text = await request.text();
    if (text.length > MAX_COMMAND_BYTES) return json({ error: 'too large' }, 413);
    let command: unknown;
    try {
      command = JSON.parse(text);
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    if (!isCommandShape(command)) return json({ error: 'bad command' }, 400);
    const type = (command as { type: string }).type;
    // Never trust a name in command.args: resolve the signed-in account in D1.
    const identity = type === 'createCharacter'
      ? await env.DB.prepare('SELECT username FROM accounts WHERE player_id = ?').bind(playerId).first<{ username: string }>()
      : null;
    if (type === 'createCharacter' && !identity) return json({ error: 'unauthorized' }, 401);
    const reply = await actor.execute(command as never, playerId, identity?.username) as CommandReply | { rateLimited: true };
    if ('rateLimited' in reply) return json({ error: 'rate limited' }, 429, { 'retry-after': '1' });
    // Reset and cookie clearing share one response; no second logout request can fail in between.
    if (type === 'resetToNewGame' && (reply.result as { ok?: boolean })?.ok === true) {
      return json(reply, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
    }
    return json(reply);
  }

  return json({ error: 'not found' }, 404);
}

/** 形状预检；具体参数由权威核心校验（非法参数返回 MetaFailure，不落盘） */
function isCommandShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { type, args } = value as { type?: unknown; args?: unknown };
  return typeof type === 'string' && type.length <= 64 && typeof args === 'object' && args !== null && !Array.isArray(args);
}
