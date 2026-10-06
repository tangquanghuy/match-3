# 线上玩家存档只读查询

部署后访问 `https://match.rown.dpdns.org/admin`，输入管理员查询令牌，按昵称（支持片段）或 `player_id` 搜索，点选账号查看实际已持久化的存档。页面显示账号与存档时间、主角等级、货币、系统邮件投递/附件领取状态；展开可查看完整原始存档 JSON，并可下载当前查询结果。点击「刷新当前存档」可重新读取。

- 后端：`GET /api/admin/player/:player_id` 从对应 Durable Object 的 SQLite `records` 直接读取当前持久化存档；**不调用**玩家 `load`/`command`，因此查询本身不投递邮件、不作废战斗、不发奖励、不创建新档。
- 登录：后台 API 只接受 `Authorization: Bearer <ADMIN_READ_TOKEN>`，令牌必须至少 32 字符；令牌未配置则 API 关闭。页面不保存令牌到 cookie、URL、localStorage 或 sessionStorage，刷新页面后重新输入。强制 HTTPS、不要转发令牌。
- 秘钥由 Cloudflare Workers secret `ADMIN_READ_TOKEN` 配置；本机备份在已忽略的 `worker/.admin-read-token`，**不要提交**到 Git 或写进 `wrangler.jsonc`。需要轮换时生成新随机值，运行：

```powershell
cd worker
Get-Content -Raw .admin-read-token | npx wrangler secret put ADMIN_READ_TOKEN
```

`worker/.admin-read-token` 不随项目代码同步；换电脑时应按需安全传递令牌或轮换。后台没有修改存档/发奖接口。用户改名不会影响按 `player_id` 查询。
