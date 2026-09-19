/**
 * 宝箱 / 抽卡屏（计划 §5.7）。开箱结果来自 gacha 系统（种子化 + 十连保底 Epic+），
 * 翻牌演出/音效沿用小样资产；概率公示从 economy 权重表派生（数值单源）。
 */
import { GEM_CHEST, GLORY_CHEST, GOLD_CHEST, GEM_CHEST_WEIGHTS, GOLD_CHEST_WEIGHTS, RARITY_ORDER } from '../data/economy';
import { stoneName } from '../data/materials';
import { getTroopById, type TroopData } from '../../data/troops';
import { isFailure } from '../gateway';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopArt, troopArtFallback } from './teamScreen';

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

/** 演出稀有度分档： Legendary 全场 slam / Epic 紫 burst / Rare+ 普通光 / 其余无演出 */
function fxClassOf(rarityIdx: number): 'common' | 'rare' | 'epic' | 'legend' {
  if (rarityIdx >= 5) return 'legend';
  if (rarityIdx >= 4) return 'epic';
  if (rarityIdx >= 2) return 'rare';
  return 'common';
}

const rarityCn = (idx: number): string => RARITY_ORDER[Math.min(Math.max(idx, 0), 5)] ?? 'Common';

interface RewardVm {
  troop: TroopData | null;
  name: string;
  art: string;
  /** CDN 未命中时的本地兜底立绘 */
  fb: string;
  cls: string;
  rarity: string;
  duplicate: boolean;
}

