/**
 * 结算音乐：胜利 / 战败曲为录制成品（单次播放，不循环），升级号角为 Web Audio 实时合成。
 *
 * 生命周期与 BackgroundMusic 的 'result' 静音槽对接：
 *   ResultScreen.mount → backgroundMusic.setDucking('result', true) + resultMusic.play(theme)
 *   升级页                → resultMusic.levelUp()
 *   ResultScreen.dispose  → resultMusic.stop() + backgroundMusic.finishResult()
 *
 * 胜利 / 战败曲：game-assets/bundled/audio/result/*.mp3，由 scripts/build_result_music.mjs 从
 * source/audio/result-music-raw/ 生成（尾部混响余音 + 淡出、-17 LUFS）。播完即止，结算页停留更久时保持安静。
 *
 * 音量 = 主音量 × 音乐音量（与 BackgroundMusic 同一偏好口径），实时订阅偏好变更；
 * 页面隐藏时挂起 AudioContext，回到前台续播。号角调度采用前瞻式：每 60ms 把未来 0.4s
 * 内的音符交给音频线程。
 *
 * 号角音色按管弦乐队分组：
 * - 弦乐：每个音 4~6 把失谐锯齿"合奏"（确定性随机的失谐 / 起音错位），共享颤音 LFO 组给每把琴
 *   独立的慢颤音；缓起弓（80~250ms）、长释放；声部总线上挂琴体共鸣峰（~300Hz / 1.2~2.5kHz）。
 * - 铜管：按真实泛音表生成的 PeriodicWave（圆号柔暗、小号明亮、长号居中），滤波器开口包络
 *   模拟起音的"爆破"，嘴唇滑入音高，长音才加颤音；每个音 2~3 名演奏者。
 * - 木管：长笛（正弦 + 三角泛音 + 带通气声）、双簧管（鼻音泛音 + 共鸣峰）。
 * - 打击：定音鼓（音高下滑 + 非谐分音 + 槌击噪声；滚奏为一组连续击打自动化）、镲、吊镲滚奏、大鼓。
 * - 3.3s 立体声音乐厅混响（早期反射 + 随时间变暗的扩散尾音），按乐队座位分配声像。
 * 性能：噪声 / 混响脉冲 / 波表按 AudioContext 缓存复用；颤音 LFO 按会话共享；同声部同时发声过多时
 * 自动减少每音的合奏人数；所有振荡器在释放后 stop。
 */
import victoryUrl from '@assets/audio/result/victory.mp3?url';
import defeatUrl from '@assets/audio/result/defeat.mp3?url';
import { getPlayerPreferences, subscribePlayerPreferences } from '../preferences/playerPreferences';
import {
  hzOf,
  LEVEL_UP_STING,
  phraseSeconds,
  type Instrument,
  type NoteEvent,
  type Phrase,
} from './resultScores';

export type ResultTheme = 'victory' | 'defeat';

/** 结算曲成品：已归一到 -17 LUFS，gain 与 BackgroundMusic 的场景增益同一口径 */
const RESULT_TRACKS: Readonly<Record<ResultTheme, { url: string; gain: number }>> = {
  victory: { url: victoryUrl, gain: 0.9 },
  defeat: { url: defeatUrl, gain: 0.9 },
};

/** 升级号角输出增益 */
const STING_GAIN = 0.9;
/** 号角期间结算曲压到的比例 */
const STING_DUCK = 0.3;

const LOOKAHEAD_SECONDS = 0.4;
const TICK_MS = 60;

// ---------------------------------------------------------------------------
// 共享素材：噪声、混响脉冲、泛音波表（每个 AudioContext 生成一次，确定性 LCG）
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const waveCache = new WeakMap<BaseAudioContext, Map<WaveName, PeriodicWave>>();

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 每个音符的确定性随机种子（同一时刻同一音高永远得到同一组失谐 / 错位） */
function seedOf(t: number, f: number): number {
  return (Math.round(t * 1000) * 2654435761 + Math.round(f * 16)) >>> 0;
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

const HALL_SECONDS = 3.3;
const HALL_RT60 = 3.0;

/**
 * 立体声音乐厅混响脉冲：18ms 预延迟 → 左右不同的早期反射（前 90ms 的离散回声）→
 * 渐起的扩散尾音（RT60 ≈ 3s），尾音经随时间下降截止频率的一阶低通，高频比低频衰减得快。
 * 能量归一到与旧 2.6s 混响相当，保持湿声电平不变。
 */
function impulseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = impulseCache.get(ctx);
  if (buf) return buf;
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * HALL_SECONDS);
  const pre = Math.floor(sr * 0.018);
  buf = ctx.createBuffer(2, length, sr);
  const targetEnergy = 0.016 * 2.6 * sr;
  for (let ch = 0; ch < 2; ch++) {
    const rnd = lcg(0xa11 + ch * 7919);
    const data = buf.getChannelData(ch);
    // 扩散尾音
    let y = 0;
    let a = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sr;
      if ((i - pre) % 64 === 0) {
        const cutoff = 11000 * Math.pow(0.22, t / 2.2) + 900;
        a = 1 - Math.exp(-2 * Math.PI * cutoff / sr);
      }
      y += a * ((rnd() * 2 - 1) - y);
      const build = Math.min(1, t / 0.07);
      const decay = Math.pow(10, -3 * t / HALL_RT60);
      const fade = i > length - sr * 0.2 ? (length - i) / (sr * 0.2) : 1;
      data[i] = y * build * decay * fade;
    }
    // 早期反射：左右声道各 9 个离散回声
    for (let k = 0; k < 9; k++) {
      const at = pre + Math.floor(sr * (0.006 + 0.085 * (k + rnd()) / 9));
      const gain = (0.9 - k * 0.07) * (rnd() < 0.5 ? -1 : 1);
      if (at < length) data[at] = (data[at] ?? 0) + gain;
      if (at + 1 < length) data[at + 1] = (data[at + 1] ?? 0) + gain * 0.5;
    }
    let energy = 0;
    for (let i = 0; i < length; i++) energy += data[i]! * data[i]!;
    const scale = Math.sqrt(targetEnergy / Math.max(energy, 1e-9));
    for (let i = 0; i < length; i++) data[i]! *= scale;
  }
  impulseCache.set(ctx, buf);
  return buf;
}

