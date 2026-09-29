/**
 * 封面页：主视觉 + 登录 + 用户协议。
 *
 *  - 远端后端（构建时设了 VITE_META_API）：查 /auth/me。已登录 → 「进入游戏」；
 *    未登录或协议版本过旧 → 勾选同意协议后「使用 Discord 登录」（/auth/login?terms=版本）。
 *  - 本地后端：存档在浏览器里，直接「进入游戏」。
 */
import './cover.css';
import wideArt from '@assets/meta/cover/cover-wide.webp';
import tallArt from '@assets/meta/cover/cover-tall.webp';
import { TERMS_SECTIONS, TERMS_UPDATED, TERMS_VERSION } from '../legal/terms';
import { onPreloadProgress, startPreload, type PreloadProgress } from './preload';

const remote = Boolean(import.meta.env.VITE_META_API);
const GAME_URL = remote ? '/game' : '/game.html';

const ERRORS: Record<string, string> = {
  terms: '请先阅读并同意用户协议。',
  state: '登录已过期或被中断，请重新登录。',
  discord: 'Discord 登录失败，请稍后再试。',
  denied: '你取消了 Discord 授权。',
};

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

interface Me {
  playerId: string;
  username: string | null;
  termsAccepted: boolean;
}

async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/auth/me', { credentials: 'include', headers: { accept: 'application/json' } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Me;
}

function renderTerms(): void {
  $('#termsMeta').textContent = `版本 ${TERMS_VERSION} · 更新于 ${TERMS_UPDATED}`;
  $('#termsBody').innerHTML = TERMS_SECTIONS.map((s) => `
    <section>
      <h3>${escapeHtml(s.title)}</h3>
      <ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </section>`).join('');
}

/** 未登录：同意协议 → Discord 登录 */
function renderLogin(notice?: string): void {
  $('#coverActions').innerHTML = `
    ${notice ? `<p class="cover-notice" role="alert">${escapeHtml(notice)}</p>` : ''}
    <label class="agree">
      <input type="checkbox" id="agreeBox">
      <span>我已阅读并同意<button type="button" class="link" data-terms>《用户协议》</button>：本项目非商业、完全免费，不对存档负责。</span>
    </label>
    <a class="btn primary discord is-disabled" id="loginBtn" href="/auth/login?terms=${TERMS_VERSION}" aria-disabled="true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.5 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.2 18a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4-2 1 1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.6-3.5-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>
      <span>使用 Discord 登录</span>
    </a>
    <p class="cover-hint">只读取 Discord 用户 ID 和用户名，用来绑定你的存档。</p>`;
  const box = $<HTMLInputElement>('#agreeBox');
  const login = $<HTMLAnchorElement>('#loginBtn');
  const sync = (): void => {
    login.classList.toggle('is-disabled', !box.checked);
    login.setAttribute('aria-disabled', String(!box.checked));
  };
  box.addEventListener('change', sync);
  login.addEventListener('click', (e) => {
    if (box.checked) return;
    e.preventDefault();
    box.focus();
    box.closest('.agree')!.classList.add('shake');
    setTimeout(() => box.closest('.agree')!.classList.remove('shake'), 500);
  });
  $('#coverActions').querySelector('[data-terms]')!.addEventListener('click', openTerms);
  onAgree = () => { box.checked = true; sync(); };
  mountBackgroundPreload();
}

const pct = (p: PreloadProgress): number => (p.total ? Math.round((p.done / p.total) * 100) : 0);
const preloadDone = (p: PreloadProgress): boolean => p.total > 0 && p.done >= p.total;
let unsubscribe: (() => void) | null = null;

function progressBar(id: string): string {
  return `<div class="cover-progress" id="${id}" role="progressbar" aria-label="游戏资源加载" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>`;
}

function paintBar(bar: HTMLElement | null, p: PreloadProgress): void {
  if (!bar) return;
  bar.setAttribute('aria-valuenow', String(pct(p)));
  bar.querySelector<HTMLElement>('i')!.style.width = `${pct(p)}%`;
}

/**
 * 「进入游戏」按钮：资源预热完成前显示进度且不可点（可跳过），完成后放行。
 * autoEnter：刚登录回来时，预热完直接进游戏，省一次点击。
 */
