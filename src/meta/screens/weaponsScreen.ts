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
import { SOULFORGE_RECIPES, type SoulforgeStock } from '../data/soulforge';
import type { WeaponDef } from '../data/weapons';
import { INGOT_NAMES, ingotKeyForRarity, type IngotKey } from '../data/materials';
import { bottomNavHtml, COLOR_CN, gemSvg, mountIcons, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { isFailure } from '../gateway';
import type { Screen, ShellCtx } from '../shell/screen';
import { renderSpell } from '../shell/spellText';

type WeaponTab = 'owned' | 'all' | 'forge' | 'temper';
type FilterName = 'rarity' | 'type' | 'color' | 'ownership' | 'source' | 'sort';

interface WeaponFilters {
  query: string;
  rarity: string;
  type: string;
  color: string;
  ownership: '' | 'owned' | 'usable' | 'unowned';
  source: '' | 'forge' | 'none';
  sort: 'default' | 'rarity' | 'cost' | 'name';
}

interface RarityMeta {
  label: string;
  color: string;
  glow: string;
}

/**
 * 武器数据仍保留官方八档；玩家看到的是稳定、可扫读的中文名和统一边框色。
 * Uncommon/UltraRare 使用最新视觉口径「精良/传说」，避免旧的「非普通/超稀有」。
 */
const RARITY_META: Readonly<Record<string, RarityMeta>> = {
  Common: { label: '普通', color: '#aab2ad', glow: 'rgba(170,178,173,.18)' },
  Uncommon: { label: '精良', color: '#4caf6a', glow: 'rgba(76,175,106,.2)' },
  Rare: { label: '稀有', color: '#9a4fd4', glow: 'rgba(154,79,212,.2)' },
  UltraRare: { label: '传说', color: '#ffe24a', glow: 'rgba(255,226,74,.2)' },
  Epic: { label: '史诗', color: '#c56b2d', glow: 'rgba(197,107,45,.2)' },
  Legendary: { label: '传奇', color: '#a94e23', glow: 'rgba(169,78,35,.2)' },
  Mythic: { label: '神话', color: '#56d8ff', glow: 'rgba(86,216,255,.22)' },
  Doomed: { label: '末日', color: '#d45b59', glow: 'rgba(212,91,89,.2)' },
};

const rarityMeta = (rarity: string): RarityMeta =>
  RARITY_META[rarity] ?? { label: rarity, color: '#aab2ad', glow: 'rgba(170,178,173,.18)' };

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const fmt = (value: number): string => Math.max(0, Math.floor(value)).toLocaleString('en-US');

function tabOf(value: string | undefined): WeaponTab {
  return value === 'all' || value === 'forge' || value === 'temper' ? value : 'owned';
}

function rarityStyle(rarity: string): string {
  const meta = rarityMeta(rarity);
  return `--rarity-line:${meta.color};--rarity-glow:${meta.glow}`;
}

function weaponImage(w: WeaponDef, className = ''): string {
  const url = catalogIconUrl(w);
  if (!url) return `<div class="weapon-art-missing ${className}" aria-hidden="true"></div>`;
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(w.name)}" loading="lazy">`;
}

