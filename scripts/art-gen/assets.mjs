// 文生图素材清单：id → { prompt, size, background?, out, longest, pad }
//   out：process.py 输出的 webp 路径（相对仓库根，进版本库）；longest：最长边像素；pad：裁边留白比例。
// 结算页一批（result/*）已在 2026-09-28 生成，原图不在本仓库，这里只登记输出位置，便于重生成。

const STYLE = 'Premium high-fantasy match-3 RPG game UI asset. Hand-painted digital illustration with crisp clean edges, '
  + 'polished antique gold filigree, dramatic soft rim lighting, rich saturated colors, highly detailed, centered, '
  + 'single isolated object on a fully transparent background. No text, no letters, no numbers, no watermark, no frame around the image.';
const ICON = 'Square game icon, the object fills about 80% of the canvas, front three-quarter view.';

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
    prompt: 'A small ornate golden royal crown with red and blue jewels and pearl tips, glowing softly. ' + ICON + ' ' + STYLE,
  },
};

/** 结算页素材（2026-09-28 生成，原图在主工作树 artifacts/result-redesign/gen/raw）：只记录输出位置 */
export const RESULT_ASSETS = [
  'levelup-emblem', 'levelup-ribbon', 'mastery-card', 'title-astrolabe', 'continue-button', 'xp-icon',
  'stat-attack', 'stat-health', 'stat-armor', 'stat-magic',
  'mastery-red', 'mastery-green', 'mastery-blue', 'mastery-yellow', 'mastery-purple', 'mastery-brown',
].map((id) => `src/assets/meta/result/${id}.webp`);
