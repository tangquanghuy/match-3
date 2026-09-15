# 音效与敌人立绘生成提示词

> 用途：为 `combat-mechanics` 缺口准备可直接复制到 AI 工具的提示词。
>
> 生成日期：2026-09-15
>
> AI 生成结果进入产品前，必须确认平台商业授权、模型输出条款和第三方内容限制，并登记来源。

## 一、已有资产，不要重复生成

以下内容已经存在，除非要制作替换版本，否则不属于本批生成任务：

- 黄色单体技能音：`src/assets/audio/skills/skill_hit_yellow_single.mp3`
- 红、绿、蓝、紫单体技能音，以及土系施法、召唤、治疗、护甲、冰冻、燃烧、毒、消除链、爆炸、骷髅命中音
- `ghost`、`doomSkull`、`uberDoomSkull`、闪电、许愿、沙漏、蛛网和通配等特殊宝石图标
- 状态 SVG 图标和风暴基础指示器

## 二、统一音效生成规格

把以下英文作为所有音效提示词的公共风格约束：

```text
high-quality fantasy match-3 video game sound effect, clean studio recording,
short and punchy, clear transient, controlled low end, no clipping, no distortion,
no background music, no melody, no voice, no spoken words, no crowd, no room tone,
designed to layer with other game sounds, seamless clean ending, game-ready mix
```

统一负面提示词：

```text
no speech, no chanting, no lyrics, no narration, no full song,
no long reverb tail, no harsh white noise, no clipping, no crackle,
no copyright melody, no recognizable movie or game sound imitation
```

推荐参数：

- 优先导出 WAV、48 kHz、24-bit；最终统一响度后再导入。
- 状态施加音控制在 `0.25-0.80 s`。
- 特殊宝石触发音控制在 `0.40-1.20 s`，大型触发不超过 `1.50 s`。
- 胜负 stinger 控制在 `1.00-2.50 s`，需要明显起点和自然收尾。
- 环境循环控制在 `8-20 s`，要求首尾无缝衔接。
- 每条至少生成 4 个候选；保留原始文件，再在本地裁切、淡入淡出和归一化。

### 2.1 状态施加音

生成时使用“公共风格约束 + 下表提示词 + 统一负面提示词”。

| 建议文件名 | 时长 | 可直接复制的提示词 |
|---|---:|---|
| `status_death_mark.wav` | 0.45-0.70 s | `dark supernatural death mark applied, a sharp ominous sigil snap followed by a very short low spectral pulse, threatening but readable, no scream` |
| `status_silence.wav` | 0.35-0.55 s | `magical silence debuff applied, a muted bell cut short by a sealing click, airy vacuum effect, purple arcane tone, very clear transient` |
| `status_stun.wav` | 0.30-0.50 s | `cartoon-free fantasy stun impact, bright metallic starburst with a brief ringing wobble, yellow energy, punchy and non-lethal` |
| `status_web.wav` | 0.40-0.65 s | `sticky magical spider web wrapping a target, soft elastic strands stretching and snapping into place, purple arcane texture, no insect chatter` |
| `status_bleed.wav` | 0.30-0.55 s | `dark red bleed debuff applied, wet blade nick followed by a tight low pulse, restrained and non-gory, fast game feedback` |
| `status_curse.wav` | 0.45-0.75 s | `ancient purple curse seal locking onto a target, reverse whisper-like whoosh without words, brittle rune crack, ominous low undertone` |
| `status_marked.wav` | 0.30-0.50 s | `hunter target mark applied, red magical crosshair lock-on beep with a short tightening pulse, precise and tactical, no modern gun sounds` |
| `status_disease.wav` | 0.45-0.70 s | `fantasy disease debuff applied, small bubbling alchemical blight with a dry infected pulse, sickly yellow-green tone, subtle not disgusting` |
| `status_charm.wav` | 0.45-0.70 s | `brief magical charm effect, soft sparkling pink-gold swirl bending into a gentle hypnotic chime, no voice, no romance music` |
| `status_mana_burn.wav` | 0.35-0.60 s | `arcane mana burn, blue-violet energy rapidly drained into a tight suction whoosh and empty glassy pop, crisp and readable` |

播放规则建议：

- 完整状态音只在 `status-apply` 时播放一次。
- DoT 的 `status-tick` 不重复播放完整施加音，可以复用低音量短裁切或另做 `0.10-0.25 s` 的 tick。
- 同一事件批量给多名角色施加状态时只播一次，避免叠音削波。

