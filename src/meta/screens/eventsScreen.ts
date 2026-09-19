/**
 * 六类常驻活动各自独立页面，#events 为六活动总览。
 *
 * 路由：#events/<typeId>（invasion|raidBoss|towerOfDoom|factionAssault|worldEvent|classTrials）；
 * 单页 = 横幅 + 规则卡 + 专属状态区 + 里程碑轨 + 商店。
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
    const statePanel = this.statePanelHtml(page);

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
    const goodsHtml = shop.rows
      .map((row) => {
        const g = row.goods;
        const soldOut = row.stockLeft !== null && row.stockLeft <= 0;
        const poor = shop.week.tokens < g.cost;
        const state = soldOut ? ' sold-out' : poor ? ' poor' : '';
        return `
          <button class="ev-goods-item${state}" data-goods="${g.id}" type="button" ${soldOut ? 'disabled' : ''}>
            <b>${g.name}</b>
            <small>${rewardSummary(g)}</small>
            <span class="ev-goods-meta">${row.stockLeft === null ? '不限量' : `剩余 ${row.stockLeft}`} · <i>代币 ${g.cost}</i></span>
          </button>`;
      })
      .join('');

    const activeBlock = `
          ${statePanel}
          <div class="ev-progress">
            <div class="ev-progress-head">
              <span>本周${page.metric.label}</span><b>${page.metric.value.toLocaleString('en-US')}</b>
              <small>本周胜场 ${week.wins} · ${typeId === 'worldEvent' ? '物资为里程碑进度' : typeId === 'classTrials' ? '连胜单场最多 240 积分' : '单场积分封顶 120'}</small>
            </div>
            <div class="ev-progress-bar"><i style="width:${Math.min(100, (page.metric.value / milestones[milestones.length - 1]!.points) * 100)}%"></i></div>
          </div>
          <div class="ev-track">${track}</div>
          <div class="ev-shop">
            <div class="ev-shop-head">
              <h2><small>EVENT SHOP</small>活动商店</h2>
              <span class="ev-tokens"><i></i>${def.tokenName} <b id="evTokenBalance">${shop.week.tokens}</b><small>仅限本活动使用 · 跨周作废</small></span>
            </div>
            <div class="ev-goods">${goodsHtml}</div>
          </div>`;

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
      return `<a class="ev-mile" href="#events/${def.id}" style="border-left:3px solid ${def.accent}">
        <div class="ev-mile-body">
          <div class="ev-mile-head"><b>${def.name}</b><span>${state.metric.value} ${state.metric.label}</span></div>
          <div class="ev-mile-rewards">${next ? `距「${next.label}」${Math.max(0, next.points - state.metric.value)} ${state.metric.label}` : '本周里程碑已达成'} · ${def.tokenName} ${week.tokens}</div>
        </div>
      </a>`;
    }).join('');
    return `${topbarHtml()}
      <div class="screen ev-screen">
        <section class="panel ev-panel">
          <header class="ev-banner"><div class="ev-banner-copy"><small>LIVE EVENTS</small><h1>活动中心</h1><p>六活动同时开放 · 周一 0:00 统一重置</p></div></header>
          <div class="ev-track">${cards}</div>
          <footer class="ev-rotation"><small>积分、代币、商店限量及里程碑每周重置 · 六活动进度独立</small></footer>
        </section>
      </div>${bottomNavHtml('', '选择活动出战')}${toastHtml()}`;
  }

  /** 各活动的专属状态区 */
  private statePanelHtml(page: ReturnType<typeof eventPageState>): string {
    const e = page.extra;
    switch (e.kind) {
      case 'invasion': {
        const nodes = [1, 2, 3]
          .map((i) => {
            const state = i < e.line ? 'cleared' : i === e.line ? 'current' : 'waiting';
            return `<div class="ev-line-node ${state}"><b>第 ${i} 防线</b><small>${state === 'cleared' ? '已突破' : state === 'current' ? '交战中' : '待战'}</small></div>`;
          })
          .join('<span class="ev-line-arrow">→</span>');
        return `
          <div class="ev-state">
            <h3><small>BATTLE LINES</small>入侵防线</h3>
            <div class="ev-lines">${nodes}</div>
            <small class="ev-state-note">本周守土成功 <b>${e.repelled}</b> 次 · 战败会退回第 1 条防线</small>
          </div>`;
      }
      case 'raidBoss': {
        const pct = e.max > 0 ? Math.max(0, Math.min(100, (e.hp / e.max) * 100)) : 100;
        return `
          <div class="ev-state">
            <h3><small>BOSS HP POOL</small>突袭首领 · Tier ${e.tier}</h3>
            <div class="ev-hpbar"><i style="width:${e.max > 0 ? pct : 100}%"></i><b>${e.max > 0 ? `${e.hp.toLocaleString('en-US')} / ${e.max.toLocaleString('en-US')}` : '首战生成血池'}</b></div>
            <small class="ev-state-note">每场打掉的血都会累计（战败也计） · 血池见底 = 讨伐成功 · 已讨伐 <b>${e.slain}</b> 只</small>
          </div>`;
      }
      case 'towerOfDoom':
        return `
          <div class="ev-state">
            <h3><small>TOWER FLOORS</small>末日之塔</h3>
            <div class="ev-tower">
              <span class="ev-floor now">第 ${e.floor} 层</span>
              <span class="ev-floor-sep">↑</span>
              <span class="ev-floor meta">最高 ${e.best} 层</span>
              ${e.running ? `<span class="ev-floor meta run">登塔中 · 存活 <b>${e.alive ?? '—'}</b> 人</span>` : '<span class="ev-floor meta">尚未开爬 · 出战即开爬</span>'}
              ${e.running ? '<button class="ev-abandon" id="evAbandon" type="button">放弃登塔（按当前进度结算）</button>' : ''}
            </div>
            <small class="ev-state-note">每 5 层有首领把守 · 队伍伤血/阵亡跨层延续，战败或全灭即结束</small>
          </div>`;
      case 'worldEvent':
        return `
          <div class="ev-state">
            <h3><small>SUPPLY DROP</small>物资收集</h3>
            <p class="ev-state-line">本周加成种族：<b>${e.race ?? '—'}</b>（编队中每 1 名，战斗掉落 +2）</p>
            <small class="ev-state-note">已累计 <b>${e.supplies}</b> 件物资 · 里程碑按物资结算</small>
          </div>`;
      case 'factionAssault':
        return `
          <div class="ev-state">
            <h3><small>FACTION BUFF</small>阵营克制</h3>
            <p class="ev-state-line">目标阵营：<b>${e.kingdom}</b> · 当前编队命中 <b>${e.match}</b> 名 → 全队 <b>攻击 +${e.match * 2}</b> / <b>生命 +${e.match * 10}</b></p>
            <small class="ev-state-note">编队页把该王国部队编进来就能堆加成 · 本周进攻胜场 ${e.wins}</small>
          </div>`;
      case 'classTrials':
        return `
          <div class="ev-state">
            <h3><small>WIN STREAK</small>连胜试炼</h3>
            <p class="ev-state-line">当前连胜 <b>${e.streak}</b> 场 · 积分倍率 <b>×${e.mult.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}</b>（战败清零）</p>
            <small class="ev-state-note">主角必须编入 · 职业经验 ×2 · 想拿高分就别断连胜</small>
          </div>`;
    }
  }

  mount(ctx: ShellCtx, _root: HTMLElement, param?: string): void {
    this.bind('#evFight', 'click', () => {
      void ctx.launchEventBattle();
    });
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
    document.querySelectorAll('[data-goods]').forEach((el) =>
      this.on(el, 'click', () => {
        const typeId = parseTypeId(param);
        if (!typeId) return;
        const goodsId = (el as HTMLElement).dataset.goods!;
        const now = Date.now();
        void ctx.gateway.buyEventGoods(goodsId, now, weekStartOf(now), typeId).then(({ result }) => {
          if (isFailure(result)) {
            toast(result.message);
            return;
          }
          toast(`已购入 · 代币余额 ${result.tokensLeft}`);
          ctx.refresh();
        });
      }),
    );
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
