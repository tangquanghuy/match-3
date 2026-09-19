/**
 * 世界地图屏（游戏首页，计划 §5.1 + §5.2 王国弹层）。
 * 节点/弹层的运行时数值全部来自存档 + kingdoms/tribute/kingdomOps 纯函数；
 * 小样仅保留布局与美术。任务/探索入口经 BattleLauncher 打真实对局。
 */
import { isFailure, todayStartOf, weekStartOf, type MetaGateway } from '../gateway';import type { MetaSave } from '../state/schema';
import { KINGDOM_MAX_LEVEL, kingdomNodeState } from '../systems/kingdomOps';
import { kingdomBonusStat, kingdomTroopPool } from '../data/kingdoms';
import { anyWeaponById } from '../data/weaponCatalog';
import { kingdomUpgradeCost, INVASION, TRIBUTE } from '../data/economy';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { ART, KINGDOM_VIEWS, kingdomViewOf, type KingdomView } from './mapData';

const MAP_W = 5440;
const MAP_H = 2920;
const HOME_SCALE = 0.78;
const START_KINGDOM = '破碎尖塔';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** 时间戳 → 本地 HH:MM（进贡「下一袋 21:40」「21:40 满」文案用） */
const clockOf = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export interface NodeVm {
  view: KingdomView;
  level: number;
  locked: boolean;
  unlockLevel: number;
  questsDone: number;
  nextNode: number | null;
  exploreUnlocked: boolean;
  tributeHours: number;
  tributeHits: number;
  /** 进贡口径单源（M-4）：三处 UI 共用 tributeReady，不再各用一套判据 */
  tributeGold: number;
  tributeSouls: number;
  tributeKeys: number;
  tributeReady: boolean;
  tributeOverflowing: boolean;
  tributeCapAt: number;
  tributeNextHourAt: number;
  ownedTroops: number;
  poolSize: number;
}

/** 存档 → 节点视图模型（真实数据单源） */
function nodeVms(gateway: MetaGateway): NodeVm[] {
  const save = gateway.current();
  const now = Date.now();
  return KINGDOM_VIEWS.map((view) => {
    const state = kingdomNodeState(save, view.name, now);
    const pool = kingdomTroopPool(view.name);
    return {
      view,
      level: save.kingdoms[view.name]?.level ?? 1,
      locked: state.locked,
      unlockLevel: state.unlockLevel,
      questsDone: state.questsDone,
      nextNode: state.nextNode,
      exploreUnlocked: state.exploreUnlocked,
      tributeHours: state.tributeHours,
      tributeHits: state.tributeHits,
      tributeGold: state.tributeGold,
      tributeSouls: state.tributeSouls,
      tributeKeys: state.tributeKeys,
      tributeReady: state.tributeReady,
      tributeOverflowing: state.tributeOverflowing,
      tributeCapAt: state.tributeCapAt,
      tributeNextHourAt: state.tributeNextHourAt,
      ownedTroops: pool.filter((t) => save.collection[String(t.id)]).length,
      poolSize: pool.length,
    };
  });
}

function crestSvg(view: KingdomView): string {
  const metal = { gold: ['#8f6c37', '#f0d99c', '#9d763e'], silver: ['#6d7480', '#e4e8ec', '#8b9198'], copper: ['#7a4a28', '#e2b07a', '#8d5a32'] }[view.metal] ?? { gold: ['', '', ''] }.gold;
  const enamel = { spire: ['#3d4458', '#1c2230'], ice: ['#6f8698', '#2a3c4c'], forest: ['#35563d', '#1a2c20'], desert: ['#8a6236', '#3d2814'], gothic: ['#4a2c44', '#1c1018'], swamp: ['#3b5440', '#1a261c'] }[view.biome] ?? ['#3d4458', '#1c2230'];
  const gid = 'g' + view.en.replace(/\W/g, '');
  const eid = 'e' + view.en.replace(/\W/g, '');
  const shape = { heater: 'M50 7 L88 20 V54 C88 76 68 91 50 97 C32 91 12 76 12 54 V20 Z', kite: 'M50 6 L90 30 L74 94 L50 99 L26 94 L10 30 Z', round: 'M50 8 C78 8 90 28 90 52 C90 76 68 92 50 98 C32 92 10 76 10 52 C10 28 22 8 50 8 Z', hex: 'M50 7 L86 26 V70 L50 93 L14 70 V26 Z', tower: 'M20 16 H36 V10 H64 V16 H80 V40 L88 50 V90 H12 V50 L20 40 Z' }[view.shape] ?? 'M50 7 L88 20 V54 C88 76 68 91 50 97 C32 91 12 76 12 54 V20 Z';
  const emblem = { spire: 'M9 20V8l3-4 3 4v12M7 20h10M12 8v12', gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v3m0 12v3M4 12h3m10 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2', thorn: 'M12 3v18M8 8l4 4 4-4M7 14l5 5 5-5', sword: 'M12 3l2 8-2 11-2-11zM8 11h8', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v2m0 14v2M4 12h2m12 0h2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6', chest: 'M4 10V8a6 4 0 0116 0v2M3 10h18v10H3zM10 10v4h4v-4' }[view.emblem] ?? 'M12 8a4 4 0 100 8 4 4 0 000-8z';
  return `<svg viewBox="0 0 100 110" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${metal[0]}"/><stop offset=".45" stop-color="${metal[1]}"/><stop offset="1" stop-color="${metal[2]}"/>
      </linearGradient>
      <linearGradient id="${eid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${enamel[0]}"/><stop offset="1" stop-color="${enamel[1]}"/>
      </linearGradient>
    </defs>
    <ellipse cx="50" cy="102" rx="22" ry="5" fill="#000" opacity=".35"/>
    <path d="${shape}" fill="#14110c" stroke="url(#${gid})" stroke-width="8"/>
    <path d="${shape}" fill="url(#${eid})" stroke="url(#${gid})" stroke-width="2.6"/>
    <path d="${shape}" fill="none" stroke="#fff1c4" stroke-opacity=".28" stroke-width="1.1" transform="scale(.74) translate(17.5 16)"/>
    <circle cx="50" cy="48" r="16" fill="#0b0a0e" opacity=".35"/>
    <g fill="none" stroke="url(#${gid})" stroke-width="2.15" stroke-linejoin="round" stroke-linecap="round" transform="translate(27 31) scale(1.9)">
      <path d="${emblem}"/>
    </g>
    <path d="M37 7l13-6 13 6-4 7H41z" fill="url(#${gid})" stroke="#2a1d10" stroke-width=".8"/>
  </svg>`;
}

