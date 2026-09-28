/**
 * 放弃桶回收批 R12（2026-09-17）：面积形状/数值原语批。
 *
 * 前置引擎工作（本批配套，逐条对过官方 SpellSteps）：
 * - 面积形状清除 destroyArea(shape, mode)（ClearTarget 新 'area' 族）：square5=官方 Block5x5、
 *   square3=Block3x3、cross3=Block1x3+Block3x1（十字 5 格）、x=过中心两条对角线（「以 X 形状
 *   摧毁宝石」，用户裁定口径）。形状即完整目标集——**不再 8 邻辐射**，mode 只区分事件类型。
 *   中心格缺省 = 棋盘几何中心（8x8 取 floor((N-1)/2)=3），可显式给格或 'CELL'。
 * - 比例法力 mana fraction（官方 GenerateQuarterMana）：「4 分之一 / 25% 法力值」=
 *   floor(manaCost × 0.25)，与既有 halve（50%）同族。
 * - 随机削减 reduce stat 'random'（官方 DecreaseRandom）：执行时 rng 在攻/甲/魔三围掷选其一；
 *   opts.times 为连掷次数（「从其 2 个随机技能值各消除 N 点」= 官方两条独立 DecreaseRandom 步骤，
 *   每步独立掷签）；窃取变体 stealRandomStat：施法者获得掷中那项属性。
 * - ColorSpec 'LAST_TARGET' 回退 ctx.chosenTargetId：「选择一名敌人。摧毁其法力颜色的宝石」
 *   ——清除段本身是首段、跨段追踪尚无主目标时回退到玩家选定的敌人（9540/8069 先例的延伸）。
 *
 * 同批复核既有原语残留：
 * - 8292「缠绕…或给予…」：oneOf + 既有 halve（原跳过记录早于原语批）。
 * - 9602/9814「数量/伤害由我的金币加成 [10:1]」：battleGold 来源（R8 裁定）+ bootyGem/选敌色
 *   现已可表达（batch-24 9613 的「随机法力药水」卡点不适用此二条）。
 * - 7501「召唤 1-3 名随机剑锋崖军队」：summon countRange + 王国池（R10 K3066 同法：
 *   troops.gow.en.json KingdomId=3006 × troops.json referenceName 取交集）。
 *
 * 仍不可表达（SKIP 记录保留在原批次文件，避免报告重复计数）：
 * - Circle 形状（8927/8930/9712「5x5 圈/圆圈」官方 BoardTarget=Circle，形状语义未核实，不猜）；
 * - 逐来源重复施加状态（7463/8585「每爆破一颗骷髅头则赋予屏障」——状态段无 modifier 挂点，
 *   batch-21 7939 / batch-28 8885 同款）；
 * - AboveSelf/BelowSelf 编队上下文目标（8541）、严重/轻微溅射之分（8116 已按既有 dmgSplash
 *   单一溅射口径组装，batch-07 8113 先例）、燃烧宝石计数（8758 无敌方同色计数来源）；
 * - 跨段随机目标绑定 / [N:M] 无来源子句（7347/7602/9139）、目标偏移「打错敌人」（7254 等）、
 *   灵力宝石（8925 等 Spirit 宝石 kind 缺）、法力药水制作物（8604）、重复施放（8499）、
 *   敌方同族计数来源（8362）、多目标随机属性转换（8377）、狼人宝石（9183）。
 *
 * 本批只收录回收成功条目（26 条）。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, heal, armor, attack, mana, reduce, steal, stealRandomStat,
  createGems, transform, destroyChosenRow, destroyColor, destroyRandomGems, destroyArea,
  inflict, oneOf, extraTurn, createStorm, summonRandom, transformToSpecial, gainGold, targetedSkill,
} from '../builders';
import { BaseColor } from '../../types';

// 剑锋崖（KingdomId 3006，troops.gow.en.json × troops.json referenceName 取交集，R10 K3066 同法）
const K3006 = [
  'AldricTheFrostbound', 'BrassDrake', 'ChampionOfAnu', 'CourtJester', 'DragonCommander',
  'DragonKnight', 'Eleanor', 'GameWarden', 'GriffonCaptain', 'GriffonKnight', 'GuardianOfLaw',
  'HauntedGuardian', 'ImmortalZachariel', 'Innkeeper', 'JusticeTarot', 'KnightCaptain',
  'KnightCoronet', 'KnightErrant', 'LanceKnight', 'Man-at-Arms', 'Militiaman', 'MysteriousHero',
  'Orrissea', 'Peasant', 'QueenYsabelle', 'QueensHerald', 'Raquel', 'RelicKnight', 'SeabornKnight',
  'SerCygnea', 'ShadowDragon', 'SirEbonheart', 'SirGeoffreyTheFallen', 'SirGwayne',
  'SirQuentinHadley', 'SpectralColossus', 'Tau', 'TheFallenKnight', 'TheGuardianDragon',
  'UlfHarrigan', 'UlfsMascot', 'Vanguard', 'Warhound', 'WolfKnight',
];

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    // —— 随机削减 reduce 'random'（官方 DecreaseRandom） ——
    id: 7236,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害，减除 4 点随机技能值。如果敌人是兽人或恶魔，则窃取 6 点法力值。',
    // 「兽人或恶魔」= anyOf(targetRace Orc, targetRace Daemon)（目标相对条件，SOP 种族英文拼写）
    build: skill(
      dmg('enemyChosen', 6, 1),
      reduce('lastTarget', 'random', 4, 0),
      steal('lastTarget', 'mana', 'mana', 6, 0, {
        ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Orc' }, { kind: 'targetRace', race: 'Daemon' }] },
      }),
    ),
  },
  {
    id: 7310,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害，并窃取 [魔法 + 1] 点随机技能值。对机械军队造成两倍伤害。',
    // StealRandom：掷中哪项削哪项、施法者同项入账；「机械军队」= raceDouble 'Mech'
    // sa-F1 (R001): native s0 StealRandomStat runs before s1 Damage.
    build: skill(
      stealRandomStat('enemyChosen', 1, 1),
      dmg('enemyChosen', 1, 1, { raceDouble: 'Mech' }),
    ),
  },
  {
    id: 7319,
    desc: '减除一名敌人 [魔法 + 1] 点随机技能值。',
    // DecreaseRandom 本体：执行时 rng 掷攻/甲/魔其一
    build: skill(reduce('enemyChosen', 'random', 1, 1)),
  },
  {
    id: 7323,
    desc: '摧毁一行。对第一名敌人造成 [魔法 + 1] 点伤害，并减除 [魔法 + 1] 点随机技能值，减除数量因被摧毁的蓝色宝石而增强。 [x2]',
    build: skill(
      destroyChosenRow(),
      dmg('enemyFront', 1, 1),
      reduce('enemyFront', 'random', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 7340,
    desc: '减除全部敌人 [魔法 + 2] 点随机技能值。使他们陷入中毒和疾病状态。',
    build: skill(
      reduce('enemyAll', 'random', 2, 1),
      inflict('poison', 'enemyAll'),
      inflict('disease', 'enemyAll'),
    ),
  },
  {
    // —— 面积形状 destroyArea（官方 BoardTarget 实锤） ——
    id: 7411,
    desc: '以 X 形状摧毁宝石。对最后一名敌人造成 [魔法 + 1] 点伤害，伤害值因摧毁的紫色宝石数而增强。 [x3]',
    // X 形状 = 过棋盘中心的两条对角线（用户裁定口径；无官方步骤，形状家族唯一 X 句式）
    build: skill(
      destroyArea('x', 'destroy'),
      dmg('enemyLast', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 7482,
    desc: '召唤暗风暴。将所有敌人的随机一项技能值降低 [(魔法 / 2)] 点。',
    // 暗风暴 = createStorm(Purple)（batch-37 7498 口径）；[(魔法/2)] = mult 0.5
    build: skill(
      createStorm(BaseColor.Purple),
      reduce('enemyAll', 'random', 0, 0.5),
    ),
  },
  {
    id: 7501,
    desc: '创造 8 颗蓝色宝石和 8 颗棕色宝石。召唤 1 到 3 名随机剑锋崖军队。',
    // 「召唤 1 到 3 名」= countRange；「随机剑锋崖军队」= 王国池 randomOf（R10 K3066 同法）
    build: skill(
      createGems(BaseColor.Blue, 8),
      createGems(BaseColor.Brown, 8),
      summonRandom(K3006, undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 7596,
    desc: '移除选定颜色的宝石。减除最后一名敌人 [魔法 + 1] 点随机技能值，数量因被移除的宝石数量而增强。窃取 4 点法力值。 [3:1]',
    // 「因被移除的宝石数量」= destroyedGems 无色（R10 9639 口径，含任意被摧毁宝石）
    // Native (R001, sa-F1): CountGems chosen 34 → DecreaseRandom@LastEnemy → StealMana 4 → RemoveColor chosen.
    build: skill(
      reduce('enemyLast', 'random', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: 'CHOSEN' } },
      }),
      steal('enemyLast', 'mana', 'mana', 4, 0),
      destroyColor('CHOSEN'),
    ),
  },
  {
    id: 8066,
    desc: '摧毁一整块大小为 5x5 的宝石。使第一位敌人陷入诅咒、击晕和出血状态。',
    // 官方 DestroyGems BoardTarget=Block5x5；三状态 FrontEnemy
    build: skill(
      destroyArea('square5', 'destroy'),
      inflict('curse', 'enemyFront'),
      inflict('stun', 'enemyFront'),
      inflict('bleed', 'enemyFront'),
    ),
  },
  {
    id: 8116,
    desc: '对一名随机敌人造成 [魔法 + 8] 点严重的溅射伤害。摧毁一整块大小为 5x5 的宝石。有 50% 的几率对一名随机敌人造成 [魔法 + 8] 点轻微的溅射伤害。',
    // 严重/轻微溅射同为 dmgSplash（batch-07 8113 先例）；「有 50% 几率」= 段级 chance
    build: skill(
      destroyArea('square5', 'destroy'),
      dmgSplash('enemyRandom', 8, 1, { splashRatio: 0.75 }),
      dmgSplash('enemyRandomPrefNotPrev', 8, 1, { chance: 0.5, splashRatio: 0.25 }),
    ),
  },
  {
    id: 8164,
    desc: '摧毁一整块大小为 5x5 的宝石。对一名随机敌人造成  [魔法 + 3] 点伤害并将其击晕。',
    // 「并将其击晕」= 同一随机敌人（lastTarget 跨段绑定）
    build: skill(
      destroyArea('square5', 'destroy'),
      dmg('enemyRandom', 3, 1),
      inflict('stun', 'lastTarget'),
    ),
  },
  {
    id: 8165,
    desc: '诅咒一名敌人，并从其 2 个随机技能值消除 [魔法 + 1] 点。',
    // 官方两条 DecreaseRandom 步骤 = times 2（每步独立掷签）
    build: skill(
      inflict('curse', 'enemyChosen'),
      reduce('lastTarget', 'random', 1, 1, { times: 2 }),
    ),
  },
  {
    // —— 比例法力 mana fraction（官方 GenerateQuarterMana） ——
    id: 8289,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若对方是不死族，则使对方陷入诅咒和死亡标记状态。再给予其他盟友敌人 4 分之一的法力值。',
    // 「若对方是不死族」= targetRace Undead 目标相对条件；「其他盟友」= allyOthers（官方 AllAlliesButNotSelf）
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('curse', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Undead' } }),
      inflict('death-mark', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Undead' } }),
      mana('allyOthers', 0, 0, { fraction: 0.25 }),
    ),
  },
  {
    id: 8292,
    desc: '缠绕首 2 名敌人，或给予首 2 名盟友半数法力值。获得一个额外回合。',
    // 「X 或 Y」= oneOf；半数法力 = 既有 halve（原跳过记录早于引擎原语批，复核回收）
    build: skill(
      oneOf(
        inflict('entangle', 'enemyFirstN', { n: 2 }),
        mana('allyFirstN', 0, 0, { halve: true, n: 2 }),
      ),
      extraTurn(),
    ),
  },
  {
    id: 8358,
    desc: '获得 [魔法 + 1] 点生命值，数值因陷入织网状态的敌人而增强。给予所有盟友 4 分之一的法力值。 [x6]',
    build: skill(
      heal('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'web' } },
      }),
      mana('allyAll', 0, 0, { fraction: 0.25 }),
    ),
  },
  {
    id: 8424,
    desc: '以 3x3 交叉队列方式爆破宝石。获得 [魔法 + 1] 点护甲值和屏障效果。',
    // 官方 ExplodeGems Block1x3 + Block3x1 = 横竖各 3 格的十字（5 格）；形状即目标集不辐射
    build: skill(
      destroyArea('cross3', 'explode'),
      armor('allySelf', 1, 1),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 8684,
    desc: '消除所有敌人 [魔法 + 1] 点随机技能值。',
    // 官方 DecreaseRandom@AllEnemies
    build: skill(reduce('enemyAll', 'random', 1, 1)),
  },
  {
    id: 8686,
    desc: '创造 5 颗黄色宝石，再将所有黄色宝石转换成红色。消除一名敌人 [魔法 + 1] 点随机技能值。',
    build: skill(
      createGems(BaseColor.Yellow, 5),
      transform(BaseColor.Yellow, BaseColor.Red),
      reduce('enemyChosen', 'random', 1, 1),
    ),
  },
  {
    id: 9241,
    desc: '消除 2 名随机敌人 [魔法 + 1] 点随机技能值，数值因狂怒盟友数而择期。 [x3]',
    // 「择期」为乱码，官方 CountSpecificStatusEffect enraged = 数值增强（R10 enraged 同族口径）
    build: skill(
      reduce('enemyRandomN', 'random', 1, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'allyStatusCount', statusId: 'enraged' } },
      }),
    ),
  },
  {
    id: 9288,
    desc: '给予所有其他盟友 25% 法力值。若队伍有利奥拉·迷雾谷，则创建 7 颗黄色宝石。 [x7]',
    // 25% = fraction 0.25；官方 CountMax 7 封顶 → 队伍存在利奥拉即 7 颗（troopPresent 中文名）
    build: skill(
      mana('allyOthers', 0, 0, { fraction: 0.25 }),
      createGems(BaseColor.Yellow, 7, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '利奥拉·迷雾谷' } }),
    ),
  },
  {
    id: 9512,
    desc: '摧毁一个 5x5 的方块。获得 [(魔法 / 2) + 1] 点攻击力，攻击力由我的生命值和护甲值增强。 [4:1]',
    // 多来源计数相加（官方 CountLife + CountArmor）；[4:1] = 每 4 点(生命+护甲) +1
    build: skill(
      destroyArea('square5', 'destroy'),
      attack('allySelf', 1, 0.5, {
        modifier: {
          mod: { kind: 'ratio', a: 4, b: 1 },
          sources: [{ kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }],
        },
      }),
    ),
  },
  {
    // —— battleGold 来源残留复核（R8 裁定 + LAST_TARGET 回退选敌） ——
    id: 9602,
    desc: '选择一名敌人。摧毁其4颗相同法力颜色的宝石，数量等于我的金币。之后获得10金币并获得额外回合。 [10:1]',
    // 「其…法力颜色」= LAST_TARGET（首段无跨段追踪 → 回退 chosenTargetId）；「数量等于我的金币 [10:1]」
    // sa-F1: native Target Enemy — declare the chosen enemy (inputTarget), otherwise no target is picked and
    // LAST_TARGET resolves to nothing (no gems destroyed).
    build: targetedSkill('enemyChosen',
      destroyRandomGems(4, 0, 'color', 'LAST_TARGET', {
        modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } },
      }),
      gainGold(10),
      extraTurn(),
    ),
  },
  {
    id: 9604,
    desc: '摧毁一个 5x5 的方块。每摧毁一颗棕色宝石，所有盟友将获得 3 点护甲。 [x3]',
    // 官方 UseCounterForAmount（计数即数额）→ base 0 + 3×被摧毁棕宝石
    build: skill(
      destroyArea('square5', 'destroy'),
      armor('allyAll', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } },
      }),
    ),
  },
  {
    id: 9814,
    desc: '对一名敌人造成[魔法 + 4]点伤害，伤害由我的金币加成。然后将4颗敌人同色系的魔法宝石转化为战利品宝石。 [10:1]',
    // 「伤害由我的金币加成 [10:1]」= battleGold（R8 裁定）；「敌人同色系宝石→战利品宝石」=
    // transformToSpecial LAST_TARGET→bootyGem（9540 / 9736 先例）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } },
      }),
      transformToSpecial('LAST_TARGET', 'bootyGem', { count: 4 }),
    ),
  },
  {
    id: 9909,
    desc: '随机减少一名敌人的[魔法 + 1]点技能点数，诅咒和蛛网束缚的敌人可提升此效果。然后诅咒并束缚该敌人。 [x2]',
    // 「诅咒并束缚」= CauseCursed + CauseWeb（官方步骤实锤「束缚」=web）；「然后该敌人」= lastTarget
    build: skill(
      reduce('enemyRandom', 'random', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'curse' }, { kind: 'enemyStatusCount', statusId: 'web' }],
        },
      }),
      inflict('curse', 'lastTarget'),
      inflict('web', 'lastTarget'),
    ),
  },
];

export const BATCH_R12: CuratedBatch = { batch: 'R12', spells: SPELLS, skipped: SKIPPED };
