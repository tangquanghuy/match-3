/**
 * 活动商店独立屏。
 *
 * 路由：#shop/<typeId>（六个 EventTypeId）；裸 #shop 由外壳回退到入侵周。
 * 货架只读 `eventShopOf`，成交仍交给 gateway，屏层不直接改存档。
 */
import { isFailure, weekStartOf, gameNow } from '../gateway';
import { EVENT_ROTATION, EVENT_WEEKLY_RULES, type EventGoods, type EventTypeId } from '../data/events';
import { INGOT_NAMES, parseStoneKey, stoneName, type IngotKey } from '../data/materials';
import { RARITY_NAMES } from '../data/rarity';
import { getTroopById } from '../../data/troops';
import { troopImg } from './teamScreen';
import { eventShopPeriodOf } from '../systems/eventShopClock';
import { eventShopOf, eventsUnlocked, type EventShopRow } from '../systems/events';
import { eventsLockPanelHtml } from './eventsLock';
import { bottomNavHtml, shopNavHtml, mountIcons, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { ingotArt, materialImg, scrollArt, stoneMarkupForKey } from '../shell/materialArt';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';
import { cssUrlVar, shopArt } from '../shell/artAssets';

const TYPE_IDS: readonly EventTypeId[] = EVENT_ROTATION.map((type) => type.id);
export const DEFAULT_EVENT_SHOP_TYPE: EventTypeId = 'invasion';

function parseTypeId(param: string | undefined): EventTypeId {
  return TYPE_IDS.includes(param as EventTypeId) ? (param as EventTypeId) : DEFAULT_EVENT_SHOP_TYPE;
}

function fmt(value: number): string {
  return value.toLocaleString('en-US');
}

function remainingLabel(now: number, end: number): string {
  const minutes = Math.max(1, Math.ceil((end - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}小时${minutes % 60 ? ` ${minutes % 60}分` : ''}` : `${minutes}分钟`;
}

function cleanName(name: string): string {
  return name.replace(/\s*[×x]\s*\d+\s*$/, '').trim();
}

type RewardKind = 'gold' | 'souls' | 'gems' | 'goldKeys' | 'glory' | 'ingot' | 'scroll' | 'stone' | 'troop' | 'classXp';

interface RewardEntry {
  kind: RewardKind;
  key: string;
  label: string;
  amount: number;
  owned: number;
}

const CURRENCY_META: Record<'gold' | 'souls' | 'gems' | 'goldKeys' | 'glory', { label: string; icon: string; className: string }> = {
  gold: { label: '黄金', icon: 'coin', className: 'gold' },
  souls: { label: '灵魂', icon: 'soul', className: 'souls' },
  gems: { label: '宝石', icon: 'crystal', className: 'gems' },
  goldKeys: { label: '金钥匙', icon: 'key', className: 'keys' },
  glory: { label: '荣耀', icon: 'swords', className: 'glory' },
};

const STONE_COLOR: Record<string, string> = {
  blue: '#4f9fe0', green: '#57c06b', red: '#e8555e', yellow: '#e8c24a', purple: '#a074d4', brown: '#c0823f',
};

const INGOT_COLOR: Record<string, string> = {
  common: '#aab2ad', uncommon: '#4caf6a', rare: '#9a4fd4', ultraRare: '#ffe24a', epic: '#c56b2d', legendary: '#56d8ff', mythic: '#f1a1ff',
};

function rewardEntries(goods: EventGoods, save?: MetaSave): RewardEntry[] {
  const currencies = save?.currencies ?? { gold: 0, souls: 0, gems: 0, goldKeys: 0, glory: 0 };
  const materials = save?.materials ?? { ingots: {}, forgeScrolls: 0, traitstones: {}, treasureMaps: 0 };
  const entries: RewardEntry[] = [];
  for (const key of ['gold', 'souls', 'gems', 'goldKeys', 'glory'] as const) {
    const amount = goods[key] ?? 0;
    if (amount > 0) entries.push({ kind: key, key, label: CURRENCY_META[key].label, amount, owned: currencies[key] });
  }
  for (const [key, amount] of Object.entries(goods.mats?.ingots ?? {})) {
    if ((amount ?? 0) > 0) entries.push({ kind: 'ingot', key, label: INGOT_NAMES[key as IngotKey] ?? key, amount: amount!, owned: materials.ingots[key] ?? 0 });
  }
  if ((goods.mats?.forgeScrolls ?? 0) > 0) {
    entries.push({ kind: 'scroll', key: 'forgeScrolls', label: '熔铸符卷', amount: goods.mats!.forgeScrolls!, owned: materials.forgeScrolls });
  }
  for (const [key, amount] of Object.entries(goods.mats?.traitstones ?? {})) {
    if ((amount ?? 0) > 0) entries.push({ kind: 'stone', key, label: stoneName(key), amount: amount!, owned: materials.traitstones[key] ?? 0 });
  }
  if (goods.troopId) {
    const troop = getTroopById(goods.troopId);
    if (troop) entries.push({ kind: 'troop', key: String(troop.id), label: troop.name, amount: 1, owned: save?.collection[String(troop.id)] ? save.collection[String(troop.id)]!.copies + 1 : 0 });
  }
  if (goods.classXp) entries.push({ kind: 'classXp', key: 'classXp', label: '职业经验', amount: goods.classXp, owned: 0 });
  return entries;
}

function rewardText(goods: EventGoods): string {
  return rewardEntries(goods)
    .map((entry) => `${entry.label} ×${entry.amount}`)
    .join(' · ');
}

function rewardIcon(entry: RewardEntry): string {
  if (entry.kind === 'troop') return `<span class="shop-reward-icon troop" aria-hidden="true">${troopImg(getTroopById(Number(entry.key)) ?? null, false, 'alt=""')}</span>`;
  if (entry.kind === 'classXp') return '<span class="shop-reward-icon class-xp" data-icon="book"></span>';
  if (entry.kind in CURRENCY_META) {
    const meta = CURRENCY_META[entry.kind as keyof typeof CURRENCY_META];
    return `<span class="shop-reward-icon currency ${meta.className}" data-icon="${meta.icon}"></span>`;
  }
  if (entry.kind === 'stone') {
    return `<span class="shop-reward-icon stone" aria-hidden="true">${stoneMarkupForKey(entry.key)}</span>`;
  }
  if (entry.kind === 'ingot') {
    return `<span class="shop-reward-icon ingot" aria-hidden="true">${materialImg(ingotArt(entry.key))}</span>`;
  }
  return `<span class="shop-reward-icon scroll" aria-hidden="true">${materialImg(scrollArt())}</span>`;
}

function rewardHtml(goods: EventGoods, save: MetaSave, soldOut: boolean): string {
  const entries = rewardEntries(goods, save);
  return entries
    .map((entry) => {
      const owned = entry.kind === 'classXp' ? '当前装备职业' : soldOut ? `当前持有 ${fmt(entry.owned)}` : `持有 ${fmt(entry.owned)} → ${fmt(entry.owned + entry.amount)}`;
      return `<span class="shop-reward ${entry.kind}" aria-label="${entry.label} ${entry.amount}，${owned}">${rewardIcon(entry)}<span class="shop-reward-copy"><b>×${fmt(entry.amount)}</b>${entries.length > 1 || entry.label !== cleanName(goods.name) ? `<small>${entry.label}</small>` : ''}<em>${owned}</em></span></span>`;
    })
    .join('');
}

function goodsSymbol(goods: EventGoods): string {
  const entry = rewardEntries(goods)[0];
  return entry ? rewardIcon(entry) : '<span class="shop-reward-icon" data-icon="chest"></span>';
}

function goodsTone(goods: EventGoods): string {
  const entry = rewardEntries(goods)[0];
  if (entry?.kind === 'troop') return '#d4af74';
  if (entry?.kind === 'classXp') return '#a58ac6';
  if (entry?.kind === 'stone') {
    const key = parseStoneKey(entry.key)?.colorKey;
    return key ? STONE_COLOR[key] ?? '#b8e1ee' : '#b8e1ee';
  }
  if (entry?.kind === 'ingot') return INGOT_COLOR[entry.key] ?? '#c4c4c4';
  if (entry?.kind === 'scroll') return '#bd9ce0';
  return entry?.kind === 'souls' ? '#a68cc9' : entry?.kind === 'gems' ? '#69bcdb' : '#e2bf75';
}

function tokenBalanceHtml(tokens: number, tokenName: string): string {
  return `<div class="shop-token-bar" aria-label="${tokenName}余额 ${fmt(tokens)}，周一清零"><span class="shop-token-orb" data-icon="mark"></span><b>${tokenName}</b><strong>${fmt(tokens)}</strong><small>周一清零</small></div>`;
}

const SHOP_CATEGORIES = [
  { id: 'all', name: '全部', icon: 'bag' },
  { id: 'troop', name: '角色', icon: 'helmet' },
  { id: 'forge', name: '锻造', icon: 'swords' },
  { id: 'trait', name: '特质', icon: 'crystal' },
  { id: 'growth', name: '补给', icon: 'chest' },
] as const;
type ShopCategory = typeof SHOP_CATEGORIES[number]['id'];
function goodsCategory(goods: EventGoods): ShopCategory {
  if (goods.troopId) return 'troop';
  if (goods.mats?.ingots || goods.mats?.forgeScrolls) return 'forge';
  if (goods.mats?.traitstones) return 'trait';
  return 'growth';
}
function troopLink(goods: EventGoods, type: EventTypeId): string {
  return goods.troopId ? `<a class="shop-atlas-link" data-shop-troop="${goods.id}" href="#troop/${goods.troopId}/shop/${type}"><span data-icon="book"></span>查看图鉴 <span aria-hidden="true">↗</span></a>` : '';
}

function goodsCard(row: EventShopRow, save: MetaSave, tokens: number, featured: boolean, capped: boolean, type: EventTypeId, filter: ShopCategory): string {
  const goods = row.goods;
  const entries = rewardEntries(goods, save);
  const category = SHOP_CATEGORIES.find(item => item.id === goodsCategory(goods))!;
  const troop = goods.troopId ? getTroopById(goods.troopId) : undefined;
  const soldOut = row.stockLeft !== null && row.stockLeft <= 0;
  const poor = !soldOut && tokens < goods.cost;
  const needsClass = !!goods.classXp && (!save.hero.classId || !save.hero.unlockedClasses.includes(save.hero.classId) || (save.hero.classLevels[save.hero.classId] ?? 0) < 1);
  const state = soldOut ? ' sold-out' : needsClass || poor ? ' poor' : ' ready';
  const stock = row.stockLeft === null ? '' : soldOut ? '已售罄' : `本期剩 ${row.stockLeft}`;
  const action = soldOut
    ? '<button class="shop-buy is-sold" type="button" disabled>待补货</button>'
    : needsClass
      ? '<button class="shop-buy is-poor" type="button" data-action="class">先装备职业</button>'
    : poor && capped
      ? '<button class="shop-buy is-sold" type="button" disabled>已领满</button>'
    : poor
      ? `<button class="shop-buy is-poor" type="button" data-action="battle" data-missing="${goods.cost - tokens}" aria-label="${cleanName(goods.name)}还差 ${goods.cost - tokens} 枚印记，前往活动出战">获取印记</button>`
      : `<button class="shop-buy" type="button" data-buy="${goods.id}" aria-label="花费 ${goods.cost} 枚印记兑换${cleanName(goods.name)}"><span data-icon="bag"></span>兑换</button>`;
  return `
    <article class="shop-goods${state}${featured ? ' featured' : ''}" data-goods-card="${goods.id}" data-category="${category.id}" ${filter!=='all'&&filter!==category.id?'hidden':''} style="--goods-tone:${goodsTone(goods)}">
      <button class="shop-goods-art" type="button" data-inspect="${goods.id}" aria-label="查看${cleanName(goods.name)}详情"><span class="shop-goods-symbol">${goodsSymbol(goods)}</span><span class="shop-kind"><span data-icon="${category.icon}"></span>${category.name}</span>${featured ? '<b>本期精选</b>' : ''}</button>
      <div class="shop-goods-body"><div class="shop-goods-title"><h3><button type="button" data-inspect="${goods.id}">${cleanName(goods.name)}</button></h3><span class="shop-stock">${stock}</span></div>
        ${troop?`<p class="shop-troop-meta">${RARITY_NAMES[troop.rarityIdx]} · ${troop.kingdom ?? '无王国'}</p>${troopLink(goods,type)}`:`<div class="shop-rewards">${entries.map(entry=>`<span class="shop-reward ${entry.kind}">${rewardIcon(entry)}<span class="shop-reward-copy"><small>${entry.label}</small><b>×${fmt(entry.amount)}</b></span></span>`).join('')}</div>`}
        <div class="shop-goods-foot"><span class="shop-price"><i data-icon="mark"></i><b>${goods.cost}</b><small>印记</small></span>${action}</div>
      </div>
    </article>`;
}

export class EventShopScreen implements Screen {
  private displayedPeriod = 0;
  private displayedWeek = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private filters = new Map<EventTypeId, ShopCategory>();
  private scrollPositions = new Map<EventTypeId, number>();
  private returnGoods = new Map<EventTypeId, string>();
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, boolean]> = [];

  html(ctx: ShellCtx, param?: string): string {
    const typeId = parseTypeId(param);
    const filter = this.filters.get(typeId) ?? 'all';
    const now = gameNow();
    const weekStart = weekStartOf(now);
    const save = ctx.save();
    if (!eventsUnlocked(save)) {
      this.displayedPeriod = eventShopPeriodOf(now).start;
      this.displayedWeek = weekStart;
      return `${topbarHtml()}
      <div class="screen event-shop-screen">
        <section class="panel event-shop-panel shop-v2 shop-v3 shop-locked">
          <header class="shop-page-head"><h1>商店</h1>${shopNavHtml('events')}</header>
          ${eventsLockPanelHtml(save, 'h2')}
        </section>
      </div>${bottomNavHtml('商店')}${toastHtml()}`;
    }
    const shop = eventShopOf(save, weekStart, typeId, now);
    this.displayedPeriod = shop.period.start;
    this.displayedWeek = weekStart;
    const def = shop.theme.type;
    const featuredRow = shop.rows.find((row) => row.goods.stock === 1) ?? [...shop.rows].sort((a, b) => b.goods.cost - a.goods.cost)[0];
    const surplus = shop.rows.find(row => row.goods.id.endsWith('_surplus'));
    const regularRows = shop.rows.filter((row) => row !== featuredRow && row !== surplus);
    const capped = shop.week.tokensEarned >= EVENT_WEEKLY_RULES.tokenCap;
    const tabs = EVENT_ROTATION.map((tab) => {
      const tabShop = eventShopOf(save, weekStart, tab.id, now);
      const active = tab.id === typeId;
      return `<a class="shop-tab${active ? ' active' : ''}" href="#shop/${tab.id}" style='--shop-accent:${tab.accent};${cssUrlVar('tab-art', shopArt(`event-${tab.id}`))}'${active ? ' aria-current="page"' : ''}><span>${tab.shortName}</span><b><i data-icon="mark"></i>${fmt(tabShop.week.tokens)}</b></a>`;
    }).join('');
    return `
      ${topbarHtml()}
      <div class="screen event-shop-screen">
        <section class="panel event-shop-panel shop-v2 shop-v3" style='--shop-accent:${def.accent};${cssUrlVar('shop-hero', shopArt(`event-${typeId}`))}'>
          <header class="shop-page-head"><h1>商店</h1>${shopNavHtml('events')}</header>
          <nav class="shop-tabs" aria-label="活动商店页签">${tabs}</nav><label class="shop-mobile-picker"><span>活动兑换</span><select id="shopTypePicker" aria-label="选择活动商店">${EVENT_ROTATION.map(t=>`<option value="${t.id}" ${t.id===typeId?'selected':''}>${t.name}</option>`).join('')}</select></label>
          <div class="shop-hero">
            <div class="shop-hero-copy"><h2>${def.name}</h2><p>${def.brief}</p></div>
            <div class="shop-hero-side">
              <div class="shop-page-meta">${tokenBalanceHtml(shop.week.tokens, def.tokenName)}<span class="shop-reset"><span data-icon="time"></span><span id="shopRefreshLabel">${remainingLabel(now, shop.period.end)}后刷新</span></span></div>
              <a class="shop-earn-link" href="#events/${typeId}">前往活动 <span aria-hidden="true">→</span></a>
            </div>
          </div>
          <section class="shop-catalog"><div class="shop-section-head"><div><h2>本期货架</h2><span class="shop-catalog-count">${shop.rows.length-1} 款</span></div></div>
            <nav class="shop-categories" aria-label="商品分类">${SHOP_CATEGORIES.filter(category=>category.id==='all'||shop.rows.some(row=>row!==surplus&&goodsCategory(row.goods)===category.id)).map(category=>`<button type="button" data-shop-category="${category.id}" aria-pressed="${filter===category.id}"><span data-icon="${category.icon}"></span>${category.name}<span class="shop-category-count">${shop.rows.filter(row=>row!==surplus&&(category.id==='all'||goodsCategory(row.goods)===category.id)).length}</span></button>`).join('')}</nav>
            <div class="shop-grid">${[...(featuredRow?[featuredRow]:[]),...regularRows].map(row=>goodsCard(row, save, shop.week.tokens, row===featuredRow, capped, typeId, filter)).join('')}</div>
          </section>
          <footer class="shop-week-budget"><button class="shop-details-link" type="button" data-shop-rules>兑换说明 ↗</button>
            ${surplus ? `<span class="shop-surplus">${surplus.goods.cost} 印记 → ${surplus.goods.gold} 黄金 <button class="shop-buy" type="button" data-buy="${surplus.goods.id}" ${shop.week.tokens < surplus.goods.cost ? 'disabled' : ''}>兑换</button></span>` : ''}
          </footer>
        </section>
      </div>
      <dialog class="shop-item-dialog" id="shopItemDialog" aria-labelledby="shopItemTitle"><header><h2 id="shopItemTitle">物品详情</h2><button type="button" data-close-item aria-label="关闭物品详情">×</button></header><div id="shopItemContent"></div><footer><button type="button" data-close-item>返回货架</button></footer></dialog>
      ${bottomNavHtml('商店')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    const currentShop = parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0]);
    const panel = document.querySelector<HTMLElement>('.event-shop-panel')!;
    panel.scrollTop = this.scrollPositions.get(currentShop) ?? 0;
    const returnId = this.returnGoods.get(currentShop);
    if (returnId) { panel.querySelector<HTMLAnchorElement>(`[data-shop-troop="${returnId}"]`)?.focus({preventScroll:true}); this.returnGoods.delete(currentShop); }
    // 离开本页时先定格滚动位置：切路由会先撤掉本页样式，面板塌缩时触发的 scroll 不能覆盖记录
    let leaving = false;
    this.on(panel, 'scroll', () => { if (!leaving) this.scrollPositions.set(currentShop, panel.scrollTop); });
    this.on(document, 'click', (event) => {
      if (!(event.target as HTMLElement).closest('a[href^="#"], [data-shop-troop]')) return;
      this.scrollPositions.set(currentShop, panel.scrollTop);
      leaving = true;
    }, true);
    const picker=document.querySelector<HTMLSelectElement>('#shopTypePicker');
    if(picker)this.on(picker,'change',()=>ctx.navigate(`#shop/${picker.value}`));
    const checkRefresh = (): boolean => {
      const now = gameNow();
      const period = eventShopPeriodOf(now);
      if (period.start !== this.displayedPeriod || weekStartOf(now) !== this.displayedWeek) {
        ctx.refresh();
        return true;
      }
      const label = document.querySelector('#shopRefreshLabel');
      if (label) label.textContent = `${remainingLabel(now, period.end)}后刷新`;
      return false;
    };
    const tick = (): void => {
      if (checkRefresh()) return;
      this.refreshTimer = setTimeout(tick, Math.min(60_000, Math.max(1, eventShopPeriodOf(gameNow()).end - gameNow())));
    };
    tick();
    this.on(document, 'visibilitychange', () => { if (!document.hidden) checkRefresh(); });
    this.on(window, 'focus', () => checkRefresh());
    this.on(document, 'click', (event) => {
      const target = event.target as HTMLElement;
      // Never buy a newly rotated character through an old shelf or stale dialog.
      if (target.closest('[data-buy], [data-inspect], [data-shop-troop]') && checkRefresh()) {
        event.preventDefault();
        setTimeout(() => toast('货品已刷新，请确认新货架'), 0);
        return;
      }
      const atlas = target.closest<HTMLElement>('[data-shop-troop]');
      if (atlas) this.returnGoods.set(currentShop, atlas.dataset.shopTroop!);
      const category = target.closest<HTMLButtonElement>('[data-shop-category]');
      if (category) {
        const filter = category.dataset.shopCategory as ShopCategory;
        this.filters.set(currentShop, filter);
        panel.querySelectorAll<HTMLButtonElement>('[data-shop-category]').forEach(button => button.setAttribute('aria-pressed', String(button===category)));
        panel.querySelectorAll<HTMLElement>('[data-goods-card]').forEach(card => { card.hidden=filter!=='all'&&card.dataset.category!==filter; });
        return;
      }
      const dialog=document.querySelector<HTMLDialogElement>('#shopItemDialog')!;
      if(target.closest('[data-close-item]')){dialog.close();return;}
      const inspect=target.closest<HTMLElement>('[data-inspect]');
      if(inspect||target.closest('[data-shop-rules]')) {
        const typeId=parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0] || undefined);
        const shop=eventShopOf(ctx.save(),weekStartOf(gameNow()),typeId,gameNow());
        const row=shop.rows.find(row=>row.goods.id===inspect?.dataset.inspect);
        document.querySelector('#shopItemTitle')!.textContent=row?cleanName(row.goods.name):'兑换说明';
        document.querySelector('#shopItemContent')!.innerHTML=row
          ? `<div class="shop-detail-art" style="--goods-tone:${goodsTone(row.goods)}">${goodsSymbol(row.goods)}</div>${row.goods.blurb?`<p>${row.goods.blurb}</p>`:''}${troopLink(row.goods,typeId)}<h3>兑换所得</h3><div class="shop-rewards">${rewardHtml(row.goods,ctx.save(),row.stockLeft===0)}</div><p>${row.goods.cost} 印记${row.stockLeft!==null?` · 本期剩余 ${Math.max(0,row.stockLeft)} 件`:''}</p>`
          : `<p>参与对应活动获得印记，在此兑换奖励。</p><p>本周已获得 ${shop.week.tokensEarned} / ${EVENT_WEEKLY_RULES.tokenCap} 印记。</p><p>货品每两天刷新，限购次数同时重置；补货不消耗印记。</p><p>活动进度与印记仍在周一 0:00 重置。</p>`;
        mountIcons(dialog);dialog.showModal();return;
      }
      const buy = target.closest<HTMLElement>('[data-buy]');
      const action = target.closest<HTMLElement>('[data-action="battle"]');
      if (target.closest('[data-action="class"]')) {
        ctx.navigate('#hero');
        return;
      }
      if (action) {
        const typeId = parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0] || undefined);
        ctx.navigate(`#events/${typeId}`);
        return;
      }
      if (!buy) return;
      const goodsId = buy.dataset.buy;
      if (!goodsId) return;
      const typeId = parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0] || undefined);
      const now = ctx.gateway.now();
      const before = eventShopOf(ctx.save(), weekStartOf(now), typeId, now).rows.find((row) => row.goods.id === goodsId)?.goods;
      if (!before) return;
      void ctx.gateway.buyEventGoods(goodsId, typeId, this.displayedPeriod).then(({ result }) => {
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        ctx.refresh();
        const message = `已购入 ${cleanName(before.name)} · ${rewardText(before)} · 印记余额 ${result.tokensLeft}`;
        setTimeout(() => toast(message), 0);
      });
    });
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject, capture = false): void {
    target.addEventListener(type, fn, capture);
    this.listeners.push([target, type, fn, capture]);
  }

  dispose(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    for (const [target, type, fn, capture] of this.listeners.splice(0)) target.removeEventListener(type, fn, capture);
  }
}

export { parseTypeId as parseEventShopTypeId };
