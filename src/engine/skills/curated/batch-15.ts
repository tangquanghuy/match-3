/**
 * 人工核对组装 · 批次 15（池：scripts/curated-pools/pool-15.json）
 * 核对者：agent 批次15
 *
 * 语义裁定备注：
 * - 「魔力值」= magic 属性、「法力值」= mana 资源（SOP 措辞裁定；batch-08 头注同款）：
 *   「耗掉 X 点法力值」= reduce stat:'mana' 带数值、「耗掉…所有法力值」= drainMana（spell-rules.md §3）。
 * - 「窃取 X 点生命值」= dmg + drain（batch-01 7302 同款）；「最强(健康)的敌人」= enemyHealthiest
 *   （spell-rules.md §0 目标措辞表）；「消除…全部护甲值」= reduce armor + drainAll（batch-01 7175 同款）。
 * - 「攻击力和护甲值」共用一个 modifier 子句：modifier 挂最近数值段（=护甲段），
 *   「一条技能至多一个 modifier」（batch-04 7027 / batch-05 7334 同款）。
 * - 「(并)将X宝石转换成骷髅头(以)增强伤害效果」：转化段排在被增强段之前，transformedGems
 *   来源只数「本技能前序段」（batch-07 7933 同款句式，含「并」字内嵌写法）。
 * - 多来源（「因黄色宝石和黄色盟友数而增强」）用 sources 计数相加（SOP §3；batch-12 7252 /
 *   batch-14 8251 先例；batch-08/09 时期「双来源合并 → 跳过」的口径已被 sources 原语取代）。
 * - 「召唤 3 名随机哥布林军队」：summonRandom 无数量参数 → 三个召唤段各召 1 名
 *   （batch-13 头注「召唤 3 只土狼」同款）；候选 = troopTypes 含 Goblin 的全部兵种（SOP §6 查询）。
 * - 「宝石」不含骷髅（随机宝石段 include:'color'）；「头骨」= createSkulls。
 */
import { skill, dmg, dmgAll, heal, armor, attack, reduce, drainMana, inflict,
  createSkulls, transform, createSpecialGems, destroyChosenRow, destroyChosenCol,
  explodeRandomGems, summonRandom, extraTurn } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

