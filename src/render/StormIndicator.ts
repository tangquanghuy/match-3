/**
 * 顶部风暴指示器（TASK-STORM-ACCEPTANCE 阶段 2，窗口 D 名下；2026-09 视觉重做）。
 *
 * 棋盘顶部预留 44px HUD 通道：回合 HUD（turn-hud）居中占棋盘上沿，本指示器占满
 * 棋盘宽度的同一条带（stormIndicatorSlot 双方同槽，全场唯一风暴）。
 *
 * 构图分两层（旧版单层平涂色罩把星落横幅的金色饰线糊成"红线"、且完全静态，已废弃）：
 * 1. 洗染层（z13，mix-blend-mode:screen）：从金饰线以下开始，风暴色把星幕"点亮"成
 *    风暴天色——冠饰位下方椭圆聚焦（略偏左打破对称），三团软光云错拍对漂，整体缓慢呼吸；
 *    金线上方不刷任何全宽色（透明区底子纯黑，全宽刷色必读成"均匀横条"），那里只留
 *    宝石自身的局部光环。内外双层渐变遮罩把四条矩形边全部羽化。
 *    screen 只提亮不遮盖：金色饰线与 TURN 文字保持可读，只被天色染色。
 * 2. 主体层（z14）：冠饰星位上的对应色宝石（呼吸）+ 三层偏心倾斜椭圆光环（含游移亮斑，
 *    周期错开避免"规则光碟"）+ 横向漂移火花 + 随机落雷。
 *    闪电为运行时生成的 SVG 折线（白芯 + 风暴色辉光），flicker 数帧后即焚；
 *    节奏约 1.6~4s 一道，三成概率紧跟第二道。
 *    全部 idle 动画只动 transform/opacity（合成器友好），零新增素材。
 *
 * 宝石压在星落横幅素材的冠饰星位上（纵向 19% 处的紫钻石，App 按 banner 几何换算成
 * gemCenterY 传入）——无风暴时露出原紫钻石，风暴时"冠上换上风暴宝石"。
 *
 * 演出（EventStreamPlayer.onStormChange → App 接管）：
 * - set / replaced 新风暴：洗染淡入 + 冠饰位一次白闪 + 宝石弹跳入场，随后进入 idle；
 * - replaced 被顶方（color=null）/ expired：洗染与主体同步 0.3s 淡出。
 *
 * 纯逻辑（stormChangePlan / stormIndicatorSlot / 调色板）与 DOM 外壳分离：
 * vitest 为 node 环境，tests/unit/stormIndicator* 测纯逻辑与未挂载时的安全空转。
 */
import { BaseColor, PlayerSide } from '@engine/types';
import type { SkullStormDropKind } from '@engine/types';
import type { StormChangeEvent } from '@engine/events';
import { AnimConfig } from './AnimationConfig';

// 与 gemTextures.ts 同源的宝石贴图素材（同一文件，Vite 构建去重，零新增产物）。
import blueGemUrl from '@assets/gems/blue.png?url';
import skullGemUrl from '@assets/gems/skull.png?url';
import doomSkullGemUrl from '@assets/gems/special/doomSkull.png?url';
import uberDoomSkullGemUrl from '@assets/gems/special/uberDoomSkull.png?url';
import brownGemUrl from '@assets/gems/brown.png?url';
import greenGemUrl from '@assets/gems/green.png?url';
import purpleGemUrl from '@assets/gems/purple.png?url';
import redGemUrl from '@assets/gems/red.png?url';
import yellowGemUrl from '@assets/gems/yellow.png?url';

/** 指示器的对应色宝石贴图（按颜色，与棋盘宝石同一素材） */
export const STORM_GEM_URL: Record<BaseColor, string> = {
  [BaseColor.Red]: redGemUrl,
  [BaseColor.Green]: greenGemUrl,
  [BaseColor.Blue]: blueGemUrl,
  [BaseColor.Yellow]: yellowGemUrl,
  [BaseColor.Purple]: purpleGemUrl,
  [BaseColor.Brown]: brownGemUrl,
};

