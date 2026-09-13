# Frame FX assets

Generated horizontal PNG strips used by `App.playFrameFX()`.

## Skill effect mapping

| Project strip | Local source frames | Build parameters | Runtime use |
|---|---|---|---|
| `heal_cleanse_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0287` (28 frames) | `FrameH=240`, `MaxFrames=28`; output `28 x 237x240` | Healing and status cleanse |
| `armor_up_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0306` (34 source frames) | uniformly sampled to 28 frames, `FrameH=240`; output `28 x 217x240` | Armor gain |
| `poison_apply_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0340` (30 frames) | `FrameH=240`, `MaxFrames=30`; output `30 x 478x240` | Poison status application |
| `water_single_hit_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0417` (11 frames) | `FrameH=240`, `MaxFrames=11`; output `11 x 238x240` | Water-element single-target skill impact |
| `yellow_single_hit_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0007` main `effect_hit` track (16 of 61 directory PNGs) | `FrameH=240`, 16 frames; output `16 x 301x240` | Yellow single-target impact |
| `green_single_hit_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0481` (26 frames) | `FrameH=240`, `MaxFrames=26`; output `26 x 276x240` | Green single-target impact |
| `death_drift_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0353` (26 frames) | `FrameH=240`, `MaxFrames=26`; output `26 x 315x240` | Faint particles drifting from a defeated card |
| `splash_hit_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0406` (16 frames) | `FrameH=240`, `MaxFrames=16`; output `16 x 233x240` | Color-neutral splash hit with no projectile |
| `splash_chain_cast_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0083` (32 frames) | `FrameH=240`, `MaxFrames=32`; output `32 x 309x240` | Board-centered enlarged splash release layer |
| `splash_chain_sword_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0002` frames 00-01 only | `StartFrame=0`, `EndFrame=1`, `FrameH=360`; output `2 x 188x360`; landing/ground frames 02-20 excluded | Spectral sword bounce between splash targets |
| `frozen_apply_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0058` (66 source frames) | uniformly sampled to 32 frames, `FrameH=240`; output `32 x 356x240` | Frozen status application |
| `burning_apply_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0450` (30 frames) | `FrameH=240`, `MaxFrames=30`; output `30 x 195x240` | Burning status application |
| `group_cast_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0241` (8 frames) | `FrameH=240`, `MaxFrames=8`; output `8 x 243x240` | Board-centered group-attack release stage (no projectile) |
| `group_hit_purple_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0475` (27 source frames) | sampled to 24, `FrameH=240`; output `24 x 423x240` | Group hit for purple caster |
| `group_hit_red_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0449` (22 frames) | `FrameH=240`, `MaxFrames=22`; output `22 x 457x240` | Group hit for red caster |
| `group_hit_blue_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0344` (17 frames) | `FrameH=240`, `MaxFrames=17`; output `17 x 246x240` | Group hit for blue caster |
| `group_hit_yellow_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0318` (9 frames) | `FrameH=240`, `MaxFrames=9`; output `9 x 356x240` | Group hit for yellow caster |
| `group_hit_brown_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0334` (17 frames) | `FrameH=240`, `MaxFrames=17`; output `17 x 518x240` | Group hit for brown caster |
| `group_hit_green_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0349` (18 frames) | `FrameH=240`, `MaxFrames=18`; output `18 x 481x240` | Group hit for green caster |
| `extra_turn_strip.png` | `D:\迅雷下载\特效500个【png】\特效500个【png】\0082` (95 source frames) | sampled to 32, `FrameH=240`; output `32 x 347x240` | Board-centered blessing on extra-turn grant |

Regenerate with `scripts/build_fx_strip.ps1`. The script uses one union alpha bounding box for all frames so the animation does not jitter.
