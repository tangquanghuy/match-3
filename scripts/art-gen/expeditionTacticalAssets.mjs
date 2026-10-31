// 深渊远征高保真稿 v4（2026-10-29）素材清单：地图台与局内地图改为《黑色幸存者》式的写实战术地图。
// v3（expeditionAnimeAssets.mjs）的地图台和浮岛地图被否：太卡通。营地、出征准备、队伍卡沿用 v3。
// 用法：$env:ART_MANIFEST='expeditionTacticalAssets.mjs'; node scripts/art-gen/generate.mjs [id ...]
//       $env:ART_MANIFEST='expeditionTacticalAssets.mjs'; python scripts/art-gen/process.py [id ...]
// id 统一加 xt- 前缀。输出在 game-assets/bundled/meta/expedition/tactical/。

const SCENE = 'Semi-realistic painted game environment art, original artwork, in the grounded style of modern survival and tactics games with anime character art. '
  + 'Believable materials and lighting, restrained detail, muted natural palette: slate blue, snow white, stone grey, dark pine green, with small warm lamp accents. '
  + 'Not cartoon, not chibi, not cute, no glossy toy look, no pastel candy colors, no heavy bloom. Medium exposure, readable, not murky. '
  + 'No people, no characters, no text, no letters, no numbers, no logo, no watermark, no UI, no frame, no border.';

const ICON = 'Semi-realistic painted game item icon, original artwork, grounded materials such as worn leather, brass, parchment, enamel and glass, '
  + 'soft directional light, subtle wear, muted natural colors with one clear accent hue. Not cartoon, not glossy toy plastic, no thick outlines, no big glowing aura. '
  + 'Square icon, the object fills about 80 percent of the canvas, three-quarter view, centered. '
  + 'Single isolated object on a fully transparent background. No text, no letters, no numbers, no watermark, no frame, no badge background.';

const dir = 'game-assets/bundled/meta/expedition/tactical';
const scene = (id, size, prompt, longest = 1600) => [id, { size, background: 'opaque', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0, prompt: `${prompt} ${SCENE}` }];
const icon = (id, subject, longest = 192) => [id, { size: '1024x1024', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0.03, prompt: `${subject} ${ICON}` }];

export const ASSETS = Object.fromEntries([
  // 局内地图底图：按种子切分区域，所以底图不能有一个固定的中心建筑或固定的道路网，细节要均匀铺开
  scene('xt-map-winter', '1536x1024', 'Orthographic top-down map illustration of a large frozen plateau that holds the ruins of a winter fortress town, seen straight from above like a satellite view painted by hand, '
    + 'the kind of overworld area map used in a battle-royale survival game. Snow-covered ground with many evenly scattered features: small clusters of ruined stone buildings with dark slate roofs, '
    + 'broken fortress wall segments, pine forest patches, a few frozen ponds and a frozen stream, rocky outcrops, narrow footpaths, scattered barrels and carts. '
    + 'No single dominant central building, no big road network, features spread evenly across the whole image. '
    + 'The plateau edges break into dark cliffs falling into a deep blue-grey misty abyss at all four borders of the image. Landscape 3:2.'),
  scene('xt-device', '1536x1024', 'Interior of an expedition command room in a stone fortress, eye-level view: a large heavy wooden map table in the center with a sheet of backlit frosted glass on top, '
    + 'brass lamps, rolled maps, a wall of maps and notes pinned behind, a tall window with cold grey daylight and falling snow on the right. '
    + 'Calm grounded mood, practical and lived-in, cool daylight mixed with warm lamp light. The center and right third of the image are calm for interface panels. Landscape 3:2.'),

  // 地图台物品：路引按品质分图，罗盘三种
  icon('xt-pass-0', 'A rolled survey map of worn beige paper tied with plain twine.'),
  icon('xt-pass-1', 'A rolled survey map of parchment tied with a dark green leather strap and a small green wax seal.'),
  icon('xt-pass-2', 'A rolled survey map of parchment with a violet cloth wrap and a violet wax seal with a brass clasp.'),
  icon('xt-pass-3', 'A rolled survey map of fine vellum with engraved brass end caps and a gold wax seal.'),
  icon('xt-compass-blood', 'A heavy brass pocket compass with a dark crimson enamel lid, its needle tipped with a small red stone.'),
  icon('xt-compass-rival', 'A heavy brass pocket compass with a dark violet enamel lid engraved with three claw marks.'),
  icon('xt-compass-deep', 'A heavy brass pocket compass with a deep teal enamel lid and a dark glass face showing a faint spiral.'),
]);
