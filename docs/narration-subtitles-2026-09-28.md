# 老祖播报：中文字幕与鼓舞语音（2026-09-28）

## 资产与台词来源

- 本次新增 20:04、20:05、20:06 三段已选定 MP3，归入 `encourage.ally`。源文件留在 Downloads 备份；项目资产逐字节复制，保留 SHA-256、时长及来源，没有剪辑或重编码。
- 运行时共 **84 条**（原 81 + 新 3），另有 6 条废弃版本留在归档，不加载也不显示字幕。
- 台词唯一数据源：`src/assets/audio/narrator/subtitles.zh-CN.json`，按具体录音 ID 保存英文转写与中文意译，不能用同一事件的通用字幕替代各个版本。
- 旧录音的完整原稿未存于清单，文件名存在截断。本次使用本地 faster-whisper small 转写音频，再对照文件名前缀校正机制名称、明显的同音误识别及断句，并逐条翻译。音频未上传外部转写服务。转写不是人工逐段听审。
- `death_mark_ally_202609252320_01` 在两次转写中均出现额外的 “Will be wiser” 尾句，当前译文保留，`reviewNote` 标出待人工复听；未擅自修剪原音。
- 新批次可重复导入：`python scripts/import-narrator-encouragement.py`。旧批次导入器也已保留后续批次，避免重新导入旧文件时抹掉这三条。

## 新鼓舞触发

1. 敌方非藏宝地精单位实际阵亡，战斗尚未结束，且场上仍有活着的敌人。
2. 本次行动结束时，我方存活人数至少等于敌方存活人数；我方减员、敌人逃走、最后一击、重复死亡事件不触发鼓舞。
3. 45% 触发概率，分类冷却 45 秒；继续遵守全局 14 秒、单句 75 秒冷却。三段在合格池中随机选择，尽量避免连着重复。
4. 优先级 78，高于普通重击，低于变形、吞噬、藏宝地精及胜负播报。一行动只选择一条并只掷一次概率，未触发不再重抽低优先级池。
5. 正在说话时普通鼓舞跳过，不排队、不打断；结算语音优先。

## 字幕生命周期与布局

- `NarrationAudio` 只在 `AudioBufferSourceNode.start()` 成功后发出当前录音；预加载、下载中、下载失败、解码失败、播放启动失败均不展示字幕。
- 以真实 `onended` 隐藏，不用元数据时长倒计时。中断、静音、关闭旁白、显式停止及销毁同步清理。
- 通过 `AudioManager` 连接至独立于战斗 DOM 的 `NarrationSubtitles`。胜利/战败/撤退语音跨入结算时字幕一起保留，直到真实结束；普通战斗销毁则立即移除。
- 单一字幕层，owner 校验避免旧播放器的异步结束抹掉新播放器字幕。文本用 `textContent` 写入；保留辅助技术读取但不触发第二路朗读。
- 下方居中，深色半透明底衬、暖白文字、自适应换行；`pointer-events: none`，不拦截点击。手机结算页抬高到导航栏上方；全屏切换时迁到实际 fullscreen 元素。

## 验证入口

- `tests/unit/narrationAssets.test.ts`：三条精确文件、原始哈希、84 条字幕完整映射、归档隔离。
- `tests/unit/narrationAudio.test.ts`：实际启动/结束、失败不显示、打断与旧结束回调隔离。
- `tests/unit/battleNarrator.test.ts`：鼓舞归属、场上人数、概率、冷却、胜利优先。
- `tests/e2e/narrationSubtitles.spec.ts`：真实播放、自然结束、静音、中断、下载错误、胜利 App 销毁后延续、手机排版、全屏挂载及 ownership。
- `tests/e2e/narration.spec.ts`：84 条 MP3 的真实浏览器解码和战斗播报链路。

## 本次验证结果

