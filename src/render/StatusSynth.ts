/**
 * 状态施加音程序合成（窗口 I · TASK-AUDIO 阶段 2，用户裁定只做状态施加音）。
 * 全部 Web Audio 振荡器/噪声 + 指数包络，零素材依赖；
 * poison/burning/frozen 三个状态走既有采样（AudioManager 侧），其余 15 状态在此合成。
 * STATUS_SYNTHS + canonicalStatusSoundId 是「status-apply 事件 → 音效」的唯一事实源，
 * AudioManager.playStatusApply 消费；覆盖范围由 tests/unit/audioStatusSynth.test.ts
 * 对引擎 status.ts 各 id 集合做快照锁定。
 * 合成先例：assets/audio/archive/legacy_gem_chain_synth.ts.txt。
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
  applyEnv(gain, t, spec.peak, spec.attack ?? 0.012, spec.dur);

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

/** 噪声层：白噪 + 可选滤波扫频 + 包络。 */
function noise(ctx: AudioContext, bus: AudioNode, t: number, spec: NoiseSpec): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, spec.dur + 0.02);

  const gain = ctx.createGain();
  applyEnv(gain, t, spec.peak, spec.attack ?? 0.008, spec.dur);

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

/** 流血：两声下行「滴落」。 */
function bleed(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'sine', from: 950, to: 470, dur: 0.1, peak: 0.22 });
  tone(ctx, bus, t + 0.13, { type: 'sine', from: 680, to: 310, dur: 0.11, peak: 0.17 });
}

/** 沉默：闷掉的下坠扫音（能量被压灭）。 */
function silence(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, {
    type: 'sine',
    from: 760,
    to: 170,
    dur: 0.32,
    peak: 0.2,
    filter: { type: 'lowpass', from: 900, to: 200 },
  });
}

/** 击晕：钝击 + 高频耳鸣余音。 */
function stun(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'sine', from: 190, to: 65, dur: 0.24, peak: 0.4 });
  tone(ctx, bus, t + 0.02, { type: 'sine', from: 1250, dur: 0.45, peak: 0.11, attack: 0.02 });
}

/** 缠绕：藤蔓收紧——两声带通噪声「吱」。 */
function entangle(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.12, peak: 0.26, filter: { type: 'bandpass', from: 520, to: 220, q: 2.2 } });
  noise(ctx, bus, t + 0.1, { dur: 0.16, peak: 0.2, filter: { type: 'bandpass', from: 380, to: 150, q: 2.4 } });
  tone(ctx, bus, t + 0.1, { type: 'triangle', from: 150, to: 92, dur: 0.16, peak: 0.12 });
}

/** 织网：丝线刮擦——三声短高频噪声。 */
function web(ctx: AudioContext, bus: AudioNode, t: number): void {
  for (let i = 0; i < 3; i++) {
    noise(ctx, bus, t + i * 0.07, {
      dur: 0.05,
      peak: 0.19,
      filter: { type: 'highpass', from: 2300 + i * 350 },
    });
  }
}

/** 屏障：金属盾面格挡——双泛音铿 + 起音噪点。 */
function barrier(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.03, peak: 0.16, filter: { type: 'highpass', from: 3200 } });
  tone(ctx, bus, t + 0.005, { type: 'triangle', from: 523, dur: 0.2, peak: 0.2 });
  tone(ctx, bus, t + 0.005, { type: 'triangle', from: 786, dur: 0.24, peak: 0.13 });
}

/** 下潮：水波吞没——下行水滑音 + 一个上冒水泡。 */
function submerged(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, {
    type: 'sine',
    from: 520,
    to: 140,
    dur: 0.36,
    peak: 0.28,
    filter: { type: 'lowpass', from: 820, to: 180 },
  });
  tone(ctx, bus, t + 0.16, { type: 'sine', from: 190, to: 430, dur: 0.09, peak: 0.11 });
}

/** 猎人标记：锁定确认——两声上行短鸣。 */
function marked(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'sine', from: 980, dur: 0.07, peak: 0.18 });
  tone(ctx, bus, t + 0.09, { type: 'sine', from: 1470, dur: 0.11, peak: 0.23 });
}

