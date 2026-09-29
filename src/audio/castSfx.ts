/**
 * 施法「蓄力 → 释放」合成音效（Web Audio 实时合成，双方共用；敌方整体更低更暗）。
 *
 * 蓄力段时长 = 时间线的施法预留段（我方立绘入场+停留 / 敌方预告名牌），按当前战斗倍速换算成真实秒数
 * 传入；释放点由 EventStreamPlayer.onCastRelease 在时间线上触发。
 *
 * 风格（CAST_SFX_STYLE 切换；旧版保留以便回退对比）：
 *   - resonance（现用，样品 v4「恒音聚能」）：音高不变的三角波和弦，靠音色由闷到亮、颤动越来越急、
 *     倒吸式气流渐强来蓄力；释放 = 低频冲击 + 由亮到暗的气浪 + 往下掉两个八度的「呜——」。
 *   - thick（上一版）：锯齿和弦升五度 + 软削波 + 共振低通 + 方波门限颗粒。
 *   - bright（最初版）：锯齿 + 高八度三角两个八度上扬，带通噪声扫到高频（偏尖）。
 */
export type CastSide = 'ally' | 'enemy';
export type CastSfxStyle = 'resonance' | 'thick' | 'bright';

/** 当前使用的施法音效风格 */
export const CAST_SFX_STYLE: CastSfxStyle = 'resonance';

/** 一次蓄力的输出节点与结束时刻：新蓄力或释放到来时由调用方淡出掐掉 */
export interface CastChargeVoice {
  out: GainNode;
  stopAt: number;
}

interface CastSfxKit {
  charge(ctx: BaseAudioContext, dest: AudioNode, durationSec: number, side: CastSide): CastChargeVoice;
  release(ctx: BaseAudioContext, dest: AudioNode, side: CastSide): void;
}

// —— 公共小工具 ——

function noiseSource(ctx: BaseAudioContext, seconds: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** 把 [0,1] 上的函数离散成自动化曲线（setValueCurveAtTime 用） */
function curve(fn: (k: number) => number, points = 64): Float32Array<ArrayBuffer> {
  const out = new Float32Array(new ArrayBuffer(points * 4));
  for (let i = 0; i < points; i++) out[i] = fn(i / (points - 1));
  return out;
}

/** 瞬起（3ms）+ 指数衰减的击打包络 */
function hitEnvelope(param: AudioParam, t: number, peak: number, tau: number): void {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + 0.003);
  param.setTargetAtTime(0, t + 0.003, tau);
}

const softClipCurves = new WeakMap<BaseAudioContext, Float32Array<ArrayBuffer>>();
function softClip(ctx: BaseAudioContext): Float32Array<ArrayBuffer> {
  let c = softClipCurves.get(ctx);
  if (!c) {
    c = curve((k) => Math.tanh((k * 2 - 1) * 2.4) / Math.tanh(2.4), 1024);
    softClipCurves.set(ctx, c);
  }
  return c;
}

/** 小房间混响的脉冲响应（立体声衰减噪声），每个 AudioContext 生成一次 */
const roomImpulses = new WeakMap<BaseAudioContext, AudioBuffer>();
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  let ir = roomImpulses.get(ctx);
  if (!ir) {
    const len = Math.floor(ctx.sampleRate * 1.1);
    ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.3));
    }
    roomImpulses.set(ctx, ir);
  }
  return ir;
}

// —— resonance：恒音聚能（现用） ——

const RESONANCE = {
  ally: { root: 110, cutFrom: 350, cutTo: 2600, endHz: 330, kickFrom: 150, kickTo: 38, dustFrom: 3000, dustTo: 260 },
  enemy: { root: 82.4, cutFrom: 280, cutTo: 1800, endHz: 247, kickFrom: 115, kickTo: 32, dustFrom: 2200, dustTo: 220 },
} as const;
/**
 * 输出增益（浏览器离线渲染校准）：整段峰值约 0.6，与其余音效同一量级；
 * 蓄力段峰值约为释放峰值的 0.65，与样品 WAV 的比例一致。
 */
const RESONANCE_CHARGE_GAIN = 0.44;
const RESONANCE_RELEASE_GAIN = 0.38;

