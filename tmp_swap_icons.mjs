import { readFileSync, writeFileSync } from 'fs';

const icons = JSON.parse(readFileSync('tmp_gic.json', 'utf8')).icons;

function wrap(body) {
  return `<svg class="gic" viewBox="0 0 512 512" aria-hidden="true">${body}</svg>`;
}

function replaceKey(src, key, body) {
  const re = new RegExp(`  ${key}: '<svg class="gic"[\\s\\S]*?</svg>',`);
  const next = src.replace(re, `  ${key}: '${wrap(body)}',`);
  if (next === src) throw new Error('no replace ' + key);
  return next;
}

let src = readFileSync('src/meta/shell/gameIcons.ts', 'utf8');
src = replaceKey(src, 'soul', icons['potion-ball'].body);
src = replaceKey(src, 'crystal', icons['cut-diamond'].body);
src = src.replace('magic-potion / diamond-hard', 'potion-ball / cut-diamond');
writeFileSync('src/meta/shell/gameIcons.ts', src);
console.log('replaced soul+crystal');
