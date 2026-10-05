import { gsap } from 'gsap';
import { getBattleSpeed, onBattleSpeedChange, setBattleSpeedBoost } from './battleSpeed';
import { backgroundRunEnabled } from './battlePrefs';

/**
 * 战斗倍速的全局接线：按 battleSpeed 的生效倍速统一加速**全部**战斗演出，调用点一律按 1× 编写。
 *
 * 1. gsap：全局时间线 timeScale = 倍速。事件流时间线、脱离时间线的补间（下落回弹、粒子、
 *    飘字、弹道……）一并加速。无限循环的补间（棋盘待机呼吸、提示弹跳、状态宝石微动）每帧
 *    按 1/倍速 反向补偿，保持原速。
 * 2. WAAPI / CSS 动画：挂在战斗根节点（battle-wrapper）下的**有限**动画 playbackRate = 基准 × 倍速。
 *    - Element.prototype.animate 打补丁：创建时即生效（首帧就对）；
 *    - 倍速变化时把根节点下正在跑的有限动画一次改到位；
 *    - 倍速 ≠ 1 期间每帧扫一遍，接住 CSS `animation:` 声明的序列帧/描边动画与稍后才挂进根节点的元素。
 *    无限循环（可施放流光、宝石呼吸、状态持续层）不动。
 * 3. 定时器：App.delay / visualDelay 与 AI 思考停顿走 scaledMs（见 App）。
 * 音频不变调；配音只在时间线上点火、不占时长，不会拖住加速后的流程。
 */

const roots = new Set<Element>();
/** 动画的基准播放速率（第一次见到时记录）；已按倍速改过的动画据此换算 */
const baseRate = new WeakMap<Animation, number>();
/** 已判定为无限循环的动画：跳过 */
const infiniteAnimations = new WeakSet<Animation>();
/** gsap 顶层补间/时间线：已检查过是否无限循环 */
const gsapChecked = new WeakSet<gsap.core.Animation>();
/** 无限循环的 gsap 顶层动画 → 其基准 timeScale */
const gsapInfinite = new Map<gsap.core.Animation, number>();

let appliedSpeed = 1;
let unsubscribe: (() => void) | null = null;
let rafId: number | null = null;
let tickerBound = false;
let animatePatched = false;

function inBattle(target: Element | null | undefined): boolean {
  if (!target) return false;
  for (const root of roots) if (root === target || root.contains(target)) return true;
  return false;
}

function isFiniteAnimation(animation: Animation): boolean {
  if (infiniteAnimations.has(animation)) return false;
  const end = animation.effect?.getComputedTiming().endTime;
  if (typeof end === 'number' && Number.isFinite(end)) return true;
  infiniteAnimations.add(animation);
  return false;
}

function applyRate(animation: Animation, speed: number): void {
  if (!isFiniteAnimation(animation)) return;
  let base = baseRate.get(animation);
  if (base === undefined) {
    base = animation.playbackRate;
    baseRate.set(animation, base);
  }
  const next = base * speed;
  if (animation.playbackRate !== next) animation.playbackRate = next;
}

function scanRoots(speed: number): void {
  for (const root of roots) {
    for (const animation of root.getAnimations({ subtree: true })) {
      if (animation.playState === 'finished' || animation.playState === 'idle') continue;
      applyRate(animation, speed);
    }
  }
}

