# ST-04 随机目标／状态伤害／随机伤害家族独立产品审查

> 最终复验：新增7签收＋旧33续签＝40/40；7159 P2已关闭。唯一最终binding为batch-28584-445f6a21-bff6-4ce1-b032-9ba44b07afe3。下文初审结论及旧报告绑定按历史保留，最终状态见文末。

审查日期：2026-10-24。审查者：codex-independent-random-family-product-20261024。范围为新增 7159、7335、6220、7131、6788、7160、7161 的 enemy-behavior，以及旧 33 来源在不变语义绑定下的续签。7038／6341 不属于本批新增行为范围。正式报告验证与机器收据写入结果在文末记录。

## 初审结论与具体问题

本次核对未发现可复现的 P0／P1。7160 可以按既定“复用原三消机制、完整 ST 组装、全部适用普通特质接入”范围签收；7159 存在 description 义务的 P2，保留为已登记、已执行、尚未完整签收的候选。其余五名未发现源配置、组装接入或行为阻断。

### P2：7159 隐匿文案遗漏最后可选目标例外

原始英文 Stealthy 包含 “unless there are no other targets”。src/engine/skills/targeting.ts:127–135 的 targetableFrom 在全部存活目标均隐匿时返回原目标池。tests/unit/stEnemyRandomTargetAcceptance.test.ts:167 起的双侧、带／不带同伴用例覆盖了排除与最后目标回退。

但 src/sillytavern/traitDescription.ts:130–132 生成“隐匿：不作为普通法术选择的目标。”，没有交代例外；traitDescriptionAudit 仍给出 support=full。独立浏览器检查确认实际预览展示使用该文案。玩家面对最后一名 Kitsune 时，展示的选敌规则与实际结果不够一致。

影响限定：原生目标回退已实现，没有发现卡死、空扣法力或随机伤害池扩大；严重度为 P2。尽管所有登记断言通过，description 的短语断言与结构 full 标记没有证明这个例外已对玩家说明。依照“13 项真实完成才签”的要求，本次保留 7159 的 description 缺口，不授予完整 enemy-behavior 签收；其余十二项未发现阻断。审查者未修改文案、引擎或测试。

### 7160 Frenzy：与旧 6026 使用同一签收口径

原英文“Gain 1 Attack when taking damage.”比现有原生执行范围更宽。src/engine/CombatResolver.ts:177 在骷髅伤害管线触发 gainOnDamaged；现有法术伤害路径不触发该攻击增量。ST 特质描述明确显示“自身受到骷髅头伤害后”，与当前执行一致。

旧 data/audit/st-enemy-reviews/6026.json 已明确保留这一差异。新增 tests/unit/stEnemyRandomDamageAcceptance.test.ts:158–164 实际验证骷髅伤害 8 后 Attack +1，以及法术伤害 2 后 Attack 不增加；fixture 也明确记录 raw-runtime-scope-gap。因此 6026 续签、7160 新签采用完全相同的原生机制复用口径。该差异不构成这次 ST 组装签收的阻断；完整 raw-clause parity 继续开放，机器收据保留边界。没有通过改引擎消除差异。

## 七名来源的独立语义核对

已把冻结 sourceTroop、全部 sourceTraits／原生 traits、完整 PORTRAITS 行、raw 英文与 native SpellSteps 同实际文件核对。七名的 source、原始 rarity／cost、progression 和 portrait 均无差异。状态／随机伤害的冻结面板另用 raw 基值与逐级增长累计、难度四舍五入独立重算，未发现数值差异。随机目标两名的原始等级 20 面板亦已独立核对；生产编译器输出不作为期望值生成器。

