# match-3

三消战斗与元游戏原型。运行时代码在 `src/`，可复现的游戏资源在 `game-assets/bundled/`，Cloudflare Worker 在 `worker/`。

## 常用入口

- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：类型检查并构建全部页面。
- `npm test`：运行 Vitest 单元测试。
- `npm run test:e2e`：运行 Playwright 回归。
- `game.html`：完整游戏外壳；`index.html`：独立战斗页；`skills-test.html`：技能测试台。

## 文档与任务

- [酒馆接入交接文档](docs/handoff/README.md)：原始需求、95 条用户逐轮原话及截图、澄清过程、文件说明、现状与最终验收目标。
- [当前执行状态](tasks/active/STATUS.md)：SillyTavern 三消战斗接入与养成；ST-04～ST-09 仍在推进，整版尚未验收。
- `tasks/active/`：当前执行任务书。
- `tasks/reference/`：已退出执行的历史任务书，仅供追溯。
- `docs/`：仍对实现有帮助的设计、发布记录和运行规范。
- `docs/archive/`：已归档的总计划与并行协作台账。
- `docs/battle-settlement-rewards.md`：战斗结算奖励必须展示真实入账明细的规范。
- `.kiro/specs/combat-mechanics/`：战斗语义和规则源，代码与测试仍会读取其中内容。

本地构建产物、截图、临时工作树和一次性审计输出不纳入版本库；需要保留的长期回归资料放在 `artifacts/private-backups/`。
