/**
 * 动画配置（需求 23.1, 25.1）。
 * 集中管理所有动画时长与缓动，是统一调校手感的唯一入口。
 * 改手感只改这里，不动各处动画代码。
 */
export const AnimConfig = {
  /** 全局速度倍率：>1 加快，用于快进（需求 25.1） */
  globalScale: 1,

  /** 交换（需求 19.1）：跟手缓出 + 轻微过冲 */
  swap: { duration: 0.18, ease: 'power2.inOut' },

  /** 非法交换回弹（需求 19.2）：相向后弹性归位 */
  swapReject: { duration: 0.32, ease: 'back.inOut(2.2)' },

  /** 消除（需求 19.3）：短促有力，靠粒子/闪光撑视觉而非拉长时间 */
  eliminate: { duration: 0.2, scaleUp: 1.3, ease: 'power2.in' },

  /** 消除后、开始下落前的留白 */
  postEliminatePause: 0.02,

  /** 重力下落（需求 19.4, 23.4）：过冲回弹 + 按列错峰。放慢以增重量感 */
  gravity: {
    perCellDuration: 0.115, // 每下落一格的基准时长（放慢）
    maxDuration: 0.62,
    ease: 'back.out(1.35)',
    columnStagger: 0.03, // 列间错峰延迟
  },

  /** 补充：新宝石从顶部上方落入 */
  refill: { ease: 'back.out(1.2)' },

  /** 连锁迭代之间的间隔（需求 23.3） */
  chainGap: 0.12,

  /** 连锁屏幕震动（需求 19.5）：强度随连锁递增，但有节制 */
  shake: {
    baseAmplitude: 2.5, // 像素
    perChain: 1.4,
    maxAmplitude: 12,
    duration: 0.28,
  },

  /**
   * 攻击冲撞手感（吸收炉石式撞击）：冲刺 → 命中卡肉(hit-stop) → 平滑归位。
   * 卡肉是“肉感”的核心：命中瞬间画面与角色短暂凝滞，再爆发后续。
   */
  attack: {
    dashDuration: 100, // 冲刺时长（ms）：短而干脆
    lungeScale: 1.16, // 冲刺到位时的放大（前冲压迫感）
    hitStop: 120, // 命中卡肉停顿（ms）：略长更有撞击的“顿”感
    hitPunchScale: 1.22, // 卡肉瞬间的瞬时放大（定格强调）
    returnDuration: 340, // 归位时长（ms）：缓出、不过冲
  },

  /**
   * 命中整屏震动（吸收参考的“震动”）：作用于整个游戏容器（棋盘+卡片一起晃），
   * 比仅震棋盘更有打击实感。含位移 + 轻微旋转踢动。
   */
  impactShake: {
    amplitude: 9, // 位移幅度（像素）
    rotation: 1.2, // 旋转踢动（度）
    duration: 280, // 时长（ms）
  },

  /**
   * 受击后仰（吸收参考的“卡肉/顶飞”）：被沿受击方向顶退 + 上抬 + 缩小微转，
   * 再用弹性曲线带过冲地弹回原位。
   */
  recoil: {
    knockback: 22, // 沿受击方向后退距离（像素，由调用方带方向）
    lift: 12, // 被顶起的上抬高度（像素）
    squash: 0.94, // 受击瞬间的缩小（挤压感）
    tilt: 3, // 受击微转（度）
    duration: 460, // 总时长（ms）
  },

  /**
   * 命中序列帧特效（DNF 108stairs hit_dodge，6 帧命中爆点）：命中点叠加一团撞击爆闪。
   * 贴图为对齐后的横向 strip（src/assets/fx/hit_108stairs_strip.png）。
   */
  slash: {
    frames: 6,
    frameW: 197, // strip 内每帧像素宽
    frameH: 217, // strip 内每帧像素高
    displayH: 360, // 实际显示高度（像素，按比例算宽）
    duration: 300, // 播放总时长（ms）
  },

  /** 待机微动（需求 19.9）：呼吸/微光 */
  idle: { duration: 1.8, scaleAmp: 0.03, ease: 'sine.inOut' },

  /** 提示：空闲多少秒后高亮一组可行交换 */
  hint: { idleDelay: 4, breathDuration: 0.9, scaleAmp: 0.14 },

  /** 拖拽判定阈值（占格子边长的比例，需求 22.3）。略高以减少误触 */
  dragThreshold: 0.55,

  /**
   * 拖拽跟随（需求 22.1, 22.2）：宝石以固定速度上限跟随手指。
   * 慢拖时完全跟手；快速甩动时以恒定速度匀速追赶，产生等距滞后的阻尼感，
   * 全程匀速、不忽快忽慢。
   */
  dragFollow: {
    /** 速度上限（每秒可移动的格数）。越小滞后越明显，越大越跟手 */
    maxSpeed: 13,
  },
} as const;

/** 计算下落时长（按下落距离，封顶） */
export function fallDuration(cells: number): number {
  const d = AnimConfig.gravity.perCellDuration * Math.max(1, cells);
  return Math.min(d, AnimConfig.gravity.maxDuration);
}
