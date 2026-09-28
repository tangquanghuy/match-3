/**
 * 六类常驻活动各自独立页面，#events 为六活动总览。
 *
 * 路由：#events/<typeId>（invasion|raidBoss|towerOfDoom|factionAssault|worldEvent|classTrials）；
 * 子页：#events/<typeId>/rules（玩法说明）、#events/<typeId>/rewards（里程碑奖励）。
 * 详情页 = 左栏（主视觉 + 本周进度 + 奖励/兑换入口）+ 右栏（专属状态区 + 本场战术与出战）。
 * 样式见 styles/events.css（本页不再加载 live.css）。
 */
import { isFailure, weekStartOf, gameNow } from '../gateway';
import {
  EVENT_MILESTONES,
  EVENT_ROTATION,
  EVENT_WEEKLY_RULES, EVENT_SHARED_GOALS, EVENT_CHOICES,
  WEEK_MS,
  type EventTypeId,
} from '../data/events';
import { INGOT_NAMES, stoneName, type IngotKey } from '../data/materials';
import { raceName } from '../data/races';
import {
  ensureEventWeek,
  eventPageState, eventWeeklySummary, eventBattleReady, currentEventTheme, eventsUnlocked, eventNextLevel,
  type EventPageState,
} from '../systems/events';
import { eventsLockPanelHtml } from './eventsLock';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import { cssUrlVar, shopArt } from '../shell/artAssets';
import { ingotArt, materialImg, scrollArt, stoneMarkupForKey } from '../shell/materialArt';
import type { Screen, ShellCtx } from '../shell/screen';
import type { EventWeekState, MetaSave } from '../state/schema';
import { activeTeam } from '../systems/teamRules';

const TYPE_IDS: readonly EventTypeId[] = EVENT_ROTATION.map((t) => t.id);
const EVENT_ICON: Record<EventTypeId, string> = {
  invasion: 'helmet', raidBoss: 'skull', towerOfDoom: 'temple',
  factionAssault: 'banner', worldEvent: 'sparkles', classTrials: 'crown',
};

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

/** 敌人等级标签：普通段写等级，最高档额外标注 */
function levelTag(level: { level: number; top: boolean }): string {
  return `<span class="ev-level${level.top ? ' top' : ''}">${level.top ? '最高档 · ' : '敌人 '}Lv.${level.level}</span>`;
}

/** 各活动一句话的当前局面（总览卡片用，替代重复的介绍文案） */
function stateSummary(page: EventPageState): string {
  const e = page.extra;
  switch (e.kind) {
    case 'invasion': return `第 ${e.line} / 3 防线 · 守土 ${e.repelled} 次`;
    case 'raidBoss': return e.max > 0 ? `第 ${e.tier} 阶 · 首领 ${Math.round((e.hp / e.max) * 100)}%` : `第 ${e.tier} 阶 · 首领待现身`;
    case 'towerOfDoom': return e.running ? `第 ${e.floor} 层 · 存活 ${e.alive ?? '—'} 人` : `最高 ${e.best} / 25 层`;
    case 'factionAssault': return `${e.kingdom} · 加成 ${e.match} / 4`;
    case 'worldEvent': return `物资 ${e.supplies} · ${e.race ? raceName(e.race) : '—'}`;
    case 'classTrials': return `连胜 ${e.streak} · 下一胜 ×${trimMult(e.mult)}`;
  }
}

