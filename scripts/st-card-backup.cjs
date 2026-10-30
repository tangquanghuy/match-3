// Back up a SillyTavern character card for handoff: write a cleaned copy of the PNG card
// (chara + ccv3 chunks rewritten), its linked world book, and readable extracts of the
// tavern helper scripts and regex scripts. The tavern installation itself is never modified.
//
//   node scripts/st-card-backup.cjs <card.png> <world.json> <outDir>
//
// Cleaning: `chat` (the last opened chat) is cleared, and tavern helper variables listed in
// DROP_VARIABLES (test-time start presets) are removed. Everything else is kept as installed.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [cardPath, worldPath, outDir] = process.argv.slice(2);
if (!cardPath || !worldPath || !outDir) { console.error('usage: node scripts/st-card-backup.cjs <card.png> <world.json> <outDir>'); process.exit(1); }
const DROP_VARIABLES = ['start_presets'];

const buf = fs.readFileSync(cardPath);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
const chunks = []; let pos = 8;
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
  chunks.push({ type, data: buf.subarray(pos + 8, pos + 8 + len) }); pos += 12 + len;
}
const text = {};
for (const c of chunks) if (c.type === 'tEXt') { const z = c.data.indexOf(0); text[c.data.toString('latin1', 0, z)] = c.data.toString('latin1', z + 1); }
const decode = key => text[key] ? JSON.parse(Buffer.from(text[key], 'base64').toString('utf8')) : undefined;
const clean = card => {
  if (!card) return card;
  card.chat = '';
  const vars = card.data?.extensions?.tavern_helper?.variables;
  for (const key of DROP_VARIABLES) if (vars && key in vars) delete vars[key];
  return card;
};
const v3 = clean(decode('ccv3')); const v2 = clean(decode('chara'));
const main = v3 ?? v2;
if (!main) throw new Error('no chara/ccv3 chunk');

const tEXt = (key, value) => {
  const data = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]);
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write('tEXt', 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from('tEXt', 'ascii'), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
};
const raw = c => { const head = Buffer.alloc(8); head.writeUInt32BE(c.data.length, 0); head.write(c.type, 4, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(c.type, 'ascii'), c.data])) >>> 0, 0); return Buffer.concat([head, c.data, crc]); };
const out = [buf.subarray(0, 8)];
for (const c of chunks) {
  if (c.type === 'tEXt') { const key = c.data.toString('latin1', 0, c.data.indexOf(0)); if (key === 'chara' || key === 'ccv3') continue; }
  if (c.type === 'IEND') {
    if (v2) out.push(tEXt('chara', Buffer.from(JSON.stringify(v2), 'utf8').toString('base64')));
    if (v3) out.push(tEXt('ccv3', Buffer.from(JSON.stringify(v3), 'utf8').toString('base64')));
  }
  out.push(raw(c));
}
fs.mkdirSync(path.join(outDir, 'extracted', 'scripts'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'extracted', 'regex'), { recursive: true });
const name = path.basename(cardPath);
fs.writeFileSync(path.join(outDir, name), Buffer.concat(out));
fs.copyFileSync(worldPath, path.join(outDir, path.basename(worldPath)));

const safe = s => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
const scripts = []; const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (n && typeof n === 'object') { if (typeof n.content === 'string') scripts.push(n); if (Array.isArray(n.scripts)) walk(n.scripts); } };
walk(main.data?.extensions?.tavern_helper?.scripts ?? main.data?.extensions?.tavern_helper);
const manifest = { card: name, world: path.basename(worldPath), cleaned: { chat: 'cleared', droppedVariables: DROP_VARIABLES }, scripts: [], regex: [] };
scripts.forEach((s, i) => { const file = `${String(i + 1).padStart(2, '0')}-${safe(s.name)}.js`; fs.writeFileSync(path.join(outDir, 'extracted', 'scripts', file), s.content); manifest.scripts.push({ order: i + 1, name: s.name, enabled: s.enabled, file }); });
(main.data?.extensions?.regex_scripts ?? []).forEach((r, i) => { const file = `${String(i + 1).padStart(2, '0')}-${safe(r.scriptName)}.json`; fs.writeFileSync(path.join(outDir, 'extracted', 'regex', file), JSON.stringify(r, null, 2)); manifest.regex.push({ order: i + 1, name: r.scriptName, disabled: !!r.disabled, file }); });
const localUrls = [...new Set(JSON.stringify(main).match(/http:\/\/127\.0\.0\.1:\d+[^\s"'`<>)\\]*/g) ?? [])];
manifest.localUrls = localUrls;
const hash = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
manifest.sha256 = { [name]: hash(path.join(outDir, name)), [path.basename(worldPath)]: hash(path.join(outDir, path.basename(worldPath))) };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ scripts: manifest.scripts.length, regex: manifest.regex.length, localUrls }, null, 1));
