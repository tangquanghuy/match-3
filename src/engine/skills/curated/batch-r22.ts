/**
 * 放弃桶回收批 R22（2026-09-18）：92 条硬尾终攻坚批。
 *
 * 工作面 = batch-r21 SKIPPED 全量 92 条（= tmp/remaining_all.json 92 unique id），
 * 即 R1-R21 全词汇重判后仍留弃的硬尾。本批新增引擎原语后逐一三判：
 *
 * 新增原语（引擎最小扩展，见各文件 R22 注记）：
 * - 吞噬 devour（effects/devour.ts）：即杀 + 按目标当前攻击、护甲、生命成长（不获取魔法），
 *   devourImmunity 特质互斥；概率在原语内部掷签（8573/9364/9492）。
 * - 数值区间 rangeSpec（buff/reduce）：GenerateRandomMana「3-8 点法力值」/ 8055 护甲区间 /
 *   8356「耗掉 1-3 点法力值」（7469/8931/9055/9181/8055/8356）。
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
 *
 * ── R22 终审增补（2026-09-18 最终判读，r18 双引号 SKIPPED 残留 44 条全量重判）──
 *
 * 最终工作面复核发现：r18 批存在一批双引号 reason 的 SKIPPED 条目，未被 r19-r22 工作链
 * 捞取（r22 工作面 = r21 SKIPPED 单引号清单）。本轮按当前全量词汇 + 官方 EN/SpellSteps
 * 逐条重判，回收 35 条；卡点全部刷新为「当前词汇下真实缺口」：
 * - Devour 家族 25 条（7047/7210/7211/7280/7281/7312/7326/7354/7421/7423/7450/7480/7559/
 *   7566/7633/7637/7642/7647/7724/7781/7984/8086/8237 + 8056/8211 仍卡）：r18「无原语」卡点
 *   随 R22 devour 落地全部失效——条件吞噬（种族/色/状态/宝石数 ifCond、chanceMult、chanceBoost）、
 *   死亡条件触发（ifTargetDied）、oneOf 分支内吞噬全链可表。
 * - 跨段重定向（7713/7987）：r19 指出的 reduce/steal + lastReduce → allyFront 路径落地。
 * - 元经济黄金句式（7505/8568/8859）：按 SOP §10.2「窃取黄金 = gainGold 入账」口径回收；
 *   8904/9189/8087 因文本明指「被窃取黄金数」来源须挂载而无 kind，维持 SKIP。
 * - 孤儿尾缀口径：37 条既有先例（r2-r22，含本批 9341）确认「尾缀无来源子句可绑 = 序列化
 *   噪声，不挂载不硬凑、不阻止组装」（7281/7505/7713/7987/8568/8859 适用）。
 * - ManaBurn（7328）：官方 ManaBurn 步骤（9745/8897）实锤 {Primarypower, SpellPowerMultiplier:1}
 *   = 清蓝 + [魔法×1] 伤害；7328 EN「boosted by my Magic」即该缩放（五连中唯一明示者）。
 * - R22 新条件回收：anyTrackedDied（8143「若有敌人身亡」）、lastTargetStatus（8182 妖火）、
 *   targetStatBeatsCaster hp（7670 反向属性比较）、targetColor CHOSEN + boardGems CHOSEN（8235）。
 * - 7434「板面紫宝石数翻倍」按 8355 官方口径（CreateGems UseCounterForAmount）落地。
 *
 * ⚠️ 引擎接线注记（本批无权改引擎文件，仅记录）：devour 段的 chance 同时被 runSegment
 * 段级管线与 devourEffect 原语内部各掷签一次（双重掷签）——原语头注明示「不走段级 chance
 * 通用管线」，段级应豁免 devour（同 escapeChance 先例）；本批 devour 条目按构造器契约
 * 只表达官方语义，运行时口径以引擎侧修复为准。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, cleanse, reduce, steal,
  drainMana, inflict, createGems, createSkulls, createSpecialGems, createGemsMixAny, transform,
  destroyChosenRow, destroyRandomCols, destroyArea, destroyChosenCross, explodeRandomGems,
  explodeRandomSkulls, summonRef, summonRandom, extraTurn, sacrifice,
  devour, summonCopy, swapPositions, transformSelfFrom, boostPer, gainSouls, stealGold, gainGold, scale, flat,
  oneOf, chooseSkill, randomStat, reposition, skillOnce, stealRandomStat, CELL, explodeAt, dispelStatus,
} from '../builders';
import { POSITIVE_STATUS_IDS } from '../effects/status';
import { BaseColor } from '../../types';
import type { CondMult } from '../effects/secondary';

/** 「如果敌人是 Boss，则根据我的升华等级造成 3 倍伤害」（r18 BOSS_ASC3 同款惰性建模） */
const BOSS_ASC3: CondMult = {
  times: 3,
  cond: { kind: 'allOf', of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }] },
};

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友（哪一名？）无来源 kind（allyStatSum 为总和、chosenStat 为选定目标）；「3-8 点法力值」区间与尾缀本身可表（r17-r22 口径维持）' },
  { id: 7435, reason: '「如果自身有 12 个或更多灵魂」= 经济阈值条件不在条件域（无 economy 阈值叶子，r18 口径维持）；恶魔盟友魔法增益本身可表' },
  { id: 7460, reason: '「花费我所有的黄金」= 经济支出无对应原语（仅 gainGold 入账、无 spend/lose 通道，r18 口径维持）' },
  { id: 7483, reason: '「伤害值等同于自身的攻击力，并因棕色敌军数量而增强 [x10]」= 伤害基数=攻击力（×1）与来源计数（×10）双结构，modifier 单 mod 无法同表（r21 编码歧义不猜口径维持）' },
  { id: 7493, reason: '历史跳过；现已依据原始 A-B-C-D-E-F 六步骤在 batch-acceptance 恢复，非永久排除。共享吞噬、转化池及状态规则另待认证。' },
  { id: 7542, reason: '「凤凰涅槃浴火重生」= 自复活无引擎机制（r18 口径维持）；散射+selfStat hp 增强本身可表' },
  { id: 7646, reason: '「消除一名敌人所有的正面增益效果」= 驱散敌方全部增益（spell-rules §6/§7 不做）；「因敌方的野兽数而增强 [x4]」本身已可表（enemiesOfRace，K-E 批）' },
  { id: 7667, reason: '「创造 6 颗红色宝石、数量因自身黄金数而增强、上限为 14 颗」= battleGold 来源已可表，但 CountMax 上限无原语（r18 口径维持）' },
  { id: 7690, reason: '「并将其冻结。如果该敌人已被冻结，则再造成 5 点伤害」= 条件须读施加冻结**之前**的状态快照，段序执行后 targetStatus 恒真（时序绑定无原语，r17-r22 口径维持）' },
  { id: 7810, reason: '「爆破敌军法力颜色的宝石、20% 几率吞噬他们」= ColorSpec ENEMY 逐段独立掷签且不落跨段追踪，「them」目标绑定断裂（引擎缺稳定敌色绑定，r18 口径维持）' },
  { id: 8037, reason: '「伤害值因其法力值而增强」官方 CountMana = 目标现行法力，targetStat 无 mana（仅 magic/manaCost）；「基于升天 3-5 倍」区间倍率亦不可表（r18 口径维持）' },
  { id: 8040, reason: '「窃取敌人四分之一的护甲值」= 25% 比例无原语（reduce 仅 halve 50%，r18 口径维持）；高塔/升天 3-5 倍区间同不做' },
  { id: 8056, reason: '「召唤一名恶魔」= summonRandom 需显式名册（Daemon 179 个兵种、无按种族召唤通道），硬编码名册不可维护（r18 口径维持）；吞噬盟友+条件召唤+生命增强散射本身可表' },
  { id: 8087, reason: '「伤害值因被窃取的黄金数而增强 [1:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额非本次窃取额），敌方黄金池扣除亦不可表（r18 口径维持）' },
  { id: 8141, reason: '「创造数量因窃取的黄金数而增强、上限为 16 颗」= 窃取额来源缺失 + CountMax 上限无原语（r18 口径维持）' },
  { id: 8142, reason: '「创造 6 颗骷髅头、数量因自身黄金数而增强、上限为 14 颗」= battleGold 来源已可表，但上限（官方 CountMax 8 → 6+8=14）无原语（r18 口径维持）' },
  { id: 8211, reason: '「或使其下潜、或吞噬、或转化成恶魔」官方步骤为顺序执行（Damage→Submerge→Transform→KnockBack→Consume，无分支标记）与 EN「OR」句式矛盾；「转化成一名恶魔」亦需 Daemon 名册（8056 同卡），r18 口径维持' },
  { id: 8243, reason: '「失去所有黄金」= 经济支出无对应原语（r18 口径维持）；随机技能值给予 + battleGold 修饰 + 爆破段本身可表' },
  { id: 8320, reason: '已被并发批次 batch-p41 收录（enemyChosenAndAdjacent 官方步骤口径），此处避让防批间重复（r17 同款约定）' },
  { id: 8377, reason: '「窃取 [魔法 + 1] 点魔力值并转换为随机技能值给予所有盟友」与官方步骤（CountMagic 100 全额魔法 → 每盟友 IncreaseRandom）互相矛盾，无法对号（r17/r21 口径维持）' },
  { id: 8553, reason: '「陷入狼化状态」不在 STATUS_WHITELIST（引擎 lycanthropy 本体已实现，但白名单在测试文件、本批无权扩容）——inflict 段必被校验拦截（r19 首判口径维持）；狼化宝石创造（lycanthropyGem 波B）与紫宝石几率额外回合均已可表' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件不在条件域（boardAtLeast 只计基色/骷髅）+ 狼化状态白名单缺口（8553 同卡，r20-r22 口径维持）' },
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 全咒语仅创造段、无任何 chosen 段驱动 TargetChooser，CHOSEN_TARGET 无回退值（r19/r21 口径维持；复制召唤本身 R22 已落地）' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 以创造宝石格为锚的周边位置计数（官方 BoardTarget SurroundingGems），boardGems 为全盘口径无位置来源（r19-r22 口径维持；石像鬼创造 createSpecialGems2 与 perCount 施加本已可表）' },
  { id: 8904, reason: '「伤害值因被窃取的黄金数而增强 [50:1]」= 文本明指来源（Gold stolen）须挂载而本次窃取额无 kind（battleGold 为共用池总额、非本次窃取额），敌方黄金池扣除亦不可表（r19-r22 口径维持）' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方全额黄金池无来源（§10.2 gainGold 口径仅适用定量句式），尾缀 [x10] 同源不可挂（r19-r22 口径维持）；伤害+出血本身可表' },
  { id: 9545, reason: '「转换颗数因诅咒敌人数增加」官方 ConvertGems UseCounterForAmount——transform count 仅静态缩放、无 modifier 通道（gems.ts doTransform 代码核实）；紫色龙宝石本身已落地（波B dragonGem spec.color，r19/r21「龙宝石未实现」旧卡点收口）' },
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= chanceBoost 有 ratio 通道但 CountMax 上限（官方 boost 封顶 +20%）无原语，线性叠加在高护甲下突破官方上限——不硬凑；ZH 30% 与官方 CountMax 20 实为一致（r19「数据矛盾」判读修正）；拉到后方 reposition 本身可表' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7000,
    desc: '摧毁 1 颗宝石和其两侧的宝石。',
    // 官方句（9052 同款 EN「…a gem and the Gems either side of it」）= Block1x3 一行三格：
    // 裸单颗 → 玩家点选锚格 + 同行左右各一格（row3 + CELL）。
    build: skill(
    destroyArea('row3', 'destroy', CELL),
    ),
  },
  {
    id: 7047,
    desc: '吞噬一名盟友。治疗自身并创造 6 颗骷髅头。',
    // Devour 家族回收（R22 devour 原语）：吞噬选定盟友（即杀+官方成长额度）→ 回满生命 → 6 骷髅。
    // sa-F1: native step 0 Dispel@FromTarget runs before Consume, so an ally's Barrier cannot block the devour.
    build: skill(
    ...POSITIVE_STATUS_IDS.map((statusId) => dispelStatus(statusId, 'allyChosen')),
    devour('allyChosen', { chance: 1 }),
    heal('allySelf', 0, 0, { full: true }),
    createSkulls(6),
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
    dmg('enemyAll', 8, 0, { splitRandom: true, modifier: boostPer({ kind: 'teamSize', side: 'enemy', atCastStart: true }, 4) }),
    ),
  },
  {
    id: 7210,
    desc: '对 1 个敌人造成 [魔法 + 6] 伤害。有 40% 的几率会吞噬敌人。',
    // L1-consume-first (R001): native Consume(40%) FromTarget -> Damage FromTarget.
    build: skill(
    devour('enemyChosen', { chance: 0.4 }),
    dmg('lastTarget', 6, 1),
    ),
  },
  {
    id: 7211,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果敌人是精灵，则造成双倍伤害。获得 5 点生命值。同时有 50% 的几率吞噬精灵。',
    // Devour 家族回收：「是精灵则双倍」= condMult targetRace；「吞噬精灵」= ifCond targetRace
    // 辖吞噬段（非精灵目标被过滤、整段跳过）。
    // sa-F1 (R001): native s0 ConsumeConditional → s1 IncreaseHealth 5 → s2 Damage x2.
    build: skill(
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Elf' } }),
    heal('allySelf', 5, 0),
    dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Elf' } } }),
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
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，有 50% 的几率打错敌人。如果对方使用棕色法力值，则造成三倍伤害。',
    // 「打错敌人」家族按 8108/8307 官方步骤实锤口径：两段伤害各自掷签（FromTarget +
    // RandomEnemy），ZH「50% 打错」为机翻合并；「对方使用棕色法力值三倍」= condMult targetColor。
    build: skill(
    // sa-R6 L2-wrong-enemy-branches: native A-B = the chosen enemy OR (50%) a random enemy; was both hits in sequence
    oneOf(
      [dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Brown } } })],
      [dmg('enemyRandom', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Brown } } })],
    ),
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
    // sa-G (R001): native CountAttack@FromTarget 34 -> IncreaseHealth@AllAllies -> CountSet -> CountAttack 100 -> Damage.
    // The Life boost reads the chosen enemy's Attack x34% before the hit (was lastDamage after it: 0 through a Barrier).
    heal('allyAll', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'chosenStat', stat: 'attack' } } }),
    dmg('enemyChosen', 0, 0, { modifier: boostPer({ kind: 'targetStat', stat: 'attack' }, 1) }),
    ),
  },
  {
    id: 7280,
    desc: '吞噬一名敌人。创造 8 颗黄色宝石和 8 颗棕色宝石。只能施放一次。',
    // Devour 家族回收（无几率词 = 必发）；EN「Create 8 Yellow and 8 Brown Gems」= 黄棕各 8 颗；
    // 「只能施放一次」= skillOnce（§12.5）。
    build: skillOnce(
    devour('enemyChosen', { chance: 1 }),
    createGems(BaseColor.Yellow, 8),
    createGems(BaseColor.Brown, 8),
    ),
  },
  {
    id: 7281,
    desc: '对 1 名随机敌人造成 [魔法 + 2] 点伤害。有 25% 的几率吞噬敌人。 [1:1]',
    // Devour 家族回收；尾缀 [1:1] 无来源子句可绑（7xxx 无步骤数据），按孤儿尾缀先例
    // 不挂载不硬凑（r15 7032 / r17 7430 同口径）。
    build: skill(
    // sa-R5 (R001): native CountAttack@RandomEnemy -> Consume@FromPrevious 25% -> Damage@FromPrevious.
    devour('enemyRandom', { chance: 0.25 }),
    dmg('lastTarget', 2, 1),
    ),
  },
  {
    id: 7312,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，如果敌人是哥布林，则造成双倍伤害。获得 5 点生命值。同时有 50% 的几率吞噬哥布林。',
    // 同 7211（哥布林版）。
    // sa-F1 (R001): native ConsumeConditional -> IncreaseHealth 5 -> Damage x2.
    build: skill(
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Goblin' } }),
    heal('allySelf', 5, 0),
    dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Goblin' } } }),
    ),
  },
  {
    id: 7314,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害，有 50% 的几率打错敌人。如果对方使用黄色法力值，则造成三倍伤害。若敌人身亡，所有技能值增加 8点。',
    // 同 7254（官方两段伤害口径）；「所有技能值增加 8点」= 四维技能各 +8（AddForKill →
    // ifTargetDied，8307 官方 IncreaseAttack AddForKill 同族）。
    build: skill(
    // sa-R6 L2-wrong-enemy-branches: native AB-CD = the chosen enemy OR (50%) a random enemy, +8 all Skills if it died; was both hits
    // (the kill bonus follows the oneOf: it reads whichever enemy that branch hit; one Life segment for gowLifeRules)
    oneOf([dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } })], [dmg('enemyRandom', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Yellow } } })]),
    // native IncreaseAllStats AddForKill = all four Skills +8. ifTargetDied only held for the first of the four (each
    // self buff rewrites lastTarget, so Armor/Magic/Life never applied) -> castEnemyDied (9703 precedent)
    // sa-P P-G-ifTargetDied-after-self: native AddForKill -> ifTargetDied again (kill anchor survives self / gated steps)
    attack('allySelf', 8, 0, { ifTargetDied: true }),
    armor('allySelf', 8, 0, { ifTargetDied: true }),
    magic('allySelf', 8, 0, { ifTargetDied: true }),
    heal('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 7326,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害。如果敌人是骑士，则造成两倍伤害。有 50% 的几率吞噬骑士。',
    // 同 7211（骑士版，无生命段）。
    build: skill(
    // sa-R5 (R001): native ConsumeConditional (50% Knight) precedes Damage x2 Knight.
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Knight' } }),
    dmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Knight' } } }),
    ),
  },
  {
    id: 7328,
    desc: '对 1 名敌人施放法力灼烧，伤害值因自身魔力值而增强。将所有黄色宝石转换为蓝色。',
    // Native ManaBurn: Magic + selected enemy Mana; no drain. Conversion follows damage.
    build: skill(
    dmg('enemyChosen', 0, 1, { manaBurn: true }),
    transform(BaseColor.Yellow, BaseColor.Blue),
    ),
  },
  {
    id: 7354,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，如果敌人是龙族，则造成两倍伤害。获得 5 点生命值。同时有 50% 的几率吞噬龙族。',
    // 同 7211（龙族版）。
    // sa-F1 (R001): native ConsumeConditional -> IncreaseHealth 5 -> Damage x2.
    build: skill(
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Dragon' } }),
    heal('allySelf', 5, 0),
    dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Dragon' } } }),
    ),
  },
  {
    id: 7386,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害，有 50% 的几率打错敌人。如果对方使用绿色法力值，则造成三倍伤害。',
    // 同 7254（绿色版）。
    build: skill(
    // sa-R6 L2-wrong-enemy-branches: native A-B = the chosen enemy OR (50%) a random enemy; was both hits in sequence
    oneOf(
      [dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Green } } })],
      [dmg('enemyRandom', 4, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Green } } })],
    ),
    ),
  },
  {
    id: 7388,
    desc: '摧毁 1 行。对第一名敌人造成 [魔法 + 2] 点伤害，伤害值因该行被摧毁的骷髅头数而增强。 [x5]',
    // 「该行被摧毁的骷髅头数」= destroyedGems skulls 细分筛（R22 新来源，此前「无骷髅筛」口径收口）。
    build: skill(
    // native DestroyGems BoardTarget Row on a Board-target spell = the chosen gem's row, not a random row (sa-R1)
    destroyChosenRow(),
    dmg('enemyFront', 2, 1, { modifier: boostPer({ kind: 'destroyedGems', skulls: true }, 5) }),
    ),
  },
  {
    id: 7421,
    desc: '对最后两名敌人造成 [魔法 + 5] 点伤害。创造 8 颗蓝色宝石。同时有 35% 的几率吞噬最后一名敌人。',
    // Devour 家族回收：末 2 名伤害 → 8 蓝 → 35% 吞噬末位（enemyLast 独立解析）。
    build: skill(
    dmg('enemyLastN', 5, 1, { n: 2 }),
    createGems(BaseColor.Blue, 8),
    devour('enemyLast', { chance: 0.35 }),
    ),
  },
  {
    id: 7423,
    desc: '下列其一：给予 50 黄金，或对 1 名随机敌人造成 [魔法 + 3] 点伤害，或吞噬一名随机敌人，或爆破 6 颗宝石，或获得 [魔法 + 3] 点生命值，或获得 10 点魔力值。',
    // 六选一 = oneOf 六支（§9.3，未选中支零执行）；「吞噬」无几率词 = 必发（chance 1）；
    // 「给予 50 黄金」= gainGold 入账（§10.2）。
    build: skill(
    oneOf(
      [gainGold(50)],
      [dmg('enemyRandom', 3, 1)],
      [devour('enemyRandom', { chance: 1 })],
      [explodeRandomGems(6)],
      [heal('allySelf', 3, 1)],
      [magic('allySelf', 10, 0)],
    ),
    ),
  },
  {
    id: 7434,
    desc: '将板面上的紫色宝石数翻倍。再创造 3 颗紫色宝石。获得 [魔法 + 3] 个灵魂。 [1:1]',
    // 「翻倍」= 创造数量 = 板面紫宝石数（boardGems Purple [1:1]）——R22 8355 官方口径同款
    //（CreateGems UseCounterForAmount）；尾缀 [1:1] 挂翻倍段。
    build: skill(
    // sa-F2 fix round A (R001): native CreateGems (counter) ; GiveSouls 3+M ; Delay ; CreateGems 3 Purple
    createGems(BaseColor.Purple, 0, 0, { modifier: boostPer({ kind: 'boardGems', color: BaseColor.Purple }, 1) }),
    gainSouls(3, 1),
    createGems(BaseColor.Purple, 3),
    ),
  },
  {
    id: 7450,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害，伤害值因狼族盟友数而增强。如果敌方死亡，随机吞噬一名敌人。 [x4]',
    // 「狼族」= Wargare（troopTypes 取值域核实）[x4]；「如果敌方死亡，随机吞噬」= ifTargetDied
    // 辖必发吞噬段（R22 devour 原语回收）。
    build: skill(
    dmg('enemyChosen', 2, 1, { modifier: boostPer({ kind: 'alliesOfRace', race: 'Wargare' }, 4) }),
    devour('enemyRandom', { chance: 1, ifTargetDied: true }),
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
    id: 7480,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害。如果敌人是野兽，造成双倍伤害。同时有 10% 的几率吞噬野兽。',
    // 同 7211（野兽版，无生命段）。
    build: skill(
    // sa-R5 (R001): native ConsumeConditional (10% Beast) precedes Damage x2 Beast.
    devour('enemyChosen', { chance: 0.1, ifCond: { kind: 'targetRace', race: 'Beast' } }),
    dmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Beast' } } }),
    ),
  },
  {
    id: 7505,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。偷取 [魔法 + 4] 黄金。 [25:1]',
    // 「偷取黄金」从独立敌方余额转移；尾缀 [25:1] 无来源子句，孤儿先例不挂载。
    build: skill(
    dmg('enemyChosen', 4, 1),
    stealGold(4, 1),
    ),
  },
  {
    id: 7506,
    desc: '将蓝色宝石转换为骷髅头，并将棕色宝石转换为黄色宝石。对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因其他盟友的魔力值而增强。 [2:1]',
    // 「其他盟友的魔力值」= allyStatSum mana excludeSelf（R22 新口径，排除施法者）[2:1]。
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
    id: 7559,
    desc: '对敌人造成  [魔法 + 4]  点伤害。如果敌人使用蓝色法力值，则有 30% 的几率吞噬敌人。',
    // Devour 家族回收：「使用蓝色法力值则 30% 吞噬」= ifCond targetColor 辖吞噬段
    //（目标相对过滤——非蓝目标整段跳过，几率不掷）。
    build: skill(
    // sa-R5 (R001): native ConsumeConditional (30% Blue) precedes Damage.
    devour('enemyChosen', { chance: 0.3, ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
    dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 7566,
    desc: '对 1 名敌人造成 [魔法 + 8] 点伤害，伤害值因身处狂怒状态的盟友数而增强。同时有 25% 的几率吞噬位于敌人上方和下方的军队。 [x10]',
    // 「狂怒」= enraged（R10 别名口径）[x10]；「上方和下方的军队」= enemyAboveTarget/
    // enemyBelowTarget（R13）；EN「separate 25% chances」= 两段吞噬各自独立掷签。
    build: skill(
    dmg('enemyChosen', 8, 1, { modifier: boostPer({ kind: 'allyStatusCount', statusId: 'enraged' }, 10) }),
    devour('enemyAboveTarget', { chance: 0.25 }),
    devour('enemyBelowTarget', { chance: 0.25 }),
    ),
  },
  {
    id: 7633,
    desc: '对 1 名敌人造成 [魔法 + 4] 伤害。如果敌人是怪兽，则造成双倍伤害。获得 5 点生命值。同时有 50% 的几率吞噬怪兽。',
    // 同 7211（怪兽版）。
    // sa-F1 (R001): native ConsumeConditional -> IncreaseHealth 5 -> Damage x2.
    build: skill(
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Monster' } }),
    heal('allySelf', 5, 0),
    dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Monster' } } }),
    ),
  },
  {
    id: 7637,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。如果敌人已下潜，则有 50% 几率吞噬敌人。',
    // Devour 家族回收：「已下潜则 50% 吞噬」= ifCond targetStatus submerged 辖吞噬段。
    build: skill(
    // sa-R5 (R001): native ConsumeConditional (50% Submerged) precedes Damage.
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetStatus', statusId: 'submerged' } }),
    dmg('enemyChosen', 5, 1),
    ),
  },
  {
    id: 7642,
    desc: '将第一名敌人打回末位。对新的第一名敌人造成 [魔法 + 3] 点伤害。若有 13 颗或更多棕色宝石，则有 50% 几率吞噬敌人。',
    // 「打回末位」= reposition（§12.1）；「新的第一名」= 重定位后 enemyFront 执行时刻重解析；
    // 13+ 棕宝石 = boardAtLeast 全局条件辖吞噬段（Devour 家族回收）。
    build: skill(
    // sa-I (R001): native ConsumeConditional@FrontEnemy [AddFor10BrownGems 50] runs BEFORE Damage@FrontEnemy
    // (R003: threshold 13). A successful devour removes the new front enemy, so the hit lands on the next one.
    reposition('enemyFront', 'back'),
    devour('enemyFront', { chance: 0.5, ifCond: { kind: 'boardAtLeast', color: BaseColor.Brown, n: 13 } }),
    dmg('enemyFront', 3, 1),
    ),
  },
  {
    id: 7647,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害，并使其陷入织网状态。有 20% 的几率可吞噬敌人。',
    // L1-6469-order (R001): native Consume(20%) -> CauseWeb -> Damage, all FromTarget.
    build: skill(
    devour('enemyChosen', { chance: 0.2 }),
    inflict('web', 'lastTarget'),
    dmg('lastTarget', 3, 1),
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
    id: 7670,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。获得 10 个灵魂。如果敌方的生命值高于自身，则造成的伤害和获得的灵魂数翻三倍。',
    // 原生 7670：CountSet@FromTarget [AddForMoreLifeOnTarget 20] → GiveSouls@Self 10（+计数）→ Damage
    // [MultiplyForMoreLifeOnTarget 3]——生命比较在命中前（sa-P P-F3-prehit-target-compare：
    // chosenTargetStatBeatsCaster 读选定目标现值，按原生顺序先灵魂后伤害）。
    // 灵魂 ×3 = 10 + 20（条件段）拆段——经济段无 condMult 通道，语义等价。
    build: skill(
    gainSouls(10),
    gainSouls(20, 0, { ifCond: { kind: 'chosenTargetStatBeatsCaster', stat: 'hp' } }),
    dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'chosenTargetStatBeatsCaster', stat: 'hp' } } }),
    ),
  },
  {
    id: 7713,
    desc: '窃取一名敌人上限为 [魔法 + 5] 点的攻击力，并将之给予你第一位盟友。创造 22 颗宝石，所创造的宝石混合骷髅头和绿色宝石。 [20:1]',
    // 【挽救】「窃取并给予第一位盟友」= reduce + attack(allyFront) 挂 lastReduce（Wave4 跨段
    // 绑定，r19 指出的可表路径）；「上限为」= 夹零 up-to 语义（§14.8）；骷髅×绿色混合创造 =
    // mixAny（R22）；尾缀 [20:1] 无来源子句，孤儿先例不挂载。
    build: skill(
    reduce('enemyChosen', 'attack', 5, 1),
    attack('allyFront', 0, 0, { modifier: boostPer({ kind: 'lastReduce' }, 1) }),
    createGemsMixAny([BaseColor.Green, 'SKULL'], 22),
    ),
  },
  {
    id: 7724,
    desc: '将所有蓝色宝石转换成棕色。有 10% 的几率吞噬一名随机敌人，吞噬几率因转换的宝石数而增强。 [3:1]',
    // Devour 家族回收：「几率因转换宝石数增强 [3:1]」= chanceBoost transformedGems
    //（p39 8127 先例同构）。
    build: skill(
    transform(BaseColor.Blue, BaseColor.Brown),
    devour('enemyRandom', { chance: 0.1, chanceBoost: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'transformedGems' } } }),
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
    id: 7781,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人已陷入织网或缠绕状态，则有 50% 的几率吞噬敌人。',
    // Devour 家族回收：「织网或缠绕」= anyOf(targetStatus) 析取（目标相对过滤辖吞噬段）。
    build: skill(
    // sa-R5 (R001): native ConsumeConditional 50% AddForWeb, ConsumeConditional 50% AddForEntangle (two rolls), then Damage.
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetStatus', statusId: 'web' } }),
    devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetStatus', statusId: 'entangle' } }),
    dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 7808,
    desc: '对最强大的两名敌人造成 [魔法 + 2] 点伤害，伤害值因生命值满值或法力值满值的敌军数而增强。 [x4]',
    // 「生命值和法力值满值的敌军数」= enemyFull{hp,mana}（R22 新来源，官方 CountEnemiesFullMana 族）。
    build: skill(
    // sa-R7: native CountEnemiesFullHealth 400 + CountEnemiesFullMana 400 = two separate counts, each x4
    // (English "full Life or full Mana"); was one count of enemies with both full.
    dmg('enemyHealthiestN', 2, 1, { n: 2, modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'enemyFull', hp: true }, { kind: 'enemyFull', mana: true }] } }),
    ),
  },
  {
    id: 7812,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。自身每高于敌方一个技能即可窃取敌方 3 点魔力值。',
    // 「每高于敌方一个技能」= casterStatBeatsCount 四围比较计数（R22 新来源，randomStat 四维口径）
    // sa-I: native 4 x StealMagic@FromTarget 3 [AddForLess<Magic|Attack|Life|Armor>OnTarget] BEFORE Damage (R001);
    // steals Magic (was drain Mana after the hit). The four comparisons are independent of the Magic moved, so one
    // count taken before the steal equals the native per-step checks; the hit then uses the raised Magic.
    build: skill(
    steal('enemyChosen', 'magic', 'magic', 0, 0, { modifier: boostPer({ kind: 'casterStatBeatsCount' }, 3) }),
    dmg('lastTarget', 3, 1),
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
    // 裸单颗爆破 = 点选一格；「被摧毁的骷髅头数」= destroyedGems skulls。
    build: skill(
    explodeAt(CELL),
    createGems(BaseColor.Green, 4, 0, { modifier: boostPer({ kind: 'destroyedGems', skulls: true }, 3) }),
    ),
  },
  {
    id: 7984,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。有与自身攻击力等数的几率吞噬敌人。获得一个额外回合。 [1:1]',
    // Devour 家族回收：「几率=自身攻击力」= chance 0 + chanceBoost selfStat attack（§11 追加
    // 口径）；尾缀 [1:1] = 几率加成比率的序列化。
    build: skill(
    // sa-R5 (R001): native ConsumeConditional (chance = my Attack) precedes Damage@FromTarget.
    devour('enemyChosen', { chance: 0, chanceBoost: boostPer({ kind: 'selfStat', stat: 'attack' }, 1) }),
    dmg('enemyChosen', 4, 1),
    extraTurn(),
    ),
  },
  {
    id: 7987,
    desc: "窃取一名敌人 [魔法 + 1] 点护甲值，再将窃取的护甲值转换为第一位盟友的一项随机属性。 [100:1]",
    // 【挽救】「转换成随机技能值给予第一位盟友」= reduce + randomStat(allyFront) 挂 lastReduce
    //（r19 指出的可表路径）；尾缀 [100:1] 无来源子句，孤儿先例不挂载。
    build: skill(
    reduce('enemyChosen', 'armor', 1, 1),
    randomStat('allyFront', 0, 0, { oneSkill: true, modifier: boostPer({ kind: 'lastReduce' }, 1) }),
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
    trueDmg('enemyRandomN', 0, 0, { n: 3, randomWaves: 3, rangeSpec: { min: scale(4, 1), max: scale(8, 2) } }),
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
    id: 8086,
    desc: '诅咒和击晕一名敌人。有 25% 的几率吞噬一名随机敌人，几率因身亡的敌人数而增强。 [x5]',
    // Devour 家族回收：「几率因身亡敌人数增强 [x5]」= chanceBoost countEnemyDeaths
    //（官方 CountEnemyDeaths 500 = 每阵亡 +5%；引擎口径=本次施法内阵亡，Wave3 注记）。
    build: skill(
    inflict('curse', 'enemyChosen'),
    inflict('stun', 'lastTarget'),
    devour('enemyRandom', { chance: 0.25, chanceBoost: boostPer({ kind: 'countEnemyDeaths' }, 5) }),
    ),
  },
  {
    id: 8108,
    desc: '对一名敌人造成 [魔法 + 5] 点伤害，有 50% 的几率伤害值会打中另一名随机敌人。若敌人使用紫色的法力颜色，则造成 3 倍伤害。若敌人身亡，则创造 8 颗骷髅头。',
    // 官方步骤实锤（Bone Flail）：Damage FromTarget → CreateGems Skull 8 AddForKill →
    // Damage RandomEnemy → CreateGems Skull 8 AddForKill——「50% 打中另一名」为机翻合并。
    build: skill(
    // sa-R6 L2-wrong-enemy-branches: native AB-CD = hit the chosen enemy OR (50%) a random enemy, each followed by
    // 8 Skulls if it died; was both hits in sequence
    oneOf(
      [dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Purple } } }), createSkulls(8, 0, { ifTargetDied: true })],
      [dmg('enemyRandom', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Purple } } }), createSkulls(8, 0, { ifTargetDied: true })],
    ),
    ),
  },
  {
    id: 8143,
    desc: '对最后 2 名敌人造成 [魔法 + 5] 点伤害。若敌人身亡则获得 20 黄金和一个额外回合。',
    // 「若(任一)敌人身亡」= anyTrackedDied（R22 新条件，9986/9812 同款；官方 GiveGold/
    // ExtraTurnConditional 均 AddForKill）。
    build: skill(
    dmg('enemyLastN', 5, 1, { n: 2 }),
    gainGold(20, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    extraTurn({ ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 8182,
    desc: '对一名敌人造成 [魔法 + 4] 点真实伤害，若敌人陷入猎人标记状态，则使所有敌人陷入妖火状态。',
    // 「若该敌人陷入猎人标记」辖无目标段（妖火全体）= lastTargetStatus 全局条件（R22 新条件，
    // 7541/8276 同款；官方 CountSpecificStatusEffect huntersmark 步骤实锤）；猎人标记 = marked、
    // 妖火 = faerie-fire（波A 状态本体）。
    build: skill(
    trueDmg('enemyChosen', 4, 1),
    // sa-C r3: native counts Hunter's Mark on the target at step 0 (before the damage), so a
    // killed marked target still spreads Faerie Fire -> cast-start snapshot condition
    inflict('faerie-fire', 'enemyAll', { ifCond: { kind: 'lastTargetStatusAtCastStart', statusId: 'marked' } }),
    ),
  },
  {
    id: 8185,
    desc: '对所有敌人造成 {[(魔法 / 2) + 3] – [魔法 + 7] 点伤害，伤害值因陷入猎人标记的敌人数而加强。若有敌人身亡则赐福所有盟友。 [x5]',
    // 伤害区间 = rangeSpec（两条 scaling 对号入座；modifier 在区间两端照常生效）；
    // 「陷入猎人标记的敌人数 [x5]」= enemyStatusCount marked；「若有敌人身亡则赐福」=
    // anyTrackedDied（R22 新条件）+ blessed（R10 落地）。ZH 首括号「{[(」为数据原文照录。
    build: skill(
    dmg('enemyAll', 0, 0, {
      range: 'all',
      rangeSpec: { min: scale(3, 0.5), max: scale(7, 1) },
      modifier: boostPer({ kind: 'enemyStatusCount', statusId: 'marked' }, 5),
    }),
    inflict('blessed', 'allyAll', { ifCond: { kind: 'anyTrackedDied' } }),
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
    id: 8235,
    desc: '选定一个颜色，使所有其颜色的盟友获得法印效果并给予他们 6 点法力值，数值因选定颜色的宝石数量而增强。 [4:1]',
    // 【挽救】「其颜色的盟友」= targetColor CHOSEN 逐目标过滤（R22 8355 口径）；「选定色宝石
    // 数量 [4:1]」= boardGems CHOSEN（R22 8060 口径）——r18「boardGems 不支持 CHOSEN」卡点
    // 随 R22 收口；「法印」= enchanted（R10 落地）。
    build: skill(
    inflict('enchanted', 'allyAll', { ifCond: { kind: 'targetColor', color: 'CHOSEN' } }),
    // sa-R7: native CountGems FromTarget Amount 25 = [4:1] (floor(n x 25%), R003); was boostPer(..., 4) = x4.
    mana('allyAll', 6, 0, { ifCond: { kind: 'targetColor', color: 'CHOSEN' }, modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'boardGems', color: 'CHOSEN' } } }),
    ),
  },
  {
    id: 8237,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 3] 点伤害，。若敌人使用绿色法力值则造成双倍伤害。有 25% 的几率吞噬一名随机敌人。',
    // 官方步骤序：Consume(25%, RandomEnemy) → Damage FromTarget ×绿 → Damage
    // RandomPrefNotPrev ×绿——吞噬先行（8108「步骤序优先」同款）；「NotPrev」（优先避开
    // 前目标）引擎无对应目标模式，以 enemyRandom 近似注明。ZH「伤害，。」标点为数据原文。
    build: skill(
    devour('enemyRandom', { chance: 0.25 }),
    dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
    // sa-R5: native RandomPrefNotPrevEnemy (avoids the chosen enemy just hit; R007-3).
    dmg('enemyRandomPrefNotPrev', 3, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 8248,
    desc: '对一名敌人和其下方的敌人造成 [魔法 + 4] 点真实伤害，伤害值因紫色宝石数而增强。若敌人身亡则创造 12 颗紫色宝石。否则就召唤 2 名暗影姐妹。 [1:1]',
    // 官方步骤（Darkness Eternal）：TrueDamage FromTarget/NextDownFromTarget ×4（CountGems
    // Purple UseCounter）→ CreateGems Purple 12 AddForKill → SummoningConditional 6477 ×2
    //（无击杀才召唤）——NextDown = enemyNextDown（R22 新目标）；「否则」= not anyTrackedDied。
    build: skill(
    // sa-F1: both hits in one segment (enemyChosenAndNextDown) — enemyNextDown found nothing once the chosen enemy
    // had died from the first hit, so the enemy below was skipped exactly when the kill branch fires.
    dmg('enemyChosenAndNextDown', 4, 1, { range: 'all', trueDamage: true, modifier: boostPer({ kind: 'boardGems', color: BaseColor.Purple }, 1) }),
    createGems(BaseColor.Purple, 12, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    summonRef('SisterOfShadows', 6477, { countRange: { min: 2, max: 2 }, ifCond: { kind: 'not', cond: { kind: 'anyTrackedDied' } } }),
    ),
  },
  {
    id: 8273,
    desc: '给予所有黄色盟友 [魔法 + 1] 点生命值和 2 点魔力值。有 35%的几率召唤首位敌人的卡牌。',
    // 「所有黄色盟友」= targetColor Yellow 逐目标过滤（r21 口径）；「召唤首位敌人的卡牌」=
    // summonCopy enemyFront（官方 SummoningTarget FrontEnemy 35%，R22 新原语）。
    build: skill(
    heal('allyAll', 1, 1, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    // sa-H：原生 IncreaseSpellPower 2 / 英文 2 Magic = 魔法属性（原为 mana）
    magic('allyAll', 2, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),
    summonCopy('enemyFront', { chance: 0.35 }),
    ),
  },
  {
    id: 8276,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。若敌人已陷入疾病状态，则爆破 3 颗绿色宝石。若敌人陷入燃烧状态，则爆破 3 颗红色宝石。',
    // P-A-chosen-target-status-precast: native order (R001) ExplodeColor Red [AddForBurning@FromTarget] ->
    // ExplodeColor Green [AddForDisease@FromTarget] -> Damage@FromTarget; chosenTargetStatus reads the chosen enemy
    // before any targeting segment.
    build: skill(
    explodeRandomGems(3, 0, 'color', BaseColor.Red, { ifCond: { kind: 'chosenTargetStatus', statusId: 'burning' } }),
    explodeRandomGems(3, 0, 'color', BaseColor.Green, { ifCond: { kind: 'chosenTargetStatus', statusId: 'disease' } }),
    dmg('enemyChosen', 1, 1),
    ),
  },
  {
    id: 8307,
    desc: '对敌人造成 [魔法 + 5] 点伤害，但有 50% 的几率打错人。若敌人使用红色法力值，则造成 3 倍伤害。获得 16 点攻击力，如果敌人身亡。',
    // 官方步骤实锤（Bloody Club）：Damage FromTarget ×3red → IncreaseAttack 16 AddForKill →
    // Damage RandomEnemy ×3red → IncreaseAttack 16 AddForKill（两轮结构同 8108）。
    build: skill(
    // sa-R6 L2-wrong-enemy-branches: native AB-CD = the chosen enemy OR (50%) a random enemy, +16 Attack if it died; was both hits
    oneOf(
      [dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }), attack('allySelf', 16, 0, { ifTargetDied: true })],
      [dmg('enemyRandom', 5, 1, { condMult: { times: 3, cond: { kind: 'targetColor', color: BaseColor.Red } } }), attack('allySelf', 16, 0, { ifTargetDied: true })],
    ),
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
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人幸存，则窃取 4 点魔力值。',
    // 官方步骤（Devour Intellect）：Damage FromTarget 4 → StealMagic FromTarget 4——
    // 窃取段打 lastTarget，阵亡时自然空转（步骤无独立幸存判定，ZH 为叙述性措辞）。
    build: skill(
    dmg('enemyChosen', 4, 1),
    steal('lastTarget', 'magic', 'magic', 4, 0),
    ),
  },
  {
    id: 8406,
    desc: '给予所有其他盟友四分之一的法力值。每有一名法力值满值的敌人，则创造 7 颗红色宝石。有 15% 的几率自毁。 [x7]',
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
    // sa-R6 L2-6946-order：原生先计诅咒数并施屏障（步骤 0-1），再重新计数、伤害（2-4）；原为先伤害后屏障，
    // 伤害打死的受诅咒敌人不再计入屏障数（R001）
    inflict('barrier', 'allyAll', { perCount: boostPer({ kind: 'enemyStatusCount', statusId: 'curse' }, 1) }),
    dmg('enemyAll', 1, 1, { range: 'all', modifier: boostPer({ kind: 'enemyStatusCount', statusId: 'curse' }, 2) }),
    ),
  },
  {
    id: 8429,
    desc: '爆破 [魔法 + 1] 颗绿色或紫色宝石。再使第一位敌人陷入诅咒和织网状态。',
    // 原生 Randomize ABC-DEF：A = ExplodeColor Green [M+1] → Curse → Web；D = ExplodeColor Purple [M+1] → Curse → Web
    // （二选一各 1/2；两分支状态段相同，提到 oneOf 之后，顺序不变）。sa-H：原为双色并集池同时爆破。
    build: skill(
    oneOf(
      [explodeRandomGems(1, 1, 'color', BaseColor.Green)],
      [explodeRandomGems(1, 1, 'color', BaseColor.Purple)],
    ),
    inflict('curse', 'enemyFront'),
    inflict('web', 'enemyFront'),
    ),
  },
  {
    id: 8467,
    desc: '对一名敌人造成 [魔法 + 2] 点真实伤害。若敌人使用蓝色法力值，则摧毁一列，并获得 5 点攻击力。 [x5]',
    // 官方步骤（Howling Blow）：CountArmyColor Blue 500 → DestroyColumn AddForBlueTarget →
    // IncreaseAttack UseCounter（[x5] 挂攻击段）→ TrueDamage FromTarget ×2——
    // 「若敌人使用蓝色法力值」= lastTargetColor 全局条件（R22 新条件）。
    build: skill(
    // CountArmyColor@FromTarget 500 Blue counts the target only (0/1): fixed 1 column / +5 Attack gated on the target's colour (sa-R1)
    // native order (R001, P-R1-chosen-target-color-cond): DestroyColumn, IncreaseAttack, then TrueDamage last
    destroyRandomCols(1, 0, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Blue } }),
    attack('allySelf', 5, 0, { ifCond: { kind: 'chosenTargetColor', color: BaseColor.Blue } }),
    trueDmg('enemyChosen', 2, 1),
    ),
  },
  {
    id: 8504,
    desc: '爆破 3 颗骷髅。获得 [(魔法 / 2) + 1] 点攻击力。',
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
    // Native order: explode if the selected enemy is Construct, then two separate splash centres.
    build: skill(
    explodeRandomGems(8, 0, 'all', undefined, { ifCond: { kind: 'chosenTargetRace', race: 'Construct' } }),
    dmgSplash('enemyChosen', 2, 1, { splashRatio: 0.25 }),
    dmgSplash('enemyRandomPrefNotPrev', 2, 1, { splashRatio: 0.25 }),
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
    id: 8568,
    desc: '窃取敌人 [魔法 + 1] 黄金。再耗掉一名敌人 8 点法力值并将他冻结。 [100:1]',
    // CountEnemyGold -> CountMaxWithMagic -> TakeEnemyGold -> GiveGold: transfer available Gold.
    build: skill(
    stealGold(1, 1),
    reduce('enemyChosen', 'mana', 8, 0),
    inflict('frozen', 'lastTarget'),
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
    // sa-F2 fix round A: native steps 2-5 are unconditional @FromTarget (a dead target is simply skipped):
    // DecreaseArmor 10 ; DecreaseAttack 10 ; DecreaseSpellPower 10 ; TrueDamage 10. The old lastTarget +
    // lastTargetSurvived form did nothing when the execute roll missed (no tracked target).
    createSkulls(12, 0, { ifCond: { kind: 'castEnemyDied' } }),
    reduce('enemyChosen', 'armor', 10, 0),
    reduce('enemyChosen', 'attack', 10, 0),
    reduce('enemyChosen', 'magic', 10, 0),
    trueDmg('enemyChosen', 10, 0),
    ),
  },
  {
    id: 8812,
    desc: '爆破一颗宝石。每有一颗骷髅头被摧毁，则再爆破一颗随机宝石。 [1:1]',
    // 首颗点选；「每有一颗骷髅头被摧毁则再爆破一颗」= destroyedGems skulls 驱动爆破数量 [1:1]。
    build: skill(
    explodeAt(CELL),
    // native second ExplodeGems has no Amount: one per Skull destroyed, no base (sa-R1)
    explodeRandomGems(0, 0, 'all', undefined, { modifier: boostPer({ kind: 'destroyedGems', skulls: true }, 1) }),
    ),
  },
  {
    id: 8859,
    desc: '&& 窃取 1 名敌人 [魔法 + 1] 黄金 && 窃取一名随机敌人 [魔法 + 1] 点随机技能值 [100:1]',
    // Gold now transfers against the independent enemy balance; native CountEnemyGold(1) metadata still requires review.
    // 「窃取随机技能值」= stealRandomStat（R12）；尾缀 [100:1] 孤儿先例不挂载。
    build: skill(chooseSkill(['窃取敌人黄金', '窃取随机敌人属性'], [stealGold(1, 1)], [stealRandomStat('enemyRandom', 1, 1)])),
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
    // 官方句「Explode a gem and the Gems either side of it」= row3 一行三格 + 点选锚
    // （R22 原语，7000 同款 explode 版）；缠绕+织网双施加。
    build: skill(
    destroyArea('row3', 'explode', CELL),
    // native CauseEntangle@RandomEnemy ; CauseWeb@FromPrevious: the same random enemy gets both
    inflict('entangle', 'enemyRandom'),
    inflict('web', 'lastTarget'),
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
    // native Randomize A+(B-C-D-E-F): B and F both summon 6105 Ragnagord -> Ragnagord 2/5, the others 1/5 each (sa-E L1)
      summonRandom(['Ragnagord', 'NUTCRKR-1225', 'Tannenbaum', 'KrisKrinkle', 'Ragnagord']),
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
    // sa-R6 L2-7556-gold-count：原生 CountMyGold 是第 0 步（获得黄金之前）→ 疾病段移到 gainGold 之前，
    // 计数不含本次获得的 [魔法 + 1]（原为获得后计数）；转换、获得黄金与疾病互不影响，其余顺序不可观察。
    transform(BaseColor.Yellow, BaseColor.Brown),
    inflict('disease', 'enemyAll', { perCount: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } }),
    gainGold(1, 1),
    ),
  },
  {
    id: 9364,
    desc: '对敌人造成 [魔法 + 3] 点伤害。有 10% 的几率吞噬敌人，几率会随着敌人法力颜色最常用的宝石数量而增加。 [x2]',
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
    // sa-R5 (R001): native ConsumeConditional@LastEnemy precedes Damage@LastEnemy.
    devour('enemyLast', { chance: 0.3, chanceBoost: boostPer({ kind: 'destroyedGems', skulls: true }, 6) }),
    dmg('enemyLast', 3, 1),
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
    desc: '创造 14 颗绿色宝石和流血宝石（随机混合）。然后获得额外回合。',
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
    // L1-7793-prefnotprev (R007-3): native Charm@RandomEnemy -> DecreaseMana 8 FromPrevious ->
    // Charm@RandomPrefNotPrevEnemy -> DecreaseMana 8 FromPrevious; a lone enemy is charmed and drained twice.
    build: skill(
    inflict('charm', 'enemyRandom'),
    reduce('lastTarget', 'mana', 8, 0),
    inflict('charm', 'enemyRandomPrefNotPrev'),
    reduce('lastTarget', 'mana', 8, 0),
    heal('allySelf', 30, 0, { ifCond: { kind: 'anyTrackedDied' } }),
    inflict('blessed', 'allySelf', { ifCond: { kind: 'anyTrackedDied' } }),
    ),
  },
  {
    id: 9959,
    desc: '对敌人造成[魔法 + 4]点伤害。如果是首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。引爆2-5颗宝石。',
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
    // 原生 3 × Damage@RandomPrefNotPrevEnemy（R007-3：只避开上一个目标）
    ...[0, 1, 2].map(() => dmg('enemyRandomPrefNotPrev', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } })),
    inflict('terror', 'enemyAll', { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
];

export const BATCH_R22: CuratedBatch = { batch: 'R22', spells: SPELLS, skipped: SKIPPED };
