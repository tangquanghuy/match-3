/**
 * 放弃桶回收批 R13（2026-09-17）：编队全列方位 / 敌方色计数来源 / Circle 圈形清除批。
 *
 * 前置引擎工作（本批配套，逐条对过官方 SpellSteps，data/raw/spells.gow.en.json）：
 * - 编队全列方位 TargetMode（官方 AboveTarget/BelowTarget/BelowSelf/AboveSelf/SelfAndBelow）：
 *   enemyAboveTarget / enemyBelowTarget（选定目标编队位上方/下方的全部存活敌人；锚 = 目标在
 *   **其自身**队伍中的索引，8894「使一名盟友…对其下位所有敌人」= 选定盟友的己方索引映射到
 *   敌方同位切片）、allyBelowTarget（选定盟友下方盟友）、allySelfAndBelow / allyAboveSelf /
 *   allyBelowSelf（施法者自身为锚）。切片实现 columnSlice 复用 enemyChosenAndBelow 的
 *   「编队伍索引」口径；敌方切片跳过下潮/隐匿（同 R11 enemyChosenAndAdjacent 邻居过滤）。
 * - ModifierSource enemiesOfColor { color }：敌方关联该法力色的存活敌人数（官方
 *   CountArmyColor Target=AllEnemies），与 alliesOfColor 完全对称。
 * - destroyArea 'circle5'（官方 BoardTarget=Circle）：以中心格为圆心、半径 2.5 格的圆内格
 *   集合（dx²+dy² ≤ 2.5²，8x8 中心处 21 格圆角盘 = 5x5 去四角），走 R12 既有 area 清除管线。
 *
 * 同批复核 R12 留下的「纯 DecreaseRandom」条目（12 条清单中 8684/8686/9241/9909/8165
 * 已在 batch-r12 组装，实余 7 条，本批再收 6 条）。
 *
 * 复核后仍不可表达（SKIP 记录保留在原批次文件，避免报告重复计数）：
 * - 8930「摧毁 5x5 圈宝石…」desc 与官方 SpellSteps 冲突（steps=DestroyGems Row +
 *   FirstTwoEnemies 伤害，无 Circle）——数据源不一致，不猜；
 * - 8927 desc 自身截断（「数值因被摧毁的 [x5]」）且「被摧毁的石像鬼宝石数」无按特殊宝石
 *   种类筛选的 destroyedGems 来源（destroyedGems 仅按基色筛）；
 * - 9371「使其下方敌受到其所受伤害的一半」可拆（SpellPower 0.75 同族），但「蓝龙宝石」=
 *   分色特殊宝石计数（CountGems DragonBlue），boardSpecial 无 color 筛 → 来源不符；
 * - 8248「若敌人身亡则创造 12 颗紫色宝石。否则就召唤…」——「否则」分支无「目标未身亡」
 *   条件原语（仅 ifTargetDied）；
 * - 8659「对一名敌人和其上位的敌人造成等同于其攻击力的伤害」——官方两条 Damage 共用
 *   CountAttack(FromTarget)（= 选定者的攻击力）；引擎 targetStat 读跨段追踪主目标，
 *   第二段解析 AboveTarget 后追踪已被覆写为上方敌人，口径不符；
 * - 8365（荆棘森林盟友数）/8723/9245/9249/8985/9588 等 CountArmyKingdom 王国计数来源缺；
 * - 8467「若敌人使用蓝色法力值，则摧毁一列…」——目标相对色条件须挂在跨段目标上，gem/增益段
 *   无从判定（条件域无 lastTargetColor）；
 * - 9875「蓝色宝石和友军可提升伤害」——友军计数官方 Data=0 而 desc 未指明颜色，颜色无法定；
 * - 9640 目标数 [魔法 + 2] 带魔法缩放无原语（R12 已记）；8356/8273/9219 按法力色选目标
 *   （EnemyColor/AllyColor TargetMode）与 8367 敌方可汲取法力总和来源不在本批三族内。
 *
 * 本批只收录回收成功条目（22 条）。
 */
