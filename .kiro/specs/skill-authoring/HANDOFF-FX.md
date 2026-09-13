# 交接文档 · 技能特效（序列帧 + 弹道 + 命中/爆破）

> 面向接手的新对话。先读本文件，再读 `.kiro/specs/skill-authoring/HANDOFF.md`（引擎/释放主干）与 `src/render/App.ts`。
> 本文件只讲「本轮技能演出特效」这条线，包含**一个尚未定位的回归**（见第三节，最重要）。

## 一、当前状态（一句话）

✅ **已修复**：e2e 14/14 全绿，四件套（tsc / vite build / vitest 241 / playwright 14）全过。第三节的回归（中毒/召唤/选敌伤害卡在 `skill-cast`）与绿色命中特效均已解决，详见下方「✅ 修复记录」。

## 二、这条线做了什么（意图 + 落点）

需求来自用户逐条反馈，最终目标：
1. **发射类技能 = 通用程序化直线弹道**（不是烘焙序列帧），匀速直线、干脆，颜色随施法者代表色变化。
2. **命中 = 每种颜色一套"成熟的帧动画"爆点**（不是简陋程序化迸溅）。按施法者首个颜色映射：
   - 红→`hit_spark`(0128) / 蓝→`hit_blue`(=water_bolt 0002 蓝剑气) / 绿→见下 / 黄金→`hit_gold`(0145) / 紫→`hit_purple`(0207) / 棕→`hit_brown`(0212)
   - **绿色**：库里没有干净的绿色命中素材（0143 是烟花，已弃用删除）。当前实现＝复用蓝剑气 strip(`water_bolt`) + CSS `hue-rotate(-73deg)` 把青蓝(203°)转成绿(130°)。**注意 hue 方向**：之前用过 `+85deg` 会转到红/品红（转反了），务必用负角。
3. **宝石爆破 = 每颗被炸宝石各放一团序列帧**（`energy_burst` 0046 中性能量爆），从爆心向外错峰、随机旋转；**已移除**原来每颗一个的程序化冲击圆环（`FXLayer.shockwave` 那个"廉价圈"）。
4. 音效：`skill` 由卡通上扫 sweep 换成破空 whoosh；新增 `hit`（命中击打）。

## ✅ 修复记录（本轮解决）

**1) e2e 3 个失败（中毒/召唤/选敌伤害卡在 skill-cast）——根因＝测试拖拽落空，非引擎问题**
- 实测确认：假设 1 成立。这三个技能标签在测试页技能列表**靠下、位于视口外**（poison y≈790、summon/dmg-chosen y≈907，视口高 720）。Playwright 原生 `dragTo` 为把标签滚入视口，反把顶部落点 `card-0` 挤出视口，`drop` 落空 → 角色 `skillId` 保持 `none` → `castSkill` 走回退（仅扣法力、只发 `skill-cast`）。靠上的标签（dmg-single 等）在视口内，drop 正常，所以只有这三个偏偏失败。
- 浏览器实测对照：拖 dmg-single（视口内）事件日志出现 `◆ 角色0 技能 → 单体伤害`；拖 summon（视口外）无该行 → 证实 drop 未触发。
- 修复：`tests/e2e/skills.spec.ts` 的 `assignAndCast` 改用**合成 HTML5 拖放**（新增 `assignSkill`）——共用一个 `DataTransfer` 依次 `dispatchEvent(dragstart→dragover→drop→dragend)`，与页面真实拖放处理器（读 `text/plain`）完全一致，且与滚动/视口无关。引擎、`SkillTestPage`、`App` 均未改。

**2) 绿色命中特效——按本文档既有结论修正**
- 之前实现自相矛盾：`hit_green` 底图误用 `energy_burst`（钴蓝紫多色，hue-rotate 不可控），且滤镜用 `hue-rotate(85deg)`（正角 → 转到品红，方向反了）。
- 修复：`hit_green` 底图改回单一色调的 `water_bolt`（蓝剑气 ≈203°），滤镜改 `hue-rotate(-73deg)`；`AnimationConfig.frameFX.hit_green` 的帧几何同步改为 water_bolt 的 21 帧 164×240（原为 energy_burst 的 12 帧，不改会错算 strip 宽度而串帧）。
- 量化校验（canvas 取主色相）：原图 200°（青蓝）→ `-73deg` 得 **130°（翠绿）**✅；旧 `+85deg` 得 300°（品红）——印证「正角转反」。

---

## 三、⚠️ 未解决的回归（已解决，保留供追溯）

**现象**：`npx playwright test --retries=0 --workers=1` 稳定 3 失败：
- `中毒→status-apply…`（line 76）：卡在 `skill-cast`，无 `status-apply`
- `召唤：summon`（line 94）：卡在 `skill-cast`，无 `summon`
- `玩家选目标：拖★选敌伤害…`（line 109）：卡在 `skill-cast`，无 `skill-damage → 角色6`