### 2.2 特殊宝石触发音

| 建议文件名 | 时长 | 可直接复制的提示词 |
|---|---:|---|
| `gem_doom_skull_trigger.wav` | 0.70-1.10 s | `doomsday skull gem activating, deep skull-like magical thump, ominous rising pressure, then a compact purple explosion release, dramatic but not horror` |
| `gem_lightning_trigger.wav` | 0.35-0.70 s | `magical lightning gem trigger, fast electric charge, one bright arc zap and a clean crystalline tail, blue-white energy, no thunder rumble` |
| `gem_wish_trigger.wav` | 0.70-1.20 s | `wish gem activation, warm celestial sparkle, three ascending glassy chimes and a soft radiant burst, hopeful fantasy, no melody` |
| `gem_hourglass_trigger.wav` | 0.60-1.00 s | `enchanted hourglass gem activation, tiny sand stream, reversed time-suction whoosh, one precise clock-like tick, golden arcane texture` |
| `gem_wildcard_transform.wav` | 0.65-1.10 s | `rainbow wildcard gem transforming into another color, swirling chromatic shimmer, quick crystalline morph, bright satisfying resolution, no musical tune` |

闪电行消和列消可以共用 `gem_lightning_trigger.wav`，通过声像或播放速率做轻微区分，不必生成两份近似素材。

### 2.3 风暴、结算和 UI

| 建议文件名 | 时长 | 可直接复制的提示词 |
|---|---:|---|
| `storm_set.wav` | 0.80-1.30 s | `fantasy elemental storm summoned at the start of battle, wide airy vortex, distant magical wind, six-color crystal energy, powerful but clean, no thunder music` |
| `storm_loop.wav` | 10-15 s loop | `seamless looping fantasy battle storm ambience, low wind vortex, faint crystal particles, subtle distant energy arcs, restrained dynamic range, no melody, no sudden hits` |
| `victory_stinger.wav` | 1.20-2.20 s | `short triumphant fantasy game victory stinger, bright major-key magical flourish, crystal sparkle, confident final impact, no full song, no voice` |
| `defeat_stinger.wav` | 1.20-2.20 s | `short restrained fantasy game defeat stinger, descending dark magical tone, soft final impact, dignified and readable, no melodrama, no voice` |
| `ui_click_soft.wav` | 0.05-0.12 s | `minimal polished fantasy game interface click, tiny wood-and-crystal tick, dry, soft, unobtrusive, no reverb` |
| `ui_confirm.wav` | 0.15-0.30 s | `minimal fantasy game confirm sound, two tiny ascending crystal pings, clean and positive, no melody` |

### 2.4 战斗 BGM（使用音乐生成模型）

建议文件名：`music_battle_loop_main.wav`

```text
instrumental fantasy puzzle battle music for a polished match-3 combat game,
tense but not exhausting, steady medium tempo, light hand percussion,
plucked strings, low orchestral pulses, restrained magical crystal accents,
clear rhythmic space for frequent game sound effects, no vocals, no choir,
no dominant lead melody, no cinematic trailer booms, seamless 90-second loop,
the ending must connect naturally back to the opening downbeat
```

额外负面提示词：

```text
no vocals, no lyrics, no choir, no famous melody, no heroic fanfare,
no heavy sub-bass, no wall of sound, no abrupt intro, no fade-out ending
```

BGM 必须单独检查循环接缝，并至少保留 `-6 dB` 左右的余量给战斗音效。若模型无法生成真正无缝循环，应导出长版本后在音频编辑器中选稳定段落制作循环。

## 三、敌人/兵种立绘生成规范

### 3.1 通用母提示词

把 `[RACE]`、`[ROLE]`、`[ELEMENT]` 和 `[SILHOUETTE]` 替换后批量生成：

```text
single original enemy troop portrait for a polished fantasy match-3 battle game,
[RACE] [ROLE] aligned with [ELEMENT] element,
[SILHOUETTE], three-quarter view facing slightly toward the center of the screen,
head and upper body clearly readable, strong distinctive silhouette,
expressive but not exaggerated face, practical armor and recognizable weapon,
stylized fantasy illustration with clean shapes and controlled detail,
dramatic rim light in [ELEMENT] color, simple neutral dark background,
centered composition, isolated character cutout, no text, no logo,
consistent character-card framing, high resolution, production-ready game asset,
fully original character design, not based on any existing franchise or celebrity
```

通用负面提示词：

