/**
 * 状态施加音程序合成 · 8bit 芯片音风格（窗口 I · TASK-AUDIO 阶段 2，用户裁定只做状态施加音；
 * 二轮按用户反馈从「有机」音色重做为 NES/像素游戏式 8bit——方波主体 + 噪声通道 + 量化音高步进）。
 * 全部 Web Audio 振荡器/噪声 + 指数包络，零素材依赖；
 * poison/burning/frozen 三个状态走既有采样（AudioManager 侧），其余 15 状态在此合成。
 * STATUS_SYNTHS + canonicalStatusSoundId 是「status-apply 事件 → 音效」的唯一事实源，
 * AudioManager.playStatusApply 消费；覆盖范围由 tests/unit/audioStatusSynth.test.ts
 * 对引擎 status.ts 各 id 集合做快照锁定。
 * 合成先例：assets/audio/archive/legacy_gem_chain_synth.ts.txt（square 波消除音）。
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

/** 8bit 方波短音符：固定音高、4ms 急起速、短促收尾（芯片音的基本单元）。 */
function chipNote(
  ctx: AudioContext,
  bus: AudioNode,
  t: number,
  note: number,
  dur: number,
  peak = 0.14,
  filter?: ToneSpec['filter'],
): void {
  tone(ctx, bus, t, {
    type: 'square',
    from: hz(note),
    dur,
    peak,
    attack: 0.004,
    filter,
  });
}

/** 8bit 琶音/跑句：等间隔一串方波音符（音符长 ≈ 步长，干净不糊）。 */
function chipArp(
  ctx: AudioContext,
  bus: AudioNode,
  t: number,
  notes: number[],
  step: number,
  peak = 0.13,
  filter?: ToneSpec['filter'],
): void {
  const noteDur = Math.max(step * 0.95, 0.02);
  notes.forEach((note, i) => chipNote(ctx, bus, t + i * step, note, noteDur, peak, filter));
}

/** 方波双音（和音/颤音对）。 */
function chipDyad(ctx: AudioContext, bus: AudioNode, t: number, notes: [number, number], dur: number, peak = 0.11): void {
  chipNote(ctx, bus, t, notes[0], dur, peak);
  chipNote(ctx, bus, t, notes[1], dur, peak);
}

/* ------------------------------------------------------------------ */
/* 15 个状态施加音（8bit 配方）                                         */
/* ------------------------------------------------------------------ */

/** 流血：噪声溅点 + 两轮下行三连音（HP 一格格流失）。 */
function bleed(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.035, peak: 0.13, filter: { type: 'highpass', from: 2400 } });
  chipArp(ctx, bus, t + 0.02, [81, 77, 74], 0.05, 0.14);
  chipArp(ctx, bus, t + 0.19, [79, 76, 72], 0.05, 0.11);
}

/** 沉默：量化音阶断崖式下坠（power-down）+ 一声闷「噗」。 */
function silence(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [84, 79, 74], 0.06, 0.13);
  chipNote(ctx, bus, t + 0.19, 67, 0.1, 0.1, { type: 'lowpass', from: 500 });
  noise(ctx, bus, t + 0.26, { dur: 0.05, peak: 0.11, filter: { type: 'lowpass', from: 1100 } });
}

/** 击晕：低方波闷棍 + 高音小二度打转（头顶转圈星星）。 */
function stun(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: 170, to: 65, dur: 0.14, peak: 0.26 });
  const trill: number[] = [];
  for (let i = 0; i < 5; i++) trill.push(i % 2 === 0 ? 84 : 83);
  chipArp(ctx, bus, t + 0.16, trill, 0.045, 0.09);
}

/** 缠绕：噪声弹响 + 半音下行「吱吱」收紧 + 底下窸窣。 */
function entangle(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.03, peak: 0.15, filter: { type: 'highpass', from: 1800 } });
  chipArp(ctx, bus, t + 0.03, [64, 62, 61, 60], 0.06, 0.12);
  noise(ctx, bus, t + 0.1, { dur: 0.2, peak: 0.08, filter: { type: 'bandpass', from: 520, q: 1 } });
}

