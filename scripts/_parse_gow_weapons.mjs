// 一次性解析脚本：gemsofwar.com/game-guide-weapon-list 官方武器总表 → 结构化 JSON
// 输入 artifacts/_gow_official_weapons.html（curl 抓取），输出 artifacts/gow-weapons.json
// 用法：node scripts/_parse_gow_weapons.mjs
import fs from 'node:fs';

const html = fs.readFileSync('artifacts/_gow_official_weapons.html', 'utf8');

// ---- HTML 实体解码（覆盖本页用到的） ----
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ' '));

// ---- 按标题切块 ----
const blocks = [];
const re = /<h2>([\s\S]*?)<\/h2>/g;
let m;
while ((m = re.exec(html))) blocks.push({ name: stripTags(m[1]), start: m.index });
for (let i = 0; i < blocks.length; i++) {
  blocks[i].body = html.slice(blocks[i].start, i + 1 < blocks.length ? blocks[i + 1].start : undefined);
}

const RARITY_BY_COLOR = { gray: 'Common', green: 'Uncommon', blue: 'Rare', purple: 'Epic', orange: 'Legendary', yellow: 'Mythic' };
const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'];

const weapons = [];
for (const b of blocks) {
  const body = b.body;

  // 稀有度行：<font color="gray">Common Weapon</font>
  let rarity = null, rarityColor = null;
  const rM = body.match(/<font color="(\w+)">([\w ]+? Weapon)<\/font>/);
  if (rM) { rarityColor = rM[1]; rarity = rM[2].replace(/ Weapon$/, ''); }

  // 头信息行：(Mana Cost:4 <font color="red">Red</font> , Unlocks at <font color="red">Fire</font> Mastery 0)
  const headM = body.match(/Mana Cost\s*:?\s*(\d+)([\s\S]*?)(?:<\/td>|<\/tr>)/);
  let manaCost = null, colors = [], unlock = null;
  if (headM) {
    manaCost = +headM[1];
    const head = stripTags(headM[2]);
    for (const c of COLORS) if (new RegExp(`\\b${c}\\b`).test(head)) colors.push(c);
    const uM = head.match(/Unlocks at\s+(.*?)[)\s]*$/);
    if (uM) unlock = uM[1].trim();
    else if (/Special Event/i.test(head)) unlock = 'Special Events';
  }

  // 法术文本：头行之后、含 [ 公式 ] 的那个 <td>
  let spell = null;
  const tdRe = /<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g;
  let td;
  while ((td = tdRe.exec(body))) {
    const txt = stripTags(td[1]);
    if (txt && txt.length > 8 && !/Mana Cost/.test(txt) && !/Weapon\s*\)$/.test(txt)) { spell = txt; break; }
  }

  // 图片 ID：gameguide/images/7068.jpg
  const imgM = body.match(/gameguide\/images\/(\d+)\.jpg/);

  weapons.push({
    name: b.name,
    rarity, rarityColor,
    manaCost, colors, unlock,
    spell,
    imageId: imgM ? +imgM[1] : null,
  });
}

// ---- 统计 ----
const stat = {};
for (const w of weapons) {
  stat.total = (stat.total || 0) + 1;
  if (w.rarity) stat[`rarity:${w.rarity}`] = (stat[`rarity:${w.rarity}`] || 0) + 1;
  if (w.manaCost != null) { stat.costSum = (stat.costSum || 0) + w.manaCost; stat.costN = (stat.costN || 0) + 1; }
  const n = w.colors.length;
  stat[`colors:${n}`] = (stat[`colors:${n}`] || 0) + 1;
  if (!w.spell) stat.missingSpell = (stat.missingSpell || 0) + 1;
  if (w.unlock == null) stat.missingUnlock = (stat.missingUnlock || 0) + 1;
}
stat.avgCost = stat.costN ? (stat.costSum / stat.costN).toFixed(2) : null;

fs.writeFileSync('artifacts/gow-weapons.json', JSON.stringify({ source: 'https://gemsofwar.com/game-guide-weapon-list/', fetchedAt: '2026-09-17', stats: stat, weapons }, null, 2));
console.log(JSON.stringify(stat, null, 2));
console.log('sample:', JSON.stringify(weapons[0], null, 2));
console.log('missing spell:', weapons.filter(w => !w.spell).map(w => w.name).join(', ') || '(none)');
console.log('six-color:', JSON.stringify(weapons.filter(w => w.colors.length >= 3), null, 1));
console.log('unlock uniq:', [...new Set(weapons.map(w => w.unlock))].join(' | '));
