/**
 * 顶部风暴指示器（TASK-STORM-ACCEPTANCE 阶段 2，窗口 D 名下）。
 *
 * 棋盘顶部预留 44px HUD 通道：回合 HUD（turn-hud）居中占棋盘上沿，本指示器占
 * 施放风暴一方队伍列的上沿——左队（PlayerSide.Left）→ 通道左侧槽位，
 * 右队（PlayerSide.Right）→ 通道右侧槽位（见 stormIndicatorSlot）。
 *
 * 表现 = 对应颜色宝石贴图（复用 src/assets/gems/*.png，与 gemTextures.ts 同源素材，
 * 该文件只读且只导出 Pixi Texture，CSS <img> 取不到 URL，故按同路径经 Vite `?url`
 * 引用，构建产物对同一素材去重）+ 底衬色系光晕。持续感用零素材 CSS 脉冲动画，
 * 不循环播序列帧（性能）。
 *
 * 三类 storm-change 演出（EventStreamPlayer.onStormChange → App 接管）：
 * - set：指示器弹入 + 对应色 group_hit_* 一次性爆发 FX + 复用 summon 音效
 * - replaced：被顶方（color=null）指示器淡出；新风暴方指示器弹入
 * - expired：指示器淡出
 *
 * 纯逻辑（stormChangePlan / stormIndicatorSlot / 调色板）与 DOM 外壳分离：
 * vitest 为 node 环境，tests/unit/stormIndicator* 测纯逻辑与未挂载时的安全空转。
 */
import { BaseColor, PlayerSide } from '@engine/types';
import type { StormChangeEvent } from '@engine/events';
import { AnimConfig } from './AnimationConfig';

// 与 gemTextures.ts 同源的宝石贴图素材（同一文件，Vite 构建去重，零新增产物）。
import blueGemUrl from '../assets/gems/blue.png?url';
import brownGemUrl from '../assets/gems/brown.png?url';
import greenGemUrl from '../assets/gems/green.png?url';
import purpleGemUrl from '../assets/gems/purple.png?url';
import redGemUrl from '../assets/gems/red.png?url';
import yellowGemUrl from '../assets/gems/yellow.png?url';

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
 * set/replaced 新风暴的一次性色系爆发 FX：复用群体受击的各色序列帧
 * （group_hit_*_strip，App.FRAME_FX_URL 已注册、init 时延迟预载）。
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
const STORM_FADE_MS = STORM_FADE_SECONDS * 1000;

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
  /** 队伍列宽（CARD_W），指示器与队伍列同宽 */
  columnWidth: number;
  /** HUD 通道上缘（与回合 HUD 同一水平带） */
  laneTop: number;
  /** HUD 通道高（44） */
  laneHeight: number;
}

/** 单条 storm-change 的演出决策（纯函数，node 环境可测） */
export interface StormChangePlan {
  action: 'show' | 'hide';
  player: PlayerSide;
  color: BaseColor | null;
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
      reason: ev.reason,
      summonSfx: ev.reason === 'set',
      holdSeconds: STORM_BURST_HOLD_SECONDS,
      burstFx: STORM_BURST_FX[ev.color],
    };
  }
  return {
    action: 'hide',
    player: ev.player,
    color: null,
    reason: ev.reason,
    summonSfx: false,
    holdSeconds: STORM_FADE_SECONDS,
    burstFx: null,
  };
}

/** 指示器槽位：按施放方贴其队伍列上沿，与回合 HUD 同处顶部 44px 通道（各占一侧） */
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

const POP_IN_MS = 380;
const PULSE_MS = 2200;
const GEM_SIZE_PX = 34;

/**
 * 指示器 DOM 外壳：每方一个槽位（同一时刻至多一个可见——全场唯一风暴）。
 * 槽位含底衬色系光晕（CSS 径向渐变 + 脉冲）与对应色宝石贴图（轻微脉冲）。
 * 弹入/淡出走 Web Animations API（与 App 的卡片动画同风格）；未挂载时全部安全空转，
 * 使 node 环境的单元测试可实例化。
 */
export class StormIndicator {
  private host: HTMLElement | null = null;
  private layout: StormIndicatorLayout | null = null;
  private slots = new Map<PlayerSide, HTMLDivElement>();
  private visible = new Map<PlayerSide, boolean>();
  private slotAnims = new Map<HTMLDivElement, Animation[]>();
  private active: { side: PlayerSide; color: BaseColor } | null = null;
  private static keyframesInjected = false;

