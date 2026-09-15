# 任务书 · 测试台与交互 UX 改版（阶段 3）

> 必读：`TASK-MASTER-PLAN.md`、`PARALLEL-WORK.md`。
> 前置：TASK-THEATER 的截图审查能力可用（本任务的验收靠它自证，不靠人工逐步看）。

## 用户反馈清单（原话归纳，全部要解决）

1. 技能测试台**太长**，要能**收起**。
2. 面板/区块**名字都是英文**，改中文。
3. **状态图标、特质完全不可点击**——要做 tooltip + 详情。
4. **技能释放、详情页粗糙**——精修。
5. 细节由**程序截图审查迭代**（配合 TASK-THEATER 的 visual_review），不到必须人工的地步。

## 阶段 1 · 测试台信息架构（SkillTestPage.ts，B 名下文件已过期，动前台账登记）

- 各区块（技能标签/组合器/特殊宝石/音效试听/事件流…）改为**可折叠 section**：默认收起 except 常用区（技能标签+组合器）；折叠状态存 localStorage。
- 区块标题中文化（事件流/特殊宝石投放/连击试听…已是中文的保持）；按钮与提示语全面检查无英文残留（专有名词如 TURN HUD 除外）。
- 布局密度：收起全部后页面高度 ≤ 一屏。

## 阶段 2 · 可点击交互（状态/特质）

1. **状态徽章**（`statusBadges.ts` + TeamView 状态行）：hover tooltip（状态名/中文语义一句话/剩余回合）；点击弹详情浮层（完整规则描述 + 来源计数）。引擎侧状态语义表若缺，从 GOW-STATUS-RESEARCH.md 拉。
2. **特质徽章**（立绘左侧竖排）：hover tooltip（特质名+效果描述，数据源 `getTrait(code)` 的 definition/description）；未实现 code 显示「未实现（占位）」；点击弹详情。
3. 详情浮层统一组件（`src/render/InfoPopup.ts` 新建，你名下）：复用给状态/特质/技能，暗色系风格对齐现有 UI。
4. 移动端可用性：tooltip 在触屏降级为点击切换。

## 阶段 3 · 技能释放与详情精修

1. 释放确认：点卡后先弹技能卡（名称/描述/消耗/当前效果预览）→ 确认才进选色/选目标流程；取消路径手感干净。
2. 技能详情页（角色卡长按已有入口基础）：排版升级——描述原文 / 已编译效果段逐段解释（中文）/ 数值面板。数据源：curated proto 的 segments 反推人类可读文案（写个 `describeSegment()` 纯函数，放 `src/render/segmentDesc.ts`，你名下，可单测）。
3. 演出引出（总目标里的「动画引出」）：施放前的角色高亮+技能名横幅（0.6s 内，不拖节奏）——复用 group_cast 框架素材，不新增美术。

## 阶段 4 · 程序自审迭代

- 每阶段结束跑 TASK-THEATER 的 visual_review 对关键界面截图（测试台收起/展开两态、tooltip 开/关、技能确认弹层、详情页）迭代到全 pass。
- 截图场景清单固化进 `scripts/ux_shots.mjs`（你名下），成为本任务的回归护栏。

## 边界与验收

- 你的文件：`src/render/SkillTestPage.ts`、`statusBadges.ts`、`traitBadges.ts`、`TeamView.ts`（交互部分）、新建 `InfoPopup.ts`/`segmentDesc.ts`/`ux_shots.mjs`；测试 `tests/unit/{uxInfo*,segmentDesc*}`。
- 共享文件（App.ts 的 castPlayerSkill 流程、EventStreamPlayer）：动前台账登记，编辑前重读。
- 门槛全绿 + 提交；最终验收 = ux_shots 全场景视觉审查 pass + 用户抽查一次。