type WaveName = 'horn' | 'trumpet' | 'trombone' | 'flute' | 'oboe' | 'harp';

/** 各乐器的谐波振幅表（第 1 项为基音） */
const SPECTRA: Record<WaveName, readonly number[]> = {
  // 圆号：锯齿 + 脉冲混合后的柔和谱，高次谐波迅速下降
  horn: [1, 0.6, 0.42, 0.28, 0.18, 0.12, 0.08, 0.05, 0.035, 0.022, 0.014, 0.009],
  // 小号：高次谐波丰富（明亮、有穿透力）
  trumpet: [1, 0.92, 0.85, 0.72, 0.6, 0.48, 0.38, 0.3, 0.23, 0.17, 0.13, 0.1, 0.075, 0.055, 0.04, 0.03, 0.022, 0.016],
  trombone: [1, 0.85, 0.68, 0.52, 0.4, 0.3, 0.22, 0.16, 0.11, 0.08, 0.055, 0.04, 0.028],
  // 长笛：正弦 + 三角波（奇次 1/n²）+ 少量二次泛音
  flute: [1, 0.14, 0.05, 0.025, 0.01],
  // 双簧管：二、三次谐波强于基音，带鼻音
  oboe: [0.55, 1, 0.9, 0.42, 0.55, 0.32, 0.22, 0.2, 0.12, 0.08, 0.05, 0.03],
  harp: [1, 0.42, 0.2, 0.1, 0.06, 0.035, 0.02],
};

function wave(ctx: BaseAudioContext, name: WaveName): PeriodicWave {
  let map = waveCache.get(ctx);
  if (!map) {
    map = new Map();
    waveCache.set(ctx, map);
  }
  let w = map.get(name);
  if (w) return w;
  const amps = SPECTRA[name];
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => { imag[i + 1] = a; });
  w = ctx.createPeriodicWave(real, imag);
  map.set(name, w);
  return w;
}

// ---------------------------------------------------------------------------
// 音色积木
// ---------------------------------------------------------------------------

function osc(ctx: BaseAudioContext, type: OscillatorType | PeriodicWave, freq: number, t: number, stop: number, detune = 0): OscillatorNode {
  const node = ctx.createOscillator();
  if (typeof type === 'string') node.type = type as OscillatorType;
  else node.setPeriodicWave(type);
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

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number, dest: AudioNode, gainDb = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.min(freq, ctx.sampleRate * 0.45);
  f.Q.value = q;
  if (gainDb) f.gain.value = gainDb;
  f.connect(dest);
  return f;
}

function lowpass(ctx: BaseAudioContext, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
  return filter(ctx, 'lowpass', freq, q, dest);
}

/** 延迟起效的颤音（音分），挂在一组振荡器的 detune 上（铜管 / 木管按音使用）。 */
function vibrato(ctx: BaseAudioContext, oscs: OscillatorNode[], t: number, stop: number, rate: number, cents: number, onset = 0.35): void {
  const lfo = osc(ctx, 'sine', rate, t, stop);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.setValueAtTime(0, t + onset);
  depth.gain.linearRampToValueAtTime(cents, t + onset + 0.3);
  lfo.connect(depth);
  for (const o of oscs) depth.connect(o.detune);
}

function noiseSource(ctx: BaseAudioContext, t: number, stop: number, offset = 0): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t, offset % 2.9);
  src.stop(stop);
  return src;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 会话级共享颤音组：8 路"快颤音（4.6~6Hz）+ 慢音高漂移（0.1~0.4Hz）"，
 * 弦乐每把琴挂到其中一路，得到彼此独立的颤音而不必每音新建 LFO；音符结束时摘除连接。
 */
class VibratoBank {
  private readonly taps: GainNode[] = [];
  private readonly lfos: OscillatorNode[] = [];

  constructor(ctx: BaseAudioContext, start: number) {
    const rnd = lcg(0x71b3);
    for (let i = 0; i < 8; i++) {
      const sum = ctx.createGain();
      const fast = osc(ctx, 'sine', 4.6 + i * 0.18 + rnd() * 0.12, start + rnd() * 0.2, start + 1e6);
      const fastDepth = ctx.createGain();
      fastDepth.gain.value = 5 + rnd() * 3;
      fast.connect(fastDepth).connect(sum);
      const slow = osc(ctx, 'sine', 0.1 + rnd() * 0.3, start + rnd() * 3, start + 1e6);
      const slowDepth = ctx.createGain();
      slowDepth.gain.value = 2 + rnd() * 2.5;
      slow.connect(slowDepth).connect(sum);
      this.taps.push(sum);
      this.lfos.push(fast, slow);
    }
  }

  attach(o: OscillatorNode, index: number): () => void {
    const tap = this.taps[index % this.taps.length]!;
    tap.connect(o.detune);
    return () => {
      try { tap.disconnect(o.detune); } catch { /* 已断开 */ }
    };
  }

