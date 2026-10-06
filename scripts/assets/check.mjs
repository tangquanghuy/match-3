// 资源引用自检：代码里写死的 /static/... 路径都要有文件；部队立绘 / 入侵官阶图逐个核对。
//   node scripts/assets/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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

// A local-only image still passes the existence check but vanishes on a fresh checkout.
// The deployment path must validate the Git index as well as the local filesystem.
if (process.argv.includes('--tracked')) {
  const prefix = 'game-assets/public/static/';
  const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '-z', '--', prefix], { cwd: ROOT })
    .toString('utf8').split('\0').filter(Boolean));
  const staticRoot = path.join(PUBLIC, 'static');
  const untracked = walk(staticRoot).map(file => `${prefix}${path.relative(staticRoot, file).replaceAll(path.sep, '/')}`)
    .filter(file => !tracked.has(file));
  if (untracked.length) missing.push(`${untracked.length} static assets missing from Git index (first 20): ${untracked.slice(0, 20).join(', ')}`);
  console.log(`tracked static assets: ${tracked.size}`);
}

console.log(`literal /static paths: ${seen.size}, troop portraits: ${portraits}`);
if (missing.length) {
  console.log(`MISSING ${missing.length}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log('all referenced static assets exist');
