# 线上领取馈赠耗时排查 — 2026-09-30

> 本文保留部署暂停期间的排查现场与当时验证状态。用户随后恢复全量回归、提交与部署；后续验收见 `docs/release-2026-09-30.md`。

## 范围与当前结论

本轮只查询 Cloudflare 线上指标、进行未登录网络基线请求与阅读代码；没有部署、修改玩家存档、领取真实奖励或重置账号。此前全量回归保持停止。

**现有证据优先指向客户端网络/建连/请求排队方向，而不是已经观察到的存档服务执行长停顿。用户反馈的单次 5～6 秒还未与一条完整请求链对应，结论仍属排查方向，尚非根因定案。**

## 实测证据

### 1. 线上 Worker 与玩家 Durable Object

主要窗口：2026-09-29 19:25:41 至 2026-09-30 19:25:41（香港时间，UTC+8）。

查询 Cloudflare GraphQL `workersInvocationsAdaptive` 与 `durableObjectsInvocationsAdaptiveGroups`，限定 `scriptName = gems-meta`。通过 GraphQL introspection 核实 `wallTime`、`cpuTime` 与相应分位数单位为**微秒**，下表已经换算为毫秒。

| 指标 | 结果 |
| --- | --- |
| Worker 聚合请求数 | 508 |
| Worker 观测最高 wall time | 1053.130ms |
| Worker 聚合错误数 | 0 |
| 玩家 DO 聚合 RPC 请求数 | 62 |
| 玩家 DO wall time P50 / P95 / P99 | 155.028 / 237.351 / 254.223ms |
| 玩家 DO 观测最高 wall time | 254.223ms |
| 玩家 DO CPU P50 / P99 | 3.594 / 24.029ms |
| 玩家 DO 聚合错误数 | 0 |
| 玩家 DO 观测执行节点 | DEN |

后续采样校验窗口截至 2026-09-30T11:27:24Z（UTC），Worker 聚合请求数 516，平均采样间隔约 1.167；DO 分钟分组存在 1.286 的平均采样间隔，其余所见分组为 1。请求数为分析系统聚合口径，最高值为**被观测样本的最大值**，不是逐请求全量审计。

重要边界：
- DO wall time 包含该次调用的执行和等待，并非 SQL 写入单独计时。
- 这些指标没有命令名称、完整客户端耗时，也未与用户反馈的那次 `claimGift` 一一关联。
- Worker 指标包括其它路由；不把所有 Worker 请求当成领取奖励。
- 现有样本没有出现 5～6 秒 DO 执行，仍应保留采样遗漏、链路外等待及客户端排队等可能性。

### 2. 不访问存档的网络基线

本机连续请求线上 `GET /api/meta/save`，不携带会话 Cookie，全部返回预期的 401。鉴权提前返回，所以这些请求**没有调用玩家 DO 或 D1**。

首次连接：
- DNS：419ms。
- TCP 建连：约 235ms（累计 connect 减 DNS）。
- TLS：约 480ms（累计 appconnect 减 connect）。
- 请求就绪至首字节：约 806ms；这一段混合了网络往返和边缘服务处理，未进一步分解。
- 总耗时：1940ms。

复用同一连接的后续 7 次请求总耗时：247～251ms。该批次 CF-Ray 的节点后缀均为 LHR。

这证明**不涉及存档的路径也存在明显网络/建连开销**。本机探测路径不是用户浏览器的请求时间线；LHR 与 DO 的 DEN 位置也只代表所见样本，单凭节点位置不推定用户实际路由。

### 3. 获取精细请求信息的限制

- Workers observability telemetry query API 返回 403；当前登录凭据可查询 GraphQL 聚合指标，但该接口访问未获通过。
- Zone 级按路径的 TTFB 查询返回字段访问限制。
- 临时 live tail 的 WebSocket 连接报错，未取得事件；临时 tail 订阅已经清理（HTTP 200）。
- 没有输出或落盘令牌、Cookie、请求正文或玩家存档。

## 代码链路核对

正常领取链路：

`点击领取 → POST /api/meta/command → Worker 本地会话签名校验 → 玩家 DO.execute → 串行队列 → runCommand → 增量 records SQLite 事务写入 → 响应 → 客户端应用补丁 → 刷新新手引导`

- `worker/src/index.ts`：领取馈赠不走 Discord API，也不做创建角色时的 D1 用户名查询。
- `worker/src/playerActor.ts`：玩家存档在 DO 的 SQLite；只写改变的记录，`flushDelayMs = 0`。没有为增加钻石单设一个延迟保存线路。
- `src/meta/server/host.ts`：请求有每玩家串行队列；领取不触发入侵镜像池或排行榜的 D1 副作用。队列、执行与持久化仍值得做逐阶段计时，不把低 CPU 简化等同于低存储耗时。
- `src/meta/gateway/CommandGateway.ts`：如果响应补丁版本与本地存档不同，会再等待一次 `GET /api/meta/save`，因此一次点击可能涉及串行网络往返；目前未观察到用户那次是否触发此分支。
- 已部署版本 `giftsScreen` 在响应完成后刷新；该路径没有 5～6 秒的固定等待计时器。

## 精确定位下一次卡顿需要的证据

1. 同一次点击的浏览器请求时间线：排队/停滞、DNS、TCP/TLS、TTFB、响应下载，以及是否跟随重同步 GET。
2. 以请求时间和关联 ID 对应 Worker / DO 的执行耗时；把客户端等待与服务端等待分开。
3. 若服务端仍出现秒级等待，再加入 queue/load/command/SQL/durability/RPC 的分段计时。新的线上计时改动需在用户恢复部署后执行，不通过悄悄部署诊断代码绕过暂停要求。

本轮未改变权威存档或持久化语义，也未用提前显示到账掩盖延迟。

## 宝石改动与验证

- 连消强度 7 → 5。
- 基础自然抽取：普通骷髅 15%、末日骷髅 4%、至尊末日骷髅 1%；开局合法性、补充候选择优及风暴/活动修正仍会影响最终盘面统计。
- 末日骷髅：匹配每颗 +5 伤害；摧毁按原规则结算 5 伤害；匹配、直接摧毁及连锁摧毁均不引爆周围宝石。
- 至尊末日骷髅：匹配每颗 +10 伤害；摧毁按原规则结算 10 伤害；保留周围一圈爆炸。
- 定向 7 个单测文件 **170/170 通过**，包含新掉率边界/统计、开局合法性、随机数消耗不变、特殊效果和 AI 对战节奏。
- `tsc --noEmit` 通过。
- 引擎和相关测试 ESLint 通过。把 `src/render/App.ts` 纳入检查时，报告 6 处 HEAD 已存在的 `prefer-const`，均在原有动画计时器/补间代码，本轮未改动这些位置。
- 未启动全量回归；未提交、未部署。

## 本机证据文件（artifacts 被 Git 忽略）

- `artifacts/live-latency-24h.json`
- `artifacts/live-latency-sampling.json`
- `artifacts/cf-timing-field-definitions.json`
- `artifacts/live-latency-network.json`
- `artifacts/live-latency-http-routes.json`
- `artifacts/live-latency-tail.json`
- `artifacts/gem-tuning-unit.log`
- `artifacts/gem-tuning-typecheck.log`
- `artifacts/gem-tuning-focused-lint.log`
- `artifacts/gem-tuning-lint.log`
