// 封面页（登录 / 用户协议）美术：一横一竖两张主视觉。
//   ART_MANIFEST=coverAssets.mjs node scripts/art-gen/generate.mjs
//   ART_MANIFEST=coverAssets.mjs python scripts/art-gen/process.py
// 画面留出标题与登录面板的位置：横版左侧三分之一偏暗、竖版上方与下方留空。
const KEY_ART = 'Modern anime gacha game title screen key art, painterly cel-shaded illustration with clean shapes, '
  + 'vivid but harmonious colors, cinematic lighting, atmospheric depth and soft volumetric light. '
  + 'No text, no letters, no logo, no title, no watermark, no UI, no frame, no border.';

const SCENE = 'Dawn breaking over a vast high-fantasy continent: a warm golden sunrise on the horizon pushing back a deep indigo night sky '
  + 'with the last fading stars, long rays of light spilling across layered mountain ranges, a winding river and distant castle spires '
  + 'of several kingdoms. On a rocky cliff edge in the middle distance stands a small lone hero seen from behind, a long cloak '
  + 'fluttering, a sword planted beside them, facing the sunrise. Faceted glowing gem crystals in six colors (red, green, blue, '
  + 'yellow, purple, brown) float gently in the air around the cliff and catch the light, hinting at a match-3 puzzle RPG.';

export const ASSETS = {
  'cover-wide': {
    size: '1536x1024',
    background: 'opaque',
    out: 'game-assets/bundled/meta/cover/cover-wide.webp',
    longest: 1920,
    pad: 0,
    prompt: `${SCENE} Wide landscape composition: the sunrise, cliff and hero sit in the right two thirds of the frame; `
      + 'the left third is calmer, darker twilight sky and soft mist with little detail, leaving room for a title and a login panel. '
      + KEY_ART,
  },
  'cover-tall': {
    size: '1024x1536',
    background: 'opaque',
    out: 'game-assets/bundled/meta/cover/cover-tall.webp',
    longest: 1536,
    pad: 0,
    prompt: `${SCENE} Tall portrait composition for a phone screen: the sunrise, cliff and hero sit in the middle band of the frame; `
      + 'the top quarter is open dark-to-golden sky and the bottom quarter is soft dark mist over the valley, both calm with little detail, '
      + 'leaving room for a title at the top and a login panel at the bottom. '
      + KEY_ART,
  },
};