| 来源 | 主动与选敌核对 | 普通特质与适用性 | 初审意见 |
| --- | --- | --- | --- |
| 7159 Kitsune／8734 | Green/Purple，7 法力，Magic+2，对一个随机敌人；双侧多种子命中各个槽位，伤害池仅一份 | Invigorated 我方／自身施法时生命及上限 +1；Nature Heart 只数存活我方 Green，含自身；Stealthy 排除指定及最后目标回退 | 行为接入通过；description P2 保留 |
| 7335 MysteriousHero／8958 | Red/Purple，6 法力，Magic+5，对一个随机敌人；Magic Spirit 自身施法前的开局增益纳入实际伤害 | Human Bond 我方存活 Human 生命 +2；Song of Fire 开局 Red 风暴 8 回合；Magic Spirit 每名存活我方 Purple，含自身，魔力 +1 | 可签 |
| 6220 LavaElemental／7362 | Red/Brown，13 法力，Magic+2 命中全部存活敌人，所有伤害后再施加 Burn | Fireproof 燃烧／妖火免疫；Pyromania 对燃烧敌人双倍骷髅；Stoneskin 骷髅减伤 50%；有实际主动燃烧接后续骷髅的组合验证 | 可签 |
| 7131 VaultGuard／8675 | Blue/Brown，12 法力，选定敌人 Magic+2，随后 Frozen → Death Mark，保持同一目标 | Undead Shield 实际 affinity 盟友开局护甲 +2，排除名字伪装、敌人、死者；Undying；Armored 骷髅减伤 25% | 可签 |
| 6788 Amaru／8195 | Yellow/Purple，10 法力，选定敌人 Magic+4，随后 Curse → Stun → Poison；Arcane 自施法 +1 先于伤害 | Arcane 我方含自身施法触发、敌方不触发；Fast 开局 5 法力；第三源特质 Bountyhunter 为赏金模式／晋升积分，明确列于 omittedMechanisms，不虚构战斗收益 | 可签；模式积分省略保留 |
| 7160 Southrender／8735 | Blue/Yellow，7 法力，首位存活敌人；伤害区间 round(Magic/2+1)..Magic+2，闭区间种子见证；不是随机选敌 | Frenzy 继承骷髅限定；Air Heart 只数存活我方 Yellow 含自身；Sturdy 中毒免疫且晕眩可压制 | 按明确原生边界可签 |
| 7161 SwordMaiden／8736 | Red/Purple，7 法力，选定敌人，3..Magic+2 闭区间；等级 1 时退化为 3..3；取消／错误／死亡选择原子回退 | Magic Heart 我方 Purple；High Ancestry 具名状态及实际法力扣减／窃取免疫；Agile 固定种子覆盖骷髅闪避／未闪避，法术不闪避 | 可签 |

Amaru 的“三源特质”已完整核对，适用普通战机制保留两个，不以“三个都必须留在运行 traitIds”取代明确模式省略规则。该省略既在蓝图中显式可见，也有经济状态不变及无虚构发奖事件的断言。

## 13 项义务的内容审查

登记映射完整性与语义充分性分别判断。每名均有全部 13 个 ID；7159 的 description 虽有通过断言，仍留上述具体语义缺口。

| 义务 | 随机选敌 7159／7335 | 状态伤害 6220／7131／6788 | 随机伤害 7160／7161 |
| --- | --- | --- | --- |
| portrait | 整行 PORTRAITS、实际资源 SHA、BP 绑定 | 同左 | 同左 |
| active | 源 native 单段伤害、双侧等级／难度、真实施法特质组合 | 源步骤、双侧伤害与全部状态、致死不重选 | raw 区间／目标、双侧闭区间端点见证 |
| traits | 每个普通特质真实生效、同伴／敌方／死亡／晕眩控制 | 三源特质核对；全部适用特质组合；Amaru 模式省略明确 | 三个普通特质全部装配并实际触发／阻断 |
| target | 多种子随机槽位、单一伤害池；Stealthy 例外另测 | AllEnemies 与 FromTarget 有别；死槽、致死、状态顺序 | 自动首位与指定有别；死槽与无效选择 |
| mana-cost | 自然充到源成本、仅扣一次、空法力重施拒绝 | 同左；Fast 起始值单独纳入 | 3→6→7 自然充能、扣一次、空法力拒绝 |
| mana-colors | 六色实际三消充能与错误色不充能 | 同左 | 同左 |
| scaling | raw 成长与冻结面板、双侧三个缩放点 | 冻结成长／难度／自施法加成、实际伤害 | raw 独立成长重算及三个区间缩放点 |
| context | 真实 affinity／region 别名、颜色同伴与敌方／死者对照 | Undead 双类型、排除名字假冒／敌方／死者 | Heart 颜色、双侧活盟友／自身计数 |
| description | 主动文字与三特质；7159 最后目标例外缺口 | 实际主动／特质描述与状态顺序匹配 | 区间、首位／指定、Frenzy 骷髅范围明确 |
| role | Striker 与可执行单体输出相符 | Mage／Striker 与主动伤害结构及 AI 合法释放相符 | Striker 与自动首位／指定单体随机数值相符 |
| refresh | 完整 BP JSON 规范恢复与篡改拒绝 | 同左，并校验缺失技能／特质／上下文依赖 | 同左，并拒绝法力／立绘哈希篡改 |
| determinism | 固定 seed 重建、板面／RNG／事件／结果一致 | 充能→多次状态施法→结果缓存一致 | 充能→区间施法→板面／RNG／事件／结果缓存一致 |
| invalid-action | 低法力／错误方／死亡等行动无状态突变 | 同左；指定取消／友方／失效／死亡目标含 chooser RNG 回退 | 同左；7160 不调用可取消 chooser，7161 原子回退 |

