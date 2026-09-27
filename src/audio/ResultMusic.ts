/**
 * 结算音乐：Web Audio 实时合成的胜利 / 战败 BGM 与升级号角，零素材依赖。
 *
 * 生命周期与 BackgroundMusic 的 'result' 静音槽对接：
 *   ResultScreen.mount → backgroundMusic.setDucking('result', true) + resultMusic.play(theme)
 *   升级页                → resultMusic.levelUp()
 *   ResultScreen.dispose  → resultMusic.stop() + backgroundMusic.finishResult()
 *
 * 音量 = 主音量 × 音乐音量（与 BackgroundMusic 同一偏好口径），实时订阅偏好变更；
 * 页面隐藏时挂起 AudioContext，回到前台续播。调度采用前瞻式：每 60ms 把未来 0.4s
 * 内的音符交给音频线程，循环段无缝衔接。
 */
import { getPlayerPreferences, subscribePlayerPreferences } from '../preferences/playerPreferences';
import {
  hzOf,
  LEVEL_UP_STING,
  phraseSeconds,
  RESULT_SCORES,
  type Instrument,
  type NoteEvent,
  type Phrase,
  type ResultTheme,
} from './resultScores';

export type { ResultTheme } from './resultScores';

const LOOKAHEAD_SECONDS = 0.4;
const TICK_MS = 60;

// ---------------------------------------------------------------------------
// 共享素材：噪声与混响脉冲（每个 AudioContext 生成一次，确定性 LCG）
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const rnd = lcg(0x5eed1234);
  buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}

/** 2.6s 立体声大厅混响：指数衰减噪声 + 12ms 预延迟，左右声道独立噪声得到宽度。 */
function impulseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = impulseCache.get(ctx);
  if (buf) return buf;
  const seconds = 2.6;
  const length = Math.floor(ctx.sampleRate * seconds);
  const pre = Math.floor(ctx.sampleRate * 0.012);
  buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = lcg(0xa11 + ch * 7919);
    const data = buf.getChannelData(ch);
    for (let i = pre; i < length; i++) {
      const decay = Math.pow(1 - (i - pre) / (length - pre), 3.2);
      data[i] = (rnd() * 2 - 1) * decay * 0.6;
    }
  }
  impulseCache.set(ctx, buf);
  return buf;
}

// ---------------------------------------------------------------------------
// 音色积木
// ---------------------------------------------------------------------------

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, stop: number, detune = 0): OscillatorNode {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.setValueAtTime(freq, t);
  if (detune) node.detune.setValueAtTime(detune, t);
  node.start(t);
  node.stop(stop);
  return node;
}

function amp(ctx: BaseAudioContext, dest: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(dest);
  return g;
}

/** 持续型包络：起音 → 轻衰减到延音 → 音符结束后指数释放。 */
function sustainEnv(p: AudioParam, t: number, attack: number, peak: number, hold: number, release: number, sustain: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(peak * sustain, t + attack, 0.12);
  p.setTargetAtTime(0, t + Math.max(hold, attack), release / 3);
}

/** 打击/拨弦型包络：瞬间起音后自然衰减。 */
function pluckEnv(p: AudioParam, t: number, attack: number, peak: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(0, t + attack, tau);
}

function lowpass(ctx: BaseAudioContext, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = Math.min(freq, ctx.sampleRate * 0.45);
  f.Q.value = q;
  f.connect(dest);
  return f;
}

/** 延迟起效的颤音（音分），挂在一组振荡器的 detune 上。 */
function vibrato(ctx: BaseAudioContext, oscs: OscillatorNode[], t: number, stop: number, rate: number, cents: number, onset = 0.35): void {
  const lfo = osc(ctx, 'sine', rate, t, stop);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + onset + 0.3);
  lfo.connect(depth);
  for (const o of oscs) depth.connect(o.detune);
}

function noiseSource(ctx: BaseAudioContext, t: number, stop: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t);
  src.stop(stop);
  return src;
}

type Voice = (ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, f: number, vel: number) => void;

