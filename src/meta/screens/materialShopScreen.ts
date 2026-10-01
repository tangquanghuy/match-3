import { getTroopById } from '../../data/troops';
import { getMaterialBundle, materialBundleCatalog, materialBundleForTroop, type MaterialBundle } from '../data/materialBundles';
import { MATERIAL_SHOP_KEYS } from '../data/materialShop';
import { parseStoneKey, STONE_COLORS, stoneName, type TraitstoneTier } from '../data/materials';
import { materialShopQuote, type MaterialShopRequest } from '../systems/materialShop';
import { bottomNavHtml, shopNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import { stoneMarkupForKey } from '../shell/materialArt';
import { cssUrlVar, shopArt } from '../shell/artAssets';
import type { Screen, ShellCtx } from '../shell/screen';

const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const BUNDLES_PER_PAGE = 5;
const TIERS: [TraitstoneTier, string][] = [['minor', '初级'], ['major', '高级'], ['runic', '符文'], ['arcane', '秘法'], ['celestial', '圣辉']];

export class MaterialShopScreen implements Screen {
  private tier: TraitstoneTier = 'major';
  private key = 'major:blue';
  private count = 1;
  private busy = false;
  private controller?: AbortController;
  private request?: MaterialShopRequest;
  private signature = '';
  private color = '';
  private page = 0;
  private shownBundle = '';
  private bundle?: MaterialBundle;
  private mask = 7;
  private origin?: number;

  private bundleRoute(id: string, mask = this.mask): string {
    return `#materials/gems/${id}/${mask}${this.origin ? `/${this.origin}` : ''}`;
  }


  html(ctx: ShellCtx, param?: string): string {
    const save = ctx.save();
    const [tab, selection, stage, origin] = (param ?? 'gold').split('/');
    const gems = tab === 'gems';
    const families = gems ? materialBundleCatalog() : [];
    const legacyTroop = gems && selection && /^\d+$/.test(selection) ? getTroopById(Number(selection)) : undefined;
    this.origin = legacyTroop?.id ?? (origin && /^\d+$/.test(origin) ? Number(origin) : undefined);
    this.bundle = gems ? (selection === undefined ? families[0]?.bundles[0] : legacyTroop ? materialBundleForTroop(legacyTroop.id) : getMaterialBundle(selection)) : undefined;
    this.mask = legacyTroop ? legacyTroop.traits.reduce((bits, trait, i) => bits | (trait && !save.collection[String(legacyTroop.id)]?.traits[i] ? 1 << i : 0), 0) : stage === undefined ? 7 : Number(stage);
    const family = families.find(f => f.id === this.bundle?.familyId) ?? families[0];
    if (this.bundle?.id !== this.shownBundle) {
      if (this.bundle && this.color && !this.bundle.colors.includes(this.color)) this.color = '';
      const matching = family?.bundles.filter(b => !this.color || b.colors.includes(this.color)) ?? [];
      this.page = Math.max(0, Math.floor(matching.findIndex(b => b.id === this.bundle?.id) / BUNDLES_PER_PAGE));
      this.shownBundle = this.bundle?.id ?? '';
    }
    const variants = family?.bundles.filter(b => !this.color || b.colors.includes(this.color)) ?? [];
    const pageCount = Math.max(1, Math.ceil(variants.length / BUNDLES_PER_PAGE));
    this.page = Math.min(this.page, pageCount - 1);
    const listed = variants.slice(this.page * BUNDLES_PER_PAGE, (this.page + 1) * BUNDLES_PER_PAGE);
    this.request = gems ? { kind: 'gems', bundleId: this.bundle?.id ?? '', mask: this.mask } : { kind: 'gold', key: this.key, count: this.count };
    const quote = materialShopQuote(save, this.request);
    this.signature = quote.ok ? quote.signature : '';
    const troop = this.origin ? getTroopById(this.origin) : undefined;
    const line = quote.ok ? quote.goldLine : undefined;
    const priceDetails = line ? `<div class="material-price" aria-label="价格明细">
      ${line.limit ? `<p class="material-offer">账号优惠剩余 <span><b>${line.remaining} / ${line.limit}</b> 颗</span><small>所有秘法共用 · 不刷新</small></p>` : ''}
      ${line.discountCount ? `<p>优惠价 <span>${line.discountUnit.toLocaleString()} 金币 × ${line.discountCount}</span></p>` : ''}
      ${line.regularCount ? `<p>${line.limit ? '原价' : '单价'} <span>${line.regularUnit.toLocaleString()} 金币 × ${line.regularCount}</span></p>` : line.limit ? `<p class="material-original">原价 ${line.regularUnit.toLocaleString()} 金币 / 颗</p>` : ''}
    </div>` : '';
    const rows = quote.ok ? Object.entries(quote.stones).sort(([a], [b]) => TIERS.findIndex(([tier]) => tier === parseStoneKey(a)?.tier) - TIERS.findIndex(([tier]) => tier === parseStoneKey(b)?.tier)).map(([key, n]) => `<li>${stoneMarkupForKey(key)}<span>${esc(stoneName(key))}<small>持有 ${(save.materials.traitstones[key] ?? 0).toLocaleString()}</small></span><b>×${n}</b></li>`).join('') : '';
    const title = gems ? this.bundle?.name ?? '请选择材料组合' : stoneName(this.key);
    const unavailable = !quote.ok || quote.price === null || save.currencies[quote.currency] < quote.price;
    const purchase = !quote.ok ? quote.message : quote.price === null ? '价格待定 · 尚未开售' : `${quote.price.toLocaleString()} ${gems ? '宝石' : '金币'} · 购买`;
    return `${topbarHtml()}<div class="screen material-shop-screen"><section class="panel material-shop" style='${cssUrlVar('material-hero', shopArt('gem-vault'))}'>
      <header class="material-head"><h1>材料商店</h1>${shopNavHtml('materials')}</header>
      <nav class="material-tabs" aria-label="购买方式"><a href="#materials/gold" ${gems ? '' : 'aria-current="page"'}>金币直购</a><a href="#materials/gems" ${gems ? 'aria-current="page"' : ''}>宝石整套</a></nav>
      <div class="material-body ${gems ? 'material-body-bundles' : ''}"><section class="material-catalog" aria-label="材料目录">
      ${gems ? `<label class="material-select">组合类型<select id="materialFamily" aria-label="组合类型">${families.map(f => `<option value="${f.id}" ${family?.id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <p class="material-recipe-summary">${esc(family?.summary ?? '')}</p>
        <nav class="material-colors" aria-label="属性筛选"><button type="button" data-color="" aria-pressed="${!this.color}">全部</button>${STONE_COLORS.map(c => `<button type="button" data-color="${c.key}" aria-pressed="${this.color === c.key}" ${family?.bundles.some(b => b.colors.includes(c.key)) ? '' : 'disabled'}>${c.name}</button>`).join('')}</nav>
        <div class="material-bundles">${listed.map(b => `<button type="button" data-bundle="${b.id}" aria-pressed="${b.id === this.bundle?.id}"><span class="material-bundle-art">${b.artKeys.map(key => stoneMarkupForKey(key)).join('')}</span><span>${esc(b.name)}</span><span aria-hidden="true">›</span></button>`).join('')}</div>
        <nav class="material-pages" aria-label="属性组合翻页"><button type="button" data-page="-1" ${this.page === 0 ? 'disabled' : ''}>上一页</button><span>${this.page + 1} / ${pageCount}</span><button type="button" data-page="1" ${this.page + 1 >= pageCount ? 'disabled' : ''}>下一页</button></nav>`
      : `<nav class="material-tiers" aria-label="材料品阶">${TIERS.map(([tier, label]) => `<button type="button" data-tier="${tier}" aria-pressed="${this.tier === tier}">${label}</button>`).join('')}</nav>
        <div class="material-list">${MATERIAL_SHOP_KEYS.filter(k => parseStoneKey(k)?.tier === this.tier).map(key => `<button type="button" data-stone="${key}" aria-pressed="${this.key === key}">${stoneMarkupForKey(key)}<span>${esc(stoneName(key))}<small>持有 ${(save.materials.traitstones[key] ?? 0).toLocaleString()}</small></span></button>`).join('')}</div>`}
      </section><section class="material-detail" aria-label="商品明细"><span class="material-eyebrow">${gems ? 'TRAIT MATERIALS' : 'TRAITSTONE'}</span><h2>${esc(title)}</h2>
        ${gems ? `<p class="material-family-name">${esc(family?.name ?? '')}</p><label class="material-stage">特质阶段<select id="materialStage" aria-label="特质阶段">${[[7, '三特质整套'], [6, '特质Ⅱ + Ⅲ'], [4, '特质Ⅲ'], ...(![7, 6, 4].includes(this.mask) ? [[this.mask, this.mask === 0 ? '特质已全部解锁' : `特质 ${[1, 2, 3].filter(n => this.mask & (1 << (n - 1))).map(n => ['Ⅰ', 'Ⅱ', 'Ⅲ'][n - 1]).join(' + ')}`]] : [])].map(([mask, label]) => `<option value="${mask}" ${mask === this.mask ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}
        <ul class="material-contents">${rows}</ul>
        ${gems ? '' : `<label class="material-quantity">数量 <input id="materialCount" aria-label="购买数量" type="number" min="1" max="99" step="1" value="${this.count}"></label>`}
        ${gems ? `<p class="material-note">固定材料组合，已有库存不抵扣。</p>${troop ? `<a class="material-back" href="#troop/${troop.id}">返回${esc(troop.name)}特质 →</a>` : ''}` : ''}
        ${priceDetails}
        <button type="button" id="materialBuy" ${unavailable || this.busy ? 'disabled' : ''}>${esc(purchase)}</button>
      </section></div></section></div>${bottomNavHtml('商店')}${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    root.addEventListener('click', async event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('button');
      if (!target || this.busy || (target as HTMLButtonElement).disabled) return;
      if (target.hasAttribute('data-color')) {
        this.color = target.dataset.color!; this.page = 0; ctx.refresh();
      } else if (target.dataset.page) {
        this.page += Number(target.dataset.page); ctx.refresh();
      } else if (target.dataset.bundle) {
        if (this.origin && materialBundleForTroop(this.origin)?.id !== target.dataset.bundle) this.origin = undefined;
        ctx.navigate(this.bundleRoute(target.dataset.bundle));
        requestAnimationFrame(() => { if (window.innerWidth <= 760) document.querySelector('.material-detail')?.scrollIntoView({ block: 'start' }); });
      } else if (target.dataset.tier) {
        this.tier = target.dataset.tier as TraitstoneTier;
        this.key = MATERIAL_SHOP_KEYS.find(k => parseStoneKey(k)?.tier === this.tier)!;
        this.count = 1; ctx.refresh();
      } else if (target.dataset.stone) {
        this.key = target.dataset.stone; this.count = 1; ctx.refresh();
      } else if (target.id === 'materialBuy' && !(target as HTMLButtonElement).disabled && this.request) {
        this.busy = true; (target as HTMLButtonElement).disabled = true;
        try {
          const { result } = await ctx.gateway.buyMaterialGoods(this.request, this.signature);
          if (signal.aborted) return;
          this.busy = false;
          ctx.refresh(); toast(result.ok ? '材料已入库' : result.message);
        } catch { if (!signal.aborted) toast('网络请求失败，请稍后重试'); }
        finally { this.busy = false; if (!signal.aborted) (target as HTMLButtonElement).disabled = false; }
      }
    }, { signal });
    root.querySelector('#materialFamily')?.addEventListener('change', event => {
      const family = materialBundleCatalog().find(f => f.id === (event.target as HTMLSelectElement).value);
      if (!family?.bundles[0]) return;
      this.color = ''; this.page = 0; this.origin = undefined;
      ctx.navigate(this.bundleRoute(family.bundles[0].id, 7));
    }, { signal });
    root.querySelector('#materialStage')?.addEventListener('change', event => {
      if (this.bundle) ctx.navigate(this.bundleRoute(this.bundle.id, Number((event.target as HTMLSelectElement).value)));
    }, { signal });
    root.querySelector('#materialCount')?.addEventListener('change', event => {
      const value = Number((event.target as HTMLInputElement).value);
      this.count = Number.isFinite(value) ? Math.max(1, Math.min(99, Math.floor(value))) : 1;
      ctx.refresh();
    }, { signal });
  }
  dispose(): void { this.controller?.abort(); }
}
