/**
 * 战斗加载页：进战斗前把本场全部资源（宝石贴图、立绘、序列帧特效、音效、解说、音乐）
 * 下载并解码完（见 @render/battleAssets），战斗层初始化完毕后再淡出。
 *
 * - 任何一项加载失败都不会进战斗：加载页显示失败并提供「重试」/「返回」；
 * - 本地加载很快：至少停留 MIN_VISIBLE_MS，避免一闪而过；
 * - 调试慢网：localStorage `gems.debug.slowLoad = <毫秒>` 为每个资源追加延迟。
 */
import type { BattleRequest, CombatantSnapshot } from '@session/index';
import { tutorialArt } from './artAssets';

const MIN_VISIBLE_MS = 700;

const TIPS = [
  '连成四个同色宝石可以额外获得一回合。',
  '骷髅宝石直接攻击敌方第一位，连得越多伤害越高。',
  '法力攒满后点击部队施放技能，技能不消耗回合的会标注「不结束回合」。',
  '部队的法力颜色决定它能吸收哪种宝石，配队时尽量覆盖不同颜色。',
  '王国升到 10 级后，全体部队获得该王国的属性加成。',
  '每日首胜额外赠送宝石，记得每天打一场。',
  '末日之塔的队伍生命跨层延续，残血时可以在营地休整。',
];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
      <div class="bl-versus" style="--bl-n:${Math.max(1, request.playerTeam.length, request.enemyTeam.length)}">
        <section class="bl-side bl-side--player" aria-label="我方阵容">${lineup(request.playerTeam, 'player')}</section>
        <div class="bl-vs" aria-hidden="true"><span>VS</span></div>
        <section class="bl-side bl-side--enemy" aria-label="敌方阵容">${lineup(request.enemyTeam, 'enemy')}</section>
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

  /**
   * 预载本场全部战斗资源。失败时停在加载页等玩家选择：重试（只补缺失项）或返回。
   * loadModules：战斗层代码按需拆包，与资源一起在加载页里拉取。
   * 返回 loadModules 的结果 = 全部就绪可以开战；返回 null = 玩家放弃。
   */
  async preload<T>(loadModules: () => Promise<T>): Promise<T | null> {
    for (;;) {
      try {
        this.setProgress(0, '加载战斗模块');
        const [{ BATTLE_ASSET_LABEL, preloadBattleAssets }, modules] = await Promise.all([
          import('@render/battleAssets'),
          loadModules(),
        ]);
        await preloadBattleAssets(this.request, ({ done, total, kind }) => {
          this.setProgress(done / total * 0.92, `${BATTLE_ASSET_LABEL[kind]} ${done} / ${total}`);
        });
        this.setProgress(0.92, '布置战场');
        return modules;
      } catch (error) {
        console.error(error);
        if (!(await this.askRetry())) return null;
      }
    }
  }

  /** 加载失败：显示「重试」/「返回」，等玩家选择 */
  private askRetry(): Promise<boolean> {
    this.setProgress(0, '资源加载失败，请检查网络后重试');
    this.el.classList.add('is-failed');
    const actions = document.createElement('div');
    actions.className = 'bl-actions';
    actions.innerHTML = '<button type="button" class="bl-btn primary" data-act="retry">重试</button><button type="button" class="bl-btn" data-act="back">返回</button>';
    this.el.querySelector('.bl-foot')!.appendChild(actions);
    actions.querySelector<HTMLButtonElement>('[data-act="retry"]')!.focus();
    return new Promise((resolve) => {
      actions.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
        if (!act) return;
        actions.remove();
        this.el.classList.remove('is-failed');
        resolve(act === 'retry');
      });
    });
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
