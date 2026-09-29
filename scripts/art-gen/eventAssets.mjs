// 每周活动玩法重做（2026-09-29）素材清单：六个玩法各自的场景底图 + 节点/遗物/棋盘/部队/地块图标。
// 用法：ART_MANIFEST=eventAssets.mjs node scripts/art-gen/generate.mjs [id ...]
//       ART_MANIFEST=eventAssets.mjs python scripts/art-gen/process.py [id ...]
// 输出统一在 src/assets/meta/events/（屏层经 artAssets.eventArt() 取 URL）。

// 现代二次元游戏图标（与 assets.mjs 的 ANIME_COLOR 同口径，此处独立一份以免耦合）
const ICON = 'Modern anime gacha game UI icon, in the polished style of contemporary Japanese / Chinese anime RPG item icons. '
  + 'Clean crisp shapes, bold cel shading with smooth gradients, glossy highlights, thin dark outlines, '
  + 'vivid saturated but harmonious colors with one clear dominant hue, good contrast so it reads on a dark UI. '
  + 'Moderate detail only: no heavy baroque gold filigree, no photorealism, no big glowing aura. '
  + 'Square icon, the object fills about 80% of the canvas, front three-quarter view, compact and roughly square silhouette. '
  + 'Single isolated object on a fully transparent background. No text, no letters, no numbers, no watermark, no frame, no circular badge background.';

// 场景底图：UI 会在上面叠节点/路线，所以要「干净、低细节、中间留空」
const SCENE = 'Modern anime gacha game background art, painterly cel-shaded illustration with clean shapes, harmonious colors, '
  + 'soft atmospheric lighting and depth. The image will sit behind interactive UI, so keep it calm, slightly dark and low in fine detail, '
  + 'with no strong focal clutter in the middle. No characters, no text, no letters, no logo, no watermark, no frame, no border.';

const bg = (id, size, prompt) => [id, {
  size, background: 'opaque', out: `src/assets/meta/events/${id}.webp`, longest: 1400, pad: 0, prompt: `${prompt} ${SCENE}`,
}];
const icon = (id, subject) => [id, {
  size: '1024x1024', out: `src/assets/meta/events/${id}.webp`, longest: 160, pad: 0.02, prompt: `${subject} ${ICON}`,
}];

