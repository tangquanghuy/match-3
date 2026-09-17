// 从 gowhead.com 拉取全量武器数据 + 图标
// 产物：artifacts/gowhead-weapons/weapons.json + icons/cards/*.webp + icons/arts/*.webp + summary.json
// 用法：node scripts/_fetch_gowhead_weapons.mjs [--data-only]（可重复运行，已下载的图标自动跳过）
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://gowhead.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DIR = 'artifacts/gowhead-weapons';
const ICONS = path.join(DIR, 'icons', 'cards');
const ARTS = path.join(DIR, 'icons', 'arts');
for (const d of [DIR, ICONS, ARTS]) fs.mkdirSync(d, { recursive: true });
const DATA_ONLY = process.argv.includes('--data-only');

const fetchJSON = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// ---- 1. 全量数据（分页） ----
let weapons = [];
let page = 1, total = null;
while (true) {
  const d = await fetchJSON(`${BASE}/api/entities?q=&type=weapon&limit=100&page=${page}&lang=en`);
  total = d.total;
  weapons.push(...d.data);
  console.log(`page ${page}: +${d.data.length} (累计 ${weapons.length}/${total})`);
  if (weapons.length >= total || d.data.length === 0) break;
  page++;
}
// 按 Id 去重排序
const seen = new Set();
weapons = weapons.filter(w => (seen.has(w.Id) ? false : (seen.add(w.Id), true))).sort((a, b) => a.Id - b.Id);
fs.writeFileSync(path.join(DIR, 'weapons.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'gowhead.com/api/entities?type=weapon', total, count: weapons.length, weapons }, null, 1));
console.log(`数据落盘：${weapons.length} 把（total=${total}）`);
if (DATA_ONLY) process.exit(0);

// ---- 2. 下载图标 ----
// 占位图（404 兜底）特征：68 字节 PNG。先抓一份做指纹。
const PLACEHOLDER = await (await fetch(`${BASE}/assets/weapon/__no_such__.png`, { headers: { 'User-Agent': UA } })).arrayBuffer();

const dl = async (url, file) => {
  if (fs.existsSync(file)) return 'exists';
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return 'http' + r.status;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 0 && buf.equals(Buffer.from(PLACEHOLDER))) return 'placeholder';
  fs.writeFileSync(file, buf);
  return 'ok';
};

const queue = [];
for (const w of weapons) {
  const img = w.stats?.image_url; // /assets/spells/cards/{SpellId}.webp 卡面
  if (img) queue.push({ url: BASE + img.split('?')[0], file: path.join(ICONS, `${w.Id}_${w.ReferenceName}.webp`), w });
  const fb = w.FileBase;   // /assets/troops/{FileBase}.webp 武器立绘/图标
  if (fb) queue.push({ url: `${BASE}/assets/troops/${fb}.webp`, file: path.join(ARTS, `${fb}.webp`), w, dedupe: 'art' });
}
// FileBase 去重（多把武器可能共用素材）
const artSeen = new Set();
const jobs = queue.filter(j => !(j.dedupe === 'art' && (artSeen.has(j.url) ? true : (artSeen.add(j.url), false))));

let done = 0, stat = {};
const CONC = 6;
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const j = jobs[cursor++];
    let r = 'error';
    for (let t = 0; t < 2 && r !== 'ok' && r !== 'exists' && r !== 'placeholder'; t++) {
      try { r = await dl(j.url, j.file); } catch { r = 'error'; }
      if (r !== 'ok' && r !== 'exists' && r !== 'placeholder') await new Promise(s => setTimeout(s, 400));
    }
    stat[r] = (stat[r] || 0) + 1;
    if (++done % 100 === 0) console.log(`图标 ${done}/${jobs.length}`, JSON.stringify(stat));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log('图标完成', JSON.stringify(stat), `共 ${jobs.length}`);

// ---- 3. 汇总 ----
const byRarity = {}, byType = {}, byColor = {};
let classWeapons = 0, withKingdom = 0;
for (const w of weapons) {
  const rar = w.data ? JSON.parse(w.data).WeaponRarity : `idx${w.RarityIdx}`;
  byRarity[rar] = (byRarity[rar] || 0) + 1;
  byType[w.TroopType || '?'] = (byType[w.TroopType || '?'] || 0) + 1;
  const colors = Object.keys(w._ManaColors_parsed || {}).length;
  byColor[colors] = (byColor[colors] || 0) + 1;
  if (w.HeroClassCode) classWeapons++;
  if (w.KingdomId) withKingdom++;
}
const summary = { total, fetched: weapons.length, byRarity, byType, byColorCount: byColor, classWeapons, withKingdom, icons: stat };
fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