```text
full body, tiny character, multiple characters, duplicate limbs, extra fingers,
deformed hands, cropped head, face hidden, extreme perspective, busy background,
text, letters, logo, watermark, UI frame, border, weapon covering the face,
photorealistic skin, modern clothing, sci-fi gun, gore, blood splatter,
overexposed glow, muddy silhouette, low contrast, blurry, low resolution,
inconsistent costume details, chibi proportions, existing anime character,
copyrighted game character, celebrity likeness
```

建议参数：

- 源图生成 `1024x1024` 或更高，后处理为透明 PNG/WebP。
- 最终卡片为竖向裁切时，头部应占画布高度约 `35-45%`。
- 所有角色保持同一模型、风格参考图、镜头高度、光照方向和边缘留白。
- 敌方角色统一朝画面左侧或中央，玩家方统一朝右侧或中央。
- 每个兵种至少保留 3 个候选，再统一抠图、裁切、色彩和锐度。
- 文件名使用稳定 ID 或英文 slug，例如 `enemy_plague_knight.webp`，不要只依赖中文显示名。

### 3.2 批量职业/种族变体

将下列短语填入母提示词的角色描述位置：

| 类型 | 角色描述短语 |
|---|---|
| 人类骑士/防御者 | `human royal knight defender, broad shield and worn steel plate, upright guarded stance, calm determined expression` |
| 兽人战士/攻击者 | `orc warrior striker, heavy asymmetrical shoulder armor, chipped cleaver, forward-leaning aggressive stance, tusks visible` |
| 狼人/变形单位 | `werewolf warmaster, controlled partial transformation, wolf muzzle, pointed ears, clawed gauntlets, torn mantle, feral eyes` |
| 不死/死灵法师 | `undead warlock, pale bone mask, layered tattered robes, necromantic rune focus, hollow but readable eyes` |
| 妖精/诅咒/魅惑 | `arcane fae enchanter, elegant silhouette, curved horn or leaf crown, ornate charms, one hand holding a curse sigil` |
| 自然/毒/疾病 | `swamp beast or plague druid, layered bark and moss armor, vine and fungus details, hunched organic silhouette, not grotesque` |
| 水族/冰霜 | `aquatic frost mage, translucent fin or shell armor, ice staff, flowing cloak shapes suggesting water and frozen mist` |
| 构装体/元素 | `elemental construct defender, carved stone or crystal body, one bright elemental core, simple geometric armor plates` |
| 远程/刺客 | `fantasy assassin or ranger, compact layered leather armor, distinctive hood, short bow or paired blades held below the face` |

### 3.3 元素颜色替换表

| 元素 | 英文替换词 | 建议视觉语言 |
|---|---|---|
| Red | `ember red and orange` | 火星、熔痕、热浪边缘光 |
| Green | `leaf green and acid lime` | 藤蔓、毒液、自然生长 |
| Blue | `ice blue and cyan` | 水汽、冰晶、冷色边缘光 |
| Yellow | `golden yellow and white` | 雷光、圣光、金属反光 |
| Purple | `violet and magenta` | 奥术、诅咒、幽魂能量 |
| Brown | `earth brown and bronze` | 岩石、泥土、木纹、厚重护甲 |

### 3.4 当前独立战斗的四名敌人

以下四条是完整提示词，可直接生成。角色名称只用于文件映射，不要求模型在画面中生成文字。

#### 夜斗：红色恶魔剑士

建议文件名：`enemy_yato.webp`

```text
single original enemy portrait for a polished fantasy match-3 battle game,
a young male daemon sword fighter aligned with ember red magic,
messy black hair with one subtle crimson streak, short obsidian horns,
dark layered travel armor and a weathered black scarf,
holding a narrow cursed sword below his face, agile forward-leaning stance,
confident dangerous expression, faint red sparks around the blade,
head and upper body clearly readable, strong asymmetric silhouette,
polished anime-inspired fantasy card illustration, painterly rendering,
three-quarter view facing slightly left toward the center of the battlefield,
simple dark neutral background, isolated character cutout, no text, no logo,
consistent portrait framing, high resolution, fully original character design,
not based on any existing anime, game character, franchise, or celebrity
```

#### 绯：蓝紫毒刃恶魔

建议文件名：`enemy_hii.webp`

