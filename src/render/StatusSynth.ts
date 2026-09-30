/**
 * 状态演出提示音（拦截/挣脱/驱散/触发…）· 8bit 芯片音合成，这些提示音本身就是合成设计，没有采样版。
 * 状态「施加音」一律走采样：status/ 目录 17 个 + poison/burning/frozen 三个技能采样（AudioManager 侧），
 * 覆盖范围由 tests/unit/audioStatusSynth.test.ts 对引擎 status.ts 各 id 集合锁定。
 */

export type StatusSynthFn = (ctx: AudioContext, bus: AudioNode, t: number) => void;

interface ToneSpec {
  type: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  peak: number;
  attack?: number;
  /** 可选滤波（低通/高通/带通），from→to 支持扫频。 */
  filter?: { type: BiquadFilterType; from: number; to?: number; q?: number };
  /** 连接到主振荡器频率参数的颤音（vibrato）。 */
  vibrato?: { rate: number; depth: number };
}

interface NoiseSpec {
  dur: number;
  peak: number;
  attack?: number;
  filter?: { type: BiquadFilterType; from: number; to?: number; q?: number };
}

function noiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** 指数包络：0.0001 → peak（attack 段）→ 0.0001（dur 处收干净）。所有值恒正，满足 exponentialRamp。 */
function applyEnv(gain: GainNode, t: number, peak: number, attack: number, dur: number): void {
  const a = Math.min(attack, dur * 0.5);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** 单振荡器音色：频率滑线 + 可选滤波/颤音 + 包络。 */
function tone(ctx: AudioContext, bus: AudioNode, t: number, spec: ToneSpec): void {
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.from, t);
  if (spec.to !== undefined && spec.to !== spec.from) {
    osc.frequency.exponentialRampToValueAtTime(spec.to, t + spec.dur);
  }
  if (spec.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = spec.vibrato.rate;
    const depth = ctx.createGain();
    depth.gain.value = spec.vibrato.depth;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + spec.dur + 0.05);
  }

  const gain = ctx.createGain();
  applyEnv(gain, t, spec.peak, spec.attack ?? 0.008, spec.dur);

  let head: AudioNode = osc;
  if (spec.filter) {
    const f = ctx.createBiquadFilter();
    f.type = spec.filter.type;
    f.frequency.setValueAtTime(spec.filter.from, t);
    if (spec.filter.to !== undefined && spec.filter.to !== spec.filter.from) {
      f.frequency.exponentialRampToValueAtTime(spec.filter.to, t + spec.dur);
    }
    if (spec.filter.q !== undefined) f.Q.value = spec.filter.q;
    head.connect(f);
    head = f;
  }
  head.connect(gain);
  gain.connect(bus);
  osc.start(t);
  osc.stop(t + spec.dur + 0.05);
}

/** 噪声层：白噪 + 可选滤波扫频 + 包络（NES 噪声通道的近似）。 */
function noise(ctx: AudioContext, bus: AudioNode, t: number, spec: NoiseSpec): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, spec.dur + 0.02);

  const gain = ctx.createGain();
  applyEnv(gain, t, spec.peak, spec.attack ?? 0.005, spec.dur);

  let head: AudioNode = src;
  if (spec.filter) {
    const f = ctx.createBiquadFilter();
    f.type = spec.filter.type;
    f.frequency.setValueAtTime(spec.filter.from, t);
    if (spec.filter.to !== undefined && spec.filter.to !== spec.filter.from) {
      f.frequency.exponentialRampToValueAtTime(spec.filter.to, t + spec.dur);
    }
    if (spec.filter.q !== undefined) f.Q.value = spec.filter.q;
    head.connect(f);
    head = f;
  }
  head.connect(gain);
  gain.connect(bus);
  src.start(t);
  src.stop(t + spec.dur + 0.03);
}

/* ------------------------------------------------------------------ */
/* 8bit 芯片音积木：MIDI 音号 + 方波短音符 + 量化跑句                    */
/* ------------------------------------------------------------------ */

/** MIDI 音号 → 频率（A4=69=440Hz）。 */
function hz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * 8bit 方波短音符：固定音高、急起速、按 dur 收尾（芯片音的基本单元）。
 * note ≥ 40 时自动叠一支低八度副振荡器（0.45×峰值）加厚，避免单方波在采样旁发飘。
 */
function chipNote(
  ctx: AudioContext,
  bus: AudioNode,
  t: number,
  note: number,
  dur: number,
  peak = 0.28,
  filter?: ToneSpec['filter'],
): void {
  tone(ctx, bus, t, { type: 'square', from: hz(note), dur, peak, attack: 0.005, filter });
  if (note >= 40) {
    tone(ctx, bus, t, { type: 'square', from: hz(note - 12), dur, peak: peak * 0.45, attack: 0.005, filter });
  }
}

