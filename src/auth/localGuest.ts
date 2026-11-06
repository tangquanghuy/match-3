import { TERMS_VERSION } from '../legal/terms';
import type { StorageLike } from '../meta/state/save';

/** 登录选择与游客存档分开保存，退出只清除登录选择。 */
export const LOCAL_GUEST_SESSION_KEY = 'gems.auth.localGuest';

export function isLocalGuest(): boolean {
  try { return localStorage.getItem(LOCAL_GUEST_SESSION_KEY) !== null; }
  catch { return false; }
}

export function guestTermsAccepted(): boolean {
  try { return localStorage.getItem(LOCAL_GUEST_SESSION_KEY) === String(TERMS_VERSION); }
  catch { return false; }
}

export function loginLocalGuest(): void {
  // 写入失败交给登录页提示，避免以临时内存存档进入游戏。
  localStorage.setItem(LOCAL_GUEST_SESSION_KEY, String(TERMS_VERSION));
}

export function logoutLocalGuest(): void {
  localStorage.removeItem(LOCAL_GUEST_SESSION_KEY);
}

/** 与开发存档、Discord 云端存档隔离；双槽备份也使用相同命名空间。 */
export function localGuestStorage(storage: StorageLike): StorageLike {
  return {
    getItem: key => storage.getItem(`guest.${key}`),
    setItem: (key, value) => storage.setItem(`guest.${key}`, value),
  };
}