- 旁白/字幕定向单元测试：3 文件、60 项通过。
- 浏览器旁白及字幕：7 项通过，包括 84 条音频解码；BGM 回归独立重跑 4 项通过。合跑时菜单音乐首播有一次 5 秒等待超时，独立重跑通过，未改动音乐逻辑或放宽断言。
- `npx vite build` 成功；完整 `npm run build` 在检查时被非本次文件 `tests/unit/_tmpTune.test.ts` 中未声明的 `process` 类型挡住。
- 全量 Vitest：390 文件通过 / 9 文件失败，14532 项通过 / 42 项失败；失败集中在技能行为金样本、武器/法术数据及状态机制，未为本次字幕任务修改这些文件。本次旁白与 BGM 单测均通过。
- 日志与桌面/手机截图：`artifacts/narrator/subtitles-*`。

## 全部启用台词对照

以下英文来自录音转写与可用文本的校正，中文为游戏字幕意译。修改字幕请以 JSON 为准，并同步这份人工审阅表。

### `mana_surge_ally_202609252208_01`

- 语音池：`mana_surge.ally`
- 英文：Mana surge! Abundant power. Admirably little restraint.
- 字幕：法力涌动！力量充沛，克制却少得令人赞赏。

### `mana_surge_ally_202609252209_02`

- 语音池：`mana_surge.ally`
- 英文：Mana surge! the invocation swells beyond its humble vessel
- 字幕：法力涌动！咒法膨胀，已超出这卑微容器所能承载。

### `mana_surge_ally_202609252210_03`

- 语音池：`mana_surge.ally`
- 英文：Mana surge! Such potential. Let none of it be wasted on mercy.
- 字幕：法力涌动！如此潜能，别将分毫浪费在怜悯上。

### `mana_surge_enemy_202609252210_01`

- 语音池：`mana_surge.enemy`
- 英文：Mana surge! Their malice has acquired the means.
- 字幕：法力涌动！他们的恶意，如今有了施展的手段。

### `mana_surge_enemy_202609252211_02`

- 语音池：`mana_surge.enemy`
- 英文：Mana surge! even a brute becomes formidable with sufficient power
- 字幕：法力涌动！力量足够充沛，莽夫也能成为劲敌。

### `mana_surge_enemy_202609252213_03`

- 语音池：`mana_surge.enemy`
- 英文：Mana surge! an alarming abundance on the wrong side
- 字幕：法力涌动！多得令人不安……却落在了敌人手中。

### `match4_ally_202609252214_01`

- 语音池：`match4.ally`
- 英文：Four matched. A calculated advantage. Exploit it.
- 字幕：四连！精心谋得的优势。好好利用。

### `match4_ally_202609252214_02`

- 语音池：`match4.ally`
- 英文：Four matched! Let hesitation be their affliction, not yours.
- 字幕：四连！让犹豫折磨他们，而不是你们。

### `match4_enemy_202609252215_01`

- 语音池：`match4.enemy`
- 英文：Four matched an ugly display of competence
- 字幕：四连！这番能耐，实在令人厌恶。

### `match4_enemy_202609252215_02`

- 语音池：`match4.enemy`
- 英文：Four matched. They dictate the pace. You endure the consequences.
- 字幕：四连！他们掌控节奏，你们承受后果。

### `match5_ally_202609252216_01`

- 语音池：`match5.ally`
- 英文：Five matched! A magnificent confluence. Put it to merciless use.
- 字幕：五连！绝妙的汇聚。毫不留情地利用它。

### `match5_ally_202609252217_02`

- 语音池：`match5.ally`
- 英文：Five matched! An elegant arrangement, with decidedly inelegant consequences.
- 字幕：五连！优雅的排列，带来的后果却绝不优雅。

### `match5_enemy_202609252217_01`

- 语音池：`match5.enemy`
- 英文：Five matched. Fortune lavishes her gifts upon the undeserving.
- 字幕：五连！命运竟将厚礼，慷慨赐予不配之人。

### `match5_enemy_202609252218_02`

- 语音池：`match5.enemy`
- 英文：Five matched what they lack in subtlety they now possess in force
- 字幕：五连！他们欠缺的精巧，如今由蛮力补足。

