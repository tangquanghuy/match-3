// Append/merge issues into lane-L4b/issues.json. Usage: node add-issues.mjs <issues-module.mjs>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const file = 'tasks/active/gow-skill-shards/lane-L4b/issues.json';
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const add = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
for (const it of add) {
  const i = list.findIndex(x => x.id === it.id);
  if (i >= 0) list[i] = { ...list[i], ...it }; else list.push(it);
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
console.log('issues:', list.length);
