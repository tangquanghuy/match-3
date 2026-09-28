// 文生图素材清单：id → { prompt, size, background?, out, longest, pad }
//   out：process.py 输出的 webp 路径（相对仓库根，进版本库）；longest：最长边像素；pad：裁边留白比例。
// 结算页一批（result/*）已在 2026-09-28 生成，原图不在本仓库，这里只登记输出位置，便于重生成。

const STYLE = 'Premium high-fantasy match-3 RPG game UI asset. Hand-painted digital illustration with crisp clean edges, '
  + 'polished antique gold filigree, dramatic soft rim lighting, rich saturated colors, highly detailed, centered, '
  + 'single isolated object on a fully transparent background. No text, no letters, no numbers, no watermark, no frame around the image.';
const ICON = 'Square game icon, the object fills about 80% of the canvas, front three-quarter view.';
// 2026-09-28 用户定调：整体是「克制的现代二次元游戏风格」，不要老旧、传奇味的厚重金雕花。
const MODERN = 'Modern anime gacha game UI icon, in the refined restrained style of contemporary Japanese / Chinese anime RPGs. '
  + 'Clean crisp vector-like shapes, soft cel shading with gentle gradients, thin clean outlines, matte finish, '
  + 'a limited elegant palette of ivory white, soft silver, muted slate navy and one small accent color, only a hint of pale gold trim. '
  + 'Minimal ornament: no heavy gold filigree, no rivets, no grime, no photorealism, no glowing aura, no sparkles. '
  + 'Simple readable silhouette, centered, single isolated object on a fully transparent background. '
  + 'No text, no letters, no numbers, no watermark, no frame, no circular badge background.';

// 2026-09-28 用户第二次定调：现代二次元游戏图标，但要有颜色——不是清一色象牙白。
const ANIME_COLOR = 'Modern anime gacha game UI icon, in the polished style of contemporary Japanese / Chinese anime RPG item icons. '
  + 'Clean crisp shapes, bold cel shading with smooth gradients, glossy highlights, thin dark outlines, '
  + 'vivid saturated but harmonious colors with one clear dominant hue, good contrast so it reads on a dark UI. '
  + 'Moderate detail only: no heavy baroque gold filigree, no rivets, no grime, no photorealism, no big glowing aura. '
  + 'Simple readable silhouette, centered, single isolated object on a fully transparent background. '
  + 'No text, no letters, no numbers, no watermark, no frame, no circular badge background.';
// 横幅 / 背景：现代二次元游戏宣传图画法（不透明场景）
const KEY_ART = 'Modern anime gacha game key art background, painterly cel-shaded illustration with clean shapes, vivid but harmonious colors, '
  + 'cinematic soft lighting and atmospheric depth, wide landscape composition. No characters in close-up, no text, no letters, no logo, no watermark, no frame, no border.';
const BANNER = (cloth) => ({
  size: '1024x1536',
  out: `src/assets/meta/kingdom/banner-${cloth.id}.webp`,
  longest: 520,
  pad: 0.01,
  prompt: 'A tall vertical medieval heraldic war banner hanging from an ornate polished gold crossbar with round finial knobs, '
    + `front view, perfectly symmetrical. Rich ${cloth.desc} velvet cloth with a subtle woven damask pattern, thick embroidered `
    + 'gold trim along both sides, the bottom edge cut into a swallowtail with two pointed tails ending in small gold tassels. '
    + 'The middle of the cloth is plain and completely empty (an emblem will be placed there later). '
    + 'The banner fills the full canvas height. ' + STYLE,
});