  /** 挂载到战斗容器（wrapper）：按 layout 建左右两个槽位；重复挂载先销毁旧槽位 */
  mount(host: HTMLElement, layout: StormIndicatorLayout): void {
    this.destroy();
    this.host = host;
    this.layout = layout;
    StormIndicator.injectKeyframes();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const slot = this.createSlot(side, stormIndicatorSlot(side, layout));
      this.slots.set(side, slot);
      this.visible.set(side, false);
    }
  }

  /** 显示某方某色的指示器（弹入）。另一侧若仍有旧指示器则先淡出（全场唯一风暴） */
  show(color: BaseColor, player: PlayerSide): void {
    const slot = this.slots.get(player);
    if (!slot) return;
    const other = player === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
    if (this.visible.get(other)) this.hide(other);
    this.cancelSlotAnims(slot);
    slot.style.setProperty('--storm-color', STORM_GLOW_COLOR[color]);
    const gem = slot.querySelector<HTMLImageElement>('img[data-storm-part="gem"]');
    if (gem && gem.getAttribute('src') !== STORM_GEM_URL[color]) gem.src = STORM_GEM_URL[color];
    slot.style.display = 'block';
    this.visible.set(player, true);
    this.active = { side: player, color };
    this.playPopIn(slot);
  }

  /** 淡出某方的指示器（expired / 被顶方撤下）；本就不可见时为空操作 */
  hide(player: PlayerSide): void {
    const slot = this.slots.get(player);
    if (!slot || !this.visible.get(player)) return;
    this.visible.set(player, false);
    if (this.active?.side === player) this.active = null;
    this.cancelSlotAnims(slot);
    this.playFadeOut(slot, () => {
      // 淡出期间若又被 show 拉回（visible 翻回 true），不落隐藏
      if (!this.visible.get(player)) slot.style.display = 'none';
    });
  }

  /** 淡出全部指示器（战斗收尾兜底用） */
  hideAll(): void {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) this.hide(side);
  }

  /** 当前活动指示器的中心（wrapper 布局坐标，与 DOM 覆盖层同一坐标系）；无活动风暴时为 null */
  activeCenter(): { x: number; y: number } | null {
    if (!this.active || !this.layout) return null;
    const slot = stormIndicatorSlot(this.active.side, this.layout);
    return { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
  }

  getActiveSide(): PlayerSide | null {
    return this.active?.side ?? null;
  }

  getActiveColor(): BaseColor | null {
    return this.active?.color ?? null;
  }

  /** 移除槽位与状态（重复挂载 / 卸载时用） */
  destroy(): void {
    for (const slot of this.slots.values()) {
      this.cancelSlotAnims(slot);
      slot.remove();
    }
    this.slots.clear();
    this.visible.clear();
    this.slotAnims.clear();
    this.active = null;
    this.host = null;
    this.layout = null;
  }

  private createSlot(side: PlayerSide, spec: StormIndicatorSlotSpec): HTMLDivElement {
    const slot = document.createElement('div');
    slot.dataset.stormIndicator = side;
    slot.style.cssText = [
      'position:absolute',
      `left:${spec.left}px`, `top:${spec.top}px`,
      `width:${spec.width}px`, `height:${spec.height}px`,
      'z-index:12', 'pointer-events:none', 'display:none',
      '--storm-color:#ffffff',
      'filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))',
    ].join(';');

    // 底衬色系光晕：径向渐变 + 脉冲（零素材，颜色经 --storm-color 切换）
    const glow = document.createElement('span');
    glow.dataset.stormPart = 'glow';
    glow.style.cssText = [
      'position:absolute', 'inset:2px', 'border-radius:12px',
      'background:radial-gradient(ellipse at center,'
      + ' color-mix(in srgb, var(--storm-color) 62%, transparent) 0%,'
      + ' color-mix(in srgb, var(--storm-color) 26%, transparent) 44%,'
      + ' transparent 74%)',
      'filter:blur(5px)',
      `animation:stormIndicatorGlowPulse ${PULSE_MS}ms ease-in-out infinite`,
    ].join(';');

    // 对应色宝石贴图：居中 + 轻微脉冲（同用 --storm-color 做辉光）
    const gem = document.createElement('img');
    gem.dataset.stormPart = 'gem';
    gem.alt = '';
    gem.draggable = false;
    gem.style.cssText = [
      'position:absolute', 'left:50%', 'top:50%',
      `width:${GEM_SIZE_PX}px`, `height:${GEM_SIZE_PX}px`,
      'transform:translate(-50%,-50%)',
      'filter:drop-shadow(0 0 5px var(--storm-color))'
      + ' drop-shadow(0 0 12px color-mix(in srgb, var(--storm-color) 55%, transparent))',
      `animation:stormIndicatorGemPulse ${PULSE_MS}ms ease-in-out infinite`,
    ].join(';');

    slot.append(glow, gem);
    this.host?.appendChild(slot);
    return slot;
  }

  private playPopIn(slot: HTMLDivElement): void {
    if (typeof slot.animate !== 'function') return;
    const anim = slot.animate(
      [
        { opacity: 0, transform: 'scale(.3)' },
        { opacity: 1, transform: 'scale(1.14)', offset: 0.62 },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: POP_IN_MS, easing: 'cubic-bezier(.2,.8,.3,1.18)', fill: 'both' },
    );
    this.trackAnim(slot, anim);
  }

  private playFadeOut(slot: HTMLDivElement, onDone: () => void): void {
    if (typeof slot.animate !== 'function') {
      onDone();
      return;
    }
    const anim = slot.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(.55)' },
      ],
      { duration: STORM_FADE_MS, easing: 'ease-in', fill: 'forwards' },
    );
    this.trackAnim(slot, anim);
    anim.onfinish = () => onDone();
  }

  private trackAnim(slot: HTMLDivElement, anim: Animation): void {
    const list = this.slotAnims.get(slot) ?? [];
    list.push(anim);
    this.slotAnims.set(slot, list);
  }

  private cancelSlotAnims(slot: HTMLDivElement): void {
    for (const anim of this.slotAnims.get(slot) ?? []) {
      try {
        anim.cancel();
      } catch {
        // 已结束的动画无需取消
      }
    }
    this.slotAnims.delete(slot);
  }

  /** 脉冲关键帧只注入一次（与 App.playFrameFX 的动态注入同模式） */
  private static injectKeyframes(): void {
    if (StormIndicator.keyframesInjected || typeof document === 'undefined') return;
    StormIndicator.keyframesInjected = true;
    const style = document.createElement('style');
    style.textContent = ''
      + '@keyframes stormIndicatorGlowPulse{'
      + '0%,100%{opacity:.42;transform:scale(.94)}'
      + '50%{opacity:.95;transform:scale(1.1)}'
      + '}'
      + '@keyframes stormIndicatorGemPulse{'
      + '0%,100%{transform:translate(-50%,-50%) scale(1)}'
      + '50%{transform:translate(-50%,-50%) scale(1.08)}'
      + '}';
    document.head.appendChild(style);
  }
}
