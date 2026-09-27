import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bgmManifest from '../../src/assets/audio/bgm/manifest.json';
import { BackgroundMusic } from '../../src/audio/BackgroundMusic';
import { MUSIC_TRACKS, musicForBattle, musicForScreen } from '../../src/audio/MusicCatalog';
import type { CombatantSnapshot } from '../../src/session/contract';
import { resetPlayerPreferences, setPlayerPreferences } from '../../src/preferences/playerPreferences';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  paused = true;
  loop = false;
  preload = '';
  volume = 1;
  duration = 90;
  readyState = 4;
  seeking = false;
  currentTime = 0;
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; });
  removeAttribute = vi.fn();
  load = vi.fn();
  constructor(public src: string) { super(); FakeAudio.instances.push(this); }
}

let music: BackgroundMusic;
const advance = async (ms = 2400) => { await vi.advanceTimersByTimeAsync(ms); };
const unlock = () => window.dispatchEvent(new Event('pointerdown'));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const values = new Map<string, string>();
  const session = new Map<string, string>();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }, sessionStorage: {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
  } }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, documentElement: { dataset: {} } }));
  vi.stubGlobal('Audio', FakeAudio);
  FakeAudio.instances = [];
  resetPlayerPreferences();
});
afterEach(() => { music?.dispose(); resetPlayerPreferences(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('background music', () => {
  it('ships the louder source masters with consistent loudness and peak headroom', () => {
    expect(bgmManifest.targetLUFS).toBe(-17);
    expect(bgmManifest.tracks).toHaveLength(11);
    for (const track of bgmManifest.tracks) {
      expect(track.outputLUFS).toBeGreaterThan(-18);
      expect(track.outputLUFS).toBeLessThan(-16);
      expect(track.truePeakDBTP).toBeLessThan(-2);
    }
  });

  it('bundles eleven approved tracks but makes no requests before a gesture', () => {
    expect(Object.values(MUSIC_TRACKS).flat()).toHaveLength(11);
    music = new BackgroundMusic(); music.start();
    expect(FakeAudio.instances).toHaveLength(0);
    music.dispose();
    music = new BackgroundMusic({}); music.start(); unlock();
    music.setScene('battle');
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('uses the louder approved production mix without overwriting player sliders', async () => {
    music = new BackgroundMusic(); music.start(); unlock(); await advance();
    expect(FakeAudio.instances[0].volume).toBeCloseTo(0.8 * 0.5 * 0.825);
    music.setScene('battle'); await advance();
    expect(FakeAudio.instances.at(-1)!.volume).toBeCloseTo(0.8 * 0.5 * 0.975);
    music.setDucking('narration', true); await advance(200);
    expect(FakeAudio.instances.at(-1)!.volume).toBeCloseTo(0.8 * 0.5 * 0.975 * 0.28);
  });

  it('fades in conservatively, applies independent controls, and crossfades scenes', async () => {
    music = new BackgroundMusic({ meta: 'meta.mp3', battle: 'battle.mp3' }); music.start(); unlock();
    const first = FakeAudio.instances[0];
    expect(first.loop).toBe(false); // Runtime overlapping loop, not a hard file wrap.
    expect(first.volume).toBe(0);
    await advance();
    expect(first.volume).toBeCloseTo(0.4 * 0.55);
    setPlayerPreferences({ masterVolume: 0.5, musicVolume: 0.6, soundEffectsEnabled: false, narrationEnabled: false });
    expect(first.volume).toBeCloseTo(0.3 * 0.55);
    music.setScene('battle');
    const battle = FakeAudio.instances[1];
    expect(first.paused).toBe(false);
    expect(battle.volume).toBe(0);
    await advance(1100);
    expect(first.volume).toBeGreaterThan(0);
    expect(battle.volume).toBeGreaterThan(0);
    expect(first.volume + battle.volume).toBeLessThanOrEqual(0.3 * 0.55 + 0.001);
    await advance();
    expect(first.paused).toBe(true);
    expect(first.removeAttribute).toHaveBeenCalledWith('src');
    expect(battle.volume).toBeCloseTo(0.3 * 0.55);
    music.setTracks({ meta: 'meta.mp3' });
    await advance();
    expect(battle.paused).toBe(true);
  });

  it('does not restart a scene on settings changes or refreshes', async () => {
    music = new BackgroundMusic({ meta: 'meta.mp3' }); music.start(); unlock();
    await advance();
    const audio = FakeAudio.instances[0]; audio.currentTime = 32;
    music.setScene('meta'); music.setAmbientScene('meta');
    setPlayerPreferences({ musicVolume: 0.25 });
    await advance();
    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio.currentTime).toBe(32);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('ducks actual narration quickly and releases slowly, retaining result/settings attenuation', async () => {
    music = new BackgroundMusic({ meta: 'meta.mp3' }); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; const normal = audio.volume;
    music.setDucking('narration', true); await advance(200);
    expect(audio.volume).toBeCloseTo(normal * 0.28);
    music.setDucking('settings', true); music.setDucking('result', true);
    music.setDucking('narration', false); await advance(50);
    expect(audio.volume).toBeLessThan(normal * 0.45);
    await advance(1600);
    expect(audio.volume).toBe(0);
    expect(audio.paused).toBe(true);
    music.setDucking('result', false); music.setDucking('settings', false); await advance(2400);
    expect(audio.volume).toBeCloseTo(normal);
  });

  it('pauses hidden/muted music immediately and resumes the same position softly', async () => {
    music = new BackgroundMusic({ meta: 'meta.mp3' }); music.start(); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; audio.currentTime = 22;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(audio.paused).toBe(true); expect(audio.volume).toBe(0);
    Object.defineProperty(document, 'hidden', { value: false });
    document.dispatchEvent(new Event('visibilitychange')); await advance();
    expect(audio.paused).toBe(false); expect(audio.currentTime).toBe(22);
    setPlayerPreferences({ masterEnabled: false }); expect(audio.paused).toBe(true);
    setPlayerPreferences({ masterEnabled: true }); await advance(); expect(audio.paused).toBe(false);
    setPlayerPreferences({ musicEnabled: false }); expect(audio.paused).toBe(true);
    music.dispose(); setPlayerPreferences({ musicEnabled: true }); unlock(); await advance();
    expect(audio.paused).toBe(true); expect(FakeAudio.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores a suspended tab even if the browser resets media time while hidden', async () => {
    music = new BackgroundMusic({ meta: 'a.mp3' }); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; audio.currentTime = 37;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    audio.currentTime = 0;
    window.dispatchEvent(new Event('pagehide'));
    setPlayerPreferences({ musicVolume: 0.6 });
    audio.dispatchEvent(new Event('timeupdate'));
    Object.defineProperty(document, 'hidden', { value: false });
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    await advance();
    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio.currentTime).toBe(37);
    expect(audio.paused).toBe(false);
  });

  it('draws a fresh non-repeating track on real scene reentry, not on page navigation', async () => {
    music = new BackgroundMusic({ meta: [{ url: 'a.mp3', gain: 0.5 }, { url: 'b.mp3', gain: 0.5 }], battle: 'battle.mp3' });
    music.start(); unlock(); await advance();
    FakeAudio.instances[0].currentTime = 36;
    music.beginBattle('battle'); await advance();
    music.endBattle(); await advance(3200);
    expect(FakeAudio.instances.at(-1)!.src).toBe('b.mp3');
    expect(FakeAudio.instances.at(-1)!.currentTime).toBe(0);
    // Natural completion draws again; even a shuffle-bag boundary must not repeat.
    FakeAudio.instances.at(-1)!.currentTime = 88;
    FakeAudio.instances.at(-1)!.dispatchEvent(new Event('timeupdate')); await advance();
    expect(FakeAudio.instances.at(-1)!.src).toBe('a.mp3');
    expect(FakeAudio.instances.at(-1)!.currentTime).toBe(0);
  });

  it('restores a battle document checkpoint before gesture unlock without rerolling', async () => {
    const tracks = { battle: [{ url: 'a.mp3', gain: 0.5 }, { url: 'b.mp3', gain: 0.5 }] };
    music = new BackgroundMusic(tracks); music.start(); music.beginBattle('battle'); unlock(); await advance();
    const previous = FakeAudio.instances.at(-1)!; previous.currentTime = 38;
    window.dispatchEvent(new Event('pagehide')); music.dispose();
    music = new BackgroundMusic(tracks); music.start(); music.beginBattle('battle'); unlock(); await advance();
    expect(FakeAudio.instances.at(-1)!.src).toBe(previous.src);
    expect(FakeAudio.instances.at(-1)!.currentTime).toBe(38);
  });

  it('persists a per-tab checkpoint across document recreation and waits for metadata to seek', async () => {
    const tracks = { meta: 'a.mp3' };
    music = new BackgroundMusic(tracks); music.start(); unlock(); await advance();
    FakeAudio.instances[0].currentTime = 46;
    window.dispatchEvent(new Event('pagehide')); music.dispose();
    music = new BackgroundMusic(tracks); music.start();
    expect(FakeAudio.instances).toHaveLength(1);
    unlock();
    const audio = FakeAudio.instances[1];
    // Simulate a media pipeline losing its loaded metadata before resume.
    audio.readyState = 0;
    setPlayerPreferences({ musicEnabled: false });
    audio.currentTime = 0;
    setPlayerPreferences({ musicEnabled: true });
    await advance();
    expect(audio.currentTime).toBe(0);
    audio.readyState = 4; audio.dispatchEvent(new Event('loadedmetadata')); await advance();
    expect(audio.currentTime).toBe(46);
    expect(audio.paused).toBe(false);
  });

  it('retries a pause-interrupted play promise after a quick hide/show, without another click', async () => {
    music = new BackgroundMusic({ meta: 'a.mp3' }); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; audio.paused = true; audio.currentTime = 23;
    let reject!: (error: Error) => void;
    audio.play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    unlock();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    reject(Object.assign(new Error('interrupted by pause'), { name: 'AbortError' }));
    await advance();
    expect(audio.paused).toBe(false); expect(audio.currentTime).toBe(23);
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it('ignores removed track checkpoints and works without session storage', async () => {
    window.sessionStorage.setItem('gems.music.progress.v1', JSON.stringify({ meta: { url: 'old.mp3', time: 40 } }));
    music = new BackgroundMusic({ meta: 'new.mp3' }); music.start(); unlock(); await advance();
    expect(FakeAudio.instances[0].src).toBe('new.mp3');
    expect(FakeAudio.instances[0].currentTime).toBe(0);
    Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('disabled'); }, configurable: true });
    FakeAudio.instances[0].currentTime = 15;
    setPlayerPreferences({ musicEnabled: false });
    FakeAudio.instances[0].currentTime = 0;
    setPlayerPreferences({ musicEnabled: true }); await advance();
    expect(FakeAudio.instances.at(-1)!.currentTime).toBe(15);
  });

  it('retries rejected autoplay only on a new gesture', async () => {
    music = new BackgroundMusic({ meta: 'meta.mp3' }); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; audio.paused = true;
    audio.play.mockImplementationOnce(() => Promise.reject(new Error('autoplay blocked')));
    unlock(); await advance(5000);
    expect(audio.play).toHaveBeenCalledTimes(2);
    unlock(); await advance();
    expect(audio.paused).toBe(false); expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it('overlaps track endings and alternates variants without unbounded audio instances', async () => {
    music = new BackgroundMusic({ meta: [{ url: 'a.mp3', gain: 0.5 }, { url: 'b.mp3', gain: 0.5 }] });
    music.start(); unlock(); await advance();
    const first = FakeAudio.instances[0]; first.currentTime = 87.5;
    first.dispatchEvent(new Event('timeupdate')); first.dispatchEvent(new Event('timeupdate'));
    expect(FakeAudio.instances).toHaveLength(2);
    const second = FakeAudio.instances[1]; expect(second.src).toBe('b.mp3');
    await advance(); expect(first.paused).toBe(true);
    second.currentTime = 90; second.dispatchEvent(new Event('ended')); await advance();
    expect(FakeAudio.instances[2].src).toBe('a.mp3');
    expect(FakeAudio.instances.filter(audio => !audio.paused)).toHaveLength(1);
  });

  it('does not start a loop while hidden, and releases failed files without a retry storm', async () => {
    music = new BackgroundMusic({ meta: 'a.mp3' }); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0];
    setPlayerPreferences({ musicEnabled: false });
    audio.dispatchEvent(new Event('ended')); expect(FakeAudio.instances).toHaveLength(1);
    setPlayerPreferences({ musicEnabled: true }); await advance();
    audio.dispatchEvent(new Event('error')); await advance(10000);
    expect(audio.paused).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });

  it('debounces navigation and protects battle music from background routes', async () => {
    music = new BackgroundMusic({ meta: 'meta.mp3', elite: 'elite.mp3', boss: 'boss.mp3' });
    music.start(); unlock(); await advance();
    music.setAmbientScene('elite'); await advance(100); music.setAmbientScene('meta'); await advance(600);
    expect(FakeAudio.instances).toHaveLength(1);
    music.beginBattle('boss'); await advance();
    music.setAmbientScene('meta'); await advance(); expect(music.getScene()).toBe('boss');
    music.setDucking('result', true); music.endBattle(); await advance(3200);
    expect(music.getScene()).toBe('meta');
    expect(FakeAudio.instances.at(-1)!.volume).toBeCloseTo(0.22);
  });

  it('keeps the exact audio element and position through fast and slow menu navigation', async () => {
    music = new BackgroundMusic(); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; audio.currentTime = 29;
    for (const delay of [50, 1000]) {
      for (const route of ['team', 'quest', 'events', 'shop', 'hero', 'map', 'settings']) {
        const scene = musicForScreen(route);
        if (scene) music.setAmbientScene(scene);
        await advance(delay);
        expect(FakeAudio.instances).toHaveLength(1);
        expect(audio.currentTime).toBe(29);
        expect(audio.paused).toBe(false);
      }
    }
  });

  it('shuffles all five ambient tracks per bag without repeating at bag boundaries', async () => {
    const pool = Array.from({ length: 5 }, (_, i) => ({ url: `${i}.mp3`, gain: 0.5 }));
    const rng = vi.fn(() => 0.63);
    music = new BackgroundMusic({ meta: pool }, rng); music.start(); unlock(); await advance();
    const played: string[] = [];
    for (let i = 0; i < 15; i++) {
      const audio = FakeAudio.instances.at(-1)!;
      played.push(audio.src);
      audio.dispatchEvent(new Event('ended')); await advance();
      expect(FakeAudio.instances.filter(item => !item.paused)).toHaveLength(1);
    }
    for (let i = 0; i < 15; i += 5) expect(new Set(played.slice(i, i + 5)).size).toBe(5);
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(played[0]).toBe('3.mp3'); // Injected RNG chooses the first track, not catalog order.
    expect(rng).toHaveBeenCalled();
  });

  it('keeps music across consecutive same-tier battles and cancels the ambient interlude', async () => {
    music = new BackgroundMusic(); music.start(); unlock(); await advance();
    music.beginBattle('battle'); await advance();
    const battle = FakeAudio.instances.at(-1)!; battle.currentTime = 28;
    music.setDucking('result', true); music.endBattle(); await advance(300);
    music.setAmbientScene('meta'); music.beginBattle('battle'); await advance(3200);
    expect(FakeAudio.instances.at(-1)).toBe(battle);
    expect(battle.currentTime).toBe(28);
    expect(music.getScene()).toBe('battle');
    music.endBattle(); await advance(3200);
    expect(music.getScene()).toBe('meta');
    music.beginBattle('battle'); await advance();
    expect(FakeAudio.instances.at(-1)!.src).not.toBe(battle.src);
    expect(FakeAudio.instances.at(-1)!.currentTime).toBe(0);
  });

  it('keeps battle settlement and the result route silent until leaving results', async () => {
    music = new BackgroundMusic(); music.start(); unlock(); await advance();
    music.beginBattle('boss'); await advance();
    const battle = FakeAudio.instances.at(-1)!;
    music.setDucking('result', true);
    expect(battle.paused).toBe(true); expect(battle.volume).toBe(0);
    music.endBattle(true); await advance(10000);
    expect(music.getScene()).toBe('boss');
    expect(FakeAudio.instances.at(-1)).toBe(battle);
    music.setDucking('narration', false); unlock(); await advance();
    expect(battle.paused).toBe(true); expect(battle.volume).toBe(0);
    music.finishResult(); await advance(3000);
    expect(music.getScene()).toBe('meta');
    expect(FakeAudio.instances.at(-1)!.volume).toBeGreaterThan(0);
    expect(battle.paused).toBe(true);
  });

  it('cancels late play resolutions and all timers on dispose', async () => {
    music = new BackgroundMusic({ meta: 'a.mp3', battle: 'b.mp3' }); music.start(); unlock(); await advance();
    const audio = FakeAudio.instances[0]; audio.paused = true;
    let resolve!: () => void;
    audio.play.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    unlock(); music.setAmbientScene('battle'); music.dispose(); resolve(); await advance();
    expect(audio.paused).toBe(true); expect(vi.getTimerCount()).toBe(0);
    expect(FakeAudio.instances).toHaveLength(1);
  });
});

describe('music scene policy', () => {
  const enemy = (tier?: string, eventTarget?: 'boss' | 'tower'): CombatantSnapshot => ({
    externalId: 'enemy', name: 'Enemy', stats: { hp: 10, armor: 0, attack: 2, magic: 1 },
    manaColors: [], manaCost: 0, tier, eventTarget,
  });
  it('maps every ordinary page to one ambient state, retaining settings/result music', () => {
    for (const route of ['map', 'quest', 'hunt', 'team', 'hero', 'weapons', 'events', 'shop', 'arena', 'invasion', 'chests']) {
      expect(musicForScreen(route)).toBe('meta');
    }
    expect(musicForScreen('settings')).toBeNull();
    expect(musicForScreen('result')).toBeNull();
    expect(Object.keys(MUSIC_TRACKS)).toEqual(['meta', 'battle', 'elite', 'boss']);
    expect(MUSIC_TRACKS.meta).toHaveLength(5);
    expect(new Set(Object.values(MUSIC_TRACKS).flat().map(track => typeof track === 'string' ? track : track.url)).size).toBe(11);
  });
  it('uses enemy tiers and explicit event targets, with boss taking precedence over PvP', () => {
    expect(musicForBattle({ enemyTeam: [enemy()] })).toBe('battle');
    expect(musicForBattle({ enemyTeam: [enemy('elite')] })).toBe('elite');
    expect(musicForBattle({ enemyTeam: [enemy('\u7cbe\u82f1')] })).toBe('elite');
    expect(musicForBattle({ enemyTeam: [enemy()], mode: 'pvp' })).toBe('elite');
    expect(musicForBattle({ enemyTeam: [enemy('boss')], mode: 'pvp' })).toBe('boss');
    expect(musicForBattle({ enemyTeam: [enemy('\u9996\u9886')] })).toBe('boss');
    expect(musicForBattle({ enemyTeam: [enemy('legendary')] })).toBe('boss');
    expect(musicForBattle({ enemyTeam: [enemy(undefined, 'boss')] })).toBe('boss');
    expect(musicForBattle({ enemyTeam: [enemy(undefined, 'tower')] })).toBe('elite');
  });
});
