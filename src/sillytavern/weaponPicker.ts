/**
 * Main-hand weapon picker for the tavern party page. It reuses the original weapon center's
 * markup classes (weaponsScreen.css), card art, mana badge, rarity tint and spell rendering, but
 * only lists weapons with a registered spell and only shows what applies in tavern battles:
 * art, mana colors and cost, and the spell. Stat bonuses, affixes and acquisition are left out
 * because tavern stats come from the AIRP character. 普通/精良/稀有 weapons are open; higher rarities
 * are bought with 通用币 in the detail view (see weaponShop.ts).
 */
import { catalogWeaponById, catalogIconUrl, weaponTypeZh } from '../meta/data/weaponCatalog';
import type { WeaponDef } from '../meta/data/weapons';
import { rarityMetaByKey, rarityStyle } from '../meta/data/rarity';
import { COLOR_CN, gemSvg, mountIcons } from '../meta/shell/chrome';
import { escapeHtml } from '../meta/screens/troopCard';
import { renderSpell } from '../meta/shell/spellText';
import { abilityDisplayText } from './abilityDisplay';
import { partyWeaponChoices, partyWeaponDescription, partyWeaponEconomyIssues, STARTER_WEAPON } from './partyPreparation';
import { formatCurrency, weaponPrice } from './weaponShop';

export interface WeaponPickerOptions {
  /** Shadow root (or element) that hosts the overlay; it must already carry weaponsScreen.css. */
  root: ShadowRoot | HTMLElement;
  /** Bound weapon id, or '' for the starter weapon. */
  current: string;
  /** Hero magic, so spell numbers show real values. */
  magic: number;
  /** Resolves art paths under the game's static directory against the game's origin. */
  assetBase: URL;
  /** Called with the chosen id; '' means "use the starter weapon". */
  onPick(id: string): void;
  /** Main-hand item name from the AIRP equipment list, shown in the title. */
  equipmentName: string;
  /** Weapon shop backed by the current floor's MVU variables. */
  shop: WeaponShopAccess;
}

/** Live view of the current floor; read again after every purchase. */
export interface WeaponShopAccess {
  owned(id: string): boolean;
  balance(): number | undefined;
  /** Reason purchases are unavailable right now (e.g. a pending story battle), if any. */
  blocked(): string | undefined;
  /** Deduct 通用币 and record ownership; rejects with a readable message. */
  purchase(id: string): Promise<void>;
}

type Sort = 'default' | 'rarity' | 'cost' | 'name';
interface Filters { query: string; rarity: string; type: string; color: string; ownership: '' | 'owned' | 'unowned'; sort: Sort }

let cachedWeapons: WeaponDef[] | undefined;
/** Registered weapons in catalogue order (starter first, as in the original list). */
function pickerWeapons(): WeaponDef[] {
  cachedWeapons ??= partyWeaponChoices().flatMap(id => { const w = catalogWeaponById(id); return w ? [w] : []; });
  return cachedWeapons;
}

function pageSize(width: number): number { return width <= 600 ? 4 : width <= 980 ? 8 : 12; }

