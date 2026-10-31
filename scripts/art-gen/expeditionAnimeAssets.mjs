// 深渊远征高保真稿 v2（2026-10-28）素材清单：现代二次元游戏风格重做。
// v1（expeditionAssets.mjs，暗黑手绘）被否：太黑、像老页游。这一套与每周活动、商店 v3 的
// 「现代二次元」方向同口径（见 assets.mjs ANIME_COLOR / KEY_ART 的 2026-09-28 定调）。
// 用法：$env:ART_MANIFEST='expeditionAnimeAssets.mjs'; node scripts/art-gen/generate.mjs [id ...]
//       $env:ART_MANIFEST='expeditionAnimeAssets.mjs'; python scripts/art-gen/process.py [id ...]
// id 统一加 xa- 前缀：原图缓存 artifacts/art-gen/raw/<id>.png 按 id 跨清单共享，避免和活动素材撞名。
// 输出统一在 game-assets/bundled/meta/expedition/anime/。

const SCENE = 'Modern anime gacha RPG environment key art, original artwork, in the polished style of contemporary premium Chinese and Japanese anime games. '
  + 'Painterly cel-shaded illustration with clean shapes, luminous atmospheric lighting, soft bloom, clear depth and readable silhouettes. '
  + 'Overall MEDIUM-BRIGHT exposure, never murky or black: sky and distant areas are glowing blue-hour tones, shadows are tinted indigo and teal, not black. '
  + 'Fresh harmonious palette of ice cyan, periwinkle blue, soft violet and a few warm lantern-gold accents. '
  + 'The image sits behind game interface panels, so keep the noted areas calm and low in detail. '
  + 'No people, no characters, no text, no letters, no logo, no watermark, no UI, no frame, no border.';

const ICON = 'Modern anime gacha game UI item icon, original artwork, in the polished style of contemporary Chinese and Japanese anime RPG item icons. '
  + 'Clean crisp shapes, bold cel shading with smooth gradients, glossy highlights, thin dark outlines, '
  + 'vivid saturated but harmonious colors with one clear dominant hue, bright and cheerful rather than grim. '
  + 'Moderate detail only: no heavy baroque gold filigree, no rivets, no grime, no rust, no photorealism, no big glowing aura. '
  + 'Square icon, the object fills about 80 percent of the canvas, front three-quarter view, compact readable silhouette, centered. '
  + 'Single isolated object on a fully transparent background. No text, no letters, no numbers, no watermark, no frame, no circular badge background.';

const dir = 'game-assets/bundled/meta/expedition/anime';
const scene = (id, size, prompt, longest = 1536) => [id, { size, background: 'opaque', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0, prompt: `${prompt} ${SCENE}` }];
const icon = (id, subject, longest = 192) => [id, { size: '1024x1024', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0.03, prompt: `${subject} ${ICON}` }];

