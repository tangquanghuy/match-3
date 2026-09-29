#!/usr/bin/env node
/**
 * 状态施加音裁剪脚本（窗口 I · 2026-09-17）。
 * 输入：game-assets/source/audio/status-sfx-raw/<中文名>.wav（用户 AI 生成，尾部普遍有长静音）。
 * 输出：game-assets/bundled/audio/status/status_<键>.wav（AudioManager glob 自动接线）。
 *
 * 处理链（ffmpeg，逐文件）：
 *   1. 双端静音裁剪（阈值 -45dB；保留头 0.03s / 尾 0.09s 自然呼吸）
 *   2. 5ms 淡入 + 尾部 80ms 指数淡出（areverse 反转技巧，免算时长）
 *   3. 峰值归一到 -1.5dBFS（volumedetect 测原文件峰值后定增益）
 *
 * 源文件一律不动（README「Source preservation」约定）。中毒.wav 不在映射内（用户裁定沿用既有采样）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'assets', '音效');
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'audio', 'status');

/** 中文名 → 规范状态键（= status_<键>.wav 的 <键> 段，与 StatusSynth/AudioManager 归一规则一致）。 */
const MAP = {
  流血: 'bleed',
  沉默: 'silence',
  击晕: 'stun',
  缠绕: 'entangle',
  织网: 'web',
  屏障: 'barrier',
  下潜: 'submerged',
  猎人标记: 'marked',
  疾病: 'disease',
  诅咒: 'curse',
  死亡标记: 'death_mark',
  狂怒: 'rage',
  魅惑: 'charm',
  法力燃烧: 'mana_burn',
  狼化: 'wolf',
  妖火: 'faerie_fire',
  恐怖: 'terror',
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} 退出码 ${res.status}: ${(res.stderr || '').slice(-400)}`);
  }
  return { out: res.stdout || '', err: res.stderr || '' };
}

function probeDuration(file) {
  const { out } = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
  return Number(out.trim());
}

function maxVolumeDb(file) {
  const { err } = run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = err.match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/);
  if (!m) throw new Error(`volumedetect 解析失败: ${file}`);
  return m[1] === '-inf' ? -90 : Number(m[1]);
}

function trimOne(srcFile, outFile) {
  const peak = maxVolumeDb(srcFile);
  const gainDb = Math.round((-1.5 - peak) * 100) / 100;
  const chain = [
    // 头部静音：裁到首个发声点，保留 0.03s
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03',
    // 尾部静音：反转后同法裁剪，保留 0.09s
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.09',
    'areverse',
    // 5ms 淡入防爆音
    'afade=t=in:st=0:d=0.005',
    // 尾部 80ms 指数淡出（反转技巧，免算时长）
    'areverse',
    'afade=t=in:st=0:d=0.08:curve=exp',
    'areverse',
    // 峰值归一 -1.5dBFS
    `volume=${gainDb}dB`,
  ].join(',');
  run('ffmpeg', ['-hide_banner', '-y', '-i', srcFile, '-af', chain, '-ar', '48000', '-acodec', 'pcm_s16le', outFile]);
}

const rows = [];
for (const [cn, key] of Object.entries(MAP)) {
  const src = path.join(SRC_DIR, `${cn}.wav`);
  if (!existsSync(src)) {
    rows.push({ key, cn, status: '缺源文件' });
    continue;
  }
  const before = probeDuration(src);
  const out = path.join(OUT_DIR, `status_${key}.wav`);
  trimOne(src, out);
  const after = probeDuration(out);
  rows.push({ key, cn, status: `ok  ${before.toFixed(2)}s → ${after.toFixed(2)}s` });
}

console.log('状态施加音裁剪完成：');
for (const r of rows) console.log(`  status_${r.key}.wav  ← ${r.cn}.wav  ${r.status}`);
const missing = rows.filter((r) => r.status === '缺源文件');
if (missing.length) {
  console.warn(`缺源文件 ${missing.length} 个：${missing.map((r) => r.cn).join('、')}`);
  process.exitCode = 1;
}