const VOICES: Record<Instrument, Voice> = {
  /** 号角：双锯齿失谐 + 滤波器"开口"包络（铜管的亮起） */
  brass(ctx, out, t, dur, f, vel) {
    const stop = t + dur + 0.6;
    const g = amp(ctx, out);
    const lp = lowpass(ctx, f * 1.1, 0.7, g);
    lp.frequency.setValueAtTime(f * 1.1, t);
    lp.frequency.linearRampToValueAtTime(Math.min(f * 8, 10000), t + 0.07);
    lp.frequency.setTargetAtTime(Math.min(f * 4.2, 7000), t + 0.07, 0.25);
    lp.frequency.setTargetAtTime(f * 1.5, t + dur, 0.12);
    const a = osc(ctx, 'sawtooth', f, t, stop, -6);
    const b = osc(ctx, 'sawtooth', f, t, stop, 6);
    a.connect(lp);
    b.connect(lp);
    sustainEnv(g.gain, t, 0.03, vel * 0.13, dur, 0.28, 0.78);
    if (dur > 0.7) vibrato(ctx, [a, b], t, stop, 5.3, 7);
  },
  /** 圆号：更柔的锯齿 + 三角，低开口 */
  horn(ctx, out, t, dur, f, vel) {
    const stop = t + dur + 0.7;
    const g = amp(ctx, out);
    const lp = lowpass(ctx, f * 3, 0.6, g);
    lp.frequency.setValueAtTime(f * 1.4, t);
    lp.frequency.linearRampToValueAtTime(f * 3.2, t + 0.12);
    lp.frequency.setTargetAtTime(f * 2.3, t + 0.12, 0.3);
    const a = osc(ctx, 'sawtooth', f, t, stop, -4);
    const b = osc(ctx, 'triangle', f, t, stop, 3);
    a.connect(lp);
    b.connect(lp);
    sustainEnv(g.gain, t, 0.06, vel * 0.16, dur, 0.35, 0.85);
    if (dur > 0.6) vibrato(ctx, [a, b], t, stop, 5, 6);
  },
  /** 弦乐铺底：双锯齿宽失谐 + 缓起音 */
  strings(ctx, out, t, dur, f, vel) {
    const stop = t + dur + 1.2;
    const g = amp(ctx, out);
    const lp = lowpass(ctx, Math.min(2600, f * 5), 0.4, g);
    const a = osc(ctx, 'sawtooth', f, t, stop, -11);
    const b = osc(ctx, 'sawtooth', f, t, stop, 9);
    a.connect(lp);
    b.connect(lp);
    sustainEnv(g.gain, t, Math.min(0.45, dur * 0.4), vel * 0.065, dur, 0.8, 0.9);
    vibrato(ctx, [a, b], t, stop, 4.6, 5, 0.2);
  },
  /** 竖琴/拨弦：三角 + 八度正弦泛音，自然衰减 */
  harp(ctx, out, t, dur, f, vel) {
    const tau = f < 220 ? 0.65 : 0.45;
    const stop = t + Math.max(dur, tau * 5);
    const g = amp(ctx, out);
    const lp = lowpass(ctx, 3600, 0.3, g);
    osc(ctx, 'triangle', f, t, stop).connect(lp);
    const over = ctx.createGain();
    over.gain.value = 0.25;
    over.connect(lp);
    osc(ctx, 'sine', f * 2, t, stop).connect(over);
    pluckEnv(g.gain, t, 0.004, vel * 0.26, tau);
  },
  /** 低音：三角 + 八度正弦（小音箱上也听得见） */
  bass(ctx, out, t, dur, f, vel) {
    const stop = t + dur + 0.6;
    const g = amp(ctx, out);
    const lp = lowpass(ctx, 700, 0.5, g);
    osc(ctx, 'triangle', f, t, stop).connect(lp);
    const over = ctx.createGain();
    over.gain.value = 0.3;
    over.connect(lp);
    osc(ctx, 'sine', f * 2, t, stop).connect(over);
    sustainEnv(g.gain, t, 0.02, vel * 0.34, dur, 0.22, 0.7);
  },
  /** 定音鼓：正弦下滑 + 低通噪声槌击 */
  timpani(ctx, out, t, _dur, f, vel) {
    const stop = t + 2.4;
    const body = amp(ctx, out);
    const o = osc(ctx, 'sine', f * 1.4, t, stop);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.connect(body);
    pluckEnv(body.gain, t, 0.004, vel * 0.6, 0.45);
    const hit = amp(ctx, out);
    const lp = lowpass(ctx, 380, 0.7, hit);
    noiseSource(ctx, t, t + 0.4).connect(lp);
    pluckEnv(hit.gain, t, 0.002, vel * 0.35, 0.05);
  },
  /** 吊镲：高通噪声长衰减 */
  cymbal(ctx, out, t, _dur, _f, vel) {
    const g = amp(ctx, out);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    hp.connect(g);
    noiseSource(ctx, t, t + 3.6).connect(hp);
    pluckEnv(g.gain, t, 0.002, vel * 0.16, 0.8);
  },
  /** 反向镲：噪声渐强，落拍处截断 */
  swell(ctx, out, t, dur, _f, vel) {
    const g = amp(ctx, out);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2000, t);
    hp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    hp.connect(g);
    noiseSource(ctx, t, t + dur + 0.3).connect(hp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vel * 0.14, 0.0002), t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.03);
  },
  /** 远钟：简易 FM（调制比 3.5）+ 二倍泛音 */
  bell(ctx, out, t, _dur, f, vel) {
    const stop = t + 5;
    const g = amp(ctx, out);
    const carrier = osc(ctx, 'sine', f, t, stop);
    const mod = osc(ctx, 'sine', f * 3.5, t, stop);
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 2.5, t);
    index.gain.setTargetAtTime(0, t, 0.5);
    mod.connect(index);
    index.connect(carrier.frequency);
    carrier.connect(g);
    pluckEnv(g.gain, t, 0.002, vel * 0.22, 1.3);
    const partial = amp(ctx, out);
    osc(ctx, 'sine', f * 2, t, stop).connect(partial);
    pluckEnv(partial.gain, t, 0.002, vel * 0.08, 0.7);
  },
  /** 独奏（双簧管式）：共振低通锯齿 + 三角，明显颤音 */
  lead(ctx, out, t, dur, f, vel) {
    const stop = t + dur + 0.8;
    const g = amp(ctx, out);
    const lp = lowpass(ctx, f * 3.2, 4, g);
    const a = osc(ctx, 'sawtooth', f, t, stop);
    a.connect(lp);
    const body = ctx.createGain();
    body.gain.value = 0.5;
    body.connect(g);
    const b = osc(ctx, 'triangle', f, t, stop);
    b.connect(body);
    sustainEnv(g.gain, t, 0.09, vel * 0.11, dur, 0.4, 0.85);
    vibrato(ctx, [a, b], t, stop, 5.4, 9, 0.25);
  },
  /** 星光：高音正弦铃点 */
  shimmer(ctx, out, t, dur, f, vel) {
    const stop = t + Math.max(dur, 2);
    const g = amp(ctx, out);
    osc(ctx, 'sine', f, t, stop).connect(g);
    const over = ctx.createGain();
    over.gain.value = 0.3;
    over.connect(g);
    osc(ctx, 'sine', f * 2, t, stop, 4).connect(over);
    pluckEnv(g.gain, t, 0.003, vel * 0.12, 0.4);
  },
};

