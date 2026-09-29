/**
 * Worker 入口：
 *  - /auth/*      Discord OAuth2 登录、登出、当前账号；
 *  - /api/meta/*  鉴权后转发到该玩家的 Durable Object（GET /save 整份快照，POST /command 执行命令）；
 *  - /            跳到游戏外壳页；
 *  - 其余         静态资源（ASSETS）。
 */
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

export { PlayerActor } from './playerActor';

/** 静态资源默认去掉 .html 后缀（/game.html 会再 307 到 /game），直接跳干净路径 */
const GAME_PAGE = '/game';
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
      if (url.pathname === '/') return redirect(GAME_PAGE);
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
      return redirect(authorize.toString(), [cookie(OAUTH_STATE_COOKIE, state, 600, '/auth')]);
    }

    case '/auth/callback': {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const expected = readCookie(request, OAUTH_STATE_COOKIE);
      if (!code || !state || !expected || state !== expected) return json({ error: 'bad oauth state' }, 400);
      const token = await exchangeCode(env, code, `${url.origin}/auth/callback`);
      if (!token) return json({ error: 'discord token exchange failed' }, 502);
      const user = await discordUser(token);
      if (!user) return json({ error: 'discord user lookup failed' }, 502);
      const response = await loginAs(env, user.id, user.global_name ?? user.username);
      response.headers.append('set-cookie', cookie(OAUTH_STATE_COOKIE, '', 0, '/auth'));
      return response;
    }

    case '/auth/logout': {
      if (request.method !== 'POST' || !sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
      return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
    }

    case '/auth/me': {
      const playerId = await currentPlayer(request, env);
      if (!playerId) return json({ error: 'unauthorized' }, 401);
      const row = await env.DB.prepare('SELECT username FROM accounts WHERE player_id = ?').bind(playerId).first<{ username: string }>();
      return json({ playerId, username: row?.username ?? null });
    }

    case '/auth/signed-out':
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>已退出</title>'
          + '<body style="font:16px system-ui;background:#111;color:#ddd;display:grid;place-items:center;height:100vh;margin:0">'
          + '<div style="text-align:center"><p>已退出登录。</p><p><a style="color:#9cf" href="/auth/login">用 Discord 登录</a></p></div>',
        { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
      );
  }
  return json({ error: 'not found' }, 404);
}

/** 按外部身份找/建账号，签发会话并跳回游戏 */
async function loginAs(env: Env, externalId: string, username: string): Promise<Response> {
  const now = Date.now();
  const existing = await env.DB.prepare('SELECT player_id FROM accounts WHERE discord_id = ?').bind(externalId).first<{ player_id: string }>();
  let playerId = existing?.player_id;
  if (playerId) {
    await env.DB.prepare('UPDATE accounts SET username = ?, last_login_at = ? WHERE player_id = ?').bind(username, now, playerId).run();
  } else {
    playerId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO accounts (player_id, discord_id, username, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)')
      .bind(playerId, externalId, username, now, now).run();
  }
  const session = await createSession(env.SESSION_SECRET, playerId, now);
  return redirect(GAME_PAGE, [cookie(SESSION_COOKIE, session.token, session.maxAge)]);
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
    return json(await actor.load());
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
    const reply = await actor.execute(command as never);
    if ('rateLimited' in reply) return json({ error: 'rate limited' }, 429, { 'retry-after': '1' });
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