const resonance: CastSfxKit = {
  charge(ctx, dest, durationSec, side) {
    const p = RESONANCE[side];
    const t = ctx.currentTime;
    const dur = Math.max(0.12, durationSec);
    const end = t + dur;
    const stopAt = end + 0.12;
    const out = ctx.createGain();
    out.gain.value = RESONANCE_CHARGE_GAIN;
    out.connect(dest);
    // 汇总层 → 干声 + 混响（由干到湿：0.1 → 0.4）
    const bus = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.setValueCurveAtTime(curve((k) => 1 - 0.5 * (0.1 + 0.3 * k)), t, dur);
    const verb = ctx.createConvolver();
    verb.buffer = roomImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.setValueCurveAtTime(curve((k) => 0.1 + 0.3 * k), t, dur);
    bus.connect(dry).connect(out);
    bus.connect(verb).connect(wet).connect(out);
    // 蓄力包络：由弱到满，释放点 30ms 收掉
    const swell = (param: AudioParam, peak: number, pow: number) => {
      param.setValueCurveAtTime(curve((k) => peak * (0.08 + 0.92 * Math.pow(k, pow))), t, dur);
      param.linearRampToValueAtTime(0, end + 0.03);
    };
    const oscs: AudioScheduledSourceNode[] = [];

    // 1) 和弦主体：根/五/八度，每音三支 ±9 音分三角波，声场由窄到宽
    const chordSum = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 1.2;
    tone.frequency.setValueCurveAtTime(curve((k) => p.cutFrom * Math.pow(p.cutTo / p.cutFrom, Math.pow(k, 1.4))), t, dur);
    // 颤动：0.6~1.0，速度 6 → 24Hz 越来越急
    const trem = ctx.createGain();
    trem.gain.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(6, t);
    lfo.frequency.exponentialRampToValueAtTime(24, end);
    const depth = ctx.createGain();
    depth.gain.value = 0.2;
    lfo.connect(depth).connect(trem.gain);
    oscs.push(lfo);
    const chordEnv = ctx.createGain();
    swell(chordEnv.gain, 0.9, 1.5);
    chordSum.connect(tone).connect(trem).connect(chordEnv).connect(bus);
    for (const ratio of [1, 1.5, 2]) {
      for (const pos of [-1, 0, 1]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = p.root * ratio;
        o.detune.value = pos * 9;
        const g = ctx.createGain();
        g.gain.value = (1.6 / 3) * (1.6 / 3);
        const pan = ctx.createStereoPanner();
        pan.pan.setValueAtTime(pos * 0.3, t);
        pan.pan.linearRampToValueAtTime(pos, end);
        o.connect(g).connect(pan).connect(chordSum);
        oscs.push(o);
      }
    }

    // 2) 气流：左右各一路带通噪声 300 → 1800Hz，倒吸式渐强（越接近释放越猛）
    const merge = ctx.createChannelMerger(2);
    for (let ch = 0; ch < 2; ch++) {
      const n = noiseSource(ctx, dur + 0.15);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(1800, end);
      n.connect(bp).connect(merge, 0, ch);
      oscs.push(n);
    }
    const airEnv = ctx.createGain();
    const tau = 0.22 * (dur / 0.68);
    airEnv.gain.setValueCurveAtTime(curve((k) => 0.9 * Math.exp(-(1 - k) * dur / tau)), t, dur);
    airEnv.gain.linearRampToValueAtTime(0, end + 0.03);
    merge.connect(airEnv).connect(bus);

    // 3) 次低音：根音低八度正弦
    const sub = ctx.createOscillator();
    sub.frequency.value = p.root / 2;
    const subEnv = ctx.createGain();
    swell(subEnv.gain, 0.4, 1.2);
    sub.connect(subEnv).connect(bus);
    oscs.push(sub);

    for (const o of oscs) { o.start(t); o.stop(stopAt); }
    return { out, stopAt };
  },

  release(ctx, dest, side) {
    const p = RESONANCE[side];
    const t = ctx.currentTime;
    const stopAt = t + 1.2;
    const out = ctx.createGain();
    out.gain.value = RESONANCE_RELEASE_GAIN;
    out.connect(dest);
    // 1) 低频冲击：正弦急降
    const kick = ctx.createOscillator();
    kick.frequency.setValueAtTime(p.kickFrom, t);
    kick.frequency.exponentialRampToValueAtTime(p.kickTo, t + 0.22);
    const kg = ctx.createGain();
    hitEnvelope(kg.gain, t, 0.95, 0.2);
    kick.connect(kg).connect(out);
    // 2) 气浪：低通噪声由亮到暗
    const dust = noiseSource(ctx, 0.8);
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.Q.value = 0.7;
    df.frequency.setValueAtTime(p.dustFrom, t);
    df.frequency.exponentialRampToValueAtTime(p.dustTo, t + 0.3);
    const dg = ctx.createGain();
    hitEnvelope(dg.gain, t, 0.45, 0.1);
    dust.connect(df).connect(dg).connect(out);
    // 3) 下坠「呜——」：本音 + 低八度的失谐锯齿，从 endHz 往下掉两个八度，低通 1800 → 200Hz
    const fallF = ctx.createBiquadFilter();
    fallF.type = 'lowpass';
    fallF.Q.value = 0.9;
    fallF.frequency.setValueAtTime(1800, t);
    fallF.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    const fg = ctx.createGain();
    hitEnvelope(fg.gain, t, 0.35, 0.22);
    fallF.connect(fg).connect(out);
    const srcs: AudioScheduledSourceNode[] = [kick, dust];
    for (const ratio of [1, 0.5]) {
      for (const pos of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const f0 = p.endHz * ratio;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 / 4, t + 0.25);
        o.detune.value = pos * 8;
        const g = ctx.createGain();
        g.gain.value = 0.4;
        const pan = ctx.createStereoPanner();
        pan.pan.value = pos;
        o.connect(g).connect(pan).connect(fallF);
        srcs.push(o);
      }
    }
    for (const s of srcs) { s.start(t); s.stop(stopAt); }
  },
};