/** 8bit 琶音/跑句：等间隔一串方波音符（音符长 ≈ 步长，干净不糊）。 */
function chipArp(
  ctx: AudioContext,
  bus: AudioNode,
  t: number,
  notes: number[],
  step: number,
  peak = 0.26,
  filter?: ToneSpec['filter'],
): void {
  const noteDur = Math.max(step * 0.95, 0.03);
  notes.forEach((note, i) => chipNote(ctx, bus, t + i * step, note, noteDur, peak, filter));
}

/** 方波双音（和音/颤音对，带低八度加厚）。 */
function chipDyad(ctx: AudioContext, bus: AudioNode, t: number, notes: [number, number], dur: number, peak = 0.2): void {
  chipNote(ctx, bus, t, notes[0], dur, peak);
  chipNote(ctx, bus, t, notes[1], dur, peak * 0.75);
}

/* ------------------------------------------------------------------ */
/* 状态演出提示音（非施加：拦截 / 挣脱 / 驱散 / 触发…）                  */
/* 比施加音短、轻（0.25~0.6s，峰值 ≤0.26），叠在伤害/光效上不抢戏。         */
/* ------------------------------------------------------------------ */

/** 免疫：金属「叮」+ 短五度（被挡下）。 */
function cueImmune(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipNote(ctx, bus, t, 88, 0.08, 0.2);
  chipDyad(ctx, bus, t + 0.07, [79, 86], 0.22, 0.14);
  noise(ctx, bus, t, { dur: 0.05, peak: 0.1, filter: { type: 'highpass', from: 5000 } });
}

/** 恐怖换位：两音「后退」下行 + 颤抖。 */
function cueTerror(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipNote(ctx, bus, t, 70, 0.1, 0.18);
  tone(ctx, bus, t + 0.1, { type: 'square', from: hz(66), to: hz(58), dur: 0.3, peak: 0.16, vibrato: { rate: 11, depth: 14 } });
}

/** 冰冻吞额外回合：冷硬「咔」+ 被掐断的上行（额外回合没来）。 */
function cueFrozenDeny(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.06, peak: 0.16, filter: { type: 'bandpass', from: 3000, q: 2 } });
  chipArp(ctx, bus, t + 0.05, [72, 79], 0.07, 0.18);
  chipNote(ctx, bus, t + 0.2, 66, 0.25, 0.16, { type: 'lowpass', from: 900 });
}

/** 下潮闪避：水花上冒两泡。 */
function cueSubmergeDodge(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: 180, to: 520, dur: 0.08, peak: 0.16 });
  tone(ctx, bus, t + 0.1, { type: 'square', from: 220, to: 640, dur: 0.08, peak: 0.13 });
  noise(ctx, bus, t, { dur: 0.2, peak: 0.08, filter: { type: 'lowpass', from: 1200 } });
}

/** 反射：镜面回弹——上下对称滑音。 */
function cueReflect(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: 600, to: 1500, dur: 0.07, peak: 0.16 });
  tone(ctx, bus, t + 0.07, { type: 'square', from: 1500, to: 700, dur: 0.12, peak: 0.14 });
}

export type StatusCueKind =
  | 'immune' | 'terror'
  | 'frozenDeny' | 'submergeDodge' | 'reflect';

/** 状态演出提示音表（AudioManager.playStatusCue 消费）。 */
export const STATUS_CUE_SYNTHS: Readonly<Record<StatusCueKind, StatusSynthFn>> = {
  immune: cueImmune,
  terror: cueTerror,
  frozenDeny: cueFrozenDeny,
  submergeDodge: cueSubmergeDodge,
  reflect: cueReflect,
};

/** 走既有采样而非合成的三个状态（AudioManager 侧接线）。 */
export const SAMPLE_STATUS_KEYS: readonly string[] = ['poison', 'burning', 'frozen'];

/**
 * statusId → 规范键：小写、连字符/下划线互转、别名收敛
 * （cursed→curse、enraged→rage、charmed→charm、lycanthropy/wolf-form→wolf）。
 * 只做字符串归一，不查表——AudioManager 用它匹配 status/ 目录的 glob 采样键。
 */
export function normalizeStatusKey(statusId: string): string {
  const normalized = statusId.toLowerCase().replace(/-/g, '_');
  if (normalized === 'cursed') return 'curse';
  if (normalized === 'enraged') return 'rage';
  if (normalized === 'charmed') return 'charm';
  if (normalized === 'lycanthropy' || normalized === 'wolf_form') return 'wolf';
  return normalized;
}
