/**
 * 宝箱 / 抽卡屏（计划 §5.7）。开箱结果来自 gacha 系统（种子化 + 十连保底 Epic+），
 * 翻牌演出/音效沿用小样资产；概率公示从 economy 权重表派生（数值单源）。
 */
import { GEM_CHEST, GLORY_CHEST, GOLD_CHEST, GEM_CHEST_WEIGHTS, GOLD_CHEST_WEIGHTS } from '../data/economy';
import { stoneName } from '../data/materials';
import { rarityClassByIndex, rarityNameByIndex } from '../data/rarity';
import { getTroopById, type TroopData } from '../../data/troops';
import { isFailure } from '../gateway';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopArt, troopArtFallback } from './teamScreen';
import { getPlayerPreferences, prefersReducedMotion } from '../../preferences/playerPreferences';

const fmt = (n: number): string => n.toLocaleString('en-US');

const FX = {
  circle: { src: '/meta/assets/fx/gacha_circle_strip.png', n: 18, w: 463, h: 360, ms: 900 },
  epic: { src: '/meta/assets/fx/gacha_epic_burst_strip.png', n: 16, w: 207, h: 320, ms: 540 },
  legendBurst: { src: '/meta/assets/fx/gacha_legend_burst_strip.png', n: 11, w: 349, h: 400, ms: 480 },
  aura: { src: '/meta/assets/fx/gacha_legend_aura_strip.png', n: 13, w: 290, h: 359, ms: 1400 },
  flash: { src: '/meta/assets/fx/gacha_legend_flash_strip.png', n: 5, w: 480, h: 480, ms: 1200 },
} as const;

type FxSpec = (typeof FX)[keyof typeof FX];

const stripCache = new Map<string, Promise<HTMLImageElement>>();

function loadStrip(src: string): Promise<HTMLImageElement> {
  if (!stripCache.has(src)) {
    stripCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }),
    );
  }
  return stripCache.get(src)!;
}

type FxClass = 'common' | 'rare' | 'epic' | 'legend';

/** 演出稀有度分档：神话全场 slam / 史诗紫 burst / 稀有与传说普通光 / 其余无演出。 */
function fxClassOf(rarityIdx: number): FxClass {
  if (rarityIdx >= 5) return 'legend';
  if (rarityIdx >= 4) return 'epic';
  if (rarityIdx >= 2) return 'rare';
  return 'common';
}

/** 「最近获得」条容量（一次十连必须能全看见；CH-5 落存档在批次 3） */
const RECENT_CAP = 10;

type ChestPool = 'gem' | 'gold' | 'glory';
type OpenKind = 'gem-1' | 'gem-10' | 'gold-1' | 'gold-10' | 'glory-1' | 'glory-10';
type ChestPage = 'keys' | 'gems';

function chestPageOf(param?: string): ChestPage {
  return param === 'gems' ? 'gems' : 'keys';
}

interface OpenSpec {
  pool: ChestPool;
  /** 一次成交的张数（原子批量，CH-1） */
  count: number;
  /** 一次成交的货币总价 */
  cost: number;
  label: string;
}

/** 六枚开箱按钮的成交口径（数值全部来自 economy 单源） */
const OPEN_SPECS: Record<OpenKind, OpenSpec> = {
  'gold-1': { pool: 'gold', count: 1, cost: GOLD_CHEST.keyCost, label: '开启一次' },
  'gold-10': { pool: 'gold', count: GOLD_CHEST.multiCount, cost: GOLD_CHEST.keyCost * GOLD_CHEST.multiCount, label: '开启十次' },
  'gem-1': { pool: 'gem', count: 1, cost: GEM_CHEST.singleCost, label: '召唤一次' },
  'gem-10': { pool: 'gem', count: GEM_CHEST.multiCount, cost: GEM_CHEST.multiCost, label: '召唤十次' },
  'glory-1': { pool: 'glory', count: 1, cost: GLORY_CHEST.cost, label: '开启一次' },
  'glory-10': { pool: 'glory', count: GLORY_CHEST.multiCount, cost: GLORY_CHEST.cost * GLORY_CHEST.multiCount, label: '开启十次' },
};

const POOL_CN: Record<ChestPool, { currency: string; unit: string; title: string }> = {
  gold: { currency: '金钥匙', unit: '把', title: '金钥匙宝箱' },
  gem: { currency: '宝石', unit: '', title: '宝石宝箱' },
  glory: { currency: '荣耀', unit: '', title: '荣耀宝箱' },
};

/** 「还差 3 把」/「还差 1,496 宝石」——余额不足的按钮文案（CH-1/CH-4） */
function shortLabel(pool: ChestPool, missing: number): string {
  const cn = POOL_CN[pool];
  return cn.unit ? `还差 ${fmt(missing)} ${cn.unit}` : `还差 ${fmt(missing)} ${cn.currency}`;
}

interface RewardVm {
  troop: TroopData | null;
  name: string;
  art: string;
  /** CDN 未命中时的本地兜底立绘 */
  fb: string;
  /** 六档部队稀有度索引，供卡牌边框和最近获得条使用。 */
  rarityIdx: number;
  /** 开箱演出仍使用四档特效分类，与视觉边框解耦。 */
  fxClass: FxClass;
  rarity: string;
  duplicate: boolean;
}

function oddsRows(weights: readonly number[]): string {
  return weights
    .map((weight, index) => `<div class="odds-row"><span class="odds-swatch ${rarityClassByIndex(index)}"></span><b>${rarityNameByIndex(index)}</b><span>${(weight / 100).toFixed(1)}%</span></div>`)
    .join('');
}