  stop(at: number): void {
    for (const lfo of this.lfos) {
      try { lfo.stop(at); } catch { /* 已停止 */ }
    }
  }
}

/** 一次发声所需的上下文：输出声部总线、共享颤音组、该声部当前同时发声数 */
interface Play {
  ctx: BaseAudioContext;
  out: AudioNode;
  bank: VibratoBank;
  crowd: number;
}

type Voice = (p: Play, t: number, dur: number, f: number, vel: number) => void;

/** 合奏人数随同声部同时发声数递减，控制振荡器总量。 */
function ensemble(base: number, crowd: number, min = 2): number {
  if (crowd <= 2) return base;
  if (crowd <= 5) return Math.max(min, base - 1);
  if (crowd <= 8) return Math.max(min, base - 2);
  return min;
}

// ---- 弦乐 -----------------------------------------------------------------

interface BowSpec {
  players: number;
  /** 失谐范围（音分） */
  spread: number;
  /** 基准起弓时间（秒），随力度缩短 */
  attack: number;
  release: number;
  /** 每音低通截止 = 基频 × bright（再按力度缩放） */
  bright: number;
  maxCut: number;
  level: number;
}

type Register = 'violins' | 'violas' | 'cellos' | 'basses';

const BOW: Record<Register, BowSpec> = {
  violins: { players: 6, spread: 13, attack: 0.12, release: 0.75, bright: 7, maxCut: 9000, level: 0.1 },
  violas: { players: 5, spread: 11, attack: 0.15, release: 0.8, bright: 6, maxCut: 6000, level: 0.1 },
  cellos: { players: 5, spread: 9, attack: 0.17, release: 0.85, bright: 6, maxCut: 4200, level: 0.11 },
  basses: { players: 3, spread: 7, attack: 0.19, release: 0.7, bright: 6, maxCut: 2400, level: 0.13 },
};

/** 通用弦乐按音区分派声部与座位声像（从观众席看：小提琴左、中提琴居中偏右、大提琴右、低音提琴更右） */
function registerOf(f: number): { reg: Register; pan: number } {
  if (f < 65) return { reg: 'basses', pan: 0.52 };
  if (f < 180) return { reg: 'cellos', pan: 0.32 };
  if (f < 330) return { reg: 'violas', pan: 0.1 };
  return { reg: 'violins', pan: -0.42 };
}

/** 弓奏合奏：n 把失谐锯齿 → 每音低通（起弓时滤波器随弓速打开）→ 包络；可选颤弓（两组不同速率的振幅调制）。 */
function bowed(p: Play, t: number, dur: number, f: number, vel: number, spec: BowSpec, opts: { pan?: number; tremolo?: boolean } = {}): void {
  const { ctx } = p;
  const rnd = lcg(seedOf(t, f));
  const n = ensemble(opts.tremolo ? Math.min(3, spec.players) : spec.players, p.crowd);
  const stop = t + dur + spec.release * 2;
  let dest = p.out;
  if (opts.pan !== undefined) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan;
    pan.connect(p.out);
    dest = pan;
  }
  const g = amp(ctx, dest);
  const cut = Math.min(spec.maxCut, f * spec.bright * (0.55 + 0.7 * vel));
  const attack = clamp(spec.attack * (1.3 - 0.6 * vel), 0.06, Math.max(0.06, dur * 0.6));
  const lp = lowpass(ctx, cut, 0.6, g);
  lp.frequency.setValueAtTime(cut * 0.45, t);
  lp.frequency.linearRampToValueAtTime(cut, t + attack * 1.4);

  const inputs: AudioNode[] = [];
  if (opts.tremolo) {
    for (let k = 0; k < 2; k++) {
      const group = ctx.createGain();
      group.gain.value = 0.62;
      group.connect(lp);
      const lfo = osc(ctx, 'triangle', 11.4 + k * 2.1 + rnd() * 0.8, t, stop);
      const depth = ctx.createGain();
      depth.gain.value = 0.38;
      lfo.connect(depth).connect(group.gain);
      inputs.push(group);
    }
  } else {
    inputs.push(lp);
  }

  const detach: (() => void)[] = [];
  const voices: OscillatorNode[] = [];
  const half = Math.max(1, (n - 1) / 2);
  for (let i = 0; i < n; i++) {
    const detune = ((i - (n - 1) / 2) / half) * spec.spread + (rnd() - 0.5) * spec.spread * 0.6;
    const o = osc(ctx, 'sawtooth', f, t + rnd() * 0.03, stop, detune);
    detach.push(p.bank.attach(o, Math.floor(rnd() * 64)));
    o.connect(inputs[i % inputs.length]!);
    voices.push(o);
  }
  voices[0]!.onended = () => { for (const off of detach) off(); };
  sustainEnv(g.gain, t, attack, vel * spec.level / Math.sqrt(n), dur, spec.release, 0.9);
}

// ---- 铜管 -----------------------------------------------------------------

interface BrassSpec {
  wave: WaveName;
  players: number;
  spread: number;
  attack: number;
  /** 延音截止 = 基频 × cut；起音开口峰值 = 延音截止 × blat */
  cut: number;
  blat: number;
  level: number;
  release: number;
  /** 嘴唇滑入音高（音分） */
  scoop: number;
  vibRate: number;
  vibCents: number;
  /** 长于该秒数的音才加颤音 */
  vibMin: number;
}