export const ASSETS = Object.fromEntries([
  // —— 场景 ——
  scene('xa-camp', '1536x1024', 'Wide panorama of a cozy expedition outpost built on the rim of a colossal glowing abyss at blue hour. '
    + 'Middle ground: a cluster of white and teal canvas tents, a small wooden workshop with a warm forge window, string lights and lanterns, a tall slim lookout tower, a little airship docked at a wooden pier on the right. '
    + 'Center background: the enormous round chasm with floating cyan crystal shards and broken stone stairs spiralling down, soft cyan light rising from the depths, '
    + 'a clear twilight sky of periwinkle and soft pink with a few stars. '
    + 'Keep the left 30 percent and the bottom 18 percent calm (soft snowy ground and sky) for interface panels. Landscape 3:2.'),
  scene('xa-device', '1536x1024', 'Interior of a bright airy observatory hall at the edge of the abyss: a tall arched glass window wall showing a glowing cyan chasm and twilight sky, '
    + 'white stone floor with inlaid thin gold lines, a large round holographic star-map platform in the center emitting soft cyan light, '
    + 'bookshelves and brass instruments softly lit at the far sides. The center of the image is calm and open. Landscape 3:2.'),
  scene('xa-prepare', '1536x1024', 'A sunlit departure platform at the top of a giant stone lift that descends into a glowing abyss: '
    + 'wide clean stone deck with painted guide lines, banners of teal cloth, supply crates neatly stacked at the far sides, a huge ornate gate frame of white stone and gold at the back opening onto bright cyan mist. '
    + 'Morning light, soft and bright. The middle band of the image is open and uncluttered for character cards. Landscape 3:2.'),
  scene('xa-map-winter', '1536x1024', 'Top-down stylized anime game map board of one frozen abyss level, seen from directly above with slight perspective: '
    + 'bright snowy terraces arranged in three loose rings around a deep central ice pit glowing soft red-violet, '
    + 'frozen cyan rivers, small pine groves, ruined white stone bridges and paths connecting many small flat clearings where map markers will be placed. '
    + 'Clean simple shapes, low fine detail, soft pastel ice-blue and white palette with mid-tone indigo shadows, edges fade into soft blue mist. Landscape 3:2.'),
  scene('xa-biome-spire', '1024x1536', 'Vertical card illustration: a towering white crystal spire floating above a misty crossroads of broken bridges, golden light at its tip, violet twilight sky with stars. '
    + 'Main subject in the upper two thirds; bottom third is soft violet haze for card text. Portrait 2:3.', 900),
  scene('xa-biome-winter', '1024x1536', 'Vertical card illustration: a beautiful frozen fortress of ice-blue spires on a snowy cliff, aurora in the sky, '
    + 'a giant frost titan silhouette faintly visible in the snowfall behind it, a few warm windows. Main subject in the upper two thirds; bottom third is soft pale-blue haze for card text. Portrait 2:3.', 900),
  scene('xa-biome-broken', '1024x1536', 'Vertical card illustration: floating shattered volcanic islands over glowing lava rifts, a sleek red dragon circling above, sunset orange and magenta sky. '
    + 'Main subject in the upper two thirds; bottom third is soft warm haze for card text. Portrait 2:3.', 900),

  // —— 地图节点 ——
  icon('xa-node-loot', 'A small heap of treasure: a shiny helmet, a short sword, gold coins and a little cloth sack. Dominant gold and steel blue.'),
  icon('xa-node-supply', 'A neat wooden supply crate tied with teal rope, with a canteen and a bread loaf on top. Dominant warm wood and teal.'),
  icon('xa-node-chest', 'A sturdy treasure chest painted royal blue with gold bands and a big round gold padlock. Dominant royal blue and gold.'),
  icon('xa-node-ore', 'A chunk of grey rock with large bright cyan crystals growing out of it. Dominant cyan.'),
  icon('xa-node-fire', 'A cozy little campfire of crossed logs with bright orange flames and a tiny kettle. Dominant warm orange.'),
  icon('xa-node-shrine', 'A small white marble shrine with a floating glowing pale-gold crystal above it and two candles. Dominant ivory and pale gold.'),
  icon('xa-node-merchant', 'A travelling merchant backpack with a hanging lantern, a rolled rug and a brass balance scale. Dominant warm brown and brass.'),
  icon('xa-node-extract', 'A tall slim beacon lantern on a white pole shining a bright mint-green flame, with a small green flag. Dominant mint green.'),
  icon('xa-node-boss', 'An imposing ornate crown made of jagged ice crystals with a glowing crimson heart gem in the center, frost mist at its base. Dominant ice blue and crimson.'),
  icon('xa-node-lord', 'A noble knight helmet of silver-blue armor with a small gold crown and a flowing cyan plume. Dominant silver blue and gold.'),
  icon('xa-node-nest', 'A round nest of white branches holding three glowing violet monster eggs with star patterns. Dominant violet.'),
  icon('xa-node-altar', 'A small black stone altar with a shallow basin of glowing ruby-red liquid and a silver ritual dagger. Dominant ruby red.'),
  icon('xa-node-coffin', 'An upright coffin sealed inside a block of clear blue ice with a faint glowing silhouette inside. Dominant pale ice blue.'),
  icon('xa-node-wander', 'A white wolf mask with frost patterns and glowing cyan eyes, a torn teal hood behind it. Dominant white and cyan.'),

  // —— 路引（按品质分图）/ 罗盘 ——
  icon('xa-pass-0', 'A simple rolled paper map scroll tied with plain brown string. Dominant beige and grey.'),
  icon('xa-pass-1', 'A rolled map scroll tied with green ribbon and a small green wax seal. Dominant parchment and emerald green.'),
  icon('xa-pass-2', 'A rolled map scroll with violet silk edges, a violet wax seal and a small silver clasp. Dominant violet.'),
  icon('xa-pass-3', 'An ornate rolled map scroll with gold end caps, a golden wax seal with a star emblem and floating sparkles. Dominant bright gold.'),
  icon('xa-compass-blood', 'A round pocket compass with a crimson enamel case and a glowing red blood-drop gem as the needle hub. Dominant crimson.'),
  icon('xa-compass-rival', 'A round pocket compass with a violet enamel case, its face showing a glowing claw-mark emblem. Dominant violet.'),
  icon('xa-compass-deep', 'A round pocket compass with a teal enamel case and a tiny swirling cyan abyss inside its glass face. Dominant teal cyan.'),

  // —— 刻印 ——
  icon('xa-sigil-iron', 'A small hexagonal engraved emblem plate of polished red-orange metal with a glowing flame rune. Dominant orange red.'),
  icon('xa-sigil-stone', 'A small round engraved emblem tablet of jade green stone with a glowing leaf rune. Dominant jade green.'),
  icon('xa-sigil-silver', 'A small star-shaped engraved emblem of bright silver with a glowing pale blue snowflake rune. Dominant silver and ice blue.'),

  // —— 通货 / 材料 / 消耗品 ——
  icon('xa-cur-dust', 'A small glass vial filled with glittering silver-gold stardust. Dominant silver gold.'),
  icon('xa-cur-quality', 'A faceted warm golden gemstone shaped like a teardrop. Dominant gold.'),
  icon('xa-cur-reroll', 'A smooth round stone marbled with swirling violet and white. Dominant violet.'),
  icon('xa-cur-tier', 'A long sharpening whetstone of blue-grey stone with a bright cyan glowing edge. Dominant cyan.'),
  icon('xa-cur-break', 'A cracked black crystal with bright orange-gold light bursting through the cracks. Dominant black and orange.'),
  icon('xa-use-torch', 'A short wooden torch wrapped in teal cloth, burning with a bright warm flame. Dominant warm orange.'),
  icon('xa-use-potion', 'A round glass potion bottle with a cork and a pink heart charm, filled with glowing pink-red liquid. Dominant pink red.'),
  icon('xa-use-lockpick', 'A small ring holding three ornate golden keys of different sizes. Dominant gold.'),
  icon('xa-use-smoke', 'A round grey smoke bomb with a short lit fuse and puffs of soft lavender smoke. Dominant grey and lavender.'),
  icon('xa-mat-memory', 'A floating translucent shard of pale blue crystal shaped like a broken mirror piece, with a tiny glowing star inside. Dominant pale blue.'),
  icon('xa-mat-soul', 'A small glass lantern holding a floating violet-blue soul flame. Dominant violet blue.'),
  icon('xa-mat-purse', 'A plump teal cloth coin purse tied with gold cord, gold coins peeking out. Dominant teal and gold.'),
  icon('xa-pet-egg', 'A mysterious pet egg with pastel cyan and white swirl patterns resting on a small cushion, a tiny question-mark-free sparkle on top. Dominant pastel cyan.'),

  // —— HUD ——
  icon('xa-hud-lantern', 'A cute hand lantern of white metal with a bright warm golden flame inside. Dominant warm gold.', 160),
  icon('xa-hud-steps', 'A small hourglass with a white frame and glowing cyan sand. Dominant cyan.', 160),
  icon('xa-hud-life', 'A glossy crimson heart crystal. Dominant crimson.', 160),
  icon('xa-hud-safe', 'A small white and teal strongbox with a glowing cyan shield emblem on its lid. Dominant teal.', 160),
]);
