// 从 gowhead.com 拉取全量武器数据（中英双语）+ 图标
// 产物：artifacts/gowhead-weapons/
//   raw/weapons.gow.zh.json / raw/weapons.gow.en.json  —— 双语原始 dump（与 data/raw 同构）
//   weapons.json —— 合并视图（英文字段 + _zh 中文名/法术）
//   icons/cards/*.webp + summary.json
// 用法：node scripts/_fetch_gowhead_weapons.mjs [--data-only]（可重复运行，已下载的图标自动跳过）
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://gowhead.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DIR = 'artifacts/gowhead-weapons';
const RAW = path.join(DIR, 'raw');
const ICONS = path.join(DIR, 'icons', 'cards');
const ARTS = path.join(DIR, 'icons', 'arts');
for (const d of [DIR, RAW, ICONS, ARTS]) fs.mkdirSync(d, { recursive: true });
const DATA_ONLY = process.argv.includes('--data-only');

const fetchJSON = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// ---- 1. 双语全量数据（分页） ----
const dumpLang = async (lang) => {
  let out = [], page = 1, total = null;
  while (true) {
    const d = await fetchJSON(`${BASE}/api/entities?q=&type=weapon&limit=100&page=${page}&lang=${lang}`);
    total = d.total;
    out.push(...d.data);
    if (out.length >= total || d.data.length === 0) break;
    page++;
  }
  const seen = new Set();
  out = out.filter(w => (seen.has(w.Id) ? false : (seen.add(w.Id), true))).sort((a, b) => a.Id - b.Id);
  fs.writeFileSync(path.join(RAW, `weapons.gow.${lang}.json`), JSON.stringify({ source: 'gowhead.com', endpoint: `${BASE}/api/entities`, language: lang, exported_at: new Date().toISOString(), count: out.length, weapons: out }, null, 1));
  console.log(`lang=${lang}: ${out.length}/${total} 条落盘`);
  return out;
};

const en = await dumpLang('en');
const zh = await dumpLang('zh');
const zhById = new Map(zh.map(w => [w.Id, w]));

// 合并视图：英文字段为骨架，_zh 挂中文显示名/法术名/法术文本
const CJK = /[\u4e00-\u9fa5]/;
const weapons = en.map(w => {
  const z = zhById.get(w.Id);
  const zhName = z?.name_localized ?? null;
  const zhSpellName = z?.stats?.spell?.name ?? null;
  const zhSpellDesc = z?.stats?.spell?.desc ?? null;
  const zhStatus = zhSpellDesc ? (CJK.test(zhSpellDesc) ? (CJK.test(zhName || '') ? 'zh' : 'zh-partial') : 'en') : 'none';
  return { ...w, _zh: { name: zhName, spellName: zhSpellName, spellDesc: zhSpellDesc, status: zhStatus } };
});
fs.writeFileSync(path.join(DIR, 'weapons.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), source: 'gowhead.com/api/entities?type=weapon', total: en.length, count: weapons.length, weapons }, null, 1));
console.log(`合并视图落盘：${weapons.length} 把`);
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
const zhStats = { zh: 0, 'zh-partial': 0, en: 0, none: 0 };
for (const w of weapons) {
  const rar = w.data ? JSON.parse(w.data).WeaponRarity : `idx${w.RarityIdx}`;
  byRarity[rar] = (byRarity[rar] || 0) + 1;
  byType[w.TroopType || '?'] = (byType[w.TroopType || '?'] || 0) + 1;
  const colors = Object.keys(w._ManaColors_parsed || {}).length;
  byColor[colors] = (byColor[colors] || 0) + 1;
  if (w.HeroClassCode) classWeapons++;
  if (w.KingdomId) withKingdom++;
  zhStats[w._zh.status] = (zhStats[w._zh.status] || 0) + 1;
}
const summary = { total: en.length, fetched: weapons.length, byRarity, byType, byColorCount: byColor, classWeapons, withKingdom, zhCoverage: zhStats, icons: stat };
fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