const BRASS: Record<'horn' | 'trumpet' | 'trombone', BrassSpec> = {
  horn: { wave: 'horn', players: 3, spread: 6, attack: 0.055, cut: 2.2, blat: 1.5, level: 0.17, release: 0.35, scoop: 15, vibRate: 4.8, vibCents: 4, vibMin: 1.1 },
  trumpet: { wave: 'trumpet', players: 2, spread: 5, attack: 0.024, cut: 3.4, blat: 2.4, level: 0.13, release: 0.22, scoop: 22, vibRate: 5.8, vibCents: 9, vibMin: 0.8 },
  trombone: { wave: 'trombone', players: 2, spread: 6, attack: 0.045, cut: 2.6, blat: 1.9, level: 0.15, release: 0.3, scoop: 14, vibRate: 5, vibCents: 3, vibMin: 1.4 },
};

function brass(p: Play, t: number, dur: number, f: number, vel: number, spec: BrassSpec): void {
  const { ctx } = p;
  const rnd = lcg(seedOf(t, f));
  const n = ensemble(spec.players, p.crowd, 1);
  const stop = t + dur + spec.release * 3;
  const nyq = ctx.sampleRate * 0.45;
  const base = Math.min(nyq, f * spec.cut * (0.55 + 0.9 * vel));
  const open = Math.min(nyq, base * spec.blat * (0.6 + 0.6 * vel));
  const g = amp(ctx, p.out);
  const lp = lowpass(ctx, base, 0.9, g);
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.linearRampToValueAtTime(open, t + spec.attack + 0.03);
  lp.frequency.setTargetAtTime(base, t + spec.attack + 0.03, 0.14);
  lp.frequency.setTargetAtTime(f * 1.3, t + dur, spec.release / 2);
  const players: OscillatorNode[] = [];
  for (let i = 0; i < n; i++) {
    const detune = (i - (n - 1) / 2) * spec.spread + (rnd() - 0.5) * 3;
    const start = t + (i === 0 ? 0 : rnd() * 0.018);
    const o = osc(ctx, wave(ctx, spec.wave), f, start, stop);
    o.detune.setValueAtTime(detune - spec.scoop, start);
    o.detune.linearRampToValueAtTime(detune, start + 0.06);
    o.connect(lp);
    players.push(o);
  }
  sustainEnv(g.gain, t, spec.attack, vel * spec.level / Math.sqrt(n), dur, spec.release, 0.8);
  if (dur >= spec.vibMin) vibrato(ctx, players, t, stop, spec.vibRate, spec.vibCents, 0.4);
}

// ---- 打击 -----------------------------------------------------------------

/** 定音鼓鼓体：基音（击打后略下滑）+ 1.5 / 2 倍非谐分音（衰减更快） */
function timpaniBody(p: Play, t: number, stop: number, f: number): { body: GainNode; partials: GainNode } {
  const { ctx } = p;
  const body = amp(ctx, p.out);
  const o = osc(ctx, 'sine', f * 1.035, t, stop);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  o.connect(body);
  const partials = amp(ctx, p.out);
  const a = osc(ctx, 'sine', f * 1.51, t, stop);
  const b = osc(ctx, 'sine', f * 1.99, t, stop);
  a.connect(partials);
  b.connect(partials);
  return { body, partials };
}

// ---------------------------------------------------------------------------
// 声部表
// ---------------------------------------------------------------------------

