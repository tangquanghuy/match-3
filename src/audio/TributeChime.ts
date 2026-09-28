/**
 * 收取进贡的「金币入账」音效（纯 Web Audio 合成，无音频文件）。
 *
 * 三段：
 *  1. 倾泻：一串金币碰撞声。每枚 = 非谐分音（硬币/小钟的 1 : 2.76 : 5.40 : 8.93）+ 2ms 高通噪声咔嗒，
 *     间隔由密到疏，音高与声像随机——听起来像一把币落进匣子；枚数随黄金多少增加（6～14 枚）。
 *  2. 落定：一记低沉的木匣闷响（正弦下滑 150→60Hz）。
 *  3. 入账：两音明亮钟声（E6 + B6）；本次含宝石或金钥匙时再加一段上行闪光琶音。
 *
 * 音量 = 主音量 × 音效音量，任一开关关闭则不发声。AudioContext 在首次播放（点击手势内）时懒创建。
 */
import { getPlayerPreferences } from '../preferences/playerPreferences';

export interface TributeChimeHaul {
  gold: number;
  souls?: number;
  glory?: number;
  gems?: number;
  goldKeys?: number;
}

/** 一枚金币碰撞 */
export interface CoinHit { at: number; freq: number; pan: number; vel: number }

export interface TributeChimePlan {
  coins: CoinHit[];
  /** 木匣闷响时刻 */
  thumpAt: number;
  /** 入账钟声时刻 */
  bellAt: number;
  /** 闪光琶音（宝石/金钥匙）各音时刻与频率 */
  sparkle: Array<{ at: number; freq: number }>;
  /** 整段时长（秒） */
  duration: number;
}

/** 硬币的非谐分音比与相对强度 */
const COIN_PARTIALS: ReadonlyArray<readonly [ratio: number, gain: number, decay: number]> = [
  [1, 1, 0.32],
  [2.76, 0.55, 0.2],
  [5.4, 0.3, 0.12],
  [8.93, 0.16, 0.07],
];

/** 小型确定性随机（同一次收取听起来一致，也便于测试） */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 本次收取对应的发声计划（纯函数） */
export function tributeChimePlan(haul: TributeChimeHaul, seed = 7): TributeChimePlan {
  const rnd = lcg(seed);
  const total = Math.max(0, haul.gold) + Math.max(0, haul.souls ?? 0) * 4 + Math.max(0, haul.glory ?? 0) * 10;
  // 6 枚起步，按总量对数增长，14 枚封顶
  const count = Math.max(6, Math.min(14, Math.round(6 + Math.log10(1 + total) * 2)));
  const coins: CoinHit[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const p = i / (count - 1);
    coins.push({
      at: t,
      freq: 2150 + rnd() * 1300 - p * 250,
      pan: (rnd() * 2 - 1) * 0.55,
      vel: 0.55 + rnd() * 0.35 - p * 0.15,
    });
    // 间隔由密到疏：40ms → 110ms，带一点抖动
    t += 0.04 + p * p * 0.07 + rnd() * 0.02;
  }
  const thumpAt = t + 0.02;
  const bellAt = thumpAt + 0.06;
  const bonus = (haul.gems ?? 0) > 0 || (haul.goldKeys ?? 0) > 0;
  const sparkle = bonus
    ? [1318.5, 1661.2, 1975.5, 2637].map((freq, i) => ({ at: bellAt + 0.18 + i * 0.07, freq }))
    : [];
  const last = sparkle.length ? sparkle[sparkle.length - 1]!.at : bellAt;
  return { coins, thumpAt, bellAt, sparkle, duration: last + 1.2 };
}

/** 当前应有的输出增益（0 = 静音） */
export function tributeChimeGain(): number {
  const p = getPlayerPreferences();
  if (!p.masterEnabled || !p.soundEffectsEnabled) return 0;
  return p.masterVolume * p.soundEffectsVolume;
}

let sharedNoise: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) return sharedNoise;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = lcg(99);
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
  sharedNoise = buf;
  return buf;
}

function coin(ctx: BaseAudioContext, out: AudioNode, t: number, hit: CoinHit): void {
  const pan = ctx.createStereoPanner();
  pan.pan.value = hit.pan;
  pan.connect(out);
  for (const [ratio, gain, decay] of COIN_PARTIALS) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hit.freq * ratio;
    const g = ctx.createGain();
    const peak = 0.22 * gain * hit.vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(pan);
    o.start(t);
    o.stop(t + decay + 0.02);
  }
  // 碰撞瞬间的金属咔嗒
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.12 * hit.vel, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  n.connect(hp).connect(ng).connect(pan);
  n.start(t);
  n.stop(t + 0.02);
}

function thump(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
}

function bell(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, level: number, decay: number): void {
  for (const [ratio, gain] of [[1, 1], [2, 0.35], [3.01, 0.15]] as const) {
    const o = ctx.createOscillator();
    o.type = ratio === 1 ? 'triangle' : 'sine';
    o.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / ratio);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/** 把计划排进任意 AudioContext（在线播放与离线渲染测试共用） */
export function scheduleTributeChime(ctx: BaseAudioContext, dest: AudioNode, plan: TributeChimePlan, start: number, gain: number): void {
  const bus = ctx.createGain();
  bus.gain.value = gain;
  // 轻微压缩，防止多枚金币叠加时削顶
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  bus.connect(comp).connect(dest);
  for (const hit of plan.coins) coin(ctx, bus, start + hit.at, hit);
  thump(ctx, bus, start + plan.thumpAt);
  bell(ctx, bus, start + plan.bellAt, 1318.5, 0.16, 1.1); // E6
  bell(ctx, bus, start + plan.bellAt + 0.09, 1975.5, 0.12, 1.0); // B6
  for (const s of plan.sparkle) bell(ctx, bus, start + s.at, s.freq, 0.07, 0.5);
}

let ctx: AudioContext | null = null;

/** 取得（必要时创建并唤醒）共享 AudioContext；失败返回 null */
function context(): AudioContext | null {
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** 在点击手势内同步调用：先把 AudioContext 建好/唤醒，等网关返回后再出声也不会被自动播放策略拦下 */
export function primeTributeChime(): void {
  if (tributeChimeGain() > 0) context();
}

/** 播放一次金币入账音效；静音或浏览器不支持 Web Audio 时什么都不做 */
export function playTributeChime(haul: TributeChimeHaul): void {
  const gain = tributeChimeGain();
  if (gain <= 0) return;
  const c = context();
  if (!c) return;
  try {
    scheduleTributeChime(c, c.destination, tributeChimePlan(haul, Math.floor(Date.now() / 1000)), c.currentTime + 0.02, gain);
  } catch {
    // 音效失败不影响收取
  }
}
