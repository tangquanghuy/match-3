import fs from 'node:fs';
import { catalog } from './portrait-forms.mjs';
const file = new URL('../src/sillytavern/data/portraits.json', import.meta.url);
const text = JSON.stringify({ version: 1, entries: catalog() }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) throw new Error('Portrait catalog outdated: node scripts/build-st-portraits.mjs');
} else { fs.mkdirSync(new URL('../src/sillytavern/data/', import.meta.url), { recursive: true }); fs.writeFileSync(file, text); }
console.log('ST portrait catalog: ' + catalog().length + ' entries');