/** 各声部电平 / 声像 / 混响送量 */
const MIX: Record<Instrument, { level: number; pan: number; send: number }> = {
  brass: { level: 1, pan: 0, send: 0.22 },
  horn: { level: 1, pan: 0.12, send: 0.32 },
  strings: { level: 1, pan: -0.18, send: 0.45 },
  harp: { level: 1, pan: 0.28, send: 0.4 },
  bass: { level: 1, pan: 0, send: 0.06 },
  timpani: { level: 1, pan: -0.08, send: 0.2 },
  cymbal: { level: 0.9, pan: 0.18, send: 0.28 },
  swell: { level: 0.9, pan: 0.18, send: 0.3 },
  bell: { level: 1, pan: -0.22, send: 0.55 },
  lead: { level: 1, pan: 0.06, send: 0.38 },
  shimmer: { level: 1, pan: 0.3, send: 0.5 },
};

// ---------------------------------------------------------------------------
// 会话：一首曲目的一次播放（开场 + 循环 + 叠加号角）
// ---------------------------------------------------------------------------

type LayerName = 'bed' | 'sting';

interface Layer {
  dry: GainNode;
  wet: GainNode;
  channels: Map<Instrument, AudioNode>;
}

interface Track {
  phrase: Phrase;
  base: number;
  index: number;
  loop: boolean;
  layer: LayerName;
  done: boolean;
}

