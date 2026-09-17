/**
 * 窗口 K-B · 武器法术批次 W03（池：scripts/curated-pools/pool-w01.json）。
 *
 * 来源：artifacts/gowhead-weapons/weapons.json（zh 文本逐字锚定，校验见
 * tests/unit/weaponSpellAudit.test.ts——与部队批次的 troops.json 锚定不同源）。
 * 组装规则全部锚定 scripts/spell-rules.md 与既有部队批次先例（详见各 skipped 原因
 * 与 artifacts/weapon-spell-triage.md 的家族分布/原语请求节）。
 * 生成器：scripts/_weapon_pools.mjs gen（规则表 + 人工裁定；机器不猜语义）。
 */
import { armor, attack, createGems, createSpecialGems, createStorm, dmg, dmgSplash, explodeRandomGems, gainGold, heal, inflict, inflictRandom, mana, skill, summonRandom, transform, transformToSpecial, trueDmg, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8395, reason: '未识别子句「若敌人是不死族，则消除其全部护甲值」（无匹配规则）' },
  { id: 8396, reason: '未识别子句「没有一名恶魔敌人则获得 [魔法 + 1] 点护甲值并赋予一名随机盟友屏障效果」（无匹配规则）' },
  { id: 8397, reason: '未识别子句「耗掉一名敌人所有法力值」（无匹配规则）' },
  { id: 8398, reason: '未识别子句「死亡标记一名敌人，造成[魔法 + 3]点伤害，由黄宝石激发」（无匹配规则）' },
  { id: 8399, reason: '未识别子句「赋予所有圣唐盟友一个随机状态效果」（按王国（圣唐）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8400, reason: '未识别子句「从所有敌人中清空两个玛那，石墩激活」（无匹配规则）' },
  { id: 8401, reason: '未识别子句「对一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身灵魂数而增强」（修饰来源无法解析「自身灵魂数」）' },
  { id: 8402, reason: '未识别子句「每有一位矮人盟友则创造 6 颗混合蓝色和棕色的宝石」（无匹配规则）' },
  { id: 8404, reason: '缺失状态（法印，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 8409, reason: '未识别子句「若有机械盟友，则先消除敌人 30 点护甲值」（无匹配规则）' },
  { id: 8434, reason: '未识别子句「每有一名黑石盟友，则创造 6 颗混合蓝色和紫色的宝石」（无匹配规则）' },
  { id: 8435, reason: '未识别子句「每有一名牛头族盟友，则创造 6 颗混合绿色和棕色的宝石」（无匹配规则）' },
  { id: 8436, reason: '未识别子句「若有 13 或更多颗棕色宝石，则获得 2 点魔法值」（无匹配规则）' },
  { id: 8439, reason: '未识别子句「再给予其四分之一的法力值」（无匹配规则）' },
  { id: 8441, reason: '未识别子句「若敌人使用紫色法力，则使其陷入死亡标记状态」（状态目标无法解析「若敌人使用紫色法力，则使其陷入死亡标记状态」）' },
  { id: 8442, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8443, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8444, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8445, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8446, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8447, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8448, reason: '未识别子句「爆破 1 行或 1 列」（无匹配规则）' },
  { id: 8450, reason: '未识别子句「若敌人攻击力高于自身，则有 20% 的几率杀死对方」（无匹配规则）' },
  { id: 8451, reason: '未识别子句「赋予所有卜筮之原盟友一个随机状态效果」（按王国（卜筮之原）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8452, reason: '未识别子句「每有一名龙爪盟友则创造 6 颗混合红色和紫色的宝石」（无匹配规则）' },
  { id: 8453, reason: '未识别子句「对敌人造成[魔法 + 7]点伤害，由风暴峡湾盟友激发」（伤害句残留无法解析「由风暴峡湾盟友激发」）' },
  { id: 8455, reason: '未识别子句「赋予所有厄什卡盟友一个随机正面增益效果」（群体名称无法可靠映射到种族/王国「厄什卡」（语义拿不准））' },
  { id: 8456, reason: '未识别子句「再召唤一名不死族军队」（无匹配规则）' },
  { id: 8461, reason: '未识别子句「再获得一个额外回合或召唤一名随机科博」（无匹配规则）' },
  { id: 8487, reason: '未识别子句「每有一位黑鹰盟友则创造 6 颗混合蓝色和红色的宝石」（无匹配规则）' },
  { id: 8490, reason: '未识别子句「再召唤一名机械军队」（无匹配规则）' },
  { id: 8505, reason: '未识别子句「赋予所有狂野平原盟友一个随机状态效果」（按王国（狂野平原）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8506, reason: '未识别子句「每有一位破碎尖塔盟友则创造 6 颗混合红色和棕色的宝石」（无匹配规则）' },
  { id: 8507, reason: '未识别子句「创造等同于被移除的紫色宝石数的黄色宝石」（无匹配规则）' },
  { id: 8508, reason: '未识别子句「若对方已陷入中毒状态，则使其陷入叠加 4 倍的出血状态」（状态目标无法解析「若对方已陷入中毒状态，则使其陷入叠加 4 倍的出血状态」）' },
  { id: 8509, reason: '未识别子句「再召唤一名秘士军队」（无匹配规则）' },
  { id: 8510, reason: '未识别子句「赋予所有冰峰之巅盟友一个随机状态效果」（按王国（冰峰之巅）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8511, reason: '未识别子句「选定一个颜色以移除所有同色宝石」（无匹配规则）' },
  { id: 8512, reason: '未识别子句「结果 [魔法 + 3] 给予一名敌人重击」（无匹配规则）' },
  { id: 8513, reason: '未识别子句「赋予所有破碎尖塔盟友一个随机正面增益效果」（按王国（破碎尖塔）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8514, reason: '未识别子句「赋予所有葛洛什奈克盟友一个随机正面增益效果」（按王国（葛洛什奈克）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8515, reason: '未识别子句「给予所有卡拉科斯盟友一个随机状态效果」（群体名称无法可靠映射到种族/王国「卡拉科斯」（语义拿不准））' },
  { id: 8518, reason: '未识别子句「每摧毁一颗紫色宝石则燃烧一名随机敌人」（无匹配规则）' },
  { id: 8520, reason: '未识别子句「窃取第一位敌人 [(魔法 / 2) + 2] 点生命值，并创造 7 颗蓝色宝石」（无匹配规则）' },
  { id: 8521, reason: '未识别子句「结果 [魔法 + 3] 给予一名敌人超级重击」（无匹配规则）' },
  { id: 8529, reason: '未识别子句「摧毁 [魔法 + 1] 颗敌人队伍使用对多的颜色宝石」（无匹配规则）' },
  { id: 8554, reason: '缺失状态（狼化，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 8577, reason: '未识别子句「创建 3-8 颗拥有各种翻倍量的通配宝石」（无匹配规则）' },
  { id: 8578, reason: '未识别子句「制造 3 种药水，蓝色、绿色、红色、黄色或紫色」（无匹配规则）' },
  { id: 8617, reason: '未识别子句「获得 [魔法 + 1] 点生命值，并赋予一名选定盟友 2 点魔法值」（增益句残留「，并赋予一名选定盟友 2 魔法值」）' },
  { id: 8618, reason: '未识别子句「再使其陷入中毒或死亡标记状态」（状态目标无法解析「再使其陷入中毒或死亡标记状态」）' },
  { id: 8619, reason: '未识别子句「对一名随机敌人造成 [魔法 + 1] 点真实伤害，并随机摧毁一列」（伤害句残留无法解析「并随机摧毁一列」）' },
  { id: 8620, reason: '未识别子句「对敌人造成 [魔法 + 7] 点伤害，由古尔瓦尼亚盟友增强」（伤害句残留无法解析「由古尔瓦尼亚盟友增强」）' },
  { id: 8621, reason: '未识别子句「然后召唤一支怪物军团」（无匹配规则）' },
  { id: 8622, reason: '未识别子句「赋予所有冥河盟友一个随机状态效果」（群体名称无法可靠映射到种族/王国「冥河」（语义拿不准））' },
  { id: 8623, reason: '特殊宝石家族未实现（元素星，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8640, reason: '未识别子句「对一名敌人造成 [魔法 + 3] 点伤害，敌人每陷入以下一个状态效果则再造成 12 点伤害：缠绕、燃烧、冻结、击晕」（伤害句残留无法解析「敌人每陷入以下一个状态效果则再造成 12 点伤害：缠绕、燃烧、冻结、击晕」）' },
  { id: 8641, reason: '未识别子句「创建 8 颗绿色宝石，再创建 8 颗红色宝石，再创建 8 颗蓝色宝石，再创建 8 颗棕色宝石」（无匹配规则）' },
  { id: 8642, reason: '未识别子句「若敌人来自诺斯，或战斗发生在诺斯，则造成双倍伤害」（王国条件倍率（「若敌人来自诺斯/战斗发生在该王国」无对应条件原语，batch-23 9376 同款）→ 原语请求：kingdom 条件）' },
  { id: 8643, reason: '未识别子句「造成 [(魔法 x 2) + 6] 点真实散射伤害，再将末位敌人拉到前方」（伤害类型无法解析）' },
  { id: 8645, reason: '未识别子句「每有一名诺斯盟友，则创建 6 颗混合红色和棕色的宝石」（无匹配规则）' },
  { id: 8647, reason: '特殊宝石家族未实现（元素星，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8664, reason: '未识别子句「对末位敌人造成 [魔法 + 3] 点真实伤害，有 6% 的几率将其杀戮」（无匹配规则）' },
  { id: 8668, reason: '未识别子句「使一名敌人陷入所有负面状态效果，并赋予自身所有正面状态效果」（无匹配规则）' },
  { id: 8669, reason: '未识别子句「每有一名齐埃金盟友则创建 6 颗混合绿色和棕色的宝石」（无匹配规则）' },
  { id: 8670, reason: '未识别子句「赋予所有玉银林地盟友一个随机正面增益效果」（按王国（玉银林地）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8680, reason: '特殊宝石家族未实现（临界星，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8696, reason: '未识别子句「爆破 3 颗宝石，再创造一颗许愿宝石」（无匹配规则）' },
  { id: 8698, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8699, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8700, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8701, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8702, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8703, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8706, reason: '未识别子句「再召唤一名哥布林军队」（无匹配规则）' },
  { id: 8707, reason: '未识别子句「赋予所有盖塔尔盟友一个随机正面增益效果」（按王国（盖塔尔）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8708, reason: '未识别子句「赋予所有建造盟友一个随机正面增益效果」（群体名称无法可靠映射到种族/王国「建造」（语义拿不准））' },
  { id: 8721, reason: '未识别子句「选择一宝石，摧毁其行和列」（无匹配规则）' },
  { id: 8725, reason: '未识别子句「赋予所有阿达纳盟友一个随机正面增益状态效果」（按王国（阿达纳）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8726, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8727, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8728, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8729, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8730, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8731, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8761, reason: '未识别子句「再给予所有盟友 [魔法 + 4] 点护甲值，数量因燃烧宝石数而增强」（无匹配规则）' },
  { id: 8762, reason: '未识别子句「将所有向上或向下斜方宝石转换成燃烧宝石」（无匹配规则）' },
  { id: 8763, reason: '未识别子句「再召唤一名精灵军队」（无匹配规则）' },
  { id: 8764, reason: '未识别子句「再召唤一名骑士盟友」（无匹配规则）' },
  { id: 8765, reason: '未识别子句「给予所有潘神之谷盟友一个随机正面增益效果」（按王国（潘神之谷）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8766, reason: '未识别子句「给予所有剑锋崖盟友一个随机正面增益效果」（按王国（剑锋崖）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8768, reason: '特殊宝石家族未实现（善石像鬼，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8769, reason: '未识别子句「对一名敌人造成 [魔法 + 3] 点真实伤害，伤害值因石块数量而增强」（修饰来源无法解析「石块数量」）' },
  { id: 8770, reason: '未识别子句「再召唤一名巨人军队」（无匹配规则）' },
  { id: 8771, reason: '未识别子句「给予所有罗格盟友一个随机状态效果」（群体名称无法可靠映射到种族/王国「罗格」（语义拿不准））' },
  { id: 8773, reason: '缺失状态（法印，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 8776, reason: '未识别子句「若自身队伍中有黛希德莫娜， 则使对方陷入叠加 2 次的出血状态」（条件兵种引用无法解析「黛希德莫娜， 」（troops.json 无此中文名））' },
  { id: 8777, reason: '未识别子句「赋予所有盟友 [魔法 + 1] 点生命值」（无匹配规则）' },
  { id: 8805, reason: '特殊宝石家族未实现（石像鬼宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8806, reason: '特殊宝石家族未实现（石像鬼宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8807, reason: '未识别子句「若敌人来自地狱悬崖或战斗位于地狱悬崖，则造成双倍伤害」（王国条件倍率（「若敌人来自地狱悬崖或战斗位于地狱悬崖/战斗发生在该王国」无对应条件原语，batch-23 9376 同款）→ 原语请求：kingdom 条件）' },
  { id: 8808, reason: '特殊宝石家族未实现（石像鬼宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8809, reason: '未识别子句「每有一名地狱悬崖盟友，则创造 6 颗混合红色和棕色的宝石」（无匹配规则）' },
  { id: 8810, reason: '特殊宝石家族未实现（石像鬼宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8811, reason: '未识别子句「对一名敌人造成 [魔法 + 4] 点伤害，伤害值因棕色盟友和建造盟友数二增强」（伤害句残留无法解析「伤害值因棕色盟友和建造盟友数二增强」）' },
  { id: 8816, reason: '未识别子句「再召唤一名黑曜石深渊军队」（无匹配规则）' },
  { id: 8829, reason: '未识别子句「再将 8 颗黄色宝石转换成极度末日骷髅头」（无匹配规则）' },
  { id: 8842, reason: '缺失状态（反射，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 8843, reason: '特殊宝石家族未实现（龙族宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8872, reason: '特殊宝石家族未实现（巨人宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8873, reason: '特殊宝石家族未实现（巨人宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8874, reason: '特殊宝石家族未实现（巨人宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8875, reason: '未识别子句「若敌人来自沃尔帕克，或战斗位于沃尔帕克，则造成双倍伤害」（无匹配规则）' },
  { id: 8877, reason: '未识别子句「对一名敌人造成 [魔法 + 7] 点伤害，伤害只因沃尔帕克盟友数而增强」（伤害句残留无法解析「伤害只」）' },
  { id: 8879, reason: '未识别子句「对末位敌人造成 [魔法 + 3] 点伤害，并窃取 3 点魔法值」（无匹配规则）' },
  { id: 8900, reason: '特殊宝石家族未实现（灵力宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8905, reason: '未识别子句「赋予所有迈纳杰之罪盟友一个随机正面增益状态效果」（按王国（迈纳杰之罪）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8906, reason: '未识别子句「再召唤一名人类军队」（无匹配规则）' },
  { id: 8907, reason: '未识别子句「赋予所有蛮族盟友一个随机正面增益状态效果」（群体名称无法可靠映射到种族/王国「蛮族」（语义拿不准））' },
  { id: 8909, reason: '未识别子句「再召唤一名兽人军队」（无匹配规则）' },
  { id: 8910, reason: '未识别子句「再召唤一名矮人军队」（无匹配规则）' },
  { id: 8911, reason: '未识别子句「赋予所有荆棘森林盟友一个随机正面增益效果」（按王国（荆棘森林）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8946, reason: '未识别子句「再使他们陷入织网和中毒状态」（状态目标无法解析「再使他们陷入织网和中毒状态」）' },
  { id: 8947, reason: '未识别子句「创建 6 颗织网宝石，并获得一个额外回合」（无匹配规则）' },
  { id: 8948, reason: '特殊宝石家族未实现（灵力宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8951, reason: '特殊宝石家族未实现（灵力宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8952, reason: '未识别子句「若对方陷入猎人标记状态，则窃取其 6 点生命值」（状态目标无法解析「若对方陷入猎人标记状态，则窃取其 6 点生命值」）' },
  { id: 8954, reason: '未识别子句「再召唤一名妖仙军队」（无匹配规则）' },
  { id: 8955, reason: '未识别子句「赋予所有厄什卡亚盟友一个随机正面增益效果」（按王国（厄什卡亚）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 8956, reason: '未识别子句「再召唤一名龙族军队」（无匹配规则）' },
  { id: 8965, reason: '缺失状态（祝福，不在 spell-rules §6 状态词表，batch-03 8387 / batch-04 8919 同款）' },
  { id: 8966, reason: '未识别子句「将选定的法力宝石转换为 x3 通配符」（无匹配规则）' },
  { id: 8971, reason: '未识别子句「如果盟友来自白盔国，则为他们提供屏障」（无匹配规则）' },
  { id: 8972, reason: '特殊宝石家族未实现（天使宝石，等 GEMS-SEMANTICS-2 后续波，DECISIONS 翻案记录②）' },
  { id: 8988, reason: '未识别子句「所选列每有一颗骷髅头或紫色宝石，则创造一个死亡标记宝石」（无匹配规则）' },
  { id: 8989, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8990, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8991, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8992, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8993, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8994, reason: '武器淬炼段位加成（每锻炼 1 个武器段位/每级回火…）无战斗内机制对应，Doomed 档专属 → 原语请求：tempering 段位缩放来源' },
  { id: 8999, reason: '未识别子句「对一名敌人造成 [魔法 + 3] 点轻量溅射伤害」（伤害类型无法解析）' },
  { id: 9018, reason: '未识别子句「再爆破 4 颗宝石」（无匹配规则）' },
  { id: 9031, reason: '未识别子句「将 3 颗绿色宝石转换成赃物宝石」（无匹配规则）' },
  { id: 9034, reason: '未识别子句「赋予所有诺斯盟友一个随机正面增益状态效果」（按王国（诺斯）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9035, reason: '未识别子句「再召唤一名恶魔军队」（无匹配规则）' },
  { id: 9036, reason: '未识别子句「赋予所有梅兰堤斯盟友一个随机正面增益效果」（按王国（梅兰堤斯）限定盟友目标无对应原语（batch-22 8607 同款）→ 原语请求：kingdom 目标限定）' },
  { id: 9110, reason: '未识别子句「创造 15 颗混合蓝色和骷髅头的宝石」（混合宝石含骷髅头/特殊宝石端点，无 mix 原语（原语请求：createMix 扩特殊宝石端点））' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8403,
    desc: '获得屏障效果。对一名敌人造成 [魔法 + 3] 点伤害并使其陷入沉默状态。',
    build: skill(
      inflict('barrier', 'allySelf'),
      dmg('enemyChosen', 3, 1),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    id: 8432,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人已被诅咒，则创造 8 颗绿色宝石。若敌人已陷入织网状态，则创造 8 颗紫色宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      createGems(BaseColor.Green, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
      createGems(BaseColor.Purple, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'web' } }),
    ),
  },
  {
    id: 8437,
    desc: '爆破 [魔法 + 1] 颗黄色宝石。赋予所有神祇盟友一个随机状态效果。召唤一名神祇军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Yellow),
      inflictRandom('allyAll', { targetRace: 'Divine' }),
      summonRandom(['StarGazer', 'Priestess', 'Paladin', 'ArchonStatue', 'SacredGuardian', 'Valkyrie', 'Celestasia', 'Mercy', 'Valor', 'MorthanisWill', 'TheDevoted', 'GrandInquisitor', 'GaardsAvatar', 'Pharos-Ra', 'ForestGuardian', 'BastitePriestess', 'JotnarStormshield', 'KetrasTheBull', 'Stonehammer', 'Bishop', 'HighPaladin', 'QueenAurora', 'Infernus', 'YasminesChosen', 'Euryali', 'MonkeyDisciple', 'XiongMao', 'Diviner', 'Penglong', 'VoiceOfOrpheus', 'Skadi', 'DivineIshbaala', 'WarCleric', 'StatueOfSt.Veritas', 'SisterSuperior', 'Undine', 'Divinia', 'Ubastet', 'Suna', 'Nightshade', 'HolySt.Astra', 'Qilin', 'Gravitas', 'Umenath', 'WillOfNysha', 'Solari', 'Patience', 'Virtue', 'Ishtara', 'Ankhnum', 'FlameOfAnu', 'Quetzalma', 'HighPriestessChazka', 'TheArchdeva', 'Baihu', 'Vernalis', 'Huanglong', 'Veneratus', 'Ullor', 'AstralMother', 'UrielleTheGuardian', 'ArchproxyYvendra', 'WaterbornPriestess', 'Ascendance', 'Libara', 'Sagittarian', 'PriestessOfLight', 'Rath-Amon', 'PriestOfNilbog', 'Fenix', 'Zhuque', 'OrpheusPriestess', 'HighCleric', 'CommanderDawnheart', 'Aravatar', 'MouthOfZorn', 'Dominion', 'Virago', 'MorthanisDarkness', 'GuardianOfLaw', 'TheTurquoiseEmperor', 'TawaritePriestess', 'Takshaka', 'Amatiel', 'TheBlessedMaiden', 'Retribution', 'HolyArcher', 'Peregrine', 'Gormungandr', 'Xuanwu', 'HanXin', 'HorusiteChampion', 'SekhitePriestess', 'ImmortalZachariel', 'Raquel', 'Sarathiel', 'Cascabel', 'Onouris']),
    ),
  },
  {
    id: 8440,
    desc: '消除 [魔法 + 1] 点随机技能值，再使一名敌人陷入诅咒、死亡标记和疾病状态。',
    build: skill(
      inflict('death-mark', 'enemyRandomN'),
    ),
  },
  {
    id: 8449,
    desc: '爆破 [魔法 + 1] 颗红色宝石。赋予所有纳迦盟友一个随机状态效果。召唤一名纳迦军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Red),
      inflictRandom('allyAll', { targetRace: 'Naga' }),
      summonRandom(['ScaleGuard', 'PoisonMaster', 'Lamia', 'Marilith', 'NagaQueen', 'BoneNaga', 'Euryali', 'Viper', 'Tai-Pan', 'Fangblade', 'SkulkFang', 'Vassara', 'HornedAsp', 'Setauri', 'ShamanOfSet', 'ChiefDargon', 'Kobra', 'AlgorakTheSlayer', 'Treachery', 'Deminaga', 'Mambasira', 'RoyalAssassin', 'Kobold', 'KoboldKnight', 'KoboldMagi', 'Emperinazara', 'WrathNaga', 'Medusa', 'Stheno', 'KoboldEmissary', 'SetauriGladius', 'SetauriMage', 'Salamandria', 'Takshaka', 'Weresnake', 'Slitherling', 'KoboldThief', 'MelekTauss', 'Cascabel', 'Bothros', 'SetauriSkulk', 'Manasa']),
    ),
  },
  {
    id: 8454,
    desc: '对最后一个敌人造成 [魔法 + 2] 真实伤害，伤害值因红色和紫色宝石而增强。召唤地狱风暴。 [x2]',
    build: skill(
      trueDmg('enemyLast', 2, 1, { trueDamage: true, modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] } }),
      createStorm(BaseColor.Red),
    ),
  },
  {
    id: 8516,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值和 4 点法力值。',
    build: skill(
      armor('allyAll', 1, 1),
      mana('allyAll', 4, 0),
    ),
  },
  {
    id: 8517,
    desc: '获得 [魔法 + 1] 点生命值。再创造 7 颗红色宝石或获得一个额外回合，或爆破一颗随机宝石。',
    build: skill(
      heal('allySelf', 1, 1),
      createGems(BaseColor.Red, 7, 0),
    ),
  },
  {
    id: 8519,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害并将其缠绕。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('entangle', 'lastTarget'),
    ),
  },
  {
    id: 8576,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有野兽盟友一个随机的状态效果。召唤一名野兽军队。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Beast' }),
      summonRandom(['Rhynax', 'Pegasus', 'Owlbear', 'SacredGuardian', 'BoarRider', 'BlackBeast', 'SabertoothLion', 'GriffonKnight', 'Serpent', 'Warhound', 'Hippogryph', 'GiantSpider', 'DireWolf', 'Kerberos', 'SpiderSwarm', 'Roc', 'Fenrir', 'Salamander', 'Hellhound', 'BunniNog', 'Jackelope', 'Yeti', 'WinterWolf', 'SpiritFox', 'Hellcat', 'Moa', 'FireLizard', 'LionPrince', 'SandCobra', 'Dragonmoth', 'WingedBison', 'ArmoredBoar', 'WarGoat', 'Sunsail', 'Warg', 'Frostling', 'BoneScorpion', 'SnowyOwl', 'GiantToad', 'Werewolf', 'ForestGuardian', 'Wulfgarok', 'Minogor', 'Unicorn', 'Penguin', 'Aurai', 'FrostLizard', 'Drake', 'QueenAurora', 'Parrot', 'Cocoon', 'RiftLynx', 'Valraven', 'Falconer', 'Warhawk', 'Sunbird', 'DragonTurtle', 'Spinnerette', 'GiantCrab', 'Hippocampus', 'Merlion', 'Zhenniao', 'CatSith', 'BatSwarm', 'Umberwolf', 'Bulette', 'Hyena', 'Mammoth', 'OwlRider', 'Stone-Shaker', 'PharaohHound', 'TombSpider', 'Willow', 'Gorbil', 'DireBoar', 'CuSith', 'Nightmare', 'MidgeSwarm', 'FestivalCow', 'ArcticFox', 'Barghast', 'GriffStonefeather', 'Rhynaggor', 'TurtleCannon', 'Bunnicorn', 'Nightwing', 'Plainsjumper', 'MoonRabbit', 'Qilin', 'VineMarten', 'WoodRhynax', 'SnowPanther', 'UrskayanBlue', 'HornedAsp', 'Necrocorn', 'Glutmaw', 'CorpseMare', 'ROVER-300', 'Frostfeather', 'Grimcorn', 'HarpyEagle', 'Droggo', 'Kryshound', 'WarWolf', 'GuardianOfTheFields', 'Amaru', 'DireCub', 'Tutankhatmun', 'DandyLion', 'Crysturtle', 'Werebird', 'Werebear', 'Werecat', 'BeastmasterTorbern', 'SirQuentinHadley', 'ChaosHound', 'P4-NTH4', 'MechaRat', 'Blightwing', 'DynamiteGoat', 'Netherhound', 'SwampRat', 'Basilisk', 'WarElephant', 'Axolotl', 'Doombat', 'DreadSteed', 'LordBelanor', 'Amarok', 'ArmoredBoarlet', 'DeepHuntsman', 'FlameOfAnu', 'NightSpider', 'Kharybdis', 'Pan', 'CarrionCrow', 'SnowyOwlbear', 'Baihu', 'UlfsMascot', 'Hatir&Skroll', 'HatirAscendant', 'SkrollReborn', 'Wereraven', 'Werebat', 'Wereverine', 'TheWerestag', 'Devourer', 'IceOrca', 'Wererat', 'Swanmay', 'Wereshark', 'SkyScorpion', 'AransiTheGuardian', 'NaturebornWolf', 'FirebornEagle', 'WaterbornOwl', 'StonebornLion', 'MoonPhoenix', 'Leocorn', 'Catterfly', 'BrianTheClucky', 'Narwhale', 'SteelCobra', 'SkyGoat', 'Shadowbeast', 'LavaScorpion', 'Kitsune', 'Crystalynx', 'Mechamare', 'LordArchimedus', 'Mechweaver', 'Deathclaw', 'Tauraeus', 'EagleOwl', 'FloraFawn', 'CryptHound', 'FlameRhynax', 'FireBeetle', 'StoneViper', 'Leio', 'Craghound', 'Anglerfin', 'BORK-3000', 'Scoprio', 'HoundOfLiang', 'RedFox', 'Vulperus', 'Inari', 'Zhuque', 'Negasus', 'DeadParrot', 'AxeBeak', 'Deathgaunt', 'FeyHound', 'SandCat', 'CobaltDrake', 'StonePanther', 'MantaRaider', 'SkellyCat', 'Grimfeather', 'Werehound', 'RatSwarm', 'LeapingSpider', 'BoneHound', 'TheBestialFey', 'Egris', 'Caribou', 'ArcaneSabercat', 'DeephornBeetle', 'Bloodfang', 'GiantBadger', 'Adelwing', 'BrassDrake', 'UndeadLion', 'Valhawk', 'ManeCourser', 'Weresnake', 'FirebornLynx', 'Amphib-o-Bot', 'MidwinterLycan', 'Mistlark', 'WargSpirit', 'Moonfeather', 'YetiCub', 'DeepSpider', 'BlightHound', 'ShadowBeetle', 'DuskOwlbear', 'WingedDonkey', 'Foxglove', 'Peregrine', 'LionOfYaoGuai', 'ImmortalScoprio', 'ZombieGoat', 'RottingSerpent', 'Treviamus', 'Reavnarokkr', 'Yue-She', 'BloomManatee', 'FelineOfEnvy', 'Azaleus', 'Xuanwu', 'Scrollweaver', 'ImmortalLeio', 'Cosmo', 'Dragonhawk', 'WEEZL-300', 'Rockraptor', 'CaravanCamel', 'Gindibu', 'Yohaulticetl', 'Warmadillo', 'ToxicPuffer', 'Warfang', 'GriffonCaptain', 'PoisonedUrsidae', 'CaveMole', 'ManedWolf', 'FrostSpider', 'CaveCrawler', 'RagingBull', 'Tetramorph']),
    ),
  },
  {
    id: 8616,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因骷髅头数而增强。 [2:1]',
    build: skill(
      dmg('enemyFirstN', 3, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 8644,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色和元素盟友而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elemental' } } }),
    ),
  },
  {
    id: 8646,
    desc: '每有一名蓝色盟友或元素盟友，则爆破 4 颗宝石。 [x4]',
    build: skill(
      explodeRandomGems(4, 0, 'color', undefined, { modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'teamSize', side: 'ally' }] } }),
    ),
  },
  {
    id: 8697,
    desc: '对一名敌人造成 [魔法 + 6] 点严重溅射伤害，伤害值因诅咒宝石数量而增强。若自身队伍里有暗黑铁匠迪恩扎，则创造 4 颗诅咒宝石。 [x4]',
    build: skill(
      dmgSplash('enemyChosen', 6, 1, { range: 'splash', modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } } }),
      createSpecialGems({ kind: 'curseGem' }, 4, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '暗黑铁匠迪恩扎' } }),
    ),
  },
  {
    id: 8714,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，将所有蓝色宝石转换成燃烧宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      transformToSpecial(BaseColor.Blue, 'burningGem'),
    ),
  },
  {
    id: 8767,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色和不死族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 8774,
    desc: '造成 [魔法 + 7] 点散射伤害。若自身队伍中有泽菲罗斯，则爆破 5 颗宝石。 [x5]',
    build: skill(
      dmg('enemyAll', 7, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 5 } } }),
      explodeRandomGems(5, 0, 'color', undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '泽菲罗斯' } }),
    ),
  },
  {
    id: 8775,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害。若自身队伍中有红玫瑰，则获得 40 黄金。',
    build: skill(
      trueDmg('enemyChosen', 1, 1, { trueDamage: true }),
      gainGold(40, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '红玫瑰' } }),
    ),
  },
  {
    id: 8778,
    desc: '对首 2 名敌人造成 [魔法 + 1] 点伤害。若自身队伍中有暗影猎手，则获得 5 点攻击力。',
    build: skill(
      dmg('enemyFirstN', 1, 1, { n: 2 }),
      attack('allySelf', 5, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '暗影猎手' } }),
    ),
  },
  {
    id: 8869,
    desc: '&& 给予所有盟友 [魔法 + 1] 点护甲值 &&给予所有其他盟友屏障效果',
    build: skill(
      armor('allyAll', 1, 1),
      inflict('barrier', 'allyOthers'),
    ),
  },
  {
    id: 8876,
    desc: '&& 将所有绿色宝石转换成一个选定颜色 && 爆破一颗宝石。创造 10 颗绿色宝石',
    build: skill(
      transform(BaseColor.Green, CHOSEN),
      explodeRandomGems(1, 0, 'color', undefined),
      createGems(BaseColor.Green, 10, 0),
    ),
  },
  {
    id: 8878,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色盟友和狼族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'teamSize', side: 'ally' } } }),
    ),
  },
  {
    id: 8908,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色盟友数和精灵盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Elf' } } }),
    ),
  },
  {
    id: 8995,
    desc: '爆破一颗宝石。给予所有盟友 [魔法 + 1] 点护甲值，数值因被摧毁的炸弹宝石数而增强。 [x2]',
    build: skill(
      explodeRandomGems(1, 0, 'color', undefined),
      armor('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'bomb' } } }),
    ),
  },
  {
    id: 8996,
    desc: '对 2 名随机敌人造成 [魔法 + 2] 点真实伤害。再创造 5 颗炸弹宝石。',
    build: skill(
      trueDmg('enemyRandomN', 2, 1, { trueDamage: true, n: 2 }),
      createSpecialGems({ kind: 'bomb' }, 5, 0),
    ),
  },
  {
    id: 8997,
    desc: '对首位敌人造成 [魔法 + 5] 点伤害。再创造 7 颗红色宝石。',
    build: skill(
      dmg('enemyFront', 5, 1),
      createGems(BaseColor.Red, 7, 0),
    ),
  },
  {
    id: 8998,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再创造 7 颗蓝色宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1),
      createGems(BaseColor.Blue, 7, 0),
    ),
  },
  {
    id: 9019,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色盟友和龙族盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 9030,
    desc: '对首 2 位敌人造成 [魔法 + 2] 点真实伤害，伤害值因赃物宝石数而增强。 [x3]',
    build: skill(
      trueDmg('enemyFirstN', 2, 1, { trueDamage: true, n: 2, modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'bootyGem' } } }),
    ),
  },
  {
    id: 9032,
    desc: '对所有敌人造成 [魔法 + 2] 点真实伤害。再创造 3 颗赃物宝石，并爆破 5 颗宝石。',
    build: skill(
      dmg('enemyAll', 2, 1, { range: 'all', trueDamage: true }),
      createSpecialGems({ kind: 'bootyGem' }, 3, 0),
    ),
  },
  {
    id: 9033,
    desc: '爆破 [魔法 + 1] 颗绿色宝石。赋予所有哥布林盟友一个随机状态效果。',
    build: skill(
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      inflictRandom('allyAll', { targetRace: 'Goblin' }),
    ),
  },
  {
    id: 9037,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，数值因蓝色盟友数和骑士盟友数而增强。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'alliesOfRace', race: 'Knight' } } }),
    ),
  },
];

export const BATCH_W03: CuratedBatch = { batch: 'W03', spells: SPELLS, skipped: SKIPPED };
