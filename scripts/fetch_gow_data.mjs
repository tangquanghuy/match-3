#!/usr/bin/env node
/**
 * gowhead 全量资料拉取（窗口 G，用户指令）：兵种/法术（en+zh）/特质探测 + 卡面雪碧图。
 * 输出 data/raw/gow-2026-09-18/：
 *   troops.{en,zh}.json  spells.en.json  traits.en.json(若端点存在)
 *   portraits-sprite/TroopCardAll_*.webp（立绘为整卡雪碧图，非单兵种可寻址——
 *   单兵种立绘继续走 F 的 AI 生成管线，按 FileBase 命名）
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://gowhead.com';
const OUT = 'data/raw/gow-2026-09-18';
const SPRITES = ['All', 'Blue', 'Green', 'Red', 'Purple', 'Yellow', 'Brown'];

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`占位图（${buf.length}B）: ${url}`);
  fs.writeFileSync(file, buf);
  return buf.length;
}

async function fetchAllTroops(language) {
  const all = [];
  let page = 1;
  for (;;) {
    const d = await getJson(`${BASE}/api/entities?type=troop&language=${language}&page=${page}&limit=500`);
    all.push(...d.data);
    if (d.data.length < d.limit || all.length >= d.total) break;
    page += 1;
  }
  return {
    source: 'gowhead.com', endpoint: `${BASE}/api/entities?type=troop`, language,
    exported_at: new Date().toISOString(), count: all.length, troops: all,
  };
}

async function fetchAllType(type, language, listKey) {
  const all = [];
  let page = 1;
  for (;;) {
    const d = await getJson(`${BASE}/api/entities?type=${type}&language=${language}&page=${page}&limit=500`).catch(() => null);
    if (!d) return { source: 'gowhead.com', language, count: 0, [listKey]: [] };
    all.push(...d.data);
    if (d.data.length < d.limit || all.length >= d.total) break;
    page += 1;
  }
  return { source: 'gowhead.com', language, count: all.length, [listKey]: all };
}

fs.mkdirSync(path.join(OUT, 'portraits-sprite'), { recursive: true });

console.log('[fetch] troops en …');
fs.writeFileSync(path.join(OUT, 'troops.en.json'), JSON.stringify(await fetchAllTroops('en'), null, 1));
console.log('[fetch] troops zh …');
fs.writeFileSync(path.join(OUT, 'troops.zh.json'), JSON.stringify(await fetchAllTroops('zh'), null, 1));
console.log('[fetch] spells en …');
fs.writeFileSync(path.join(OUT, 'spells.en.json'), JSON.stringify(await fetchAllType('spell', 'en', 'spells'), null, 1));
console.log('[fetch] traits en（探测）…');
fs.writeFileSync(path.join(OUT, 'traits.en.json'), JSON.stringify(await fetchAllType('trait', 'en', 'traits'), null, 1));
const tr = JSON.parse(fs.readFileSync(path.join(OUT, 'traits.en.json'), 'utf8'));
console.log('[fetch] traits 端点返回:', tr.count ?? tr.traits?.length ?? 0);

for (const c of SPRITES) {
  const file = path.join(OUT, 'portraits-sprite', `TroopCardAll_${c}.webp`);
  try {
    const size = await download(`${BASE}/assets/TroopCardAll_${c}.webp`, file);
    console.log(`[sprite] TroopCardAll_${c}.webp ${(size / 1024).toFixed(0)}KB`);
  } catch (e) {
    console.log(`[sprite] ${c} 失败: ${e.message}`);
  }
}
console.log('[fetch] 完成 →', OUT);