const VOICES: Record<Instrument, Voice> = {
  violins(p, t, dur, f, vel) { bowed(p, t, dur, f, vel, BOW.violins); },
  violins2(p, t, dur, f, vel) { bowed(p, t, dur, f, vel, BOW.violins); },
  violas(p, t, dur, f, vel) { bowed(p, t, dur, f, vel, BOW.violas); },
  cellos(p, t, dur, f, vel) { bowed(p, t, dur, f, vel, BOW.cellos); },
  basses(p, t, dur, f, vel) { bowed(p, t, dur, f, vel, BOW.basses); },
  /** 通用弦乐长音：按音区挑声部与座位 */
  strings(p, t, dur, f, vel) {
    const { reg, pan } = registerOf(f);
    bowed(p, t, dur, f, vel, BOW[reg], { pan });
  },
  /** 通用弦乐颤弓 */
  tremolo(p, t, dur, f, vel) {
    const { reg, pan } = registerOf(f);
    bowed(p, t, dur, f, vel, BOW[reg], { pan, tremolo: true });
  },
  /** 低音提琴 / 大提琴拨奏：锯齿 + 三角，滤波器从亮迅速变暗 */
  pizz(p, t, _dur, f, vel) {
    const { ctx } = p;
    const tau = f < 80 ? 0.42 : 0.3;
    const stop = t + tau * 6;
    const g = amp(ctx, p.out);
    const lp = lowpass(ctx, f * 8, 0.8, g);
    lp.frequency.setValueAtTime(Math.min(f * 9, 5000), t);
    lp.frequency.setTargetAtTime(f * 2.2, t + 0.005, 0.07);
    osc(ctx, 'sawtooth', f, t, stop, -4).connect(lp);
    osc(ctx, 'triangle', f, t + 0.012, stop, 5).connect(lp);
    pluckEnv(g.gain, t, 0.006, vel * 0.34, tau);
  },
  horn(p, t, dur, f, vel) { brass(p, t, dur, f, vel, BRASS.horn); },
  trumpet(p, t, dur, f, vel) { brass(p, t, dur, f, vel, BRASS.trumpet); },
  trombone(p, t, dur, f, vel) { brass(p, t, dur, f, vel, BRASS.trombone); },
  /** 长笛：柔和波表 + 延迟颤音 + 带通气声（起音"吐音"更明显） */
  flute(p, t, dur, f, vel) {
    const { ctx } = p;
    const stop = t + dur + 0.5;
    const g = amp(ctx, p.out);
    const o = osc(ctx, wave(ctx, 'flute'), f, t, stop);
    o.connect(g);
    sustainEnv(g.gain, t, 0.07, vel * 0.15, dur, 0.18, 0.88);
    if (dur > 0.5) vibrato(ctx, [o], t, stop, 5.1, 9, 0.25);
    const breath = amp(ctx, p.out);
    const bp = filter(ctx, 'bandpass', f * 2, 1.4, breath);
    noiseSource(ctx, t, stop, lcg(seedOf(t, f))() * 3).connect(bp);
    breath.gain.setValueAtTime(0, t);
    breath.gain.linearRampToValueAtTime(vel * 0.05, t + 0.02);
    breath.gain.setTargetAtTime(vel * 0.012, t + 0.02, 0.05);
    breath.gain.setTargetAtTime(0, t + dur, 0.06);
  },
  /** 双簧管：鼻音波表 + 明显颤音（共鸣峰在声部总线上） */
  lead(p, t, dur, f, vel) {
    const { ctx } = p;
    const stop = t + dur + 0.6;
    const g = amp(ctx, p.out);
    const lp = lowpass(ctx, Math.min(f * 7, 7000), 0.7, g);
    const o = osc(ctx, wave(ctx, 'oboe'), f, t, stop);
    o.connect(lp);
    sustainEnv(g.gain, t, 0.06, vel * 0.13, dur, 0.24, 0.85);
    vibrato(ctx, [o], t, stop, 5.2, 8, 0.3);
  },
  /** 竖琴：谐波递减波表，拨弦瞬间亮、随后变暗，低音区余音更长 */
  harp(p, t, dur, f, vel) {
    const { ctx } = p;
    const tau = f < 200 ? 0.9 : f < 500 ? 0.6 : 0.4;
    const stop = t + Math.max(dur, tau * 5);
    const g = amp(ctx, p.out);
    const lp = lowpass(ctx, f * 3, 0.5, g);
    lp.frequency.setValueAtTime(Math.min(f * 10, 9000), t);
    lp.frequency.setTargetAtTime(Math.min(f * 3, 6000), t, 0.12);
    osc(ctx, wave(ctx, 'harp'), f, t, stop).connect(lp);
    pluckEnv(g.gain, t, 0.003, vel * 0.3, tau);
  },
  /** 钟琴：正弦基音 + 2.76 倍金属分音 */
  glock(p, t, _dur, f, vel) {
    const { ctx } = p;
    const stop = t + 2.2;
    const g = amp(ctx, p.out);
    osc(ctx, 'sine', f, t, stop).connect(g);
    pluckEnv(g.gain, t, 0.002, vel * 0.12, 0.55);
    const over = amp(ctx, p.out);
    osc(ctx, 'sine', Math.min(f * 2.76, ctx.sampleRate * 0.45), t, t + 0.8).connect(over);
    pluckEnv(over.gain, t, 0.002, vel * 0.04, 0.12);
  },
  /** 远钟：简易 FM（调制比 3.5）+ 二倍泛音 */
  bell(p, t, _dur, f, vel) {
    const { ctx } = p;
    const stop = t + 5;
    const g = amp(ctx, p.out);
    const carrier = osc(ctx, 'sine', f, t, stop);
    const mod = osc(ctx, 'sine', f * 3.5, t, stop);
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 2.5, t);
    index.gain.setTargetAtTime(0, t, 0.5);
    mod.connect(index);
    index.connect(carrier.frequency);
    carrier.connect(g);
    pluckEnv(g.gain, t, 0.002, vel * 0.22, 1.3);
    const partial = amp(ctx, p.out);
    osc(ctx, 'sine', f * 2, t, stop).connect(partial);
    pluckEnv(partial.gain, t, 0.002, vel * 0.08, 0.7);
  },
  /** 定音鼓单击：鼓体 + 低通噪声槌击 */
  timpani(p, t, _dur, f, vel) {
    const { ctx } = p;
    const stop = t + 3;
    const { body, partials } = timpaniBody(p, t, stop, f);
    pluckEnv(body.gain, t, 0.004, vel * 0.55, 0.7);
    pluckEnv(partials.gain, t, 0.003, vel * 0.16, 0.25);
    const mallet = amp(ctx, p.out);
    const lp = lowpass(ctx, 1200, 0.7, mallet);
    noiseSource(ctx, t, t + 0.3, lcg(seedOf(t, f))() * 3).connect(lp);
    pluckEnv(mallet.gain, t, 0.002, vel * 0.3, 0.035);
  },
  /** 定音鼓滚奏：每秒约 13 次轻击（自动化实现，不逐击建节点），力度从 pp 渐强到 vel */
  timpaniRoll(p, t, dur, f, vel) {
    const { ctx } = p;
    const rnd = lcg(seedOf(t, f));
    const stop = t + dur + 3;
    const { body, partials } = timpaniBody(p, t, stop, f);
    const mallet = amp(ctx, p.out);
    const lp = lowpass(ctx, 900, 0.6, mallet);
    noiseSource(ctx, t, t + dur + 0.2, rnd() * 3).connect(lp);
    const rate = 13;
    const strokes = Math.max(1, Math.floor(dur * rate));
    for (const g of [body, partials, mallet]) g.gain.setValueAtTime(0, t);
    for (let k = 0; k < strokes; k++) {
      const ts = Math.max(t, t + k / rate + (rnd() - 0.5) * 0.012);
      const x = strokes > 1 ? k / (strokes - 1) : 1;
      const level = vel * (0.1 + 0.9 * x * x) * (0.9 + rnd() * 0.2);
      body.gain.setTargetAtTime(level * 0.4, ts, 0.004);
      body.gain.setTargetAtTime(level * 0.3, ts + 0.012, 0.05);
      partials.gain.setTargetAtTime(level * 0.1, ts, 0.004);
      partials.gain.setTargetAtTime(level * 0.06, ts + 0.012, 0.04);
      mallet.gain.setTargetAtTime(level * 0.16, ts, 0.003);
      mallet.gain.setTargetAtTime(0, ts + 0.01, 0.02);
    }
    const end = t + dur;
    body.gain.setTargetAtTime(0, end, 0.5);
    partials.gain.setTargetAtTime(0, end, 0.2);
  },
  /** 镲击：高通噪声（先快后慢两段衰减）+ 非谐方波金属分音 */
  cymbal(p, t, _dur, _f, vel) {
    const { ctx } = p;
    const stop = t + 4.5;
    const g = amp(ctx, p.out);
    const peak = filter(ctx, 'peaking', 8000, 0.8, g, 5);
    const hp = filter(ctx, 'highpass', 3200, 0.7, peak);
    noiseSource(ctx, t, stop, lcg(seedOf(t, 1))() * 3).connect(hp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.2, t + 0.003);
    g.gain.setTargetAtTime(vel * 0.07, t + 0.003, 0.09);
    g.gain.setTargetAtTime(0, t + 0.25, 1.3);
    const metal = amp(ctx, p.out);
    const mhp = filter(ctx, 'highpass', 5000, 0.7, metal);
    for (const r of [1, 1.483, 1.932]) osc(ctx, 'square', 431 * r, t, t + 2.5).connect(mhp);
    pluckEnv(metal.gain, t, 0.002, vel * 0.025, 0.6);
  },
  /** 吊镲软槌滚奏：带通噪声渐强、频带上移，17Hz 颗粒感，落拍处收住（通常接镲击） */
  swell(p, t, dur, _f, vel) {
    const { ctx } = p;
    const stop = t + dur + 1.2;
    const g = amp(ctx, p.out);
    const bp = filter(ctx, 'bandpass', 3500, 0.6, g);
    bp.frequency.setValueAtTime(3500, t);
    bp.frequency.exponentialRampToValueAtTime(7500, t + dur);
    const ripple = ctx.createGain();
    ripple.gain.value = 0.8;
    ripple.connect(bp);
    const lfo = osc(ctx, 'sine', 17, t, stop);
    const depth = ctx.createGain();
    depth.gain.value = 0.2;
    lfo.connect(depth).connect(ripple.gain);
    noiseSource(ctx, t, stop, lcg(seedOf(t, 2))() * 3).connect(ripple);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vel * 0.13, 0.0002), t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.25);
  },
  /** 大鼓：下滑正弦 + 低通噪声"闷击" */
  bassDrum(p, t, _dur, _f, vel) {
    const { ctx } = p;
    const stop = t + 2;
    const g = amp(ctx, p.out);
    const o = osc(ctx, 'sine', 88, t, stop);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    o.connect(g);
    pluckEnv(g.gain, t, 0.006, vel * 0.7, 0.4);
    const thump = amp(ctx, p.out);
    const lp = lowpass(ctx, 260, 0.7, thump);
    noiseSource(ctx, t, t + 0.3, lcg(seedOf(t, 3))() * 3).connect(lp);
    pluckEnv(thump.gain, t, 0.003, vel * 0.3, 0.05);
  },
};

