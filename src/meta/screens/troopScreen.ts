/**
 * 部队图鉴 + 养成详情屏（计划 §5.4 + §5.5，一屏两视图）。
 * 数据全部来自 troops.json + 收藏存档；升级/升阶/特质/分解/保护走网关。
 */
import { getTroopById, TROOPS, type TroopData } from '../../data/troops';
import type { TroopRecord } from '../state/schema';
import {
  MAX_ASCENSION,
  RARITY_ORDER,
  ascensionCopiesNeeded,
  decomposeYield,
  levelCapFor,
  totalSoulCost,
  traitUnlockCost,
} from '../data/economy';
import { getRecord, rarityTierOf, troopStatsOf } from '../systems/troopProgress';
import { stoneColorKeyOf, stoneName } from '../data/materials';
import { BaseColor } from '../../engine/types';
import { traitGlyphsFor } from '../shell/traitIcon';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, gemSvg, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopArt, troopArtChain, troopArtFallback, troopImg, typeCn } from './teamScreen';
import {
  formulaParts,
  formulaRule,
  renderSpell,
  type Formula,
} from '../shell/spellText';

const fmt = (n: number): string => n.toLocaleString('en-US');
const spaced = (name: string): string => name.split('').join(' ');

const COLOR_CN: Record<string, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄', purple: '紫', brown: '棕' };
const COLOR_ORDER = ['red', 'green', 'blue', 'yellow', 'purple', 'brown'] as const;
const chargeText = (colors: readonly string[]): string =>
  colors.length >= 6
    ? '任意颜色宝石为此法术充能'
    : colors.map((c) => (COLOR_CN[c.toLowerCase()] ?? c) + '色').join('、') + '宝石为此法术充能';

/** 图鉴查看未获得部队用的空白记录（1 级 / 0 阶 / 特质全锁） */
const UNOWNED_REC: TroopRecord = { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };

export class TroopScreen implements Screen {
  private ctx!: ShellCtx;
  /** 当前浏览的部队（owned 列表内索引对应的 troopId） */
  private currentId = 0;
  private collectionMode: 'owned' | 'all' = 'owned';
  /** 图鉴筛选：品质 / 魔法色 / 种族 / 王国（null 或空串 = 全部） */
  private rarityFilter: number | null = null;
  private colorFilter: string | null = null;
  private typeFilter: string | null = null;
  private kingdomFilter: string | null = null;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private formulas: Formula[] = [];
  private magic = 0;

