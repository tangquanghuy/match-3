// 深渊远征（营地 / 出征 / 地图）高保真界面稿素材清单（2026-10-29）。
// 用法：$env:ART_MANIFEST='expeditionAssets.mjs'; node scripts/art-gen/generate.mjs [id ...]
//       $env:ART_MANIFEST='expeditionAssets.mjs'; python scripts/art-gen/process.py [id ...]
// 输出统一在 game-assets/bundled/meta/expedition/。
// 美术方向：成熟的暗黑奇幻手绘质感（暗黑地牢、火炬之光：无限、黑色幸存者的终局界面），
// 冷色深渊青 + 暖色火把琥珀，低饱和底色，少量发光点缀；与现有部队立绘（厚涂二次元）能放在一起。

const SCENE = 'Premium dark fantasy game environment art, original artwork, in the mature hand-painted style of Darkest Dungeon and Torchlight Infinite key art. '
  + 'Rich material detail, dramatic chiaroscuro lighting, deep shadows, warm torch amber light against cold abyss teal glow, '
  + 'restrained desaturated palette with only a few glowing accents, atmospheric fog and drifting embers, cinematic depth. '
  + 'The image sits behind game interface panels, so keep large calm dark areas and avoid clutter where noted. '
  + 'No people unless stated, no text, no letters, no runes that look like letters, no logo, no watermark, no UI, no frame, no border.';

const ICON = 'Premium dark fantasy RPG inventory icon, original artwork, in the hand-painted style of Torchlight Infinite and Diablo item art. '
  + 'Single object, three-quarter view, crisp readable silhouette, painterly rendering of metal, stone, wood, leather and glow, strong rim light, '
  + 'dark muted base palette with one glowing accent color, readable at 64 pixels on a near-black interface. '
  + 'Object fills about 80 percent of the canvas, centered, fully transparent background. '
  + 'No text, no letters, no numbers, no frame, no circular badge background, no shadow plate, no watermark.';

const dir = 'game-assets/bundled/meta/expedition';
const scene = (id, size, prompt, longest = 1600) => [id, { size, background: 'opaque', out: `${dir}/${id}.webp`, longest, pad: 0, prompt: `${prompt} ${SCENE}` }];
const icon = (id, subject, longest = 192) => [id, { size: '1024x1024', out: `${dir}/${id}.webp`, longest, pad: 0.03, prompt: `${subject} ${ICON}` }];