interface SessionOptions {
  /** false = 跳过号角开场直接进循环 */
  intro: boolean;
  /** 循环段额外推迟（秒）；升级号角先行时用 */
  loopDelay: number;
}

class Session {
  readonly out: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly layers: Record<LayerName, Layer>;
  private tracks: Track[] = [];
  stopping = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    readonly theme: ResultTheme,
    start: number,
    options: SessionOptions,
  ) {
    const score = RESULT_SCORES[theme];
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, start);
    this.out.gain.linearRampToValueAtTime(score.gain, start + 0.03);
    this.out.connect(dest);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulseBuffer(ctx);
    this.reverb.connect(this.out);
    this.layers = { bed: this.layer(), sting: this.layer() };

    let loopStart = start + options.loopDelay;
    if (options.intro) {
      this.tracks.push({ phrase: score.intro, base: start, index: 0, loop: false, layer: 'bed', done: false });
      loopStart += phraseSeconds(score.intro);
    } else {
      // 直接进循环：床层渐入，避免硬切
      const bed = this.layers.bed;
      for (const g of [bed.dry, bed.wet]) {
        g.gain.setValueAtTime(0, loopStart);
        g.gain.linearRampToValueAtTime(1, loopStart + 1.6);
      }
    }
    this.tracks.push({ phrase: score.loop, base: loopStart, index: 0, loop: true, layer: 'bed', done: false });
  }

  private layer(): Layer {
    const dry = this.ctx.createGain();
    dry.connect(this.out);
    const wet = this.ctx.createGain();
    wet.connect(this.reverb);
    return { dry, wet, channels: new Map() };
  }

  private channel(name: LayerName, inst: Instrument): AudioNode {
    const layer = this.layers[name];
    const existing = layer.channels.get(inst);
    if (existing) return existing;
    const mix = MIX[inst];
    const input = this.ctx.createGain();
    input.gain.value = mix.level;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = mix.pan;
    input.connect(pan);
    pan.connect(layer.dry);
    const send = this.ctx.createGain();
    send.gain.value = mix.send;
    pan.connect(send);
    send.connect(layer.wet);
    layer.channels.set(inst, input);
    return input;
  }

  /** 叠加一段号角；床层在号角期间压低到 30%。 */
  addSting(phrase: Phrase, start: number): void {
    const seconds = phraseSeconds(phrase);
    const bed = this.layers.bed;
    for (const g of [bed.dry, bed.wet]) {
      g.gain.cancelScheduledValues(start);
      g.gain.setTargetAtTime(0.3, start, 0.08);
      g.gain.setTargetAtTime(1, start + seconds + 0.4, 0.6);
    }
    this.tracks.push({ phrase, base: start, index: 0, loop: false, layer: 'sting', done: false });
  }

  /** 把 [now, until) 内的音符交给音频线程。 */
  pump(until: number): void {
    if (this.stopping) return;
    const now = this.ctx.currentTime;
    for (const track of this.tracks) {
      const spb = 60 / track.phrase.bpm;
      const events = track.phrase.events;
      while (!track.done) {
        if (track.index >= events.length) {
          if (!track.loop || events.length === 0) { track.done = true; break; }
          track.index = 0;
          track.base += track.phrase.beats * spb;
          continue;
        }
        const ev: NoteEvent = events[track.index]!;
        const t = track.base + ev.at * spb;
        if (t >= until) break;
        track.index++;
        // 主线程被卡住时丢弃过期音符，不在恢复瞬间一次性堆叠
        if (t < now - 0.08) continue;
        VOICES[ev.inst](this.ctx, this.channel(track.layer, ev.inst), Math.max(t, now), ev.dur * spb, hzOf(ev.midi), ev.vel);
      }
    }
    this.tracks = this.tracks.filter((track) => !track.done);
  }

  fadeOut(seconds: number): void {
    if (this.stopping) return;
    this.stopping = true;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, Math.max(0.02, seconds / 4));
  }
}

/** 预设值：总线压缩，保证多声部叠加不削波 */
function outputChain(ctx: BaseAudioContext): { bus: GainNode } {
  const bus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  bus.connect(comp);
  comp.connect(ctx.destination);
  return { bus };
}

function preferenceVolume(): number {
  const p = getPlayerPreferences();
  return p.masterEnabled && p.musicEnabled ? p.masterVolume * p.musicVolume : 0;
}

