/**
 * 战斗层本地偏好（UX 阶段 B · 窗口 P）。
 *
 * 两个开关：
 * - `skipCastConfirm`：全局跳过施法确认层（B-4）。**默认关**（= 确认层默认开）——
 *   法力是跨回合积累的资源，误触代价高（`15-battle.md` 重设计提案三条规则之一）。
 *   该偏好保存在当前浏览器，适用于之后所有战斗，并可随时从设置页恢复确认。
 * - `gestureHintShown`：短按/长按手势引导是否已展示过（B-5，一次性）。
 *
 * localStorage 在隐私模式/无头环境可能抛错或缺失，全部读写都做兜底，
 * 失败时退回内存值——战斗层不能因为存储不可用而崩。
 */
const KEY_SKIP_CONFIRM = 'battle.skipCastConfirm';
const KEY_GESTURE_HINT = 'battle.gestureHintShown';

/** localStorage 不可用时的内存兜底（同一页内仍然生效） */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // 隐私模式/沙箱：退回内存
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 写不进去也不影响本页行为
  }
}

/** 是否在之后所有战斗中跳过施法确认层（默认 false = 确认层开着） */
export function skipCastConfirm(): boolean {
  return read(KEY_SKIP_CONFIRM) === '1';
}

/** 设置全局「跳过施法确认」偏好——供确认层与设置页共用 */
export function setSkipCastConfirm(skip: boolean): void {
  write(KEY_SKIP_CONFIRM, skip ? '1' : '0');
}

/** 手势引导是否已展示过 */
export function gestureHintShown(): boolean {
  return read(KEY_GESTURE_HINT) === '1';
}

export function markGestureHintShown(): void {
  write(KEY_GESTURE_HINT, '1');
}

/** 测试与调试用：清空本地偏好 */
export function resetBattlePrefs(): void {
  memory.clear();
  try {
    window.localStorage.removeItem(KEY_SKIP_CONFIRM);
    window.localStorage.removeItem(KEY_GESTURE_HINT);
  } catch {
    // ignore
  }
}