随机目标草稿两名的所有断言名称已定位。随机伤害草稿分别有 113／115 条映射引用，80/80 预报告都能匹配。状态草稿分别有 100／119／99 条引用，其中合计 20 条引用既有原生文件：文件及准确 fullName 已独立定位；最终执行状态由共享正式报告核对。重复引用与逐源投影不累加为独立测试数量。

## 正式入口、完整配置保存与确定性边界

行为测试经 compileEnemyBlueprint → prepareStBattle → mapRequestToTeams → TurnEngine(configureEngine) → BattleSession.resolve 执行；本体保留真实源技能和特质，局部替换仅用于对照角色的刺激技能。真实浏览器入口继续经 replayFrame／App 注入准备配置，没有发现仅测孤立原型却宣称正式入口的问题。

独立浏览器检查七套实际表单输入，逐一编译、保存完整配置、重开、加入并保存编队，7/7 成功且无 pageerror。额外核对 st.enemy-preview.v1 中的完整 BP 与 st.enemy-design-preview.v1 内的 BP 一致；刷新后两份存储均保持；编队保留 stats、法力颜色与成本、技能、缩放、affinity／kingdom、稀有度、职责、abilityId、recipeSignature、全部保留特质。编队 externalId 重新编号属于既定行为。

设计入口的立绘选择与机制 recipe 分别使用确定性种子。不同形态立绘与源配方组合是产品明确支持的选择；要求两者档位、法力颜色与机械职责兼容，机械 sourceId 保持正确。7159 表单选“怪物”而直接源立绘为“人形”并非混源行为缺陷。单体 BP 的 restoreEnemyBlueprint 重新编译 canonical BP 后比较完整 stableJson；语义设计保存同样验证完整配置。

这里签收的是战前配置持久化、刷新后重建与相同 seed／行动的确定性重放，不包含任意战斗中途快照恢复。没有把未要求的中途恢复当成缺陷，也没有把这些测试当成它的证明。

## 执行证据与旧 33 续签依据

独立审查者此前亲自执行随机目标测试 70/70；该执行对应旧测试文件 SHA e48abe0f7f50b5aca04b95bee053102d96e598b74e72a6ac1ac3e71f4c5c0a07，后续增强 sourceTroop／sourceTraits／PORTRAITS 等锚点的冻结版本改由正式共享报告验证。独立七名 browser 检查与实现者 browser7/7 分开记账。

本批共享正式运行由 codex-main-random-family-20261024 执行：24 个文件，2525/2525，失败／跳过／todo 均为 0。审查者只读核对原始报告、每源实际断言投影、登记义务引用、收据与当前保守目录指纹，不宣称自己执行了这次共享 run。构建与 dist smoke 的成功来自主线程记录 .tmp/st-random-family-validation.json 及对应日志，属于补充证据，不替代来源行为签收。

正式报告：data/audit/st-enemy-runs/reports/batch-38060-13f4ef19-1959-4948-a5cc-b653e1c27dc1.json。

报告原始字节 SHA-256：7fab091955b1139bf9968dc4bbbb63998a6503b577e3124f918a62be049242a1。