import type { CuratedBatch } from './index';
import { targetedSkill, chooseSkill, skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic,
  reduce, drainMana, createSkulls, createMix, createSpecialGems, transformToSpecial,
  destroyArea, destroyRandomGems, explodeChosenRow, inflict, summonRef, summonRandom,
  extraTurn, CHOSEN, } from '../builders';
import { BaseColor } from '../../types';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  // —— 编队全列方位（官方 AboveTarget / BelowTarget / BelowSelf / AboveSelf / SelfAndBelow） ——
  {
    id: 9258,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，再使其下方所有敌人陷入燃烧状态。',
    // 「其下方所有敌人」= enemyBelowTarget（选定目标编队位下方切片，R13 新目标模式）
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('burning', 'enemyBelowTarget'),
    ),
  },
  {
    id: 8061,
    desc: '给予自身和自身下方的所有盟友 [魔法 + 6] 点攻击力。爆破 1 行。',
    // 官方 SelfAndBelow = 自身 + 下方盟友（含自身，R13 新模式）；「爆破 1 行」= explodeChosenRow
    //（batch-05/10/13「爆破一行」先例）
    build: skill(
      attack('allySelfAndBelow', 6, 1),
      explodeChosenRow(),
    ),
  },
  {
    id: 8310,
    desc: '给予所有在我下方的盟友 [魔法 + 1] 点生命值和 2 点魔力值。创建 8 颗骷髅头。',
    // 官方 BelowSelf ×2（不含自身；R13 新模式）；「2 点魔力值」= 常数（无 SpellPower）
    build: skill(
      heal('allyBelowSelf', 1, 1),
      magic('allyBelowSelf', 2, 0),
      createSkulls(8),
    ),
  },
  {
    id: 8175,
    desc: '为一名盟友赋予 [(魔法 x 1.5) + 3] 护甲。为其下方的所有盟友设置屏障。',
    // 官方 BelowTarget 锚 = 选定盟友的己方编队索引（R13 新模式 allyBelowTarget）
    build: skill(
      armor('allyChosen', 3, 1.5),
      inflict('barrier', 'allyBelowTarget'),
    ),
  },
  {
    id: 8541,
    desc: '摧毁一整块大小为 3x3 的宝石。给予所位于自身之上的盟友 [魔法 + 1] 点攻击力，和所有位于自身之下的盟友 3 点魔力值。',
    // 官方 AboveSelf + BelowSelf（R13 新模式）；Block3x3 DestroyGems = square3 destroy（R12 口径）
    build: skill(
      destroyArea('square3', 'destroy'),
      attack('allyAboveSelf', 1, 1),
      magic('allyBelowSelf', 3, 0),
    ),
  },
  {
    id: 8485,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害，伤害值因自身护甲值而增强。每一名受到伤害的敌人各有 30% 的几率陷入沉默状态。 [3:1]',
    // 「因自身护甲值 [3:1]」= selfStat armor；「受到伤害的敌人」= 选定者 + 上下相邻
    //（官方 FromTarget/NextUp/NextDown 三步）各 30%——段级 chance（R11 8069 先例口径）
    build: skill(
      dmgSplash('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
      inflict('silence', 'enemyChosen', { chance: 0.3 }),
      // P-R3-next-up-target: native CauseSilence@NextUpFromTarget and @NextDownFromTarget are independent 30% rolls
      inflict('silence', 'enemyNextUp', { chance: 0.3 }),
      inflict('silence', 'enemyNextDown', { chance: 0.3 }),
    ),
  },
  {
    id: 8590,
    desc: '耗掉一名敌人所有法力值。对其和其上位所有敌人造成 [魔法 + 2] 点伤害，伤害值因耗掉的法力值数而增强。 [2:1]',
    // 「对其和其上位」= 选定者 + AboveTarget（R13 新模式）两段；「因耗掉的法力值数 [2:1]」=
    // drainedMana（官方 CountDrainableMana）
    build: skill(
      drainMana('enemyChosen'),
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'drainedMana' } },
      }),
      // 上位全体 = 纵向切片多目标 → range 'all'（dmgAll 同口径；下同）
      dmg('enemyAboveTarget', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 9017,
    desc: '&& 对一名选定敌人造成 [(魔法 x 2) + 4] 点真实伤害，使他们陷入死亡标记状态并耗掉他们的法力值  && 对其他所有敌人造成 [(魔法 x 2) + 4] 点伤害',
    // 官方步骤序：死亡标记 → 耗蓝 → TrueDamage → AboveTarget/BelowTarget（三队伍下
    // 上+下即「其他所有敌人」；标记/耗蓝先行，避免主目标阵亡后段空转）
    build: targetedSkill('enemyChosen', chooseSkill(["对所选敌人施加死亡标记、耗尽法力并造成［魔法×2＋4］真实伤害","对所选目标之外的其他敌人造成［魔法×2＋4］伤害"], [inflict('death-mark', 'enemyChosen'), drainMana('enemyChosen'), trueDmg('enemyChosen', 4, 2)], [dmg('enemyAboveTarget', 4, 2, { range: 'all' }), dmg('enemyBelowTarget', 4, 2, { range: 'all' })])),
  },
  {
    id: 8894,
    desc: '使一名敌人陷入诅咒和死亡标记状态。再对其下位所有敌人造成 [(魔法 x 1.5) + 3] 点伤害。再召唤阿伯拉瑟。',
    // L1-7260-target: English "Curse and Deathmark an Enemy", native Target Enemy + FromTarget
    // (stored zh 一名盟友 is a localisation error, corrected via gowSnapshotOverrides.json).
    // 「对其下位所有敌人」= enemyBelowTarget anchored on the chosen enemy; 阿伯拉瑟 = Abhorath (6067).
    build: skill(
      inflict('curse', 'enemyChosen'),
      inflict('death-mark', 'enemyChosen'),
      dmg('enemyBelowTarget', 3, 1.5, { range: 'all' }),
      summonRef('Abhorath'),
    ),
  },
  {
    // —— 敌方侧法力色计数来源 enemiesOfColor（官方 CountArmyColor Target=AllEnemies） ——
    id: 8089,
    desc: '窃取一名敌人 [魔法 + 1] 点生命值，数量因紫色的盟友和敌军数量而增强。  [x4]',
    // 「窃取生命」= dmg + drain（batch-01 7302 口径）；「紫色的盟友和敌军」= alliesOfColor +
    // enemiesOfColor（R13 新来源）计数相加
    build: skill(
      dmg('enemyChosen', 1, 1, {
        drain: true,
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [
            { kind: 'alliesOfColor', color: BaseColor.Purple },
            { kind: 'enemiesOfColor', color: BaseColor.Purple },
          ],
        },
      }),
    ),
  },
  {
    id: 8599,
    desc: '制造2个头骨，由棕色盟友和敌人激发。 [x2]',
    // 「每 1 名棕色盟友/敌人 +2 骷髅」= base 0 + 2×(alliesOfColor+enemiesOfColor Brown)
    build: skill(
      // Native CreateGems Skull Amount 2 UseCounterForAmount = 2 + counter (L4b-7071-base).
      createSkulls(2, 0, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'alliesOfColor', color: BaseColor.Brown },
            { kind: 'enemiesOfColor', color: BaseColor.Brown },
          ],
        },
      }),
    ),
  },
  {
    id: 8784,
    desc: '每有一名绿色盟友或敌人，则创建 3 颗混合绿色和红色的宝石。 [x3]',
    // CreateGems2Colors = createMix（逐颗随机取色）；3×(绿色盟友+敌人数)
    build: skill(
      createMix([BaseColor.Green, BaseColor.Red], 0, 0, {
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [
            { kind: 'alliesOfColor', color: BaseColor.Green },
            { kind: 'enemiesOfColor', color: BaseColor.Green },
          ],
        },
      }),
    ),
  },
  {
    id: 8204,
    desc: '创建 9 颗骷髅头，数量因绿色的敌人和盟友数而增强。召唤一名随机豺狼。 [1:1]',
    // [1:1] = 每 1 名绿色盟友/敌人 +1 骷髅（base 9 保留，desc「数量因…而增强」口径）；
    // 「随机豺狼」= 官方三候选 × troops.json 取交集（SavageHunter/Gnoll/BaneJaw，R10 K3066 同法）
    build: skill(
      createSkulls(9, 0, {
        modifier: {
          mod: { kind: 'ratio', a: 1, b: 1 },
          sources: [
            { kind: 'alliesOfColor', color: BaseColor.Green },
            { kind: 'enemiesOfColor', color: BaseColor.Green },
          ],
        },
      }),
      summonRandom(['SavageHunter', 'Gnoll', 'BaneJaw']),
    ),
  },
  {
    id: 8758,
    desc: '爆破 3x3 块宝石。每有一名红色盟友或敌人则创造一颗燃烧宝石。 [1:1]',
    // 燃烧宝石 = burningGem（波A）；1×(红色盟友+敌人数)
    build: skill(
      destroyArea('square3', 'explode'),
      createSpecialGems({ kind: 'burningGem' }, 0, 0, {
        modifier: {
          mod: { kind: 'multiplier', a: 1 },
          sources: [
            { kind: 'alliesOfColor', color: BaseColor.Red, atCastStart: true },
            { kind: 'enemiesOfColor', color: BaseColor.Red, atCastStart: true },
          ],
        },
      }),
    ),
  },
  {
    id: 9958,
    desc: '引爆一排敌人。获得[魔法 + 1]点攻击力、生命值和护甲值，红色敌人可提升该数值。焚烧所有敌人。 [x3]',
    // 「引爆一排」= explodeChosenRow（batch-r11 9935 先例）；「红色敌人可提升 [x3]」=
    // enemiesOfColor Red（R13 新来源）分别挂攻/血/甲三段
    build: skill(
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } },
      }),
      heal('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } },
      }),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } },
      }),
      // native: CountArmyColor (step 0) before ExplodeGems; buffs first so skull kills from the row do not shrink the Red-enemy count (sa-R1)
      explodeChosenRow(),
      inflict('burning', 'enemyAll'),
    ),
  },
  {
    // —— Circle 圈形清除（官方 BoardTarget=Circle → destroyArea 'circle5'） ——
    id: 9712,
    desc: '摧毁一个5x5的圆圈。造成[魔法 + 12]点散射伤害，伤害值因摧毁的红色宝石数量而增强。获得一个额外回合。 [x15]',
    // 官方 ScatterDamage Target=AllEnemies → dmgAll（「散射只是类型词」SOP 口径）；
    // 「因摧毁的红色宝石 [x15]」= destroyedGems Red（先 destroy 后读计数）
    build: skill(
      destroyArea('circle5', 'destroy'),
      dmg('enemyAll', 12, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 15 }, source: { kind: 'destroyedGems', color: BaseColor.Red } },
      }),
      extraTurn(),
    ),
  },
  {
    // —— R12 留下的纯 DecreaseRandom 复核（reduce 'random' + times，R12 原语） ——
    id: 9861,
    desc: '将指定颜色的所有宝石转化为毒宝石。然后随机减少一名敌人的[魔法 + 1]点随机技能点数。',
    // 毒宝石 = poisonGem（波A）；「随机减少一名敌人」= enemyRandom（官方 RandomEnemy）
    build: skill(
      transformToSpecial(CHOSEN, 'poisonGem'),
      reduce('enemyRandom', 'random', 1, 1),
    ),
  },
  {
    id: 9514,
    desc: '通过随机技能消灭敌人的 [魔法 + 1] 个，因 Wargare Allies 而增强。造成恐惧。 [x2]',
    // 「因 Wargare Allies [x2]」= alliesOfRace 'Wargare'（troopTypes 英文拼写）；
    // 「造成恐惧」= terror（官方 CauseTerror，白名单已有）；「该敌人」= lastTarget
    build: skill(
      reduce('enemyChosen', 'random', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Wargare' } },
      }),
      inflict('terror', 'lastTarget'),
    ),
  },
  {
    id: 8499,
    desc: '消除一名敌人 [(魔法 / 2) + 1] 点随机技能值。摧毁8种宝石的法力颜色之一。可在任何敌人身上重复使用两次。',
    // 官方三组 DecreaseRandom + DestroyColor(Color=目标法力色之一)：首段选定敌，后两组
    // RandomPrefNotPrevEnemy = 独立随机敌；「其法力颜色之一」= LAST_TARGET（R12 选敌色口径，
    // 多法力色时 rng 掷选其一）
    build: skill(
      reduce('enemyChosen', 'random', 1, 0.5),
      destroyRandomGems(8, 0, 'color', 'LAST_TARGET'),
      reduce('enemyRandom', 'random', 1, 0.5),
      destroyRandomGems(8, 0, 'color', 'LAST_TARGET'),
      reduce('enemyRandom', 'random', 1, 0.5),
      destroyRandomGems(8, 0, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 8500,
    desc: '消除敌人的 [魔法 + 1] 项随机技能，由紫色宝石增强。然后召唤精灵、阿尔蒙迪尔、伊夫利特或道。 [3:1]',
    // 「由紫色宝石增强 [3:1]」= boardGems Purple；「召唤精灵/阿尔蒙迪尔/伊夫利特或道」=
    // 官方四召唤候选（Djinn/Al-Mundhir/Ifrit/Dao，troops.json 全在）→ summonRandom 池
    build: skill(
      reduce('enemyChosen', 'random', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      summonRandom(['Djinn', 'Al-Mundhir', 'Ifrit', 'Dao']),
    ),
  },
  {
    id: 9849,
    desc: '消除一名敌人的随机技能 [魔法 + 1]，效果因恶魔传送门宝石而增强。然后制造 2 颗恶魔传送门宝石。 [1:1]',
    // 恶魔传送门宝石 = daemonicPortalGem（波B）；[1:1] = 每颗 +1
    build: skill(
      reduce('enemyChosen', 'random', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSpecial', gem: 'daemonicPortalGem' } },
      }),
      createSpecialGems({ kind: 'daemonicPortalGem' }, 2),
    ),
  },
  {
    id: 8967,
    desc: '&& 消除敌人的 [魔法 + 1] 项技能，因天使宝石而增强。对恶魔的效果加倍。&& 消除敌人的 [魔法 + 1] 项技能，因天使宝石而增强。对亡灵的效果加倍。 [3:1]',
    // 官方两条 DecreaseRandom（StatusModifier MultiplyForDaemon/MultiplyForUndead）=
    // raceDouble Daemon / Undead 两段；「因天使宝石 [3:1]」= boardSpecial angelGem（波B）
    build: skill(chooseSkill(["削减一名敌人的随机属性，天使宝石增强，对恶魔加倍","削减一名敌人的随机属性，天使宝石增强，对亡灵加倍"], [reduce('enemyChosen', 'random', 1, 1, {
        raceDouble: 'Daemon',
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSpecial', gem: 'angelGem' } },
      })], [reduce('enemyChosen', 'random', 1, 1, {
        raceDouble: 'Undead',
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSpecial', gem: 'angelGem' } },
      })])),
  },
];

export const BATCH_R13: CuratedBatch = { batch: 'R13', spells: SPELLS, skipped: SKIPPED };