export const ASSETS = Object.fromEntries([
  // —— 场景底图 ——
  bg('bg-tower', '1024x1536', 'Tall vertical view looking up the inside of an enormous dark gothic spire tower: a spiral of broken stone platforms and floating stairs '
    + 'rising through the shaft toward a swirling teal storm vortex at the very top, faint teal rune light on the walls, deep night-blue shadows at the bottom. '
    + 'Dominant deep navy and teal.'),
  bg('bg-raid', '1536x1024', 'A vast ruined volcanic throne cavern, a massive empty obsidian throne on a raised dais at the right, rivers of glowing lava, '
    + 'ember particles in the air, broken pillars. Dominant molten orange and charcoal.'),
  bg('bg-invasion', '1536x1024', 'Top-down painted fantasy war map on aged parchment: rolling hills, a forest, a river valley and mountain passes on the left, '
    + 'a walled capital city with red roofs at the far right edge, open empty land in between with no roads drawn. Muted parchment tan with crimson accents.'),
  bg('bg-faction', '1536x1024', 'Top-down painted fantasy region map of an enemy kingdom: farmland, forests and hills, a river, a fortified golden castle city on the far right, '
    + 'soft parchment border vignette, open land evenly spread so a grid of territories can be overlaid. Dominant amber gold and warm brown.'),
  bg('bg-world', '1536x1024', 'Top-down view of a cozy fantasy festival plaza in ancient forest ruins at dusk: cobblestone ground, lantern strings, small stalls and flower garlands '
    + 'around the edges, the center plaza wide and open. Dominant emerald green and warm lantern gold.'),
  bg('bg-trials', '1536x1024', 'A sacred circular training colosseum of white stone seen from a high angle, glowing indigo magic sigils on the arena floor, '
    + 'floating crystal lamps, pale moonlight. Dominant indigo violet and silver.'),

  // —— 末日之塔：地图节点 ——
  icon('node-battle', 'Map node icon: two crossed steel short swords with teal-wrapped hilts. Dominant steel silver and teal.'),
  icon('node-elite', 'Map node icon: a menacing horned demon skull mask in dark bone with glowing crimson eyes. Dominant bone white and crimson.'),
  icon('node-boss', 'Map node icon: a jagged dark iron crown wreathed in violet ghostly flames. Dominant black iron and violet.'),
  icon('node-camp', 'Map node icon: a small cozy campfire of crossed logs with warm orange flames and a tiny cooking pot. Dominant warm orange.'),
  icon('node-treasure', 'Map node icon: a small sturdy treasure chest in blue-painted wood with gold bands, lid slightly open with golden light. Dominant royal blue and gold.'),
  icon('node-merchant', 'Map node icon: a plump merchant coin pouch tied with a cord next to a small brass balance scale. Dominant warm brown leather and brass.'),
  icon('node-event', 'Map node icon: a mysterious floating swirling portal orb of deep purple and cyan mist. Dominant purple and cyan.'),

  // —— 末日之塔：遗物 ——
  icon('relic-ember_sigil', 'Relic icon: a round bronze sigil medallion with a glowing ember flame emblem. Dominant ember orange and bronze.'),
  icon('relic-iron_bulwark', 'Relic icon: a small thick kite shield of dark iron with riveted silver rim. Dominant steel grey and silver.'),
  icon('relic-vital_chalice', 'Relic icon: an elegant silver chalice filled with glowing ruby-red liquid. Dominant ruby red and silver.'),
  icon('relic-sage_quill', 'Relic icon: a long white feather quill with a glowing sapphire nib and faint star motes. Dominant ivory and sapphire blue.'),
  icon('relic-prism_flame', 'Relic icon: a faceted crystal prism split into fiery red and sunny yellow halves. Dominant red and yellow.'),
  icon('relic-prism_tide', 'Relic icon: a faceted crystal prism split into ocean blue and leaf green halves. Dominant blue and green.'),
  icon('relic-prism_dusk', 'Relic icon: a faceted crystal prism split into violet purple and earthy brown halves. Dominant purple and brown.'),
  icon('relic-surge_orb', 'Relic icon: a glass orb holding a crackling miniature teal lightning storm on a small silver stand. Dominant teal.'),
  icon('relic-mending_moss', 'Relic icon: a tuft of soft glowing green moss on a small stone with a tiny white flower. Dominant fresh green.'),
  icon('relic-gold_idol', 'Relic icon: a chubby grinning golden idol statuette with ruby eyes. Dominant bright gold.'),
  icon('relic-hunter_mark', 'Relic icon: a hunter trophy token, a sharp fang on a leather cord with a red painted mark. Dominant bone white and red.'),
  icon('relic-ambush_horn', 'Relic icon: a curved hunting horn of polished ivory with bronze bands. Dominant ivory and bronze.'),
  icon('relic-curse_doll', 'Relic icon: a small stitched voodoo doll of pale cloth with purple pins. Dominant pale beige and purple.'),
  icon('relic-phoenix_feather', 'Relic icon: a single blazing phoenix feather of orange, gold and crimson. Dominant flame orange.'),
  icon('relic-glass_blade', 'Relic icon: a slender translucent crystal glass dagger, sharp and fragile, pale cyan. Dominant pale cyan.'),
  icon('relic-titan_heart', 'Relic icon: a large carved stone heart with glowing amber cracks. Dominant stone grey and amber.'),
  icon('relic-storm_crown', 'Relic icon: a slim silver circlet crown crackling with electric blue sparks. Dominant silver and electric blue.'),
  icon('relic-leech_fang', 'Relic icon: a curved blood-red vampire fang dripping one crimson drop. Dominant blood red.'),
  icon('relic-curse_frailty', 'Curse icon: a cracked black clay mask oozing sickly green smoke. Dominant black and sickly green.'),

  // —— 世界事件：棋盘格 ——
  icon('tile-supply', 'Board tile icon: a wooden supply crate with festival ribbon and a green leaf tag. Dominant warm wood and green.'),
  icon('tile-gold', 'Board tile icon: a small neat pile of shiny gold coins. Dominant bright gold.'),
  icon('tile-lantern', 'Board tile icon: a glowing round paper festival lantern in warm gold with a red tassel. Dominant warm gold and red.'),
  icon('tile-trap', 'Board tile icon: a rusty iron bear trap with open jaws. Dominant rusty brown and steel.'),
  icon('tile-caravan', 'Board tile icon: a small covered merchant wagon with a green canvas top. Dominant green and wood.'),
  icon('tile-dice', 'Game icon: two chunky ivory six-sided dice with gold pips, one tilted. Dominant ivory and gold.'),

  // —— 入侵：敌军部队 ——
  icon('squad-raider', 'Enemy unit token icon: a fierce crimson cavalry helmet with a horse-hair plume, swift raider. Dominant crimson and dark steel.'),
  icon('squad-siege', 'Enemy unit token icon: a heavy wooden siege battering ram with an iron ram head on wheels. Dominant dark wood and iron.'),
  icon('squad-warlord', 'Enemy unit token icon: an imposing black horned warlord helm with a tattered crimson war banner behind it. Dominant black and crimson.'),

  // —— 阵营突袭：地块 ——
  icon('district-village', 'Territory icon: a tiny cozy village of three cottages with thatched roofs. Dominant warm straw and green.'),
  icon('district-barracks', 'Territory icon: a small military barracks tent with a spear rack and a red pennant. Dominant red and canvas beige.'),
  icon('district-fort', 'Territory icon: a squat stone fort tower with battlements. Dominant stone grey.'),
  icon('district-shrine', 'Territory icon: a small white marble shrine with a floating glowing blue crystal. Dominant white and sky blue.'),
  icon('district-watchtower', 'Territory icon: a tall slender wooden watchtower with a lookout platform and a bright lantern. Dominant wood and amber.'),
  icon('district-granary', 'Territory icon: a round granary silo with golden wheat sheaves. Dominant golden wheat.'),
  icon('district-capital', 'Territory icon: a grand golden castle keep with three spires and blue flags. Dominant gold and royal blue.'),
]);