/** 底衬光晕的色系基色（与 App 法力流配色同族；通过 CSS 变量 --storm-color 下发） */
export const STORM_GLOW_COLOR: Record<BaseColor, string> = {
  [BaseColor.Red]: '#ff5968',
  [BaseColor.Green]: '#63dc78',
  [BaseColor.Blue]: '#5eb5ff',
  [BaseColor.Yellow]: '#ffd45a',
  [BaseColor.Purple]: '#bd7aff',
  [BaseColor.Brown]: '#d49355',
};

/**
 * 骷髅系风暴（骸骨/末日/超级末日）的宝石贴图：与棋盘骷髅/特殊宝石同一素材。
 * 颜色风暴走 STORM_GEM_URL（按 BaseColor），骷髅系走本表（按 dropKind）。
 */
export const STORM_SKULL_GEM_URL: Record<SkullStormDropKind, string> = {
  skull: skullGemUrl,
  doomSkull: doomSkullGemUrl,
  uberDoomSkull: uberDoomSkullGemUrl,
};

/** 骷髅系风暴的光晕色（取自各贴图主色调；与六色风暴的 STORM_GLOW_COLOR 区分） */
export const STORM_SKULL_GLOW: Record<SkullStormDropKind, string> = {
  skull: '#e6ddc8',      // 骨白（黑白骷髅头贴图）
  doomSkull: '#ff2f68',  // 血红（灰骷髅红眼，比火风暴更深更冷）
  uberDoomSkull: '#ff8a2a', // 熔岩橙（贴图的橙红裂纹）
};

/**
 * set/replaced 新风暴的一次性色系爆发 FX：复用群体受击的各色序列帧
 * （group_hit_*_strip，App.FRAME_FX_STRIP 已注册，进战斗前随战斗资源一起预载）。
 * 闲置的 boom_strip.png 是中性色爆炸，不合"色系爆发"的要求，故不用。
 */
export const STORM_BURST_FX: Record<BaseColor, string> = {
  [BaseColor.Purple]: 'group_hit_purple',
  [BaseColor.Red]: 'group_hit_red',
  [BaseColor.Blue]: 'group_hit_blue',
  [BaseColor.Yellow]: 'group_hit_yellow',
  [BaseColor.Brown]: 'group_hit_brown',
  [BaseColor.Green]: 'group_hit_green',
};

/** 爆发 FX 的时间线预留（秒）：取各色 group_hit 最长时长，时间线等爆发播完再推进 */
export const STORM_BURST_HOLD_SECONDS = Math.max(
  ...Object.values(STORM_BURST_FX).map((name) => AnimConfig.frameFX[name]?.duration ?? 0),
) / 1000;

/** 指示器淡出时长（秒）：expired / 被顶方撤下 */
export const STORM_FADE_SECONDS = 0.3;

