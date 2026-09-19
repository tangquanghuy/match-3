# 任务书 · 音效缺口补齐与接线（阶段 3，可与 TASK-UX 并行）

> 必读：`TASK-MASTER-PLAN.md`、`PARALLEL-WORK.md`、`.kiro/specs/combat-mechanics/ASSET-GAPS.md` 的音效节（缺口明细来源）。
> 前置：TASK-STATUS-ACCEPT 完成——它产出的 `artifacts/audio-inventory.txt`（`assets/音效/` 盘点）是你的起点；改 AudioManager 需要主树解冻。

## 背景

现状：战斗基础音齐（35 wav：骷髅命中+8 变体、消除+5 连击链、爆炸+5 变体、技能组 14）；AudioManager 通道 armor/burning/damage/eliminate/frozen/healing/hit/impact/poison/skill/summon/swap/whoosh。
缺口（按影响排序）：
1. **胜负结算 stinger**（战斗结束零反馈，P0 级体验缺失）
2. **状态施加音**：沉默/击晕/织网/流血/诅咒/猎人标记/疾病/魅惑/法力燃烧（特殊状态批新落地状态的徽章出现时配套）
3. **特殊宝石触发音**：末日骷髅引爆/闪电清行列/许愿/沙漏/通配变形（现复用消除/爆炸）
4. **黄色技能音**（视觉 strip 有、音无；其余五色齐）
5. **BGM**：零音乐文件——战斗 BGM 与胜负 BGM 是否做、循环/切换策略，需先给方案再实施
6. 风暴环境音（现复用召唤音；可选）

## 阶段 1 · 盘点与接线现有资产

1. 读 `artifacts/audio-inventory.txt`（若缺，先自己盘点 `assets/音效/` + `src/assets/audio/`）。
2. `assets/音效/`（特殊状态批带入的）逐个试听级核对（时长/采样率/响度），可用的接线进 AudioManager：命名归一（进 `src/assets/audio/**` 目录结构，保留 ATTRIBUTION 记录），旧的归 archive。
3. 状态施加音接线点：`statusBadges`/`EventStreamPlayer` 的 status-apply 事件处理处；宝石触发音接线点：`special-gem-trigger` 事件处。**接线只加映射不动引擎逻辑**；AudioManager 是共享文件，动前台账登记。

## 阶段 2 · 产出缺口素材

新素材来源三选一（在报告里说明选择与成本）：程序合成（wat 钢制/正弦叠加，参考既有 archive 里旧版合成先例）、免费 CC0 素材库（记录来源进 ATTRIBUTION.md）、或留占位清单给用户跑图管线式产出。至少覆盖：胜负 stinger ×2、黄色技能音 ×1、状态施加音按已落地状态补齐。

## 阶段 3 · BGM 方案（先方案后实施）

1. 产出方案小节写入 `.kiro/specs/combat-mechanics/DECISIONS.md`：战斗 BGM 的循环结构、胜负切换、音量总线（BGM/SFX 分轨）、autoplay 政策（首次交互解锁，沿用现有 initAudio 机制）。
2. 实施：AudioManager 加 BGM 通道（可静音开关，localStorage 记忆）；素材可先用程序合成底噪级占位，正式曲留给用户替换。

## 阶段 4 · 回归与自审

- 音效接线的行为用单测锁（事件→音效调用映射表快照，mock audio context；先例见既有 AudioManager 测试模式）。
- 用 TASK-THEATER 的放映厅跑 20 条技能 + 千场烟雾抽样 5 场，确认无「音效缺失导致异常路径」；`tests/e2e/` 加一条音频资源加载冒烟（全部引用文件存在且可解码）。

## 边界与验收

- 你的文件：`src/assets/audio/**`、`assets/音效/**`（整理归档）、`src/render/AudioManager.ts`（接线）、`ATTRIBUTION.md`、`tests/unit/audio*`。
- 验收：inventory 对账完成、缺口清单里 1~4 项全部有音且接线、BGM 方案落 DECISIONS 并实施通道、门槛全绿。
- 须人工：最终听感抽查（stinger/状态音各放一遍，用户拍板音量比例）。
