/**
 * 会话 cookie：`<playerId>.<expiresAt>.<hmac>`，HMAC-SHA256(SESSION_SECRET)。
 * 校验只做一次 HMAC，不查数据库。
 */
const encoder = new TextEncoder();
export const SESSION_COOKIE = 'm3_session';
export const OAUTH_STATE_COOKIE = 'm3_oauth_state';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

function base64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

export async function createSession(secret: string, playerId: string, now: number): Promise<{ token: string; maxAge: number }> {
  const payload = `${playerId}.${now + SESSION_TTL_MS}`;
  return { token: `${payload}.${await sign(secret, payload)}`, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

/** 合法且未过期 → playerId；否则 null */
export async function verifySession(secret: string, token: string | null, now: number): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [playerId, exp, sig] = parts as [string, string, string];
  if (!/^[0-9a-f-]{36}$/.test(playerId) || !(Number(exp) > now)) return null;
  return safeEqual(await sign(secret, `${playerId}.${exp}`), sig) ? playerId : null;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function cookie(name: string, value: string, maxAge: number, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}