/**
 * 地图屏自有样式段（窗口 Q）。
 *
 * 为什么在 TS 里而不是 `shell/styles/*.css`：阶段 B 的文件所有权矩阵把
 * `src/meta/shell/styles/**` 判给窗口 L 独占，其它窗口只能在自己的屏 CSS 段里写。
 * L 的 `tokens.css`（`--ds-*`）交付后，本段的字面色值整体迁移到 token（见任务书批次 2 待办）。
 */
const MAP_CSS = `
  /* M-2：锁态节点——门槛明文是主角，王国名退为第二行；不出现裸数字 */
  .kmeta.locked {
    flex-direction: column;
    align-items: stretch;
    background: rgba(20, 16, 10, .92);
    border-color: rgba(216, 194, 144, .34);
  }
  .kgate {
    display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    padding: 3px 8px 4px;
    background: linear-gradient(180deg, #5a4c32, #2a2214);
    font: 11px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
    color: #ead6a4;
    text-shadow: 0 1px 2px #000;
    white-space: nowrap;
  }
  .kgate [data-icon] { width: 12px; height: 12px; color: #ead6a4; }
  .kname.sub {
    padding: 2px 8px 3px;
    font-size: 11px;
    color: #a99f8c;
    border-top: 1px solid rgba(216, 194, 144, .18);
  }
  /* M-7：可收进贡角标（系统层 ready 判据早就在，此前地图上根本没画） */
  .ktrib {
    position: absolute;
    right: -6px; top: -4px;
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 7px 3px;
    background: linear-gradient(180deg, #6a5326, #3a2c11);
    border: 1px solid #e1c891;
    border-radius: 999px;
    font: 600 11px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
    color: #ffeebb;
    text-shadow: 0 1px 2px #000;
    box-shadow: 0 2px 8px #000a;
    pointer-events: none;
    z-index: 2;
  }
  .ktrib [data-icon] { width: 11px; height: 11px; color: #ffd77a; }
  .ktrib.over {
    background: linear-gradient(180deg, #7a3a34, #3a1614);
    border-color: #c45454;
    color: #ffd9d2;
  }
  /* M-10：满溢警示（这条规则此前只写在钱币来源弹层里，等于没写） */
  .chip.over { border-color: #c45454; color: #ffd9d2; }
  .tribute-row.over #tributeCopy { color: #e7a79c; }
`;