**已排除**：
- 不是 JS 运行时异常（浏览器控制台只有 favicon 404）。
- 不是引擎逻辑（vitest 单测此前全绿；本轮只改表现层 + e2e 测试文件）。
- 脏 dev server 会额外放大失败数（曾见 6 失败）；停掉手动 dev server 后稳定为 3。**跑 e2e 前务必先停掉自己开的 dev server**，让 playwright 起干净的。

**通过对照**（这些 e2e 过）：单体伤害、群体伤害、创造宝石、随机摧毁、随机爆破、选宝石引爆、选行摧毁、定色摧毁。

**关键对照分析**：
- "群体伤害/单体伤害"过，说明 damage 段能执行、帧动画能播。
- 但"选敌伤害(dmg-chosen)"卡在 skill-cast——它比单体伤害多了一步 **TargetPicker 选目标**。
- "中毒(enemyFirstN)"「召唤」不需要任何 picker，却也卡住。
- 三者症状完全一致（只到 skill-cast）。

**两条最可能的假设（未验证）**：
1. **拖拽换技能未生效**：`assignAndCast` 用 `dragTo` + 150ms 等待就短按。若这几个技能标签的拖拽没真正把 `ch.skillId` 换上，`castSkill` 会走「未配置技能→仅扣法力→只发 skill-cast」的回退（正好只有 skill-cast）。为何偏偏这三个失败、其它同样用 `assignAndCast` 的却过——存疑，需要实测每个技能拖拽后 `getState()` 里该角色 `skillId` 到底变没变。
2. **时序/互斥**：`appendSkillDamage` 我加了 `tl.to({}, {duration:0.42})`（等弹道飞行）。若 dwell/`casting` 互斥与这几个用例的点击节奏冲突，可能提前 return。但中毒/召唤根本不产生 skill-damage，不该受这条影响——除非是 `castPlayerSkill` 的 `casting` 标志或 `beforeEach` 后的新增测试（见下）干扰了状态。

**新增可疑点**：`tests/e2e/skills.spec.ts` 里出现了一个我没主动写、也没核实过的测试
`test('gem explosion audio A/B buttons switch…')`，以及 `beforeEach` 后有多余空行。**这说明工作区可能被别的改动/别的对话动过**。接手请先 `git diff tests/e2e/skills.spec.ts` 看清全貌，别假设测试文件就是我描述的样子。

**建议定位步骤**：
1. 停掉所有手动 dev server。
2. `npm run dev`，手动打开 `http://localhost:5173/skills-test.html`。
3. 拖「中毒(队首)」到我方 0 号卡 → 短按释放。看事件日志。
4. 在控制台 `app.getEngine().getState().teams[0].characters[0].skillId` 确认技能是否真的换上了（区分假设1 vs 假设2）。
   - 若 skillId 还是 `none`/旧值 → 拖拽 assign 的问题（看 SkillTestPage 的拖拽处理是否被表现层改动影响）。
   - 若 skillId 正确但仍只发 skill-cast → 深入 `TurnEngine.castSkill`（虽然没改过，但要确认）。

**保底方案**：若一时难定位，`git stash` 或手动回退本轮表现层改动到「11 全绿」基线，再**单独**重做一项、跑一次 e2e，逐项加回，避免多个改动纠缠。

## 四、改动清单（本轮碰过的文件）

- `src/render/AnimationConfig.ts`
  - `frameFX` 表：新增 `water_bolt / fire_burst / energy_burst / hit_red / hit_blue / hit_green / hit_gold / hit_purple / hit_brown / hit_spark`（各含 frames/frameW/frameH/displayH/duration）。
  - `projectile`（弹道：speed/minDuration/maxDuration/coreR/bladeLen/bladeThick）
  - `hitBurst`（程序化命中迸溅：duration/rays/rayLen/ringR）——**现在只作为帧动画命中的点缀叠加**。
- `src/render/App.ts`
  - import 各 strip；`FRAME_FX_URL`（name→url 注册表）；`FRAME_FX_FILTER`（name→默认 CSS filter，目前只有 `hit_green` 的 hue-rotate）；`frameFXKeyframes`（每条 strip 各注入一次 steps 关键帧）。
  - `playFrameFX(name, px, py, {scale,filter,rotateDeg,delay})`：通用横向 strip 逐帧播放（CSS `steps()`），支持缩放/旋转/错峰/默认滤镜。
  - `playProjectile(from,to,color,onArrive)`：程序化直线剑气弹道。
  - `playHitBurst(px,py,color)`：程序化迸溅（放射尖线+亮核+速度环，跟色）。
  - `casterColor / skillFxColor / skillHitFx`：施法者首色 → CSS 色 / 命中帧动画名。
  - `cardCenterInOverlay / cellsCenterInOverlay`：坐标换算到覆盖层。
  - `onBattleEvent` 的 `skill-damage`：先飞弹道→到达后播 `skillHitFx` 帧动画 + `playHitBurst` + `hit` 音效；`gem-explode`：每颗 cell 放一团 `energy_burst`（错峰+随机旋转）。
  - **删除**：`BoardColorPicker` 字段/import（选色已改为"点选一枚宝石取其色"，复用 `cellPicker`）。