interface DrawOutcome {
  rewards: RewardVm[];
  /** 荣耀箱可能没有部队卡；这段文字必须进入可见反馈面板，而不是只发 toast。 */
  summary?: string;
}

export class ChestsScreen implements Screen {
  private ctx!: ShellCtx;
  private page: ChestPage = 'keys';
  private phase: 'closed' | 'opening' | 'dealing' | 'ready' | 'revealing' | 'complete' = 'closed';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private fxTimers = new Map<HTMLElement, number>();
  private totalRewards = 0;
  private revealedCount = 0;
  private slamLocked = false;
  private recent: RewardVm[] = [];
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx, param?: string): string {
    void ctx;
    this.page = chestPageOf(param);
    const keysPage = this.page === 'keys';
    const heroArt = keysPage ? '/meta/assets/chests/key-glory-pool.webp' : '/meta/assets/chests/gem-pool.webp';
    const pageLabel = keysPage ? '金钥匙与荣耀' : '宝石召唤';
    const dock = keysPage
      ? `
            <div class="chest-col key-pool">
              <div class="pool-head">
                <div class="chest-name">金钥匙宝箱</div>
                <span class="pool-balance"><span data-icon="key"></span>持有 <b id="dockKeyBalance">0</b></span>
              </div>
              <div class="chest-btns">
                <button class="chest-btn" data-open="gold-1" type="button"><span class="btn-label">开启一次</span><small><span data-icon="key"></span><b class="btn-cost">${GOLD_CHEST.keyCost}</b></small></button>
                <button class="chest-btn featured" data-open="gold-10" type="button"><span class="btn-label">开启十次</span><small><span data-icon="key"></span><b class="btn-cost">${GOLD_CHEST.keyCost * GOLD_CHEST.multiCount}</b></small></button>
              </div>
              <div class="chest-note"><span>普通至传说部队</span><b>重复进同名副本</b></div>
            </div>
            <div class="dock-divider" aria-hidden="true"><i></i><span data-icon="sparkles"></span><i></i></div>
            <div class="chest-col glory-pool">
              <div class="pool-head">
                <div class="chest-name">荣耀宝箱</div>
                <span class="pool-balance"><span data-icon="swords"></span>持有 <b id="dockGloryBalance">0</b></span>
              </div>
              <div class="chest-btns">
                <button class="chest-btn" data-open="glory-1" type="button"><span class="btn-label">开启一次</span><small><span data-icon="swords"></span><b class="btn-cost">${GLORY_CHEST.cost}</b></small></button>
                <button class="chest-btn featured" data-open="glory-10" type="button"><span class="btn-label">开启十次</span><small><span data-icon="swords"></span><b class="btn-cost">${GLORY_CHEST.cost * GLORY_CHEST.multiCount}</b></small></button>
              </div>
              <div class="chest-note"><span>特质石为主 · 概率卡/金钥匙</span><b>${GLORY_CHEST.cost} 荣耀 / 箱</b></div>
            </div>`
      : `
            <div class="chest-col gem-pool chest-col-wide">
              <div class="pool-head">
                <div class="chest-name">宝石宝箱</div>
                <span class="pool-balance gem-balance"><span data-icon="crystal"></span>持有 <b id="dockGemBalance">0</b></span>
              </div>
              <div class="chest-btns">
                <button class="chest-btn gem" data-open="gem-1" type="button"><span class="btn-label">召唤一次</span><small><span data-icon="crystal"></span><b class="btn-cost">${fmt(GEM_CHEST.singleCost)}</b></small></button>
                <button class="chest-btn gem featured" data-open="gem-10" type="button"><span class="btn-label">召唤十次</span><small><span data-icon="crystal"></span><b class="btn-cost">${fmt(GEM_CHEST.multiCost)}</b></small></button>
              </div>
              <div class="chest-note"><span>高阶部队概率提升</span><b>十连必得史诗以上</b></div>
            </div>`;
    return `
      ${topbarHtml()}
      <div class="screen chest-screen">
        <section class="panel chest-panel ${keysPage ? 'keys-chest-page' : 'gem-chest-page'}">
          <nav class="chest-tabs" aria-label="宝箱类型">
            <a class="chest-tab${keysPage ? ' active' : ''}" href="#chests/keys"><b>金钥匙与荣耀</b><span>部队卡、特质石与金钥匙</span></a>
            <a class="chest-tab${!keysPage ? ' active' : ''}" href="#chests/gems"><b>宝石宝箱</b><span>高阶部队 · 十连保底</span></a>
            <a class="chest-tab" href="#shop/gems"><b>宝石商店</b><span>直购武器</span></a>
          </nav>
          <div class="chest-stage">
            <img class="chest-art" src="${heroArt}" alt="${pageLabel}主视觉">
          </div>
          <div class="recent-bar">
            <div class="recent-heading"><b>最近获得</b></div>
            <div class="drops" id="drops"></div>
            <span class="recent-empty" id="recentEmpty">本页还没有开箱记录</span>
            <button class="odds-link" id="showOdds" type="button">奖池与概率 <span data-icon="arrow"></span></button>
          </div>
          <div class="chest-dock ${keysPage ? 'dual-dock' : 'single-dock'}">${dock}</div>
        </section>
      </div>
      ${bottomNavHtml('宝箱', '概率与权重表同源')}
      ${toastHtml()}

      <div class="modal-veil" id="partialVeil" hidden>
        <section class="money-tip" role="dialog" aria-modal="true" aria-labelledby="partialTitle">
          <h2 id="partialTitle">钥匙不够十连</h2>
          <ul>
            <li><span>十连需要</span><b>${GOLD_CHEST.keyCost * GOLD_CHEST.multiCount} 把金钥匙</b></li>
            <li><span>你现在持有</span><b id="partialHave">0 把</b></li>
            <li><span>可以立刻开启</span><b id="partialCount">0 次</b></li>
          </ul>
          <div class="chest-btns" style="margin-top:18px">
            <button class="chest-btn featured" id="partialConfirm" type="button"><span class="btn-label">开启</span><small><span data-icon="key"></span><b class="btn-cost">0</b></small></button>
          </div>
          <button class="cancel" id="partialCancel" type="button">取消 · 先攒够十连</button>
        </section>
      </div>

      <div class="summon-modal" id="summonModal" hidden>
        <div class="summon-veil" data-summon-close></div>
        <section class="summon-sheet" role="dialog" aria-modal="true" aria-labelledby="summonTitle">
          <header class="summon-head">
            <div>
              <h2 id="summonTitle">开启宝箱</h2>
            </div>
            <div class="summon-meta"><span id="summonPool">金钥匙宝箱</span><b id="summonCounter">0 / 1</b></div>
            <button class="summon-close" type="button" aria-label="关闭" data-summon-close>×</button>
          </header>
          <div class="summon-stage" id="summonStage">
            <div class="summon-scene" aria-hidden="true">
              <img id="summonSceneArt" src="${heroArt}" alt="">
            </div>
            <div class="fx-stage" id="fxStage" aria-hidden="true">
              <canvas class="fx-layer fx-circle" id="fxCircle" hidden></canvas>
            </div>
            <div class="summon-cards" id="summonCards"></div>
            <div class="fx-front" id="fxFront" aria-hidden="true">
              <canvas class="fx-layer fx-burst" id="fxBurst" hidden></canvas>
              <canvas class="fx-layer fx-beam" id="fxBeam" hidden></canvas>
            </div>
            <div class="legend-slam" id="legendSlam" hidden>
              <canvas class="fx-layer slam-aura" id="slamAura" hidden></canvas>
              <div class="legend-slam-card" id="legendSlamCard"></div>
              <canvas class="fx-layer slam-flash" id="slamFlash" hidden></canvas>
              <div class="legend-slam-name" id="legendSlamName"></div>
            </div>
            <button class="summon-action" id="summonAction" type="button">全部翻开</button>
          </div>
          <footer class="summon-foot">
            <span><i class="status-dot"></i><b id="summonStatus">等待翻牌</b></span>
            <span class="foot-tip">点击卡背逐张翻开 · 重复获得自动折入同名副本</span>
            <small class="summon-extra" id="summonExtra" hidden></small>
            <button class="summon-skip" id="summonSkip" type="button">全部翻开</button>
          </footer>
        </section>
      </div>

      <aside class="odds-drawer" id="oddsDrawer" hidden aria-labelledby="oddsTitle">
        <div class="odds-drawer-veil" data-odds-close></div>
        <section class="odds-sheet" role="dialog" aria-modal="true">
          <header><div><h2 id="oddsTitle">${this.page === 'keys' ? '金钥匙与荣耀' : '宝石'}奖池</h2></div><button type="button" class="odds-close" data-odds-close aria-label="关闭概率">×</button></header>
          <div class="odds-content">
            ${this.page === 'keys' ? `<section class="odds-pool"><h3>金钥匙宝箱</h3>${oddsRows(GOLD_CHEST_WEIGHTS)}<p>每把金钥匙开启一次；重复部队进入同名副本。</p></section><section class="odds-pool glory-odds"><h3>荣耀宝箱</h3><div class="glory-rate"><b>25%</b><span>部队卡</span><b>10%</b><span>金钥匙</span><b>65%</b><span>特质石 / 圣辉石</span></div><p>荣耀箱以材料为主，${GLORY_CHEST.cost} 荣耀开启一次。</p></section>` : `<section class="odds-pool"><h3>宝石宝箱</h3>${oddsRows(GEM_CHEST_WEIGHTS)}<p>十连最后一张保底史诗或神话部队。</p></section>`}
          </div>
          <footer>概率按当前权重表展示；同一批结果会完整写入最近获得记录。</footer>
        </section>
      </aside>

      <div class="glory-feedback" id="gloryFeedback" hidden>
        <div class="glory-feedback-veil" data-glory-close></div>
        <section class="glory-feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="gloryFeedbackTitle">
          <h2 id="gloryFeedbackTitle">荣耀箱已开启</h2>
          <p id="gloryFeedbackCopy"></p>
          <button class="primary" type="button" data-glory-close>收下奖励</button>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx, _root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    _root.classList.add('chests-responsive');
    this.page = chestPageOf(param);
    this.loadRecent();
    this.paintDrops();
    this.refreshBalances();
    $$('[data-open]').forEach((btn) =>
      this.on(btn, 'click', () => void this.requestOpen((btn as HTMLElement).dataset.open as OpenKind)),
    );
    this.bind('#partialConfirm', 'click', () => {
      const count = this.partialCount;
      this.closePartial();
      if (count > 0) void this.openSummon('gold', count);
    });
    this.bind('#partialCancel', 'click', () => this.closePartial());
    this.bind('#summonAction', 'click', () => this.handleActionBtn());
    this.bind('#summonSkip', 'click', () => this.revealAll());
    $$('[data-summon-close]').forEach((el) => this.on(el, 'click', () => this.closeSummon()));
    this.bind('#partialVeil', 'click', (e) => {
      if ((e as MouseEvent).target === $('#partialVeil')) this.closePartial();
    });
    this.on(document, 'keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      if (!$('#partialVeil').hidden) return void this.closePartial();
      if (!$('#oddsDrawer').hidden) return void this.closeOdds();
      if (!$('#gloryFeedback').hidden) return void this.closeGloryFeedback();
      if (this.phase !== 'closed') this.closeSummon();
    });
    this.bind('#showOdds', 'click', () => this.showOdds());
    $$('[data-odds-close]').forEach((el) => this.on(el, 'click', () => this.closeOdds()));
    $$('[data-glory-close]').forEach((el) => this.on(el, 'click', () => this.closeGloryFeedback()));
    Object.values(FX).forEach((spec) => void loadStrip(spec.src));
  }

  // —— 页面小件 ——

  private loadRecent(): void {
    const kinds: ChestPool[] = this.page === 'keys' ? ['gold', 'glory'] : ['gem'];
    const save = this.ctx.save();
    this.recent = save.gachaLog
      .filter((entry) => kinds.includes(entry.kind))
      .flatMap((entry) => entry.troops.map((troopId) => {
        const troop = getTroopById(troopId) ?? null;
        const record = save.collection[String(troopId)];
        const rarityIdx = troop?.rarityIdx ?? 0;
        return {
          troop,
          name: troop?.name ?? `部队 #${troopId}`,
          art: troopArt(troop),
          fb: troopArtFallback(troop),
          rarityIdx,
          fxClass: fxClassOf(rarityIdx),
          rarity: rarityNameByIndex(rarityIdx),
          duplicate: (record?.copies ?? 0) > 0,
        };
      }))
      .slice(0, RECENT_CAP);
  }

  private paintDrops(): void {
    const dropsEl = $('#drops');
    const empty = $('#recentEmpty');
    dropsEl.innerHTML = this.recent
      .map(
        (d) =>
          `<button class="drop ${rarityClassByIndex(d.rarityIdx)}" type="button" title="${d.rarity} · ${d.name}${d.duplicate ? ' · 重复' : ''}"><img src="${d.art}" alt="${d.name}" loading="lazy" onerror="this.onerror=null;this.src='${d.fb}'"><span><b>${d.name}</b><small>${d.rarity}${d.duplicate ? ' · 重复' : ''}</small></span></button>`,
      )
      .join('');
    dropsEl.hidden = this.recent.length === 0;
    if (empty) empty.hidden = this.recent.length > 0;
  }

  /** 池货币余额 */
  private balanceOf(pool: ChestPool): number {
    const c = this.ctx.save().currencies;
    return pool === 'gold' ? c.goldKeys : pool === 'glory' ? c.glory : c.gems;
  }

  private refreshBalances(): void {
    const c = this.ctx.save().currencies;
    const set = (id: string, value: string): void => {
      const el = $('#' + id);
      if (el) el.textContent = value;
    };
    set('dockKeyBalance', String(c.goldKeys));
    set('dockGemBalance', fmt(c.gems));
    set('dockGloryBalance', fmt(c.glory));
    $$('[data-open]').forEach((btn) => this.paintOpenButton(btn as HTMLButtonElement));
    // 顶栏钱包同步（外壳 bindChrome 之后 mutation 需要手动刷新）
    set('keyBalance', String(c.goldKeys));
    set('gemBalance', fmt(c.gems));
    set('goldBalance', fmt(c.gold));
    set('soulBalance', fmt(c.souls));
    const glory = $('#gloryBalance');
    if (glory) glory.textContent = fmt(c.glory);
  }

  /**
   * 单枚开箱按钮的三态（CH-1 / CH-4）：
   *  - 买得起：原文案 + 可点；
   *  - 金钥匙十连但只够 N 抽（N≥1）：改「开启 N 次」+ 可点（点了走二次确认，原子开 N 次）；
   *  - 买不起：改「还差 N」+ **真 disabled**（历史实现只加滤镜，玩家必踩 CH-1）。
   */
  private paintOpenButton(btn: HTMLButtonElement): void {
    const kind = btn.dataset.open as OpenKind;
    const spec = OPEN_SPECS[kind];
    if (!spec) return;
    const cn = POOL_CN[spec.pool];
    const balance = this.balanceOf(spec.pool);
    const labelEl = btn.querySelector('.btn-label');
    const costEl = btn.querySelector('.btn-cost');
    const paint = (label: string, cost: number, title: string): void => {
      if (labelEl) labelEl.textContent = label;
      if (costEl) costEl.textContent = fmt(cost);
      btn.title = title;
    };
    if (balance >= spec.cost) {
      btn.disabled = false;
      btn.classList.remove('is-unaffordable', 'is-partial');
      paint(spec.label, spec.cost, '');
      return;
    }
    if (kind === 'gold-10' && balance >= GOLD_CHEST.keyCost) {
      const missing = spec.cost - balance;
      btn.disabled = false;
      btn.classList.remove('is-unaffordable');
      btn.classList.add('is-partial');
      paint(`开启 ${balance} 次`, balance, `钥匙只够 ${balance} 抽 · 还差 ${missing} 把凑十连`);
      return;
    }
    btn.disabled = true;
    btn.classList.add('is-unaffordable');
    btn.classList.remove('is-partial');
    paint(shortLabel(spec.pool, spec.cost - balance), spec.cost, `${cn.currency}不足：需要 ${fmt(spec.cost)}，现有 ${fmt(balance)}`);
  }

  // —— 部分开启的二次确认（CH-1：不允许静默扣费，也不允许静默拦下） ——

  private partialCount = 0;

  private askPartial(count: number): void {
    this.partialCount = count;
    const veil = $('#partialVeil');
    $('#partialHave').textContent = `${count} 把`;
    $('#partialCount').textContent = `${count} 次`;
    const ok = $('#partialConfirm');
    const label = ok.querySelector('.btn-label');
    const cost = ok.querySelector('.btn-cost');
    if (label) label.textContent = `开启 ${count} 次`;
    if (cost) cost.textContent = String(count);
    veil.hidden = false;
  }

  private closePartial(): void {
    this.partialCount = 0;
    const veil = $('#partialVeil');
    if (veil) veil.hidden = true;
  }

  private showOdds(): void {
    const drawer = $('#oddsDrawer');
    if (drawer) drawer.hidden = false;
  }

  private closeOdds(): void {
    const drawer = $('#oddsDrawer');
    if (drawer) drawer.hidden = true;
  }

  private showGloryFeedback(summary: string): void {
    const modal = $('#gloryFeedback');
    const copy = $('#gloryFeedbackCopy');
    if (!modal || !copy) return;
    copy.textContent = summary;
    modal.hidden = false;
  }

  private closeGloryFeedback(): void {
    const modal = $('#gloryFeedback');
    if (modal) modal.hidden = true;
  }

  // —— 抽卡主流程 ——

  /**
   * 拉一批开箱结果。**一次网关调用 = 一笔原子成交**（CH-1）：
   * 历史实现把金钥匙十连做成"循环 10 次单抽"，第 8 次失败就丢弃前 7 次已持久化的结果。
   */
  private async drawRewards(pool: ChestPool, count: number): Promise<DrawOutcome | null> {
    const gateway = this.ctx.gateway;
    let cards: Array<{ troopId: number; rarityIdx: number; duplicate: boolean }> = [];
    if (pool === 'gem' || pool === 'gold') {
      const { result } = await gateway.openChest(pool, count);
      if (isFailure(result)) {
        toast(result.message);
      return null;
      }
      cards = result.cards;
    } else {
      // 荣耀箱：特质石为主——有卡走翻牌演出，无卡走明确的轻量反馈面板。
      const { result } = await gateway.openChest('glory', count);
      if (isFailure(result)) {
        toast(result.message);
        return null;
      }
      if (!('stones' in result)) return null; // 荣耀分支恒为 GloryChestResult，防御窄化
      const stones = Object.entries(result.stones.traitstones ?? {})
        .map(([key, n]) => `${stoneName(key)} ×${n}`)
        .join(' · ');
      const parts = [
        result.cards.length ? `部队卡 ×${result.cards.length}` : '',
        result.goldKeys ? `金钥匙 ×${result.goldKeys}` : '',
        stones,
      ].filter(Boolean);
      const summary = parts.join('，') || '本次没有额外掉落';
      cards = result.cards;
      const rewards = cards.map((c) => {
        const troop = getTroopById(c.troopId) ?? null;
        const rarityIdx = troop?.rarityIdx ?? c.rarityIdx;
        return {
          troop,
          name: troop?.name ?? `部队 #${c.troopId}`,
          art: troopArt(troop),
          fb: troopArtFallback(troop),
          rarityIdx,
          fxClass: fxClassOf(rarityIdx),
          rarity: rarityNameByIndex(rarityIdx),
          duplicate: c.duplicate,
        };
      });
      return { rewards, summary };
    }
    return { rewards: cards.map((c) => {
      const troop = getTroopById(c.troopId) ?? null;
      const rarityIdx = troop?.rarityIdx ?? c.rarityIdx;
      return {
        troop,
        name: troop?.name ?? `部队 #${c.troopId}`,
        art: troopArt(troop),
        fb: troopArtFallback(troop),
        rarityIdx,
        fxClass: fxClassOf(rarityIdx),
        rarity: rarityNameByIndex(rarityIdx),
        duplicate: c.duplicate,
      };
    }) };
  }

  /**
   * 按钮点击入口：先按余额决定成交形态，再交给 openSummon。
   * 余额不足时按钮已 disabled（paintOpenButton），这里再兜一层——
   * 无论走哪条分支都不允许"扣了但没演出"，也不允许静默不动。
   */
  private async requestOpen(kind: OpenKind): Promise<void> {
    if (this.phase !== 'closed') return;
    if (!$('#partialVeil').hidden) return;
    const spec = OPEN_SPECS[kind];
    if (!spec) return;
    const balance = this.balanceOf(spec.pool);
    if (balance >= spec.cost) return void (await this.openSummon(spec.pool, spec.count));
    if (kind === 'gold-10' && balance >= GOLD_CHEST.keyCost) {
      // 钥匙只够 N 抽：给明确选择（开 N 次 / 取消），不静默扣、不静默拦
      this.askPartial(Math.floor(balance / GOLD_CHEST.keyCost));
      return;
    }
    const cn = POOL_CN[spec.pool];
    toast(`${cn.currency}不足：需要 ${fmt(spec.cost)}，现有 ${fmt(balance)}`);
    this.refreshBalances();
  }

  private async openSummon(pool: ChestPool, count: number): Promise<void> {
    if (this.phase !== 'closed') return;
    const outcome = await this.drawRewards(pool, count);
    // 失败分支也要刷新余额与按钮态（CH-1：旧实现失败时余额数字停在旧值）
    if (!outcome) {
      this.refreshBalances();
      return;
    }
    const rewards = outcome.rewards;
    this.loadRecent();
    // 荣耀箱可能只出素材（无卡）：没有翻牌演出，直接刷新余额
    if (rewards.length === 0) {
      this.refreshBalances();
      if (outcome.summary) this.showGloryFeedback(outcome.summary);
      return;
    }

    // 入账成功：余额刷新 + 最近获得条（容量 ≥ 一次十连，否则十连刚开完就看不全）
    // gachaLog 已在网关成交时落盘，重新读取可避免当前批次被重复显示。
    this.loadRecent();
    this.paintDrops();
    this.refreshBalances();

    this.clearSummonTimers();
    this.slamLocked = false;
    const dealt = rewards.length;
    const modal = $('#summonModal');
    modal.hidden = false;
    // 多张一律走 batch-10 布局（部分开启可能是 2~9 张，CH-1 的 7 抽形态）
    modal.className = `summon-modal is-opening${dealt > 1 ? ' batch-10' : ''}`;
    $('#summonPool').textContent = POOL_CN[pool].title;
    const sceneArt = $('#summonSceneArt') as HTMLImageElement | null;
    if (sceneArt) sceneArt.src = pool === 'gem' ? '/meta/assets/chests/gem-pool.webp' : '/meta/assets/chests/key-glory-pool.webp';
    $('#summonCounter').textContent = `0 / ${dealt}`;
    const extra = $('#summonExtra');
    if (extra) {
      extra.textContent = outcome.summary ?? '';
      extra.hidden = !outcome.summary;
    }
    $('#summonSkip').hidden = false;
    $('#legendSlam').hidden = true;
    this.renderSummonCards(rewards);
    this.setSummonText('开启中', '开启中', true);
    this.phase = 'opening';
    void this.playSfx('start');
    void this.playFx($('#fxCircle'), FX.circle, {
      ondone: () => {
        if (this.phase !== 'opening') return;
        this.dealCards();
      },
    });
  }

  private renderSummonCards(rewards: RewardVm[]): void {
    this.totalRewards = rewards.length;
    this.revealedCount = 0;
    const cardsEl = $('#summonCards');
    cardsEl.innerHTML = rewards
      .map((d, i) => {
        const p = this.cardPosition(i, rewards.length);
        return `<article class="summon-card ${rarityClassByIndex(d.rarityIdx)} fx-${d.fxClass}" data-rarity="${d.fxClass}" data-rarity-idx="${d.rarityIdx}" data-name="${d.name}" data-art="${d.art}" data-fb="${d.fb}" data-dup="${d.duplicate ? 1 : 0}" style="--x:${p.x}px;--y:${p.y}px;--rot:${p.rot}deg;">
          <div class="card-3d">
            <div class="card-back" aria-hidden="true"></div>
            <div class="card-face">
              <img src="${d.art}" alt="${d.name}" loading="lazy" onerror="this.onerror=null;this.src='${d.fb}'">
              <div class="card-label"><small>${d.rarity}${d.duplicate ? ' · 重复' : ''}</small><b>${d.name}</b></div>
            </div>
          </div>
        </article>`;
      })
      .join('');
    $$('.summon-card', cardsEl).forEach((card) => this.on(card, 'click', () => this.revealSingleCard(card as HTMLElement, false)));
  }

  private cardPosition(index: number, count: number): { x: number; y: number; rot: number } {
    if (count === 1) return { x: 0, y: 0, rot: 0 };
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    if (viewportWidth <= 640) {
      const columns = Math.min(3, count);
      const rows = Math.ceil(count / columns);
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, count - row * columns);
      const col = index % columns;
      return {
        x: (col - (rowCount - 1) / 2) * 100,
        y: (row - (rows - 1) / 2) * 132,
        rot: (col - (rowCount - 1) / 2) * 1.2,
      };
    }
    if (viewportWidth <= 900) {
      const columns = Math.min(5, count);
      const rows = Math.ceil(count / columns);
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, count - row * columns);
      const col = index % columns;
      return {
        x: (col - (rowCount - 1) / 2) * 132,
        y: (row - (rows - 1) / 2) * 190,
        rot: (col - (rowCount - 1) / 2) * 1.5,
      };
    }
    if (viewportWidth < 1400) {
      const columns = Math.min(5, count);
      const rows = Math.ceil(count / columns);
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, count - row * columns);
      const col = index % columns;
      return {
        x: (col - (rowCount - 1) / 2) * 156,
        y: (row - (rows - 1) / 2) * 210,
        rot: (col - (rowCount - 1) / 2) * 1.8,
      };
    }
    const col = index % 5;
    const row = Math.floor(index / 5);
    return { x: (col - 2) * 192, y: row ? 116 : -116, rot: (col - 2) * 2.2 + (row ? -1 : 1) };
  }

  private dealCards(): void {
    const modal = $('#summonModal');
    const cards = $$('.summon-card', $('#summonCards'));
    modal.classList.remove('is-opening');
    modal.classList.add('is-dealing');
    this.phase = 'dealing';
    const reduced = prefersReducedMotion();
    cards.forEach((card, i) => this.later(reduced ? 0 : i * 80, () => card.classList.add('is-dealt')));
    this.later(reduced ? 0 : cards.length * 80 + 200, () => {
      this.phase = 'ready';
      modal.classList.remove('is-dealing');
      modal.classList.add('is-ready');
      this.setSummonText('点击卡牌翻开', '全部翻开', false);
    });
  }

  private revealSingleCard(card: HTMLElement, isAuto: boolean): void {
    if (this.phase === 'closed' || this.phase === 'complete') return;
    if (this.phase === 'opening' || this.phase === 'dealing') return;
    if (card.classList.contains('is-revealed') || card.classList.contains('is-flipping')) return;
    if (!card.classList.contains('is-dealt')) return;
    if (this.slamLocked && !isAuto) return;

    const rarity = card.dataset.rarity!;
    card.classList.add('is-flipping');
    $('#summonModal').classList.add('is-bursting');
    this.phase = 'revealing';
    this.revealedCount += 1;

    const finishFlip = (): void => {
      card.classList.remove('is-flipping');
      if (!this.slamLocked) $('#summonModal').classList.remove('is-bursting');
      this.checkSummonFinish();
    };

    if (prefersReducedMotion()) {
      if (rarity === 'legend') void this.playSfx('legend', isAuto);
      else if (rarity === 'epic') void this.playSfx('rare', isAuto);
      card.classList.add('is-revealed');
      finishFlip();
      return;
    }

    if (rarity === 'legend') {
      void card.offsetWidth;
      this.placeOverCard($('#fxBurst'), card, FX.legendBurst, 2.15);
      void this.playFx($('#fxBurst'), FX.legendBurst);
      void this.playSfx('legend', isAuto);
      this.later(FX.legendBurst.ms - 40, () => card.classList.add('is-revealed'));
      if (!isAuto) {
        this.slamLocked = true;
        this.later(FX.legendBurst.ms + 420, () => this.showLegendSlam(card, finishFlip));
        return;
      }
      this.later(FX.legendBurst.ms + 400, finishFlip);
      return;
    }

    if (rarity === 'epic') {
      void card.offsetWidth;
      this.placeOverCard($('#fxBurst'), card, FX.epic, 2.1);
      void this.playFx($('#fxBurst'), FX.epic);
      void this.playSfx('rare', isAuto);
      this.later(140, () => card.classList.add('is-revealed'));
      this.later(FX.epic.ms, finishFlip);
      return;
    }

    card.classList.add('is-revealed');
    this.later(380, finishFlip);
  }

  private revealAll(): void {
    if (this.phase === 'complete' || this.phase === 'closed') return;
    this.stopFx($('#fxCircle'));
    $$('.summon-card', $('#summonCards')).forEach((card) => card.classList.add('is-dealt'));
    this.phase = 'ready';
    this.slamLocked = false;
    const cards = $$('.summon-card:not(.is-revealed)', $('#summonCards'));
    const reduced = prefersReducedMotion();
    cards.forEach((card, i) => this.later(reduced ? 0 : i * 150, () => this.revealSingleCard(card as HTMLElement, true)));
  }

  private checkSummonFinish(): void {
    $('#summonCounter').textContent = `${this.revealedCount} / ${this.totalRewards}`;
    if (this.revealedCount >= this.totalRewards) this.finishSummon();
    else this.setSummonText(`已翻开 ${this.revealedCount}/${this.totalRewards}`, '全部翻开', false);
  }

  private finishSummon(): void {
    this.phase = 'complete';
    this.slamLocked = false;
    const modal = $('#summonModal');
    modal.classList.remove('is-ready', 'is-dealing', 'is-opening', 'is-bursting');
    modal.classList.add('is-complete');
    $('#summonSkip').hidden = true;
    ['fxCircle', 'fxBurst', 'fxBeam', 'slamAura', 'slamFlash'].forEach((id) => this.stopFx($('#' + id)));
    this.setSummonText('开启完成', '收下奖励', false);
  }

  private handleActionBtn(): void {
    if (this.phase === 'complete') this.closeSummon();
    else if (this.phase === 'ready' || this.phase === 'revealing') this.revealAll();
  }

  private closeSummon(): void {
    this.clearSummonTimers();
    this.stopSfx();
    this.phase = 'closed';
    this.slamLocked = false;
    ['fxCircle', 'fxBurst', 'fxBeam', 'slamAura', 'slamFlash'].forEach((id) => this.stopFx($('#' + id)));
    const modal = $('#summonModal');
    modal.hidden = true;
    modal.className = 'summon-modal';
    $('#legendSlam').hidden = true;
    const extra = $('#summonExtra');
    if (extra) {
      extra.hidden = true;
      extra.textContent = '';
    }
    this.refreshBalances();
  }

  // —— 传说 slam 演出 ——

  private showLegendSlam(card: HTMLElement, done: () => void): void {
    const slam = $('#legendSlam');
    this.stopFx($('#fxBurst'));
    this.stopFx($('#slamAura'));
    this.stopFx($('#slamFlash'));
    $('#legendSlamName').textContent = card.dataset.name!;
    $('#legendSlamCard').innerHTML = `<img src="${card.dataset.art}" alt="${card.dataset.name}" onerror="this.onerror=null;this.src='${card.dataset.fb}'"><div class="card-sheen"></div>`;
    slam.hidden = false;
    void slam.offsetWidth;
    const aura = $('#slamAura');
    const flash = $('#slamFlash');
    this.placeSlamLayer(aura, FX.aura, 1.52, 0, 28);
    void this.playFx(aura, FX.aura);
    this.placeSlamLayer(flash, FX.flash, 1.08, 122, -168);
    this.later(280, () => {
      if (slam.hidden) return;
      void this.playFx(flash, FX.flash);
    });
    slam.onclick = () => {
      slam.hidden = true;
      slam.onclick = null;
      this.stopFx(aura);
      this.stopFx(flash);
      this.slamLocked = false;
      $('#summonModal').classList.remove('is-bursting');
      done();
    };
  }

  private placeSlamLayer(el: HTMLElement, spec: FxSpec, cover: number, ox = 0, oy = 0): void {
    const host = $('#legendSlamCard');
    const displayH = Math.round(Math.max(host.offsetHeight, 352) * cover);
    const isCanvas = typeof (el as HTMLCanvasElement).getContext === 'function';
    el.style.left = '50%';
    el.style.top = '50%';
    if (isCanvas) {
      const displayW = Math.round(displayH * (spec.w / spec.h));
      el.style.width = `${displayW}px`;
      el.style.height = `${displayH}px`;
      el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      return;
    }
    const scale = displayH / spec.h;
    el.style.width = `${spec.w}px`;
    el.style.height = `${spec.h}px`;
    el.style.transform = `translate(-50%, -50%) translate(${ox / scale}px, ${oy / scale}px) scale(${scale})`;
  }

  private placeOverCard(canvas: HTMLElement, card: HTMLElement, spec: FxSpec, cover = 2.2): void {
    const h = Math.round(card.offsetHeight * cover);
    const w = Math.round(h * (spec.w / spec.h));
    card.appendChild(canvas);
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.transform = 'translate(-50%, -50%)';
  }

  // —— FX 播放器 ——

  private async playFx(canvas: HTMLElement | null, spec: FxSpec, opts: { ondone?: () => void } = {}): Promise<void> {
    if (!canvas || !spec) return;
    if (prefersReducedMotion()) {
      this.stopFx(canvas);
      opts.ondone?.();
      return;
    }
    const ctx2d = (canvas as HTMLCanvasElement).getContext('2d');
    if (!ctx2d) return;
    this.stopFx(canvas, false);
    canvas.hidden = false;
    void canvas.offsetWidth;
    let img: HTMLImageElement;
    try {
      img = await loadStrip(spec.src);
    } catch {
      return;
    }
    if (this.phase === 'closed') return;
    const cw = Math.max(2, Math.round(canvas.clientWidth || spec.w));
    const ch = Math.max(2, Math.round(canvas.clientHeight || spec.h));
    const cv = canvas as HTMLCanvasElement;
    cv.width = cw;
    cv.height = ch;
    const draw = (i: number): void => {
      ctx2d.clearRect(0, 0, cw, ch);
      ctx2d.drawImage(img, i * spec.w, 0, spec.w, spec.h, 0, 0, cw, ch);
    };
    const frameDur = spec.ms / spec.n;
    const start = performance.now();
    draw(0);
    const tick = (now: number): void => {
      if (!this.fxTimers.has(canvas)) return;
      const elapsed = now - start;
      if (elapsed >= spec.ms) {
        this.fxTimers.delete(canvas);
        this.stopFx(canvas, true);
        opts.ondone?.();
        return;
      }
      draw(Math.min(spec.n - 1, Math.floor(elapsed / frameDur)));
      this.fxTimers.set(canvas, requestAnimationFrame(tick));
    };
    this.fxTimers.set(canvas, requestAnimationFrame(tick));
  }

  private stopFx(el: HTMLElement | null, hide = true): void {
    if (!el) return;
    const id = this.fxTimers.get(el);
    if (id !== undefined) {
      cancelAnimationFrame(id);
      clearInterval(id);
      this.fxTimers.delete(el);
    }
    if (!hide) return;
    el.hidden = true;
    const ctx2d = (el as HTMLCanvasElement).getContext?.('2d');
    if (ctx2d) {
      ctx2d.clearRect(0, 0, (el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height);
    } else {
      el.style.backgroundImage = '';
    }
    const host = el.id === 'slamAura' || el.id === 'slamFlash' ? $('#legendSlam') : $('#fxFront');
    if (host && el.parentElement !== host) host.appendChild(el);
  }

  // —— 音效 ——

  private sfx?: Record<string, HTMLAudioElement>;

  private ensureSfx(): Record<string, HTMLAudioElement> {
    if (!this.sfx) {
      this.sfx = {
        start: new Audio('/meta/assets/sfx/summon-start.wav'),
        rare: new Audio('/meta/assets/sfx/reveal-epic.wav'),
        legend: new Audio('/meta/assets/sfx/reveal-legend.wav'),
      };
    }
    const volume = getPlayerPreferences().soundEffectsVolume;
    Object.values(this.sfx).forEach((audio) => { audio.volume = volume; });
    return this.sfx;
  }

  private async playSfx(name: 'start' | 'rare' | 'legend', once = false): Promise<void> {
    const preferences = getPlayerPreferences();
    if (!preferences.soundEffectsEnabled || preferences.soundEffectsVolume <= 0) return;
    const sfx = this.ensureSfx()[name];
    if (!sfx) return;
    sfx.volume = preferences.soundEffectsVolume;
    if (once && !sfx.paused) return;
    try {
      sfx.currentTime = 0;
      await sfx.play();
    } catch {
      /* 自动播放策略拒绝时静默 */
    }
  }

  private stopSfx(): void {
    if (!this.sfx) return;
    Object.values(this.sfx).forEach((audio) => audio.pause());
  }

  // —— 工具 ——

  private setSummonText(status: string, action: string, disabled = false): void {
    $('#summonStatus').textContent = status;
    $('#summonAction').textContent = action;
    ($('#summonAction') as HTMLButtonElement).disabled = disabled;
  }

  private later(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const id = setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }

  private clearSummonTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    for (const [, id] of this.fxTimers) {
      cancelAnimationFrame(id);
      clearInterval(id);
    }
    this.fxTimers.clear();
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
    document.getElementById('stage')?.classList.remove('chests-responsive');
    this.closeSummon();
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
