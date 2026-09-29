#!/usr/bin/env node
/**
 * 结算音乐成品脚本。
 * 输入：game-assets/source/audio/result-music-raw/{victory,defeat}.wav（Suno 生成后剪出的约 8s 片段，
 *       开头已干净，结尾在满电平处硬切）。
 * 输出：game-assets/bundled/audio/result/{victory,defeat}.mp3（ResultMusic 单次播放）。
 *
 * 处理链（ffmpeg，逐文件）：
 *   1. 湿声 = 原曲（尾部补静音）卷积一段合成的立体声大厅脉冲（指数衰减噪声，切掉低频 / 高频）；
 *      按干声 RMS 自动标定湿声电平（afir 会把脉冲能量归一，绝对电平不可预期）
 *   2. 干声在原曲最后 dryFade 秒以 S 形曲线淡出；湿声只在干声淡出时渐入，之后线性收到 0。
 *      听感是乐队停下、大厅余音散去，而不是被剪断
 *   3. 响度归一到 -17 LUFS（与 bgm 目录同一口径），限幅 -1 dBFS，编码 mp3 128k
 *
 * 源文件不动；重跑即可覆盖产物：node scripts/build_result_music.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'game-assets', 'source', 'audio', 'result-music-raw');
const OUT_DIR = path.join(ROOT, 'game-assets', 'bundled', 'audio', 'result');

const TARGET_LUFS = -17;
const SAMPLE_RATE = 44100;

/**
 * 每首的尾部参数：dryFade 干声淡出秒数；wetIn 湿声渐入秒数；wetDb 湿声相对干声 RMS 的电平；
 * tail 原曲之后补的余音秒数；rt60 大厅混响时间。
 */
const TRACKS = {
  victory: { dryFade: 1.6, wetIn: 2.2, wetDb: -6, tail: 3.2, rt60: 3.2 },
  defeat: { dryFade: 1.9, wetIn: 2.6, wetDb: -5, tail: 3.6, rt60: 3.6 },
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} 退出码 ${res.status}: ${(res.stderr || '').slice(-600)}`);
  return { out: res.stdout || '', err: res.stderr || '' };
}

function probeDuration(file) {
  const { out } = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
  return Number(out.trim());
}

/** 前 seconds 秒的整体 RMS（dBFS） */
function rmsDb(file, seconds) {
  const { err } = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `atrim=end=${seconds},astats=measure_perchannel=none`, '-f', 'null', '-']);
  const value = Number(/RMS level dB:\s*(-?[\d.]+)/.exec(err)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`astats 解析失败: ${file}`);
  return value;
}

/** ebur128 汇总：积分响度与采样峰值 */
function loudness(file) {
  const { err } = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=sample:framelog=quiet', '-f', 'null', '-']);
  const summary = err.slice(err.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s*(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const peak = Number(/Peak:\s*(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak)) throw new Error(`ebur128 解析失败: ${file}`);
  return { lufs, peak };
}

/** 第一步：只渲染湿声（原曲 + 余音长度） */
function renderWet(src, out, end, p) {
  const decay = (6.9078 / p.rt60).toFixed(4); // exp(-k·t) 在 rt60 秒处衰减 60dB
  const graph = [
    `[0:a]aformat=sample_fmts=fltp:sample_rates=${SAMPLE_RATE}:channel_layouts=stereo,apad=whole_dur=${end}[src]`,
    `aevalsrc=exprs='(random(0)*2-1)*exp(-t*${decay})|(random(1)*2-1)*exp(-t*${decay})':s=${SAMPLE_RATE}:d=${(p.rt60 + 0.2).toFixed(2)},`
      + 'highpass=f=180,lowpass=f=5500[ir]',
    // afir 的 dry 是卷积输入增益（不是干湿比），输出只含湿声
    '[src][ir]afir=dry=1:wet=1,atrim=end=' + end + '[out]',
  ].join(';');
  run('ffmpeg', ['-hide_banner', '-y', '-i', src, '-filter_complex', graph, '-map', '[out]', '-acodec', 'pcm_f32le', out]);
}

/** 第二步：干声淡出 + 湿声在尾部接力 */
function renderMix(src, wet, out, duration, end, wetGainDb, p) {
  const graph = [
    `[0:a]aformat=sample_fmts=fltp:sample_rates=${SAMPLE_RATE}:channel_layouts=stereo,apad=whole_dur=${end},`
      + `afade=t=out:st=${(duration - p.dryFade).toFixed(3)}:d=${p.dryFade}:curve=hsin[dry]`,
    `[1:a]afade=t=in:st=${(duration - p.wetIn).toFixed(3)}:d=${p.wetIn}:curve=hsin,`
      + `afade=t=out:st=${duration.toFixed(3)}:d=${p.tail}:curve=qsin,volume=${wetGainDb.toFixed(2)}dB[wet]`,
    `[dry][wet]amix=inputs=2:normalize=0,atrim=end=${end}[out]`,
  ].join(';');
  run('ffmpeg', ['-hide_banner', '-y', '-i', src, '-i', wet, '-filter_complex', graph, '-map', '[out]', '-acodec', 'pcm_f32le', out]);
}

const work = mkdtempSync(path.join(tmpdir(), 'result-music-'));
try {
  for (const [name, p] of Object.entries(TRACKS)) {
    const src = path.join(SRC_DIR, `${name}.wav`);
    const wet = path.join(work, `${name}-wet.wav`);
    const mix = path.join(work, `${name}-mix.wav`);
    const out = path.join(OUT_DIR, `${name}.mp3`);
    const duration = probeDuration(src);
    const end = (duration + p.tail).toFixed(3);

    renderWet(src, wet, end, p);
    const wetGainDb = rmsDb(src, duration) - rmsDb(wet, duration) + p.wetDb;
    renderMix(src, wet, mix, duration, end, wetGainDb, p);

    const before = loudness(mix);
    const gainDb = Math.round((TARGET_LUFS - before.lufs) * 100) / 100;
    run('ffmpeg', ['-hide_banner', '-y', '-i', mix,
      '-af', `volume=${gainDb}dB,alimiter=limit=0.89:attack=5:release=80:level=false`,
      '-ar', String(SAMPLE_RATE), '-codec:a', 'libmp3lame', '-b:a', '128k', out]);
    const after = loudness(out);
    console.log(`${name}.mp3  ${duration.toFixed(2)}s → ${probeDuration(out).toFixed(2)}s  `
      + `湿声 ${wetGainDb.toFixed(1)}dB  ${before.lufs.toFixed(1)} → ${after.lufs.toFixed(1)} LUFS  峰值 ${after.peak.toFixed(1)} dBFS`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
