/**
 * 宝石商店：官方 MasteryRequirement=1003 且不在熔炉白名单的直购武器。
 * 路由 `#shop/gems`。成交走 `claimHeroWeapon`（扣宝石）。
 */
import { isFailure } from '../gateway';
import { acquireOf, acquireProgress, gemBuyCost, listedInGemShop } from '../data/weaponAcquire';
import { ALL_CATALOG_WEAPONS, catalogIconUrl, ownsWeapon } from '../data/weaponCatalog';
import type { WeaponDef } from '../data/weapons';
import { rarityMetaByKey, rarityStyle } from '../data/rarity';
import { bottomNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';

const fmt = (n: number): string => n.toLocaleString('en-US');

type RarityFilter = '' | 'Epic' | 'Mythic' | 'Doomed';

function shopStock(save: ReturnType<ShellCtx['save']>): WeaponDef[] {
  return ALL_CATALOG_WEAPONS.filter((weapon) => listedInGemShop(save, weapon));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function rarityFilterOf(param?: string): RarityFilter {
  const raw = (param ?? '').split('/')[1] ?? '';
  return raw === 'Epic' || raw === 'Mythic' || raw === 'Doomed' ? raw : '';
}

function cardHtml(weapon: WeaponDef, save: ReturnType<ShellCtx['save']>): string {
  const acquire = acquireOf(weapon);
  const progress = acquireProgress(save, acquire);
  const owned = ownsWeapon(save, weapon.id);
  const gems = acquire.gems ?? gemBuyCost(weapon.rarity);
  const rarity = rarityMetaByKey(weapon.rarity);
  const art = catalogIconUrl(weapon);
  let action: string;
  if (owned) action = '<button class="gem-shop-buy is-owned" type="button" disabled>已拥有</button>';
  else if (!progress.ready) {
    action = `<button class="gem-shop-buy is-poor" type="button" disabled>还差 ${fmt(Math.max(0, gems - save.currencies.gems))}</button>`;
  } else {
    action = `<button class="gem-shop-buy" type="button" data-buy-weapon="${escapeHtml(weapon.id)}">购买</button>`;
  }
  return `<article class="gem-shop-card${owned ? ' is-owned' : progress.ready ? '' : ' is-poor'}" style="${rarityStyle(weapon.rarity)}" data-weapon-id="${escapeHtml(weapon.id)}">
    <div class="gem-shop-art">${art ? `<img src="${escapeHtml(art)}" alt="" loading="lazy">` : ''}</div>
    <div class="gem-shop-body">
      <div class="gem-shop-title">
        <h3>${escapeHtml(weapon.name)}</h3>
        <span class="gem-shop-rarity">${escapeHtml(rarity.label)}</span>
      </div>
      <p class="gem-shop-blurb">${escapeHtml(weapon.kingdom || '直购')} · ${escapeHtml(weapon.spellName || '武器技能')}</p>
      <div class="gem-shop-foot">
        <span class="gem-shop-price"><span data-icon="crystal"></span><b>${fmt(gems)}</b><small>宝石</small></span>
        ${action}
      </div>
    </div>
  </article>`;
}

export class GemShopScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx, param?: string): string {
    const save = ctx.save();
    const filter = rarityFilterOf(param);
    const stock = shopStock(save);
    const rows = stock.filter((weapon) => !filter || weapon.rarity === filter);
    const ownedCount = stock.filter((weapon) => ownsWeapon(save, weapon.id)).length;
    const tabs: Array<[RarityFilter, string, number]> = [
      ['', '全部', stock.length],
      ['Epic', '史诗', stock.filter((weapon) => weapon.rarity === 'Epic').length],
      ['Mythic', '神话', stock.filter((weapon) => weapon.rarity === 'Mythic').length],
      ['Doomed', '末日', stock.filter((weapon) => weapon.rarity === 'Doomed').length],
    ];
    const tabHtml = tabs
      .map(([id, label, count]) => {
        const href = id ? `#shop/gems/${id}` : '#shop/gems';
        const active = filter === id;
        return `<a class="gem-shop-tab${active ? ' is-active' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${label}<b>${count}</b></a>`;
      })
      .join('');
    return `
      ${topbarHtml()}
      <div class="screen gem-shop-screen">
        <section class="panel gem-shop-panel">
          <header class="gem-shop-head">
            <a class="gem-shop-back" href="#chests/gems"><span data-icon="arrow"></span>宝石宝箱</a>
            <div><small>宝石商店</small><h1>直购武器</h1></div>
            <span class="gem-shop-owned">已购 ${ownedCount} / ${stock.length}</span>
          </header>
          <section class="gem-shop-balance" aria-label="宝石余额 ${fmt(save.currencies.gems)}">
            <span data-icon="crystal"></span>
            <div><small>当前宝石</small><b>${fmt(save.currencies.gems)}</b></div>
            <p>通关王国后，该王国的武器包会在此上架。黎明使者仍走熔炉。</p>
          </section>
          <nav class="gem-shop-tabs" aria-label="稀有度">${tabHtml}</nav>
          <div class="gem-shop-grid">${rows.map((weapon) => cardHtml(weapon, save)).join('')}</div>
        </section>
      </div>
      ${bottomNavHtml('宝箱', '宝石直购')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.on(document, 'click', (event) => {
      const buy = (event.target as HTMLElement).closest<HTMLElement>('[data-buy-weapon]');
      if (!buy) return;
      const id = buy.dataset.buyWeapon;
      if (!id) return;
      void ctx.gateway.claimHeroWeapon(id).then(({ result }) => {
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        ctx.refresh();
        setTimeout(() => toast('已购入，可在武器中心装备。'), 0);
      });
    });
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) target.removeEventListener(type, fn);
  }
}

export function isGemShopParam(param?: string): boolean {
  return (param ?? '').split('/')[0] === 'gems';
}