export class MapScreen implements Screen {
  private nodes: NodeVm[] = [];
  private selected = START_KINGDOM;
  private openName: string | null = null;
  private cam = { x: 0, y: 0, s: HOME_SCALE };
  private drag = { on: false, moved: false, id: null as string | null, lx: 0, ly: 0, vx: 0, vy: 0, t: 0, inertia: 0 };
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, AddEventListenerOptions?]> = [];

  html(ctx: ShellCtx): string {
    return `
      <style id="mapScreenCss">${MAP_CSS}</style>
      ${topbarHtml()}
      <div class="map-shell">
        <aside class="rail left" aria-label="玩法入口">
          <button type="button" class="on" data-rail="王国任务" id="railQuest">
            <span class="facet"><span data-icon="flag"></span></span>
            <span class="rail-copy"><b>王国任务</b><small id="railQuestCopy">章节战斗</small></span>
          </button>
          <button type="button" class="is-lock" data-rail="战役" id="railCampaign" data-locked="1">
            <span class="facet"><span data-icon="book"></span><i class="rail-lock" data-icon="lock"></i></span>
            <span class="rail-copy"><b>战役</b><small>敬请期待</small></span>
          </button>
          <button type="button" data-rail="活动中心" id="railEvents">
            <span class="facet"><span data-icon="time"></span></span>
            <span class="rail-copy"><b>活动中心</b><small id="railEventsCopy">限时活动</small></span>
          </button>
          <button type="button" class="is-lock" data-rail="入侵" id="railInvasion" data-locked="1">
            <span class="facet"><span data-icon="skull"></span><i class="rail-lock" data-icon="lock"></i></span>
            <span class="rail-copy"><b>入侵</b><small id="railInvasionCopy">未解锁</small></span>
          </button>
        </aside>
        <div class="map-frame">
          <div class="map-viewport" id="mapViewport">
            <div class="map-world" id="mapWorld">
              <img class="map-art" src="/meta/assets/world-map-mosaic-v2.webp" alt="克里斯塔拉大陆奇幻世界地图" draggable="false">
              <div class="map-nodes" id="nodes"></div>
            </div>
            <div class="map-vignette" aria-hidden="true"></div>
          </div>
          <button class="compass" id="compass" type="button" aria-label="重置视野">
            <svg viewBox="0 0 88 88" aria-hidden="true">
              <circle cx="44" cy="44" r="40" class="c-ring"/>
              <circle cx="44" cy="44" r="33" class="c-inner"/>
              <path class="c-tick" d="M44 8v8M44 72v8M8 44h8M72 44h8"/>
              <path class="c-needle-n" d="M44 16 L50 44 L44 40 L38 44 Z"/>
              <path class="c-needle-s" d="M44 72 L38 44 L44 48 L50 44 Z"/>
              <text x="44" y="22">N</text>
            </svg>
          </button>
        </div>
        <aside class="rail right" aria-label="养成入口">
          <button type="button" data-rail="武器库" id="railVault">
            <span class="facet"><span data-icon="swords"></span></span>
            <span class="rail-copy"><b>武器库</b><small id="railVaultCopy">更换装备</small></span>
          </button>
          <button type="button" data-rail="神殿" id="railTemple">
            <span class="facet"><span data-icon="temple"></span></span>
            <span class="rail-copy"><b>神殿</b><small id="railTempleCopy">职业进阶</small></span>
          </button>
          <button type="button" class="is-lock" data-rail="馈赠" id="railGifts" data-locked="1">
            <span class="facet"><span data-icon="chest"></span><i class="rail-lock" data-icon="lock"></i></span>
            <span class="rail-copy"><b>馈赠</b><small>敬请期待</small></span>
          </button>
        </aside>
        <div class="daily" id="daily">
          <button class="chip" id="dailyWin" type="button"><span data-icon="swords"></span><span id="dailyWinCopy">每日首胜</span></button>
          <button class="chip gold" id="dailyTribute" type="button"><span data-icon="bag"></span><span id="dailyTributeCopy">进贡</span></button>
          <button class="chip" id="dailyArena" type="button"><span data-icon="ticket"></span><span id="dailyArenaCopy">竞技场</span></button>
        </div>
      </div>
      ${bottomNavHtml('地图', `Lv.${ctx.save().hero.level} · 42 王国`)}
      ${toastHtml()}

      <div class="modal-veil" id="kingdomVeil" hidden>
        <section class="kingdom-sheet" role="dialog" aria-modal="true" aria-labelledby="kingdomName">
          <button class="sheet-close" id="kingdomClose" type="button" aria-label="关闭"><span data-icon="close"></span></button>
          <div class="kingdom-art" id="kingdomArt">
            <img id="kingdomPortrait" alt="">
            <div class="art-shade"></div>
            <div class="art-frame" aria-hidden="true"></div>
            <div class="art-caption"><small id="kingdomEn">BROKEN SPIRE</small><b id="kingdomArtName">破碎尖塔</b></div>
          </div>
          <div class="kingdom-info">
            <small class="eyebrow">KINGDOM OVERVIEW</small>
            <h2 id="kingdomName">破碎尖塔</h2>
            <p class="kingdom-blurb" id="kingdomBlurb"></p>
            <div class="kv-grid">
              <div><small>王国等级</small><b id="kingdomLevel">1 / 10</b></div>
              <div><small>进贡库存</small><b id="kingdomTribute">—</b></div>
              <div><small>10 级加成</small><b id="kingdomBonus">—</b></div>
            </div>
            <div class="upgrade-block" id="upgradeBlock">
              <div class="section-line"><h3>王国升级</h3><span id="upgradeHint">投入黄金提升进贡与解锁加成</span></div>
              <div class="growth-track"><i id="kingdomFill"></i></div>
              <button class="primary" id="kingdomUpgrade" type="button"><span data-icon="chevrons"></span><span id="upgradeLabel">投入升级</span><span class="price"><span data-icon="coin"></span><b id="upgradeCost">0</b></span></button>
            </div>
            <div class="tribute-row" id="tributeRow">
              <div>
                <small>进贡收取</small>
                <p id="tributeCopy">离线累计 · 黄金 / 灵魂 / 金钥匙</p>
              </div>
              <button class="secondary" id="kingdomCollect" type="button"><span data-icon="coin"></span><span id="collectLabel">收取进贡</span></button>
            </div>
            <div class="entry-cards">
              <button class="entry" id="entryQuest" type="button"><span data-icon="flag"></span><b>王国任务</b><small id="questProgress">0 / 8</small></button>
              <button class="entry" id="entryExplore" type="button"><span data-icon="compass"></span><b>探索</b><small id="exploreState">通关后开放</small></button>
              <button class="entry" id="entryTroops" type="button"><span data-icon="book"></span><b>王国部队</b><small id="troopProgress">0 / 8</small></button>
            </div>
          </div>
        </section>
      </div>

      <div class="modal-veil tip-veil" id="moneyVeil" hidden>
        <section class="money-tip etched" role="dialog" aria-modal="true" aria-labelledby="moneyTitle">
          <small>INCOME</small>
          <h2 id="moneyTitle">黄金</h2>
          <ul id="moneyWays"></ul>
          <button class="cancel" id="moneyClose" type="button">关闭</button>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx): void {
    const save = ctx.save();
    this.nodes = nodeVms(ctx.gateway);
    this.renderNodes(save);
    this.refreshDaily(save, ctx);

    this.focusKingdom(this.selected, HOME_SCALE);

    const viewport = $('#mapViewport');
    this.on(viewport, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.on(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.on(window, 'pointerup', (e) => this.endDrag(e as PointerEvent));
    this.on(window, 'pointercancel', (e) => this.endDrag(e as PointerEvent));
    this.on(viewport, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(viewport, 'dragstart', (e) => e.preventDefault());
    this.on($('#compass'), 'click', () => this.focusKingdom(START_KINGDOM, HOME_SCALE));
    this.on($('#kingdomClose'), 'click', () => this.closeKingdom());
    this.on($('#kingdomVeil'), 'click', (e) => {
      if (e.target === $('#kingdomVeil')) this.closeKingdom();
    });
    this.on($('#kingdomUpgrade'), 'click', () => void this.upgrade(ctx));
    this.on($('#kingdomCollect'), 'click', () => void this.collect(ctx));
    this.on($('#entryQuest'), 'click', () => void this.enterQuest(ctx));
    this.on($('#entryExplore'), 'click', () => void this.enterExplore(ctx));
    this.on($('#entryTroops'), 'click', () => toast('王国部队清单：图鉴页顶部可按王国筛选。'));
    this.on($('#dailyWin'), 'click', () => {
      const claimed = ctx.save().dailyFirstWinAt >= todayStartOf(Date.now());
      toast(claimed ? '今日首胜已领取，明天再来。' : '打赢任意一场战斗，结算时自动领取每日首胜宝石。');
    });
    this.on($('#dailyTribute'), 'click', () => void this.collectAllTribute(ctx));
    this.on($('#dailyArena'), 'click', () => ctx.navigate('#arena'));

    this.bindRail(ctx);

    const invasionBtn = $('#railInvasion');
    if (invasionBtn) {
      const unlocked = ctx.save().hero.level >= INVASION.unlockHeroLevel;
      if (unlocked) {
        invasionBtn.classList.remove('is-lock');
        invasionBtn.removeAttribute('data-locked');
        $('#railInvasionCopy').textContent = '排位 PvP';
      }
      this.on(invasionBtn, 'click', () => {
        if (ctx.save().hero.level >= INVASION.unlockHeroLevel) ctx.navigate('#invasion');
        else toast(`入侵需要主角 ${INVASION.unlockHeroLevel} 级（当前 Lv.${ctx.save().hero.level}）。`);
      });
    }

    const ways: Record<string, Array<[string, string]>> = {
      gold: [['战斗结算', '击杀与首胜'], ['王国进贡', '按小时累积，上限 12 小时'], ['分解多余卡', '不回收已投入养成']],
      soul: [['战斗结算', '按敌人稀有度 × 等级'], ['幽魂宝石', '战斗内拾取'], ['王国进贡', '与黄金一并结算']],
      gem: [['竞技场胜场', '主产出，无内购'], ['每日首胜', '本地日期判定'], ['任务与成就', '里程碑发放']],
      key: [['进贡概率', '随王国等级提高'], ['任务奖励', '章节节点'], ['成就', '长期目标']],
    };
    const titles: Record<string, string> = { gold: '黄金', soul: '灵魂', gem: '宝石', key: '金钥匙' };
    $$('[data-currency]').forEach((btn) =>
      this.on(btn, 'click', () => {
        const kind = (btn as HTMLElement).dataset.currency!;
        $('#moneyTitle').textContent = titles[kind]!;
        $('#moneyWays').innerHTML = (ways[kind] ?? []).map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
        $('#moneyVeil').hidden = false;
      }),
    );
    this.on($('#moneyClose'), 'click', () => ($('#moneyVeil').hidden = true));
    this.on($('#moneyVeil'), 'click', (e) => {
      if (e.target === $('#moneyVeil')) $('#moneyVeil').hidden = true;
    });
    this.on(window, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.closeKingdom();
        $('#moneyVeil').hidden = true;
      }
    });
  }

  // —— rail 入口（M-1：7 个入口全部有明确行为，零「点了没反应」） ——

  /**
   * 当前应推进的王国：优先当前选中的（若还有未打的关），否则按 KINGDOM_VIEWS 顺序
   * 取第一个「已解锁且任务链未打完」的王国；全部打完则回落到选中王国。
   */
  private questTargetKingdom(): string {
    const sel = this.nodes.find((n) => n.view.name === this.selected);
    if (sel && !sel.locked && sel.nextNode !== null) return sel.view.name;
    const next = this.nodes.find((n) => !n.locked && n.nextNode !== null);
    return next?.view.name ?? this.selected;
  }

  /** rail 七入口：绑定 + 副题改「当前状态」（审查提案 M-1 规则 3） */
  private bindRail(ctx: ShellCtx): void {
    const save = ctx.save();

    // 左 1 · 王国任务 → 当前推进王国的主线页
    const questTarget = this.questTargetKingdom();
    const questVm = this.nodes.find((n) => n.view.name === questTarget);
    if ($('#railQuestCopy')) {
      $('#railQuestCopy').textContent = questVm
        ? `${questTarget} ${questVm.questsDone}/8`
        : '章节战斗';
    }
    this.on($('#railQuest'), 'click', () => this.openRailQuest(ctx));

    // 左 2 · 战役：无对应系统 → 诚实锁态（不留亮着点了没反应的按钮）
    this.on($('#railCampaign'), 'click', () => toast('战役（主线剧情）尚未开放，敬请期待。'));

    // 左 3 · 活动中心（原「世界事件」）→ 每周活动屏
    this.on($('#railEvents'), 'click', () => ctx.navigate('#events'));

    // 右 1 · 武器库 → 英雄页武器区（窗口 M 的 #weapons 交付后改指向该屏）
    const weapon = anyWeaponById(save.hero.equippedWeapon);
    if ($('#railVaultCopy')) {
      $('#railVaultCopy').textContent = weapon ? `已装备 · ${weapon.name}` : '尚未装备武器';
    }
    this.on($('#railVault'), 'click', () => ctx.navigate('#hero'));

    // 右 2 · 神殿（职业进阶）→ 英雄页职业圣殿区
    if ($('#railTempleCopy')) {
      $('#railTempleCopy').textContent = `已解锁职业 ${save.hero.unlockedClasses.length}`;
    }
    this.on($('#railTemple'), 'click', () => ctx.navigate('#hero'));

    // 右 3 · 馈赠：无对应系统 → 诚实锁态
    this.on($('#railGifts'), 'click', () => toast('每周礼遇尚未开放，敬请期待。'));
  }

  /** 王国任务 rail 的落点（批次 3 后改为 #quest/<王国> 主线页） */
  private openRailQuest(ctx: ShellCtx): void {
    const target = this.questTargetKingdom();
    const vm = this.nodes.find((n) => n.view.name === target);
    if (!vm || vm.locked) {
      toast('暂无可推进的王国任务，先提升冒险者等级解锁新王国。');
      return;
    }
    void ctx;
    this.openKingdom(target);
  }

  /** 外壳挂载后的二次刷新（战斗归来等场景直接复用） */
  private renderNodes(save: MetaSave): void {
    const nodesEl = $('#nodes');
    nodesEl.innerHTML = this.nodes
      .map((n) => {
        const locked = n.locked;
        const cls = ['knode', n.view.hero ? 'hero' : 'far', n.view.name === this.selected ? 'sel' : '', locked ? 'locked' : '']
          .filter(Boolean)
          .join(' ');
        const mark = n.view.crest ? `<img src="${n.view.crest}" alt="" draggable="false">` : crestSvg(n.view);
        // M-2：锁态与王国等级不再共用一个「裸数字」槽位。
        //   解锁 → 主角是王国名 + 蓝签王国等级（+ 可收进贡角标）；
        //   锁态 → 主角是门槛明文「🔒 冒险者 Lv.N 解锁」，王国名退为第二行。
        const meta = locked
          ? `<span class="kmeta locked">
               <span class="kgate"><span data-icon="lock"></span>冒险者 Lv.${n.unlockLevel} 解锁</span>
               <span class="kname sub">${n.view.name}</span>
             </span>`
          : `<span class="kmeta">
               <span class="kname">${n.view.name}</span>
               <span class="klv" title="王国 ${n.level} 级">${n.level}</span>
             </span>`;
        // M-7：系统层早就备好了 ready 判据，节点上补角标——「哪个国有东西可收」一眼可见
        const bubble = !locked && n.tributeReady
          ? `<span class="ktrib${n.tributeOverflowing ? ' over' : ''}" title="${n.tributeOverflowing ? '已满 12 小时，正在溢出' : '有进贡可收'}"><span data-icon="coin"></span>${fmt(n.tributeGold)}</span>`
          : '';
        const aria = locked
          ? `${n.view.name}，未解锁，需冒险者 ${n.unlockLevel} 级`
          : `${n.view.name}，王国 ${n.level} 级${n.tributeReady ? '，有进贡可收' : ''}`;
        return `<button class="${cls}" data-id="${n.view.name}" style="left:${n.view.x}%;top:${n.view.y}%" aria-label="${aria}">
          <span class="crest">${mark}${bubble}</span>
          ${meta}
        </button>`;
      })
      .join('');
    mountIcons(nodesEl);
    $$('.knode', nodesEl).forEach((el) =>
      this.on(el, 'click', () => this.openKingdom(el.dataset.id!)),
    );
    void save;
  }

  private refreshDaily(save: MetaSave, ctx: ShellCtx): void {
    const now = Date.now();
    const winReady = save.dailyFirstWinAt < todayStartOf(now);
    $('#dailyWinCopy').textContent = winReady ? '每日首胜未领' : '每日首胜已领';
    $('#dailyWin').classList.toggle('hot', winReady);
    // M-4：chip 与弹层、收取按钮同源（tributeReady = 有可实际入账的产出）。
    // 「已满」这个词本身是错的（它表达的是"有可领"），改为「可收」；
    // M-10：真正的"已满溢"单独出词，且给出下一袋时间。
    const readyKingdoms = this.nodes.filter((n) => !n.locked && n.tributeReady);
    const overflowCount = this.nodes.filter((n) => !n.locked && n.tributeOverflowing).length;
    if (readyKingdoms.length) {
      const gold = readyKingdoms.reduce((s, n) => s + n.tributeGold, 0);
      $('#dailyTributeCopy').textContent = overflowCount
        ? `进贡可收 · ${readyKingdoms.length} 国 · ${overflowCount} 国已满溢`
        : `进贡可收 · ${readyKingdoms.length} 国 · 黄金 ${fmt(gold)}`;
    } else {
      const nextAt = this.nodes
        .filter((n) => !n.locked)
        .map((n) => n.tributeNextHourAt)
        .filter((t) => t > now)
        .sort((a, b) => a - b)[0];
      $('#dailyTributeCopy').textContent = nextAt
        ? `进贡累积中 · 下一袋 ${clockOf(nextAt)}`
        : '进贡累积中';
    }
    $('#dailyTribute').classList.toggle('gold', readyKingdoms.length > 0);
    $('#dailyTribute').classList.toggle('over', overflowCount > 0);
    const freeTicket = save.arena.lastFreeEntryAt < weekStartOf(now);
    $('#dailyArenaCopy').textContent = freeTicket ? '竞技场免费票' : '竞技场';
    $('#dailyArena').classList.toggle('hot', freeTicket);
    void ctx;
  }

  // —— 王国弹层 ——

  private openKingdom(name: string): void {
    const vm = this.nodes.find((n) => n.view.name === name);
    if (!vm) return;
    this.selected = name;
    this.openName = name;
    $$('.knode').forEach((n) => n.classList.toggle('sel', n.dataset.id === name));
    this.focusKingdom(name, Math.max(this.cam.s, 1));

    const locked = vm.locked;
    const view = vm.view;
    const portrait = $('#kingdomPortrait') as HTMLImageElement;
    portrait.src = ART[view.biome] ?? ART.spire!;
    portrait.alt = view.name + '王国立绘';
    $('#kingdomArt').classList.toggle('locked', locked);
    $('#kingdomEn').textContent = view.en;
    $('#kingdomArtName').textContent = view.name;
    $('#kingdomName').textContent = view.name;
    $('#kingdomBlurb').textContent = locked
      ? `冒险者达到 Lv.${vm.unlockLevel} 后开放此王国。`
      : view.blurb || `${view.name}的领地等待着你的旗帜。`;
    $('#kingdomLevel').textContent = locked ? '—' : `${vm.level} / ${KINGDOM_MAX_LEVEL}`;
    // M-4/K-4：库存直接给数字（「袋」不是游戏里任何一处出现过的单位，玩家无法折算）
    const stockParts = [
      vm.tributeGold ? `黄金 ${fmt(vm.tributeGold)}` : '',
      vm.tributeSouls ? `灵魂 ${vm.tributeSouls}` : '',
      vm.tributeKeys ? `金钥匙 ${vm.tributeKeys}` : '',
    ].filter(Boolean);
    $('#kingdomTribute').textContent = locked
      ? '—'
      : vm.tributeReady
        ? stockParts.join(' · ')
        : vm.tributeHours > 0
          ? '本轮无产出'
          : '累积中';
    const statCn: Record<string, string> = { health: '生命', armor: '护甲', attack: '攻击', magic: '魔法' };
    const bonusStat = statCn[kingdomBonusStat(view.name)] ?? kingdomBonusStat(view.name);
    $('#kingdomBonus').textContent = vm.level >= KINGDOM_MAX_LEVEL ? `全体 ${bonusStat} +1` : `Lv.10 → ${bonusStat} +1`;
    $('#kingdomFill').style.width = locked ? '0%' : `${(vm.level / KINGDOM_MAX_LEVEL) * 100}%`;
    let cost = 0;
    try {
      cost = kingdomUpgradeCost(vm.level);
    } catch {
      cost = 0;
    }
    $('#upgradeHint').textContent = locked
      ? '未解锁'
      : vm.level >= KINGDOM_MAX_LEVEL
        ? '加成已对全体部队生效'
        : `下一等级 ${fmt(cost)} 黄金`;
    $('#upgradeCost').textContent = fmt(cost);
    ($('#kingdomUpgrade') as HTMLButtonElement).disabled = locked || vm.level >= KINGDOM_MAX_LEVEL;
    $('#upgradeLabel').textContent = locked ? '王国未解锁' : vm.level >= KINGDOM_MAX_LEVEL ? '已达满级' : '投入升级';
    $('.price', $('#kingdomUpgrade')).hidden = locked || vm.level >= KINGDOM_MAX_LEVEL;
    // M-4：收取按钮的可用性与库存同源（改前用小时数判，于是「0 袋 + 按钮可点 + 点了说没有」）
    ($('#kingdomCollect') as HTMLButtonElement).disabled = locked || !vm.tributeReady;
    // K-5：按钮上直接写清收多少；M-10：12 小时上限与「下次几点满」在页面上可见
    $('#collectLabel').textContent = vm.tributeReady
      ? `收取 ${stockParts.join(' · ')}`
      : '收取进贡';
    $('#tributeRow').classList.toggle('over', !locked && vm.tributeOverflowing);
    $('#tributeCopy').textContent = locked
      ? '王国解锁后开始累积进贡'
      : vm.tributeOverflowing
        ? `⚠ 已满 ${TRIBUTE.capHours} 小时上限（${clockOf(vm.tributeCapAt)} 就满了），正在溢出——继续挂着的时间不再产出，请尽快收取`
        : `离线按小时累积，上限 ${TRIBUTE.capHours} 小时 · 已累计 ${vm.tributeHours} 小时 · 下一袋 ${clockOf(vm.tributeNextHourAt)} · ${clockOf(vm.tributeCapAt)} 达上限`;
    $('#questProgress').textContent = locked ? '锁定' : `${vm.questsDone} / 8`;
    $('#exploreState').textContent = vm.exploreUnlocked ? '已开放 · 重复刷取' : '通关后开放';
    $('#troopProgress').textContent = locked ? '—' : `${vm.ownedTroops} / ${vm.poolSize}`;
    $('#entryExplore').classList.toggle('locked', !vm.exploreUnlocked);
    $('#entryQuest').classList.toggle('locked', locked);
    $('#kingdomVeil').hidden = false;
  }

  private closeKingdom(): void {
    $('#kingdomVeil').hidden = true;
    this.openName = null;
  }

  // —— 弹层操作（全走网关） ——

  private async upgrade(ctx: ShellCtx): Promise<void> {
    if (!this.openName) return;
    const { result } = await ctx.gateway.upgradeKingdomLevel(this.openName);
    if (isFailure(result)) {
      toast(result.message);
    } else {
      toast(result >= KINGDOM_MAX_LEVEL
        ? `${this.openName} 达到 10 级，全体部队${kingdomBonusStat(this.openName)} +1。`
        : `${this.openName} 提升至 ${result} 级。`);
    }
    this.afterMutation(ctx);
  }

  private async collect(ctx: ShellCtx): Promise<void> {
    if (!this.openName) return;
    const { result } = await ctx.gateway.collectKingdomTribute(this.openName, Date.now());
    toast(
      result.hits > 0
        ? `进贡已收取：黄金 +${fmt(result.gold)}，灵魂 +${result.souls}${result.goldKeys ? '，金钥匙 +1' : ''}`
        : '暂无可领取的进贡。',
    );
    this.afterMutation(ctx);
  }

  private async collectAllTribute(ctx: ShellCtx): Promise<void> {
    const ready = this.nodes.filter((n) => !n.locked && n.tributeReady);
    if (!ready.length) {
      toast('尚无可领取进贡。');
      return;
    }
    let gold = 0;
    let souls = 0;
    let keys = 0;
    for (const n of ready) {
      const { result } = await ctx.gateway.collectKingdomTribute(n.view.name, Date.now());
      gold += result.gold;
      souls += result.souls;
      keys += result.goldKeys;
    }
    toast(`已收取 ${ready.length} 国进贡：黄金 +${fmt(gold)}，灵魂 +${souls}${keys ? `，金钥匙 +${keys}` : ''}`);
    this.afterMutation(ctx);
  }

  private async enterQuest(ctx: ShellCtx): Promise<void> {
    if (!this.openName) return;
    const vm = this.nodes.find((n) => n.view.name === this.openName);
    if (!vm || vm.locked) {
      toast('王国尚未解锁。');
      return;
    }
    if (vm.nextNode === null) {
      toast('任务链已 8/8 通关，去探索模式重复刷取材料。');
      return;
    }
    await ctx.launchQuest(vm.view.name, vm.nextNode);
  }

  private async enterExplore(ctx: ShellCtx): Promise<void> {
    if (!this.openName) return;
    const vm = this.nodes.find((n) => n.view.name === this.openName);
    if (!vm || !vm.exploreUnlocked) {
      toast('通关 8 章任务链后开放探索。');
      return;
    }
    await ctx.launchExplore(vm.view.name);
  }

  /** 网关变更后：重算节点与弹层 + **同步顶栏钱包**（存档对象不变，重读视图即可） */
  private afterMutation(ctx: ShellCtx): void {
    this.nodes = nodeVms(ctx.gateway);
    this.renderNodes(ctx.save());
    this.refreshDaily(ctx.save(), ctx);
    if (this.openName) this.openKingdom(this.openName);
    // M-3：地图上花钱/收钱后顶栏必须立即正确，否则玩家读成「没扣钱」而连点
    ctx.refreshChrome();
  }

  // —— 相机与拖拽（小样原逻辑移植） ——

  private stageScale(): number {
    return $('#stage').getBoundingClientRect().width / 1600 || 1;
  }

  private viewSize(): { w: number; h: number } {
    const k = this.stageScale();
    const vp = $('#mapViewport').getBoundingClientRect();
    return { w: vp.width / k, h: vp.height / k };
  }

  private applyCam(): void {
    this.clampCam();
    $('#mapWorld').style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
    const labelS = Math.min(1.12, Math.max(1, 1 / this.cam.s));
    $('#nodes').style.setProperty('--label-s', labelS.toFixed(3));
  }

  private clampCam(): void {
    const { w: VIEW_W, h: VIEW_H } = this.viewSize();
    const w = MAP_W * this.cam.s;
    const h = MAP_H * this.cam.s;
    this.cam.x = Math.min(0, Math.max(VIEW_W - w, this.cam.x));
    this.cam.y = Math.min(0, Math.max(VIEW_H - h, this.cam.y));
  }

  private focusKingdom(name: string, scale: number): void {
    const view = kingdomViewOf(name);
    const { w: VIEW_W, h: VIEW_H } = this.viewSize();
    this.cam.s = scale;
    this.cam.x = VIEW_W / 2 - (view.x / 100) * MAP_W * this.cam.s;
    this.cam.y = VIEW_H / 2 - (view.y / 100) * MAP_H * this.cam.s;
    this.applyCam();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.rail, .compass, .daily, .orb, .wallet, .topbar, .bottom-bar, .modal-veil')) return;
    e.preventDefault();
    cancelAnimationFrame(this.drag.inertia);
    this.drag.on = true;
    this.drag.moved = false;
    this.drag.id = t.closest('.knode')?.getAttribute('data-id') ?? null;
    this.drag.lx = e.clientX;
    this.drag.ly = e.clientY;
    this.drag.t = performance.now();
    this.drag.vx = this.drag.vy = 0;
    $('#mapViewport').classList.add('grabbing');
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 指针捕获失败不阻塞拖拽 */
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag.on) return;
    const k = this.stageScale();
    const dx = (e.clientX - this.drag.lx) / k;
    const dy = (e.clientY - this.drag.ly) / k;
    this.drag.lx = e.clientX;
    this.drag.ly = e.clientY;
    const now = performance.now();
    const dt = Math.max(8, now - this.drag.t);
    this.drag.t = now;
    this.drag.vx = dx * (16.67 / dt);
    this.drag.vy = dy * (16.67 / dt);
    if (Math.hypot(dx, dy) > 0.6) this.drag.moved = true;
    this.cam.x += dx;
    this.cam.y += dy;
    this.applyCam();
  }

  private endDrag(e: PointerEvent): void {
    if (!this.drag.on) return;
    this.drag.on = false;
    $('#mapViewport').classList.remove('grabbing');
    if (!this.drag.moved && this.drag.id) {
      this.openKingdom(this.drag.id);
      return;
    }
    if (!this.drag.moved) return;
    let vx = this.drag.vx;
    let vy = this.drag.vy;
    cancelAnimationFrame(this.drag.inertia);
    const tick = (): void => {
      vx *= 0.9;
      vy *= 0.9;
      if (Math.hypot(vx, vy) < 0.18) return;
      this.cam.x += vx;
      this.cam.y += vy;
      this.applyCam();
      this.drag.inertia = requestAnimationFrame(tick);
    };
    this.drag.inertia = requestAnimationFrame(tick);
    void e;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { w: VIEW_W, h: VIEW_H } = this.viewSize();
    const rect = $('#mapViewport').getBoundingClientRect();
    const k = this.stageScale();
    const mx = (e.clientX - rect.left) / k;
    const my = (e.clientY - rect.top) / k;
    const prev = this.cam.s;
    const minS = Math.max(0.55, VIEW_W / MAP_W, VIEW_H / MAP_H);
    const next = Math.min(1.55, Math.max(minS, this.cam.s * (e.deltaY > 0 ? 0.92 : 1.08)));
    const wx = (mx - this.cam.x) / prev;
    const wy = (my - this.cam.y) / prev;
    this.cam.s = next;
    this.cam.x = mx - wx * next;
    this.cam.y = my - wy * next;
    this.applyCam();
  }

  /** 事件绑定记账，路由切屏时统一解绑（防泄漏） */
  on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  dispose(): void {
    cancelAnimationFrame(this.drag.inertia);
    for (const [target, type, fn, opts] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn, opts);
    }
  }
}
