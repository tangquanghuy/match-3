// Build a readable list of every skill that was directly edited during GoW acceptance.
// Output: docs/gow-skill-changes-list.md (grouped per skill, zh name, change kind, before -> after).
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = `${root}tasks/active/gow-skill-shards/changes/`;
const read = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const changes = [...fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => read(dir + f))];
const legacy = `${root}tasks/active/gow-skill-shards/CHANGES.jsonl`;
if (fs.existsSync(legacy)) changes.push(...read(legacy));
const troops = JSON.parse(fs.readFileSync(`${root}src/data/troops.json`, 'utf8'));
const weapons = JSON.parse(fs.readFileSync(`${root}src/data/weapons.json`, 'utf8'));
const name = new Map([...(Array.isArray(troops) ? troops : troops.troops).map((t) => [`troop:${t.id}`, t.name]), ...weapons.map((w) => [`weapon:${w.id}`, w.name])]);
const KIND = { assembler: '行为', data: '数据/描述', 'assembler+data': '行为+数据', test: '测试' };
const per = new Map();
for (const c of changes) {
  if (c.kind === 'primitive') continue;
  for (const k of c.keys ?? []) {
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(c);
  }
}
const clip = (s, n = 140) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, n);
const sortKey = (k) => (k.startsWith('troop:') ? 0 : 1) * 1e6 + Number(k.split(':')[1]);
const rows = [...per.keys()].sort((a, b) => sortKey(a) - sortKey(b));
const out = [
  '# GoW 技能验收改动清单',
  '',
  `生成自 tasks/active/gow-skill-shards/changes/*.jsonl。共 ${rows.length} 个技能被直接修改（兵种 ${rows.filter((k) => k.startsWith('troop:')).length}，武器 ${rows.filter((k) => k.startsWith('weapon:')).length}）；公共机制改动另见文末。`,
  '',
  '| 编号 | 中文名 | 类型 | 改动（改后） | 改前 |',
  '|---|---|---|---|---|',
];
for (const k of rows) {
  const list = per.get(k);
  const kinds = [...new Set(list.map((c) => KIND[c.kind] ?? c.kind))].join('+');
  const after = list.map((c) => clip(c.after, 160)).filter(Boolean).join('；');
  const before = list.map((c) => clip(c.before, 100)).filter(Boolean).join('；');
  out.push(`| ${k} | ${name.get(k) ?? ''} | ${kinds} | ${after} | ${before} |`);
}
out.push('', '## 公共机制改动（影响多个技能）', '', '| 问题编号 | 改动 |', '|---|---|');
const prim = new Map();
for (const c of changes) if (c.kind === 'primitive' && !prim.has(c.issue)) prim.set(c.issue, c);
for (const [id, c] of prim) out.push(`| ${id} | ${clip(c.after, 220)} |`);
fs.writeFileSync(`${root}docs/gow-skill-changes-list.md`, out.join('\n') + '\n');
console.log('skills', rows.length, 'primitives', prim.size);