/** 疾病：病气低鸣——带颤音的暗色持续音。 */
function disease(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, {
    type: 'triangle',
    from: 212,
    to: 182,
    dur: 0.42,
    peak: 0.2,
    vibrato: { rate: 6.5, depth: 13 },
  });
}

/** 诅咒：下行咒音——主音 + 低八度副体。 */
function curse(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, {
    type: 'sawtooth',
    from: 208,
    to: 98,
    dur: 0.46,
    peak: 0.15,
    filter: { type: 'lowpass', from: 950, to: 320 },
  });
  tone(ctx, bus, t, { type: 'sine', from: 104, to: 49, dur: 0.46, peak: 0.22 });
}

/** 死亡标记：丧钟——根音 + 小三度，长衰减。 */
function deathMark(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'sine', from: 98, dur: 0.85, peak: 0.28, attack: 0.008 });
  tone(ctx, bus, t + 0.01, { type: 'sine', from: 116.5, dur: 0.8, peak: 0.15, attack: 0.01 });
}

/** 狂怒：上扬咆哮——锯齿升 + 带通噪声层。 */
function rage(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, {
    type: 'sawtooth',
    from: 85,
    to: 240,
    dur: 0.32,
    peak: 0.22,
    filter: { type: 'lowpass', from: 480, to: 1600 },
  });
  noise(ctx, bus, t, { dur: 0.28, peak: 0.13, filter: { type: 'bandpass', from: 380, q: 1.1 } });
}

/** 魅惑：上行闪烁琶音（E5-G#5-B5-E6）。 */
function charm(ctx: AudioContext, bus: AudioNode, t: number): void {
  const notes = [659.3, 830.6, 987.8, 1318.5];
  for (let i = 0; i < notes.length; i++) {
    tone(ctx, bus, t + i * 0.07, { type: 'triangle', from: notes[i], dur: 0.12, peak: 0.15 });
  }
}

/** 法力燃烧：法力蒸散——方波速降 + 高频嘶声。 */
function manaBurn(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: 880, to: 110, dur: 0.18, peak: 0.16 });
  noise(ctx, bus, t + 0.01, { dur: 0.16, peak: 0.17, filter: { type: 'highpass', from: 2800 } });
}

/** 狼化：短促低吼。 */
function wolf(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, {
    type: 'sawtooth',
    from: 132,
    to: 84,
    dur: 0.3,
    peak: 0.22,
    filter: { type: 'lowpass', from: 620, to: 300 },
  });
  noise(ctx, bus, t, { dur: 0.26, peak: 0.11, filter: { type: 'bandpass', from: 240, q: 1.4 } });
}

/** 合成状态音表；键为归一化 statusId（下划线形态）。 */
export const STATUS_SYNTHS: Readonly<Record<string, StatusSynthFn>> = {
  bleed,
  silence,
  stun,
  entangle,
  web,
  barrier,
  submerged,
  marked,
  disease,
  curse,
  death_mark: deathMark,
  rage,
  charm,
  mana_burn: manaBurn,
  wolf,
};

/** 走既有采样而非合成的三个状态（AudioManager 侧接线）。 */
export const SAMPLE_STATUS_KEYS: readonly string[] = ['poison', 'burning', 'frozen'];

/**
 * statusId → 归一化音效键；无对应音效（未落地/未知状态）返回 null。
 * 归一规则与 statusBadges 一致：小写、连字符/下划线互转，别名收敛
 * （cursed→curse、enraged→rage、charmed→charm、lycanthropy/wolf-form→wolf）。
 */
export function canonicalStatusSoundId(statusId: string): string | null {
  const normalized = statusId.toLowerCase().replace(/-/g, '_');
  const aliased =
    normalized === 'cursed'
      ? 'curse'
      : normalized === 'enraged'
        ? 'rage'
        : normalized === 'charmed'
          ? 'charm'
          : normalized === 'lycanthropy' || normalized === 'wolf_form'
            ? 'wolf'
            : normalized;
  if (SAMPLE_STATUS_KEYS.includes(aliased)) return aliased;
  return aliased in STATUS_SYNTHS ? aliased : null;
}