// ---------------------------------------------------------------------------
// 播放器
// ---------------------------------------------------------------------------

export class ResultMusic {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private session: Session | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lifecycle: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  /** 静音期间请求的曲目；取消静音后从循环段接上 */
  private wanted: ResultTheme | null = null;

  /** 当前正在播放（未淡出）的曲目 */
  get theme(): ResultTheme | null {
    return this.session && !this.session.stopping ? this.session.theme : null;
  }

  play(theme: ResultTheme): void {
    this.wanted = theme;
    this.watch();
    if (this.theme === theme) return;
    if (preferenceVolume() <= 0) return;
    this.start(theme, { intro: true, loopDelay: 0 });
  }

  /** 升级：叠加号角；战败曲目下改为号角后接凯旋循环（升级是正向时刻）。 */
  levelUp(): void {
    this.wanted = 'victory';
    this.watch();
    if (preferenceVolume() <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const at = ctx.currentTime + 0.05;
    if (this.theme === 'victory') {
      this.session!.addSting(LEVEL_UP_STING, at);
    } else {
      this.start('victory', { intro: false, loopDelay: phraseSeconds(LEVEL_UP_STING) + 0.3 });
      this.session?.addSting(LEVEL_UP_STING, at);
    }
    this.pump();
  }

  stop(fadeSeconds = 0.8): void {
    this.wanted = null;
    this.release(fadeSeconds);
    this.stopTimer();
    // 淡出后让音频线程休眠；下次 play 时 ensureContext 会恢复（页面已有过用户手势）
    setTimeout(() => {
      if (!this.session && this.ctx?.state === 'running') void this.ctx.suspend().catch(() => undefined);
    }, fadeSeconds * 1000 + 600);
  }

  /** 测试/热更新用：释放全部资源 */
  dispose(): void {
    this.stop(0);
    this.lifecycle?.abort();
    this.lifecycle = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.bus = null;
  }

  private start(theme: ResultTheme, options: SessionOptions): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.bus) return;
    this.release(0.5);
    this.session = new Session(ctx, this.bus, theme, ctx.currentTime + 0.08, options);
    this.pump();
    this.ensureTimer();
  }

  private release(fadeSeconds: number): void {
    const old = this.session;
    if (!old) return;
    this.session = null;
    old.fadeOut(fadeSeconds);
    setTimeout(() => old.out.disconnect(), fadeSeconds * 1000 + 400);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor({ latencyHint: 'playback' });
    } catch {
      return null;
    }
    this.bus = outputChain(this.ctx).bus;
    this.bus.gain.value = preferenceVolume();
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** 订阅偏好/可见性/首个手势（只挂一次）。 */
  private watch(): void {
    if (this.lifecycle) return;
    this.lifecycle = new AbortController();
    const options = { signal: this.lifecycle.signal };
    const unlock = () => {
      if (this.ctx?.state === 'suspended' && !document.hidden && this.session) void this.ctx.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else if (this.session) void this.ctx.resume().catch(() => undefined);
    }, options);
    window.addEventListener('pagehide', () => { void this.ctx?.suspend().catch(() => undefined); }, options);
    this.unsubscribe = subscribePlayerPreferences(() => this.syncVolume());
  }

  private syncVolume(): void {
    const volume = preferenceVolume();
    if (this.bus && this.ctx) this.bus.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    if (volume > 0 && this.wanted && !this.theme) this.start(this.wanted, { intro: false, loopDelay: 0 });
  }

  private pump(): void {
    if (!this.ctx || !this.session) return;
    this.session.pump(this.ctx.currentTime + LOOKAHEAD_SECONDS);
  }

  private ensureTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

export const resultMusic = new ResultMusic();

/**
 * 离线渲染（验收/试听用）：把指定曲目渲染成 AudioBuffer。
 * `levelUpAt` 给定时在该秒叠加升级号角。
 */
export async function renderResultTheme(
  theme: ResultTheme,
  seconds: number,
  options: { sampleRate?: number; levelUpAt?: number } = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
  const { bus } = outputChain(ctx);
  bus.gain.value = 1;
  const session = new Session(ctx, bus, theme, 0, { intro: true, loopDelay: 0 });
  if (options.levelUpAt !== undefined) session.addSting(LEVEL_UP_STING, options.levelUpAt);
  session.pump(seconds);
  return ctx.startRendering();
}
