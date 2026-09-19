/**
 * 生成 src/meta/shell/traitIconsGameIcons.ts（meta 屏特质图形族图标，按稀有度三档质感）。
 *
 * 图源：game-icons.net 全库（GitHub game-icons/icons，Lorc / Delapouite 等，
 * 授权 CC BY 3.0）。刷新图库：
 *   git clone --depth 1 https://github.com/game-icons/icons tmp/game-icons
 *   node scripts/build_meta_trait_icons.mjs
 *
 * 每族三档：simple（低稀有度，朴素剪影）/ normal（稀有~超稀有）/ ornate（史诗/传说，华丽）。
 * 档位缺图时回落 normal。族 → 图标名映射在 FAMILY_ICONS 维护；找不到文件时报错退出。
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'tmp/game-icons';
const OUT = 'src/meta/shell/traitIconsGameIcons.ts';

/**
 * 族标签 → 三档候选图标（文件名不含作者前缀，全库按文件名检索，依次取第一个存在者）。
 * normal 必填；simple/ornate 可省略（省略则三档同图）。
 */
const FAMILY_ICONS = {
  免疫: { normal: ['checked-shield'], simple: ['shield'], ornate: ['barricade'] },
  隐匿: { normal: ['wing-cloak'], simple: ['hidden'], ornate: ['hooded-assassin'] },
  反伤: { normal: ['shield-reflect'], simple: ['shield'], ornate: ['mirror-mirror'] },
  闪避: { normal: ['dodge'], simple: ['run'] },
  剧毒: { normal: ['poison-bottle'], simple: ['drop'], ornate: ['poison-cloud'] },
  流血: { normal: ['blood'], simple: ['bleeding-eye'], ornate: ['bleeding-wound'] },
  燃烧: { normal: ['flame'], simple: ['campfire'], ornate: ['wildfires'] },
  冻结: { normal: ['snowflake-1'], simple: ['ice-cube'], ornate: ['snowflake-2'] },
  诅咒: { normal: ['cursed-star'], simple: ['blackball'], ornate: ['voodoo-doll'] },
  恐惧: { normal: ['terror'], simple: ['floating-ghost'], ornate: ['grim-reaper'] },
  魅惑: { normal: ['charm'], simple: ['sparkles'], ornate: ['royal-love'] },
  眩晕: { normal: ['knockout'] },
  缠绕: { normal: ['entangled-typhoon'], simple: ['rope-coil'], ornate: ['whip'] },
  织网: { normal: ['cobweb'] },
  屏障: { normal: ['energy-shield'], ornate: ['bubble-field'] },
  沉默: { normal: ['silence'], simple: ['mute'], ornate: ['silenced'] },
  下潜: { normal: ['diving-helmet'], simple: ['swimfins'], ornate: ['submarine'] },
  妖火: { normal: ['fairy'], simple: ['sparkles'], ornate: ['fairy-wand'] },
  死亡标记: { normal: ['crosshair'], ornate: ['death-note'] },
  狂怒: { normal: ['brute'], ornate: ['broken-skull'] },
  法印: { normal: ['wax-seal'], ornate: ['rune-stone'] },
  风暴: { normal: ['half-tornado'], simple: ['sandstorm'], ornate: ['tornado'] },
  爆破: { normal: ['bright-explosion'] },
  净化: { normal: ['magic-swirl'] },
  窃取: { normal: ['robber-hand'], ornate: ['assassin-pocket'] },
  削弱: { normal: ['despair'] },
  重生: { normal: ['cosmic-egg'], simple: ['egg-eye'], ornate: ['angel-outfit'] },
  贪财: { normal: ['coins-pile'], simple: ['coins'], ornate: ['cash'] },
  状态: { normal: ['duality-mask'] },
  生命: { normal: ['heart-wings'], simple: ['heart-bottle'], ornate: ['health-capsule'] },
  攻击: { normal: ['broadsword'], simple: ['daggers'], ornate: ['sword-brandish'] },
  护甲: { normal: ['breastplate'], simple: ['shoulder-armor'], ornate: ['armor-upgrade'] },
  法力: { normal: ['crystal-ball'], simple: ['magic-lamp'] },
  先攻: { normal: ['sprint'], simple: ['run'], ornate: ['lightning-arc'] },
  回复: { normal: ['regeneration'], simple: ['heart-plus'], ornate: ['health-capsule'] },
  减伤: { normal: ['health-decrease'] },
  盟约: { normal: ['linked-rings'], ornate: ['three-friends'] },
  转化: { normal: ['swap-bag'], simple: ['recycle'], ornate: ['body-swapping'] },
  宝石: { normal: ['cut-diamond'], simple: ['diamond'], ornate: ['gems'] },
  骷髅: { normal: ['skull-crossed-bones'], simple: ['skull'], ornate: ['death-skull'] },
  亡语: { normal: ['tombstone'], ornate: ['coffin'] },
  召唤: { normal: ['summon'], simple: ['portal'], ornate: ['cultist'] },
  兜底: { normal: ['stars-stack'] },
};