function mountEnter(autoEnter: boolean): string {
  unsubscribe?.();
  queueMicrotask(() => {
    const btn = $<HTMLAnchorElement>('#enterBtn');
    const label = $('#enterLabel');
    const bar = $('#enterProgress');
    const skip = $<HTMLButtonElement>('#skipPreload');
    let ready = false;
    const go = (): void => location.assign(GAME_URL);
    btn.addEventListener('click', (e) => {
      if (!ready) e.preventDefault();
    });
    skip.addEventListener('click', go);
    unsubscribe = onPreloadProgress((p) => {
      paintBar(bar, p);
      if (!p.total) return;
      label.textContent = preloadDone(p) ? '进入游戏' : `正在加载资源 ${pct(p)}%`;
    });
    void startPreload().then((p) => {
      ready = true;
      btn.classList.remove('is-disabled');
      btn.removeAttribute('aria-disabled');
      label.textContent = '进入游戏';
      bar.hidden = true;
      skip.hidden = true;
      if (p.failed) $('#preloadNote').textContent = `有 ${p.failed} 项资源未能预载，进游戏后会按需加载。`;
      if (autoEnter) go();
    });
  });
  return `
    <a class="btn primary is-disabled" id="enterBtn" href="${GAME_URL}" aria-disabled="true"><span id="enterLabel" aria-live="polite">正在加载资源…</span></a>
    ${progressBar('enterProgress')}
    <button type="button" class="link" id="skipPreload">跳过等待，直接进入</button>
    <p class="cover-hint" id="preloadNote"></p>`;
}

function renderWelcome(me: Me, autoEnter: boolean): void {
  $('#coverActions').innerHTML = `
    <p class="cover-welcome">欢迎回来，<b>${escapeHtml(me.username ?? '冒险者')}</b></p>
    ${mountEnter(autoEnter)}
    <button type="button" class="link" id="logoutBtn">切换账号 / 退出登录</button>`;
  $('#logoutBtn').addEventListener('click', () => {
    void fetch('/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => location.replace('/'));
  });
  onAgree = null;
}

function renderLocal(): void {
  $('#coverActions').innerHTML = `
    ${mountEnter(false)}
    <p class="cover-hint">本地模式：存档保存在这台设备的浏览器里。</p>`;
  onAgree = null;
}

/** 未登录：阅读协议/授权 Discord 期间在后台预热，回来时大部分已在缓存里 */
function mountBackgroundPreload(): void {
  unsubscribe?.();
  const host = document.createElement('div');
  host.className = 'cover-preload';
  host.innerHTML = `${progressBar('bgProgress')}<p class="cover-hint" id="bgLabel">正在后台预载游戏资源…</p>`;
  $('#coverActions').appendChild(host);
  unsubscribe = onPreloadProgress((p) => {
    paintBar($('#bgProgress'), p);
    if (p.total) $('#bgLabel').textContent = preloadDone(p) ? '游戏资源已就绪，登录后即可开玩。' : `正在后台预载游戏资源 ${pct(p)}%`;
  });
  void startPreload().then((p) => {
    if (!p.total) host.remove();
  });
}

let onAgree: (() => void) | null = null;

function openTerms(): void {
  $<HTMLButtonElement>('#termsAgree').hidden = !onAgree;
  $<HTMLDialogElement>('#terms').showModal();
  $('#termsBody').scrollTop = 0;
}

async function boot(): Promise<void> {
  document.documentElement.style.setProperty('--cover-wide', `url("${wideArt}")`);
  document.documentElement.style.setProperty('--cover-tall', `url("${tallArt}")`);
  renderTerms();
  $('#openTerms').addEventListener('click', openTerms);
  $<HTMLDialogElement>('#terms').addEventListener('close', () => {
    if ($<HTMLDialogElement>('#terms').returnValue === 'agree') onAgree?.();
  });

  if (!remote) return renderLocal();

  const params = new URLSearchParams(location.search);
  const error = params.get('error');
  // 登录回调落到 /?login=1：预热完成后自动进游戏
  const fromLogin = params.get('login') === '1';
  if (error || fromLogin) history.replaceState(null, '', '/');
  try {
    const me = await fetchMe();
    if (me?.termsAccepted) return renderWelcome(me, fromLogin);
    renderLogin(error ? ERRORS[error] ?? '登录失败，请重试。' : me ? '用户协议已更新，请重新阅读并同意后登录。' : undefined);
  } catch {
    $('#coverActions').innerHTML = '<p class="cover-notice" role="alert">暂时连不上服务器，请稍后刷新重试。</p>';
  }
}

void boot();