/** troopTypes 含 Goblin 的全部兵种 referenceName（SOP §6 查询命令得出） */
const GOBLINS = [
  'Goblin', 'GoblinShaman', 'BoarRider', 'GoblinKing', 'Hobgoblin', 'GoblinRocket',
  'NobendBrothers', 'SirSnothelm', 'Bugbear', 'PrincessFizzbang', 'QueenGrapplepot',
  'Hellcackle', 'IceGoblin', 'HighKingIrongut', 'KingGobtruffle', 'Stringfiddler',
  'Toadsqueezer', 'Goblette', 'Rogueling', 'Smashedmouth', 'Kobold', 'KoboldKnight',
  'KoboldMagi', 'Emperinazara', 'Fundingus', 'WilliTheAnchor', 'FlamingOni',
  'FaerieGobmother', 'GoblinBomber', 'KoboldEmissary', 'PriestOfNilbog', 'FrostfireGoblin',
  'Slughoarder', 'BombRider', 'CinderhandGoblin', 'Gloomhob',
  'KoboldThief', 'GoblinPickpocket', 'MokTheCannon-Rider', 'Skulker', 'ZargsBoomPile',
  'CountGobula', 'LordGobthe', 'ImmortalTrogolin', 'Murk,Lurk,AndDurk', // + raw TroopType Goblin (sa-E L1)
];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8479, reason: '隐匿/位置操作（「将他们击回末位」，batch-01 7534 / batch-08 8416 同款）' },
  { id: 8486, reason: '语义拿不准（「击晕所有受到伤害的敌人」跨段指回前段溅射伤害目标，batch-09 8690 同款；「打乱敌方队伍队形」亦属隐匿/位置操作，batch-01 8027 同款）' },
  { id: 8491, reason: '语义拿不准（「创造一个石墩」——石墩为棋盘物，无对应创造原语，batch-08 8492 同款）' },
  { id: 8502, reason: '句子式不明（「结果…分散的伤害，由燃烧的敌人激活」机翻无法解析，batch-08 8496 同款；「点燃1-3个」随机数量区间亦无原语，batch-08 8286 同款）' },
  { id: 8525, reason: '句子式不明（「敌人队伍使用对多的颜色宝石」机翻无法确解，batch-08 8526 同款）' },
  { id: 8527, reason: '句子式不明（「自身队伍使用对多的颜色宝石」机翻无法确解，batch-08 8526 同款）' },
  { id: 8528, reason: '句子式不明（「自身队伍使用对多的颜色宝石」机翻无法确解，batch-08 8526 同款）' },
  { id: 8541, reason: '句子式不明（「摧毁一整块大小为 3x3 的宝石」无对应面积清除原语，batch-08 8164 同款；「位于自身之上/之下的盟友」位置目标无对应模式，batch-08 8310 同款）' },
  { id: 8544, reason: '语义拿不准（「或…或…」三选一分支无法表达，batch-08 8212 同款）' },
  { id: 8599, reason: '二次缩放来源不支持（「由棕色盟友和敌人激发」——敌方侧种族计数无对应 kind，仅 alliesOfRace 己方，batch-16 8838 同款）' },
  { id: 8628, reason: '特殊宝石（元素星，batch-09 8633 同款；「4-6 颗」随机数量区间亦无原语）' },
  { id: 8629, reason: '隐匿/位置操作（「再将他们击回后方」，batch-01 7534 同款）' },
  { id: 8637, reason: '二次缩放来源不支持（「因被摧毁的绿色盟友…而增强」——被摧毁盟友计数无对应 kind）' },
  { id: 8653, reason: '二次缩放来源不支持（「每有一名元素敌人则摧毁 1 行」——敌方侧种族计数无对应 kind，仅 alliesOfRace 己方，batch-16 8838 同款）' },
  { id: 8679, reason: '特殊宝石（临界星，与元素星同族，batch-09 8633 同款；「5-7 颗」随机数量区间亦无原语；「随机临界诺斯军队」按王国随机亦无法表达，batch-16 8831 同款）' },
  { id: 8693, reason: '缺失状态（反射效果，batch-04 8919 同款；护甲段本可用 destroyedGems 表达）' },
  { id: 8723, reason: '二次缩放来源不支持（「因荆棘森林盟友数而加强」按王国计数无对应 kind，batch-08 8365 同款；「造成散射伤害」未指明目标亦句子式不明，batch-09 8639 同款）' },
  { id: 8737, reason: '语义拿不准（「盟友对应法力颜色」为所选盟友的动态颜色，CASTER 仅指施法者军队法力色，动态颜色不做，batch-12 7182 同款）' },
    { id: 8784, reason: '二次缩放来源不支持（「每有一名绿色盟友或敌人」——敌方侧种族/颜色计数无对应 kind，仅 alliesOfColor 己方，batch-16 8838 同款）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8470,
    desc: '耗掉一名敌人 7 点法力值，并消除其 [(魔法 / 2) + 1] 点魔力值。再将其击晕与缠绕。',
    build: skill(
      // 「耗掉 X 点法力值」= reduce stat:'mana' 带数值（spell-rules.md §3）；7 为常数
      reduce('enemyChosen', 'mana', 7, 0),
      // 「魔力值」= magic 属性（SOP 措辞裁定）；[(魔法 / 2) + 1] = base 1, mult 0.5
      reduce('enemyChosen', 'magic', 1, 0.5),
      // 「其」= 前文选定敌人，enemyChosen 跨段一致
      inflict('stun', 'enemyChosen'),
      inflict('entangle', 'enemyChosen'),
    ),
  },
  {
    id: 8497,
    desc: '创造 12 个厄运头骨。然后爆破 [(魔法 / 2) + 1] 颗宝石。',
    build: skill(
      // 回收（第六遍）：「厄运头骨」= doomSkull 同物异名（SOP「特殊宝石」词表对照），
      // 创造特殊宝石 = createSpecialGems（窗口 C 落地）
      createSpecialGems({ kind: 'doomSkull' }, 12, 0),
      // 「宝石」不含骷髅 → include:'color'（batch-15 头注口径）
      // native ExplodeGems Amount 1 SpellPowerMultiplier 0.5 = [(Magic / 2) + 1] (sa-F2 fix round A)
      explodeRandomGems(1, 0.5, 'color'),
    ),
  },
  {
    id: 8530,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。若敌人是怪兽，则缠绕他。若敌人是龙族，则造成 3 倍伤害。',
    build: skill(
      // 回收：ifCond 现支持条件触发、condMult 现支持 targetRace 条件倍率（SOP「通用条件触发 /
      // 条件加成」节，「若敌人是怪兽，则缠绕他」为节内原例）；怪兽 = Monster、龙族 = Dragon
      dmg('enemyChosen', 3, 1, { condMult: { times: 3, cond: { kind: 'targetRace', race: 'Dragon' } } }),
      inflict('entangle', 'enemyChosen', { ifCond: { kind: 'targetRace', race: 'Monster' } }),
    ),
  },
  {
    id: 8564,
    desc: '消除首 2 名敌人 [魔法 + 1] 点攻击力、后 2 名敌人 [魔法 + 1] 点魔力值。再耗掉最强的 2 名敌人所有法力值。',
    build: skill(
      // 「首 2 名敌人」= enemyFirstN + n:2；「消除…攻击力」= reduce
      reduce('enemyFirstN', 'attack', 1, 1, { n: 2 }),
      // 「后 2 名敌人」= enemyLastN + n:2；「魔力值」= magic 属性（SOP 措辞裁定）
      reduce('enemyLastN', 'magic', 1, 1, { n: 2 }),
      // 「最强的敌人」= enemyHealthiest（spell-rules.md §0）；「耗掉…所有法力值」= drainAll
      drainMana('enemyHealthiestN', { n: 2 }),
    ),
  },
  {
    id: 8608,
    desc: '制造4个头骨，由蓝色盟友激发。 [x4]',
    build: skill(
      // 「头骨」= 骷髅头；「由蓝色盟友激发」= alliesOfColor（batch-09 8672「绿色盟友」同款）
      // modifier 点名创造 → 挂创造段
      createSkulls(4, 0, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfColor', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8614,
    desc: '获得 [魔法 + 1] 点攻击力和护甲值，数值因骷髅头数量而增强。爆破 3 颗宝石。 [2:1]',
    build: skill(
      // sa-A r3: native IncreaseAttack + IncreaseArmor both UseCounterForAmount (CountGems Skull 50 = [2:1]);
      // ExplodeGems Amount 3 without colour = any 3 random gems (sa-R1 8812 precedent)
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardSkulls' } },
      }),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardSkulls' } },
      }),
      explodeRandomGems(3, 0, 'all'),
    ),
  },
  {
    id: 8648,
    desc: '召唤 3 名随机哥布林军队。再爆破 [魔法 + 1] 颗绿色宝石并获得一个额外回合。',
    build: skill(
      // summonRandom 无数量参数 → 三个召唤段各召 1 名随机哥布林（batch-13 头注同款）
      summonRandom(GOBLINS),
      summonRandom(GOBLINS),
      summonRandom(GOBLINS),
      explodeRandomGems(1, 1, 'color', BaseColor.Green),
      extraTurn(),
    ),
  },
  {
    id: 8673,
    desc: '获得 [魔法 + 1] 点攻击力、生命值和护甲值。若板面上有 13 或更多颗红色宝石，则创造 9 颗骷髅头。',
    build: skill(
      attack('allySelf', 1),
      heal('allySelf', 1),
      armor('allySelf', 1),
      // 回收：ifCond 现支持条件触发（SOP「通用条件触发 / 条件加成」节）；boardAtLeast 为全局
      // 条件、创造段整段判定（SOP 节内示例同款）
      createSkulls(9, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),
    ),
  },
  {
    id: 8677,
    desc: '获得 [魔法 + 1] 点生命值，数值因黄色宝石和黄色盟友数而增强。摧毁一行。 [x2]',
    build: skill(
      // 多来源（黄色宝石 + 黄色盟友数）→ sources 计数相加（SOP §3；batch-14 8251 同款双 boardGems/盟友句式）；
      // 无「被摧毁/转换」字样 → boardGems 现读棋盘（batch-08 头注口径）
      heal('allySelf', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'boardGems', color: BaseColor.Yellow },
            { kind: 'alliesOfColor', color: BaseColor.Yellow },
          ],
        },
      }),
      destroyChosenRow(),
    ),
  },
  {
    id: 8717,
    desc: '将紫色宝石转变成绿色。对一名敌人造成[魔法 + 3]点伤害，伤害程度由宝石转化数量而增强。 [1:1]',
    build: skill(
      transform(BaseColor.Purple, BaseColor.Green),
      // 「由宝石转化数量而增强」= transformedGems；转化段在前才数得到（batch-04 7002 同款）
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'transformedGems' } },
      }),
    ),
  },
  {
    id: 8724,
    desc: '窃取一名敌人 [魔法 + 1] 点生命值，数量因不死族盟友数而增强。再爆破 3 颗紫色宝石。 [x4]',
    build: skill(
      // 「窃取 X 点生命值」= dmg + drain（batch-01 7302 同款）；不死族 = Undead（troopTypes 核对）
      dmg('enemyChosen', 1, 1, {
        drain: true,
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Undead' } },
      }),
      explodeRandomGems(3, 0, 'color', BaseColor.Purple),
    ),
  },
  {
    id: 8740,
    desc: '随机爆破 3 颗宝石。获得一个额外回合。',
    build: skill(
      explodeRandomGems(3, 0, 'color'),
      extraTurn(),
    ),
  },
  {
    id: 8753,
    desc: '摧毁一列。对首位敌人造成 [魔法 + 4] 点伤害，并因被摧毁的蓝色宝石数而增强。 [1:1]',
    build: skill(
      destroyChosenCol(),
      // 「因被摧毁的蓝色宝石数而增强」= destroyedGems（前序摧列段计入）
      dmg('enemyFront', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8755,
    desc: '燃烧一名敌人。对他造成 [魔法 + 1] 点伤害，并将所有红色宝石转换成骷髅头增强伤害效果。 [3:1]',
    build: skill(
      inflict('burning', 'enemyChosen'),
      // 「转换成骷髅头增强伤害效果」：转化段排在被增强段之前，transformedGems 来源才数得到
      // （batch-07 7933 同款句式，含「并」字内嵌写法）；骷髅端点 'SKULL'（SOP 措辞裁定）
      // sa-F2 fix round A (R001): native CountGems Red ; CauseBurning ; Damage ; ConvertGems Red>Skull
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      transform(BaseColor.Red, 'SKULL'),
    ),
  },
  {
    id: 8781,
    desc: '消除首位敌人全部护甲值。再对所有敌人造成 [(魔法 x 0.75) + 1] 点伤害。',
    build: skill(
      // 「消除…全部护甲值」= reduce armor + drainAll（batch-01 7175 同款）
      reduce('enemyFront', 'armor', 0, 0, { drainAll: true }),
      // [(魔法 x 0.75) + 1] = base 1, mult 0.75；「对所有敌人」→ dmgAll
      dmgAll(1, 0.75),
    ),
  },
  {
    id: 8788,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，再获得 [魔法 + 4] 点护甲值，数量因所有敌人的魔力值而增强。 [2:1]',
    build: skill(
      // 「所有敌人的魔力值」= enemyStatSum magic（「魔力值」= magic 属性，SOP 措辞裁定）
      // L7-7201（sa-L76）：EN「both boosted by all Enemy Magic」+ 原生 Damage 与 IncreaseArmor 都
      // UseCounterForAmount → 伤害段与护甲段同挂 modifier（原先只挂护甲段）。
      // sa-G (R001): native counts all Enemy Magic once (step 0) before the hit; the self Armor goes first so it
      // reads the same pre-hit count (was counted after the kill: K scenario 30 instead of 36). Armor-on-self vs
      // damage-on-enemy order is otherwise unobservable (gowLaneL6G).
      armor('allySelf', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'magic' } },
      }),
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'magic' } },
      }),
    ),
  },
];

export const BATCH_15: CuratedBatch = { batch: '15', spells: SPELLS, skipped: SKIPPED };
