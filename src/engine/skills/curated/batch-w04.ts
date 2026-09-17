/**
 * 窗口 K-B · 武器法术批次 W04（池：scripts/curated-pools/pool-w01.json）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 组装规则全部锚定 scripts/spell-rules.md 与既有部队批次先例（详见各 skipped 原因
 * 与 artifacts/weapon-spell-triage.md 的家族分布/原语请求节）。
 * 生成器：scripts/_weapon_pools.mjs gen（规则表 + 人工裁定；机器不猜语义）。
 */
import { cleanse, createGems, createSpecialGems, dmg, dmgSplash, explodeRandomGems, extraTurn, inflict, shuffleTeam, skill, transformToSpecial } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 9111, reason: '未识别子句「若敌人来自午夜城市或战斗位于午夜城市，则伤害翻倍」（无匹配规则）' },
  { id: 9112, reason: '未识别子句「对一名敌人造成 [魔法 + 3] 点严重的溅射伤害」（伤害类型无法解析）' },
  { id: 9142, reason: '未识别子句「赋予所有聚沙之地盟友一个随机正面增益效果」（按王国（聚沙之地）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9145, reason: '未识别子句「赋予所有蛛尔卡里盟友一个随机正面增益效果」（按王国（蛛尔卡里）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9159, reason: '未识别子句「再对一名敌人造成 [魔法 + 6] 点伤害」（无匹配规则）' },
  { id: 9160, reason: '未识别子句「将所有紫色宝石转换成末日骷髅头」（无匹配规则）' },
  { id: 9167, reason: '未识别子句「创造 14 颗混合骷髅头和恐怖宝石」（混合宝石含骷髅头/特殊宝石端点，无 mix 原语（原语请求：createMix 扩特殊宝石端点））' },
  { id: 9203, reason: '未识别子句「再召唤一个巨人军队」（无匹配规则）' },
  { id: 9205, reason: '未识别子句「赋予所有沃尔帕克盟友一个正面增益状态效果」（无匹配规则）' },
  { id: 9207, reason: '未识别子句「赋予所有厄什卡盟友一个正面增益状态效果」（无匹配规则）' },
  { id: 9208, reason: '未识别子句「赋予所有剑锋崖盟友一个正面增益状态效果」（无匹配规则）' },
  { id: 9210, reason: '未识别子句「赋予所有怪兽盟友一个正面增益状态效果」（无匹配规则）' },
  { id: 9211, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9212, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9213, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9214, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9215, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9216, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9235, reason: '未识别子句「赋予所有黑石盟友一个随机正面增益状态效果」（按王国（黑石）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9261, reason: '特殊宝石家族未实现（天使宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9263, reason: '未识别子句「对首位 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因恶魔盟友数而增强」（无匹配规则）' },
  { id: 9264, reason: '未识别子句「赋予所有狮心帝国盟友一个随机正面增益状态效果」（按王国（狮心帝国）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9266, reason: '未识别子句「使所有蛮族盟友获得一个随机正面增益效果」（群体名称无法可靠映射到种族/王国「蛮族」（语义拿不准））' },
  { id: 9267, reason: '未识别子句「使所有白盔国盟友获得一个随机正面增益效果」（按王国（白盔国）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9300, reason: '未识别子句「创造 16 颗混合鬼魂宝石和冻结宝石」（混合宝石含骷髅头/特殊宝石端点，无 mix 原语（原语请求：createMix 扩特殊宝石端点））' },
  { id: 9301, reason: '未识别子句「给予所有猫族盟友一个随机正面增益状态效果」（群体名称无法可靠映射到种族/王国「猫族」（语义拿不准））' },
  { id: 9305, reason: '未识别子句「赋予所有冰封之巅盟友一个随机正面增益状态效果」（群体名称无法可靠映射到种族/王国「冰封之巅」（语义拿不准））' },
  { id: 9351, reason: '未识别子句「赋予所有盖塔尔盟友一个随机正面增益状态效果」（按王国（盖塔尔）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9356, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9357, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9358, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9359, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9360, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9361, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9378, reason: '未识别子句「消除所有敌人正面增益效果，再创造 9 颗燃烧宝石」（无匹配规则）' },
  { id: 9379, reason: '未识别子句「将所有骷髅头转换成超级末日骷髅头，并获得 [(魔法 / 2) + 1] 点攻击力」（无匹配规则）' },
  { id: 9381, reason: '未识别子句「若队伍里有永生神泰拉，则爆破所有击晕宝石」（兵种在场条件 payload：无匹配规则）' },
  { id: 9382, reason: '特殊宝石家族未实现（蓝龙宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9383, reason: '未识别子句「对一名敌人造成 [(魔法 x 2) + 3] 点轻量溅射伤害」（伤害类型无法解析）' },
  { id: 9384, reason: '特殊宝石家族未实现（天使宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9387, reason: '未识别子句「若队伍里有永生神提泰纽斯，则随机摧毁 2 列」（兵种在场条件 payload：无匹配规则）' },
  { id: 9484, reason: '未识别子句「如果我的队伍中有不朽的拉奇亚，则还摧毁 2 个随机列」（无匹配规则）' },
  { id: 9486, reason: '特殊宝石家族未实现（传送门，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9488, reason: '未识别子句「制造 4 个骷髅，数量受中毒敌人影响」（无匹配规则）' },
  { id: 9490, reason: '未识别子句「制作 8-12 个骷髅」（无匹配规则）' },
  { id: 9505, reason: '特殊宝石家族未实现（传送门，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9506, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因狐狸座盟友的数量而增强」（修饰来源无法解析「狐狸座盟友的数量」）' },
  { id: 9507, reason: '未识别子句「对敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和神圣盟友的数量而增强」（修饰来源无法解析「黄色盟友和神圣盟友的数量」）' },
  { id: 9508, reason: '未识别子句「为所有 Stryx 盟友赋予随机状态效果」（无匹配规则）' },
  { id: 9509, reason: '未识别子句「为所有马拉杰之罪盟友赋予随机状态效果」（无匹配规则）' },
  { id: 9510, reason: '未识别子句「对敌人造成 [魔法 + 4] 点伤害，伤害值由红色盟友和金牛座盟友增强」（伤害句残留无法解析「伤害值由红色盟友和金牛座盟友增强」）' },
  { id: 9511, reason: '未识别子句「为所有半人马盟友赋予随机状态效果」（无匹配规则）' },
  { id: 9523, reason: '未识别子句「净化自身，然后随机对敌方队伍造成 9 层流血效果」（无匹配规则）' },
  { id: 9524, reason: '译文异常（模板占位符 {N} 未填充）' },
  { id: 9525, reason: '译文异常（模板占位符 {N} 未填充）' },
  { id: 9564, reason: '未识别子句「如果我的队伍中有永生塞勒涅，则将一半法力值给予所有其他盟友」（无匹配规则）' },
  { id: 9566, reason: '未识别子句「对一名敌人造成 [魔法 + 12] 点溅射伤害，并使所有受影响的敌人流血」（伤害句残留无法解析「并使所有受影响的敌人流血」）' },
  { id: 9573, reason: '特殊宝石家族未实现（腐烂宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9574, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因银林地盟友的数量而增强」（修饰来源无法解析「银林地盟友的数量」）' },
  { id: 9575, reason: '未识别子句「对敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和乌尔斯卡盟友的数量而增强」（修饰来源无法解析「棕色盟友和乌尔斯卡盟友的数量」）' },
  { id: 9577, reason: '未识别子句「为所有地狱岩盟友赋予随机状态效果」（无匹配规则）' },
  { id: 9578, reason: '未识别子句「对敌人造成 [魔法 + 4] 点伤害，伤害值因红色盟友和仙灵盟友的数量而增强」（修饰来源无法解析「红色盟友和仙灵盟友的数量」）' },
  { id: 9579, reason: '未识别子句「每有一个亡灵盟友，则消耗 3 点法力」（无匹配规则）' },
  { id: 9580, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9581, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9582, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9583, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9584, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9585, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9628, reason: '未识别子句「为所有 Dhrak-Zum 盟友赋予随机状态效果」（无匹配规则）' },
  { id: 9629, reason: '未识别子句「如果一名敌人死亡，则再创造 4 颗」（无匹配规则）' },
  { id: 9630, reason: '未识别子句「对敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和巨型盟友的数量而增强」（修饰来源无法解析「棕色盟友和巨型盟友的数量」）' },
  { id: 9632, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因暗石盟友的数量而增强」（修饰来源无法解析「暗石盟友的数量」）' },
  { id: 9633, reason: '未识别子句「对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友和仙灵盟友的数量而增强」（修饰来源无法解析「蓝色盟友和仙灵盟友的数量」）' },
  { id: 9636, reason: '未识别子句「对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和野蛮人盟友的数量而增强」（修饰来源无法解析「绿色盟友和野蛮人盟友的数量」）' },
  { id: 9647, reason: '未识别子句「对4名随机敌人造成流血效果」（数值公式无法解析）' },
  { id: 9649, reason: '未识别子句「如果我的队伍中有不朽的德拉肯，则随机召唤一条龙」（无匹配规则）' },
  { id: 9687, reason: '未识别子句「如果敌人已中毒，则造成双倍伤害」（无匹配规则）' },
  { id: 9689, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因阿达纳盟友的数量而增强」（修饰来源无法解析「阿达纳盟友的数量」）' },
  { id: 9691, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9692, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因流沙盟友的数量而增强」（修饰来源无法解析「流沙盟友的数量」）' },
  { id: 9720, reason: '未识别子句「引爆5颗宝石，因盟友受到屏障而增强」（无匹配规则）' },
  { id: 9722, reason: '未识别子句「造成[魔法 + 6]点散射伤害，伤害值因暗影星辰而增强」（修饰来源无法解析「暗影星辰」）' },
  { id: 9747, reason: '未识别子句「然后引爆3颗激怒宝石」（无匹配规则）' },
  { id: 9748, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9749, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因圣力场盟友的数量而增强」（修饰来源无法解析「圣力场盟友的数量」）' },
  { id: 9750, reason: '未识别子句「对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和金牛座盟友的数量而增强」（修饰来源无法解析「棕色盟友和金牛座盟友的数量」）' },
  { id: 9752, reason: '未识别子句「对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因潘之谷盟友的数量而增强」（修饰来源无法解析「潘之谷盟友的数量」）' },
  { id: 9754, reason: '未识别子句「赋予所有战神盟友随机状态效果」（无匹配规则）' },
  { id: 9809, reason: '特殊宝石家族未实现（天使宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 9811, reason: '未识别子句「如果我方队伍中有不朽的怪物，则吸取目标的所有法力值」（无匹配规则）' },
  { id: 9825, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9826, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9827, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9828, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9829, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9830, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 9831, reason: '未识别子句「将指定颜色的所有宝石转化为流血宝石」（无匹配规则）' },
  { id: 9832, reason: '未识别子句「随机赋予所有扎金盟友一个状态效果」（无匹配规则）' },
  { id: 9833, reason: '未识别子句「对敌人造成[魔法 + 4]点伤害，红色盟友和罗刹盟友可提升伤害」（伤害句残留无法解析「红色盟友和罗刹盟友可提升伤害」）' },
  { id: 9834, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，由构装体盟友加成」（伤害句残留无法解析「由构装体盟友加成」）' },
  { id: 9835, reason: '未识别子句「随机赋予所有日冠盟友一个状态效果」（无匹配规则）' },
  { id: 9836, reason: '未识别子句「对一名敌人造成[魔法 + 4]点伤害，蓝色盟友和人类盟友可提升伤害」（伤害句残留无法解析「蓝色盟友和人类盟友可提升伤害」）' },
  { id: 9837, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9840, reason: '未识别子句「对一名敌人造成[魔法 + 2]点真实伤害，并使其燃烧」（伤害句残留无法解析「并使其燃烧」）' },
  { id: 9842, reason: '未识别子句「对所有敌人造成[魔法 + 2]点伤害，被蛛网束缚的敌人伤害加成」（伤害句残留无法解析「被蛛网束缚的敌人伤害加成」）' },
  { id: 9876, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，受到地狱峭壁盟友的加成」（伤害句残留无法解析「受到地狱峭壁盟友的加成」）' },
  { id: 9902, reason: '未识别子句「然后将该敌人一种法力颜色的4颗宝石转化为恐惧宝石」（无匹配规则）' },
  { id: 9903, reason: '未识别子句「然后生成 3 个流血宝石」（无匹配规则）' },
  { id: 9904, reason: '未识别子句「生成3个流血宝石、3个恐惧宝石、3个中毒宝石」（无匹配规则）' },
  { id: 9910, reason: '未识别子句「制作10颗毒宝石」（无匹配规则）' },
  { id: 9911, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9912, reason: '未识别子句「对一名敌人造成[魔法 + 4]点伤害，红色盟友和兽人盟友可提升伤害」（伤害句残留无法解析「红色盟友和兽人盟友可提升伤害」）' },
  { id: 9913, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，骑士盟友可提升伤害」（伤害句残留无法解析「骑士盟友可提升伤害」）' },
  { id: 9914, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9915, reason: '未识别子句「对敌人造成[魔法 + 4]点伤害，受到绿色盟友和乌尔斯卡盟友的加成」（伤害句残留无法解析「受到绿色盟友和乌尔斯卡盟友的加成」）' },
  { id: 9916, reason: '未识别子句「随机赋予所有美人鱼盟友一个状态效果」（无匹配规则）' },
  { id: 9934, reason: '未识别子句「对一名敌人造成[(魔法 x 2) + 3]点伤害，并施加2层流血效果」（伤害句残留无法解析「并施加2层流血效果」）' },
  { id: 9936, reason: '未识别子句「对一名敌人造成1点溅射伤害，并使自身狂暴」（伤害句残留无法解析「并使自身狂暴」）' },
  { id: 9971, reason: '未识别子句「然后生成8个蛛网宝石」（无匹配规则）' },
  { id: 9972, reason: '未识别子句「对敌人造成[魔法 + 4]点伤害，绿色盟友和神秘盟友可提升伤害」（伤害句残留无法解析「绿色盟友和神秘盟友可提升伤害」）' },
  { id: 9973, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9974, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，受到德拉克-祖姆盟友的加成」（伤害句残留无法解析「受到德拉克-祖姆盟友的加成」）' },
  { id: 9975, reason: '未识别子句「对敌人造成[魔法 + 4]点伤害，黄色盟友和机械盟友可提升伤害」（伤害句残留无法解析「黄色盟友和机械盟友可提升伤害」）' },
  { id: 9976, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 9977, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，受到荒野平原盟友的加成」（伤害句残留无法解析「受到荒野平原盟友的加成」）' },
  { id: 9983, reason: '未识别子句「对一名敌人造成[魔法 + 3]点伤害，骷髅头可提升伤害」（伤害句残留无法解析「骷髅头可提升伤害」）' },
  { id: 9985, reason: '未识别子句「降低一名敌人1点攻击力和4点魔法值，受诅咒敌人影响时效果更佳」（无匹配规则）' },
  { id: 10003, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 10005, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 10006, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 10008, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 10015, reason: '未识别子句「对一名敌人造成[魔法 + 4]点伤害，绿色盟友和哥布林盟友可提升伤害」（伤害句残留无法解析「绿色盟友和哥布林盟友可提升伤害」）' },
  { id: 10045, reason: '未识别子句「Deal [魔法 + 3] damage to 3 random Enemies, boosted by Volcano Gems. If an Enemy dies, create 12 Volcano Gems.」（无匹配规则）' },
  { id: 10046, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 10047, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，受到荆棘森林盟友的加成」（伤害句残留无法解析「受到荆棘森林盟友的加成」）' },
  { id: 10048, reason: '未识别子句「对敌人造成[魔法 + 4]点伤害，黄色盟友和野人盟友可提升伤害」（伤害句残留无法解析「黄色盟友和野人盟友可提升伤害」）' },
  { id: 10049, reason: '未识别子句「对前 2 个敌人造成 [魔法 + 3] 点伤害，野兽盟友可提升伤害」（伤害句残留无法解析「野兽盟友可提升伤害」）' },
  { id: 10050, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 10063, reason: '未识别子句「Deal [魔法 + 3] damage to 2 random Enemies and knock them to the back. If Immortal Thalassa is in my team, Submerge and Enchant all Allies.」（无匹配规则）' },
  { id: 10065, reason: '未识别子句「Deal [魔法 + 4] damage to the first 2 Enemies. If Immortal Girthrok is in my team, give 12 Life to all Allies.」（无匹配规则）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 9113,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害。若敌人身亡，则将所有红色宝石转换成沙漏宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all' }),
      transformToSpecial(BaseColor.Red, 'hourglass', { ifTargetDied: true }),
    ),
  },
  {
    id: 9141,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因不死族盟友数而增强。 [x4]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 9143,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和人马族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9144,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因妖仙盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Fey' } } }),
    ),
  },
  {
    id: 9146,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和鸟族盟友数而增强 。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9158,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因沙漏宝石数而增强。 [x8]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'hourglass' } } }),
    ),
  },
  {
    id: 9161,
    desc: '将所有红色宝石转换成诅咒宝石，并将所有紫色宝石转换成末日骷髅头。打乱敌方队伍。',
    build: skill(
      transformToSpecial(BaseColor.Red, 'curseGem'),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 9162,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再使其上方所有敌人陷入诅咒和恐怖状态。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      inflict('curse', 'enemyAll'),
    ),
  },
  {
    id: 9204,
    desc: '&& 创造 8 颗蓝色闪电宝石，并对一名敌人造成 [魔法 + 3] 点溅射伤害  && 创造 8 颗黄色闪电宝石，并对一名敌人造成 [魔法 + 3] 点溅射伤害',
    build: skill(
      createGems(BaseColor.Blue, 8, 0),
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
      createGems(BaseColor.Yellow, 8, 0),
      dmgSplash('enemyChosen', 3, 1, { range: 'splash' }),
    ),
  },
  {
    id: 9206,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和野兽盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Beast' } } }),
    ),
  },
  {
    id: 9209,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和狼族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9262,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和秘士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Mystic' } } }),
    ),
  },
  {
    id: 9265,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色盟友和巨人盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Giant' } } }),
    ),
  },
  {
    id: 9302,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因玉银林地盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9303,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色和元素盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
    ),
  },
  {
    id: 9304,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因怪兽盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Monster' } } }),
    ),
  },
  {
    id: 9306,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因蓝色和不死族盟友数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 9307,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和纳迦盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Naga' } } }),
    ),
  },
  {
    id: 9349,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因缠绕宝石数而增强。再创造 8 颗缠绕宝石。 [x8]',
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'enemyStatusCount', statusId: 'entangle' } } }),
      createSpecialGems({ kind: 'entangleGem' }, 8, 0),
    ),
  },
  {
    id: 9350,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因秘士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Mystic' } } }),
    ),
  },
  {
    id: 9352,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色和恶魔盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Daemon' } } }),
    ),
  },
  {
    id: 9353,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因盗贼盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9354,
    desc: '对首 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因蛛尔卡里盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9355,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色和人马族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9380,
    desc: '对一名敌人造成 [(魔法 x 2) + 3] 点伤害，伤害值因拥有屏障效果的盟友数而增强。若队伍里有永生神路西法，则爆破 3 颗宝石。 [x6]',
    build: skill(
      dmg('enemyChosen', 3, 2, { modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'allyStatusCount', statusId: 'barrier' } } }),
      explodeRandomGems(3, 0, 'color', undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神路西法' } }),
    ),
  },
  {
    id: 9385,
    desc: '对一名敌人造成 [(魔法 x 2.5)] 点伤害，并使其下方所有敌人陷入出血状态。若队伍里有永生神萨克塔利安，则使所有敌人陷入出血状态。',
    build: skill(
      dmg('enemyChosen', 0, 2.5),
      inflict('bleed', 'enemyAll'),
      inflict('bleed', 'enemyAll', { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神萨克塔利安' } }),
    ),
  },
  {
    id: 9386,
    desc: '将所有绿色宝石转换成妖仙宝石并获得 [魔法 + 2] 点生命值。若队伍里有永生神维拉格，则获得一个额外回合。',
    build: skill(
      transformToSpecial(BaseColor.Green, 'faerieFireGem'),
      extraTurn({ ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神维拉格' } }),
    ),
  },
  {
    id: 9388,
    desc: '净化所有盟友并创造 9 颗冻结宝石。若队伍里有永生神格拉西亚，则再创造 5 颗冻结宝石。 [x10]',
    build: skill(
      cleanse('allyAll'),
      createSpecialGems({ kind: 'freezeGem' }, 9, 0),
      createSpecialGems({ kind: 'freezeGem' }, 5, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '永生神格拉西亚' }, modifier: { mod: { kind: 'multiplier', a: 10 } } }),
    ),
  },
  {
    id: 9576,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因巨人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Giant' } } }),
    ),
  },
  {
    id: 9631,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因元素盟友而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
    ),
  },
  {
    id: 9634,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因哥布林盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Goblin' } } }),
    ),
  },
  {
    id: 9635,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因 Merlantis 盟友数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9688,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因神圣盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 9690,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色盟友和骑士盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Knight' } } }),
    ),
  },
  {
    id: 9693,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和矮人盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dwarf' } } }),
    ),
  },
  {
    id: 9751,
    desc: '对前 2 名敌人造成 [魔法 + 3] 点伤害，伤害值因精灵盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elf' } } }),
    ),
  },
  {
    id: 9753,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友和龙族盟友的数量而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dragon' } } }),
    ),
  },
];

export const BATCH_W04: CuratedBatch = { batch: 'W04', spells: SPELLS, skipped: SKIPPED };
