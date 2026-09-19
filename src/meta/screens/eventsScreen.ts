/**
 * 六类常驻活动各自独立页面，#events 为六活动总览。
 *
 * 路由：#events/<typeId>（invasion|raidBoss|towerOfDoom|factionAssault|worldEvent|classTrials）；
 * 单页 = 横幅 + 规则卡 + 专属状态区 + 里程碑轨 + 常驻商店入口；货架在 #shop/<typeId> 独立屏。
 */
import { isFailure, weekStartOf } from '../gateway';
import { EVENT_MILESTONES, EVENT_ROTATION, WEEK_MS, type EventTypeId } from '../data/events';
import { INGOT_NAMES, stoneName, type IngotKey } from '../data/materials';
import {
  ensureEventWeek,
  eventPageState,
  eventShopOf,
} from '../systems/events';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import type { EventWeekState, MetaSave } from '../state/schema';
import { activeTeam } from '../systems/teamRules';

const TYPE_IDS: readonly EventTypeId[] = EVENT_ROTATION.map((t) => t.id);

function parseTypeId(param: string | undefined): EventTypeId | null {
  return TYPE_IDS.includes(param as EventTypeId) ? (param as EventTypeId) : null;
}

/** 里程碑/货架奖励摘要（进度轨与商店用） */
function rewardSummary(m: {
  gold?: number; souls?: number; gems?: number; goldKeys?: number; glory?: number;
  mats?: { ingots?: Record<string, number>; forgeScrolls?: number; traitstones?: Record<string, number> };
}): string {
  return [
    m.gold ? `黄金 ${m.gold.toLocaleString('en-US')}` : '',
    m.souls ? `灵魂 ${m.souls.toLocaleString('en-US')}` : '',
    m.gems ? `宝石 ${m.gems}` : '',
    m.goldKeys ? `金钥匙 ×${m.goldKeys}` : '',
    m.glory ? `荣耀 ${m.glory}` : '',
    ...Object.entries(m.mats?.ingots ?? {}).map(([k, n]) => `${INGOT_NAMES[k as IngotKey] ?? k} ×${n}`),
    m.mats?.forgeScrolls ? `熔铸符卷 ×${m.mats.forgeScrolls}` : '',
    ...Object.entries(m.mats?.traitstones ?? {}).map(([k, n]) => `${stoneName(k)} ×${n}`),
  ].filter(Boolean).join(' · ');
}

export class EventsScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx, param?: string): string {
    const now = Date.now();
    const weekStart = weekStartOf(now);
    const typeId = parseTypeId(param);
    if (!typeId) return this.overviewHtml(ctx, weekStart);
    const def = EVENT_ROTATION.find((t) => t.id === typeId)!;
    const page = eventPageState(ctx.save(), weekStart, typeId);
    const week = ensureEventWeek(ctx.save(), weekStart, typeId);
    const milestones = EVENT_MILESTONES[typeId]!;
    const hoursLeft = Math.max(0, Math.ceil((weekStart + WEEK_MS - now) / 3_600_000));
    const timeLeft = hoursLeft < 24 ? `剩 ${hoursLeft} 小时` : `剩 ${Math.ceil(hoursLeft / 24)} 天`;

    // —— 顶部页签（六页互切） ——
    const tabs = EVENT_ROTATION.map((t) => {
      const isPage = t.id === typeId;
      return `<a class="ev-tab${isPage ? ' page active' : ''}" href="#events/${t.id}"><i${isPage ? '' : ' hidden'}></i>${t.name}</a>`;
    }).join('');

    // —— 专属状态区（每类型一块） ——
    const statePanel = this.statePanelHtml(page, week, ctx.save());

    // —— 里程碑轨（进度按类型：物资 / 积分） ——
    const track = milestones
      .map((m, i) => {
        const done = week.claimed.includes(i);
        const state = done ? 'done' : page.metric.value >= m.points ? 'ready' : '';
        return `
          <div class="ev-mile ${state}">
            <div class="ev-mile-mark">${done ? '✓' : i + 1}</div>
            <div class="ev-mile-body">
              <div class="ev-mile-head"><b>${m.label}</b><span>${m.points} ${page.metric.label}</span></div>
              <div class="ev-mile-rewards">${rewardSummary(m)}</div>
            </div>
          </div>`;
      })
      .join('');

