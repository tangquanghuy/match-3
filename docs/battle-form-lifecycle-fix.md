# 移动端死亡队伍布局与转化显示修复（2026-10-01）

## 根因与修复

### 死亡后的整排偏移
`TeamView.removeCharacterCards` 为退场卡补充空槽，原卡则作为绝对定位节点保留到淡出结束。旧的横排布局统计所有 `.gcard` DOM，导致死亡卡与新空槽被重复计入行宽；淡出完成后又没有更新锚点，造成整排持续向左偏移。

修复：行宽只统计存活卡注册表与空槽，FLIP/重排也只处理存活卡。退场节点继续在原位置淡出但不参与布局。有空槽时，移至队尾与洗牌均放在空槽前，避免活卡被排到空槽后。

### 转化后仍显示旧技能
通用转化原语原本已经替换 `skillId`，引擎下一次施法使用新的技能原型。遗漏的是 `spellName`、`spellDescription`、`traitNames`、`displayTraitIds` 等显示元数据；即使清空这些字段，App 还可能从相同战斗 ID 对应的开场快照补回旧文案。

修复：
- 部队角色与召唤模板补齐技能/特质显示元数据。
- 转化完整替换这些字段，模板缺省时明确清空；复制形态使用独立的特质字典与展示数组。
- App 只有在名称与显式技能 ID 都仍匹配当前形态时才使用开场快照作为显示兜底。
- 保留战斗 ID、编队位置与宿主结算映射，不修改持久化身份。

## 回归覆盖
- 单测：普通/竞技场转化、满法力、缺省元数据清理、复制形态隔离、开场快照匹配，以及幼龙真实施法→转化→释放新龙族技能（验证实际新技能效果）。
- 浏览器：360×800、390×844、412×915、1440×900，上下/左右两队的单死、批量死亡、退场重叠、召唤、位移、洗牌、全灭后再召唤。
- 真实伤害/死亡事件经播放器完整演出后检查两队锚点。
- 详情打开期间播放转化，检查技能标题/描述刷新与旧快照隔离。
- 截图：`artifacts/battle-form/`。

本轮不提交、不部署。

## 验证结果
- 新增转化单测 + 技能绑定/部队验收定向回归：20项通过。
- `battleFormLifecycle` / `battleResponsiveness` / `battleUx`：18项浏览器回归通过；手机与PC截图已目视检查。
- `tsc --noEmit`、本轮文件定向ESLint、remote生产构建通过（构建输出隔离至 `artifacts/battle-form-build`）。
- 全量Vitest：470文件，16,701项通过、1项失败。失败项是另一窗口正在修改的 `metaTraitIcon`「辞旧」图标断言；其实现落盘后单独复测该文件8项全部通过。本轮没有修改该图标实现或断言，也没有把首次全量执行记为全绿。
- 裸 `npm run lint`：70 errors / 11 warnings，位于既有审计脚本（`artifacts`、`scripts/gow-trace.ts`）及 `tmp/lanes/pristine` 旧副本；本轮没有调整规则或覆盖其他窗口文件。详细日志 `artifacts/battle-form-full-lint.log`。
- 相关日志：`artifacts/battle-form-{unit,full-unit,trait-icon-recheck,e2e,tsc,lint,source-lint,build}.log`。
