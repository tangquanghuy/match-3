# Troop retirement: player-save preparation

Date: 2026-10-09. Status: local preflight only; no player save, pool, or mail campaign has been changed.
Target troop IDs: 7446 (Star Lisi) and 7622 (Juy ao).

## Checked

- Read-only backup `artifacts/private-backups/troop-pool-pre-removal-2026-10-08T23-33-53/`: 499 queried, 37 affected saves plus one extra mirror-owner save, and 13 matching mirrors. All 39 backed-up files passed a fresh SHA-256 check. This is NOT a current live snapshot; take incremental backups and check revisions immediately before writes.
- The snapshot contains 16 affected `collection` entries, 26 preset slots, 12 defense-team slots, 4 favorite entries, 47 wishlist slots, 7 pursuit targets, and 10 cached mirror rosters. Counts are historical, not today's live values.
- Compensation planning identified 12 owners of 7446 and 4 owners of 7622, with 3 owners of both: 13 recipients, 16 packages. Re-evaluate against fresh authoritative saves before mailing.
- `prepareTroopRetirement` is a detached, non-deployed candidate-save transformer. It removes IDs from both `collection` and `collectionTruth`, favorites, all saved team presets, the wishlist and pursuit target; it unsets affected 4-slot defense teams and invalidates cached opponent rosters. It preserves unrelated members and their order. Pending battle tickets cause the account to be deferred. No replacement troops are granted.
- Presets with fewer than four members must be rebuilt by their players before battle. A partially emptied defense team is cleared instead of persisted as an invalid four-slot defense.

## Still required before release

1. Integrate this transformer into a per-player serialized, authenticated maintenance path; compare-and-swap the latest authoritative revision and atomically commit the entire save. Persist a fresh backup before the write. Test concurrent logins, failures, retries and restore.
2. Freshly scan all saves, including accounts that reference the IDs only in a roster, favorite, wishlist, pursuit or team; incrementally back up changes, verify hashes, and defer accounts with pending battle tickets.
3. Remove affected shared mirror snapshots and invalidate cached player rosters. Preserve historical battle rewards and reports.
4. Confirm real ownership (`collectionTruth ?? collection`) and two distinct packages/choices for dual owners. The pure mail candidate uses stable IDs and puts retirement mail in the same proposed save; deploy the mythic-choice client/server code and D1 mail-column migration before any production trial.
5. Audit before/after counts for ownership, teams, defense, favorites, wishlist, pursuit, mirrors and mail. Report to the user and await the go-ahead before the removal writes.

This document and pure function do not perform remote writes and do not signal production readiness.

## Graydove online save preflight (2026-10-09 00:45 HKT)

- A fresh read-only production inspection of player `b072954c-914d-4e38-bf87-c4ed70aa7343` was saved under the git-ignored `artifacts/private-backups/graydove-retirement-trial-2026-10-08T16-45-38Z/online-inspection.json`. Backup SHA-256: `4d80cd02fb6e372f20ce37eb480a1a7b9997930a9071ecaae6fede8bb083a594`. Revision: 7647. Original backup is not modified by the rehearsal.
- That player owns only 7622 (Juy ao); 7446 is in their wishlist but not their collection. There was no pending battle in the snapshot. A second local rehearsal of the actual retirement transformer changed only the collection, teams, wishlist, and invasion fields: removed 7622; preset teams 1 and 2 become incomplete three-member teams; the affected defense team is unset; the wishlist entry 7446 is removed. The comparison and full-recipe compensation plan are in `trial-diff.json` alongside the snapshot. A separate atomic mail-and-removal dry run is in `mail-trial.json`: it would add exactly one unclaimed mail (stable ID `retirement-2026-10-09:7622`) while retaining the eight previous letters.
- Complete three-trait recipes (per card, irrespective of currently unlocked traits): 7446 gets `minor:yellow` 90, `major:yellow` 40, `runic:yellow` 12, `celestial` 18; 7622 gets `minor:green` 90, `major:green` 40, `runic:green` 12, `celestial` 18. Each card also entitles its owner to a separate mythic choice. Graydove gets only the 7622 package.
- A remote **SELECT only** found one Graydove mirror with 7622. Its D1 mirror and referenced snapshot were backed up locally as `online-mirror-snapshot.json` in the same ignored directory (SHA-256 `5535a925a89ce555ec009083ab756d577847c288cdd22ac2cc9b8a25cb2cd4f3`). A mirror must use a newly keyed immutable snapshot, switching the row only after checking its latest `recorded_at` / `snapshot_ref`; never rewrite a shared snapshot blob in place.
- This is **not a live mutation**: the player save, mirror row, and compensation mail remain unchanged. The online save was at revision 7647 at the inspection time; the mirror subsequently showed a later recording time, so re-inspect and re-back-up both immediately before any commit.
- The production Worker lacks an admin-authorized revision-checked save mutation RPC. The mythic-choice mail flow is not deployed; a fresh read-only PRAGMA confirmed that D1 migration 0008 has not been applied. Complete those prerequisites, test interrupted and repeated delivery, and audit the post-write save/mail/mirror before treating the trial as complete. Keep unrelated local edits out of the deployment.

