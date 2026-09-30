# 关卡通关状态与存档序号同步排查（2026-09-30）

## 结论

复现一条确实会造成「打赢后仍未通关」的路径：客户端存档序号（revision，不是程序发布版本）落后时，出战命令返回的新战斗票被存档同步误当成页面刷新而作废。该问题不是单纯的关卡样式显示错误。尚未核对具体线上账号，因此不把所有历史反馈都归因于这一条路径。

## 复现链路

1. 两个 CommandGateway 共用同一真实 LocalTransport / MetaHost（模拟同一玩家的权威 Actor）。
2. 第二客户端修改探索难度，第一客户端保留旧 revision。
3. 第一客户端请求普通 / 困难 / 非常困难战斗，服务端创建 pendingBattle 并签票。
4. 旧实现发现回执 patch.from 与客户端 revision 不一致，调用默认 load()。
5. 默认 load() 按防刷新规则执行 forfeitPendingBattle，新票被清除，但出战函数仍返回成功票据。
6. 胜利结算被拒绝，关卡进度没有写入，界面继续显示未通关。

另用延迟真实命令回执的夹具复现同一类情况：选择关卡响应晚于出战响应，使客户端触发同步。

红灯证据：`artifacts/quest-progress-repro.log`，三种难度都在新票应保留的断言上失败。

## 修复

- 将默认页面载入与命令内部快照同步分开；后者显式传 `preservePendingBattle: true`。
- HTTP 使用同一鉴权端点 `/api/meta/save?sync=1`，由 Worker 转发到玩家 Actor。默认 `/save` 行为保持原样。
- 已被新快照覆盖的旧命令回执直接忽略；较早发起、较晚返回的快照不覆盖更高 revision，避免显示进度倒退。
- 正常刷新仍放弃未结算战斗；重新出战作废旧票、重复结算不重复领奖的规则不变。
- 核对重置/导入存档：服务端仍沿用递增 revision，不依赖把版本号归零。

## 验证范围

新增单测 `tests/unit/questProgressSync.test.ts`（7 项）：三种难度的存档序号落后、成功结算、重新载入已落盘存档；重复结算；默认刷新与只读同步区别；旧命令回执与旧快照晚到；HTTP 同步 URL 与凭据。

新增浏览器测试 `tests/e2e/questProgressSync.spec.ts`（3 项）：在真实页面网关中制造存档序号差，经真实签票和结算后，检查关卡完成样式、可访问标签、首通奖励文字，以及刷新后的持久性；未打的相邻关卡仍未通关。这里注入协议层胜利结果，不声称自动操作了完整战斗，也未验证线上 Discord 重新登录。

## 边界

- 困难和非常困难通关后仍允许再次出战，这是重复刷关功能，不代表未通关；应看节点完成标记和「首通已完成」。
- 老存档仅有 exploreTier 而缺少 clearedExploreTiers 时，所选难度不等于历史胜利证据，维持不推断补通关的规则。
- 这次修改不会自动补回过去结算失败的关卡，也不操作线上玩家存档。
- 战斗结算传输异常及重试策略不在本次修改范围；不声称所有断网丢结算问题都已解决。
- 本次按排查请求在本地修复，未提交、未部署。

## 测试结果

- 定向单测：5 文件 / 49 项通过。
- 关卡浏览器回归：2 文件 / 11 项通过（新增 3 项，既有 8 项）。
- 全量单测：448 文件 / 16411 项通过。
- 客户端与 Worker TypeScript、应用源码/测试 ESLint（零警告）、远端客户端和 Worker 构建通过。


## 通信复核：没有更新程序也能触发（2026-09-30）

### 修正之前的表述

“客户端版本落后，服务端丢弃战斗”并不准确。应区分：

| 字段 / 概念 | 含义 | 与这条故障链的关系 |
| --- | --- | --- |
| 程序发布版本 | 部署的客户端 / Worker 代码 | 没有生产事故证据显示发布版本不一致 |
| `META_SAVE_VERSION = 4` | 存档结构版本 | 不随每次操作增长 |
| `RULESET_VERSION = '1.1.0'` | 战斗规则版本 | 结算有单独的不一致校验，并非本次复现原因 |
| `save.revision` | 权威存档成功提交命令的递增序号 | 客户端根据它判断增量回执能否接上 |

HTTP 命令请求只有 `{ type, args }`，没有客户端 revision / 发布版本字段。服务端不是看到“旧客户端版本”就放弃战斗。旧网关遇到 patch 序号差后主动请求默认 `/save`，而该接口带有页面刷新时放弃战斗的副作用。