function trimMult(mult: number): string {
  return mult.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export class EventsScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private countdownTimer: number | null = null;

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
      return `${topbarHtml()}<div class="screen ev-screen ev-detail ev-rules-page" ${style}>
        ${tabBar}
        <section class="panel ev-panel">
          <header class="ev-sub-head"><a class="ev-rewards-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a><h1>${def.name} · 玩法</h1></header>
          <section class="ev-howto"><h2>玩法规则</h2><ul>${def.howto.map((line) => `<li>${line}</li>`).join('')}</ul></section>
          <section class="ev-howto"><h2>难度</h2><ul><li>敌人从 Lv.20 起随本周进度变强，与你的队伍强度无关。</li><li>普通段打完进入最高档：胜利敌人 +3 级，战败 -3 级。</li></ul></section>
          <section class="ev-howto"><h2>每周奖励</h2><ul><li>周一 0:00 刷新进度、奖励与印记。</li><li>里程碑达标自动发放；六种活动的胜场共同计入每周远征。</li><li>本周印记 ${week.tokensEarned} / ${EVENT_WEEKLY_RULES.tokenCap}，商店每两天补货。</li></ul></section>
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
    const hasHero = activeTeam(save)?.members.some((m) => m.kind === 'hero') ?? false;
    const readiness = eventBattleReady(save, typeId, hasHero);
    const theme = currentEventTheme(weekStart, typeId);
    const themeChip = theme.kingdom
      ? `<span class="ev-theme"><span data-icon="banner"></span>${theme.kingdom}</span>`
      : theme.bonusRace ? `<span class="ev-theme"><span data-icon="sparkles"></span>${raceName(theme.bonusRace)}</span>` : '';

    let towerConfirm = '';
    if (page.extra.kind === 'towerOfDoom' && page.extra.running) {
      const floorReached = Math.max(0, page.extra.floor - 1);
      const paid = week.eventData.towerPaidFloors ?? 0;
      const glory = Math.max(0, floorReached - paid) * 2;
      const scrolls = Math.max(0, Math.floor(floorReached / 5) - Math.floor(paid / 5));
      towerConfirm = `
        <div class="ev-tower-confirm-veil" id="evAbandonModal" hidden>
          <section class="ev-tower-confirm" role="dialog" aria-modal="true" aria-labelledby="evAbandonTitle" aria-describedby="evAbandonCopy">
            <h2 id="evAbandonTitle">放弃本轮登塔？</h2>
            <p id="evAbandonCopy">按已通过的第 ${floorReached} 层结算，当前第 ${page.extra.floor} 层不计入。</p>
            <dl>
              <div class="gain"><dt>本轮收益</dt><dd>荣耀 +${glory} · 熔铸符卷 +${scrolls}</dd></div>
              <div class="clear"><dt>将清除</dt><dd>当前层进度 · 本轮队伍生命与阵亡状态</dd></div>
              <div><dt>保留</dt><dd>最高 ${page.extra.best} 层 · 积分、印记与已领奖励</dd></div>
            </dl>
            <div class="ev-tower-confirm-actions">
              <button class="ev-confirm-cancel" id="evCancelAbandon" type="button">继续登塔</button>
              <button class="ev-confirm-danger" id="evConfirmAbandon" type="button">放弃并结算</button>
            </div>
          </section>
        </div>`;
    }

    const filter = typeId === 'factionAssault' || typeId === 'invasion'
      ? `kingdom/${encodeURIComponent(theme.kingdom ?? '')}`
      : typeId === 'worldEvent' ? `race/${encodeURIComponent(theme.bonusRace ?? '')}` : '';
    const options = EVENT_CHOICES[typeId].map((choice, i) => {
      const disabled = choice.id === 'rest' && (page.extra.kind !== 'towerOfDoom' || page.extra.floor <= 1 || page.extra.floor % 5 !== 1);
      return `<label class="ev-choice${disabled ? ' unavailable' : ''}"><input type="radio" name="eventChoice" value="${choice.id}"${i === 0 ? ' checked' : ''}${disabled ? ' disabled' : ''}><span><b>${choice.name}</b><small>${choice.description}</small></span></label>`;
    }).join('');
    const actions = `<section class="ev-decision" aria-label="本场战术">
        <div class="ev-choices">${options}</div>
        <div class="ev-action-row"><button class="ev-fight" id="evFight" type="button"${readiness ? ' disabled' : ''}><span data-icon="swords"></span>${def.fightLabel.replace(/\s+/g, '')}</button>
          <a href="#team"><span data-icon="helmet"></span>调整编队</a>${filter ? `<a href="#troop/filter/${filter}"><span data-icon="sparkles"></span>加成角色</a>` : ''}${typeId === 'classTrials' ? '<a href="#hero"><span data-icon="crown"></span>装备职业</a>' : ''}</div>
        ${readiness ? `<p class="ev-warning" role="status"><span data-icon="lock"></span>${readiness}</p>` : ''}
      </section>`;
    const pct = Math.min(100, (page.metric.value / milestones[milestones.length - 1]!.points) * 100);
    const progress = `<div class="ev-progress" aria-label="本周里程碑进度">
        <div class="ev-progress-head">
          <span class="ev-progress-current"><small>本周${page.metric.label}</small><b>${fmt(page.metric.value)}</b></span>
          <span class="ev-progress-next"><small>${nextMilestone ? nextMilestone.label : '本周目标达成'}</small><b>${nextMilestone ? nextGap ? `还差 ${fmt(nextGap)}` : '即将入账' : '全部完成'}</b></span>
        </div>
        <div class="ev-progress-bar">${milestones.map((m, i) => `<em class="${week.claimed.includes(i) ? 'done' : ''}" style="left:${(m.points / milestones[milestones.length - 1]!.points) * 100}%"></em>`).join('')}<i style="width:${pct}%"></i></div>
      </div>`;
    const links = `<div class="ev-secondary-links">
        <a class="ev-rewards-entry" href="#events/${typeId}/rewards"><span data-icon="chest"></span><span>里程碑</span><b>${week.claimed.length} / ${milestones.length}</b></a>
        <a class="ev-shop-entry" href="#shop/${typeId}"><span data-icon="mark"></span><span>兑换</span><b>${fmt(week.tokens)} 印记</b></a>
      </div>`;

    return `
      ${topbarHtml()}
      <div class="screen ev-screen ev-detail" ${style}>
        ${tabBar}
        <section class="panel ev-panel">
          <aside class="ev-side">
            <header class="ev-banner">
              <div class="ev-banner-art"><img src="${eventArt(typeId)}" alt="${def.name}" /><span class="ev-banner-icon" data-icon="${EVENT_ICON[typeId]}"></span></div>
              <div class="ev-banner-copy">
                <div class="ev-title-row"><h1>${def.name}</h1><a href="#events/${typeId}/rules">玩法说明</a></div>
                <div class="ev-tags">${levelTag(eventNextLevel(save, weekStart, typeId))}${themeChip}</div>
                <p class="ev-kingdom"><span data-icon="time"></span><span class="ev-countdown" data-event-countdown data-reset-at="${resetAt}">${weekCountdown(now, resetAt)}</span><span>周一 0:00 重置</span></p>
              </div>
            </header>
          </aside>
          <div class="ev-main">
            ${this.statePanelHtml(page, week, save)}
            ${progress}
            ${links}
            ${actions}
          </div>
        </section>
      </div>
      ${towerConfirm}
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
          <p class="ev-overview-hook">${stateSummary(state)}</p>
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

  /** 各活动的专属状态区 */
  private statePanelHtml(page: EventPageState, week: EventWeekState, save: MetaSave): string {
    const e = page.extra;
    const head = (icon: string, title: string, value: string) =>
      `<h3><span class="ev-state-title-icon" data-icon="${icon}"></span><span>${title}</span><b>${value}</b></h3>`;
    switch (e.kind) {
      case 'invasion': {
        const nodes = [1, 2, 3].map((i) => {
          const state = i < e.line ? 'cleared' : i === e.line ? 'current' : 'waiting';
          return `<div class="ev-line-node ${state}"><span class="ev-line-icon" data-icon="${state === 'cleared' ? 'check' : state === 'current' ? 'helmet' : 'lock'}"></span><b>第 ${i} 防线</b><small>${state === 'cleared' ? '已突破' : state === 'current' ? '交战中' : '待战'}</small><i class="ev-line-enemies"><em></em><em></em>${i === 3 ? '<em class="boss"></em>' : '<em></em>'}</i></div>`;
        }).join('');
        return `<div class="ev-state ev-state-invasion">
            ${head('helmet', '入侵防线', `第 ${e.line} / 3`)}
            <div class="ev-lines">${nodes}</div>
            <div class="ev-line-goal"><span data-icon="chest"></span><span>攻破第 3 防线：守土大赏</span><b>已守土 ${e.repelled} 次</b></div>
          </div>`;
      }
      case 'raidBoss': {
        const pct = e.max > 0 ? Math.max(0, Math.min(100, (e.hp / e.max) * 100)) : 100;
        const segments = Array.from({ length: 10 }, (_, i) => `<i class="${e.max === 0 || (i + 1) / 10 <= pct / 100 + 1e-9 ? 'on' : ''}"></i>`).join('');
        return `<div class="ev-state ev-state-raid">
            ${head('skull', '突袭首领', `第 ${e.tier} 阶`)}
            <div class="ev-boss-visual">
              <div class="ev-boss-medallion"><span data-icon="skull"></span><small>已讨伐 ${e.slain}</small></div>
              <div class="ev-boss-pool">
                <div class="ev-hpbar"><i style="width:${pct}%"></i><b>${e.max > 0 ? `${fmt(e.hp)} / ${fmt(e.max)}` : '首战生成血池'}</b></div>
                <div class="ev-hp-segments" aria-hidden="true">${segments}</div>
                <div class="ev-pool-caption"><span>半血后狂暴 · 按伤害计分</span><b>${Math.round(pct)}%</b></div>
              </div>
            </div>
          </div>`;
      }
      case 'towerOfDoom': {
        const runTeam = week.runTeam ?? [];
        const hpCells = Array.from({ length: 4 }, (_, i) => {
          const member = runTeam[i];
          const ratio = member && member.maxHp > 0 ? Math.max(0, Math.min(1, member.hp / member.maxHp)) : member ? 0 : 1;
          const state = member?.defeated || ratio <= 0 ? 'dead' : member ? 'alive' : 'empty';
          return `<div class="ev-team-hp ${state}" title="${member ? `生命 ${Math.round(member.hp)} / ${Math.round(member.maxHp)}` : '未出战'}"><b>${member ? (member.defeated ? '阵亡' : Math.round(member.hp)) : '—'}</b><i style="width:${Math.round(ratio * 100)}%"></i></div>`;
        }).join('');
        const scale = Array.from({ length: 5 }, (_, i) => {
          const mark = (i + 1) * 5;
          const cls = [e.floor > mark ? 'passed' : '', Math.ceil(e.floor / 5) === i + 1 ? 'current' : ''].filter(Boolean).join(' ');
          return `<i class="${cls}"><b>${mark}</b></i>`;
        }).join('');
        return `<div class="ev-state ev-state-tower">
            ${head('temple', '末日之塔', `最高 ${e.best} 层`)}
            <div class="ev-tower-visual">
              <div class="ev-tower-scale" aria-label="每 5 层一名首领">${scale}</div>
              <div class="ev-tower-info"><span class="ev-floor now">第 ${e.floor} 层</span>${e.running ? `<span class="ev-floor meta run">存活 ${e.alive ?? '—'} 人</span>` : '<span class="ev-floor meta">尚未开爬</span>'}</div>
            </div>
            ${e.running ? `<div class="ev-team-hp-row" aria-label="登塔队伍生命">${hpCells}</div><div class="ev-tower-actions"><button class="ev-abandon" id="evAbandon" type="button">放弃并结算</button></div>` : ''}
          </div>`;
      }
      case 'worldEvent': {
        const goals = EVENT_MILESTONES.worldEvent;
        const top = goals[goals.length - 1]!.points;
        const next = goals.find((m) => e.supplies < m.points);
        const pct = Math.min(100, (e.supplies / top) * 100);
        const marks = goals.map((m) => `<i class="${e.supplies >= m.points ? 'done' : ''}" style="left:${(m.points / top) * 100}%"><b>${m.points}</b></i>`).join('');
        return `<div class="ev-state ev-state-world">
            ${head('sparkles', '物资收集', `${e.supplies} 件`)}
            <div class="ev-supply-card">
              <div class="ev-supply-race"><span data-icon="sparkles"></span><b>${e.race ? raceName(e.race) : '—'}</b><small>每名出战 +1</small></div>
              <div class="ev-supply-track"><div class="ev-supply-bar"><div class="ev-supply-fill" style="width:${pct}%"></div><div class="ev-supply-marks">${marks}</div></div><span class="ev-supply-next">${next ? `距「${next.label}」还差 ${next.points - e.supplies}` : '本周补给已集齐'}</span></div>
            </div>
          </div>`;
      }
      case 'factionAssault': {
        const slots = Array.from({ length: 4 }, (_, i) => `<i class="${i < e.match ? 'hit' : ''}"><span data-icon="helmet"></span></i>`).join('');
        return `<div class="ev-state ev-state-faction">
            ${head('banner', '阵营加成', `${e.match} / 4`)}
            <div class="ev-faction-visual">
              <div class="ev-faction-crest"><span data-icon="banner"></span><b>${e.kingdom}</b></div>
              <div class="ev-faction-slots" aria-label="编入目标王国的部队">${slots}</div>
              <div class="ev-faction-buff"><span>攻击 <b>+${e.match * 2}</b></span><span>生命 <b>+${e.match * 10}</b></span></div>
            </div>
            <div class="ev-faction-foot"><span>当前据点 · ${['补给站', '城门', '堡垒'][e.wins % 3]}</span><b>第 ${Math.floor(e.wins / 3) + 1} 轮</b></div>
          </div>`;
      }
      case 'classTrials': {
        const hasHero = activeTeam(save)?.members.some((member) => member.kind === 'hero') ?? false;
        const levels = [1, 1.3, 1.6, 2];
        return `<div class="ev-state ev-state-trials">
            ${head('crown', '连胜试炼', `×${trimMult(e.mult)}`)}
            <div class="ev-trial-visual">
              <div class="ev-trial-steps">${levels.map((mult, i) => `<i class="${e.streak >= i + 1 ? 'on' : ''}${e.streak === i + 1 ? ' current' : ''}"><b>${i + 1}</b><small>×${mult.toFixed(1)}</small></i>`).join('')}</div>
              <div class="ev-trial-seal"><small>下一胜</small><b>${Math.round(100 * e.mult)} 分</b></div>
            </div>
            ${hasHero ? '' : '<div class="ev-hero-lock blocked"><span data-icon="lock"></span><b>主角未编入</b><a href="#team">去编队 <span data-icon="arrow"></span></a></div>'}
          </div>`;
      }
    }
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
    if (parseTypeId(param)) {
      this.bind('#evFight', 'click', () => {
        void ctx.launchEventBattle(root.querySelector<HTMLInputElement>('input[name="eventChoice"]:checked')?.value);
      });
    }
    this.bind('#evAbandon', 'click', () => this.openTowerAbandon());
    this.bind('#evCancelAbandon', 'click', () => this.closeTowerAbandon());
    this.bind('#evConfirmAbandon', 'click', () => {
      const button = $('#evConfirmAbandon') as HTMLButtonElement;
      button.disabled = true;
      void ctx.gateway.abandonTowerRun().then(({ result }) => {
        if (isFailure(result)) {
          button.disabled = false;
          toast(result.message);
          return;
        }
        this.closeTowerAbandon();
        toast(`已放弃登塔 · 到达第 ${result.floorReached} 层${result.glory ? ` · 荣耀 +${result.glory}` : ''}${result.scrolls ? ` · 符卷 +${result.scrolls}` : ''}`);
        ctx.refresh();
      });
    });
    this.on(document, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.closeTowerAbandon();
    });
    const abandonModal = root.querySelector<HTMLElement>('#evAbandonModal');
    if (abandonModal) {
      this.on(abandonModal, 'click', (event) => {
        if (event.target === abandonModal) this.closeTowerAbandon();
      });
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

  private openTowerAbandon(): void {
    const modal = $('#evAbandonModal');
    modal.hidden = false;
    ($('#evCancelAbandon') as HTMLButtonElement).focus();
  }

  private closeTowerAbandon(): void {
    const modal = document.querySelector<HTMLElement>('#evAbandonModal');
    if (modal) modal.hidden = true;
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
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