type Eq = readonly [BiquadFilterType, number, number, number?];

/** 各声部电平 / 声像（乐队座位）/ 混响送量（越靠后越湿）/ 声部总线上的共鸣峰 */
const MIX: Record<Instrument, { level: number; pan: number; send: number; body?: readonly Eq[] }> = {
  violins: { level: 1, pan: -0.5, send: 0.34, body: [['highpass', 190, 0.7], ['peaking', 300, 1.3, 3], ['peaking', 2300, 1.4, 3.5], ['lowpass', 7500, 0.5]] },
  violins2: { level: 1, pan: -0.26, send: 0.34, body: [['highpass', 190, 0.7], ['peaking', 300, 1.3, 3], ['peaking', 2100, 1.4, 3], ['lowpass', 7000, 0.5]] },
  violas: { level: 1, pan: 0.1, send: 0.36, body: [['highpass', 120, 0.7], ['peaking', 340, 1.2, 3.5], ['peaking', 1700, 1.4, 3], ['lowpass', 5200, 0.5]] },
  cellos: { level: 1, pan: 0.32, send: 0.34, body: [['highpass', 55, 0.7], ['peaking', 260, 1.1, 3], ['peaking', 1300, 1.3, 2.5], ['lowpass', 4200, 0.5]] },
  basses: { level: 1, pan: 0.52, send: 0.28, body: [['peaking', 110, 1, 2], ['peaking', 700, 1.2, 2], ['lowpass', 2200, 0.5]] },
  pizz: { level: 1, pan: 0.46, send: 0.32, body: [['peaking', 140, 1, 2.5], ['lowpass', 2600, 0.5]] },
  strings: { level: 1, pan: 0, send: 0.38, body: [['highpass', 60, 0.7], ['peaking', 300, 1.2, 3], ['peaking', 2000, 1.3, 3], ['lowpass', 6500, 0.5]] },
  tremolo: { level: 1, pan: 0, send: 0.38, body: [['highpass', 60, 0.7], ['peaking', 300, 1.2, 3], ['peaking', 2000, 1.3, 3], ['lowpass', 6500, 0.5]] },
  horn: { level: 1, pan: -0.2, send: 0.5, body: [['peaking', 520, 1, 4], ['lowpass', 2800, 0.6]] },
  trumpet: { level: 1, pan: 0.06, send: 0.38, body: [['peaking', 1250, 1.1, 3], ['peaking', 2600, 1.6, 2], ['lowpass', 8500, 0.5]] },
  trombone: { level: 1, pan: 0.24, send: 0.42, body: [['peaking', 620, 1, 3], ['lowpass', 3600, 0.6]] },
  flute: { level: 1, pan: -0.1, send: 0.4, body: [['highpass', 240, 0.7]] },
  lead: { level: 1, pan: 0.06, send: 0.38, body: [['highpass', 200, 0.7], ['peaking', 1150, 2, 4], ['peaking', 2900, 2.2, 2.5]] },
  harp: { level: 1, pan: -0.62, send: 0.42 },
  glock: { level: 1, pan: 0.2, send: 0.5 },
  bell: { level: 1, pan: -0.22, send: 0.55 },
  timpani: { level: 1, pan: -0.1, send: 0.42 },
  timpaniRoll: { level: 1, pan: -0.1, send: 0.42 },
  cymbal: { level: 0.9, pan: 0.3, send: 0.4 },
  swell: { level: 0.9, pan: 0.3, send: 0.4 },
  bassDrum: { level: 1, pan: 0.18, send: 0.42 },
};

