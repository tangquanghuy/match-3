// 资源引用自检：代码里写死的 /static/... 路径都要有文件；部队立绘 / 入侵官阶图逐个核对。
//   node scripts/assets/check.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const PUBLIC = path.join(ROOT, 'game-assets', 'public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const missing = [];
const seen = new Set();
for (const file of walk(path.join(ROOT, 'src')).filter((f) => /\.(ts|css|html)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\/static\/[\w./-]+/g)) {
    const url = m[0];
    // 模板字符串片段（如 /static/portraits/${...}）在下面单独核对
    if (url.endsWith('/') || text[m.index + url.length] === '$') continue;
    seen.add(url);
    if (!fs.existsSync(path.join(PUBLIC, url))) missing.push(`${path.relative(ROOT, file)}: ${url}`);
  }
}

const troops = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const list = Array.isArray(troops) ? troops : Object.values(troops);
let portraits = 0;
for (const t of list) {
  if (!t.portrait) continue;
  portraits++;
  if (!fs.existsSync(path.join(PUBLIC, 'static', 'portraits', `${t.portrait}.webp`))) missing.push(`portrait ${t.id} ${t.portrait}`);
}
for (let i = 0; i < 30; i++) {
  if (!fs.existsSync(path.join(PUBLIC, 'static', 'invasion-ranks', `rank-${i}.webp`))) missing.push(`invasion rank ${i}`);
}

console.log(`literal /static paths: ${seen.size}, troop portraits: ${portraits}`);
if (missing.length) {
  console.log(`MISSING ${missing.length}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log('all referenced static assets exist');