  html(ctx: ShellCtx, param?: string): string {
    this.currentId = param ? Number(param) || 0 : this.firstOwnedId(ctx);
    void ctx;
    return `
      <div class="ambient" aria-hidden="true"></div>
      ${topbarHtml()}
      <main id="detail">
        <div class="page-heading"><button class="back" id="back"><span data-icon="arrow"></span>返回图鉴</button><div class="heading-center"><small>TROOP & TRAITS</small><h1>部 队 详 情</h1></div><span class="page-index">图鉴 <b id="pageIndex">001</b> / <span id="pageTotal">000</span></span></div>
        <div class="detail-layout">
          <section class="left-column">
            <article class="spell">
              <header class="spell-head">
                <div class="spell-mark" id="spellMark"></div>
                <div class="spell-title"><small>ACTIVE SPELL</small><h2 id="spellName">—</h2></div>
              </header>
              <div class="spell-body">
                <div class="ink-rule"><i></i><span id="spellTag">部队法术</span><i></i></div>
                <p class="spell-copy" id="spellCopy"></p>
                <div class="formula" id="spellFormula"></div>
              </div>
            </article>
            <div class="spell-tip" id="spellTip" hidden role="tooltip">
              <i class="spell-tip-arrow" aria-hidden="true"></i>
              <small id="spellTipTitle">伤害计算</small>
              <em id="spellTipRule"></em>
              <ul id="spellTipRows"></ul>
            </div>
            <section class="growth">
              <div class="section-line"><h2>部队成长</h2><span>等级 <b id="growthLevel">1</b><i> / <span id="growthCap">15</span></i></span></div>
              <div class="growth-track"><i id="growthFill"></i></div>
              <div class="growth-benefit"><span>下一级</span><span id="growthNext">—</span></div>
              <button class="primary" id="upgrade"><span data-icon="chevrons"></span><span>提升等级</span><span class="price"><span data-icon="soul"></span><b id="upgradeCost">0</b></span></button>
              <small class="shared-note">成长对同名部队的全部副本生效</small>
            </section>
            <section class="growth" id="decomposeSection">
              <div class="section-line"><h2>分解 / 保护</h2><span id="decomposeYield">—</span></div>
              <div class="growth-benefit"><span id="lockState">未保护</span></div>
              <div class="decompose-row">
                <button class="secondary" id="toggleLock"><span data-icon="lock"></span><span id="lockLabel">开启分解保护</span></button>
                <button class="secondary" id="decompose"><span data-icon="coin"></span><span id="decomposeLabel">分解 1 张副本</span></button>
              </div>
            </section>
          </section>
          <section class="portrait-column" aria-label="部队卡">
            <div class="rarity-label"><i></i><span id="rarityLabel">—</span><i></i></div>
            <div class="card-stage">
              <article class="character-card" id="characterCard">
                <img class="portrait" id="portraitArt" alt=""><div class="portrait-shade"></div><div class="card-frame" aria-hidden="true"></div>
                <span class="unowned-mark" id="unownedMark" hidden><span data-icon="lock"></span>未获得</span>
                <div class="mana-gem" id="manaGem" role="img" aria-label="法力颜色"></div><div class="magic-badge"><span data-icon="orb"></span><b id="magicStat">0</b></div><div class="trait-diamonds" aria-label="0 / 3 特质已解锁"><i></i><i></i><i></i></div>
                <div class="card-name"><small id="cardTitle">TROOP</small><h2 id="cardName">—</h2><span id="cardType">—</span></div><div class="card-stats"><div class="stat-atk"><span data-icon="swords"></span><b id="attackStat">0</b></div><div class="stat-armor"><span data-icon="shield"></span><b id="armorStat">0</b></div><div class="stat-hp"><span data-icon="heart"></span><b id="healthStat">0</b></div></div>
                <div class="card-level"><span>LEVEL <b id="cardLevel">1</b><i>/<span id="cardLevelCap">15</span></i></span><div class="rank" id="rankPips"></div><span id="owned">×1</span></div>
              </article>
              <div class="card-ornament" data-ornament></div>
            </div>
            <div class="portrait-controls"><button id="previous" aria-label="浏览部队"><span data-icon="arrow"></span></button><span id="portraitCaption">—</span><button id="next" aria-label="浏览部队"><span data-icon="arrow"></span></button></div>
          </section>
          <section class="right-column">
            <div class="trait-heading"><div><small>PASSIVE ABILITIES</small><h2>天赋特质</h2></div><span id="traitCount">0 / 3 已解锁</span></div>
            <div class="trait-list" id="traitList"></div>
            <div class="unlock-block">
              <div class="unlock-cost" id="unlockCost">—</div>
              <button class="secondary" id="unlock"><span data-icon="lock"></span><span id="unlockLabel">解锁特质</span></button>
            </div>
            <section class="ascension">
              <div class="section-line"><h2>升阶</h2><span><b id="copies">0</b> / <span id="copiesNeed">5</span></span></div>
              <div class="ascension-gems" id="ascensionGems" aria-label="同名卡"></div>
              <div class="ascension-caption"><span id="copyCaption">—</span><button id="ascend">升一阶</button></div>
            </section>
            <div class="protected" id="protectedNote" hidden><span data-icon="lock"></span>已锁定 · 防止误分解</div>
          </section>
        </div>
      </main>
      <main id="collection" hidden>
        <div class="collection-heading"><div><small>THE BESTIARY · 1,798 CARDS</small><h1>我的收藏</h1></div><span>已拥有 <b id="ownedTotal">0</b> / 1,798 名部队</span><button class="secondary" id="returnDetail">查看详情<span data-icon="arrow"></span></button></div>
        <div class="collection-progress"><span>总进度</span><div><i id="ownedProgress" style="width:0%"></i></div><b id="ownedPercent">0%</b></div>
        <div class="collection-filter">
          <div class="filter-row">
            <button class="selected" data-tab="owned">已拥有</button><button data-tab="all">全部</button>
            <span class="divider"></span>
            <small class="filter-label">品质</small>
            <div class="rarity-chips" id="rarityChips">
              <button class="filter-chip selected" data-rarity="">全部</button>
              <button class="filter-chip" data-rarity="0">普通</button>
              <button class="filter-chip" data-rarity="1">非普</button>
              <button class="filter-chip" data-rarity="2">稀有</button>
              <button class="filter-chip" data-rarity="3">超稀有</button>
              <button class="filter-chip" data-rarity="4">史诗</button>
              <button class="filter-chip" data-rarity="5">传说</button>
            </div>
            <span class="divider"></span>
            <small class="filter-label">魔法</small>
            <div class="color-chips" id="colorChips"></div>
            <span class="divider"></span>
            <select id="typeSelect" aria-label="按种族筛选"><option value="">全部种族</option></select>
            <select id="kingdomSelect" aria-label="按王国筛选"><option value="">全部王国</option></select>
            <button class="filter-reset" id="resetFilters" hidden>重置筛选</button>
          </div>
          <div class="filter-row filter-row-foot">
            <small id="shownCount"></small>
            <small>点击卡片查看详情 · 未获得的部队也可查看图鉴</small>
            <label class="filter-search"><span data-icon="funnel"></span><input id="collectionSearch" placeholder="搜索部队名"></label>
          </div>
        </div>
        <div id="collectionBands"></div>
        <p class="collection-note">点击卡片查看养成详情 · 未获得的部队也可查看图鉴资料</p>
      </main>
      ${bottomNavHtml('图鉴', '全图鉴 1,798 支')}
      ${toastHtml()}
      <div class="modal-veil" id="modal" hidden><section class="modal etched" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><small>TROOP GROWTH</small><h2 id="modalTitle">提升部队等级</h2><p id="modalCopy">—</p><div class="stat-preview" id="modalPreview"></div><button class="primary" id="confirmUpgrade">确认提升</button><button class="cancel" id="cancelUpgrade">暂不提升</button></section></div>`;
  }

