#!/usr/bin/env node
/** Validate the 921 item, five-shard human/agent review against the original live comparison. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'artifacts/gowhead-troop-audit/approval-921');
const load = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const manifest = load('manifest.json');
const decisions = ['functional_fix', 'translation_fix', 'equivalent', 'source_conflict', 'uncertain', 'source_zh_suspect'];
const expected = new Map(manifest.map((v) => [v.key, v]));
if (manifest.length !== 921 || expected.size !== 921) throw new Error(`manifest not 921 unique items: ${manifest.length}/${expected.size}`);
const liveReport=JSON.parse(fs.readFileSync(path.join(root,'artifacts/gowhead-troop-audit/report.json'),'utf8'));
const source=liveReport.rows.flatMap(row=>row.differences.filter(d=>d.type==='content_review').map(d=>({...d,key:`${d.id}|${d.field}`})));
if(source.length!==921 || source.some(d=>!expected.has(d.key)||['local','gowheadZh','gowheadEn'].some(k=>d[k]!==expected.get(d.key)[k]))) throw new Error('manifest differs from current live comparison report');
const all = [];
for (let i = 1; i <= 5; i++) {
  const part = load(`part-${i}.json`);
  const result = load(`review-${i}.json`);
  const keys = new Set(part.map((v) => v.key));
  if (result.length !== part.length) throw new Error(`shard ${i}: expected ${part.length}, got ${result.length}`);
  const found = new Set();
  for (const row of result) {
    if (row.key !== `${row.id}|${row.field}` || !expected.has(row.key) || !keys.has(row.key)) throw new Error(`shard ${i}: unexpected key ${row.key}`);
    if (found.has(row.key)) throw new Error(`shard ${i}: duplicate key ${row.key}`);
    found.add(row.key);
    if (!decisions.includes(row.decision)) throw new Error(`shard ${i}: bad verdict ${row.key} ${row.decision}`);
    const evidence = Array.isArray(row.evidence) ? row.evidence.join('; ') : row.evidence;
    if (typeof row.reason !== 'string' || row.reason.trim().length < 3 || typeof evidence !== 'string' || evidence.trim().length < 3) throw new Error(`shard ${i}: missing justification ${row.key}`);
    all.push({...expected.get(row.key), decision:row.decision, reason:row.reason, evidence, shard:i});
  }
  for (const key of keys) if (!found.has(key)) throw new Error(`shard ${i}: missing ${key}`);
}
if (all.length !== 921 || new Set(all.map((x) => x.key)).size !== 921) throw new Error('global review coverage failed');
all.sort((a,b) => a.id-b.id || a.field.localeCompare(b.field));
const counts = Object.fromEntries(decisions.map(d=>[d, all.filter(x=>x.decision===d).length]));
const grouped = Object.fromEntries(decisions.map(d=>[d, all.filter(x=>x.decision===d)]));
const summary={source:'report.json content_review: actual src/data/troops.json vs live gowhead zh/en; spell steps and curated engine checked for suspected semantic differences', reviewed:all.length, uniqueKeys:expected.size, counts, findings:grouped};
fs.writeFileSync(path.join(dir,'approved.json'),JSON.stringify(summary,null,2)+'\n');
const q=(x)=>`"${String(x??'').replaceAll('"','""')}"`;
const columns=['key','id','referenceName','field','decision','local','gowheadZh','gowheadEn','reason','evidence','shard'];
fs.writeFileSync(path.join(dir,'approved.csv'),'\uFEFF'+columns.join(',')+'\r\n'+all.map(row=>columns.map(k=>q(row[k])).join(',')).join('\r\n')+'\r\n');
await import('./render-gowhead-921-readable.mjs');
console.log(JSON.stringify({reviewed:all.length,uniqueKeys:expected.size,counts,files:['approved.md','\u9010\u9879\u5bf9\u7167.md','approved.csv','approved.json']},null,2));
