/**
 * 战斗加载页：进战斗前把双方立绘、宝石贴图、技能序列帧预先拉下来并解码，
 * 加载完成（且战斗层初始化完毕）后再淡出，避免线上首帧缺图 / 棋盘闪白。
 *
 * - 单个资源失败或超时不阻塞进战斗（战斗层各自有兜底）；
 * - 本地加载很快：至少停留 MIN_VISIBLE_MS，避免一闪而过；
 * - 调试慢网：localStorage `gems.debug.slowLoad = <毫秒>` 为每个资源追加延迟。
 */
import { loadGemTextures } from '@render/gemTextures';
import type { BattleRequest, CombatantSnapshot } from '@session/index';
import { tutorialArt } from './artAssets';

const FX_STRIPS = Object.values(import.meta.glob('@assets/fx/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);

const MIN_VISIBLE_MS = 700;
const ITEM_TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;

const TIPS = [
  '连成四个同色宝石可以额外获得一回合。',
  '骷髅宝石直接攻击敌方第一位，连得越多伤害越高。',
  '法力攒满后点击部队施放技能，技能不消耗回合的会标注「不结束回合」。',
  '部队的法力颜色决定它能吸收哪种宝石，配队时尽量覆盖不同颜色。',
  '王国升到 10 级后，全体部队获得该王国的属性加成。',
  '每日首胜额外赠送宝石，记得每天打一场。',
  '末日之塔的队伍生命跨层延续，残血时可以在营地休整。',
];

interface Task { label: string; weight: number; run: () => Promise<boolean> }

function slowDelay(): number {
  try {
    const ms = Number(localStorage.getItem('gems.debug.slowLoad'));
    return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 10_000) : 0;
  } catch {
    return 0;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 拉取并解码一张图；失败/超时返回 false，不抛出 */
function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), ITEM_TIMEOUT_MS);
    img.decoding = 'async';
    img.onload = () => { void (img.decode?.() ?? Promise.resolve()).then(() => finish(true), () => finish(true)); };
    img.onerror = () => finish(false);
    img.src = url;
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function lineup(team: CombatantSnapshot[], side: 'player' | 'enemy'): string {
  return team.map((unit, i) => `<figure class="bl-unit${unit.tier === 'boss' ? ' boss' : ''}" style="--i:${i}">
      ${unit.portraitUrl ? `<img src="${escapeHtml(unit.portraitUrl)}" alt="" decoding="async" data-bl-portrait>` : '<span class="bl-unit-blank"></span>'}
      <figcaption><b>${escapeHtml(unit.name)}</b>${unit.levelLabel ? `<small>${escapeHtml(unit.levelLabel)}</small>` : ''}</figcaption>
    </figure>`).join('') || `<p class="bl-empty">${side === 'player' ? '我方' : '敌方'}</p>`;
}

export interface BattleLoadingOptions {
  title: string;
  subtitle?: string;
}

export class BattleLoadingScreen {
  private el: HTMLElement;
  private tipTimer: number | null = null;
  private shownAt = performance.now();

  constructor(private readonly request: BattleRequest, options: BattleLoadingOptions) {
    const tip = Math.floor(Math.random() * TIPS.length);
    this.el = document.createElement('div');
    this.el.className = 'bl-screen';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'blTitle');
    const bg = tutorialArt('battle-loading');
    if (bg) this.el.style.setProperty('--bl-bg', `url("${bg}")`);
    this.el.innerHTML = `
      <div class="bl-backdrop" aria-hidden="true"></div>
      <header class="bl-head"><small>即将开战</small><h1 id="blTitle">${escapeHtml(options.title)}</h1>${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ''}</header>
      <div class="bl-versus">
        <section class="bl-side player" aria-label="我方阵容">${lineup(request.playerTeam, 'player')}</section>
        <div class="bl-vs" aria-hidden="true"><span>VS</span></div>
        <section class="bl-side enemy" aria-label="敌方阵容">${lineup(request.enemyTeam, 'enemy')}</section>
      </div>
      <footer class="bl-foot">
        <div class="bl-progress" role="progressbar" aria-label="战斗资源加载" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <div class="bl-status"><span id="blStatus">准备资源</span><b id="blPct">0%</b></div>
        <p class="bl-tip"><span>提示</span><em id="blTip">${TIPS[tip]}</em></p>
      </footer>`;
    for (const img of this.el.querySelectorAll<HTMLImageElement>('[data-bl-portrait]')) {
      const mark = (): void => { img.dataset.loaded = '1'; };
      if (img.complete && img.naturalWidth > 0) mark();
      else img.addEventListener('load', mark, { once: true });
    }
    document.body.appendChild(this.el);
    let index = tip;
    this.tipTimer = window.setInterval(() => {
      index = (index + 1) % TIPS.length;
      const node = this.el.querySelector('#blTip');
      if (node) node.textContent = TIPS[index]!;
    }, 4000);
  }

  private setProgress(ratio: number, label: string): void {
    const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    const bar = this.el.querySelector<HTMLElement>('.bl-progress');
    bar?.setAttribute('aria-valuenow', String(pct));
    const fill = bar?.querySelector<HTMLElement>('i');
    if (fill) fill.style.width = `${pct}%`;
    const status = this.el.querySelector('#blStatus');
    if (status) status.textContent = label;
    const pctEl = this.el.querySelector('#blPct');
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  /** 预加载全部战斗资源；返回失败项数量（失败不阻塞） */
  async preload(): Promise<number> {
    const units = [...this.request.playerTeam, ...this.request.enemyTeam];
    const portraits = [...new Set(units.map((u) => u.portraitUrl).filter((u): u is string => !!u))];
    const delay = slowDelay();
    const tasks: Task[] = [
      { label: '宝石贴图', weight: 6, run: async () => { await loadGemTextures(); return true; } },
      ...portraits.map((url): Task => ({ label: '角色立绘', weight: 2, run: () => loadImage(url) })),
      ...FX_STRIPS.map((url): Task => ({ label: '技能特效', weight: 1, run: () => loadImage(url) })),
    ];
    const total = tasks.reduce((sum, t) => sum + t.weight, 0);
    let doneWeight = 0;
    let failed = 0;
    let cursor = 0;
    const counts = new Map<string, [number, number]>();
    for (const t of tasks) counts.set(t.label, [0, (counts.get(t.label)?.[1] ?? 0) + 1]);
    const worker = async (): Promise<void> => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++]!;
        if (delay) await sleep(delay);
        const ok = await task.run().catch(() => false);
        if (!ok) failed++;
        doneWeight += task.weight;
        const c = counts.get(task.label)!;
        c[0]++;
        this.setProgress(doneWeight / total * 0.92, `${task.label} ${c[0]} / ${c[1]}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    this.setProgress(0.92, '布置战场');
    return failed;
  }

  /** 战斗层初始化完毕：补满进度，淡出并移除 */
  async finish(): Promise<void> {
    this.setProgress(1, '开战');
    const wait = MIN_VISIBLE_MS - (performance.now() - this.shownAt);
    if (wait > 0) await sleep(wait);
    this.el.classList.add('is-leaving');
    await sleep(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
    this.dispose();
  }

  dispose(): void {
    if (this.tipTimer !== null) window.clearInterval(this.tipTimer);
    this.tipTimer = null;
    this.el.remove();
  }
}
