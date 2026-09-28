/**
 * 放弃桶回收批 R21（2026-09-18）：全词汇终判批。
 *
 * 工作面 = tmp/remaining_all.json 133 行（121 个 unique spell id，6 个 id 各重复 3 次——
 * 8556/8804/8915/8925/9237/9546），即 r17-r20 各批 SKIP 与历史散落的全部未组装条目的并集。
 * 逐条用当前全词汇（enemiesOfRace/alliesOfKingdom/perDestroyed/convertSpecial/fromSpecial/
 * reposition/lastReduce/boardSpecial/countEnemyDeaths/manaFull/casterStatBeatsTarget/
 * dispelPositives 助手/countRange/rangeSpec/regionPresent 等）重判。
 *
 * 判读依据 = 官方英文原句（data/raw/gow-2026-09-18/troops.en.json，按 stats.spell.id 对齐）
 * 与官方 SpellSteps（data/raw/spells.gow.en.json，按 SpellId → data.SpellSteps；该文件 data
 * 块错位严重，仅作旁证、与 EN 原句冲突时以原句为准），原句优先于机翻 ZH。
 *
 * 本批口径：
 * - enemiesOfRace 已随 K-E 武器原语批落地（r18/r19 的种族计数缺口组整体回收）：
 *   7459/7546/7547/7598/7698/7797/7798/7981/8102/8272/8362/8584/8838/8915/9237/9284/
 *   9462/9471/8653。
 * - 段级 targetKingdom 过滤（K-E 批）回收王国组：8556（圣唐/Shentang）、8607（皓彩森林/
 *   Bright Forest——本地 Character.kingdom 字段实锤）。
 * - 【挽救】三条（有官方证据推翻旧口径，批内注明）：7161（官方步骤 Heal Amount 100 = 全额，
 *   r17/r18「治疗量不明」收口）、8871（ZH 截断按官方 EN 全句补全，r19 收口）、8596（ZH 病句
 *   按 EN 全句判读）、9723（泛指驱散按 r18/r20 dispelPositives §6 口径回收，r19 收口）。
 * - 狼化状态施加（8553/8566/8567）、敌方黄金池（8568/8859/8904/9189）、打错敌人（7254/7314/
 *   7386/8108/8307）、两两交换（7555/7992）、任意状态条件（7263/7935/8581）、复制召唤
 *   （8187/8188/8190/8273）等仍无对应原语 → 留弃（见批尾分组）。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, cleanse,
  inflict, inflictRandom, createGems, createSkulls, createSpecialGems,
  transform, transformToSpecial, destroyRandomRows, destroyArea,
  explodeRandomGems, explodeRandomSpecialGems, explodeSpecialGems,
  oneOf, summonRef, summonRandom, transformTroop, transformTroopRandom,
  extraTurn, dispelStatus, boostPer, enemiesOfRaceBoost, alliesOfKingdomBoost,
  scale, flat,
} from '../builders';
import type { SegmentOpts } from '../builders';
import { BaseColor } from '../../types';
import type { Condition, CondMult } from '../effects/secondary';
import type { EffectSegment } from '../prototypes';
import type { TargetMode } from '../targeting';

/** 恶魔/妖仙族随机名单：troopTypes 含 Daemon/Fey 的全部兵种 referenceName（SOP §6 口径，
 *  batch-12 DEMONS / batch-03 女巫名单同款；按现行 src/data/troops.json 全量导出） */
const DAEMONS = [
  'AncientHorror', 'SpiderQueen', 'Abhorath', 'Webspinner', 'Moloch', 'TheSilentOne',
  'Gorgotha', 'Kerberos', 'Cthyryzyx', 'Terraxis', 'Psion', 'Abynissia',
  'Quasit', 'Hellhound', 'Succubus', 'HeraldOfChaos', 'InfernalKing', 'Venbarak',
  'War', 'Plague', 'Famine', 'Death', 'Marilith', 'Hellcat',
  'Creeper', 'KruargTheDread', 'Desdaemona', 'Warg', 'Incubus', 'DarkMonolith',
  'Myzmer', 'Elemaugrim', 'CorruptedUrska', 'BoneDaemon', 'Hellspawn', 'Spinnerette',
  'Doomclaw', 'YaoGuai', 'Erinyes', 'Tzathoth', 'Gargantaur', 'TomeOfEvil',
  'Hellcackle', 'Glaycion', 'Nightmare', 'SirMordayne', 'Umbraxis', 'ThePossessedKing',
  'Sloth', 'Envy', 'Greed', 'Gluttony', 'Barghast', 'Pride',
  'Wrath', 'Lust', 'SibylOfLust', 'SoldierOfWrath', 'WallOfTentacles', 'Bael',
  'VashDagon', 'QueenOfSin', 'Glutmaw', 'Obsidius', 'Lamashtu', 'PossessedUrska',
  'BrokerOfGreed', 'EnvoyOfPride', 'MotherOfDarkness', 'GateOfSouls', 'Lucifria', 'Blightwing',
  'Deminaga', 'TheInfernalMachine', 'Ironjaw', 'Tartarus', 'Netherhound', 'EldritchGuardian',
  'FellDragonEgg', 'FellDragon', 'Nocturnia', 'HeraldOfWoe', 'IndolatorOfSloth', 'ShadeOfKurandara',
  'Kurandara', 'EnragedKurandara', 'DaemonGnome', 'Mambasira', 'Arcturion', 'HeraldOfDamnation',
  'Baphomet', 'TheScourgeOfHonor', 'DeepGolem', 'NyarMel', 'HoundOfYaoGuai', 'MaidOfEnvy',
  'TheArchduke', 'Lemure', 'Fury', 'Charonas', 'JudgeOfTheDead', 'HellclawHunter',
  'HellclawMage', 'HellclawWarrior', 'Indrajit', 'HelgorTheGuardian', 'FlamingOni', 'Oneiros',
  'RedAhriman', 'AbjectOfDespond', 'Despond', 'BileBlackheart', 'AnimusOfEnvy', 'HornedHag',
  'ConsortOfDarkness', 'EldritchMinion', 'Uvhash-Ka', 'WarMachine', 'HellclawRager', 'HeraldOfBlight',
  'HellstoneGate', 'HeraldOfTorpor', 'Czernobog', 'Nabassu', 'Xenith', 'Tourmaline',
  'Chalcedony', 'Petrahulk', 'StoneMefyt', 'TheElderDragon', 'VrawkDaemon', 'EldritchDisciple',
  'Voidcaller', 'TheBaneOfMercy', 'EyeOfArges', 'InfernalVoyager', 'TheIronMaiden', 'TriTerror',
  'DaemonChild', 'TheVoidDragon', 'Tempurath', 'DaemonicSentinel', 'Hellborer', 'DarkHerald',
  'Groevanga', 'FellHydra', 'Isban', 'Goethite', 'SuccubusQueen', 'Bieska',
  'HoundmasterGor', 'BlightHound', 'Astaroth', 'DaeDrak', 'MelekTauss', 'DoomedGuardian',
  'StingBat', 'TheBaneOfValor', 'Redreaver', 'LionOfYaoGuai', 'Discordia', 'ImmortalAbaddon',
  'BlightedHusk', 'BaneOfAmbition', 'HellclawShadowpriest', 'Polymetis', 'DagoNath', 'FelineOfEnvy',
  'Skarn', 'MaidenOfPain', 'HeraldOfWar', 'Azbeel', 'OkraNosTheSleeper', 'Voidjaw',
  'ChampionOfRot', 'BloodSpore', 'InfernalTrickster', 'Seditius', 'ImmortalZephaar',
];

