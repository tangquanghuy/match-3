/**
 * 馈赠：一次性成长里程碑（#gifts，可选 #gifts/<分组>）。
 * 左栏分组、右栏里程碑卡片（分页，不做长列表）；达成后手动领取宝石。
 */
import { isFailure } from '../gateway';
import { GIFT_GROUPS, GIFT_STARTER_ID, GIFT_TOTAL_GEMS, type GiftGroupId, type GiftMetric } from '../data/gifts';
import { giftRows, type GiftRow } from '../systems/gifts';
import { rarityNameByIndex } from '../data/rarity';
import { queueGiftReveal } from './chestsScreen';
import { bottomNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { cssUrlVar, giftArt } from '../shell/artAssets';
import type { Screen, ShellCtx } from '../shell/screen';

const PAGE_SIZE = 6;
const fmt = (n: number): string => n.toLocaleString('en-US');

function groupOf(param: string | undefined): GiftGroupId | null {
  const id = param?.split('/')[0];
  return GIFT_GROUPS.some((g) => g.id === id) ? (id as GiftGroupId) : null;
}

/** 默认分组：有可领的优先，其次第一个没领完的 */
function defaultGroup(rows: GiftRow[]): GiftGroupId {
  return (rows.find((r) => r.status === 'ready') ?? rows.find((r) => r.status !== 'claimed') ?? rows[0]!).gift.group;
}

const LEAGUES = ['青铜', '白银', '黄金', '白金', '翡翠', '蓝宝石', '紫水晶', '黄玉', '红宝石', '钻石'];

/** 卡片顶部的大号目标（一眼看出这一档要到哪） */
function goalOf(metric: GiftMetric, target: number, id: string): string {
  switch (metric) {
    case 'always': return id === GIFT_STARTER_ID ? '见面礼' : '补给';
    case 'heroLevel': return `Lv.${target}`;
    case 'battlesWon': case 'arenaWins': case 'eventWins': return `${fmt(target)} 胜`;
    case 'arenaBestRun': return `${target} 连胜`;
    case 'questChains': return `${target} 国`;
    case 'kingdomsMaxed': return `${target} 国满级`;
    case 'invasionLeague': return LEAGUES[target] ?? `${target}`;
    case 'invasionBattles': return `${target} 场`;
    case 'towerBest': return `${target} 层`;
    case 'troopsOwned': return `${target} 名`;
  }
}

/** 目标下方的短名词（目标本身已写出数值，不再重复整句） */
const METRIC_NOUN: Record<GiftMetric, string> = {
  always: '', heroLevel: '主角等级', battlesWon: '累计胜场', questChains: '主线通关', kingdomsMaxed: '王国 10 级',
  arenaWins: '竞技场胜场', arenaBestRun: '单轮连胜', invasionLeague: '入侵官阶', invasionBattles: '完成入侵',
  eventWins: '周活动胜场', towerBest: '末日之塔', troopsOwned: '收集部队',
};

/** 分组当前进度一句话（面板标题旁） */
function currentOf(metric: GiftMetric, value: number): string {
  switch (metric) {
    case 'always': return '';
    case 'heroLevel': return `当前 Lv.${value}`;
    case 'invasionLeague': return `当前 ${LEAGUES[value] ?? value}`;
    default: return `当前 ${fmt(value)}`;
  }
}

function groupIcon(id: GiftGroupId, fallback: string): string {
  const art = giftArt(id);
  return art ? `<img src="${art}" alt="" />` : `<span data-icon="${fallback}"></span>`;
}

export class GiftsScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private claiming = false;
  private mountedRoot: HTMLElement | null = null;
  private page = 0;
  private pageGroup: GiftGroupId | null = null;

  html(ctx: ShellCtx, param?: string): string {
    const save = ctx.save();
    const rows = giftRows(save);
    const group = groupOf(param) ?? defaultGroup(rows);
    if (group !== this.pageGroup) { this.pageGroup = group; this.page = 0; }
    const claimedGems = rows.filter((r) => r.status === 'claimed').reduce((sum, r) => sum + r.gift.gems, 0);
    const ready = rows.filter((r) => r.status === 'ready');
    const readyGems = ready.reduce((sum, r) => sum + r.gift.gems, 0);

    const tabs = GIFT_GROUPS.map((g) => {
      const list = rows.filter((r) => r.gift.group === g.id);
      const done = list.filter((r) => r.status === 'claimed').length;
      const readyCount = list.filter((r) => r.status === 'ready').length;
      const active = g.id === group;
      return `<a class="gift-tab${active ? ' active' : ''}${done === list.length ? ' complete' : ''}" href="#gifts/${g.id}"${active ? ' aria-current="page"' : ''}>
          <span class="gift-tab-icon">${groupIcon(g.id, g.icon)}</span>
          <span class="gift-tab-copy"><b>${g.name}</b><small>${done} / ${list.length}</small></span>
          ${readyCount ? `<i class="gift-dot" aria-label="${readyCount} 项可领">${readyCount}</i>` : ''}
        </a>`;
    }).join('');

    const list = rows.filter((r) => r.gift.group === group);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    const shown = list.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const cards = shown.map((row) => this.cardHtml(row)).join('');
    const pager = pages > 1
      ? `<nav class="gift-pager" aria-label="分页">${Array.from({ length: pages }, (_, i) => `<button type="button" data-gift-page="${i}"${i === this.page ? ' aria-current="true" class="on"' : ''}>${i + 1}</button>`).join('')}</nav>`
      : '';
    const def = GIFT_GROUPS.find((g) => g.id === group)!;

    return `${topbarHtml()}
      <div class="screen gift-screen">
        <header class="gift-hero" style='${cssUrlVar('gift-hall', giftArt('hall'))}'>
          <div class="gift-hero-copy">
            <h1>馈赠</h1>
            <p><span data-icon="crystal"></span><b>${fmt(claimedGems)}</b><span>/ ${fmt(GIFT_TOTAL_GEMS)} 宝石</span><span class="gift-hero-sep"></span><span data-icon="helmet"></span><b>${rows.filter((r) => r.gift.troop && r.status === 'claimed').length}</b><span>/ ${rows.filter((r) => r.gift.troop).length} 部队卡</span></p>
          </div>
          <button class="gift-claim-all" id="giftClaimAll" type="button"${ready.length ? '' : ' disabled'}>
            ${ready.length ? `一键领取<small><span data-icon="crystal"></span>${fmt(readyGems)}</small>` : '暂无可领取'}
          </button>
        </header>
        <div class="gift-body">
          <nav class="gift-tabs" aria-label="馈赠分组">${tabs}</nav>
          <section class="gift-panel" aria-labelledby="giftGroupTitle">
            <header class="gift-panel-head"><h2 id="giftGroupTitle">${def.name}</h2><span class="gift-now">${[...new Set(list.map((r) => r.gift.metric))].map((m) => currentOf(m, list.find((r) => r.gift.metric === m)!.value)).filter(Boolean).join(' · ')}</span>${pager}</header>
            <div class="gift-grid">${cards}</div>
          </section>
        </div>
      </div>${bottomNavHtml('')}${toastHtml()}`;
  }

  /** 一张里程碑卡：目标徽标 → 奖励（宝石 + 可选部队卡背）→ 底部统一的进度 / 领取条 */
  private cardHtml(row: GiftRow): string {
    const { gift, value, status } = row;
    const shown = Math.min(value, gift.target);
    const pct = Math.min(100, (shown / gift.target) * 100);
    const goal = goalOf(gift.metric, gift.target, gift.id);
    const gems = gift.gems > 0
      ? `<span class="gift-gem"><span data-icon="crystal"></span><b>${fmt(gift.gems)}</b></span>` : '';
    const troop = gift.troop
      ? `<span class="gift-troopcard r${gift.troop}" title="随机${rarityNameByIndex(gift.troop)}部队"><i aria-hidden="true"></i><small>${rarityNameByIndex(gift.troop)}</small></span>` : '';
    const foot = status === 'ready'
      ? `<button class="gift-claim" type="button" data-gift-claim="${gift.id}">领取</button>`
      : status === 'claimed'
        ? '<span class="gift-foot done"><span data-icon="check"></span>已领取</span>'
        : gift.metric === 'always'
          ? '<span class="gift-foot">待领取</span>'
          : `<span class="gift-foot progress"><i style="width:${pct}%"></i><b>${fmt(shown)} / ${fmt(gift.target)}</b></span>`;
    return `<article class="gift-card ${status}">
        <header class="gift-goal" title="${gift.label}"><b>${goal}</b><small>${gift.metric === 'always' ? gift.label : METRIC_NOUN[gift.metric]}</small></header>
        <div class="gift-prize">${gems}${troop}</div>
        ${foot}
      </article>`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    this.mountedRoot = root;
    this.syncClaimButtons();
    const claim = async (send: () => ReturnType<ShellCtx['gateway']['claimGift']>): Promise<void> => {
      if (this.claiming) return;
      this.claiming = true;
      this.syncClaimButtons();
      const returnHash = ctx.currentHash();
      try {
        const { result } = await send();
        ctx.refreshChrome();
        if (!this.mountedRoot) return;
        if (isFailure(result)) { toast(result.message); return; }
        if (result.cards.length) {
          queueGiftReveal({ cards: result.cards, gems: result.gems, returnHash });
          ctx.navigate('#chests/gems');
          return;
        }
        ctx.refresh();
        setTimeout(() => {
          if (this.mountedRoot) toast(`已领取 ${result.ids.length} 项馈赠 · 宝石 +${fmt(result.gems)}`);
        }, 0);
      } catch {
        // A lost reply may already have committed. Re-read authority, never replay a reward command.
        let synced = false;
        try { await ctx.gateway.load(); synced = true; } catch { /* retry remains available */ }
        ctx.refreshChrome();
        if (this.mountedRoot) {
          ctx.refresh();
          setTimeout(() => {
            if (this.mountedRoot) toast(synced
              ? '网络请求中断，已同步领取状态，请查看馈赠'
              : '网络请求失败，请重试；已到账的馈赠不会重复发放');
          }, 0);
        }
      } finally {
        this.claiming = false;
        this.syncClaimButtons();
      }
    };
    this.on(root, 'click', (event) => {
      const target = event.target as HTMLElement;
      const one = target.closest<HTMLButtonElement>('[data-gift-claim]');
      if (one && !one.disabled) { void claim(() => ctx.gateway.claimGift(one.dataset.giftClaim!)); return; }
      const all = target.closest<HTMLButtonElement>('#giftClaimAll');
      if (all && !all.disabled) { void claim(() => ctx.gateway.claimAllGifts()); return; }
      const page = target.closest<HTMLButtonElement>('[data-gift-page]');
      if (page) { this.page = Number(page.dataset.giftPage); ctx.refresh(); }
    });
  }


  private syncClaimButtons(): void {
    this.mountedRoot?.querySelectorAll<HTMLButtonElement>('[data-gift-claim], #giftClaimAll').forEach(button => {
      if (this.claiming) {
        if (!button.disabled) {
          button.dataset.claimPending = 'true';
          button.disabled = true;
          button.setAttribute('aria-busy', 'true');
        }
      } else if (button.dataset.claimPending) {
        delete button.dataset.claimPending;
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  dispose(): void {
    this.mountedRoot = null;
    for (const [target, type, fn] of this.listeners.splice(0)) target.removeEventListener(type, fn);
  }
}
