import { burningSoulCost } from '../data/regionalPvp';
import { isImmortal, immortalTraitBurningCost } from '../../data/immortals';
import { isCoupletSpell, spellTitleText } from '../../data/spellPresentation';
import { EVENT_ROTATION } from '../data/events';
import { escapeHtml, troopCardFace } from './troopCard';
import { validateWishlist } from '../systems/wishlist';
/**
 * 部队图鉴 + 养成详情屏（计划 §5.4 + §5.5，一屏两视图）。
 * 数据全部来自 troops.json + 收藏存档；升级/升阶/特质/分解/保护走网关。
 */
import { getTroopById, TROOPS, type TroopData } from '../../data/troops';
import { matchesTroopCatalog } from '../data/troopCatalog';
import { ROLE_ICONS, ROLE_NAMES, ROLE_ORDER, roleNameZh } from '../data/roles';
import { KINGDOM_ORDER } from '../data/kingdoms';
import { RARITY_NAMES as RARITY_CN } from '../data/rarity';
import type { TeamPreset, TroopRecord } from '../state/schema';
import { MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../systems/teamRules';
import {
  MAX_ASCENSION,
  ascensionCopiesNeeded,
  decomposeYield,
  totalSoulCost,
  traitUnlockCost,
} from '../data/economy';
import { getRecord, levelCapOf, rarityTierOf, troopStatsOf } from '../systems/troopProgress';
import { stoneColorKeyOf, stoneName } from '../data/materials';
import { stoneMarkupForKey } from '../shell/materialArt';
import { traitStoneBagRoute } from './traitMaterialNavigation';
import { showAcquisitionDialog } from '../shell/acquisitionDialog';
import { BaseColor } from '../../engine/types';
import { traitGlyphsFor } from '../shell/traitIcon';
import { bottomNavHtml, icon, mountIcons, toast, toastHtml, topbarHtml, gemSvg, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopArt, troopArtChain, troopArtFallback, troopImg, typeCn } from './teamScreen';
import {
  applyTermMarkup,
  formulaKind,
  formulaParts,
  formulaRule,
  renderSpell,
  type Formula,
} from '../shell/spellText';
import { bindTermTips } from '../shell/termTip';

const fmt = (n: number): string => n.toLocaleString('en-US');

const COLOR_CN: Record<string, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄', purple: '紫', brown: '棕' };
/** 稀有度中文（与品质 chip 文案同源） */
/** 筛选维度（摘要 chip 撤销 / 空态逐条回退用） */
type FilterDim = 'rarity' | 'color' | 'type' | 'kingdom' | 'role' | 'search' | 'tab';

const COLOR_ORDER = ['red', 'green', 'blue', 'yellow', 'purple', 'brown'] as const;
const chargeText = (colors: readonly string[]): string =>
  colors.length >= 6
    ? '任意颜色宝石补充法力值'
    : colors.map((c) => (COLOR_CN[c.toLowerCase()] ?? c) + '色').join('、') + '宝石补充法力值';

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

/** 图鉴分页容量：按真实可视高度完整容纳两行，避免分页后仍需滚动找本页末项。 */
const PAGE_SIZE_DESKTOP = 16;
const PAGE_SIZE_TABLET = 8;
const PAGE_SIZE_MOBILE = 4;

export class TroopScreen implements Screen {
  private ctx!: ShellCtx;
  /** 当前浏览的部队（owned 列表内索引对应的 troopId） */
  private currentId = 0;
  /** Preserve the entry point across detail navigation and reloads. */
  private detailSource = '';
  private collectionMode: 'owned' | 'all' = 'owned';
  /** 图鉴筛选：品质 / 魔法色 / 种族 / 王国 / 定位（null 或空串 = 全部） */
  private rarityFilter: number | null = null;
  private colorFilter: string | null = null;
  private typeFilter: string | null = null;
  private kingdomFilter: string | null = null;
  private roleFilter: string | null = null;
  private sortKey: SortKey = DEFAULT_SORT;
  /** 'none' = 密排（默认，T-1）；'kingdom' = 王国分组（与王国筛选互斥） */
  private groupMode: 'none' | 'kingdom' = 'none';
  /** 当前筛选+排序后的集合——详情页左右箭头只在这个集合内走（T-5） */
  private listIds: number[] = [];
  private collectionPage = 1;
  private collectionPages = 1;
  private collectionPageSize = PAGE_SIZE_DESKTOP;
  /** 改页容量时，用当前页第一张卡找回它落在哪一页。普通翻页不走这条。 */
  private locateAnchor = false;
  private pageAnchorId = 0;
  /** 详情↔图鉴往返时保留的滚动位置（T-9） */
  private collectionScroll = 0;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private formulas: Formula[] = [];
  private magic = 0;
  private termTipsSpell?: () => void;
  private termTipsTraits?: () => void;
  private upgradeTargetLevel = 0;
  private upgradePending = false;
  private upgradeModal: HTMLElement | null = null;

  html(ctx: ShellCtx, param?: string): string {
    this.currentId = param ? Number(param.split('/')[0]) || 0 : this.firstOwnedId(ctx);
    void ctx;
    return `
      <div class="ambient" aria-hidden="true"></div>
      ${topbarHtml()}
      <main id="detail">
        <div class="page-heading">
          <button class="back" id="back" type="button"><span data-icon="arrow" aria-hidden="true"></span><span id="detailBackLabel">返回图鉴</span></button>
          <div class="heading-center"><h1>部队详情</h1></div>
          <div class="detail-header-actions">
            <span class="page-index">图鉴 <b id="pageIndex">001</b> / <span id="pageTotal">000</span></span>
            <button class="detail-favorite-button" id="detailFavorite" type="button" aria-pressed="false" title="收藏后优先显示在队伍列表"><span data-icon="star" aria-hidden="true"></span><span id="detailFavoriteLabel">收藏</span></button>
            <button class="detail-wishlist-button" id="detailWishlist" type="button"><span data-icon="sparkles" aria-hidden="true"></span><span id="detailWishlistLabel">愿望单</span></button>
          </div>
        </div>
        <div class="detail-layout">
          <section class="left-column">
            <article class="spell">
              <header class="spell-head">
                <div class="spell-mark" id="spellMark"></div>
                <div class="spell-title"><h2 id="spellName">—</h2></div>
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
            <div class="rarity-label" id="rarityBadge"><span class="rarity-gem" aria-hidden="true"></span><strong id="rarityLabel">—</strong></div>
            <div class="card-stage">
              <article class="character-card" id="characterCard">
                <img class="portrait" id="portraitArt" alt=""><div class="portrait-shade"></div><div class="card-frame" aria-hidden="true"></div>
                <span class="unowned-mark" id="unownedMark" hidden><span data-icon="lock"></span>未获得</span>
                <div class="mana-gem" id="manaGem" role="img" aria-label="法力颜色"></div><div class="magic-badge" title="魔力值"><span data-icon="orb"></span><b id="magicStat">0</b></div>
                <div class="card-name"><h2 id="cardName">—</h2><span id="cardType">—</span></div><div class="card-stats"><div class="stat-atk"><span data-icon="swords"></span><b id="attackStat">0</b></div><div class="stat-armor"><span data-icon="shield"></span><b id="armorStat">0</b></div><div class="stat-hp"><span data-icon="heart"></span><b id="healthStat">0</b></div></div>
                <div class="card-level"><span>等级 <b id="cardLevel">1</b><i>/<span id="cardLevelCap">15</span></i></span><div class="rank" id="rankPips"></div><span id="owned">×1</span></div>
                <button class="portrait-expand" id="portraitExpand" type="button" aria-label="放大查看立绘" aria-haspopup="dialog"><span aria-hidden="true">⤢</span></button>
              </article>
              <div class="card-ornament" data-ornament></div>
            </div>
            <div class="portrait-controls"><button id="previous" aria-label="上一张（当前筛选集合内）"><span data-icon="arrow"></span></button><span id="portraitCaption">—</span><button id="next" aria-label="下一张（当前筛选集合内）"><span data-icon="arrow"></span></button></div>
            <div class="enlist-row" id="enlistRow">
              <button class="primary" id="enlist" type="button"><span data-icon="shield"></span><span id="enlistLabel">编入队伍</span></button>
              <select id="enlistSlot" aria-label="选择站位"></select>
            </div>
          </section>
          <section class="right-column">
            <div class="trait-heading"><h2>天赋特质</h2><span id="traitCount">0 / 3 已解锁</span></div>
            <div class="trait-list" id="traitList"></div>
            <div class="unlock-block">
              <div class="unlock-cost" id="unlockCost" hidden></div>
              <button class="secondary" id="unlock"><span data-icon="lock"></span><span id="unlockLabel">解锁特质</span></button>
            </div>
            <section class="ascension">
              <div class="section-line"><h2>升阶</h2><span class="ascension-count"><small id="ascensionCountLabel">可用副本</small><b id="copies">0</b><i>/</i><span id="copiesNeed">5</span></span></div>
              <div class="ascension-gems" id="ascensionGems" aria-label="同名卡"></div>
              <div class="ascension-benefit" id="ascendBenefit">—</div>
              <div class="ascension-caption"><span id="copyCaption">—</span><button id="ascend">升阶</button></div>
            </section>
            <div class="protected" id="protectedNote" hidden><span data-icon="lock"></span>已锁定 · 防止误分解</div>
          </section>
        </div>
      </main>
      <main id="collection" hidden>
        <div class="collection-heading"><div><h1>我的收藏</h1></div></div>
        <div class="collection-filter">
          <div class="filter-row">
            <div class="collection-scope" role="group" aria-label="显示范围">
              <button class="selected" type="button" data-tab="owned">已拥有 <i id="tabOwnedCount">0</i></button><button type="button" data-tab="all">全部 <i id="tabAllCount">${fmt(TROOPS.length)}</i></button>
            </div>
            <span class="divider"></span>
            <small class="filter-label">品质</small>
            <div class="rarity-chips" id="rarityChips" role="group" aria-label="品质筛选">
              <button class="filter-chip selected" type="button" data-rarity="">全部 <i data-chip-count></i></button>
              <button class="filter-chip" type="button" data-rarity="0">普通 <i data-chip-count></i></button>
              <button class="filter-chip" type="button" data-rarity="1">精良 <i data-chip-count></i></button>
              <button class="filter-chip" type="button" data-rarity="2">稀有 <i data-chip-count></i></button>
              <button class="filter-chip" type="button" data-rarity="3">传说 <i data-chip-count></i></button>
              <button class="filter-chip" type="button" data-rarity="4">史诗 <i data-chip-count></i></button>
              <button class="filter-chip" type="button" data-rarity="5">神话 <i data-chip-count></i></button>
            </div>
            <span class="divider"></span>
            <small class="filter-label">法力</small>
            <div class="color-chips" id="colorChips" role="group" aria-label="法力颜色筛选"></div>
            <span class="divider"></span>
            <small class="filter-label">定位</small>
            <div class="role-chips" id="roleChips" role="group" aria-label="定位筛选"></div>
            <span class="divider"></span>
            <select id="typeSelect" aria-label="按种族筛选"><option value="">全部种族</option></select>
            <select id="kingdomSelect" aria-label="按王国筛选"><option value="">全部王国</option></select>
            <button class="filter-reset is-off" id="resetFilters" type="button" aria-label="重置全部筛选" title="重置全部筛选"><span data-icon="close"></span>重置</button>
          </div>
          <div class="filter-row filter-row-foot">
            <span class="filter-label">排序</span>
            <select id="sortSelect" aria-label="排序方式">
              ${SORTS.map((s) => `<option value="${s.key}"${s.key === DEFAULT_SORT ? ' selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <span class="filter-label">分组</span>
            <select id="groupSelect" aria-label="分组方式"><option value="none">不分组</option><option value="kingdom">按王国</option></select>
            <span class="divider"></span>
            <div class="active-filters" id="activeFilters"></div>
            <small id="shownCount"></small>
            <label class="filter-search"><span data-icon="funnel"></span><input id="collectionSearch" placeholder="搜索名字 / 法术 / 特质"></label>
          </div>
        </div>
        <div id="collectionBands"></div>
        <nav class="collection-pagination" id="collectionPagination" aria-label="图鉴分页" hidden>
          <span class="collection-range" id="collectionRange">0 支</span>
          <div class="collection-page-controls">
            <button id="collectionPrev" type="button" aria-label="上一页"><span data-icon="arrow"></span><span>上一页</span></button>
            <span class="collection-page-status" aria-live="polite">第 <b id="collectionPage">1</b> / <b id="collectionPages">1</b> 页</span>
            <button id="collectionNext" type="button" aria-label="下一页"><span>下一页</span><span data-icon="arrow"></span></button>
          </div>
        </nav>
      </main>
      ${bottomNavHtml('图鉴', `全图鉴 ${fmt(TROOPS.length)} 支`)}
      ${toastHtml()}
      <div class="modal-veil upgrade-veil" id="modal" hidden>
        <section class="modal upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="modalCopy">
          <div class="upgrade-portrait" id="upgradePortrait"></div>
          <div class="upgrade-content">
            <header class="upgrade-heading"><div><h2 id="modalTitle">提升等级</h2><span id="upgradeCap"></span></div>
              <button class="upgrade-close" id="closeUpgrade" type="button" aria-label="关闭升级">${icon('close')}</button>
            </header>
            <div class="upgrade-picker" role="group" aria-label="选择提升级数">
              <button class="upgrade-step" id="upgradeLess" type="button" aria-label="减少一级">${icon('arrow')}</button>
              <div class="upgrade-levels"><div class="upgrade-origin"><small>当前等级</small><b id="upgradeFrom"></b></div>
                <span class="upgrade-flow" aria-hidden="true">${icon('chevrons')}</span>
                <div class="upgrade-target"><small>目标等级</small><b id="upgradeTo"></b></div>
              </div>
              <button class="upgrade-step" id="upgradeMore" type="button" aria-label="增加一级">${icon('arrow')}</button>
            </div>
            <div class="upgrade-selection"><output id="upgradeLevels" aria-live="polite">提升 1 级</output>
              <button class="upgrade-max" id="upgradeMax" type="button" title="选择当前资源可承担的最高等级">${icon('chevrons')}<span>最大</span></button>
            </div>
            <div class="upgrade-track" id="upgradeTrack" aria-hidden="true"></div>
            <p class="upgrade-hint" id="upgradeHint" role="status" hidden></p>
            <ul class="upgrade-stats" id="modalPreview" aria-label="升级后属性" aria-live="polite"></ul>
            <div class="upgrade-resource"><span class="upgrade-soul" aria-hidden="true">${icon('soul')}</span>
              <div class="upgrade-cost"><small>消耗灵魂</small><b id="upgradeTotalCost"></b></div>
              <div class="upgrade-balance"><small>灵魂余额</small><span id="soulPreview"></span></div>
            </div>
            <button class="upgrade-confirm" id="confirmUpgrade" type="button">${icon('chevrons')}<span>确认提升</span></button>
            <button class="cancel" id="cancelUpgrade" type="button">暂不提升</button>
          </div>
        </section>
      </div>
      <!-- T-16：分解是永久销毁，自绘危险确认弹层替掉浏览器原生 confirm() -->
      <div class="modal-veil" id="dangerModal" hidden><section class="modal etched danger" role="dialog" aria-modal="true" aria-labelledby="dangerTitle"><h2 id="dangerTitle">分解副本</h2><p id="dangerCopy">—</p><ul class="modal-lines" id="dangerPreview"></ul><button class="primary" id="confirmDanger">确认分解</button><button class="cancel" id="cancelDanger">取消</button></section></div>
      <dialog id="portraitZoom" aria-label="部队立绘预览"><img id="portraitZoomArt" alt=""><button id="portraitZoomClose" type="button" aria-label="关闭立绘预览"><span data-icon="close"></span></button></dialog>`;
  }

  mount(ctx: ShellCtx, _root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    // 独立于缩放舞台，保证小屏触控尺寸和弹窗比例稳定。
    this.upgradeModal = $('#modal');
    document.body.appendChild(this.upgradeModal);
    if (param?.startsWith('filter/')) {
      const [, dimension, encoded] = param.split('/');
      let value = ''; try { value = decodeURIComponent(encoded ?? ''); } catch { /* malformed deep link */ }
      this.collectionMode = 'owned'; this.rarityFilter = null; this.colorFilter = null;
      this.kingdomFilter = dimension === 'kingdom' ? value || null : null;
      this.typeFilter = dimension === 'race' ? value || null : null;
      this.roleFilter = dimension === 'role' && (ROLE_ORDER as readonly string[]).includes(value) ? value : null;
      this.collectionPage = 1;
    }

    _root.classList.add('collection-responsive');
    // 深链（#troop/123，如编队页「图鉴」按钮）直达详情；纯 #troop 落在图鉴列表
    const deepLink = !!(param && Number(param.split('/')[0]));
    if (deepLink) this.currentId = Number(param.split('/')[0]);
    if (!this.currentId) this.currentId = this.firstOwnedId(ctx);
    const portrait = $('#portraitArt') as HTMLImageElement;
    const zoom = $('#portraitZoom') as HTMLDialogElement;
    const zoomArt = $('#portraitZoomArt') as HTMLImageElement;
    // 持久兜底链：每次 paintDetail 会同时写 src 与 data-fb（剩余兜底地址），失败沿链走一步
    const nextPortraitArt = (image: HTMLImageElement): void => {
      const fb: string[] = JSON.parse(image.dataset.fb || '[]');
      const i = fb.indexOf(image.getAttribute('src') ?? '');
      if (i + 1 < fb.length) image.src = fb[i + 1]!;
    };
    portrait.onerror = () => nextPortraitArt(portrait);
    zoomArt.onerror = () => nextPortraitArt(zoomArt);
    const ornament = $('[data-ornament]');
    if (ornament) {
      import('../shell/battleIcons').then((m) => {
        ornament.innerHTML = m.BATTLE_ORNAMENT;
      });
    }

    const [, source, sourceArg] = param?.split('/') ?? [];
    const fromShop = source === 'shop' && EVENT_ROTATION.some(type => type.id === sourceArg);
    const fromChoice = source === 'choice' && !!sourceArg;
    this.detailSource = fromShop ? `/shop/${sourceArg}` : fromChoice ? `/choice/${sourceArg}` : source === 'wishlist' ? '/wishlist' : '';
    if (fromShop) $('#detailBackLabel').textContent = '返回活动商店';
    else if (fromChoice) $('#detailBackLabel').textContent = '返回神话自选';
    else if (source === 'wishlist') $('#detailBackLabel').textContent = '返回愿望单';
    this.bind('#back', 'click', () => fromShop ? ctx.navigate(`#shop/${sourceArg}`)
      : fromChoice ? ctx.navigate(`#wishlist/choice/${sourceArg}`)
      : source === 'wishlist' ? ctx.navigate('#wishlist') : this.showView('collection', true));
    this.bind('#detailWishlist', 'click', async () => {
      const ids = ctx.save().gachaWishlist.troopIds;
      if (ids.includes(this.currentId) || (this.troop()?.rarityIdx ?? 0) < 3) { ctx.navigate('#wishlist'); return; }
      const next = [...ids,this.currentId]; const error = validateWishlist(next);
      if (error) { toast(error.message); return; }
      const button = $('#detailWishlist') as HTMLButtonElement; button.disabled = true;
      try { const {result} = await ctx.gateway.setWishlist(next); toast(result.ok ? '已加入愿望单，可在宝石宝箱管理' : result.message); if (result.ok) $('#detailWishlistLabel').textContent = '管理愿望单'; }
      catch { toast('保存失败，请重试'); }
      finally { button.disabled = false; }
    });
    this.bind('#detailFavorite', 'click', async () => {
      const id = this.currentId;
      const favorite = !ctx.save().favoriteTroopIds.includes(id);
      const button = $('#detailFavorite') as HTMLButtonElement;
      button.disabled = true;
      try {
        const { result } = await ctx.gateway.setTroopFavorite(id, favorite);
        if (typeof result === 'boolean') { if (button.isConnected) this.paintFavorite(); }
        else toast(result.message);
      } catch { toast('收藏保存失败，请重试'); }
      finally { button.disabled = false; }
    });
    this.bind('#previous', 'click', () => this.stepOwned(-1));
    this.bind('#next', 'click', () => this.stepOwned(1));
    this.bind('#portraitExpand', 'click', () => {
      zoomArt.dataset.fb = portrait.dataset.fb ?? '[]';
      zoomArt.src = portrait.getAttribute('src') ?? '';
      zoomArt.alt = portrait.alt;
      zoom.setAttribute('aria-label', `${portrait.alt}立绘预览`);
      zoom.showModal();
    });
    this.bind('#portraitZoomClose', 'click', () => zoom.close());
    this.on(zoom, 'click', (event) => { if (event.target === zoom) zoom.close(); });
    this.on(zoom, 'close', () => $('#portraitExpand')?.focus({ preventScroll: true }));
    this.bind('#collectionPrev', 'click', () => this.changeCollectionPage(-1));
    this.bind('#collectionNext', 'click', () => this.changeCollectionPage(1));
    this.bind('#upgrade', 'click', () => this.openUpgradeModal());
    this.bind('#cancelUpgrade', 'click', () => this.closeUpgradeModal());
    this.bind('#closeUpgrade', 'click', () => this.closeUpgradeModal());
    this.on(this.upgradeModal, 'click', (e) => { if (e.target === this.upgradeModal) this.closeUpgradeModal(); });
    this.on(this.upgradeModal, 'keydown', (e) => {
      const event = e as KeyboardEvent;
      if (event.key !== 'Tab') return;
      const controls = [...this.upgradeModal!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    this.bind('#confirmUpgrade', 'click', () => void this.confirmUpgrade());
    this.bind('#upgradeLess', 'click', () => this.selectUpgrade(this.upgradeTargetLevel - 1));
    this.bind('#upgradeMore', 'click', () => this.selectUpgrade(this.upgradeTargetLevel + 1));
    this.bind('#upgradeMax', 'click', () => this.selectUpgrade(this.maxUpgradeLevel()));
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
        this.renderCollection();
      }),
    );
    this.on($('#rarityChips'), 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-rarity]') as HTMLElement | null;
      if (!chip) return;
      this.rarityFilter = chip.dataset.rarity === '' ? null : Number(chip.dataset.rarity);
      this.renderCollection();
    });
    const colorChips = $('#colorChips');
    colorChips.innerHTML = COLOR_ORDER.map(
      (c) => `<button class="color-chip" type="button" data-color="${c}" aria-label="${COLOR_CN[c]}色魔法" title="${COLOR_CN[c]}色魔法">${gemSvg([c])}</button>`,
    ).join('');
    this.on(colorChips, 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-color]') as HTMLElement | null;
      if (!chip) return;
      this.colorFilter = this.colorFilter === chip.dataset.color ? null : chip.dataset.color!;
      this.renderCollection();
    });
    // 定位 9 项：官方 role 单选（含"全部"），chip 带小图标与命中数
    const roleChips = $('#roleChips');
    roleChips.innerHTML = `<button class="filter-chip selected" type="button" data-role="">全部 <i data-chip-count></i></button>` +
      ROLE_ORDER.map(
        (r) => `<button class="filter-chip" type="button" data-role="${r}" title="定位：${ROLE_NAMES[r]}">${icon(ROLE_ICONS[r])}${ROLE_NAMES[r]} <i data-chip-count></i></button>`,
      ).join('');
    this.on(roleChips, 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-role]') as HTMLElement | null;
      if (!chip) return;
      this.roleFilter = chip.dataset.role === '' ? null : chip.dataset.role ?? null;
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
      if (action === 'tab') {
        this.collectionMode = 'all';
        return this.renderCollection();
      }
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
    let searchTimer = 0;
    this.on($('#collectionSearch'), 'input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => this.renderCollection(), 200);
    });
    let resizeTimer = 0;
    this.on(window, 'resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const nextSize = this.pageSize();
        if (nextSize === this.collectionPageSize) return;
        if (this.groupMode === 'kingdom' && !this.kingdomFilter) this.locateAnchor = true;
        else {
          const firstVisibleIndex = (this.collectionPage - 1) * this.collectionPageSize;
          this.collectionPage = Math.floor(firstVisibleIndex / nextSize) + 1;
        }
        this.renderCollection(false);
      }, 120);
    });
    this.on($('.stage'), 'click', (e) => {
      if (!(e.target as HTMLElement).closest('#spellCopy .spell-stat, #spellTip')) this.closeSpellTip();
    });
    this.on(window, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.closeSpellTip();
        this.closeUpgradeModal();
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

  private paintFavorite(): void {
    const favorite = this.ctx.save().favoriteTroopIds.includes(this.currentId);
    $('#detailFavorite').setAttribute('aria-pressed', String(favorite));
    $('#detailFavoriteLabel').textContent = favorite ? '已收藏' : '收藏';
  }

  private paintDetail(): void {
    const troop = this.troop();
    if (!troop) return;
    this.paintFavorite();
    $('#detailWishlistLabel').textContent = troop.rarityIdx < 3 || this.ctx.save().gachaWishlist.troopIds.includes(troop.id) ? '管理愿望单' : '加入愿望单';
    const ownedRec = getRecord(this.ctx.save(), this.currentId);
    const rec = ownedRec ?? UNOWNED_REC;
    const owned = !!ownedRec;
    const stats = troopStatsOf(troop, rec);
    const cap = levelCapOf(troop, rec);
    const tier = rarityTierOf(troop, rec);

    const portraitEl = $('#portraitArt') as HTMLImageElement;
    const artChain = troopArtChain(troop);
    portraitEl.dataset.fb = JSON.stringify(artChain.slice(1));
    portraitEl.src = artChain[0]!;
    portraitEl.alt = troop.name;
    $('#characterCard').classList.toggle('unowned', !owned);
    ($('#characterCard') as HTMLElement).dataset.rarity = String(tier);
    $('#unownedMark').hidden = owned;
    $('#cardName').textContent = troop.name;
    $('#portraitExpand').setAttribute('aria-label', `放大查看${troop.name}立绘`);
    $('#cardType').textContent = [roleNameZh(troop.role), typeCn(troop.troopTypes), troop.kingdom, RARITY_CN[tier]].filter(Boolean).join(' · ');
    $('#rarityLabel').textContent = RARITY_CN[tier] ?? '';
    const rarityBadge = $('#rarityBadge');
    rarityBadge.dataset.rarity = String(tier);
    rarityBadge.title = tier === troop.rarityIdx
      ? `当前品质：${RARITY_CN[tier]}`
      : `当前品质：${RARITY_CN[tier]} · 初始品质：${RARITY_CN[troop.rarityIdx]}`;
    rarityBadge.setAttribute('aria-label', rarityBadge.title);
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
    $('#copyCaption').textContent = owned ? `持有 ${rec.copies + 1} 张 · 可用副本 ${rec.copies} 张` : '尚未获得 · 图鉴资料仅供参考';
    $('#portraitCaption').textContent = owned ? `已拥有 ${rec.copies + 1} 张` : '尚未获得';
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
    $('#spellName').textContent = spellTitleText(troop.spell.name);
    $('#spellName').classList.toggle('spell-couplet', isCoupletSpell(troop.spell.name));
    $('#spellName').closest('.spell-head')?.classList.toggle('spell-head-couplet', isCoupletSpell(troop.spell.name));
    $('#spellName').closest('.spell')?.classList.toggle('spell-couplet-card', isCoupletSpell(troop.spell.name));
    $('#spellTag').textContent = troop.kingdom ? `${troop.kingdom} · 部队法术` : '部队法术';
    $('#spellCopy').innerHTML = parsed.html;
    $('#spellMark').innerHTML = gemSvg(troop.manaColors.map((c) => c.toLowerCase())) + `<b>${troop.manaCost}</b>`;
    this.bindSpellTips();
    this.termTipsSpell?.();
    this.termTipsSpell = bindTermTips($('#spellCopy'));
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
    const kind = formulaKind(formula.unit);
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
    const cap = levelCapOf(troop, rec);
    const cost = rec.level < cap ? totalSoulCost(troop.rarityIdx, rec.level, rec.level + 1) : 0;
    const atCap = rec.level >= cap;
    const souls = this.ctx.save().currencies.souls;
    const diffs = atCap ? [] : this.statDiffs(troop, rec, rec.level + 1);
    $('#growthNext').innerHTML = !owned
      ? '获得该部队后可提升等级'
      : atCap
        ? isImmortal(troop) ? '已达不朽等级上限 · 30级' : '已达稀有度上限 · 升阶可提升'
        : diffs.length
          ? diffs.map((d) => `${d.label} <b>+${d.to - d.from}</b>`).join(' ')
          : '下一级无属性变化';
    const btn = $('#upgrade') as HTMLButtonElement;
    const short = owned && !atCap && souls < cost;
    btn.disabled = !owned || atCap || short;
    // T-10 配套：代价旁边就是余额，买不起直接写"还差多少"而不是点下去赌 toast
    btn.title = short
      ? `灵魂不足：需要 ${fmt(cost)}，现有 ${fmt(souls)}`
      : '提升等级对同名部队的全部副本生效';
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
          <div class="trait-copy"><h3>${name}</h3><p>${applyTermMarkup(text.replace(/(\d+(?:\.\d+)?%?)/g, '<b class="spell-stat">$1</b>'))}</p></div>
          <span class="${unlocked ? 'acquired' : 'lock-icon'}" data-icon="${unlocked ? 'check' : 'lock'}" role="img" aria-label="${unlocked ? '已解锁' : '尚未解锁'}"></span>
        </article>`;
      })
      .join('');
    mountIcons(list);
    this.termTipsTraits?.();
    this.termTipsTraits = bindTermTips(list);
    // 下一个待解锁槽位与代价
    const nextSlot = rec.traits.findIndex((v) => !v) + 1;
    const unlockBtn = $('#unlock') as HTMLButtonElement;
    const unlockCost = $('#unlockCost');
    unlockCost.hidden = true;
    unlockCost.replaceChildren();
    unlockBtn.title = '';
    if (!owned) {
      unlockBtn.disabled = true;
      $('#unlockLabel').textContent = '获得后可解锁';
    } else if (nextSlot <= 0 || !troop.traits[nextSlot - 1]) {
      unlockBtn.disabled = true;
      $('#unlockLabel').textContent = nextSlot <= 0 ? '特质全解锁' : '无更多特质';
    } else {
      const primary = stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown);
      const cost = traitUnlockCost(nextSlot, primary, troop.id);
      const save = this.ctx.save();
      // T-10：每一项代价旁边列持有量，不够的标红；凑不齐时按钮直接禁用并写清缺口
      const shortfalls: string[] = [];
      const goldHave = save.currencies.gold;
      if (goldHave < cost.gold) shortfalls.push(`黄金还差 ${fmt(cost.gold - goldHave)}`);
      const stoneRows = Object.entries(cost.stones).map(([key, n]) => {
        const have = save.materials.traitstones[key] ?? 0;
        if (have < n) shortfalls.push(`${stoneName(key)}还差 ${n - have}`);
        return `<span>${stoneMarkupForKey(key)}${stoneName(key)} ×${n}<em class="${have < n ? 'short' : ''}">持有 ${fmt(have)}</em></span>`;
      });
      const burning = immortalTraitBurningCost(troop, nextSlot);
      if (burning) {
        const have = save.regional?.burningSouls ?? 0;
        if (have < burning) shortfalls.unshift(`燃烧灵魂还差 ${burning - have}`);
        stoneRows.push(`<span>燃烧灵魂 ×${burning}<em class="${have < burning ? 'short' : ''}">持有 ${fmt(have)}</em></span>`);
      }
      $('#unlockLabel').textContent = shortfalls.length
        ? `材料不足 · ${shortfalls[0]}`
        : `解锁特质 ${['Ⅰ', 'Ⅱ', 'Ⅲ'][nextSlot - 1]}`;
      unlockBtn.disabled = shortfalls.length > 0;
      unlockBtn.title = shortfalls.join(' · ');
      unlockCost.hidden = false;
      const materialRoute = traitStoneBagRoute(save, troop.id);
      unlockCost.innerHTML = stoneRows.join('') + (burning ? '<a class="trait-material-link" href="#regional">燃烧灵魂 · 永生战域获取 →</a>' : '') + (materialRoute ? `<a class="trait-material-link" href="${materialRoute}">查看特质材料 →</a>` : '');
      mountIcons($('#unlockCost'));
    }
  }

  private paintAscension(troop: TroopData, rec: TroopRecord, owned: boolean): void {
    const need = rec.ascension >= MAX_ASCENSION ? 0 : ascensionCopiesNeeded(rec.ascension);
    const capNow = levelCapOf(troop, rec);
    const capNext = levelCapOf(troop, { ...rec, ascension: rec.ascension + 1 });
    const tierNow = rarityTierOf(troop, rec);
    const tierNext = Math.min(tierNow + 1, 5);
    $('#ascendBenefit').innerHTML = rec.ascension >= MAX_ASCENSION
      ? `<span>当前品质 <b>${RARITY_CN[tierNow]}</b></span><span>等级上限 <b>${capNow}</b></span>`
      : tierNext === tierNow
        ? '<span>已达最高品质 · 升阶保留星标</span>'
        : `<span>品质 <b>${RARITY_CN[tierNow]}</b><i>→</i><b>${RARITY_CN[tierNext]}</b></span><span>等级上限 <b>${capNow}</b><i>→</i><b>${capNext}</b></span>`;
    $('#ascensionCountLabel').textContent = need ? '可用副本' : '当前阶位';
    $('#copies').textContent = String(need ? rec.copies : rec.ascension);
    $('#copiesNeed').textContent = String(need || MAX_ASCENSION);
    const gems = $('#ascensionGems');
    gems.innerHTML = Array.from({ length: need || MAX_ASCENSION }, (_, i) => `<i${i < (need ? rec.copies : rec.ascension) ? ' class="on"' : ''}></i>`).join('');
    gems.setAttribute('aria-label', need ? `${rec.copies} / ${need} 可用副本` : `${rec.ascension} / ${MAX_ASCENSION} 阶`);
    const btn = $('#ascend') as HTMLButtonElement;
    if (!owned) {
      btn.disabled = true;
      btn.textContent = '尚未获得';
      btn.title = '';
      $('#copyCaption').textContent = '尚未获得 · 图鉴资料仅供参考';
    } else if (rec.ascension >= MAX_ASCENSION) {
      btn.disabled = true;
      btn.textContent = '已满阶';
      btn.title = '';
      $('#copyCaption').textContent = `持有 ${rec.copies + 1} 张 · 三阶满阶`;
    } else {
      btn.disabled = rec.copies < need;
      btn.textContent = rec.copies < need ? `还差 ${need - rec.copies} 张` : '升阶';
      btn.title = rec.copies < need ? `还差 ${need - rec.copies} 张同名副本` : `消耗 ${need} 张同名副本，不消耗本体`;
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
    history.replaceState(null, '', `#troop/${this.currentId}${this.detailSource}`);
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
    if (!row || !btn || !slot) return;
    const team = this.team();
    const setButtonStyle = (removing: boolean): void => {
      btn.classList.toggle('primary', !removing);
      btn.classList.toggle('secondary', removing);
      btn.classList.toggle('remove', removing);
      const glyph = btn.querySelector<HTMLElement>('[data-icon]');
      if (glyph) {
        glyph.dataset.icon = removing ? 'close' : 'shield';
        glyph.innerHTML = icon(glyph.dataset.icon);
      }
    };
    if (!owned || !team) {
      setButtonStyle(false);
      btn.disabled = true;
      slot.hidden = true;
      $('#enlistLabel').textContent = owned ? '还没有预设队' : '获得该部队后可编入队伍';
      const why = owned ? '先去队伍页建一支预设队。' : '尚未获得 · 图鉴资料仅供参考';
      btn.title = why;
      return;
    }
    const at = team.preset.members.findIndex((m) => m.kind === 'troop' && m.troopId === this.currentId);
    if (at >= 0) {
      setButtonStyle(true);
      btn.disabled = false;
      slot.hidden = true;
      $('#enlistLabel').textContent = `已在「${team.preset.name}」第 ${at + 1} 位 · 卸下`;
      const why = `已在「${team.preset.name}」第 ${at + 1} 位 · 队伍最少 ${MIN_TEAM_SIZE} 人`;
      btn.title = why;
      return;
    }
    setButtonStyle(false);
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
      return `<option value="${i}">第${i + 1}位 · ${who}</option>`;
    }).join('');
    slot.value = keep && Number(keep) < slots ? keep : String(slots - 1);
    const why = `编入「${team.preset.name}」· 选中已有站位会替换该成员`;
    btn.title = why;
    slot.title = why;
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
    const cap = levelCapOf(troop, rec);
    if (rec.level >= cap) {
      toast(isImmortal(troop) ? '已达不朽等级上限：30级' : '已达当前稀有度上限，先升阶。');
      return;
    }
    this.upgradeTargetLevel = rec.level + 1;
    $('#upgradePortrait').innerHTML = `${troopImg(troop, false, 'alt=""').replace('loading="lazy"', 'loading="eager"')}
      <span class="upgrade-rarity">${escapeHtml(RARITY_CN[rarityTierOf(troop, rec)] ?? '')}</span>
      <div class="upgrade-identity"><span class="upgrade-emblem" aria-hidden="true">${icon('chevrons')}</span>
        <h3 id="modalCopy">${escapeHtml(troop.name)}</h3><span>${escapeHtml(typeCn(troop.troopTypes))}</span></div>`;
    this.paintUpgradeModal();
    $('#modal').hidden = false;
    $('#stage').inert = true;
    $('.upgrade-dialog', this.upgradeModal!).scrollTop = 0;
    $('#closeUpgrade').focus({ preventScroll: true });
  }

  private closeUpgradeModal(): void {
    if (this.upgradePending || !this.upgradeModal || this.upgradeModal.hidden) return;
    this.upgradeModal.hidden = true;
    $('#stage').inert = false;
    const opener = $('#upgrade') as HTMLButtonElement;
    (opener.disabled ? $('#portraitExpand') : opener).focus({ preventScroll: true });
  }

  /** 最大 = 当前余额可承担的最高等级，且遵守升阶后的等级上限。 */
  private maxUpgradeLevel(): number {
    const troop = this.troop();
    const rec = this.rec();
    if (!troop || !rec) return 0;
    const cap = levelCapOf(troop, rec);
    const souls = this.ctx.save().currencies.souls;
    let target = rec.level;
    while (target < cap && totalSoulCost(troop.rarityIdx, rec.level, target + 1) <= souls && (!isImmortal(troop) || burningSoulCost(rec.level, target + 1) <= (this.ctx.save().regional?.burningSouls ?? 0))) target++;
    return target;
  }

  private selectUpgrade(target: number): void {
    if (this.upgradePending) return;
    this.upgradeTargetLevel = target;
    this.paintUpgradeModal();
  }

  private paintUpgradeModal(): void {
    const troop = this.troop();
    const rec = this.rec();
    if (!troop || !rec) return;
    const cap = levelCapOf(troop, rec);
    const target = Math.min(cap, Math.max(rec.level + 1, this.upgradeTargetLevel));
    this.upgradeTargetLevel = target;
    const cost = totalSoulCost(troop.rarityIdx, rec.level, target);
    const souls = this.ctx.save().currencies.souls;
    const burning = isImmortal(troop) ? burningSoulCost(rec.level, target) : 0;
    const fuel = this.ctx.save().regional?.burningSouls ?? 0;
    const short = souls < cost || fuel < burning;
    const max = this.maxUpgradeLevel();
    const current = troopStatsOf(troop, rec);
    const next = troopStatsOf(troop, { ...rec, level: target });
    $('#upgradeCap').textContent = `等级上限 Lv.${cap}`;
    $('#upgradeFrom').textContent = String(rec.level);
    $('#upgradeTo').textContent = String(target);
    $('#upgradeLevels').textContent = `提升 ${target - rec.level} 级`;
    ($('#upgradeLess') as HTMLButtonElement).disabled = this.upgradePending || target <= rec.level + 1;
    ($('#upgradeMore') as HTMLButtonElement).disabled = this.upgradePending || target >= cap;
    ($('#upgradeMax') as HTMLButtonElement).disabled = this.upgradePending || max <= rec.level || target === max;
    ($('#closeUpgrade') as HTMLButtonElement).disabled = this.upgradePending;
    ($('#cancelUpgrade') as HTMLButtonElement).disabled = this.upgradePending;
    $('#modal').setAttribute('aria-busy', String(this.upgradePending));
    $('#upgradeHint').textContent = fuel < burning ? `燃烧灵魂不足，还差 ${burning - fuel} · 前往永生战域获取` : souls < cost ? `灵魂不足，还差 ${fmt(cost - souls)}` : '';
    $('#upgradeHint').hidden = !short;
    $('#upgradeHint').classList.toggle('short', short);
    $('#upgradeTrack').innerHTML = Array.from({ length: cap }, (_, i) =>
      `<i class="${i < rec.level ? 'earned' : i < target ? 'selected' : ''}"></i>`).join('');
    const stats = [
      { key: 'attack', label: '攻击', glyph: 'swords' }, { key: 'armor', label: '护甲', glyph: 'shield' },
      { key: 'health', label: '生命', glyph: 'heart' }, { key: 'magic', label: '魔法', glyph: 'orb' },
    ] as const;
    $('#modalPreview').innerHTML = stats.map(({ key, label, glyph }) => {
      const gain = next[key] - current[key];
      return `<li class="upgrade-stat ${key}${gain ? ' improved' : ''}" aria-label="${label}：${current[key]} → ${next[key]}${gain ? `，增加 ${gain}` : '，无变化'}">
        <span class="upgrade-stat-icon" aria-hidden="true">${icon(glyph)}</span><span class="upgrade-stat-label">${label}</span>
        <b>${current[key]}<span aria-hidden="true"> → </span><strong>${next[key]}</strong></b>
        <small>${gain ? `+${gain}` : '—'}</small></li>`;
    }).join('');
    $('#upgradeTotalCost').textContent = fmt(cost) + (burning ? ` + ${burning} 燃烧灵魂` : '');
    $('#soulPreview').textContent = `${fmt(souls)} → ${souls < cost ? '不足' : fmt(souls - cost)}${burning ? ` · 燃烧灵魂 ${fuel} → ${Math.max(0,fuel-burning)}` : ''}`;
    $('.upgrade-resource', this.upgradeModal!).classList.toggle('short', short);
    const confirm = $('#confirmUpgrade') as HTMLButtonElement;
    confirm.disabled = this.upgradePending || short || target <= rec.level;
    confirm.querySelector('span')!.textContent = this.upgradePending ? '提升中…' : '确认提升';
  }

  private async confirmUpgrade(): Promise<void> {
    if (this.upgradePending) return;
    this.paintUpgradeModal();
    if (($('#confirmUpgrade') as HTMLButtonElement).disabled) return;
    this.upgradePending = true;
    this.paintUpgradeModal();
    const modal = $('#modal');
    try {
      const { result } = await this.ctx.gateway.levelUpTroop(this.currentId, this.upgradeTargetLevel);
      if (!modal.isConnected) return;
      if (result.ok) {
        modal.hidden = true;
        $('#stage').inert = false;
        showAcquisitionDialog('部队升级完成', [{ label: `Lv.${result.to}`, detail: this.troop()?.name ?? '部队', icon: 'chevrons', status: '已提升' }], `花费 ${fmt(result.soulsSpent)} 灵魂`);
        this.afterMutation();
        const opener = $('#upgrade') as HTMLButtonElement;
        (opener.disabled ? $('#portraitExpand') : opener).focus({ preventScroll: true });
      } else {
        toast(result.message);
      }
    } catch {
      if (modal.isConnected) toast('提升请求失败，请稍后重试。');
    } finally {
      this.upgradePending = false;
      if (modal.isConnected && !modal.hidden) this.paintUpgradeModal();
    }
  }

  private async unlockNextTrait(): Promise<void> {
    const rec = this.rec();
    if (!rec) return;
    const slot = rec.traits.findIndex((v) => !v) + 1;
    if (slot <= 0) return;
    const { result } = await this.ctx.gateway.unlockTroopTrait(this.currentId, slot);
    if (result.ok) {
      const troop = getTroopById(this.currentId);
      showAcquisitionDialog('部队特质已解锁', [{
        label: troop?.traits[slot - 1]?.name ?? `特质 ${slot}`, detail: troop?.name, icon: 'sparkles', status: '已解锁',
      }], Object.entries(result.cost.stones).map(([key, n]) => `${stoneName(key)} ×${n}`).join(' · ') + (result.burningSpent ? ` · 燃烧灵魂 ×${result.burningSpent}` : ''));
      this.afterMutation();
    } else {
      toast(result.message);
    }
  }

  private async ascend(): Promise<void> {
    const { result } = await this.ctx.gateway.ascendTroop(this.currentId);
    if (result.ok) {
      showAcquisitionDialog('部队升阶成功', [{ label: `${result.ascension} 阶`, detail: `等级上限 ${result.newCap}`, icon: 'chevrons', status: '已提升' }]);
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
    this.renderCollection(false);
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
    if (syncHash) history.replaceState(null, '', view === 'detail' ? `#troop/${this.currentId}${this.detailSource}` : '#troop');
    if (view === 'collection') this.restoreCollectionScroll();
  }

  /** T-9：详情返回图鉴时恢复当前页内的滚动位置。 */
  private restoreCollectionScroll(): void {
    const el = $('#collectionBands');
    if (!el) return;
    el.scrollTop = Math.min(this.collectionScroll, Math.max(0, el.scrollHeight - el.clientHeight));
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
    return matchesTroopCatalog(troop, {
      rarity: skip === 'rarity' ? null : this.rarityFilter,
      color: skip === 'color' ? null : this.colorFilter,
      type: skip === 'type' ? null : this.typeFilter,
      kingdom: skip === 'kingdom' ? null : this.kingdomFilter,
      role: skip === 'role' ? null : this.roleFilter,
      query: skip === 'search' ? '' : query,
    });
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
    this.rarityFilter = this.colorFilter = this.typeFilter = this.kingdomFilter = this.roleFilter = null;
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
    else if (dim === 'role') this.roleFilter = null;
    else if (dim === 'search') ($('#collectionSearch') as HTMLInputElement).value = '';
    else if (dim === 'tab') this.collectionMode = 'owned';
    this.syncFilterControls();
    this.renderCollection();
  }

  /** 把内部筛选态写回控件（撤销单条/重置后控件要跟着变） */
  private syncFilterControls(): void {
    $$('#rarityChips [data-rarity]').forEach((x) => {
      const selected = (x.dataset.rarity === '' ? null : Number(x.dataset.rarity)) === this.rarityFilter;
      x.classList.toggle('selected', selected);
      x.setAttribute('aria-pressed', String(selected));
    });
    $$('#colorChips [data-color]').forEach((x) => {
      const selected = x.dataset.color === this.colorFilter;
      x.classList.toggle('selected', selected);
      x.setAttribute('aria-pressed', String(selected));
    });
    $$('#roleChips [data-role]').forEach((x) => {
      const selected = (x.dataset.role === '' ? null : x.dataset.role) === this.roleFilter;
      x.classList.toggle('selected', selected);
      x.setAttribute('aria-pressed', String(selected));
    });
    ($('#typeSelect') as HTMLSelectElement).value = this.typeFilter ?? '';
    ($('#kingdomSelect') as HTMLSelectElement).value = this.kingdomFilter ?? '';
    ($('#sortSelect') as HTMLSelectElement).value = this.sortKey;
    ($('#groupSelect') as HTMLSelectElement).value = this.groupMode;
    $$('#collection [data-tab]').forEach((x) => {
      const selected = x.dataset.tab === this.collectionMode;
      x.classList.toggle('selected', selected);
      x.setAttribute('aria-pressed', String(selected));
    });
  }

  private pageSize(): number {
    if (window.innerWidth <= 700) return PAGE_SIZE_MOBILE;
    if (window.innerWidth <= 1100) return PAGE_SIZE_TABLET;
    if (window.innerWidth <= 1399) {
      const gridWidth = window.innerWidth - 48;
      const columns = Math.floor((gridWidth + 12) / (154 + 12));
      return Math.min(PAGE_SIZE_DESKTOP, 2 * columns);
    }
    return PAGE_SIZE_DESKTOP;
  }

  private changeCollectionPage(delta: number): void {
    const next = Math.min(this.collectionPages, Math.max(1, this.collectionPage + delta));
    if (next === this.collectionPage) return;
    this.collectionPage = next;
    this.renderCollection(false);
  }

  private renderCollection(resetPage = true): void {
    this.syncFilterControls();
    const save = this.ctx.save();
    const ownedCount = Object.keys(save.collection).length;
    $('#tabOwnedCount').textContent = fmt(ownedCount);

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

    // 定位 chip 计数（口径与品质一致：忽略本维后的命中数）
    const roleBase = pool.filter((t) => this.matches(t, query, 'role'));
    const perRole = new Map<string, number>();
    for (const t of roleBase) if (t.role) perRole.set(t.role, (perRole.get(t.role) ?? 0) + 1);
    $$('#roleChips [data-role]').forEach((chip) => {
      const box = chip.querySelector('[data-chip-count]');
      if (!box) return;
      const raw = chip.dataset.role;
      box.textContent = raw === '' ? fmt(roleBase.length) : fmt(perRole.get(raw ?? '') ?? 0);
    });

    // 筛选摘要 chip 行 + 重置按钮（重置连 tab 一起，见 resetFilters）
    const active = this.activeFilterChips(query);
    $('#activeFilters').innerHTML = active
      .map((f) => `<button class="filter-chip selected" data-drop="${f.dim}" title="移除该条件">${f.label} ✕</button>`)
      .join('');
    // T-15：用 visibility 占位而不是 hidden，避免整行左右抖 34px
    $('#resetFilters').classList.toggle('is-off', active.length === 0);
    $('#shownCount').textContent = active.some((f) => f.dim !== 'tab') ? `匹配 ${fmt(sorted.length)} 支` : '';

    const container = $('#collectionBands');
    const pagination = $('#collectionPagination');
    if (!sorted.length) {
      container.innerHTML = this.emptyHtml(ownedCount, query, active);
      container.scrollTop = 0;
      pagination.hidden = true;
      this.collectionPage = 1;
      this.collectionPages = 1;
      this.collectionScroll = 0;
      return;
    }

    this.collectionPageSize = this.pageSize();
    const grouped = this.groupMode === 'kingdom' && !this.kingdomFilter;
    const kingdomPages = grouped ? this.kingdomPages(sorted) : [];
    if (grouped) {
      this.listIds = kingdomPages.flatMap((page) => page.flatMap((band) => band.troops.map((t) => t.id)));
      this.collectionPages = kingdomPages.length;
      if (this.locateAnchor && this.pageAnchorId) {
        const anchorPage = kingdomPages.findIndex((page) => page.some((band) => band.troops.some((t) => t.id === this.pageAnchorId)));
        if (anchorPage >= 0) this.collectionPage = anchorPage + 1;
      }
      this.locateAnchor = false;
    } else {
      this.collectionPages = Math.max(1, Math.ceil(sorted.length / this.collectionPageSize));
    }
    this.collectionPage = resetPage ? 1 : Math.min(this.collectionPages, Math.max(1, this.collectionPage));

    let start = 0;
    let end = 0;
    let pageItems: TroopData[] = [];
    if (grouped) {
      const pageBands = kingdomPages[this.collectionPage - 1] ?? [];
      for (let i = 0; i < this.collectionPage - 1; i += 1) {
        start += kingdomPages[i]!.reduce((n, band) => n + band.troops.length, 0);
      }
      pageItems = pageBands.flatMap((band) => band.troops);
      end = start + pageItems.length;
      container.innerHTML = pageBands
        .map((band) => this.sectionHtml(band.kingdom, band.troops))
        .join('');
    } else {
      start = (this.collectionPage - 1) * this.collectionPageSize;
      end = Math.min(sorted.length, start + this.collectionPageSize);
      pageItems = sorted.slice(start, end);
      container.innerHTML = `<div class="collection-cards" id="denseGrid">${pageItems.map((t) => this.cardHtml(t)).join('')}</div>`;
    }
    this.pageAnchorId = pageItems[0]?.id ?? 0;

    pagination.hidden = false;
    $('#collectionRange').textContent = `${fmt(start + 1)}–${fmt(end)} / 共 ${fmt(sorted.length)} 支`;
    $('#collectionPage').textContent = fmt(this.collectionPage);
    $('#collectionPages').textContent = fmt(this.collectionPages);
    ($('#collectionPrev') as HTMLButtonElement).disabled = this.collectionPage <= 1;
    ($('#collectionNext') as HTMLButtonElement).disabled = this.collectionPage >= this.collectionPages;
    container.scrollTop = 0;
    this.collectionScroll = 0;
  }

  /**
   * 按王国整组翻页。一组不论多少张都留在同一页；一页能放下几组就放几组，放不下的整组挪到下一页。
   * 组内仍用当前排序。
   */
  private kingdomPages(sorted: TroopData[]): Array<Array<{ kingdom: string; troops: TroopData[] }>> {
    const bands = new Map<string, TroopData[]>();
    for (const troop of sorted) {
      const key = troop.kingdom ?? '无王国';
      const band = bands.get(key);
      if (band) band.push(troop);
      else bands.set(key, [troop]);
    }
    const order = [...bands.keys()].sort((a, b) => {
      const ia = KINGDOM_ORDER.indexOf(a);
      const ib = KINGDOM_ORDER.indexOf(b);
      return (ia < 0 ? KINGDOM_ORDER.length : ia) - (ib < 0 ? KINGDOM_ORDER.length : ib);
    });
    const pages: Array<Array<{ kingdom: string; troops: TroopData[] }>> = [];
    let page: Array<{ kingdom: string; troops: TroopData[] }> = [];
    let count = 0;
    for (const kingdom of order) {
      const troops = bands.get(kingdom)!;
      if (page.length > 0 && count + troops.length > this.collectionPageSize) {
        pages.push(page);
        page = [];
        count = 0;
      }
      page.push({ kingdom, troops });
      count += troops.length;
    }
    if (page.length > 0) pages.push(page);
    return pages;
  }

  private sectionHtml(kingdom: string, troops: TroopData[]): string {
    const save = this.ctx.save();
    const ownedInKingdom = troops.filter((t) => save.collection[String(t.id)]).length;
    const pct = troops.length ? (ownedInKingdom / troops.length) * 100 : 0;
    const countLabel = ownedInKingdom === troops.length
      ? `${troops.length} 支`
      : `${troops.length} 支 · 已拥有 ${ownedInKingdom}`;
    // kingdom-section 让分组头只在自身区间内 sticky，不会盖住其他王国
    return `<div class="kingdom-section"><div class="kingdom-band"><span class="band-mark"></span><b>${kingdom}</b><small>${countLabel}</small><div><i style="width:${pct}%"></i></div></div><div class="collection-cards">${troops.map((t) => this.cardHtml(t)).join('')}</div></div>`;
  }

  /** 浏览卡只负责辨认立绘；战斗数值和副本资料在详情页查看。 */
  private cardHtml(t: TroopData): string {
    const rec = this.ctx.save().collection[String(t.id)];
    const locked = !rec;
    const level = locked ? '未获得' : `Lv.${rec.level}`;
    return `<button class="collection-card r-${t.rarityIdx}${locked ? ' locked' : ''}" data-troop="${t.id}" aria-label="查看${t.name}详情（${RARITY_CN[t.rarityIdx]}，${level}）">${troopCardFace(t, rec)}</button>`;
  }

  /** 当前生效的筛选维度（摘要 chip + 空态回退都用它） */
  private activeFilterChips(query: string): Array<{ dim: FilterDim; label: string }> {
    const out: Array<{ dim: FilterDim; label: string }> = [];
    if (this.collectionMode === 'all') out.push({ dim: 'tab', label: '全部图鉴' });
    if (this.rarityFilter !== null) out.push({ dim: 'rarity', label: RARITY_CN[this.rarityFilter] ?? String(this.rarityFilter) });
    if (this.colorFilter) out.push({ dim: 'color', label: (COLOR_CN[this.colorFilter] ?? this.colorFilter) + '色' });
    if (this.typeFilter) out.push({ dim: 'type', label: typeCn([this.typeFilter]) });
    if (this.kingdomFilter) out.push({ dim: 'kingdom', label: this.kingdomFilter });
    if (this.roleFilter) out.push({ dim: 'role', label: roleNameZh(this.roleFilter) ?? this.roleFilter });
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
    this.upgradeModal?.remove();
    this.upgradeModal = null;
    this.termTipsSpell?.();
    this.termTipsTraits?.();
    const stage = document.getElementById('stage');
    if (stage) stage.inert = false;
    const zoom = document.getElementById('portraitZoom') as HTMLDialogElement | null;
    if (zoom?.open) zoom.close();
    document.getElementById('stage')?.classList.remove('collection-responsive');
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
