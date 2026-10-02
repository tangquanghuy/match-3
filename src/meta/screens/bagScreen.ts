import {
  INGOT_KEYS,
  INGOT_NAMES,
  STONE_COLORS,
  TRAITSTONE_TIERS,
  ARCANE_STONE_KEYS,
  ingotKeyForRarity,
  stoneColorKeyOf,
  stoneKey,
  stoneName,
  type IngotKey,
  type TraitstoneTier,
} from '../data/materials';
import { ownedWeapons } from '../data/weaponCatalog';
import { temperingCost, MAX_TEMPERING_LEVEL } from '../systems/forge';
import { temperingLevelOf } from '../systems/forgeOps';
import { EXPLORE_DROPS, exploreStoneChances, traitUnlockCost } from '../data/economy';
import { EXPLORE_MAX_TIER } from '../data/kingdoms';
import { getRecord } from '../systems/troopProgress';
import { kingdomsForExploreStone } from '../systems/explore';
import { TROOPS } from '../../data/troops';
import { bottomNavHtml, icon, mountIcons, toastHtml, topbarHtml } from '../shell/chrome';
import { ingotArt, materialImg, scrollArt, stoneMarkup, treasureMapMarkup } from '../shell/materialArt';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';

const INGOT_TONE: Record<IngotKey, string> = {
  common: '#aab2ad',
  uncommon: '#4caf6a',
  rare: '#9a4fd4',
  ultraRare: '#ffe24a',
  epic: '#c56b2d',
  legendary: '#f08a42',
  mythic: '#56d8ff',
};

const STONE_TONE: Record<string, string> = {
  blue: '#4f9fe0',
  green: '#57c06b',
  red: '#e8555e',
  yellow: '#e8c24a',
  purple: '#a074d4',
  brown: '#c0823f',
};

type BagTab = 'ingots' | 'stones' | 'supplies';

const TAB_ICONS: Record<BagTab, string> = {
  ingots: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 3-8h10l3 8-3 3H7Z"/><path d="M7 8h10M4 16h16"/></svg>',
  stones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 8-9 12-9-12Z"/><path d="M3 10h18M12 2l-4 8 4 12 4-12Z"/></svg>',
  supplies: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 4v16m3-11h4m-4 4h4"/></svg>',
};

interface BagItem {
  id: string;
  name: string;
  count: number;
  art: string;
  tone: string;
  group: string;
  purpose: string;
  hint: string;
  source: string;
  destination: string;
  action: string;
  farmKingdoms?: readonly string[];
}

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tabOf(param?: string): BagTab {
  if (param?.split('/')[0] === 'stones') return 'stones';
  if (param === 'supplies' || param === 'scrolls' || param === 'tickets' || param === 'currencies') return 'supplies';
  return 'ingots';
}

function tabHref(tab: string): string {
  return `#bag/${tab}`;
}

export class BagScreen implements Screen {
  private closeOnEscape: ((event: KeyboardEvent) => void) | null = null;

