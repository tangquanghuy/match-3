// 深渊远征高保真稿 v4（2026-10-29）素材清单：分层深渊。
// v3 的地图台和浮岛地图被否（太卡通）；随后的写实战术地图 expeditionTacticalAssets.mjs 也被否（太暗太旧，和营地不搭）。
// 这一套和营地（expeditionAnimeAssets.mjs 的 xa-camp）同一画风：现代二次元手绘，中高亮度，蓝调时刻的冷色加暖色灯光，
// 但材质要有手绘笔触和真实质感，不要塑料玩具感。
// 每个永生战域的群系下面是一座分三层的深渊，越往下越奇幻：寒冬堡垒 = 霜渊（雪檐林地 → 极光冰窟 → 巨人冰冢 → 冰封王座）。
// 局内地图的区域按种子切分，所以底图不是一整张插画，而是：每层一张俯视地面贴图（按区域裁切）+ 每个地点一个俯视地标贴图。
// 用法：$env:ART_MANIFEST='expeditionAbyssAssets.mjs'; node scripts/art-gen/generate.mjs [id ...]
//       $env:ART_MANIFEST='expeditionAbyssAssets.mjs'; python scripts/art-gen/process.py [id ...]
// id 统一加 xb- 前缀。输出在 game-assets/bundled/meta/expedition/abyss/。旧素材（v1 根目录、anime/、tactical/）全部保留。

const LOOK = 'Modern anime gacha RPG art, original artwork, matching the polished painterly look of contemporary premium Chinese and Japanese anime games. '
  + 'Hand-painted digital painting with visible soft brushwork and believable materials (snow, ice, stone, wood, cloth), luminous atmospheric light, clear readable shapes. '
  + 'Medium-bright exposure, never murky or black: shadows are tinted indigo and teal. Fresh harmonious palette of ice cyan, periwinkle blue, soft violet and a few warm lantern-gold accents. '
  + 'Not chibi, not toy-like, no glossy plastic or vinyl look, no thick black outlines, no flat vector look.';
const CLEAN = 'No people, no characters, no text, no letters, no numbers, no logo, no watermark, no UI, no frame, no border.';

// 地面贴图：正俯视，细节均匀铺满，没有中心焦点（区域每局重新切分，贴图会被裁成任意多边形）
const GROUND = 'Seamless-looking orthographic top-down terrain texture seen straight from above, like a hand-painted game map ground layer. '
  + 'Features are small and spread evenly over the whole image, no single focal point, no horizon, no sky, no perspective, no border, no vignette. ';
// 地标：俯视角度很高（约 70 度）的小型立体地貌，像地图上的手绘微缩模型，透明背景
// 地标会被直接放在地面贴图上，所以必须“长在地上”：不能有悬崖底座、岩石平台或浮空小岛（v3 浮岛地图被否的原因）
const PROP = 'Single small map landmark for a top-down fantasy game map, seen from high above at a steep 70 degree angle, hand-painted. '
  + 'It stands directly on flat ground: NO cliff, NO rocky base, NO floating island, NO platform, NO pedestal, NO thick earth slab under it. '
  + 'Only a thin irregular patch of snow and frost around its foot that fades out softly to transparency, plus a soft contact shadow. '
  + 'The object fills about 75 percent of the canvas, centered. Isolated on a fully transparent background. ';

// 图标：v3 的 xa- 图标被说"塑料"（高光太亮、像软胶玩具）。这一套用手绘质感：真实材料、柔和的方向光、少量磨损，不要镜面高光
const ICON = 'Hand-painted item icon for a modern anime fantasy RPG, original artwork, matching a painterly blue-hour art direction. '
  + 'Believable materials (aged paper, leather, brass, enamel, frosted glass, stone) with visible soft brushwork, soft directional light from the upper left, gentle subsurface glow only where magical. '
  + 'Matte to satin surfaces: NO glossy plastic, NO vinyl toy look, NO mirror highlights, NO thick black outlines, NO big glowing aura. '
  + 'Harmonious palette of ice cyan, periwinkle and soft violet with warm gold accents, one clear accent hue per icon. '
  + 'Square icon, the object fills about 78 percent of the canvas, three-quarter view, compact readable silhouette, centered, on a fully transparent background. '
  + 'No text, no letters, no numbers, no watermark, no frame, no badge background.';
