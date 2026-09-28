/**
 * 放弃桶回收批 R15（2026-09-18）：真剩余 388 条 · 全词汇重判（R15 真剩余对照清洗）。
 *
 * 逐条对照官方 SpellSteps（data/raw/spells.gow.en.json RawData.SpellSteps）与英文原句
 * （data/raw/gow-2026-09-18/troops.en.json stats.spell.desc），用当前全词汇重判：
 * 减/窃随机技能值（reduce/stealRandomStat，R12）、波A/波B 特殊宝石全族（天使/石像鬼善恶 tier/
 * 腐烂/灵力/元素星/临界星/法力药水/狼人/传送门等）、shuffleBoard（弄乱板面）、
 * enemyChosenAndAdjacent / enemyLastN / allyFirstN 等目标（R7/R11/R13）、'lastTarget'（R12）、
 * inflictRandom / oneOf / skillOnce / reposition / transformTroop(Random) / mana fraction·halve、
 * 条件域 selfStatus / casterStatBeatsTarget / anyEnemyStatus / troopPresent / boardAtLeast / not、
 * chanceBoost、enemiesOfColor 与 boardSpecial 等二次缩放来源（R13/§10）。
 *
 * 收录 62 条重判后可表达条目（按 id 升序）。判定中剔除了 tmp/r12_remaining.json 里已被
 * r11/r12/r13 先行回收的 105 条，以及与并行批 batch-r14 撞车的 23 条（两批均以先落盘者为准，
 * 本批全量 id 去重校验通过）。仍不可表达者按卡点分组见提交报告，SKIP 记录保留在原清单，
 * 避免重复计数（batch-r13 同口径）。
 *
 * 维持 SKIP 的代表性原因（重判后依旧不成立）：
 * - 已有手写 override（SKILL_OVERRIDES 保留既有行为）：7004/7063/7132/7155；
 * - 晋升度/Boss/王国地点条件族（9367-9377/9473/9598/9746 等 30+ 条）、敌方侧种族计数来源
 *   enemiesOfRace 缺失（7546/8272/8838/8915/9462 等）、混合特殊宝石创造（9312/9658/9675/
 *   9780/9908/10011）、六色族 spec.color 的转化端（8886/8918/9244/9515/9745）、
 *   「打错敌人」改判目标（7254/7314/7386/8307）、「任意状态效果」条件/来源（7263/7935/8581）、
 *   逐来源计数驱动状态施加（7430/7939/8885/8791 等）、官方 ManaBurn 步骤原语（7328/7332）、
 *   「3-8/1-3 点」数值型区间（7469/8931/9181）、chanceBoost 无上限（10061）、
 *   transformTroopRandom 段无善恶 tier 掷签（8795/8796/8813/8814/9023/9772）。
 * - 特例口径：尾缀 [1:1]/[2:1]/[x3]/[x9] 等无来源子句的修饰标记按「正文机制的序列化」判读
 *  （窃取转换比率/减半/条件创造数量，7032/7347/7429/7438/7743/7602/8744/8853），已逐条在条目
 *   注释注明；[100:1] 类内部编码无法判读者维持 SKIP（8359/8375/8377/9139/9223/9740）。
 */