  html(ctx: ShellCtx, param?: string): string {
    const tab = tabOf(param);
    const save = ctx.save();
    const materials = save.materials;
    const parts = param?.split('/') ?? [];
    const filter = tab === 'stones' && ['basic', 'arcane', 'celestial'].includes(parts[1]) ? parts[1] : 'all';
    const allItems = this.itemsFor(tab, save).filter(item => filter === 'all' || (filter === 'basic'
      ? /^(minor|major|runic):/.test(item.id) : filter === 'arcane' ? item.id.startsWith('arcane:') : item.id === 'celestial'));
    const pageParam = filter === 'all' ? parts[1] : parts[2];
    const pageRoute = `#bag/${tab}${filter === 'all' ? '' : `/${filter}`}`;
    const filters = tab === 'stones' ? `<nav class="bag-stone-filters" aria-label="特质石品阶">${[['all', '全部'], ['basic', '基础'], ['arcane', '秘法'], ['celestial', '圣辉']].map(([id, label]) => `<a href="#bag/stones${id === 'all' ? '' : `/${id}`}" ${filter === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>` : '';
    const sectionTitle = filter === 'arcane' ? '秘法属性石' : filter === 'celestial' ? '圣辉石' : filter === 'basic' ? '基础特质石' : '';
    const pageSize = 19;
    const pageCount = Math.ceil(allItems.length / pageSize);
    const page = Math.min(pageCount, Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1));
    const items = allItems.slice((page - 1) * pageSize, page * pageSize);
    const pager = pageCount > 1 ? `<nav class="bag-pagination" aria-label="材料分页"><a href="${pageRoute}/${Math.max(1, page - 1)}" aria-label="上一页" aria-disabled="${page === 1}">‹</a><span>${page} / ${pageCount}</span><a href="${pageRoute}/${Math.min(pageCount, page + 1)}" aria-label="下一页" aria-disabled="${page === pageCount}">›</a></nav>` : '';
    const selected = items.find((item) => item.count > 0) ?? items[0];
    const tabCounts: Record<BagTab, number> = {
      ingots: Object.values(materials.ingots).filter((count) => count > 0).length,
      stones: Object.values(materials.traitstones).filter((count) => count > 0).length,
      supplies: Number(materials.forgeScrolls > 0) + Number(materials.treasureMaps > 0)
        + Number(save.currencies.gloryKeys > 0) + Number((save.regional?.burningSouls ?? 0) > 0),
    };
    const tabs = [
      ['ingots', '钢锭'],
      ['stones', '特质石'],
      ['supplies', '符卷·门票'],
    ] as const;

    return `
      ${topbarHtml()}
      <div class="screen bag-screen">
        <section class="panel bag-panel">
          <header class="bag-head"><h1>材料库</h1></header>
          <nav class="bag-tabs" aria-label="材料分类">
            ${tabs.map(([id, label]) => `<a class="bag-tab${tab === id ? ' active' : ''}" href="${tabHref(id)}" ${tab === id ? 'aria-current="page"' : ''}><span class="bag-tab-icon">${TAB_ICONS[id]}</span><b>${label}</b><small>${tabCounts[id]}</small></a>`).join('')}
          </nav>
          <div class="bag-body">
            <div class="bag-content">
              ${filters}<div class="bag-section-head"><h2>${sectionTitle || tabs.find(([id]) => id === tab)?.[1]}</h2>${pager}<label class="bag-owned-toggle"><input id="bagOwnedOnly" type="checkbox">${pageCount > 1 ? '本页持有' : '只看持有'}</label></div>
              <div class="bag-shelf"><div class="bag-grid" data-bag-category="${tab}">${items.map((item) => `<button type="button" class="bag-item${item.count === 0 ? ' empty' : ''}${item.id === selected?.id ? ' selected' : ''}" style="--mat:${item.tone}" data-bag-item="${item.id}" aria-label="${item.name}，${item.count > 0 ? `持有 ${item.count}` : '未获得'}" aria-pressed="${item.id === selected?.id}"><span class="bag-rarity-line"></span><span class="bag-item-art">${item.art}</span><span class="bag-item-name">${item.name}</span><span class="bag-item-count">${item.count > 0 ? `×${item.count.toLocaleString('en-US')}` : '未获得'}</span></button>`).join('')}</div><p class="bag-filter-empty" hidden>暂无持有材料</p></div>
            </div>
            <aside class="bag-detail" aria-label="材料详情">
              <button type="button" class="bag-detail-close" aria-label="关闭材料详情">×</button>
              ${items.map((item) => `<div class="bag-detail-card" data-bag-detail="${item.id}" ${item.id === selected?.id ? '' : 'hidden'}><span class="bag-detail-kicker">${item.group}</span><div class="bag-detail-art" style="--mat:${item.tone}">${item.art}</div><h3>${item.name}</h3><p class="bag-detail-count">${item.id === 'arenaTicket' ? '本周剩余' : '持有'} <strong>${item.count.toLocaleString('en-US')}</strong></p><div class="bag-detail-section"><small>用途</small><p>${item.purpose}</p><em>${item.hint}</em></div><div class="bag-detail-section"><small>来源</small><p>${item.source}</p>${item.farmKingdoms?.length ? `<details class="bag-farm"><summary>对应王国 · ${item.farmKingdoms.length}</summary><div>${item.farmKingdoms.map(kingdom => `<button type="button" data-bag-nav="#explore/${encodeURIComponent(kingdom)}">${escapeHtml(kingdom)}</button>`).join('')}</div></details>` : ''}</div><button type="button" class="bag-detail-action" data-bag-nav="${item.destination}">${item.action} →</button></div>`).join('')}
            </aside>
          </div>
          <div class="bag-detail-backdrop" hidden></div>
        </section>
      </div>
      ${bottomNavHtml('', '')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    root.classList.add('bag-responsive');
    mountIcons(root);
    if (ctx.save().materialsUnread) void ctx.gateway.markMaterialsSeen().then(() => ctx.refreshChrome());
    root.querySelectorAll<HTMLElement>('[data-bag-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        const href = el.dataset.bagNav;
        if (href) ctx.navigate(href);
      });
    });
    const panel = root.querySelector<HTMLElement>('.bag-panel')!;
    const backdrop = root.querySelector<HTMLElement>('.bag-detail-backdrop')!;
    const detail = root.querySelector<HTMLElement>('.bag-detail')!;
    const selectItem = (button: HTMLButtonElement, openSheet: boolean): void => {
      root.querySelectorAll<HTMLButtonElement>('[data-bag-item]').forEach((item) => {
        item.classList.toggle('selected', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      root.querySelectorAll<HTMLElement>('[data-bag-detail]').forEach((card) => {
        card.hidden = card.dataset.bagDetail !== button.dataset.bagItem;
      });
      if (openSheet && window.matchMedia('(max-width: 640px)').matches) {
        panel.classList.add('detail-open');
        backdrop.hidden = false;
        root.querySelector<HTMLButtonElement>('.bag-detail-close')?.focus({ preventScroll: true });
      }
    };
    root.querySelectorAll<HTMLButtonElement>('[data-bag-item]').forEach((button) => {
      button.addEventListener('click', () => selectItem(button, true));
    });
    const closeDetail = (): void => {
      panel.classList.remove('detail-open');
      backdrop.hidden = true;
      root.querySelector<HTMLButtonElement>('[data-bag-item].selected')?.focus({ preventScroll: true });
    };
    root.querySelector('.bag-detail-close')?.addEventListener('click', closeDetail);
    backdrop.addEventListener('click', closeDetail);
    this.closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel.classList.contains('detail-open')) closeDetail();
    };
    root.addEventListener('keydown', this.closeOnEscape);
    root.querySelector<HTMLInputElement>('#bagOwnedOnly')?.addEventListener('change', (event) => {
      const onlyOwned = (event.currentTarget as HTMLInputElement).checked;
      root.querySelectorAll<HTMLButtonElement>('.bag-item.empty').forEach((item) => { item.hidden = onlyOwned; });
      const visible = root.querySelector<HTMLButtonElement>('.bag-item:not([hidden])');
      const empty = !visible;
      root.querySelector<HTMLElement>('.bag-filter-empty')!.hidden = !empty;
      detail.hidden = empty;
      if (onlyOwned && visible && root.querySelector('.bag-item.selected[hidden]')) selectItem(visible, false);
    });
  }

