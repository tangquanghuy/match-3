/**
 * 不随存档导入/重置迁移的本机玩家偏好。
 *
 * 音频和动效会同时被 meta 页面与战斗层消费，因此不能放在任一页面的私有状态里。
 * localStorage 不可用时退回内存值，设置页仍可在当前会话内正常工作。
 */
export interface PlayerPreferences {
  masterEnabled: boolean;
  masterVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  narrationEnabled: boolean;
  narrationVolume: number;
  soundEffectsEnabled: boolean;
  soundEffectsVolume: number;
  reducedMotion: boolean;
}

export const PLAYER_PREFERENCES_KEY = 'gems.player.preferences.v1';

export const DEFAULT_PLAYER_PREFERENCES: Readonly<PlayerPreferences> = {
  masterEnabled: true,
  masterVolume: 0.8,
  musicEnabled: true,
  musicVolume: 0.5,
  narrationEnabled: true,
  narrationVolume: 0.7,
  soundEffectsEnabled: true,
  soundEffectsVolume: 0.7,
  reducedMotion: false,
};

const listeners = new Set<(preferences: PlayerPreferences) => void>();
export function subscribePlayerPreferences(listener: (preferences: PlayerPreferences) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notifyPreferences(): void {
  for (const listener of listeners) listener({ ...memoryPreferences });
}

let memoryPreferences: PlayerPreferences = { ...DEFAULT_PLAYER_PREFERENCES };

const clampVolume = (value: unknown, fallback = DEFAULT_PLAYER_PREFERENCES.soundEffectsVolume): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (value == null || !Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(1, Math.max(0, numeric)) * 100) / 100;
};

function normalize(raw: unknown): PlayerPreferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<PlayerPreferences> : {};
  return {
    masterEnabled: typeof value.masterEnabled === 'boolean' ? value.masterEnabled : true,
    masterVolume: clampVolume(value.masterVolume, 0.8),
    musicEnabled: typeof value.musicEnabled === 'boolean' ? value.musicEnabled : true,
    musicVolume: clampVolume(value.musicVolume, 0.5),
    narrationEnabled: typeof value.narrationEnabled === 'boolean' ? value.narrationEnabled : true,
    narrationVolume: clampVolume(value.narrationVolume, 0.7),
    soundEffectsEnabled: typeof value.soundEffectsEnabled === 'boolean'
      ? value.soundEffectsEnabled
      : DEFAULT_PLAYER_PREFERENCES.soundEffectsEnabled,
    soundEffectsVolume: clampVolume(value.soundEffectsVolume),
    reducedMotion: typeof value.reducedMotion === 'boolean'
      ? value.reducedMotion
      : DEFAULT_PLAYER_PREFERENCES.reducedMotion,
  };
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getPlayerPreferences(): PlayerPreferences {
  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(PLAYER_PREFERENCES_KEY);
      if (raw !== null) {
        try {
          memoryPreferences = normalize(JSON.parse(raw));
        } catch {
          memoryPreferences = { ...DEFAULT_PLAYER_PREFERENCES };
        }
        return { ...memoryPreferences };
      }
    } catch {
      // 存储被浏览器拦截时保留当前会话内的值。
    }
  }
  return { ...memoryPreferences };
}

export function prefersReducedMotion(): boolean {
  if (getPlayerPreferences().reducedMotion) return true;
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 把偏好同步到 DOM；战斗层与 meta 层共用这个根属性。 */
export function applyPlayerPreferences(): PlayerPreferences {
  const preferences = getPlayerPreferences();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.motion = prefersReducedMotion() ? 'reduced' : 'full';
    document.documentElement.dataset.soundEffects = preferences.soundEffectsEnabled ? 'on' : 'off';
  }
  return preferences;
}

export function setPlayerPreferences(patch: Partial<PlayerPreferences>): PlayerPreferences {
  memoryPreferences = normalize({ ...getPlayerPreferences(), ...patch });
  const store = storage();
  if (store) {
    try {
      store.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(memoryPreferences));
    } catch {
      // 当前会话仍由 memoryPreferences 生效。
    }
  }
  applyPlayerPreferences();
  notifyPreferences();
  return { ...memoryPreferences };
}

/** 测试用：恢复默认值并清掉持久化键。 */
export function resetPlayerPreferences(): void {
  memoryPreferences = { ...DEFAULT_PLAYER_PREFERENCES };
  const store = storage();
  if (store) {
    try {
      store.removeItem(PLAYER_PREFERENCES_KEY);
    } catch {
      // ignore
    }
  }
  applyPlayerPreferences();
  notifyPreferences();
}