/** Open the picker; returns a close function. Escape closes the detail first, then the picker. */
export function openWeaponPicker(options: WeaponPickerOptions): () => void {
  const doc = options.root instanceof ShadowRoot ? options.root.host.ownerDocument : options.root.ownerDocument;
  const win = doc.defaultView ?? window;
  const previous = (options.root instanceof ShadowRoot ? options.root.activeElement : doc.activeElement) as HTMLElement | null;
  // Its own modal dialog: the party page can itself be a modal <dialog>, which makes anything
  // outside it inert; a second showModal() puts the picker in the top layer above it.
  const overlay = doc.createElement('dialog');
  overlay.className = 'st-weapon-picker';
  overlay.setAttribute('aria-label', '选择主手武器');
  const current = options.current || STARTER_WEAPON;
  const filters: Filters = { query: '', rarity: '', type: '', color: '', ownership: '', sort: 'default' };
  let page = 1; let selected: string | null = null; let closed = false;
  // Purchase flow inside the detail view: 'confirm' asks once more, 'buying' waits for MVU.
  let purchase: { id: string; state: 'confirm' | 'buying' } | undefined;
  let notice = '';
  const shop = options.shop;
  const descriptions = new Map<string, string>();

  const art = (w: WeaponDef, eager = false): string => {
    const url = catalogIconUrl(w);
    return url ? `<img src="${escapeHtml(new URL(url.replace(/^\//, ''), options.assetBase).href)}" alt="${escapeHtml(w.name)}" loading="${eager ? 'eager' : 'lazy'}">`
      : '<div class="weapon-art-missing" aria-hidden="true"></div>';
  };
  const mana = (w: WeaponDef): string => gemSvg(w.manaColors.map(c => String(c).toLowerCase()));
  const matches = (w: WeaponDef): boolean => {
    const q = filters.query.trim().toLocaleLowerCase();
    if (q && ![w.name, w.nameEn, w.spellName, weaponTypeZh(w.weaponType)].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)) return false;
    if (filters.rarity && w.rarity !== filters.rarity) return false;
    if (filters.type && w.weaponType !== filters.type) return false;
    if (filters.color && !w.manaColors.some(c => String(c).toLowerCase() === filters.color)) return false;
    // 已拥有 includes the free 普通/精良/稀有 weapons and bought ones.
    if (filters.ownership && shop.owned(w.id) !== (filters.ownership === 'owned')) return false;
    return true;
  };
  function list(): WeaponDef[] {
    const rows = pickerWeapons().filter(matches);
    if (filters.sort === 'rarity') rows.sort((a, b) => b.rarityIdx - a.rarityIdx || a.name.localeCompare(b.name));
    else if (filters.sort === 'cost') rows.sort((a, b) => a.manaCost - b.manaCost || a.name.localeCompare(b.name));
    else if (filters.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }
  function filterSelect(name: keyof Filters, label: string, values: [string, string][]): string {
    return `<label><select class="weapon-filter" data-picker-filter="${name}" aria-label="${label}"><option value="">${label}</option>${values
      .map(([value, text]) => `<option value="${escapeHtml(value)}"${filters[name] === value ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
  }
  function balanceText(): string { const balance = shop.balance(); return balance === undefined ? '—' : balance.toLocaleString('zh-CN'); }
  function toolbar(total: number): string {
    const all = pickerWeapons();
    const rarities = [...new Set(all.map(w => w.rarity))].sort((a, b) => (all.find(w => w.rarity === a)!.rarityIdx) - (all.find(w => w.rarity === b)!.rarityIdx));
    const types = [...new Set(all.map(w => w.weaponType).filter((v): v is string => !!v))].sort();
    const colors = [...new Set(all.flatMap(w => w.manaColors.map(c => String(c).toLowerCase())))].sort();
    return `<div class="weapons-toolbar">
      <input class="weapons-search" data-picker-search value="${escapeHtml(filters.query)}" placeholder="搜索武器或法术" aria-label="搜索武器或法术">
      <div class="weapon-filter-controls">
        ${filterSelect('rarity', '稀有度', rarities.map(key => [key, rarityMetaByKey(key).label]))}
        ${filterSelect('type', '类型', types.map(key => [key, weaponTypeZh(key)]))}
        ${filterSelect('color', '法力色', colors.map(key => [key, COLOR_CN[key] ?? key]))}
        ${filterSelect('ownership', '拥有状态', [['owned', '已拥有'], ['unowned', '未拥有']])}
        ${filterSelect('sort', '排序', [['default', '默认顺序'], ['rarity', '稀有度'], ['cost', '耗蓝'], ['name', '名称']])}
        <button class="filter-clear" type="button" data-picker-clear>清除全部</button>
      </div>
      <div class="weapons-summary"><span>可登记武器</span><span class="weapons-result-count">${total} / ${all.length} 把</span><span class="weapon-shop-balance">通用币 ${balanceText()}</span></div>
    </div>`;
  }
  function card(w: WeaponDef): string {
    const issues = partyWeaponEconomyIssues(w.id);
    const owned = shop.owned(w.id);
    const status = w.id === current && owned ? '<span class="weapon-status is-good">当前</span>' : issues.length ? '<span class="weapon-status is-bad">暂未开放</span>'
      : owned ? '' : `<span class="weapon-status is-warn" title="售价 ${formatCurrency(weaponPrice(w.id))} 通用币">${formatCurrency(weaponPrice(w.id))}</span>`;
    const ownership = owned ? '' : `，未购买，售价 ${formatCurrency(weaponPrice(w.id))} 通用币`;
    return `<button class="weapon-card${selected === w.id ? ' is-selected' : ''}${issues.length || !owned ? ' is-locked' : ''}" style="${rarityStyle(w.rarity)}" type="button" role="option" aria-selected="${w.id === current}" aria-label="${escapeHtml(w.name)}，${escapeHtml(rarityMetaByKey(w.rarity).label)}，法力值 ${w.manaCost}${ownership}" data-picker-weapon="${escapeHtml(w.id)}">
      <span class="weapon-art">${art(w)}<span class="weapon-mana" title="法力值 ${w.manaCost}">${mana(w)}<i>${w.manaCost}</i></span>${status}</span>
      <span class="weapon-card-copy"><b class="weapon-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</b></span>
    </button>`;
  }
  function buyAction(w: WeaponDef): string {
    const price = weaponPrice(w.id); const balance = shop.balance(); const blocked = shop.blocked();
    const priceLine = `<p class="weapon-shop-price">售价 <b>${formatCurrency(price)}</b> 通用币 · 当前持有 ${balance === undefined ? '—' : formatCurrency(balance)}</p>`;
    if (purchase?.id === w.id && purchase.state === 'buying') return `${priceLine}<button class="primary-action" type="button" disabled>购买中…</button>`;
    if (purchase?.id === w.id) return `${priceLine}<div class="weapon-shop-confirm"><button class="primary-action" type="button" data-picker-buy-confirm="${escapeHtml(w.id)}">确认花费 ${formatCurrency(price)} 通用币</button><button class="secondary" type="button" data-picker-buy-cancel>取消</button></div>`;
    const reason = blocked ?? (balance === undefined ? '读取不到通用币' : balance < price ? '通用币不足' : undefined);
    return `${priceLine}<button class="primary-action" type="button" data-picker-buy="${escapeHtml(w.id)}"${reason ? ' disabled' : ''}>${reason ? escapeHtml(reason) : `购买（${formatCurrency(price)} 通用币）`}</button>`;
  }
  function detail(w: WeaponDef): string {
    let description = descriptions.get(w.id);
    if (description === undefined) { description = partyWeaponDescription(w.id); descriptions.set(w.id, description); }
    const spell = renderSpell(escapeHtml(abilityDisplayText(description, options.magic)), options.magic, { interactive: false }).html;
    const issues = partyWeaponEconomyIssues(w.id);
    const tags = [weaponTypeZh(w.weaponType), rarityMetaByKey(w.rarity).label].filter(Boolean).map(t => `<span class="detail-tag">${escapeHtml(t)}</span>`).join('');
    const owned = shop.owned(w.id);
    const isCurrent = w.id === current && owned;
    const action = issues.length ? `<button class="primary-action" type="button" disabled>暂未开放：${escapeHtml(issues.join('、'))}</button>`
      : owned ? `<button class="primary-action" type="button" data-picker-choose="${escapeHtml(w.id)}"${isCurrent ? ' disabled' : ''}>${isCurrent ? '当前主手武器' : w.id === STARTER_WEAPON ? '使用默认武器' : '登记为主手武器'}</button>`
      : buyAction(w);
    const message = notice ? `<p class="weapon-shop-notice" role="status">${escapeHtml(notice)}</p>` : '';
    return `<div class="weapon-detail-veil" data-picker-veil>
      <section class="weapon-detail-sheet" style="${rarityStyle(w.rarity)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(w.name)}武器详情">
        <header class="weapon-detail-sheet-head"><div><b>武器详情</b></div>
          <button class="weapon-detail-close" type="button" data-picker-detail-close aria-label="关闭武器详情" title="关闭"><span data-icon="close"></span></button></header>
        <aside class="weapon-detail" aria-label="武器详情"><div class="detail-scroll"><div class="detail-overview">
          <div class="detail-visual"><div class="detail-art" style="${rarityStyle(w.rarity)}">${art(w, true)}</div></div>
          <div class="detail-identity">
            <div class="detail-title-row"><div><h2 class="detail-title">${escapeHtml(w.name)}</h2><div class="detail-tags">${tags}</div></div>
              <div class="detail-mana">${mana(w)}<span><small>法力值消耗</small><b>${w.manaCost}</b></span></div></div>
            <section class="detail-spell"><div class="detail-section-heading"><span data-icon="sparkles"></span><div>${w.spellName && w.spellName !== w.name ? `<small>武器技能</small><h3>${escapeHtml(w.spellName)}</h3>` : '<h3>武器技能</h3>'}</div></div>
              <p class="detail-copy">${spell || '暂无可用法术文本。'}</p></section>
          </div>
        </div></div><div class="detail-actions">${message}${action}</div></aside>
      </section>
    </div>`;
  }
  function render(focusSearch = false): void {
    if (closed) return;
    const rows = list(); const size = pageSize(win.innerWidth);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    page = Math.min(pages, Math.max(1, page));
    const from = rows.length ? (page - 1) * size + 1 : 0, to = Math.min(rows.length, page * size);
    const chosen = selected ? pickerWeapons().find(w => w.id === selected) : undefined;
    const position = (overlay.querySelector<HTMLInputElement>('[data-picker-search]'))?.selectionStart ?? filters.query.length;
    overlay.innerHTML = `<div class="weapons-screen">
      <header class="weapons-heading"><div><h1>选择主手武器</h1><p>登记到：${escapeHtml(options.equipmentName)}</p></div>
        <button class="weapon-detail-close" type="button" data-picker-close aria-label="关闭武器选择" title="关闭"><span data-icon="close"></span></button></header>
      <section class="weapons-content">${toolbar(rows.length)}
        <div class="weapons-workspace"><div class="weapons-list" role="listbox" aria-label="武器列表">${rows.length ? rows.slice(from - 1, to).map(card).join('')
          : '<div class="empty-state"><strong>没有符合条件的武器</strong><span>当前筛选没有结果。</span><button type="button" data-picker-clear>清除筛选</button></div>'}</div>
          <nav class="weapons-pagination" aria-label="武器分页"><span class="weapons-page-total">${from}-${to} / ${rows.length}</span>
            <div class="weapons-page-actions"><button type="button" data-picker-page="prev" aria-label="上一页" title="上一页"${page <= 1 ? ' disabled' : ''}><span data-icon="arrow"></span></button>
              <b>第 ${page} / ${pages} 页</b><button class="is-next" type="button" data-picker-page="next" aria-label="下一页" title="下一页"${page >= pages ? ' disabled' : ''}><span data-icon="arrow"></span></button></div></nav>
        </div></section>
      ${chosen ? detail(chosen) : ''}</div>`;
    mountIcons(overlay);
    if (focusSearch) { const input = overlay.querySelector<HTMLInputElement>('[data-picker-search]')!; input.focus(); input.setSelectionRange(position, position); }
    else if (chosen) overlay.querySelector<HTMLElement>('[data-picker-detail-close]')?.focus();
  }
  function close(): void {
    if (closed) return; closed = true;
    if (overlay.open) overlay.close();
    overlay.remove(); win.removeEventListener('resize', onResize);
    if (previous?.isConnected) previous.focus();
  }
  // Escape fires "cancel" on a modal dialog: close the detail first, then the picker.
  overlay.addEventListener('cancel', event => {
    event.preventDefault();
    if (purchase?.state === 'buying') return;
    if (selected) { selected = null; purchase = undefined; notice = ''; render(); } else close();
  });
  function onResize(): void { render(); }
  overlay.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-picker-close]')) { close(); return; }
    if (target.closest('[data-picker-detail-close]') || target.matches('[data-picker-veil]')) {
      if (purchase?.state === 'buying') return;
      selected = null; purchase = undefined; notice = ''; render(); return;
    }
    const buy = target.closest<HTMLButtonElement>('[data-picker-buy]');
    if (buy && !buy.disabled) { purchase = { id: buy.dataset.pickerBuy!, state: 'confirm' }; notice = ''; render(); return; }
    if (target.closest('[data-picker-buy-cancel]')) { purchase = undefined; render(); return; }
    const confirm = target.closest<HTMLElement>('[data-picker-buy-confirm]');
    if (confirm && purchase?.state === 'confirm') {
      const id = confirm.dataset.pickerBuyConfirm!; purchase = { id, state: 'buying' }; render();
      shop.purchase(id).then(() => { notice = '购买成功，可以登记为主手武器。'; }, (error: unknown) => { notice = error instanceof Error ? error.message : String(error); })
        .finally(() => { purchase = undefined; render(); });
      return;
    }
    const choose = target.closest<HTMLElement>('[data-picker-choose]');
    if (choose) { const id = choose.dataset.pickerChoose!; close(); options.onPick(id === STARTER_WEAPON ? '' : id); return; }
    if (target.closest('[data-picker-clear]')) { Object.assign(filters, { query: '', rarity: '', type: '', color: '', ownership: '', sort: 'default' }); page = 1; render(); return; }
    const pager = target.closest<HTMLButtonElement>('[data-picker-page]');
    if (pager && !pager.disabled) { page += pager.dataset.pickerPage === 'next' ? 1 : -1; render(); return; }
    const weapon = target.closest<HTMLElement>('[data-picker-weapon]');
    if (weapon) { selected = weapon.dataset.pickerWeapon!; purchase = undefined; notice = ''; render(); }
  });
  // IME (e.g. Chinese pinyin): re-rendering replaces the input and breaks the composition, so
  // search with the committed text at compositionend instead.
  const search = (input: HTMLInputElement) => { filters.query = input.value; page = 1; render(true); };
  overlay.addEventListener('input', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-picker-search]');
    if (input && !(event as InputEvent).isComposing) search(input);
  });
  overlay.addEventListener('compositionend', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-picker-search]');
    if (input && input.value !== filters.query) search(input);
  });
  overlay.addEventListener('change', event => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-picker-filter]');
    if (select) { (filters as unknown as Record<string, string>)[select.dataset.pickerFilter!] = select.value; if (select.dataset.pickerFilter === 'sort' && !select.value) filters.sort = 'default'; page = 1; render(); }
  });
  win.addEventListener('resize', onResize);
  // Open on the page that holds the current weapon.
  const index = list().findIndex(w => w.id === current);
  page = index < 0 ? 1 : Math.floor(index / pageSize(win.innerWidth)) + 1;
  options.root.append(overlay); overlay.showModal(); render(true);
  return close;
}
