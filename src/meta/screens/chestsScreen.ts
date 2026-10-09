import { gemMultiCost, goldChestPrice, noviceSummonAvailable, type ChestDrop, type ChestItemDrop, type GachaCard } from '../systems/gacha';
import { ingotArt, materialImg, stoneMarkupForKey } from '../shell/materialArt';
/**
 * 宝箱 / 抽卡屏（计划 §5.7）。开箱结果来自 gacha 系统（种子化 + 十连保底稀有或以上），
 * 翻牌演出/音效沿用小样资产；概率公示从 economy 权重表派生（数值单源）。
 */
import {
  CHEST_LOOT_BASE, GACHA_PITY_MIN_IDX, GEM_CHEST, GEM_CHEST_BASE, GEM_CHEST_EXTRA, GEM_CHEST_WEIGHTS, GLORY_CHEST, GLORY_CHEST_LOOT, GOLD_CHEST, GOLD_CHEST_LOOT,
  type ChestLootRow,
} from '../data/economy';
import { GACHA_RULES } from '../data/gachaRules';
import { INGOT_NAMES, stoneName, type IngotKey, type MaterialDelta } from '../data/materials';
import { rarityClassByIndex, rarityNameByIndex } from '../data/rarity';
import { getTroopById, troopToCharacter, type TroopData } from '../../data/troops';
import { traitSlotsOf } from '../../render/CharacterDetailPanel';
import { UnitSheet, type UnitSheetData } from '../../render/UnitSheet';
import { troopStatsOf, rarityTierOf, getRecord } from '../systems/troopProgress';
import { RARITY_TIERS } from '../data/rarity';
import { raceNames } from '../data/races';
import { roleNameZh } from '../data/roles';
import { isFailure } from '../gateway';
import { reallyOwned } from '../systems/wishlist';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopArt, troopArtFallback } from './teamScreen';
import { getPlayerPreferences, prefersReducedMotion } from '../../preferences/playerPreferences';
import { prepareTexture, SpriteFx, type Sprite } from './summonFx';

const fmt = (n: number): string => n.toLocaleString('en-US');
const WISHLIST_REMINDER_KEY = 'gems.gacha.wishlist-reminder.v1';

function localDayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

const FX = {
  circle: { src: '/static/fx/gacha/gacha_circle_strip.webp', n: 18, w: 463, h: 360, ms: 900 },
  epic: { src: '/static/fx/gacha/gacha_epic_burst_strip.webp', n: 16, w: 207, h: 320, ms: 540 },
  legendBurst: { src: '/static/fx/gacha/gacha_legend_burst_strip.webp', n: 11, w: 349, h: 400, ms: 480 },
  aura: { src: '/static/fx/gacha/gacha_legend_aura_strip.webp', n: 13, w: 290, h: 359, ms: 1400 },
  flash: { src: '/static/fx/gacha/gacha_legend_flash_strip.webp', n: 5, w: 480, h: 480, ms: 1200 },
} as const;

interface FxSpec { src: string; n: number; w: number; h: number; ms: number }

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

/** 演出档与六档稀有度的中文名一一对应：稀有 rare / 传说 legend / 史诗 epic / 神话 mythic。 */
type FxClass = 'common' | 'rare' | 'legend' | 'epic' | 'mythic';

/**
 * 演出分档：
 * - 普通 / 精良：直接翻牌；
 * - 稀有：短蓄力 + 光芒/冲击环贴图 + 轻震；
 * - 传说：光流汇聚蓄力 + 原史诗爆发序列帧（金色着色、放大放慢）+ 光芒/双冲击环/闪光 + 中震 → 金色特写；
 * - 史诗：原神话演出（传说爆发序列帧 + 光环/闪光序列帧特写）+ 光流/光羽 + 强震；
 * - 神话：暗场长蓄力（双层光流汇聚 + 星尘）→ 全屏闪白 → 爆发 + 闪光序列帧 + 光羽 → 强化特写 + 重震。
 * 2026-09-29 用户裁定：不使用圆形法阵 / 圆环类贴图（开箱开场法阵序列帧是原资产，保留不动）。
 */
function fxClassOf(rarityIdx: number): FxClass {
  if (rarityIdx >= 5) return 'mythic';
  if (rarityIdx >= 4) return 'epic';
  if (rarityIdx >= 3) return 'legend';
  if (rarityIdx >= 2) return 'rare';
  return 'common';
}

/** 需要独占舞台的档位（播放期间锁定点击、自动翻牌逐张等待） */
const HEAVY_FX: ReadonlySet<FxClass> = new Set<FxClass>(['legend', 'epic', 'mythic']);

/** 各档主色（白光贴图 / 序列帧着色） */
const TIER_TINT: Record<Exclude<FxClass, 'common'>, string> = {
  rare: '#b779ff',
  legend: '#ffc93c',
  epic: '#ff8a3a',
  mythic: '#5fe2ff',
};

/** 震动反馈：shake = 舞台位移强度倍率；haptic = 移动端马达节奏（ms，不支持时静默）。 */
const TIER_FEEL: Record<Exclude<FxClass, 'common'>, { shake: number; haptic: number[] }> = {
  rare: { shake: 0.35, haptic: [18] },
  legend: { shake: 0.7, haptic: [30, 40, 40] },
  epic: { shake: 1, haptic: [45, 45, 70] },
  mythic: { shake: 1.4, haptic: [80, 50, 60, 50, 140] },
};

/** 放慢放大后的爆发帧：传说用蓝色爆发帧着金，史诗/神话用传说爆发帧 */
const BURST_LEGEND = { ...FX.epic, ms: 780 };
const BURST_HEAVY = { ...FX.legendBurst, ms: 640 };

function haptic(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 不支持震动的设备静默 */
  }
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
/** 馈赠页领到部队卡后，借宝箱页的翻牌演出展示（奖励已入账）；关闭演出回到 returnHash */
interface GiftReveal { cards: GachaCard[]; gems: number; gold: number; souls: number; mats: MaterialDelta; returnHash: string; label?: string }
let pendingGiftReveal: GiftReveal | null = null;
export function queueGiftReveal(reveal: GiftReveal): void {
  pendingGiftReveal = reveal;
}

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
  wishLabel?: string;
  /** 材料 / 资源牌：卡面直接画这段素材图（无立绘、无特写） */
  item?: string;
}

const CURRENCY_ICON: Record<string, string> = { gold: 'coin', glory: 'glory', souls: 'soul', gems: 'crystal' };

/** 材料牌（白 / 绿 / 紫三档卡框；最高档用稀有部队的紫色翻牌特效，不做放大特写） */
function itemVm(item: ChestItemDrop): RewardVm {
  const name = item.type === 'ingot' ? INGOT_NAMES[item.key as IngotKey] ?? item.key
    : item.type === 'stone' ? stoneName(item.key)
    : CURRENCY_CN[item.key] ?? item.key;
  const art = item.type === 'ingot' ? materialImg(ingotArt(item.key))
    : item.type === 'stone' ? stoneMarkupForKey(item.key)
    : `<span data-icon="${CURRENCY_ICON[item.key] ?? 'coin'}"></span>`;
  return {
    troop: null,
    name: `${name} ×${fmt(item.amount)}`,
    art: '',
    fb: '',
    rarityIdx: item.tier,
    fxClass: item.tier >= 2 ? 'rare' : 'common',
    rarity: item.type === 'currency' ? '资源' : '材料',
    duplicate: false,
    item: art,
  };
}

const STONE_TIER_CN: Record<string, string> = { minor: '初级特质石', major: '高级特质石', runic: '符文特质石', arcane: '秘法特质石', celestial: '圣辉石' };
const CURRENCY_CN: Record<string, string> = { gold: '黄金', glory: '荣耀', souls: '灵魂', gems: '宝石' };
const LOOT_GROUP_CN: Record<ChestLootRow['group'], string> = { troop: '部队', ingot: '金属锭', stone: '特质石', resource: '资源' };

/** 宝石箱公示：部队档（万分比）换算到十万分比后与材料表拼成同一张分组表；0 概率档不列 */
function gemLootRows(): ChestLootRow[] {
  const scale = CHEST_LOOT_BASE / GEM_CHEST_BASE;
  const troops: ChestLootRow[] = GEM_CHEST_WEIGHTS.flatMap((w, rarityIdx) =>
    w > 0 ? [{ group: 'troop' as const, weight: w * scale, loot: { type: 'troop' as const, rarityIdx } }] : []);
  return [...troops, ...GEM_CHEST_EXTRA];
}

function lootPct(weight: number): string {
  return `${Number(((weight / CHEST_LOOT_BASE) * 100).toFixed(2))}%`;
}