registry 原始字节 SHA-256：43a61fa3ea535a6320ffe51c915fd37593419a0c97b4503108241f2164021121。

旧 33 基线 .tmp/st-random-family-baseline/manifest.json 的全部 66 份 run／review 快照与 registry 快照 SHA 已核对。当前 registry 原 33 记录逐个与旧记录相等，新增 7 记录逐个与草稿相等。旧 33 的 subjectDigest、implementationDigest、portraitDigest、contractDigest 全部与基线一致；testDigest 因 tests 全树新增而变化，registryDigest／report／run 绑定随正式运行更新。以此续签原范围，不把续签描述成重做全部历史来源审计。

本批前保存的 142 个 engine 文件 SHA 均与当前相等。新增的 9 个 tests／fixtures／helpers／e2e 路径均为未跟踪新文件；目录其余已存在的脏变更属于先前工作，不据 git diff 全目录归因于本批。本审查没有修改 tests、registry、生产代码、scripts 或 engine。

旧收据更新保留原 review 和 evidence 的已有字段、history 及 boundaries，只追加本次独立审查记录与旧 binding 的简要 SHA 元数据；不将旧 evidence／history 再包一层递归复制。

本报告及收据只涵盖明确登记来源和义务，不宣称全目录、原英文全量语义、全体 1821、90% 门槛或整个 ST-04 产品已通过。

## Formal-report validation and signing hold

The reviewer independently validated all 40 current run receipts against freshly computed fingerprints, exact assertion projections from the preserved original shared report, and the full registry contracts. All 3447 obligation references resolve to passing assertions. The shared run contains 24 files and 2525 passing assertions. Old33 subject/implementation/portrait/contract bindings match the saved baseline exactly at this validation point.

No machine review receipt has been written and the final docs file has not been created. The main agent is now fixing the 7159 Stealthy last-target exception in the ST description and its regression tests. Final acceptance and old33 renewal are on hold until the replacement shared summary is provided. After this production text change, implementationDigest changes must be reviewed and rebound; the earlier testDigest-only renewal premise no longer applies. The original P2 finding remains recorded above and will receive a separate closure record after revalidation.

Supplemental drift checkpoint (src/scripts excluding the one announced production file):

```json
{
  "capturedAt": "2026-10-23T18:33:01.112Z",
  "srcScriptsExceptTraitDescriptionFiles": 683,
  "srcScriptsExceptTraitDescriptionDigest": "62411395e7250de383897fe53be6d8532892370e71d11b1e3b1a7db4e95308f1",
  "traitDescriptionSha256": "7e99eba08f9aed4f138a9af61a2c46a366c1aa192c1c6dafa9c9446c1f4aa2d3",
  "stillContainsOriginalUntargetablePhrase": true,
  "sourceSnapshotPurpose": "Additional drift check while the main agent fixes the ST description; final formal receipts will be validated from a fresh summary."
}
```


## 2026-10-24 最终复验与签收（替代初审状态，保留以上历史）

最终结论：新增 7/7 签收，旧 33/33 续签，共 40/40 份 enemy-behavior 机器收据已写入并回读验证 passed。当前无 P0／P1 阻断；7159 description P2 已复验关闭。前面的 39/40／7159 待签及 signing hold 仅为初审历史，不是最终交付状态。

### 7159 P2 关闭证据

src/sillytavern/traitDescription.ts:132 的 untargetable 文案现为“不作为普通法术选择的目标；没有其他可选目标时仍可被选择”。tests/unit/stEnemyRandomTargetAcceptance.test.ts:86 在既有 description 义务加入确切例外断言；独立在内存移除新增 import 及该断言后，精确复现补丁前测试 SHA 08a6c2b99c449894dcb34fa7e60e05889a965dc4fd72bbbcb30da3126bb833a1，测试名和其他逻辑未变。当前测试 SHA 为 336459b910644e4384be3f7c68bb40907fc42a29ed8a3dad5edd304d0b1f8bae。

审查者亲自通过真实 ST 表单选择 Green/Purple／杂兵／怪物／Striker／seed11，编译 enemy:7159，确认预览显示例外；保存 full BP 后刷新，full BP 与语义设计完整相等，预览仍含例外，pageerror=0。原生最后目标回退未变，因此文案与原始英文例外、实际行为和刷新后配置一致。原发现保留，状态 closed。

