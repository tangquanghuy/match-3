/**
 * 放弃桶回收批 R22（2026-09-18）：92 条硬尾终攻坚批。
 *
 * 工作面 = batch-r21 SKIPPED 全量 92 条（= tmp/remaining_all.json 92 unique id），
 * 即 R1-R21 全词汇重判后仍留弃的硬尾。本批新增引擎原语后逐一三判：
 *
 * 新增原语（引擎最小扩展，见各文件 R22 注记）：
 * - 吞噬 devour（effects/devour.ts）：即杀 + 官方额度成长（+2 攻/甲/魔、+5 生命），
 *   devourImmunity 特质互斥；概率在原语内部掷签（8573/9364/9492）。
 * - 数值区间 rangeSpec（buff/reduce）：GenerateRandomMana「3-8 点法力」/ 8055 护甲区间 /
 *   8356「耗掉 1-3 点法力」（7469/8931/9055/9181/8055/8356）。
 * - 随机分摊 splitRandom（damage）：「8 点伤害随机分配给所有敌人」（7207）。
 * - 计数驱动施加 perCount（status）：「每有一名X则使一名随机Y」（8427/9252/9287/9341）。
 * - 混合创造 mixAny（gems）：色 + 骷髅/特殊宝石逐颗掷选（8880/9780）。
 * - 一行三格 row3 + RANDOM 中心 + chosenCross + 骷髅限定爆破 + 双色并集池
 *   （7000/9052/7253/7136/8504/8429）。
 * - 编队/追踪目标 enemyNextDown / lastTargets(First/Last) / lastDamaged + swapPositions
 *   （8248/8220/8320/9812/7555/7992/7747）+ transformSelfFrom / summonCopy（8187/8188/8190/8273）。
 * - 条件族 lastTargetStatus/Race/Color、lastTargetSurvived、anyTrackedDied、targetHasAnyStatus、
 *   targetStatBeatsCaster（7541/8276/8533/8534/8467/8550/8248/8694/9986/9812/7263/7935/7960/7747）。
 * - 来源族 destroyedGems{skulls/special}、boardGems{CHOSEN/ENEMY_MOST_USED}、enemyStatSum{color,mana}、
 *   allyStatSum{excludeSelf}、targetStat{missingHp,manaCost}、enemyFull、casterStatBeatsCount、
 *   lastDamage、chosenStat（7388/7977/8812/8927/9492/8060/8355/8367/7506/7651/7464/7472/7808/8406/
 *   7812/7274/9571/8659）。
 *
 * 判读依据 = 官方英文原句（data/raw/spells.gow.en.json 按 stats.spell.id 对齐）与官方
 * SpellSteps（data/raw/gow-2026-09-18/spells.en.json RawData.SpellSteps，8504 以下 id 段可用；
 * 7000-7992 旧咒语无步骤数据，按既有 r12-r21 口径判读），原句优先于机翻 ZH。
 *
 * 「打错敌人」五连（7254/7314/7386/8108/8307）：8108/8307 官方步骤实锤为「两段伤害各自掷签
 * （FromTarget + RandomEnemy）」，ZH「50% 打错/打中另一名」是机翻合并——三张旧卡（同族措辞）
 * 按同构两段伤害组装，不再走「目标偏移」猜测。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, cleanse, reduce, steal,
  drainMana, inflict, createGems, createSkulls, createSpecialGems, createGemsMixAny, transform,
  destroyRandomRows, destroyRandomCols, destroyArea, destroyChosenCross, explodeRandomGems,
  explodeRandomGemsAny, explodeRandomSkulls, summonRef, summonRandom, extraTurn, sacrifice,
  devour, summonCopy, swapPositions, transformSelfFrom, boostPer, gainSouls, gainGold, scale, flat,
} from '../builders';
import { BaseColor } from '../../types';
import type { CondMult } from '../effects/secondary';

/** 「如果敌人是 Boss，则根据我的升华等级造成 3 倍伤害」（r18 BOSS_ASC3 同款惰性建模） */
const BOSS_ASC3: CondMult = {
  times: 3,
  cond: { kind: 'allOf', of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }] },
};

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8320, reason: '已被并发批次 batch-p41 收录（enemyChosenAndAdjacent 官方步骤口径），此处避让防批间重复（r17 同款约定）' },
  // 【法力灼烧（无伤害数值 + meta.modifier 空）】
  { id: 7328, reason: '「施放法力灼烧，伤害值因自身魔法值而增强」= 灼烧伤害公式原文无数值，且 meta.modifier 为空不许挂 modifier（r17/r18/r21 口径维持）；Yellow→Blue 转换本身可表' },
  // 【伤害基数=攻击力 + [x10] 双结构】
  { id: 7483, reason: '「伤害值等同于自身的攻击力，并因棕色敌军数量而增强 [x10]」= 伤害基数=攻击力（×1）与来源计数（×10）双结构，modifier 单 mod 无法同表（r21 编码歧义不猜口径维持）' },
  // 【泛指「一名盟友的攻击力」来源】
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友（哪一名？）无来源 kind（allyStatSum 为总和、chosenStat 为选定目标），数值区间本身已可表（r17/r18/r21 口径维持）' },
  // 【凤凰涅槃自复活】
  { id: 7542, reason: '「凤凰涅槃浴火重生」= 自复活无引擎机制（r18 口径维持）；散射+selfStat hp 增强本身可表' },
  // 【跨段时序绑定（冻结前状态快照）】
  { id: 7690, reason: '「并将其冻结。如果该敌人已被冻结，则再造成 5 点伤害」= 条件须读施加冻结**之前**的状态快照，段序执行后 targetStatus 恒真（时序绑定无原语，r17/r18/r21 口径维持）' },
  // 【窃取增益重定向 + 尾缀缩放无来源】
  { id: 7713, reason: '「窃取攻击力并将之给予你第一位盟友」= steal 增益恒入施法者（重定向无原语）+ 尾缀 [20:1] 无来源子句可绑定（r17/r18/r21 口径维持）；骷髅×绿色混合创造本批已由 mixAny 落地' },
  // 【窃取→随机技能值重定向】
  { id: 7987, reason: '「窃取护甲再转换成随机技能值并给予第一位盟友」= 窃取增益重定向 + 随机技能转移无原语（r17/r18/r21 口径维持）' },
  // 【随机技能转移口径矛盾】
  { id: 8377, reason: '「窃取 [魔法 + 1] 点魔法值并转换为随机技能值给予所有盟友」与官方步骤（CountMagic 100 全额魔法 → 每盟友 IncreaseRandom）互相矛盾，无法对号（r17/r21 口径维持）' },
  // 【选定色「黄色除外」计数】
  { id: 8464, reason: '「因选定的颜色（黄色除外）而增强」= 「除外」子句官方步骤无对应（CountGems FromTarget 无 except 语义），ZH 独有句不敢猜（r17/r21 口径维持；选定色计数本身已可表）' },
  // 【敌方黄金池】
  { id: 8568, reason: '「窃取敌人黄金」= 敌方黄金池无来源（economy 为共用池，TakeEnemyGold 无对应），尾缀 [100:1] 无处绑定（r19/r20/r21 口径维持）；耗蓝+冻结本身可表' },
  { id: 8859, reason: '「窃取黄金」&& 子句 = 敌方黄金池无来源（首句即卡，按序编译整条不可拆）+ [100:1] 无可绑来源（r19/r20/r21 口径维持）；随机技能值窃取本身可表' },
  { id: 8904, reason: '「数值因窃取黄金数而增强 [50:1]」= 窃取黄金额无来源 kind（battleGold 为共用池总额、非本次窃取额）（r19/r20/r21 口径维持）' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方黄金池无来源（r19/r20/r21 口径维持）；伤害+出血段本身可表' },
  // 【狼化家族（状态 + 宝石双缺口）】
  { id: 8553, reason: '「陷入狼化状态」+「狼化宝石」均不在实现清单（状态白名单无 lycanthropy、宝石无 Lycanthropy kind，spell-rules §7）（r20/r21 口径维持）' },
  { id: 8566, reason: '「每有一颗狼化宝石则使随机敌人死亡标记」= 狼化宝石（Lycanthropy Gem）未实现，boardSpecial 无计数端（r20/r21 口径维持）' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件不在条件域 + 狼化状态缺失（r20/r21 口径维持）' },
  // 【复制盟友的动态色（无前序 chosen 段）】
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 该咒语无任何 chosen 段供选择器挂靠，CHOSEN_TARGET 无回退值（r19/r21 口径维持；复制召唤本身本批已落地）' },
  // 【位置周边宝石计数】
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 以创造宝石格为锚的周边位置计数，boardGems 为全盘口径无位置来源（r19/r21 口径维持；石像鬼宝石创造本批可表）' },
  // 【倒数第二位 + 元素星】
  { id: 8902, reason: '「再创造 3 颗元素星」= ElementalStar 特殊宝石未实现（GEMS-SEMANTICS-2 后续波，r19/r21 口径维持）；secondLast 目标/双色来源/拉至首位本身可表' },
  // 【灵力宝石（Spirit Gem）】
  { id: 8925, reason: '「创造 3 颗灵力宝石」= Spirit 非基础色、特殊宝石未实现（r16/r19/r21 口径维持）；屏障+半数法力本身可表' },
  // 【龙宝石/腐烂宝石（后续波）】
  { id: 9545, reason: '「转换成紫色龙宝石」= 龙宝石族（Dragon Gems）未实现（波B 之后，r19/r21 口径维持）；诅咒计数驱动转换数量 + 诅咒/死亡标记施加本身可表' },
  { id: 9546, reason: '「创造 10 颗棕色和腐烂宝石的混合体」= Decay 腐烂宝石未实现（r19/r21 口径维持；混合创造原语本批已落地）；击退 reposition 本身可表' },
  // 【几率上限 + 官方数据矛盾】
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= chanceBoost 无上限原语（线性叠加后夹 1），且 ZH 30% 与官方 CountMax 20 互相矛盾（r19/r21 口径维持）；拉到后方本身可表' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7000,
    desc: '摧毁 1 颗宝石和其两侧的宝石。',
    // 官方句（9052 同款 EN「…a gem and the Gems either side of it」）= Block1x3 一行三格：
    // 裸单颗 → 随机锚格 + 同行左右各一格（row3 + RANDOM 中心，R22 新原语）。
    build: skill(
    destroyArea('row3', 'destroy', 'RANDOM'),
    ),
  },
  {
    id: 7136,
    desc: '创造 5 颗骷髅头。随机爆破 10 颗骷髅头。获得 [(魔法 x 1.5) + 3] 点护甲值。',
    // 「随机爆破 10 颗骷髅头」= 随机 N 颗普通骷髅爆破（include 'skull' 限定，R22 新原语）。
    build: skill(
    createSkulls(5),
    explodeRandomSkulls(10),
    armor('allySelf', 3, 1.5),
    ),
  },
  {
    id: 7207,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。再造成 8 点伤害，随机分配给所有敌人。此伤害值因存活的敌军数量而增强。 [x4]',
    // 「随机分配给所有敌人」= 随机切点分摊（splitRandom，R22 新原语）；[x4] 按存活敌军数增强总额。
    build: skill(
    dmg('enemyChosen', 4, 1),
    dmg('enemyAll', 8, 0, { splitRandom: true, modifier: boostPer({ kind: 'teamSize', side: 'enemy' }, 4) }),
    ),
  },
  {
    id: 7253,
    desc: '选择一颗紫色宝石，摧毁其行和列。再给予所有其他盟友 1 点所有技能值。',
    // 「摧毁其行和列」= 选定格行+列（chosenCross，R22 新原语；「紫色」为点选指引，选择器通用）；
    // 「1 点所有技能值」= 四维技能各 +1（本库 randomStat 四维同口径）。
    build: skill(
    destroyChosenCross(),
    attack('allyOthers', 1, 0),
    armor('allyOthers', 1, 0),
    magic('allyOthers', 1, 0),
    heal('allyOthers', 1, 0),
    ),
  },
  {
    id: 7254,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，有 50% 的几率打错敌人。如果对方使用棕色法力，则造成三倍伤害。',
    // 「打错敌人」家族按 8108/8307 官方步骤实锤口径：两段伤害各自掷签（FromTarget +
    // RandomEnemy），ZH「50% 打错」为机翻合并；「对方使用棕色法力三倍」= condMult targetColor。
    build: skill(
    dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Brown } } }),
    dmg('enemyRandom', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Brown } } }),
    ),
  },
  {
    id: 7263,
    desc: '对 1 名敌人造成 [魔法 + 2] 点轻微溅射真实伤害。如果敌人陷入某状态效果，则耗尽对方法力值。',
    // 「陷入某状态效果」= 任意状态存在判定（targetHasAnyStatus，R22 新条件，目标相对——
    // lastTarget 段逐目标判定即「该敌人」本人）。
    build: skill(
    dmgSplash('enemyChosen', 2, 1, { trueDamage: true }),
    drainMana('lastTarget', { ifCond: { kind: 'targetHasAnyStatus' } }),
    ),
  },
  {
    id: 7274,
    desc: '对 1 名敌人造成等同于其攻击力的伤害。给予所有盟友 [魔法 + 1] 点生命值，数值因造成的伤害而增强。 [3:1]',
    // 「等同于其攻击力」= 单目标段 targetStat attack ×1（lastTarget 即该敌人）；
    // 「因造成的伤害而增强 [3:1]」= lastDamage 来源（R22 新来源）ratio 3:1。
    build: skill(
    dmg('enemyChosen', 0, 0, { modifier: boostPer({ kind: 'targetStat', stat: 'attack' }, 1) }),
    heal('allyAll', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'lastDamage' } } }),
    ),
  },
  {
    id: 7314,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害，有 50% 的几率打错敌人。如果对方使用黄色法力，则造成三倍伤害。若敌人身亡，所有技能值增加 8点。',
    // 同 7254（官方两段伤害口径）；「所有技能值增加 8点」= 四维技能各 +8（AddForKill →
    // ifTargetDied，8307 官方 IncreaseAttack AddForKill 同族）。
    build: skill(
    dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
    dmg('enemyRandom', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
    attack('allySelf', 8, 0, { ifTargetDied: true }),
    armor('allySelf', 8, 0, { ifTargetDied: true }),
    magic('allySelf', 8, 0, { ifTargetDied: true }),
    heal('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7386,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，有 50% 的几率打错敌人。如果对方使用绿色法力，则造成三倍伤害。',
    // 同 7254（绿色版）。
    build: skill(
    dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
    dmg('enemyRandom', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 7388,
    desc: '摧毁 1 行。对第一名敌人造成 [魔法 + 2] 点伤害，伤害值因该行被摧毁的骷髅头数而增强。 [x5]',
    // 「该行被摧毁的骷髅头数」= destroyedGems skulls 细分筛（R22 新来源，此前「无骷髅筛」口径收口）。
    build: skill(
    destroyRandomRows(1),
    dmg('enemyFront', 2, 1, { modifier: boostPer({ kind: 'destroyedGems', skulls: true }, 5) }),
    ),
  },
  {
    id: 7464,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害，伤害值因敌方损失的生命值而增强。获得一个额外回合。 [2:1]',
    // 「敌方损失的生命值」= targetStat missingHp（R22 目标侧补齐，statOf 既有）[2:1]。
    build: skill(
    dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'targetStat', stat: 'missingHp' } } }),
    extraTurn(),
    ),
  },
  {
    id: 7469,
    desc: '净化所有其他盟友，再给予他们 3-8 点法力值。创造 3 颗炸弹宝石。',
    // 「3-8 点法力值」= 数值区间 rangeSpec（R22 新原语，GenerateRandomMana 官方步骤口径）。
    build: skill(
    cleanse('allyOthers'),
    mana('allyOthers', 0, 0, { rangeSpec: { min: flat(3), max: flat(8) } }),
    createSpecialGems({ kind: 'bomb' }, 3),
    ),
  },
  {
    id: 7472,
    desc: '对第一名敌人造成 [魔法 + 1] 点伤害，伤害值因敌人所需的法力值而增强。 [1:1]',
    // 「敌人所需的法力值」= targetStat manaCost（R22 目标侧补齐）[1:1]。
    build: skill(
    dmg('enemyFront', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'targetStat', stat: 'manaCost' } } }),
    ),
  },
  {
    id: 7506,
    desc: '将蓝色宝石转换为骷髅头，并将棕色宝石转换为黄色宝石。对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因其他盟友的魔法值而增强。 [2:1]',
    // 「其他盟友的魔法值」= allyStatSum excludeSelf（R22 新口径，排除施法者）[2:1]。
    build: skill(
    transform(BaseColor.Blue, 'SKULL'),
    transform(BaseColor.Brown, BaseColor.Yellow),
    dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'allyStatSum', stat: 'magic', excludeSelf: true } } }),
    ),
  },
  {
    id: 7541,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人已陷入猎人标记状态，则再加 10 点伤害并获得一个额外回合。',
    // 加伤 = condBonus targetStatus marked；额外回合的条件挂在跨段追踪目标上
    //（lastTargetStatus 全局条件，R22 新条件——修复「目标相对条件挂无目标段整段跳过」缺口）。
    build: skill(
    dmg('enemyChosen', 4, 1, { condBonus: { n: 10, cond: { kind: 'targetStatus', statusId: 'marked' } } }),
    extraTurn({ ifCond: { kind: 'lastTargetStatus', statusId: 'marked' } }),
    ),
  },
  {
    id: 7555,
    desc: '对第一名和最后一名敌人造成  [魔法 + 1] 点伤害，再使他们交换位置。',
    // 「使他们交换位置」= swapPositions（R22 新原语，编队位互换；两段伤害共用 [M+1]）。
    build: skill(
    dmg('enemyFront', 1, 1),
    dmg('enemyLast', 1, 1),
    swapPositions('enemyFront', 'enemyLast'),
    ),
  },
  {
    id: 7651,
    desc: '对一名敌人造成 [魔法 + 8] 点伤害，伤害值因其他所有盟友的法力值而增强。净化所有盟友。然后使其他所有盟友获得 5 点法力值。 [1:1]',
    // 「其他所有盟友的法力值」= allyStatSum mana excludeSelf [1:1]。
    build: skill(
    dmg('enemyChosen', 8, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'allyStatSum', stat: 'mana', excludeSelf: true } } }),
    cleanse('allyAll'),
    mana('allyOthers', 5, 0),
    ),
  },
  {
    id: 7747,
    desc: '对最虚弱的两名敌人造成 [魔法 + 2] 点伤害，伤害值因所有盟友和敌人的攻击力而增强。若其中一名敌人身亡，则击杀另一名敌人。 [6:1]',
    // 「所有盟友和敌人的攻击力」= allyStatSum + enemyStatSum attack 双来源 [6:1]；
    // 「其中一名身亡则击杀另一名」= anyTrackedDied 条件（R22 新条件）+ execute 打存活追踪目标。
    build: skill(
    dmg('enemyWeakestN', 2, 1, {
      n: 2,
      modifier: {
        mod: { kind: 'ratio', a: 6, b: 1 },
        sources: [{ kind: 'allyStatSum', stat: 'attack' }, { kind: 'enemyStatSum', stat: 'attack' }],
      },
    }),
    dmg('lastTargets', 0, 0, { execute: true, ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 7808,
    desc: '对最强大的两名敌人造成 [魔法 + 2] 点伤害，伤害值因生命值和法力值满值的敌军数而增强。 [x4]',
    // 「生命值和法力值满值的敌军数」= enemyFull{hp,mana}（R22 新来源，官方 CountEnemiesFullMana 族）。
    build: skill(
    dmg('enemyHealthiestN', 2, 1, { n: 2, modifier: boostPer({ kind: 'enemyFull', hp: true, mana: true }, 4) }),
    ),
  },
  {
    id: 7812,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。自身每高于敌方一个技能即可窃取敌方 3 点魔法值。',
    // 「每高于敌方一个技能」= casterStatBeatsCount 四围比较计数（R22 新来源，randomStat 四维口径）
    // ×3 驱动窃取法力。
    build: skill(
    dmg('enemyChosen', 3, 1),
    reduce('lastTarget', 'mana', 0, 0, { modifier: boostPer({ kind: 'casterStatBeatsCount' }, 3) }),
    ),
  },
  {
    id: 7935,
    desc: '对一名敌人造成 [魔法 + 1] 点真实伤害。若敌人身负状态效果，则造成双倍伤害。',
    // 「身负状态效果」= targetHasAnyStatus（R22 新条件，任意状态存在判定）。
    build: skill(
    trueDmg('enemyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'targetHasAnyStatus' } } }),
    ),
  },
  {
    id: 7960,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。若其攻击力比较大，则造成双倍伤害。',
    // 「其攻击力比较大」= 反向属性比较 targetStatBeatsCaster（R22 新条件，§13.2 正向条件的对偶）。
    build: skill(
    dmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetStatBeatsCaster', stat: 'attack' } } }),
    ),
  },
  {
    id: 7977,
    desc: '爆破一颗宝石。创造 4 颗绿色宝石，数量因被摧毁的骷髅头数而增强。 [x3]',
    // 裸单颗爆破 = 随机一颗（§11 追加口径）；「被摧毁的骷髅头数」= destroyedGems skulls。
    build: skill(
    explodeRandomGems(1),
    createGems(BaseColor.Green, 4, 0, { modifier: boostPer({ kind: 'destroyedGems', skulls: true }, 3) }),
    ),
  },
  {
    id: 7992,
    desc: '爆破 [(魔法 / 2) + 1] 颗绿色宝石。使首位和末位敌人交换位置。',
    build: skill(
    explodeRandomGems(1, 0.5, 'color', BaseColor.Green),
    swapPositions('enemyFront', 'enemyLast'),
    ),
  },
  {
    id: 8055,
    desc: '对 3 名随机敌人造成 [魔法 + 4] – [(魔法 x 2) + 8] 点真实伤害。获得 [魔法 + 4] – [(魔法 x 2) + 8] 点护甲值。 ',
    // 伤害侧 rangeSpec 既有；护甲区间 = buff rangeSpec（R22 新原语，四条 scaling 对号入座）。
    build: skill(
    trueDmg('enemyRandomN', 0, 0, { n: 3, rangeSpec: { min: scale(4, 1), max: scale(8, 2) } }),
    armor('allySelf', 0, 0, { rangeSpec: { min: scale(4, 1), max: scale(8, 2) } }),
    ),
  },
  {
    id: 8060,
    desc: '选择一个宝石颜色。创造与此色宝石数等量的红色宝石。使一名随机敌人陷入出血状态。 [1:1]',
    // 「与此色宝石数等量」= boardGems CHOSEN 计数（R22 新口径）驱动创造数量 [1:1]
    //（官方 CountGems FromTarget → CreateGems UseCounterForAmount 步骤）。
    build: skill(
    createGems(BaseColor.Red, 0, 0, { modifier: boostPer({ kind: 'boardGems', color: 'CHOSEN' }, 1) }),
    inflict('bleed', 'enemyRandom'),
    ),
  },
  {
    id: 8108,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害，有 50% 的几率伤害值会打中另一名随机敌人。若敌人使用紫色的法力颜色，则造成 3 倍伤害。若敌人身亡，则创造 8 颗骷髅头。',
    // 官方步骤实锤（Bone Flail）：Damage FromTarget → CreateGems Skull 8 AddForKill →
    // Damage RandomEnemy → CreateGems Skull 8 AddForKill——「50% 打中另一名」为机翻合并。
    build: skill(
    dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
    createSkulls(8, 0, { ifTargetDied: true }),
    dmg('enemyRandom', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Purple } } }),
    createSkulls(8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8187,
    desc: '转化成一名敌人，并诅咒他。',
    // 官方步骤（Duplicate）：TransformSelfFromTarget FromTarget + CauseCursed FromTarget——
    // 施法者就地化为该敌人的复制体（transformSelfFrom，R22 新原语），再诅咒该敌人。
    build: skill(
    transformSelfFrom('enemyChosen'),
    inflict('curse', 'enemyChosen'),
    ),
  },
  {
    id: 8188,
    desc: '创建 10 颗与盟友的法力颜色相同的宝石。有 50% 的几率复制盟友。',
    // 官方步骤（Mimic）：CreateGems FromTarget ×10 + SummoningTargetNoError 50%——
    // 创造段读选定盟友的法力色（CHOSEN_TARGET，候选集由后段 allyChosen 驱动），
    // 复制召唤 = summonCopy（R22 新原语）。
    build: skill(
    createGems('CHOSEN_TARGET', 10, 0),
    summonCopy('allyChosen', { chance: 0.5 }),
    ),
  },
  {
    id: 8190,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因拥有反射效果的盟友数而增强。有 50% 的几率复制那名敌人。 [x8]',
    // 「拥有反射效果的盟友数 [x8]」= allyStatusCount reflect；「复制那名敌人」= summonCopy lastTarget。
    build: skill(
    dmg('enemyChosen', 4, 1, { modifier: boostPer({ kind: 'allyStatusCount', statusId: 'reflect' }, 8) }),
    summonCopy('lastTarget', { chance: 0.5 }),
    ),
  },
  {
    id: 8220,
    desc: '对 2 名随机敌人造成 [魔法 + 5] 点溅射伤害。燃烧第一组敌人，冻结第二组敌人。',
    // 官方步骤（Crown of Ice and Fire）：SplashHighDamage RandomEnemy → CauseBurning
    // FromPrevious+Adjacent → 第二轮 Splash → CauseFrozen——「被伤害的敌人」（含溅射链
    // 受害者）= lastDamaged 目标模式（R22 新目标）。
    build: skill(
    dmgSplash('enemyRandom', 5, 1),
    inflict('burning', 'lastDamaged'),
    dmgSplash('enemyRandom', 5, 1),
    inflict('frozen', 'lastDamaged'),
    ),
  },
  {
    id: 8248,
    desc: '对一名敌人和其下方的敌人造成 [魔法 + 4] 点真实伤害，伤害值因紫色宝石数而增强。若敌人身亡则创造 12 颗紫色宝石。否则就召唤 2 名暗影姐妹。 [1:1]',
    // 官方步骤（Darkness Eternal）：TrueDamage FromTarget/NextDownFromTarget ×4（CountGems
    // Purple UseCounter）→ CreateGems Purple 12 AddForKill → SummoningConditional 6477 ×2
    //（无击杀才召唤）——NextDown = enemyNextDown（R22 新目标）；「否则」= not anyTrackedDied。
    build: skill(
    dmg('enemyChosen', 4, 1, { trueDamage: true, modifier: boostPer({ kind: 'boardGems', color: BaseColor.Purple }, 1) }),
    dmg('enemyNextDown', 4, 1, { trueDamage: true, modifier: boostPer({ kind: 'boardGems', color: BaseColor.Purple }, 1) }),
    createGems(BaseColor.Purple, 12, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    summonRef('SisterOfShadows', 6477, { countRange: { min: 2, max: 2 }, ifCond: { kind: 'not', cond: { kind: 'anyTrackedDied' } } }),
    ),
  },
  {
    id: 8273,
    desc: '给予所有黄色盟友 [魔法 + 1] 点生命值和 2 点魔法值。有 35%的几率召唤首位敌人的卡牌。',
    // 「所有黄色盟友」= targetColor Yellow 逐目标过滤（r21 口径）；「召唤首位敌人的卡牌」=
    // summonCopy enemyFront（官方 SummoningTarget FrontEnemy 35%，R22 新原语）。
    build: skill(
    heal('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    mana('allyAll', 2, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    summonCopy('enemyFront', { chance: 0.35 }),
    ),
  },
  {
    id: 8276,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。若敌人已陷入疾病状态，则爆破 3 颗绿色宝石。若敌人陷入燃烧状态，则爆破 3 颗红色宝石。',
    // 条件化爆破 = lastTargetStatus 全局条件（R22 新条件，修复「目标相对条件辖无目标宝石段
    // 整段跳过」缺口，r16/r17 口径收口）。
    build: skill(
    dmg('enemyChosen', 1, 1),
    explodeRandomGems(3, 0, 'color', BaseColor.Green, { ifCond: { kind: 'lastTargetStatus', statusId: 'disease' } }),
    explodeRandomGems(3, 0, 'color', BaseColor.Red, { ifCond: { kind: 'lastTargetStatus', statusId: 'burning' } }),
    ),
  },
  {
    id: 8307,
    desc: '对敌人造成 [魔法 + 5] 点伤害，但有 50% 的几率打错人。若敌人使用红色法力，则造成 3 倍伤害。获得 16 点攻击力，如果敌人身亡。',
    // 官方步骤实锤（Bloody Club）：Damage FromTarget ×3red → IncreaseAttack 16 AddForKill →
    // Damage RandomEnemy ×3red → IncreaseAttack 16 AddForKill（两轮结构同 8108）。
    build: skill(
    dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    attack('allySelf', 16, 0, { ifTargetDied: true }),
    dmg('enemyRandom', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }),
    attack('allySelf', 16, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8355,
    desc: '使板面上一个指定颜色的宝石数翻倍，再创造 3 颗同色宝石。给予所有同色盟友 [魔法 + 1] 点生命值。 [1:1]',
    // 「翻倍」= 创造数量 = 选定色宝石数（boardGems CHOSEN [1:1]，R22 新口径）+ 再造 3 颗；
    // 「所有同色盟友」= targetColor CHOSEN 逐目标过滤（r11 口径）。
    build: skill(
    createGems('CHOSEN', 0, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: 'CHOSEN' } } }),
    createGems('CHOSEN', 3, 0),
    heal('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
    ),
  },
  {
    id: 8356,
    desc: '对所有紫色敌人造成 [魔法 + 2] 点伤害。耗掉他们 1-3 点法力值。',
    // 「所有紫色敌人」= enemyAll + targetColor Purple 逐目标过滤（r17 口径）；
    // 「耗掉 1-3 点法力值」= 数值区间 rangeSpec（R22 新原语，官方 CountRange 步骤）。
    build: skill(
    dmg('enemyAll', 2, 1, { range: 'all', ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
    reduce('enemyAll', 'mana', 0, 0, { rangeSpec: { min: flat(1), max: flat(3) }, ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
    ),
  },
  {
    id: 8367,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因所有红色敌人的法力值而增强。再耗掉所有红色敌人 5 点法力值。 [2:1]',
    // 「所有红色敌人的法力值」= enemyStatSum mana + color 筛（R22 新口径）[2:1]；
    // 「所有红色敌人」= targetColor Red 过滤耗蓝。
    build: skill(
    dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'mana', color: BaseColor.Red } } }),
    reduce('enemyAll', 'mana', 5, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 8374,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人幸存，则窃取 4 点魔法值。',
    // 官方步骤（Devour Intellect）：Damage FromTarget 4 → StealMagic FromTarget 4——
    // 窃取段打 lastTarget，阵亡时自然空转（步骤无独立幸存判定，ZH 为叙述性措辞）。
    build: skill(
    dmg('enemyChosen', 4, 1),
    steal('lastTarget', 'magic', 'magic', 4, 0),
    ),
  },
  {
    id: 8406,
    desc: '给予所有其他盟友四分之一的法力值。每有一名法力值满值的敌人，则创造 8 颗红色宝石。有 15% 的几率自毁。 [x7]',
    // 「每有一名法力值满值的敌人 [x7]」= enemyFull mana 来源 ×7（官方 CountEnemiesFullMana 700
    // 实锤，ZH「8 颗」为机取出入、按原句口径）；quarter 法力 + 15% 自毁（sacrifice，§11 追加）。
    build: skill(
    mana('allyOthers', 0, 0, { fraction: 0.25 }),
    createGems(BaseColor.Red, 0, 0, { modifier: boostPer({ kind: 'enemyFull', mana: true }, 7) }),
    sacrifice('allySelf', { chance: 0.15 }),
    ),
  },
  {
    id: 8427,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因受诅咒的敌人数而增强。每有一名受诅咒的敌人，则赋予一名随机盟友屏障效果。 [x2]',
    // 伤害 [x2] 诅咒敌人数（官方 CountSpecificStatusEffect cursed 200）；「每有一名…则赋予
    // 一名随机盟友屏障」= perCount 计数驱动施加（R22 新原语，官方 InflictEffectOnRandomTroops）。
    build: skill(
    dmg('enemyAll', 1, 1, { range: 'all', modifier: boostPer({ kind: 'enemyStatusCount', statusId: 'curse' }, 2) }),
    inflict('barrier', 'allyAll', { perCount: boostPer({ kind: 'enemyStatusCount', statusId: 'curse' }, 1) }),
    ),
  },
  {
    id: 8429,
    desc: '爆破 [魔法 + 1] 颗绿色或紫色宝石。再使第一位敌人陷入诅咒和织网状态。',
    // 官方步骤（Skittering Charge）：ExplodeColor Green ×1 与 ExplodeColor Purple ×1 两步骤
    // 均发（非二选一），各按 [M+1] 缩放；双色并集池 = explodeRandomGemsAny（R22 新原语）。
    build: skill(
    explodeRandomGemsAny([BaseColor.Green, BaseColor.Purple], 1, 1),
    inflict('curse', 'enemyFront'),
    inflict('web', 'enemyFront'),
    ),
  },
  {
    id: 8467,
    desc: '对一名敌人造成 [魔法 + 2] 点真实伤害。若敌人使用蓝色法力，则摧毁一列，并获得 5 点攻击力。 [x5]',
    // 官方步骤（Howling Blow）：CountArmyColor Blue 500 → DestroyColumn AddForBlueTarget →
    // IncreaseAttack UseCounter（[x5] 挂攻击段）→ TrueDamage FromTarget ×2——
    // 「若敌人使用蓝色法力」= lastTargetColor 全局条件（R22 新条件）。
    build: skill(
    trueDmg('enemyChosen', 2, 1),
    destroyRandomCols(1, 0, { modifier: boostPer({ kind: 'enemiesOfColor', color: BaseColor.Blue }, 1), ifCond: { kind: 'lastTargetColor', color: BaseColor.Blue } }),
    attack('allySelf', 0, 0, { modifier: boostPer({ kind: 'enemiesOfColor', color: BaseColor.Blue }, 5), ifCond: { kind: 'lastTargetColor', color: BaseColor.Blue } }),
    ),
  },
  {
    id: 8504,
    desc: '炸毁三个骷髅头。获得一次攻击。',
    // EN「Explode 3 Skulls. Gain [(Magic / 2) + 1] Attack.」= 定量骷髅爆破（R22 新原语）
    // + 半魔法缩放攻击（ZH「一次攻击」为机翻）。无方括号 → 常数缩放 scale(1, 0.5)。
    build: skill(
    explodeRandomSkulls(3),
    attack('allySelf', 1, 0.5),
    ),
  },
  {
    id: 8533,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。若敌人是元素，则赋予所有其他盟友法印效果。',
    // EN「If the Enemy is an Elemental, Enchant all other Allies.」——「法印效果」= 附魔
    // enchanted（R10 正面状态批落地）；「若敌人是元素」= lastTargetRace 全局条件（R22 新条件）。
    build: skill(
    dmg('enemyChosen', 1, 1),
    inflict('enchanted', 'allyOthers', { ifCond: { kind: 'lastTargetRace', race: 'Elemental' } }),
    ),
  },
  {
    id: 8534,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 2] 点轻微的溅射伤害。若敌人是建造，则爆破 8 颗宝石。',
    // 「一名敌人和一名随机敌人」= 两段溅射共用 [M+2]（§11 并列数值段口径，r21 7161 先例）；
    // 「若敌人是建造」= lastTargetRace Construct；爆破 8 颗 = 随机 8 颗（官方步骤 explode 8 Gems）。
    build: skill(
    dmgSplash('enemyChosen', 2, 1),
    dmgSplash('enemyRandom', 2, 1),
    explodeRandomGems(8, 0, 'all', undefined, { ifCond: { kind: 'lastTargetRace', race: 'Construct' } }),
    ),
  },
  {
    id: 8550,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。若敌人身亡，则获得 20 个灵魂。否则就使他陷入死亡标记状态。',
    // EN「If they die, gain 20 Souls. Otherwise Death Mark them.」——「否则」= lastTargetSurvived
    // （R22 新条件，ifTargetDied 的取反全局形态）。
    build: skill(
    dmg('enemyChosen', 2, 1),
    gainSouls(20, 0, { ifTargetDied: true }),
    inflict('death-mark', 'lastTarget', { ifCond: { kind: 'lastTargetSurvived' } }),
    ),
  },
  {
    id: 8573,
    desc: '有 25% 的几率吞噬一名敌人。若敌人是纳迦族则几率翻倍。否则则造成 [魔法 + 3] 点伤害。',
    // EN「a 25% chance to devour an Enemy, with double the chance if they are a Naga. Otherwise
    // deal [Magic + 3] damage.」——吞噬 = devour 原语（R22 新原语，即杀 + 官方额度成长），
    // chanceMult 纳迦 ×2；「否则」无需条件：吞噬成功目标已亡、dmg('lastTarget') 自动空转。
    build: skill(
    devour('enemyChosen', { chance: 0.25, chanceMult: { times: 2, cond: { kind: 'targetRace', race: 'Naga' } } }),
    dmg('lastTarget', 3, 1),
    ),
  },
  {
    id: 8581,
    desc: '将所有黄色宝石转换成紫色。每有一名敌人陷入状态效果，则再创造 2 颗紫色宝石。 [x2]',
    // 「每有一名敌人陷入状态效果」= enemyStatusCount 不筛状态（任意状态计数，R22 新口径）[x2]。
    build: skill(
    transform(BaseColor.Yellow, BaseColor.Purple),
    createGems(BaseColor.Purple, 0, 0, { modifier: boostPer({ kind: 'enemyStatusCount' }, 2) }),
    ),
  },
  {
    id: 8659,
    desc: '对一名敌人和其上位的敌人造成等同于其攻击力的伤害。再召唤绝望。 [1:1]',
    // EN「Deal damage to an Enemy, equal to their Attack. Then deal the same damage to all
    // Enemies above them. Summon an Abject of Despond.」——「其」= 选定敌人（chosenStat，
    // R22 新来源，跨段同额不受后段目标解析冲掉）；「其上位的敌人」= enemyAboveTarget（R13 落地）。
    build: skill(
    dmg('enemyChosen', 0, 0, { modifier: boostPer({ kind: 'chosenStat', stat: 'attack' }, 1) }),
    dmg('enemyAboveTarget', 0, 0, { modifier: boostPer({ kind: 'chosenStat', stat: 'attack' }, 1) }),
    summonRef('AbjectOfDespond', 7115),
    ),
  },
  {
    id: 8694,
    desc: '有 [魔法 + 1] 的几率杀掉一名敌人。若敌人身亡，则创造 12 颗骷髅头。否则则消除其所有技能值 10 点。',
    // 「有 [M+1] 的几率杀掉」= execute + chance 1% + chanceBoost selfStat magic（§11 追加口径）；
    // 「否则则消除其所有技能值 10 点」= 四维技能各 -10（lastTargetSurvived 反向分支，
    // 8694 EN「eliminate 10 from all their Skills」四维口径）。
    build: skill(
    dmg('enemyChosen', 0, 0, { execute: true, chance: 0.01, chanceBoost: boostPer({ kind: 'selfStat', stat: 'magic' }, 1) }),
    createSkulls(12, 0, { ifTargetDied: true }),
    reduce('lastTarget', 'attack', 10, 0, { ifCond: { kind: 'lastTargetSurvived' } }),
    reduce('lastTarget', 'armor', 10, 0, { ifCond: { kind: 'lastTargetSurvived' } }),
    reduce('lastTarget', 'magic', 10, 0, { ifCond: { kind: 'lastTargetSurvived' } }),
    reduce('lastTarget', 'hp', 10, 0, { ifCond: { kind: 'lastTargetSurvived' } }),
    ),
  },
  {
    id: 8812,
    desc: '爆破一颗宝石。每有一颗骷髅头被摧毁，则再爆破一颗随机宝石。 [1:1]',
    // 「每有一颗骷髅头被摧毁则再爆破一颗」= destroyedGems skulls 驱动爆破数量 [1:1]。
    build: skill(
    explodeRandomGems(1),
    explodeRandomGems(1, 0, 'all', undefined, { modifier: boostPer({ kind: 'destroyedGems', skulls: true }, 1) }),
    ),
  },
  {
    id: 8880,
    desc: '创造 24 颗混合紫色和骷髅头的宝石。获得 20 个灵魂，并净化所有盟友。',
    // EN「Create a mix of 24 Purple Gems and Skulls」= mixAny（R22 新原语，色+骷髅混合）。
    build: skill(
    createGemsMixAny([BaseColor.Purple, 'SKULL'], 24),
    gainSouls(20),
    cleanse('allyAll'),
    ),
  },
  {
    id: 8927,
    desc: '摧毁 5x5 圈宝石。获得 [魔法 + 1] 点护甲值和生命值，数值因被摧毁的 [x5]',
    // ZH 截断按 EN 全句「boosted by all Gargoyle Gems destroyed [x5]」判读（r21 挽救口径同款）：
    // destroyedGems special gargoyleGem（R22 新细分筛，kind 不分善恶 tier）；
    // 「护甲值和生命值」= 两段共用 [M+1]（§11 并列口径）。
    build: skill(
    destroyArea('circle5', 'destroy'),
    armor('allySelf', 1, 1, { modifier: boostPer({ kind: 'destroyedGems', special: 'gargoyleGem' }, 5) }),
    heal('allySelf', 1, 1, { modifier: boostPer({ kind: 'destroyedGems', special: 'gargoyleGem' }, 5) }),
    ),
  },
  {
    id: 8931,
    desc: '消除首 2 位敌人 [魔法 + 1] 点护甲值和攻击力，数值因自身攻击力而增强。给予其他盟友 3-8 点法力值。 [3:1]',
    // 「消除…护甲值和攻击力」= 双削减段共用 [M+1]（§11 并列口径）；「因自身攻击力 [3:1]」=
    // selfStat attack；「3-8 点法力值」= rangeSpec（R22 新原语）。
    build: skill(
    reduce('enemyFirstN', 'armor', 1, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } } }),
    reduce('enemyFirstN', 'attack', 1, 1, { n: 2, modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } } }),
    mana('allyOthers', 0, 0, { rangeSpec: { min: flat(3), max: flat(8) } }),
    ),
  },
  {
    id: 9052,
    desc: '爆破一颗宝石和其两边的宝石。再使一名随机敌人陷入缠绕和织网状态。',
    // 官方句「Explode a gem and the Gems either side of it」= row3 一行三格 + RANDOM 锚
    // （R22 新原语，7000 同款 explode 版）；缠绕+织网双施加。
    build: skill(
    destroyArea('row3', 'explode', 'RANDOM'),
    inflict('entangle', 'enemyRandom'),
    inflict('web', 'enemyRandom'),
    ),
  },
  {
    id: 9055,
    desc: '对所有敌人造成 [魔法 + 6] 点伤害，伤害值因被赐福的盟友数而增强。给予所有其他盟友 3-10 法力值。 [x4]',
    // 「被赐福的盟友数 [x4]」= allyStatusCount blessed（R10 blessed 落地后来源可表）；
    // 「3-10 法力值」= rangeSpec（R22 新原语）。
    build: skill(
    dmg('enemyAll', 6, 1, { range: 'all', modifier: boostPer({ kind: 'allyStatusCount', statusId: 'blessed' }, 4) }),
    mana('allyOthers', 0, 0, { rangeSpec: { min: flat(3), max: flat(10) } }),
    ),
  },
  {
    id: 9181,
    desc: '给予所有其他盟友 3-10 点法力值。再召唤拉格纳戈德、NUTCRKR 1225、塔能巴恩或克里斯·克林格。',
    // 「3-10 点法力值」= rangeSpec（R22 新原语）；四选一召唤 = summonRandom（官方四变体随机）。
    build: skill(
    mana('allyOthers', 0, 0, { rangeSpec: { min: flat(3), max: flat(10) } }),
    summonRandom(['Ragnagord', 'NUTCRKR-1225', 'Tannenbaum', 'KrisKrinkle']),
    ),
  },
  {
    id: 9252,
    desc: '每有一个红色盟友，则使一个随机敌人陷入恐怖状态。获得 10 个灵魂。 [1:1]',
    // 「每有一个红色盟友则使一个随机敌人恐怖」= perCount alliesOfColor Red（R22 新原语，
    // 计数驱动随机施加）；恐怖 = terror（波A 状态本体）。
    build: skill(
    inflict('terror', 'enemyAll', { perCount: boostPer({ kind: 'alliesOfColor', color: BaseColor.Red }, 1) }),
    gainSouls(10),
    ),
  },
  {
    id: 9287,
    desc: '板面上每有一颗鬼魂宝石，则给予一名随机盟友屏障效果。获得 [魔法 + 1] 点护甲值。 [1:1]',
    // 「每颗鬼魂宝石则给予随机盟友屏障」= perCount boardSpecial ghost（R22 新原语；
    // ghost 幽魂宝石窗口 C 已落地，本句不涉灵魂收益）。
    build: skill(
    inflict('barrier', 'allyAll', { perCount: boostPer({ kind: 'boardSpecial', gem: 'ghost' }, 1) }),
    armor('allySelf', 1, 1),
    ),
  },
  {
    id: 9341,
    desc: '将所有黄色宝石转换成棕色。获得 [魔法 + 1] 黄金。每有 10 黄金则使一名随机敌人陷入疾病状态。 [10:1]',
    // 「每有 10 黄金则使随机敌人疾病」= perCount battleGold ratio 10:1（R22 新原语，
    // 官方 CountGold 步骤口径）。
    build: skill(
    transform(BaseColor.Yellow, BaseColor.Brown),
    gainGold(1, 1),
    inflict('disease', 'enemyAll', { perCount: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } }),
    ),
  },
  {
    id: 9364,
    desc: '对敌人造成 [魔法 + 3] 点伤害。有 10% 的几率吞噬敌人，几率会随着敌人魔法值颜色最常用的宝石数量而增加。 [x2]',
    // 「有 10% 几率吞噬」= devour 原语（R22 新原语）；「几率随敌人最常用法力色的宝石数增强
    // [x2]」= chanceBoost boardGems ENEMY_MOST_USED（R22 新动态色计数）。
    build: skill(
    dmg('enemyChosen', 3, 1),
    devour('enemyChosen', { chance: 0.1, chanceBoost: boostPer({ kind: 'boardGems', color: 'ENEMY_MOST_USED' }, 2) }),
    ),
  },
  {
    id: 9492,
    desc: '摧毁一个 5x5 圆圈。对最后一名敌人造成 [魔法 + 3] 点伤害。有 30% 的几率吞噬敌人，几率随被摧毁的头骨数量而增强。 [x6]',
    // 「摧毁 5x5 圆圈」= destroyArea circle5（R13 落地）；「30% 几率吞噬」= devour +
    // chanceBoost destroyedGems skulls [x6]（官方 Skulls destroyed 口径，「头骨」= 骷髅族）。
    build: skill(
    destroyArea('circle5', 'destroy'),
    dmg('enemyLast', 3, 1),
    devour('lastTarget', { chance: 0.3, chanceBoost: boostPer({ kind: 'destroyedGems', skulls: true }, 6) }),
    ),
  },
  {
    id: 9571,
    desc: '对敌人造成 [魔法 + 2] 点伤害，伤害值因紫色宝石而增强，并将其作为生命赋予最弱的盟友。 [2:1]',
    // EN「boosted by Purple Gems, and give it as Life to the weakest Ally」——「因紫色宝石
    // [2:1]」= boardGems Purple；「将其作为生命赋予最弱的盟友」= lastDamage 来源
    // （R22 新来源）驱动治疗额，lastReduce 仅辖 reduce 族的缺口就此收口。
    build: skill(
    dmg('enemyChosen', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    heal('allyWeakest', 0, 0, { modifier: boostPer({ kind: 'lastDamage' }, 1) }),
    ),
  },
  {
    id: 9780,
    desc: '合成14颗绿色宝石和14颗流血宝石。然后获得额外回合。',
    // EN「Create a mix of 14 Green and Bleed Gems」= 14 颗绿色/流血混合体（ZH「和14颗」为
    // 机翻膨胀，按原句 14 颗 mixAny 逐颗掷选——流血宝石 bleedGem 波A 已落地）。
    build: skill(
    createGemsMixAny([BaseColor.Green, { kind: 'bleedGem' }], 14),
    extraTurn(),
    ),
  },
  {
    id: 9812,
    desc: '魅惑2名随机敌人并吸取其8点法力值。若有敌人死亡，则获得30点生命值并祝福自身。',
    // 「吸取其 8 点法力值」= lastTargets 全列表目标模式（R22 新目标，双随机目标绑定收口）；
    // 「若有敌人死亡」= anyTrackedDied（R22 新条件）；「祝福」= blessed（R10 落地）。
    build: skill(
    inflict('charm', 'enemyRandomN', { n: 2 }),
    reduce('lastTargets', 'mana', 8, 0),
    heal('allySelf', 30, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    inflict('blessed', 'allySelf', { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 9959,
    desc: '对敌人造成[魔法 + 4]点伤害。如果是首领，则根据我的升华等级造成3倍至5倍伤害。引爆2-5颗宝石。',
    // 「如果是首领…升华等级 3-5 倍」= BOSS_ASC3 惰性建模（r18 口径，标准战斗恒原值）；
    // 「引爆 2-5 颗宝石」= 清除段 countRange（R22 builders 扩展，r17 口径收口）。
    build: skill(
    dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
    explodeRandomGems(0, 0, 'all', undefined, { countRange: { min: 2, max: 5 } }),
    ),
  },
  {
    id: 9986,
    desc: '对一名敌人和三名随机敌人造成[魔法 + 3]点伤害，紫色宝石可提升伤害。若有敌人死亡，则对所有敌人施加恐惧效果。 [1:1]',
    // EN「to an Enemy and 3 random Enemies, boosted by Purple Gems [1:1]. If any Enemy dies,
    // inflict Terror to all Enemies.」——双目标段共用 [M+3]（§11 并列口径）；「若有敌人死亡」
    // = anyTrackedDied 跨段累积判定；「恐惧」= terror（波A 状态本体，batch-17 缺口收口）。
    build: skill(
    dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    dmg('enemyRandomN', 3, 1, { n: 3, modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    inflict('terror', 'enemyAll', { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
];

export const BATCH_R22: CuratedBatch = { batch: 'R22', spells: SPELLS, skipped: SKIPPED };
