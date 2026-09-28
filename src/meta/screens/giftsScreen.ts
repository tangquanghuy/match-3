/**
 * 馈赠：一次性成长里程碑（#gifts，可选 #gifts/<分组>）。
 * 左栏分组、右栏里程碑卡片（分页，不做长列表）；达成后手动领取宝石。
 */
import { isFailure } from '../gateway';
import { GIFT_GROUPS, GIFT_STARTER_ID, GIFT_TOTAL_GEMS, type GiftGroupId } from '../data/gifts';
import { giftRows, type GiftRow } from '../systems/gifts';
import type { GachaCard } from '../systems/gacha';
import { rarityNameByIndex } from '../data/rarity';
import { getTroopById } from '../../data/troops';
import { troopImg } from './teamScreen';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml } from '../shell/chrome';
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

function groupIcon(id: GiftGroupId, fallback: string): string {
  const art = giftArt(id);
  return art ? `<img src="${art}" alt="" />` : `<span data-icon="${fallback}"></span>`;
}

export class GiftsScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListener]> = [];
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
            <header class="gift-panel-head"><h2 id="giftGroupTitle">${def.name}</h2>${pager}</header>
            <div class="gift-grid">${cards}</div>
          </section>
        </div>
      </div>${bottomNavHtml('')}${toastHtml()}`;
  }

  private cardHtml(row: GiftRow): string {
    const { gift, value, status } = row;
    const pct = Math.min(100, (Math.min(value, gift.target) / gift.target) * 100);
    const action = status === 'ready'
      ? `<button class="gift-claim" type="button" data-gift-claim="${gift.id}">领取</button>`
      : status === 'claimed'
        ? '<span class="gift-state done"><span data-icon="check"></span>已领取</span>'
        : `<span class="gift-state">${fmt(Math.min(value, gift.target))} / ${fmt(gift.target)}</span>`;
    const troopChip = gift.troop
      ? `<span class="gift-troop r${gift.troop}"><span data-icon="helmet"></span>随机${rarityNameByIndex(gift.troop)}部队</span>`
      : '';
    const reward = gift.gems > 0
      ? `<div class="gift-reward"><span data-icon="crystal"></span><b>${fmt(gift.gems)}</b></div>`
      : `<div class="gift-reward troop r${gift.troop}"><span data-icon="helmet"></span><b>${rarityNameByIndex(gift.troop ?? 3)}</b></div>`;
    const blurb = gift.id === GIFT_STARTER_ID ? '新冒险者专属，可直接用于一次新手十连'
      : gift.metric === 'always' ? '补充一名传说部队，组建你的第一支队伍' : '';
    return `<article class="gift-card ${status}${gift.group === 'starter' ? ' starter' : ''}">
        ${reward}
        <div class="gift-card-body">
          <h3>${gift.label}</h3>
          ${blurb ? `<p>${blurb}</p>` : `<div class="gift-bar"><i style="width:${pct}%"></i></div>`}
          ${gift.gems > 0 ? troopChip : ''}
        </div>
        <div class="gift-action">${action}</div>
      </article>`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    const claim = (promise: ReturnType<ShellCtx['gateway']['claimGift']>): void => {
      void promise.then(({ result }) => {
        if (isFailure(result)) { toast(result.message); return; }
        ctx.refresh();
        if (result.cards.length) setTimeout(() => this.reveal(result.gems, result.cards), 0);
        else setTimeout(() => toast(`已领取 ${result.ids.length} 项馈赠 · 宝石 +${fmt(result.gems)}`), 0);
      });
    };
    this.on(root, 'click', (event) => {
      const target = event.target as HTMLElement;
      const one = target.closest<HTMLButtonElement>('[data-gift-claim]');
      if (one) { one.disabled = true; claim(ctx.gateway.claimGift(one.dataset.giftClaim!)); return; }
      const all = target.closest<HTMLButtonElement>('#giftClaimAll');
      if (all && !all.disabled) { all.disabled = true; claim(ctx.gateway.claimAllGifts()); return; }
      const page = target.closest<HTMLButtonElement>('[data-gift-page]');
      if (page) { this.page = Number(page.dataset.giftPage); ctx.refresh(); }
    });
  }

  /** 领到部队卡时弹出获得展示（宝石另记在标题里） */
  private reveal(gems: number, cards: GachaCard[]): void {
    document.querySelector('#giftReveal')?.remove();
    const veil = document.createElement('div');
    veil.className = 'gift-reveal-veil';
    veil.id = 'giftReveal';
    veil.innerHTML = `<section class="gift-reveal" role="dialog" aria-modal="true" aria-labelledby="giftRevealTitle">
        <h2 id="giftRevealTitle">获得馈赠</h2>
        ${gems > 0 ? `<p class="gift-reveal-gems"><span data-icon="crystal"></span>宝石 +${fmt(gems)}</p>` : ''}
        <div class="gift-reveal-cards">${cards.map((card) => {
          const troop = getTroopById(card.troopId) ?? null;
          return `<figure class="gift-reveal-card r${card.rarityIdx}">${troopImg(troop, false, 'alt=""')}<figcaption><b>${troop?.name ?? `部队 #${card.troopId}`}</b><small>${rarityNameByIndex(card.rarityIdx)}${card.duplicate ? ' · 重复转为副本' : ''}</small></figcaption></figure>`;
        }).join('')}</div>
        <button class="gift-claim" type="button" data-gift-reveal-close>收下</button>
      </section>`;
    document.querySelector('#stage')?.appendChild(veil);
    mountIcons(veil);
    const close = (): void => veil.remove();
    veil.addEventListener('click', (event) => {
      if (event.target === veil || (event.target as HTMLElement).closest('[data-gift-reveal-close]')) close();
    });
    veil.querySelector<HTMLButtonElement>('[data-gift-reveal-close]')?.focus();
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) target.removeEventListener(type, fn);
  }
}
