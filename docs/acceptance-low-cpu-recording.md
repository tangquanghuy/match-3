# 部队演出低 CPU 续录

## 当前策略
- 2026-09-26 09:59（香港时间）切换提速档：CPU 总配额 20% → 40%，worker 1 → 2，每批 4 → 16，冷却 20 秒 → 5 秒；旧批次收尾后保留检查点续录。
- 冻结工作区：`D:\Code\match-3-acceptance-baseline-20260925`。
- 原基线源哈希：`a32448972e1f00bb73b9b4b6cf77f8b791add31120664fddc7a608c7d9970428`。
- 从主项目/演出修复副本逐文件核对 824 个快照文件，恢复了原版的三个 community 源文件；主项目业务代码保持现状。
- 冻结工作区连接原基线的技能/特质证据目录，仅在同一源哈希下续录和重试。修复候选 v2 的录像不混入这组记录。
- `node_modules/public/assets/data` 共享现有资源；冻结的是源码和录制夹具。共享素材更新也应另开证据版本，资源依赖不是逐字节离线镜像。

## CPU 和任务边界
- 通过独立 Windows Job 设置 `CPU_RATE_CONTROL_ENABLE | CPU_RATE_CONTROL_HARD_CAP`，配额 4000/10000，即整机 CPU 调度预算约 40%。不是每个子进程各用 40%。
- 录制控制器、Vite/esbuild、Chromium、ffmpeg 和 ffprobe 属于同一配额；优先级 BelowNormal。
- 2 个 worker；每批最多 16 条；每条关闭上下文完成视频封装，批末关闭浏览器。
- 批次之间冷却 5 秒。整机 CPU >=80% 或空闲内存 <2 GiB 时不启动下一批，连续两次低负载采样后恢复。
- 整机 CPU 数值还包含用户应用等其他进程，40% 配额不代表整机占用保证低于 40%。5 秒观测均值与调度周期配额也不完全等同。
- 录像保持 1× 速度，不裁掉宝石爆炸、连锁结算或尾效。资源受限录制会影响帧间隔和测得耗时，异常项仍须复核；不把限流后的延迟直接认定为技能设计耗时。
- 六种模式专属机制/322 个上下文暂缓；其余 5173 个特质上下文继续在技能阶段后按 2 worker 处理；批末录像校验及报告更新串行执行。

并发录制并非单机独占耗时基准。新记录标记实际 CPU 配额、worker 数和运行目录；完整动作链计时保持不变，耗时异常需无并发复测。配置文件中的 CPU 配额须与包装器参数一致。

## 查看状态
最新运行目录写在：`artifacts/troop-audit/low-cpu-active-run.txt`。
该目录包含：
- `run-config.json` / `process.json`：冻结版本、策略、实际 PID、Job 名称。
- `progress.json`：当前阶段、录制/检查/冷却/等待资源状态和执行计数。
- `cpu-current.json` / `cpu-history.jsonl`：每 5 秒整机与录制进程树的 CPU、子进程数。
- `stdout.log` / `stderr.log`：录制记录与错误。
- `job-membership-check.json`：实际子进程所属配额核查。

旧进度文件和旧 PID 不表示当前正在运行；应同时核实新进度、CPU 心跳和进程。
`completedOrQuarantined` 含重试后隔离的问题项，不等于成功、录像完整或视觉签收。
新批次封装后会校验录像；旧未验证录像发现截断时也进入重录，因此待录数可能回升。

## 控制
在最新运行目录创建名为 `STOP` 的文件：当前批次及检查收尾后停下，保留检查点。不会直接中断正在封装的录像。
再次启动时使用一个新的运行目录并复制经过核实的 `run-config.json`，经隐藏的 PowerShell Job 包装器运行：

```powershell
Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $FrozenWorkspace `
  -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',
    'scripts/windows/run-acceptance-cpu-job.ps1',
    '-Workspace',$FrozenWorkspace,'-RunDirectory',$NewRunDirectory,'-CpuPercent','40')
```

先确认旧包装器/控制器已经退出，避免同时写入证据。
包装器退出时仅清理自身 Job 内的进程，不按名称全局终止浏览器、Node 或用户开发服务。

## 代码
- `scripts/run-low-cpu-troop-acceptance.mjs`：有界并发、分批、冷却、负载门控、断点与版本检查。
- `scripts/windows/AcceptanceCpuJob.cs`：CPU Job、优先级、子进程归属和 CPU 计量。
- `scripts/windows/run-acceptance-cpu-job.ps1`：隐藏后台运行及资源心跳。

本流程恢复的是原基线全量录像，不是修复版本的最终视觉验收。所有逐条视觉复核继续保留 pending，后续整合版本仍需要独立验收。