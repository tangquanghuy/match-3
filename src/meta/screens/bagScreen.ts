import {
  INGOT_KEYS,
  INGOT_NAMES,
  STONE_COLORS,
  TRAITSTONE_TIERS,
  ingotKeyForRarity,
  stoneColorKeyOf,
  stoneKey,
  stoneName,
  type IngotKey,
  type TraitstoneTier,
} from '../data/materials';
import { GEM_CHEST, GLORY_CHEST, GOLD_CHEST } from '../data/economy';
import { ownedWeapons } from '../data/weaponCatalog';
import { temperingCost, MAX_TEMPERING_LEVEL } from '../systems/forge';
import { temperingLevelOf } from '../systems/forgeOps';
import { traitUnlockCost } from '../data/economy';
import { getRecord } from '../systems/troopProgress';
import { TROOPS } from '../../data/troops';
import { bottomNavHtml, mountIcons, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import type { Currencies, Materials, MetaSave } from '../state/schema';

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

function tabOf(param?: string): 'ingots' | 'stones' | 'scrolls' | 'currencies' {
  if (param === 'stones' || param === 'scrolls' || param === 'currencies') return param;
  return 'ingots';
}

function tabHref(tab: string): string {
  return `#bag/${tab}`;
}

export class BagScreen implements Screen {
  html(ctx: ShellCtx, param?: string): string {
    const tab = tabOf(param);
    const save = ctx.save();
    const materials = save.materials;
    const tabs = [
      ['ingots', '钢锭', 'FORGE INGOTS'],
      ['stones', '特质石', 'TRAITSTONES'],
      ['scrolls', '熔铸符卷', 'FORGE SCROLLS'],
      ['currencies', '货币', 'CURRENCIES'],
    ] as const;

    return `
      ${topbarHtml()}
      <div class="screen bag-screen">
        <section class="panel bag-panel">
          <header class="bag-head">
            <div>
              <small>MATERIALS VAULT</small>
              <h1>材料库</h1>
              <p>所有素材、当前数量和可前往的使用场景。</p>
            </div>
            <div class="bag-head-stat"><b>${this.totalCount(materials)}</b><small>已持有素材种类</small></div>
          </header>
          <nav class="bag-tabs" aria-label="材料分类">
            ${tabs.map(([id, label, en]) => `<a class="bag-tab${tab === id ? ' active' : ''}" href="${tabHref(id)}"><small>${en}</small><b>${label}</b></a>`).join('')}
          </nav>
          <div class="bag-content">${this.contentHtml(tab, save)}</div>
        </section>
      </div>
      ${bottomNavHtml('', '素材来源与去向可直接跳转')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    mountIcons(root);
    void ctx.gateway.markMaterialsSeen().then(() => ctx.refreshChrome());
    root.querySelectorAll<HTMLElement>('[data-bag-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        const href = el.dataset.bagNav;
        if (href) ctx.navigate(href);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-bag-source]').forEach((el) => {
      el.addEventListener('click', () => {
        const label = el.dataset.bagSource ?? '';
        if (label) {
          const toast = $('#toast');
          if (toast) {
            toast.textContent = `${label}：从对应页面继续操作`;
            toast.classList.add('show');
          }
        }
      });
    });
  }

  private totalCount(materials: Materials): number {
    const ingots = Object.values(materials.ingots).filter((n) => n > 0).length;
    const stones = Object.values(materials.traitstones).filter((n) => n > 0).length;
    return ingots + stones + (materials.forgeScrolls > 0 ? 1 : 0);
  }

  private contentHtml(
    tab: 'ingots' | 'stones' | 'scrolls' | 'currencies',
    save: MetaSave,
  ): string {
    const { materials, currencies } = save;
    if (tab === 'ingots') {
      const rows = INGOT_KEYS.map((key) => {
        const count = materials.ingots[key] ?? 0;
        return `<article class="bag-item ${count === 0 ? 'empty' : ''}" style="--mat:${INGOT_TONE[key]}">
          <span class="bag-swatch"></span><div><b>${INGOT_NAMES[key]}</b><small>淬炼 ${key === 'mythic' ? '神话' : '武器'}</small><em class="bag-conversion">${this.ingotHint(save, key, count)}</em></div><strong>${count.toLocaleString('en-US')}</strong>
          <button type="button" class="bag-source" data-bag-nav="#weapons/temper">去淬炼</button>
        </article>`;
      }).join('');
      return `<section class="bag-section"><header><div><small>INGOTS</small><h2>淬炼钢锭</h2></div><span>按稀有度分档</span></header><div class="bag-list">${rows}</div></section>`;
    }
    if (tab === 'scrolls') {
      const count = materials.forgeScrolls;
      return `<section class="bag-section bag-scrolls"><header><div><small>FORGE SCROLLS</small><h2>熔铸符卷</h2></div><span>神话武器淬炼专用</span></header>
        <article class="scroll-card ${count === 0 ? 'empty' : ''}"><div class="scroll-glyph">✦</div><div><b>熔铸符卷</b><p>用于高阶武器的淬炼进度，消耗前会显示完整预览。</p><em class="bag-conversion">${this.scrollHint(save, count)}</em></div><strong>${count.toLocaleString('en-US')}</strong><button type="button" class="bag-source" data-bag-nav="#weapons/temper">去淬炼</button></article>
        <div class="bag-empty-note">来源：活动里程碑、入侵赛季奖励和活动商店。</div></section>`;
    }
    if (tab === 'currencies') {
      return this.currencyHtml(currencies);
    }
    const tiers = TRAITSTONE_TIERS.filter((tier) => tier !== 'celestial') as TraitstoneTier[];
    const rows = tiers.map((tier) => `<div class="stone-row"><div class="stone-tier"><b>${this.tierName(tier)}</b><small>${tier.toUpperCase()}</small></div><div class="stone-grid">${STONE_COLORS.map((color) => {
      const key = stoneKey(tier, color.key)!;
      const count = materials.traitstones[key] ?? 0;
      return `<article class="stone-item ${count === 0 ? 'empty' : ''}" style="--stone:${STONE_TONE[color.key]}"><i></i><b>${count}</b><small>${color.name}</small><em class="stone-hint">${this.stoneHint(save, key, count)}</em><span title="${stoneName(key)}"></span></article>`;
    }).join('')}</div></div>`).join('');
    const celestial = materials.traitstones.celestial ?? 0;
    return `<section class="bag-section"><header><div><small>TRAITSTONES</small><h2>特质石矩阵</h2></div><span>行=档位 · 列=法力色</span></header><div class="stone-matrix">${rows}</div>
      <article class="celestial ${celestial === 0 ? 'empty' : ''}"><span class="celestial-gem">◇</span><div><b>圣辉石</b><small>万能特质石 · 可替代任一颜色</small><em class="bag-conversion">${celestial > 0 ? '当前解锁线按元素色消耗' : '还差 1 颗 · 先去活动或宝箱获取'}</em></div><strong>${celestial.toLocaleString('en-US')}</strong><button type="button" class="bag-source" data-bag-nav="#troop">去解锁</button></article></section>`;
  }

  private currencyHtml(currencies: Currencies): string {
    const currencyRows = [
      ['gold', '黄金', '金币', '#d8b65c', '用于升级、锻造与日常消耗。', '#map'],
      ['souls', '灵魂', '灵魂', '#b99cde', '用于英雄、职业和高阶锻造。', '#hero'],
      ['gems', '宝石', '宝石', '#8dcbee', '用于宝石箱和限时商店。', '#chests/gems'],
      ['goldKeys', '金钥匙', '钥匙', '#e5c875', '用于金钥匙宝箱。', '#chests/keys'],
      ['glory', '荣耀', '荣耀', '#f09a67', '用于荣耀宝箱和赛季商店。', '#invasion'],
    ] as const;
    return `<section class="bag-section currency-section"><header><div><small>CURRENCIES</small><h2>货币库存</h2></div><span>余额与去向</span></header>
      <div class="currency-grid">${currencyRows.map(([key, label, short, color, desc, href]) => {
        const value = currencies[key];
        return `<article class="currency-item ${value === 0 ? 'empty' : ''}" style="--currency:${color}">
          <span class="currency-orb">${short.slice(0, 1)}</span><div><b>${label}</b><small>${desc}</small><em class="bag-conversion">${this.currencyHint(key, value)}</em></div><strong>${value.toLocaleString('en-US')}</strong>
          <button type="button" class="bag-source" data-bag-nav="${href}">去使用</button></article>`;
      }).join('')}</div>
      <div class="bag-empty-note">货币余额会在消费或领取奖励后即时同步到顶栏。</div></section>`;
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
      const cost = traitUnlockCost(slot + 1, color).stones[key] ?? 0;
      return cost > 0 ? [{ cost, total: traitUnlockCost(slot + 1, color) }] : [];
    });
    if (candidates.length === 0) return '暂无对应槽位';
    const ready = candidates.filter(({ cost, total }) => cost <= held && total.gold <= save.currencies.gold).length;
    if (ready > 0) return `可解 ${ready} 槽`;
    const missing = Math.min(...candidates.map(({ cost }) => Math.max(0, cost - held)).filter((n) => n > 0));
    return Number.isFinite(missing) ? `还差 ${missing} 颗` : '还差黄金';
  }

  private currencyHint(key: keyof Currencies, value: number): string {
    if (key === 'gems') return `可开宝石箱 ${Math.floor(value / GEM_CHEST.singleCost)} 次`;
    if (key === 'goldKeys') return `可开金钥匙箱 ${Math.floor(value / GOLD_CHEST.keyCost)} 次`;
    if (key === 'glory') return `可开荣耀箱 ${Math.floor(value / GLORY_CHEST.cost)} 次`;
    return key === 'gold' ? '升级与锻造通用' : '英雄与高阶锻造通用';
  }


  private tierName(tier: TraitstoneTier): string {
    return tier === 'minor' ? '初级' : tier === 'major' ? '高级' : tier === 'runic' ? '符文' : '圣辉';
  }
}