```text
single original enemy portrait for a polished fantasy match-3 battle game,
an androgynous daemon assassin aligned with ice blue and violet poison magic,
short pale hair, small swept-back dark horns, sharp luminous violet eyes,
compact layered leather armor with dark metal scale accents,
two slim venom-coated ritual blades held below the face,
controlled cold expression, thin blue mist and subtle purple venom glow,
head and upper body clearly readable, fast angular silhouette,
polished anime-inspired fantasy card illustration, painterly rendering,
three-quarter view facing slightly left toward the center of the battlefield,
simple dark neutral background, isolated character cutout, no text, no logo,
consistent portrait framing, high resolution, fully original character design,
not based on any existing anime, game character, franchise, or celebrity
```

#### 癌骑士：三色瘟疫重甲骑士

建议文件名：`enemy_plague_knight.webp`

```text
single original enemy portrait for a polished fantasy match-3 battle game,
a corrupted plague knight using green blight, golden ward light, and ember red heat,
massive weathered plate armor overgrown with restrained thorn vines and fungal marks,
a closed angular helmet with one narrow readable green eye glow,
broad battered shield and heavy mace kept below the head,
slow defensive stance, imposing clean silhouette, threatening but not grotesque,
small gold seal fragments fighting against red cracks and sickly green spores,
polished anime-inspired fantasy card illustration, painterly rendering,
three-quarter view facing slightly left toward the center of the battlefield,
simple dark neutral background, isolated character cutout, no gore, no text, no logo,
consistent portrait framing, high resolution, fully original character design
```

#### 亡月女神：全色月蚀施法者

建议文件名：`enemy_moonless_goddess.webp`

```text
single original enemy portrait for a polished fantasy match-3 battle game,
an ancient moonless goddess and arcane warlock commanding all six elements,
adult woman with long silver-black hair, calm severe expression, luminous pale eyes,
elegant layered black ceremonial armor, broken crescent crown behind the head,
one hand holding a small eclipsed moon orb below the face,
six restrained elemental motes arranged around her shoulders:
red ember, green leaf light, blue frost, golden lightning, violet arcane mist, brown stone,
regal vertical silhouette, powerful without excessive ornament,
polished anime-inspired fantasy card illustration, painterly rendering,
three-quarter view facing slightly left toward the center of the battlefield,
simple dark neutral background, isolated character cutout, no text, no logo,
consistent portrait framing, high resolution, fully original character design,
not based on any existing goddess, anime, game character, franchise, or celebrity
```

对以上四条统一追加第 3.1 节的负面提示词。若模型不能直接输出可靠透明背景，先保留单色深灰背景，再用抠图工具统一移除，不要逐张使用不同复杂背景。

## 四、生成后验收清单

### 4.1 音效

- [ ] 浏览器能够解码，优先使用 WAV；MP3 仅作为体积优化版本。
- [ ] 没有语音、歌词、明显旋律或可识别的影视/游戏模仿音。
- [ ] 开头瞬态清晰，结尾没有过长混响；多音并发不会明显削波或浑浊。
- [ ] 状态音不会盖过命中反馈；stinger 不会阻断战斗结束流程。
- [ ] 风暴环境音能无缝循环，循环接缝没有爆音和音量跳变。
- [ ] 保存生成平台、账号计划、生成日期、提示词、原始文件和商用授权证明。
- [ ] 入库时更新 `src/assets/audio/ATTRIBUTION.md`，即使平台不要求署名也记录来源。

### 4.2 立绘

- [ ] 在实际角色卡小尺寸下仍能区分脸、武器、种族和主元素色。
- [ ] 透明边缘没有白边、黑边、残留背景或被截断的头发/武器。
- [ ] 同批角色的头部比例、镜头角度、光照方向和细节密度一致。
- [ ] 没有文字、水印、品牌标志或明显的既有版权角色特征。
- [ ] 文件经过尺寸和体积优化，建议运行时使用 WebP，保留无损源图。
- [ ] 本地资源映射成功；CDN 失败时仍有程序化兜底，不阻塞战斗。
- [ ] 保存模型版本、seed、提示词和参考图版本，便于以后补出同风格角色。

## 五、建议的首批生成顺序

1. `victory_stinger.wav`、`defeat_stinger.wav`，先解决战斗结束无声音反馈。
2. `status_curse.wav`、`status_death_mark.wav`、`status_stun.wav`、`status_silence.wav`、`status_web.wav`。
3. 当前四名敌人立绘；先确认整批视觉风格，再扩到其他兵种。
4. 其余状态音和五种特殊宝石触发音。
5. `storm_set.wav`、`storm_loop.wav`、UI 音。
6. 战斗 BGM 最后生成和混音，避免它掩盖已经定稿的核心反馈音。

