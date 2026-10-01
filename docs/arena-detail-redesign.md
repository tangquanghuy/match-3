# 竞技场选人 / 独立部队详情（2026-10-01）

## 界面

- 主页面：三张候选立绘卡、图鉴同款攻击/护甲/生命/魔力图标、独立“查看详情”入口；桌面底部横排本届阵容和确认按钮。
- 移除候选长技能、右侧嵌入完整详情和原生详情弹窗。PC 选人阶段收掉重复标题/报名票价区，保留三步进度。
- 候选、已选队员、编队中的“详情”统一进入 `#arena/detail/<troopId>`，完整显示立绘、四维、法力、技能及本场规则；支持同轮候选/本届阵容切换。
- 长技能自然撑开详情内容并纵向滚动，不设裁切高度。移动端沿用次级页，选人卡横向滑动。

## 状态与边界

- 查看详情只读，不选牌、不写存档、不触发网关请求。
- 未确认选择保存为 sessionStorage UI 状态，用 draft seed 和已选列表校验，再校验候选ID；详情返回、刷新和浏览器后退均保留。轮次变化自动失效。
- 返回恢复来源按钮键盘焦点；失效详情链接提供返回入口，不展示本届范围之外的卡。
- 选牌请求防重，等待确认时阻止更换选择或通过详情入口离开；网络异常只读同步，不自动重发选牌。
- 报名费、选牌池、15级/无特质规则、站位协议、战斗启动和结算逻辑不变。
- 使用既有立绘与图标，无新增图片资源。原生dialog专用的 termTip 挂载点调整已撤回。

## 验证

- `npx vitest run tests/unit/arenaPresentation.test.ts tests/unit/metaArena.test.ts tests/unit/arenaReorder.test.ts`：24通过。
- `npx playwright test --config artifacts/chest-hunt.playwright.config.ts arenaUx.spec.ts arenaReorder.spec.ts arenaRedesign.spec.ts --grep-invert '荣耀钥匙'`：22通过。
  - 1600×900、1366×768、768×1024、390×844、320×568、844×390。
  - PC 确认按钮及已选阵容首屏不被底栏盖住；真实查看截图。
  - 返回/刷新保留选择、只读详情、术语浮层清理、失效链接、超长技能滚动、慢选牌防重、换位持久化及并发。
  - 排除同文件中与本次竞技场界面无关的“荣耀钥匙”宝箱测试；此前该测试存在随机奖励荣耀与固定零余额断言冲突，未修改其断言或业务逻辑。
- `npx tsc --noEmit`、目标TS文件 ESLint、remote Vite生产构建通过。
- 截图：`artifacts/arena-redesign/roster-{width}.png` 与 `detail-{width}.png`。
- 测试/构建日志：`artifacts/arena-subpage-*.log`。本轮未提交、未部署。