### 单账号、单客户端、同一份代码的复现

`tests/unit/metaHttpRevision.test.ts` 使用真实 HttpTransport、JSON 回包和真实权威 MetaHost，仅以可控 fetch 调度响应先后，不涉及生产账号：

1. 客户端 / 服务端同为 N。
2. 选择难度提交成功，服务端变为 N+1，但回包被延迟。
3. 出战提交成功，服务端变为 N+2，先收到的签票回包携带 N+1→N+2。
4. 客户端仍为 N，触发快照同步。
5. 旧路径调用默认 `/save`，清空刚签出的 pendingBattle；后续结算报“没有待结算的战斗”。
6. 新路径 `/save?sync=1` 保留原票；迟到回包不回退快照，最终结算成功。

另覆盖权威提交后响应丢失、正常串行操作、显式恢复同步，以及直接重演旧读取行为导致结算失败。正常串行且回包成功时不会产生上述差异；慢网本身不等于一定丢战斗。

### 独立缺陷：连点出战覆盖票据

旧启动器先调用 `plan*Battle()` 创建 Promise / 发请求，再在 `run()` 检查 running。慢网下连点可能先后签出 A、B 两张票，第二次 plan 按现有规则作废 A，但 UI 防重只显示 A，因此结算时与权威票据不一致。

`tests/unit/battleLaunchAdmission.test.ts` 在修复前 4 项中 3 项失败，日志 `artifacts/battle-launch-admission-red.log`。它使用真实启动器、网关和权威核心，只替换渲染层，并校验可见战斗的票能完成结算，而非仅断言渲染次数。

修复将防重锁提前到任何难度保存 / 签票请求之前，所有出战入口改为延迟调用请求。请求失败后释放锁，允许后续重试；已有战斗期间不再额外签票。

浏览器回归新增延迟签票回执后真实按钮连点，要求只发一条 plan、实际进入战斗并通过放弃本局完成权威结算。

### 恢复调用点复核

新增明确的 `gateway.sync()`，保留战斗票并阻止旧快照回退。命令回执序号差、新手馈赠响应丢失后的恢复、角色重复创建后的恢复都使用它。`gateway.load()` 仅保留页面启动的既有行为。

### 证据边界

- 本次 HTTP 复现是本地协议集成测试，不是线上 Worker / Cloudflare 网络抓包。
- 以上证明代码缺陷及触发条件，不证明玩家那一次历史事故必然由其中某条造成。
- 当前缺少那一局 requestId、请求时间线与服务端日志，不把原因定为域名、Cloudflare 或程序发布不同步。
- 结算时网络异常后的持久化重试仍是独立风险；本次不宣称所有丢结算场景已修复。
- 未操作生产存档，未提交或部署。


### 本轮验证记录（本机时间 2026-10-01）

- 通信专项：3 文件 / 16 项通过，`artifacts/meta-communication-focused-final.log`。
- 浏览器：关卡同步与战斗设置共 10 项通过，`artifacts/meta-communication-e2e-serial.log`，单 worker、60 秒单项上限。新增连点用例最初使用已通关演示存档而未发出请求，修正为本地可出战存档后通过；并行的既有横屏设置用例出现一次 30 秒等待超时，串行重跑通过，未修改该用例断言。
- 客户端 / 测试 TypeScript 与 Worker TypeScript 通过，日志 `artifacts/meta-communication-tsc-final.log`、`artifacts/meta-communication-worker-tsc.log`。
- `eslint src tests worker/src --ext .ts --max-warnings 0` 通过，`artifacts/meta-communication-source-lint.log`。
- **不把这称为全仓 ESLint 零错误**：额外运行 `eslint . --ext .ts --max-warnings 0` 扫入 `artifacts/`、`tmp/lanes/pristine/` 的旧诊断产物 / 代码副本，以及既有 `scripts/gow-trace.ts`（8 处 explicit-any），共报 70 errors / 9 warnings。未为了本次通信修复改写无关历史脚本。原始日志 `artifacts/meta-communication-lint.log`。

- 全量单测：452 文件 / 16426 项通过，139.64 秒，`artifacts/meta-communication-unit-full.log`。
- 远端模式客户端与 Worker 生产构建通过（仅构建，未部署），`artifacts/meta-communication-build.log`。
- `git diff --check` 通过；所有修复仍保留在工作区，未提交。


## 后续发布记录

上述状态为修复时记录；合并回归和最终发布状态见 `release-arena-tribute-2026-10-01.md`。