// ---------------------------------------------------------------------------
// 号角会话：一段或多段合成号角的一次播放
// ---------------------------------------------------------------------------

interface Track {
  phrase: Phrase;
  base: number;
  index: number;
  done: boolean;
}

class StingSession {
  readonly out: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly channels = new Map<Instrument, AudioNode>();
  private readonly bank: VibratoBank;
  /** 各声部正在发声的音符结束时刻（复音限流用） */
  private readonly active = new Map<Instrument, number[]>();
  private tracks: Track[] = [];
  stopping = false;

  constructor(private readonly ctx: BaseAudioContext, dest: AudioNode, start: number) {
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, start);
    this.out.gain.linearRampToValueAtTime(STING_GAIN, start + 0.03);
    this.out.connect(dest);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulseBuffer(ctx);
    reverb.connect(this.out);
    this.dry = ctx.createGain();
    this.dry.connect(this.out);
    this.wet = ctx.createGain();
    // 混响前切掉低频，避免大厅尾音发闷
    this.wet.connect(filter(ctx, 'highpass', 170, 0.7, reverb));
    this.bank = new VibratoBank(ctx, start);
  }

  /** 全部音符都已交给音频线程 */
  get idle(): boolean {
    return this.tracks.length === 0;
  }

  private channel(inst: Instrument): AudioNode {
    const existing = this.channels.get(inst);
    if (existing) return existing;
    const mix = MIX[inst];
    const input = this.ctx.createGain();
    input.gain.value = mix.level;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = mix.pan;
    let tail: AudioNode = input;
    for (const [type, freq, q, gain] of mix.body ?? []) {
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = Math.min(freq, this.ctx.sampleRate * 0.45);
      f.Q.value = q;
      if (gain) f.gain.value = gain;
      tail.connect(f);
      tail = f;
    }
    tail.connect(pan);
    pan.connect(this.dry);
    const send = this.ctx.createGain();
    send.gain.value = mix.send;
    pan.connect(send);
    send.connect(this.wet);
    this.channels.set(inst, input);
    return input;
  }

  /** 该声部在 [t, end) 开始时仍在发声的音符数，并登记本音。 */
  private crowd(inst: Instrument, t: number, end: number): number {
    const list = (this.active.get(inst) ?? []).filter((e) => e > t);
    const count = list.length;
    list.push(end);
    this.active.set(inst, list);
    return count;
  }

  /** 叠加一段号角。 */
  addSting(phrase: Phrase, start: number): void {
    this.tracks.push({ phrase, base: start, index: 0, done: false });
  }

  /** 把 [now, until) 内的音符交给音频线程。 */
  pump(until: number): void {
    if (this.stopping) return;
    const now = this.ctx.currentTime;
    for (const track of this.tracks) {
      const spb = 60 / track.phrase.bpm;
      const events = track.phrase.events;
      while (!track.done) {
        if (track.index >= events.length) { track.done = true; break; }
        const ev: NoteEvent = events[track.index]!;
        const t = track.base + ev.at * spb;
        if (t >= until) break;
        track.index++;
        // 主线程被卡住时丢弃过期音符，不在恢复瞬间一次性堆叠
        if (t < now - 0.08) continue;
        const at = Math.max(t, now);
        const dur = ev.dur * spb;
        const play: Play = {
          ctx: this.ctx,
          out: this.channel(ev.inst),
          bank: this.bank,
          crowd: this.crowd(ev.inst, at, at + dur),
        };
        VOICES[ev.inst](play, at, dur, hzOf(ev.midi), ev.vel);
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
    this.bank.stop(now + seconds + 3);
  }
}

/**
 * 输出链：master（偏好音量）→ 扬声器。合成号角先过总线压缩保证多声部叠加不削波；
 * 录制成品已做过母带，直接进 master。
 */
function outputChain(ctx: BaseAudioContext): { master: GainNode; synth: AudioNode } {
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  comp.connect(master);
  return { master, synth: comp };
}

/** 一次结算曲播放；source 为 null 表示仍在加载 */
interface ThemePlayback {
  theme: ResultTheme;
  /** 曲目电平与淡出 */
  out: GainNode;
  /** 号角压低 */
  duck: GainNode;
  source: AudioBufferSourceNode | null;
  stopping: boolean;
  ended: boolean;
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
  private master: GainNode | null = null;
  private synth: AudioNode | null = null;
  private playback: ThemePlayback | null = null;
  private sting: StingSession | null = null;
  /** 解码后的结算曲（按 URL 缓存；失败的请求不缓存，下次重试） */
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lifecycle: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;

  /** 当前正在播放（含加载中；未淡出、未播完）的结算曲 */
  get theme(): ResultTheme | null {
    const p = this.playback;
    return p && !p.stopping && !p.ended ? p.theme : null;
  }

  /**
   * 播放一次结算曲，播完即止；同曲正在播放时不重启。
   * 静音时照常排播（master 为 0），中途取消静音能从当前位置听到。
   */
  play(theme: ResultTheme): void {
    this.watch();
    if (this.theme === theme) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.releasePlayback(0.5);
    const out = ctx.createGain();
    out.gain.value = RESULT_TRACKS[theme].gain;
    out.connect(this.master);
    const duck = ctx.createGain();
    duck.connect(out);
    const playback: ThemePlayback = { theme, out, duck, source: null, stopping: false, ended: false };
    this.playback = playback;
    void this.load(ctx, RESULT_TRACKS[theme].url).then((buffer) => {
      if (playback.stopping || this.ctx !== ctx) return;
      if (!buffer) {
        playback.ended = true;
        this.finishPlayback(playback);
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(duck);
      source.onended = () => {
        playback.ended = true;
        source.disconnect();
        this.finishPlayback(playback);
      };
      source.start(ctx.currentTime + 0.02);
      playback.source = source;
    });
  }

  /** 升级：叠加合成号角；凯旋曲在号角期间压低，战败曲淡出让位（升级是正向时刻）。 */
  levelUp(): void {
    this.watch();
    const ctx = this.ensureContext();
    if (!ctx || !this.synth) return;
    const at = ctx.currentTime + 0.05;
    const current = this.theme;
    if (current === 'victory') {
      const g = this.playback!.duck.gain;
      g.cancelScheduledValues(at);
      g.setTargetAtTime(STING_DUCK, at, 0.08);
      g.setTargetAtTime(1, at + phraseSeconds(LEVEL_UP_STING) + 0.4, 0.6);
    } else if (current === 'defeat') {
      this.releasePlayback(0.6);
    }
    if (!this.sting) this.sting = new StingSession(ctx, this.synth, at);
    this.sting.addSting(LEVEL_UP_STING, at);
    this.pump();
    this.ensureTimer();
  }

  stop(fadeSeconds = 0.8): void {
    this.releasePlayback(fadeSeconds);
    const sting = this.sting;
    this.sting = null;
    if (sting) {
      sting.fadeOut(fadeSeconds);
      setTimeout(() => sting.out.disconnect(), fadeSeconds * 1000 + 400);
    }
    this.stopTimer();
    // 淡出后让音频线程休眠；下次 play 时 ensureContext 会恢复（页面已有过用户手势）
    setTimeout(() => this.sleepIfIdle(), fadeSeconds * 1000 + 600);
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
    this.master = null;
    this.synth = null;
    this.buffers.clear();
  }

  private load(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => {
          this.buffers.delete(url);
          return null;
        });
      this.buffers.set(url, pending);
    }
    return pending;
  }

  /** 播完（或加载失败）后回收节点 */
  private finishPlayback(playback: ThemePlayback): void {
    playback.out.disconnect();
    if (this.playback === playback) this.playback = null;
    this.sleepIfIdle();
  }

  private releasePlayback(fadeSeconds: number): void {
    const old = this.playback;
    if (!old) return;
    this.playback = null;
    old.stopping = true;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    old.out.gain.cancelScheduledValues(now);
    old.out.gain.setTargetAtTime(0, now, Math.max(0.02, fadeSeconds / 4));
    try { old.source?.stop(now + fadeSeconds + 0.3); } catch { /* 已停止 */ }
    setTimeout(() => old.out.disconnect(), fadeSeconds * 1000 + 400);
  }

  private get active(): boolean {
    return this.playback !== null || this.sting !== null;
  }

  private sleepIfIdle(): void {
    if (!this.active && this.ctx?.state === 'running') void this.ctx.suspend().catch(() => undefined);
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
    const chain = outputChain(this.ctx);
    this.master = chain.master;
    this.synth = chain.synth;
    this.master.gain.value = preferenceVolume();
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** 订阅偏好/可见性/首个手势（只挂一次）。 */
  private watch(): void {
    if (this.lifecycle) return;
    this.lifecycle = new AbortController();
    const options = { signal: this.lifecycle.signal };
    const unlock = () => {
      if (this.ctx?.state === 'suspended' && !document.hidden && this.active) void this.ctx.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else if (this.active) void this.ctx.resume().catch(() => undefined);
    }, options);
    window.addEventListener('pagehide', () => { void this.ctx?.suspend().catch(() => undefined); }, options);
    this.unsubscribe = subscribePlayerPreferences(() => this.syncVolume());
  }

  private syncVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(preferenceVolume(), this.ctx.currentTime, 0.1);
  }

  /** 号角音符全部交给音频线程后停掉调度定时器 */
  private pump(): void {
    if (!this.ctx || !this.sting) return;
    this.sting.pump(this.ctx.currentTime + LOOKAHEAD_SECONDS);
    if (this.sting.idle) this.stopTimer();
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