- `src/render/EventStreamPlayer.ts`
  - `appendGemExplode`：移除每颗的 `shockwave`/重 burst，改为派发事件给 App（中心序列帧唱主角）+ 宝石本体缩没。
  - `appendSkillDamage`：dwell 从 0.14s 加到 **0.42s**（等弹道）。← 回归排查重点之一。
- `src/render/AudioManager.ts`：`skill` 改 whoosh；新增 `whoosh`/`hit`。
- `src/engine/skills/effects/gems.ts` / `cellChooser.ts` / `TurnEngine.ts` / `builders.ts` / `context.ts`：**这是更早一轮**「选行/列改为复用选宝石器」的改动（chosenLine 以 ctx.chosenCell 为起点），与本 FX 线无关但也在未提交状态里。
- `tests/e2e/skills.spec.ts`：更新了定色摧毁测试为"点选宝石取色"；**另有来源不明的 audio A/B 测试**（见第三节）。
- `scripts/build_fx_strip.ps1`：把「特效500个【png】」逐帧序列帧拼成横向 strip 的工具（见第五节）。

## 五、素材与拼图工具

- 源：`D:\迅雷下载\特效500个【png】\特效500个【png】\<编号>\<编号>_NN.png`（逐帧渲染好的序列帧，能直接用）。
- 另有 spine 源工程 `D:\迅雷下载\特效500个【spine】\...`（.skel/.atlas + `0\eff` 部件帧），要接需 pixi-spine，**本轮没碰**。
- 打标 CSV：`data/spine_effect_rework_0001_0240.csv`（分批），含元素/形态/主辅色/适用技能关键词，是**选型索引**。绿色系几乎都是自然/花瓣/烟花/风，没有干净的"绿色命中爆点"。
- 拼图脚本（PowerShell + .NET System.Drawing，无需 Pillow）：
  ```
  powershell -ExecutionPolicy Bypass -File scripts/build_fx_strip.ps1 `
    -SrcRoot "D:\迅雷下载\特效500个【png】\特效500个【png】" `
    -Id 0128 -Name hit_spark -FrameH 200 -MaxFrames 14
  ```
  行为：均匀抽帧到 MaxFrames → 联合非透明包围盒统一裁剪 → 等高缩放 → 横向拼 strip → 输出 `src/assets/fx/<Name>_strip.png`，打印 `META frames/frameW/frameH/stripW`。
- 已生成 strip（`src/assets/fx/`）：`water_bolt`(0002,21f) `fire_burst`(0121,30f,大招备用) `energy_burst`(0046,12f) `hit_spark`(0128,14f) `hit_gold`(0145,11f) `hit_purple`(0207,11f) `hit_brown`(0212,12f)。`hit_green` 已删（改用 water_bolt+hue-rotate）。

## 六、当前色相/映射事实（避免重复踩坑）

- `water_bolt` 主色相 ≈ **203°**（青蓝，单一色调，适合 hue-rotate 变色）。
- `energy_burst` 是钴蓝紫**多色**，hue-rotate 不可控（白核不变、各色相各转），别用它做变色底。
- 绿色目标色相 ≈ 130°，`water_bolt`(203°) → `hue-rotate(-73deg)`。**正角会转到红/品红，务必负角。**
- 颜色枚举：`BaseColor` = Red/Green/Blue/Yellow/Purple/Brown。测试页角色 0=红、1=蓝、2=绿（`COLOR_SETS` 首色）。

## 七、怎么跑 / 验证基线

- `npm run dev` → `http://localhost:5173/skills-test.html`（端口占用会换 5174）。测试页：拖技能标签到我方卡换技能、点「充满法力」、短按卡释放。
- **验证四件套**（改完必须都绿）：`npx tsc --noEmit` / `npx vite build` / `npx vitest run` / `npx playwright test`。
- 当前：tsc ✅、build ✅、vitest ✅（此前）、**playwright ❌ 3 失败**（见第三节）。
- 跑 e2e 前先停掉手动 dev server；用 `--retries=0 --workers=1` 看确定性结果。

## 八、给新对话的开场建议

> "读 skill-authoring 的 HANDOFF-FX.md，先按第三节定位 e2e 的 3 个失败（中毒/召唤/选敌伤害卡在 skill-cast）。先确认是拖拽换技能没生效还是引擎没产出效果，别急着改特效。"
