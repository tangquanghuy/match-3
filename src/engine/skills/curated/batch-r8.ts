/**
 * 放弃桶回收批 R8（2026-09-17 窗口G）：「机翻宝石族」回收（gem-verification.md 108 条）。
 *
 * 官方 RawData.SpellSteps 逐步数据实锤后的组装口径（本批裁定，见批内注释）：
 * - 「法力药水 XManaPotion」「龙宝石 DragonX」「巨人宝石 GiantX」= 带色 CreateGems/ConvertGems
 *   步骤的机翻外壳——以 ZH 描述的色名为准恢复基础色（法力药水 1-3 瓶 = countRange {1,3}）。
 * - 「因元素星/石像鬼（宝石）数而增强」= CountGems 无色分拆 → modifier 来源 boardGems（无色=全色宝石数）。
 * - CreateGems Color1 为非基础色（ElementalStar/LightDarkStar/Angel/GoodGargoyle/BadGargoyle/
 *   Spirit/Decay/Lycanthropy/DaemonicPortal/Block/Enchant）→ 无创造/转换/爆破/计数词汇 → 该条 SKIP。
 * - 「剧毒宝石」= poisonGem、「屏障宝石」= barrierGem（SpecialGemKind 已落地，可组装——本批仅 9907
 *   涉及但被狼人宝石来源卡死；9656 被邪恶石像鬼卡死）。
 * - 8639「造成…散射伤害」ZH 无目标词但官方 Target=AllEnemies → 按 enemyAll+range:'all' 组装
 *   （官方步骤优先于裸伤害句式启发式）。
 * - 9639「攻击力和护甲值」共用 modifier 子句 → 挂最近数值段=护甲段（batch-04/15 先例）。
 * - 9014 纯 '&&' 拼接按 §13.1 顺序组装（官方步骤为两段变体顺序排列）。
 */
import type { CuratedBatch } from './index';
import { chooseSkill, skill, dmg, dmgSplash, trueDmg, heal, armor, attack, inflict, cleanse, reduce,
  transform, transformToSpecial, createGems, createSpecialGems, createSkulls, createMix, destroyChosenRow, explodeChosenRow, explodeChosenCol,
  reposition, extraTurn, summonRandom } from '../builders';