## 灰鸠线上单账号试点结果（2026-10-09，香港时间）

- 操作范围仅限 `b072954c-914d-4e38-bf87-c4ed70aa7343`；其他账号存档、卡池、许愿池、神话追寻及全服镜像未执行退役。倍率也未在本试点改变。
- 已将 `0008_system_mail_mythic_choice.sql` 应用于线上 D1；使用隔离 worktree 编译、部署客户端与 Worker（部署版本 `8fd362ba-e271-449b-83f3-cfb36567288a`），**没有带入**工作目录里 `TurnEngine.ts` 的独立修改。维护端点使用独立保密令牌及原只读令牌、固定灰鸠账号、原始存档 SHA-256 / revision 前置校验；令牌仅在 Git 忽略文件及 Worker secret 中。
- 写前从线上只读取得灰鸠 revision 7954 存档以及第 5 联赛镜像，均保存在 Git 忽略目录 `artifacts/private-backups/graydove-retirement-trial-2026-10-09T01-27-10/`；目录内 `pilot-preflight.json` 含**存档 JSON 自身**的哈希、源镜像引用和录制时间，以及完整写前／写后只读备份。它和备份文件的哈希是两项不同的值。写入前无未结战斗；持有菊药 7622、不持有星星丽斯 7446；后者在愿望单。
- 固定账号维护命令返回 `retired`、revision 7955：移除 7622 收藏／图鉴，清理两支预设队伍的 7622、清空原防守队，并从愿望单移除 7446。将唯一补偿邮件 `retirement-2026-10-09:7622` **与存档清理原子提交**：尚未领取的绿初级特质石 90、绿高级 40、绿符文 12、天界 18，以及神话自选 1 次。玩家领取材料后的神话自选中断／取消不消耗资格；自选确认且部队入藏才在同一存档事务消耗资格；单测、邮件浏览器测试已通过。此次没有替玩家领取附件或选择神话。
- 旧镜像快照保持不动；按原 `player_id`、第 5 联赛、`snapshot_ref`、`recorded_at` 作为前置条件，写入新内容寻址完整战斗快照并切换灰鸠当前镜像引用，将队伍和展示中的 7622 均替为彗星拉斯 7440。旧引用 `06694042...9304582`，新引用 `7c263e0e...3905267`；保留旧快照以免影响历史引用。只读复查第 5 联赛镜像只有一条、现为完整 `[主角, 6789, 7440, 6638]`，展示 `[6789, 7440, 6638]`，未含退役卡。
- 后验只读备份 revision 7955；对比写前只有 `collection`、`savedAt`、`revision`、`teams`、`gachaWishlist`、`invasion`、`mailbox` 七个顶层字段变化；原 8 封邮件变 9 封，新增的一封自选资格为 1、特质石数量逐一匹配；预设队和防守队均不再含 7622，图鉴和愿望单不再含 7446/7622。带令牌的空 JSON 线上接口探针返回 HTTP 400，证明维护鉴权与参数校验生效且不执行写入。

