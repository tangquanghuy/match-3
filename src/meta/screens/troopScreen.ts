/**
 * 部队图鉴 + 养成详情屏（计划 §5.4 + §5.5，一屏两视图）。
 * 数据全部来自 troops.json + 收藏存档；升级/升阶/特质/分解/保护走网关。
 */
import { getTroopById, TROOPS, type TroopData } from '../../data/troops';
import type { TeamPreset, TroopRecord } from '../state/schema';
import { MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../systems/teamRules';
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
import { bottomNavHtml, icon, mountIcons, toast, toastHtml, topbarHtml, gemSvg, $, $$ } from '../shell/chrome';
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
/** 稀有度中文（与品质 chip 文案同源） */
const RARITY_CN = ['普通', '非普', '稀有', '超稀有', '史诗', '传说'] as const;
/** 筛选维度（摘要 chip 撤销 / 空态逐条回退用） */
type FilterDim = 'rarity' | 'color' | 'type' | 'kingdom' | 'search' | 'tab';

/** 搜索用的文本袋：名字 + 英文名 + 王国 + 种族 + 法术名/描述 + 特质名/描述（阶段 A 只搜名字） */
const hayCache = new Map<number, string>();
function haystack(t: TroopData): string {
  let hay = hayCache.get(t.id);
  if (hay === undefined) {
    hay = [
      t.name,
      t.referenceName,
      t.kingdom ?? '',
      typeCn(t.troopTypes),
      t.troopTypes.join(' '),
      t.spell?.name ?? '',
      t.spell?.description ?? '',
      ...t.traits.flatMap((tr) => (tr ? [tr.name, tr.description] : [])),
    ]
      .join(' ')
      .toLowerCase();
    hayCache.set(t.id, hay);
  }
  return hay;
}
const COLOR_ORDER = ['red', 'green', 'blue', 'yellow', 'purple', 'brown'] as const;
const chargeText = (colors: readonly string[]): string =>
  colors.length >= 6
    ? '任意颜色宝石为此法术充能'
    : colors.map((c) => (COLOR_CN[c.toLowerCase()] ?? c) + '色').join('、') + '宝石为此法术充能';

/** 图鉴查看未获得部队用的空白记录（1 级 / 0 阶 / 特质全锁） */
const UNOWNED_REC: TroopRecord = { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };

/**
 * 排序表（T-3：阶段 A 实测「一个排序都没有」）。
 * 「收藏时间」需要存档加获得时间戳（schema 是共享文件），留到后续批次提案。
 */
const SORTS = [
  { key: 'level-desc', label: '等级 ↓' },
  { key: 'level-asc', label: '等级 ↑' },
  { key: 'rarity-desc', label: '稀有度 ↓' },
  { key: 'rarity-asc', label: '稀有度 ↑' },
  { key: 'attack-desc', label: '攻击 ↓' },
  { key: 'health-desc', label: '生命 ↓' },
  { key: 'copies-desc', label: '副本数 ↓' },
  { key: 'dex-asc', label: '图鉴号 ↑' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];
const DEFAULT_SORT: SortKey = 'level-desc';

/** 「全部」态分段渲染的每段卡数（T-2：一次性 1798 张 = 38,073 节点 / 70ms 阻塞） */
const SEGMENT = 200;
/** 距底多少像素开始追加下一段 */
const APPEND_MARGIN = 700;

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
  private sortKey: SortKey = DEFAULT_SORT;
  /** 'none' = 密排（默认，T-1）；'kingdom' = 王国分组（与王国筛选互斥） */
  private groupMode: 'none' | 'kingdom' = 'none';
  /** 当前筛选+排序后的集合——详情页左右箭头只在这个集合内走（T-5） */
  private listIds: number[] = [];
  /** 分段渲染游标 */
  private flat: TroopData[] = [];
  private sections: Array<[string, TroopData[]]> = [];
  private cursor = 0;
  /** 详情↔图鉴往返时保留的滚动位置（T-9） */
  private collectionScroll = 0;
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
            <section class="growth danger" id="decomposeSection">
              <div class="section-line"><h2>分解 / 保护</h2><span id="decomposeYield">—</span></div>
              <div class="growth-benefit"><span id="lockState">未保护</span></div>
              <div class="decompose-row">
                <button class="secondary" id="toggleLock"><span data-icon="lock"></span><span id="lockLabel">开启分解保护</span></button>
                <button class="secondary" id="decompose"><span data-icon="coin"></span><span id="decomposeLabel">分解 1 张副本</span></button>
              </div>
            </section>
          </section>
          <section class="portrait-column" aria-label="部队卡">
            <div class="rarity-label" id="rarityBadge"><i></i><span id="rarityLabel">—</span><i></i></div>
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
            <div class="portrait-controls"><button id="previous" aria-label="上一张（当前筛选集合内）"><span data-icon="arrow"></span></button><span id="portraitCaption">—</span><button id="next" aria-label="下一张（当前筛选集合内）"><span data-icon="arrow"></span></button></div>
            <!-- T-5 养成动线出口：编入队伍。行内样式是临时占位，L 交付 .btn 基类后换类名 -->
            <div class="enlist-row" id="enlistRow" style="display:flex;gap:10px;align-items:stretch;margin-top:10px">
              <button class="primary" id="enlist" style="flex:1"><span data-icon="shield"></span><span id="enlistLabel">编入队伍</span></button>
              <select id="enlistSlot" aria-label="选择站位" style="min-width:148px"></select>
            </div>
            <small class="shared-note" id="enlistHint">—</small>
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
              <div class="growth-benefit"><span>收益</span><span id="ascendBenefit">—</span></div>
              <div class="ascension-gems" id="ascensionGems" aria-label="同名卡"></div>
              <div class="ascension-caption"><span id="copyCaption">—</span><button id="ascend">升一阶</button></div>
            </section>
            <div class="protected" id="protectedNote" hidden><span data-icon="lock"></span>已锁定 · 防止误分解</div>
          </section>
        </div>
      </main>
      <main id="collection" hidden>
        <div class="collection-heading"><div><small>THE BESTIARY · ${fmt(TROOPS.length)} CARDS</small><h1>我的收藏</h1></div><span>已拥有 <b id="ownedTotal">0</b> / ${fmt(TROOPS.length)} 名部队</span><button class="secondary" id="returnDetail">查看详情<span data-icon="arrow"></span></button></div>
        <div class="collection-progress"><span>总进度</span><div><i id="ownedProgress" style="width:0%"></i></div><b id="ownedPercent">0%</b></div>
        <div class="collection-filter">
          <div class="filter-row">
            <button class="selected" data-tab="owned">已拥有 <i id="tabOwnedCount">0</i></button><button data-tab="all">全部 <i id="tabAllCount">${fmt(TROOPS.length)}</i></button>
            <span class="divider"></span>
            <small class="filter-label">品质</small>
            <div class="rarity-chips" id="rarityChips">
              <button class="filter-chip selected" data-rarity="">全部 <i data-chip-count></i></button>
              <button class="filter-chip" data-rarity="0">普通 <i data-chip-count></i></button>
              <button class="filter-chip" data-rarity="1">非普 <i data-chip-count></i></button>
              <button class="filter-chip" data-rarity="2">稀有 <i data-chip-count></i></button>
              <button class="filter-chip" data-rarity="3">超稀有 <i data-chip-count></i></button>
              <button class="filter-chip" data-rarity="4">史诗 <i data-chip-count></i></button>
              <button class="filter-chip" data-rarity="5">传说 <i data-chip-count></i></button>
            </div>
            <span class="divider"></span>
            <small class="filter-label">魔法</small>
            <div class="color-chips" id="colorChips"></div>
            <span class="divider"></span>
            <select id="typeSelect" aria-label="按种族筛选"><option value="">全部种族</option></select>
            <select id="kingdomSelect" aria-label="按王国筛选"><option value="">全部王国</option></select>
            <button class="filter-reset is-off" id="resetFilters">重置筛选</button>
          </div>
          <div class="filter-row filter-row-foot">
            <span class="filter-label">排序</span>
            <select id="sortSelect" aria-label="排序方式">
              ${SORTS.map((s) => `<option value="${s.key}"${s.key === DEFAULT_SORT ? ' selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <span class="filter-label">分组</span>
            <select id="groupSelect" aria-label="分组方式"><option value="none">不分组</option><option value="kingdom">按王国</option></select>
            <span class="divider"></span>
            <div class="active-filters" id="activeFilters" style="display:flex;gap:5px;flex-wrap:nowrap"></div>
            <small id="shownCount"></small>
            <label class="filter-search"><span data-icon="funnel"></span><input id="collectionSearch" placeholder="搜索名字 / 法术 / 特质"></label>
          </div>
        </div>
        <div id="collectionBands"></div>
        <p class="collection-note">点击卡片查看养成详情 · 未获得的部队也可查看图鉴资料</p>
      </main>
      ${bottomNavHtml('图鉴', `全图鉴 ${fmt(TROOPS.length)} 支`)}
      ${toastHtml()}
      <div class="modal-veil" id="modal" hidden><section class="modal etched" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><small>TROOP GROWTH</small><h2 id="modalTitle">提升部队等级</h2><p id="modalCopy">—</p><ul class="modal-lines" id="modalPreview"></ul><button class="primary" id="confirmUpgrade">确认提升</button><button class="cancel" id="cancelUpgrade">暂不提升</button></section></div>
      <!-- T-16：分解是永久销毁，自绘危险确认弹层替掉浏览器原生 confirm() -->
      <div class="modal-veil" id="dangerModal" hidden><section class="modal etched danger" role="dialog" aria-modal="true" aria-labelledby="dangerTitle"><small>PERMANENT ACTION</small><h2 id="dangerTitle">分解副本</h2><p id="dangerCopy">—</p><ul class="modal-lines" id="dangerPreview"></ul><button class="primary" id="confirmDanger">确认分解</button><button class="cancel" id="cancelDanger">取消</button></section></div>`;
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
    this.bind('#decompose', 'click', () => this.askDecompose());
    this.bind('#confirmDanger', 'click', () => void this.decompose());
    this.bind('#cancelDanger', 'click', () => ($('#dangerModal').hidden = true));
    this.bind('#enlist', 'click', () => void this.toggleEnlist());
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
    // 种族 34 项：按中文名排序（阶段 A：顺序 = 数据出现顺序，无序不可扫）
    const typeSelect = $('#typeSelect') as HTMLSelectElement;
    const types = new Set<string>();
    for (const t of TROOPS) for (const ty of t.troopTypes) types.add(ty);
    for (const ty of [...types].sort((a, b) => typeCn([a]).localeCompare(typeCn([b]), 'zh-Hans-CN'))) {
      const opt = document.createElement('option');
      opt.value = ty;
      opt.textContent = typeCn([ty]);
      typeSelect.appendChild(opt);
    }
    this.on(typeSelect, 'change', () => {
      this.typeFilter = typeSelect.value || null;
      this.renderCollection();
    });
    // 王国 43 项：按中文名排序
    const kingdomSelect = $('#kingdomSelect') as HTMLSelectElement;
    for (const kingdom of [...new Set(TROOPS.map((t) => t.kingdom ?? '无王国'))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
      const opt = document.createElement('option');
      opt.value = kingdom;
      opt.textContent = kingdom;
      kingdomSelect.appendChild(opt);
    }
    this.on(kingdomSelect, 'change', () => {
      this.kingdomFilter = kingdomSelect.value || null;
      this.renderCollection();
    });
    const sortSelect = $('#sortSelect') as HTMLSelectElement;
    sortSelect.value = this.sortKey;
    this.on(sortSelect, 'change', () => {
      this.sortKey = (sortSelect.value || DEFAULT_SORT) as SortKey;
      this.renderCollection();
    });
    const groupSelect = $('#groupSelect') as HTMLSelectElement;
    groupSelect.value = this.groupMode;
    this.on(groupSelect, 'change', () => {
      this.groupMode = groupSelect.value === 'kingdom' ? 'kingdom' : 'none';
      this.renderCollection();
    });
    // 「重置筛选」连 tab 一起重置（阶段 A：tab 是唯一逃过重置的维度）
    this.bind('#resetFilters', 'click', () => this.resetFilters());
    // 筛选摘要 chip 行：单条 ✕ 撤销
    this.on($('#activeFilters'), 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-drop]') as HTMLElement | null;
      if (chip) this.dropFilter(chip.dataset.drop as FilterDim);
    });
    // 空态里的出路（去宝箱/去地图/放宽筛选/清空搜索）
    this.on($('#collectionBands'), 'click', (e) => {
      const act = (e.target as HTMLElement).closest('[data-empty-act]') as HTMLElement | null;
      if (!act) return;
      const action = act.dataset.emptyAct!;
      if (action === 'chests' || action === 'map') return void this.ctx.navigate('#' + action);
      if (action === 'reset') return this.resetFilters();
      if (action === 'clear-search') {
        ($('#collectionSearch') as HTMLInputElement).value = '';
        return this.renderCollection();
      }
      this.dropFilter(action as FilterDim);
    });
    // 卡片点击用事件代理（旧实现每次重渲染都给新按钮挂一遍监听，listeners 数组只增不减）
    this.on($('#collectionBands'), 'click', (e) => {
      const card = (e.target as HTMLElement).closest('[data-troop]') as HTMLElement | null;
      if (!card) return;
      this.collectionScroll = $('#collectionBands').scrollTop;
      // 未获得的部队也进详情查看图鉴资料（详情页有未获得态）
      this.currentId = Number(card.dataset.troop);
      this.paintDetail();
      this.showView('detail', true);
    });
    // 分段渲染：滚到段尾追加下一段（T-2）
    this.on($('#collectionBands'), 'scroll', () => {
      const el = $('#collectionBands');
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - APPEND_MARGIN) this.appendSegment();
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
        $('#dangerModal').hidden = true;
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
    $('#rarityLabel').textContent = `${RARITY_CN[tier] ?? ''} · ${rarityName}`;
    $('#rarityBadge').dataset.rarity = String(tier);
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
    this.paintEnlist(owned);
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

  /** 四维差值（只保留真有变化的项，T-11：阶段 A 把「护甲 3 → 3」也当收益列） */
  private statDiffs(troop: TroopData, rec: TroopRecord, toLevel: number): Array<{ label: string; from: number; to: number }> {
    const cur = troopStatsOf(troop, rec);
    const next = troopStatsOf(troop, { ...rec, level: toLevel });
    return (
      [
        { label: '攻击', from: cur.attack, to: next.attack },
        { label: '护甲', from: cur.armor, to: next.armor },
        { label: '生命', from: cur.health, to: next.health },
        { label: '魔法', from: cur.magic, to: next.magic },
      ] as const
    )
      .filter((row) => row.to !== row.from)
      .map((row) => ({ ...row }));
  }

  private paintGrowth(troop: TroopData, rec: TroopRecord, owned: boolean): void {
    const cap = levelCapFor(troop.rarityIdx, rec.ascension);
    const cost = rec.level < cap ? totalSoulCost(troop.rarityIdx, rec.level, rec.level + 1) : 0;
    const atCap = rec.level >= cap;
    const souls = this.ctx.save().currencies.souls;
    const diffs = atCap ? [] : this.statDiffs(troop, rec, rec.level + 1);
    $('#growthNext').innerHTML = !owned
      ? '获得该部队后可提升等级'
      : atCap
        ? '已达稀有度上限 · 升阶可提升'
        : diffs.length
          ? diffs.map((d) => `${d.label} <b>+${d.to - d.from}</b>`).join(' ')
          : '下一级无属性变化（等级本身计入战力上限）';
    const btn = $('#upgrade') as HTMLButtonElement;
    const short = owned && !atCap && souls < cost;
    btn.disabled = !owned || atCap || short;
    // T-10 配套：代价旁边就是余额，买不起直接写"还差多少"而不是点下去赌 toast
    btn.title = short ? `灵魂不足：需要 ${fmt(cost)}，现有 ${fmt(souls)}` : '';
    $('#upgradeCost').innerHTML = owned
      ? short
        ? `${fmt(cost)} <em class="short">还差 ${fmt(cost - souls)}</em>`
        : `${fmt(cost)}`
      : '—';
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
      const save = this.ctx.save();
      // T-10：每一项代价旁边列持有量，不够的标红；凑不齐时按钮直接禁用并写清缺口
      const shortfalls: string[] = [];
      const goldHave = save.currencies.gold;
      if (goldHave < cost.gold) shortfalls.push(`黄金还差 ${fmt(cost.gold - goldHave)}`);
      const stoneRows = Object.entries(cost.stones).map(([key, n]) => {
        const have = save.materials.traitstones[key] ?? 0;
        if (have < n) shortfalls.push(`${stoneName(key)}还差 ${n - have}`);
        return `<span>${stoneName(key)} ×${n}<em class="${have < n ? 'short' : ''}">持有 ${fmt(have)}</em></span>`;
      });
      $('#unlockLabel').textContent = shortfalls.length
        ? `材料不足 · ${shortfalls[0]}`
        : `解锁特质 ${['Ⅰ', 'Ⅱ', 'Ⅲ'][nextSlot - 1]}`;
      unlockBtn.disabled = shortfalls.length > 0;
      unlockBtn.title = shortfalls.join(' · ');
      $('#unlockCost').innerHTML =
        `<span><span data-icon="coin"></span>${fmt(cost.gold)}<em class="${goldHave < cost.gold ? 'short' : ''}">持有 ${fmt(goldHave)}</em></span>`
        + stoneRows.join('');
      mountIcons($('#unlockCost'));
    }
  }

  private paintAscension(troop: TroopData, rec: TroopRecord, owned: boolean): void {
    const need = rec.ascension >= MAX_ASCENSION ? 0 : ascensionCopiesNeeded(rec.ascension);
    // T-10：升阶换来什么——阶段 A 只写 2/5，收益那句话只在成功后的 toast 里出现过
    const capNow = levelCapFor(troop.rarityIdx, rec.ascension);
    const capNext = levelCapFor(troop.rarityIdx, rec.ascension + 1);
    const benefit = $('#ascendBenefit');
    if (benefit) {
      benefit.innerHTML =
        rec.ascension >= MAX_ASCENSION
          ? '已满阶 · 等级上限已到顶'
          : `升一阶 → 等级上限 <b>${capNow} → ${capNext}</b>${capNext === capNow ? '（本档已到表尾，升阶只加星标）' : ''} · 稀有度档 +1`;
    }
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

  /**
   * 左右箭头只在**当前筛选集合**内走（T-5：旧实现遍历全图鉴 1798，
   * 从自己的卡一按就掉进未获得卡里）。集合里没有当前卡时回落全图鉴。
   */
  private browseList(): number[] {
    if (this.listIds.length && this.listIds.includes(this.currentId)) return this.listIds;
    const owned = this.ownedIds();
    if (owned.includes(this.currentId)) return owned;
    return TROOPS.map((t) => t.id);
  }

  private stepOwned(dir: 1 | -1): void {
    const list = this.browseList();
    if (!list.length) return;
    const idx = list.indexOf(this.currentId);
    const next = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
    this.currentId = list[next]!;
    this.paintDetail();
    history.replaceState(null, '', `#troop/${this.currentId}`);
  }

  // —— 编入队伍（T-5） ——

  /** 当前生效队伍在 activeTeamIndex（没有预设队时为 null） */
  private team(): { index: number; preset: TeamPreset } | null {
    const save = this.ctx.save();
    const index = save.teams[save.activeTeamIndex] ? save.activeTeamIndex : 0;
    const preset = save.teams[index];
    return preset ? { index, preset } : null;
  }

  private paintEnlist(owned: boolean): void {
    const row = $('#enlistRow');
    const btn = $('#enlist') as HTMLButtonElement;
    const slot = $('#enlistSlot') as HTMLSelectElement;
    const hint = $('#enlistHint');
    if (!row || !btn || !slot) return;
    const team = this.team();
    if (!owned || !team) {
      btn.disabled = true;
      slot.hidden = true;
      $('#enlistLabel').textContent = owned ? '还没有预设队' : '获得该部队后可编入队伍';
      const why = owned ? '先去队伍页建一支预设队。' : '尚未获得 · 图鉴资料仅供参考';
      btn.title = why;
      if (hint) hint.textContent = why;
      return;
    }
    const at = team.preset.members.findIndex((m) => m.kind === 'troop' && m.troopId === this.currentId);
    if (at >= 0) {
      btn.disabled = false;
      slot.hidden = true;
      $('#enlistLabel').textContent = `已在「${team.preset.name}」第 ${at + 1} 位 · 卸下`;
      const why = `队伍 ${team.preset.members.length} 人 · 最少 ${MIN_TEAM_SIZE} 人`;
      btn.title = why;
      if (hint) hint.textContent = why;
      return;
    }
    btn.disabled = false;
    slot.hidden = false;
    $('#enlistLabel').textContent = '编入队伍';
    const size = team.preset.members.length;
    const slots = Math.min(MAX_TEAM_SIZE, size + 1);
    const keep = slot.value;
    slot.innerHTML = Array.from({ length: slots }, (_, i) => {
      const member = team.preset.members[i];
      const who = !member
        ? '空位'
        : member.kind === 'hero'
          ? '主角'
          : getTroopById(member.troopId)?.name ?? `#${member.troopId}`;
      return `<option value="${i}">第 ${i + 1} 位（${who}）</option>`;
    }).join('');
    slot.value = keep && Number(keep) < slots ? keep : String(slots - 1);
    const why = `编入「${team.preset.name}」· 选中已有站位会替换该成员`;
    btn.title = why;
    slot.title = why;
    if (hint) hint.textContent = why;
  }

  private async toggleEnlist(): Promise<void> {
    const team = this.team();
    const troop = this.troop();
    if (!team || !troop) return;
    const members = [...team.preset.members];
    const at = members.findIndex((m) => m.kind === 'troop' && m.troopId === this.currentId);
    if (at >= 0) {
      if (members.length <= MIN_TEAM_SIZE) {
        toast(`队伍最少 ${MIN_TEAM_SIZE} 人——先补一个人再卸下「${troop.name}」。`);
        return;
      }
      members.splice(at, 1);
    } else {
      const slot = Number(($('#enlistSlot') as HTMLSelectElement).value) || 0;
      if (slot < members.length) members[slot] = { kind: 'troop', troopId: this.currentId };
      else members.push({ kind: 'troop', troopId: this.currentId });
    }
    const { result } = await this.ctx.gateway.saveTeam(team.index, {
      name: team.preset.name,
      members,
      bannerKingdomId: team.preset.bannerKingdomId,
    });
    if (!result.ok) {
      toast(result.issues[0]?.message ?? '编队不合法');
      return;
    }
    toast(at >= 0 ? `已从「${team.preset.name}」卸下 ${troop.name}` : `${troop.name} 已编入「${team.preset.name}」`);
    this.afterMutation();
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
    const souls = this.ctx.save().currencies.souls;
    // T-11：只列真有变化的属性（四维全查），零变化项不再冒充收益
    const diffs = this.statDiffs(troop, rec, rec.level + 1);
    $('#modalTitle').textContent = '提升部队等级';
    $('#modalCopy').innerHTML = `${troop.name} <b>Lv.${rec.level} → Lv.${rec.level + 1}</b>`;
    $('#modalPreview').innerHTML =
      (diffs.length
        ? diffs
            .map((d) => `<li class="gain"><span>${d.label}</span><b>${d.from} → ${d.to}（+${d.to - d.from}）</b></li>`)
            .join('')
        : '<li><span>属性</span><b>本级无属性变化</b></li>')
      + `<li class="cost"><span>灵魂</span><b id="soulPreview">${fmt(souls)} → ${fmt(Math.max(0, souls - cost))}</b></li>`;
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

  /** 分解要二次确认：自绘弹层（T-16），并把"换来什么 / 代价是什么"写清 */
  private askDecompose(): void {
    const troop = this.troop();
    const rec = this.rec();
    if (!troop || !rec || rec.copies < 1) return;
    const gain = decomposeYield(troop.rarityIdx);
    const need = rec.ascension >= MAX_ASCENSION ? 0 : ascensionCopiesNeeded(rec.ascension);
    $('#dangerCopy').innerHTML = `永久销毁「${troop.name}」<b>1 张副本</b>（本体保留，等级与特质不变）`;
    $('#dangerPreview').innerHTML =
      `<li class="gain"><span>换来</span><b>黄金 +${fmt(gain.gold)} · 灵魂 +${fmt(gain.souls)}</b></li>`
      + `<li class="cost"><span>副本</span><b>${rec.copies} → ${rec.copies - 1} 张</b></li>`
      + (need ? `<li><span>升阶进度</span><b>${Math.min(rec.copies, need)} / ${need} → ${Math.min(rec.copies - 1, need)} / ${need}</b></li>` : '')
      + '<li><span>不可撤销</span><b>分解后无法找回</b></li>';
    $('#dangerModal').hidden = false;
    $('#confirmDanger').focus();
  }

  private async decompose(): Promise<void> {
    const troop = this.troop();
    const rec = this.rec();
    $('#dangerModal').hidden = true;
    if (!troop || !rec) return;
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
    if (view === 'detail' && !getTroopById(this.currentId)) {
      // T-13：没有任何卡时不许进"001 / 000"的空白详情
      toast('还没有部队卡可看——先去宝箱开一发。');
      view = 'collection';
    }
    $('#detail').hidden = view !== 'detail';
    $('#collection').hidden = view !== 'collection';
    // 站内视图切换用 replaceState 同步 hash：既不触发整屏重挂，刷新后也能停在当前位置
    if (syncHash) history.replaceState(null, '', view === 'detail' ? `#troop/${this.currentId}` : '#troop');
    if (view === 'collection') this.restoreCollectionScroll();
  }

  /** T-9：详情返回图鉴恢复滚动位置（必要时先补渲染几段） */
  private restoreCollectionScroll(): void {
    const el = $('#collectionBands');
    if (!el) return;
    const target = this.collectionScroll;
    if (target <= 0) return;
    let guard = 0;
    while (el.scrollHeight < target + el.clientHeight && guard < 40) {
      const before = this.cursor;
      this.appendSegment();
      if (this.cursor === before) break;
      guard += 1;
    }
    el.scrollTop = target;
  }

  // —— 筛选管线（T-1~T-4） ——

  /** 当前 tab 的基础集合 */
  private pool(): TroopData[] {
    if (this.collectionMode === 'all') return TROOPS as unknown as TroopData[];
    return this.ownedIds()
      .map((id) => getTroopById(id))
      .filter((t): t is TroopData => !!t);
  }

  private searchQuery(): string {
    const input = $('#collectionSearch') as HTMLInputElement | null;
    return input ? input.value.trim() : '';
  }

  /** skip = 忽略某一维（用于 chip 计数与"是哪个条件筛没了"的逐条回退） */
  private matches(troop: TroopData, query: string, skip?: FilterDim): boolean {
    if (skip !== 'rarity' && this.rarityFilter !== null && troop.rarityIdx !== this.rarityFilter) return false;
    if (skip !== 'color' && this.colorFilter && !troop.manaColors.some((c) => c.toLowerCase() === this.colorFilter)) return false;
    if (skip !== 'type' && this.typeFilter && !troop.troopTypes.includes(this.typeFilter)) return false;
    if (skip !== 'kingdom' && this.kingdomFilter && (troop.kingdom ?? '无王国') !== this.kingdomFilter) return false;
    if (skip !== 'search' && query && !haystack(troop).includes(query.toLowerCase())) return false;
    return true;
  }

  private recOf(troop: TroopData): TroopRecord {
    return this.ctx.save().collection[String(troop.id)] ?? UNOWNED_REC;
  }

  /** 排序（T-3）。同分回落图鉴号，保证同一筛选下顺序稳定可复现 */
  private sortList(list: TroopData[]): TroopData[] {
    const key = this.sortKey;
    const val = (t: TroopData): number => {
      const rec = this.recOf(t);
      switch (key) {
        case 'level-desc':
        case 'level-asc':
          return rec.level * 100 + rec.ascension;
        case 'rarity-desc':
        case 'rarity-asc':
          return rarityTierOf(t, rec) * 100 + rec.level;
        case 'attack-desc':
          return troopStatsOf(t, rec).attack;
        case 'health-desc':
          return troopStatsOf(t, rec).health + troopStatsOf(t, rec).armor / 100;
        case 'copies-desc':
          return rec.copies;
        default:
          return 0;
      }
    };
    const asc = key === 'level-asc' || key === 'rarity-asc' || key === 'dex-asc';
    return [...list].sort((a, b) => {
      if (key === 'dex-asc') return a.id - b.id;
      const d = val(b) - val(a);
      const primary = asc ? -d : d;
      return primary !== 0 ? primary : a.id - b.id;
    });
  }

  private resetFilters(): void {
    this.rarityFilter = this.colorFilter = this.typeFilter = this.kingdomFilter = null;
    this.collectionMode = 'owned';
    ($('#collectionSearch') as HTMLInputElement).value = '';
    this.syncFilterControls();
    this.renderCollection();
  }

  private dropFilter(dim: FilterDim): void {
    if (dim === 'rarity') this.rarityFilter = null;
    else if (dim === 'color') this.colorFilter = null;
    else if (dim === 'type') this.typeFilter = null;
    else if (dim === 'kingdom') this.kingdomFilter = null;
    else if (dim === 'search') ($('#collectionSearch') as HTMLInputElement).value = '';
    else if (dim === 'tab') this.collectionMode = 'owned';
    this.syncFilterControls();
    this.renderCollection();
  }

  /** 把内部筛选态写回控件（撤销单条/重置后控件要跟着变） */
  private syncFilterControls(): void {
    $$('#rarityChips [data-rarity]').forEach((x) =>
      x.classList.toggle('selected', (x.dataset.rarity === '' ? null : Number(x.dataset.rarity)) === this.rarityFilter),
    );
    $$('#colorChips [data-color]').forEach((x) => x.classList.toggle('selected', x.dataset.color === this.colorFilter));
    ($('#typeSelect') as HTMLSelectElement).value = this.typeFilter ?? '';
    ($('#kingdomSelect') as HTMLSelectElement).value = this.kingdomFilter ?? '';
    ($('#sortSelect') as HTMLSelectElement).value = this.sortKey;
    ($('#groupSelect') as HTMLSelectElement).value = this.groupMode;
    $$('#collection [data-tab]').forEach((x) => x.classList.toggle('selected', x.dataset.tab === this.collectionMode));
  }

  private renderCollection(): void {
    const save = this.ctx.save();
    const total = TROOPS.length;
    const ownedCount = Object.keys(save.collection).length;
    $('#ownedTotal').textContent = fmt(ownedCount);
    $('#ownedProgress').style.width = `${(ownedCount / total) * 100}%`;
    $('#ownedPercent').textContent = `${((ownedCount / total) * 100).toFixed(1)}%`;
    $('#tabOwnedCount').textContent = fmt(ownedCount);
    ($('#returnDetail') as HTMLButtonElement).disabled = ownedCount === 0 && !getTroopById(this.currentId);

    const query = this.searchQuery();
    const pool = this.pool();
    const sorted = this.sortList(pool.filter((t) => this.matches(t, query)));
    this.listIds = sorted.map((t) => t.id);

    // 品质 chip 计数（"点下去有多少"是阶段 A 明确缺的预判信息）
    const rarityBase = pool.filter((t) => this.matches(t, query, 'rarity'));
    const perRarity = [0, 0, 0, 0, 0, 0];
    for (const t of rarityBase) perRarity[Math.min(Math.max(t.rarityIdx, 0), 5)]! += 1;
    $$('#rarityChips [data-rarity]').forEach((chip) => {
      const box = chip.querySelector('[data-chip-count]');
      if (!box) return;
      const raw = chip.dataset.rarity;
      box.textContent = raw === '' ? fmt(rarityBase.length) : fmt(perRarity[Number(raw)] ?? 0);
    });

    // 筛选摘要 chip 行 + 重置按钮（重置连 tab 一起，见 resetFilters）
    const active = this.activeFilterChips(query);
    $('#activeFilters').innerHTML = active
      .map((f) => `<button class="filter-chip selected" data-drop="${f.dim}" title="移除该条件">${f.label} ✕</button>`)
      .join('');
    // T-15：用 visibility 占位而不是 hidden，避免整行左右抖 34px
    $('#resetFilters').classList.toggle('is-off', active.length === 0);
    $('#shownCount').textContent = `匹配 ${fmt(sorted.length)} 支`;

    const container = $('#collectionBands');
    if (!sorted.length) {
      container.innerHTML = this.emptyHtml(ownedCount, query, active);
      container.scrollTop = 0;
      this.flat = [];
      this.sections = [];
      this.cursor = 0;
      return;
    }

    // 王国分组降级为一个选项，且与王国筛选互斥（筛了单个王国就不再画条）
    const grouped = this.groupMode === 'kingdom' && !this.kingdomFilter;
    this.flat = sorted;
    this.cursor = 0;
    if (grouped) {
      const bands = new Map<string, TroopData[]>();
      for (const t of sorted) {
        const key = t.kingdom ?? '无王国';
        if (!bands.has(key)) bands.set(key, []);
        bands.get(key)!.push(t);
      }
      this.sections = [...bands.entries()];
      container.innerHTML = '';
    } else {
      this.sections = [];
      container.innerHTML = '<div class="collection-cards" id="denseGrid"></div>';
    }
    container.scrollTop = 0; // T-4：任何筛选/排序/切 tab 之后回顶，无例外
    this.appendSegment();
  }

  /** 分段追加（T-2）：一段 200 张，滚到段尾继续 */
  private appendSegment(): void {
    const container = $('#collectionBands');
    if (!container) return;
    if (this.sections.length) {
      let added = 0;
      while (this.cursor < this.sections.length && added < SEGMENT) {
        const [kingdom, troops] = this.sections[this.cursor]!;
        container.insertAdjacentHTML('beforeend', this.sectionHtml(kingdom, troops));
        added += troops.length;
        this.cursor += 1;
      }
      return;
    }
    const grid = container.querySelector('#denseGrid');
    if (!grid || this.cursor >= this.flat.length) return;
    const slice = this.flat.slice(this.cursor, this.cursor + SEGMENT);
    this.cursor += slice.length;
    grid.insertAdjacentHTML('beforeend', slice.map((t) => this.cardHtml(t)).join(''));
  }

  private sectionHtml(kingdom: string, troops: TroopData[]): string {
    const save = this.ctx.save();
    const ownedInKingdom = troops.filter((t) => save.collection[String(t.id)]).length;
    const pct = troops.length ? (ownedInKingdom / troops.length) * 100 : 0;
    // kingdom-section 让分组头只在自身区间内 sticky，不会盖住其他王国
    return `<div class="kingdom-section"><div class="kingdom-band"><span class="band-mark"></span><b>${kingdom}</b><small>收藏进度 ${ownedInKingdom} / ${troops.length}</small><div><i style="width:${pct}%"></i></div></div><div class="collection-cards">${troops.map((t) => this.cardHtml(t)).join('')}</div></div>`;
  }

  /** 卡面（T-7/T-8：魔法值加图标不再被读成张数；补攻/护/生与副本数） */
  private cardHtml(t: TroopData): string {
    const rec = this.ctx.save().collection[String(t.id)];
    const locked = !rec;
    const stats = troopStatsOf(t, rec ?? UNOWNED_REC);
    const line = locked
      ? '尚未获得'
      : `Lv.${rec!.level}${rec!.ascension ? ' ★' + rec!.ascension : ''} · ${rec!.copies + 1} 张`;
    return `<button class="collection-card r-${t.rarityIdx}${locked ? ' locked' : ''}" data-troop="${t.id}" aria-label="查看${t.name}（${RARITY_ORDER[t.rarityIdx]}）">
      <i class="rarity-edge" aria-hidden="true"></i>
      ${troopImg(t, false, `alt="${t.name}"`)}
      <span class="collection-mana">${gemSvg(t.manaColors.map((c) => c.toLowerCase()))}</span>
      <span class="magic-badge" title="魔法 ${stats.magic}">${icon('orb')}<b>${stats.magic}</b></span>
      ${locked ? '<span class="locked-mark">?</span>' : ''}
      <div class="collection-info"><h2>${t.name}</h2>
        <span><span>${line}</span><span>${typeCn(t.troopTypes)}</span></span>
        <span title="攻击 / 护甲 / 生命"><span>攻 ${stats.attack} · 护 ${stats.armor} · 生 ${stats.health}</span><span>${RARITY_CN[t.rarityIdx] ?? ''}</span></span>
      </div>
    </button>`;
  }

  /** 当前生效的筛选维度（摘要 chip + 空态回退都用它） */
  private activeFilterChips(query: string): Array<{ dim: FilterDim; label: string }> {
    const out: Array<{ dim: FilterDim; label: string }> = [];
    if (this.collectionMode === 'all') out.push({ dim: 'tab', label: '全部图鉴' });
    if (this.rarityFilter !== null) out.push({ dim: 'rarity', label: RARITY_CN[this.rarityFilter] ?? String(this.rarityFilter) });
    if (this.colorFilter) out.push({ dim: 'color', label: (COLOR_CN[this.colorFilter] ?? this.colorFilter) + '色' });
    if (this.typeFilter) out.push({ dim: 'type', label: typeCn([this.typeFilter]) });
    if (this.kingdomFilter) out.push({ dim: 'kingdom', label: this.kingdomFilter });
    if (query) out.push({ dim: 'search', label: `“${query}”` });
    return out;
  }

  /**
   * 空态分三种（T-12/T-13：阶段 A 是一句「换个品质或王国试试」通吃三种处境且无出路）：
   * 空收藏 / 搜索无果 / 筛选筛没了（逐条回退指认是哪个条件，并给一键放宽）。
   */
  private emptyHtml(ownedCount: number, query: string, active: Array<{ dim: FilterDim; label: string }>): string {
    if (this.collectionMode === 'owned' && ownedCount === 0 && !active.length) {
      return `<p class="collection-empty">你的收藏还是空的——先去开一箱，或者打一场探索捡卡。<br>
        <button class="filter-chip" data-empty-act="chests">去宝箱开箱</button>
        <button class="filter-chip" data-empty-act="map">去地图打一场</button>
        <button class="filter-chip" data-empty-act="tab">看全部图鉴（${fmt(TROOPS.length)} 支）</button></p>`;
    }
    // 逐条回退：去掉哪一个条件能出结果（取收益最大的那条）
    const pool = this.pool();
    let best: { dim: FilterDim; label: string; count: number } | null = null;
    for (const f of active) {
      if (f.dim === 'tab') continue;
      const count = pool.filter((t) => this.matches(t, query, f.dim)).length;
      if (count > 0 && (!best || count > best.count)) best = { ...f, count };
    }
    const relax = best
      ? `<button class="filter-chip" data-empty-act="${best.dim}">去掉「${best.label}」可得 ${fmt(best.count)} 支</button>`
      : this.collectionMode === 'owned'
        ? `<button class="filter-chip" data-empty-act="tab">这些条件你一张都没有 · 去「全部」看看谁符合</button>`
        : '';
    if (query && active.length === 1) {
      return `<p class="collection-empty">没有名字 / 法术 / 特质里带「${query}」的部队。<br>
        <button class="filter-chip" data-empty-act="clear-search">清空搜索</button>${relax}</p>`;
    }
    return `<p class="collection-empty">当前 ${active.length} 个条件把结果筛空了：${active.map((f) => f.label).join(' + ')}<br>
      ${relax}<button class="filter-chip" data-empty-act="reset">重置全部筛选</button></p>`;
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
