/**
 * 六类常驻活动各自独立页面，#events 为六活动总览（2026-09-29 玩法重做）。
 *
 * 路由：#events/<typeId>（invasion|raidBoss|towerOfDoom|factionAssault|worldEvent|classTrials）；
 * 子页：#events/<typeId>/rules（玩法说明）、#events/<typeId>/rewards（里程碑奖励）。
 * 详情页 = 左栏（主视觉 + 本周进度 + 奖励/兑换入口）+ 右侧玩法主板（每个活动一套独立界面，
 * 见 screens/eventViews/*）。玩法主板的交互统一经 data-act / data-fight / data-select 委托。
 * 样式见 styles/events.css（总览/子页）+ styles/events-modes.css（六个玩法主板）。
 */
import { isFailure, weekStartOf, gameNow } from '../gateway';
import {
  EVENT_MILESTONES,
  EVENT_ROTATION,
  EVENT_WEEKLY_RULES, EVENT_SHARED_GOALS,
  WEEK_MS,
  type EventTypeId,
} from '../data/events';
import { INGOT_NAMES, stoneName, type IngotKey } from '../data/materials';
import { raceName } from '../data/races';
import {
  ensureEventWeek, eventModeState,
  eventPageState, eventWeeklySummary, eventBattleReady, currentEventTheme, eventsUnlocked, eventNextLevel,
} from '../systems/events';
import { eventsLockPanelHtml } from './eventsLock';
import { bottomNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { cssUrlVar, shopArt } from '../shell/artAssets';
import { ingotArt, materialImg, scrollArt, stoneMarkupForKey } from '../shell/materialArt';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';
import { activeTeam } from '../systems/teamRules';
import type { ViewCtx } from './eventViews/shared';
import { towerViewHtml } from './eventViews/towerView';
import { raidViewHtml } from './eventViews/raidView';
import { invasionViewHtml } from './eventViews/invasionView';
import { factionViewHtml } from './eventViews/factionView';
import { worldViewHtml } from './eventViews/worldView';
import { trialsViewHtml } from './eventViews/trialsView';

const TYPE_IDS: readonly EventTypeId[] = EVENT_ROTATION.map((t) => t.id);
const EVENT_ICON: Record<EventTypeId, string> = {
  invasion: 'flag', raidBoss: 'skull', towerOfDoom: 'temple',
  factionAssault: 'swords', worldEvent: 'chest', classTrials: 'book',
};

/** 屏内选中项（兵团/地块/节点/试炼/路线）：只在本会话记忆，不进存档 */
const SELECTION = new Map<EventTypeId, string>();

function parseTypeId(param: string | undefined): EventTypeId | null {
  return TYPE_IDS.includes(param as EventTypeId) ? (param as EventTypeId) : null;
}

function weekCountdown(now: number, resetAt: number): string {
  const totalMinutes = Math.max(0, Math.ceil((resetAt - now) / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `剩 ${days}天 ${hours}时 ${minutes}分`;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

/** 活动主视觉（与活动商店同一套横幅，素材在 src/assets/meta/shop/） */
function eventArt(typeId: EventTypeId): string {
  return shopArt(`event-${typeId}`);
}

/** 里程碑奖励：货币用图标，素材用实物图，保留完整名称供悬停和读屏使用。 */
function rewardSummary(m: {
  gold?: number; souls?: number; gems?: number; goldKeys?: number; glory?: number;
  mats?: { ingots?: Record<string, number>; forgeScrolls?: number; traitstones?: Record<string, number> };
}): string {
  const chip = (art: string, name: string, count: number) =>
    `<span class="ev-reward" title="${name} ×${fmt(count)}"><span class="ev-reward-art">${art}</span><span class="ev-reward-name">${name}</span><b>×${fmt(count)}</b></span>`;
  const icon = (name: string) => `<span data-icon="${name}"></span>`;
  return [
    m.gems ? chip(icon('crystal'), '宝石', m.gems) : '',
    m.gold ? chip(icon('coin'), '黄金', m.gold) : '',
    m.souls ? chip(icon('soul'), '灵魂', m.souls) : '',
    m.goldKeys ? chip(icon('key'), '金钥匙', m.goldKeys) : '',
    m.glory ? chip(icon('glory'), '荣耀', m.glory) : '',
    ...Object.entries(m.mats?.ingots ?? {}).map(([k, n]) => chip(materialImg(ingotArt(k)), INGOT_NAMES[k as IngotKey] ?? k, n)),
    m.mats?.forgeScrolls ? chip(materialImg(scrollArt()), '熔铸符卷', m.mats.forgeScrolls) : '',
    ...Object.entries(m.mats?.traitstones ?? {}).map(([k, n]) => chip(stoneMarkupForKey(k), stoneName(k), n)),
  ].filter(Boolean).join('');
}

/** 敌人等级标签 */
function levelTag(level: { level: number; top: boolean }): string {
  return `<span class="ev-level${level.top ? ' top' : ''}">敌人 Lv.${level.level}</span>`;
}

/** 玩法主板：分派到各活动自己的视图 */
function modeBoardHtml(save: MetaSave, weekStart: number, typeId: EventTypeId): string {
  const def = EVENT_ROTATION.find((t) => t.id === typeId)!;
  const week = ensureEventWeek(save, weekStart, typeId);
  const hasHero = activeTeam(save)?.members.some((m) => m.kind === 'hero') ?? false;
  const v: ViewCtx = {
    save, week, weekStart, theme: currentEventTheme(weekStart, typeId),
    selected: SELECTION.get(typeId),
    ready: (action) => eventBattleReady(save, typeId, hasHero, action, weekStart),
    fightLabel: def.fightLabel,
  };
  switch (typeId) {
    case 'towerOfDoom': return towerViewHtml(v, eventModeState(save, weekStart, 'towerOfDoom'));
    case 'raidBoss': return raidViewHtml(v, eventModeState(save, weekStart, 'raidBoss'));
    case 'invasion': return invasionViewHtml(v, eventModeState(save, weekStart, 'invasion'));
    case 'factionAssault': return factionViewHtml(v, eventModeState(save, weekStart, 'factionAssault'));
    case 'worldEvent': return worldViewHtml(v, eventModeState(save, weekStart, 'worldEvent'));
    case 'classTrials': return trialsViewHtml(v, eventModeState(save, weekStart, 'classTrials'));
  }
}

export class EventsScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private countdownTimer: number | null = null;
  private busy = false;

  html(ctx: ShellCtx, param?: string): string {
    const now = gameNow();
    const weekStart = weekStartOf(now);
    const save = ctx.save();
    if (!eventsUnlocked(save)) {
      return `${topbarHtml()}<div class="screen ev-screen evlock-screen">${eventsLockPanelHtml(save)}</div>${bottomNavHtml('')}${toastHtml()}`;
    }
    const [eventParam, subpage] = param?.split('/') ?? [];
    const typeId = parseTypeId(eventParam);
    if (!typeId) return this.overviewHtml(save, weekStart, now);
    const def = EVENT_ROTATION.find((t) => t.id === typeId)!;
    const page = eventPageState(save, weekStart, typeId);
    const week = ensureEventWeek(save, weekStart, typeId);
    const milestones = EVENT_MILESTONES[typeId]!;
    const resetAt = weekStart + WEEK_MS;
    const style = `style='--ev-accent:${def.accent};${cssUrlVar('ev-art', eventArt(typeId))}'`;

    // —— 页签（桌面六页互切；手机改为下拉） ——
    const tabs = EVENT_ROTATION.map((t) => {
      const isPage = t.id === typeId;
      return `<a class="ev-tab${isPage ? ' page active' : ''}" href="#events/${t.id}"${isPage ? ' aria-current="page"' : ''} style="--ev-accent:${t.accent}">${t.shortName}</a>`;
    }).join('');
    const mobilePicker = `<label class="ev-mobile-picker"><span>切换活动</span><select id="evTypePicker" aria-label="切换活动">${EVENT_ROTATION.map((t) => `<option value="${t.id}"${t.id === typeId ? ' selected' : ''}>${t.name}</option>`).join('')}</select></label>`;
    const tabBar = `<nav class="ev-tabs" aria-label="活动页签"><a class="ev-tab ev-tab-all" href="#events"><span data-icon="arrow"></span>全部活动</a>${tabs}${mobilePicker}</nav>`;

    if (subpage === 'rules') {
      const sections = def.howto.map((s) => `<section class="ev-howto"><h2>${s.title}</h2><ul>${s.items.map((line) => `<li>${line}</li>`).join('')}</ul></section>`).join('');
      return `${topbarHtml()}<div class="screen ev-screen ev-detail ev-rules-page" ${style}>
        ${tabBar}
        <section class="panel ev-panel">
          <header class="ev-sub-head"><a class="ev-rewards-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a><h1>${def.name} · 玩法说明</h1><p>${def.brief}</p></header>
          <div class="ev-rules-grid">${sections}
            <section class="ev-howto"><h2>每周奖励</h2><ul><li>周一 0:00 刷新进度、奖励与印记。</li><li>里程碑达标自动发放（按${page.metric.label}计）；六种活动的胜场共同计入每周远征。</li><li>胜场按积分发放活动印记：本周 ${week.tokensEarned} / ${EVENT_WEEKLY_RULES.tokenCap}，商店每两天补货。</li></ul></section>
          </div>
        </section></div>${bottomNavHtml('')}${toastHtml()}`;
    }

    if (subpage === 'rewards') {
      const track = milestones.map((m, i) => {
        const done = week.claimed.includes(i);
        const state = done ? 'done' : page.metric.value >= m.points ? 'ready' : '';
        return `<div class="ev-mile ${state}">
            <div class="ev-mile-head"><span class="ev-mile-mark" data-icon="${done ? 'check' : 'chest'}"></span><b>${m.label}</b><span>${fmt(m.points)} ${page.metric.label}</span></div>
            <div class="ev-mile-rewards">${rewardSummary(m)}</div>
          </div>`;
      }).join('');
      return `${topbarHtml()}
        <div class="screen ev-screen ev-detail ev-rewards-page" ${style}>
          ${tabBar}
          <section class="panel ev-panel ev-rewards-panel">
            <header class="ev-sub-head">
              <a class="ev-rewards-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a>
              <h1>${def.name} · 里程碑</h1>
              <p>本周${page.metric.label} <b>${fmt(page.metric.value)}</b> · 已领 ${week.claimed.length} / ${milestones.length}</p>
            </header>
            <div class="ev-mile-track" aria-label="里程碑奖励">${track}</div>
            <a class="ev-rewards-back ev-rewards-back-bottom" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a>
          </section>
        </div>${bottomNavHtml('', '里程碑达标自动入账')}${toastHtml()}`;
    }

    const nextMilestone = milestones.find((_m, i) => !week.claimed.includes(i));
    const nextGap = nextMilestone ? Math.max(0, nextMilestone.points - page.metric.value) : 0;
    const theme = currentEventTheme(weekStart, typeId);
    const themeChip = theme.kingdom
      ? `<span class="ev-theme"><span data-icon="flag"></span>${theme.kingdom}</span>`
      : theme.bonusRace ? `<span class="ev-theme"><span data-icon="wing"></span>${raceName(theme.bonusRace)}</span>` : '';
    const top = milestones[milestones.length - 1]!.points;
    const pct = Math.min(100, (page.metric.value / top) * 100);
    const progress = `<div class="ev-progress" aria-label="本周里程碑进度">
        <div class="ev-progress-head">
          <span class="ev-progress-current"><small>本周${page.metric.label}</small><b>${fmt(page.metric.value)}</b></span>
          <span class="ev-progress-next"><small>${nextMilestone ? nextMilestone.label : '本周目标达成'}</small><b>${nextMilestone ? nextGap ? `还差 ${fmt(nextGap)}` : '即将入账' : '全部完成'}</b></span>
        </div>
        <div class="ev-progress-bar">${milestones.map((m, i) => `<em class="${week.claimed.includes(i) ? 'done' : ''}" style="left:${(m.points / top) * 100}%"></em>`).join('')}<i style="width:${pct}%"></i></div>
      </div>`;
    const links = `<div class="ev-secondary-links">
        <a class="ev-rewards-entry" href="#events/${typeId}/rewards"><span data-icon="chest"></span><span>里程碑</span><b>${week.claimed.length} / ${milestones.length}</b></a>
        <a class="ev-shop-entry" href="#shop/${typeId}"><span data-icon="mark"></span><span>兑换</span><b>${fmt(week.tokens)} 印记</b></a>
      </div>`;

    return `
      ${topbarHtml()}
      <div class="screen ev-screen ev-detail ev-mode-page ev-mode-${typeId}" ${style}>
        ${tabBar}
        <section class="panel ev-panel ev-mode-panel">
          <aside class="ev-side">
            <header class="ev-banner">
              <div class="ev-banner-art"><img src="${eventArt(typeId)}" alt="${def.name}" /><span class="ev-banner-icon" data-icon="${EVENT_ICON[typeId]}"></span></div>
              <div class="ev-banner-copy">
                <div class="ev-title-row"><h1>${def.name}</h1><a href="#events/${typeId}/rules">玩法说明</a></div>
                <p class="ev-brief">${def.brief}</p>
                <div class="ev-tags">${levelTag(eventNextLevel(save, weekStart, typeId))}${themeChip}</div>
                <p class="ev-kingdom"><span data-icon="time"></span><span class="ev-countdown" data-event-countdown data-reset-at="${resetAt}">${weekCountdown(now, resetAt)}</span><span>周一 0:00 重置</span></p>
              </div>
            </header>
            ${progress}
            ${links}
          </aside>
          <div class="ev-main ev-board">${modeBoardHtml(save, weekStart, typeId)}</div>
        </section>
      </div>
      <div class="evm-confirm-veil" id="evConfirm" hidden>
        <section class="ev-tower-confirm" role="dialog" aria-modal="true" aria-labelledby="evConfirmTitle">
          <h2 id="evConfirmTitle">确认操作</h2>
          <p id="evConfirmCopy"></p>
          <div class="ev-tower-confirm-actions">
            <button class="ev-confirm-cancel" id="evConfirmCancel" type="button">取消</button>
            <button class="ev-confirm-danger" id="evConfirmOk" type="button">确认</button>
          </div>
        </section>
      </div>
      ${bottomNavHtml('', '里程碑达标自动入账')}
      ${toastHtml()}`;
  }

  private overviewHtml(save: MetaSave, weekStart: number, now: number): string {
    const cards = EVENT_ROTATION.map((def, i) => {
      const state = eventPageState(save, weekStart, def.id);
      const week = ensureEventWeek(save, weekStart, def.id);
      const goals = EVENT_MILESTONES[def.id];
      const next = goals.find((_m, index) => !week.claimed.includes(index));
      const pct = Math.min(100, (state.metric.value / goals[goals.length - 1]!.points) * 100);
      const toNext = next ? Math.max(0, next.points - state.metric.value) : 0;
      const gemsLeft = goals.reduce((sum, m, index) => sum + Math.max(0, (m.gems ?? 0) - (week.eventData[`gemPaid${index}`] ?? 0)), 0);
      return `<article class="ev-overview-card" style="--ev-accent:${def.accent}">
        <a class="ev-overview-visual" href="#events/${def.id}" tabindex="-1" aria-hidden="true"><img src="${eventArt(def.id)}" alt="" loading="${i > 2 ? 'lazy' : 'eager'}" /></a>
        <div class="ev-overview-body">
          <div class="ev-overview-top">${levelTag(eventNextLevel(save, weekStart, def.id))}</div>
          <a class="ev-overview-main" href="#events/${def.id}"><span class="ev-overview-icon" data-icon="${EVENT_ICON[def.id]}"></span><span class="ev-overview-title"><b>${def.name}</b></span><span class="ev-overview-arrow" data-icon="arrow"></span></a>
          <p class="ev-overview-hook">${state.summary}</p>
          <p class="ev-overview-pitch">${def.brief}</p>
          <div class="ev-overview-progress"><span>${next ? next.label : '里程碑已全部达成'}</span><b>${next ? toNext ? `差 ${fmt(toNext)} ${state.metric.label}` : '即将入账' : '已完成'}</b><i><em style="width:${pct}%"></em></i></div>
          <div class="ev-overview-foot"><span><span data-icon="crystal"></span><b>${fmt(gemsLeft)}</b>待领</span><span><span data-icon="mark"></span><b${i === 0 ? ' id="evTokenBalance"' : ''}>${fmt(week.tokens)}</b>${def.tokenName}</span></div>
        </div>
      </article>`;
    }).join('');
    const resetAt = weekStart + WEEK_MS;
    return `${topbarHtml()}
      <div class="screen ev-screen ev-overview-screen">
        <section class="ev-overview-layout">
          <header class="ev-overview-header"><h1>活动中心</h1><p><span data-icon="time"></span><span class="ev-countdown" data-event-countdown data-reset-at="${resetAt}">${weekCountdown(now, resetAt)}</span><span>周一 0:00 重置</span></p></header>
          ${this.weeklySummaryHtml(save, weekStart)}
          <div class="ev-overview-track">${cards}</div>
        </section>
      </div>${bottomNavHtml('', '选择活动出战')}${toastHtml()}`;
  }

  /** 每周远征：一条进度轴 + 四个宝石节点 */
  private weeklySummaryHtml(save: MetaSave, weekStart: number): string {
    const summary = eventWeeklySummary(save, weekStart);
    const max = EVENT_SHARED_GOALS.at(-1)!.wins;
    const pct = Math.min(100, (summary.wins / max) * 100);
    return `<section class="ev-weekly" aria-label="每周远征">
        <header><b>每周远征</b><strong>${summary.wins} <small>/ ${max} 胜</small></strong></header>
        <div class="ev-weekly-rail">
          <div class="ev-weekly-bar"><i style="width:${pct}%"></i></div>
          <div class="ev-weekly-goals">${summary.goals.map((g) => {
            const cls = g.claimed ? 'claimed' : summary.wins >= g.wins ? 'ready' : '';
            return `<div class="${cls}" style="left:${(g.wins / max) * 100}%" title="${g.wins} 胜 · 宝石 ${g.gems}${g.claimed ? ' · 已入账' : ''}"><span class="ev-goal-pill"><span data-icon="${g.claimed ? 'check' : 'crystal'}"></span><b>${g.gems}</b></span><small>${g.wins}胜</small></div>`;
          }).join('')}</div>
        </div>
      </section>`;
  }

  mount(ctx: ShellCtx, root: HTMLElement, param?: string): void {
    this.startCountdown(ctx, root);
    const picker = root.querySelector<HTMLSelectElement>('#evTypePicker');
    if (picker) this.on(picker, 'change', () => ctx.navigate(`#events/${picker.value}`));
    const tabBar = root.querySelector<HTMLElement>('.ev-detail .ev-tabs');
    const activeTab = tabBar?.querySelector<HTMLElement>('.ev-tab.page');
    if (tabBar && activeTab && tabBar.scrollWidth > tabBar.clientWidth) {
      tabBar.scrollLeft = activeTab.offsetLeft - (tabBar.clientWidth - activeTab.offsetWidth) / 2;
    }
    const typeId = parseTypeId(param?.split('/')[0]);
    const board = root.querySelector<HTMLElement>('.ev-board');
    if (!typeId || !board) return;

    // 爬塔地图：滚到当前可走的那一层
    const scroller = board.querySelector<HTMLElement>('[data-scroll-y]');
    if (scroller) scroller.scrollTop = Number(scroller.dataset.scrollY) || 0;

    this.on(board, 'click', (event) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>('[data-act],[data-fight],[data-select]');
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (el.dataset.select !== undefined) {
        SELECTION.set(typeId, el.dataset.select);
        ctx.refresh();
        return;
      }
      if (el.dataset.fight !== undefined) {
        void ctx.launchEventBattle(el.dataset.fight);
        return;
      }
      const action = el.dataset.act!;
      if (el.dataset.confirm) this.confirm(root, el.dataset.confirm, () => void this.act(ctx, typeId, action));
      else void this.act(ctx, typeId, action);
    });
    const veil = root.querySelector<HTMLElement>('#evConfirm');
    if (veil) {
      this.on(veil, 'click', (event) => { if (event.target === veil) veil.hidden = true; });
      this.on(document, 'keydown', (event) => { if ((event as KeyboardEvent).key === 'Escape') veil.hidden = true; });
    }
  }

  private confirm(root: HTMLElement, copy: string, onOk: () => void): void {
    const veil = root.querySelector<HTMLElement>('#evConfirm');
    if (!veil) { onOk(); return; }
    veil.querySelector('#evConfirmCopy')!.textContent = copy;
    veil.hidden = false;
    const ok = veil.querySelector<HTMLButtonElement>('#evConfirmOk')!;
    const cancel = veil.querySelector<HTMLButtonElement>('#evConfirmCancel')!;
    ok.onclick = () => { veil.hidden = true; onOk(); };
    cancel.onclick = () => { veil.hidden = true; };
    cancel.focus();
  }

  private async act(ctx: ShellCtx, typeId: EventTypeId, action: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const { result } = await ctx.gateway.eventAction(typeId, action);
      if (isFailure(result)) { toast(result.message); return; }
      if (action.startsWith('go:') || action === 'start' || action === 'abandon') SELECTION.delete(typeId);
      ctx.refresh();
      ctx.refreshChrome();
      if (result.message) toast(result.message);
    } finally {
      this.busy = false;
    }
  }

  private startCountdown(ctx: ShellCtx, root: HTMLElement): void {
    const labels = [...root.querySelectorAll<HTMLElement>('[data-event-countdown]')];
    if (labels.length === 0) return;
    const update = (): void => {
      const now = gameNow();
      if (labels.some((label) => now >= Number(label.dataset.resetAt))) {
        if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        ctx.refresh();
        return;
      }
      for (const label of labels) label.textContent = weekCountdown(now, Number(label.dataset.resetAt));
    };
    update();
    this.countdownTimer = window.setInterval(update, 1_000);
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  dispose(): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