/** 指示器槽位几何（wrapper 布局坐标，与 DOM 覆盖层同一坐标系） */
export interface StormIndicatorSlotSpec {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** mount() 需要的布局参数：顶部 44px HUD 通道 + 双方队伍列上沿位置（App.init 计算后传入） */
export interface StormIndicatorLayout {
  /** 左队伍列上沿的 x（= 棋盘左侧宝石区宽度） */
  leftColumnX: number;
  /** 右队伍列上沿的 x（= 棋盘右缘 + 列间距） */
  rightColumnX: number;
  /** 队列宽（当前 = 棋盘宽，风暴天色铺满棋盘上沿） */
  columnWidth: number;
  /** HUD 通道上缘（与回合 HUD 同一水平带） */
  laneTop: number;
  /** HUD 通道高（44） */
  laneHeight: number;
  /** 宝石（冠饰位）中心的 y（wrapper 坐标）；缺省取通道 42% 高度处 */
  gemCenterY?: number;
}

/** 单条 storm-change 的演出决策（纯函数，node 环境可测） */
export interface StormChangePlan {
  action: 'show' | 'hide';
  player: PlayerSide;
  color: BaseColor | null;
  /** 骷髅系风暴的掉落目标（骸骨/末日/超级末日）；颜色风暴缺省 */
  dropKind?: SkullStormDropKind;
  reason: StormChangeEvent['reason'];
  /** 复用召唤音效（仅 set；replaced 的新风暴不再叠放召唤音） */
  summonSfx: boolean;
  /** EventStreamPlayer 为该事件预留的时间线时长（秒） */
  holdSeconds: number;
  /** 一次性色系爆发 FX（AnimConfig.frameFX 键，对应色 group_hit_*）；hide 为 null */
  burstFx: string | null;
}

/**
 * 把 storm-change 事件翻译成表现决策：
 * - color 非 null（set / replaced 新风暴）→ 弹入 + 色系爆发；仅 set 复用召唤音效
 * - color 为 null（replaced 被顶方 / expired）→ 淡出
 */
export function stormChangePlan(ev: StormChangeEvent): StormChangePlan {
  if (ev.color !== null) {
    return {
      action: 'show',
      player: ev.player,
      color: ev.color,
      dropKind: ev.dropKind,
      reason: ev.reason,
      summonSfx: false,
      holdSeconds: 0,
      burstFx: null,
    };
  }
  return {
    action: 'hide',
    player: ev.player,
    color: null,
    reason: ev.reason,
    summonSfx: false,
    holdSeconds: 0,
    burstFx: null,
  };
}

/** 指示器槽位：双方共用棋盘宽的同一条顶部通道（全场唯一风暴，同一时刻至多一个可见） */
export function stormIndicatorSlot(
  player: PlayerSide,
  layout: StormIndicatorLayout,
): StormIndicatorSlotSpec {
  return {
    left: player === PlayerSide.Left ? layout.leftColumnX : layout.rightColumnX,
    top: layout.laneTop,
    width: layout.columnWidth,
    height: layout.laneHeight,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 冠饰位宝石直径：HUD 通道恒为 44px 高，按通道调定 */
const GEM_SIZE_PX = 34;
/** 洗染层高度与左右外溢（向下渐隐，不压第一行宝石的读性） */
const WASH_HEIGHT_PX = 58;
const WASH_OVERHANG_PX = 14;
/** 漂移火花数量（每个一条无限 WAAPI，量级克制） */
const SPARK_COUNT = 12;

/** 每方的两层 DOM 外壳（洗染层 + 主体层）与其中的动态件引用 */
interface StormSlotParts {
  wash: HTMLDivElement;
  slot: HTMLDivElement;
  /** 冠饰位一次性白闪（入场 / 落雷时快闪） */
  flare: HTMLSpanElement;
  /** 宝石 + 光环 + 能量环的定位组（入场弹跳 / 呼吸都动它） */
  gemGroup: HTMLDivElement;
}

/**
 * 指示器 DOM 外壳：每方一套（同一时刻至多一个可见——全场唯一风暴）。
 * 弹入/淡出走 Web Animations API（与 App 的卡片动画同风格）；未挂载时全部安全空转，
 * 使 node 环境的单元测试可实例化。
 */
export class StormIndicator {
  private host: HTMLElement | null = null;
  private layout: StormIndicatorLayout | null = null;
  private parts = new Map<PlayerSide, StormSlotParts>();
  private visible = new Map<PlayerSide, boolean>();
  private active: { side: PlayerSide; color: BaseColor } | null = null;
  /** 落雷调度定时器（按方记账；hide/destroy 时清空） */
  private strikeTimers = new Map<PlayerSide, number[]>();
  /** 入场一次性动画（重复 show 时先取消） */
  private entranceAnims: Animation[] = [];
  /** 退场淡出动画（避免 fill forwards 与新一轮 show 竞争） */
  private fadeAnims = new Map<PlayerSide, Animation[]>();
  /** 退场兜底定时器（show 时一并清掉；见 hide 内注释） */
  private fadeTimers = new Map<PlayerSide, number[]>();

  /** 挂载到战斗容器（wrapper）：按 layout 建左右两套外壳；重复挂载先销毁旧外壳 */
  mount(host: HTMLElement, layout: StormIndicatorLayout): void {
    this.destroy();
    this.host = host;
    this.layout = layout;
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const spec = stormIndicatorSlot(side, layout);
      this.parts.set(side, this.createParts(side, spec, layout));
      this.visible.set(side, false);
    }
  }

  /** 显示某方某色的指示器（弹入）。另一侧若仍有旧指示器则先淡出（全场唯一风暴）。
   *  dropKind 为骷髅系风暴（骸骨/末日/超级末日）：贴图与光晕走骷髅系表，color 仅作兜底。 */
  show(color: BaseColor, player: PlayerSide, dropKind?: SkullStormDropKind): void {
    const parts = this.parts.get(player);
    if (!parts) return;
    const other = player === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
    if (this.visible.get(other)) this.hide(other);
    this.clearStrikes(player);
    for (const anim of this.entranceAnims) anim.cancel();
    this.entranceAnims = [];

    const { wash, slot, flare, gemGroup } = parts;
    const glow = dropKind ? STORM_SKULL_GLOW[dropKind] : STORM_GLOW_COLOR[color];
    wash.style.setProperty('--storm-color', glow);
    slot.style.setProperty('--storm-color', glow);
    const gemSrc = dropKind ? STORM_SKULL_GEM_URL[dropKind] : STORM_GEM_URL[color];
    const gem = slot.querySelector<HTMLImageElement>('img[data-storm-part="gem"]');
    if (gem && gem.getAttribute('src') !== gemSrc) gem.src = gemSrc;
    // 上一轮退场可能还挂着淡出动画/兜底定时器：全部撤掉再入场
    for (const anim of this.fadeAnims.get(player) ?? []) anim.cancel();
    this.fadeAnims.set(player, []);
    for (const timer of this.fadeTimers.get(player) ?? []) window.clearTimeout(timer);
    this.fadeTimers.set(player, []);

    wash.style.display = 'block';
    slot.style.display = 'block';
    wash.style.opacity = '1';
    slot.style.opacity = '1';
    this.visible.set(player, true);
    this.active = { side: player, color };

    // 入场：天色淡入 + 冠饰位白闪 + 宝石弹跳落位；随后进入 idle（呼吸/火花/落雷）。
    this.entranceAnims = [
      wash.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 420, easing: 'ease-out' },
      ),
      flare.animate(
        [
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' },
          { opacity: .95, transform: 'translate(-50%,-50%) scale(1.12)', offset: .28 },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1.7)' },
        ],
        { duration: 640, easing: 'ease-out' },
      ),
      gemGroup.animate(
        [
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1.16)', offset: .62 },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
        ],
        { duration: 560, easing: 'cubic-bezier(.2,.85,.3,1.08)' },
      ),
    ];
    this.scheduleStrikes(player, 620);
  }

  /** 淡出某方的指示器（expired / 被顶方撤下）；本就不可见时为空操作 */
  hide(player: PlayerSide): void {
    const parts = this.parts.get(player);
    if (!parts || !this.visible.get(player)) return;
    this.visible.set(player, false);
    if (this.active?.side === player) this.active = null;
    this.clearStrikes(player);
    const fades: Animation[] = [];
    const timers: number[] = [];
    for (const el of [parts.slot, parts.wash]) {
      const anim = el.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: STORM_FADE_SECONDS * 1000, easing: 'ease-out', fill: 'forwards' },
      );
      // 收尾不能只靠 onfinish：页面被挂起（切后台/遮盖）时动画时钟冻结、onfinish 不来，
      // 兜底定时器超时后直接收起；被新一轮 show 抢先时只释放 forwards fill。
      const settle = (): void => {
        window.clearTimeout(timer);
        if (this.visible.get(player)) {
          anim.cancel();
          el.style.opacity = '1';
          return;
        }
        el.style.display = 'none';
        anim.cancel();
        el.style.opacity = '1';
      };
      const timer = window.setTimeout(settle, STORM_FADE_SECONDS * 1000 + 80);
      anim.onfinish = settle;
      fades.push(anim);
      timers.push(timer);
    }
    this.fadeAnims.set(player, fades);
    this.fadeTimers.set(player, timers);
  }

  /** 淡出全部指示器（战斗收尾兜底用） */
  hideAll(): void {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) this.hide(side);
  }

  /** 当前活动指示器的中心（wrapper 布局坐标，与 DOM 覆盖层同一坐标系）；无活动风暴时为 null */
  activeCenter(): { x: number; y: number } | null {
    if (!this.active || !this.layout) return null;
    const slot = stormIndicatorSlot(this.active.side, this.layout);
    const gemY = this.layout.gemCenterY ?? slot.top + slot.height * 0.42;
    return { x: slot.left + slot.width / 2, y: gemY };
  }

  getActiveSide(): PlayerSide | null {
    return this.active?.side ?? null;
  }

  getActiveColor(): BaseColor | null {
    return this.active?.color ?? null;
  }

  /** 移除外壳与状态（重复挂载 / 卸载时用） */
  destroy(): void {
    for (const side of [...this.parts.keys()]) this.clearStrikes(side);
    for (const anim of this.entranceAnims) anim.cancel();
    this.entranceAnims = [];
    for (const anims of this.fadeAnims.values()) for (const anim of anims) anim.cancel();
    this.fadeAnims.clear();
    for (const timers of this.fadeTimers.values()) for (const timer of timers) window.clearTimeout(timer);
    this.fadeTimers.clear();
    for (const { wash, slot } of this.parts.values()) {
      wash.remove();
      slot.remove();
    }
    this.parts.clear();
    this.visible.clear();
    this.active = null;
    this.host = null;
    this.layout = null;
  }

  // —— DOM 外壳构建 ——

  private createParts(side: PlayerSide, spec: StormIndicatorSlotSpec, layout: StormIndicatorLayout): StormSlotParts {
    const laneH = layout.laneHeight;
    const gemY = (layout.gemCenterY ?? spec.top + laneH * 0.42) - spec.top;

    // 洗染层：直接挂在 wrapper 上（不能塞进有 z-index 的槽位里——隔离的层叠上下文
    // 会让 mix-blend-mode 失去横幅底衬，退化成旧版的平涂色罩）。
    // 顶边从金饰线以下开始：金线上方的透明区底子是纯黑，任何全宽刷色都会读成"均匀横条"，
    // 那里只留宝石自身的局部光环。纵向渐变遮罩羽化上下硬边（横向羽化由内层 90deg 遮罩负责）。
    const washTop = spec.top + 12;
    const wash = document.createElement('div');
    wash.dataset.stormPart = 'wash';
    wash.style.cssText = [
      'position:absolute',
      `left:${spec.left - WASH_OVERHANG_PX}px`, `top:${washTop}px`,
      `width:${spec.width + WASH_OVERHANG_PX * 2}px`, `height:${WASH_HEIGHT_PX}px`,
      'z-index:13', 'pointer-events:none', 'display:none',
      '--storm-color:#ffffff',
      'mix-blend-mode:screen',
      '-webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 16px), transparent 100%)',
      'mask-image:linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 16px), transparent 100%)',
    ].join(';');

    // 天色主体：冠饰位下方椭圆聚焦（略偏左，打破左右对称）+ 顶部横向衰减，整体缓慢呼吸。
    // 90deg 遮罩把左右两端也羽化掉——旧版矩形边界"盖章感"的根源就是缺这道羽化。
    // 渐变中心取宝石在洗染层局部坐标、最低压到星幕区内（不低于 14px）。
    const washGemY = Math.max(14, gemY - 12);
    const washStatic = document.createElement('span');
    washStatic.dataset.stormPart = 'wash-static';
    washStatic.style.cssText = [
      'position:absolute', 'inset:0',
      'background:'
      + `radial-gradient(ellipse 210px 100px at 46% ${washGemY}px,`
      + ' color-mix(in srgb, var(--storm-color) 44%, transparent) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 19%, transparent) 44%,'
      + ' transparent 76%),'
      + 'linear-gradient(to bottom,'
      + ' color-mix(in srgb, var(--storm-color) 34%, transparent) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 15%, transparent) 46%,'
      + ' transparent 92%)',
      '-webkit-mask-image:linear-gradient(90deg, transparent 0, #000 9%, #000 91%, transparent 100%)',
      'mask-image:linear-gradient(90deg, transparent 0, #000 9%, #000 91%, transparent 100%)',
    ].join(';');
    washStatic.animate(
      [
        { opacity: .78, transform: 'scaleY(1)' },
        { opacity: 1, transform: 'scaleY(1.06)' },
      ],
      { duration: 4200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );

    // 三团软光云横向对漂：大小/高度/周期全错开，叠出无规则的天色流动感。
    const cloud = (widthPct: number, heightPx: number, opacity: number, durationMs: number, delayMs: number): HTMLSpanElement => {
      const el = document.createElement('span');
      el.style.cssText = [
        'position:absolute', `left:${(50 - widthPct / 2)}%`, 'top:-10px',
        `width:${widthPct}%`, `height:${heightPx}px`, 'border-radius:50%',
        'background:radial-gradient(ellipse at center,'
        + ' color-mix(in srgb, var(--storm-color) 32%, transparent) 0%, transparent 72%)',
        'filter:blur(18px)', `opacity:${opacity}`,
      ].join(';');
      el.animate(
        [
          { transform: 'translateX(-10%)' },
          { transform: 'translateX(10%)' },
        ],
        {
          duration: durationMs, delay: delayMs,
          direction: 'alternate', iterations: Infinity, easing: 'ease-in-out',
        },
      );
      return el;
    };

    // 冠饰位一次性白闪（入场 / 落雷同步快闪）：椭圆 + 大半径羽化，读作"光爆"而非"圆片"。
    const flare = document.createElement('span');
    flare.dataset.stormPart = 'flare';
    flare.style.cssText = [
      'position:absolute', 'left:48%', `top:${washGemY}px`,
      'width:220px', 'height:130px',
      'transform:translate(-50%,-50%)', 'opacity:0',
      'background:radial-gradient(ellipse at center,'
      + ' rgba(255,255,255,.92) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 52%, transparent) 24%,'
      + ' transparent 72%)',
      'filter:blur(4px)',
    ].join(';');

    washStatic.append(cloud(58, 42, .55, 11000, 0), cloud(42, 34, .46, 15600, 2600), cloud(28, 26, .5, 8600, 5200), flare);
    wash.append(washStatic);

    // 主体层：宝石 / 光环 / 能量环 / 火花 / 闪电。
    const slot = document.createElement('div');
    slot.dataset.stormIndicator = String(side);
    slot.dataset.stormPart = 'slot';
    slot.style.cssText = [
      'position:absolute',
      `left:${spec.left}px`, `top:${spec.top}px`,
      `width:${spec.width}px`, `height:${spec.height}px`,
      'z-index:14', 'pointer-events:none', 'display:none',
      '--storm-color:#ffffff',
      'filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))',
      'overflow:visible',
    ].join(';');

    // 火花：风暴色亮点沿天带横向漂移、闪烁（transform/opacity，合成器友好）。
    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = document.createElement('span');
      const leftPct = 3 + Math.random() * 94;
      const topPx = 8 + Math.random() * Math.max(12, laneH - 12);
      const drift = (24 + Math.random() * 58) * (Math.random() < .5 ? -1 : 1);
      const rise = -(4 + Math.random() * 14);
      spark.style.cssText = [
        'position:absolute', `left:${leftPct.toFixed(1)}%`, `top:${topPx.toFixed(1)}px`,
        'width:3px', 'height:3px', 'border-radius:50%', 'opacity:0',
        'background:radial-gradient(circle, rgba(255,255,255,.95) 0%,'
        + ' color-mix(in srgb, var(--storm-color) 85%, transparent) 55%, transparent 100%)',
        'box-shadow:0 0 6px color-mix(in srgb, var(--storm-color) 80%, transparent)',
      ].join(';');
      spark.animate(
        [
          { transform: 'translate(0,0) scale(.7)', opacity: 0 },
          { opacity: .85, offset: .18 },
          { opacity: .3, offset: .62 },
          { transform: `translate(${drift.toFixed(0)}px,${rise.toFixed(0)}px) scale(1)`, opacity: 0 },
        ],
        {
          duration: 2600 + Math.random() * 2800,
          delay: Math.random() * 3400,
          iterations: Infinity,
          easing: 'linear',
        },
      );
      slot.appendChild(spark);
    }

    // 宝石定位组：光环 + 旋转能量环 + 宝石贴图，全部压在冠饰星位上。
    const gemGroup = document.createElement('div');
    gemGroup.dataset.stormPart = 'gem-group';
    gemGroup.style.cssText = [
      'position:absolute', 'left:50%', `top:${gemY}px`,
      'width:0', 'height:0', 'overflow:visible',
    ].join(';');

    // 光环拆三层、全部偏心+倾斜+不均匀色标（周期也错开）——对称渐变叠出来必然是
    // "可以左右折叠的规则光碟"，偏摆与游移亮斑才像活的光。
    const haloAmbient = document.createElement('span');
    haloAmbient.dataset.stormPart = 'halo-ambient';
    haloAmbient.style.cssText = [
      'position:absolute', 'left:-8px', 'top:-5px',
      'width:158px', 'height:96px',
      'transform:translate(-50%,-50%) rotate(-8deg)',
      'background:radial-gradient(ellipse at 44% 46%,'
      + ' color-mix(in srgb, var(--storm-color) 28%, transparent) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 13%, transparent) 38%,'
      + ' color-mix(in srgb, var(--storm-color) 7%, transparent) 58%,'
      + ' transparent 76%)',
      'filter:blur(13px)',
    ].join(';');
    haloAmbient.animate(
      [
        { opacity: .5, transform: 'translate(-50%,-50%) rotate(-8deg) scale(.9)' },
        { opacity: .85, transform: 'translate(-50%,-50%) rotate(-6deg) scale(1.08)' },
      ],
      { duration: 3900, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );

    const haloCore = document.createElement('span');
    haloCore.dataset.stormPart = 'halo-core';
    haloCore.style.cssText = [
      'position:absolute', 'left:6px', 'top:-7px',
      'width:82px', 'height:54px',
      'transform:translate(-50%,-50%) rotate(6deg)',
      'background:radial-gradient(ellipse at 46% 40%,'
      + ' color-mix(in srgb, var(--storm-color) 48%, transparent) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 20%, transparent) 42%,'
      + ' transparent 74%)',
      'filter:blur(6px)',
    ].join(';');
    haloCore.animate(
      [
        { opacity: .62, transform: 'translate(-50%,-50%) rotate(6deg) scale(.96)' },
        { opacity: 1, transform: 'translate(-50%,-50%) rotate(4deg) scale(1.1)' },
      ],
      { duration: 2700, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );

    // 游移亮斑：贴着宝石上缘的一小片白热光，慢摆 + 快闪呼吸——给光斑一个"不安分"的热点。
    const glint = document.createElement('span');
    glint.dataset.stormPart = 'glint';
    glint.style.cssText = [
      'position:absolute', 'left:-9px', 'top:-10px',
      'width:42px', 'height:22px',
      'transform:translate(-50%,-50%) rotate(-14deg)', 'opacity:0',
      'background:radial-gradient(ellipse at center,'
      + ' rgba(255,255,255,.6) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 42%, transparent) 46%,'
      + ' transparent 78%)',
      'filter:blur(3px)',
    ].join(';');
    glint.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) rotate(-18deg) translateX(-6px) scale(.8)' },
        { opacity: .55, transform: 'translate(-50%,-50%) rotate(-10deg) translateX(0) scale(1.05)', offset: .45 },
        { opacity: 0, transform: 'translate(-50%,-50%) rotate(-6deg) translateX(7px) scale(.85)' },
      ],
      { duration: 3400, iterations: Infinity, easing: 'ease-in-out' },
    );

    const gem = document.createElement('img');
    gem.dataset.stormPart = 'gem';
    gem.alt = '';
    gem.draggable = false;
    gem.style.cssText = [
      'position:absolute', 'left:0', 'top:0',
      `width:${GEM_SIZE_PX}px`, `height:${GEM_SIZE_PX}px`,
      'transform:translate(-50%,-50%)',
      'filter:drop-shadow(0 0 4px var(--storm-color))'
      + ' drop-shadow(0 0 10px color-mix(in srgb, var(--storm-color) 40%, transparent))',
    ].join(';');

    gemGroup.append(haloAmbient, haloCore, glint, gem);
    gemGroup.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)' },
        { transform: 'translate(-50%,-50%) scale(1.06)' },
      ],
      { duration: 2600, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );

    slot.appendChild(gemGroup);
    this.host?.append(wash, slot);
    return { wash, slot, flare, gemGroup };
  }

  // —— 落雷 ——

  /** 落雷调度：首雷延迟 firstDelayMs，其后 1.6~4.1s 一道；三成概率紧跟第二道 */
  private scheduleStrikes(player: PlayerSide, firstDelayMs: number): void {
    const parts = this.parts.get(player);
    const layout = this.layout;
    if (!parts || !layout) return;
    const tick = (delay: number): void => {
      const timer = window.setTimeout(() => {
        if (!this.visible.get(player) || this.parts.get(player) !== parts) return;
        this.spawnBolt(parts, layout.laneHeight);
        if (Math.random() < 0.3) {
          const second = window.setTimeout(() => {
            if (this.visible.get(player)) this.spawnBolt(parts, layout.laneHeight);
          }, 130 + Math.random() * 170);
          this.pushTimer(player, second);
        }
        tick(1600 + Math.random() * 2500);
      }, delay);
      this.pushTimer(player, timer);
    };
    tick(firstDelayMs);
  }

  /**
   * 生成一道闪电：白芯 + 风暴色辉光的 SVG 折线，从通道上缘劈向天带下缘，
   * flicker 数帧后即焚；落雷同时给洗染层一记快闪（天色骤亮）。
   */
  private spawnBolt(parts: StormSlotParts, laneH: number): void {
    // 并发上限：页面被挂起时 onfinish 不触发、闪电 SVG 会滞留，解冻瞬间不至于扎堆
    if (parts.slot.querySelectorAll('svg').length >= 3) return;
    const width = parts.slot.clientWidth || 1;
    const height = laneH + 8;
    const gemX = width / 2;
    let x = 14 + Math.random() * Math.max(1, width - 28);
    if (Math.abs(x - gemX) < 40) x = gemX + (x < gemX ? -40 : 40); // 不劈在宝石上

    const steps = 5 + ((Math.random() * 3) | 0);
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = (height * i) / steps;
      const jitter = i === 0 || i === steps ? Math.random() * 8 - 4 : Math.random() * 22 - 11;
      points.push(`${(x + jitter).toFixed(1)},${y.toFixed(1)}`);
    }
    const polyline = (stroke: string, strokeWidth: number, opacity: number): SVGPolylineElement => {
      const p = document.createElementNS(SVG_NS, 'polyline');
      p.setAttribute('points', points.join(' '));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-width', String(strokeWidth));
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('opacity', String(opacity));
      p.style.stroke = stroke;
      return p;
    };
    const group = document.createElementNS(SVG_NS, 'g');
    group.appendChild(polyline('var(--storm-color)', 4, .85));
    group.appendChild(polyline('rgba(255,255,255,.96)', 1.5, .95));
    // 三成概率带一条分叉
    if (Math.random() < 0.3) {
      const fork = document.createElementNS(SVG_NS, 'polyline');
      const mid = points[Math.floor(points.length / 2)].split(',');
      const mx = Number(mid[0]);
      const my = Number(mid[1]);
      const dir = mx > gemX ? 1 : -1;
      fork.setAttribute(
        'points',
        `${mx},${my} ${(mx + dir * (10 + Math.random() * 16)).toFixed(1)},${(my + 12 + Math.random() * 14).toFixed(1)}`,
      );
      fork.setAttribute('fill', 'none');
      fork.setAttribute('stroke-width', '1.4');
      fork.setAttribute('stroke-linecap', 'round');
      fork.style.stroke = 'var(--storm-color)';
      group.appendChild(fork);
    }

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.style.cssText = [
      'position:absolute', 'left:0', 'top:-4px',
      `width:${width}px`, `height:${height}px`,
      'overflow:visible', 'pointer-events:none', 'opacity:0',
      'filter:drop-shadow(0 0 3px var(--storm-color)) drop-shadow(0 0 9px var(--storm-color))',
    ].join(';');
    svg.appendChild(group);
    parts.slot.appendChild(svg);
    const anim = svg.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: .12 },
        { opacity: .25, offset: .32 },
        { opacity: .9, offset: .48 },
        { opacity: 0 },
      ],
      { duration: 300 + Math.random() * 120, easing: 'linear' },
    );
    anim.onfinish = () => svg.remove();
    parts.flare.animate(
      [{ opacity: 0 }, { opacity: .5 }, { opacity: 0 }],
      { duration: 280, easing: 'ease-out' },
    );
  }

  private pushTimer(player: PlayerSide, timer: number): void {
    const list = this.strikeTimers.get(player) ?? [];
    list.push(timer);
    this.strikeTimers.set(player, list);
  }

  private clearStrikes(player: PlayerSide): void {
    for (const timer of this.strikeTimers.get(player) ?? []) window.clearTimeout(timer);
    this.strikeTimers.set(player, []);
  }
}
