/**
 * 状态施加音程序合成 · 8bit 芯片音风格（窗口 I · TASK-AUDIO 阶段 2，用户裁定只做状态施加音；
 * 二轮按用户反馈重做为 NES/像素游戏式 8bit——方波主体 + 噪声通道 + 量化音高步进；
 * 三轮按用户反馈对齐既有采样的响度与时长：目标 0.9~1.4s、音符峰值 0.2~0.45
 * （对照：burning_tree 播放增益 0.62 / 0.9s，frozen 0.72 / 1.7s），音符带低八度副层加厚）。
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
/* 15 个状态施加音（8bit 配方 · 响度/时长对齐采样）                      */
/* ------------------------------------------------------------------ */

/** 流血：噪声溅点 + 两轮下行三连音 + 闷收（HP 一格格流失）。 */
function bleed(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.05, peak: 0.22, filter: { type: 'highpass', from: 2200 } });
  chipArp(ctx, bus, t + 0.03, [81, 77, 74], 0.08, 0.3);
  chipArp(ctx, bus, t + 0.42, [79, 76, 72], 0.08, 0.26);
  noise(ctx, bus, t + 0.68, { dur: 0.1, peak: 0.14, filter: { type: 'bandpass', from: 600, q: 1 } });
}

/** 沉默：音阶断崖式下坠（power-down）+ 长闷尾 + 一声「噗」。 */
function silence(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [88, 84, 79, 76, 72, 67], 0.085, 0.24);
  chipNote(ctx, bus, t + 0.53, 63, 0.5, 0.22, { type: 'lowpass', from: 420 });
  noise(ctx, bus, t + 0.62, { dur: 0.09, peak: 0.18, filter: { type: 'lowpass', from: 900 } });
}

/** 击晕：大方波闷棍 + 高音小二度打转（头顶转圈星星）+ 晕眩余摆。 */
function stun(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: 175, to: 62, dur: 0.22, peak: 0.45 });
  noise(ctx, bus, t, { dur: 0.04, peak: 0.2, filter: { type: 'highpass', from: 1500 } });
  const trill: number[] = [];
  for (let i = 0; i < 6; i++) trill.push(i % 2 === 0 ? 84 : 83);
  chipArp(ctx, bus, t + 0.28, trill, 0.07, 0.18);
  tone(ctx, bus, t + 0.72, { type: 'square', from: 300, to: 240, dur: 0.25, peak: 0.15, vibrato: { rate: 8, depth: 12 } });
}

/** 缠绕：噪声弹响 + 半音下行「吱吱」收紧 + 窸窣 + 末尾低吱。 */
function entangle(ctx: AudioContext, bus: AudioNode, t: number): void {
  noise(ctx, bus, t, { dur: 0.04, peak: 0.22, filter: { type: 'highpass', from: 1600 } });
  chipArp(ctx, bus, t + 0.04, [64, 62, 61, 60, 59, 57], 0.09, 0.24);
  noise(ctx, bus, t + 0.1, { dur: 0.55, peak: 0.13, filter: { type: 'bandpass', from: 480, q: 1 } });
  tone(ctx, bus, t + 0.6, { type: 'square', from: 130, to: 85, dur: 0.2, peak: 0.2 });
}

/** 织网：五连「咻」下滑 + 高频丝线刮擦 + 收网闷响。 */
function web(ctx: AudioContext, bus: AudioNode, t: number): void {
  for (let i = 0; i < 5; i++) {
    tone(ctx, bus, t + i * 0.12, { type: 'square', from: 1000 - i * 140, to: 250, dur: 0.075, peak: 0.24 });
    noise(ctx, bus, t + i * 0.12, { dur: 0.03, peak: 0.15, filter: { type: 'highpass', from: 3000 } });
  }
  noise(ctx, bus, t + 0.6, { dur: 0.12, peak: 0.18, filter: { type: 'bandpass', from: 900, q: 0.9 } });
}

/** 屏障：上行大琶音 + 纯五度长定格 + 顶部闪音（经典 8bit buff 音）。 */
function barrier(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [60, 64, 67, 72, 76], 0.07, 0.27);
  chipDyad(ctx, bus, t + 0.37, [67, 76], 0.55, 0.22);
  chipNote(ctx, bus, t + 0.4, 84, 0.3, 0.16);
  noise(ctx, bus, t + 0.37, { dur: 0.3, peak: 0.08, filter: { type: 'highpass', from: 4000 } });
}

/** 下潮：下行七音泡阵（闷）+ 深处低音 + 两颗上冒水泡。 */
function submerged(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [72, 69, 67, 65, 62, 60, 57], 0.08, 0.25, { type: 'lowpass', from: 800 });
  chipNote(ctx, bus, t + 0.58, 50, 0.5, 0.2, { type: 'lowpass', from: 300 });
  tone(ctx, bus, t + 0.65, { type: 'square', from: 190, to: 430, dur: 0.09, peak: 0.16 });
  tone(ctx, bus, t + 0.8, { type: 'square', from: 160, to: 360, dur: 0.09, peak: 0.13 });
}

/** 猎人标记：锁定「哔—咻—咚」+ 高音锁扣余振 + 低音落锁。 */
function marked(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipNote(ctx, bus, t, 81, 0.06, 0.3);
  chipNote(ctx, bus, t + 0.08, 88, 0.07, 0.32);
  chipNote(ctx, bus, t + 0.17, 64, 0.09, 0.28);
  tone(ctx, bus, t + 0.28, { type: 'square', from: hz(76), dur: 0.45, peak: 0.2, vibrato: { rate: 6, depth: 8 } });
  chipNote(ctx, bus, t + 0.3, 52, 0.5, 0.18, { type: 'lowpass', from: 400 });
}