  mount(ctx: ShellCtx, _root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    // 深链（#troop/123，如编队页「图鉴」按钮）直达详情；纯 #troop 落在图鉴列表
    const deepLink = !!(param && Number(param));
    if (deepLink) this.currentId = Number(param);
    if (!this.currentId) this.currentId = this.firstOwnedId(ctx);
    const portrait = $('#portraitArt') as HTMLImageElement;
    // 持久兜底链：每次 paintDetail 会同时写 src 与 data-fb（剩余兜底地址），失败沿链走一步
    portrait.onerror = () => {
      const fb: string[] = JSON.parse(portrait.dataset.fb || '[]');
      const i = fb.indexOf(portrait.getAttribute('src') ?? '');
      if (i + 1 < fb.length) portrait.src = fb[i + 1]!;
    };
    const ornament = $('[data-ornament]');
    if (ornament) {
      import('../shell/battleIcons').then((m) => {
        ornament.innerHTML = m.BATTLE_ORNAMENT;
      });
    }

    this.bind('#back', 'click', () => this.showView('collection', true));
    this.bind('#returnDetail', 'click', () => this.showView('detail'));
    this.bind('#previous', 'click', () => this.stepOwned(-1));
    this.bind('#next', 'click', () => this.stepOwned(1));
    this.bind('#upgrade', 'click', () => this.openUpgradeModal());
    this.bind('#cancelUpgrade', 'click', () => ($('#modal').hidden = true));
    this.bind('#confirmUpgrade', 'click', () => void this.confirmUpgrade());
    this.bind('#unlock', 'click', () => void this.unlockNextTrait());
    this.bind('#ascend', 'click', () => void this.ascend());
    this.bind('#toggleLock', 'click', () => void this.toggleLock());
    this.bind('#decompose', 'click', () => void this.decompose());
    $$('#collection [data-tab]').forEach((tab) =>
      this.on(tab, 'click', () => {
        this.collectionMode = (tab as HTMLElement).dataset.tab as 'owned' | 'all';
        $$('#collection [data-tab]').forEach((x) => x.classList.toggle('selected', x === tab));
        this.renderCollection();
      }),
    );
    this.on($('#rarityChips'), 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-rarity]') as HTMLElement | null;
      if (!chip) return;
      this.rarityFilter = chip.dataset.rarity === '' ? null : Number(chip.dataset.rarity);
      $$('#rarityChips [data-rarity]').forEach((x) => x.classList.toggle('selected', x === chip));
      this.renderCollection();
    });
    const colorChips = $('#colorChips');
    colorChips.innerHTML = COLOR_ORDER.map(
      (c) => `<button class="color-chip" data-color="${c}" title="${COLOR_CN[c]}色魔法">${gemSvg([c])}</button>`,
    ).join('');
    this.on(colorChips, 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-color]') as HTMLElement | null;
      if (!chip) return;
      this.colorFilter = this.colorFilter === chip.dataset.color ? null : chip.dataset.color!;
      $$('#colorChips [data-color]').forEach((x) => x.classList.toggle('selected', x.dataset.color === this.colorFilter));
      this.renderCollection();
    });
    const typeSelect = $('#typeSelect') as HTMLSelectElement;
    const types = new Set<string>();
    for (const t of TROOPS) for (const ty of t.troopTypes) types.add(ty);
    for (const ty of types) {
      const opt = document.createElement('option');
      opt.value = ty;
      opt.textContent = typeCn([ty]);
      typeSelect.appendChild(opt);
    }
    this.on(typeSelect, 'change', () => {
      this.typeFilter = typeSelect.value || null;
      this.renderCollection();
    });
    const kingdomSelect = $('#kingdomSelect') as HTMLSelectElement;
    for (const kingdom of new Set(TROOPS.map((t) => t.kingdom ?? '无王国'))) {
      const opt = document.createElement('option');
      opt.value = kingdom;
      opt.textContent = kingdom;
      kingdomSelect.appendChild(opt);
    }
    this.on(kingdomSelect, 'change', () => {
      this.kingdomFilter = kingdomSelect.value || null;
      this.renderCollection();
    });
    this.bind('#resetFilters', 'click', () => {
      this.rarityFilter = this.colorFilter = this.typeFilter = this.kingdomFilter = null;
      ($('#collectionSearch') as HTMLInputElement).value = '';
      $$('#rarityChips [data-rarity]').forEach((x) => x.classList.toggle('selected', x.dataset.rarity === ''));
      $$('#colorChips [data-color]').forEach((x) => x.classList.remove('selected'));
      typeSelect.value = '';
      kingdomSelect.value = '';
      this.renderCollection();
    });
    let searchTimer = 0;
    this.on($('#collectionSearch'), 'input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => this.renderCollection(), 200);
    });
    this.on($('.stage'), 'click', (e) => {
      if (!(e.target as HTMLElement).closest('#spellCopy .spell-stat, #spellTip')) this.closeSpellTip();
    });
    this.on(window, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.closeSpellTip();
        $('#modal').hidden = true;
      }
    });

    this.paintDetail();
    this.renderCollection();
    this.showView(deepLink ? 'detail' : 'collection', true);
  }

  // —— 数据 ——

  private firstOwnedId(ctx: ShellCtx): number {
    const keys = Object.keys(ctx.save().collection);
    return keys.length ? Number(keys[0]) : 0;
  }

  private ownedIds(): number[] {
    return Object.keys(this.ctx.save().collection)
      .map(Number)
      .sort((a, b) => a - b);
  }

  private troop(): TroopData | null {
    return getTroopById(this.currentId) ?? null;
  }

  private rec() {
    return getRecord(this.ctx.save(), this.currentId) ?? null;
  }

  // —— 详情渲染 ——

  private paintDetail(): void {
    const troop = this.troop();
    if (!troop) return;
    const ownedRec = getRecord(this.ctx.save(), this.currentId);
    const rec = ownedRec ?? UNOWNED_REC;
    const owned = !!ownedRec;
    const stats = troopStatsOf(troop, rec);
    const cap = levelCapFor(troop.rarityIdx, rec.ascension);
    const tier = rarityTierOf(troop, rec);
    const rarityName = (RARITY_ORDER[tier] ?? 'COMMON').toUpperCase();

    const portraitEl = $('#portraitArt') as HTMLImageElement;
    const artChain = troopArtChain(troop);
    portraitEl.dataset.fb = JSON.stringify(artChain.slice(1));
    portraitEl.src = artChain[0]!;
    portraitEl.alt = troop.name;
    $('#characterCard').classList.toggle('unowned', !owned);
    $('#unownedMark').hidden = owned;
    $('#cardTitle').textContent = troop.referenceName.toUpperCase();
    $('#cardName').textContent = spaced(troop.name);
    $('#cardType').textContent = typeCn(troop.troopTypes) + (troop.kingdom ? ' · ' + troop.kingdom : '');
    $('#rarityLabel').textContent = rarityName;
    $('#magicStat').textContent = String(stats.magic);
    $('#attackStat').textContent = String(stats.attack);
    $('#armorStat').textContent = String(stats.armor);
    $('#healthStat').textContent = String(stats.health);
    $('#cardLevel').textContent = String(rec.level);
    $('#cardLevelCap').textContent = String(cap);
    $('#growthLevel').textContent = String(rec.level);
    $('#growthCap').textContent = String(cap);
    $('#growthFill').style.width = `${(rec.level / cap) * 100}%`;
    $('#owned').textContent = owned ? '×' + (rec.copies + 1) : '×0';
    $('#copies').textContent = String(rec.copies);
    $('#copyCaption').textContent = owned ? `持有 ${rec.copies + 1} 张 · 可用副本 ${rec.copies} 张` : '尚未获得 · 图鉴资料仅供参考';
    $('#portraitCaption').innerHTML = owned ? `${troop.name} <i>·</i> 已拥有 ${rec.copies + 1} 张` : `${troop.name} <i>·</i> 尚未获得`;
    $('#rankPips').innerHTML = [0, 1, 2].map((i) => `<i${i < rec.ascension ? ' class="on"' : ''}></i>`).join('');
    // 页码按全图鉴（1798）导航，左右箭头同样遍历全图鉴
    const dex = TROOPS.map((t) => t.id);
    $('#pageIndex').textContent = String(Math.max(0, dex.indexOf(this.currentId)) + 1).padStart(3, '0');
    $('#pageTotal').textContent = String(dex.length).padStart(3, '0');
    const gem = $('#manaGem') as HTMLElement;
    gem.innerHTML = gemSvg(troop.manaColors.map((c) => c.toLowerCase()));
    gem.setAttribute('aria-label', chargeText(troop.manaColors.map((c) => c.toLowerCase())));
    const ambient = $('.ambient');
    if (ambient) ambient.style.background = `linear-gradient(90deg,#0e0e18 5%,#0e0e1899 48%,#0e0e18 97%),url("${troopArt(troop)}") center 33%/1050px no-repeat,url("${troopArtFallback(troop)}") center 33%/1050px no-repeat`;

    this.paintSpell(troop, stats.magic);
    this.paintGrowth(troop, rec, owned);
    this.paintTraits(troop, rec, owned);
    this.paintAscension(troop, rec, owned);
    this.paintProtection(troop, rec, owned);
  }

  private paintSpell(troop: TroopData, magic: number): void {
    this.magic = magic;
    const parsed = renderSpell(troop.spell.description, magic);
    this.formulas = parsed.formulas;
    $('#spellName').textContent = spaced(troop.spell.name);
    $('#spellTag').textContent = troop.kingdom ? `${troop.kingdom} · 部队法术` : '部队法术';
    $('#spellCopy').innerHTML = parsed.html;
    $('#spellMark').innerHTML = gemSvg(troop.manaColors.map((c) => c.toLowerCase())) + `<b>${troop.manaCost}</b>`;
    this.bindSpellTips();
    const formulaBar = $('#spellFormula');
    if (!parsed.formulas.length) {
      formulaBar.hidden = true;
      formulaBar.innerHTML = '';
      return;
    }
    formulaBar.hidden = false;
    const first = parsed.formulas[0]!;
    formulaBar.innerHTML = `<span>效果</span><strong>${formulaRule(first.expr)}</strong><em>${chargeText(troop.manaColors.map((c) => c.toLowerCase()))}</em>`;
  }

  private closeSpellTip(): void {
    const tip = $('#spellTip');
    const formula = $('#spellFormula');
    if (formula) formula.style.visibility = '';
    document.querySelectorAll('#spellCopy .spell-stat[aria-expanded="true"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
    if (tip) tip.hidden = true;
  }

  private openSpellTip(btn: HTMLElement, index: number): void {
    const formula = this.formulas[index];
    if (!formula) return;
    const tip = $('#spellTip');
    const parts = formulaParts(formula.expr, this.magic);
    const kind = /伤害/.test(formula.unit) ? '伤害' : /生命/.test(formula.unit) ? '生命' : /护甲/.test(formula.unit) ? '护甲' : /攻击/.test(formula.unit) ? '攻击' : /法力|魔法/.test(formula.unit) ? '法力' : '效果';
    $('#spellTipTitle').textContent = kind + '计算';
    $('#spellTipRule').textContent = formulaRule(formula.expr);
    $('#spellTipRows').innerHTML =
      parts.rows.map((row) => `<li><span>${row.label}</span><b>${row.value}</b></li>`).join('') +
      `<li class="sum"><span>合计</span><b>${parts.total ?? '—'}</b></li>`;
    document.querySelectorAll('#spellCopy .spell-stat').forEach((el) => el.setAttribute('aria-expanded', el === btn ? 'true' : 'false'));
    $('#spellFormula').style.visibility = 'hidden';
    tip.hidden = false;
    const scale = Math.min(innerWidth / 1600, innerHeight / 900) || 1;
    const col = $('.left-column').getBoundingClientRect();
    const body = $('.spell-body').getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const left = (body.left - col.left) / scale + 16;
    const width = body.width / scale - 32;
    const top = (r.bottom - col.top) / scale + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.width = width + 'px';
    const arrow = tip.querySelector<HTMLElement>('.spell-tip-arrow');
    if (arrow) arrow.style.left = (r.left + r.width / 2 - col.left) / scale - left + 'px';
  }

  private bindSpellTips(): void {
    this.closeSpellTip();
    document.querySelectorAll('#spellCopy .spell-stat').forEach((el, i) => {
      const btn = el as HTMLElement;
      this.on(btn, 'click', (e) => {
        e.stopPropagation();
        if (btn.getAttribute('aria-expanded') === 'true') this.closeSpellTip();
        else this.openSpellTip(btn, i);
      });
    });
  }

  private paintGrowth(troop: TroopData, rec: TroopRecord, owned: boolean): void {
    const cap = levelCapFor(troop.rarityIdx, rec.ascension);
    const cost = rec.level < cap ? totalSoulCost(troop.rarityIdx, rec.level, rec.level + 1) : 0;
    const atCap = rec.level >= cap;
    const nextStats = atCap ? null : troopStatsOf(troop, { ...rec, level: rec.level + 1 });
    const cur = troopStatsOf(troop, rec);
    $('#growthNext').innerHTML = !owned
      ? '获得该部队后可提升等级'
      : atCap
        ? '已达稀有度上限 · 升阶可提升'
        : `生命 <b>+${nextStats!.health - cur.health}</b> 护甲 <b>+${nextStats!.armor - cur.armor}</b>`;
    const btn = $('#upgrade') as HTMLButtonElement;
    btn.disabled = !owned || atCap;
    $('#upgradeCost').textContent = owned ? fmt(cost) : '—';
  }

  private paintTraits(troop: TroopData, rec: TroopRecord, owned: boolean): void {
    const unlockedCount = rec.traits.filter(Boolean).length;
    $('#traitCount').textContent = `${unlockedCount} / 3 已解锁`;
    const list = $('#traitList');
    const slots = [0, 1, 2];
    // 同屏去重 + 按本卡稀有度档选图标质感（低稀有度朴素、高稀有度华丽）
    const glyphs = traitGlyphsFor(slots.map((i) => troop.traits[i]), rarityTierOf(troop, rec));
    list.innerHTML = slots
      .map((i) => {
        const def = troop.traits[i];
        const unlocked = rec.traits[i]!;
        const name = def?.name ?? '未开槽';
        const text = def?.description ?? '该部队没有第三个特质。';
        const glyph = glyphs[i]!;
        return `<article class="trait${unlocked ? '' : ' locked'}"${i === 2 ? ' id="lastTrait"' : ''}>
          <span class="trait-glyph">${glyph}</span>
          <div><small>TRAIT ${['I', 'II', 'III'][i]}</small><h3>${spaced(name)}</h3><p>${text.replace(/(\d+(?:\.\d+)?%?)/g, '<b class="spell-stat">$1</b>')}</p></div>
          <span class="${unlocked ? 'acquired' : 'lock-icon'}" data-icon="${unlocked ? 'check' : 'lock'}"></span>
        </article>`;
      })
      .join('');
    mountIcons(list);
    document.querySelectorAll('.trait-diamonds i').forEach((el, i) => el.classList.toggle('on', i < unlockedCount));

    // 下一个待解锁槽位与代价
    const nextSlot = rec.traits.findIndex((v) => !v) + 1;
    const unlockBtn = $('#unlock') as HTMLButtonElement;
    if (!owned) {
      unlockBtn.disabled = true;
      $('#unlockLabel').textContent = '获得后可解锁';
      $('#unlockCost').innerHTML = '—';
    } else if (nextSlot <= 0 || !troop.traits[nextSlot - 1]) {
      unlockBtn.disabled = true;
      $('#unlockLabel').textContent = nextSlot <= 0 ? '特质全解锁' : '无更多特质';
      $('#unlockCost').innerHTML = '—';
    } else {
      const primary = stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown);
      const cost = traitUnlockCost(nextSlot, primary);
      unlockBtn.disabled = false;
      $('#unlockLabel').textContent = `解锁特质 ${['Ⅰ', 'Ⅱ', 'Ⅲ'][nextSlot - 1]}`;
      $('#unlockCost').innerHTML = `<span><span data-icon="coin"></span>${fmt(cost.gold)}</span>`
        + Object.entries(cost.stones).map(([key, n]) => `<span>${stoneName(key)} ×${n}</span>`).join('');
      mountIcons($('#unlockCost'));
    }
  }

  private paintAscension(_troop: TroopData, rec: TroopRecord, owned: boolean): void {
    const need = rec.ascension >= MAX_ASCENSION ? 0 : ascensionCopiesNeeded(rec.ascension);
    $('#copiesNeed').textContent = String(need);
    const gems = $('#ascensionGems');
    gems.innerHTML = Array.from({ length: Math.max(need, 0) }, (_, i) => `<i${i < rec.copies ? ' class="on"' : ''}></i>`).join('');
    gems.setAttribute('aria-label', `${rec.copies} / ${need} 同名卡`);
    const btn = $('#ascend') as HTMLButtonElement;
    if (!owned) {
      btn.disabled = true;
      btn.textContent = '尚未获得';
      $('#copyCaption').textContent = '尚未获得 · 图鉴资料仅供参考';
    } else if (rec.ascension >= MAX_ASCENSION) {
      btn.disabled = true;
      btn.textContent = '已满阶';
      $('#copyCaption').textContent = `持有 ${rec.copies + 1} 张 · 三阶满阶`;
    } else {
      btn.disabled = rec.copies < need;
      btn.textContent = rec.copies < need ? '副本不足' : '升一阶';
    }
  }

  private paintProtection(troop: TroopData, rec: TroopRecord, owned: boolean): void {
    // 未获得的部队没有副本可分解，整块隐藏
    $('#decomposeSection').hidden = !owned;
    if (!owned) return;
    const yieldInfo = decomposeYield(troop.rarityIdx);
    $('#decomposeYield').textContent = `每张：黄金 +${yieldInfo.gold} · 灵魂 +${yieldInfo.souls}`;
    $('#lockState').textContent = rec.locked ? '分解保护中' : '未保护';
    $('#lockLabel').textContent = rec.locked ? '关闭分解保护' : '开启分解保护';
    ($('#decompose') as HTMLButtonElement).disabled = rec.locked || rec.copies < 1;
    $('#protectedNote').hidden = !rec.locked;
  }

  // —— 网关操作 ——

  private stepOwned(dir: 1 | -1): void {
    // 图鉴页码与箭头都按全图鉴遍历（含未获得的部队）
    const dex = TROOPS.map((t) => t.id);
    if (!dex.length) return;
    const idx = dex.indexOf(this.currentId);
    const next = idx < 0 ? 0 : (idx + dir + dex.length) % dex.length;
    this.currentId = dex[next]!;
    this.paintDetail();
    history.replaceState(null, '', `#troop/${this.currentId}`);
  }

  private openUpgradeModal(): void {
    const troop = this.troop();
    const rec = this.rec();
    if (!troop || !rec) return;
    const cap = levelCapFor(troop.rarityIdx, rec.ascension);
    if (rec.level >= cap) {
      toast('已达当前稀有度上限，先升阶。');
      return;
    }
    const cost = totalSoulCost(troop.rarityIdx, rec.level, rec.level + 1);
    const cur = troopStatsOf(troop, rec);
    const next = troopStatsOf(troop, { ...rec, level: rec.level + 1 });
    const souls = this.ctx.save().currencies.souls;
    $('#modalTitle').textContent = '提升部队等级';
    $('#modalCopy').innerHTML = `${troop.name} <b>Lv.${rec.level} → Lv.${rec.level + 1}</b>`;
    $('#modalPreview').innerHTML =
      `<span>生命 <b>${cur.health} → ${next.health}</b></span><span>护甲 <b>${cur.armor} → ${next.armor}</b></span><span>灵魂 <b id="soulPreview">${fmt(souls)} → ${fmt(Math.max(0, souls - cost))}</b></span>`;
    $('#confirmUpgrade').textContent = `确认提升 · ${fmt(cost)} 灵魂`;
    $('#modal').hidden = false;
    $('#confirmUpgrade').focus();
  }

  private async confirmUpgrade(): Promise<void> {
    const { result } = await this.ctx.gateway.levelUpTroop(this.currentId);
    $('#modal').hidden = true;
    if (result.ok) {
      toast(`提升至 Lv.${result.to} · 灵魂 −${fmt(result.soulsSpent)}`);
      this.afterMutation();
    } else {
      toast(result.message);
    }
  }

  private async unlockNextTrait(): Promise<void> {
    const rec = this.rec();
    if (!rec) return;
    const slot = rec.traits.findIndex((v) => !v) + 1;
    if (slot <= 0) return;
    const { result } = await this.ctx.gateway.unlockTroopTrait(this.currentId, slot);
    if (result.ok) {
      const stones = Object.entries(result.cost.stones).map(([key, n]) => `${stoneName(key)}×${n}`).join(' · ');
      toast(`特质已解锁 · 黄金 −${fmt(result.cost.gold)}${stones ? ' · ' + stones : ''}`);
      this.afterMutation();
    } else {
      toast(result.message);
    }
  }

  private async ascend(): Promise<void> {
    const { result } = await this.ctx.gateway.ascendTroop(this.currentId);
    if (result.ok) {
      toast(`升阶成功：${result.ascension} 阶 · 等级上限 ${result.newCap}`);
      this.afterMutation();
    } else {
      toast(result.message);
    }
  }

  private async toggleLock(): Promise<void> {
    const rec = this.rec();
    if (!rec) return;
    const { result } = await this.ctx.gateway.setTroopLocked(this.currentId, !rec.locked);
    toast(result === true ? '已开启分解保护。' : result === false ? '已关闭分解保护。' : '操作失败。');
    this.afterMutation();
  }

  private async decompose(): Promise<void> {
    const troop = this.troop();
    const rec = this.rec();
    if (!troop || !rec) return;
    if (!confirm(`确定分解「${troop.name}」1 张副本吗？（本体保留）`)) return;
    const { result } = await this.ctx.gateway.decomposeTroop(this.currentId);
    if (result.ok) {
      toast(`分解 ${result.count} 张：黄金 +${fmt(result.gained.gold)} · 灵魂 +${fmt(result.gained.souls)}`);
      this.afterMutation();
    } else {
      toast(result.message);
    }
  }

  private afterMutation(): void {
    this.paintDetail();
    this.renderCollection();
  }

  // —— 图鉴视图 ——

  private showView(view: 'detail' | 'collection', syncHash = false): void {
    $('#detail').hidden = view !== 'detail';
    $('#collection').hidden = view !== 'collection';
    // 站内视图切换用 replaceState 同步 hash：既不触发整屏重挂，刷新后也能停在当前位置
    if (syncHash) history.replaceState(null, '', view === 'detail' ? `#troop/${this.currentId}` : '#troop');
  }

  private renderCollection(): void {
    const save = this.ctx.save();
    const total = 1798;
    const ownedCount = Object.keys(save.collection).length;
    $('#ownedTotal').textContent = String(ownedCount);
    $('#ownedProgress').style.width = `${(ownedCount / total) * 100}%`;
    $('#ownedPercent').textContent = `${((ownedCount / total) * 100).toFixed(1)}%`;

    const query = ($('#collectionSearch') as HTMLInputElement).value.trim();
    $('#resetFilters').hidden = !query && this.rarityFilter === null && this.colorFilter === null && this.typeFilter === null && !this.kingdomFilter;
    // 按王国分组：owned = 只看收藏；all = 全量兵种。品质/魔法色/种族/王国/搜索多级筛选
    const bands = new Map<string, TroopData[]>();
    const push = (troop: TroopData): void => {
      if (this.rarityFilter !== null && troop.rarityIdx !== this.rarityFilter) return;
      if (this.colorFilter && !troop.manaColors.some((c) => c.toLowerCase() === this.colorFilter)) return;
      if (this.typeFilter && !troop.troopTypes.includes(this.typeFilter)) return;
      if (query && !troop.name.includes(query) && !troop.referenceName.toLowerCase().includes(query.toLowerCase())) return;
      const key = troop.kingdom ?? '无王国';
      if (!bands.has(key)) bands.set(key, []);
      bands.get(key)!.push(troop);
    };
    if (this.collectionMode === 'owned') {
      for (const id of this.ownedIds()) {
        const troop = getTroopById(id);
        if (troop) push(troop);
      }
    } else {
      for (const troop of TROOPS) push(troop);
    }

    const container = $('#collectionBands');
    const entries = [...bands.entries()].filter(([kingdom]) => !this.kingdomFilter || kingdom === this.kingdomFilter);
    const shown = entries.reduce((n, [, troops]) => n + troops.length, 0);
    $('#shownCount').textContent = `匹配 ${shown} 支`;
    if (!entries.length) {
      container.innerHTML = '<p class="collection-empty">没有符合条件的部队 · 换个品质或王国试试</p>';
      return;
    }
    container.innerHTML = entries
      .map(([kingdom, troops]) => {
        const ownedInKingdom = troops.filter((t) => save.collection[String(t.id)]).length;
        const cards = troops
          .map((t) => {
            const rec = save.collection[String(t.id)];
            const locked = !rec;
            const stats = rec ? troopStatsOf(t, rec) : null;
            return `<button class="collection-card r-${t.rarityIdx}${locked ? ' locked' : ''}" data-troop="${t.id}" aria-label="查看${t.name}">
              <i class="rarity-edge" aria-hidden="true"></i>
              ${troopImg(t, false, `alt="${t.name}"`)}
              <span class="collection-mana">${gemSvg(t.manaColors.map((c) => c.toLowerCase()))}</span>
              <span class="magic-badge">${stats ? stats.magic : '—'}</span>
              ${locked ? '<span class="locked-mark">?</span>' : ''}
              <div class="collection-info"><h2>${t.name}</h2><span><span>${locked ? '尚未获得' : 'Lv.' + rec!.level + ' · ' + (rec!.copies + 1) + ' 张'}</span><span>${typeCn(t.troopTypes)}</span></span></div>
            </button>`;
          })
          .join('');
        // kingdom-section 让分组头只在自身区间内 sticky，不会盖住其他王国
        return `<div class="kingdom-section"><div class="kingdom-band"><span class="band-mark"></span><b>${kingdom}</b><small>收藏进度 ${ownedInKingdom} / ${troops.length}</small><div><i style="width:${troops.length ? (ownedInKingdom / troops.length) * 100 : 0}%"></i></div></div><div class="collection-cards">${cards}</div></div>`;
      })
      .join('');
    mountIcons(container);
    $$('#collectionBands [data-troop]').forEach((btn) =>
      this.on(btn, 'click', () => {
        // 未获得的部队也进详情查看图鉴资料（详情页有未获得态）
        this.currentId = Number((btn as HTMLElement).dataset.troop);
        this.paintDetail();
        this.showView('detail', true);
      }),
    );
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
