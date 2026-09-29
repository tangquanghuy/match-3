import type { BattleRequest } from '../session/contract';

export type MusicScene = 'meta' | 'battle' | 'elite' | 'boss';
export interface MusicTrack { url: string; gain: number }
export type MusicCatalog = Partial<Record<MusicScene, string | readonly MusicTrack[]>>;

// Normalized to -17 LUFS offline (+6 dB over the initial assets).
// Scene gains retain the previous 1.5x adjustment after in-game feedback.
// Keep saved sliders and narration ducking independent of this mix adjustment.
export const MUSIC_TRACKS: MusicCatalog = {
  meta: [
    { url: new URL('@assets/audio/bgm/menu-01.mp3', import.meta.url).href, gain: 0.825 },
    { url: new URL('@assets/audio/bgm/menu-02.mp3', import.meta.url).href, gain: 0.825 },
    { url: new URL('@assets/audio/bgm/map.mp3', import.meta.url).href, gain: 0.75 },
    { url: new URL('@assets/audio/bgm/preparation.mp3', import.meta.url).href, gain: 0.75 },
    { url: new URL('@assets/audio/bgm/events.mp3', import.meta.url).href, gain: 0.72 },
  ],
  battle: [
    { url: new URL('@assets/audio/bgm/battle-01.mp3', import.meta.url).href, gain: 0.975 },
    { url: new URL('@assets/audio/bgm/battle-02.mp3', import.meta.url).href, gain: 0.975 },
  ],
  elite: [
    { url: new URL('@assets/audio/bgm/elite-01.mp3', import.meta.url).href, gain: 0.9 },
    { url: new URL('@assets/audio/bgm/elite-02.mp3', import.meta.url).href, gain: 0.9 },
  ],
  boss: [
    { url: new URL('@assets/audio/bgm/boss-01.mp3', import.meta.url).href, gain: 0.825 },
    { url: new URL('@assets/audio/bgm/boss-02.mp3', import.meta.url).href, gain: 0.825 },
  ],
};

/** All ordinary routes share one continuous bed; overlays retain the current state. */
export function musicForScreen(name: string): MusicScene | null {
  if (name === 'settings' || name === 'result') return null;
  return 'meta';
}

/** Select once at entry, never on damage/combos/summons or enemy deaths. */
export function musicForBattle(request: Pick<BattleRequest, 'enemyTeam' | 'mode'>): MusicScene {
  const tiers = request.enemyTeam.map(enemy => String(enemy.tier ?? '').trim().toLowerCase());
  if (request.enemyTeam.some(enemy => enemy.eventTarget === 'boss')
    || tiers.some(tier => ['boss', 'lord', 'legendary', '\u9996\u9886', '\u9886\u4e3b', '\u4f20\u5947'].includes(tier))) return 'boss';
  if (request.mode === 'pvp' || request.enemyTeam.some(enemy => enemy.eventTarget === 'tower')
    || tiers.some(tier => ['elite', '\u7cbe\u82f1'].includes(tier))) return 'elite';
  return 'battle';
}