/** 新建的 WAAPI 动画在创建当下就套上倍速（元素已挂进战斗根节点时） */
function patchElementAnimate(): void {
  if (animatePatched || typeof Element === 'undefined') return;
  animatePatched = true;
  const native = Element.prototype.animate;
  Element.prototype.animate = function animateWithBattleSpeed(
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation {
    const animation = native.call(this, keyframes, options);
    if (roots.size > 0 && appliedSpeed !== 1 && inBattle(this)) applyRate(animation, appliedSpeed);
    return animation;
  };
}

function isInfiniteGsap(animation: gsap.core.Animation): boolean {
  return animation.repeat() === -1 || !Number.isFinite(animation.totalDuration()) || animation.totalDuration() > 1e8;
}

/** gsap 无限循环（待机呼吸/提示弹跳/状态宝石微动）按 1/倍速 补偿，维持原速 */
function compensateGsapLoops(speed: number): void {
  // GSAP timeScale() can reattach a killed tween to its former parent. Remove
  // detached entries BEFORE changing rates, not on a later animation frame.
  pruneGsapLoops();
  for (const child of gsap.globalTimeline.getChildren(false, true, true)) {
    if (gsapChecked.has(child)) continue;
    gsapChecked.add(child);
    if (isInfiniteGsap(child)) gsapInfinite.set(child, child.timeScale());
  }
  for (const [animation, base] of gsapInfinite) {
    if (!animation.isActive() && animation.progress() >= 1) {
      gsapInfinite.delete(animation);
      continue;
    }
    const next = base / speed;
    if (animation.timeScale() !== next) animation.timeScale(next);
  }
}

function pruneGsapLoops(): void {
  for (const animation of gsapInfinite.keys()) {
    if (animation.parent !== gsap.globalTimeline) gsapInfinite.delete(animation);
  }
}

/** Hidden tabs may suspend CSS/WAAPI clocks even while timer-driven GSAP keeps running.
 * Finish only finite, active visuals so their `finished` waits cannot stall a turn.
 * Leave paused and infinite animations alone (e.g. settings and idle effects). */
function finishHiddenVisuals(): void {
  for (const root of roots) {
    for (const animation of root.getAnimations({ subtree: true })) {
      if (animation.playState !== 'running' && !animation.pending) continue;
      if (!isFiniteAnimation(animation)) continue;
      try { animation.finish(); } catch {
        // An animation still resolving its timing can be retried on the next tick.
      }
    }
  }
}

const onTick = (): void => {
  if (typeof document !== 'undefined' && document.hidden && backgroundRunEnabled()) finishHiddenVisuals();
  if (appliedSpeed !== 1) compensateGsapLoops(appliedSpeed);
};

function frameLoop(): void {
  rafId = null;
  if (appliedSpeed === 1 || roots.size === 0) return;
  scanRoots(appliedSpeed);
  pruneGsapLoops();
  rafId = requestAnimationFrame(frameLoop);
}

function applySpeed(speed: number): void {
  appliedSpeed = speed;
  gsap.globalTimeline.timeScale(speed);
  compensateGsapLoops(speed);
  scanRoots(speed);
  if (speed !== 1 && rafId === null && typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(frameLoop);
  }
}

/**
 * 把一个战斗根节点接入倍速（App.init 挂 battle-wrapper 时调用）。
 * 返回解绑函数：该根节点下的有限动画恢复原速；最后一个根节点解绑时 gsap 全局时间线回到 1×、
 * 清掉空格临时加速。
 */
export function attachBattleSpeed(root: Element): () => void {
  patchElementAnimate();
  roots.add(root);
  if (!tickerBound) {
    tickerBound = true;
    gsap.ticker.add(onTick);
  }
  unsubscribe ??= onBattleSpeedChange((speed) => applySpeed(speed));
  applySpeed(getBattleSpeed());
  return () => {
    if (!roots.has(root)) return;
    // 该根节点下的有限动画恢复原速（节点通常随后整体移除）
    for (const animation of root.getAnimations({ subtree: true })) {
      const base = baseRate.get(animation);
      if (base !== undefined && animation.playState !== 'finished') animation.playbackRate = base;
    }
    roots.delete(root);
    if (roots.size > 0) return;
    setBattleSpeedBoost(false);
    unsubscribe?.();
    unsubscribe = null;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    if (tickerBound) gsap.ticker.remove(onTick);
    tickerBound = false;
    // 离开战斗：只恢复仍存活的循环；已 kill 的旧场景补间不得复活。
    pruneGsapLoops();
    for (const [animation, base] of gsapInfinite) animation.timeScale(base);
    gsapInfinite.clear();
    appliedSpeed = 1;
    gsap.globalTimeline.timeScale(1);
  };
}