### `extra_turn_ally_202609252220_01`

- 语音池：`extra_turn.ally`
- 英文：Extra turn. A brief monopoly on violence.
- 字幕：额外回合！暂且独享施暴的权利。

### `extra_turn_ally_202609252224_02`

- 语音池：`extra_turn.ally`
- 英文：Extra turn. Make their reprieve a regrettably short one.
- 字幕：额外回合！让他们的喘息，短得令人遗憾。

### `extra_turn_enemy_202609252225_01`

- 语音池：`extra_turn.enemy`
- 英文：Extra turn. Their appetite exceeds their allotted time.
- 字幕：额外回合！他们的贪欲，超出了分给他们的时间。

### `extra_turn_enemy_202609252227_02`

- 语音池：`extra_turn.enemy`
- 英文：Extra turn. No interval. No relief. Attend to your wounded.
- 字幕：额外回合！没有间歇，没有缓解。照看你们的伤员。

### `cascade_ally_202609252232_01`

- 语音池：`cascade.ally`
- 英文：Cascade. Each small success makes the next inevitable.
- 字幕：连锁！每一次小小的成功，都让下一次成为必然。

### `cascade_enemy_202609252233_01`

- 语音池：`cascade.enemy`
- 英文：Cascade. Observe how readily a disadvantage compounds.
- 字幕：连锁！瞧，劣势是何等轻易地层层累积。

### `grand_cascade_ally_202609252233_01`

- 语音池：`grand_cascade.ally`
- 英文：Grand Cascade. The gratifying arithmetic of annihilation.
- 字幕：大连锁！歼灭的算术，真令人满意。

### `grand_cascade_enemy_202609252234_01`

- 语音池：`grand_cascade.enemy`
- 英文：Grand Cascade a succession of calamities yours to enumerate
- 字幕：大连锁！接踵而至的灾祸，留给你们逐一清点。

### `skull_ally_202609252234_01`

- 语音池：`skull.ally`
- 英文：Skull strike a blunt instrument an unequivocal result
- 字幕：骷髅打击！粗陋的手段，确凿的结果。

### `skull_enemy_202609252235_01`

- 语音池：`skull.enemy`
- 英文：Skull Strike. Your frailty. Brutally demonstrated.
- 字幕：骷髅打击！你们的脆弱，得到了残酷的证明。

### `armor_break_enemy_202609252238_01`

- 语音池：`armor_break.enemy`
- 英文：Armor broken flesh must now answer for the failures of iron
- 字幕：护甲破碎！钢铁的失职，如今须由血肉偿还。

### `armor_break_ally_202609252238_01`

- 语音池：`armor_break.ally`
- 英文：Armor broken. Their confidence was regrettably thin.
- 字幕：护甲破碎！他们的底气，薄得令人遗憾。

### `mana_drain_enemy_202609252239_01`

- 语音池：`mana_drain.enemy`
- 英文：Manadrain. An elaborate invocation. Nothing to sustain it.
- 字幕：法力汲取！精妙的咒法，却再无力量维系。

### `mana_drain_ally_202609252239_01`

- 语音池：`mana_drain.ally`
- 英文：Mana Drain. Grand Ambitions. Reduced to impotent muttering.
- 字幕：法力汲取！宏大的野心，沦为无力的呢喃。

### `barrier_ally_202609252240_01`

- 语音池：`barrier.ally`
- 英文：Barrier. A prudent concession to your own fragility.
- 字幕：屏障！承认自身脆弱，也算明智。

### `healing_ally_202609252240_01`

- 语音池：`healing.ally`
- 英文：Healing. Enough to resume your duties.
- 字幕：治疗！足够让你们继续履行职责了。

### `healing_enemy_202609252240_01`

- 语音池：`healing.enemy`
- 英文：Healing. Our previous efforts require repeating. How tedious.
- 字幕：治疗！先前的功夫又得重来。何其乏味。

### `barrier_enemy_202609252241_01`

