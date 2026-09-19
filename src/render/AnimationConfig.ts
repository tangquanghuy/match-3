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

  /** Colored energy traveling from eliminated cells into the actual recipient mana gem. */
  manaFlow: {
    duration: 0.56,
    stagger: 0.05,
  },

  /** 重力下落（需求 19.4, 23.4）：重力加速下坠 + 落地挤压回弹 + 按列错峰 */
  gravity: {
    /** 下落 1 格的基准时长；实际时长 = base × √格数（匀加速运动 t ∝ √s） */
    baseDuration: 0.13,
    /** 加速曲线：越落越快，重量感来自加速度而非拉长时长 */
    ease: 'power2.in',
    columnStagger: 0.015, // 列间错峰延迟
    /**
     * 落地挤压回弹（squash & stretch）：落地瞬间纵向压扁、横向拉宽再弹回，
     * 幅度随下落距离增强。用形变代替位置过冲，避免宝石插进下方宝石。
     */
    land: { squashX: 1.12, squashY: 0.84, duration: 0.16, ease: 'back.out(3)' },
  },

  /** 补充：新宝石按列堆叠在棋盘顶上方，与幸存宝石同时开始下落 */
  refill: { ease: 'power2.in' },

  /** 连锁迭代之间的间隔（需求 23.3） */
  chainGap: 0.12,

  /** Header activation played once for each cascade level after the first match. */
  hudCombo: {
    duration: 720,
    streakCount: 10,
    particleCount: 8,
    /**
     * CS2 击杀风格的彗星尾光：从 HUD 中心向两侧射出带拖尾的光轨，
     * 尾光长度 = base + (连击-2)×perChain，封顶 max。
     * 数值是相对 HUD 半宽的比例（1 = 中心到边缘，>1 溢出边缘）。
     */
    trailBaseScale: 0.52,
    trailPerChain: 0.2,
    trailMaxScale: 1.5,
    /** 尾光滞留时长（ms）：拖尾拉出后缓慢消散，越高越有余韵 */
    trailFade: 520,
  },

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
    knockback: 32, // 沿受击方向后退距离（像素，由调用方带方向）：加大让“被打退”可读
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

  /**
   * 序列帧特效表（scripts/build_fx_strip.ps1 从「特效500个【png】」逐帧拼成的横向 strip）。
   * 每项：strip 内 frames 帧、每帧 frameW×frameH；displayH=实际叠加显示高度（按比例算宽）；duration=播放总时长。
   * 用 App.playFrameFX(name, x, y) 在指定点叠加播放；命名对应 src/assets/fx/<name>_strip.png。
   */
  frameFX: {
    // 0002 水弹命中（21 帧，单帧 164×240）
    water_bolt: { frames: 21, frameW: 164, frameH: 240, displayH: 260, duration: 560 },
    // 0121 火球爆炸（30 帧，单帧 335×240）—— 保留备用（大招级火焰）
    fire_burst: { frames: 30, frameW: 335, frameH: 240, displayH: 420, duration: 760 },
    // 0046 能量星爆/震波（12 帧，单帧 249×224）—— 宝石爆破用，中性冷色，不带火焰感
    energy_burst: { frames: 12, frameW: 249, frameH: 224, displayH: 240, duration: 420 },
    // —— 按颜色分的命中爆点帧动画（每种弹道颜色配一套成熟序列帧）——
    // 红：0128 命中爆闪（14 帧，206×200）
    hit_red: { frames: 14, frameW: 206, frameH: 200, displayH: 220, duration: 360 },
    // 蓝：0002 水弹/蓝剑气命中（21 帧，164×240）
    hit_blue: { frames: 21, frameW: 164, frameH: 240, displayH: 260, duration: 460 },
    // 绿：复用蓝剑气 water_bolt(0002) 的 strip 几何（21 帧 164×240），播放时用负角 hue-rotate 着成翠绿
    hit_green: { frames: 21, frameW: 164, frameH: 240, displayH: 260, duration: 460 },
    // 黄/金：0145 金色斜刺爆（11 帧，104×200）
    hit_gold: { frames: 11, frameW: 104, frameH: 200, displayH: 230, duration: 320 },
    // 紫：0207 紫白爆星（11 帧，256×200）
    hit_purple: { frames: 11, frameW: 256, frameH: 200, displayH: 230, duration: 340 },
    // 棕：0212 灰烟火星爆（12 帧，197×200）
    hit_brown: { frames: 12, frameW: 197, frameH: 200, displayH: 220, duration: 340 },
    // 旧别名（保留兼容，等同红）
    hit_spark: { frames: 14, frameW: 206, frameH: 200, displayH: 210, duration: 360 },
    // Effect 0011 summon sigil (24 sampled frames at 351x240).
    summon_rune: { frames: 24, frameW: 351, frameH: 240, displayH: 250, duration: 760 },
    // Effect 0287: healing / cleanse water-light bloom.
    heal_cleanse: { frames: 28, frameW: 237, frameH: 240, displayH: 290, duration: 840 },
    // Effect 0306: orange shield pillar for armor gain.
    armor_up: { frames: 28, frameW: 217, frameH: 240, displayH: 300, duration: 780 },
    // Effect 0340: green poison ring enlarged to cover the target portrait.
    poison_apply: { frames: 30, frameW: 478, frameH: 240, displayH: 150, duration: 760 },
    // Effect 0417: dedicated water-element single-target impact.
    water_single_hit: { frames: 11, frameW: 238, frameH: 240, displayH: 230, duration: 420 },
    // Effect 0007 main effect_hit track: yellow single-target impact.
    yellow_single_hit: { frames: 16, frameW: 301, frameH: 240, displayH: 220, duration: 480 },
    // Effect 0481: green single-target impact.
    green_single_hit: { frames: 26, frameW: 276, frameH: 240, displayH: 230, duration: 650 },
    // Effect 0353: faint cyan particles drifting away from a defeated card.
    death_drift: { frames: 26, frameW: 315, frameH: 240, displayH: 220, duration: 960 },
    // Effect 0406: color-neutral impact on every splash-chain victim.
    splash_hit: { frames: 16, frameW: 233, frameH: 240, displayH: 235, duration: 520 },
    // Effect 0083: enlarged board-centered release for selected-target splash chain.
    splash_chain_cast: { frames: 32, frameW: 309, frameH: 240, displayH: 260, duration: 900 },
    // Effect 0002 frames 00-01 only: incoming spectral sword; landing frames intentionally excluded.
    splash_chain_sword: { frames: 2, frameW: 188, frameH: 360, displayH: 360, duration: 240 },
    // Effect 0058: ice surge and crystal formation, enlarged after target-anchor correction.
    frozen_apply: { frames: 32, frameW: 356, frameH: 240, displayH: 300, duration: 1450 },
    // Effect 0450: compact looping flame used when burning is applied.
    burning_apply: { frames: 30, frameW: 195, frameH: 240, displayH: 255, duration: 900 },
    // —— 群体攻击（ANIMATION_HANDOFF §19 P0-1）——
    // Effect 0241: board-centered group-attack release stage (played once, no projectile).
    group_cast: { frames: 8, frameW: 243, frameH: 240, displayH: 460, duration: 620 },
    // Per-caster-color large-area group hit, one per living enemy simultaneously.
    // Effect 0475 purple.
    group_hit_purple: { frames: 24, frameW: 423, frameH: 240, displayH: 300, duration: 720 },
    // Effect 0449 red.
    group_hit_red: { frames: 22, frameW: 457, frameH: 240, displayH: 300, duration: 700 },
    // Effect 0344 blue.
    group_hit_blue: { frames: 17, frameW: 246, frameH: 240, displayH: 300, duration: 560 },
    // Effect 0318 yellow.
    group_hit_yellow: { frames: 9, frameW: 356, frameH: 240, displayH: 300, duration: 460 },
    // Effect 0334 brown.
    group_hit_brown: { frames: 17, frameW: 518, frameH: 240, displayH: 300, duration: 560 },
    // Effect 0349 green.
    group_hit_green: { frames: 18, frameW: 481, frameH: 240, displayH: 300, duration: 580 },
    // 额外回合（ANIMATION_HANDOFF §19 P0-2）：Effect 0082 board-centered blessing, played once.
    extra_turn: { frames: 32, frameW: 347, frameH: 240, displayH: 420, duration: 1100 },
    // —— 状态施加短闪（施加瞬间的命中确认，~0.3s；大动画留给 tick / 持续层）——
    // 中毒 0340 前段。
    poison_flash: { frames: 8, frameW: 379, frameH: 200, displayH: 150, duration: 320 },
    // 燃烧 0450 前段。
    burning_flash: { frames: 8, frameW: 162, frameH: 200, displayH: 200, duration: 320 },
    // 冰冻 0058 前段。
    frozen_flash: { frames: 8, frameW: 338, frameH: 240, displayH: 240, duration: 320 },
    // —— 状态持续层（循环挂在角色卡上，直到状态解除；低调半透明，不挡立绘）——
    // 冰冻改用程序化冰封蒙层（见 CharacterCard.setFrozen），不再用序列帧持续层。
    // 眩晕 0478 转圈星星（挂头顶）。
    stun_persist: { frames: 19, frameW: 355, frameH: 200, displayH: 90, duration: 1100 },
  } as Record<string, { frames: number; frameW: number; frameH: number; displayH: number; duration: number }>,

  /** Group-attack pacing (ANIMATION_HANDOFF §19 P0-1): 0241 release then simultaneous color hits. */
  groupAttack: {
    /** ms after the 0241 release starts when every living victim is struck at once. */
    hitDelay: 360,
    /**
     * 0241 释放层朝向修正：strip 素材主体默认朝向的角度（度，0=朝右，顺时针为正；屏幕 y 向下）。
     * 素材原始朝向为「右上」≈ -45°；运行时把它旋转到「施法者中心 → 敌群中心」的实际方向，
     * 箭头/冲击方向即与攻击方向一致，不再固定为素材原始的底部→右上。若观感仍偏，改这个偏置即可。
     */
    castBaseAngleDeg: -45,
    /** 释放层落点：施法者与敌群中心之间的插值（0=施法者处，1=敌群中心）。 */
    castMidpointRatio: 0.5,
  },

  /** Selected-target splash-chain pacing. */
  splashChain: {
    firstImpactDelay: 430,
    castScale: 1.50,
    castYOffsetCells: -0.65,
    swordMinScale: 0.42,
    swordMaxScale: 0.95,
    swordAngleBias: 12,
    /**
     * 0083 释放层朝向修正（与群攻 0241 同规格）：素材主体默认朝向角度（度，0=朝右，屏幕 y 向下）。
     * 运行时旋转到「施法者中心 → 主目标中心」的实际方向；落点取两者之间的中点。
     */
    castBaseAngleDeg: -45,
    castMidpointRatio: 0.5,
  },

  /** Start long/swell single-hit samples just before the projectile reaches its target. */
  singleHitAudioLeadMs: {
    yellow: 120,
    purple: 150,
  },

  /** Defeated cards stay gray through death FX, then fade out before the team reflows. */
  defeat: { cardExitDuration: 240 },

  /**
   * 通用程序化弹道（所有发射类技能共用，仅颜色不同）：从施法者直线飞向目标的能量剑气。
   * 匀速直线、干脆利落；到达后触发程序化命中迸溅（hitBurst）。
   */
  projectile: {
    speed: 3.0, // 飞行速度（像素/ms）：按距离换算时长，远近手感一致
    minDuration: 90, // 最短飞行时长（ms）
    maxDuration: 240, // 最长飞行时长（ms）
    coreR: 6, // 弹头亮核半径（像素）
    bladeLen: 104, // 剑气拖尾长度（像素，朝飞行方向拉长）
    bladeThick: 7, // 剑气最宽处厚度（像素）
  },

  /** 程序化命中迸溅（弹道到达时）：亮核闪 + 数条放射尖线 + 一圈细速环，短促、可变色。 */
  hitBurst: {
    duration: 300, // 总时长（ms）
    rays: 7, // 放射尖线条数
    rayLen: 46, // 尖线最大长度（像素）
    ringR: 52, // 细环最大半径（像素）
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

/** 计算下落时长：匀加速运动 t ∝ √距离，掉得越远平均速度越快 */
export function fallDuration(cells: number): number {
  return AnimConfig.gravity.baseDuration * Math.sqrt(Math.max(1, cells));
}
