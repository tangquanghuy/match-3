// 统计技能描述里所有方括号标记 [...] 的种类与频次，
// 确保魔法缩放解析器覆盖全部格式。用完即删。
import fs from 'node:fs';

const troops = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const spells = troops.map((t) => t.spell?.description ?? '').filter(Boolean);

// 抽取所有 [...] 标记，按"归一化模式"归类（数字→N）
const rawFreq = new Map();
const patFreq = new Map();
for (const d of spells) {
  const tokens = d.match(/\[[^\]]*\]/g) ?? [];
  for (const tok of tokens) {
    rawFreq.set(tok, (rawFreq.get(tok) ?? 0) + 1);
    const pat = tok.replace(/\d+/g, 'N');
    patFreq.set(pat, (patFreq.get(pat) ?? 0) + 1);
  }
}

const out = [];
const log = (s) => out.push(s);

log(`含方括号标记的技能数: ${spells.filter((d) => /\[/.test(d)).length} / ${spells.length}`);

log(`\n== 归一化标记模式(数字→N) 频次 ==`);
for (const [pat, n] of [...patFreq.entries()].sort((a, b) => b[1] - a[1])) {
  log(`  ${pat.padEnd(16)} ${String(n).padStart(4)}`);
}

log(`\n== [魔法 + N] 的 N 值分布 ==`);
const magicN = new Map();
for (const [tok, n] of rawFreq.entries()) {
  const m = tok.match(/魔法\s*\+\s*(\d+)/);
  if (m) magicN.set(Number(m[1]), (magicN.get(Number(m[1])) ?? 0) + n);
}
for (const [k, v] of [...magicN.entries()].sort((a, b) => a[0] - b[0])) {
  log(`  [魔法 + ${k}] : ${v}`);
}
const bare = rawFreq.get('[魔法]') ?? 0;
log(`  [魔法](无加值) : ${bare}`);

log(`\n== 比率标记 [N:M] 的具体值分布 ==`);
const ratio = new Map();
for (const [tok, n] of rawFreq.entries()) {
  if (/^\[\d+:\d+\]$/.test(tok)) ratio.set(tok, (ratio.get(tok) ?? 0) + n);
}
for (const [k, v] of [...ratio.entries()].sort((a, b) => b[1] - a[1])) log(`  ${k} : ${v}`);

log(`\n== 倍率标记 [xN] 的具体值分布 ==`);
const mult = new Map();
for (const [tok, n] of rawFreq.entries()) {
  if (/^\[x\d+\]$/.test(tok)) mult.set(tok, (mult.get(tok) ?? 0) + n);
}
for (const [k, v] of [...mult.entries()].sort((a, b) => b[1] - a[1])) log(`  ${k} : ${v}`);

log(`\n== 其它未归类标记(非魔法/比率/倍率) 样本 ==`);
let shown = 0;
for (const [pat, n] of [...patFreq.entries()].sort((a, b) => b[1] - a[1])) {
  if (/魔法/.test(pat) || /^\[N:N\]$/.test(pat) || /^\[xN\]$/.test(pat)) continue;
  log(`  ${pat.padEnd(16)} ${n}`);
  if (++shown >= 20) break;
}

fs.writeFileSync('scripts/_scaling_tokens_report.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