/** 疾病：小二度刺耳双音三格下坠 + 病气噪声 + 恶心摆音。 */
function disease(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipDyad(ctx, bus, t, [72, 73], 0.22, 0.2);
  chipDyad(ctx, bus, t + 0.24, [70, 71], 0.22, 0.19);
  chipDyad(ctx, bus, t + 0.48, [68, 69], 0.24, 0.18);
  noise(ctx, bus, t + 0.02, { dur: 0.7, peak: 0.11, filter: { type: 'bandpass', from: 300, q: 1.2 } });
  tone(ctx, bus, t + 0.55, { type: 'square', from: 240, to: 200, dur: 0.4, peak: 0.13, vibrato: { rate: 5, depth: 18 } });
}

/** 诅咒：下行阴暗琶音 + 长低音不协和铺底 + 咒气噪声。 */
function curse(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [69, 65, 62, 58, 56], 0.11, 0.26);
  chipNote(ctx, bus, t, 45, 0.9, 0.24);
  chipNote(ctx, bus, t + 0.02, 44, 0.85, 0.12);
  noise(ctx, bus, t + 0.05, { dur: 0.7, peak: 0.09, filter: { type: 'bandpass', from: 260, q: 1 } });
}

/** 死亡标记：低音小二度丧钟 + 半秒后回声钟 + 高频不祥颤音 + 次低音。 */
function deathMark(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipDyad(ctx, bus, t, [40, 43], 0.8, 0.32);
  chipDyad(ctx, bus, t + 0.55, [40, 43], 0.6, 0.18);
  chipArp(ctx, bus, t + 0.1, [76, 77, 76, 77, 76, 77], 0.05, 0.1);
  chipNote(ctx, bus, t, 28, 0.8, 0.18, { type: 'lowpass', from: 200 });
}

/** 狂怒：三连上行琶音层层拔高 + 长低吼收尾。 */
function rage(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [57, 60, 64, 67], 0.05, 0.26);
  chipArp(ctx, bus, t + 0.21, [60, 64, 67, 72], 0.05, 0.28);
  chipArp(ctx, bus, t + 0.42, [64, 67, 72, 76], 0.05, 0.3);
  tone(ctx, bus, t + 0.63, { type: 'square', from: 120, to: 75, dur: 0.45, peak: 0.3 });
  noise(ctx, bus, t + 0.63, { dur: 0.4, peak: 0.14, filter: { type: 'bandpass', from: 420, q: 1 } });
}

/** 魅惑：上行大调闪音 + 高音打转 + 双跳确认（E 大调亮片）。 */
function charm(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [76, 80, 83, 88, 92], 0.06, 0.24);
  chipArp(ctx, bus, t + 0.32, [88, 91, 88, 91], 0.05, 0.16);
  chipNote(ctx, bus, t + 0.55, 83, 0.12, 0.2);
  chipNote(ctx, bus, t + 0.68, 88, 0.25, 0.22);
}

/** 法力燃烧：十格快速下行音阶被抽干 + 长嘶声 + 抽干后的两声空响。 */
function manaBurn(ctx: AudioContext, bus: AudioNode, t: number): void {
  chipArp(ctx, bus, t, [86, 84, 82, 79, 77, 74, 72, 70, 67, 65], 0.045, 0.24);
  noise(ctx, bus, t, { dur: 0.45, peak: 0.16, filter: { type: 'highpass', from: 3200 } });
  chipNote(ctx, bus, t + 0.5, 55, 0.12, 0.2);
  chipNote(ctx, bus, t + 0.66, 53, 0.15, 0.16);
}

/** 狼化：方波狼嚎轮廓（上滑→颤音悬停→长下滑）+ 嚎叫气声。 */
function wolf(ctx: AudioContext, bus: AudioNode, t: number): void {
  tone(ctx, bus, t, { type: 'square', from: hz(57), to: hz(64), dur: 0.2, peak: 0.3 });
  tone(ctx, bus, t + 0.2, { type: 'square', from: hz(64), dur: 0.35, peak: 0.26, vibrato: { rate: 7, depth: 11 } });
  tone(ctx, bus, t + 0.55, { type: 'square', from: hz(64), to: hz(45), dur: 0.55, peak: 0.3 });
  noise(ctx, bus, t, { dur: 0.9, peak: 0.1, filter: { type: 'bandpass', from: 620, q: 1.1 } });
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
 * statusId → 规范键：小写、连字符/下划线互转、别名收敛
 * （cursed→curse、enraged→rage、charmed→charm、lycanthropy/wolf-form→wolf）。
 * 只做字符串归一，不查表——AudioManager 用它优先匹配 status/ 目录的 glob 采样键
 * （目录里的文件全集可以超出下方合成表，例如 faerie_fire / terror）。
 */
export function normalizeStatusKey(statusId: string): string {
  const normalized = statusId.toLowerCase().replace(/-/g, '_');
  if (normalized === 'cursed') return 'curse';
  if (normalized === 'enraged') return 'rage';
  if (normalized === 'charmed') return 'charm';
  if (normalized === 'lycanthropy' || normalized === 'wolf_form') return 'wolf';
  return normalized;
}

/**
 * statusId → 占位合成映射键；无对应占位合成（未落地/未知状态）返回 null。
 * 采样路径不经此表——AudioManager 先用 normalizeStatusKey 查 status/ 目录。
 */
export function canonicalStatusSoundId(statusId: string): string | null {
  const aliased = normalizeStatusKey(statusId);
  if (SAMPLE_STATUS_KEYS.includes(aliased)) return aliased;
  return aliased in STATUS_SYNTHS ? aliased : null;
}