// —— 检索全库文件（basename → 相对路径） ——
const byName = new Map();
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.svg')) byName.set(f.slice(0, -4), p);
  }
})(REPO);

function resolveStyle(candidates) {
  for (const name of candidates) {
    const p = byName.get(name);
    if (!p) continue;
    const text = fs.readFileSync(p, 'utf8');
    const openEnd = text.indexOf('>', text.indexOf('<svg'));
    let body = text.slice(openEnd + 1, text.lastIndexOf('</svg>')).trim();
    // game-icons 约定 = 全屏黑底 path + fill="#fff" 的图形 path：去底板、剥白填充，
    // 让使用方的根 fill 直接给图形着色。
    body = body.replace(/<path[^>]*d="M0 0h512v512H0z"[^>]*\/>/g, '');
    body = body.replace(/ fill="#fff"/g, '').trim();
    return { name, author: path.relative(REPO, p).split(path.sep)[0], body };
  }
  return null;
}

const rows = [];
for (const [family, styles] of Object.entries(FAMILY_ICONS)) {
  const normal = resolveStyle(styles.normal);
  if (!normal) throw new Error(`族「${family}」normal 候选全部不存在: ${styles.normal.join(', ')}`);
  const simple = resolveStyle(styles.simple ?? []) ?? normal;
  const ornate = resolveStyle(styles.ornate ?? []) ?? normal;
  rows.push({ family, simple, normal, ornate });
}
const fallback = resolveStyle(FAMILY_ICONS.兜底.normal);
if (!fallback) throw new Error('兜底图标缺失');

const gi = (icon) => `{ name: '${icon.name}', author: '${icon.author}', body: ${JSON.stringify(icon.body)} }`;
const lines = [
  '/**',
  ' * 特质图形族图标（生成文件，勿手改）：scripts/build_meta_trait_icons.mjs。',
  ' * 图源 game-icons.net（Lorc、Delapouite、Carl Olsen、Felbrigg、Sbed、Skoll、Badges 等，',
  ' * 授权 CC BY 3.0 https://game-icons.net/）。',
  ' * 每族三档质感：simple（低稀有度朴素剪影）/ normal（稀有~超稀有标准）/ ornate（史诗/传说华丽），',
  ' * body 为 512×512 viewBox 的原始内联内容，由使用方套 <svg viewBox="0 0 512 512" fill="颜色"> 着色。',
  ' */',
  '',
  'export interface GameIcon {',
  '  /** 图标名（game-icons.net） */',
  '  name: string;',
  '  /** 作者（署名要求，CC BY 3.0） */',
  '  author: string;',
  '  /** svg 内联内容（不含 <svg> 壳） */',
  '  body: string;',
  '}',
  '',
  'export interface FamilyGameIcons {',
  '  simple: GameIcon;',
  '  normal: GameIcon;',
  '  ornate: GameIcon;',
  '}',
  '',
  'export const TRAIT_FAMILY_ICONS: Record<string, FamilyGameIcons> = {',
  ...rows.map((r) => `  '${r.family}': { simple: ${gi(r.simple)}, normal: ${gi(r.normal)}, ornate: ${gi(r.ornate)} },`),
  '};',
  '',
  `export const TRAIT_FALLBACK_ICON: GameIcon = ${gi({ ...fallback })};`,
  '',
];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`written ${OUT}: ${rows.length} families × 3 styles + fallback`);
