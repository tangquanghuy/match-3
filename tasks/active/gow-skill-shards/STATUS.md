# GoW 技能验收：分片实时状态

> 最近刷新 2026-09-27T17:27:53.871Z。账本与全量凭证指纹一致。
原版实体 **87 / 2518 整项签收**；2431 待签收。 固定 504 片（5 项／片，末片可不足）；0 片已认领；8 片人工核对完毕；7 片待修；5 片已全部签收。

本表的「人工核对完毕」与「整项签收」严格分开；签收数字属于最近一次账本／测试凭证快照，源码或证据变更后由协调窗口重跑全量验证。全部分片及逐实体键见 [STATUS.json](STATUS.json)；未完成分片为 `TASK-Sxxxx.md`，整片签收后为 `DONE-Sxxxx.md`。

## 窗口进度

| 窗口 | 已认领片 | 分配实体 | 人工核对完毕片 | 整项签收 |
|---|---:|---:|---:|---:|
| worker-fast-01 | 0 | 20 | 3 | 7 |
| worker-fast-02 | 0 | 20 | 3 | 8 |
| worker-fast-03 | 0 | 20 | 0 | 6 |
| worker-fast-04 | 0 | 20 | 2 | 11 |

## 已认领／处理中／待修／已签收片（最多显示 50 片）

| 分片 | 负责人 | 工单状态 | 整项签收 | 实体键 |
|---|---|---|---:|---|
| [S0001](TASK-S0001.md) | — | reviewed | 4/5 | troop:6169、troop:6178、troop:6614、troop:6615、troop:6616 |
| [S0002](TASK-S0002.md) | — | needs-repair | 3/5 | troop:6617、troop:6618、troop:6619、troop:7030、troop:7092 |
| [S0003](TASK-S0003.md) | — | reviewed | 4/5 | troop:7135、troop:7151、troop:7159、troop:7160、troop:7161 |
| [S0004](TASK-S0004.md) | — | needs-repair | 4/5 | troop:7163、troop:7164、troop:7276、troop:7306、troop:7328 |
| [S0005](TASK-S0005.md) | — | needs-repair | 2/5 | troop:7335、troop:7337、troop:7386、troop:7505、troop:7606 |
| [S0006](TASK-S0006.md) | — | needs-repair | 4/5 | weapon:1000、weapon:1001、weapon:1002、weapon:1003、weapon:1004 |
| [S0007](TASK-S0007.md) | — | reviewed | 0/5 | weapon:1005、weapon:1006、weapon:1007、weapon:1009、weapon:1015 |
| [S0008](TASK-S0008.md) | — | reviewed | 4/5 | weapon:1016、weapon:1017、weapon:1018、weapon:1019、weapon:1020 |
| [S0009](TASK-S0009.md) | — | reviewed | 0/5 | weapon:1021、weapon:1022、weapon:1024、weapon:1025、weapon:1026 |
| [S0010](TASK-S0010.md) | — | reviewed | 0/5 | weapon:1027、weapon:1029、weapon:1030、weapon:1031、weapon:1032 |
| [S0011](TASK-S0011.md) | — | reviewed | 0/5 | weapon:1033、weapon:1034、weapon:1041、weapon:1042、weapon:1045 |
| [S0012](TASK-S0012.md) | — | reviewed | 0/5 | weapon:1046、weapon:1047、weapon:1048、weapon:1050、weapon:1052 |
| [S0013](TASK-S0013.md) | — | needs-repair | 0/5 | weapon:1056、weapon:1064、weapon:1070、weapon:1076、weapon:1082 |
| [S0014](TASK-S0014.md) | — | needs-repair | 0/5 | weapon:1093、weapon:1139、weapon:1166、weapon:1526、weapon:1625 |
| [S0015](TASK-S0015.md) | — | needs-repair | 2/5 | troop:6030、troop:6057、troop:6101、troop:6117、troop:6189 |
| [S0016](DONE-S0016.md) | — | accepted | 5/5 | troop:6255、troop:6306、troop:6370、troop:6373、troop:6548 |
| [S0501](DONE-S0501.md) | — | accepted | 5/5 | troop:6001、troop:6009、troop:6016、troop:6026、troop:6027 |
| [S0502](DONE-S0502.md) | — | accepted | 5/5 | troop:6029、troop:6074、troop:6085、troop:6098、troop:6105 |
| [S0503](DONE-S0503.md) | — | accepted | 5/5 | troop:7446、weapon:1008、weapon:1010、weapon:1011、weapon:1012 |
| [S0504](DONE-S0504.md) | — | accepted | 3/3 | weapon:1014、weapon:1023、weapon:1043 |

其他未认领片：484；用 `node scripts/gow-review-shards.mjs status` 单次刷新，或 `node scripts/gow-review-shards.mjs watch --interval 5` 每 5 秒刷新。