// —— thick：上一版（保留） ——

const thick: CastSfxKit = {
  charge(ctx, dest, durationSec, side) {
    const t = ctx.currentTime;
    const enemy = side === 'enemy';
    const dur = Math.max(0.12, durationSec);
    const end = t + dur;
    const stopAt = end + 0.12;
    const root = enemy ? 82.4 : 110;
    const rise = 1.5;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.42, end);
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
    env.connect(out);
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(root / 2, t);
    sub.frequency.exponentialRampToValueAtTime((root / 2) * rise, end);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.55;
    sub.connect(subGain).connect(env);
    const drive = ctx.createWaveShaper();
    drive.curve = softClip(ctx);
    drive.oversample = '2x';
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.Q.value = 7;
    body.frequency.setValueAtTime(enemy ? 160 : 220, t);
    body.frequency.exponentialRampToValueAtTime(enemy ? 1100 : 1700, end);
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.32;
    const pre = ctx.createGain();
    pre.gain.value = 0.34;
    pre.connect(drive).connect(body).connect(bodyGain).connect(env);
    const srcs: AudioScheduledSourceNode[] = [sub];
    for (const ratio of [1, 1.5]) {
      for (const cents of [-14, 0, 13]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(root * ratio, t);
        o.frequency.exponentialRampToValueAtTime(root * ratio * rise, end);
        o.detune.value = cents;
        o.connect(pre);
        srcs.push(o);
      }
    }
    const air = noiseSource(ctx, dur + 0.12);
    const airLp = ctx.createBiquadFilter();
    airLp.type = 'lowpass';
    airLp.Q.value = 0.9;
    airLp.frequency.setValueAtTime(enemy ? 300 : 420, t);
    airLp.frequency.exponentialRampToValueAtTime(enemy ? 1300 : 2000, end);
    const airGain = ctx.createGain();
    airGain.gain.value = 0.28;
    air.connect(airLp).connect(airGain).connect(env);
    const grain = noiseSource(ctx, dur + 0.12);
    const grainBp = ctx.createBiquadFilter();
    grainBp.type = 'bandpass';
    grainBp.Q.value = 1.6;
    grainBp.frequency.setValueAtTime(enemy ? 700 : 900, t);
    grainBp.frequency.exponentialRampToValueAtTime(enemy ? 1400 : 1900, end);
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    const gateLfo = ctx.createOscillator();
    gateLfo.type = 'square';
    gateLfo.frequency.setValueAtTime(18, t);
    gateLfo.frequency.exponentialRampToValueAtTime(42, end);
    const gateDepth = ctx.createGain();
    gateDepth.gain.value = 0.5;
    gateLfo.connect(gateDepth).connect(gate.gain);
    const grainGain = ctx.createGain();
    grainGain.gain.setValueAtTime(0.0001, t);
    grainGain.gain.exponentialRampToValueAtTime(0.16, end);
    grain.connect(grainBp).connect(gate).connect(grainGain).connect(env);
    srcs.push(air, grain, gateLfo);
    for (const s of srcs) { s.start(t); s.stop(stopAt); }
    return { out, stopAt };
  },
  release(ctx, dest, side) {
    const t = ctx.currentTime;
    const enemy = side === 'enemy';
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    const kick = ctx.createOscillator();
    kick.frequency.setValueAtTime(enemy ? 115 : 150, t);
    kick.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.exponentialRampToValueAtTime(0.55, t + 0.006);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    kick.connect(kg).connect(out);
    const noise = noiseSource(ctx, 0.3);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.Q.value = 0.7;
    nf.frequency.setValueAtTime(enemy ? 1400 : 2200, t);
    nf.frequency.exponentialRampToValueAtTime(enemy ? 240 : 320, t + 0.26);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    noise.connect(nf).connect(ng).connect(out);
    const zap = ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(enemy ? 124 : 165, t);
    zap.frequency.exponentialRampToValueAtTime(enemy ? 52 : 70, t + 0.22);
    const zf = ctx.createBiquadFilter();
    zf.type = 'lowpass';
    zf.frequency.setValueAtTime(enemy ? 900 : 1400, t);
    zf.frequency.exponentialRampToValueAtTime(200, t + 0.22);
    const zg = ctx.createGain();
    zg.gain.setValueAtTime(0.0001, t);
    zg.gain.exponentialRampToValueAtTime(0.26, t + 0.006);
    zg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    zap.connect(zf).connect(zg).connect(out);
    kick.start(t); kick.stop(t + 0.36);
    noise.start(t); noise.stop(t + 0.3);
    zap.start(t); zap.stop(t + 0.26);
  },
};

