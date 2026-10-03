/**
 * 战斗层本地偏好（UX 阶段 B · 窗口 P）。
 *
 * `skipCastConfirm`（键名沿用 `battle.skipCastConfirm`）：「快速释放」。**默认关**——
 *   关：点战斗卡打开部队详情窗，在窗里按「释放技能」；
 *   开：点此刻可施放的我方角色直接进施法流程，长按才打开详情窗。
 *   详情窗内的复选框与设置页共用这一项，保存在当前浏览器，适用于之后所有战斗。
 *
 * localStorage 在隐私模式/无头环境可能抛错或缺失，全部读写都做兜底，
 * 失败时退回内存值——战斗层不能因为存储不可用而崩。
 */
const KEY_SKIP_CONFIRM = 'battle.skipCastConfirm';
const KEY_AUTO = 'battle.autoBattle';
/** 已废弃的一次性手势引导标记（满法力文字提醒已删除）；只在 reset 时顺手清掉残留值 */
const KEY_LEGACY_GESTURE_HINT = 'battle.gestureHintShown';

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

/** 「快速释放」是否开启（默认 false：点卡先打开详情窗） */
export function skipCastConfirm(): boolean {
  return read(KEY_SKIP_CONFIRM) === '1';
}

/** 设置全局「快速释放」偏好——供详情窗复选框与设置页共用 */
export function setSkipCastConfirm(skip: boolean): void {
  write(KEY_SKIP_CONFIRM, skip ? '1' : '0');
}

/** 全局自动战斗设置（默认关闭），配置页与战斗按钮共用。 */
export function autoBattleEnabled(): boolean {
  return read(KEY_AUTO) === '1';
}

/** 结算、投降和销毁时停止运行不会改变玩家设置。 */
export function setAutoBattleEnabled(on: boolean): void {
  write(KEY_AUTO, on ? '1' : '0');
}

/** 测试与调试用：清空本地偏好 */
export function resetBattlePrefs(): void {
  memory.clear();
  try {
    window.localStorage.removeItem(KEY_SKIP_CONFIRM);
    window.localStorage.removeItem(KEY_AUTO);
    window.localStorage.removeItem(KEY_LEGACY_GESTURE_HINT);
  } catch {
    // ignore
  }
}