    const shop = eventShopOf(ctx.save(), weekStart, typeId);
    const limitedRemaining = shop.rows
      .filter((row) => row.stockLeft !== null)
      .reduce((sum, row) => sum + row.stockLeft! * row.goods.cost, 0);
    const availableLimited = shop.rows.filter((row) => row.stockLeft !== null && row.stockLeft > 0).length;
    const shopEntry = `
      <a class="ev-shop-entry ev-goods-item" id="evShopEntry" href="#shop/${typeId}">
        <span class="ev-shop-entry-icon" data-icon="bag"></span>
        <span class="ev-shop-entry-copy">
          <small>EVENT SHOP</small><b>活动商店</b>
          <span>本周 ${availableLimited} 件限量货在售 · 清空限量货还需 ${Math.max(0, limitedRemaining - shop.week.tokens)} 枚</span>
        </span>
        <span class="ev-shop-entry-balance"><i></i><b id="evTokenBalance">${shop.week.tokens}</b><small>${def.tokenName} · 去兑换 →</small></span>
      </a>`;
    const shopDock = `<div class="ev-shop-dock">${shopEntry}</div>`;

    const activeBlock = `
          ${statePanel}
          <div class="ev-progress">
            <div class="ev-progress-head">
              <span>本周${page.metric.label}</span><b>${page.metric.value.toLocaleString('en-US')}</b>
              <small>本周胜场 ${week.wins} · ${typeId === 'worldEvent' ? '物资为里程碑进度' : typeId === 'classTrials' ? '连胜单场最多 240 积分' : '单场积分封顶 120'}</small>
            </div>
            <div class="ev-progress-bar"><i style="width:${Math.min(100, (page.metric.value / milestones[milestones.length - 1]!.points) * 100)}%"></i></div>
          </div>
          <div class="ev-track ev-mile-track">${track}</div>
          `;

