/**
 * 六类常驻活动各自独立页面，#events 为六活动总览。
 *
 * 路由：#events/<typeId>（invasion|raidBoss|towerOfDoom|factionAssault|worldEvent|classTrials）；
 * 单页 = 横幅 + 规则卡 + 专属状态区 + 里程碑轨；货架在底部商店入口。
 */
import { isFailure, weekStartOf } from '../gateway';
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
  eventPageState, eventWeeklySummary, eventBattleReady, currentEventTheme,
} from '../systems/events';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import type { EventWeekState, MetaSave } from '../state/schema';
import { activeTeam } from '../systems/teamRules';

const TYPE_IDS: readonly EventTypeId[] = EVENT_ROTATION.map((t) => t.id);
const EVENT_ART: Record<EventTypeId, { src: string; label: string; icon: string }> = {
  invasion: { src: '/meta/assets/kingdom-desert.png', label: '边境要塞', icon: 'helmet' },
  raidBoss: { src: '/meta/assets/troops/troop-dragon.png', label: '突袭首领', icon: 'skull' },
  towerOfDoom: { src: '/meta/assets/kingdom-gothic.png', label: '末日之塔', icon: 'temple' },
  factionAssault: { src: '/meta/assets/kingdom-spire.png', label: '阵营领地', icon: 'banner' },
  worldEvent: { src: '/meta/assets/kingdom-forest.png', label: '世界事件遗迹', icon: 'sparkles' },
  classTrials: { src: '/meta/assets/troops/troop-paladin.png', label: '试炼战士', icon: 'crown' },
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

/** 里程碑奖励使用与货币同源的图标，保留完整名称供悬停和读屏使用。 */
function rewardSummary(m: {
  gold?: number; souls?: number; gems?: number; goldKeys?: number; glory?: number;
  mats?: { ingots?: Record<string, number>; forgeScrolls?: number; traitstones?: Record<string, number> };
}): string {
  const chip = (icon: string, name: string, count: number) => `<span class="ev-reward" title="${name} ×${count.toLocaleString('en-US')}"><span data-icon="${icon}"></span><span>${name} ×${count.toLocaleString('en-US')}</span></span>`;
  return [
    m.gold ? chip('coin', '黄金', m.gold) : '',
    m.souls ? chip('soul', '灵魂', m.souls) : '',
    m.gems ? chip('crystal', '宝石', m.gems) : '',
    m.goldKeys ? chip('key', '金钥匙', m.goldKeys) : '',
    m.glory ? chip('swords', '荣耀', m.glory) : '',
    ...Object.entries(m.mats?.ingots ?? {}).map(([k, n]) => chip('swords', INGOT_NAMES[k as IngotKey] ?? k, n)),
    m.mats?.forgeScrolls ? chip('book', '熔铸符卷', m.mats.forgeScrolls) : '',
    ...Object.entries(m.mats?.traitstones ?? {}).map(([k, n]) => chip('crystal', stoneName(k), n)),
  ].filter(Boolean).join('');
}

export class EventsScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private countdownTimer: number | null = null;

  html(ctx: ShellCtx, param?: string): string {
    const now = Date.now();
    const weekStart = weekStartOf(now);
    const [eventParam, subpage] = param?.split('/') ?? [];
    const typeId = parseTypeId(eventParam);
    if (!typeId) return this.overviewHtml(ctx, weekStart);
    const def = EVENT_ROTATION.find((t) => t.id === typeId)!;
    const art = EVENT_ART[typeId];
    const page = eventPageState(ctx.save(), weekStart, typeId);
    const week = ensureEventWeek(ctx.save(), weekStart, typeId);
    const milestones = EVENT_MILESTONES[typeId]!;
    const resetAt = weekStart + WEEK_MS;
    const nextMilestone = milestones.find((_m, i) => !week.claimed.includes(i));
    const nextGap = nextMilestone ? Math.max(0, nextMilestone.points - page.metric.value) : 0;
    const hasHero = activeTeam(ctx.save())?.members.some(m => m.kind === 'hero') ?? false;
    const readiness = eventBattleReady(ctx.save(), typeId, hasHero);


    // —— 顶部页签（六页互切） ——
    const tabs = EVENT_ROTATION.map((t) => {
      const isPage = t.id === typeId;
      return `<a class="ev-tab${isPage ? ' page active' : ''}" href="#events/${t.id}"><i${isPage ? '' : ' hidden'}></i>${t.name}</a>`;
    }).join('');
    const mobilePicker = `<label class="ev-mobile-picker"><span>切换活动</span><select id="evTypePicker" aria-label="切换活动">${EVENT_ROTATION.map((t) => `<option value="${t.id}"${t.id === typeId ? ' selected' : ''}>${t.name}</option>`).join('')}</select></label>`;

    // —— 专属状态区（每类型一块） ——
    const statePanel = subpage === 'rewards' ? '' : this.statePanelHtml(page, week, ctx.save());

    // —— 里程碑轨（进度按类型：物资 / 积分） ——
    const track = milestones
      .map((m, i) => {
        const done = week.claimed.includes(i);
        const state = done ? 'done' : page.metric.value >= m.points ? 'ready' : '';
        return `
          <div class="ev-mile ${state}">
            <div class="ev-mile-mark" data-icon="${done ? 'check' : 'chest'}"></div>
            <div class="ev-mile-body">
              <div class="ev-mile-head"><b>${m.label}</b><span>${m.points} ${page.metric.label}</span></div>
              <div class="ev-mile-rewards">${rewardSummary(m)}</div>
            </div>
          </div>`;
      })
      .join('');

    let towerConfirm = '';
    if (page.extra.kind === 'towerOfDoom' && page.extra.running) {
      const floorReached = Math.max(0, page.extra.floor - 1);
      const paid = week.eventData.towerPaidFloors ?? 0;
      const glory = Math.max(0, floorReached - paid) * 2;
      const scrolls = Math.max(0, Math.floor(floorReached / 5) - Math.floor(paid / 5));
      const reward = `荣耀 +${glory} · 熔铸符卷 +${scrolls}（只发本周新高层数差额）`;
      towerConfirm = `
        <div class="ev-tower-confirm-veil" id="evAbandonModal" hidden>
          <section class="ev-tower-confirm" role="dialog" aria-modal="true" aria-labelledby="evAbandonTitle" aria-describedby="evAbandonCopy">
            <h2 id="evAbandonTitle">放弃本轮登塔？</h2>
            <p id="evAbandonCopy">将按已通过的第 ${floorReached} 层结算；当前第 ${page.extra.floor} 层不会计入。</p>
            <dl>
              <div class="gain"><dt>本轮收益</dt><dd>${reward}</dd></div>
              <div class="clear"><dt>确认后清除</dt><dd>当前层进度 · 本轮队伍生命与阵亡状态</dd></div>
              <div><dt>继续保留</dt><dd>最高 ${page.extra.best} 层 · 本周积分、印记与已领奖励</dd></div>
            </dl>
            <div class="ev-tower-confirm-actions">
              <button class="ev-confirm-cancel" id="evCancelAbandon" type="button">继续登塔</button>
              <button class="ev-confirm-danger" id="evConfirmAbandon" type="button">确认放弃并结算</button>
            </div>
          </section>
        </div>`;
    }

    const theme = currentEventTheme(weekStart, typeId);
    const filter = typeId === 'factionAssault' || typeId === 'invasion'
      ? `kingdom/${encodeURIComponent(theme.kingdom ?? '')}`
      : typeId === 'worldEvent' ? `race/${encodeURIComponent(theme.bonusRace ?? '')}` : '';
    const options = EVENT_CHOICES[typeId].map((choice, i) => {
      const disabled = choice.id === 'rest' && (page.extra.kind !== 'towerOfDoom' || page.extra.floor <= 1 || page.extra.floor % 5 !== 1);
      return `<label class="ev-choice${disabled ? ' unavailable' : ''}"><input type="radio" name="eventChoice" value="${choice.id}"${i === 0 ? ' checked' : ''}${disabled ? ' disabled' : ''}><span><b>${choice.name}</b><small>${choice.description}</small></span></label>`;
    }).join('');
    const actions = `<section class="ev-decision" aria-label="本场战术选择"><div class="ev-choices">${options}</div>
      <div class="ev-action-row"><button class="ev-fight" id="evFight" type="button"${readiness ? ' disabled' : ''}><span data-icon="swords"></span>${def.fightLabel}</button>
      <a href="#team">调整编队</a>${filter ? `<a href="#troop/filter/${filter}">筛选加成角色</a>` : ''}${typeId === 'classTrials' ? '<a href="#hero">装备职业</a>' : ''}</div>
      ${readiness ? `<p class="ev-warning">${readiness}</p>` : ''}
      </section>`;
    const activeBlock = `
          ${statePanel}
          ${actions}
          <div class="ev-progress" aria-label="本周里程碑进度">
            <div class="ev-progress-head">
              <span class="ev-progress-current"><small>本周总${page.metric.label}</small><b>${page.metric.value.toLocaleString('en-US')}</b></span>
              <span class="ev-progress-next"><small>${nextMilestone ? `下一档 · ${nextMilestone.label}` : '本周目标达成'}</small><b>${nextMilestone ? nextGap ? `还差 ${nextGap} ${page.metric.label}` : '即将入账' : '全部完成'}</b></span>
            </div>
            <div class="ev-progress-bar"><i style="width:${Math.min(100, (page.metric.value / milestones[milestones.length - 1]!.points) * 100)}%"></i></div>
          </div>
          <div class="ev-secondary-links"><a class="ev-rewards-entry" href="#events/${typeId}/rewards"><span data-icon="chest"></span><span>里程碑奖励</span><span data-icon="arrow"></span></a>
          <a class="ev-shop-entry" href="#shop/${typeId}"><span data-icon="mark"></span>兑换奖励 <small>${week.tokens} 印记</small> <span data-icon="arrow"></span></a>
          </div>`;

    if (subpage === 'rules') {
      return `${topbarHtml()}<div class="screen ev-screen ev-detail ev-rules-page" style="--ev-accent:${def.accent}">
        <nav class="ev-tabs"><a class="ev-tab" href="#events">全部活动</a>${tabs}${mobilePicker}</nav>
        <section class="panel ev-panel"><a class="ev-rewards-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a><h1>${def.name} · 玩法</h1>
          <section class="ev-howto"><h2>玩法规则</h2><ul>${def.howto.map(line=>`<li>${line}</li>`).join('')}</ul></section>
          <section class="ev-howto"><h2>每周奖励</h2><p>周一 0:00 刷新活动进度与奖励。里程碑达标后自动发放，六种活动的胜场共同计入每周远征。</p><p>本周已获得 ${week.tokensEarned} / ${EVENT_WEEKLY_RULES.tokenCap} 印记。商店货品每两天刷新；印记周一清零，请提前使用。</p></section>
          <a class="ev-rewards-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回活动</a>
        </section></div>${bottomNavHtml('')}${toastHtml()}`;
    }

    if (subpage === 'rewards') {
      return `${topbarHtml()}
        <div class="screen ev-screen ev-detail ev-rewards-page" style="--ev-accent:${def.accent}">
          <nav class="ev-tabs"><a class="ev-tab" href="#events">全部活动</a>${tabs}${mobilePicker}</nav>
          <section class="panel ev-panel ev-rewards-panel">
            <header class="ev-rewards-header">
              <a class="ev-rewards-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a>
              <h1>${def.name} · 里程碑奖励</h1>
              <p>本周${page.metric.label} ${page.metric.value.toLocaleString('en-US')} · 达标后奖励自动入账</p>
            </header>
            <div class="ev-track ev-mile-track" aria-label="里程碑奖励">${track}</div>
            <a class="ev-rewards-back ev-rewards-back-bottom" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a>
          </section>
        </div>${bottomNavHtml('', '里程碑达标自动入账')}${toastHtml()}`;
    }

    return `
      ${topbarHtml()}
      <div class="screen ev-screen ev-detail" style="--ev-accent:${def.accent}">
        <nav class="ev-tabs"><a class="ev-tab" href="#events">全部活动</a>${tabs}${mobilePicker}</nav>
        <section class="panel ev-panel">
          <header class="ev-banner">
            <div class="ev-banner-copy">
              <div class="ev-title-row"><h1>${def.name}</h1><a href="#events/${typeId}/rules">玩法说明 ↗</a></div>
              <p>${def.brief}</p>
              <p class="ev-kingdom"><span data-icon="time"></span><span class="ev-countdown" data-event-countdown data-reset-at="${resetAt}">${weekCountdown(now, resetAt)}</span><span>· 周一 0:00 重置</span></p>

            </div>
            <div class="ev-banner-art"><img src="${art.src}" alt="${art.label}" /></div>
          </header>
          ${activeBlock}

        </section>
      </div>
      ${towerConfirm}
      ${bottomNavHtml('', '里程碑达标自动入账')}
      ${toastHtml()}`;
  }

  private overviewHtml(ctx: ShellCtx, weekStart: number): string {
    const cards = EVENT_ROTATION.map((def, i) => {
      const state = eventPageState(ctx.save(), weekStart, def.id);
      const week = ensureEventWeek(ctx.save(), weekStart, def.id);
      const goals = EVENT_MILESTONES[def.id];
      const next = goals.find((_m, i) => !week.claimed.includes(i));
      const art = EVENT_ART[def.id];
      const pct = Math.min(100, (state.metric.value / goals[goals.length - 1]!.points) * 100);
      const toNext = next ? Math.max(0, next.points - state.metric.value) : 0;
      return `<article class="ev-mile ev-overview-card" style="--ev-accent:${def.accent}">
        <a class="ev-overview-visual" href="#events/${def.id}"${i === 0 ? ' id="evFight"' : ''} aria-label="进入${def.name}"><img src="${art.src}" alt="${art.label}" loading="${i > 2 ? 'lazy' : 'eager'}" /></a>
        <div class="ev-overview-body">
          <a class="ev-overview-main ev-tab" href="#events/${def.id}"><span class="ev-overview-icon" data-icon="${art.icon}"></span><span class="ev-overview-title"><b>${def.name}</b></span><span class="ev-overview-arrow" data-icon="arrow"></span></a>
          <p class="ev-overview-hook">${def.brief}</p>
          <div class="ev-overview-progress"><span>${next ? `下一档 · ${next.label}` : '全部里程碑已达成'}</span><b>${next ? toNext ? `差 ${toNext} ${state.metric.label}` : '即将入账' : '已完成'}</b><i><em style="width:${pct}%"></em></i></div>
          <div class="ev-overview-foot"><span>周宝石 <b>${goals.reduce((sum, m, index) => sum + Math.max(0, (m.gems ?? 0) - (week.eventData[`gemPaid${index}`] ?? 0)), 0)}</b> 待获取</span><span>${def.tokenName} <b${i === 0 ? ' id="evTokenBalance"' : ''}>${week.tokens}</b></span></div>
        </div>
      </article>`;
    }).join('');
    const now = Date.now();
    const resetAt = weekStart + WEEK_MS;
    return `${topbarHtml()}
      <div class="screen ev-screen ev-overview-screen">
        <section class="ev-overview-layout">
          <header class="ev-banner ev-overview-header"><div><h1>活动中心</h1></div><p><span data-icon="time"></span><span class="ev-countdown" data-event-countdown data-reset-at="${resetAt}">${weekCountdown(now, resetAt)}</span><span>周一 0:00 重置</span></p></header>
          ${this.weeklySummaryHtml(ctx.save(), weekStart)}
          <div class="ev-track ev-overview-track">${cards}</div>

        </section>
      </div>${bottomNavHtml('', '选择活动出战')}${toastHtml()}`;
  }

  private weeklySummaryHtml(save: MetaSave, weekStart: number): string {
    const summary = eventWeeklySummary(save, weekStart);
    return `<section class="ev-weekly" aria-label="每周远征"><header><div><b>每周远征</b><small>活动胜场累计</small></div><strong>${summary.wins} / ${EVENT_SHARED_GOALS.at(-1)!.wins} 胜</strong></header>
      <div class="ev-weekly-goals">${summary.goals.map(g => `<div class="${g.claimed ? 'claimed' : ''}"><span>${g.wins}胜</span><b><span data-icon="crystal"></span>${g.gems}</b><small>${g.claimed ? '已入账' : summary.wins >= g.wins ? '下场结算入账' : `还差${g.wins - summary.wins}胜`}</small></div>`).join('')}</div></section>`;
  }

  /** 各活动的专属状态区 */
  private statePanelHtml(page: ReturnType<typeof eventPageState>, week: EventWeekState, save: MetaSave): string {
    const e = page.extra;
    switch (e.kind) {
      case 'invasion': {
        const nodes = [1, 2, 3]
          .map((i) => {
            const state = i < e.line ? 'cleared' : i === e.line ? 'current' : 'waiting';
            return `<div class="ev-line-node ${state}"><span class="ev-line-icon" data-icon="${state === 'cleared' ? 'check' : state === 'current' ? 'helmet' : 'lock'}"></span><b>第 ${i} 防线</b><small>${state === 'cleared' ? '已突破' : state === 'current' ? '交战中' : '待战'}</small><i class="ev-line-enemies"><em></em><em></em><em></em></i></div>`;
          })
          .join('<span class="ev-line-arrow">→</span>');
        return `
          <div class="ev-state ev-state-invasion">
            <h3><span class="ev-state-title-icon" data-icon="helmet"></span><span>入侵防线</span><b>第 ${e.line} / 3</b></h3>
            <div class="ev-lines">${nodes}</div>
            <div class="ev-line-goal"><span data-icon="chest"></span><span>突破第 3 防线领取守土大赏</span><b>已守土 ${e.repelled} 次</b></div>
          </div>`;
      }
      case 'raidBoss': {
        const pct = e.max > 0 ? Math.max(0, Math.min(100, (e.hp / e.max) * 100)) : 100;
        const segments = Array.from({ length: 8 }, (_, i) => `<i class="${e.max > 0 && (i + 1) / 8 <= pct / 100 ? 'on' : ''}"></i>`).join('');
        return `
          <div class="ev-state ev-state-raid">
            <h3><span class="ev-state-title-icon" data-icon="skull"></span><span>突袭首领</span><b>第 ${e.tier} 阶</b></h3>
            <div class="ev-boss-visual"><div class="ev-boss-medallion"><span data-icon="skull"></span><small>已讨伐 ${e.slain} 只</small></div><div class="ev-boss-pool"><div class="ev-hpbar"><i style="width:${e.max > 0 ? pct : 100}%"></i><b>${e.max > 0 ? `${e.hp.toLocaleString('en-US')} / ${e.max.toLocaleString('en-US')}` : '首战生成血池'}</b></div><div class="ev-hp-segments" aria-label="首领剩余生命百分比">${segments}</div><div class="ev-pool-caption"><span>首领剩余生命 · 半血后狂暴</span><b>${Math.round(pct)}%</b></div></div></div>
          </div>`;
      }
      case 'towerOfDoom':
        {
          const runTeam = week.runTeam ?? [];
          const hpCells = Array.from({ length: 4 }, (_, i) => {
            const member = runTeam[i];
            const ratio = member && member.maxHp > 0 ? Math.max(0, Math.min(1, member.hp / member.maxHp)) : member ? 0 : 1;
            const state = member?.defeated || ratio <= 0 ? 'dead' : member ? 'alive' : 'empty';
            return `<div class="ev-team-hp ${state}" title="${member ? `生命 ${Math.round(member.hp)} / ${Math.round(member.maxHp)}` : '未记录'}"><span class="ev-hp-pip"></span><b>${member ? `${Math.round(member.hp)}` : '—'}</b><small>${member?.defeated ? '阵亡' : member ? '生命' : '待出战'}</small><i style="width:${Math.round(ratio * 100)}%"></i></div>`;
          }).join('');
        return `
          <div class="ev-state ev-state-tower">
            <h3><span class="ev-state-title-icon" data-icon="temple"></span><span>末日之塔</span><b>最高 ${e.best} 层</b></h3>
            <div class="ev-tower-visual"><div class="ev-tower-scale">${Array.from({ length: 5 }, (_, i) => `<i class="${e.floor > (i + 1) * 5 ? 'passed' : ''} ${Math.ceil(e.floor / 5) === i + 1 ? 'current' : ''}"><b>${(i + 1) * 5}</b><small>${i === 4 ? '塔顶' : '首领'}</small></i>`).join('')}</div><div class="ev-tower-info"><span class="ev-floor now">第 ${e.floor} 层</span><span class="ev-floor meta">最高 ${e.best} 层</span>${e.running ? `<span class="ev-floor meta run">登塔中 · 存活 ${e.alive ?? '—'} 人</span>` : '<span class="ev-floor meta">尚未开爬 · 出战即开爬</span>'}</div></div>
            <div class="ev-team-hp-row" aria-label="登塔队伍生命状态">${hpCells}</div>
            <div class="ev-tower-actions">${e.running ? '<button class="ev-abandon" id="evAbandon" type="button">放弃并结算</button>' : ''}<small>共25层 · 阵容锁定 · 首领后可休整</small></div>
          </div>`;
        }
      case 'worldEvent':
        {
          const goals = EVENT_MILESTONES.worldEvent;
          const next = goals.find((m) => e.supplies < m.points);
          const pct = Math.min(100, (e.supplies / goals[goals.length - 1]!.points) * 100);
          const marks = goals.map((m) => `<i class="${e.supplies >= m.points ? 'done' : ''}" style="left:${Math.min(100, (m.points / goals[goals.length - 1]!.points) * 100)}%"><b>${m.points}</b><small data-icon="chest"></small></i>`).join('');
        return `
          <div class="ev-state ev-state-world">
            <h3><span class="ev-state-title-icon" data-icon="sparkles"></span><span>物资收集</span><b>${e.supplies} 件</b></h3>
            <div class="ev-supply-card"><div class="ev-supply-race"><span data-icon="sparkles"></span><b>${e.race ? raceName(e.race) : '—'}</b><small>本周加成种族<br>每名出战 +1 物资</small></div><div class="ev-supply-track"><div class="ev-supply-fill" style="width:${pct}%"></div><div class="ev-supply-marks">${marks}</div><span class="ev-supply-next">${next ? `距「${next.label}」还差 ${Math.max(0, next.points - e.supplies)}` : '本周补给已集齐'}</span></div></div>
          </div>`;
        }
      case 'factionAssault':
        {
          const slots = Array.from({ length: 4 }, (_, i) => `<i class="${i < e.match ? 'hit' : ''}"><span data-icon="helmet"></span><b>${i < e.match ? '加成' : '未匹配'}</b></i>`).join('');
        return `
          <div class="ev-state ev-state-faction">
            <h3><span class="ev-state-title-icon" data-icon="banner"></span><span>阵营加成</span><b>${e.match} / 4</b></h3>
            <div class="ev-faction-visual"><div class="ev-faction-crest"><span data-icon="banner"></span><b>${e.kingdom}</b><small>目标阵营</small></div><div class="ev-faction-slots">${slots}</div><div class="ev-faction-buff"><span>全队攻击</span><b>+${e.match * 2}</b><span>生命</span><b>+${e.match * 10}</b></div></div>
            <div class="ev-faction-foot"><span>当前据点：${['补给站', '城门', '堡垒'][e.wins % 3]} · 第${Math.floor(e.wins / 3) + 1}轮</span></div>
          </div>`;
        }
      case 'classTrials':
        {
          const hasHero = activeTeam(save)?.members.some((member) => member.kind === 'hero') ?? false;
          const levels = [1, 1.3, 1.6, 2];
        return `
          <div class="ev-state ev-state-trials">
            <h3><span class="ev-state-title-icon" data-icon="crown"></span><span>连胜试炼</span><b>×${e.mult.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}</b></h3>
            <div class="ev-trial-visual"><div class="ev-trial-steps">${levels.map((mult, i) => `<i class="${e.streak >= i + 1 ? 'on' : ''} ${e.streak === i + 1 ? 'current' : ''}"><b>${i + 1}</b><small>×${mult.toFixed(1)}</small></i>`).join('')}</div><div class="ev-trial-seal"><span data-icon="crown"></span><b>下一胜基础 ${Math.round(100 * e.mult)} 分</b><small>战败清零 · 考验达标经验 ×3</small></div></div>
            <div class="ev-hero-lock ${hasHero ? 'ready' : 'blocked'}"><span data-icon="${hasHero ? 'check' : 'lock'}"></span><b>${hasHero ? '主角已编入，可出战' : '主角未编入，当前不可出战'}</b>${hasHero ? '' : '<a href="#team">去编队加入主角 <span data-icon="arrow"></span></a>'}</div>
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
      const now = Date.now();
      void ctx.gateway.abandonTowerRun(weekStartOf(now)).then(({ result }) => {
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
      const now = Date.now();
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
