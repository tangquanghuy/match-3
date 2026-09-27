# GOW 民间配队参考快照

此目录是只读研究资料，不直接作为运行时自动配队池。原文件、论坛出处、表名、行号和校验值均保留。

## 已下载

| 文件 | 原表 | 本次快照 |
| --- | --- | --- |
| `team-share.xlsx` | Terriblerperson / GoW Team Share | Teams 115 行配队；Team Submissions 45 行提交 |
| `delve-teams.xlsx` | Selected Delve Teams 论坛关联表 | Delve Teams 57 行配队 |

合计 **217 行参考记录**，包含提交表与主表之间的重复项；不是 217 套独立强队。

- 原文件下载 URL、字节数、SHA-256、实际下载 UTC 时间：`manifest.json`。
- 原始出处：`forum-64722.json`（主帖 2020-07-13，Terriblerperson）、`forum-51929.json`（主帖 2019-02-10，Starlite）。论坛帖作者与表内每行配队作者分别保留，不混为一谈。
- XLSX 对应资料页：
  - https://community.gemsofwar.com/t/64722
  - https://community.gemsofwar.com/t/51929
- `*-teams.csv` / `*-submissions.csv`：可直接用 Excel 查看，第一列是原始行号。
- 对应 JSON：原始非空单元格与行号。
- `lineups.json`：四槽、职业、旗帜、原始队伍代码、标签、备注、来源作者、日期与表内位置。原表没有给出的作者/日期留空，不把论坛发布日期当作每队组建日期。

这些表是历史社区资料，不是 2026 年实时强度排名。Delve 的层数记录不是 PvP 的难度或胜率依据。表内公式仅提取缓存值，脚本不执行公式、宏或链接。

## 更新与离线重建

```powershell
python scripts/sync_gow_community_teams.py
python scripts/sync_gow_community_teams.py --offline
```

在线更新会覆盖此目录下对应的参考快照与导出；离线只从已保存 XLSX 重建导出。运行时使用的是独立人工复核表 `src/meta/data/communityDefenses.ts`，更新资料不会自动改变对手。更新后应重新核对被引用行号、兵种 ID 和测试快照计数。

## 本次采用

以下 9 行进入社区参考阵容子池（每周 29 名 NPC 仅 2 名从此子池选取，其余按稀有度随机组队）：

`GoW Team Share / Teams`：**13、35、37、43、63、64、73、78、87**。

- 四槽和站位逐一核对本项目 `referenceName` 与 ID，重复兵种保留。
- 原行职业均为 None，且四槽全为本项目部队。仅凭职业为 None 不足以自动判定纯部队队，例如原表第 98 行仍有武器，因此没有自动全表入池。
- 原旗帜名称保留在参考 JSON；实际对手选用项目已有王国旗帜，标注“原四槽 / 旗帜适配”，没有声称整套账号加成完全一致。
- 英雄、武器、职业相关队伍仍完整存档，暂不通过随意替换英雄的方式装成原版队伍。
- 竞技场不使用这些预组强队。

实现与边界见 `docs/GOW-INVASION-TIERS.md`。
