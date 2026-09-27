import { getPlayerPreferences, subscribePlayerPreferences } from '../preferences/playerPreferences';
import { MUSIC_TRACKS, type MusicCatalog, type MusicScene, type MusicTrack } from './MusicCatalog';
export { MUSIC_TRACKS, type MusicScene } from './MusicCatalog';

type DuckReason = 'narration' | 'settings' | 'result';
const DUCK_GAIN: Record<DuckReason, number> = { narration: 0.28, settings: 0.55, result: 0 };
const TICK_MS = 50;
const CROSSFADE_MS = 2200;
const LOOP_OVERLAP_SECONDS = 3;
const PROGRESS_KEY = 'gems.music.progress.v1';
interface Bookmark { url: string; time: number }
interface Voice {
  audio: HTMLAudioElement;
  scene: MusicScene;
  resumeTime: number | null;
  track: MusicTrack;
  envelope: number;
  outgoing: boolean;
  pending: boolean;
  interrupted: boolean;
  ready: boolean;
  failed: boolean;
  dispose: () => void;
}

/** Two streamed voices at most, lazy loading, bounded fades, no gameplay RNG consumption. */
export class BackgroundMusic {
  private voices: Voice[] = [];
  private current: Voice | null = null;
  private scene: MusicScene = 'meta';
  private ambientScene: MusicScene = 'meta';
  private battleActive = false;
  private unlocked = false;
  private started = false;
  private unsubscribe: (() => void) | null = null;
  private lifecycle: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private routeTimer: ReturnType<typeof setTimeout> | null = null;
  private bags = new Map<MusicScene, MusicTrack[]>();
  private lastTracks = new Map<MusicScene, string>();
  private ducks = new Set<DuckReason>();
  private duckGain = 1;
  private pageSuspended = false;
  private bookmarks = new Map<MusicScene, Bookmark>();
  private lastSave = 0;