/** 织网：三连「咻」下滑 + 高频丝线刮擦。 */
function web(ctx: AudioContext, bus: AudioNode, t: number): void {
  for (let i = 0; i < 3; i++) {
    tone(ctx, bus, t + i * 0.095, { type: 'square', from: 950 - i * 160, to: 260, dur: 0.06, peak: 0.12 });
    noise(ctx, bus, t + i * 0.095, { dur: 0.025, peak: 0.09, filter: { type: 'highpass', from: 3200 } });
  }
}

/** 屏障：上行大琶音 + 纯五度定格（经典 8bit buff 音）。 */
function barrier(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [72, 76, 79, 84], 0.05, 0.13);
  chipDyad(ctx, bus, t + 0.21, [79, 84], 0.16, 0.1);
}

/** 下潮：下行五声泡音 + 一颗上冒水泡。 */
function submerged(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [72, 69, 65, 62, 57], 0.055, 0.13, { type: 'lowpass', from: 900 });
  tone(ctx, bus, t + 0.3, { type: 'square', from: 190, to: 430, dur: 0.08, peak: 0.1 });
}

/** 猎人标记：锁定确认「哔—咻—咚」（高双鸣 + 低音落锁）。 */
function marked(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipNote(ctx, bus, t, 81, 0.05, 0.14);
  chipNote(ctx, bus, t + 0.07, 88, 0.06, 0.15);
  chipNote(ctx, bus, t + 0.15, 64, 0.08, 0.14);
}

/** 疾病：小二度刺耳双音整格下坠 + 病气噪声。 */
function disease(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipDyad(ctx, bus, t, [72, 73], 0.16, 0.09);
  chipDyad(ctx, bus, t + 0.17, [70, 71], 0.18, 0.09);
  noise(ctx, bus, t + 0.02, { dur: 0.3, peak: 0.06, filter: { type: 'bandpass', from: 320, q: 1.2 } });
}

/** 诅咒：下行阴暗琶音 + 低音持续的不协和铺底。 */
function curse(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [69, 65, 62, 56], 0.085, 0.12);
  chipNote(ctx, bus, t, 45, 0.42, 0.12);
  chipNote(ctx, bus, t + 0.02, 44, 0.4, 0.06);
}

/** 死亡标记：小二度低音丧钟 + 高频不祥颤音。 */
function deathMark(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipDyad(ctx, bus, t, [40, 43], 0.5, 0.14);
  chipArp(ctx, bus, t + 0.05, [76, 77, 76, 77], 0.045, 0.055);
}

/** 狂怒：两连上行琶音冲刺 + 低吼收尾。 */
function rage(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [60, 64, 67, 72], 0.035, 0.12);
  chipArp(ctx, bus, t + 0.15, [72, 76, 79, 84], 0.035, 0.13);
  tone(ctx, bus, t + 0.3, { type: 'square', from: 110, to: 78, dur: 0.14, peak: 0.17 });
  noise(ctx, bus, t + 0.3, { dur: 0.12, peak: 0.07, filter: { type: 'bandpass', from: 480, q: 1 } });
}

/** 魅惑：上行大调闪音 + 双跳确认（E 大调亮片）。 */
function charm(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [76, 80, 83, 88], 0.045, 0.11);
  chipNote(ctx, bus, t + 0.2, 83, 0.06, 0.11);
  chipNote(ctx, bus, t + 0.27, 88, 0.1, 0.12);
}

/** 法力燃烧：一串快速下行音阶被抽干 + 高频嘶声。 */
function manaBurn(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [84, 82, 79, 77, 74, 72, 70, 67], 0.032, 0.11);
  noise(ctx, bus, t, { dur: 0.2, peak: 0.09, filter: { type: 'highpass', from: 3400 } });
}

/** 狼化：方波狼嚎轮廓（上滑→颤音悬停→长下滑）。 */
function wolf(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: hz(57), to: hz(64), dur: 0.12, peak: 0.14 });
  tone(ctx, bus, t + 0.12, { type: 'square', from: hz(64), dur: 0.16, peak: 0.12, vibrato: { rate: 7, depth: 9 } });
  tone(ctx, bus, t + 0.28, { type: 'square', from: hz(64), to: hz(45), dur: 0.28, peak: 0.14 });
  noise(ctx, bus, t, { dur: 0.32, peak: 0.05, filter: { type: 'bandpass', from: 680, q: 1.1 } });
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
