/** Refresh offline prompt provenance. New or changed art requires visual classification. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'data/portrait-forms.json');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/build-portrait-forms.mjs <original-prompts.txt>');
const bytes = fs.readFileSync(source);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const text = bytes.toString('utf8');
const headings = [...text.matchAll(/^([^\r\n]+)-(侧面|正面)\s*[:：]\s*$/gm)];
const prompts = new Map();
for (let i = 0; i < headings.length; i++) {
  const h = headings[i];
  if (h[2] !== '正面') continue;
  const body = text.slice(h.index + h[0].length, headings[i + 1]?.index ?? text.length);
  const subject = body.match(/<subject>([\s\S]*?)<\/subject>/)?.[1]?.trim();
  prompts.set(h[1], subject ?? body.replace(/\s+/g, ' ').trim());
}

const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const troops = read('src/data/troops.json');
const manifest = read('artifacts/portrait-manifest.json');
const old = fs.existsSync(target) ? read('data/portrait-forms.json') : { entries: [] };
const byPortrait = new Map(old.entries.map(x => [x.portrait, x]));
const byHash = new Map(old.entries.filter(x => x.form).map(x => [x.contentHash, x]));
const pending = [];
const entries = troops.map(t => {
  const contentHash = hash(fs.readFileSync(path.join(root, 'game-assets/public/static/portraits', t.portrait + '.webp')));
  const current = byPortrait.get(t.portrait);
  const reviewed = current?.contentHash === contentHash ? current : byHash.get(contentHash);
  const previousName = manifest.find(m => m.referenceName === t.referenceName && m.portrait === t.portrait)?.name;
  const promptName = [t.name, previousName].find(n => prompts.has(n)) ?? null;
  if (!reviewed?.form) pending.push({ troopId: t.id, portrait: t.portrait });
  return { portrait: t.portrait, contentHash, promptName,
    form: reviewed?.form ?? null, review: reviewed?.review ?? 'pending',
    evidence: reviewed?.evidence ?? '新增或变更成图，尚待按五形态查看图片。',
    promptEvidence: promptName ? prompts.get(promptName) : null };
});
const metadata = { ...old, version: 1,
  source: { file: path.basename(source), sha256: hash(bytes), description: 'Original portrait generation prompts; offline evidence only.' },
  forms: ['人形', '野兽', '类人', '怪物', '异形体'] };
delete metadata.entries;
const header = JSON.stringify(metadata, null, 2).slice(0, -2);
fs.writeFileSync(target, header + ',\n  "entries": [\n'
  + entries.map(e => '    ' + JSON.stringify(e)).join(',\n') + '\n  ]\n}\n');
console.log(JSON.stringify({ records: entries.length, pending }, null, 2));
// Never infer a nonhuman face from a race name. The check command rejects pending forms.
if (pending.length) process.exitCode = 1;
