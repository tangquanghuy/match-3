import { isFailure } from '../gateway';
import { acquireOf, acquireProgress, gemBuyCost, listedInGemShop } from '../data/weaponAcquire';
import { ALL_CATALOG_WEAPONS, catalogIconUrl, ownsWeapon } from '../data/weaponCatalog';
import type { WeaponDef } from '../data/weapons';
import { rarityMetaByKey, rarityStyle } from '../data/rarity';
import { roleNameZh } from '../data/roles';
import { heroStatsOf } from '../systems/hero';
import { COLOR_CN, bottomNavHtml, gemSvg, mountIcons, shopNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { cssUrlVar, shopArt } from '../shell/artAssets';
import { renderSpell } from '../shell/spellText';
import { bindTermTips } from '../shell/termTip';
import { showAcquisitionDialog } from '../shell/acquisitionDialog';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';

const fmt = (value: number): string => value.toLocaleString('en-US');

type RarityFilter = '' | 'Epic' | 'Mythic' | 'Doomed';

function shopStock(save: MetaSave): WeaponDef[] {
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

function priceOf(weapon: WeaponDef): number {
  return acquireOf(weapon).gems ?? gemBuyCost(weapon.rarity);
}

function manaColorsOf(weapon: WeaponDef): string[] {
  return weapon.manaColors.map(color => String(color).toLowerCase());
}

function manaLabel(weapon: WeaponDef): string {
  return manaColorsOf(weapon).map(color => COLOR_CN[color] ?? color).join('、');
}

function cardHtml(weapon: WeaponDef, save: MetaSave, selected: boolean): string {
  const owned = ownsWeapon(save, weapon.id);
  const art = catalogIconUrl(weapon);
  return `<button type="button" class="gem-shop-card${selected ? ' selected' : ''}${owned ? ' is-owned' : ''}"
    style="${rarityStyle(weapon.rarity)}" data-inspect-weapon="${escapeHtml(weapon.id)}" aria-pressed="${selected}" aria-label="查看${escapeHtml(weapon.name)}详情">
    <span class="gem-shop-art">${art ? `<img src="${escapeHtml(art)}" alt="" loading="lazy">` : '<span data-icon="swords"></span>'}<span class="gem-shop-mana" title="${escapeHtml(manaLabel(weapon))}色法力，充能 ${weapon.manaCost}">${gemSvg(manaColorsOf(weapon))}<i>${weapon.manaCost}</i></span></span>
    <span class="gem-shop-body"><span class="gem-shop-title"><b>${escapeHtml(weapon.name)}</b><small>${escapeHtml(rarityMetaByKey(weapon.rarity).label)}</small></span>
      <span class="gem-shop-foot"><span class="gem-shop-price"><span data-icon="crystal"></span><b>${fmt(priceOf(weapon))}</b></span><span class="gem-shop-status">${owned ? '已拥有' : '查看详情 →'}</span></span>
    </span>
  </button>`;
}

function detailHtml(weapon: WeaponDef, save: MetaSave): string {
  const owned = ownsWeapon(save, weapon.id);
  const price = priceOf(weapon);
  const affordable = acquireProgress(save, acquireOf(weapon)).ready;
  const art = catalogIconUrl(weapon);
  const spell = renderSpell(weapon.description, heroStatsOf(save).magic, { interactive: false });
  const spellTitle = weapon.spellName?.trim();
  const stats = [
    ['atk', '攻击', 'swords', weapon.attack],
    ['armor', '护甲', 'shield', weapon.armor],
    ['hp', '生命', 'heart', weapon.health],
    ['magic', '魔力', 'orb', weapon.magic],
  ].map(([kind, label, icon, value]) => `<span class="hero-stat stat-${kind}" title="${label}" aria-label="${label} +${value}"><span data-icon="${icon}" aria-hidden="true"></span><b>+${value}</b></span>`).join('');
  const button = owned
    ? '<button type="button" class="gem-shop-buy is-owned" disabled>已拥有</button>'
    : affordable
      ? `<button type="button" class="gem-shop-buy" data-buy-weapon="${escapeHtml(weapon.id)}">购买</button>`
      : `<button type="button" class="gem-shop-buy is-poor" disabled>还差 ${fmt(price - save.currencies.gems)} 宝石</button>`;
  return `<div class="gem-shop-detail-card" data-gem-detail="${escapeHtml(weapon.id)}" style="${rarityStyle(weapon.rarity)}">
    <div class="gem-shop-detail-hero"><div class="gem-shop-detail-art">${art ? `<img src="${escapeHtml(art)}" alt="">` : '<span data-icon="swords"></span>'}</div>
      <div><small>${escapeHtml(rarityMetaByKey(weapon.rarity).label)} · ${escapeHtml(weapon.kingdom || '直购')}</small><h2 id="gemWeaponTitle" tabindex="-1">${escapeHtml(weapon.name)}</h2><span class="gem-shop-detail-mana">${gemSvg(manaColorsOf(weapon))}<span><small>${escapeHtml(manaLabel(weapon))}色法力 · ${escapeHtml(roleNameZh(weapon.role) ?? (weapon.roleName || '武器'))}</small><b>充能 ${weapon.manaCost}</b></span></span></div></div>
    <div class="gem-shop-detail-info"><div class="gem-shop-detail-stats" role="group" aria-label="武器属性加成">${stats}</div>
    <section class="gem-shop-detail-spell" aria-label="武器技能"><h3>${escapeHtml(spellTitle && spellTitle !== weapon.name.trim() ? spellTitle : '武器技能')}</h3><p>${spell.html || '暂无技能描述'}</p></section></div>
    <div class="gem-shop-detail-purchase"><span>售价 <b>${fmt(price)}</b> 宝石</span>${button}</div>
  </div>`;
}

/** Detail routes keep the rarity segment so returning never loses the active filter. */
function detailIdOf(param?: string): string {
  const parts = (param ?? '').split('/');
  const index = parts.indexOf('weapon');
  if (index < 0) return '';
  try { return decodeURIComponent(parts[index + 1] ?? ''); } catch { return ''; }
}

export class GemShopScreen implements Screen {
  private page = 0;
  private pageSize = 9;
  private filter: RarityFilter = '';
  private query = '';
  private selectedId = '';
  private restoreSelection = false;
  private resizeObserver?: ResizeObserver;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private termTips?: () => void;

  private catalogHash(): string {
    return `#shop/gems${this.filter ? `/${this.filter}` : ''}`;
  }

  html(ctx: ShellCtx, param?: string): string {
    const save = ctx.save();
    const filter = rarityFilterOf(param);
    if (filter !== this.filter) {
      this.page = 0;
      this.selectedId = '';
      this.restoreSelection = false;
      this.filter = filter;
    }
    const stock = shopStock(save);
    const rows = stock.filter(weapon => !filter || weapon.rarity === filter);
    const detailId = detailIdOf(param);
    const detail = stock.find(weapon => weapon.id === detailId);
    if (detail) {
      this.selectedId = detail.id;
      this.restoreSelection = true;
    }
    const tabs: Array<[RarityFilter, string, number]> = [
      ['', '全部', stock.length],
      ['Epic', '史诗', stock.filter(weapon => weapon.rarity === 'Epic').length],
      ['Mythic', '神话', stock.filter(weapon => weapon.rarity === 'Mythic').length],
      ['Doomed', '末日', stock.filter(weapon => weapon.rarity === 'Doomed').length],
    ];
    const tabHtml = tabs.map(([id, label, count]) => {
      const href = id ? `#shop/gems/${id}` : '#shop/gems';
      return `<a class="gem-shop-tab${filter === id ? ' is-active' : ''}" href="${href}"${filter === id ? ' aria-current="page"' : ''}>${label}<b>${count}</b></a>`;
    }).join('');
    const content = detailId
      ? `<div class="gem-shop-detail-nav"><a class="gem-shop-back" href="${this.catalogHash()}"><span data-icon="arrow"></span>返回商店</a><span>武器详情</span></div>
         <section class="gem-shop-detail" aria-label="武器详情">${detail ? detailHtml(detail, save) : '<p class="gem-shop-empty">该武器暂未上架，请返回商店选择其他武器。</p>'}</section>`
      : `<div class="gem-shop-toolbar"><nav class="gem-shop-tabs" aria-label="武器稀有度">${tabHtml}</nav><span class="gem-shop-tip">通关王国，解锁更多武器</span></div>
         <section class="gem-shop-catalog" aria-label="武器货架">
           <div class="gem-shop-catalog-head"><h2>武器典藏</h2><div class="gem-shop-catalog-tools"><label class="gem-shop-search"><span class="sr-only">搜索武器名称</span><input type="search" aria-label="搜索武器名称" placeholder="搜索武器名称" autocomplete="off" value="${escapeHtml(this.query)}"></label><span class="gem-shop-result-count" role="status" aria-live="polite">共 ${rows.length} 件武器</span></div></div>
           <div class="gem-shop-grid"></div>
           <nav class="gem-shop-pagination" aria-label="商品分页"></nav>
         </section>`;
    return `${topbarHtml()}
      <div class="screen gem-shop-screen"><section class="panel gem-shop-panel gem-v3${detailId ? ' is-detail-page' : ''}" style='${cssUrlVar('gem-hero', shopArt('gem-vault'))}'>
        <header class="gem-shop-head"><div class="gem-shop-heading"><span class="gem-shop-emblem" data-icon="bag"></span><div><h1>商店</h1><p>珍藏武器 · 宝石直购</p></div></div>${shopNavHtml('gems')}<span class="gem-shop-balance" aria-label="宝石余额 ${fmt(save.currencies.gems)}"><span data-icon="crystal"></span><b>${fmt(save.currencies.gems)}</b> 宝石</span></header>
        ${content}
      </section></div>
      ${bottomNavHtml('商店')}${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement, param?: string): void {
    if (detailIdOf(param)) {
      root.querySelector<HTMLElement>('#gemWeaponTitle')?.focus({ preventScroll: true });
      this.on(root, 'keydown', event => {
        if ((event as KeyboardEvent).key === 'Escape') ctx.navigate(this.catalogHash());
      });
      this.on(root, 'click', event => {
        const buy = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-buy-weapon]');
        if (!buy?.dataset.buyWeapon || buy.disabled) return;
        buy.disabled = true;
        const purchaseHash = ctx.currentHash();
        const weapon = ALL_CATALOG_WEAPONS.find(row => row.id === buy.dataset.buyWeapon);
        void ctx.gateway.claimHeroWeapon(buy.dataset.buyWeapon).then(({ result }) => {
          if (isFailure(result)) {
            buy.disabled = false;
            toast(result.message);
            return;
          }
          // Refresh the active screen without forcing the player back to this detail.
          ctx.refresh();
          if (weapon) showAcquisitionDialog('武器购买成功', [{
            label: weapon.name, detail: '已加入武器库', icon: 'swords',
          }], `花费 ${priceOf(weapon).toLocaleString('zh-CN')} 宝石`);
        }).catch(() => {
          if (ctx.currentHash() === purchaseHash) buy.disabled = false;
          toast('购买未完成，请稍后重试');
        });
      });
      mountIcons(root);
      const detailSection = root.querySelector<HTMLElement>('.gem-shop-detail');
      this.termTips?.();
      this.termTips = detailSection ? bindTermTips(detailSection) : undefined;
      return;
    }

    const grid = root.querySelector<HTMLElement>('.gem-shop-grid')!;
    const pager = root.querySelector<HTMLElement>('.gem-shop-pagination')!;
    const rows = shopStock(ctx.save()).filter(weapon => !this.filter || weapon.rarity === this.filter);
    const search = root.querySelector<HTMLInputElement>('.gem-shop-search input')!;
    const resultCount = root.querySelector<HTMLElement>('.gem-shop-result-count')!;
    const filteredRows = (): WeaponDef[] => {
      const query = this.query.trim().normalize('NFKC').toLocaleLowerCase();
      return query ? rows.filter(weapon => weapon.name.normalize('NFKC').toLocaleLowerCase().includes(query)) : rows;
    };
    const returning = this.restoreSelection;
    if (returning) {
      const index = filteredRows().findIndex(weapon => weapon.id === this.selectedId);
      if (index >= 0) this.page = Math.floor(index / this.pageSize);
      this.restoreSelection = false;
    }
    const paint = (): void => {
      const matches = filteredRows();
      resultCount.textContent = this.query.trim() ? `匹配 ${matches.length} / ${rows.length} 件` : `共 ${rows.length} 件武器`;
      const totalPages = Math.max(1, Math.ceil(matches.length / this.pageSize));
      this.page = Math.max(0, Math.min(this.page, totalPages - 1));
      const start = this.page * this.pageSize;
      const items = matches.slice(start, start + this.pageSize);
      grid.innerHTML = items.length ? items.map(weapon => cardHtml(weapon, ctx.save(), weapon.id === this.selectedId)).join('') : `<p class="gem-shop-empty">${this.query.trim() ? '没有找到匹配的武器，请试试其他名称' : '该稀有度暂无上架武器'}</p>`;
      pager.innerHTML = `<span class="gem-shop-page-range">${matches.length ? start + 1 : 0}–${Math.min(start + this.pageSize, matches.length)} / ${matches.length} 件</span>
        <div class="gem-shop-page-controls"><button type="button" data-gem-page="${this.page - 1}" aria-label="上一页" ${this.page === 0 ? 'disabled' : ''}>&lsaquo;</button>
        <span class="gem-shop-page-label" role="status" aria-live="polite">第 <b>${this.page + 1}</b> / ${totalPages} 页</span>
        <button type="button" data-gem-page="${this.page + 1}" aria-label="下一页" ${this.page === totalPages - 1 ? 'disabled' : ''}>&rsaquo;</button></div>`;
      mountIcons(grid);
    };
    paint();
    this.on(search, 'input', () => {
      this.query = search.value;
      this.page = 0;
      this.selectedId = '';
      paint();
    });
    let initialResize = true;
    this.resizeObserver = new ResizeObserver(() => {
      const styles = getComputedStyle(grid);
      const columns = styles.gridTemplateColumns.split(' ').length;
      const gap = parseFloat(styles.rowGap) || 0;
      const minHeight = parseFloat(styles.getPropertyValue('--card-min-height')) || 120;
      const rowCount = Math.max(1, Math.min(3, Math.floor((grid.clientHeight + gap) / (minHeight + gap))));
      const size = columns * rowCount;
      grid.dataset.pageSize = String(size);
      grid.style.gridTemplateRows = `repeat(${rowCount}, minmax(0, 1fr))`;
      if (size !== this.pageSize) {
        const selectedIndex = filteredRows().findIndex(weapon => weapon.id === this.selectedId);
        this.page = Math.floor((selectedIndex >= 0 ? selectedIndex : this.page * this.pageSize) / size);
        this.pageSize = size;
        paint();
      }
      if (initialResize && returning) grid.querySelector<HTMLButtonElement>('.selected')?.focus({ preventScroll: true });
      initialResize = false;
    });
    this.resizeObserver.observe(grid);
    this.on(root, 'click', event => {
      const target = event.target as HTMLElement;
      const pageButton = target.closest<HTMLButtonElement>('[data-gem-page]');
      if (pageButton && !pageButton.disabled) {
        const direction = Number(pageButton.dataset.gemPage) > this.page ? '下一页' : '上一页';
        this.page = Number(pageButton.dataset.gemPage);
        this.selectedId = '';
        paint();
        const focusTarget = pager.querySelector<HTMLButtonElement>(`[aria-label="${direction}"]:not(:disabled)`) ?? pager.querySelector<HTMLButtonElement>('button:not(:disabled)');
        focusTarget?.focus({ preventScroll: true });
        return;
      }
      const inspect = target.closest<HTMLButtonElement>('[data-inspect-weapon]');
      if (inspect?.dataset.inspectWeapon) {
        this.selectedId = inspect.dataset.inspectWeapon;
        ctx.navigate(`${this.catalogHash()}/weapon/${encodeURIComponent(this.selectedId)}`);
      }
    });
    mountIcons(root);
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.termTips?.();
    for (const [target, type, fn] of this.listeners.splice(0)) target.removeEventListener(type, fn);
  }
}

export function isGemShopParam(param?: string): boolean {
  return (param ?? '').split('/')[0] === 'gems';
}