### 最终执行绑定与范围

唯一最终共享报告：data/audit/st-enemy-runs/reports/batch-28584-445f6a21-bff6-4ce1-b032-9ba44b07afe3.json。原始字节 SHA-256：39740938f8ab9f5411215cd6f78da04ae032ddfbae7696c23431ee63302c8e66。registry SHA-256：43a61fa3ea535a6320ffe51c915fd37593419a0c97b4503108241f2164021121。

主线程正式执行 24 文件、2525/2525，失败／pending／todo 均为 0。审查者独立重算全部 40 当前指纹，逐个核对 run／summary／registry／contract 和原始报告的精确断言投影，并核对全部 3447 条义务引用均命中 passing 断言。以下每源投影包含共享原生测试，禁止相加作为共享执行总数。

| 来源 | 最终收据 | 义务 | 每源投影断言 | 义务引用 |
| --- | --- | --- | --- | --- |
| 7159 Kitsune | accepted | 13/13 | 70 | 84 |
| 7335 MysteriousHero | accepted | 13/13 | 70 | 76 |
| 7160 Southrender | accepted | 13/13 | 80 | 113 |
| 7161 SwordMaiden | accepted | 13/13 | 80 | 115 |
| 6220 LavaElemental | accepted | 13/13 | 279 | 100 |
| 7131 VaultGuard | accepted | 13/13 | 336 | 119 |
| 6788 Amaru | accepted | 13/13 | 265 | 99 |

7160 与旧6026统一按完整 ST 组装／原生机制复用签收；Frenzy 原英文 damaged 比原生骷髅触发范围宽的历史边界继续保留。既未改引擎，也未宣称 raw 英文全量语义已修复。6788 的 Bountyhunter 模式积分机制明确省略，全部适用普通战斗特质接入。

### 旧33续签和变动归因

旧33的 subjectDigest、portraitDigest、contractDigest 逐个与基线一致。implementationDigest 已更新，精确原因是本次 ST 隐匿例外文案；不能再描述成“仅 testDigest 变化”。审查者按 evidence.mjs 同样的路径／内容 length framing，仅读取并在内存撤回该短语，独立精确重建全部33旧 implementationDigest；并非仅采信主线程证明。证明文件 .tmp/st-random-family-implementation-delta.json SHA-256：746d58739971c848b971dd593a49e925125aaf4416d0849d281e6e7f4b5bd057。

文案文件补丁前 SHA 为 7e99eba08f9aed4f138a9af61a2c46a366c1aa192c1c6dafa9c9446c1f4aa2d3，补丁后为 d9742b89ded7ba0c81c33ca431d302e63faa856839fc6a84eb9bad3e4ea1f53c；其余683个 src/scripts 文件与先前审查检查点一致，142个 engine 文件与批次前快照一致。旧语义除这项已复验的展示补全外不变；tests全树、registry／run／report绑定更新。

全部旧 review／evidence／history／boundaries 原字段原值保留；evidence.independentRandomFamily20261024 追加当前独立记录，priorBinding 仅记录旧 reviewer／时间／摘要与基线收据 SHA，不把整份旧 evidence/history 再次嵌套复制。旧历史中各次执行数量与执行者说明仍按历史时点解释。

构建及 dist smoke 由主线程执行，post-fix validation 的退出码均为0，审查者回读其证明和日志；没有将此说成亲自重跑构建。签收仅涵盖本批7名及旧33的原登记范围，不授予7038／6341新增行为、全目录、全体1821或整个ST-04完成信用。

### 交付与回读校验

40份收据位于 data/audit/st-enemy-reviews/<id>.json，全部 decision=accepted、scope=enemy-behavior、13项义务齐全，并绑定上述最终run；审查者身份与run作者不同。全部机器回读 validateEnemyEvidence 返回 passed／issues=[]；registry、run与原始report未被审查写入改变。独立文档为 docs/sillytavern-st04-random-family-review-20261024.md，临时审查副本为 .tmp/st-random-family-product-review.md。

审查者写集仅为这两份审查文档及40份机器review；没有修改引擎、生产、测试、脚本或登记。