const FEYS = [
  'Dryad', 'Treant', 'Nymph', 'Siren', 'Banshee', 'Orion',
  'GloomLeaf', 'Rowanne', 'Sylvasi', 'IceWitch', 'GreenSeer', 'SnowSprite',
  'WinterKnight', 'QueenMab', 'Plague', 'SpiritFox', 'Nyx', 'Sylph',
  'SnowGuardian', 'Aurai', 'Wisp', 'Leshy', 'Domovoi', 'Vodyanoi',
  'YagasHut', 'BabaYaga', 'YasminesChosen', 'Zhenniao', 'Pixie', 'Brownie',
  'SummerKnight', 'CatSith', 'Florian', 'Glitterclaw', 'QueenTitania', 'Hind',
  'Skadi', 'FeyCap', 'FrostArcher', 'Freya', 'CuSith', 'OldManOakroot',
  'Suna', 'Leprechaun', 'Tinseltail', 'DarkDryad', 'Alderfather', 'DaughterOfIce',
  'Birchthorn', 'Shimmerscale', 'KingBloodwood', 'RedCap', 'Puka', 'WildKnight',
  'TheWendigo', 'Doppelganger', 'Copycat', 'GlassGolem', 'TheMirrorQueen', 'ChildOfSummer',
  'Mistralus', 'Cernunnos', 'EirStoneshatter', 'SpringEmissary', 'Vernalis', 'Ullor',
  'Grimmoira', 'EarthDreamer', 'Kelpie', 'Sluagh', 'DarkKnight', 'Leanansidhe',
  'FountainOfStars', 'LadyEstelle', 'FaerieGobmother', 'Catterfly', 'Saga', 'Tannenbaum',
  'TwinkleBerry', 'KingOberron', 'Stheno', 'SpiritOfRage', 'Scoprio', 'HoundOfLiang',
  'CourtHerald', 'PhantomFox', 'ShadowFox', 'TheFoxfireKing', 'KingOfRavens', 'Rukh',
  'Treekin', 'SunSprite', 'FeyHound', 'MirrorKnight', 'Firenza', 'ForestGremlin',
  'LostHunter', 'Feyr', 'TheMidnightQueen', 'LadyOfBones', 'TheMydnightKing', 'LadyOfRuin',
  'DaughterOfTime', 'TheBestialFey', 'FireLion', 'Strongman', 'FireJuggler', 'Ringmaster',
  'Mandragora', 'Unagh', 'Belladonnus', 'Mistlark', 'FeyDragoon', 'Moonfeather',
  'GuardianSpirit', 'ImmortalVirago', 'ImmortalGlaycia', 'Aguara', 'WoodRot', 'MapleGoldbark',
  'Crackleleaf', 'BloodflowerDuchess', 'Muireann', 'Boudicca', 'Mistmother', 'Azaleus',
  'Helilya', 'MydnightInnovator', 'SpiritOfLuck', 'CourtWitch', 'DarkAcrobat', 'WulfGheist',
  'Hollioke', 'Kumiko', 'CromCruach', 'PixieKnight', 'MotherMalice', 'GreenHag',
  'DarkSpirit', 'Wisterina', 'Fionnuala', 'FacelessLord', 'Jezebel', 'TheWeepingDuchess',
  'Liekki',
];

/** 「若在夏之岛使用，则伤害翻倍」（R11 惰性条件；标准战斗无 region 字段 → 恒原值） */
const REGION2 = (region: string): CondMult => ({ times: 2, cond: { kind: 'regionPresent', region } });

/** 「消除/驱散(一名/所有)敌人正面增益」= 按正面状态逐一驱散（spell-rules §6 口径，r18/r20 同款助手） */
const POSITIVE_STATUSES = ['barrier', 'submerged', 'blessed', 'enchanted', 'reflect', 'enraged', 'rage'] as const;

function dispelPositives(target: TargetMode, extra?: Condition, shared?: SegmentOpts): EffectSegment[] {
  return POSITIVE_STATUSES.map((statusId) => {
    const statusCond: Condition = { kind: 'targetStatus', statusId };
    return dispelStatus(statusId, target, {
      ifCond: extra ? { kind: 'allOf', of: [statusCond, extra] } : statusCond,
      ...shared,
    });
  });
}

