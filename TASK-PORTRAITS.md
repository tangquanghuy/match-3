# 任务书 · 立绘提示词 P2 全量（41 王国 ~1743 名）

> 必读：`TASK-MASTER-PLAN.md`、`artifacts/prompt-overrides/_authoring-guidelines.md`（**作业标准，逐条遵守**）。
> 前置：无主树依赖（本任务只新增文件，主树冻结期间即可开工）。
> 用户已确认样板（破碎尖塔 47/47，经四轮修正：模板瘦身/环境解绑王国/明暗自由/氛围微粒清洗/西方奇幻风格行）。

## 现成基建（不要重造）

- 渲染器：`scripts/build_portrait_prompts.mjs`（6 标签极简模板，~1070 字符/文件；CLI：`--kingdom X --rarity A,B --limit N --overrides 路径`；自动校验+`_build-report.json`/`_missing-overrides.txt`）。
- 数据：`artifacts/portrait-manifest.json`（1798 条）；撞名去重 1790；`artifacts/portrait-production-plan.md`（分片/优先级参考）。
- 样板：`artifacts/prompt-overrides/破碎尖塔.json`（新 schema 47 条）+ `assets/prompt/立绘/破碎尖塔/`（94 文件）。
- 风格行锁死：`wlopk2style, western fantasy style, DnD monster manual illustration, painterly fantasy,`——**wlopk2style 是用户管线必需 tag，严禁删除**。
- 2026-09-16 用户更正（已落入脚本）：① 风格行去 dark fantasy（是奇幻不是黑暗奇幻，任何字段禁用该词）；
  ② 侧面视角锚由 `side profile view, facing right` 改为 `, from side`，pose_side 禁写 full profile/silhouette 类措辞；
  ③ 机械/构装系一律奇幻蒸汽朋克构装体，禁现代未来词汇（词表与放行同形词见 `_authoring-guidelines.md`「机械/构装系风格」节），全库 37 条已按此回炉。

## 作业方式（核心纪律）

1. **逐角色撰写 override**（新 schema：name/subject_en/subject/details/pose_front/pose_side/expression_front/expression_side/environment/palette/pronoun）——身份以 referenceName 为准（中文名会骗人：熔岩巨人=LavaEttin 双头是官方设定）；环境因地制宜现判、题材多样、明暗混合分布；数量词只在 subject 出现一次；禁光源机关戏、禁氛围微粒填充、禁东方宗教饰物词。细则全在 `_authoring-guidelines.md`。
2. 每批 40~60 名写进**自己的分片文件**（`artifacts/prompt-overrides/{稀有度或王国}-{批次}.json`，脚本自动合并同目录）。
3. 跑渲染 → 读 `_missing-overrides.txt` → 迭代到本片 missing=0、WARNING=0（氛围填充词软警戒）。
4. 每片结束抽查 5 条通读（模板锚齐全/无重复概念/正侧视角确实不同）。

## 分片与波次（平台子 agent 并发上限 2，两波）

- 第一波：**Legendary+Epic 全库 483 名**（首领位优先跑图）、**UltraRare 596 名**。
- 第二波：**Rare+Uncommon 599 名**、**Common 120 名**。
- 每波内部再按 limit 切批；断点续跑天然支持（missing 名单就是待办）。

## 验收（窗口 D 汇总做）

- 对账：总文件数 = 3580（1790×2）+ 破碎尖塔 94 = 3674；与 manifest 零缺零重；文件名与 `encodeURIComponent(name)` 拼名规则一致（特殊字符 `· - . 空格` 保留原样）。
- 抽样：每稀有度随机 3 名，正侧各一，人肉通读（须人工的只有这一步，用户跑图试产为准）。
- WARNING 统计归零或每条有合理豁免理由。

## 边界（红线）

只准新增/修改：`artifacts/prompt-overrides/**`（除破碎尖塔.json 只追加不重写他人条目）、`assets/prompt/立绘/**`。
**严禁**：`src/**`、`tests/**`、`scripts/build_traits.mjs`、`src/data/**`、`assets/prompt/提示词`（范例只读）、`scripts/build_portrait_prompts.mjs`（模板已冻结；确需改锚先报窗口 D 裁定）。不跑 git/npm。

## 产出

每波结束更新 `artifacts/prompt-overrides/_progress.md`（波次/片名/完成数/missing 余量），供用户决定跑图批次与 CDN 上传顺序（上传侧命名规则见 portrait-production-plan.md 的「命名对账」节）。
