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
  const materials = save?.materials ?? { ingots: {}, forgeScrolls: 0, traitstones: {} };
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
    const stone = parseStoneKey(entry.key);
    const color = stone?.colorKey ? STONE_COLOR[stone.colorKey] ?? '#aab2ad' : '#56d8ff';
    return `<span class="shop-reward-icon stone" style="--stone:${color}" aria-hidden="true"></span>`;
  }
  if (entry.kind === 'ingot') {
    return `<span class="shop-reward-icon ingot" style="--stone:${INGOT_COLOR[entry.key] ?? '#aab2ad'}" aria-hidden="true"></span>`;
  }
  return '<span class="shop-reward-icon scroll" data-icon="sparkles"></span>';
}

function rewardHtml(goods: EventGoods, save: MetaSave): string {
  return rewardEntries(goods, save)
    .map((entry) => `<span class="shop-reward ${entry.kind}">${rewardIcon(entry)}<b>${entry.amount}</b><small>${entry.label}</small><em>持有 ${fmt(entry.owned)} → ${fmt(entry.owned + entry.amount)}</em></span>`)
    .join('');
}

function earnedTokens(week: ReturnType<typeof eventShopOf>['week'], rows: readonly EventShopRow[]): number {
  const spent = rows.reduce((sum, row) => sum + row.goods.cost * (week.bought[row.goods.id] ?? 0), 0);
  return Math.max(week.tokensEarned ?? 0, week.tokens + spent);
}

function tokenProgressHtml(tokens: number, earned: number, finiteCost: number, accent: string): string {
  const clearCost = Math.max(0, finiteCost);
  const missing = Math.max(0, clearCost - tokens);
  const approxWins = missing > 0 ? Math.ceil(missing / 12) : 0;
  const pct = clearCost > 0 ? Math.min(100, (tokens / clearCost) * 100) : 100;
  return `
    <section class="shop-token-bar" style="--shop-accent:${accent}">
      <div class="shop-token-head"><span class="shop-token-orb" data-icon="sparkles"></span><div><small>ACTIVITY WALLET</small><b>本活动代币</b></div><strong>${fmt(tokens)}</strong><span class="shop-token-rule">每胜 3~12 枚 · 本周已赚 ${fmt(earned)} · 周一 0:00 清零</span></div>
      <div class="shop-token-progress"><i style="width:${pct}%"></i></div>
      <div class="shop-token-foot"><span>${missing > 0 ? `清空限量货还需 ${fmt(missing)} 枚，约 ${approxWins} 场胜利` : '限量货已可全部兑换'}</span><small>六活动代币独立，不可互换</small></div>
    </section>`;
}

function goodsCard(row: EventShopRow, save: MetaSave, tokens: number, featured: boolean): string {
  const goods = row.goods;
  const soldOut = row.stockLeft !== null && row.stockLeft <= 0;
  const poor = !soldOut && tokens < goods.cost;
  const state = soldOut ? ' sold-out' : poor ? ' poor' : ' ready';
  const stock = row.stockLeft === null ? '不限量' : soldOut ? '本周已售罄' : `本周剩 ${row.stockLeft} / ${goods.stock}`;
  const action = soldOut
    ? '<button class="shop-buy is-sold" type="button" disabled>本周已售罄</button>'
    : poor
      ? `<button class="shop-buy is-poor" type="button" data-action="battle" data-missing="${goods.cost - tokens}">还差 ${goods.cost - tokens} 枚 · 去打一场 <span data-icon="swords"></span></button>`
      : `<button class="shop-buy" type="button" data-buy="${goods.id}"><span data-icon="bag"></span>购买 · ${goods.cost} 代币</button>`;
  return `
    <article class="shop-goods${state}${featured ? ' featured' : ''}" data-goods-card="${goods.id}">
      <div class="shop-goods-art"><span data-icon="${featured ? 'sparkles' : goods.mats?.traitstones ? 'sparkles' : goods.mats?.ingots ? 'helmet' : 'coin'}"></span>${featured ? '<b>本周招牌</b>' : ''}</div>
      <div class="shop-goods-body"><div class="shop-goods-title"><h3>${cleanName(goods.name)}</h3><span class="shop-stock">${stock}</span></div>
        <p class="shop-goods-blurb">${goods.blurb ?? '活动兑换包'}</p>
        <div class="shop-rewards">${rewardHtml(goods, save)}</div>
        <div class="shop-goods-foot"><span class="shop-price"><i data-icon="sparkles"></i><b>${goods.cost}</b> 代币</span>${action}</div>
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
      return `<a class="shop-tab${active ? ' active' : ''}" href="#shop/${tab.id}" style="--shop-accent:${tab.accent}"><span>${tab.shortName}</span><b>${tabShop.week.tokens}</b></a>`;
    }).join('');
    return `
      ${topbarHtml()}
      <div class="screen event-shop-screen">
        <section class="panel event-shop-panel" style="--shop-accent:${def.accent}">
          <header class="shop-page-head"><a class="shop-back" href="#events/${typeId}"><span data-icon="arrow"></span>${def.name}</a><div><small>ACTIVITY EXCHANGE</small><h1>活动商店</h1></div><span class="shop-reset"><span data-icon="time"></span>周一 0:00 刷新限量 · 剩 ${remainingLabel(now, weekStart)}</span></header>
          <nav class="shop-tabs" aria-label="活动商店页签">${tabs}</nav>
          ${tokenProgressHtml(shop.week.tokens, earned, finiteCost, def.accent)}
          <section class="shop-shelf">
            <div class="shop-section-head"><div><small>FEATURED REWARD</small><h2>本周招牌</h2></div><span>${def.tokenName} · 仅本活动可用</span></div>
            ${featuredRow ? goodsCard(featuredRow, save, shop.week.tokens, true) : '<p class="shop-empty">本周暂无货架</p>'}
          </section>
          <section class="shop-shelf regular"><div class="shop-section-head"><div><small>WEEKLY SHELF</small><h2>常规货架</h2></div><span>限量货按周一 0:00 补货</span></div><div class="shop-grid">${regularRows.map((row) => goodsCard(row, save, shop.week.tokens, false)).join('')}</div></section>
          <footer class="shop-footnote"><span data-icon="lock"></span><span>活动代币只在「${def.name}」商店使用，跨周作废；购买后持有量会立即更新。</span></footer>
        </section>
      </div>
      ${bottomNavHtml('', '购买前可看到持有量与买后数量')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.on(document, 'click', (event) => {
      const target = event.target as HTMLElement;
      const buy = target.closest<HTMLElement>('[data-buy]');
      const action = target.closest<HTMLElement>('[data-action="battle"]');
      if (action) {
        const typeId = parseTypeId(ctx.currentHash().replace(/^#shop\/?/, '').split('/')[0] || undefined);
        // BattleLauncher intentionally only accepts #events/<typeId>; move there first
        // so the existing source/return contract remains authoritative.
        ctx.navigate(`#events/${typeId}`);
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
