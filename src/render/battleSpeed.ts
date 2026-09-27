/**
 * 战斗演出倍速（1× / 2× / 3×）的单一事实源。
 *
 * 两条并行工作线共用的约定：
 * - 表现层所有时长都按 1× 编写，不要自己除以倍速。gsap 时间线与战斗根节点下的
 *   有限 WAAPI 动画由倍速实现统一换算（接线见 battleSpeedRuntime.ts）。
 * - 确实需要用 setTimeout / requestAnimationFrame 计时的演出，用 scaledMs(ms) 换算。
 *
 * 两层状态：
 * - 选定倍速：倍速按钮循环 1→2→3→1，持久化在 localStorage `battle.speed`，开战时 restoreBattleSpeed() 恢复；
 * - 临时加速：按住空格（setBattleSpeedBoost(true)）期间生效倍速 = max(选定倍速, 3)，松开即回到选定倍速。
 * getBattleSpeed() / scaledMs() / 订阅回调拿到的都是**生效**倍速。
 */
export type BattleSpeed = 1 | 2 | 3;

/** localStorage 键：选定倍速（'1' | '2' | '3'） */
export const BATTLE_SPEED_STORAGE_KEY = 'battle.speed';
/** 按住空格时的临时倍速 */
const BOOST_SPEED: BattleSpeed = 3;

const listeners = new Set<(speed: BattleSpeed) => void>();
let selected: BattleSpeed = 1;
let boosted = false;

function isBattleSpeed(value: unknown): value is BattleSpeed {
  return value === 1 || value === 2 || value === 3;
}

function effective(): BattleSpeed {
  return boosted ? (Math.max(selected, BOOST_SPEED) as BattleSpeed) : selected;
}

/** 选定倍速或生效倍速有变化时通知（相同状态不重复通知）；回调参数为生效倍速 */
function update(nextSelected: BattleSpeed, nextBoosted: boolean): void {
  if (nextSelected === selected && nextBoosted === boosted) return;
  selected = nextSelected;
  boosted = nextBoosted;
  const speed = effective();
  for (const fn of [...listeners]) fn(speed);
}

/** 当前生效倍速（含按住空格的临时加速）。 */
export function getBattleSpeed(): BattleSpeed {
  return effective();
}

/** 玩家选定的倍速（倍速按钮显示的值，不含空格临时加速）。 */
export function getSelectedBattleSpeed(): BattleSpeed {
  return selected;
}

/** 切换选定倍速、持久化并通知订阅者（相同值不重复通知）。 */
export function setBattleSpeed(speed: BattleSpeed): void {
  if (!isBattleSpeed(speed)) return;
  try {
    globalThis.localStorage?.setItem(BATTLE_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // 隐私模式/配额已满：本场仍生效，只是不记住
  }
  update(speed, boosted);
}

/** 倍速按钮：1× → 2× → 3× → 1×，返回新的选定倍速。 */
export function cycleBattleSpeed(): BattleSpeed {
  const next: BattleSpeed = selected === 1 ? 2 : selected === 2 ? 3 : 1;
  setBattleSpeed(next);
  return next;
}

/** 开战时恢复上次选定的倍速（无记录/非法值 → 1×）；同时清掉残留的临时加速。 */
export function restoreBattleSpeed(): BattleSpeed {
  let stored: unknown = null;
  try {
    stored = Number(globalThis.localStorage?.getItem(BATTLE_SPEED_STORAGE_KEY));
  } catch {
    stored = null;
  }
  update(isBattleSpeed(stored) ? stored : 1, false);
  return selected;
}

/** 按住空格的临时加速：true 期间生效倍速 = max(选定倍速, 3)。 */
export function setBattleSpeedBoost(on: boolean): void {
  update(selected, on);
}

/** 订阅生效倍速变化，返回取消订阅函数。 */
export function onBattleSpeedChange(fn: (speed: BattleSpeed) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 把按 1× 编写的毫秒数换算成当前倍速下的实际毫秒数。 */
export function scaledMs(ms: number): number {
  return ms / effective();
}