import type { CuratedBatch } from './index';
import {
  skill, skillOnce, targetedSkill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, reduce, steal,
  cleanse, randomStat, createGems, createSpecialGems, destroyRandomSpecialGems, explodeSpecialGems, explodeRandomGems,
  explodeColor, destroyRandomGems, destroyChosenRow, destroyChosenCol, destroyArea, transform, transformToSpecial,
  transformTroop, inflict,
  inflictRandom, shuffleBoard, extraTurn, oneOf, reposition, summonRandom, summonRef,
  transformTroopRandom, CHOSEN, CELL, explodeAt,
} from '../builders';
import { BaseColor } from '../../types';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    // —— 天使宝石（波B）回收 ——
    id: 7031,
    desc: '对敌人造成 [魔法 + 2] 点伤害，并获得 [魔法 + 2] 点护甲。制造 2 颗天使宝石。',
    // 「对敌人造成」裸伤害 = enemyChosen（§0 裸伤害句式）；天使宝石 = angelGem（波B）
    build: skill(
      dmg('enemyChosen', 2, 1),
      armor('allySelf', 2, 1),
      createSpecialGems({ kind: 'angelGem' }, 2),
    ),
  },
  {
    // —— 尾缀 [1:1] = 「窃取 2 点护甲值并将之转为魔力值」的 1:1 转换比率序列化
    //（steal gainRatio 缺省 1 即此；无独立来源子句） ——
    id: 7032,
    desc: '对最后一名敌人造成 [魔法 + 4] 点伤害。窃取 2 点护甲值并将之转为魔力值。获得一个额外回合。 [1:1]',
    build: skill(
      // L3-017: native steal Armor->Magic (CountArmor/CountMax 2/DecreaseArmor/IncreaseSpellPower) precedes Damage (R001)
      steal('enemyLast', 'armor', 'magic', 2, 0),
      dmg('enemyLast', 4, 1),
      extraTurn(),
    ),
  },
  {
    // —— 「弄乱板面」= shuffleBoard（原语批；官方步骤族 TroopOrderJumble/JumbleBoard 同日实锤） ——
    id: 7039,
    desc: '弄乱板面。获得一个额外回合。',
    build: skill(
      shuffleBoard(),
      extraTurn(),
    ),
  },
  {
    id: 7065,
    desc: '对第一名敌人造成 [魔法 + 3] 点伤害，并减除其 1 点所有技能值。摧毁 6 颗宝石。',
    // 「减除其 1 点所有技能值」EN = eliminate 1 point from all of their Skills → 攻/甲/魔各 -1
    //（三段常数削减）；「摧毁 6 颗宝石」= 随机 6 颗（batch-04「随机摧毁 8 颗宝石」同款 include 'color'）
    build: skill(
      // sa-F2 fix round A (R001): native Damage ; DestroyGems 6 ; DecreaseAllStats@FrontEnemy 1
      dmg('enemyFront', 3, 1),
      destroyRandomGems(6, 0, 'color'),
      reduce('enemyFront', 'attack', 1, 0),
      reduce('enemyFront', 'armor', 1, 0),
      reduce('enemyFront', 'magic', 1, 0),
    ),
  },
  {
    id: 7158,
    desc: '窃取敌人[魔法 + 1]生命。引爆所有天使宝石。',
    // 「窃取生命」= dmg + drain（batch-01 7302 口径）；「引爆所有天使宝石」= explodeSpecialGems
    build: skill(
      dmg('enemyChosen', 1, 1, { drain: true }),
      explodeSpecialGems('angelGem'),
    ),
  },
  {
    // —— 「1 名敌人和另 1 名随机敌人」= enemyChosen + enemyRandom 两段独立目标
    //（batch-p37 8239 / batch-r10 9220 先例：官方两条 Damage 步骤独立掷签） ——
    id: 7229,
    desc: '对 1 名敌人和另 1 名随机敌人造成 [魔法 + 3] 点伤害。获得一个额外回合。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      dmg('enemyRandom', 3, 1),
      extraTurn(),
    ),
  },
  {
    id: 7329,
    desc: '爆破一颗法力宝石。获得 [魔法] 点护甲，点数因被摧毁的蓝色宝石数而增强。赋予自身屏障效果。 [x2]',
    // sa-A r3: native Target ManaGemsOnly + ExplodeGems SingleGem = the player-chosen Mana Gem (was a random gem)
    build: skill(
      explodeAt(CELL),
      armor('allySelf', 0, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    // —— 「只能施放一次」= skillOnce（§12.5） ——
    id: 7331,
    desc: '创造 [魔法 + 3] 颗指定法力颜色的宝石。所有其他盟友获得 3 点魔力值。只能施放一次。',
    build: skillOnce(
      createGems(CHOSEN, 3, 1),
      magic('allyOthers', 3, 0),
    ),
  },
  {
    // —— 尾缀 [2:1] = 「获得其中半数」的比率序列化；耗尽法力 + 获得半数 = drainAll +
    // gainRatio 0.5（§3 表固定搭配） ——
    id: 7347,
    desc: '从一名敌人身上窃取 [魔法 + 2] 点护甲值并造成 4 点真实伤害。耗尽其法力值并获得其中半数。 [2:1]',
    build: skill(
      // sa-R7: native CountMana 50 -> StealArmor -> DecreaseMana 100 -> GenerateMana [counter] -> TrueDamage 4 (R001):
      // the stolen Armor goes to my Armor (was Magic) and the drain / half-mana gain happen before the true
      // damage, so a target killed by it is still drained.
      steal('enemyChosen', 'armor', 'armor', 2, 1),
      steal('enemyChosen', 'mana', 'mana', 0, 0, { drainAll: true, gainRatio: 0.5 }),
      trueDmg('enemyChosen', 4, 0),
    ),
  },
  {
    // —— 裸散射 = 全体散射（2026-09-18 官方重裁）；「等同于盟友护甲值」= targetStat（跨段
    // 追踪前段 allyChosen 主目标，secondary.ts targetStat 读 tracking.lastTarget） ——
    id: 7353,
    desc: '给予一名盟友 [魔法 + 1] 点护甲值。造成散射伤害，伤害值等同于盟友护甲值。 [1:1]',
    // L7-6211 (sa-L76): targetStat reads the scatter segment's own first enemy (target resolution
    // overwrites lastTarget), so the pool must read the chosen ally via chosenStat. Native counts the
    // ally armor before IncreaseArmor and adds Amount 1 + Magic, which equals the post-buff armor.
    build: skill(
      armor('allyChosen', 1, 1),
      dmg('enemyAll', 0, 0, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'chosenStat', stat: 'armor' } },
      }),
    ),
  },
  {
    // —— 「将指定法力的颜色转换为红色」= transform(CHOSEN, X)（7062 先例） ——
    id: 7358,
    desc: '将指定法力的颜色转换为红色。对 1 名随机敌人造成 [魔法 + 1] 点伤害。',
    build: skill(
      transform(CHOSEN, BaseColor.Red),
      dmg('enemyRandom', 1, 1),
    ),
  },
  {
    // —— 「创造 12 颗随机单色的宝石」= 六色池逐颗随机取色（createMix 逐颗随机语义） ——
    id: 7378,
    desc: '创造 12 颗随机单色的宝石。',
    build: skill(
      // sa-R6 L2-6237-one-colour：原生 Randomize A-B-C-D-E-F = 六色之一（各 1/6）创造 12 颗同色（原为六色逐颗混合）
      oneOf(
        ...[BaseColor.Red, BaseColor.Brown, BaseColor.Yellow, BaseColor.Green, BaseColor.Blue, BaseColor.Purple].map(c => [createGems(c, 12)]),
      ),
    ),
  },
  {
    id: 7396,
    desc: '对两名随机敌人造成 [魔法 + 2] 点伤害，窃取 2 点魔力值并使其陷入沉默状态。。',
    // EN 原句 "Deal [Magic + 2] damage to the first 2 Enemies, then steal 2 Magic and Silence
    // them."（zh「两名随机」为误译，判读以英文原句为准）——enemyFirstN 目标确定，
    // 后段同目标集（n:2）无跨段绑定问题
    build: skill(
      // 原生序 StealMagic@FirstTwo → Damage@FirstTwo → CauseSilence@FirstTwo（R001；每步按原生目标重取前 2 名）
      steal('enemyFirstN', 'magic', 'magic', 2, 0, { n: 2 }),
      dmg('enemyFirstN', 2, 1, { n: 2 }),
      inflict('silence', 'enemyFirstN', { n: 2 }),
    ),
  },
  {
    id: 7429,
    desc: '对 1 名敌人造成 [魔法 + 4] 点伤害。如果对方使用绿色法力值，则造成两倍伤害。将敌方攻击力减半。 [2:1]',
    // 「两倍伤害」= condMult targetColor（文字内含，无独立 [xN]）；尾缀 [2:1] = 「减半」的
    // 比率序列化 → reduce halve（§9.6，按当前值 50% 下取整）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Green } } }),
      reduce('enemyChosen', 'attack', 0, 0, { halve: true }),
    ),
  },
  {
    id: 7438,
    desc: '下列其一：将一名敌人的攻击力减半，或将一名敌人的魔力值减半，或将一名敌人转化为一只巨蟾蜍。 [2:1]',
    // 「下列其一」= oneOf 三支（§9.3）；「减半」= reduce halve（§9.6）；巨蟾蜍 = GiantToad
    //（troops.json referenceName）；尾缀 [2:1] = 「减半」比率序列化
    // sa-F1: native Target Enemy; declare the chosen enemy (inputTarget) — oneOf branches are not scanned for it.
    build: targetedSkill('enemyChosen',
      oneOf(
        reduce('enemyChosen', 'attack', 0, 0, { halve: true }),
        reduce('enemyChosen', 'magic', 0, 0, { halve: true }),
        transformTroop('enemyChosen', 'GiantToad'),
      ),
    ),
  },
  {
    // —— 「恢复自身原有生命值」EN = heal back to full → heal full（§3 全额治疗口径） ——
    id: 7484,
    desc: '对 1 名敌人造成 [魔法 + 5] 点伤害。如果敌人身亡，则恢复自身原有生命值，并获得 8 点攻击力。',
    build: skill(
      dmg('enemyChosen', 5, 1),
      heal('allySelf', 0, 0, { full: true, ifTargetDied: true }),
      attack('allySelf', 8, 0, { ifTargetDied: true }),
    ),
  },
  {
    // —— 「击至末位」= reposition（§12.1 位置原语）；「他们」= lastTarget 跨段绑定 ——
    id: 7534,
    desc: '对一名敌人造成 [魔法 + 2] 点真实伤害并将之击至末位。',
    build: skill(
      trueDmg('enemyChosen', 2, 1),
      reposition('lastTarget', 'back'),
    ),
  },
  {
    // —— 「X 或 Y」= oneOf（§9.3）；「随机技能值」获得 = randomStat；哥布林翻倍 = raceDouble
    //（randomStatEffect 逐受益者判族，buff.ts randomStat 分支实装） ——
    id: 7545,
    desc: "获得额外的一回合。爆破所有绿色宝石或使一名随机盟友的一项随机属性获得 [魔法 + 1] 点（若盟友为哥布林则增加两倍）。",
    build: skill(
      extraTurn(),
      oneOf(
        explodeColor(BaseColor.Green),
        randomStat('allyRandom', 1, 1, { oneSkill: true, raceDouble: 'Goblin' }),
      ),
    ),
  },
  {
    id: 7558,
    desc: '对 1 名敌人和一个随机敌人造成 [魔法 + 2] 点伤害。如果敌人已陷入沉默状态，则造成的双倍伤害。再使敌人陷入沉默状态。',
    // 两段独立目标（8239 先例）；条件倍率 = condMult targetStatus silence（逐目标判定）
    build: skill(
      // 原生序 Damage@FromTarget → Silence@FromTarget → Delay → Damage@RandomPrefNotPrevEnemy → Silence@FromPrevious（R001）
      dmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'silence' } } }),
      inflict('silence', 'enemyChosen'),
      dmg('enemyRandomPrefNotPrev', 2, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'silence' } } }),
      inflict('silence', 'lastTarget'),
    ),
  },
  {
    // —— 「敌我双方的红色军队数量」= alliesOfColor + enemiesOfColor（R13 新来源）计数相加；
    // 板面条件（全局）挂 extraTurn 合法 ——
    id: 7600,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方的红色军队数量而增强。如果板面上有 13 颗或更多红色宝石，则获得一个额外回合。 [x4]',
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [
            { kind: 'alliesOfColor', color: BaseColor.Red },
            { kind: 'enemiesOfColor', color: BaseColor.Red },
          ],
        },
      }),
      extraTurn({ ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),
    ),
  },
  {
    id: 7602,
    desc: '窃取 1 名敌人的  [魔法 + 12]  点生命值和一半魔力值。如果敌人身亡，则召唤 1 到 3 名随机的不死族。 [2:1]',
    // 「窃取生命」= dmg + drain（7302 口径）；「一半魔力值」= steal halve；「1-3 名随机不死族」=
    // summonRandom + countRange（§12.4）+ ifTargetDied；不死族池 = troops.json troopTypes
    // 全 163 名（batch-w02 大池先例）；尾缀 [2:1] = 「一半」比率序列化
    build: skill(
      dmg('enemyChosen', 12, 1, { drain: true }),
      // sa-R5 L1-6428: steal() does not forward `halve` (stole 0 Magic); native CountMagic@FromTarget 50 ->
      // StealMagic counter = floor(Magic x 50%) = fraction 0.5.
      steal('enemyChosen', 'magic', 'magic', 0, 0, { fraction: 0.5 }),
      // sa-R5 L1-6428: native three SummoningTypeConditional undead steps, 100% / 50% / 25% AddForKill, each an
      // independent random Undead (was countRange 1-3 uniform of one troop).
      ...((pool: string[]) => [1, 0.5, 0.25].map(chance => ({ ...summonRandom(pool, undefined, { ifTargetDied: true }), ...(chance < 1 ? { chance } : {}) })))([
        'Skeleton', 'Wight', 'Revenant', 'Zombie', 'Banshee', 'VampireLord', 'FleshGolem', 'Ghoul',
        'KeeperOfSouls', 'CrimsonBat', 'LadySapphira', 'Alastair', 'GraveKnight', 'Aziris',
        'BoneDragon', 'Sunweaver', 'Skeleros', 'Draakulis', 'TwistedHero', 'Death',
        'MorthanisWill', 'Wraith', 'AstralSpirit', 'Remnant', 'MummifiedKing', 'BoneScorpion',
        'NightHag', 'Pharos-Ra', 'CaptainSkullbeard', 'BoneNaga', 'BoneDaemon', 'Valraven',
        'Xathenos', 'Nosferatu', 'Umberwolf', 'WallOfBones', 'IceWraith', 'Vargouille', 'Carmella',
        'DwarvenZombie', 'SlayerGhost', 'KingBloodhammer', 'FallenValdis', 'Xerodar', 'Nightshade',
        'SpectralKnight', 'GraveSeer', 'LadyMorana', 'Apophisis', 'Ankhekt', 'Draugr', 'Necrocorn',
        'BoneGolem', 'VanyaSoulmourn', 'Sanguinia', 'CorpseMare', 'BaneJaw', 'ShadeOfZorn',
        'DrownedSailor', 'VladTheUnsated', 'Dullahan', 'TheGrayKing', 'Tutankhatmun',
        'FrostfireWraith', 'ChaosHound', 'Zilopochtli', 'UndeadDrake', 'DreadSteed',
        'ShadeOfKurandara', 'BoneboundDredge', 'HauntedGuardian', 'PharaohNefertani', 'TombKnight',
        'Metztli', 'CarrionCrow', 'TheGhostQueen', 'Charonas', 'JudgeOfTheDead',
        'FrozenShieldbreaker', 'JakalTheGuardian', 'TheFleshHorror', 'Draxxius', 'VaultGuard',
        'SpectralColossus', 'FlamingSkeleton', 'Deathclaw', 'AncestorBrodir', 'TheGemini',
        'CryptHound', 'StoneZombie', 'DhrakSmith', 'Carmina', 'DeathlockDreilak', 'Rath-Amon',
        'BoundMage', 'RelicKnight', 'Negasus', 'DrownedCaptain', 'DeadParrot', 'Deathgaunt',
        'AssessorOfMahat', 'FallenSatyr', 'TheGraveGiant', 'DreadCaptainGrim', 'MorthanisDarkness',
        'SkellyCat', 'DeathTrapMimic', 'BloodElf', 'BoneCatapult', 'UndeadSentinel', 'UndeadLion',
        'AnointedChampion', 'Valhawk', 'LostWarrior', 'PharaohKhafru', 'AldricTheFrostbound',
        'Gloomhob', 'Ghulemoth', 'Shadowhisker', 'TheFallenKnight', 'GhostOgre', 'Necroshale',
        'CryptWorm', 'WargSpirit', 'DraugrKnight', 'DrownedWanderer', 'BarrowLord',
        'GhostKingGrimhorn', 'ImmortalOssifer', 'BlightedHusk', 'TheDecayingQueen', 'WoodRot',
        'SkeletalUrska', 'ZombieGoat', 'RottingSerpent', 'ShadowWraith', 'Abraxas',
        'ImmortalGemini', 'ToxicHag', 'Helilya', 'DesertOx', 'ForsakenGuardian',
        'KhormacTheRestless', 'VigilantShade', 'Bothros', 'QueenWilhelmina', 'Vinepyre',
        'CountGobula', 'LordGobthe', 'AqenBloodclaw', 'Sanguinette', 'TheTombkeeper', 'Merneith',
        'Cinereous', 'LordHarker', 'GraveWorm', 'CryptboundWight', 'MoonveilWarden',
        'CursedSailor', 'DarkSpirit', 'RhonaBittershield', 'TheSoulKnight', 'TheBansheeQueen'
      ]),
    ),
  },
  {
    id: 7629,
    desc: '对 1 名敌人造成 [魔法 + 1] 点真实伤害。若现有暗风暴，则伤害双倍。再转化成暗魄狼或蝙蝠群。',
    // 「若现有暗风暴」= stormPresent color Purple（§9.1 色表 暗=Purple）；「转化成暗魄狼或
    // 蝙蝠群」= 自身兵种转化二选一（transformTroopRandom rng 掷选，§11.2）
    build: skill(
      trueDmg('enemyChosen', 1, 1, { condMult: { times: 2, cond: { kind: 'stormPresent', color: BaseColor.Purple } } }),
      transformTroopRandom('allySelf', ['Umberwolf', 'BatSwarm']),
    ),
  },
  {
    // —— 「最后两名敌人」= enemyLastN；「对中毒敌人为致命」= 段二 execute + 逐目标
    // targetStatus poison 过滤（§4/条件触发口径，execute 伤害额=目标当前有效耐久） ——
    id: 7648,
    desc: '对最后两名敌人造成 [魔法 + 15] 点伤害。若敌人已中毒，则此伤害为致命。',
    build: skill(
      dmg('enemyLastN', 15, 1, { n: 2 }),
      // 原生 Lethal@SecondLast/Last 与前两段同一批敌人：锁定上一段目标（lastTargets），击杀后不改打新的末两位（sa-D）
      dmg('lastTargets', 0, 0, { execute: true, ifCond: { kind: 'targetStatus', statusId: 'poison' } }),
    ),
  },
  {
    id: 7708,
    desc: '给予所有盟友 6 点攻击力。对亡灵和恶魔敌人造成 [魔法 + 6] 点伤害。创造 2 颗天使宝石。',
    // 「对亡灵和恶魔敌人」= anyOf targetRace 析取（逐目标过滤，§条件组合）
    build: skill(
      attack('allyAll', 6, 0),
      dmg('enemyAll', 6, 1, {
        range: 'all',
        ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Undead' }, { kind: 'targetRace', race: 'Daemon' }] },
      }),
      createSpecialGems({ kind: 'angelGem' }, 2),
    ),
  },
  {
    // —— 尾缀 [1:1] = 「转换成魔力值」1:1 转换比率序列化（gainRatio 缺省 1） ——
    id: 7743,
    desc: '对一名敌人造成 [魔法 + 2] 点真实伤害。窃取 3 点护甲值并将之转换成魔力值。 [1:1]',
    // R001 / L6-6549: native order CountArmor -> CountMax 3 -> DecreaseArmor -> IncreaseSpellPower
    // -> TrueDamage, so the true damage uses the already-raised Magic.
    build: skill(
      steal('enemyChosen', 'armor', 'magic', 3, 0),
      trueDmg('enemyChosen', 2, 1),
    ),
  },
  {
    id: 7972,
    desc: '爆破 1 颗紫色宝石，每有一名恶魔盟友则再加  1 颗。 [1:1]',
    // 随机紫色宝石爆破数量挂 modifier（randomGems count 走 evaluateWithModifier，gems.ts 实装）：
    // 1 + 1×恶魔盟友数
    build: skill(
      explodeRandomGems(1, 0, 'color', BaseColor.Purple, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'alliesOfRace', race: 'Daemon' } },
      }),
    ),
  },
  {
    id: 8057,
    desc: '对首 2 位敌人造成 [魔法 + 8] 点真实伤害。召唤愤怒或色欲，并赐福所有恶魔盟友。',
    // 官方步骤双变体（Summon 6604/6605 + CauseBlessed AllyType daemon）：召唤二选一 =
    // summonRandom(['Wrath','Lust'])；「赐福」= blessed（R10 正面状态批）+ targetRace Daemon
    build: skill(
      trueDmg('enemyFirstN', 8, 1, { n: 2 }),
      summonRandom(['Wrath', 'Lust']),
      inflict('blessed', 'allyAll', { targetRace: 'Daemon' }),
    ),
  },
  {
    id: 8058,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害。使所有被我的法术击到敌人陷入中毒和出血状态。',
    // 官方步骤 CausePoison/CauseBleed × FromTarget+AdjacentFromTarget = 选定者 + 上下相邻
    //（R11 8485 先例：溅射对集拆两段目标）
    build: skill(
      dmgSplash('enemyChosen', 4, 1),
      inflict('poison', 'enemyChosen'),
      inflict('poison', 'enemyChosenAndAdjacent'),
      inflict('bleed', 'enemyChosen'),
      inflict('bleed', 'enemyChosenAndAdjacent'),
    ),
  },
  {
    id: 8063,
    desc: '对 2 名随机敌人造成 [魔法 + 1] 点伤害。并使二者各陷入一个随机负面状态。',
    // 官方步骤 Damage+RandomStatusEffect@FromPrevious ×2（第二步 RandomPrefNotPrevEnemy，
    // 8499 先例按独立随机敌组装）；「随机状态」= inflictRandom（§11 阵营分池，敌方=负面池），
    // 跨段绑定 lastTarget
    build: skill(
      dmg('enemyRandom', 1, 1),
      inflictRandom('lastTarget'),
      dmg('enemyRandom', 1, 1),
      inflictRandom('lastTarget'),
    ),
  },
  {
    // —— 「以 X 形摧毁宝石」= destroyArea('x')（R12 形状族） ——
    id: 8205,
    desc: '以 X 形摧毁宝石。给予第一位盟友 [魔法 + 1] 点攻击力。',
    build: skill(
      destroyArea('x', 'destroy'),
      attack('allyFront', 1, 1),
    ),
  },
  {
    // —— 「或」三选一 = oneOf（§9.3）；「随机增益状态效果」= inflictRandom 盟友正面池
    //（§11 补充：赋予盟友 = 正面池）。⚠️ randomStatus 段不支持 n（§11.3 引擎缺口）——
    // 「前 2 位」第三支暂以单目标近似并注明（8572 同口径） ——
    id: 8212,
    desc: '给予前 2 位盟友 [魔法 + 1] 点生命值，或 [魔法 + 1] 点攻击力，或赋予一个随机增益状态效果。',
    build: skill(
      oneOf(
        heal('allyFirstN', 1, 1, { n: 2 }),
        attack('allyFirstN', 1, 1, { n: 2 }),
        inflictRandom('allyFirstN'),
      ),
    ),
  },
  {
    id: 8232,
    desc: '将蓝色宝石转换成红色，棕色宝石转换成骷髅头。使前 2 位敌人陷入猎人标记状态。有 25% 的几率将其转化成一只狼人森林野兽。',
    // EN/官方步骤实锤「转化」主体为自身（TransformKingdom tg:Self d:3068 = Werewoods 王国
    // 随机兵种，zh「将其」为误译）；候选 = 王国 3068 全 5 名（troopTypes 均含 Beast）
    build: skill(
      transform(BaseColor.Blue, BaseColor.Red),
      transform(BaseColor.Brown, 'SKULL'),
      inflict('marked', 'enemyFirstN', { n: 2 }),
      transformTroopRandom('allySelf', ['Werebird', 'Werebear', 'Werecat', 'BeastmasterTorbern', 'Werehound'], { chance: 0.25 }),
    ),
  },
  {
    id: 8238,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因自身的生命值、攻击力和护甲值而增强。若敌人使用红色法力值，则造成双倍伤害。 [8:1]',
    // 两段独立目标（8239 先例）；「因自身生命/攻击/护甲 [8:1]」= selfStat 三来源计数相加
    // 同一 ratio 修饰（§1 多来源）；条件倍率 condMult targetColor 双段同挂（点名伤害值辖同类段）
    build: skill(
      dmg('enemyChosen', 3, 1, {
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Red } },
        modifier: {
          mod: { kind: 'ratio', a: 8, b: 1 },
          pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [
            { kind: 'selfStat', stat: 'hp' },
            { kind: 'selfStat', stat: 'attack' },
            { kind: 'selfStat', stat: 'armor' },
          ],
        },
      }),
      // 原生 Damage@RandomPrefNotPrevEnemy：避开上一目标（R007-3）
      dmg('enemyRandomPrefNotPrev', 3, 1, {
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Red } },
        modifier: {
          mod: { kind: 'ratio', a: 8, b: 1 },
          pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [
            { kind: 'selfStat', stat: 'hp' },
            { kind: 'selfStat', stat: 'attack' },
            { kind: 'selfStat', stat: 'armor' },
          ],
        },
      }),
    ),
  },
  {
    id: 8240,
    desc: '对一名敌人和一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因敌人生命值而增强。若敌人使用紫色法力值，则造成双倍伤害。 [4:1]',
    // 「因敌人生命值」= targetStat hp（各段读各自目标：targets 先解析入跨段追踪，后评估修饰）；
    // 官方步骤 CountLife@目标 + Damage@同目标 逐步对应
    build: skill(
      dmg('enemyChosen', 3, 1, {
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } },
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'targetStat', stat: 'hp' } },
      }),
      dmg('enemyRandom', 3, 1, {
        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Purple } },
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'targetStat', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 8479,
    desc: '对 3 名随机敌人造成 [(魔法 x 2) + 5] 点伤害。 并将他们击回末位。',
    // 官方步骤 ×3 组（Damage RandomEnemy + TroopOrderBack FromPrevious）：逐敌独立掷签
    //（RandomPrefNotPrevEnemy 按 8499 先例取独立随机敌）+ 各自击回末位（reposition lastTarget）
    build: skill(
      dmg('enemyRandom', 5, 2),
      reposition('lastTarget', 'back'),
      dmg('enemyRandom', 5, 2),
      reposition('lastTarget', 'back'),
      dmg('enemyRandom', 5, 2),
      reposition('lastTarget', 'back'),
    ),
  },
  {
    id: 8489,
    desc: '消除一名敌人所有护甲值。爆破敌人的法力颜色之一的所有宝石。再爆破所有石块。',
    // 「爆破敌人的法力颜色之一」= explodeColor('LAST_TARGET')（跨段该敌一种法力色，§11 补充）；
    // 石块 = stoneBlock（波B）
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      explodeColor('LAST_TARGET'),
      explodeSpecialGems('stoneBlock'),
    ),
  },
  {
    id: 8491,
    desc: '将所有绿色宝石转变成所选颜色的宝石。然后创造一个石墩。',
    // 「转变成所选颜色」= transform(Green, CHOSEN)；石墩 = stoneBlock（波B，可创造）
    build: skill(
      transform(BaseColor.Green, CHOSEN),
      createSpecialGems({ kind: 'stoneBlock' }, 1),
    ),
  },
  {
    id: 8492,
    desc: '创造一个石墩，可赠与所有同盟 [魔法 + 1] 个盔甲，或者摧毁一个石墩，致使所有敌人遭到 [魔法 + 1] 次破坏。',
    // 「或者」= oneOf 两支（§9.3）；石墩创造/全量摧毁 = createSpecialGems / destroySpecialGems
    build: skill(
      oneOf(
        [
          createSpecialGems({ kind: 'stoneBlock' }, 1),
          armor('allyAll', 1, 1),
        ],
        [
          // sa-R6：原生 DestroyColor Block Amount 1 = 只摧毁一个石墩（原为全部石墩）
          destroyRandomSpecialGems('stoneBlock', 1),
          dmg('enemyAll', 1, 1, { range: 'all' }),
        ],
      ),
    ),
  },
  {
    id: 8494,
    desc: '结果 [魔法 + 4] 给予敌人真正的重击，由石墩激活。炸毁所有石墩。 然后重建3个石墩。 [x6]',
    // EN 实锤（zh 机翻残缺）：true heavy splash = dmgSplash + trueDamage；「由石墩激活 [x6]」=
    // boardSpecial stoneBlock（§1 特殊宝石来源）；重建 3 个 = createSpecialGems
    build: skill(
      dmgSplash('enemyChosen', 4, 1, {
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'stoneBlock' } },
      }),
      explodeSpecialGems('stoneBlock'),
      createSpecialGems({ kind: 'stoneBlock' }, 3),
    ),
  },
  {
    id: 8495,
    desc: '结果 [魔法 + 3] 造成一名敌人受伤并封印他们。如果我方进攻更猛烈，激怒自身。反之，被对方进攻，减10点。',
    // EN 实锤：「If my Attack is greater, Enrage myself. Otherwise eliminate their Attack by 10.」
    // = casterStatBeatsTarget attack（§13.2）+ not 否定（§12.6）；「减10点」= lastTarget 攻击削减
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('frozen', 'enemyChosen'),
      inflict('enraged', 'allySelf', { ifCond: { kind: 'casterStatBeatsTarget', stat: 'attack' } }),
      // Native 8495 step 4: DecreaseAttack [AddForMoreAttackOnTarget 10] = only if the target's Attack is strictly higher (ties: neither branch).
      reduce('lastTarget', 'attack', 10, 0, { ifCond: { kind: 'targetStatBeatsCaster', stat: 'attack' } }),
    ),
  },
  {
    id: 8498,
    desc: '选择一个同盟。赠予他们一次攻击，一次生命值，和一件盔甲，并充满他们的法力值。此咒语只能使用一次。',
    // English/native: (3 * Magic) + 3 Attack, Life and Armor; preserve one-shot and full Mana.
    build: skillOnce(
      attack('allyChosen', 3, 3),
      armor('allyChosen', 3, 3),
      heal('allyChosen', 3, 3),
      mana('allyChosen', 0, 0, { fraction: 1 }),
    ),
  },
  {
    // —— 「每个蓝色宝石都有 7% 的额外几率」= chanceBoost（§概率增强）；「所有技能」=
    // 攻/甲/魔三段并列共用 [(魔法/2)+1]（§11 R4 并列数值段口径） ——
    id: 8523,
    desc: '给予 [(魔法 / 2) + 1] 第一名同盟所以技能。棋盘上每个蓝色宝石都有7％的额外几率旋转。 [x7]',
    build: skill(
      attack('allyFront', 1, 0.5),
      armor('allyFront', 1, 0.5),
      magic('allyFront', 1, 0.5),
      extraTurn({
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 8691,
    desc: '对 3 名随机敌人造成 [(魔法 x 0.7) + 3] 点伤害，个别有 50% 几率击晕他们。',
    // 官方步骤 ×3 组（Damage + CauseStun@FromPrevious）：逐敌独立掷签 + 各自 50% 击晕
    //（段级 chance 每段一掷 = 「个别独立几率」）
    build: skill(
      dmg('enemyRandom', 3, 0.7),
      inflict('stun', 'lastTarget', { chance: 0.5 }),
      dmg('enemyRandomPrefNotPrev', 3, 0.7), // native RandomPrefNotPrevEnemy (R007-3)
      inflict('stun', 'lastTarget', { chance: 0.5 }),
      dmg('enemyRandomPrefNotPrev', 3, 0.7),
      inflict('stun', 'lastTarget', { chance: 0.5 }),
    ),
  },

  {
    id: 8744,
    desc: '将所有紫色宝石转换成末日骷髅头。若自身队伍中有邪老爪牙，则再创造 3 颗骷髅头。再召唤一个邪老爪牙。 [x3]',
    // 「再创造 3 颗」= base 3 + ifCond troopPresent（§11.5 特定兵种在场，中文名匹配）；
    // 末日骷髅 = doomSkull（transformToSpecial/createSpecialGems）；尾缀 [x3] = 该条件创造
    // 的数量序列化
    build: skill(
      transformToSpecial(BaseColor.Purple, 'doomSkull'),
      createSpecialGems({ kind: 'doomSkull' }, 3, 0, {
        ifCond: { kind: 'troopPresent', side: 'ally', name: '邪老爪牙' },
      }),
      summonRef('EldritchMinion'),
    ),
  },
  {
    id: 8779,
    desc: '对一名敌人造成 [魔法 + 3] 点真实伤害，伤害值因石块数量而增强。再将敌人法力值的其中一个宝石色的 8 颗宝石转换成石块。 [x5]',
    // 「因石块数量 [x5]」= boardSpecial stoneBlock；「该敌一个法力色 8 颗 → 石块」=
    // transformToSpecial('LAST_TARGET','stoneBlock',{count:8})（§11 补充跨段取敌色）
    build: skill(
      trueDmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'stoneBlock' } },
      }),
      transformToSpecial('LAST_TARGET', 'stoneBlock', { count: 8 }),
    ),
  },
  {
    // —— 「激怒」= enraged（R10 正面状态批）；「每个被激怒的盟友额外引爆 2 颗」=
    // allyStatusCount 来源挂爆破数量（randomGems count 走 evaluateWithModifier） ——
    id: 8835,
    desc: '引爆 3 颗宝石，每个被激怒的盟友额外引爆 2 颗。然后激怒一名随机盟友。 [x2]',
    build: skill(
      explodeRandomGems(3, 0, 'all', undefined, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'allyStatusCount', statusId: 'enraged' } },
      }),
      inflict('enraged', 'allyRandom'),
    ),
  },
  {
    id: 8853,
    desc: '二者选一：对第一个敌人造成[魔法 + 3]点伤害，或者给第一个盟友[魔法 + 3]生命。如果盐爪船长在我的队伍中，制造9颗蓝色宝石。 [x9]',
    // 「二者选一」= oneOf 两支（§9.3）；「若盐爪船长在我的队伍中」= troopPresent（§11.5）；
    // 尾缀 [x9] = 条件创造 9 颗的数量序列化
    build: skill(
      oneOf(
        dmg('enemyFront', 3, 1),
        heal('allyFront', 3, 1),
      ),
      createGems(BaseColor.Blue, 9, 0, {
        ifCond: { kind: 'troopPresent', side: 'ally', name: '盐爪船长' },
      }),
    ),
  },

  {
    // —— 「爆破其一个法力颜色的 5 颗宝石」= explodeRandomGems + LAST_TARGET（8489 同口径）；
    // 「击回末位」= reposition lastTarget（§12.1） ——
    id: 8933,
    desc: '选定一位敌人，爆破其一个法力颜色的 5 颗宝石。再将他们击回末位。',
    // sa-F2 fix round A: explicit chosen-enemy input (LAST_TARGET had no prior target -> no spell events)
    build: targetedSkill('enemyChosen',
      explodeRandomGems(5, 0, 'color', 'CHOSEN_TARGET'),
      reposition('enemyChosen', 'back'),
    ),
  },
  {
    id: 9004,
    desc: '爆破一颗宝石并摧毁其行和列。再创造 3 个赃物宝石。',
    // 「爆破一颗（选定）宝石」= explodeAt(CELL)，行/列 chosenLine 与其共用同一选定格；
    // 赃物宝石 = bootyGem（§10.3）
    build: skill(
      explodeAt(CELL),
      destroyChosenRow(),
      destroyChosenCol(),
      createSpecialGems({ kind: 'bootyGem' }, 3),
    ),
  },
  {
    // —— 「黄色闪电宝石」= lightningCol（词表：蓝闪电=行/黄闪电=列）；裸散射 = 全体散射
    //（2026-09-18 官方重裁） ——
    id: 9197,
    desc: '将一名宝石转换成黄色闪电宝石。再造成 [魔法 + 6] 点散射伤害。',
    build: skill(
      // BoardTarget SingleGem = the chosen gem (L2-singlegem-cell; was a random gem via 'ANY')
      transformToSpecial('CELL', 'lightningCol', { count: 1 }),
      dmg('enemyAll', 6, 1, { range: 'all' }),
    ),
  },
  {
    id: 9200,
    desc: '创造 5 颗棕色宝石。再获得 [魔法 + 1] 点护甲值，或创造 2 颗石块，或击晕首 2 位敌人，或爆破整个板面。',
    // 「或」四选一 = oneOf（§9.3）；「爆破整个板面」= 六色 + 骷髅全量爆破（覆盖全棋盘宝石）
    build: skill(
      createGems(BaseColor.Brown, 5),
      oneOf(
        armor('allySelf', 1, 1),
        createSpecialGems({ kind: 'stoneBlock' }, 2),
        inflict('stun', 'enemyFirstN', { n: 2 }),
        // sa-R6 L2-7483-explode-board：原生 ExplodeGems Amount 100 = 一次爆破全棋盘（原为逐色 7 段爆破，
        // 每段之间棋盘下落连锁，首段后就不再是「整个板面」）
        explodeRandomGems(100, 0, 'all'),
      ),
    ),
  },

  {
    // —— 「每耗掉 2 点法力值则创造一颗冻结宝石 [2:1]」= 创造数量挂 modifier ratio 2:1 ×
    // drainedMana（§1 来源表；冻结宝石 = freezeGem 波A） ——
    id: 9247,
    desc: '耗掉一名敌人最高 20 点法力值。每耗掉 2 点法力值则创造一颗冻结宝石。 [2:1]',
    build: skill(
      reduce('enemyChosen', 'mana', 20, 0),
      createSpecialGems({ kind: 'freezeGem' }, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'drainedMana' } },
      }),
    ),
  },
  {
    id: 9256,
    desc: '对 2 名随机敌人造成 [魔法 + 3] 点伤害，并使他们陷入中毒状态。有 30% 的几率转化成一个蛇怪。',
    // 官方步骤 Damage+CausePoison@FromPrevious ×2 = 逐敌伤害 + lastTarget 中毒；
    // 「转化成蛇怪」= 自身兵种转化 transformTroop allySelf（§11.2）+ chance
    build: skill(
      dmg('enemyRandom', 3, 1),
      inflict('poison', 'lastTarget'),
      // sa-R5 L1-7510: native second hit RandomPrefNotPrevEnemy (R007-3), was plain RandomEnemy (could repeat).
      dmg('enemyRandomPrefNotPrev', 3, 1),
      inflict('poison', 'lastTarget'),
      transformTroop('allySelf', 'Basilisk', { chance: 0.3 }),
    ),
  },
  {
    id: 9365,
    desc: '对敌人造成 [魔法 + 3] 点伤害，伤害值因石块数量而增强。然后制造 1-2 个石块。 [x4]',
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'stoneBlock' } },
      }),
      createSpecialGems({ kind: 'stoneBlock' }, 0, 0, { countRange: { min: 1, max: 2 } }),
    ),
  },
  {
    // —— 「因恶魔传送门宝石数而增强」/「每颗…爆破 1 颗宝石」= boardSpecial 来源挂伤害与
    // 爆破数量（randomGems count 走 evaluateWithModifier） ——
    id: 9465,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因恶魔传送门宝石数而增强。每有 1 颗恶魔传送门宝石则爆破 1 颗宝石。 [x2]',
    // sa-A r3 (R001): native CountGems Portal -> ExplodeGems -> CountSet -> CountGems Portal x2 -> Damage:
    // explode first, then count the Portals left on the board for the damage.
    build: skill(
      explodeRandomGems(0, 0, 'all', undefined, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardSpecial', gem: 'daemonicPortalGem' } },
      }),
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'daemonicPortalGem' } },
      }),
    ),
  },
  {
    id: 9466,
    desc: '对敌人造成 [魔法 + 3] 点伤害。然后创建 1-3 个恶魔传送门宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      createSpecialGems({ kind: 'daemonicPortalGem' }, 0, 0, { countRange: { min: 1, max: 3 } }),
    ),
  },

  {
    id: 9475,
    desc: '对 2 名随机敌人造成 [魔法 + 3] 点伤害，伤害值因紫色宝石数量而增强。如果一名敌人死亡，则生成 2 颗恶魔传送门宝石。 [3:1]',
    build: skill(
      // Native Damage@RandomEnemy + Damage@RandomPrefNotPrevEnemy (R007-3); AddForKill = any enemy killed by this cast.
      ...(['enemyRandom', 'enemyRandomPrefNotPrev'] as const).map(t => dmg(t, 3, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      })),
      createSpecialGems({ kind: 'daemonicPortalGem' }, 2, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 9478,
    desc: '对敌人造成 [魔法 + 3] 点伤害，并造成恐惧。为每个恶魔盟友创建 1 个传送门宝石。 [1:1]',
    // 「造成恐惧」= terror（官方 CauseTerror，白名单已有）；「每个恶魔盟友 1 个传送门」=
    // alliesOfRace Daemon 挂创造数量
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('terror', 'enemyChosen'),
      createSpecialGems({ kind: 'daemonicPortalGem' }, 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'alliesOfRace', race: 'Daemon' } },
      }),
    ),
  },


  {
    // —— 流血宝石 = bleedGem（波A）/ 腐烂宝石 = decayGem（波B 单色）——两段独立创造 ——
    id: 9787,
    desc: '制造5个流血宝石和5个衰败宝石。然后获得额外回合。',
    build: skill(
      createSpecialGems({ kind: 'bleedGem' }, 5),
      createSpecialGems({ kind: 'decayGem' }, 5),
      extraTurn(),
    ),
  },
  {
    // —— 「净化并淹没 2 名随机盟友，并给予他们一半的法力值」= 官方 Cleanse+Submerged+
    // GenerateHalfMana@FromPrevious ×2 → lastTarget 绑定；「一半魔力值」= mana halve（§9.6） ——
    id: 9816,
    desc: '净化并淹没 2 名随机盟友，并给予他们一半的法力值。',
    build: skill(
      cleanse('allyRandom'),
      inflict('submerged', 'lastTarget'),
      mana('lastTarget', 0, 0, { halve: true }),
      // L3-012: native second Cleanse targets RandomPrefNotPrevAlly
      cleanse('allyRandomPrefNotPrev'),
      inflict('submerged', 'lastTarget'),
      mana('lastTarget', 0, 0, { halve: true }),
    ),
  },
  {
    id: 9907,
    desc: '获得[魔法 + 1]点攻击力，由狼人宝石加成。然后将4颗紫色宝石转化为屏障宝石。 [x8]',
    // 「由狼人宝石加成 [x8]」= boardSpecial lycanthropyGem（波B）；屏障宝石 = barrierGem（波A，
    // 无色族，transformToSpecial 端点无需 color）
    build: skill(
      attack('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
      transformToSpecial(BaseColor.Purple, 'barrierGem', { count: 4 }),
    ),
  },
  {
    // —— 「施加以下效果之一」= oneOf 四支（§9.3）；元素星 = elementalStar（波B） ——
    id: 10057,
    desc: '对所有敌人造成[魔法 + 4]点伤害，并生成2颗元素之星。然后，可以对所有敌人施加以下效果之一：燃烧、冰冻、纠缠或眩晕。',
    build: skill(
      dmg('enemyAll', 4, 1, { range: 'all' }),
      createSpecialGems({ kind: 'elementalStar' }, 2),
      oneOf(
        inflict('burning', 'enemyAll'),
        inflict('frozen', 'enemyAll'),
        inflict('entangle', 'enemyAll'),
        inflict('stun', 'enemyAll'),
      ),
    ),
  },
];

export const BATCH_R15: CuratedBatch = { batch: 'R15', spells: SPELLS, skipped: SKIPPED };
