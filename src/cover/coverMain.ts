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
import { onPreloadProgress, retryPreload, startPreload, type PreloadProgress } from './preload';

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
      <span>我已阅读并同意<button type="button" class="link" data-terms>《用户协议》</button></span>
    </label>
    <button type="button" class="btn primary discord is-disabled" id="loginBtn" disabled aria-disabled="true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.5 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.2 18a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4-2 1 1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.6-3.5-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>
      <span>使用 Discord 登录</span>
    </button>
    <p class="cover-hint">使用 Discord 账号保存游戏进度。</p>`;
  const box = $<HTMLInputElement>('#agreeBox');
  const login = $<HTMLButtonElement>('#loginBtn');
  let accepted = false;
  let assetsReady = false;
  const sync = (): void => {
    box.checked = accepted;
    login.disabled = !accepted || !assetsReady;
    login.classList.toggle('is-disabled', login.disabled);
    login.setAttribute('aria-disabled', String(!accepted || !assetsReady));
  };
  box.addEventListener('click', (event) => {
    if (accepted) { accepted = false; sync(); return; }
    event.preventDefault();
    openTerms();
  });
  box.addEventListener('change', sync);
  login.addEventListener('click', () => {
    if (accepted && assetsReady) location.assign(`/auth/login?terms=${TERMS_VERSION}`);
  });
  $('#coverActions').querySelector('[data-terms]')!.addEventListener('click', (event) => { event.preventDefault(); openTerms(); });
  onAgree = () => { accepted = true; sync(); };
  mountBackgroundPreload(() => { assetsReady = true; sync(); });
}

const pct = (p: PreloadProgress): number => (p.total ? Math.round((p.done / p.total) * 100) : 0);
const preloadDone = (p: PreloadProgress): boolean => p.total > 0 && p.done >= p.total && p.failed === 0;
let unsubscribe: (() => void) | null = null;

function progressBar(id: string): string {
  return `<div class="cover-progress" id="${id}" role="progressbar" aria-label="游戏资源加载" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>`;
}

function paintBar(bar: HTMLElement | null, p: PreloadProgress): void {
  if (!bar) return;
  bar.setAttribute('aria-valuenow', String(pct(p)));
  bar.querySelector<HTMLElement>('i')!.style.width = `${pct(p)}%`;
}

/** 代码先求值，样式保持惰性；未登录时不读取受保护的存档接口。 */
let runtime: Promise<typeof import('../meta/shell/gameMain')> | null = null;
function warmRuntime(): Promise<typeof import('../meta/shell/gameMain')> {
  runtime ??= Promise.all([import('../meta/shell/gameMain'), import('../meta/screens/characterScreen')])
    .then(([module]) => module).catch(error => { runtime = null; throw error; });
  return runtime;
}

async function readyAssets(retry = false): Promise<void> {
  const [progress] = await Promise.all([retry ? retryPreload() : startPreload(), warmRuntime()]);
  if (!preloadDone(progress)) throw new Error('资源加载未完成');
}

/** 进入只挂载已经准备好的首屏，不再发起整页导航及第二轮初始化。 */
function mountEnter(autoEnter: boolean, loginName?: string): string {
  unsubscribe?.();
  queueMicrotask(() => {
    const btn = $<HTMLButtonElement>('#enterBtn');
    const label = $('#enterLabel');
    const bar = $('#enterProgress');
    const retry = $<HTMLButtonElement>('#retryPreload');
    let enter: (() => Promise<void>) | null = null;
    let entering = false;
    const go = async (): Promise<void> => {
      if (!enter || entering) return;
      entering = true;
      btn.disabled = true;
      const viewport = document.createElement('div');
      viewport.className = 'viewport';
      viewport.innerHTML = '<div class="stage" id="stage"></div>';
      const battle = document.createElement('div');
      battle.id = 'battle-root';
      battle.hidden = true;
      document.body.append(viewport, battle);
      try {
        await enter();
        history.replaceState(null, '', GAME_URL + location.hash);
        unsubscribe?.();
        termsObserver?.disconnect();
        $('#cover').remove();
        $('#terms').remove();
        window.dispatchEvent(new Event('resize'));
      } catch {
        // 保持封面与重试入口，避免在启动异常时留下空白页。
        viewport.remove(); battle.remove();
        document.getElementById('meta-global-css')?.remove();
        document.getElementById('meta-page-css')?.remove();
        entering = false;
        showFailure();
      }
    };
    const showFailure = (): void => {
      enter = null;
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      label.textContent = '加载未完成';
      $('#preloadNote').textContent = '部分资源加载失败，请检查网络后重试。';
      retry.hidden = false;
    };
    btn.addEventListener('click', () => { void go(); });
    unsubscribe = onPreloadProgress((p) => {
      paintBar(bar, p);
      if (p.total) label.textContent = preloadDone(p) ? '正在准备首屏…' : `正在加载资源 ${pct(p)}%`;
    });
    const prepare = async (again = false): Promise<void> => {
      retry.hidden = true;
      $('#preloadNote').textContent = '';
      label.textContent = '正在准备游戏…';
      try {
        const [, prepared] = await Promise.all([
          readyAssets(again),
          warmRuntime().then(module => module.prepareGame(loginName)),
        ]);
        enter = prepared;
        btn.disabled = false;
        btn.classList.remove('is-disabled');
        btn.setAttribute('aria-disabled', 'false');
        label.textContent = '进入游戏';
        bar.hidden = true;
        if (autoEnter) await go();
      } catch { showFailure(); }
    };
    retry.onclick = () => { void prepare(true); };
    void prepare();
  });
  return `
    <button type="button" class="btn primary is-disabled" id="enterBtn" disabled aria-disabled="true"><span id="enterLabel" aria-live="polite">正在加载资源…</span></button>
    ${progressBar('enterProgress')}
    <button type="button" class="link" id="retryPreload" hidden>重新加载</button>
    <p class="cover-hint" id="preloadNote"></p>`;
}

function renderWelcome(me: Me, autoEnter: boolean): void {
  $('#coverActions').innerHTML = `
    <p class="cover-welcome">欢迎回来，<b>${escapeHtml(me.username ?? '冒险者')}</b></p>
    ${mountEnter(autoEnter, me.username ?? undefined)}
    <button type="button" class="link" id="logoutBtn">退出登录</button>`;
  $('#logoutBtn').addEventListener('click', () => {
    void fetch('/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => location.replace('/'));
  });
  onAgree = null;
}

function renderLocal(): void {
  $('#coverActions').innerHTML = `
    ${mountEnter(false)}
    <p class="cover-hint">游戏进度保存在当前浏览器。</p>`;
  onAgree = null;
}

/** 未登录：阅读协议/授权 Discord 期间在后台预热，回来时大部分已在缓存里 */
function mountBackgroundPreload(onReady: () => void): void {
  unsubscribe?.();
  const host = document.createElement('div');
  host.className = 'cover-preload';
  host.innerHTML = `${progressBar('bgProgress')}<p class="cover-hint" id="bgLabel">正在准备游戏…</p><button type="button" class="link" id="retryPreload" hidden>重新加载</button>`;
  $('#coverActions').appendChild(host);
  unsubscribe = onPreloadProgress((p) => {
    paintBar($('#bgProgress'), p);
    if (p.total) $('#bgLabel').textContent = `正在准备游戏 ${pct(p)}%`;
  });
  const retry = $<HTMLButtonElement>('#retryPreload');
  const prepare = async (again = false): Promise<void> => {
    retry.hidden = true;
    try {
      await readyAssets(again);
      $('#bgLabel').textContent = '游戏已就绪';
      onReady();
    } catch {
      $('#bgLabel').textContent = '资源加载失败，请检查网络后重试。';
      retry.hidden = false;
    }
  };
  retry.onclick = () => { void prepare(true); };
  void prepare();
}

let onAgree: (() => void) | null = null;
let termsRead = false;
let termsObserver: ResizeObserver | null = null;
function updateTermsRead(): void {
  if (!document.querySelector<HTMLDialogElement>('#terms')?.open) return;
  const body = $('#termsBody');
  if (body.clientHeight > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) termsRead = true;
  $<HTMLButtonElement>('#termsAgree').disabled = !termsRead;
}

function openTerms(): void {
  const dialog = $<HTMLDialogElement>('#terms');
  if (dialog.open) return;
  termsRead = false;
  dialog.returnValue = '';
  const agree = $<HTMLButtonElement>('#termsAgree');
  agree.hidden = !onAgree;
  agree.disabled = true;
  dialog.showModal();
  $('#termsBody').scrollTop = 0;
  requestAnimationFrame(updateTermsRead);
}

async function boot(): Promise<void> {
  void readyAssets().catch(() => undefined);
  document.documentElement.style.setProperty('--cover-wide', `url("${wideArt}")`);
  document.documentElement.style.setProperty('--cover-tall', `url("${tallArt}")`);
  renderTerms();
  $('#openTerms').addEventListener('click', openTerms);
  $('#termsBody').addEventListener('scroll', updateTermsRead, { passive: true });
  termsObserver = new ResizeObserver(updateTermsRead);
  termsObserver.observe($('#termsBody'));
  $('#terms').querySelector('form')!.addEventListener('submit', (event) => {
    if ((event.submitter as HTMLButtonElement | null)?.value === 'agree' && !termsRead) event.preventDefault();
  });
  $<HTMLDialogElement>('#terms').addEventListener('close', () => {
    if ($<HTMLDialogElement>('#terms').returnValue === 'agree' && termsRead) onAgree?.();
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
