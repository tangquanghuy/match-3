# 状态施加音效 · AI 生成英文提示词（窗口 I · 2026-09-16）

> 用途：用 AI 音效生成器（ElevenLabs SFX / Stability Audio 等任选其一）批量生成 15 个状态施加音。
> 生成后按「输出文件命名」一节的文件名存成 wav/mp3，丢进 `src/assets/audio/status/` 目录即自动接线，
> 无需改任何代码（AudioManager 启动时自动扫描该目录）。测试台「状态施加音效」区可逐个试听验收。

## 统一生成参数（建议）

- **时长**：1.0~1.5 秒（生成器有时长滑杆就设 1.5s，没有就靠提示词里的时长描述）。
- **一致性**：全部用同一个生成器、同一套参数一口气生成，中途别换模型——15 个音要像一个游戏里出来的。
- **负向**：提示词里已带 no music / no ambience，生成结果若仍出现旋律/配乐，加 negative prompt: `music, melody, singing, drum loop, ambience`。
- **响度**：成品响度对齐既有采样（燃烧/冰冻那种一耳朵能听见的量级），太轻的挑掉重生成。
- **许可**：生成结果按仓库惯例登记 `src/assets/audio/ATTRIBUTION.md`（来源=所用生成器+提示词日期）。

## 每段提示词都是自包含的（风格行已内置），整段复制即可

风格行（已拼进每段开头，单独列出仅供校对）：
`Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone.`

---

### 1. 流血 · `status_bleed.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A wet blade slash into flesh followed by two thick blood drips, squelchy and visceral, sharp hit first then slow sticky dripping.
```

### 2. 沉默 · `status_silence.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A bright magical shimmer abruptly swallowed into a deep muffled hush, sound energy being sealed away, quick dampening whoosh dying into silence.
```

### 3. 击晕 · `status_stun.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A heavy blunt club impact on a helmeted head, bone-rattling thud followed by a dizzy wavering high-pitched ringing that slowly fades.
```

### 4. 缠绕 · `status_entangle.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. Tough thorny vines whipping out and coiling tight around a body, fibrous creaks, leafy rustle and a strained tightening grip.
```

### 5. 织网 · `status_web.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. Sticky spider silk spun in quick bursts, tacky fibrous thrips and stretchy strands being scraped and plucked.
```

### 6. 屏障 · `status_barrier.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A shimmering arcane shield snapping into place, crystalline hum blooming into a warm resonant protective aura.
```

### 7. 下潮 · `status_submerged.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A heavy body plunging into deep water, big splash, gurgling bubbles diving under into a muffled underwater tone.
```

### 8. 猎人标记 · `status_marked.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A sharp target lock: two quick high pings like a hawk cry, then a deep stamping thud as the prey is marked.
```

### 9. 疾病 · `status_disease.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A nauseous afflicted wheeze with swarming flies and wet bubbling phlegm, sickly and repulsive.
```

### 10. 诅咒 · `status_curse.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A dark hex being woven: reversed ghostly whispers over a low demonic drone, descending ominous tone, wicked and ancient.
```

### 11. 死亡标记 · `status_death_mark.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A distant execution bell tolling twice, deep ominous bronze with a cold whisper underneath, a death sentence pronounced.
```

### 12. 狂怒 · `status_rage.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. An enraged beast roaring as it powers up, chest-thumping aggressive growl rising in intensity, furious battle cry.
```

### 13. 魅惑 · `status_charm.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A seductive hypnotic enchantment, soft alluring female voice sighing, glassy sparkling chimes cascading upward.
```

### 14. 法力燃烧 · `status_mana_burn.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. Arcane mana being violently drained, crackling electric sizzle evaporating into a fizzing upward whoosh, energy vaporizing.
```

### 15. 狼化 · `status_wolf.wav`

```text
Fantasy RPG battle game sound effect, single one-shot, no music, no ambience, punchy and clean game SFX mix, about 1 to 1.5 seconds, medium-loud, dark western fantasy tone. A haunting wolf howl that twists mid-call into a monstrous beast growl, lycanthrope transformation under a full moon.
```

## 输出文件命名（放错名字接不上）

存进 `src/assets/audio/status/`，命名必须是 `status_<键名>.wav`（mp3/ogg 也认，但推荐 wav）：

| 状态 | 文件名 | 状态 | 文件名 |
|---|---|---|---|
| 流血 | `status_bleed.wav` | 诅咒 | `status_curse.wav` |
| 沉默 | `status_silence.wav` | 死亡标记 | `status_death_mark.wav` |
| 击晕 | `status_stun.wav` | 狂怒 | `status_rage.wav` |
| 缠绕 | `status_entangle.wav` | 魅惑 | `status_charm.wav` |
| 织网 | `status_web.wav` | 法力燃烧 | `status_mana_burn.wav` |
| 屏障 | `status_barrier.wav` | 狼化 | `status_wolf.wav` |
| 下潮 | `status_submerged.wav` | 猎人标记 | `status_marked.wav` |
| 疾病 | `status_disease.wav` | （中毒/燃烧/冰冻沿用既有采样，不必生成） | |

键名即代码里的规范 statusId（下划线形态）；`status-death-mark.wav` 这类连字符名也能被别名归一认出，但推荐统一用下划线。

## 验收

1. 文件放入后启动测试台，「状态施加音效」区点对应按钮：播的是新采样即接线成功（无采样时播的是占位合成，一听便知）。
2. 全部 15 个过一遍：无音乐残留、响度与燃烧/冰冻同量级、时长 1~1.5s。
3. 满意后在 `src/assets/audio/ATTRIBUTION.md` 补一行来源（生成器 + 日期 + 提示词文件路径）。