import { BaseColor } from '../../types';
// 龙族引用池（从 troops.json troopTypes='Dragon' 内联，与 batch-r7 同源）
const DRAGON_REFS = ["Sheggra","Venoxia","ShadowDragon","Emperina","Celestasia","BoneDragon","DrakeRider","Dimetraxia","Wyvern","Venbarak","Borealis","DragonEggs","BabyDragon","Dragonette","Dragotaur","Dragonmoth","Visk","TheDragonSoul","Couatl","Sylvanimora","DRACOS-1337","DragonianRogue","DragonianMonk","SilverDrakon","Krystenax","Drake","Elemaugrim","DragonTurtle","Asha","Leviathan","Penglong","Glitterclaw","TheWorldbreaker","Divinia","LordEmber","LadyGarnetia","Tinseltail","Shimmerscale","Volthrenax","Thaumaris","Droggo","Sylfrostenath","MatronDragotani","UndeadDrake","FellDragonEgg","FellDragon","Nocturnia","Ishtara","DragonianSage","Obregonia","DragonSpirit","Essencia","Huanglong","Veneratus","HornedWyrm","NetherWyrm","TerraWyrm","TheGreatWyrm","Tihamata","RedAhriman","TwinkleBerry","MagmaDragon","Sabellius","Adakite","Obsidiaxas","Sapphirax","Emeraldrin","Rubirath","Topasarth","Amethialas","Garnetaerlin","Diamantina","Aquaria","TheElderDragon","HeraldOfKrystenax","TheGuardianDragon","CobaltDrake","HuntmasterArborius","CrystalEggs","DragonstoneGuardian","TheVoidDragon","Comethalas","Nebuladryx","Meteoridan","Solarithus","Lunarelleon","Eklipsos","Stellarix","DraconicSentinel","Tianlong","BrassDrake","Venerabilax","Chromaticea","Kukulkan","ImmortalAquaria","Leucithrax","TheSlimeDragon","Bahamata","Gingeraxia","Belcerulea","Gladius","Thornaressa","Narcithus","Orrissea","Orchidius","Chrysantherax","Chargrimax","Crackleleaf","Mistmother","DrakeEggs","ImmortalDrakkon","CrimsonWyrmling","Dragonhawk","Amethony","Creteus","Krakynos","Runethius","Hematrax","Vizinium","Demizerius","Amenhotrex","Pandemonia"];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7031, reason: '官方无结构化数据（旧版/已移除效果，RawData 无 SpellSteps）' },
  { id: 7158, reason: '官方无结构化数据（旧版/已移除效果，RawData 无 SpellSteps）' },
  { id: 7391, reason: '官方无结构化数据（旧版/已移除效果，RawData 无 SpellSteps）' },
  { id: 7708, reason: '官方无结构化数据（旧版/已移除效果，RawData 无 SpellSteps）' },
  { id: 8556, reason: '缺失状态（「为其附魔」CauseEnchanted 无原语）；「来自神堂」AddForKingdom 王国条件亦不支持' },
  { id: 8604, reason: '缺失状态（「对一名随机盟友施魔法」= CauseEnchanted 附魔无原语）' },
  { id: 8627, reason: '特殊宝石（官方 Color1=ElementalStar 非基础色，创造无原语——CreateGems 无基础色按批口径跳过）' },
  { id: 8628, reason: '特殊宝石（「创建 4-6 颗元素星」Color1=ElementalStar 创造无原语）；「随机诺斯军队」SummoningKingdom 虽可表达但创造段不可拆' },
  { id: 8632, reason: '特殊宝石（「创建 2 颗元素星」ElementalStar 创造无原语；伤害/缠绕/死亡条件/额外回合本身可表达）' },
  { id: 8633, reason: '特殊宝石（「创建 2 颗元素星」ElementalStar 创造无原语）' },
  { id: 8634, reason: '特殊宝石（「创建 2 颗元素星」ElementalStar 创造无原语）' },
  { id: 8635, reason: '特殊宝石（「创建 2 颗元素星」ElementalStar 创造无原语）' },
  { id: 8679, reason: '特殊宝石（「创建 5-7 颗临界星」Color1=LightDarkStar 创造无原语）；「随机临界诺斯军队」SummoningKingdom 段不可单独保留' },
  { id: 8733, reason: '特殊宝石（「创造 1 颗天使宝石」Color1=Angel 非基础色，创造无原语）' },
  { id: 8785, reason: '特殊宝石（「创建 1 颗元素星」ElementalStar 创造无原语）；绿色盟友/宝石计数与野兽在场条件本身可表达' },
  { id: 8795, reason: '特殊宝石（CreateGems2Colors 善/恶石像鬼——双色无基础色可依，无 createMix 词汇）' },
  { id: 8796, reason: '特殊宝石（「创造一颗石像鬼宝石」GoodGargoyle/BadGargoyle 创造无原语；7%/棕色宝石 chanceBoost 本身可表达）' },
  { id: 8801, reason: '特殊宝石（「石块」Block 与善/恶石像鬼转换端均无原语；「善或恶」分支结构亦不明）' },
  { id: 8803, reason: '特殊宝石（「创造 3 颗恶石像鬼宝石」BadGargoyle 无原语）' },
  { id: 8804, reason: '特殊宝石（石像鬼 CreateGems2Colors 无原语）；「宝石附近或下方绿色宝石」SurroundingGems 计数亦无原语' },
  { id: 8813, reason: '特殊宝石（「创造 1-2 颗随机石像鬼宝石」CreateGems2ColorsRange 无原语）' },
  { id: 8814, reason: '特殊宝石（「创造 2 颗石块」Block 与石像鬼双色宝石均无原语；打乱板面本身可表达）' },
  { id: 8886, reason: '二次缩放来源不支持（「若队伍有克里斯坦纳斯…[x4]」= 特定兵种计数无 kind）；Blue→Green 转换本身可表达' },
  { id: 8898, reason: '特殊宝石（「转换成灵力宝石」Color2=Spirit 无原语）；后半 Yellow→Skull 可表达但整条不可拆' },
  { id: 8899, reason: '二次缩放来源不支持（「因红色宝石和灵力宝石数而增强」——灵力宝石 Spirit 无计数 kind）' },
  { id: 8915, reason: '二次缩放来源不支持（「因恶魔敌人和盟友数而增强」——敌方侧种族计数无 kind，创造段无法挂来源）' },
  { id: 8916, reason: '特殊宝石（「爆破…灵力宝石」ExplodeColor Spirit 无原语）' },
  { id: 8917, reason: '特殊宝石（「创造一颗灵力宝石」Spirit 创造无原语；7%/黄色宝石 chanceBoost 本身可表达）' },
  { id: 8918, reason: '特殊宝石（Green→Spirit 转换端点无原语）' },
  { id: 8921, reason: '特殊宝石（「创造 3 颗灵力宝石」Spirit 无原语）' },
  { id: 8925, reason: '特殊宝石（「创造 3 颗灵力宝石」Spirit+AddForKnight 无原语）；半数法力/屏障本身可表达，「若对方是骑士」条件亦不支持' },
  { id: 8930, reason: '句子式不明（「摧毁 5x5 圈宝石」无对应面积清除原语）；「因被摧毁的石像鬼宝石数」CountLife 来源亦不支持' },
  { id: 8967, reason: '句子式不明（「消除敌人的 N 项技能」= DecreaseRandom 随机削减无原语）；来源「天使宝石」计数亦无 kind' },
  { id: 8968, reason: '特殊宝石（「创造 4 颗天使宝石」Angel 创造无原语；引爆 4 颗随机宝石本身可表达）' },
  { id: 9010, reason: '特殊宝石（「创造 3 颗善石像鬼宝石」GoodGargoyle 无原语）；棕色盟友数来源本身可表达' },
  { id: 9022, reason: '特殊宝石（「爆破 3 颗善石像鬼宝石」ExplodeColor GoodGargoyle 无原语）' },
  { id: 9023, reason: '特殊宝石（「创造 5 颗混合善恶的石像鬼宝石」双色无色可依）' },
  { id: 9138, reason: '特殊宝石（「创造 3 颗元素星河 3 颗临界星」ElementalStar/LightDarkStar 创造无原语）；伤害/骷髅 chanceBoost 本身可表达' },
  { id: 9183, reason: '二次缩放来源不支持（「每有一颗狼人宝石」Color1=Lycanthropy 无计数 kind）；4 层出血本身可表达' },
  { id: 9219, reason: '特殊宝石（「选定颜色→善石像鬼宝石」转换端点无原语）；「对所有拥有其法力颜色的敌人」FromManaColorEnemy 目标亦不支持' },
  { id: 9237, reason: '特殊宝石（「爆破所有天使宝石」ExplodeColor Angel 无原语）；「因不死族和恶魔敌人数」敌方侧种族计数亦无 kind' },
  { id: 9238, reason: '特殊宝石（「创造一颗天使宝石」Angel 无原语；7%/黄色宝石 chanceBoost 本身可表达）' },
  { id: 9244, reason: '目标措辞不支持（「给予所有黄色盟友」= AllyColor 颜色限定目标，buff 族无 targetColor 选项）；Brown→Yellow 转换本身可表达' },
  { id: 9371, reason: '语义拿不准（「使其下方敌受到其所受伤害的一半」BelowTarget 伤害回显无原语）；「若在星星湾使用」王国条件亦不支持' },
  { id: 9373, reason: '语义拿不准（「若在盖赫龙使用，则伤害翻倍」王国条件）；来源「天使宝石」计数亦无 kind' },
  { id: 9467, reason: '特殊宝石（「创建 2 颗恶魔门户宝石」Color1=DaemonicPortal 无原语）；「引爆随机宝石+召唤灵狐」子句无法单独保留' },
  { id: 9469, reason: '特殊宝石（「制造一颗天使宝石」Angel 创造与「因天使宝石数量」来源均无原语/kind）' },
  { id: 9480, reason: '缺失状态（「施加附魔」CauseEnchanted 无原语）；半人马计数/屏障本身可表达' },
  { id: 9494, reason: '缺失状态（「设置屏障和附魔」附魔无原语）；「因紫龙宝石」= boardGems Purple 来源本身可表达' },
  { id: 9519, reason: '特殊宝石（「转换为附魔宝石」Color2=Enchant 无原语）；伤害/chanceBoost 本身可表达' },
  { id: 9536, reason: '特殊宝石（「转换为腐烂宝石」Color2=Decay 无原语）；散射伤害与来源本身可表达但转换段不可拆' },
  { id: 9538, reason: '特殊宝石（Green→Decay 转换无原语）；「由转换的宝石数量增强」transformedGems 来源本身可表达' },
  { id: 9539, reason: '特殊宝石（Blue→Decay 转换无原语）；「如果敌人是 Boss…3-5 倍」晋升度条件亦不做' },
  { id: 9543, reason: '二次缩放来源不支持（「数量因腐烂宝石而增加」Color1=Decay 无计数 kind）；患病 disease/中毒本身可表达' },
  { id: 9546, reason: '特殊宝石（「棕色和腐烂宝石的混合体」CreateGems2Colors Brown+Decay——Decay 端无原语）；「击退」reposition 本身可表达' },
  { id: 9547, reason: '晋升度条件（「如果敌人是 Boss，则…3 倍-5 倍伤害」MultiplyForAscensionBoss）；来源「腐烂/石像鬼宝石」泛指宝石数本身可表达' },
  { id: 9563, reason: '二次缩放来源不支持（「因被附魔的盟友和敌人数量」——附魔缺失状态且敌方侧无计数 kind）；「在星湾中使用」王国条件亦不支持' },
  { id: 9570, reason: '缺失状态（「为所有紫色盟友附魔」CauseEnchanted 无原语）；「紫色盟友」颜色限定目标亦不支持' },
  { id: 9638, reason: '特殊宝石（「暗影之星」LightDarkStar 无原语）；「选定单颗宝石转换」亦非整板 transform 可表达' },
  { id: 9648, reason: '语义拿不准（「在南荒使用时，造成双倍伤害」王国条件倍率）；Yellow→Green 转换本身可表达' },
  { id: 9656, reason: '特殊宝石（「5 个邪恶石像鬼宝石」BadGargoyle 无原语）；「剧毒宝石」= poisonGem 本身可表达' },
  { id: 9664, reason: '缺失状态（「为我们俩附魔」CauseEnchanted 无原语）；护甲/屏障本身可表达' },
  { id: 9674, reason: '缺失状态（「为其附魔」无原语）；「与所选盟友法力颜色相同的宝石」CreateGems FromTarget 动态色无对应 ColorSpec' },
  { id: 9724, reason: '特殊宝石（「转换为天使宝石」Color2=Angel 无原语）；「因…受到祝福的数量」blessed 缺失状态且敌方侧无计数 kind' },
  { id: 9772, reason: '特殊宝石（「随机生成 4 颗石像鬼宝石」CreateGems2Colors 无原语；来源泛指宝石数本身可表达）' },
  { id: 9813, reason: '缺失状态（「为我附魔」CauseEnchanted 无原语）；「敌人法力颜色之一→黄色」FromTarget→Yellow 本身可表达（LAST_TARGET）' },
  { id: 9907, reason: '二次缩放来源不支持（「由狼人宝石加成」Color1=Lycanthropy 无计数 kind）；「转化为屏障宝石」= barrierGem 本身可表达' },
  { id: 9933, reason: '二次缩放来源不支持（狼人宝石 Lycanthropy）；「若在凛冬之境使用」王国条件亦不做' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8557,
    desc: '将所有红色宝石转换成黄龙宝石。',
    // Color1=Red → Color2=DragonYellow（ZH 色名「黄」）→ 全量转换
    // DragonYellow = Yellow dragonGem special (L4b-7030-dragon).
    build: skill(transformToSpecial(BaseColor.Red, { kind: 'dragonGem', color: BaseColor.Yellow })),
  },
  {
    id: 8601,
    desc: '死亡标记一名随机敌人。制作1-3瓶蓝色法力药水。如果任何一名敌人被冻结，有 50% 的几率可获得一个额外回合。',
    build: skill(
      inflict('death-mark', 'enemyRandom'),
      createGems(BaseColor.Blue, 1, 0, { countRange: { min: 1, max: 3 } }),
      extraTurn({ chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'frozen' } }),
    ),
  },
  {
    id: 8602,
    desc: '获得[魔法 + 1]点护甲和生命值。制作1-3瓶红色法力药水。如果任何敌人火烧上身，有 50% 的几率可获得一个额外回合。',
    // 「[魔法 + 1] 护甲和生命值」单方括号管两段 → 共用 scaling（R4 §11 追加口径）
    build: skill(
      armor('allySelf', 1, 1),
      heal('allySelf', 1, 1),
      createGems(BaseColor.Red, 1, 0, { countRange: { min: 1, max: 3 } }),
      extraTurn({ chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'burning' } }),
    ),
  },
  {
    id: 8603,
    desc: '净化并给予盟友 [魔法 + 1] 点生命值。制作 1-3 瓶黄色法力药水。如果有任何敌人被死亡标记，有 50% 的几率可获得一个额外回合。',
    build: skill(
      cleanse('allyChosen'),
      heal('allyChosen', 1, 1),
      createGems(BaseColor.Yellow, 1, 0, { countRange: { min: 1, max: 3 } }),
      extraTurn({ chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'death-mark' } }),
    ),
  },
  {
    id: 8605,
    desc: '将蓝色宝石转变成头骨。制作1-3瓶棕色法力药水。如果有任何敌人被打昏，有 50% 的几率可获得一个额外回合。',
    build: skill(
      transform(BaseColor.Blue, 'SKULL'),
      createGems(BaseColor.Brown, 1, 0, { countRange: { min: 1, max: 3 } }),
      extraTurn({ chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'stun' } }),
    ),
  },
  {
    id: 8606,
    desc: '对1-3名随机敌人下毒。制作1-3瓶绿色法力药水。如果有任何敌人被网勾住，有 50% 的几率可获得一个额外回合。',
    build: skill(
      inflict('poison', 'enemyRandomN', { nRange: { min: 1, max: 3 } }),
      createGems(BaseColor.Green, 1, 0, { countRange: { min: 1, max: 3 } }),
      extraTurn({ chance: 0.5, ifCond: { kind: 'anyEnemyStatus', statusId: 'web' } }),
    ),
  },
  {
    id: 8630,
    desc: '对 4 名随机敌人造成 [魔法 + 4] 点伤害，伤害值因元素星数量而增强。 [x6]',
    // 原生 CountGems ElementalStar → boardSpecial elementalStar（不是全部宝石）；
    // RandomEnemy + 3 x RandomPrefNotPrevEnemy → randomWaves 4（R007-3）
    build: skill(
      dmg('enemyRandomN', 4, 1, {
        n: 4,
        randomWaves: 4,
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'elementalStar' } },
      }),
    ),
  },
  {
    id: 8639,
    desc: '造成 [魔法 + 4] 点散射伤害，伤害值因元素星数量而增强。 [x8]',
    // 官方 Target=AllEnemies ScatterDamage → enemyAll + range:'all'（官方步骤优先）
    build: skill(
      dmg('enemyAll', 4, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'elementalStar' } },
      }),
    ),
  },
  {
    id: 8798,
    desc: '对所有敌人造成 [魔法 + 4] 点伤害。耗掉所有敌人 4 点法力值，数值因石像鬼宝石数而增强。 [x3]',
    // 石像鬼 CountGems（善/恶）无色分拆 → 泛指宝石数 boardGems{}；modifier 点名耗蓝段
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all' }),
      reduce('enemyAll', 'mana', 4, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems' } },
      }),
    ),
  },
  {
    id: 8802,
    desc: '获得 [魔法 + 1] 点生命值，数值因石像鬼宝石数而增强。再将一名敌人拉至前方。 [x8]',
    build: skill(
      heal('allySelf', 1, 1, {
        // sa-F3：原生 CountGems GoodGargoyle + BadGargoyle（各 x8）；无色 boardGems 数的是全盘宝石
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'gargoyleGem' } },
      }),
      reposition('enemyChosen', 'front'),
    ),
  },
  {
    id: 8815,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因石像鬼宝石和石块数量而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 1, 1, {
        range: 'all',
        // 原生 CountGems Block / GoodGargoyle / BadGargoyle（不是全部宝石）
        modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'boardSpecial', gem: 'stoneBlock' }, { kind: 'boardSpecial', gem: 'gargoyleGem' }] },
      }),
    ),
  },
  {
    id: 8830,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再将 5 颗红色宝石转换成蓝色巨人宝石。',
    build: skill(
      dmg('enemyChosen', 4),
      // R009: Convert 5 Red > GiantBlue = Blue giantGem special.
      transformToSpecial(BaseColor.Red, { kind: 'giantGem', color: BaseColor.Blue }, { count: 5 }),
    ),
  },
  {
    id: 8832,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。再将 5 颗棕色宝石转换成绿色巨人宝石。',
    build: skill(
      dmg('enemyChosen', 4),
      // R009: Convert 5 Brown > GiantGreen = Green giantGem special.
      transformToSpecial(BaseColor.Brown, { kind: 'giantGem', color: BaseColor.Green }, { count: 5 }),
    ),
  },
  {
    id: 8844,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 6] 点伤害，伤害值因蓝色宝石数而增强。将 5 颗蓝色宝石转换成蓝色巨人宝石。有 10% 的几率获得一个额外回合，几率因蓝色宝石数而增强。 [x2]',
    // 修饰子句点名「伤害值」→ 伤害段 modifier；尾标 [x2] 属几率子句 → chanceBoost（R4 8850 同款）
    build: skill(
      dmg('enemyAll', 6, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Blue gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      // R009: Convert 5 Blue > GiantBlue = Blue giantGem special.
      transformToSpecial(BaseColor.Blue, { kind: 'giantGem', color: BaseColor.Blue }, { count: 5 }),
    ),
  },
  {
    id: 8845,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 6] 点伤害，伤害值因绿色宝石数而增强。将 5 颗绿色宝石转换成绿色巨人宝石。有 10% 的几率获得一个额外回合，几率因绿色宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 6, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Green gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
      // R009: Convert 5 Green > GiantGreen = Green giantGem special.
      transformToSpecial(BaseColor.Green, { kind: 'giantGem', color: BaseColor.Green }, { count: 5 }),
    ),
  },
  {
    id: 8846,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 6] 点伤害，伤害值因红色宝石数而增强。将 5 颗红色宝石转换成红色巨人宝石。有 10% 的几率获得一个额外回合，几率因红色宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 6, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Red gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      // R009: Convert 5 Red > GiantRed = Red giantGem special.
      transformToSpecial(BaseColor.Red, { kind: 'giantGem', color: BaseColor.Red }, { count: 5 }),
    ),
  },
  {
    id: 8847,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 6] 点伤害，伤害值因黄色宝石数而增强。将 5 颗黄色宝石转换成黄色巨人宝石。有 10% 的几率获得一个额外回合，几率因黄色宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 6, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Yellow gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
      // R009: Convert 5 Yellow > GiantYellow = Yellow giantGem special.
      transformToSpecial(BaseColor.Yellow, { kind: 'giantGem', color: BaseColor.Yellow }, { count: 5 }),
    ),
  },
  {
    id: 8848,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 6] 点伤害，伤害值因紫色宝石数而增强。将 5 颗紫色宝石转换成紫色巨人宝石。有 10% 的几率获得一个额外回合，几率因紫色宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 6, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Purple gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      // R009: Convert 5 Purple > GiantPurple = Purple giantGem special.
      transformToSpecial(BaseColor.Purple, { kind: 'giantGem', color: BaseColor.Purple }, { count: 5 }),
    ),
  },
  {
    id: 8849,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 6] 点伤害，伤害值因棕色宝石数而增强。将 5 颗棕色宝石转换成棕色巨人宝石。有 10% 的几率获得一个额外回合，几率因棕色宝石数而增强。 [x2]',
    build: skill(
      dmg('enemyAll', 6, 1.5, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } },
      }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Brown gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } },
      }),
      // R009: Convert 5 Brown > GiantBrown = Brown giantGem special.
      transformToSpecial(BaseColor.Brown, { kind: 'giantGem', color: BaseColor.Brown }, { count: 5 }),
    ),
  },
  {
    id: 8887,
    desc: '创造 8 颗骷髅头和 8 颗红色龙宝石。',
    // Color1=Skull + DragonRed（ZH 色名「红色」）
    build: skill(
      createSkulls(8),
      // R009: CreateGems 8 DragonRed = Red dragonGem special.
      createSpecialGems({ kind: 'dragonGem', color: BaseColor.Red }, 8),
    ),
  },
  {
    id: 8889,
    desc: '将所有绿色宝石转换成棕色。再创造 3 颗棕色龙宝石。',
    build: skill(
      transform(BaseColor.Green, BaseColor.Brown),
      // DragonBrown = Brown dragonGem special (L4b-7270-dragon).
      createSpecialGems({ kind: 'dragonGem', color: BaseColor.Brown }, 3),
    ),
  },
  {
    id: 9008,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害。再将 4 颗棕色宝石转换成蓝龙宝石。',
    build: skill(
      dmgSplash('enemyChosen', 3),
      // R009: Convert 4 Brown > DragonBlue = Blue dragonGem special.
      transformToSpecial(BaseColor.Brown, { kind: 'dragonGem', color: BaseColor.Blue }, { count: 4 }),
    ),
  },
  {
    id: 9014,
    desc: '&& 创造 7 颗蓝龙宝石。召唤一名随机龙族 && 创造 7 颗绿龙宝石。召唤一名随机龙族',
    // 纯 '&&' 拼接按 §13.1 顺序组装；SummoningType dragon → 龙族引用池随机
    // Native Choose:ABC-DEF; DragonBlue and DragonGreen are special gems.
    build: skill(chooseSkill(['创造七颗蓝龙宝石并召唤龙族', '创造七颗绿龙宝石并召唤龙族'], [createSpecialGems({ kind: 'dragonGem', color: BaseColor.Blue }, 7), summonRandom(DRAGON_REFS)], [createSpecialGems({ kind: 'dragonGem', color: BaseColor.Green }, 7), summonRandom(DRAGON_REFS)])),
  },
  {
    id: 9132,
    desc: '对所有敌人造成 [(魔法 x 2.5) + 6] 点伤害。将 5 颗蓝色宝石转换成蓝色龙宝石。有 10% 的几率获得一个额外回合，几率因蓝色宝石数而增强。 [x3]',
    // 官方 Damage 段无 UseCounterForAmount → 尾标 [x3] 只归几率子句 chanceBoost
    build: skill(
      dmg('enemyAll', 6, 2.5, { range: 'all' }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Blue gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      // R009: Convert 5 Blue > DragonBlue = Blue dragonGem special.
      transformToSpecial(BaseColor.Blue, { kind: 'dragonGem', color: BaseColor.Blue }, { count: 5 }),
    ),
  },
  {
    id: 9133,
    desc: '对所有敌人造成 [(魔法 x 2.5) + 6] 点伤害。将 5 颗绿色宝石转换成绿色龙宝石。有 10% 的几率获得一个额外回合，几率因绿色宝石数而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.5, { range: 'all' }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Green gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Green } },
      }),
      // R009: Convert 5 Green > DragonGreen = Green dragonGem special.
      transformToSpecial(BaseColor.Green, { kind: 'dragonGem', color: BaseColor.Green }, { count: 5 }),
    ),
  },
  {
    id: 9134,
    desc: '对所有敌人造成 [(魔法 x 2.5) + 6] 点伤害。将 5 颗红色宝石转换成红色龙宝石。有 10% 的几率获得一个额外回合，几率因红色宝石数而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.5, { range: 'all' }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Red gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      // R009: Convert 5 Red > DragonRed = Red dragonGem special.
      transformToSpecial(BaseColor.Red, { kind: 'dragonGem', color: BaseColor.Red }, { count: 5 }),
    ),
  },
  {
    id: 9135,
    desc: '对所有敌人造成 [(魔法 x 2.5) + 6] 点伤害。将 5 颗黄色宝石转换成黄色龙宝石。有 10% 的几率获得一个额外回合，几率因黄色宝石数而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.5, { range: 'all' }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Yellow gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Yellow } },
      }),
      // R009: Convert 5 Yellow > DragonYellow = Yellow dragonGem special.
      transformToSpecial(BaseColor.Yellow, { kind: 'dragonGem', color: BaseColor.Yellow }, { count: 5 }),
    ),
  },
  {
    id: 9136,
    desc: '对所有敌人造成 [(魔法 x 2.5) + 6] 点伤害。将 5 颗紫色宝石转换成紫色龙宝石。有 10% 的几率获得一个额外回合，几率因紫色宝石数而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.5, { range: 'all' }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Purple gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      // R009: Convert 5 Purple > DragonPurple = Purple dragonGem special.
      transformToSpecial(BaseColor.Purple, { kind: 'dragonGem', color: BaseColor.Purple }, { count: 5 }),
    ),
  },
  {
    id: 9137,
    desc: '对所有敌人造成 [(魔法 x 2.5) + 6] 点伤害。将 5 颗棕色宝石转换成棕色龙宝石。有 10% 的几率获得一个额外回合，几率因棕色宝石数而增强。 [x3]',
    build: skill(
      dmg('enemyAll', 6, 2.5, { range: 'all' }),
      // Native CountGems (step 0) precedes the conversion: roll the chance before the Brown gems turn special
      // (boardGems counts plain colour gems only). The extra-turn flag itself has no board effect.
      extraTurn({
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Brown } },
      }),
      // R009: Convert 5 Brown > DragonBrown = Brown dragonGem special.
      transformToSpecial(BaseColor.Brown, { kind: 'dragonGem', color: BaseColor.Brown }, { count: 5 }),
    ),
  },
  {
    id: 9168,
    desc: '爆破一列。获得 [(魔法 x 1.5) + 1] 点生命值。若敌人被诅咒，则创造 8 颗蓝色巨人宝石。',
    build: skill(
      explodeChosenCol(),
      heal('allySelf', 1, 1.5),
      createGems(BaseColor.Blue, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9169,
    desc: '爆破一列。获得 [(魔法 x 1.5) + 1] 点生命值。若敌人被诅咒，则创造 8 颗绿色巨人宝石。',
    build: skill(
      explodeChosenCol(),
      heal('allySelf', 1, 1.5),
      createGems(BaseColor.Green, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9170,
    desc: '爆破一列。获得 [(魔法 x 1.5) + 1] 点生命值。若敌人被诅咒，则创造 8 颗红色巨人宝石。',
    build: skill(
      explodeChosenCol(),
      heal('allySelf', 1, 1.5),
      createGems(BaseColor.Red, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9171,
    desc: '爆破一列。获得 [(魔法 x 1.5) + 1] 点生命值。若敌人被诅咒，则创造 8 颗黄色巨人宝石。',
    build: skill(
      explodeChosenCol(),
      heal('allySelf', 1, 1.5),
      createGems(BaseColor.Yellow, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9172,
    desc: '爆破一列。获得 [(魔法 x 1.5) + 1] 点生命值。若敌人被诅咒，则创造 8 颗紫色巨人宝石。',
    build: skill(
      explodeChosenCol(),
      heal('allySelf', 1, 1.5),
      createGems(BaseColor.Purple, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9173,
    desc: '爆破一列。获得 [(魔法 x 1.5) + 1] 点生命值。若敌人被诅咒，则创造 8 颗棕色巨人宝石。',
    build: skill(
      explodeChosenCol(),
      heal('allySelf', 1, 1.5),
      createGems(BaseColor.Brown, 8, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } }),
    ),
  },
  {
    id: 9318,
    desc: '爆破一行。对首 2 位敌人造成 [魔法 + 2] 点真实伤害，伤害值因元素星数而增强。 [x5]',
    build: skill(
      explodeChosenRow(),
      trueDmg('enemyFirstN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardGems' } },
      }),
    ),
  },
  {
    id: 9527,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因蓝龙宝石数而增强。赋予自身屏障效果。 [x8]',
    // 「蓝龙宝石」按 ZH 色名恢复 → boardGems Blue
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9532,
    desc: '对末位 2 名对人造成 [魔法 + 2] 点真实伤害，伤害值因红龙宝石数而增强。 赋予自身屏障效果。 [x6]',
    build: skill(
      trueDmg('enemyLastN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardGems', color: BaseColor.Red } },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9613,
    desc: '杀死一名敌人。然后生成 12 颗随机法力药水宝石。之后获得额外回合。',
    // 三段 CreateGems2Colors（蓝绿/红黄/紫棕 各 4）→ 三段 createMix；「杀死」= execute
    build: skill(
      dmg('enemyChosen', 0, 0, { execute: true }),
      createMix([BaseColor.Blue, BaseColor.Green], 4),
      createMix([BaseColor.Red, BaseColor.Yellow], 4),
      createMix([BaseColor.Purple, BaseColor.Brown], 4),
      extraTurn(),
    ),
  },
  {
    id: 9639,
    desc: '摧毁一行。获得 [魔法 + 10] 点攻击力和护甲值，数值因摧毁的石块和石像鬼宝石数而增强。 [x6]',
    // 「因摧毁的…宝石数」= destroyedGems 无色（任意）；共用 modifier 子句挂最近数值段=护甲段（batch-04/15 先例）
    build: skill(
      destroyChosenRow(),
      // native: CountGems 600 Block / GoodGargoyle / BadGargoyle in the row; Attack and Armor both use the counter (sa-R1)
      attack('allySelf', 10, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'destroyedGems', special: 'stoneBlock' }, { kind: 'destroyedGems', special: 'gargoyleGem' }] },
      }),
      armor('allySelf', 10, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, sources: [{ kind: 'destroyedGems', special: 'stoneBlock' }, { kind: 'destroyedGems', special: 'gargoyleGem' }] },
      }),
    ),
  },
];

export const BATCH_R8: CuratedBatch = { batch: 'R8', spells: SPELLS, skipped: SKIPPED };