- 语音池：`barrier.enemy`
- 英文：Barrier. An obstruction. Not an absolution.
- 字幕：屏障！不过是阻碍，而非赦免。

### `poison_ally_202609252242_01`

- 语音池：`poison.ally`
- 英文：Poisoned. A measured dose. A mounting debility.
- 字幕：中毒！剂量精确，衰弱渐深。

### `poison_enemy_202609252242_01`

- 语音池：`poison.enemy`
- 英文：Poisoned. The injury is small. Its ambitions are not.
- 字幕：中毒！伤害虽小，它的野心却不小。

### `summon_ally_202609252243_01`

- 语音池：`summon.ally`
- 英文：Summoning. Reinforcements of a questionable pedigree.
- 字幕：召唤！援军来了，血统却颇为可疑。

### `devour_enemy_202609252244_01`

- 语音池：`devour.enemy`
- 英文：Devoured. A lifetime of promise. Repurposed as sustenance.
- 字幕：吞噬！一生的前程，改作了腹中之食。

### `devour_ally_202609252244_01`

- 语音池：`devour.ally`
- 英文：Devoured. A practical solution to an anatomical inconvenience.
- 字幕：吞噬！以务实的办法，解决肉身带来的麻烦。

### `summon_enemy_202609252244_01`

- 语音池：`summon.enemy`
- 英文：Summoning their numbers improve their company does not
- 字幕：召唤！他们的数量增加了，货色却没见长进。

### `victory_normal_202609252255_01`

- 语音池：`victory.normal`
- 英文：A well-earned victory. Their resistance has been answered in full.
- 字幕：应得的胜利！他们的抵抗，已得到充分回应。

### `victory_overwhelming_202609252257_01`

- 语音池：`victory.overwhelming`
- 英文：An overwhelming victory. Their confidence outlasted their competence.
- 字幕：压倒性的胜利！他们的自信，比他们的本事撑得更久。

### `victory_costly_202609252258_01`

- 语音池：`victory.costly`
- 英文：A costly victory. Count the spoils, then count the missing.
- 字幕：代价惨重的胜利。清点战利品，再清点未归之人。

### `victory_normal_202609252258_02`

- 语音池：`victory.normal`
- 英文：A satisfactory victory. Take what is useful. Leave the rest to decay.
- 字幕：令人满意的胜利。取走有用之物，其余留待腐朽。

### `defeat_normal_202609252259_01`

- 语音池：`defeat.normal`
- 英文：A bitter defeat. Your intentions were admirable. Your execution was not.
- 字幕：苦涩的失败。你们的志向值得赞赏，手段却并非如此。

### `defeat_crushing_202609252300_01`

- 语音池：`defeat.crushing`
- 英文：A crushing defeat. The enemy found your preparations altogether insufficient.
- 字幕：惨重的失败。敌人已经证明，你们的准备远远不够。

### `retreat_normal_202609252301_01`

- 语音池：`retreat.normal`
- 英文：A prudent retreat, better an abandoned ambition than another occupied grave.
- 字幕：明智的撤退。宁可放弃一桩野心，也好过再填一座坟墓。

### `defeat_total_202609252301_01`

- 语音池：`defeat.total`
- 英文：A total defeat. No witnesses remain to offer a kinder account.
- 字幕：彻底的失败。已无见证者幸存，替你们留下稍体面的说辞。

### `defeat_normal_202609252301_02`

- 语音池：`defeat.normal`
- 英文：An instructive defeat. The lesson was sound. The tuition ruinous.
- 字幕：颇有教益的失败。道理无可挑剔，学费却足以倾家荡产。

### `retreat_costly_202609252302_01`

- 语音池：`retreat.costly`
- 英文：A costly retreat. You have saved what remains. Remember, what does not.
- 字幕：代价惨重的撤退。你们保住了剩下的。记住那些未能保住的。

### `retreat_normal_202609252302_02`