    return `
      ${topbarHtml()}
      <div class="screen ev-screen">
        <nav class="ev-tabs"><a class="ev-tab" href="#events">全部活动</a>${tabs}</nav>
        <section class="panel ev-panel">
          <header class="ev-banner">
            <div class="ev-banner-copy">
              <small>LIVE EVENT · ${def.tagline}</small>
              <h1>${def.name}</h1>
              <p>${def.brief}</p>
              <p class="ev-kingdom">${timeLeft} · 周一 0:00 重置</p>
            </div>
            <div class="ev-banner-meta">
              <button class="ev-fight" id="evFight" type="button"><span>${def.fightLabel}</span><small>ENTER BATTLE</small></button>
            </div>
          </header>

          <details class="ev-howto">
            <summary><small>HOW TO PLAY</small>玩法规则<em>点击展开</em></summary>
            <ul>${def.howto.map((line) => `<li>${line}</li>`).join('')}</ul>
          </details>

          ${activeBlock}

          <footer class="ev-rotation">
            <small>周一 0:00 六活动统一重置 · 积分、代币、商店限量及里程碑重来</small>
          </footer>
        </section>
        ${shopDock}
      </div>
      ${bottomNavHtml('', '里程碑达标自动入账')}
      ${toastHtml()}`;
  }

  private overviewHtml(ctx: ShellCtx, weekStart: number): string {
    const cards = EVENT_ROTATION.map((def) => {
      const state = eventPageState(ctx.save(), weekStart, def.id);
      const week = ensureEventWeek(ctx.save(), weekStart, def.id);
      const goals = EVENT_MILESTONES[def.id];
      const next = goals.find((_m, i) => !week.claimed.includes(i));
      const limited = eventShopOf(ctx.save(), weekStart, def.id).rows.filter((row) => row.stockLeft !== null && row.stockLeft > 0).length;
      return `<a class="ev-mile ev-overview-card" href="#events/${def.id}" style="border-left:3px solid ${def.accent}">
        <span class="ev-overview-icon" data-icon="${def.id === 'raidBoss' ? 'skull' : def.id === 'towerOfDoom' ? 'temple' : def.id === 'worldEvent' ? 'sparkles' : def.id === 'classTrials' ? 'crown' : 'banner'}"></span>
        <div class="ev-mile-body">
          <div class="ev-mile-head"><b>${def.name}</b><span>${state.metric.value} ${state.metric.label}</span></div>
          <div class="ev-mile-rewards">${next ? `距「${next.label}」${Math.max(0, next.points - state.metric.value)} ${state.metric.label}` : '本周里程碑已达成'} · ${def.tokenName} ${week.tokens}</div>
          <span class="ev-overview-shop"><span data-icon="bag"></span>${limited ? `商店 ${limited} 件限量货` : '查看活动商店'} <b>→</b></span>
        </div>
      </a>`;
    }).join('');
    const tabs = EVENT_ROTATION.map((def) => `<a class="ev-tab" href="#events/${def.id}"><span data-icon="${def.id === 'raidBoss' ? 'skull' : def.id === 'towerOfDoom' ? 'temple' : def.id === 'worldEvent' ? 'sparkles' : def.id === 'classTrials' ? 'crown' : 'banner'}"></span>${def.name}</a>`).join('');
    const overviewShop = eventShopOf(ctx.save(), weekStart, 'invasion');
    const overviewShopEntry = `<a class="ev-shop-entry ev-goods-item" id="evShopEntry" href="#shop/invasion"><span class="ev-shop-entry-icon" data-icon="bag"></span><span class="ev-shop-entry-copy"><small>ACTIVITY EXCHANGE</small><b>去活动商店</b><span>从总览直接查看入侵周货架与代币</span></span><span class="ev-shop-entry-balance"><i></i><b id="evTokenBalance">${overviewShop.week.tokens}</b><small>入侵代币 · 去兑换 →</small></span></a>`;
    return `${topbarHtml()}
      <div class="screen ev-screen">
        <nav class="ev-tabs">${tabs}</nav>
        <section class="panel ev-panel">
          <header class="ev-banner"><div class="ev-banner-copy"><small>LIVE EVENTS</small><h1>活动中心</h1><p>六活动同时开放 · 周一 0:00 统一重置</p></div><a class="ev-fight ev-overview-cta" id="evFight" href="#events/invasion"><span>进入活动</span><small>CHOOSE EVENT</small></a></header>
          <div class="ev-track ev-overview-track">${cards}</div>
          <footer class="ev-rotation"><small>积分、代币、商店限量及里程碑每周重置 · 六活动进度独立</small></footer>
        </section>
        <div class="ev-shop-dock">${overviewShopEntry}</div>
      </div>${bottomNavHtml('', '选择活动出战')}${toastHtml()}`;
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
            <h3><span class="ev-state-title-icon" data-icon="helmet"></span><span><small>BATTLE LINES</small>入侵防线</span><b>第 ${e.line} / 3</b></h3>
            <div class="ev-lines">${nodes}</div>
            <div class="ev-line-goal"><span data-icon="chest"></span><span>突破第 3 防线领取守土大赏</span><b>已守土 ${e.repelled} 次</b></div>
            <small class="ev-state-note">战胜推进，战败退回第 1 条防线</small>
          </div>`;
      }
      case 'raidBoss': {
        const pct = e.max > 0 ? Math.max(0, Math.min(100, (e.hp / e.max) * 100)) : 100;
        const segments = Array.from({ length: 8 }, (_, i) => `<i class="${e.max > 0 && (i + 1) / 8 <= pct / 100 ? 'on' : ''}"></i>`).join('');
        return `
          <div class="ev-state ev-state-raid">
            <h3><span class="ev-state-title-icon" data-icon="skull"></span><span><small>BOSS HP POOL</small>突袭首领</span><b>Tier ${e.tier}</b></h3>
            <div class="ev-boss-visual"><div class="ev-boss-medallion"><span data-icon="skull"></span><small>已讨伐 ${e.slain} 只</small></div><div class="ev-boss-pool"><div class="ev-hpbar"><i style="width:${e.max > 0 ? pct : 100}%"></i><b>${e.max > 0 ? `${e.hp.toLocaleString('en-US')} / ${e.max.toLocaleString('en-US')}` : '首战生成血池'}</b></div><div class="ev-hp-segments" aria-label="八场战斗血池刻度">${segments}</div><div class="ev-pool-caption"><span>血池刻度 · 每格约一场满伤</span><b>${Math.round(pct)}%</b></div></div></div>
            <small class="ev-state-note">胜负都累计伤害 · 血池见底 = 讨伐成功</small>
          </div>`;
      }
      case 'towerOfDoom':
        {
          const runTeam = week.runTeam ?? [];
          const hpCells = Array.from({ length: 4 }, (_, i) => {
            const member = runTeam[i];
            const ratio = member && member.maxHp > 0 ? Math.max(0, Math.min(1, member.hp / member.maxHp)) : member ? 0 : 1;
            const state = member?.defeated || ratio <= 0 ? 'dead' : member ? 'alive' : 'empty';
            return `<div class="ev-team-hp ${state}" title="${member ? `${Math.round(member.hp)} / ${Math.round(member.maxHp)} HP` : '未记录'}"><span class="ev-hp-pip"></span><b>${member ? `${Math.round(member.hp)}` : '—'}</b><small>${member?.defeated ? '阵亡' : member ? 'HP' : '待出战'}</small><i style="width:${Math.round(ratio * 100)}%"></i></div>`;
          }).join('');
        return `
          <div class="ev-state ev-state-tower">
            <h3><span class="ev-state-title-icon" data-icon="temple"></span><span><small>TOWER FLOORS</small>末日之塔</span><b>BEST ${e.best}</b></h3>
            <div class="ev-tower-visual"><div class="ev-tower-scale">${Array.from({ length: 6 }, (_, i) => `<i class="${i < Math.min(5, Math.max(0, Math.floor((e.floor - 1) / 5))) ? 'passed' : ''} ${i === Math.floor((e.floor - 1) / 5) ? 'current' : ''}"><b>${i * 5 + 1}</b><small>${i === 5 ? '顶' : i % 1 === 0 && i > 0 ? '首领' : '层'}</small></i>`).join('')}</div><div class="ev-tower-info"><span class="ev-floor now">第 ${e.floor} 层</span><span class="ev-floor meta">最高 ${e.best} 层</span>${e.running ? `<span class="ev-floor meta run">登塔中 · 存活 ${e.alive ?? '—'} 人</span>` : '<span class="ev-floor meta">尚未开爬 · 出战即开爬</span>'}</div></div>
            <div class="ev-team-hp-row" aria-label="登塔队伍生命状态">${hpCells}</div>
            <div class="ev-tower-actions">${e.running ? '<button class="ev-abandon" id="evAbandon" type="button">放弃并结算</button>' : ''}<small>每 5 层首领 · 伤血/阵亡跨层延续</small></div>
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
            <h3><span class="ev-state-title-icon" data-icon="sparkles"></span><span><small>SUPPLY DROP</small>物资收集</span><b>${e.supplies} 件</b></h3>
            <div class="ev-supply-card"><div class="ev-supply-race"><span data-icon="sparkles"></span><b>${e.race ?? '—'}</b><small>本周加成种族<br>每名出战 +2 物资</small></div><div class="ev-supply-track"><div class="ev-supply-fill" style="width:${pct}%"></div><div class="ev-supply-marks">${marks}</div><span class="ev-supply-next">${next ? `距「${next.label}」还差 ${Math.max(0, next.points - e.supplies)}` : '本周补给已集齐'}</span></div></div>
            <small class="ev-state-note">胜场掉落物资 · 里程碑按物资结算</small>
          </div>`;
        }
      case 'factionAssault':
        {
          const slots = Array.from({ length: 4 }, (_, i) => `<i class="${i < e.match ? 'hit' : ''}"><span data-icon="helmet"></span><b>${i < e.match ? '命中' : '空槽'}</b></i>`).join('');
        return `
          <div class="ev-state ev-state-faction">
            <h3><span class="ev-state-title-icon" data-icon="banner"></span><span><small>FACTION BUFF</small>阵营突袭</span><b>${e.match} / 4 命中</b></h3>
            <div class="ev-faction-visual"><div class="ev-faction-crest"><span data-icon="banner"></span><b>${e.kingdom}</b><small>目标阵营</small></div><div class="ev-faction-slots">${slots}</div><div class="ev-faction-buff"><span>全队攻击</span><b>+${e.match * 2}</b><span>生命</span><b>+${e.match * 10}</b></div></div>
            <div class="ev-faction-foot">${e.match === 0 ? '<button id="evFactionTeam" type="button">去编队补齐目标阵营 →</button>' : `<span>本周进攻胜场 ${e.wins} · 命中越多加成越高</span>`}</div>
          </div>`;
        }
      case 'classTrials':
        {
          const hasHero = activeTeam(save)?.members.some((member) => member.kind === 'hero') ?? false;
          const levels = [1, 1.3, 1.6, 2];
        return `
          <div class="ev-state ev-state-trials">
            <h3><span class="ev-state-title-icon" data-icon="crown"></span><span><small>WIN STREAK</small>连胜试炼</span><b>×${e.mult.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}</b></h3>
            <div class="ev-trial-visual"><div class="ev-trial-steps">${levels.map((mult, i) => `<i class="${e.streak >= i + 1 ? 'on' : ''} ${e.streak === i + 1 ? 'current' : ''}"><b>${i + 1}</b><small>×${mult.toFixed(1)}</small></i>`).join('')}</div><div class="ev-trial-seal"><span data-icon="crown"></span><b>封顶 ${e.streak >= 4 ? '240' : '192'} 分</b><small>战败清零 · 职业经验 ×2</small></div></div>
            <div class="ev-hero-lock ${hasHero ? 'ready' : 'blocked'}"><span data-icon="${hasHero ? 'check' : 'lock'}"></span><b>${hasHero ? '主角已编入，可出战' : '主角未编入，当前不可出战'}</b>${hasHero ? '' : '<small>去编队加入主角</small>'}</div>
          </div>`;
        }
    }
  }

  mount(ctx: ShellCtx, _root: HTMLElement, param?: string): void {
    if (parseTypeId(param)) {
      this.bind('#evFight', 'click', () => {
        void ctx.launchEventBattle();
      });
    }
    this.bind('#evAbandon', 'click', () => {
      const now = Date.now();
      void ctx.gateway.abandonTowerRun(weekStartOf(now)).then(({ result }) => {
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        toast(`已放弃登塔 · 到达第 ${result.floorReached} 层${result.glory ? ` · 荣耀 +${result.glory}` : ''}${result.scrolls ? ` · 符卷 +${result.scrolls}` : ''}`);
        ctx.refresh();
      });
    });
    this.bind('#evFactionTeam', 'click', () => ctx.navigate('#team'));
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
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
