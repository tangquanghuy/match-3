# 线上玩家存档只读查询

部署后访问 `https://match.rown.dpdns.org/admin`，输入管理员查询令牌，按昵称（支持片段）或 `player_id` 搜索，点选账号查看实际已持久化的存档。页面显示账号与存档时间、主角等级、货币、系统邮件投递/附件领取状态；另外显示账号登录与 PvP D1 写入监控；展开可查看完整原始存档 JSON，并可下载当前查询结果。点击「刷新当前存档」可重新读取。

- 后端：`GET /api/admin/player/:player_id` 从对应 Durable Object 的 SQLite `records` 直接读取当前持久化存档；**不调用**玩家 `load`/`command`，因此查询本身不投递邮件、不作废战斗、不发奖励、不创建新档。
- 登录：后台 API 只接受 `Authorization: Bearer <ADMIN_READ_TOKEN>`，令牌必须至少 32 字符；令牌未配置则 API 关闭。页面不保存令牌到 cookie、URL、localStorage 或 sessionStorage，刷新页面后重新输入。强制 HTTPS、不要转发令牌。
- 秘钥由 Cloudflare Workers secret `ADMIN_READ_TOKEN` 配置；本机备份在已忽略的 `worker/.admin-read-token`，**不要提交**到 Git 或写进 `wrangler.jsonc`。需要轮换时生成新随机值，运行：

```powershell
cd worker
Get-Content -Raw .admin-read-token | npx wrangler secret put ADMIN_READ_TOKEN
```

`worker/.admin-read-token` 不随项目代码同步；换电脑时应按需安全传递令牌或轮换。后台没有修改存档/发奖接口。用户改名不会影响按 `player_id` 查询。

## 写入概览口径

- 后台概览通过 `GET /api/admin/overview`（同一管理员 Bearer 令牌）读取账号总数、最近 24 小时内最后登录的账号数、近 24 个整点小时桶内发生 PvP D1 写入的玩家数 / 次数 / 估算字节数，列出写入排行前 50 人与最近登录前 20 人。
- 点击排行或搜索的玩家，`GET /api/admin/writes/:player_id` 展示该玩家最多 24 个小时桶的写入次数、估算字节数及镜像 / 防守 / 周榜 / 快照来源。数据来自 `player_write_hourly`、`player_writes_24h`，仅执行 SELECT。
- 这些写入统计仅覆盖指定 PvP D1 表；不会统计全部 HTTP 流量、游戏在线人数、在线时长或 Durable Object 存档写入。账号的 `last_login_at` 仅更新于登录，不能代表实际游戏活跃度。