  private itemsFor(tab: BagTab, save: MetaSave): BagItem[] {
    const { materials } = save;
    if (tab === 'ingots') return INGOT_KEYS.map((key) => {
      const count = materials.ingots[key] ?? 0;
      return {
        id: key, name: INGOT_NAMES[key], count, art: materialImg(ingotArt(key)), tone: INGOT_TONE[key],
        group: '钢锭', purpose: '同稀有度武器淬炼', hint: this.ingotHint(save, key, count),
        source: '战斗 · 活动 · 宝箱', destination: '#weapons/temper', action: '查看可淬炼武器',
      };
    });
    if (tab === 'stones') return this.stoneItems(save);
    return [{
      id:'burningSouls', name:'燃烧灵魂', count:save.regional?.burningSouls ?? 0,
      art:`<span class="bag-ticket-art" style="color:#ed9859">${icon('soul')}</span>`, tone:'#ed9859', group:'不朽材料',
      purpose:'用于不朽升级与特质解锁', hint:'升至 30 级共需 99 个；三个特质另需 33 / 66 / 99 个',
      source:'永生战域 · 周奖励与城塞守护者', destination:'#regional', action:'前往永生战域',
    }, {
      id: 'forgeScrolls', name: '熔铸符卷', count: materials.forgeScrolls,
      art: materialImg(scrollArt()), tone: '#a596e6', group: '符卷',
      purpose: '末日武器淬炼', hint: this.scrollHint(save, materials.forgeScrolls),
      source: '活动 · 赛季奖励', destination: '#weapons/temper', action: '查看末日武器',
    }, {
      id: 'gloryKeys', name: '荣耀钥匙', count: save.currencies.gloryKeys,
      art: '<span class="bag-ticket-art" data-icon="key"></span>', tone: '#b78a50', group: '钥匙',
      purpose: '开启荣耀宝箱，一把开启一次',
      hint: '开启荣耀箱时优先使用钥匙，不足部分使用荣耀',
      source: '竞技场胜场奖励', destination: '#chests/keys', action: '前往荣耀宝箱',
    }, {
      id: 'treasureMaps', name: '藏宝图', count: materials.treasureMaps,
      art: treasureMapMarkup(), tone: '#c4a36a', group: '门票',
      purpose: '寻宝 · 每次消耗 1 张', hint: '每场战斗最多获得 2 张，包含技能和活动奖励',
      source: '战斗胜利掉落（1%）· 部队技能 · 活动', destination: '#hunt', action: '前往寻宝',
    }];
  }