export const ASSETS = Object.fromEntries([
  // —— 场景 ——
  scene('scene-camp', '1536x1024', 'Wide night panorama of an expedition base camp built on the rim of a colossal bottomless abyss. '
    + 'Left third: a large weathered canvas command tent glowing from inside, with a lantern-lit map table visible through the open flap. '
    + 'Center: a stone campfire ring with a big warm fire, crates, barrels and weapon racks around it. '
    + 'Right third: a timber blacksmith workshop with a glowing forge and anvil, and behind it a small wooden watchtower. '
    + 'Background behind the camp: the enormous dark chasm dropping away, broken stone stairs spiralling down into it, a faint cold teal glow rising from the depths, distant ruined pillars. '
    + 'Sky is dark and cloudy with very little detail. Keep the top 18 percent and the bottom 22 percent dark and calm for interface bars. Landscape 3:2.'),
  scene('scene-gate', '1536x1024', 'A colossal ancient stone gate carved into a sheer cliff face above a bottomless abyss, seen from a narrow ledge. '
    + 'The gate is sealed by heavy chains; around its arch runs a ring of many small round sockets, roughly three quarters of them glowing warm gold and the rest dark. '
    + 'Cold teal mist pours out from beneath the gate. Gate placed in the right half; the left half is deep shadowy cliff and mist, almost empty, for title text. Landscape 3:2.'),
  scene('scene-device', '1536x1024', 'Interior of a vaulted underground stone chamber holding an ancient circular map device: a large round altar table of dark stone and old bronze, '
    + 'seen from slightly above, with one large central socket and three smaller sockets around it, faint teal light lines etched in its surface, '
    + 'candles and hanging chains around, deep darkness at the edges. The device occupies the center; left and right thirds are dark stone walls with little detail. Landscape 3:2.'),
  scene('scene-prepare', '1536x1024', 'Interior of a war council tent at night before a dangerous descent: a long rough wooden table with a worn map, '
    + 'armor stands and weapon racks along the canvas walls, hanging oil lanterns giving warm amber pools of light, an open tent flap at the back showing the cold teal glow of the abyss. '
    + 'Mostly dark, soft focus, low detail, calm composition for a busy interface on top. Landscape 3:2.'),
  scene('scene-extract', '1536x1024', 'Dawn breaking over the rim of a colossal abyss, a weary expedition rope ladder and wooden lift reaching the top of the cliff, '
    + 'pale gold sunrise light spilling across snow and stone, cold teal shadows still in the chasm below, sense of relief and survival. Center kept calm and dark for result panels. Landscape 3:2.'),
  scene('scene-fail', '1536x1024', 'Looking down into a bottomless abyss at night, a lost lantern and a torn backpack lying on a crumbling ledge, scattered items falling into darkness, '
    + 'cold desaturated blue-black palette with a dim dying ember glow, oppressive and melancholic. Center kept calm and dark for result panels. Landscape 3:2.'),
  scene('biome-spire', '1024x1536', 'Vertical card illustration: a towering ancient spire of pale stone and floating crystal fragments rising from a misty crossroads of broken bridges, '
    + 'golden light at its tip, dark violet night. Main subject in the upper two thirds; bottom third fades to near black for card text. Portrait 2:3.', 1100),
  scene('biome-winter', '1024x1536', 'Vertical card illustration: a grim frozen Nordic fortress on a cliff in a howling blizzard, ice-blue palette, '
    + 'enormous frost giant silhouette half hidden in the storm behind it, a few warm amber windows. Main subject in the upper two thirds; bottom third fades to near black for card text. Portrait 2:3.', 1100),
  scene('biome-broken', '1024x1536', 'Vertical card illustration: shattered volcanic badlands split by glowing lava rifts, a dragon silhouette circling above a ruined orc war camp, '
    + 'ember red and charcoal palette. Main subject in the upper two thirds; bottom third fades to near black for card text. Portrait 2:3.', 1100),
  scene('map-winter', '1536x1024', 'Top-down three-quarter aerial view of one dungeon level inside a frozen abyss, used as a game map board: '
    + 'three concentric descending rings of icy rock terraces around a deep central pit with a faint red glow at the very center, '
    + 'frozen caves, ruined stone bridges and narrow ledges connecting the rings, many small flat clearings where map markers will be placed, '
    + 'snow drifts and dark ice. Very low fine detail and low contrast so overlaid icons stay readable, heavy dark vignette at all edges. Landscape 3:2.'),

  // —— 地图节点（叠在地图上的圆形徽记里）——
  icon('node-loot', 'A heap of treasure and gear: a dented helmet, a sword, scattered gold coins and a small sack.'),
  icon('node-supply', 'A sturdy wooden supply crate bound with rope, a coil of rope and a waterskin leaning on it.'),
  icon('node-chest', 'A heavy iron-bound treasure chest with a large closed padlock, faint golden light leaking from the seam.'),
  icon('node-ore', 'A jagged chunk of dark rock with glowing pale blue crystals growing out of it, a small pickaxe stuck in it.'),
  icon('node-fire', 'A small campfire of crossed logs inside a ring of stones, bright warm flames and sparks.'),
  icon('node-shrine', 'A weathered standing stone monolith shrine with a softly glowing pale gold carved spiral, candles at its base.'),
  icon('node-merchant', 'A travelling merchant pack: a large leather backpack with hanging lantern, pots and a bundle of goods.'),
  icon('node-extract', 'An iron beacon brazier on a tall pole burning with a bright pale green-white flame, signalling a way out.'),
  icon('node-boss', 'A massive horned demonic skull crown on a broken throne back, glowing red eyes, menacing.'),
  icon('node-lord', 'An ornate dark iron war helm with a jagged crown and torn cloak, cold golden glow in the eye slits.'),
  icon('node-nest', 'A beast nest of twisted bones and dark straw with three glowing violet eggs.'),
  icon('node-altar', 'A blood ritual altar: a low black stone slab with a carved basin of glowing crimson liquid and a ceremonial dagger.'),
  icon('node-coffin', 'An upright coffin encased in thick blue ice with a dark shape frozen inside, frost mist around it.'),
  icon('node-wander', 'A wolf skull mask with frost on it and a torn hood, cold blue glowing eyes, representing a roaming enemy.'),

  // —— 物品 ——
  icon('item-pass', 'A rolled ancient map scroll sealed with a dark red wax seal and a bronze clasp, edges worn.'),
  icon('item-compass', 'An ornate bronze compass with a dark glass face in which a tiny swirling teal abyss glows, open hinged lid.'),
  icon('sigil-iron', 'A palm-sized engraved sigil plate of rusted red iron, heavy and angular, glowing ember red engraved lines.'),
  icon('sigil-stone', 'A palm-sized engraved sigil tablet of black volcanic basalt, rough and solid, glowing pale green engraved lines.'),
  icon('sigil-silver', 'A palm-sized engraved sigil disc of star silver, elegant and thin, glowing pale blue star-shaped engraved lines.'),
  icon('cur-dust', 'A small heap of glittering grey-gold engraving dust on a cloth, fine sparkling particles.'),
  icon('cur-quality', 'A faceted warm golden gemstone in a small bronze setting, radiant golden glow.'),
  icon('cur-reroll', 'A smooth round stone with swirling violet and silver marbling, gently glowing violet.'),
  icon('cur-tier', 'A long whetstone of blue-grey stone with a glowing cyan edge line, sharpening stone.'),
  icon('cur-break', 'A cracked obsidian black stone with molten red-gold light bursting through the cracks.'),
  icon('use-torch', 'A wooden torch wrapped in oiled cloth, burning with a bright warm flame.'),
  icon('use-potion', 'A small round glass healing potion bottle with a cork, glowing crimson liquid.'),
  icon('use-lockpick', 'An old iron ring holding several ornate antique skeleton keys of different sizes, with a small leather tag.'),
  icon('use-smoke', 'A round clay smoke bomb with a short fuse, wisps of grey smoke curling out.'),
  icon('mat-memory', 'A glowing jigsaw-shaped shard of translucent pale blue crystal with a faint memory image inside.'),
  icon('mat-soul', 'A small iron cage lantern holding a burning purple-blue soul flame.'),
  icon('mat-purse', 'A fat leather coin purse tied with string, gold coins spilling out.'),
  icon('mat-flask', 'A slender glass flask holding swirling pale violet soul mist, stoppered with wax.'),

  // —— HUD ——
  icon('hud-lantern', 'An old iron hand lantern with a warm amber flame inside, glass slightly sooty.', 160),
  icon('hud-steps', 'An antique bronze hourglass with pale sand running, small cracks in the glass.', 160),
  icon('hud-life', 'A glowing crimson crystal heart set in a small dark iron cage.', 160),
  icon('hud-safe', 'A small sealed iron strongbox with a glowing teal ward seal on its lid.', 160),
]);