/** 金宝箱 / 荣耀宝箱概率公示：按分组列出，数值直接来自 economy 掉落表 */
function lootOdds(rows: readonly ChestLootRow[]): string {
  const groups = [...new Set(rows.map((row) => row.group))];
  return groups.map((group) => {
    const members = rows.filter((row) => row.group === group);
    const sum = members.reduce((acc, row) => acc + row.weight, 0);
    const lines = members.map(({ loot, weight }) => {
      if (loot.type === 'troop') {
        return `<div class="odds-row"><span class="odds-swatch ${rarityClassByIndex(loot.rarityIdx)}"></span><b>${rarityNameByIndex(loot.rarityIdx)}</b><span>${lootPct(weight)}</span></div>`;
      }
      const name = loot.type === 'stone' ? `${STONE_TIER_CN[loot.tier]} ×${loot.amount}`
        : loot.type === 'ingot' ? `${INGOT_NAMES[loot.key]} ×${loot.amount}`
        : `${CURRENCY_CN[loot.key]} ×${fmt(loot.amount)}`;
      return `<div class="odds-row"><span class="odds-swatch odds-swatch-plain"></span><b>${name}</b><span>${lootPct(weight)}</span></div>`;
    }).join('');
    return `<div class="odds-group"><div class="odds-group-head"><b>${LOOT_GROUP_CN[group]}</b><span>${lootPct(sum)}</span></div>${lines}</div>`;
  }).join('');
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
  private wishlistReminderResolve: ((proceed: boolean) => void) | null = null;
  private totalRewards = 0;
  private revealedCount = 0;
  /** 独占演出（传说及以上）进行中：锁定手动翻牌 */
  private slamLocked = false;
  /** 已结束演出的张数（全部结束才算开箱完成，避免高档演出中途被判完成） */
  private settledCount = 0;
  /** 「全部翻开」逐张队列：高档牌等演出（含 slam）结束后才翻下一张 */
  private autoQueue: HTMLElement[] = [];
  private autoRunning = false;
  private spriteFx?: SpriteFx;
  private rewardSheet?: UnitSheet;
  private recent: RewardVm[] = [];
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 馈赠借用开箱演出时：关闭演出后返回的页面（null = 普通开箱，留在宝箱页） */
  private returnHash: string | null = null;

  html(ctx: ShellCtx, param?: string): string {
    void ctx;
    this.page = chestPageOf(param);
    const keysPage = this.page === 'keys';
    const heroArt = keysPage ? '/static/chests/key-glory-pool.webp' : '/static/chests/gem-pool.webp';
    const pageLabel = keysPage ? '金钥匙与荣耀' : '宝石召唤';
    // 金钥匙按钮的费用位：钥匙 +（不足时）黄金补差，两段按余额显隐
    const goldCost = (keys: number): string =>
      `<small><span class="cost-keys"><span data-icon="key"></span><b class="btn-cost">${keys}</b></span><span class="cost-gold" hidden><span data-icon="coin"></span><b class="btn-gold">0</b></span></small>`;
    // 底栏：每个池 = 信息列（名称 / 余额 / 一句说明）+ 按钮组；宝石池右侧挂愿望单入口
    const dock = keysPage
      ? `
            <div class="dock-pool gold-pool">
              <div class="dock-info">
                <b class="chest-name">金钥匙宝箱</b>
                <span class="pool-balance"><span data-icon="key"></span><b id="dockKeyBalance">0</b><i>把</i><span data-icon="coin" class="bal-coin"></span><b id="dockGoldBalance">0</b></span>
                <p class="dock-note">资源与特质石为主 · 缺钥匙可用 ${GOLD_CHEST.keyGoldPrice} 黄金/把补</p>
              </div>
              <div class="chest-btns">
                <button class="chest-btn" data-open="gold-1" type="button"><span class="btn-label">开启一次</span>${goldCost(GOLD_CHEST.keyCost)}</button>
                <button class="chest-btn featured" data-open="gold-10" type="button"><span class="btn-label">开启十次</span>${goldCost(GOLD_CHEST.keyCost * GOLD_CHEST.multiCount)}</button>
              </div>
            </div>
            <div class="dock-divider" aria-hidden="true"><i></i><span data-icon="sparkles"></span><i></i></div>
            <div class="dock-pool glory-pool">
              <div class="dock-info">
                <b class="chest-name">荣耀宝箱</b>
                <span class="pool-balance"><span data-icon="glory"></span><b id="dockGloryBalance">0</b><span id="dockGloryKeys" class="bal-keys" hidden></span></span>
                <p class="dock-note">部队 70% · ${GLORY_CHEST.cost} 荣耀/箱 · 优先用荣耀钥匙</p>
              </div>
              <div class="chest-btns">
                <button class="chest-btn" data-open="glory-1" type="button"><span class="btn-label">开启一次</span><small><span data-icon="glory"></span><b class="btn-cost">${GLORY_CHEST.cost}</b></small></button>
                <button class="chest-btn featured" data-open="glory-10" type="button"><span class="btn-label">开启十次</span><small><span data-icon="glory"></span><b class="btn-cost">${GLORY_CHEST.cost * GLORY_CHEST.multiCount}</b></small></button>
              </div>
            </div>`
      : `
            <div class="dock-pool gem-pool">
              <div class="dock-info">
                <b class="chest-name">宝石宝箱</b>
                <span class="pool-balance gem-balance"><span data-icon="crystal"></span><b id="dockGemBalance">0</b></span>
                <p class="dock-note">十连至少一张${rarityNameByIndex(GACHA_PITY_MIN_IDX)}或以上</p>
              </div>
              <div class="chest-btns">
                <button class="chest-btn gem" data-open="gem-1" type="button"><span class="btn-label">召唤一次</span><small><span data-icon="crystal"></span><b class="btn-cost">${fmt(GEM_CHEST.singleCost)}</b></small></button>
                <button class="chest-btn gem featured" data-open="gem-10" type="button"><span class="btn-label">召唤十次</span><small><span data-icon="crystal"></span><b class="btn-cost">${fmt(GEM_CHEST.multiCost)}</b></small></button>
              </div>
              <div class="wish-dock-actions">
                <button class="dock-wish" id="openWishlist" type="button"><b>愿望单</b><small id="wishlistSummary">去设置</small></button>
                <button class="dock-pursuit" id="openPursuit" type="button"><span data-icon="sparkles" aria-hidden="true"></span><span class="dock-pursuit-copy"><small>神话追寻</small><b id="pursuitSummary">未设置</b><em id="pursuitProgress">去设置 →</em></span></button>
              </div>
            </div>`;
    return `
      ${topbarHtml()}
      <div class="screen chest-screen">
        <section class="panel chest-panel ${keysPage ? 'keys-chest-page' : 'gem-chest-page'}">
          <nav class="chest-tabs" aria-label="宝箱类型">
            <a class="chest-tab${keysPage ? ' active' : ''}" href="#chests/keys"><b>金钥匙与荣耀</b><span>部队卡、特质石与金钥匙</span></a>
            <a class="chest-tab${!keysPage ? ' active' : ''}" href="#chests/gems"><b>宝石宝箱</b><span>高阶部队 · 十连保底</span></a>
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
      ${bottomNavHtml('宝箱', '')}
      ${toastHtml()}

      <div class="modal-veil" id="partialVeil" hidden>
        <section class="money-tip" role="dialog" aria-modal="true" aria-labelledby="partialTitle">
          <h2 id="partialTitle">金钥匙不足</h2>
          <ul>
            <li><span>本次开启需要</span><b id="partialNeed">0 把金钥匙</b></li>
            <li><span>你现在持有</span><b id="partialHave">0 把</b></li>
            <li><span>用黄金补齐</span><b id="partialBuy">0 把 × ${GOLD_CHEST.keyGoldPrice} = 0 黄金</b></li>
            <li><span>黄金余额</span><b id="partialGold">0</b></li>
          </ul>
          <div class="chest-btns partial-actions">
            <button class="chest-btn featured" id="partialBuyOpen" type="button"><span class="btn-label">补齐并开启</span><small><span data-icon="coin"></span><b class="btn-cost">0</b></small></button>
            <button class="chest-btn" id="partialConfirm" type="button"><span class="btn-label">只开 0 次</span><small><span data-icon="key"></span><b class="btn-cost">0</b></small></button>
          </div>
          <button class="cancel" id="partialCancel" type="button">取消</button>
        </section>
      </div>

      <div class="wishlist-reminder" id="wishlistReminder" hidden>
        <div class="wishlist-reminder-veil" id="wishlistReminderVeil"></div>
        <section class="wishlist-reminder-sheet" role="dialog" aria-modal="true" aria-labelledby="wishlistReminderTitle">
          <header class="wishlist-reminder-head">
            <h2 id="wishlistReminderTitle">自选卡池范围</h2>
            <button class="wishlist-reminder-close" id="wishlistReminderClose" type="button" aria-label="关闭提醒">×</button>
          </header>
          <div class="wishlist-reminder-content" id="wishlistReminderContent"></div>
          <label class="wishlist-reminder-check"><input type="checkbox" id="wishlistReminderToday"><span>今日不再提醒</span></label>
          <footer class="wishlist-reminder-foot">
            <button class="wishlist-reminder-settings" id="wishlistReminderSettings" type="button">去设置</button>
            <button class="wishlist-reminder-continue" id="wishlistReminderContinue" type="button">继续抽卡</button>
          </footer>
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
            <div class="summon-dim" aria-hidden="true"></div>
            <canvas class="fx-sprites fx-sprites-back" id="fxSpritesBack" aria-hidden="true"></canvas>
            <div class="summon-cards" id="summonCards"></div>
            <div class="fx-front" id="fxFront" aria-hidden="true">
              <canvas class="fx-layer fx-burst" id="fxBurst" hidden></canvas>
              <canvas class="fx-layer fx-beam" id="fxBeam" hidden></canvas>
            </div>
            <canvas class="fx-sprites fx-sprites-top" id="fxSpritesTop" aria-hidden="true"></canvas>
            <div class="legend-slam" id="legendSlam" hidden>
              <canvas class="fx-sprites slam-sprites" id="slamSprites" aria-hidden="true"></canvas>
              <div class="slam-motes" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="--mx:${(i * 37 + 11) % 96 + 2}%;--md:${(2.6 + (i % 5) * 0.45).toFixed(2)}s;--mdl:${((i * 0.29) % 2.4).toFixed(2)}s;--ms:${2 + (i % 3)}px"></i>`).join('')}</div>
              <canvas class="fx-layer slam-aura" id="slamAura" hidden></canvas>
              <div class="legend-slam-rarity" id="legendSlamRarity"></div>
              <div class="legend-slam-card" id="legendSlamCard"></div>
              <canvas class="fx-layer slam-flash" id="slamFlash" hidden></canvas>
              <div class="legend-slam-name" id="legendSlamName"></div>
              <small class="legend-slam-hint">点击继续</small>
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
            ${this.page === 'keys' ? `<section class="odds-pool"><h3>金钥匙宝箱</h3>${lootOdds(GOLD_CHEST_LOOT)}<p>1 把金钥匙开启一次；钥匙不足时可用 ${GOLD_CHEST.keyGoldPrice} 黄金补 1 把。不出史诗与神话部队。</p></section><section class="odds-pool glory-odds"><h3>荣耀宝箱</h3>${lootOdds(GLORY_CHEST_LOOT)}<p>${GLORY_CHEST.cost} 荣耀开启一次，优先消耗荣耀钥匙；重复部队进入同名副本。</p></section>` : `<section class="odds-pool"><h3>宝石宝箱</h3>${lootOdds(gemLootRows())}<p>不出普通与精良部队。十连至少获得一张${rarityNameByIndex(GACHA_PITY_MIN_IDX)}或以上部队；仅在整批未达标时把最后一张换成${rarityNameByIndex(GACHA_PITY_MIN_IDX)}部队。</p><p>以上为基础品质概率。愿望单只调整档内角色概率；神话追寻会替换触发抽，其额外产出未计入基础概率。<a href="#wishlist">查看愿望单、实时名单概率与追寻进度</a></p></section>`}
          </div>
          <footer>概率按当前权重表展示；同一批结果会完整写入最近获得记录。</footer>
        </section>
      </aside>

      <div class="glory-feedback" id="gloryFeedback" hidden>
        <div class="glory-feedback-veil" data-glory-close></div>
        <section class="glory-feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="gloryFeedbackTitle">
          <h2 id="gloryFeedbackTitle">宝箱已开启</h2>
          <p id="gloryFeedbackCopy"></p>
          <button class="primary" type="button" data-glory-close>收下奖励</button>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx, _root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    _root.classList.add('chests-responsive');
    this.page = chestPageOf(param);
    this.bind('#openWishlist', 'click', () => this.ctx.navigate('#wishlist'));
    this.bind('#openPursuit', 'click', () => this.ctx.navigate('#wishlist/pursuit'));
    this.loadRecent();
    this.paintDrops();
    this.refreshBalances();
    $$('[data-open]').forEach((btn) =>
      this.on(btn, 'click', () => void this.requestOpen((btn as HTMLElement).dataset.open as OpenKind)),
    );
    // 钥匙不足确认框：补齐（黄金+钥匙同一笔成交）/ 只开持有的钥匙数
    this.bind('#partialBuyOpen', 'click', () => {
      const plan = this.partialPlan;
      this.closePartial();
      if (plan) void this.openSummon('gold', plan.count, { buyMissingKeys: true });
    });
    this.bind('#partialConfirm', 'click', () => {
      const plan = this.partialPlan;
      this.closePartial();
      if (plan && plan.keys > 0) void this.openSummon('gold', plan.keys);
    });
    this.bind('#partialCancel', 'click', () => this.closePartial());
    this.bind('#wishlistReminderContinue', 'click', () => this.resolveWishlistReminder(true));
    this.bind('#wishlistReminderSettings', 'click', () => {
      this.resolveWishlistReminder(false);
      const destination = ($('#wishlistReminderSettings') as HTMLElement | null)?.dataset.destination ?? '#wishlist/pursuit';
      this.ctx.navigate(destination);
    });
    this.bind('#wishlistReminderContent', 'click', (event) => {
      if ((event.target as HTMLElement).closest('#wishlistReminderPursuitSettings')) {
        this.resolveWishlistReminder(false);
        this.ctx.navigate('#wishlist/pursuit');
      }
    });
    this.bind('#wishlistReminderClose', 'click', () => this.resolveWishlistReminder(false));
    this.bind('#wishlistReminderVeil', 'click', () => this.resolveWishlistReminder(false));
    this.bind('#summonAction', 'click', () => this.handleActionBtn());
    this.bind('#summonSkip', 'click', () => this.revealAll());
    this.on(window, 'resize', () => this.sizeRewardSheet());
    $$('[data-summon-close]').forEach((el) => this.on(el, 'click', () => this.closeSummon()));
    this.bind('#partialVeil', 'click', (e) => {
      if ((e as MouseEvent).target === $('#partialVeil')) this.closePartial();
    });
    this.on(document, 'keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      if (this.rewardSheet?.isOpen()) return void this.rewardSheet.close();
      if (!$('#partialVeil').hidden) return void this.closePartial();
      if (!$('#oddsDrawer').hidden) return void this.closeOdds();
      if (!$('#gloryFeedback').hidden) return void this.closeGloryFeedback();
      if (this.phase !== 'closed') this.closeSummon();
    });
    this.bind('#showOdds', 'click', () => this.showOdds());
    $$('[data-odds-close]').forEach((el) => this.on(el, 'click', () => this.closeOdds()));
    $$('[data-glory-close]').forEach((el) => this.on(el, 'click', () => this.closeGloryFeedback()));
    Object.values(FX).forEach((spec) => void loadStrip(spec.src));
    this.spriteFx = new SpriteFx({
      back: $('#fxSpritesBack') as HTMLCanvasElement,
      top: $('#fxSpritesTop') as HTMLCanvasElement,
      slam: $('#slamSprites') as HTMLCanvasElement,
    });
    this.spriteFx.preload();
    // 馈赠领到部队卡：借用开箱演出翻牌，关闭后回到馈赠页
    const gift = pendingGiftReveal;
    pendingGiftReveal = null;
    this.returnHash = null;
    if (gift) {
      this.returnHash = gift.returnHash;
      setTimeout(() => this.playGiftReveal(gift), 0);
    }
  }

  /** 馈赠部队卡翻牌（奖励已由网关入账，这里只做演出） */
  private playGiftReveal(gift: GiftReveal): void {
    const rewards = this.rewardsOf(gift.cards);
    if (rewards.length === 0) return;
    this.clearSummonTimers();
    this.slamLocked = false;
    this.autoQueue = [];
    this.autoRunning = false;
    const modal = $('#summonModal');
    modal.hidden = false;
    modal.className = `summon-modal is-opening${rewards.length > 1 ? ' batch-10' : ''}`;
    $('#summonTitle').textContent = gift.label ?? '馈赠';
    $('#summonPool').textContent = gift.label ?? '成长馈赠';
    const sceneArt = $('#summonSceneArt') as HTMLImageElement | null;
    if (sceneArt) sceneArt.src = '/static/chests/gem-pool.webp';
    $('#summonCounter').textContent = `0 / ${rewards.length}`;
    const extra = $('#summonExtra');
    if (extra) {
      extra.textContent = `同时获得宝石 +${fmt(gift.gems)} · 黄金 +${fmt(gift.gold)} · 灵魂 +${fmt(gift.souls)}${Object.entries(gift.mats.ingots ?? {}).map(([key, n]) => ` · ${INGOT_NAMES[key as IngotKey]} +${fmt(n ?? 0)}`).join('')}`;
      extra.hidden = gift.label === '神话自选';
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

  // —— 页面小件 ——

  private loadRecent(): void {
    const kinds: ChestPool[] = this.page === 'keys' ? ['gold', 'glory'] : ['gem'];
    const save = this.ctx.save();
    this.recent = save.gachaLog
      .filter((entry) => kinds.includes(entry.kind))
      .flatMap((entry) => entry.troops.map((troopId, index) => {
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
          wishLabel: entry.audit?.reasons[index] === 'pursuit' ? ' · 追寻保底' : entry.audit?.wishlistIds.includes(troopId) ? ' · 愿望命中' : '',
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
          `<button class="drop ${rarityClassByIndex(d.rarityIdx)}" type="button" title="${d.rarity} · ${d.name}${d.duplicate ? ' · 重复' : ''}"><img src="${d.art}" alt="${d.name}" loading="lazy" onerror="this.onerror=null;this.src='${d.fb}'"><span><b>${d.name}</b><small>${d.rarity}${d.duplicate ? ' · 重复' : ''}${d.wishLabel ?? ''}</small></span></button>`,
      )
      .join('');
    dropsEl.hidden = this.recent.length === 0;
    if (empty) empty.hidden = this.recent.length > 0;
  }

  /** 池货币余额 */
  private balanceOf(pool: ChestPool): number {
    const c = this.ctx.save().currencies;
    return pool === 'gold' ? c.goldKeys : pool === 'glory' ? c.glory + c.gloryKeys * GLORY_CHEST.cost : c.gems;
  }

  private refreshBalances(): void {
    const c = this.ctx.save().currencies;
    const set = (id: string, value: string): void => {
      const el = $('#' + id);
      if (el) el.textContent = value;
    };
    const wish = this.ctx.save().gachaWishlist;
    const wishButton = $('#openWishlist');
    const wishIncomplete = wish.troopIds.length < GACHA_RULES.maxTroops;
    if (wishButton) {
      wishButton.classList.toggle('is-incomplete', wishIncomplete);
      wishButton.setAttribute('aria-label', wishIncomplete
        ? `愿望单，已选 ${wish.troopIds.length} 名，还差 ${GACHA_RULES.maxTroops - wish.troopIds.length} 名`
        : `愿望单，已选 ${wish.troopIds.length} 名`);
    }
    set('wishlistSummary', wishIncomplete
      ? `还差 ${GACHA_RULES.maxTroops - wish.troopIds.length} 名`
      : `已选 ${wish.troopIds.length} 名`);
    const pursuitTarget = wish.pursuit.targetId !== null
      && wish.troopIds.includes(wish.pursuit.targetId)
      && !reallyOwned(this.ctx.save(), wish.pursuit.targetId)
      ? getTroopById(wish.pursuit.targetId)
      : null;
    const pursuitButton = $('#openPursuit');
    if (pursuitButton) {
      pursuitButton.classList.toggle('is-missing', !pursuitTarget);
      pursuitButton.setAttribute('aria-label', pursuitTarget
        ? `神话追寻：${pursuitTarget.name}，${wish.pursuit.progress >= wish.pursuit.limit ? '下一抽必出' : `最多再 ${wish.pursuit.limit - wish.pursuit.progress} 抽`}`
        : `神话追寻未设置，进度 ${wish.pursuit.progress} / ${wish.pursuit.limit} 抽，前往设置`);
    }
    set('pursuitSummary', pursuitTarget?.name ?? '未设置');
    set('pursuitProgress', pursuitTarget
      ? `${wish.pursuit.progress} / ${wish.pursuit.limit} 抽`
      : wish.pursuit.progress >= wish.pursuit.limit ? '选定后下一抽必出' : `${wish.pursuit.progress} / ${wish.pursuit.limit} 抽`);
    set('dockKeyBalance', String(c.goldKeys));
    set('dockGoldBalance', fmt(c.gold));
    set('dockGemBalance', fmt(c.gems));
    set('dockGloryBalance', fmt(c.glory));
    const gloryKeys = $('#dockGloryKeys');
    if (gloryKeys) {
      gloryKeys.hidden = c.gloryKeys <= 0;
      gloryKeys.textContent = `+ 钥匙 ${c.gloryKeys}`;
    }
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
    const spec = this.specOf(kind);
    if (!spec) return;
    const cn = POOL_CN[spec.pool];
    const balance = this.balanceOf(spec.pool);
    const labelEl = btn.querySelector('.btn-label');
    const costEl = btn.querySelector('.btn-cost');
    const setState = (state: 'ok' | 'partial' | 'short'): void => {
      btn.disabled = state === 'short';
      btn.classList.toggle('is-unaffordable', state === 'short');
      btn.classList.toggle('is-partial', state === 'partial');
    };

    if (spec.pool === 'glory') {
      const c = this.ctx.save().currencies;
      const keys = Math.min(c.gloryKeys, spec.count);
      const glory = (spec.count - keys) * GLORY_CHEST.cost;
      const affordable = c.glory >= glory;
      if (labelEl) labelEl.textContent = affordable ? spec.label : shortLabel('glory', glory - c.glory);
      if (costEl) costEl.textContent = keys ? `${keys} 钥匙${glory ? ` + ${glory}` : ''}` : String(glory);
      setState(affordable ? 'ok' : 'short');
      btn.title = affordable ? '优先消耗荣耀钥匙，再消耗荣耀' : `荣耀不足：需要 ${fmt(glory)}，现有 ${fmt(c.glory)}`;
      return;
    }

    if (spec.pool === 'gold') {
      // 钥匙优先；缺的钥匙显示成黄金补差，点击时弹确认（不静默花黄金）
      const c = this.ctx.save().currencies;
      const price = goldChestPrice(this.ctx.save(), spec.count);
      const keysPart = btn.querySelector<HTMLElement>('.cost-keys');
      const goldPart = btn.querySelector<HTMLElement>('.cost-gold');
      const goldEl = btn.querySelector('.btn-gold');
      if (costEl) costEl.textContent = String(price.boughtKeys ? price.keys : spec.cost);
      if (keysPart) keysPart.hidden = price.boughtKeys > 0 && price.keys === 0;
      if (goldPart) goldPart.hidden = price.boughtKeys === 0;
      if (goldEl) goldEl.textContent = fmt(price.gold);
      if (labelEl) labelEl.textContent = spec.label;
      if (price.boughtKeys === 0) {
        setState('ok');
        btn.title = '';
      } else if (c.gold >= price.gold || price.keys > 0) {
        setState('partial');
        btn.title = c.gold >= price.gold
          ? `金钥匙差 ${price.boughtKeys} 把，可用 ${fmt(price.gold)} 黄金补齐`
          : `金钥匙差 ${price.boughtKeys} 把，黄金不够补齐；可只开 ${price.keys} 次`;
      } else {
        setState('short');
        if (labelEl) labelEl.textContent = `还差 ${fmt(price.gold - c.gold)} 黄金`;
        btn.title = `金钥匙不足，补齐需要 ${fmt(price.gold)} 黄金，现有 ${fmt(c.gold)}`;
      }
      return;
    }

    const paint = (label: string, cost: number, title: string): void => {
      if (labelEl) labelEl.textContent = label;
      if (costEl) costEl.textContent = fmt(cost);
      btn.title = title;
    };
    if (balance >= spec.cost) {
      setState('ok');
      paint(spec.label, spec.cost, '');
      return;
    }
    setState('short');
    paint(shortLabel(spec.pool, spec.cost - balance), spec.cost, `${cn.currency}不足：需要 ${fmt(spec.cost)}，现有 ${fmt(balance)}`);
  }

  /** 首次宝石十连 = 新手十连（1000 宝石，必出异界来客） */
  private specOf(kind: OpenKind): OpenSpec | undefined {
    const spec = OPEN_SPECS[kind];
    if (kind !== 'gem-10' || !spec || !noviceSummonAvailable(this.ctx.save())) return spec;
    return { ...spec, cost: gemMultiCost(this.ctx.save()), label: '新手十连' };
  }

  // —— 部分开启的二次确认（CH-1：不允许静默扣费，也不允许静默拦下） ——

  private partialPlan: { count: number; keys: number } | null = null;

  /** 金钥匙不足：列出缺口与黄金补价，给「补齐并开启」与「只开持有数」两个明确选项 */
  private askGoldTopUp(count: number): void {
    const save = this.ctx.save();
    const price = goldChestPrice(save, count);
    const gold = save.currencies.gold;
    this.partialPlan = { count, keys: price.keys };
    $('#partialTitle').textContent = count > 1 ? '钥匙不够十连' : '没有金钥匙了';
    $('#partialNeed').textContent = `${count} 把金钥匙`;
    $('#partialHave').textContent = `${price.keys} 把`;
    $('#partialBuy').textContent = `${price.boughtKeys} 把 × ${GOLD_CHEST.keyGoldPrice} = ${fmt(price.gold)} 黄金`;
    $('#partialGold').textContent = fmt(gold);

    const buy = $('#partialBuyOpen') as HTMLButtonElement;
    const canBuy = gold >= price.gold;
    buy.disabled = !canBuy;
    buy.classList.toggle('is-unaffordable', !canBuy);
    buy.querySelector('.btn-label')!.textContent = canBuy ? `补齐并开启${count > 1 ? '十次' : '一次'}` : `黄金还差 ${fmt(price.gold - gold)}`;
    buy.querySelector('.btn-cost')!.textContent = fmt(price.gold);

    const only = $('#partialConfirm') as HTMLButtonElement;
    only.hidden = price.keys <= 0;
    only.querySelector('.btn-label')!.textContent = `只开 ${price.keys} 次`;
    only.querySelector('.btn-cost')!.textContent = String(price.keys);
    $('#partialVeil').hidden = false;
  }

  private closePartial(): void {
    this.partialPlan = null;
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

  private showGloryFeedback(summary: string, title = '宝箱已开启'): void {
    const modal = $('#gloryFeedback');
    const copy = $('#gloryFeedbackCopy');
    if (!modal || !copy) return;
    const heading = $('#gloryFeedbackTitle');
    if (heading) heading.textContent = title;
    copy.textContent = summary;
    modal.hidden = false;
  }

  private closeGloryFeedback(): void {
    const modal = $('#gloryFeedback');
    if (modal) modal.hidden = true;
  }

  private wishlistReminderSuppressed(): boolean {
    try {
      return localStorage.getItem(WISHLIST_REMINDER_KEY) === localDayKey();
    } catch {
      return false;
    }
  }

  private resolveWishlistReminder(proceed: boolean): void {
    const modal = $('#wishlistReminder');
    const checkbox = $('#wishlistReminderToday') as HTMLInputElement | null;
    if (checkbox?.checked) {
      try { localStorage.setItem(WISHLIST_REMINDER_KEY, localDayKey()); } catch { /* private storage may be blocked */ }
    }
    if (modal) modal.hidden = true;
    const resolve = this.wishlistReminderResolve;
    this.wishlistReminderResolve = null;
    resolve?.(proceed);
  }

  private showWishlistReminder(): Promise<boolean> {
    const save = this.ctx.save();
    const ids = save.gachaWishlist.troopIds;
    const missing = Math.max(0, GACHA_RULES.maxTroops - ids.length);
    const pursuit = save.gachaWishlist.pursuit;
    const pursuitTarget = pursuit.targetId !== null
      && ids.includes(pursuit.targetId)
      && !reallyOwned(save, pursuit.targetId)
      ? getTroopById(pursuit.targetId)
      : null;
    if (missing === 0 && pursuitTarget) return Promise.resolve(true);
    const content = $('#wishlistReminderContent');
    const settings = $('#wishlistReminderSettings');
    if (!content || !settings) return Promise.resolve(true);
    const pursuitName = pursuitTarget ? escapeMarkup(pursuitTarget.name) : '未设置';
    const rarityRows = [3, 4, 5].map((rarity) => {
      const selected = ids.filter((id) => getTroopById(id)?.rarityIdx === rarity).length;
      const percent = Math.round((selected / GACHA_RULES.slotsPerRarity) * 100);
      return `<div class="wishlist-reminder-rarity r-${rarity}"><div class="range-legend-item"><span>${rarityNameByIndex(rarity)}</span><b>${selected}<small> / ${GACHA_RULES.slotsPerRarity}</small></b></div><div class="range-meter-segment" style="--fill:${percent}%"></div></div>`;
    });
    content.innerHTML = `
      <section class="wishlist-reminder-pursuit ${pursuitTarget ? 'is-active' : 'is-warning'}" aria-label="神话追寻状态">
        <small class="wishlist-reminder-pursuit-label">神话追寻</small>
        <strong class="wishlist-reminder-pursuit-name">${pursuitTarget ? pursuitName : '未设置'}</strong>
        ${pursuitTarget || missing === 0 ? '' : '<button class="wishlist-reminder-inline-settings" id="wishlistReminderPursuitSettings" type="button">设置 <span aria-hidden="true">→</span></button>'}
        <p class="wishlist-reminder-pursuit-hint">进度 ${pursuit.progress} / ${pursuit.limit} 抽${pursuit.progress >= pursuit.limit ? `；${pursuitTarget ? '下一抽必出' : '选目标后下一抽必出'}` : pursuitTarget ? '' : '；未选择目标也累计'}</p>
        ${pursuitTarget ? `<span class="wishlist-reminder-pursuit-meter"><i style="width:${Math.min(100, Math.round((pursuit.progress / pursuit.limit) * 100))}%"></i></span>` : ''}
      </section>
      <section class="wishlist-reminder-range" aria-label="愿望单选择范围">
        <div class="wishlist-reminder-range-head"><span>愿望单</span><em>${missing ? `还可选择 ${missing} 名` : '已选满'}</em></div>
        <div class="wishlist-reminder-legend">${rarityRows.join('')}</div>
      </section>`;
    mountIcons(content);
    settings.textContent = missing ? '完善愿望单' : '设置神话追寻';
    settings.dataset.destination = missing ? '#wishlist' : '#wishlist/pursuit';
    const modal = $('#wishlistReminder');
    if (!modal) return Promise.resolve(true);
    const checkbox = $('#wishlistReminderToday') as HTMLInputElement | null;
    if (checkbox) checkbox.checked = false;
    modal.hidden = false;
    return new Promise<boolean>((resolve) => {
      this.wishlistReminderResolve = resolve;
    });
  }

  // —— 抽卡主流程 ——

  /**
   * 拉一批开箱结果。**一次网关调用 = 一笔原子成交**（CH-1）：
   * 历史实现把金钥匙十连做成"循环 10 次单抽"，第 8 次失败就丢弃前 7 次已持久化的结果。
   */
  private async drawRewards(pool: ChestPool, count: number, opts: { buyMissingKeys?: boolean } = {}): Promise<DrawOutcome | null> {
    const { result } = await this.ctx.gateway.openChest(pool, count, opts);
    if (isFailure(result)) {
      toast(result.message);
      return null;
    }
    // 一箱一张牌：部队翻出立绘，材料 / 资源翻出素材图；开 N 箱就发 N 张
    const bought = 'boughtKeys' in result && result.boughtKeys
      ? `已用 ${fmt(result.spent.gold ?? 0)} 黄金补 ${result.boughtKeys} 把钥匙` : undefined;
    return { rewards: this.rewardsOfDrops(result.drops), summary: bought };
  }

  private rewardsOfDrops(drops: ChestDrop[]): RewardVm[] {
    return drops.map((drop) => drop.kind === 'troop' ? this.rewardsOf([drop.card])[0]! : itemVm(drop.item));
  }

  private rewardsOf(cards: GachaCard[]): RewardVm[] {
    return cards.map((c) => {
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
        wishLabel: c.noviceGuaranteed ? '' : c.pursuitGuaranteed ? ' · 追寻保底' : c.wishlistHit ? ' · 愿望命中' : '',
      };
    });
  }

  /**
   * 按钮点击入口：先按余额决定成交形态，再交给 openSummon。
   * 余额不足时按钮已 disabled（paintOpenButton），这里再兜一层——
   * 无论走哪条分支都不允许"扣了但没演出"，也不允许静默不动。
   */
  private async requestOpen(kind: OpenKind): Promise<void> {
    if (this.phase !== 'closed') return;
    if (!$('#partialVeil').hidden) return;
    const spec = this.specOf(kind);
    if (!spec) return;
    if (spec.pool === 'gold') {
      // 钥匙够：直接开；不够：弹补齐确认（补黄金 / 只开持有数），不静默花黄金、不静默拦下
      const price = goldChestPrice(this.ctx.save(), spec.count);
      if (price.boughtKeys === 0) return void (await this.openSummon('gold', spec.count));
      const canBuy = this.ctx.save().currencies.gold >= price.gold;
      if (canBuy || price.keys > 0) return void this.askGoldTopUp(spec.count);
      toast(`金钥匙不足，补齐需要 ${fmt(price.gold)} 黄金`);
      this.refreshBalances();
      return;
    }
    const balance = this.balanceOf(spec.pool);
    if (balance >= spec.cost) {
      const noviceSummon = spec.pool === 'gem'
        && spec.count === GEM_CHEST.multiCount
        && noviceSummonAvailable(this.ctx.save());
      if (spec.pool === 'gem' && !noviceSummon && !this.wishlistReminderSuppressed()) {
        const proceed = await this.showWishlistReminder();
        if (!proceed) return;
      }
      return void (await this.openSummon(spec.pool, spec.count));
    }
    const cn = POOL_CN[spec.pool];
    toast(`${cn.currency}不足：需要 ${fmt(spec.cost)}，现有 ${fmt(balance)}`);
    this.refreshBalances();
  }

  private async openSummon(pool: ChestPool, count: number, opts: { buyMissingKeys?: boolean } = {}): Promise<void> {
    if (this.phase !== 'closed') return;
    const outcome = await this.drawRewards(pool, count, opts);
    // 失败分支也要刷新余额与按钮态（CH-1：旧实现失败时余额数字停在旧值）
    if (!outcome) {
      this.refreshBalances();
      return;
    }
    const rewards = outcome.rewards;
    this.loadRecent();
    // 金/荣耀箱可能只出资源与素材（无卡）：没有翻牌演出，直接刷新余额并弹汇总
    if (rewards.length === 0) {
      this.refreshBalances();
      if (outcome.summary) this.showGloryFeedback(outcome.summary, `${POOL_CN[pool].title}已开启`);
      return;
    }

    // 入账成功：余额刷新 + 最近获得条（容量 ≥ 一次十连，否则十连刚开完就看不全）
    // gachaLog 已在网关成交时落盘，重新读取可避免当前批次被重复显示。
    this.loadRecent();
    this.paintDrops();
    this.refreshBalances();

    this.clearSummonTimers();
    this.slamLocked = false;
    this.autoQueue = [];
    this.autoRunning = false;
    const dealt = rewards.length;
    const modal = $('#summonModal');
    modal.hidden = false;
    // 多张一律走 batch-10 布局（部分开启可能是 2~9 张，CH-1 的 7 抽形态）
    modal.className = `summon-modal is-opening${dealt > 1 ? ' batch-10' : ''}`;
    $('#summonPool').textContent = POOL_CN[pool].title;
    const sceneArt = $('#summonSceneArt') as HTMLImageElement | null;
    if (sceneArt) sceneArt.src = pool === 'gem' ? '/static/chests/gem-pool.webp' : '/static/chests/key-glory-pool.webp';
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
    this.settledCount = 0;
    const cardsEl = $('#summonCards');
    cardsEl.innerHTML = rewards
      .map((d, i) => {
        const p = this.cardPosition(i, rewards.length);
        return `<article class="summon-card ${rarityClassByIndex(d.rarityIdx)} fx-${d.fxClass}${d.troop ? ' has-detail' : ''}" data-rarity="${d.fxClass}" data-rarity-idx="${d.rarityIdx}" data-name="${d.name}" data-art="${d.art}" data-fb="${d.fb}" data-dup="${d.duplicate ? 1 : 0}" style="--x:${p.x}px;--y:${p.y}px;--rot:${p.rot}deg;">
          <div class="card-3d">
            <div class="card-back" aria-hidden="true"></div>
            <div class="card-face${d.item ? ' is-item' : ''}">
              ${d.item ? `<div class="card-item-art" aria-hidden="true">${d.item}</div>` : `<img src="${d.art}" alt="${d.name}" loading="lazy" onerror="this.onerror=null;this.src='${d.fb}'">`}
              <div class="card-label"><small>${d.rarity}${d.duplicate ? ' · 重复' : ''}${d.wishLabel ?? ''}</small><b>${d.name}</b></div>
            </div>
          </div>
        </article>`;
      })
      .join('');
    mountIcons(cardsEl);
    $$('.summon-card', cardsEl).forEach((card, i) => this.on(card, 'click', () => {
      const el = card as HTMLElement;
      if (el.classList.contains('is-revealed')) {
        if (!el.classList.contains('is-flipping') && !this.slamLocked && !this.autoRunning && rewards[i]?.troop) {
          this.openRewardSheet(rewards[i].troop);
        }
      } else this.revealSingleCard(el, false);
    }));
  }

  /** Reuse the exact battle codex cards, with the newly acquired troop's current collection stats. */
  private openRewardSheet(troop: TroopData): void {
    const rec = getRecord(this.ctx.save(), troop.id);
    if (!rec) return;
    const stats = troopStatsOf(troop, rec);
    const char = troopToCharacter(troop, troop.id, rec.level);
    char.traitIds = troop.traits.filter((_, i) => rec.traits[i]).map(t => t.code);
    const tier = RARITY_TIERS[rarityTierOf(troop, rec)]!;
    const race = raceNames(troop.troopTypes);
    const data: UnitSheetData = {
      charId: troop.id, ally: true, name: troop.name, portrait: troopArt(troop),
      colors: [...char.colors],
      shown: { attack: stats.attack, armor: stats.armor, hp: stats.health, maxHp: stats.health,
        magic: stats.magic, mana: 0, manaCost: troop.manaCost, defeated: false, statuses: [] },
      role: roleNameZh(troop.role) ?? '', race, kingdom: troop.kingdom ?? '',
      typeLine: [race, troop.kingdom, tier.label].filter(Boolean).join(' · '),
      rarityLabel: tier.label, rarity: rarityTierOf(troop, rec), rarityColor: tier.color,
      skillName: troop.spell.name, skillDescription: troop.spell.description,
      skillTag: troop.kingdom ? `${troop.kingdom} · 部队法术` : '部队法术', targetNote: '',
      traitSlots: traitSlotsOf(char, troop), troopName: troop.name, quickCast: false,
    };
    this.rewardSheet ??= new UnitSheet($('#summonModal'), {
      onCast: () => {}, onQuickCast: () => {}, onClose: () => this.rewardSheet?.close(),
    }, { readOnly: true });
    this.sizeRewardSheet();
    this.rewardSheet.open(data, { focus: true, dismissOnOutside: false });
  }

  private sizeRewardSheet(): void {
    if (!this.rewardSheet) return;
    const modal = $('#summonModal');
    this.rewardSheet.setBounds({ left: 0, top: 0, width: modal.clientWidth, height: modal.clientHeight });
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

  private revealSingleCard(card: HTMLElement, isAuto: boolean, onSettled?: () => void): void {
    if (this.phase === 'closed' || this.phase === 'complete') return;
    if (this.phase === 'opening' || this.phase === 'dealing') return;
    if (card.classList.contains('is-revealed') || card.classList.contains('is-flipping')) return;
    if (!card.classList.contains('is-dealt')) return;
    if (!isAuto && (this.slamLocked || this.autoRunning)) return;

    const tier = (card.dataset.rarity ?? 'common') as FxClass;
    const heavy = HEAVY_FX.has(tier);
    const modal = $('#summonModal');
    card.classList.add('is-flipping');
    modal.classList.add('is-bursting');
    this.phase = 'revealing';
    this.revealedCount += 1;
    $('#summonCounter').textContent = `${this.revealedCount} / ${this.totalRewards}`;
    if (heavy) this.slamLocked = true;

    const reveal = (): void => card.classList.add('is-revealed');
    const settle = (): void => {
      card.classList.remove('is-flipping', 'is-charging');
      if (heavy) this.slamLocked = false;
      if (!this.slamLocked) modal.classList.remove('is-bursting');
      this.settledCount += 1;
      this.checkSummonFinish();
      onSettled?.();
    };

    if (prefersReducedMotion()) {
      this.playTierSfx(tier, isAuto);
      if (tier !== 'common') haptic(TIER_FEEL[tier].haptic);
      reveal();
      settle();
      return;
    }

    switch (tier) {
      case 'rare': return this.revealRare(card, isAuto, reveal, settle);
      case 'legend': return this.revealLegend(card, isAuto, reveal, settle);
      case 'epic': return this.revealEpic(card, isAuto, reveal, settle);
      case 'mythic': return this.revealMythic(card, isAuto, reveal, settle);
      default:
        reveal();
        this.later(380, settle);
    }
  }

  // —— 分档演出 ——

  /** 稀有：短蓄力 → 翻牌瞬间紫色光芒 + 冲击环 + 星芒 + 轻震 */
  private revealRare(card: HTMLElement, isAuto: boolean, reveal: () => void, settle: () => void): void {
    const tint = TIER_TINT.rare;
    const p = this.cardAnchor(card);
    this.fx({ layer: 'top', tex: 'flare', tint, x: p.x, y: p.y, dur: 260, size: [p.h * 0.3, p.h * 0.9], rot: [0, 0.5], alpha: [0, 0.7], ease: 'in' });
    this.charge(card, 240, () => {
      reveal();
      this.pop(card);
      const { x, y, h } = this.cardAnchor(card);
      this.fx({ layer: 'back', tex: 'rays', tint, x, y, dur: 860, size: [h * 1.1, h * 2.4], rot: [0, 0.35], alpha: [0.95, 0.55, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, dur: 560, size: [h * 0.5, h * 2.1], alpha: [1, 0.6, 0] });
      this.fx({ layer: 'top', tex: 'flare', tint, x, y, dur: 360, size: [h * 1.3, h * 0.5], rot: [0.5, 0.9], alpha: [1, 0] });
      this.playTierSfx('rare', isAuto);
      this.feel('rare');
      this.later(640, settle);
    });
  }

  /** 传说：金色光流向卡牌汇聚 → 爆发序列帧（着金、放大放慢）+ 大光芒 + 双冲击环 + 闪光 + 中震 → 特写 */
  private revealLegend(card: HTMLElement, isAuto: boolean, reveal: () => void, settle: () => void): void {
    const tint = TIER_TINT.legend;
    const p = this.cardAnchor(card);
    this.fx({ layer: 'back', tex: 'gather', tint, x: p.x, y: p.y, dur: 520, size: [p.h * 2.6, p.h * 1.1], rot: [0, 0.5], alpha: [0, 0.9, 0.7], ease: 'in' });
    this.fx({ layer: 'top', glow: '#ffd96a', x: p.x, y: p.y, dur: 440, size: [p.h * 0.4, p.h * 1.5], alpha: [0, 0.5], ease: 'in' });
    this.fx({ layer: 'top', tex: 'flare', tint, x: p.x, y: p.y, dur: 440, size: [p.h * 0.3, p.h * 1.1], rot: [0, 0.6], alpha: [0, 0.85], ease: 'in' });
    this.charge(card, 420, () => {
      const { x, y, h } = this.cardAnchor(card);
      const burst = $('#fxBurst');
      this.placeOverCard(burst, card, BURST_LEGEND, 3);
      void this.playFx(burst, BURST_LEGEND, { tint });
      this.fx({ layer: 'top', glow: '#fff1b8', x, y, dur: 560, size: [h * 1.6, h * 5], alpha: [0.8, 0] });
      this.fx({ layer: 'back', tex: 'rays', tint, x, y, dur: 1300, size: [h * 1.4, h * 3.8], rot: [0, 0.5], alpha: [1, 0.7, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, dur: 620, size: [h * 0.5, h * 2.6], alpha: [1, 0.5, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, delay: 150, dur: 720, size: [h * 0.4, h * 3.3], alpha: [0.8, 0.4, 0] });
      this.fx({ layer: 'top', tex: 'flare', tint, x, y, dur: 440, size: [h * 1.9, h * 0.6], rot: [0.6, 1.1], alpha: [1, 0] });
      this.pop(card);
      this.feel('legend');
      this.playTierSfx('legend', isAuto);
      this.later(130, reveal);
      this.later(BURST_LEGEND.ms + 200, () => this.showSlam(card, 'legend', settle));
    });
  }

  /** 史诗：原神话演出（传说爆发序列帧 + 特写 slam）+ 橙色光流汇聚 + 强震 */
  private revealEpic(card: HTMLElement, isAuto: boolean, reveal: () => void, settle: () => void): void {
    const tint = TIER_TINT.epic;
    const p = this.cardAnchor(card);
    this.fx({ layer: 'back', tex: 'gather', tint, x: p.x, y: p.y, dur: 660, size: [p.h * 3, p.h * 1.1], rot: [0, 0.7], alpha: [0, 1, 0.8], ease: 'in' });
    this.fx({ layer: 'back', tex: 'gather', tint: '#ffffff', x: p.x, y: p.y, delay: 120, dur: 540, size: [p.h * 2.2, p.h * 0.8], rot: [0.8, 0.2], alpha: [0, 0.5, 0.4], ease: 'in' });
    this.fx({ layer: 'back', tex: 'veil', tint, x: p.x, y: p.y, dur: 600, size: [p.h * 1.5, p.h * 2.1], alpha: [0, 0.35], ease: 'in' });
    this.fx({ layer: 'top', glow: '#ffb070', x: p.x, y: p.y, dur: 580, size: [p.h * 0.4, p.h * 1.7], alpha: [0, 0.55], ease: 'in' });
    this.fx({ layer: 'top', tex: 'flare', tint, x: p.x, y: p.y, dur: 580, size: [p.h * 0.3, p.h * 1.3], rot: [0, 0.8], alpha: [0, 0.9], ease: 'in' });
    this.charge(card, 560, () => {
      const { x, y, h } = this.cardAnchor(card);
      const burst = $('#fxBurst');
      this.placeOverCard(burst, card, BURST_HEAVY, 2.7);
      void this.playFx(burst, BURST_HEAVY);
      this.fx({ layer: 'top', glow: '#ffe0bc', x, y, dur: 640, size: [h * 2, h * 6.5], alpha: [0.9, 0] });
      this.fx({ layer: 'back', tex: 'veil', tint, x, y, dur: 1500, size: [h * 2.1, h * 3.4], alpha: [0.35, 0.6, 0.45, 0] });
      this.fx({ layer: 'back', tex: 'plumes', tint, x, y, dur: 1300, size: [h * 1.6, h * 2.4], alpha: [0.8, 0.6, 0] });
      this.fx({ layer: 'back', tex: 'rays', tint, x, y, dur: 1400, size: [h * 1.6, h * 4.2], rot: [0, 0.55], alpha: [1, 0.75, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, dur: 640, size: [h * 0.5, h * 2.9], alpha: [1, 0.5, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, delay: 160, dur: 760, size: [h * 0.4, h * 3.8], alpha: [0.85, 0.4, 0] });
      this.fx({ layer: 'top', tex: 'flare', tint, x, y, dur: 480, size: [h * 2.2, h * 0.7], rot: [0.6, 1.2], alpha: [1, 0] });
      this.pop(card);
      this.feel('epic');
      this.playTierSfx('epic', isAuto);
      this.later(BURST_HEAVY.ms - 40, reveal);
      this.later(BURST_HEAVY.ms + 380, () => this.showSlam(card, 'epic', settle));
    });
  }

  /** 神话：暗场长蓄力（两层光流反向汇聚 + 星尘 + 心跳震动）→ 全屏闪白 → 爆发 + 闪光序列帧 + 光羽 → 强化 slam */
  private revealMythic(card: HTMLElement, isAuto: boolean, reveal: () => void, settle: () => void): void {
    const tint = TIER_TINT.mythic;
    const modal = $('#summonModal');
    const stage = $('#summonStage');
    const p = this.cardAnchor(card);
    stage.style.setProperty('--fx', `${((p.x / stage.offsetWidth) * 100).toFixed(1)}%`);
    stage.style.setProperty('--fy', `${((p.y / stage.offsetHeight) * 100).toFixed(1)}%`);
    modal.classList.add('is-mythic-charge');
    void this.playSfx('start', false, 0.85);
    haptic([20, 140, 24, 110, 30, 80, 40, 60, 60]);
    const charge = 1200;
    // 光流从外向内收：尺寸由大到小 + 旋转，两层反向，越接近爆发越亮
    this.fx({ layer: 'back', tex: 'gather', tint, x: p.x, y: p.y, dur: charge, size: [p.h * 3.6, p.h * 1.2], rot: [0, 1.4], alpha: [0, 0.8, 1], ease: 'in' });
    this.fx({ layer: 'back', tex: 'gather', tint: '#ffffff', x: p.x, y: p.y, delay: 300, dur: charge - 300, size: [p.h * 2.8, p.h * 0.9], rot: [1.2, 0], alpha: [0, 0.6, 0.8], ease: 'in' });
    this.fx({ layer: 'back', tex: 'stardust', tint, x: p.x, y: p.y, dur: charge + 200, size: [p.h * 3.2, p.h * 2.2], alpha: [0, 0.8, 0.6], ease: 'in' });
    this.fx({ layer: 'back', tex: 'rays', tint, x: p.x, y: p.y, dur: charge, size: [p.h * 0.8, p.h * 2.6], rot: [0, 0.7], alpha: [0, 0.2, 0.65], ease: 'in' });
    this.fx({ layer: 'top', glow: '#8fefff', x: p.x, y: p.y, dur: charge, size: [p.h * 0.3, p.h * 1.9], alpha: [0, 0.15, 0.7], ease: 'in' });
    this.fx({ layer: 'top', tex: 'flare', tint, x: p.x, y: p.y, dur: charge, size: [p.h * 0.2, p.h * 1.4], rot: [0, 1.6], alpha: [0, 0.35, 1], ease: 'in' });
    this.charge(card, charge, () => {
      modal.classList.remove('is-mythic-charge');
      const { x, y, h } = this.cardAnchor(card);
      this.fx({ layer: 'top', glow: '#e6fcff', x, y, dur: 950, size: [h * 3, h * 10], alpha: [1, 0.85, 0] });
      const burst = $('#fxBurst');
      this.placeOverCard(burst, card, BURST_HEAVY, 3);
      void this.playFx(burst, BURST_HEAVY, { tint });
      const beam = $('#fxBeam');
      this.placeOverCard(beam, card, FX.flash, 2.6);
      void this.playFx(beam, FX.flash);
      this.fx({ layer: 'back', tex: 'veil', tint, x, y, dur: 1900, size: [h * 2.4, h * 4], alpha: [0.45, 0.75, 0.55, 0] });
      this.fx({ layer: 'back', tex: 'plumes', tint, x, y, dur: 1700, size: [h * 1.8, h * 3], alpha: [0.9, 0.7, 0] });
      this.fx({ layer: 'back', tex: 'stardust', tint, x, y, dur: 1800, size: [h * 2.2, h * 3.6], alpha: [0.9, 0.6, 0] });
      this.fx({ layer: 'back', tex: 'rays', tint, x, y, dur: 1700, size: [h * 1.8, h * 5.2], rot: [0, 0.6], alpha: [1, 0.8, 0] });
      this.fx({ layer: 'back', tex: 'rays', x, y, delay: 80, dur: 1400, size: [h * 1.2, h * 3.8], rot: [0.3, -0.2], alpha: [0.8, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, dur: 680, size: [h * 0.5, h * 3], alpha: [1, 0.5, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint, x, y, delay: 130, dur: 780, size: [h * 0.4, h * 3.8], alpha: [0.9, 0.4, 0] });
      this.fx({ layer: 'top', tex: 'ring', tint: '#ffffff', x, y, delay: 280, dur: 900, size: [h * 0.3, h * 4.8], alpha: [0.7, 0.3, 0] });
      this.fx({ layer: 'top', tex: 'flare', tint, x, y, dur: 620, size: [h * 2.8, h * 0.8], rot: [0.6, 1.3], alpha: [1, 0] });
      this.pop(card);
      this.feel('mythic');
      this.later(280, () => this.shakeStage(0.7));
      this.playTierSfx('mythic', isAuto);
      this.later(BURST_HEAVY.ms - 40, reveal);
      this.later(BURST_HEAVY.ms + 560, () => this.showSlam(card, 'mythic', settle));
    });
  }

  private fx(sprite: Sprite): void {
    this.spriteFx?.add(sprite);
  }

  /** 元素在舞台局部坐标系里的中心与高度（舞台会被外壳缩放，按 offsetWidth 换算回 CSS 像素） */
  private cardAnchor(el: HTMLElement, host: HTMLElement = $('#summonStage')): { x: number; y: number; h: number } {
    const sr = host.getBoundingClientRect();
    const k = sr.width ? host.offsetWidth / sr.width : 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - sr.left) * k, y: (r.top + r.height / 2 - sr.top) * k, h: el.offsetHeight };
  }

  /** 蓄力：卡背抖动 + 稀有度色辉光渐强（CSS 只做这层简单抖动/辉光） */
  private charge(card: HTMLElement, ms: number, then: () => void): void {
    card.style.setProperty('--charge-ms', `${ms}ms`);
    card.classList.add('is-charging');
    this.later(ms, () => {
      card.classList.remove('is-charging');
      then();
    });
  }

  private pop(card: HTMLElement): void {
    card.classList.remove('is-popped');
    void card.offsetWidth;
    card.classList.add('is-popped');
  }

  private feel(tier: Exclude<FxClass, 'common'>): void {
    const f = TIER_FEEL[tier];
    this.shakeStage(f.shake);
    haptic(f.haptic);
  }

  /** 舞台震动（WAAPI，作用在 .summon-stage；减少动态效果时跳过） */
  private shakeStage(strength: number): void {
    if (prefersReducedMotion()) return;
    const el = $('#summonStage');
    if (typeof el.animate !== 'function') return;
    el.getAnimations().forEach((a) => {
      if (a.id === 'summon-shake') a.cancel();
    });
    const a = 8 * strength;
    const r = 0.7 * strength;
    const anim = el.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${-a}px, ${a * 0.5}px) rotate(${-r}deg)` },
        { transform: `translate(${a * 0.8}px, ${-a * 0.6}px) rotate(${r * 0.8}deg)` },
        { transform: `translate(${-a * 0.5}px, ${a * 0.4}px) rotate(${-r * 0.4}deg)` },
        { transform: `translate(${a * 0.25}px, ${-a * 0.2}px) rotate(${r * 0.2}deg)` },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ],
      { duration: 260 + 180 * strength, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    anim.id = 'summon-shake';
  }

  private playTierSfx(tier: FxClass, isAuto: boolean): void {
    if (tier === 'rare') void this.playSfx('rare', isAuto, 0.45);
    else if (tier === 'legend') void this.playSfx('rare', isAuto);
    else if (tier === 'epic' || tier === 'mythic') void this.playSfx('legend', isAuto);
  }

  private revealAll(): void {
    if (this.phase === 'complete' || this.phase === 'closed') return;
    if (this.autoRunning || this.slamLocked) return;
    this.stopFx($('#fxCircle'));
    $$('.summon-card', $('#summonCards')).forEach((card) => card.classList.add('is-dealt'));
    this.phase = 'ready';
    this.autoQueue = $$('.summon-card:not(.is-revealed):not(.is-flipping)', $('#summonCards')) as HTMLElement[];
    this.autoRunning = true;
    this.pumpAuto();
  }

  /** 逐张自动翻：普通/稀有 150~260ms 交错；传说及以上等演出（含 slam 点击）结束再翻下一张 */
  private pumpAuto(): void {
    if (this.phase === 'closed' || this.phase === 'complete') {
      this.autoQueue = [];
      this.autoRunning = false;
      return;
    }
    let next = this.autoQueue.shift();
    while (next && (next.classList.contains('is-revealed') || next.classList.contains('is-flipping'))) next = this.autoQueue.shift();
    if (!next) {
      this.autoRunning = false;
      return;
    }
    const tier = (next.dataset.rarity ?? 'common') as FxClass;
    const reduced = prefersReducedMotion();
    if (reduced || !HEAVY_FX.has(tier)) {
      this.revealSingleCard(next, true);
      this.later(reduced ? 0 : tier === 'rare' ? 260 : 150, () => this.pumpAuto());
    } else {
      this.revealSingleCard(next, true, () => this.later(220, () => this.pumpAuto()));
    }
  }

  private checkSummonFinish(): void {
    $('#summonCounter').textContent = `${this.revealedCount} / ${this.totalRewards}`;
    if (this.settledCount >= this.totalRewards) this.finishSummon();
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
    this.rewardSheet?.destroy();
    this.rewardSheet = undefined;
    this.clearSummonTimers();
    this.stopSfx();
    this.phase = 'closed';
    this.slamLocked = false;
    this.autoQueue = [];
    this.autoRunning = false;
    this.spriteFx?.clear();
    $('#summonStage')?.getAnimations?.().forEach((a) => a.cancel());
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
    if (this.returnHash) {
      const back = this.returnHash;
      this.returnHash = null;
      this.ctx.navigate(back);
    }
  }

  // —— 史诗 / 神话 slam 特写 ——

  /** 放大特写：传说 / 史诗 / 神话共用，档位越高底衬越丰富、停留越久 */
  private showSlam(card: HTMLElement, tier: 'legend' | 'epic' | 'mythic', done: () => void): void {
    const slam = $('#legendSlam');
    const mythic = tier === 'mythic';
    const legend = tier === 'legend';
    const tint = TIER_TINT[tier];
    ['fxBurst', 'fxBeam', 'fxCircle', 'slamAura', 'slamFlash'].forEach((id) => this.stopFx($('#' + id)));
    this.spriteFx?.clear('slam');
    slam.className = `legend-slam slam-${tier}`;
    $('#legendSlamRarity').textContent = rarityNameByIndex(Number(card.dataset.rarityIdx ?? 0));
    $('#legendSlamName').textContent = card.dataset.name!;
    $('#legendSlamCard').innerHTML = `<img src="${card.dataset.art}" alt="${card.dataset.name}" onerror="this.onerror=null;this.src='${card.dataset.fb}'"><div class="card-sheen"></div>`;
    slam.hidden = false;
    void slam.offsetWidth;

    const host = $('#legendSlamCard');
    const { x, y } = this.cardAnchor(host, slam);
    const h = host.offsetHeight;
    // 入场闪光盖住常驻层的出现；常驻层循环到点击关闭
    const flashGlow = mythic ? '#dffaff' : legend ? '#fff0c0' : '#ffe0b8';
    this.fx({ layer: 'slam', glow: flashGlow, x, y, dur: mythic ? 900 : 650, size: [h * 1.2, h * (mythic ? 5 : 4)], alpha: [0.95, 0] });
    // 常驻底衬：竖向光柱 + 缓慢上漂的星尘（两层错相，无缝循环），压住亮度，别盖过立绘
    const veilA = mythic ? [0.5, 0.7, 0.5] : legend ? [0.3, 0.42, 0.3] : [0.4, 0.55, 0.4];
    this.fx({ layer: 'slam', tex: 'veil', tint, x, y, dur: 4200, size: [h * 2.2, h * 2.2], alpha: veilA, loop: true, ease: 'linear' });
    const dustPeak = mythic ? 0.8 : legend ? 0.5 : 0.65;
    [0, 3000].forEach((delay) => this.fx({
      layer: 'slam', tex: 'stardust', tint, x, y, delay, dur: 6000, size: [h * 2.6, h * 3.1],
      alpha: [0, dustPeak, dustPeak, 0], loop: true, ease: 'linear',
    }));
    this.fx({ layer: 'slam', tex: 'ring', tint, x, y, delay: 120, dur: 760, size: [h * 0.6, h * 3.2], alpha: [0.8, 0.3, 0] });
    if (!legend) {
      // 史诗 / 神话：卡牌两侧光羽碎片缓缓上浮
      [0, 2600].forEach((delay) => this.fx({
        layer: 'slam', tex: 'plumes', tint, x, y, delay, dur: 5200, size: [h * 2.1, h * 2.4],
        alpha: [0, mythic ? 0.75 : 0.55, 0], loop: true, ease: 'linear',
      }));
    }
    if (mythic) this.fx({ layer: 'slam', tex: 'ring', tint: '#ffffff', x, y, delay: 300, dur: 900, size: [h * 0.5, h * 4.2], alpha: [0.5, 0.2, 0] });

    const aura = $('#slamAura');
    const flash = $('#slamFlash');
    // 原金色光环序列帧按原样播（不着色，着色后压在立绘上会变成白糊）；神话多一层循环
    this.placeSlamLayer(aura, FX.aura, 1.52, 0, 28);
    const loopAura = (): void => {
      if (slam.hidden) return;
      void this.playFx(aura, FX.aura, { ondone: mythic ? loopAura : undefined });
    };
    loopAura();
    this.placeSlamLayer(flash, FX.flash, 1.08, 122, -168);
    const flashAt = mythic ? [280, 1150] : [280];
    flashAt.forEach((ms) => this.later(ms, () => {
      if (!slam.hidden) void this.playFx(flash, FX.flash);
    }));
    // 落地震动
    this.later(mythic ? 380 : 260, () => {
      if (slam.hidden) return;
      this.shakeStage(mythic ? 1 : legend ? 0.4 : 0.6);
      haptic(mythic ? [60, 40, 110] : legend ? [28] : [40]);
    });

    const shownAt = performance.now();
    const minHold = mythic ? 900 : legend ? 450 : 550;
    slam.onclick = () => {
      if (performance.now() - shownAt < minHold) return;
      slam.hidden = true;
      slam.onclick = null;
      this.stopFx(aura);
      this.stopFx(flash);
      this.spriteFx?.clear('slam');
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

  /** 播放序列帧；tint 时按亮度着色（透明底序列帧，保留 alpha，最亮处推白） */
  private async playFx(canvas: HTMLElement | null, spec: FxSpec, opts: { ondone?: () => void; tint?: string } = {}): Promise<void> {
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
    let img: CanvasImageSource;
    try {
      const raw = await loadStrip(spec.src);
      img = opts.tint ? prepareTexture(raw, spec.src, 'alpha', opts.tint) : raw;
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
    el.classList.remove('fx-behind');
    if (el.id === 'slamAura' || el.id === 'slamFlash') return;
    // 挂到卡牌上的序列帧层放回原宿主，并清掉贴卡时写的内联定位（开箱法阵要回到 CSS 默认位置）
    const host = el.id === 'fxCircle' ? $('#fxStage') : $('#fxFront');
    if (host && el.parentElement !== host) {
      host.appendChild(el);
      el.style.cssText = '';
    }
  }

  // —— 音效 ——

  private sfx?: Record<string, HTMLAudioElement>;

  private ensureSfx(): Record<string, HTMLAudioElement> {
    if (!this.sfx) {
      this.sfx = {
        start: new Audio('/static/sfx/summon-start.wav'),
        rare: new Audio('/static/sfx/reveal-epic.wav'),
        legend: new Audio('/static/sfx/reveal-legend.wav'),
      };
    }
    const p = getPlayerPreferences();
    const volume = p.masterEnabled && p.soundEffectsEnabled ? p.masterVolume * p.soundEffectsVolume : 0;
    Object.values(this.sfx).forEach((audio) => { audio.volume = volume; });
    return this.sfx;
  }

  private async playSfx(name: 'start' | 'rare' | 'legend', once = false, gain = 1): Promise<void> {
    const preferences = getPlayerPreferences();
    if (!preferences.masterEnabled || preferences.masterVolume <= 0 || !preferences.soundEffectsEnabled || preferences.soundEffectsVolume <= 0) return;
    const sfx = this.ensureSfx()[name];
    if (!sfx) return;
    sfx.volume = Math.min(1, preferences.masterVolume * preferences.soundEffectsVolume * gain);
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
