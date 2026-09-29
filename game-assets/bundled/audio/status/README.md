# status/ · 状态施加音采样投放目录

把 AI 生成的状态施加音按 `status_<键名>.wav` 命名放进本目录，启动后自动接线播放，无需改代码。

- 键名清单与英文生成提示词：`game-assets/source/audio/status-sfx-raw/提示词/状态施加音效-AI生成提示词.md`
- 键名即规范 statusId（下划线形态）：bleed / silence / stun / entangle / web / barrier / submerged /
  marked / disease / curse / death_mark / rage / charm / mana_burn / wolf
- 某状态缺文件时回退占位合成（StatusSynth）；放入后采样优先。
- 入库时在上级 `ATTRIBUTION.md` 登记来源（生成器 + 日期）。
