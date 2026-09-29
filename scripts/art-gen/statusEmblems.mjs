// 战斗状态「中招」徽印素材（状态施加瞬间在卡面中央放大出现、再飞入徽记栏）。
// 一个规范键一张（别名 enraged/cursed/charmed/lycanthropy… 由 statusPresentation.canonicalStatusKey 收敛）。
// 生成：node scripts/art-gen/generate.mjs status-emblem-<key>；处理：python scripts/art-gen/process.py status-emblem-<key>
// 输出 game-assets/bundled/fx/status-emblems/<key>.webp（进版本库）。
//
// 风格口径沿用 2026-09-28 用户定调的「现代二次元游戏图标、要有颜色」（assets.mjs ANIME_COLOR），
// 额外要求细深色描边：徽印叠在立绘上，浅色立绘上也要读得出来（审查问题：screen 混合在亮底上不可见）。
const EMBLEM = 'Modern anime gacha RPG battle status-effect emblem, in the polished style of contemporary Japanese / Chinese anime game skill icons. '
  + 'One single bold iconic symbol with a simple readable silhouette. Clean crisp shapes, bold cel shading with smooth gradients, glossy highlights, '
  + 'a thin dark outline around the whole symbol so it reads on both bright and dark backgrounds, vivid saturated colors with one clear dominant hue, '
  + 'a bright luminous core. Compact roughly square composition, the symbol fills about 75% of the canvas, centered, '
  + 'isolated on a fully transparent background. No text, no letters, no numbers, no watermark, no frame, no circular badge background, no character, no scenery.';

/** 规范键 → 主体描述（主色与徽记色 statusBadges.BADGES 对齐） */
const SUBJECTS = {
  poison: 'a toxic bright green poison droplet with a tiny skull shape inside it, small bubbles and drips around it',
  burning: 'a fierce stylized orange and yellow fire burst, curling flame tongues',
  bleed: 'three crimson red blood droplets splashing out of a sharp diagonal slash mark',
  silence: 'a violet magical seal talisman: a closed lock at the center of a purple runic ring, sealing a sound wave',
  frozen: 'a cluster of sharp pale ice-blue crystal shards around a snowflake, frosty',
  stun: 'a small golden impact burst with three yellow cartoon stars orbiting around it',
  entangle: 'green thorny vines tightly coiled into a knot, with a few small leaves',
  web: 'a violet spider web with a small dark spider hanging in the middle',
  disease: 'a sickly yellow-green miasma cloud with floating round spores',
  curse: 'a purple cursed evil eye sigil wreathed in dark violet smoke',
  'death-mark': 'a crimson red skull sigil inside a thin target reticle, ominous',
  charm: 'a glossy pink heart with small sparkles and a tiny golden arrow through it',
  terror: 'a dark purple ghostly screaming face made of shadow wisps, haunting',
  'faerie-fire': 'a violet fairy flame wisp with glittering magenta sparks',
  marked: "a hunter's orange-red crosshair reticle with an arrowhead pointing at the center",
  wolf: 'a pale silver-blue howling wolf head silhouette in front of a crescent moon',
  'mana-burn': 'a blue mana crystal cracking apart while engulfed in blue flames',
  barrier: 'a glowing cyan hexagonal energy shield with light facets',
  reflect: 'a silvery light-blue mirror shield bouncing back rays of light',
  enchanted: 'a magenta arcane rune circle with a floating glowing mana gem in the middle',
  rage: 'a flaming red-orange clenched fist, fiery and furious',
  submerged: 'a teal ocean water wave swirl with a few rising bubbles',
  blessed: 'a golden halo with two small white angel wings and soft holy light rays',
};

export const STATUS_EMBLEM_KEYS = Object.keys(SUBJECTS);

export const STATUS_EMBLEM_ASSETS = Object.fromEntries(Object.entries(SUBJECTS).map(([key, subject]) => [
  `status-emblem-${key}`,
  {
    size: '1024x1024',
    out: `game-assets/bundled/fx/status-emblems/${key}.webp`,
    longest: 256,
    pad: 0.03,
    prompt: `Status effect emblem: ${subject}. ` + EMBLEM,
  },
]));
