# 音频资源管理

项目音效统一放在 `src/assets/audio/`，按用途分目录：

- `skills/`：技能施放、弹道、命中
- `gems/`：宝石交换、消除、爆炸
- `ui/`：按钮、提示和界面反馈

命名规则：`用途_阶段_属性[_变体].扩展名`，全部使用小写 snake_case。

例如：

- `skill_hit_water.wav`
- `skill_cast_fire.wav`
- `summon_necromancy.flac`
- `gem_explode_crystal_01.wav`

新增第三方素材时，必须同时更新 `ATTRIBUTION.md`，保留原始文件名、作者、来源和许可证。

## Source preservation

Never delete or move downloaded source audio during editing. Copy/crop into the project, keep the original in place, and only clean up after explicit user approval.

## Archived skull-hit variants

- Active: `combat/skull_hit.wav`, cropped from `D:\BaiduNetdiskDownload\319590__hybrid_v__shield-bash-impact.wav` at 0.120-0.580s (4ms fade-in, 50ms fade-out; 0.460s output)
- A: `combat/variants/skull_hit_3p00_4p00.wav`
- B: `combat/variants/skull_hit_5p02_5p72.wav`
- C: `combat/variants/skull_hit_3p29_4p00.wav`
- D: `combat/variants/skull_hit_1p60_2p20.wav`
- E: `combat/variants/skull_hit_6p60_7p40.wav`
- Previous active: `combat/variants/skull_hit_previous_779805_full.wav`
- Earlier active: `combat/variants/skull_hit_previous_77611_full.wav`
- Earlier active: `combat/variants/skull_hit_previous_264062_0p04_0p422.wav`

Only `combat/skull_hit.wav` is loaded at runtime. The named variants remain archived for comparison.

## Final gem explosion and archived candidates

- Final production asset: `gems/gem_explode.wav`, copied from `442872__qubodup__fire-magic.wav`.
- Archived candidates remain under `gems/variants/` but are no longer imported into the runtime bundle.


## Final skill-effect samples

All source files remain in `D:\BaiduNetdiskDownload` and were copied or losslessly cropped into the project:

- Poison: `skills/poison_spell_short.wav` <- `skills/poison_spell.flac`, cropped 0.72-1.48s with 12ms fade-in and 60ms fade-out (0.76s runtime); the full FLAC remains as the source master.
- Healing / cleanse: `skills/healing_spell_rise.wav` <- first rising swell of `563662__eminyildirim__healing-spell.wav`, cropped from `0.08s` to `2.95s` (2.87 seconds).
- Armor gain: `skills/armor_iron_hit.wav` <- active impact/tail of `371922__mrthenoronha__single-iron-hit-hard.wav`, cropped from `0.08s` to `1.15s` (1.07 seconds); only near-silent tail was removed.
- Gem explosion: `gems/gem_explode.wav` <- full `442872__qubodup__fire-magic.wav`.
- Frozen: `skills/frozen.wav` <- full local `冰冻.wav` (1.733 seconds).
- Burning: `skills/burning_tree.wav` <- local `D:\BaiduNetdiskDownload\树木燃烧.wav`, cropped 0.58-1.48s with 15ms fade-in and 70ms fade-out (0.90s runtime).


## Final single-target hit samples by caster color

These mappings apply only to `skill-damage` events with `range='single'`:

- Red: `skills/skill_hit_red_single.wav` <- full `442827__qubodup__fireball.wav`.
- Purple: `skills/skill_hit_purple_single.wav` <- source `275608__discoversound__fire-spell-01.wav`, cropped from `0.30s` to `1.90s` (1.60 seconds) with a 100ms fade-out.
- Yellow: `skills/skill_hit_yellow_single.mp3` <- first 68 MPEG frames of `636087__noahbangs__magic-flutter.mp3` (about 1.776 seconds); the tail was removed without re-encoding.
- Blue: `skills/skill_hit_water.wav` <- first 1.60 seconds of `572006__eminyildirim__water-magic-impact (1).wav`, with an 80ms fade-out.
- Green: `skills/skill_hit_green_single.wav` <- first 0.90 seconds of local `绿色单体受击.wav`, with a 60ms fade-out; the remaining file was an inaudible long tail.
- Brown and non-single damage retain the generic hit sound.

## Gem elimination / chain pitch mapping

Source: `621206__eminyildirim__holy-protection-skill-buff.wav`. The five detected sounds were ordered by spectral pitch/brightness from lower to higher:

1. `gems/chains/gem_chain_1.wav` <- source clip 4 (`6.20-6.95s`)
2. `gems/chains/gem_chain_2.wav` <- source clip 3 (`4.12-4.87s`)
3. `gems/chains/gem_chain_3.wav` <- source clip 1 (`0.03-0.78s`)
4. `gems/chains/gem_chain_4.wav` <- source clip 5 (`8.06-8.81s`)
5. `gems/chains/gem_chain_5.wav` <- source clip 2 (`2.16-2.91s`)

Chain levels above 5 reuse level 5 with a small playback-rate increase. The finalized runtime uses only this sampled set. The skill test page provides a full-set preview plus per-level preview buttons. The removed legacy square-wave synth is archived at `archive/legacy_gem_chain_synth.ts.txt` and is not imported into the runtime bundle.