// —— bright：最初版（保留） ——

const bright: CastSfxKit = {
  charge(ctx, dest, durationSec, side) {
    const t = ctx.currentTime;
    const enemy = side === 'enemy';
    const dur = Math.max(0.12, durationSec);
    const end = t + dur;
    const stopAt = end + 0.1;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(dest);
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    trem.connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(6, t);
    lfo.frequency.exponentialRampToValueAtTime(22, end);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.25;
    lfo.connect(lfoDepth).connect(trem.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.24, end);
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
    env.connect(trem);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(enemy ? 420 : 800, t);
    tone.frequency.exponentialRampToValueAtTime(enemy ? 1500 : 4000, end);
    tone.connect(env);
    const f0 = enemy ? 90 : 180;
    const f1 = enemy ? 360 : 720;
    const srcs: AudioScheduledSourceNode[] = [lfo];
    for (const [type, mul, detune] of [['sawtooth', 1, -7], ['triangle', 2, 5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0 * mul, t);
      o.frequency.exponentialRampToValueAtTime(f1 * mul, end);
      o.detune.value = detune;
      o.connect(tone);
      srcs.push(o);
    }
    const noise = noiseSource(ctx, dur + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(enemy ? 250 : 500, t);
    bp.frequency.exponentialRampToValueAtTime(enemy ? 1500 : 3600, end);
    const ng = ctx.createGain();
    ng.gain.value = 0.55;
    noise.connect(bp).connect(ng).connect(env);
    srcs.push(noise);
    for (const s of srcs) { s.start(t); s.stop(stopAt); }
    return { out, stopAt };
  },
  release(ctx, dest, side) {
    const t = ctx.currentTime;
    const enemy = side === 'enemy';
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    const kick = ctx.createOscillator();
    kick.frequency.setValueAtTime(enemy ? 115 : 150, t);
    kick.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.exponentialRampToValueAtTime(0.55, t + 0.006);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    kick.connect(kg).connect(out);
    const noise = noiseSource(ctx, 0.3);
    const nf = ctx.createBiquadFilter();
    nf.type = enemy ? 'lowpass' : 'bandpass';
    nf.Q.value = 0.7;
    nf.frequency.setValueAtTime(enemy ? 1400 : 3200, t);
    nf.frequency.exponentialRampToValueAtTime(enemy ? 260 : 520, t + 0.26);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    noise.connect(nf).connect(ng).connect(out);
    const zap = ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(enemy ? 620 : 1300, t);
    zap.frequency.exponentialRampToValueAtTime(enemy ? 120 : 240, t + 0.14);
    const zf = ctx.createBiquadFilter();
    zf.type = 'lowpass';
    zf.frequency.value = enemy ? 1400 : 2800;
    const zg = ctx.createGain();
    zg.gain.setValueAtTime(0.0001, t);
    zg.gain.exponentialRampToValueAtTime(0.1, t + 0.005);
    zg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    zap.connect(zf).connect(zg).connect(out);
    kick.start(t); kick.stop(t + 0.36);
    noise.start(t); noise.stop(t + 0.3);
    zap.start(t); zap.stop(t + 0.18);
  },
};

const KITS: Record<CastSfxStyle, CastSfxKit> = { resonance, thick, bright };

/** 起一段蓄力音（durationSec = 真实秒数），返回可被掐掉的输出节点 */
export function playCastCharge(
  ctx: BaseAudioContext, dest: AudioNode, durationSec: number, side: CastSide, style: CastSfxStyle = CAST_SFX_STYLE,
): CastChargeVoice {
  return KITS[style].charge(ctx, dest, durationSec, side);
}

/** 打出释放音 */
export function playCastRelease(ctx: BaseAudioContext, dest: AudioNode, side: CastSide, style: CastSfxStyle = CAST_SFX_STYLE): void {
  KITS[style].release(ctx, dest, side);
}