  constructor(private tracks: MusicCatalog = MUSIC_TRACKS, private readonly random: () => number = Math.random) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.readProgress();
    this.lifecycle = new AbortController();
    const options = { signal: this.lifecycle.signal };
    const unlock = () => { this.unlocked = true; this.sync(true); };
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    document.addEventListener('visibilitychange', () => this.sync(), options);
    window.addEventListener('pagehide', () => {
      this.pageSuspended = true;
      this.sync();
    }, options);
    window.addEventListener('pageshow', () => {
      this.pageSuspended = false;
      this.sync();
    }, options);
    this.unsubscribe = subscribePlayerPreferences(() => this.sync());
    this.sync();
  }

  getScene(): MusicScene { return this.scene; }

  setScene(scene: MusicScene): void {
    if (scene !== this.scene) {
      // A real gameplay-state entry draws fresh. Initial routing before gesture
      // unlock still restores a document-recreation checkpoint (including battles).
      if (this.unlocked || this.current) this.bookmarks.delete(scene);
      this.scene = scene;
      if (this.current) { this.remember(this.current); this.current.outgoing = true; }
      this.current = null;
    }
    this.sync();
  }

  /** Routes share meta; delay genuine returns to absorb consecutive battle handoffs. */
  setAmbientScene(scene: MusicScene): void {
    this.ambientScene = scene;
    if (this.routeTimer !== null) clearTimeout(this.routeTimer);
    this.routeTimer = null;
    if (this.battleActive || scene === this.scene) return;
    this.routeTimer = setTimeout(() => {
      this.routeTimer = null;
      if (!this.battleActive) this.setScene(this.ambientScene);
    }, 700);
  }

  beginBattle(scene: MusicScene): void {
    this.battleActive = true;
    if (this.routeTimer !== null) clearTimeout(this.routeTimer);
    this.routeTimer = null;
    this.ducks.clear();
    this.setScene(scene);
  }

  endBattle(keepResultSilence = false): void {
    if (!this.battleActive) return;
    this.battleActive = false;
    this.ducks.clear();
    if (keepResultSilence) { this.setDucking('result', true); return; }
    this.setAmbientScene(this.ambientScene);
  }

  finishResult(): void {
    // Select the ambient bed while still silent: never revive the old battle theme.
    if (this.routeTimer !== null) clearTimeout(this.routeTimer);
    this.routeTimer = null;
    if (!this.battleActive) this.setScene(this.ambientScene);
    this.setDucking('result', false);
  }

  setDucking(reason: DuckReason, active: boolean): void {
    if (active) this.ducks.add(reason);
    else this.ducks.delete(reason);
    if (reason === 'result') {
      if (active) this.duckGain = 0;
      this.sync();
    }
    this.ensureTimer();
  }

  setTracks(tracks: MusicCatalog): void {
    this.tracks = { ...tracks };
    this.bags.clear();
    if (this.current && !this.pool().some(track => track.url === this.current!.track.url)) {
      this.current.outgoing = true;
      this.current = null;
    }
    this.sync();
  }

  private pool(): readonly MusicTrack[] {
    const value = this.tracks[this.scene];
    return typeof value === 'string' ? [{ url: value, gain: 0.55 }] : value ?? [];
  }

  private enabledVolume(): number {
    const p = getPlayerPreferences();
    return !this.ducks.has('result') && this.unlocked && !document.hidden && !this.pageSuspended && p.masterEnabled && p.musicEnabled
      ? p.masterVolume * p.musicVolume : 0;
  }

  private sync(retry = false): void {
    if (!this.started) return;
    if (this.enabledVolume() === 0) {
      // Drop fading remnants so unmuting cannot revive an obsolete scene.
      for (const voice of [...this.voices]) {
        if (voice !== this.current) this.release(voice);
        else {
          // Snapshot once before pause; repeated hidden/mute events must not replace
          // this checkpoint with a browser-reset currentTime of zero.
          if (voice.resumeTime === null) {
            this.remember(voice);
            voice.resumeTime = voice.audio.currentTime;
          }
          if (voice.pending) voice.interrupted = true;
          voice.audio.pause(); voice.envelope = 0; voice.audio.volume = 0;
        }
      }
      this.stopTimer();
      return;
    }
    if (!this.current && this.pool().length) this.createVoice();
    if (this.current && (retry || !this.current.failed)) this.play(this.current);
    this.applyVolumes();
    this.ensureTimer();
  }

  private createVoice(resume = true): void {
    const pool = this.pool();
    if (!pool.length) return;
    // Keep only the most recent old voice on fast scene changes.
    for (const voice of [...this.voices].slice(0, -1)) this.release(voice);
    const bookmark = resume ? this.bookmarks.get(this.scene) : undefined;
    const savedIndex = bookmark ? pool.findIndex(track => track.url === bookmark.url) : -1;
    const track = savedIndex >= 0 ? pool[savedIndex]! : this.drawTrack(pool);
    this.lastTracks.set(this.scene, track.url);
    const audio = new Audio(track.url);
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = 0;
    const voice: Voice = { audio, track, scene: this.scene,
      resumeTime: savedIndex >= 0 ? bookmark!.time : null,
      envelope: 0, outgoing: false, pending: false, interrupted: false,
      ready: false, failed: false, dispose: () => {} };
    const onTime = () => {
      if (this.current !== voice || voice.failed || this.enabledVolume() === 0 || !voice.ready
        || voice.resumeTime !== null || audio.seeking) return;
      this.remember(voice, false);
      if (Number.isFinite(audio.duration) && audio.duration > 10
        && audio.duration - audio.currentTime <= LOOP_OVERLAP_SECONDS) this.next(voice);
    };
    const onEnded = () => {
      if (this.current === voice && this.enabledVolume() > 0 && !voice.failed) this.next(voice);
    };
    const onError = () => {
      voice.failed = true;
      voice.pending = false;
      voice.ready = false;
      // A broken file stays silent until another scene/gesture, never a retry storm.
      audio.pause();
      for (const old of [...this.voices]) if (old !== voice) this.release(old);
      this.stopTimer();
    };
    const onMetadata = () => this.restorePosition(voice);
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    voice.dispose = () => {
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
    this.voices.push(voice);
    this.current = voice;
    this.remember(voice);
    this.play(voice);
    this.ensureTimer();
  }

  /** Shuffle bags play every available track before refilling, with no boundary repeat. */
  private drawTrack(pool: readonly MusicTrack[]): MusicTrack {
    let bag = this.bags.get(this.scene);
    if (!bag?.length) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      this.bags.set(this.scene, bag);
    }
    const previous = this.lastTracks.get(this.scene);
    if (bag.length > 1 && bag[bag.length - 1]!.url === previous) {
      const other = bag.findIndex(track => track.url !== previous);
      if (other >= 0) [bag[other], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[other]!];
    }
    return bag.pop()!;
  }

  private next(voice: Voice): void {
    voice.outgoing = true;
    this.current = null;
    this.createVoice(false);
  }

  private play(voice: Voice): void {
    if (!voice.audio.paused || voice.pending) return;
    this.restorePosition(voice);
    voice.pending = true;
    voice.interrupted = false;
    voice.failed = false;
    void voice.audio.play().then(() => {
      voice.pending = false;
      if (!this.started || !this.voices.includes(voice)) { voice.audio.pause(); return; }
      voice.ready = true;
      if (this.enabledVolume() === 0) voice.audio.pause();
      else if (voice.interrupted && voice.audio.paused) this.play(voice);
    }).catch((error: unknown) => {
      if (!this.voices.includes(voice)) return;
      voice.pending = false;
      // pause() can abort an outstanding play() during a quick tab switch.
      // It is a lifecycle interruption, not an autoplay rejection.
      if (voice.interrupted && error instanceof Error && error.name === 'AbortError') {
        voice.failed = false;
        if (this.enabledVolume() > 0) this.sync();
        return;
      }
      voice.failed = true;
      // User gesture retries autoplay; do not poll play() on every timer tick.
    });
  }

  private restorePosition(voice: Voice): void {
    if (voice.resumeTime === null || voice.audio.readyState < 1 || this.enabledVolume() === 0) return;
    const duration = voice.audio.duration;
    const position = Number.isFinite(duration) && voice.resumeTime >= duration ? 0 : voice.resumeTime;
    try {
      voice.audio.currentTime = position;
      voice.resumeTime = null;
    } catch { /* Metadata/seekability may arrive later; keep the checkpoint. */ }
  }

  private remember(voice: Voice, flush = true): void {
    const time = voice.resumeTime ?? voice.audio.currentTime;
    if (!Number.isFinite(time) || time < 0) return;
    this.bookmarks.set(voice.scene, { url: voice.track.url, time });
    if (!flush && Date.now() - this.lastSave < 5000) return;
    try {
      window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(this.bookmarks)));
      this.lastSave = Date.now();
    } catch { /* Memory checkpoints still work when storage is disabled. */ }
  }

  private readProgress(): void {
    try {
      const data: unknown = JSON.parse(window.sessionStorage.getItem(PROGRESS_KEY) ?? '{}');
      if (!data || typeof data !== 'object') return;
      for (const scene of Object.keys(this.tracks) as MusicScene[]) {
        const saved = (data as Record<string, Partial<Bookmark> | null>)[scene];
        if (saved && typeof saved.url === 'string' && typeof saved.time === 'number'
          && Number.isFinite(saved.time) && saved.time >= 0) {
          this.bookmarks.set(scene, { url: saved.url, time: saved.time });
          this.lastTracks.set(scene, saved.url);
        }
      }
    } catch { /* Corrupt or unavailable storage never blocks music. */ }
  }

  private ensureTimer(): void {
    if (!this.started || this.timer !== null || !this.voices.length || this.enabledVolume() === 0) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const targetDuck = Math.min(1, ...[...this.ducks].map(reason => DUCK_GAIN[reason]));
    const duckStep = TICK_MS / (targetDuck < this.duckGain ? 200 : 1500);
    this.duckGain += Math.sign(targetDuck - this.duckGain) * Math.min(Math.abs(targetDuck - this.duckGain), duckStep);
    for (const voice of [...this.voices]) {
      if (voice.outgoing) {
        // Keep the old bed audible until its replacement actually starts.
        if (this.current && !this.current.ready && !this.current.failed) continue;
        voice.envelope = Math.max(0, voice.envelope - TICK_MS / CROSSFADE_MS);
        if (voice.envelope === 0) this.release(voice);
      } else if (voice.ready && !voice.audio.paused) {
        voice.envelope = Math.min(1, voice.envelope + TICK_MS / CROSSFADE_MS);
      }
    }
    this.applyVolumes();
    if (!this.voices.length) this.stopTimer();
  }

  private applyVolumes(): void {
    const base = this.enabledVolume() * this.duckGain;
    for (const voice of this.voices) voice.audio.volume = Math.min(1, Math.max(0, base * voice.track.gain * voice.envelope));
  }

  private release(voice: Voice): void {
    voice.dispose();
    voice.audio.pause();
    voice.audio.removeAttribute('src');
    voice.audio.load();
    this.voices = this.voices.filter(item => item !== voice);
  }

  private stopTimer(): void { if (this.timer !== null) clearInterval(this.timer); this.timer = null; }

  dispose(): void {
    if (this.current) this.remember(this.current);
    this.started = false;
    this.pageSuspended = false;
    this.lifecycle?.abort();
    this.unsubscribe?.();
    this.stopTimer();
    if (this.routeTimer !== null) clearTimeout(this.routeTimer);
    this.routeTimer = null;
    for (const voice of [...this.voices]) this.release(voice);
    this.current = null;
    this.unlocked = false;
    this.battleActive = false;
    this.ducks.clear();
    this.duckGain = 1;
    this.bags.clear();
    this.lastTracks.clear();
  }
}

export const backgroundMusic = new BackgroundMusic();
