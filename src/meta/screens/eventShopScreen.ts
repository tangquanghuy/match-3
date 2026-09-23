/**
 * 活动商店独立屏。
 *
 * 路由：#shop/<typeId>（六个 EventTypeId）；裸 #shop 由外壳回退到入侵周。
 * 货架只读 `eventShopOf`，成交仍交给 gateway，屏层不直接改存档。
 */
import { isFailure, weekStartOf } from '../gateway';
import { EVENT_ROTATION, WEEK_MS, type EventGoods, type EventTypeId } from '../data/events';
import { INGOT_NAMES, parseStoneKey, stoneName, type IngotKey } from '../data/materials';
import { eventShopOf, type EventShopRow } from '../systems/events';
import { bottomNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { ingotArt, materialImg, scrollArt, stoneMarkupForKey } from '../shell/materialArt';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';

const TYPE_IDS: readonly EventTypeId[] = EVENT_ROTATION.map((type) => type.id);
export const DEFAULT_EVENT_SHOP_TYPE: EventTypeId = 'invasion';

function parseTypeId(param: string | undefined): EventTypeId {
  return TYPE_IDS.includes(param as EventTypeId) ? (param as EventTypeId) : DEFAULT_EVENT_SHOP_TYPE;
}

function fmt(value: number): string {
  return value.toLocaleString('en-US');
}

function remainingLabel(now: number, weekStart: number): string {
  const totalHours = Math.max(0, Math.ceil((weekStart + WEEK_MS - now) / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时`;
}

function cleanName(name: string): string {
  return name.replace(/\s*[×x]\s*\d+\s*$/, '').trim();
}

type RewardKind = 'gold' | 'souls' | 'gems' | 'goldKeys' | 'glory' | 'ingot' | 'scroll' | 'stone';

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

function rewardEntries(goods: EventGoods, save?: Pick<MetaSave, 'currencies' | 'materials'>): RewardEntry[] {
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
  return entries;
}

function rewardText(goods: EventGoods): string {
  return rewardEntries(goods)
    .map((entry) => `${entry.label} ×${entry.amount}`)
    .join(' · ');
}

function rewardIcon(entry: RewardEntry): string {
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
    .map((entry) => `<span class="shop-reward ${entry.kind}" aria-label="${entry.label} ${entry.amount}，${soldOut ? `当前持有 ${fmt(entry.owned)}` : `持有 ${fmt(entry.owned)}，兑换后 ${fmt(entry.owned + entry.amount)}`}">${rewardIcon(entry)}<span class="shop-reward-copy"><b>×${fmt(entry.amount)}</b>${entries.length > 1 || entry.label !== cleanName(goods.name) ? `<small>${entry.label}</small>` : ''}<em>${soldOut ? `当前持有 ${fmt(entry.owned)}` : `持有 ${fmt(entry.owned)} → ${fmt(entry.owned + entry.amount)}`}</em></span></span>`)
    .join('');
}

function goodsSymbol(goods: EventGoods): string {
  const entry = rewardEntries(goods)[0];
  return entry ? rewardIcon(entry) : '<span class="shop-reward-icon" data-icon="chest"></span>';
}

function goodsTone(goods: EventGoods): string {
  const entry = rewardEntries(goods)[0];
  if (entry?.kind === 'stone') {
    const key = parseStoneKey(entry.key)?.colorKey;
    return key ? STONE_COLOR[key] ?? '#b8e1ee' : '#b8e1ee';
  }
  if (entry?.kind === 'ingot') return INGOT_COLOR[entry.key] ?? '#c4c4c4';
  if (entry?.kind === 'scroll') return '#bd9ce0';
  return entry?.kind === 'souls' ? '#a68cc9' : entry?.kind === 'gems' ? '#69bcdb' : '#e2bf75';
}

function earnedTokens(week: ReturnType<typeof eventShopOf>['week'], rows: readonly EventShopRow[]): number {
  const spent = rows.reduce((sum, row) => sum + row.goods.cost * (week.bought[row.goods.id] ?? 0), 0);
  return Math.max(week.tokensEarned ?? 0, week.tokens + spent);
}

function tokenProgressHtml(tokens: number, earned: number, finiteCost: number, tokenName: string): string {
  const clearCost = Math.max(0, finiteCost);
  const missing = Math.max(0, clearCost - tokens);
  const approxWins = missing > 0 ? Math.ceil(missing / 12) : 0;
  const pct = clearCost > 0 ? Math.min(100, (tokens / clearCost) * 100) : 100;
  return `
    <section class="shop-token-bar" aria-label="${tokenName}余额 ${fmt(tokens)}">
      <div class="shop-token-identity"><span class="shop-token-orb" data-icon="coin"></span><div><small>当前余额</small><b>${tokenName}</b></div><strong>${fmt(tokens)}</strong></div>
      <div class="shop-token-detail"><span>每胜 <b>3~12</b> 枚</span><span>本周已赚 <b>${fmt(earned)}</b></span><span>周一 0:00 <b>清零</b></span></div>
      <div class="shop-token-target"><div class="shop-token-progress" role="progressbar" aria-label="限量货兑换所需代币进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div><span>${missing > 0 ? `清空限量货还差 ${fmt(missing)} 枚 · 至少 ${approxWins} 场胜利` : finiteCost === 0 ? '本周限量货已兑换完毕' : '余额足够兑换剩余限量货'}</span></div>
    </section>`;
}

function goodsCard(row: EventShopRow, save: MetaSave, tokens: number, featured: boolean): string {
  const goods = row.goods;
  const soldOut = row.stockLeft !== null && row.stockLeft <= 0;
  const poor = !soldOut && tokens < goods.cost;
  const state = soldOut ? ' sold-out' : poor ? ' poor' : ' ready';
  const stock = row.stockLeft === null ? '不限量' : soldOut ? '本周已售罄' : `本周剩 ${row.stockLeft} / ${goods.stock}`;
  const action = soldOut
    ? '<button class="shop-buy is-sold" type="button" disabled>周一补货</button>'
    : poor
      ? `<button class="shop-buy is-poor" type="button" data-action="battle" data-missing="${goods.cost - tokens}" aria-label="${cleanName(goods.name)}还差 ${goods.cost - tokens} 枚，前往活动出战">还差 ${goods.cost - tokens} 枚 · 去出战 <span data-icon="swords"></span></button>`
      : `<button class="shop-buy" type="button" data-buy="${goods.id}" aria-label="花费 ${goods.cost} 枚代币兑换${cleanName(goods.name)}"><span data-icon="bag"></span>兑换</button>`;
  return `
    <article class="shop-goods${state}${featured ? ' featured' : ''}" data-goods-card="${goods.id}" style="--goods-tone:${goodsTone(goods)}">
      <div class="shop-goods-art" aria-hidden="true"><div class="shop-goods-symbol">${goodsSymbol(goods)}</div>${featured ? '<b>每周优选</b>' : ''}</div>
      <div class="shop-goods-body"><div class="shop-goods-title"><h3>${cleanName(goods.name)}</h3><span class="shop-stock">${stock}</span></div>
        ${goods.blurb ? `<p class="shop-goods-blurb">${goods.blurb}</p>` : ''}
        <div class="shop-rewards">${rewardHtml(goods, save, soldOut)}</div>
        <div class="shop-goods-foot"><span class="shop-price"><i data-icon="coin"></i><b>${goods.cost}</b><small>代币</small></span>${action}</div>
      </div>
    </article>`;
}

export class EventShopScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx, param?: string): string {
    const typeId = parseTypeId(param);
    const now = Date.now();
    const weekStart = weekStartOf(now);
    const save = ctx.save();
    const shop = eventShopOf(save, weekStart, typeId);
    const def = shop.theme.type;
    const featuredRow = shop.rows.find((row) => row.goods.stock === 1) ?? [...shop.rows].sort((a, b) => b.goods.cost - a.goods.cost)[0];
    const regularRows = shop.rows.filter((row) => row !== featuredRow);
    const finiteCost = shop.rows.reduce((sum, row) => sum + (row.stockLeft === null ? 0 : row.stockLeft * row.goods.cost), 0);
    const earned = earnedTokens(shop.week, shop.rows);
    const tabs = EVENT_ROTATION.map((tab) => {
      const tabShop = eventShopOf(save, weekStart, tab.id);
      const active = tab.id === typeId;
      return `<a class="shop-tab${active ? ' active' : ''}" href="#shop/${tab.id}" style="--shop-accent:${tab.accent}"${active ? ' aria-current="page"' : ''}><span>${tab.shortName}</span><b><i data-icon="coin"></i>${fmt(tabShop.week.tokens)}</b></a>`;
    }).join('');
    return `
      ${topbarHtml()}
      <div class="screen event-shop-screen">
        <section class="panel event-shop-panel" style="--shop-accent:${def.accent}">
          <header class="shop-page-head"><a class="shop-back" href="#events/${typeId}"><span data-icon="arrow"></span>返回${def.name}</a><div><small>活动兑换</small><h1>${def.name}<span>商店</span></h1></div><span class="shop-reset"><span data-icon="time"></span>距限量货补货 ${remainingLabel(now, weekStart)}</span></header>
          <nav class="shop-tabs" aria-label="活动商店页签">${tabs}</nav>
          ${tokenProgressHtml(shop.week.tokens, earned, finiteCost, def.tokenName)}
          <section class="shop-shelf">
            <div class="shop-section-head"><div><small>01 / 限量优选</small><h2>本周招牌</h2></div><span>优先兑换 · 售完待下周补货</span></div>
            ${featuredRow ? goodsCard(featuredRow, save, shop.week.tokens, true) : '<p class="shop-empty">本周暂无货架</p>'}
          </section>
          <section class="shop-shelf regular"><div class="shop-section-head"><div><small>02 / 兑换货架</small><h2>全部货品</h2></div><span>${def.tokenName}仅可在本店使用</span></div><div class="shop-grid shop-grid-${regularRows.length}">${regularRows.map((row) => goodsCard(row, save, shop.week.tokens, false)).join('')}</div></section>
          <footer class="shop-footnote"><span data-icon="time"></span><span>活动代币周一 0:00 清零，各商店余额独立，不可互换。</span></footer>
        </section>
      </div>
      ${bottomNavHtml('', '六活动钱包独立')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.on(document, 'click', (event) => {
      const target = event.target as HTMLElement;
      const buy = target.closest<HTMLElement>('[data-buy]');
      const action = target.closest<HTMLElement>('[data-action="battle"]');
      if (action) {
        const typeId = parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0] || undefined);
        ctx.navigate(`#events/${typeId}`);
        void ctx.launchEventBattle();
        return;
      }
      if (!buy) return;
      const goodsId = buy.dataset.buy;
      if (!goodsId) return;
      const typeId = parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0] || undefined);
      const now = Date.now();
      const before = eventShopOf(ctx.save(), weekStartOf(now), typeId).rows.find((row) => row.goods.id === goodsId)?.goods;
      if (!before) return;
      void ctx.gateway.buyEventGoods(goodsId, now, weekStartOf(now), typeId).then(({ result }) => {
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        ctx.refresh();
        const message = `已购入 ${cleanName(before.name)} · ${rewardText(before)} · 代币余额 ${result.tokensLeft}`;
        setTimeout(() => toast(message), 0);
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

export { parseTypeId as parseEventShopTypeId };