  private stoneItems(save: MetaSave): BagItem[] {
    const tiers = TRAITSTONE_TIERS.filter((tier) => tier !== 'celestial' && tier !== 'arcane');
    const stones = tiers.flatMap((tier) => STONE_COLORS.map((color) => {
      const key = stoneKey(tier, color.key)!;
      const count = save.materials.traitstones[key] ?? 0;
      return {
        id: key, name: stoneName(key), count, art: stoneMarkup(tier, color.key), tone: STONE_TONE[color.key],
        group: `${this.tierName(tier)} · ${color.name}`, purpose: `解锁${color.name}系部队特质`,
        hint: this.stoneHint(save, key, count),
        source: tier === 'minor'
          ? `探索每场额外抽取 ${EXPLORE_DROPS.extraBasicStoneRolls} 次初级或高级石，高级概率 ${EXPLORE_DROPS.majorStoneChance * 100}%，其余为初级；基础抽取未命中其他品阶时也会掉落。${EXPLORE_DROPS.bannerColorShare * 100}% 优先旗帜加成色。`
          : tier === 'major'
            ? `探索每次基础及额外抽取均有 ${EXPLORE_DROPS.majorStoneChance * 100}% 概率掉高级石；${EXPLORE_DROPS.bannerColorShare * 100}% 优先旗帜加成色。`
            : `探索基础抽取每次掉符文石的概率从难度 1 的 ${exploreStoneChances(1).runic * 100}% 增至难度 ${EXPLORE_MAX_TIER} 的 ${exploreStoneChances(EXPLORE_MAX_TIER).runic * 100}%；${EXPLORE_DROPS.bannerColorShare * 100}% 优先旗帜加成色。`,
        farmKingdoms: kingdomsForExploreStone(key), destination: '#map', action: '查看王国地图',
      };
    }));
    const count = save.materials.traitstones.celestial ?? 0;
    const arcane = ARCANE_STONE_KEYS.map(key => ({
      id: key, name: stoneName(key), count: save.materials.traitstones[key] ?? 0,
      art: stoneMarkup('arcane', key.slice(7)), tone: '#b487df', group: '秘法',
      purpose: '高阶特质解锁', hint: this.stoneHint(save, key, save.materials.traitstones[key] ?? 0),
      source: kingdomsForExploreStone(key).length
        ? `对应王国的每个探索难度首通最终 Boss 固定获得 1 颗；基础抽取每次有 ${EXPLORE_DROPS.arcaneStoneChance * 100}% 概率掉秘法石，双色按旗帜加成色倾向。`
        : `探索基础抽取每次有 ${EXPLORE_DROPS.arcaneStoneChance * 100}% 概率掉秘法石，双色按旗帜加成色倾向；也可从宝箱和活动获得。`,
      farmKingdoms: kingdomsForExploreStone(key), destination: '#map', action: '查看王国地图',
    }));
    return [...stones, ...arcane, {
      id: 'celestial', name: '圣辉石', count, art: stoneMarkup('celestial'), tone: '#a5d8eb',
      group: '圣辉', purpose: '高阶部队特质解锁', hint: this.stoneHint(save, 'celestial', count),
      source: `探索基础抽取每次掉圣辉石的概率从难度 1 的 ${exploreStoneChances(1).celestial * 100}% 增至难度 ${EXPLORE_MAX_TIER} 的 ${exploreStoneChances(EXPLORE_MAX_TIER).celestial * 100}%；也可从活动和宝箱获得。`, destination: '#troop', action: '查看部队特质',
    }];
  }

