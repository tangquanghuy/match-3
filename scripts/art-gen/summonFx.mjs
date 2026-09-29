// 开箱演出 FX 贴图（2026-09-29）：黑底白光 / 黑底彩光，运行时用加色混合（lighter/screen）叠加，
// 黑色即透明。白光贴图在运行时按稀有度着色（稀有紫 / 传说金 / 史诗橙 / 神话青），一张图多档复用。
// 动画只做缩放/旋转/透明度补间（canvas），不靠 CSS 画复杂效果。
const ADDITIVE = 'Visual effect texture for a premium fantasy gacha game, meant for additive blending. '
  + 'Pure solid black background (#000000) everywhere outside the effect, no gradient vignette in the corners, no ground, no scenery. '
  + 'Perfectly centered, radially balanced, the effect fits inside the canvas with a black margin on every side. '
  + 'Crisp, luminous, high dynamic range glow, painterly but clean. No text, no letters, no runes that look like real script, no watermark, no frame, no border.';
const WHITE = 'Monochrome: only pure white and neutral grey light on black, no color tint at all (it will be colorized in engine).';

const FX = (id, prompt, longest = 1024) => [id, {
  size: '1024x1024',
  background: 'opaque',
  out: `public/static/fx/summon/${id}.webp`,
  longest,
  pad: 0,
  prompt: `${prompt} ${ADDITIVE}`,
}];

export const SUMMON_FX_ASSETS = Object.fromEntries([
  FX('fx-rays', 'A radiant starburst of god rays exploding outward from a tiny blinding white-hot core: about 28 long sharp tapering light beams '
    + 'of varied lengths and widths, with thin secondary streaks between them, soft bloom around the core, rays fading smoothly to black before the edges. '
    + WHITE),
  FX('fx-ring', 'A single thin circular shockwave ring of energy seen from the front: a bright sharp circle line with a soft outer glow, '
    + 'small wispy energy tendrils and fine sparks trailing off its outer edge, the interior of the ring completely black and empty. '
    + WHITE),
  FX('fx-flare', 'A brilliant four-pointed star lens flare sparkle: an intense small white core, two long thin horizontal and vertical light spikes, '
    + 'two shorter diagonal spikes, a soft round bloom halo around the core, a faint anamorphic streak. '
    + WHITE, 768),
  FX('fx-sigil', 'An ornate top-down arcane summoning circle made of glowing light lines: several concentric rings, an outer band of abstract '
    + 'geometric glyph marks (not letters), an inner hexagram and interlocking arcs, small orbiting dots, clean precise linework, perfectly symmetrical. '
    + WHITE),
  // 2026-09-29 用户裁定：圆形法阵 / 圆环表现不好看，蓄力与特写改用「汇聚光流 / 星尘 / 光羽碎片」，不再出现圆形图案
  FX('fx-gather', 'Energy gathering effect: dozens of thin curved luminous streaks and particle trails spiralling gently inward from the edges '
    + 'toward a small bright point in the center, like light being drawn in before an explosion. Streaks are fine, varied in length and '
    + 'brightness, loosely scattered, with tiny glinting particles along them. No circle, no ring, no geometric pattern, no symbols. ' + WHITE),
  FX('fx-stardust', 'A loose drifting field of star dust: many tiny sparkling points and a few small four-pointed glints of varied size and '
    + 'brightness, scattered unevenly with slightly denser clusters towards the lower half, soft faint haze between them. Delicate and airy, '
    + 'no circle, no ring, no shape outline, no big glow. ' + WHITE),
  FX('fx-plumes', 'Elegant floating fragments of light: about a dozen slender feather-like and crystal-shard-like slivers of glowing light, '
    + 'drifting upward around an empty dark center, different sizes and angles, soft motion-blur trails below each piece. '
    + 'Restrained and graceful, no wings, no circle, no ring, no symmetry pattern. ' + WHITE),
  // 特写底衬（2026-09-29 用户裁定：原 halo 两张太浮夸，改成克制的竖向光柱 + 细光环）
  FX('fx-veil', 'A restrained vertical shaft of soft light rising behind a portrait, like a calm stage backlight: a wide gentle column of '
    + 'diffuse glow, brightest in a narrow vertical core and fading smoothly outward, with a few very faint slow drifting mist wisps. '
    + 'Low contrast, subtle, no sharp rays, no ring, no sparkles, no flames, no wings. ' + WHITE),
  FX('fx-halo-thin', 'A minimal elegant halo: two very thin concentric circles of light with a small even row of fine tick marks between them, '
    + 'and a soft faint haze just inside the inner circle. Extremely restrained and precise, hairline linework, the vast majority of the canvas '
    + 'is black, no flames, no feathers, no wings, no thick glow, no sparkles. ' + WHITE),
]);