const dir = 'game-assets/bundled/meta/expedition/abyss';
const icon = (id, subject, longest = 192) => [id, { size: '1024x1024', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0.03, prompt: `${subject} ${ICON}` }];
const scene = (id, size, prompt, longest = 1600) => [id, { size, background: 'opaque', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0, prompt: `${prompt} ${LOOK} ${CLEAN}` }];
const ground = (id, prompt) => [id, { size: '1536x1024', background: 'opaque', out: `${dir}/${id.slice(3)}.webp`, longest: 1600, pad: 0, prompt: `${GROUND}${prompt} ${LOOK} ${CLEAN}` }];
const prop = (id, subject, longest = 320) => [id, { size: '1024x1024', out: `${dir}/${id.slice(3)}.webp`, longest, pad: 0.02, prompt: `${PROP}${subject} ${LOOK} ${CLEAN}` }];

export const ASSETS = Object.fromEntries([
  // —— 地图台：营地里的制图帐篷 ——
  scene('xb-device', '1536x1024', 'Interior of a bright cartographer pavilion at an expedition camp on the rim of a colossal glowing abyss, blue hour. '
    + 'In the lower middle of the image, slightly left of center, a large round table of pale wood with brass rim, seen from a slightly high eye-level angle so the round tabletop reads as a wide ellipse; '
    + 'the tabletop is carved as a shallow relief model of a layered abyss: concentric snowy terraces stepping down to a softly glowing cyan center. '
    + 'Behind it, the tent flaps are tied open and show the glowing abyss far away and a twilight periwinkle sky with stars. White and teal canvas walls, warm string lights and two brass lanterns, '
    + 'shelves with rolled maps and brass survey instruments at the far left. The right 28 percent of the image is soft out-of-focus canvas wall, calm and low detail, for an interface panel. Landscape 3:2.'),

  // —— 寒冬堡垒 · 霜渊：三层地面 ——
  ground('xb-w1-ground', 'First layer of a frozen abyss, the snowy rim forest: fresh soft snow with gentle blue shadows, many small snow-laden pine trees seen from directly above as round crowns, '
    + 'a few white birch clusters, thin frozen streams in pale cyan, small grey rocks poking through the snow, tiny frost flowers. Bright and clean.'),
  ground('xb-w2-ground', 'Second layer of a frozen abyss, the aurora ice caverns: a floor of translucent cyan and blue ice sheets with soft inner glow, '
    + 'scattered small clusters of pale crystal shards, shallow frozen pools reflecting violet and teal aurora light, faint frost patterns and cracks. Luminous and magical.'),
  ground('xb-w3-ground', 'Third layer of a frozen abyss, the frozen burial ground of ancient giants: pale blue glacier ice and packed snow with huge ancient bones, rib fragments and broken pieces of colossal '
    + 'stone armor half buried in the ice, faint violet runes glowing in the ice, scattered ice crystals. Mysterious, slightly deeper violet tint, still medium-bright.'),

  // —— 寒冬堡垒 · 地标（地名 → 地貌的对应在 expedition_terrain.js 的 KIND） ——
  // 第一层 雪檐林地
  prop('xb-w-pines', 'A dense cluster of five snow-laden pine trees with a few frost crows perched on top.'),
  prop('xb-w-falls', 'A small frozen waterfall pouring over a snowy rock ledge into a round frozen pool, icicles hanging.'),
  prop('xb-w-stairs', 'A short flight of broken ancient white stone stairs descending into snow, cracked and half covered by ice.'),
  prop('xb-w-birch', 'A grove of four pale white birch trees covered in rime frost, with a frozen little pond between them.'),
  prop('xb-w-den', 'A snowy rock outcrop with a dark wolf den opening, frosty paw prints around it and a few bones.'),
  prop('xb-w-lake', 'A round frozen lake with mirror-like pale cyan ice and snowy banks, a few reeds sticking out of the ice.'),
  // 第二层 极光冰窟
  prop('xb-w-crystal', 'A large cluster of tall translucent cyan ice crystals glowing softly from inside, with smaller shards around the base.'),
  prop('xb-w-aurora', 'A round shallow pool of glowing water inside an ice ring, ribbons of violet and teal aurora light rising from its surface.'),
  prop('xb-w-mirror', 'A ring of six tall polished ice pillars like mirrors standing on an ice floor, reflecting cold blue light.'),
  prop('xb-w-icetree', 'A strange tree made entirely of ice with branching crystal limbs and tiny glowing frost buds.'),
  prop('xb-w-arch', 'A natural arch of blue cave ice with hanging icicles and a faint glow underneath.'),
  // 第三层 巨人冰冢
  prop('xb-w-skull', 'A colossal ancient giant skull half buried in blue glacier ice, frost covering its brow, faint violet runes on the bone.'),
  prop('xb-w-colossus', 'A huge ancient stone giant statue lying on its back, frozen into the ice, only its face and folded hands visible above the surface.'),
  prop('xb-w-sword', 'A gigantic broken sword of an ancient giant stuck upright into the ice, frost and icicles on its crossguard.'),
  prop('xb-w-ring', 'A ring of tall ancient carved standing stones covered in frost with faint glowing violet runes, snow in the middle.'),
  // 渊底
  prop('xb-w-throne', 'A majestic throne carved from a single huge block of glowing blue ice on a round stepped dais of white stone at the bottom of an abyss, '
    + 'tall jagged ice spires behind it, a crimson light pulsing in the ice of the throne back.', 480),

  // —— 地图台物品：路引按品质分图，罗盘三种 ——
  icon('xb-pass-0', 'A rolled expedition map of plain cream paper tied with simple grey twine, one corner slightly curled.'),
  icon('xb-pass-1', 'A rolled expedition map of cream parchment tied with a soft jade-green ribbon and a small jade wax seal.'),
  icon('xb-pass-2', 'A rolled expedition map of parchment wrapped in a band of violet cloth, closed with a violet wax seal and a small silver clasp.'),
  icon('xb-pass-3', 'A rolled expedition map of fine pale vellum with engraved gold end caps and a gold wax seal stamped with a star, a few tiny gold motes around it.'),
  icon('xb-compass-blood', 'A round brass pocket compass with a deep crimson enamel lid opened, its needle tipped with a small blood-red gem.'),
  icon('xb-compass-rival', 'A round brass pocket compass with a dark violet enamel lid opened, three claw marks engraved on the lid.'),
  icon('xb-compass-deep', 'A round brass pocket compass with a teal enamel lid opened, a tiny swirling cyan abyss visible under its glass face.'),

  // —— 第 4 轮审稿（G-icons-buttons.md）点名塑料的常驻图标重画；旧的 anime/* 保留不删 ——
  icon('xb-i-chest', 'An old travel chest of frosted grey-blue wooden planks with iron corner guards and a worn dull-brass trim band, a simple iron hasp lock, a faint warm orange glow leaking from the lid seam, a little snow on the lid.'),
  icon('xb-i-life', 'A chunky heart carved from clear pale-blue ice with a thin layer of frost on its surface and a small warm coral-red flame glowing at its core, simple full rounded heart silhouette that reads at tiny size.'),
  icon('xb-i-reroll', 'A translucent violet crystal orb with soft slowly swirling mist inside, held by a small cradle of thin silver claws, only one small soft highlight on the upper left.'),
  icon('xb-i-sigil-stone', 'A round carved stone seal with grainy surface and small chipped edges, a leaf rune cut INTO the stone as an engraved groove with faint mossy green light inside the groove.'),
  icon('xb-i-sigil-iron', 'A hexagonal forged cool-grey iron seal with hammer marks, a flame rune inlaid as dim glowing embers from dark red to orange, the metal itself stays cool grey.'),
  icon('xb-i-quality', 'An amber teardrop gem with irregular hand-cut facets, a few tiny bubbles and inclusions inside, warm honey amber colour, deep amber edge lines.'),
  icon('xb-i-memory', 'A single ice-blue crystal shard with a thin wisp of soft green light sealed inside it like a captured memory, one colour family only.'),
  icon('xb-i-lockpick', 'A brass lockpick set: a sturdy bronze key-shaped pick and two thin picks bound on a leather cord ring, laid diagonally at 45 degrees so the object fills the canvas.'),
  icon('xb-i-smoke', 'A round grey-blue clay smoke bomb jar with a cork stopper and a short fuse, soft lavender-grey smoke curling out of the top.'),
  icon('xb-i-altar', 'A small pale grey-blue stone offering altar with snow on its rim and a shallow bowl of dark red liquid with one small reflection, red covers less than a quarter of the object.'),
  icon('xb-i-nest', 'A matte speckled violet egg with fine cracks sitting in a nest of frosted thorny branches.'),
  icon('xb-i-potion', 'A small round potion flask of matte pewter and frosted glass filled with soft rose-red liquid, cork stopper tied with twine.'),
]);