  private ingotHint(save: MetaSave, key: IngotKey, held: number): string {
    const candidates = ownedWeapons(save).filter((weapon) => ingotKeyForRarity(weapon.rarity) === key && weapon.rarity !== 'Doomed');
    if (candidates.length === 0) return '暂无对应武器';
    let ready = 0;
    let gap = Number.POSITIVE_INFINITY;
    for (const weapon of candidates) {
      const level = temperingLevelOf(save, weapon.id);
      if (level >= MAX_TEMPERING_LEVEL) continue;
      const cost = temperingCost(weapon.rarity, level);
      const missing = Math.max(0, cost.ingots - held);
      if (missing === 0 && save.currencies.gold >= cost.gold) ready += 1;
      gap = Math.min(gap, missing || Math.max(0, cost.gold - save.currencies.gold));
    }
    if (ready > 0) return `可淬炼 ${ready} 把`;
    return Number.isFinite(gap) && gap > 0 ? `还差 ${gap} ${gap === 1 ? '块' : '块或黄金'}` : '等待可淬炼武器';
  }

  private scrollHint(save: MetaSave, held: number): string {
    const candidates = ownedWeapons(save).filter((weapon) => weapon.rarity === 'Doomed');
    if (candidates.length === 0) return '暂无末日武器';
    const ready = candidates.filter((weapon) => {
      const level = temperingLevelOf(save, weapon.id);
      return level < MAX_TEMPERING_LEVEL && held >= temperingCost(weapon.rarity, level).scrolls && save.currencies.gold >= temperingCost(weapon.rarity, level).gold;
    }).length;
    return ready > 0 ? `可淬炼 ${ready} 把` : `还差 1 卷或黄金`;
  }

  private stoneHint(save: MetaSave, key: string, held: number): string {
    const candidates = TROOPS.flatMap((troop) => {
      const rec = getRecord(save, troop.id);
      if (!rec) return [];
      const slot = rec.traits.findIndex((unlocked) => !unlocked);
      if (slot < 0) return [];
      const color = stoneColorKeyOf(troop.manaColors[0]!);
      const cost = traitUnlockCost(slot + 1, color, troop.id).stones[key] ?? 0;
      return cost > 0 ? [{ cost, total: traitUnlockCost(slot + 1, color, troop.id) }] : [];
    });
    if (candidates.length === 0) return '暂无对应槽位';
    const ready = candidates.filter(({ cost, total }) => cost <= held && total.gold <= save.currencies.gold && Object.entries(total.stones).every(([key, n]) => (save.materials.traitstones[key] ?? 0) >= n)).length;
    if (ready > 0) return `可解 ${ready} 槽`;
    const missing = Math.min(...candidates.map(({ cost }) => Math.max(0, cost - held)).filter((n) => n > 0));
    return Number.isFinite(missing) ? `还差 ${missing} 颗` : '还差其他特质石';
  }

  private tierName(tier: TraitstoneTier): string {
    return tier === 'minor' ? '初级' : tier === 'major' ? '高级' : tier === 'runic' ? '符文' : tier === 'arcane' ? '秘法' : '圣辉';
  }

  dispose(): void {
    if (this.closeOnEscape) document.getElementById('stage')?.removeEventListener('keydown', this.closeOnEscape);
    this.closeOnEscape = null;
    document.getElementById('stage')?.classList.remove('bag-responsive');
  }
}