灰鸠试点已实施并验收；上文“Still required before release”针对**其他玩家／全服下架**仍有效。进行全服移除前须再次备份受影响的每一份最新存档及镜像，并另行汇报、确认范围。
- 试点审计完成后已删除线上的 `ADMIN_MAINTENANCE_TOKEN` secret；使用原双令牌对维护端点做无写入探针，收到 HTTP 401。后续若执行新的维护批次，需重新设置独立凭据并重新备份和审核。

## 灰鸠单人试点：原有补偿邮件纠正（本地日期 2026-10-09）

- **被移除的部队是菊药（7622）**；星星丽思（游戏内正式名称「星星丽斯」，7446）仅在灰鸠愿望单中，该玩家并未持有，不应额外补发第二套。退役前原始线上存档 revision 7954（`artifacts/private-backups/graydove-retirement-trial-2026-10-09T01-27-10/online-inspection.json`）的 `collection[7622].traits = [true, false, false]`：**只有第一项特质已解锁**。该槽位配方为绿初级特质石 **22**、绿高级特质石 **16**、天界特质石 **4**；第二、三项均未解锁，不补其材料。
- 此前试点产生的 `retirement-2026-10-09:7622` 邮件误附了菊药三项特质的全部材料，也未列明部队及钻石；邮件仍未领取。纠正前最新线上存档 revision 7956、只读备份和 CAS 哈希记录于 Git 忽略目录 `artifacts/private-backups/graydove-mail-correction-20261008T173856Z/`（内含 `online-before.json`、`online-preflight.json`、`preflight.json`）。
- 单人受控维护接口只修正**同一封未领取邮件**，以完整原始存档 SHA-256 + revision 为前置条件，在玩家串行队列中原子提交。标题明确「部队暂时退役补偿：菊药」；正文说明星星丽思（星星丽斯）和菊药因强度过高暂时移除、未来以可肝活动回归，点名灰鸠失去的**菊药**，说明已解锁特质石、1 次神话自选和 **2000 钻石**。附件现为绿初级 22、绿高级 16、天界 4、神话自选 1 次、钻石 2000；钻石和材料均在玩家领取邮件时一次性入账，未直接修改钱包。取消或中断神话选择保留自选资格，材料与钻石不可重复领取。
- 写后 revision 7957；复核 `online-after.json` 与写前存档，只有 `mailbox`、`revision`、`savedAt` 三项顶层数据不同；邮箱里仅该**原有一封**的 `title`、`body`、`currencies`、`materials` 发生变化，其他邮件及钱包原样保留。线上临时维护密钥已删除，端点返回 HTTP 401；本地临时密钥已销毁。相关单测 12/12 通过，客户端及 Worker TypeScript 检查通过。**其余玩家尚未处理，全服奖池移除仍需在逐份备份及复核后另行实施。**
## 神话自选详情与邮件名称用语修正（灰鸠单人复核）

- 新发的退役补偿邮件统一只写游戏内正式名称「**星星丽斯**和菊药」，不再出现对星星丽斯的额外别名注解。
- 神话自选列表中每张卡的卡面和「查看详情」按钮都可进入复用的完整部队详情（法术、特质、属性、立绘等），详情页的「返回神话自选」将回到**同一封邮件**的自选列表，并保留搜索词和分页。查看详情不会触发部队解锁或消耗神话自选；正式确认后仍沿用原来原子入藏、消耗资格和开箱演出的流程。邮箱浏览器用例 5/5 通过（包含手机端卡面→详情→返回且资格未消耗，以及桌面端详情→返回→取消→刷新→确认的完整回归）。
- 灰鸠上一封邮件已领取**材料/钻石附件**，但神话自选仍有 **1 次**；只读前验及回退存档保存在忽略目录 `artifacts/private-backups/graydove-mail-wording-20261008/`。此前在玩家战斗票未结时自动延期；确认最新战斗票已清空、重新备份 revision 7975 后，用固定玩家、双密钥、原始 JSON SHA-256 + revision 条件进行一次只改邮件正文的串行修正，得到 revision 7976。写后对比：仅同一封邮件 `body`、存档 `revision`、`savedAt` 变化，已领取状态、附件、钻石钱包、神话自选资格和其他邮件均未改变。临时线上维护密钥和本地密钥均已销毁，端点恢复 HTTP 401。**其他玩家仍未处理，全服奖池移除仍未实施。**