function sourceOf(w: WeaponDef): string {
  if (w.starter) return '初始武器 · 无需解锁';
  const recipe = SOULFORGE_RECIPES.find((stock) => stock.recipe.weaponId === w.id);
  if (recipe) return `熔炉锻造 · ${recipe.source}`;
  if (!w.equippable) return '占位武器 · 无战斗法术 · 不可装备';
  return '暂无获取途径';
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
  private selectedId: string | null = null;
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
      this.selectedId = null;
      this.render();
      return;
    }

    const clearFilter = target.closest<HTMLElement>('[data-clear-filter]');
    if (clearFilter) {
      const name = clearFilter.dataset.clearFilter as FilterName | undefined;
      if (name && name !== 'sort') this.clearFilter(name);
      this.render();
      return;
    }

    const clearAll = target.closest<HTMLElement>('[data-clear-all-filters]');
    if (clearAll) {
      this.clearFilters();
      this.render();
      return;
    }

    const action = target.closest<HTMLElement>('[data-weapon-action]');
    if (action) {
      const kind = action.dataset.weaponAction;
      const id = action.dataset.weaponId ?? this.selectedId;
      if (!id || action.hasAttribute('disabled')) return;
      if (kind === 'equip') void this.equip(id);
      if (kind === 'forge') void this.forge(id);
      if (kind === 'temper') void this.temper(id);
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
      this.render();
      return;
    }

    const back = target.closest<HTMLElement>('[data-weapons-back]');
    if (back) this.ctx.navigate('#hero');

    const emptyReset = target.closest<HTMLElement>('[data-empty-reset]');
    if (emptyReset) {
      this.clearFilters();
      this.render();
    }
  };

  private readonly onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-weapon-search]')) return;
    this.filters.query = input.value;
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
    this.render();
  };

  html(_ctx?: ShellCtx, param?: string): string {
    if (param) this.tab = tabOf(param);
    return `
      ${topbarHtml()}
      <main class="screen weapons-screen" id="weaponsScreen">
        <header class="weapons-heading">
          <button class="weapons-back" type="button" aria-label="返回主角" data-weapons-back><span data-icon="arrow"></span></button>
          <div><h1>武 器 中 心</h1><p>官方武器目录 · 装备 · 熔炉 · 淬炼</p></div>
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
    this.render();
  }

  private screenEl(): HTMLElement | null {
    return this.root?.querySelector<HTMLElement>('#weaponsScreen') ?? null;
  }

  private render(focusQuery = false, queryPosition?: number): void {
    const screen = this.screenEl();
    if (!screen) return;
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
    const soul = screen.querySelector<HTMLElement>('#weaponsSoulBalance');
    if (soul) soul.textContent = fmt(save.currencies.souls);
    mountIcons(screen);
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
    if (cards.length > 0 && (!this.selectedId || !cards.some((card) => card.weapon.id === this.selectedId))) {
      const save = this.ctx.save();
      const equipped = anyWeaponById(save.hero.equippedWeapon)?.id;
      this.selectedId = cards.find((card) => card.weapon.id === equipped)?.weapon.id ?? cards[0]!.weapon.id;
    }
    const selected = cards.find((card) => card.weapon.id === this.selectedId) ?? cards[0] ?? null;
    const isFilterTab = this.tab === 'owned' || this.tab === 'all';
    const toolbar = this.renderToolbar(isFilterTab);
    const note =
      this.tab === 'forge'
        ? '<p class="forge-note">配方只展示真实可用的活动武器；名称与官方目录保持单源。</p>'
        : this.tab === 'temper'
          ? '<p class="temper-note">淬炼等级、材料余额与下一档词缀解锁均来自当前存档。</p>'
          : '';
    const empty = cards.length
      ? ''
      : `<div class="empty-state"><strong>${this.tab === 'temper' ? '没有待淬炼武器' : '没有符合条件的武器'}</strong><span>当前筛选没有结果。</span>${isFilterTab ? '<button type="button" data-empty-reset>清除筛选</button>' : ''}</div>`;
    return `${toolbar}${note}
      <div class="weapons-workspace">
        <div class="weapons-list" role="listbox" aria-label="武器列表">${empty}${cards.map((card) => this.renderCard(card)).join('')}</div>
        <aside class="weapon-detail" aria-label="武器详情">${selected ? this.renderDetail(selected) : '<div class="empty-state"><strong>选择一把武器</strong></div>'}</aside>
      </div>`;
  }

  private renderToolbar(includeFilters: boolean): string {
    const resultCount = this.cardsForTab().length;
    const query = escapeHtml(this.filters.query);
    if (!includeFilters) {
      return `<div class="weapons-toolbar"><input class="weapons-search" data-weapon-search value="${query}" placeholder="搜索武器、法术或词缀" aria-label="搜索武器"><span class="weapons-result-count">${fmt(resultCount)} 把</span></div>`;
    }
    const options = this.filterOptions();
    const select = (name: FilterName, label: string, values: Array<[string, string]>, current: string): string =>
      `<label><select class="weapon-filter" data-weapon-filter="${name}" aria-label="${label}"><option value="">${label}</option>${values
        .map(([value, text]) => `<option value="${escapeHtml(value)}"${current === value ? ' selected' : ''}>${escapeHtml(text)}</option>`)
        .join('')}</select></label>`;
    const chips = [
      this.filters.rarity ? `<span class="filter-chip">稀有度：${escapeHtml(rarityMeta(this.filters.rarity).label)}<button type="button" aria-label="移除稀有度筛选" data-clear-filter="rarity">×</button></span>` : '',
      this.filters.type ? `<span class="filter-chip">类型：${escapeHtml(weaponTypeZh(this.filters.type))}<button type="button" aria-label="移除类型筛选" data-clear-filter="type">×</button></span>` : '',
      this.filters.color ? `<span class="filter-chip">法力：${escapeHtml(COLOR_CN[this.filters.color] ?? this.filters.color)}<button type="button" aria-label="移除法力色筛选" data-clear-filter="color">×</button></span>` : '',
      this.filters.ownership ? `<span class="filter-chip">状态：${escapeHtml(this.ownershipLabel(this.filters.ownership))}<button type="button" aria-label="移除拥有状态筛选" data-clear-filter="ownership">×</button></span>` : '',
      this.filters.source ? `<span class="filter-chip">获取：${this.filters.source === 'forge' ? '可熔炉锻造' : '暂无途径'}<button type="button" aria-label="移除获取途径筛选" data-clear-filter="source">×</button></span>` : '',
    ].filter(Boolean).join('');
    return `<div class="weapons-toolbar">
      <input class="weapons-search" data-weapon-search value="${query}" placeholder="搜索武器、法术或词缀" aria-label="搜索武器、法术或词缀">
      ${select('rarity', '稀有度', options.rarities, this.filters.rarity)}
      ${select('type', '类型', options.types, this.filters.type)}
      ${select('color', '法力色', options.colors, this.filters.color)}
      ${select('ownership', '拥有状态', [['owned', '已拥有'], ['usable', '可装备'], ['unowned', '未拥有']], this.filters.ownership)}
      ${select('source', '获取途径', [['forge', '可熔炉锻造'], ['none', '暂无途径']], this.filters.source)}
      ${select('sort', '排序', [['default', '默认顺序'], ['rarity', '稀有度'], ['cost', '耗蓝'], ['name', '名称']], this.filters.sort)}
      <button class="filter-clear" type="button" data-clear-all-filters>清除全部</button>
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
      rarities: rarityKeys.map((key) => [key, rarityMeta(key).label]),
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
    if (this.filters.source === 'forge' && !recipeOf(w)) return false;
    if (this.filters.source === 'none' && (recipeOf(w) || w.starter)) return false;
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
    const meta = rarityMeta(w.rarity);
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
    else if (!owned) { status = w.equippable ? '未拥有' : '不可装备'; statusClass = 'is-bad'; }
    else if (!w.equippable) { status = '不可装备'; statusClass = 'is-bad'; }
    else { status = '已拥有'; statusClass = 'is-good'; }
    const metaText = card.kind === 'forge' ? `${fmt(card.recipe!.souls)} 魂 · ${fmt(card.recipe!.gold)} 金` : `${weaponTypeZh(w.weaponType)} · ${w.kingdom}`;
    return `<button class="weapon-card${this.selectedId === w.id ? ' is-selected' : ''}${!owned && card.kind === 'weapon' ? ' is-locked' : ''}" style="${rarityStyle(w.rarity)}" type="button" role="option" aria-selected="${this.selectedId === w.id}" data-${card.kind === 'forge' ? 'recipe' : 'weapon'}-id="${escapeHtml(w.id)}">
      <span class="weapon-status ${statusClass}">${escapeHtml(status)}</span>
      <span class="weapon-art">${weaponImage(w)}</span>
      <span class="weapon-rarity">${escapeHtml(meta.label)}</span>
      <b class="weapon-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</b>
      <span class="weapon-meta">${card.kind === 'weapon' ? `${gemSvg(w.manaColors.map((c) => String(c).toLowerCase()))}<span>${escapeHtml(metaText)} · ${w.manaCost}</span>` : `<span>${escapeHtml(metaText)}</span>`}</span>
      ${card.kind === 'weapon' && this.tab === 'temper' ? `<span class="weapon-meta">淬炼 ${level}/${MAX_TEMPERING_LEVEL}</span>` : ''}
    </button>`;
  }

  private renderDetail(card: CardVm): string {
    const save = this.ctx.save();
    const w = card.weapon;
    const meta = rarityMeta(w.rarity);
    const owned = ownsWeapon(save, w.id);
    const equipped = anyWeaponById(save.hero.equippedWeapon)?.id === w.id;
    const level = temperingLevelOf(save, w.id);
    const spell = renderSpell(w.description, heroStatsOf(save).magic, { interactive: false });
    const tags = [weaponTypeZh(w.weaponType), w.kingdom, w.roleName].filter(Boolean).map((text) => `<span class="detail-tag">${escapeHtml(text)}</span>`).join('');
    const affixLevels = w.rarity === 'Doomed' ? DOOMED_AFFIX_UNLOCK_LEVELS : AFFIX_UNLOCK_LEVELS;
    const unlockedAffixes = affixUnlockedCount(w.rarity, level);
    const affixes = w.affixes.length
      ? `<section class="detail-section"><h4>淬炼词缀 ${unlockedAffixes}/${w.affixes.length}</h4><ul class="affix-list">${w.affixes
          .map((affix, index) => `<li class="${index < unlockedAffixes ? '' : 'is-locked'}"><small>${index < unlockedAffixes ? '已解锁' : `Lv.${affixLevels[index] ?? '—'}`}</small><span><b>${escapeHtml(affix.name)}</b><br><small>${escapeHtml(affix.description)}</small></span></li>`)
          .join('')}</ul><p class="detail-source">词缀效果按当前系统口径仅展示解锁状态。</p></section>`
      : '';
    const temper = owned
      ? this.renderTemperSection(w, level)
      : '';
    let actions = '';
    if (card.kind === 'forge') {
      const recipe = card.recipe!;
      const canForge = !owned && save.hero.level >= forgeTierUnlockLevel(recipe.tier) && save.currencies.souls >= recipe.souls && save.currencies.gold >= recipe.gold;
      actions = owned
        ? `<button class="primary-action" type="button" data-weapon-action="goto-owned" data-weapon-id="${escapeHtml(w.id)}">查看我的武器</button>`
        : this.renderForgeActions(w.id, canForge);
    } else {
      const canEquip = canUseWeapon(save, w) && !equipped;
      const canTemper = owned && level < MAX_TEMPERING_LEVEL;
      const recipe = recipeOf(w)?.recipe;
      actions = `<button class="primary-action" type="button" data-weapon-action="equip" data-weapon-id="${escapeHtml(w.id)}"${canEquip ? '' : ' disabled'}>${equipped ? '已装备' : w.equippable && owned ? '装备' : '不可装备'}</button>
        <button type="button" data-weapon-action="temper" data-weapon-id="${escapeHtml(w.id)}"${canTemper ? '' : ' disabled'}>${level >= MAX_TEMPERING_LEVEL ? '已满级' : '淬炼 +1'}</button>
        ${!owned && recipe ? `<button type="button" data-weapon-action="goto-forge" data-weapon-id="${escapeHtml(w.id)}">去熔炉</button>` : ''}`;
    }
    const source = sourceOf(w);
    const recipe = recipeOf(w)?.recipe;
    const recipeCost = recipe ? this.renderForgeCost(recipe, save) : '';
    return `<div class="detail-art" style="${rarityStyle(w.rarity)}">${weaponImage(w)}${!owned && card.kind !== 'forge' ? '<span class="detail-lock">未拥有</span>' : ''}</div>
      <div class="detail-rarity" style="color:${meta.color}">${escapeHtml(meta.label)}</div>
      <h2 class="detail-title">${escapeHtml(w.name)}<small>${escapeHtml(w.nameEn)}</small></h2>
      <div class="detail-tags">${tags}</div>
      <div class="detail-stats" role="group" aria-label="武器属性"><span class="detail-stat"><span data-icon="swords"></span><b>+${w.attack}</b><small>攻击</small></span><span class="detail-stat"><span data-icon="shield"></span><b>+${w.armor}</b><small>护甲</small></span><span class="detail-stat"><span data-icon="heart"></span><b>+${w.health}</b><small>生命</small></span><span class="detail-stat"><span data-icon="orb"></span><b>+${w.magic}</b><small>魔力</small></span></div>
      <div class="detail-mana">${gemSvg(w.manaColors.map((c) => String(c).toLowerCase()))}<span>法力消耗 <b>${w.manaCost}</b></span></div>
      <section class="detail-section"><h4>${escapeHtml(w.spellName || '武器法术')}</h4><p class="detail-copy">${spell.html || '暂无可用法术文本。'}</p></section>
      ${affixes}${temper}
      <p class="detail-source">获取途径：${escapeHtml(source)}</p>${recipeCost}
      <div class="detail-actions">${actions}</div>`;
  }

  private renderTemperSection(w: WeaponDef, level: number): string {
    const save = this.ctx.save();
    if (level >= MAX_TEMPERING_LEVEL) return `<section class="detail-section detail-progress"><h4>淬炼</h4><div class="progress-copy"><span>已达上限</span><b>${level}/${MAX_TEMPERING_LEVEL}</b></div><div class="progress-line"><i style="width:100%"></i></div></section>`;
    const cost = temperingCost(w.rarity, level);
    const ingotKey = ingotKeyForRarity(w.rarity);
    const heldIngot = ingotKey ? save.materials.ingots[ingotKey] ?? 0 : 0;
    const heldScrolls = save.materials.forgeScrolls;
    const materialCost = cost.scrolls > 0 ? cost.scrolls : cost.ingots;
    const materialHeld = cost.scrolls > 0 ? heldScrolls : heldIngot;
    const materialLabel = cost.scrolls > 0 ? '熔铸符卷' : INGOT_NAMES[ingotKey as IngotKey] ?? '钢锭';
    const materialGap = Math.max(0, materialCost - materialHeld);
    const goldGap = Math.max(0, cost.gold - save.currencies.gold);
    const gap = materialGap || goldGap;
    return `<section class="detail-section detail-progress"><h4>淬炼 Lv.${level} / ${MAX_TEMPERING_LEVEL}</h4><div class="progress-copy"><span>下一档消耗</span><b>${escapeHtml(materialLabel)} ${materialCost} · 黄金 ${fmt(cost.gold)}</b></div><div class="resource-compare"><span>持有 ${escapeHtml(materialLabel)} ${materialHeld} · 黄金 ${fmt(save.currencies.gold)}</span>${gap ? `<em>缺口 ${materialGap ? `${materialGap} ${escapeHtml(materialLabel)}` : ''}${materialGap && goldGap ? ' · ' : ''}${goldGap ? `${fmt(goldGap)} 黄金` : ''}</em>` : '<em class="is-ok">材料充足</em>'}</div><div class="progress-line"><i style="width:${Math.round((level / MAX_TEMPERING_LEVEL) * 100)}%"></i></div></section>`;
  }

  private renderForgeActions(weaponId: string, canForge: boolean): string {
    if (!canForge) return `<button class="primary-action" type="button" data-weapon-action="forge" data-weapon-id="${escapeHtml(weaponId)}" disabled>材料/等级不足</button>`;
    const armed = this.forgeConfirmId === weaponId;
    const recipe = SOULFORGE_RECIPES.find((stock) => stock.recipe.weaponId === weaponId)?.recipe;
    const highCost = Boolean(recipe && (recipe.souls >= 100_000 || recipe.gold >= 100_000));
    if (highCost && armed) {
      return `<button class="primary-action" type="button" data-weapon-action="forge" data-weapon-id="${escapeHtml(weaponId)}">确认锻造</button><button type="button" data-weapon-action="cancel-forge">取消</button>`;
    }
    return `<button class="primary-action" type="button" data-weapon-action="forge" data-weapon-id="${escapeHtml(weaponId)}">锻造</button>`;
  }

  private renderForgeCost(recipe: ForgeRecipe, save: ReturnType<ShellCtx['save']>): string {
    const soulsGap = Math.max(0, recipe.souls - save.currencies.souls);
    const goldGap = Math.max(0, recipe.gold - save.currencies.gold);
    const gate = forgeTierUnlockLevel(recipe.tier);
    return `<div class="detail-cost"><span>锻造消耗</span><div class="resource-compare"><span>灵魂 ${fmt(recipe.souls)} · 持有 ${fmt(save.currencies.souls)}</span>${soulsGap ? `<em>缺口 ${fmt(soulsGap)} 灵魂</em>` : '<em class="is-ok">充足</em>'}</div><div class="resource-compare"><span>黄金 ${fmt(recipe.gold)} · 持有 ${fmt(save.currencies.gold)}</span>${goldGap ? `<em>缺口 ${fmt(goldGap)} 黄金</em>` : '<em class="is-ok">充足</em>'}</div><p class="detail-source">熔炉 Tier ${recipe.tier} · 需要主角 Lv.${gate}</p></div>`;
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

  private async forge(id: string): Promise<void> {
    const weapon = anyWeaponById(id);
    if (!weapon) return;
    const recipe = recipeOf(weapon)?.recipe;
    if (recipe && (recipe.souls >= 100_000 || recipe.gold >= 100_000) && this.forgeConfirmId !== id) {
      this.forgeConfirmId = id;
      this.render();
      toast('高价配方：再次点击确认锻造。');
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
    this.root?.removeEventListener('click', this.onClick);
    this.root?.removeEventListener('input', this.onInput);
    this.root?.removeEventListener('change', this.onChange);
    this.styleEl?.remove();
    this.styleEl = null;
    this.root = null;
  }
}