- 语音池：`retreat.normal`
- 英文：An ignominious retreat. Pride proved heavier than you could carry.
- 字幕：耻辱的撤退。骄傲的分量，终究超出了你们所能承受。

### `heavy_enemy_202609252305_01`

- 语音池：`heavy.enemy`
- 英文：A grievous wound. Attend to it before it defines the battle.
- 字幕：伤势沉重。在它决定战局之前，赶紧处理。

### `heavy_enemy_202609252306_02`

- 语音池：`heavy.enemy`
- 英文：A sobering impact. Revise your expectations.
- 字幕：令人清醒的一击。重新估量你们的胜算。

### `heavy_enemy_202609252306_03`

- 语音池：`heavy.enemy`
- 英文：An ugly reminder, the enemy requires only one opening.
- 字幕：丑陋的提醒。敌人只需要一次破绽。

### `spell_heavy_enemy_202609252307_01`

- 语音池：`spell_heavy.enemy`
- 英文：Their sorcery deserves more respect than you have afforded it
- 字幕：他们的巫术，值得比你们先前更多的敬畏。

### `silence_ally_202609252308_01`

- 语音池：`silence.ally`
- 英文：Silenced. At last, a useful contribution to the conversation.
- 字幕：沉默！这场交谈，总算有了点有用的贡献。

### `aoe_heavy_enemy_202609252308_01`

- 语音池：`aoe_heavy.enemy`
- 英文：Wounds throughout the ranks, triage becomes an exercise in sacrifice.
- 字幕：全军皆伤。此刻的救治，不过是在选择牺牲谁。

### `frozen_enemy_202609252309_01`

- 语音池：`frozen.enemy`
- 英文：Frozen. Resolve proves a poor substitute for circulation.
- 字幕：冰冻！意志再坚定，也替代不了流动的血液。

### `frozen_ally_202609252309_01`

- 语音池：`frozen.ally`
- 英文：Frozen. Their intentions remain heated, the rest does not.
- 字幕：冰冻！他们的企图仍旧炽热，肉身却已冷透。

### `silence_enemy_202609252309_01`

- 语音池：`silence.enemy`
- 英文：Silenced. All that learning, stranded behind the tongue.
- 字幕：沉默！满腹学识，尽数困于舌后。

### `transform_ally_202609252310_01`

- 语音池：`transform.ally`
- 英文：Transformed. A most thorough revision of their identity.
- 字幕：变形！对他们身份的一次彻底修订。

### `transform_enemy_202609252311_01`

- 语音池：`transform.enemy`
- 英文：Transformed, familiar flesh, subjected to unfamiliar terms.
- 字幕：变形！熟悉的血肉，被迫遵从陌生的规则。

### `transform_self_ally_202609252311_01`

- 语音池：`transform_self.ally`
- 英文：transformed. The former shape has outlived its usefulness.
- 字幕：变形！旧日形体，已再无用处。

### `stun_enemy_202609252314_01`

- 语音池：`stun.enemy`
- 英文：Stunned. An unfortunate time to lose one's faculties.
- 字幕：眩晕！偏偏在此刻丧失神志，何其不幸。

### `stun_ally_202609252314_02`

- 语音池：`stun.ally`
- 英文：stunned thought and action suffer a temporary estrangement
- 字幕：眩晕！思想与行动，暂且分道扬镳。

### `entangle_ally_202609252315_01`

- 语音池：`entangle.ally`
- 英文：Entangled. Much exertion. Negligible progress.
- 字幕：缠绕！费尽力气，寸步难移。

### `entangle_enemy_202609252315_01`

- 语音池：`entangle.enemy`
- 英文：Entangled. Strength requires leverage. You appear to have neither.
- 字幕：缠绕！施力须有支点。看来这两样你们都没有。

### `web_ally_202609252315_01`

- 语音池：`web.ally`
- 英文：Webbed such elaborate talents undone by a little silk
- 字幕：蛛网！如此精湛的本领，竟毁于几缕细丝。

### `curse_ally_202609252318_01`

