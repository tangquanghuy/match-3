/**
 * 武器中心屏（UX 阶段 B · 窗口 M）。
 *
 * 这块屏把英雄页旧武器弹层、武器图鉴和熔炉/淬炼入口收成一个可检索的
 * 外壳内页面。屏层只读消费 weaponCatalog / save，所有写入仍走 MetaGateway。
 * 路由接入由 gameMain 负责；本模块自身支持 `owned`、`all`、`forge`、`temper`
 * 四个参数作为初始 tab。
 */
import weaponsCss from './weaponsScreen.css?raw';
import type { ForgeRecipe } from '../systems/forge';
import {
  AFFIX_UNLOCK_LEVELS,
  DOOMED_AFFIX_UNLOCK_LEVELS,
  MAX_TEMPERING_LEVEL,
  affixUnlockedCount,
  forgeTierUnlockLevel,
  temperingCost,
} from '../systems/forge';
import { temperingLevelOf } from '../systems/forgeOps';
import { canUseWeapon, heroStatsOf } from '../systems/hero';
import {
  ALL_CATALOG_WEAPONS,
  catalogIconUrl,
  anyWeaponById,
  ownedWeaponIds,
  ownedWeapons,
  ownsWeapon,
  weaponTypeZh,
} from '../data/weaponCatalog';
import {
  ACQUIRE_FILTERS,
  acquireFilterKind,
  acquireFilterLabel,
  acquireIcon,
  acquireOf,
  acquireProgress,
  kingdomQuestCleared,
  type WeaponAcquireKind,
} from '../data/weaponAcquire';
import { SOULFORGE_RECIPES, type SoulforgeStock } from '../data/soulforge';
import type { WeaponDef } from '../data/weapons';
import { INGOT_NAMES, ingotKeyForRarity, type IngotKey } from '../data/materials';
import { rarityMetaByKey, rarityStyle } from '../data/rarity';
import { roleNameZh } from '../data/roles';
import { bottomNavHtml, COLOR_CN, gemSvg, mountIcons, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { ingotArt, materialImg, scrollArt } from '../shell/materialArt';
import { isFailure } from '../gateway';
import type { Screen, ShellCtx } from '../shell/screen';
import { renderSpell } from '../shell/spellText';
import { bindTermTips } from '../shell/termTip';

type WeaponTab = 'owned' | 'all' | 'forge' | 'temper';
type FilterName = 'rarity' | 'type' | 'color' | 'ownership' | 'source' | 'sort';

function weaponsPerPage(): number {
  if (window.innerWidth <= 600) return 4;
  if (window.innerWidth <= 980) return 8;
  return 12;
}

interface WeaponFilters {
  query: string;
  rarity: string;
  type: string;
  color: string;
  ownership: '' | 'owned' | 'usable' | 'unowned';
  source: '' | WeaponAcquireKind;
  sort: 'default' | 'rarity' | 'cost' | 'name';
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const fmt = (value: number): string => Math.max(0, Math.floor(value)).toLocaleString('en-US');

/** 词缀图标走属性语义（盾/剑/心/旋涡），不用特质图里的宝石/魔力珠。 */
function affixIconOf(affix: { name?: string; description?: string }): 'shield' | 'swords' | 'heart' | 'swirl' | 'sparkles' {
  const text = `${affix.name ?? ''} ${affix.description ?? ''}`;
  if (/屏障|护盾|护甲|减伤/.test(text)) return 'shield';
  if (/生命|治疗|回复|体型/.test(text)) return 'heart';
  if (/攻击|伤害|重击|击杀/.test(text)) return 'swords';
  if (/法力|魔力|魔法|施法/.test(text)) return 'swirl';
  return 'sparkles';
}

function tabOf(value: string | undefined): WeaponTab {
  return value === 'all' || value === 'forge' || value === 'temper' ? value : 'owned';
}

function weaponImage(w: WeaponDef, className = '', eager = false): string {
  const url = catalogIconUrl(w);
  if (!url) return `<div class="weapon-art-missing ${className}" aria-hidden="true"></div>`;
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(w.name)}" loading="${eager ? 'eager' : 'lazy'}">`;
}

function recipeOf(w: WeaponDef): SoulforgeStock | undefined {
  return SOULFORGE_RECIPES.find((stock) => stock.recipe.weaponId === w.id);
}

interface CardVm {
  weapon: WeaponDef;
  recipe?: ForgeRecipe;
  kind: 'weapon' | 'forge';
}

export class WeaponsScreen implements Screen {
  private ctx!: ShellCtx;
  private root: HTMLElement | null = null;
  private tab: WeaponTab = 'owned';
  private page = 1;
  private selectedId: string | null = null;
  private detailMode: 'overview' | 'upgrade' = 'overview';
  private renderedPageSize = 12;
  private termTips?: () => void;
  /** 高价配方的自绘二次确认状态（不使用原生 confirm，避免阻塞/样式脱节）。 */
  private forgeConfirmId: string | null = null;
  private filters: WeaponFilters = {
    query: '',
    rarity: '',
    type: '',
    color: '',
    ownership: '',
    source: '',
    sort: 'default',
  };
  private styleEl: HTMLStyleElement | null = null;

  private readonly onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>('[data-weapon-tab]');
    if (tab) {
      this.tab = tab.dataset.weaponTab as WeaponTab;
      // 非目录 tab 不显示筛选下拉；清掉隐藏条件，避免从「全部」切过来后
      // 结果被玩家看不见的旧条件悄悄过滤。
      if (this.tab === 'forge' || this.tab === 'temper') {
        this.filters.rarity = '';
        this.filters.type = '';
        this.filters.color = '';
        this.filters.ownership = '';
        this.filters.source = '';
        this.filters.sort = 'default';
      }
      this.page = 1;
      this.selectedId = null;
      this.detailMode = 'overview';
      this.render();
      return;
    }

    const pageButton = target.closest<HTMLElement>('[data-weapon-page]');
    if (pageButton && !pageButton.hasAttribute('disabled')) {
      const totalPages = Math.max(1, Math.ceil(this.cardsForTab().length / weaponsPerPage()));
      const direction = pageButton.dataset.weaponPage;
      const requested = direction === 'prev' ? this.page - 1 : direction === 'next' ? this.page + 1 : Number(direction);
      this.page = Math.min(totalPages, Math.max(1, Number.isFinite(requested) ? requested : this.page));
      this.selectedId = null;
      this.detailMode = 'overview';
      this.render();
      this.screenEl()?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const detailClose = target.closest<HTMLElement>('[data-weapon-detail-close]');
    if (detailClose || target.matches('[data-weapon-detail-veil]')) {
      this.selectedId = null;
      this.forgeConfirmId = null;
      this.detailMode = 'overview';
      this.render();
      return;
    }

    const clearFilter = target.closest<HTMLElement>('[data-clear-filter]');
    if (clearFilter) {
      const name = clearFilter.dataset.clearFilter as FilterName | undefined;
      if (name && name !== 'sort') this.clearFilter(name);
      this.page = 1;
      this.render();
      return;
    }

    const clearAll = target.closest<HTMLElement>('[data-clear-all-filters]');
    if (clearAll) {
      this.clearFilters();
      this.page = 1;
      this.render();
      return;
    }

    const action = target.closest<HTMLElement>('[data-weapon-action]');
    if (action) {
      const kind = action.dataset.weaponAction;
      const id = action.dataset.weaponId ?? this.selectedId;
      if (!id || action.hasAttribute('disabled')) return;
      if (kind === 'open-upgrade') {
        this.detailMode = 'upgrade';
        this.forgeConfirmId = null;
        this.render();
      }
      if (kind === 'back-detail') {
        this.detailMode = 'overview';
        this.forgeConfirmId = null;
        this.render();
      }
      if (kind === 'equip') void this.equip(id);
      if (kind === 'claim') void this.claim(id);
      if (kind === 'forge') void this.forge(id);
      if (kind === 'temper') void this.temper(id);
      if (kind === 'goto-quest') {
        const kingdom = action.dataset.kingdom;
        if (kingdom) this.ctx.navigate(`#quest/${kingdom}`);
      }
      if (kind === 'goto-hero') this.ctx.navigate('#hero');
      if (kind === 'goto-shop') this.ctx.navigate('#shop/gems');
      if (kind === 'goto-forge') {
        this.tab = 'forge';
        this.selectedId = id;
        this.render();
      }
      if (kind === 'goto-owned') {
        this.tab = 'owned';
        this.selectedId = id;
        this.render();
      }
      if (kind === 'cancel-forge') {
        this.forgeConfirmId = null;
        this.render();
      }
      return;
    }

    const card = target.closest<HTMLElement>('[data-weapon-id], [data-recipe-id]');
    if (card) {
      this.selectedId = card.dataset.weaponId ?? card.dataset.recipeId ?? null;
      this.forgeConfirmId = null;
      this.detailMode = 'overview';
      this.screenEl()?.scrollTo({ top: 0 });
      this.render();
      return;
    }

    const back = target.closest<HTMLElement>('[data-weapons-back]');
    if (back) this.ctx.navigate('#hero');

    const emptyReset = target.closest<HTMLElement>('[data-empty-reset]');
    if (emptyReset) {
      this.clearFilters();
      this.page = 1;
      this.render();
    }
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.selectedId) return;
    this.selectedId = null;
    this.forgeConfirmId = null;
    this.detailMode = 'overview';
    this.render();
  };

  private readonly onResize = (): void => {
    const nextSize = weaponsPerPage();
    if (nextSize === this.renderedPageSize) return;
    const firstVisibleIndex = (this.page - 1) * this.renderedPageSize;
    this.renderedPageSize = nextSize;
    this.page = Math.floor(firstVisibleIndex / nextSize) + 1;
    this.render();
  };

  private readonly onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-weapon-search]')) return;
    this.filters.query = input.value;
    this.page = 1;
    const position = input.selectionStart ?? input.value.length;
    this.render(true, position);
  };

  private readonly onChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (!select.matches('[data-weapon-filter]')) return;
    const name = select.dataset.weaponFilter as FilterName | undefined;
    if (!name) return;
    const value = select.value;
    if (name === 'ownership') this.filters.ownership = value as WeaponFilters['ownership'];
    else if (name === 'source') this.filters.source = value as WeaponFilters['source'];
    else if (name === 'sort') this.filters.sort = value as WeaponFilters['sort'];
    else this.filters[name] = value;
    this.page = 1;
    this.render();
  };

  html(_ctx?: ShellCtx, param?: string): string {
    if (param) {
      this.tab = tabOf(param);
      this.page = 1;
      this.selectedId = null;
      this.detailMode = 'overview';
    }
    return `
      ${topbarHtml()}
      <main class="screen weapons-screen" id="weaponsScreen">
        <header class="weapons-heading">
          <button class="weapons-back" type="button" aria-label="返回主角" data-weapons-back><span data-icon="arrow"></span></button>
          <div><h1>武器中心</h1><p>英雄军械库</p></div>
          <span class="weapon-wallet"><span data-icon="soul"></span><b id="weaponsSoulBalance">0</b> 灵魂</span>
        </header>
        <nav class="weapons-tabs" id="weaponTabs" aria-label="武器分类"></nav>
        <section class="weapons-content" id="weaponsContent"></section>
      </main>
      ${bottomNavHtml('英雄', '武器中心')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    this.root = root;
    if (param) this.tab = tabOf(param);
    this.styleEl = document.createElement('style');
    this.styleEl.id = 'weapons-screen-css';
    this.styleEl.textContent = weaponsCss;
    document.head.appendChild(this.styleEl);
    root.addEventListener('click', this.onClick);
    root.addEventListener('input', this.onInput);
    root.addEventListener('change', this.onChange);
    window.addEventListener('keydown', this.onKeydown);
    window.addEventListener('resize', this.onResize);
    this.renderedPageSize = weaponsPerPage();
    this.render();
  }

  private screenEl(): HTMLElement | null {
    return this.root?.querySelector<HTMLElement>('#weaponsScreen') ?? null;
  }

  private render(focusQuery = false, queryPosition?: number): void {
    const screen = this.screenEl();
    if (!screen) return;
    const oldList = screen.querySelector<HTMLElement>('.weapons-list');
    const listTop = oldList?.scrollTop ?? 0;
    const listLeft = oldList?.scrollLeft ?? 0;
    const save = this.ctx.save();
    const ownedCount = ownedWeaponIds(save).length;
    const allCount = ALL_CATALOG_WEAPONS.length;
    const forgeCount = SOULFORGE_RECIPES.length;
    const temperCount = ownedWeapons(save).filter((w) => temperingLevelOf(save, w.id) < MAX_TEMPERING_LEVEL).length;
    const tabs: Array<{ id: WeaponTab; label: string; count: number }> = [
      { id: 'owned', label: '我的武器', count: ownedCount },
      { id: 'all', label: '全部', count: allCount },
      { id: 'forge', label: '熔炉', count: forgeCount },
      { id: 'temper', label: '淬炼', count: temperCount },
    ];
    const tabsEl = screen.querySelector<HTMLElement>('#weaponTabs');
    if (tabsEl) {
      tabsEl.innerHTML = tabs
        .map(
          (item) => `<button class="weapons-tab${item.id === this.tab ? ' is-active' : ''}" type="button" data-weapon-tab="${item.id}" aria-selected="${item.id === this.tab}">
            <span>${item.label}</span><span class="weapons-tab-count">${fmt(item.count)}</span>
          </button>`,
        )
        .join('');
    }
    const content = screen.querySelector<HTMLElement>('#weaponsContent');
    if (content) content.innerHTML = this.renderContent();
    const list = screen.querySelector<HTMLElement>('.weapons-list');
    if (list) {
      list.scrollTop = listTop;
      list.scrollLeft = listLeft;
    }
    const soul = screen.querySelector<HTMLElement>('#weaponsSoulBalance');
    if (soul) soul.textContent = fmt(save.currencies.souls);
    mountIcons(screen);
    this.termTips?.();
    const detailCopy = screen.querySelector<HTMLElement>('.weapon-detail .detail-copy');
    this.termTips = detailCopy ? bindTermTips(detailCopy) : undefined;
    if (focusQuery) {
      const input = screen.querySelector<HTMLInputElement>('[data-weapon-search]');
      if (input) {
        input.focus();
        const pos = queryPosition ?? input.value.length;
        input.setSelectionRange(pos, pos);
      }
    }
  }

  private renderContent(): string {
    const cards = this.cardsForTab();
    const pageSize = weaponsPerPage();
    this.renderedPageSize = pageSize;
    const pageCount = Math.max(1, Math.ceil(cards.length / pageSize));
    this.page = Math.min(pageCount, Math.max(1, this.page));
    const pageStart = (this.page - 1) * pageSize;
    const pageCards = cards.slice(pageStart, pageStart + pageSize);
    const selected = this.selectedId ? cards.find((card) => card.weapon.id === this.selectedId) ?? null : null;
    const isFilterTab = this.tab === 'owned' || this.tab === 'all';
    const toolbar = this.renderToolbar(isFilterTab);
    const empty = cards.length
      ? ''
      : `<div class="empty-state"><strong>${this.tab === 'temper' ? '没有待淬炼武器' : '没有符合条件的武器'}</strong><span>当前筛选没有结果。</span>${isFilterTab ? '<button type="button" data-empty-reset>清除筛选</button>' : ''}</div>`;
    const items = this.tab === 'forge'
      ? [1, 2].map((tier) => {
          const group = pageCards.filter((card) => card.recipe?.tier === tier);
          return group.length ? `<div class="recipe-group-label" role="presentation"><b>${tier === 1 ? '活动武器' : '珍藏配方'}</b><span>主角 Lv.${forgeTierUnlockLevel(tier as 1 | 2)} 解锁</span></div>${group.map((card) => this.renderCard(card)).join('')}` : '';
        }).join('')
      : pageCards.map((card) => this.renderCard(card)).join('');
    return `${toolbar}
      <div class="weapons-workspace weapons-workspace--${this.tab}">
        <div class="weapons-list" role="listbox" aria-label="武器列表">${empty}${items}</div>
        ${this.renderPagination(cards.length, pageCount, pageSize)}
      </div>
      ${selected ? this.renderDetailSheet(selected) : ''}`;
  }

  private renderDetailSheet(card: CardVm): string {
    const upgrade = this.detailMode === 'upgrade';
    const title = upgrade ? (card.kind === 'forge' || !ownsWeapon(this.ctx.save(), card.weapon.id) ? '锻造准备' : '淬炼准备') : '武器详情';
    return `<div class="weapon-detail-veil" data-weapon-detail-veil>
      <section class="weapon-detail-sheet" style="${rarityStyle(card.weapon.rarity)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(card.weapon.name)}${title}">
        <header class="weapon-detail-sheet-head">
          ${upgrade ? '<button class="weapon-detail-back" type="button" data-weapon-action="back-detail" aria-label="返回武器详情" title="返回武器详情"><span data-icon="arrow"></span></button>' : ''}
          <div><b>${title}</b></div>
          <button class="weapon-detail-close" type="button" data-weapon-detail-close aria-label="关闭武器详情" title="关闭"><span data-icon="close"></span></button>
        </header>
        <aside class="weapon-detail" aria-label="${title}">${upgrade ? this.renderUpgrade(card) : this.renderDetail(card)}</aside>
      </section>
    </div>`;
  }

  private renderPagination(total: number, pageCount: number, pageSize: number): string {
    const from = total === 0 ? 0 : (this.page - 1) * pageSize + 1;
    const to = Math.min(total, this.page * pageSize);
    return `<nav class="weapons-pagination" aria-label="武器分页">
      <span class="weapons-page-total">${fmt(from)}-${fmt(to)} / ${fmt(total)}</span>
      <div class="weapons-page-actions">
        <button type="button" data-weapon-page="prev" aria-label="上一页" title="上一页"${this.page <= 1 ? ' disabled' : ''}><span data-icon="arrow"></span></button>
        <b>第 ${this.page} / ${pageCount} 页</b>
        <button class="is-next" type="button" data-weapon-page="next" aria-label="下一页" title="下一页"${this.page >= pageCount ? ' disabled' : ''}><span data-icon="arrow"></span></button>
      </div>
    </nav>`;
  }

  private renderToolbar(includeFilters: boolean): string {
    const resultCount = this.cardsForTab().length;
    const query = escapeHtml(this.filters.query);
    if (!includeFilters) {
      const save = this.ctx.save();
      if (this.tab === 'forge') {
        const ready = SOULFORGE_RECIPES.filter(({ recipe }) => !ownsWeapon(save, recipe.weaponId) && save.hero.level >= forgeTierUnlockLevel(recipe.tier) && save.currencies.souls >= recipe.souls && save.currencies.gold >= recipe.gold).length;
        return `<div class="weapons-toolbar workbench-toolbar"><div class="workbench-heading"><span data-icon="soul"></span><div><h2>灵魂熔炉</h2><small>${fmt(resultCount)} 份配方 · ${ready} 份可锻造</small></div></div><div class="workbench-wallet"><span>灵魂 <b>${fmt(save.currencies.souls)}</b></span><span>黄金 <b>${fmt(save.currencies.gold)}</b></span></div><input class="weapons-search" data-weapon-search value="${query}" placeholder="搜索配方" aria-label="搜索配方"></div>`;
      }
      const ready = ownedWeapons(save).filter((w) => {
        if (temperingLevelOf(save, w.id) >= MAX_TEMPERING_LEVEL) return false;
        const cost = temperingCost(w.rarity, temperingLevelOf(save, w.id));
        const key = ingotKeyForRarity(w.rarity);
        return save.currencies.gold >= cost.gold && (cost.scrolls ? save.materials.forgeScrolls >= cost.scrolls : key && (save.materials.ingots[key] ?? 0) >= cost.ingots);
      }).length;
      return `<div class="weapons-toolbar workbench-toolbar"><div class="workbench-heading"><span data-icon="swords"></span><div><h2>武器淬炼</h2><small>${fmt(resultCount)} 把待淬炼 · ${ready} 把材料齐备</small></div></div><div class="workbench-wallet"><span>黄金 <b>${fmt(save.currencies.gold)}</b></span></div><input class="weapons-search" data-weapon-search value="${query}" placeholder="搜索已拥有武器" aria-label="搜索已拥有武器"></div>`;
    }
    const options = this.filterOptions();
    const select = (name: FilterName, label: string, values: Array<[string, string]>, current: string): string =>
      `<label><select class="weapon-filter" data-weapon-filter="${name}" aria-label="${label}"><option value="">${label}</option>${values
        .map(([value, text]) => `<option value="${escapeHtml(value)}"${current === value ? ' selected' : ''}>${escapeHtml(text)}</option>`)
        .join('')}</select></label>`;
    const chips = [
      this.filters.rarity ? `<span class="filter-chip">稀有度：${escapeHtml(rarityMetaByKey(this.filters.rarity).label)}<button type="button" aria-label="移除稀有度筛选" data-clear-filter="rarity">×</button></span>` : '',
      this.filters.type ? `<span class="filter-chip">类型：${escapeHtml(weaponTypeZh(this.filters.type))}<button type="button" aria-label="移除类型筛选" data-clear-filter="type">×</button></span>` : '',
      this.filters.color ? `<span class="filter-chip">法力：${escapeHtml(COLOR_CN[this.filters.color] ?? this.filters.color)}<button type="button" aria-label="移除法力色筛选" data-clear-filter="color">×</button></span>` : '',
      this.filters.ownership ? `<span class="filter-chip">状态：${escapeHtml(this.ownershipLabel(this.filters.ownership))}<button type="button" aria-label="移除拥有状态筛选" data-clear-filter="ownership">×</button></span>` : '',
      this.filters.source ? `<span class="filter-chip">获取：${escapeHtml(acquireFilterLabel(this.filters.source))}<button type="button" aria-label="移除获取途径筛选" data-clear-filter="source">×</button></span>` : '',
    ].filter(Boolean).join('');
    return `<div class="weapons-toolbar">
      <input class="weapons-search" data-weapon-search value="${query}" placeholder="搜索武器、法术或词缀" aria-label="搜索武器、法术或词缀">
      <div class="weapon-filter-controls">
        ${select('rarity', '稀有度', options.rarities, this.filters.rarity)}
        ${select('type', '类型', options.types, this.filters.type)}
        ${select('color', '法力色', options.colors, this.filters.color)}
        ${select('ownership', '拥有状态', [['owned', '已拥有'], ['usable', '可装备'], ['unowned', '未拥有']], this.filters.ownership)}
        ${select('source', '获取途径', [...ACQUIRE_FILTERS], this.filters.source)}
        ${select('sort', '排序', [['default', '默认顺序'], ['rarity', '稀有度'], ['cost', '耗蓝'], ['name', '名称']], this.filters.sort)}
        <button class="filter-clear" type="button" data-clear-all-filters>清除全部</button>
      </div>
      <div class="weapons-summary">${chips || '<span>全部武器</span>'}<span class="weapons-result-count">${fmt(resultCount)} / ${fmt(ALL_CATALOG_WEAPONS.length)} 把</span></div>
    </div>`;
  }

  private filterOptions(): { rarities: Array<[string, string]>; types: Array<[string, string]>; colors: Array<[string, string]> } {
    const rarityKeys = [...new Set(ALL_CATALOG_WEAPONS.map((w) => w.rarity))].sort(
      (a, b) => (ALL_CATALOG_WEAPONS.find((w) => w.rarity === a)?.rarityIdx ?? 0) - (ALL_CATALOG_WEAPONS.find((w) => w.rarity === b)?.rarityIdx ?? 0),
    );
    const typeKeys = [...new Set(ALL_CATALOG_WEAPONS.map((w) => w.weaponType).filter((v): v is string => Boolean(v)))].sort();
    const colorKeys = [...new Set(ALL_CATALOG_WEAPONS.flatMap((w) => w.manaColors.map((c) => String(c).toLowerCase())))].sort();
    return {
      rarities: rarityKeys.map((key) => [key, rarityMetaByKey(key).label]),
      types: typeKeys.map((key) => [key, weaponTypeZh(key)]),
      colors: colorKeys.map((key) => [key, COLOR_CN[key] ?? key]),
    };
  }

  private cardsForTab(): CardVm[] {
    const save = this.ctx.save();
    let cards: CardVm[];
    if (this.tab === 'forge') {
      cards = SOULFORGE_RECIPES.flatMap((stock) => {
        const weapon = anyWeaponById(stock.recipe.weaponId);
        return weapon ? [{ weapon, recipe: stock.recipe, kind: 'forge' as const }] : [];
      });
    } else {
      const source = this.tab === 'owned' || this.tab === 'temper' ? ownedWeapons(save) : [...ALL_CATALOG_WEAPONS];
      cards = source.map((weapon) => ({ weapon, kind: 'weapon' as const }));
      cards = cards.filter((card) => this.matchesFilters(card.weapon, save));
      if (this.tab === 'temper') cards = cards.filter((card) => temperingLevelOf(save, card.weapon.id) < MAX_TEMPERING_LEVEL);
    }
    if (this.filters.query && this.tab === 'forge') {
      const q = this.filters.query.trim().toLocaleLowerCase();
      cards = cards.filter((card) => this.searchHaystack(card.weapon).includes(q));
    }
    if (this.filters.sort === 'rarity') cards.sort((a, b) => b.weapon.rarityIdx - a.weapon.rarityIdx || a.weapon.name.localeCompare(b.weapon.name));
    else if (this.filters.sort === 'cost') cards.sort((a, b) => a.weapon.manaCost - b.weapon.manaCost || a.weapon.name.localeCompare(b.weapon.name));
    else if (this.filters.sort === 'name') cards.sort((a, b) => a.weapon.name.localeCompare(b.weapon.name));
    else if (this.tab === 'temper') cards.sort((a, b) => temperingLevelOf(save, a.weapon.id) - temperingLevelOf(save, b.weapon.id));
    return cards;
  }

  private matchesFilters(w: WeaponDef, save: ReturnType<ShellCtx['save']>): boolean {
    if (this.filters.query && !this.searchHaystack(w).includes(this.filters.query.trim().toLocaleLowerCase())) return false;
    if (this.filters.rarity && w.rarity !== this.filters.rarity) return false;
    if (this.filters.type && w.weaponType !== this.filters.type) return false;
    if (this.filters.color && !w.manaColors.some((color) => String(color).toLowerCase() === this.filters.color)) return false;
    if (this.filters.ownership === 'owned' && !ownsWeapon(save, w.id)) return false;
    if (this.filters.ownership === 'usable' && !canUseWeapon(save, w)) return false;
    if (this.filters.ownership === 'unowned' && ownsWeapon(save, w.id)) return false;
    if (this.filters.source && acquireFilterKind(acquireOf(w)) !== this.filters.source) return false;
    return true;
  }

  private searchHaystack(w: WeaponDef): string {
    return [w.name, w.nameEn, w.kingdom, w.roleName, w.spellName, w.description, ...w.affixes.flatMap((a) => [a.name, a.description])]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
  }

  private renderCard(card: CardVm): string {
    const save = this.ctx.save();
    const w = card.weapon;
    const meta = rarityMetaByKey(w.rarity);
    const owned = ownsWeapon(save, w.id);
    const equipped = anyWeaponById(save.hero.equippedWeapon)?.id === w.id;
    const level = temperingLevelOf(save, w.id);
    let status = '';
    let statusClass = '';
    if (card.kind === 'forge') {
      const recipe = card.recipe!;
      if (owned) { status = '已拥有'; statusClass = 'is-good'; }
      else if (save.hero.level < forgeTierUnlockLevel(recipe.tier)) { status = `主角 Lv.${forgeTierUnlockLevel(recipe.tier)}`; statusClass = 'is-warn'; }
      else if (save.currencies.souls < recipe.souls || save.currencies.gold < recipe.gold) {
        const soulGap = Math.max(0, recipe.souls - save.currencies.souls);
        const goldGap = Math.max(0, recipe.gold - save.currencies.gold);
        status = soulGap && goldGap ? `缺 ${fmt(soulGap)} 魂 · ${fmt(goldGap)} 金` : soulGap ? `缺 ${fmt(soulGap)} 魂` : `缺 ${fmt(goldGap)} 金`;
        statusClass = 'is-bad';
      }
      else { status = '可锻造'; statusClass = 'is-good'; }
    } else if (equipped) { status = '装备中'; statusClass = 'is-good'; }
    else if (!owned) {
      const acquire = acquireOf(w);
      const progress = acquireProgress(save, acquire);
      if (!w.equippable) { status = '不可装备'; statusClass = 'is-bad'; }
      else { status = progress.short; statusClass = progress.ready ? 'is-good' : 'is-warn'; }
    }
    else if (!w.equippable) { status = '不可装备'; statusClass = 'is-bad'; }
    else { status = '已拥有'; statusClass = 'is-good'; }
    if (this.tab === 'temper') {
      const cost = temperingCost(w.rarity, level);
      const key = ingotKeyForRarity(w.rarity);
      const materialHeld = cost.scrolls ? save.materials.forgeScrolls : key ? save.materials.ingots[key] ?? 0 : 0;
      const materialCost = cost.scrolls || cost.ingots;
      status = save.currencies.gold >= cost.gold && materialHeld >= materialCost ? '可淬炼' : '材料不足';
      statusClass = status === '可淬炼' ? 'is-good' : 'is-warn';
    }
    const workbenchNote = card.kind === 'forge'
      ? `<span class="weapon-note">${fmt(card.recipe!.souls)} 魂 · ${fmt(card.recipe!.gold)} 金</span>`
      : this.tab === 'temper'
        ? `<span class="weapon-note">淬炼 ${level}/${MAX_TEMPERING_LEVEL}</span>`
        : '';
    const mana = card.kind === 'weapon'
      ? `<span class="weapon-mana" title="法力值 ${w.manaCost}">${gemSvg(w.manaColors.map((c) => String(c).toLowerCase()))}<i>${w.manaCost}</i></span>`
      : '';
    const statusHtml = `<span class="weapon-status ${statusClass}">${escapeHtml(status)}</span>`;
    const workbench = this.tab === 'forge' || this.tab === 'temper';
    return `<button class="weapon-card${this.selectedId === w.id ? ' is-selected' : ''}${!owned && card.kind === 'weapon' ? ' is-locked' : ''}" style="${rarityStyle(w.rarity)}" type="button" role="option" aria-selected="${this.selectedId === w.id}" aria-label="${escapeHtml(w.name)}，${escapeHtml(meta.label)}，法力值 ${w.manaCost}" data-rarity="${escapeHtml(w.rarity)}" data-${card.kind === 'forge' ? 'recipe' : 'weapon'}-id="${escapeHtml(w.id)}">
      <span class="weapon-art">${weaponImage(w, '', workbench)}${mana}${workbench ? '' : statusHtml}</span>
      <span class="weapon-card-copy"><b class="weapon-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</b>${workbenchNote}${workbench ? statusHtml : ''}</span>
    </button>`;
  }

  private renderDetail(card: CardVm): string {
    const save = this.ctx.save();
    const w = card.weapon;
    const owned = ownsWeapon(save, w.id);
    const equipped = anyWeaponById(save.hero.equippedWeapon)?.id === w.id;
    const level = temperingLevelOf(save, w.id);
    const spell = renderSpell(w.description, heroStatsOf(save).magic, { interactive: false });
    const tags = [weaponTypeZh(w.weaponType), w.kingdom, roleNameZh(w.role) ?? w.roleName].filter(Boolean).map((text) => `<span class="detail-tag">${escapeHtml(text)}</span>`).join('');
    const affixLevels = w.rarity === 'Doomed' ? DOOMED_AFFIX_UNLOCK_LEVELS : AFFIX_UNLOCK_LEVELS;
    const unlockedAffixes = affixUnlockedCount(w.rarity, level);
    const affixes = `<section class="detail-affixes${w.affixes.length ? '' : ' is-empty'}">
        <div class="detail-section-heading"><span data-icon="swirl"></span><div><small>淬炼词缀</small><h3>${w.affixes.length ? `${unlockedAffixes}/${w.affixes.length} 已解锁` : '尚未生成'}</h3></div></div>
        ${w.affixes.length
          ? `<ul class="affix-list">${w.affixes.map((affix, index) => {
              const on = index < unlockedAffixes;
              const unlockAt = affixLevels[index] ?? 0;
              return `<li class="affix-card${on ? '' : ' is-locked'}">
                <span class="affix-icon" data-icon="${affixIconOf(affix)}"></span>
                <span class="affix-copy"><b>${escapeHtml(affix.name)}</b><small>${escapeHtml(affix.description)}</small></span>
                <span class="affix-state">${on ? '已解锁' : `淬炼 Lv.${unlockAt}`}</span>
              </li>`;
            }).join('')}</ul>`
          : '<p class="affix-empty">这把武器还没有淬炼词缀。升级淬炼后会在这里解锁。</p>'}
      </section>`;
    const acquire = acquireOf(w);
    const progress = acquireProgress(save, acquire);
    let actions = '';
    if (card.kind === 'forge') {
      actions = owned
        ? `<button class="primary-action" type="button" data-weapon-action="goto-owned" data-weapon-id="${escapeHtml(w.id)}">查看我的武器</button>`
        : `<button class="primary-action" type="button" data-weapon-action="open-upgrade" data-weapon-id="${escapeHtml(w.id)}">查看锻造要求</button>`;
    } else if (owned) {
      const canEquip = canUseWeapon(save, w) && !equipped;
      actions = `<button class="primary-action" type="button" data-weapon-action="equip" data-weapon-id="${escapeHtml(w.id)}"${canEquip ? '' : ' disabled'}>${equipped ? '已装备' : w.equippable ? '装备' : '不可装备'}</button>
        <button type="button" data-weapon-action="open-upgrade" data-weapon-id="${escapeHtml(w.id)}"${level >= MAX_TEMPERING_LEVEL ? ' disabled' : ''}>${level >= MAX_TEMPERING_LEVEL ? '淬炼已满级' : '淬炼与升级'}</button>`;
    } else if (acquire.kind === 'forge' || recipeOf(w)) {
      actions = `<button class="primary-action" type="button" data-weapon-action="open-upgrade" data-weapon-id="${escapeHtml(w.id)}">查看锻造要求</button>`;
    } else if (acquire.kind === 'placeholder') {
      actions = `<button class="primary-action" type="button" disabled>不可领取</button>`;
    } else if (acquire.kind === 'buy') {
      if (acquire.kingdom && !kingdomQuestCleared(save, acquire.kingdom)) {
        actions = `<button class="primary-action" type="button" data-weapon-action="goto-quest" data-kingdom="${escapeHtml(acquire.kingdom)}">前往王国任务</button>`;
      } else {
        actions = progress.ready
          ? `<button class="primary-action" type="button" data-weapon-action="claim" data-weapon-id="${escapeHtml(w.id)}">购买武器</button>
        <button type="button" data-weapon-action="goto-shop">前往宝石商店</button>`
          : `<button class="primary-action" type="button" data-weapon-action="goto-shop">前往宝石商店</button>`;
      }
    } else if (progress.ready) {
      actions = `<button class="primary-action" type="button" data-weapon-action="claim" data-weapon-id="${escapeHtml(w.id)}">领取武器</button>`;
    } else if (acquire.kind === 'mastery') {
      actions = `<button class="primary-action" type="button" data-weapon-action="goto-hero">前往法力精通</button>`;
    } else if (acquire.kind === 'class') {
      const unlocked = Boolean(acquire.classId && save.hero.unlockedClasses.includes(acquire.classId));
      actions = unlocked
        ? `<button class="primary-action" type="button" disabled>${escapeHtml(progress.short)}</button>`
        : `<button class="primary-action" type="button" data-weapon-action="goto-hero">前往职业圣殿</button>`;
    } else {
      actions = `<button class="primary-action" type="button" disabled>${escapeHtml(progress.short)}</button>`;
    }
    const spellHeading = w.spellName && w.spellName !== w.name
      ? `<small>武器技能</small><h3>${escapeHtml(w.spellName)}</h3>`
      : '<h3>武器技能</h3>';
    return `<div class="detail-scroll"><div class="detail-overview">
      <div class="detail-visual">
        <div class="detail-art" style="${rarityStyle(w.rarity)}">${weaponImage(w, '', true)}${!owned && card.kind !== 'forge' ? '<span class="detail-lock">未拥有</span>' : ''}</div>
        <div class="detail-stats" role="group" aria-label="武器属性加成">
          <span class="detail-stat stat-attack"><span data-icon="swords"></span><span><small>攻击</small><b>+${w.attack}</b></span></span>
          <span class="detail-stat stat-armor"><span data-icon="shield"></span><span><small>护甲</small><b>+${w.armor}</b></span></span>
          <span class="detail-stat stat-health"><span data-icon="heart"></span><span><small>生命</small><b>+${w.health}</b></span></span>
          <span class="detail-stat stat-magic"><span data-icon="orb"></span><span><small>魔力</small><b>+${w.magic}</b></span></span>
        </div>
      </div>
      <div class="detail-identity">
        <div class="detail-title-row"><div><h2 class="detail-title">${escapeHtml(w.name)}</h2><div class="detail-tags">${tags}</div></div><div class="detail-mana">${gemSvg(w.manaColors.map((c) => String(c).toLowerCase()))}<span><small>法力值消耗</small><b>${w.manaCost}</b></span></div></div>
        <section class="detail-acquire">
          <div class="detail-section-heading"><span data-icon="${acquireIcon(acquireFilterKind(acquire))}"></span><div><small>获取途径</small><h3>${escapeHtml(acquire.label)}</h3></div></div>
          ${owned ? '<p class="detail-acquire-hint is-owned">已拥有</p>' : ''}
        </section>
        <section class="detail-spell"><div class="detail-section-heading"><span data-icon="sparkles"></span><div>${spellHeading}</div></div><p class="detail-copy">${spell.html || '暂无可用法术文本。'}</p></section>
        ${affixes}
      </div>
    </div></div>
    <div class="detail-actions">${actions}</div>`;
  }

  private renderUpgrade(card: CardVm): string {
    const save = this.ctx.save();
    const w = card.weapon;
    const recipe = card.recipe ?? recipeOf(w)?.recipe;
    const owned = ownsWeapon(save, w.id);
    if (card.kind === 'forge' || (!owned && recipe)) return this.renderForgeUpgrade(w, recipe!);
    return this.renderTemperUpgrade(w);
  }

  private renderTemperUpgrade(w: WeaponDef): string {
    const save = this.ctx.save();
    const level = temperingLevelOf(save, w.id);
    if (level >= MAX_TEMPERING_LEVEL) {
      return `<div class="detail-scroll"><div class="upgrade-empty"><span data-icon="check"></span><h2>淬炼已满级</h2><p>「${escapeHtml(w.name)}」已达到 Lv.${MAX_TEMPERING_LEVEL}。</p></div></div><div class="detail-actions"><button type="button" data-weapon-action="back-detail">返回详情</button></div>`;
    }
    const cost = temperingCost(w.rarity, level);
    const ingotKey = ingotKeyForRarity(w.rarity);
    const heldIngot = ingotKey ? save.materials.ingots[ingotKey] ?? 0 : 0;
    const heldScrolls = save.materials.forgeScrolls;
    const materialCost = cost.scrolls > 0 ? cost.scrolls : cost.ingots;
    const materialHeld = cost.scrolls > 0 ? heldScrolls : heldIngot;
    const materialLabel = cost.scrolls > 0 ? '熔铸符卷' : INGOT_NAMES[ingotKey as IngotKey] ?? '钢锭';
    const materialGap = Math.max(0, materialCost - materialHeld);
    const goldGap = Math.max(0, cost.gold - save.currencies.gold);
    const nextAffix = (w.rarity === 'Doomed' ? DOOMED_AFFIX_UNLOCK_LEVELS : AFFIX_UNLOCK_LEVELS).find((unlock) => unlock > level);
    const canTemper = materialGap === 0 && goldGap === 0;
    return `<div class="detail-scroll"><div class="weapon-upgrade-view">
      ${this.renderUpgradeWeapon(w)}
      <section class="upgrade-ledger">
        <div class="upgrade-heading"><span>淬炼进阶</span><h2>升至 Lv.${level + 1}</h2><p>${nextAffix ? `下一词缀将在 Lv.${nextAffix} 解锁` : '全部词缀已解锁，继续提升武器等级。'}</p></div>
        <div class="upgrade-progress"><div><span>当前 Lv.${level}</span><b>${level + 1}</b><span>上限 Lv.${MAX_TEMPERING_LEVEL}</span></div><div class="progress-line"><i style="width:${Math.round(((level + 1) / MAX_TEMPERING_LEVEL) * 100)}%"></i></div></div>
        <div class="upgrade-resources"><div class="upgrade-resource-head"><b>所需材料</b><span>需求</span><span>持有</span><span>缺口</span></div>${this.renderResourceRow(materialLabel, materialCost, materialHeld, cost.scrolls ? 'ticket' : 'bag', cost.scrolls ? scrollArt() : ingotKey ? ingotArt(ingotKey) : '')}${this.renderResourceRow('黄金', cost.gold, save.currencies.gold, 'coin')}</div>
      </section>
    </div></div>
    <div class="detail-actions"><button type="button" data-weapon-action="back-detail">返回详情</button><button class="primary-action" type="button" data-weapon-action="temper" data-weapon-id="${escapeHtml(w.id)}"${canTemper ? '' : ' disabled'}>${canTemper ? `淬炼至 Lv.${level + 1}` : '材料尚未集齐'}</button></div>`;
  }

  private renderForgeUpgrade(w: WeaponDef, recipe: ForgeRecipe): string {
    const save = this.ctx.save();
    const gate = forgeTierUnlockLevel(recipe.tier);
    const levelGap = Math.max(0, gate - save.hero.level);
    const ingotKey = ingotKeyForRarity(recipe.rarity) as IngotKey | null;
    const ingotHeld = ingotKey ? save.materials.ingots[ingotKey] ?? 0 : 0;
    const scrollHeld = save.materials.forgeScrolls;
    const missing = Math.max(0, recipe.souls - save.currencies.souls)
      + Math.max(0, recipe.gold - save.currencies.gold)
      + Math.max(0, (recipe.ingots ?? 0) - ingotHeld)
      + Math.max(0, (recipe.scrolls ?? 0) - scrollHeld);
    const canForge = levelGap === 0 && missing === 0 && !ownsWeapon(save, w.id);
    const armed = this.forgeConfirmId === w.id;
    const highCost = recipe.souls >= 100_000 || recipe.gold >= 100_000;
    const extraRows = `${recipe.ingots ? this.renderResourceRow(INGOT_NAMES[ingotKey!] ?? '钢锭', recipe.ingots, ingotHeld, 'bag', ingotKey ? ingotArt(ingotKey) : '') : ''}${recipe.scrolls ? this.renderResourceRow('熔铸符卷', recipe.scrolls, scrollHeld, 'ticket', scrollArt()) : ''}`;
    const action = canForge
      ? highCost && armed
        ? `<button type="button" data-weapon-action="cancel-forge">取消</button><button class="primary-action" type="button" data-weapon-action="forge" data-weapon-id="${escapeHtml(w.id)}">确认锻造</button>`
        : `<button class="primary-action" type="button" data-weapon-action="forge" data-weapon-id="${escapeHtml(w.id)}">锻造武器</button>`
      : `<button class="primary-action" type="button" disabled>${levelGap ? `还差 ${levelGap} 级解锁` : '材料尚未集齐'}</button>`;
    return `<div class="detail-scroll"><div class="weapon-upgrade-view">
      ${this.renderUpgradeWeapon(w)}
      <section class="upgrade-ledger">
        <div class="upgrade-gate${levelGap ? ' is-locked' : ''}"><span data-icon="${levelGap ? 'lock' : 'check'}"></span><div><small>等级门槛</small><b>主角 Lv.${gate}</b></div><strong>${levelGap ? `当前 Lv.${save.hero.level} · 还差 ${levelGap} 级` : '已解锁'}</strong></div>
        <div class="upgrade-resources"><div class="upgrade-resource-head"><b>所需材料</b><span>需求</span><span>持有</span><span>缺口</span></div>${this.renderResourceRow('灵魂', recipe.souls, save.currencies.souls, 'soul')}${this.renderResourceRow('黄金', recipe.gold, save.currencies.gold, 'coin')}${extraRows}</div>
        ${highCost && armed ? `<p class="forge-confirm"><span data-icon="lock"></span>这是高价配方。确认后将立即扣除材料并获得该武器。</p>` : ''}
      </section>
    </div></div>
    <div class="detail-actions"><button type="button" data-weapon-action="back-detail">返回详情</button>${action}</div>`;
  }

  private renderUpgradeWeapon(w: WeaponDef): string {
    const meta = rarityMetaByKey(w.rarity);
    return `<aside class="upgrade-weapon" style="${rarityStyle(w.rarity)}"><div class="upgrade-weapon-art">${weaponImage(w, '', true)}</div><div><span style="color:${meta.color}">${escapeHtml(meta.label)}</span><h3>${escapeHtml(w.name)}</h3><p>${escapeHtml(weaponTypeZh(w.weaponType))} · ${escapeHtml(w.kingdom)}</p></div></aside>`;
  }

  private renderResourceRow(name: string, required: number, held: number, iconName: string, art = ''): string {
    const gap = Math.max(0, required - held);
    const mark = art ? materialImg(art) : `<span data-icon="${iconName}"></span>`;
    return `<div class="resource-row${gap ? ' is-short' : ''}"><span class="resource-name">${mark}<b>${escapeHtml(name)}</b></span><span><small>需求</small><b>${fmt(required)}</b></span><span><small>持有</small><b>${fmt(held)}</b></span><span><small>缺口</small><b>${fmt(gap)}</b></span></div>`;
  }

  private ownershipLabel(value: WeaponFilters['ownership']): string {
    return value === 'usable' ? '可装备' : value === 'unowned' ? '未拥有' : '已拥有';
  }

  private clearFilter(name: FilterName): void {
    if (name === 'rarity') this.filters.rarity = '';
    if (name === 'type') this.filters.type = '';
    if (name === 'color') this.filters.color = '';
    if (name === 'ownership') this.filters.ownership = '';
    if (name === 'source') this.filters.source = '';
  }

  private clearFilters(): void {
    this.filters = { query: '', rarity: '', type: '', color: '', ownership: '', source: '', sort: 'default' };
  }

  private async equip(id: string): Promise<void> {
    const weapon = anyWeaponById(id);
    if (!weapon) return;
    const update = await this.ctx.gateway.equipHeroWeapon(id);
    if (isFailure(update.result)) {
      toast(update.result.message);
      return;
    }
    this.selectedId = id;
    this.ctx.refreshChrome();
    this.render();
    toast(`已装备「${weapon.name}」`);
  }

  private async claim(id: string): Promise<void> {
    const weapon = anyWeaponById(id);
    if (!weapon) return;
    const update = await this.ctx.gateway.claimHeroWeapon(id);
    if (isFailure(update.result)) {
      toast(update.result.message);
      return;
    }
    this.tab = 'owned';
    this.selectedId = id;
    this.ctx.refreshChrome();
    this.render();
    toast(`已领取「${weapon.name}」`);
  }

  private async forge(id: string): Promise<void> {
    const weapon = anyWeaponById(id);
    if (!weapon) return;
    const recipe = recipeOf(weapon)?.recipe;
    if (recipe && (recipe.souls >= 100_000 || recipe.gold >= 100_000) && this.forgeConfirmId !== id) {
      this.forgeConfirmId = id;
      this.render();
      return;
    }
    this.forgeConfirmId = null;
    const update = await this.ctx.gateway.forgeCatalogWeapon(id);
    if (isFailure(update.result)) {
      toast(update.result.message);
      return;
    }
    this.tab = 'owned';
    this.selectedId = id;
    this.ctx.refreshChrome();
    this.render();
    toast(`已锻造「${weapon.name}」`);
  }

  private async temper(id: string): Promise<void> {
    const weapon = anyWeaponById(id);
    if (!weapon) return;
    const update = await this.ctx.gateway.temperWeapon(id);
    if (isFailure(update.result)) {
      toast(update.result.message);
      return;
    }
    this.selectedId = id;
    this.ctx.refreshChrome();
    this.render();
    toast(`「${weapon.name}」已淬炼至 Lv.${update.result.level}`);
  }

  dispose(): void {
    this.termTips?.();
    this.root?.removeEventListener('click', this.onClick);
    this.root?.removeEventListener('input', this.onInput);
    this.root?.removeEventListener('change', this.onChange);
    window.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('resize', this.onResize);
    this.styleEl?.remove();
    this.styleEl = null;
    this.root = null;
  }
}