const SKIPPED: { id: number; reason: string }[] = [
  // 【一行三格 / 限色选定行列（面积形状缺口）】（5 条）
  { id: 7000, reason: '「摧毁 1 颗宝石和其两侧的宝石」= Block3x1 一行三格——destroyArea 无此形状（cross3 为十字），r17/r18 口径' },
  { id: 9052, reason: '「爆破一颗宝石和其两边的宝石」= 同 7000 Block3x1（batch-03 7402 同款官方句），r17/r18 口径' },
  { id: 7253, reason: '「选择一颗紫色宝石，摧毁其行和列」= 限色选定行列无原语（chosenLine 不限色、CELL 转换不限行列），r17/r18 口径' },
  { id: 7388, reason: '「因该行被摧毁的骷髅头数而增强 [x5]」= destroyedGems 无骷髅筛（细分缺口），r17/r18 口径；摧毁行段本身可表' },
  { id: 7977, reason: '「数量因被摧毁的骷髅头数而增强 [x3]」= destroyedGems 无骷髅筛（细分缺口），r17/r18 口径' },
  // 【随机爆破普通骷髅 / 定量骷髅清除】（2 条）
  { id: 7136, reason: '「随机爆破 10 颗骷髅头」= 随机 N 颗普通骷髅爆破无原语（randomGems 仅特殊宝石筛），r17 口径' },
  { id: 8504, reason: '「炸毁三个骷髅头」= 定量普通骷髅爆破无原语（同 7136）；「获得一次攻击」= IncreaseAttack 半魔法缩放可表但整条仍卡' },
  // 【随机分配 / 交换 / 位置复合目标】（6 条）
  { id: 7207, reason: '「8 点伤害随机分配给所有敌人」= 随机分配伤害 ≠ 引擎 split 均分（r17 口径）；teamSize 增强本身可表' },
  { id: 7555, reason: '「再使他们交换位置」= 两两交换无原语（reposition 为单向移动非交换），r18 口径' },
  { id: 7992, reason: '「使首位和末位敌人交换位置」= 同 7555 两两交换，r18 口径' },
  { id: 8220, reason: '「燃烧第一组敌人，冻结第二组敌人」= FromPrevious 双随机目标分组绑定无原语，r18 口径' },
  { id: 8902, reason: '「倒数第二位敌人」(SecondLastEnemy) 无对应目标模式（enemyNth 静态、enemyLastN 为集合），r19 口径' },
  { id: 8659, reason: '「对一名敌人和其上位的敌人造成等同于其攻击力的伤害」= 「同等伤害」跨段绑定被 lastTarget 更新冲掉（段 2 先解析 enemyAboveTarget 再求 modifier，targetStat 指向错位）；enemyAboveTarget 本身已落' },
  // 【「打错敌人」目标偏移】（5 条）
  { id: 7254, reason: '「有 50% 的几率打错敌人」= 目标偏移无对应机制（r12/r15/r17 口径）；棕色目标三倍可表但整条仍卡' },
  { id: 7314, reason: '同 7254（打错敌人，黄色版）；AddForKill 全技能段本身可表' },
  { id: 7386, reason: '同 7254（打错敌人，绿色版）' },
  { id: 8307, reason: '同 7254（打错敌人，红色版）；AddForKill 攻击段本身可表' },
  { id: 8108, reason: '同 7254（打错敌人，紫色版）；r18 另记 desc 与官方步骤矛盾' },
  // 【任意状态条件 / 幸存反向 / else 分支】（6 条）
  { id: 7263, reason: '「如果敌人陷入某状态效果则耗尽法力」= 任意状态条件不在条件域（targetStatus 仅按状态 id），r18 口径' },
  { id: 7935, reason: '「若敌人身负状态效果则双倍伤害」= 同 7263 任意状态条件，r18 口径' },
  { id: 8374, reason: '「若敌人幸存则窃取 4 点魔法」= 幸存条件（ifTargetDied 取反）无原语，r17 口径' },
  { id: 8550, reason: '「若敌人身亡获得灵魂，否则死亡标记」= else 分支（ifTargetDied 取反）无原语，r17/r20 口径' },
  { id: 8248, reason: '「否则就召唤 2 名暗影姐妹」= else 分支同 8550 + NextDown 单格；暗影姐妹 SisterOfShadows 6477 本身可引' },
  { id: 8573, reason: '「若敌人是纳迦族则几率翻倍」= 概率的条件倍率无原语（chanceBoost 仅加算）+「否则」反向分支，r20 口径' },
  // 【二次缩放来源缺口（目标侧/细分类）】（17 条）
  { id: 7274, reason: '「数值因造成的伤害而增强」= 伤害额无来源 kind（lastReduce 仅辖 reduce 族），r17 口径；「等同于其攻击力」= targetStat attack ratio 可表' },
  { id: 7464, reason: '「因敌方损失的生命值而增强」= targetStat 缺 missingHp（selfStat 侧已有、目标侧无），r17 口径' },
  { id: 7472, reason: '「因敌人所需的法力值而增强」= targetStat 缺 manaCost（selfStat 侧已有、目标侧无），r17 口径' },
  { id: 7483, reason: '「伤害值等同于自身的攻击力 + [x10]」= 伤害基数=攻击力非魔法缩放，与尾缀 [x10] 双结构无法同表（modifier 单 mod），编码歧义不猜' },
  { id: 7808, reason: '「因生命值和法力值满值的敌军数而增强」= CountEnemiesFullMana/满血计数无来源 kind（r20 8406 同口径）' },
  { id: 8406, reason: '「每有一名法力值满值的敌人则创造 8 颗红色宝石」= CountEnemiesFullMana 计数无来源 kind（r20 口径）；quarter 法力/15% 自毁本身可表' },
  { id: 8367, reason: '「因所有红色敌人的法力值而增强」= 按色筛选的敌方法力总和无来源（enemyStatSum 不筛色），r17 口径；红敌耗蓝段可表' },
  { id: 8581, reason: '「每有一名敌人陷入状态效果则再创造 2 颗」= 任意状态计数无来源（enemyStatusCount 按 id），r17 口径' },
  { id: 9364, reason: '「敌人法力颜色最常用的宝石数量」= ENEMY_MOST_USED 动态色的计数来源缺（占位仅宝石段消费、无 modifier 来源），r17 口径' },
  { id: 9492, reason: '「几率随被摧毁的头骨数量而增强 [x6]」= destroyedGems 无骷髅筛（细分缺口）；5x5 圈 + 30% 吞噬本身可表' },
  { id: 8464, reason: '「因选定的颜色（黄色除外）而增强」= 选定色/除外色计数无来源（boardGems 不收 CHOSEN），r17 口径' },
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友攻击来源无 kind（allyStatSum 为总和）+「3 到 8 点法力值」数值区间，r17/r18 口径' },
  { id: 8060, reason: '「创造与此色宝石数等量的红色宝石」= 选定色计数无来源（创造数量不可挂 CHOSEN 色来源），r17/r18 口径' },
  { id: 8467, reason: '尾缀 [x5] 无来源句可绑定（r17 口径）；蓝色法力条件段（destroyChosenCol+攻击）本身可表' },
  { id: 8904, reason: '「数值因窃取黄金数而增强」= 黄金窃取额无来源 kind（敌方黄金池缺口，r20 8568 口径）；[50:1] 同源' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方黄金池无来源（TakeEnemyGold 无池），r19/r20 口径' },
  { id: 8859, reason: '「窃取黄金」&& 子句 = 敌方黄金池无来源（首句即卡，按序编译整条不可拆），r19/r20 口径' },
  // 【「其他盟友」排除句式（总和类来源不排自身）】（2 条）
  { id: 7506, reason: '「因其他盟友的魔力值而增强 [2:1]」= allyStatSum 无法排除自身（r18 口径）；双色转换段可表' },
  { id: 7651, reason: '「因其他所有盟友的法力值而增强」= 同 7506 排除句式 + [1:1]（r18 口径）' },
  // 【数值区间（法力/护甲值区间，非数量区间）】（6 条）
  { id: 7469, reason: '「给予他们 3-8 点法力值」= GenerateRandomMana 数值区间无原语（nRange 是目标数区间），r17/r19 口径' },
  { id: 8931, reason: '「给予其他盟友 3-8 点法力值」= 同 7469 数值区间（r19：其余部分均可表）' },
  { id: 9055, reason: '「给予所有其他盟友 3-10 法力值」= 同 7469 数值区间；blessed 盟友计数来源可表' },
  { id: 9181, reason: '「给予所有其他盟友 3-10 点法力值」= 同 7469 数值区间；四选一召唤（summonRandom）本身可表' },
  { id: 8055, reason: '「获得 [魔法 + 4] – [(魔法 x 2) + 8] 点护甲值」= buff 无 rangeSpec（r18 口径）；伤害侧 rangeSpec 可表' },
  { id: 8356, reason: '「耗掉他们 1-3 点法力值」= 数值区间（非数量区间）无原语（r17：首句「紫色敌人」targetColor 可表）' },
  // 【条件域缺口（宝石段/创造段/跨目标绑定）】（11 条）
  { id: 8276, reason: '「若敌人已陷入疾病/燃烧状态则爆破宝石」= 目标相对条件辖无目标宝石段整段跳过（r17 口径）' },
  { id: 8534, reason: '「若敌人是建造则爆破 8 颗宝石」= 同 8276 目标相对条件辖无目标宝石段，r17 口径' },
  { id: 8533, reason: '「若敌人是元素则赋予所有其他盟友法印」= 跨段目标种族条件（目标相对条件辖 allyOthers 段会错滤），r18/r20 口径' },
  { id: 7690, reason: '「若该敌人已被冻结则再造成 5 点伤害并冻结其上下左右的敌人」= 跨目标条件绑定（条件在 lastTarget、动作为相邻集合）无原语，r17/r18 口径' },
  { id: 8925, reason: '「若对方是一名骑士则创造灵力宝石」= 目标相对条件挂无目标创造段整段跳过，r16/r19 口径；屏障+半数法力可表' },
  { id: 7541, reason: '「若已陷猎人标记则再加 10 点伤害并获得额外回合」= 加伤可 condBonus targetStatus marked，但额外回合的目标相对条件挂无目标段整段跳过（runSegment 674 行口径），r18 口径' },
  { id: 8355, reason: '「使指定颜色宝石数翻倍」= 翻倍需按选定色计数创造（boardGems 无 CHOSEN 端点），r17 口径' },
  { id: 8429, reason: '「爆破 [魔法 + 1] 颗绿色或紫色宝石」= 双色并集池无原语（randomGems 单色筛；oneOf 为整段二选一非逐颗混池）' },
  { id: 9812, reason: '「吸取其 8 点法力值」（双随机目标绑定）+「若有敌人死亡」（任意死亡条件）均无原语，r16/r18 口径' },
  { id: 9986, reason: '「若有敌人死亡则对所有敌人施加恐惧」= 多目标段任意死亡绑定无原语（ifTargetDied 仅判最近段主目标），r16 口径' },
  { id: 8427, reason: '「每有一名受诅咒的敌人则赋予一名随机盟友屏障」= 状态计数驱动施加（status 段仅 perDestroyed），r16/r19 口径；伤害段 enemiesStatusCount curse ×2 可表' },
  // 【状态计数驱动施加（非 destroyed 计数）】（3 条）
  { id: 9252, reason: '「每有一个红色盟友则使随机敌人恐怖」= 盟友色计数驱动施加无原语（r16 口径）；10 灵魂段可表' },
  { id: 9287, reason: '「每颗鬼魂宝石则给予随机盟友屏障」= 板面特殊宝石计数驱动施加，r16/r19 口径' },
  { id: 9341, reason: '「每有 10 黄金则使一名随机敌人陷入疾病」= 经济计数（battleGold）驱动施加无原语；转换+黄金段可表' },
  // 【复制召唤 / 自变形 / 自复活】（5 条）
  { id: 8187, reason: '「转化成一名敌人」= TransformSelf 无原语，r18 口径' },
  { id: 8188, reason: '「创造与盟友法力色相同的宝石（ColorSpec 无 ALLY 占位）+ 50% 复制盟友召唤」无原语，r17 口径' },
  { id: 8190, reason: '「有 50% 的几率复制那名敌人」= 复制召唤无原语（r18 口径）；反射盟友计数 allyStatusCount reflect 可表' },
  { id: 8273, reason: '「召唤首位敌人的卡牌」= 复制召唤无原语（r17 口径）；黄色盟友增益 targetColor 过滤可表' },
  { id: 7542, reason: '「凤凰涅槃浴火重生」= 自复活无机制（r18 口径）；散射+生命增强本身可表' },
  // 【属性比较 / 随机技能转移 / 几率缩放】（6 条）
  { id: 7812, reason: '「自身每高于敌方一个技能即可窃取 3 点魔法」= 逐围比较计数无原语（casterStatBeatsTarget 仅单围布尔），r18 口径' },
  { id: 7960, reason: '「若其攻击力比较大则双倍」= 反向属性比较（目标>施法者）无原语（仅支持正向），r17/r18 口径' },
  { id: 7987, reason: '「窃取护甲再转换成随机技能值并给予第一位盟友」= 窃取增益重定向 + 随机技能转移无原语，r17/r18 口径' },
  { id: 8377, reason: '「转换成随机技能值并给予所有盟友」= 随机技能转移口径不合（randomStat 逐点分摊 vs 全额入单围），r17 口径' },
  { id: 8694, reason: '「有 [魔法 + 1] 的几率杀掉敌人」= 几率带魔法缩放无原语（chance 为静态数），r17 口径' },
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= 几率上限无法表达（chanceBoost 线性叠加后夹取）+ ZH 30%/官方 CountMax 20 互相矛盾，r19 口径' },
  // 【 Mana Burn / 其他语义缺口】（14 条）
  { id: 7328, reason: '「法力灼烧，伤害值因自身魔力值而增强」= Mana Burn 伤害公式原文无数值（drain 全额可表、灼烧伤害量不可），r17/r18 口径' },
  { id: 7713, reason: '「窃取攻击力并将之给予你第一位盟友」= steal 增益恒入施法者（重定向无原语）+ 骷髅×绿色混合创造（createMix 不收 SKULL 端点），r17/r18 口径' },
  { id: 7747, reason: '「若其中一名敌人身亡则击杀另一名敌人」= 两目标间「其中一名/另一名」绑定无原语，r18 口径' },
  { id: 8320, reason: '「使所有被伤害的敌人陷入燃烧和疾病」= 受溅射目标集合无目标模式（FromPrevious 仅主目标），r17 口径；恶龙蛋 FellDragonEgg 6892 可引' },
  { id: 9545, reason: '「诅咒敌人数量增加」= 转换颗数不可挂 modifier（transform count 仅静态缩放，gems.ts 无该通道）；紫龙宝石转换+诅咒/死亡标记可表' },
  { id: 9546, reason: '「棕色和腐烂宝石的混合体」= 颜色+特殊宝石混合创造无原语（createMix 仅颜色、createSpecialGems2 仅双特殊），r19 口径' },
  { id: 9780, reason: '「绿色宝石和流血宝石合成」= 同 9546 混合创造缺口，r19 口径' },
  { id: 9571, reason: '「并将其作为生命赋予最弱的盟友」= 伤害额→治疗量绑定无原语（lastReduce 仅辖 reduce 族），r19 口径' },
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 无前序 chosen 段则 LAST_TARGET 无回退值、亦无 allyChosen 段供选择器挂靠（r19 口径；r20 8687 挽救有天然 allyChosen 前序段，本条没有）' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 周边位置计数无 modifier 来源（boardGems 为全盘），r19 口径' },
  { id: 8812, reason: '「每有一颗骷髅头被摧毁则再爆破一颗」= destroyedGems 无骷髅筛，r19 口径' },
  { id: 8880, reason: '「混合紫色和骷髅头的宝石」= createMix 不收 SKULL 端点（resolveColor 为 null 整段跳过），r17 口径' },
  { id: 8927, reason: '「数值因被摧毁的 [x5]」ZH 截断 + EN「被摧毁的石像鬼宝石」destroyedGems 无特殊宝石筛，r19 口径' },
  { id: 9959, reason: '「引爆 2-5 颗宝石」= 清除段无 countRange（仅创造段支持），r17 口径；Boss×升华倍率（BOSS_ASC3）可表' },
  // 【状态词表外（狼化）】（3 条）
  { id: 8553, reason: '「陷入狼化状态」不在状态白名单、引擎无狼化变形机制（spell-rules §7），r20 口径' },
  { id: 8566, reason: '「每有一颗狼化宝石则使随机敌人死亡标记」= 板面宝石计数驱动施加无原语（仅 perDestroyed），r16/r20 口径' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件（boardAtLeast 只计基色/骷髅），r20 口径' },
  // 【伤口来源（偷盗/驱散泛指）】（1 条）
  { id: 8568, reason: '「窃取敌人黄金」= 敌方黄金池无来源（CountEnemyGold/TakeEnemyGold 无池），r19/r20 口径；耗蓝+冻结可表' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7161,
    desc: '为 1 名盟友提供 [魔法] 生命值和攻击力，然后净化和治疗他。',
    // 【挽救】r17/r18 曾因「治疗量原文未给」留弃；官方步骤实锤 {"Amount":100,"Type":"Heal"}
    // （Heal 步骤 Amount 为百分比语义，100 = 全额，batch-27 full:true 同款）——「治疗他」= 全额治疗。
    build: skill(
    heal('allyChosen', 0, 1),
    attack('allyChosen', 0, 1),
    cleanse('allyChosen'),
    heal('allyChosen', 0, 0, { full: true }),
    ),
  },
  {
    id: 7374,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害。造成 1 到 5 项随机状态效果。',
    // 「造成 1 到 5 项随机状态效果」= 官方步骤 1 条必发 + 4 条各 50%（RandomStatusEffect ×5
    // 独立掷签，7374 步骤与本句对齐）——敌方目标按阵营取负面池（inflictRandom 缺省口径）。
    build: skill(
    dmg('enemyChosen', 2, 1),
    inflictRandom('enemyChosen'),
    inflictRandom('enemyChosen', { chance: 0.5 }),
    inflictRandom('enemyChosen', { chance: 0.5 }),
    inflictRandom('enemyChosen', { chance: 0.5 }),
    inflictRandom('enemyChosen', { chance: 0.5 }),
    ),
  },
  {
    id: 7459,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害，伤害值因敌方的建造军队数而增强。若敌人是一名建造，则造成 3 倍伤害。 [x4]',
    // enemiesOfRace 首批消费（K-E 批已落，r18 曾因此留弃）：「因敌方的建造军队数 [x4]」=
    // enemiesOfRace Construct ×4（CountArmyType construct@AllEnemies 400）；「若敌人是建造 3 倍」
    // = condMult targetRace（7893 口径）。
    build: skill(
    dmg('enemyChosen', 1, 1, {
      modifier: enemiesOfRaceBoost('Construct', 4),
      condMult: { times: 3, cond: { kind: 'targetRace', race: 'Construct' } },
    }),
    ),
  },
  {
    id: 7546,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因我方和敌方的哥布林数而增强。获得额外的一回合。 [x3]',
    // 「因我方和敌方的哥布林数 [x3]」= alliesOfRace + enemiesOfRace 双来源各 ×3（8312 双计数口径）。
    build: skill(
    dmg('enemyAll', 1, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 3 },
        sources: [{ kind: 'alliesOfRace', race: 'Goblin' }, { kind: 'enemiesOfRace', race: 'Goblin' }],
      },
    }),
    extraTurn(),
    ),
  },
  {
    id: 7547,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害。伤害值因敌方龙族军队数而增强。 [x5]',
    // 「因敌方龙族军队数 [x5]」= enemiesOfRace Dragon ×5（Wave4 敌侧来源首批消费）。
    build: skill(
    dmgSplash('enemyChosen', 3, 1, { modifier: enemiesOfRaceBoost('Dragon', 5) }),
    ),
  },
  {
    id: 7598,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因敌军的妖仙数量而增强。召唤一名银天龙或克里斯坦纳斯。 [x8]',
    // 「因敌军的妖仙数量 [x8]」= enemiesOfRace Fey ×8；「银天龙或克里斯坦纳斯」= oneOf（官方两变体步骤）。
    build: skill(
    dmg('enemyChosen', 2, 1, { modifier: enemiesOfRaceBoost('Fey', 8) }),
    oneOf(
      [summonRef('SilverDrakon', 6321)],
      [summonRef('Krystenax', 6328)],
    ),
    ),
  },
  {
    id: 7698,
    desc: '获得 [魔法 + 1] 点护甲值，点数因敌我双方的不死族军队数量而增强。所有其他盟友获得 5 点攻击力和法力值。 [x2]',
    // 「因敌我双方的不死族军队数量 [x2]」= alliesOfRace + enemiesOfRace Undead 双来源各 ×2
    // （r19 8838 同构四来源裁半）；「所有其他盟友获得 5 点攻击力和法力值」= allyOthers 双段。
    build: skill(
    armor('allySelf', 1, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 2 },
        sources: [{ kind: 'alliesOfRace', race: 'Undead' }, { kind: 'enemiesOfRace', race: 'Undead' }],
      },
    }),
    attack('allyOthers', 5, 0),
    mana('allyOthers', 5, 0),
    ),
  },
  {
    id: 7797,
    desc: '对所有敌人造成 [魔法 + 7] 点伤害。爆破 3 颗末日骷髅头，数量因神祗敌军数量而增强。使所有神祗敌军陷入沉默效果。 [1:1]',
    // 「爆破 3 颗末日骷髅头，数量因神祗敌军数量而增强 [1:1]」= explodeRandomSpecialGems 挂
    // enemiesOfRace Divine ×1（[1:1] = CountArmyType Divine 100 等价 ×1/名）；「所有神祗敌军沉默」
    // = targetRace Divine 限定目标（r19 王国批同款段级过滤）。
    build: skill(
    dmg('enemyAll', 7, 1),
    // native order (R001): Damage, CauseSilence@EnemyType, then ExplodeColor Doomskull (sa-R1)
    inflict('silence', 'enemyAll', { targetRace: 'Divine' }),
    explodeRandomSpecialGems('doomSkull', 3, 0, { modifier: enemiesOfRaceBoost('Divine', 1) }),
    ),
  },
  {
    id: 7798,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方的恶魔军队数量而增强。有各别 3 次 20% 的几率将 1 名随机敌人转化成一名恶魔。 [x2]',
    // 「因敌我双方的恶魔军队数量 [x2]」= Daemon 双来源各 ×2；「各别 3 次 20% 几率将 1 名随机敌人
    // 转化成一名恶魔」= transformTroopRandom ×3 各 chance 0.2（官方 3 条独立掷签；恶魔名单 =
    // troopTypes 含 Daemon 全集，batch-12 DEMONS 同款种族名单口径、按现行 troops.json 重新导出）。
    build: skill(
    dmg('enemyAll', 2, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 2 },
        sources: [{ kind: 'alliesOfRace', race: 'Daemon' }, { kind: 'enemiesOfRace', race: 'Daemon' }],
      },
    }),
    transformTroopRandom('enemyRandom', DAEMONS, { chance: 0.2 }),
    transformTroopRandom('enemyRandom', DAEMONS, { chance: 0.2 }),
    transformTroopRandom('enemyRandom', DAEMONS, { chance: 0.2 }),
    ),
  },
  {
    id: 7981,
    desc: '获得 [魔法 + 1] 点护甲值，数值因敌我两方的恶魔数而增强。所有其他盟友获得 2 点魔力值和 5 点法力值。 [x2]',
    // 同 7698 结构：Daemon 双来源 ×2 护甲 + allyOthers 魔法/法力双段。
    build: skill(
    armor('allySelf', 1, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 2 },
        sources: [{ kind: 'alliesOfRace', race: 'Daemon' }, { kind: 'enemiesOfRace', race: 'Daemon' }],
      },
    }),
    magic('allyOthers', 2, 0),
    mana('allyOthers', 5, 0),
    ),
  },
  {
    id: 8102,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方的妖仙数而增强。召唤一名随机妖仙。有 20% 的几率将一名随机敌军转化成小花仙。 [x5]',
    // 「因敌我双方的妖仙数 [x5]」= Fey 双来源各 ×5；「召唤一名随机妖仙」= summonRandom(FEYS)
    // （troopTypes 含 Fey 全集，batch-03 女巫名单同款口径）；「20% 转化成小花仙」= transformTroop
    // （'Pixie' 6420）挂 chance。
    build: skill(
    dmg('enemyAll', 2, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 5 },
        sources: [{ kind: 'alliesOfRace', race: 'Fey' }, { kind: 'enemiesOfRace', race: 'Fey' }],
      },
    }),
    summonRandom(FEYS),
    transformTroop('enemyRandom', 'Pixie', { troopId: 6420, chance: 0.2 }),
    ),
  },
  {
    id: 8272,
    desc: '创造 8 颗红色宝石，数量因敌我双方的兽人军队数量而增强。给予所有盟友 1 点攻击力。 [1:1]',
    // 「因敌我双方的兽人军队数量 [1:1]」= Orc 双来源各 ×1（100 等价 ×1/名）。
    build: skill(
    createGems(BaseColor.Red, 8, 0, {
      modifier: {
        mod: { kind: 'multiplier', a: 1 },
        sources: [{ kind: 'alliesOfRace', race: 'Orc' }, { kind: 'enemiesOfRace', race: 'Orc' }],
      },
    }),
    attack('allyAll', 1, 0),
    ),
  },
  {
    id: 8362,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因不死族敌人数而增强。若敌人是不死族，则有 50% 的几率使其陷入诅咒和沉默状态。 [x6]',
    // 「因不死族敌人数 [x6]」= enemiesOfRace Undead ×6；「若敌人是不死族各别 50% 诅咒和沉默」=
    // 两段独立 chance + ifCond targetRace（EN: independent 50% chances to Curse and Silence）。
    build: skill(
    dmg('enemyChosen', 3, 1, { modifier: enemiesOfRaceBoost('Undead', 6) }),
    inflict('curse', 'enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Undead' } }),
    inflict('silence', 'enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Undead' } }),
    ),
  },
  {
    id: 8365,
    desc: '对一名敌人和其下方的敌人造成 [魔法 + 3] 点伤害，伤害值因荆棘森林的盟友数而增强。 [x4]',
    // 「因荆棘森林的盟友数 [x4]」= alliesOfKingdom（Wave4/r19 已落，r17 王国组首批消费）；
    // 「一名敌人和其下方的敌人」= enemyChosenAndBelow（编队下方，R11 已落）。
    build: skill(
    dmg('enemyChosenAndBelow', 3, 1, { modifier: alliesOfKingdomBoost('荆棘森林', 4) }),
    ),
  },
  {
    id: 8556,
    desc: '赋予一名盟友[魔法 + 1]生命值和2点魔力值。如果该盟友来自神堂，则为其附魔。',
    // 【挽救】r17 曾因王国条件组留弃；「来自神堂(Shentang)」= targetKingdom 段级过滤
    // （K-E 批已落；本地 Character.kingdom 值 =「圣唐」，EN Shentang 同王国）；「为其附魔」=
    // enchanted（R10 口径）。
    build: skill(
    heal('allyChosen', 1, 1),
    magic('allyChosen', 2, 0),
    inflict('enchanted', 'allyChosen', { targetKingdom: '圣唐' }),
    ),
  },
  {
    id: 8584,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因敌人队伍里的野兽数和狼化宝石数而增强。 [x6]',
    // 【挽救】r20 因 enemiesOfRace 缺失留弃，K-E 批已落：「因敌人队伍里的野兽数和狼化宝石数
    // [x6]」= enemiesOfRace Beast + boardSpecial lycanthropyGem 双来源各 ×6（r20 8571 口径）。
    build: skill(
    dmg('enemyChosen', 4, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 6 },
        sources: [{ kind: 'enemiesOfRace', race: 'Beast' }, { kind: 'boardSpecial', gem: 'lycanthropyGem' }],
      },
    }),
    ),
  },
  {
    id: 8585,
    desc: '爆破 3x3 阵型的宝石。获得 [(魔法 x 1.5) + 4] 点护甲值。每爆破一颗骷髅头则赋予一名随机盟友屏障效果。 [1:1]',
    // 「爆破 3x3 阵型」= destroyArea square3 explode（r12 口径）；「每爆破一颗骷髅头则屏障随机
    // 盟友」= perDestroyed skull（Wave4 已落——7463 同款计数驱动施加，骷髅筛为 perDestroyed
    // 专属通道，与 destroyedGems 无骷髅筛的来源缺口无关）。
    build: skill(
    destroyArea('square3', 'explode'),
    armor('allySelf', 4, 1.5),
    inflict('barrier', 'allyRandom', { perDestroyed: { color: 'skull' } }),
    ),
  },
  {
    id: 8596,
    desc: '将5有绿宝石都转化为紫色药水，并且所有棕色宝石都变为骷髅头。净化所有精灵同盟。',
    // 【挽救】ZH 机翻病句（「将5有绿宝石」）按官方 EN 全句判读：Convert 5 Green Gems to
    // Purple Potions = transformToSpecial 绿→manaPotionGem 定量 5（转换端点无 color 通道，r14 口径
    // 按 kind 落）；「棕色宝石都变为骷髅头」= transform；「净化所有精灵(Fey)同盟」= cleanse +
    // targetRace Fey（EN Cleanse all Fey Allies；本句「精灵」= Fey 的别译，8469 妖仙同族）。
    build: skill(
    // PurpleManaPotion carries its colour (L4b-7068-potion-colour).
    transformToSpecial(BaseColor.Green, { kind: 'manaPotionGem', color: BaseColor.Purple }, { count: 5 }),
    transform(BaseColor.Brown, 'SKULL'),
    cleanse('allyAll', undefined, { targetRace: 'Fey' }),
    ),
  },
  {
    id: 8607,
    desc: '制造8个绿色宝石和8个红色宝石。被保佑并给予3种魔法给所有光明森林的盟友们。',
    // 【挽救】r17 王国条件组：「光明森林(Bright Forest)」= 本地王国「皓彩森林」（Lady Estelle
    // kingdom 字段实锤）——赐福 + 3 魔法两段均 targetKingdom 过滤；「被保佑」= blessed（R10）。
    build: skill(
    createGems(BaseColor.Green, 8),
    createGems(BaseColor.Red, 8),
    inflict('blessed', 'allyAll', { targetKingdom: '皓彩森林' }),
    magic('allyAll', 3, 0, { targetKingdom: '皓彩森林' }),
    ),
  },
  {
    id: 8653,
    desc: '每有一名元素敌人则摧毁 1 行。再造成 [魔法 + 7] 点散射伤害。 [1:1]',
    // 【挽救】r17 因 enemiesOfRace 缺失留弃：「每有一名元素敌人则摧毁 1 行」= destroyRandomRows
    // count 挂 enemiesOfRace Elemental ×1（randomLines count 走 evaluateWithModifier，数量来源
    // 官方 CountArmyType@AllEnemies 100）；尾缀 [1:1] 即该计数的序列化（描述置于句末），伤害段 plain。
    build: skill(
    destroyRandomRows(0, 0, { modifier: enemiesOfRaceBoost('Elemental', 1) }),
    dmg('enemyAll', 7, 1, { range: 'all' }),
    ),
  },
  {
    id: 8838,
    desc: '制造6个骷髅头，由所有亡灵和恶魔（包括盟友和敌人的）增强。 [1:1]',
    // 【挽救】r19 因敌方侧种族计数缺失留弃：「由所有亡灵和恶魔（包括盟友和敌人的）增强 [1:1]」=
    // alliesOfRace/enemiesOfRace × Undead/Daemon 四来源各 ×1（r19 预留口径，K-E 批后全部可表）。
    build: skill(
    createSkulls(6, 0, {
      modifier: {
        mod: { kind: 'multiplier', a: 1 },
        sources: [
          { kind: 'alliesOfRace', race: 'Undead' }, { kind: 'enemiesOfRace', race: 'Undead' },
          { kind: 'alliesOfRace', race: 'Daemon' }, { kind: 'enemiesOfRace', race: 'Daemon' },
        ],
      },
    }),
    ),
  },
  {
    id: 8871,
    desc: '创建 4 颗骷髅头、4 颗末日骷髅头和 4 颗 [1:1]',
    // 【挽救】r19 因 ZH 截断（「和 4 颗 [1:1]」末段缺失）留弃；官方 EN 全句实锤：Create 4 Skulls,
    // 4 Doomskulls, and 4 Uber Doomskulls. If an Enemy is Death Marked, create 1 more of each
    // ——三基段 + 三条件段各 +1（anyEnemyStatus death-mark 全局条件）；尾缀 [1:1] 无可绑定来源
    // 句，按官方步骤不落 modifier。
    build: skill(
    createSkulls(4),
    createSpecialGems({ kind: 'doomSkull' }, 4),
    createSpecialGems({ kind: 'uberDoomSkull' }, 4),
    createSkulls(1, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'death-mark' } }),
    createSpecialGems({ kind: 'doomSkull' }, 1, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'death-mark' } }),
    createSpecialGems({ kind: 'uberDoomSkull' }, 1, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'death-mark' } }),
    ),
  },
  {
    id: 8915,
    desc: '创造 5 颗紫色龙宝石。数量因恶魔敌人和盟友数而增强。 [1:1]',
    // 【挽救】r19 同 8838：「数量因恶魔敌人和盟友数 [1:1]」= Daemon 双来源各 ×1；「紫色龙宝石」=
    // dragonGem spec.color（创建端点支持 color，r14 manaPotionGem 同款）。
    build: skill(
    createSpecialGems({ kind: 'dragonGem', color: BaseColor.Purple }, 5, 0, {
      modifier: {
        mod: { kind: 'multiplier', a: 1 },
        sources: [{ kind: 'alliesOfRace', race: 'Daemon' }, { kind: 'enemiesOfRace', race: 'Daemon' }],
      },
    }),
    ),
  },
  {
    id: 9237,
    desc: '爆破所有天使宝石。对所有敌人造成 [魔法 + 1] 点伤害，数值因不死族和恶魔敌人数而增强。 [x10]',
    // 【挽救】r19 同 8838：「爆破所有天使宝石」= explodeSpecialGems angelGem（波B 已落）；「因不死族
    // 和恶魔敌人数 [x10]」= enemiesOfRace Undead + Daemon 双来源各 ×10。
    build: skill(
    explodeSpecialGems('angelGem'),
    dmg('enemyAll', 1, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 10 },
        sources: [{ kind: 'enemiesOfRace', race: 'Undead' }, { kind: 'enemiesOfRace', race: 'Daemon' }],
      },
    }),
    ),
  },
  {
    id: 9284,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因鬼魂宝石和不死族敌人数而增强。获得一个额外回合。 [1:1]',
    // 【挽救】r19 同 9237：「因鬼魂宝石和不死族敌人数 [1:1]」= boardSpecial ghost + enemiesOfRace
    // Undead 双来源各 ×1。
    build: skill(
    dmg('enemyChosen', 3, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 1 },
        sources: [{ kind: 'boardSpecial', gem: 'ghost' }, { kind: 'enemiesOfRace', race: 'Undead' }],
      },
    }),
    extraTurn(),
    ),
  },
  {
    id: 9369,
    desc: '爆破 5 颗宝石。消除所有敌人正面增益效果，并对他们造成 3- [(魔法 x 1.33) + 2] 点真实伤害。若在夏之岛使用，则伤害翻倍。',
    // 「消除所有敌人正面增益」= dispelPositives（§6 口径，r18/r20 同款助手）；「3-[(魔法 x 1.33)
    // + 2] 真实伤害」= trueDmg rangeSpec（r13 已落）；「若在夏之岛使用则翻倍」= regionPresent
    // （R11 惰性条件，SummerIsle 键；标准战斗恒 false → 原值）。
    build: skill(
    explodeRandomGems(5),
    ...dispelPositives('enemyAll'),
    trueDmg('enemyAll', 2, 1.33, {
      rangeSpec: { min: flat(3), max: scale(2, 1.33) },
      condMult: REGION2('SummerIsle'),
    }),
    ),
  },
  {
    id: 9462,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因敌我双方队伍的龙族军队数而增强。召唤克里斯塔纳斯。 [x5]',
    // 【挽救】r19 同 8838：「因敌我双方队伍的龙族军队数 [x5]」= Dragon 双来源各 ×5；召唤克里斯塔纳斯
    // = Krystenax 6328。
    build: skill(
    dmg('enemyAll', 2, 1, {
      modifier: {
        mod: { kind: 'multiplier', a: 5 },
        sources: [{ kind: 'alliesOfRace', race: 'Dragon' }, { kind: 'enemiesOfRace', race: 'Dragon' }],
      },
    }),
    summonRef('Krystenax', 6328),
    ),
  },
  {
    id: 9471,
    desc: '造成 [魔法 + 8] 点散射伤害，伤害值因友方和敌方恶魔和娜迦的数量而增强。 [x6]',
    // 【挽救】r19 同 8838：「因友方和敌方恶魔和娜迦的数量 [x6]」= Daemon/Naga × 双侧四来源各 ×6。
    build: skill(
    dmg('enemyAll', 8, 1, {
      range: 'all',
      modifier: {
        mod: { kind: 'multiplier', a: 6 },
        sources: [
          { kind: 'alliesOfRace', race: 'Daemon' }, { kind: 'enemiesOfRace', race: 'Daemon' },
          { kind: 'alliesOfRace', race: 'Naga' }, { kind: 'enemiesOfRace', race: 'Naga' },
        ],
      },
    }),
    ),
  },
  {
    id: 9723,
    desc: '驱散一名敌人。对其造成[魔法 + 2]真实伤害，伤害值因屏障宝石数量而增强。然后创造5颗屏障宝石。 [x4]',
    // 【挽救】r19「泛指驱散仍不做」按 r18/r20 已落的 dispelPositives 口径回收：GoW Dispel = 移除
    // 正面增益（§6 词表）——「驱散一名敌人」= enemyChosen 逐正面状态驱散；「其」= lastTarget；
    // 「因屏障宝石数量 [x4]」= boardSpecial barrierGem ×4；创造 5 颗屏障宝石可表。
    build: skill(
    // sa-F2 fix round A: unconditional dispel of each positive status + damage on the chosen enemy (the old
    // conditional dispelPositives left lastTarget unset when the enemy had no positive status -> no damage)
    ...POSITIVE_STATUSES.map(statusId => dispelStatus(statusId, 'enemyChosen')),
    trueDmg('enemyChosen', 2, 1, { modifier: boostPer({ kind: 'boardSpecial', gem: 'barrierGem' }, 4) }),
    createSpecialGems({ kind: 'barrierGem' }, 5),
    ),
  },
];

/**
 * 本批留弃 92 条（按卡点分组见上，共 15 组）。要点：
 * - enemiesOfRace 落地后仍剩的种族侧缺口为「位置/细分」类：被摧毁骷髅细分（7388/7977/8812/9492）、
 *   周边位置计数（8804）、一行三格（7000/9052）。
 * - 条件域四缺口依旧：任意状态（7263/7935）、幸存/else（8374/8550/8248/8573）、跨目标绑定
 *   （7690/8220/9812/9986）、目标相对条件辖无目标段（8276/8534/8925）。
 * - 经济池缺口：敌方黄金四条（8568/8859/8904/9189）等引擎扩池。
 */
export const BATCH_R21: CuratedBatch = { batch: 'R21', spells: SPELLS, skipped: SKIPPED };