- 语音池：`curse.ally`
- 英文：Cursed. Their remaining comforts are subject to revision.
- 字幕：诅咒！他们仅剩的安逸，也得重新估量了。

### `web_enemy_202609252318_01`

- 语音池：`web.enemy`
- 英文：webbed a humiliating predicament for so accomplished a practitioner
- 字幕：蛛网！对如此老练的施术者而言，真是屈辱的困境。

### `burning_ally_202609252319_01`

- 语音池：`burning.ally`
- 英文：Burning. Their discomfort will require no further encouragement.
- 字幕：燃烧！他们的痛苦，再不必额外催促。

### `curse_enemy_202609252319_01`

- 语音池：`curse.enemy`
- 英文：Cursed an unwelcome amendment to your prospects
- 字幕：诅咒！你们的前景，添上了不受欢迎的一笔。

### `burning_enemy_202609252320_01`

- 语音池：`burning.enemy`
- 英文：Burning. Composure is admirable. Extinguishment would be wiser.
- 字幕：燃烧！镇定值得赞赏，灭火却更为明智。

### `death_mark_ally_202609252320_01`

- 语音池：`death_mark.ally`
- 英文：Death mark! A prognosis of exceptional clarity. Will be wiser.
- 字幕：死亡印记！诊断已再清楚不过。这样会更明智。

### `death_mark_enemy_202609252321_01`

- 语音池：`death_mark.enemy`
- 英文：Death mark your continued existence has become a pending question
- 字幕：死亡印记！你们能否继续活着，已成悬而未决之事。

### `treasure_appear_202609252324_01`

- 语音池：`treasure.appear`
- 英文：A treasure? Your next opportunity appears disinclined to wait.
- 字幕：财宝！你们的下一份机遇，看来不愿久候。

### `treasure_fled_202609252329_01`

- 语音池：`treasure.fled`
- 英文：There goes your fortune. Remarkably fleet of foot.
- 字幕：你们的财运跑了。腿脚倒是出奇地利索。

### `treasure_defeated_202609252330_01`

- 语音池：`treasure.defeated`
- 英文：A profitable encounter for the surviving party, at least.
- 字幕：一场有利可图的遭遇——至少对幸存的一方如此。

### `heavy_ally_202609260006_04`

- 语音池：`heavy.ally`
- 英文：Excellent hit. Let them feel the full weight of your contempt.
- 字幕：漂亮的一击！让他们承受你们鄙夷的全部分量。

### `heavy_ally_202609260007_05`

- 语音池：`heavy.ally`
- 英文：Splendid. Strike again, before they remember how to stand.
- 字幕：妙极！趁他们还没想起如何站稳，再来一击！

### `heavy_ally_202609260016_06`

- 语音池：`heavy.ally`
- 英文：Tremendous blow, courage surges like a tide as the enemy crumbles.
- 字幕：强劲的一击！勇气在敌人溃散时，如潮水般涌出。

### `spell_heavy_ally_202609260018_02`

- 语音池：`spell_heavy.ally`
- 英文：Magnificent sorcery! Their suffering attests to your mastery.
- 字幕：精妙的巫术！他们的痛苦，正是你们造诣的明证。

### `aoe_heavy_ally_202609260019_02`

- 语音池：`aoe_heavy.ally`
- 英文：Glorious devastation not one among them left unimpressed
- 字幕：辉煌的毁灭！他们之中，无一不铭记于心。

### `encourage_ally_202609282004_01`

- 语音池：`encourage.ally`
- 英文：Continue the onslaught! Destroy. Them. All.
- 字幕：继续猛攻！将他们，赶尽杀绝！

### `encourage_ally_202609282005_02`

- 语音池：`encourage.ally`
- 英文：Press this advantage, give them no quarter!
- 字幕：趁胜追击，一个不留！

### `encourage_ally_202609282006_03`

- 语音池：`encourage.ally`
- 英文：Their formation is broken—maintain the offensive.
- 字幕：敌阵已破——继续进攻。