export class ChestsScreen implements Screen {
  private ctx!: ShellCtx;
  private phase: 'closed' | 'opening' | 'dealing' | 'ready' | 'revealing' | 'complete' = 'closed';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private fxTimers = new Map<HTMLElement, number>();
  private totalRewards = 0;
  private revealedCount = 0;
  private slamLocked = false;
  private recent: RewardVm[] = [];
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx): string {
    void ctx;
    return `
      ${topbarHtml()}
      <div class="screen chest-screen">
        <section class="panel chest-panel">
          <div class="chest-stage">
            <img class="chest-art" src="/meta/assets/chest-vault.png" alt="宝箱殿堂：金钥匙箱与水晶宝石箱">
          </div>
          <div class="recent-bar">
            <div class="recent-heading"><small>RECENT LOOT</small><b>最近获得</b></div>
            <div class="drops" id="drops"></div>
            <button class="odds-link" id="showOdds" type="button">查看奖池与概率 <span data-icon="arrow"></span></button>
          </div>
          <div class="chest-dock">
            <div class="chest-col key-pool">
              <div class="pool-head">
                <div><small>KEY SUMMON</small><div class="chest-name">金钥匙宝箱</div></div>
                <span class="pool-balance"><span data-icon="key"></span>持有 <b id="dockKeyBalance">0</b></span>
              </div>
              <div class="chest-btns">
                <button class="chest-btn" data-open="gold-1" type="button"><span>开启一次</span><small><span data-icon="key"></span>${GOLD_CHEST.keyCost}</small></button>
                <button class="chest-btn featured" data-open="gold-10" type="button"><span>开启十次</span><small><span data-icon="key"></span>${GOLD_CHEST.keyCost * 10}</small></button>
              </div>
              <div class="chest-note"><span>包含普通至超稀有部队</span><b>单抽即开 · 重复进同名副本</b></div>
            </div>
            <div class="dock-divider" aria-hidden="true"><i></i><span data-icon="sparkles"></span><i></i></div>
            <div class="chest-col gem-pool">
              <div class="pool-head">
                <div><small>GEM SUMMON</small><div class="chest-name">宝石宝箱</div></div>
                <span class="pool-balance gem-balance"><span data-icon="crystal"></span>持有 <b id="dockGemBalance">0</b></span>
              </div>
              <div class="chest-btns">
                <button class="chest-btn gem" data-open="gem-1" type="button"><span>召唤一次</span><small><span data-icon="crystal"></span>${fmt(GEM_CHEST.singleCost)}</small></button>
                <button class="chest-btn gem featured" data-open="gem-10" type="button"><span>召唤十次</span><small><span data-icon="crystal"></span>${fmt(GEM_CHEST.multiCost)}</small></button>
              </div>
              <div class="chest-note"><span>高阶部队概率提升</span><b>十连必得 Epic+</b></div>
            </div>
            <div class="dock-divider" aria-hidden="true"><i></i><span data-icon="sparkles"></span><i></i></div>
            <div class="chest-col glory-pool">
              <div class="pool-head">
                <div><small>GLORY SUMMON</small><div class="chest-name">荣耀宝箱</div></div>
                <span class="pool-balance"><span data-icon="swords"></span>持有 <b id="dockGloryBalance">0</b></span>
              </div>
              <div class="chest-btns">
                <button class="chest-btn featured" data-open="glory-1" type="button"><span>开启一次</span><small><span data-icon="swords"></span>${GLORY_CHEST.cost}</small></button>
              </div>
              <div class="chest-note"><span>特质石为主 · 概率部队卡/金钥匙</span><b>入侵 PvP 产出荣耀</b></div>
            </div>
          </div>
        </section>
      </div>
      ${bottomNavHtml('宝箱', '概率与权重表同源')}
      ${toastHtml()}

      <div class="summon-modal" id="summonModal" hidden>
        <div class="summon-veil" data-summon-close></div>
        <section class="summon-sheet" role="dialog" aria-modal="true" aria-labelledby="summonTitle">
          <header class="summon-head">
            <div>
              <small>VAULT · PACK OPENING</small>
              <h2 id="summonTitle">开启宝箱</h2>
            </div>
            <div class="summon-meta"><span id="summonPool">KEY SUMMON</span><b id="summonCounter">0 / 1</b></div>
            <button class="summon-close" type="button" aria-label="关闭" data-summon-close>×</button>
          </header>
          <div class="summon-stage" id="summonStage">
            <div class="summon-scene" aria-hidden="true">
              <img src="/meta/assets/chest-vault.png" alt="">
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
            <button class="summon-skip" id="summonSkip" type="button">全部翻开</button>
          </footer>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    this.paintDrops();
    this.refreshBalances();
    $$('[data-open]').forEach((btn) =>
      this.on(btn, 'click', () => void this.openSummon((btn as HTMLElement).dataset.open as 'gem-1' | 'gem-10' | 'gold-1' | 'gold-10' | 'glory-1')),
    );
    this.bind('#summonAction', 'click', () => this.handleActionBtn());
    this.bind('#summonSkip', 'click', () => this.revealAll());
    $$('[data-summon-close]').forEach((el) => this.on(el, 'click', () => this.closeSummon()));
    this.on(document, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape' && this.phase !== 'closed') this.closeSummon();
    });
    this.bind('#showOdds', 'click', () => this.showOdds());
    Object.values(FX).forEach((spec) => void loadStrip(spec.src));
  }

  // —— 页面小件 ——

  private paintDrops(): void {
    const dropsEl = $('#drops');
    dropsEl.innerHTML = this.recent
      .map(
        (d) =>
          `<button class="drop ${d.cls}" type="button" title="${d.rarity} · ${d.name}"><img src="${d.art}" alt="${d.name}" loading="lazy" onerror="this.onerror=null;this.src='${d.fb}'"></button>`,
      )
      .join('');
  }

  private refreshBalances(): void {
    const c = this.ctx.save().currencies;
    $('#dockKeyBalance').textContent = String(c.goldKeys);
    $('#dockGemBalance').textContent = fmt(c.gems);
    $('#dockGloryBalance').textContent = fmt(c.glory);
    const costs: Record<string, number> = { 'gold-1': 1, 'gold-10': 10, 'gem-1': GEM_CHEST.singleCost, 'gem-10': GEM_CHEST.multiCost, 'glory-1': GLORY_CHEST.cost };
    $$('[data-open]').forEach((btn) => {
      const el = btn as HTMLElement;
      const kind = el.dataset.open!;
      const balance = kind.startsWith('gold') ? c.goldKeys : kind.startsWith('glory') ? c.glory : c.gems;
      const short = balance < costs[kind]!;
      el.classList.toggle('is-unaffordable', short);
      el.title = short ? '货币不足' : '';
    });
    // 顶栏钱包同步（外壳 bindChrome 之后 mutation 需要手动刷新）
    $('#keyBalance').textContent = String(c.goldKeys);
    $('#gemBalance').textContent = fmt(c.gems);
    $('#goldBalance').textContent = fmt(c.gold);
    $('#soulBalance').textContent = fmt(c.souls);
    const glory = $('#gloryBalance');
    if (glory) glory.textContent = fmt(c.glory);
  }

  private showOdds(): void {
    const pct = (weights: readonly number[]): string =>
      weights
        .map((w, i) => `${RARITY_ORDER[i]} ${(w / 100).toFixed(1)}%`)
        .join(' · ');
    toast(`宝石箱：${pct(GEM_CHEST_WEIGHTS)}；金箱：${pct(GOLD_CHEST_WEIGHTS)}。十连保底 Epic+（最后一抽结算）。`);
  }

  // —— 抽卡主流程 ——

  private async drawRewards(kind: 'gem-1' | 'gem-10' | 'gold-1' | 'gold-10' | 'glory-1'): Promise<RewardVm[] | null> {
    const gateway = this.ctx.gateway;
    const pull = async (k: 'gem' | 'gold', count: 1 | 10) => {
      const { result } = await gateway.openChest(k, count);
      if (isFailure(result)) {
        toast(result.message);
        return null;
      }
      return result.cards;
    };
    let cards: Array<{ troopId: number; rarityIdx: number; duplicate: boolean }> = [];
    if (kind === 'gem-1' || kind === 'gem-10') {
      const got = await pull('gem', kind === 'gem-10' ? 10 : 1);
      if (!got) return null;
      cards = got;
    } else if (kind === 'glory-1') {
      // 荣耀箱：特质石为主——出卡走翻牌演出，纯素材直接 toast 上账
      const { result } = await gateway.openChest('glory', 1);
      if (isFailure(result)) {
        toast(result.message);
        return null;
      }
      if (!('stones' in result)) return null; // 荣耀分支恒为 GloryChestResult，防御窄化
      const stones = Object.entries(result.stones.traitstones ?? {})
        .map(([key, n]) => `${stoneName(key)} ×${n}`)
        .join(' · ');
      const parts = [
        ...result.cards.map(() => '部队卡 ×1'),
        result.goldKeys ? `金钥匙 ×${result.goldKeys}` : '',
        stones,
      ].filter(Boolean);
      toast(`荣耀箱：${parts.join('，') || '空空如也'}`);
      cards = result.cards;
    } else {
      const times = kind === 'gold-10' ? 10 : 1;
      for (let i = 0; i < times; i++) {
        const got = await pull('gold', 1);
        if (!got) return null;
        cards = cards.concat(got);
      }
    }
    return cards.map((c) => {
      const troop = getTroopById(c.troopId) ?? null;
      const cls = fxClassOf(c.rarityIdx);
      return {
        troop,
        name: troop?.name ?? `部队 #${c.troopId}`,
        art: troopArt(troop),
        fb: troopArtFallback(troop),
        cls,
        rarity: rarityCn(c.rarityIdx),
        duplicate: c.duplicate,
      };
    });
  }

  private async openSummon(kind: 'gem-1' | 'gem-10' | 'gold-10' | 'gold-1' | 'glory-1'): Promise<void> {
    if (this.phase !== 'closed') return;
    const rewards = await this.drawRewards(kind);
    if (!rewards) return;
    // 荣耀箱可能只出素材（无卡）：没有翻牌演出，直接刷新余额
    if (rewards.length === 0) {
      this.refreshBalances();
      return;
    }

    // 入账成功：余额刷新 + 最近获得条
    this.recent = rewards.concat(this.recent).slice(0, 6);
    this.paintDrops();
    this.refreshBalances();

    this.clearSummonTimers();
    this.slamLocked = false;
    const count = rewards.length;
    const modal = $('#summonModal');
    modal.hidden = false;
    modal.className = `summon-modal is-opening${count === 10 ? ' batch-10' : ''}`;
    $('#summonPool').textContent = kind.startsWith('gold') ? 'KEY SUMMON' : 'GEM SUMMON';
    $('#summonCounter').textContent = `0 / ${count}`;
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
        return `<article class="summon-card r-${d.cls}" data-rarity="${d.cls}" data-name="${d.name}" data-art="${d.art}" data-fb="${d.fb}" data-dup="${d.duplicate ? 1 : 0}" style="--x:${p.x}px;--y:${p.y}px;--rot:${p.rot}deg;">
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
    cards.forEach((card, i) => this.later(i * 80, () => card.classList.add('is-dealt')));
    this.later(cards.length * 80 + 200, () => {
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
    cards.forEach((card, i) => this.later(i * 150, () => this.revealSingleCard(card as HTMLElement, true)));
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
    return this.sfx;
  }

  private async playSfx(name: 'start' | 'rare' | 'legend', once = false): Promise<void> {
    const sfx = this.ensureSfx()[name];
    if (!sfx) return;
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
    this.closeSummon();
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