export const ASSETS = {
  'banner-red': BANNER({ id: 'red', desc: 'deep crimson red' }),
  'banner-green': BANNER({ id: 'green', desc: 'deep emerald green' }),
  'banner-blue': BANNER({ id: 'blue', desc: 'deep sapphire blue' }),
  'banner-yellow': BANNER({ id: 'yellow', desc: 'warm saffron golden-yellow' }),
  'banner-purple': BANNER({ id: 'purple', desc: 'deep royal amethyst purple' }),
  'banner-brown': BANNER({ id: 'brown', desc: 'rich burnt-umber brown' }),
  'map-fog': {
    size: '1536x1024',
    background: 'opaque',
    out: 'src/assets/meta/kingdom/map-fog.webp',
    longest: 1536,
    pad: 0,
    prompt: 'Top-down view of a dense sea of soft fog-of-war clouds for a painted fantasy world map: thick billowing mist and '
      + 'rolling cloud banks in muted slate blue-grey and pale silvery parchment tones, soft volumetric wisps and gentle swirls, '
      + 'even coverage across the entire canvas edge to edge, no land, no horizon, no objects, no birds, no text. '
      + 'Painterly hand-painted texture, calm and mysterious.',
  },
  'treasury-hoard': {
    size: '1536x1024',
    out: 'src/assets/meta/kingdom/treasury-hoard.webp',
    longest: 900,
    pad: 0.02,
    prompt: 'A royal tribute treasure hoard: an open ornate dark wooden treasure chest bound with polished gold bands, overflowing '
      + 'with shining gold coins, several glowing violet soul-essence crystal vials, sparkling cut red, blue and green gemstones, '
      + 'two ornate golden keys and a small gold laurel medal, warm golden light rising from inside the chest, a few coins '
      + 'spilling onto the ground in front. Front three-quarter view, wide composition. ' + STYLE,
  },
  'kingdom-shield': {
    size: '1024x1024',
    out: 'src/assets/meta/kingdom/kingdom-shield.webp',
    longest: 300,
    pad: 0.02,
    prompt: 'Heraldic kingdom level badge: a heater-shaped shield with a thick polished gold rim and a deep royal-blue enamel face '
      + 'with delicate gold filigree in the corners, a small gold crown on top of the shield, the middle of the shield face smooth '
      + 'and completely empty (a number will be overlaid later). Perfectly symmetrical straight-on front view, fills about 85% '
      + 'of the canvas. ' + STYLE,
  },
  'home-crown': {
    size: '1024x1024',
    out: 'src/assets/meta/kingdom/home-crown.webp',
    longest: 160,
    pad: 0.02,
    prompt: 'Home kingdom crown icon: a small rounded royal crown in bright polished gold with a deep crimson velvet cap inside, '
      + 'one large ruby in front and two small sapphires on the sides, pearl tips on the points. '
      + 'Dominant colors: bright gold and crimson red. ' + ICON + ' ' + ANIME_COLOR,
  },
  // —— 地图底部「每日行动」四枚图标（放进深色圆框，物体要紧凑、居中） ——
  // 2026-09-28 用户二次反馈：不要清一色象牙白。每枚图标一个鲜明主色，四枚放在一起要一眼分得开。
  'daily-firstwin': {
    size: '1024x1024',
    out: 'src/assets/meta/daily/firstwin.webp',
    longest: 160,
    pad: 0.02,
    prompt: 'Daily first victory icon: a compact rounded composition, a short sword with a bright steel blade and a crimson-red hilt '
      + 'laid diagonally across a warm golden laurel wreath, a small bright blue gem at the center of the wreath. '
      + 'Dominant colors: warm gold and crimson red. The whole icon is roughly square, not tall. ' + ICON + ' ' + ANIME_COLOR,
  },
  'daily-tribute': {
    size: '1024x1024',
    out: 'src/assets/meta/daily/tribute.webp',
    longest: 160,
    pad: 0.02,
    prompt: 'Kingdom tribute icon: a small chubby treasure coffer in rich royal purple with bright gold corner caps, lid slightly open, '
      + 'a short stack of shiny gold coins and one glowing violet crystal peeking out. '
      + 'Dominant colors: royal purple and bright gold. ' + ICON + ' ' + ANIME_COLOR,
  },
  'daily-arena': {
    size: '1024x1024',
    out: 'src/assets/meta/daily/arena.webp',
    longest: 160,
    pad: 0.02,
    prompt: 'Arena icon: two slim sabres with bright steel blades crossed in an X behind a small round shield with a vivid azure-blue face, '
      + 'a bold orange-red stripe across the shield and a small gold rim. '
      + 'Dominant colors: azure blue and orange-red. ' + ICON + ' ' + ANIME_COLOR,
  },
  'daily-hunt': {
    size: '1024x1024',
    out: 'src/assets/meta/daily/hunt.webp',
    longest: 160,
    pad: 0.02,
    prompt: 'Treasure hunt icon: a folded treasure map in warm tan parchment with a simple dotted red path and a red X, '
      + 'a round compass with a bright emerald-teal face and a bronze case resting on its corner. '
      + 'Dominant colors: emerald teal and warm tan. ' + ICON + ' ' + ANIME_COLOR,
  },
  // —— 商店横幅（2026-09-28）：活动商店每个活动一张、宝石商店一张；左侧留暗部放 UI 文字 ——
  ...Object.fromEntries([
    ['invasion', 'a fortified sandstone border fortress on a desert ridge at dusk under siege, crimson war banners, torches and distant smoke, dominant crimson and warm sand colors'],
    ['raidBoss', 'a colossal dragon silhouette coiled on a burning mountain pass, embers in the air, dominant molten orange and deep charcoal colors'],
    ['towerOfDoom', 'a tall dark gothic spire tower spiraling up into swirling teal storm clouds with lightning, dominant teal and deep night blue colors'],
    ['factionAssault', 'a grand castle gate under assault with golden faction banners and siege ladders, sunset light, dominant amber gold and deep brown colors'],
    ['worldEvent', 'ancient overgrown forest ruins decorated for a festival with glowing lanterns and treasure chests, dominant emerald green and warm lantern gold colors'],
    ['classTrials', 'a sacred circular training arena of white stone with glowing indigo magic sigils floating above it, dominant indigo violet and silver colors'],
  ].map(([id, scene]) => [`shop-event-${id}`, {
    size: '1536x1024',
    background: 'opaque',
    out: `src/assets/meta/shop/event-${id}.webp`,
    longest: 1280,
    pad: 0,
    prompt: `Wide banner illustration: ${scene}. The main subject sits in the right half; the left third is calm, darker and low-detail so UI text can be placed there. ` + KEY_ART,
  }])),
  'shop-gem-vault': {
    size: '1536x1024',
    background: 'opaque',
    out: 'src/assets/meta/shop/gem-vault.webp',
    longest: 1280,
    pad: 0,
    prompt: 'Wide banner illustration: a royal crystal armory vault, legendary swords, staves and axes displayed on elegant racks and pedestals, '
      + 'large glowing sapphire-blue crystals growing from the floor, soft cyan light beams. The main subject sits in the right half; '
      + 'the left third is calm, darker and low-detail so UI text can be placed there. Dominant sapphire blue and cool silver colors with small gold accents. ' + KEY_ART,
  },
  // —— 馈赠页（2026-09-29）：顶部横幅 + 七个分组图标 ——
  'gift-hall': {
  // —— 新手引导向导立绘 + 战斗加载页背景（2026-09-29） ——
  'tutor-guide': {
    size: '1024x1536',
    out: 'src/assets/meta/tutorial/guide.webp',
    longest: 900,
    pad: 0.01,
    prompt: 'Full body standing character illustration of a friendly young female guide mage for a fantasy match-3 RPG, '
      + 'long silver-blonde hair with a small braid, warm amber eyes, gentle confident smile, one hand raised in a welcoming pointing gesture, '
      + 'the other hand holding a small glowing golden lantern. Elegant deep navy and ivory robe with gold trim, a short crimson cape, '
      + 'a leather satchel with scrolls. Modern anime gacha game character art, clean line art, polished cel shading with soft gradients, '
      + 'vivid but harmonious colors. Isolated character on a fully transparent background, no ground shadow, no text, no logo, no frame.',
  },
  'tutor-frame': {
    size: '1536x1024',
    out: 'src/assets/meta/tutorial/frame.webp',
    longest: 900,
    pad: 0.01,
    prompt: 'Ornate empty dialogue box frame for a modern anime fantasy RPG UI: a wide rounded rectangle panel, deep navy translucent-looking center filled with '
      + 'a flat very dark navy color, slim polished gold filigree border with small sapphire gems at the four corners and a delicate crest at the top center. '
      + 'Clean vector-like rendering, symmetric, the center area is completely empty and plain. Isolated on a fully transparent background, no text, no letters, no characters.',
  },
  'battle-loading': {
    size: '1536x1024',
    background: 'opaque',
    out: 'src/assets/meta/tutorial/battle-loading.webp',
    longest: 1600,
    pad: 0,
    prompt: 'Wide dramatic battlefield illustration at dusk: two armies facing each other across a wide valley of ancient ruins, '
      + 'glowing colorful magic gems (red, blue, green, yellow, purple) floating in the air between them, crossed banners, '
      + 'a huge glowing rune circle in the sky. The center of the image is calmer and darker so UI can overlay it. ' + KEY_ART,
  },
    size: '1536x1024',
    background: 'opaque',
    out: 'src/assets/meta/gift/hall.webp',
    longest: 1280,
    pad: 0,
    prompt: 'Wide banner illustration: a grand celebratory treasure hall, stacks of gift boxes tied with crimson ribbons, open chests overflowing with glowing '
      + 'sky-blue gems, floating golden confetti and warm lantern light, a tall arched window with morning sky. The main subject sits in the right half; '
      + 'the left third is calm, darker and low-detail so UI text can be placed there. Dominant warm gold and crimson with sky-blue gem accents. ' + KEY_ART,
  },
  ...Object.fromEntries([
    ['starter', 'a chubby gift box wrapped in bright crimson paper with a big glossy gold ribbon bow, three small sky-blue gems peeking from the lid. Dominant crimson and gold'],
    ['hero', 'a small ornate royal crown in bright gold with one large ruby at the front and tiny sparkles, sitting on a short violet cushion. Dominant gold and violet'],
    ['kingdom', 'a compact castle keep with two round towers, blue slate roofs and a tiny red pennant flag on top. Dominant sky blue and warm stone beige'],
    ['arena', 'two slim sabres crossed behind a small round shield with a vivid orange-red face and a gold rim. Dominant orange-red and steel'],
    ['invasion', 'a horned war helmet in dark gunmetal with glowing magenta eye slits and a torn purple plume. Dominant magenta purple and gunmetal'],
    ['events', 'a small golden hourglass with glowing teal sand, surrounded by a thin ring of teal sparkles. Dominant teal and gold'],
    ['collection', 'a thick spellbook with an emerald-green leather cover, gold corner caps and a glowing card-shaped bookmark. Dominant emerald green and gold'],
  ].map(([id, subject]) => [`gift-${id}`, {
    ['battles', 'a bright steel longsword planted point-down into a small mound, a crimson victory banner tied to its crossguard fluttering. Dominant crimson and steel silver'],
    size: '1024x1024',
    out: `src/assets/meta/gift/${id}.webp`,
    longest: 160,
    pad: 0.02,
    prompt: `Milestone category icon: ${subject}. The whole icon is compact and roughly square. ` + ICON + ' ' + ANIME_COLOR,
  }])),
};

/** 结算页素材（2026-09-28 生成，原图在主工作树 artifacts/result-redesign/gen/raw）：只记录输出位置 */
export const RESULT_ASSETS = [
  'levelup-emblem', 'levelup-ribbon', 'mastery-card', 'title-astrolabe', 'continue-button', 'xp-icon',
  'stat-attack', 'stat-health', 'stat-armor', 'stat-magic',
  'mastery-red', 'mastery-green', 'mastery-blue', 'mastery-yellow', 'mastery-purple', 'mastery-brown',
].map((id) => `src/assets/meta/result/${id}.webp`);
