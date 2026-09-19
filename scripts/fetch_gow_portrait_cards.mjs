#!/usr/bin/env node
/**
 * 补拉 gowhead 部队卡面立绘（带背景版）。
 * 背景：data/raw/gow-2026-09-18/portraits/ 当初拉的是 /assets/troops/{name}.webp（1024² 透明底抠像），
 * 官方真正的立绘是 /assets/troops/cards/{name}.webp（459×675 RGB 带绘制背景）。
 * 输出 data/raw/gow-2026-09-18/portraits-cards/：
 *   {name}.webp          卡面立绘
 *   manifest-cards.json  拉取结果（url/bytes/ok/ext）
 * 断点续传：已存在且 ≥1000B 的文件跳过。占位图（<1000B）不落盘，单独计数。
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://gowhead.com';
const OUT = 'data/raw/gow-2026-09-18';
const SRC_MANIFEST = path.join(OUT, 'portraits', 'manifest.json');
const DEST = path.join(OUT, 'portraits-cards');
const CONCURRENCY = 4;
const RETRIES = 2;

const manifest = JSON.parse(fs.readFileSync(SRC_MANIFEST, 'utf8'));
const names = Object.keys(manifest).sort();
fs.mkdirSync(DEST, { recursive: true });

const stats = { ok: 0, skipped: 0, placeholder: 0, failed: 0 };
const results = {};

function validLocal(file) {
  try {
    return fs.statSync(file).size >= 1000;
  } catch {
    return false;
  }
}

async function fetchOne(name) {
  const url = `${BASE}/assets/troops/cards/${name}.webp?v=1.0`;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) return { name, url, ok: false, reason: 'placeholder', bytes: buf.length };
      fs.writeFileSync(path.join(DEST, `${name}.webp`), buf);
      return { name, url, ok: true, bytes: buf.length, ext: 'webp' };
    } catch (e) {
      if (attempt === RETRIES) return { name, url, ok: false, reason: String(e.message || e) };
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

const todo = names.filter(n => !validLocal(path.join(DEST, `${n}.webp`)));
stats.skipped = names.length - todo.length;
console.log(`[cards] total=${names.length} todo=${todo.length} skipped=${stats.skipped}`);

let cursor = 0;
let done = 0;
async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= todo.length) return;
    const name = todo[i];
    results[name] = await fetchOne(name);
    done++;
    if (done % 100 === 0) console.log(`[cards] ${done}/${todo.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

for (const r of Object.values(results)) {
  if (r.ok) stats.ok++;
  else if (r.reason === 'placeholder') stats.placeholder++;
  else stats.failed++;
}
fs.writeFileSync(
  path.join(DEST, 'manifest-cards.json'),
  JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'gowhead.com', endpoint: '/assets/troops/cards/{name}.webp', stats, results }, null, 1)
);
console.log('[cards] done:', JSON.stringify(stats));
if (stats.placeholder) console.log('[cards] placeholder names:', Object.values(results).filter(r => r.reason === 'placeholder').map(r => r.name).join(', ').slice(0, 500));
if (stats.failed) console.log('[cards] failed names:', Object.values(results).filter(r => r.ok === false && r.reason !== 'placeholder').map(r => r.name).join(', ').slice(0, 500));
