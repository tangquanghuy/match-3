/**
 * 放弃桶回收批 R19（2026-09-18 · 终判收口批）。
 *
 * 工作面 = tmp/remaining_all.json 现存 23 个 unique 未组装 id（= r22 SKIPPED 全量，
 * 8320 已被 batch-p41 收录除外），用当前全词汇（Wave4 + R22 原语 + 波B 宝石）逐条终判。
 * 判读依据 = 官方英文原句（data/raw/gow-2026-09-18 troops.en.json，7xxx 段经
 * referenceName 映射、stats.spell.id 对齐）与官方 SpellSteps（spells.gow.en.json /
 * gow-2026-09-18/spells.en.json RawData；7xxx 旧咒语无步骤数据），原句优先于机翻 ZH。
 *
 * 本批挽救 5 条（此前批次的卡点已被后续引擎/词汇落地解锁）：
 * - 8464：boardGems 'CHOSEN' + except Yellow（R22 来源扩展；EN 原句实锤
 *   「boosted by a chosen Gem Colour (except Yellow)」，官方 CountGems FromTarget x300 = ×3）；
 * - 8566：perCount × boardSpecial lycanthropyGem（狼化宝石波B 落地补齐计数端；
 *   death-mark 在 STATUS_WHITELIST；官方 InflictEffectOnRandomTroops UseCounterForAmount）；
 * - 8902：elementalStar 波B 落地（r19 9046 已在用）+ enemyLastN(2) 首位 = 倒数第二
 *   （r7 8305 官方复核口径）+ 双来源各 ×2（r17 7650）；
 * - 8925：spiritGem 已实现（r19 8920 先例）+ lastTargetRace 全局条件（R22）表达
 *   「若对方是一名骑士」——目标相对条件挂无目标创造段的替代路径；
 * - 9546：createGemsMixAny 色×特殊端点（R22）× decayGem 波B 落地。
 *
 * 仍留弃 18 条（分组见批尾注记）：狼化状态施加不在 STATUS_WHITELIST（本批无权改测试
 * 文件）、敌方黄金池无来源（8568/8859/8904/9189）、转换 count 无 modifier 通道（9545）、
 * 几率上限（10061）、自复活（7542）、冻结前状态快照（7690）、双结构 modifier（7483）、
 * 伤害/灼烧公式无数值（7328/7402）、孤儿尾缀不可绑（7713/7987）、官方步骤与尾缀编码
 * 互斥（8377）、周边位置计数（8804）、创造段无 chosen 驱动（8737）。
 *
 * 保留声明：本文件同时承载 R19 前判已验收的 97 条组装（8715-9987 段，别处无副本），
 * 覆写时逐字保留、条目升序不变；旧 SKIPPED 中已由 r21/r22 回收的条目（8880/9252/9341/
 * 9364/9369/9492/9812/9959）移出本批 SKIPPED，避免覆盖率报告对同一 id 重复记弃。
 */
import type { CuratedBatch } from './index';
import { chooseSkill, skill, devour, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, reduce, steal, cleanse, randomStat, inflict, inflictRandom, createGems, createGemsMixAny, createMix, createSkulls, createSpecialGems, createSpecialGems2, transform, transformToSpecial, convertSpecial, destroyColor, destroyAllGems, destroyRandomCols, destroyChosenCol, destroyRandomGems, explodeRandomGems, explodeRandomSpecialGems, explodeSpecialGems, explodeSkulls, createStorm, shuffleBoard, extraTurn, oneOf, reposition, sacrifice, summonRandom, summonRef, gainGold, gainSouls, gainMaps, scale, CHOSEN, CELL, explodeAt } from '../builders';
import { BaseColor } from '../../types';
import type { Condition, CondMult } from '../effects/secondary';

/** Boss×晋升 3-5 倍（官方 MultiplyForAscensionBoss，r11 口径：倍率取区间下限 3） */
const BOSS_ASC: Condition = {
  kind: 'allOf',
  of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }],
};
const BOSS_ASC3: CondMult = { times: 3, cond: BOSS_ASC };

/** 高塔/防御塔×晋升 3-5 倍（官方 MultiplyForAscensionCastle，r16 口径） */
const CASTLE_ASC: Condition = {
  kind: 'allOf',
  of: [{ kind: 'targetRace', race: 'Castle' }, { kind: 'ascended', min: 3 }],
};
const CASTLE_ASC3: CondMult = { times: 3, cond: CASTLE_ASC };

/** 「所有使用该(选定)颜色法力值的盟友/敌人」动态色条件（r11/r16 口径） */
const CHOSEN_COLOR: Condition = { kind: 'targetColor', color: 'CHOSEN' };

/** 恶魔（Daemon 族）引用池（9756「召唤 1-3 个恶魔」；troops.json troopTypes 全集） */
const DAEMON_REFS = ["AncientHorror","SpiderQueen","Abhorath","Webspinner","Moloch","TheSilentOne","Gorgotha","Kerberos","Cthyryzyx","Terraxis","Psion","Abynissia","Quasit","Hellhound","Succubus","HeraldOfChaos","InfernalKing","Venbarak","War","Plague","Famine","Death","Marilith","Hellcat","Creeper","KruargTheDread","Desdaemona","Warg","Incubus","DarkMonolith","Myzmer","Elemaugrim","CorruptedUrska","BoneDaemon","Hellspawn","Spinnerette","Doomclaw","YaoGuai","Erinyes","Tzathoth","Gargantaur","TomeOfEvil","Hellcackle","Glaycion","Nightmare","SirMordayne","Umbraxis","ThePossessedKing","Sloth","Envy","Greed","Gluttony","Barghast","Pride","Wrath","Lust","SibylOfLust","SoldierOfWrath","WallOfTentacles","Bael","VashDagon","QueenOfSin","Glutmaw","Obsidius","Lamashtu","PossessedUrska","BrokerOfGreed","EnvoyOfPride","MotherOfDarkness","GateOfSouls","Lucifria","Blightwing","Deminaga","TheInfernalMachine","Ironjaw","Tartarus","Netherhound","EldritchGuardian","FellDragonEgg","FellDragon","Nocturnia","HeraldOfWoe","IndolatorOfSloth","ShadeOfKurandara","Kurandara","EnragedKurandara","DaemonGnome","Mambasira","Arcturion","HeraldOfDamnation","Baphomet","TheScourgeOfHonor","DeepGolem","NyarMel","HoundOfYaoGuai","MaidOfEnvy","TheArchduke","Lemure","Fury","Charonas","JudgeOfTheDead","HellclawHunter","HellclawMage","HellclawWarrior","Indrajit","HelgorTheGuardian","FlamingOni","Oneiros","RedAhriman","AbjectOfDespond","Despond","BileBlackheart","AnimusOfEnvy","HornedHag","ConsortOfDarkness","EldritchMinion","Uvhash-Ka","WarMachine","HellclawRager","HeraldOfBlight","HellstoneGate","HeraldOfTorpor","Czernobog","Nabassu","Xenith","Tourmaline","Chalcedony","Petrahulk","StoneMefyt","TheElderDragon","VrawkDaemon","EldritchDisciple","Voidcaller","TheBaneOfMercy","EyeOfArges","InfernalVoyager","TheIronMaiden","TriTerror","DaemonChild","TheVoidDragon","Tempurath","DaemonicSentinel","Hellborer","DarkHerald","Groevanga","FellHydra","Isban","Goethite","SuccubusQueen","Bieska","HoundmasterGor","BlightHound","Astaroth","DaeDrak","MelekTauss","DoomedGuardian","StingBat","TheBaneOfValor","Redreaver","LionOfYaoGuai","Discordia","ImmortalAbaddon","BlightedHusk","BaneOfAmbition","HellclawShadowpriest","Polymetis","DagoNath","FelineOfEnvy","Skarn","MaidenOfPain","HeraldOfWar","Azbeel","OkraNosTheSleeper","Voidjaw","ChampionOfRot","BloodSpore","InfernalTrickster","Seditius","ImmortalZephaar"];

const SKIPPED: { id: number; reason: string }[] = [
  { id: 7328, reason: '「法力灼烧，伤害值因自身魔力值而增强」= Mana Burn 伤害公式原文无数值（7xxx 无步骤数据；drain 全额可表、灼烧伤害量不可），meta.modifier 为空不许挂 modifier（r17-r22 口径维持）；Yellow→Blue 转换本身可表' },
  { id: 7402, reason: '「伤害值等同于一名盟友的攻击力」= 泛指单体盟友（哪一名？）无来源 kind（allyStatSum 为总和、chosenStat 为手动选定目标）——「3 到 8 点法力值」数值区间已可由 R22 rangeSpec 表达，但首句卡死整条（r17-r22 口径维持）' },
  { id: 7483, reason: '「伤害值等同于自身的攻击力，并因棕色敌军数量而增强 [x10]」= 伤害基数=攻击力（×1）与来源计数（×10）双结构，modifier 单 mod 无法同表（r21/r22 编码歧义不猜口径维持）' },
  { id: 7542, reason: '「凤凰涅槃浴火重生」= 自复活无引擎机制（r18-r22 口径维持）；散射 + selfStat hp [1:1] 本身可表' },
  { id: 7690, reason: '「如果该敌人已被冻结，则再造成 5 点伤害」= 条件须读施加冻结**之前**的状态快照，段序执行后 targetStatus 恒真（时序绑定无原语，r17-r22 口径维持）；「冻结其上下左右的敌人」= enemyAboveTarget/BelowTarget 可表但被条件句卡死' },
  { id: 7713, reason: '「窃取攻击力并给予第一位盟友」重定向本可用 lastReduce+attack(allyFront) 表达，但孤儿尾缀 [20:1] 无来源子句、7xxx 无步骤数据可考；读作混合配比亦不可表（mixAny 均匀掷选无权重通道）——不可绑不硬凑（r14#12）' },
  { id: 7987, reason: '「窃取护甲转换成随机技能值给予第一位盟友」= lastReduce+randomStat 重定向路径可表，但孤儿尾缀 [100:1] 无来源子句、7xxx 无步骤数据可考——不可绑不硬凑（r17-r22 口径维持）' },
  { id: 8377, reason: '官方步骤（CountMagic 100 → CountMaxWithMagic [M+1] → IncreaseRandom @AllAllies）与 desc 尾缀 [100:1] 编码互斥（Amount 100 按尾缀编码应映射 [1:1]），无法对号（r21/r22 口径维持）' },
  { id: 8553, reason: '「陷入狼化状态」：引擎已实现 lycanthropy 状态本体（WOLF_STATUS_IDS/狼化宝石摧毁触发），但组装侧 STATUS_WHITELIST 未扩容且本批无权改测试文件——inflict 段必被白名单校验拒绝；狼化宝石创造/紫色计数额外回合本身可表' },
  { id: 8567, reason: '「若板面上有狼化宝石」= 特殊宝石在场条件不在条件域（boardAtLeast 只计基色/骷髅）+ 狼化状态施加同 STATUS_WHITELIST 缺口（r20-r22 口径维持）' },
  { id: 8568, reason: '「窃取敌人黄金」= 敌方黄金池无来源（economy 为共用池，TakeEnemyGold/CountEnemyGold 无对应 source kind），尾缀 [100:1] 无处绑定（r19-r22 口径维持）；耗蓝 8 点+冻结本身可表' },
  { id: 8737, reason: '「选择一个盟友，创造其法力颜色宝石」= 全咒语仅创造段、无任何 chosen 段驱动 TargetChooser（prototypeChosenTargetMode 只认带 target 字段的段），CHOSEN_TARGET 无回退值整段跳过（r19/r21/r22 口径维持）' },
  { id: 8804, reason: '「宝石附近或下方每有一颗绿色宝石」= 以创造宝石格为锚的周边位置计数（官方 BoardTarget SurroundingGems），boardGems 为全盘口径无位置来源（r19-r22 口径维持）；石像鬼宝石创造/额外回合本身可表' },
  { id: 8859, reason: '「窃取黄金」&& 子句 = 敌方黄金池无来源（首句即卡，按序编译整条不可拆），尾缀 [100:1] 来源=CountEnemyGold（敌方黄金计数）无 source kind（r19-r22 口径维持）；随机技能值窃取本身可表' },
  { id: 8904, reason: '「数值因窃取黄金数而增强 [50:1]」= 本次窃取黄金额无来源 kind（battleGold 为共用池总额、非本次窃取额）（r19-r22 口径维持）' },
  { id: 9189, reason: '「窃取一名敌人所有黄金数」= 敌方黄金池无来源，尾缀 [x10] 来源=敌方黄金计数无 source kind（r19-r22 口径维持）；伤害+出血段本身可表' },
  { id: 9545, reason: '「诅咒敌人数量增加」= 转换颗数不可挂 modifier（transform count 仅静态缩放，gems.ts 无该通道；官方 ConvertGems UseCounterForAmount 无论替换/叠加基数均无通道）；紫龙宝石（dragonGem spec.color 波B）转换+诅咒/死亡标记施加本身可表（r21/r22 宝石卡点已解锁，计数卡点维持）' },
  { id: 10061, reason: '「击杀几率受其护甲值提升（最高可达 30%）」= 几率上限无法表达（chanceBoost 线性叠加后夹取 [0,1]，无 cap 原语）+ ZH 30% 与官方 CountMax 20 互相矛盾（r19/r21/r22 口径维持）；伤害+拉到后方本身可表' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8464,
    desc: '造成 [魔法 + 20] 点散射伤害，伤害值因选定的颜色（黄色除外）而增强。再创造 10 颗黄色宝石，并移除所有选定颜色的宝石。 [x3]',
    // r22 卡点回收：EN 原句实锤「boosted by a chosen Gem Colour (except Yellow)」（r22 误读为
    // ZH 独有）→ boardGems 'CHOSEN' + except Yellow（R22 来源扩展，注明「8464 口径备用」即本条）；
    // [x3] = 官方 CountGems FromTarget x300；裸散射 = 全体散射（官方 ScatterDamage@AllEnemies）；
    // 「移除所有选定颜色的宝石」= RemoveColor FromTarget → destroyColor(CHOSEN)。玩家若选黄，
    // 加成计 0（官方选色器排除黄，引擎超集口径并注明）。
    build: skill(
      dmg('enemyAll', 20, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: 'CHOSEN', except: BaseColor.Yellow } },
      }),
      createGems(BaseColor.Yellow, 10),
      destroyColor(CHOSEN),
    ),
  },
  {
    id: 8566,
    desc: '窃取一名敌人 [魔法 + 2] 点生命值。板面上每有一颗狼化宝石，则使一名随机敌人陷入死亡标记状态。 [1:1]',
    // r22 卡点回收：狼化宝石 lycanthropyGem 波B 落地 → boardSpecial 计数端补齐；
    // 「每有一颗狼化宝石则使一名随机敌人死亡标记」= perCount（官方 InflictEffectOnRandomTroops
    // UseCounterForAmount @AllEnemies，9252/9287 口径；[1:1] = CountGems Lycanthropy x100 编码）；
    // Native StealLife uses the damage/drain path, not a direct hp stat reduction.
    // 狼化「状态」施加仍不在白名单（8553/8567 留弃），本条只涉宝石计数、无碍。
    build: skill(
      dmg('enemyChosen', 2, 1, { drain: true }),
      inflict('death-mark', 'enemyAll', {
        perCount: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
    ),
  },
  {
    id: 8715,
    desc: '摧毁所有绿色宝石。创造蓝色宝石，数量等同于被摧毁的宝石数。有个别 30% 的几率吞噬 2 名随机敌人。 [1:1]',
    // 蓝宝石数量 = destroyedGems Green ×1（官方 UseCounterForAmount CreateGems）；「个别 30%」=
    // 两次独立掷签（官方 Consume + Consume RandomPrefNotPrevEnemy，8063 独立随机口径）
    build: skill(
      destroyColor(BaseColor.Green),
      createGems(BaseColor.Blue, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } }),
      // sa-R5 L1-7155: native Consume@RandomEnemy 30% + Consume@RandomPrefNotPrevEnemy 30% (real Devours, R007-3).
      devour('enemyRandom', { chance: 0.3 }),
      devour('enemyRandomPrefNotPrev', { chance: 0.3 }),
    ),
  },
  {
    id: 8723,
    desc: '造成 [魔法 + 6] 点散射伤害，伤害值因荆棘森林盟友数而加强。再使首位敌人陷入沉默效果。 [x6]',
    // 王国盟友计数首落地：alliesOfKingdom（Forest of Thorns 3015 = 本地「荆棘森林」）；裸散射 = 全体散射
    build: skill(
      dmg('enemyAll', 6, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: 3015 } },
      }),
      inflict('silence', 'enemyFront'),
    ),
  },
  {
    id: 8732,
    desc: '二选一：给予100 金币，或吞噬一名随机敌人，或消除所有敌人的所有护甲，或对一名随机敌人造成[魔法 + 2] 伤害，或获得[魔法 + 2]点生命，生命值因我的金币而增强（如适用）。 [2:1]',
    // 五选一 = oneOf（§9.3）；「窃取金币」= gainGold 元经济口径；官方步骤 Damage/IncreaseHealth
    // 双挂 UseCounterForAmount（「如适用」）→ 两数值段同挂 ratio 2:1 battleGold（CountMyGold x50）
    build: skill(
      oneOf(
        gainGold(100),
        // sa-R5 L1-7157: native Consume@RandomEnemy = a real Devour (caster gains stats), not a plain execute.
        devour('enemyRandom', { chance: 1 }),
        reduce('enemyAll', 'armor', 0, 0, { drainAll: true }),
        dmg('enemyRandom', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleGold' } } }),
        heal('allySelf', 2, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleGold' } } }),
      ),
    ),
  },
  {
    id: 8749,
    desc: '爆破 3 颗宝石，数量因自身黄金数而增强。再获得 [魔法 + 5] 黄金。 [10:1]',
    // 爆破数量挂 battleGold（randomGems count 走 evaluateWithModifier）；[10:1] = CountMyGold x10
    build: skill(
      explodeRandomGems(3, 0, 'all', undefined, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } }),
      gainGold(5, 1),
    ),
  },
  {
    id: 8754,
    desc: '创造 9 颗绿色宝石，并给予一名盟友法印效果。',
    // 法印 = 附魔 enchanted（官方 CauseEnchanted，R10 落地；ZH 法印/附魔同义，9015 同）
    build: skill(
      createGems(BaseColor.Green, 9),
      inflict('enchanted', 'allyChosen'),
    ),
  },
  {
    id: 8800,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。爆破 3 颗宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      explodeRandomGems(3, 0),
    ),
  },
  {
    id: 8801,
    desc: '将 4 颗石块转换成善或恶石像鬼宝石。再爆破一颗宝石。',
    // r14 卡点回收：convertSpecial（Wave4 特殊↔特殊）+ tiers [1,2] 善恶整段掷签（官方 Randomize AB-CD）
    build: skill(
      convertSpecial('stoneBlock', 'gargoyleGem', { count: 4, tiers: [1, 2] }),
      explodeAt(CELL),
    ),
  },
  {
    id: 8817,
    desc: '摧毁所有黄色宝石。每摧毁一颗黄色宝石，则有 10% 的几率吞噬一名敌人。 [1:1]',
    // 逐摧毁计数掷签：chance 0 + chanceBoost 10×摧毁黄宝石数/100（官方 ConsumeConditional
    // UseCounterForAmount x10 实锤，r4 「几率=chance+boost」口径）
    build: skill(
      // sa-R5 L1-7222: native CountGems Yellow 100 -> ConsumeConditional Amount 10 + counter = 10% + 1% per Yellow
      // destroyed (English "10% chance ... boosted by Yellow Gems destroyed [1:1]"); a real Devour, not execute.
      destroyColor(BaseColor.Yellow),
      devour('enemyChosen', { chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 8821,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，并赋予他们一个随机正面增益状态效果。',
    // 「随机正面增益」= inflictRandom pool:'positive'（官方 RandomPositiveStatusEffect）
    build: skill(
      heal('allyAll', 1, 1),
      inflictRandom('allyAll', { pool: 'positive' }),
    ),
  },
  {
    id: 8861,
    desc: '移除所有宝石。获得 10 黄金。板面上每有一颗绿色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    // 「移除所有宝石」= destroyAllGems（R013-5：含骷髅及末日骷髅等变种；remove 模式由 gowRemoveRules 按原生 RemoveGems 切换，R010）
    build: skill(
      // sa-R7: native CountGems Green 700 is step 0 -> chance counted on the board before the removal
      // (was counted on the refilled board after it; R001).
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
      destroyAllGems(),
      gainGold(10),
    ),
  },
  {
    id: 8865,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。耗掉对方 5 点法力值。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      reduce('lastTarget', 'magic', 5, 0),
    ),
  },
  {
    id: 8890,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。有 20% 的几率吞噬对方。若敌人身亡，则创建 12 颗红色龙宝石。',
    // 红色龙宝石 = dragonGem spec.color（六色族）；「敌人身亡」= ifTargetDied（AddForKill）
    // L1-consume-first (R001): native Consume(20%) -> Damage -> CreateGems AddForKill; Consume is a
    // real Devour (caster gains Attack/Armor/Life), not a plain execute.
    build: skill(
      devour('enemyChosen', { chance: 0.2 }),
      dmg('lastTarget', 3, 1),
      createSpecialGems({ kind: 'dragonGem', color: BaseColor.Red }, 12, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8891,
    desc: '对末位敌人造成 [魔法 + 3] 点伤害，有 20% 的几率吞噬对方。再使自身下潜。',
    // L1-consume-first (R001): native Consume(20%) LastEnemy -> Damage LastEnemy -> CauseSubmerged Self.
    build: skill(
      devour('enemyLast', { chance: 0.2 }),
      dmg('lastTarget', 3, 1),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 8895,
    desc: '赋予所有盟友一个随机正面状态效果，并使其一项随机属性获得 [魔法 + 1] 点。获得 50 黄金、20 个灵魂和 2 张藏宝图。',
    // ZH 漏译「并获得 2 张藏宝图」——EN/ST（GiveTreasureMaps x2）补齐（8930 EN 优先口径）
    // sa-F1 (R001): native RandomPositiveStatusEffect@AllAllies first, then IncreaseRandom@AllAllies [Magic + 1]
    // (the whole value on one random Skill per ally, oneSkill), then gold / souls / maps.
    build: skill(
      inflictRandom('allyAll', { pool: 'positive' }),
      randomStat('allyAll', 1, 1, { oneSkill: true }),
      gainGold(50),
      gainSouls(20),
      gainMaps(2),
    ),
  },
  {
    id: 8902,
    desc: '对倒数第二位敌人造成 [魔法 + 4] 点严重溅射伤害，伤害值因棕色宝石数和盟友数而增强。将其拉到首位。再创造 3 颗元素星。 [x2]',
    // r22 卡点回收：元素星 elementalStar 波B 已落地（r19 9046 同款创造）；「倒数第二位敌人」
    // （官方 SecondLastEnemy）目标词表无精确词汇 → enemyLastN(2) 首个 = 倒数第二（r7 8305
    // 官方复核口径；splash 池主目标 = targets[0]，alive.slice(-n) 保队序）；「棕色宝石数和
    // 盟友数」双来源各 ×2（官方 CountGems Brown/CountArmyColor x200，r17 7650 口径）；
    // 「将其拉到首位」= reposition lastTarget 跨段绑定（§12.3，官方 TroopOrderFront）。
    build: skill(
      // sa-R2 L4b-7277: native SecondLastEnemy is one main target (enemyLastN 2 hit both as mains); CountArmyColor Data 5 = Brown allies.
      dmgSplash('enemySecondLast', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'boardGems', color: BaseColor.Brown }, { kind: 'alliesOfColor', color: BaseColor.Brown }],
        },
      }),
      reposition('lastTarget', 'front'),
      createSpecialGems({ kind: 'elementalStar' }, 3),
    ),
  },
  {
    id: 8920,
    desc: '创造 8 颗黄色宝石和 8 颗灵力宝石。获得法印效果。',
    // 灵力宝石 = spiritGem（CreateGems Spirit 未标色；项目在该造石入口暂定紫色，非原版证据）
    build: skill(
      createGems(BaseColor.Yellow, 8),
      createSpecialGems({ kind: 'spiritGem', color: BaseColor.Purple }, 8),
      inflict('enchanted', 'allySelf'),
    ),
  },
  {
    id: 8922,
    desc: '给予所有红色盟友 2 点魔力值，数值因灵力宝石数而增强。再赋予他们法印效果。 [1:1]',
    // 「所有红色盟友」= allyAll + ifCond targetColor（r16 7672 动态色口径）；[1:1] = CountGems Spirit x100
    build: skill(
      magic('allyAll', 2, 0, {
        ifCond: { kind: 'targetColor', color: BaseColor.Red },
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardSpecial', gem: 'spiritGem' } },
      }),
      inflict('enchanted', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 8923,
    desc: '赋予所有盟友四分之一的法力值，并净化他们。',
    // EN/ST = AllAlliesButNotSelf → allyOthers；「四分之一」= mana fraction（Wave4/R12）
    build: skill(
      mana('allyOthers', 0, 0, { fraction: 0.25 }),
      cleanse('allyOthers'),
    ),
  },
  {
    id: 8925,
    desc: '赋予一名盟友屏障效果，并给予其半数法力值。若对方是一名骑士，则创造 3 颗灵力宝石。',
    // r22 卡点回收：灵力宝石 spiritGem 已实现（r19 8920 同款无色创造，官方 CreateGems
    // Spirit StatusAmount 3）；「若对方是一名骑士」= lastTargetRace Knight（R22 全局条件
    // 读跨段追踪主目标——屏障/法力段的 allyChosen 目标；目标相对条件挂无目标创造段会
    // 整段跳过，lastTarget 族为官方 AddForKnight 的正解路径）；
    // 「半数法力值」= GenerateHalfMana → mana halve（按目标 manaCost 现算，§9.6）。
    build: skill(
      inflict('barrier', 'allyChosen'),
      mana('allyChosen', 0, 0, { halve: true }),
      createSpecialGems({ kind: 'spiritGem', color: BaseColor.Purple }, 3, 0, { ifCond: { kind: 'lastTargetRace', race: 'Knight' } }),
    ),
  },
  {
    id: 8936,
    desc: '摧毁所有紫色宝石。每摧毁一颗宝石获得 2 黄金。 [x2]',
    // 金币 = 2 × 本次摧毁宝石数（destroyedGems 无色 = 任意，官方 UseCounterForAmount GiveGold）
    build: skill(
      destroyColor(BaseColor.Purple),
      gainGold(0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 8937,
    desc: '给予所有盟友 [魔法 + 1] 点生命值，再创建 9 颗黄色宝石，数量因获得法印效果的盟友数而增强。 [1:1]',
    build: skill(
      heal('allyAll', 1, 1),
      createGems(BaseColor.Yellow, 9, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'allyStatusCount', statusId: 'enchanted' } },
      }),
    ),
  },
  {
    id: 8938,
    desc: '将蓝色宝石转换成绿色，紫色宝石转换成黄色。给予所有盟友 1-3 个随机正面增益状态效果。',
    // 「1-3 个」= 官方三步 RandomPositiveStatusEffect（100%/50%/25% 实锤）逐次独立掷签
    build: skill(
      transform(BaseColor.Blue, BaseColor.Green),
      transform(BaseColor.Purple, BaseColor.Yellow),
      inflictRandom('allyAll', { pool: 'positive' }),
      inflictRandom('allyAll', { pool: 'positive', chance: 0.5 }),
      inflictRandom('allyAll', { pool: 'positive', chance: 0.25 }),
    ),
  },
  {
    id: 8979,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因兽人盟友数而增强。若敌人陷入死亡标记状态，则有 35% 的几率吞噬对方。 [x4]',
    // 官方 ConsumeConditional AddForDeathMark 35 → 即杀挂 ifCond targetStatus + chance（w01 7380 口径）
    // sa-F1 (R001): native s1 ConsumeConditional (35% if Death Marked) runs BEFORE s2 Damage, and it is a Devour
    // (devourer gains the target's stats), not a plain kill.
    build: skill(
      devour('enemyChosen', { chance: 0.35, ifCond: { kind: 'targetStatus', statusId: 'death-mark' } }),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Orc' } } }),
    ),
  },
  {
    id: 8985,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因狂野皇廷盟友数而增强。有 40% 的几率召唤另一只妖犬。 [x4]',
    // 召唤自身 = FeyHound 7357。
    // P-R5-faction-kingdom: native 0:CountArmyKingdom@AllAllies 3048 (Wild Court) = raw KingdomId 3048 roster only
    // (TheWendigo, FeyHound, WildKnight, Puka, RedCap), not every ally of the zh parent kingdom 卜筮之原 (Adana);
    // counted by zh troop name (alliesNamed), caster included (AllAllies).
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesNamed', name: ['溫迪戈', '妖犬', '狂野骑士', '普卡', '红帽'], atCastStart: true } },
      }),
      summonRef('FeyHound', 7357, { chance: 0.4 }),
    ),
  },
  {
    id: 9005,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身的黄金数而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 10 黄金和一个额外回合。 [1:1]',
    // [1:1] = CountMyGold x100（100/100 编码）→ ratio 1:1 battleGold；高塔 = CASTLE_ASC3
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'battleGold' } },
        condMult: CASTLE_ASC3,
      }),
      gainGold(10),
      extraTurn(),
    ),
  },
  {
    id: 9011,
    desc: '将所有蓝色宝石转换成骷髅头。每转换一颗宝石则获得 1 个灵魂。 [1:1]',
    // 灵魂 = 1 × 本次转化宝石数（transformedGems 无色 = 全部；economy 段支持 modifier）
    build: skill(
      transform(BaseColor.Blue, 'SKULL'),
      gainSouls(0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'transformedGems' } } }),
    ),
  },
  {
    id: 9015,
    desc: '赋予所有盟友屏障和法印状态效果。获得 [(魔法 x 2) + 1] 点生命值。',
    build: skill(
      inflict('barrier', 'allyAll'),
      inflict('enchanted', 'allyAll'),
      heal('allySelf', 1, 2),
    ),
  },
  {
    id: 9038,
    desc: '杀掉一名敌人。再创造 6 颗诅咒宝石，6 颗黄色巨人宝石和 6 颗妖火宝石。',
    // 「杀掉」= execute 即杀（官方 LethalDamage）；巨人宝石 = giantGem spec.color
    build: skill(
      dmg('enemyChosen', 0, 0, { execute: true }),
      createSpecialGems({ kind: 'curseGem' }, 6),
      createSpecialGems({ kind: 'giantGem', color: BaseColor.Yellow }, 6),
      createSpecialGems({ kind: 'faerieFireGem' }, 6),
    ),
  },
  {
    id: 9046,
    desc: '对一名敌人造成 [魔法 + 4] 伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 3 颗元素星。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      createSpecialGems({ kind: 'elementalStar' }, 3),
    ),
  },
  {
    id: 9047,
    desc: '对一名敌人造成 [魔法 + 2] 伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 8 颗红宝石。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      createGems(BaseColor.Red, 8),
    ),
  },
  {
    id: 9048,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。爆破 3 颗蓝色宝石。',
    // 「爆破 3 颗蓝色宝石」= 定量颜色爆破（官方 ExplodeColor Blue x3）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      explodeRandomGems(3, 0, 'color', BaseColor.Blue),
    ),
  },
  {
    id: 9060,
    desc: '摧毁一列。每摧毁一颗蓝色宝石，则使一名敌人陷入恐怖状态。获得屏障效果。 [1:1]',
    // 官方 BoardTarget Column = 玩家选定列 → destroyChosenCol；[1:1] = perDestroyed 驱动比率序列化
    //（r15/r17 特例口径）；恐怖 = terror（波A 状态本体）
    build: skill(
      destroyChosenCol(),
      inflict('terror', 'enemyAll', { perDestroyed: { color: BaseColor.Blue } }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9066,
    desc: '创造 9 颗骷髅头，或创造 7 颗末日骷髅头，或创造 5 颗超级末日骷髅头，或爆破所有骷髅头，或吞噬一名随机敌人，或使一名随机敌人陷入死亡标记状态。',
    // 六选一 = oneOf（官方六变体步骤顺序排列，8492 口径）
    build: skill(
      oneOf(
        createSkulls(9),
        createSpecialGems({ kind: 'doomSkull' }, 7),
        createSpecialGems({ kind: 'uberDoomSkull' }, 5),
        explodeSkulls(),
        // sa-R5 L1-7417: native Consume@RandomEnemy = a real Devour, not a plain execute.
        devour('enemyRandom', { chance: 1 }),
        inflict('death-mark', 'enemyRandom'),
      ),
    ),
  },
  {
    id: 9068,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 6 颗紫色宝石和 6 颗骷髅头。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      createGems(BaseColor.Purple, 6),
      createSkulls(6),
    ),
  },
  {
    id: 9117,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因骷髅头数量而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x2]',
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } },
        condMult: CASTLE_ASC3,
      }),
    ),
  },
  {
    id: 9118,
    desc: '窃取一名敌人 6 点法力值。每耗掉一点法力值，则有 5% 的几率吞噬对方。 [x5]',
    // 几率 = 5% × 实耗法力（chance 0 + chanceBoost drainedMana，drainedMana 辖窃取法力族 §1）
    build: skill(
      // sa-R5 L1-9118: native ConsumeConditional = Devour (caster gains stats), not a plain execute.
      steal('enemyChosen', 'mana', 'mana', 6, 0),
      devour('lastTarget', { chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'drainedMana' } } }),
    ),
  },
  {
    id: 9120,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。摧毁 7 颗随机宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      destroyRandomGems(7, 0, 'color'),
    ),
  },
  {
    id: 9125,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因冻结宝石数而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x3]',
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'freezeGem' } },
        condMult: CASTLE_ASC3,
      }),
    ),
  },
  {
    id: 9128,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。爆破 3 颗织网宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      explodeRandomSpecialGems('web', 3),
    ),
  },
  {
    id: 9177,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。摧毁一列。',
    // 「摧毁一列」无限定词 = 随机一列（r17 7433「摧毁 1 行」口径）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      destroyRandomCols(1),
    ),
  },
  {
    id: 9178,
    desc: '创建 12 颗混合红色和紫色的宝石。赋予所有红色盟友法印效果，并燃烧所有红色敌人。',
    // 「所有红色盟友/敌人」= ifCond targetColor（官方 AllyColor/EnemyColor Data=Red）
    build: skill(
      createMix([BaseColor.Red, BaseColor.Purple], 12),
      inflict('enchanted', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      inflict('burning', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 9180,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因灵魂数而增强。有 50% 几率对其下方所有敌人造成同样的伤害。 [3:1]',
    // [3:1] = CountMySouls x34 编码 → battleSouls；「下方所有敌人」= enemyBelowTarget（R13，r14 9371 同款）
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } } }),
      dmg('enemyBelowTarget', 3, 1, {
        chance: 0.5,
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } },
      }),
    ),
  },
  {
    id: 9186,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因绿色宝石数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [2:1]',
    // [2:1] = CountGems x50（100/50 编码）→ ratio 2:1 boardGems Green
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Green } },
        condMult: BOSS_ASC3,
      }),
    ),
  },
  {
    id: 9191,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 5 点 攻击力、生命值和护甲值。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      attack('allySelf', 5, 0),
      heal('allySelf', 5, 0),
      armor('allySelf', 5, 0),
    ),
  },
  {
    id: 9194,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 5 颗黄色闪电宝石。',
    // 黄色闪电宝石 = lightningCol（词表：蓝闪电=行 / 黄闪电=列）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      createSpecialGems({ kind: 'lightningCol' }, 5),
    ),
  },
  {
    id: 9198,
    desc: '打乱板面。创造 5 颗闪电宝石并获得一个额外回合。',
    // 「闪电宝石」= 官方 CreateGems2Colors LightningBlue/LightningYellow → 双 kind 逐颗掷选（r17 9908 口径）
    build: skill(
      shuffleBoard(),
      createSpecialGems2([{ kind: 'lightningRow' }, { kind: 'lightningCol' }], 5),
      extraTurn(),
    ),
  },
  {
    id: 9199,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。使 2 名盟友下潜。',
    // 官方 RandomAlly + RandomPrefNotPrevAlly → allyRandomPrefNotPrevN n:2（R007-3）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      inflict('submerged', 'allyRandomPrefNotPrevN', { n: 2 }),
    ),
  },
  {
    id: 9217,
    desc: '使一名敌人陷入恐怖和疾病状态，再对他造成 [魔法 + 2] 点伤害。',
    build: skill(
      inflict('terror', 'enemyChosen'),
      inflict('disease', 'enemyChosen'),
      dmg('lastTarget', 2, 1),
    ),
  },
  {
    id: 9218,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 6 点攻击力和生命值。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      attack('allySelf', 6, 0),
      heal('allySelf', 6, 0),
    ),
  },
  {
    id: 9243,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。为所有盟友提供 8 点护甲值。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      armor('allyAll', 8, 0),
    ),
  },
  {
    id: 9245,
    desc: '爆破 1 颗宝石，数量因狮心帝国盟友数而增强。 [1:1]',
    // 王国计数首落地：alliesOfKingdom（Leonis Empire 3025 = 本地「狮心帝国」）；[1:1] = CountArmyKingdom x100
    build: skill(
      explodeRandomGems(1, 0, 'all', undefined, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'alliesOfKingdom', kingdom: 3025 } },
      }),
    ),
  },
  {
    id: 9246,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因所有盟友护甲值数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [4:1]',
    // [4:1] = CountArmor AllAllies x25（100/25 编码）→ ratio 4:1 allyStatSum armor
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 4, b: 1 }, source: { kind: 'allyStatSum', stat: 'armor' } },
        condMult: BOSS_ASC3,
      }),
    ),
  },
  {
    id: 9249,
    desc: '获得 [魔法 + 1] 点生命值和护甲值，数值因皓彩森林盟友和陷入妖火状态敌人数而增强。获得屏障效果。 [x4]',
    // 双来源各 ×4（r17 7650 口径）：alliesOfKingdom（Bright Forest 3002 = 本地「皓彩森林」）
    // + enemyStatusCount faerie-fire；两增益段同挂（「数值因…」辖同类段 §1）
    build: skill(
      heal('allySelf', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'alliesOfKingdom', kingdom: 3002 }, { kind: 'enemyStatusCount', statusId: 'faerie-fire' }],
        },
      }),
      armor('allySelf', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'alliesOfKingdom', kingdom: 3002 }, { kind: 'enemyStatusCount', statusId: 'faerie-fire' }],
        },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9251,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 1-3 颗 x3 通配宝石。',
    // 「1-3 颗 x3 通配」= 官方 CreateGemsRange WildCard3 → countRange + tier 3
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 0, 0, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 9254,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因天使宝石数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 2 颗天使宝石。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'angelGem' } },
        condMult: BOSS_ASC3,
      }),
      createSpecialGems({ kind: 'angelGem' }, 2),
    ),
  },
  {
    id: 9259,
    desc: '获得 [魔法 + 1] 点护甲值，数量因黄金数而增强。获得 10 黄金。 [2:1]',
    // [2:1] = CountMyGold x50（100/50 编码）→ ratio 2:1 battleGold
    build: skill(
      armor('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleGold' } } }),
      gainGold(10),
    ),
  },
  {
    id: 9281,
    desc: '将一名敌人拉到首位，并对其造成 [(魔法 x 0.625) + 2] – [(魔法 x 1.25) + 4]- {2} 点伤害，伤害值因自身的护甲值而增强。有 15% 的几率自毁。  [2:1]',
    // 区间伤害（§12.2 rangeSpec，damage.ts 双界走 evaluateWithModifier）；
    // L7-7517（sa-L76）：官方中文「- {2}」是本地化占位残留，EN/原生 RandomHighDamage FromTarget
    // 只打被拉到首位的那名敌人——不分摊（原 split: 2 删除）。
    // [2:1] = CountArmor x50 → selfStat armor；「自毁」= sacrifice allySelf chance（§11 追加）
    build: skill(
      reposition('enemyChosen', 'front'),
      dmg('enemyChosen', 0, 0, {
        rangeSpec: { min: scale(2, 0.625), max: scale(4, 1.25) },
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
      sacrifice('allySelf', { chance: 0.15 }),
    ),
  },
  {
    id: 9282,
    desc: '窃取首 2 位敌人 [(魔法 x 1.25) + 2] 点生命值，数量因鬼魂宝石数量而增强。再使他们陷入诅咒和冻结状态。 [x8]',
    // 「窃取生命」= steal hp→hp（7302 口径）；[x8] = CountGems Ghost x800 → boardSpecial ghost
    build: skill(
      // 原生序 CauseCursed@FirstTwo → CauseFrozen@FirstTwo → StealLife@FirstTwo（R001：诅咒先移除屏障等正面状态）
      inflict('curse', 'enemyFirstN', { n: 2 }),
      inflict('frozen', 'enemyFirstN', { n: 2 }),
      dmg('enemyFirstN', 2, 1.25, {
        n: 2, drain: true,
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'ghost' } },
      }),
    ),
  },
  {
    id: 9286,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因鬼魂宝石数而增强。获得一个额外回合。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x6]',
    // ZH「获得一个额外回合」为机翻噪声——EN/ST 原句无此子句（7652 口径，不组装）；
    // [x6] = CountGems Ghost x600 → boardSpecial ghost
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'ghost' } },
        condMult: CASTLE_ASC3,
      }),
    ),
  },
  {
    id: 9289,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。召唤一名雾云雀。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      summonRef('Mistlark', 7531),
    ),
  },
  {
    id: 9293,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。将所有骷髅头转换成末日骷髅头。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      transformToSpecial('SKULL', 'doomSkull'),
    ),
  },
  {
    id: 9296,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。将 3 颗紫色宝石转换成冻结宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: BOSS_ASC3 }),
      transformToSpecial(BaseColor.Purple, 'freezeGem', { count: 3 }),
    ),
  },
  {
    id: 9316,
    desc: '对末位敌人造成 [魔法 + 3] 点伤害，伤害值因黄金数而增强。再获得一个额外回合，或获得 20 黄金。 [2:1]',
    // [2:1] = CountMyGold x50 → battleGold；「或」= oneOf（官方两变体步骤）
    build: skill(
      dmg('enemyLast', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleGold' } } }),
      oneOf(
        extraTurn(),
        gainGold(20),
      ),
    ),
  },
  {
    id: 9336,
    desc: '对所有敌人造成 [魔法 + 2] 点真实伤害，伤害值因缠绕宝石数而增强。再使所有敌人陷入疾病状态。 [x3]',
    // 缠绕宝石 = boardSpecial entangleGem（波A）；[x3] = CountGems x300
    build: skill(
      trueDmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'entangleGem' } },
      }),
      inflict('disease', 'enemyAll'),
    ),
  },
  {
    id: 9338,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得屏障效果。',
    // sa-C r3: English/native = Boss (MultiplyForAscensionBoss), not Tower; waived per R000
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9342,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害，伤害值因自身藏宝图数而增强。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。再获得一个藏宝图。 [x4]',
    // [x4] = CountMyMaps x400 → battleMaps（§11.4 来源落地）；「高塔」= CASTLE_ASC3
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'battleMaps' } },
        condMult: CASTLE_ASC3,
      }),
      gainMaps(1),
    ),
  },
  {
    id: 9345,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。每有 2 颗紫色宝石，则消除对方 1 点攻击力。 [2:1]',
    // 纯计数驱动削减：base 0 + ratio 2:1 boardGems Purple（debuff 段支持 modifier；官方
    // UseCounterForAmount DecreaseAttack 无基数）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      reduce('lastTarget', 'attack', 0, 0, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 9463,
    desc: '获得 [魔法 + 1] 黄金。给予所有其他盟友 25% 法力值。',
    // 「25% 法力值」= mana fraction 0.25（官方 GenerateQuarterMana）
    build: skill(
      gainGold(1, 1),
      mana('allyOthers', 0, 0, { fraction: 0.25 }),
    ),
  },
  {
    id: 9464,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。摧毁 8 颗宝石。',
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      destroyRandomGems(8, 0, 'color'),
    ),
  },
  {
    id: 9474,
    desc: '获得 [魔法 + 2] 护甲，由恶魔传送门宝石增强。然后创建 2 个恶魔传送门宝石，并将所有黄色宝石转换为灵魂宝石。 [x6]',
    // 灵魂宝石 ZH 机翻，EN/ST = Spirit Gems → spiritGem；[x6] = CountGems DaemonicPortal x600
    build: skill(
      armor('allySelf', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardSpecial', gem: 'daemonicPortalGem' } },
      }),
      // Native order (R001): ConvertGems 100 Yellow>Spirit before CreateGems 2 DaemonicPortal.
      transformToSpecial(BaseColor.Yellow, 'spiritGem'),
      createSpecialGems({ kind: 'daemonicPortalGem' }, 2),
    ),
  },
  {
    id: 9476,
    desc: '对敌人造成 [魔法 + 4] 点伤害。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果敌人死亡，则将其 1 颗法力色宝石转换为恶魔传送门宝石。',
    // r16 卡点回收：「该敌 1 颗法力色宝石」= transformToSpecial('LAST_TARGET', …, {count:1})
    //（§11 补充跨段取敌色，9745/8933 先例）；「敌人死亡」= ifTargetDied（AddForKill 实锤）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      transformToSpecial('LAST_TARGET', 'daemonicPortalGem', { count: 1, ifTargetDied: true }),
    ),
  },
  {
    id: 9546,
    desc: '创造 10 颗棕色和腐烂宝石的混合体。将第一个敌人击退。',
    // r19 卡点回收：腐烂宝石 decayGem 波B 落地 + createGemsMixAny 色×特殊端点（R22，
    // 9780 口径：官方 CreateGems2Colors Brown/Decay Amount 10 逐颗掷选）；
    // 「将第一个敌人击退」= reposition('enemyFront','back')（官方 TroopOrderBack @FrontEnemy）。
    build: skill(
      createGemsMixAny([BaseColor.Brown, { kind: 'decayGem' }], 10),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 9551,
    desc: '对敌人造成 [魔法 + 2] 点伤害，伤害值由我的灵魂数增强。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 5 个灵魂。 [1:1]',
    // [1:1] = CountMySouls x100 编码 → ratio 1:1 battleSouls；「塔」= CASTLE_ASC3
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'battleSouls' } },
        condMult: CASTLE_ASC3,
      }),
      gainSouls(5),
    ),
  },
  {
    id: 9569,
    desc: '如果棋盘上有 13 个或更多骷髅，则吞噬一个敌人。否则对其造成 [(魔法 x 2) + 2] 点真实伤害。然后创造 9 个骷髅。',
    // 「≥13 骷髅」= boardAtLeast 无色（计骷髅）；否则分支 = not 否定（§12.6）；阈值取锚定 ZH 13
    //（官方步骤 AddFor10Skulls 内部编码为 10，按 desc 口径并注明）
    // sa-R5: native ConsumeConditional (100% AddFor10Skulls, R003 -> 13) is a Devour (caster gains stats), not a
    // plain execute; TrueDamage FromTarget follows and only lands when the target was not devoured.
    build: skill(
      devour('enemyChosen', { chance: 1, ifCond: { kind: 'boardAtLeast', n: 13 } }),
      trueDmg('enemyChosen', 2, 2),
      createSkulls(9),
    ),
  },
  {
    id: 9586,
    desc: '获得 [魔法 + 1] 点攻击力和护甲，由我的灵魂增强。为我下方的所有盟友提供 2-5 点魔力值。 [3:1]',
    // [3:1] = CountMySouls x34 → battleSouls；「2-5 点魔法」= 官方三步（100%/50%/25%）非数值区间
    //（PercentageChance 实锤）；「我下方所有盟友」= allyBelowSelf（R13）
    build: skill(
      attack('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } } }),
      armor('allySelf', 1, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } } }),
      magic('allyBelowSelf', 2, 0),
      magic('allyBelowSelf', 2, 0, { chance: 0.5 }),
      magic('allyBelowSelf', 1, 0, { chance: 0.25 }),
    ),
  },
  {
    id: 9588,
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因 Dhrak-Zum 盟友数量而增强。如果敌人是 Boss，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x4]',
    // r16 卡点回收：alliesOfKingdom（Dhrak-Zum 3035 = 本地「卓克祖」）；[x4] = CountArmyKingdom x400
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfKingdom', kingdom: 3035 } },
        condMult: BOSS_ASC3,
      }),
    ),
  },
  {
    id: 9593,
    desc: '对敌人造成 [魔法 + 1] 点伤害，伤害值因蓝宝石数量而增强。如果敌人来自 Merlantis，则造成双倍伤害。 [3:1]',
    // builders.ts Wave4 kingdomOf 官方出处条目：「敌人来自 Merlantis」= kingdomOf enemy
    // （Merlantis 3036 = 本地「梅兰堤斯」）；[3:1] = CountGems Blue x34
    build: skill(
      dmg('enemyChosen', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
        condMult: { times: 2, cond: { kind: 'targetKingdom', kingdom: 3036 } },
      }),
    ),
  },
  {
    id: 9605,
    desc: '魅惑敌人。然后将所有红色宝石转换为沉没宝石。',
    build: skill(
      inflict('charm', 'enemyChosen'),
      transformToSpecial(BaseColor.Red, 'submergeGem'),
    ),
  },
  {
    id: 9650,
    desc: '创造3颗恐怖宝石和3颗燃烧宝石。然后引爆2颗宝石。',
    build: skill(
      createSpecialGems({ kind: 'terrorGem' }, 3),
      createSpecialGems({ kind: 'burningGem' }, 3),
      explodeRandomGems(2, 0),
    ),
  },
  {
    id: 9657,
    desc: '&& 选择一种法力颜色。将 10 颗该颜色的宝石转换为附魔宝石，并祝福该颜色的所有盟友。&& 选择一种法力颜色。将 10 颗该颜色的宝石转换为纠缠宝石，并诅咒该颜色的所有敌人。',
    // 附魔宝石 = enchantedGem / 纠缠宝石 = entangleGem（波A/波B）；两次选色引擎为单选色，
    // 两段共用同一选定色（r16 9219 FromTarget+FromManaColor* 超集口径并注明）
    build: skill(chooseSkill(["选定颜色转10颗附魔宝石，祝福该色盟友","选定颜色转10颗纠缠宝石，诅咒该色敌人"], [transformToSpecial(CHOSEN, 'enchantedGem', { count: 10 }), inflict('blessed', 'allyAll', { ifCond: CHOSEN_COLOR })], [transformToSpecial(CHOSEN, 'entangleGem', { count: 10 }), inflict('curse', 'enemyAll', { ifCond: CHOSEN_COLOR })])),
  },
  {
    id: 9659,
    desc: '对3名随机敌人造成[魔法 + 2]溅射伤害，伤害值因愤怒宝石和骷髅头数量而增强。然后召唤一场末日风暴。 [1:1]',
    // 双来源各 ×1（boardSpecial enrageGem + boardSkulls）；末日风暴 = dropKind doomSkull（p37 先例）
    build: skill(
      // native RandomEnemy + 2 x RandomPrefNotPrevEnemy (R007-3: each avoids only the previous centre, may return to the first) (sa-R1)
      ...(['enemyRandom', 'enemyRandomPrefNotPrev', 'enemyRandomPrefNotPrev'] as const).map(t => dmgSplash(t, 2, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 1 },
          sources: [{ kind: 'boardSpecial', gem: 'enrageGem' }, { kind: 'boardSkulls' }],
        },
      })),
      createStorm(BaseColor.Brown, { dropKind: 'doomSkull' }),
    ),
  },
  {
    id: 9661,
    desc: '对一名敌人造成[(魔法 x 2) + 4]点伤害，伤害值因诅咒宝石数量而增强。如果该敌人死亡，则消除其他敌人的所有护甲，然后为自身添加祝福和附魔。 [x10]',
    // 目标身亡后 enemyAll 天然排除死者（r17 9731 口径）；祝福/附魔同挂 ifTargetDied（AddForKill 实锤）
    build: skill(
      dmg('enemyChosen', 4, 2, {
        modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'curseGem' } },
      }),
      reduce('enemyAll', 'armor', 0, 0, { drainAll: true, ifTargetDied: true }),
      // 前一段 enemyAll 会改写 lastTarget → 祝福/附魔按「本次施法有敌人阵亡」判定（只有选定敌人受伤害）
      inflict('blessed', 'allySelf', { ifCond: { kind: 'castEnemyDied' } }),
      inflict('enchanted', 'allySelf', { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 9663,
    desc: '创造 6 颗恐怖宝石或 6 颗炸弹宝石。然后引爆 1 颗宝石。',
    // 「或」= oneOf（官方 Terror/Bomb 两变体，共同引爆段抽出）
    build: skill(
      oneOf(
        createSpecialGems({ kind: 'terrorGem' }, 6),
        createSpecialGems({ kind: 'bomb' }, 6),
      ),
      explodeRandomGems(1, 0),
    ),
  },
  {
    id: 9716,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因黄色和棕色宝石数量而增强。所有技能获得 10 点。如果敌人死亡，则获得伤害值增加三倍。 [x2]',
    // 双来源各 ×2（r17 7650 口径）；「所有技能」= 攻/甲/魔三围（r15 7065 口径）；「死亡则三倍」=
    // 官方 IncreaseAllStats Amount 10 + StatusAmount 20 AddForKill 实锤 = 基础 10 + 追加 20
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'boardGems', color: BaseColor.Yellow }, { kind: 'boardGems', color: BaseColor.Brown }],
        },
      }),
      // sa-F3：原生 IncreaseAllStats = 四项技能（攻/甲/生命/魔，R007-2 四项定义）；自身增益段会改写
      // lastTarget → 击杀追加 20 改判 castEnemyDied（只有选定敌人受伤害）
      attack('allySelf', 10, 0),
      armor('allySelf', 10, 0),
      heal('allySelf', 10, 0),
      magic('allySelf', 10, 0),
      attack('allySelf', 20, 0, { ifCond: { kind: 'castEnemyDied' } }),
      armor('allySelf', 20, 0, { ifCond: { kind: 'castEnemyDied' } }),
      heal('allySelf', 20, 0, { ifCond: { kind: 'castEnemyDied' } }),
      magic('allySelf', 20, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 9718,
    desc: '可选：赋予所有盟友 [魔法 + 7] 点生命并祝福。或造成 [魔法 + 7] 点伤害，并诅咒所有敌人。或引爆所有石像鬼宝石。',
    // 三选一 = oneOf（官方三变体）；第二支伤害目标按官方步骤 AllEnemies（EN/ST 优先）；
    // 石像鬼善恶合并一口超集（r16 9022 口径）
    build: skill(
      oneOf(
        [heal('allyAll', 7, 1), inflict('blessed', 'allyAll')],
        [dmg('enemyAll', 7, 1, { range: 'all' }), inflict('curse', 'enemyAll')],
        [explodeSpecialGems('gargoyleGem')],
      ),
    ),
  },
  {
    id: 9746,
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。引爆3颗与敌人法力颜色相同的宝石。',
    // 「与敌人法力颜色相同的宝石」= explodeRandomGems color 'LAST_TARGET'（r15 8933 口径）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      explodeRandomGems(3, 0, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 9755,
    desc: '对一名敌人造成[(魔法 x 2) + 4]点伤害。有20%的几率将其击杀，中毒或带有死亡标记的敌人的几率会增强该几率。 [x5]',
    // 几率 = 20% + 5×(中毒+死亡标记敌人数)/100（官方 LethalDamageConditional x20 UseCounterForAmount）
    build: skill(
      dmg('enemyChosen', 4, 2),
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.2,
        chanceBoost: {
          mod: { kind: 'multiplier', a: 5 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'poison' }, { kind: 'enemyStatusCount', statusId: 'death-mark' }],
        },
      }),
    ),
  },
  {
    id: 9756,
    desc: '造成[魔法 + 10]点散射伤害，伤害值因被诅咒和恐惧的敌人数量而增强。召唤1-3个恶魔。 [x16]',
    // 双来源各 ×16（r17 7650 口径）；「1-3 个恶魔」= 官方三步 SummoningTypeNoError（100%/50%/50%）
    build: skill(
      dmg('enemyAll', 10, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 16 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'curse' }, { kind: 'enemyStatusCount', statusId: 'terror' }],
        },
      }),
      summonRandom(DAEMON_REFS),
      summonRandom(DAEMON_REFS, undefined, { chance: 0.5 }),
      summonRandom(DAEMON_REFS, undefined, { chance: 0.5 }),
    ),
  },
  {
    id: 9773,
    desc: '对一名敌人造成[魔法 + 6]点伤害，伤害值因紫色宝石数量而增强。如果敌人使用红色法力值，则有60%的几率将其吞噬。 [x4]',
    build: skill(
      // sa-R5 L1-devour-first (R001): native ConsumeConditional (60% if Red) is a real Devour and precedes the Damage.
      devour('enemyChosen', { chance: 0.6, ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
      dmg('enemyChosen', 6, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 9781,
    desc: '对敌人造成[魔法 + 4]点伤害，受流血宝石加成。若为首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得额外回合。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'bleedGem' } },
        condMult: BOSS_ASC3,
      }),
      extraTurn(),
    ),
  },
  {
    id: 9788,
    desc: '对敌人造成[魔法 + 4]点伤害，骷髅头可提升伤害。若为首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造末日风暴。 [x3]',
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSkulls' } },
        condMult: BOSS_ASC3,
      }),
      createStorm(BaseColor.Brown, { dropKind: 'doomSkull' }),
    ),
  },
  {
    id: 9815,
    desc: '消除敌人最多14点护甲。生成5颗紫色宝石，宝石数量根据消除的护甲值提升。 [2:1]',
    // r16 卡点回收：「消除的护甲值」= lastReduce（Wave4 跨段实际削减额）；[2:1] = CountArmor x50，
    // 官方 CountMax 7 上限由 reduce 夹零（≤14）天然保证（14/2 = 7）
    build: skill(
      reduce('enemyChosen', 'armor', 14, 0),
      createGems(BaseColor.Purple, 5, 0, {
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'lastReduce' } },
      }),
    ),
  },
  {
    id: 9838,
    desc: '对敌人造成[魔法 + 4]点伤害，受恐惧敌人和恐惧宝石的影响而提升伤害。如果敌人处于恐惧状态，则有50%的几率将其吞噬。 [x4]',
    // 双来源各 ×4（enemyStatusCount terror + boardSpecial terrorGem，r16 9875 口径）
    build: skill(
      // sa-R5 L1-devour-first (R001): native ConsumeConditional (50% if Terrified, a real Devour) precedes the Damage.
      devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetStatus', statusId: 'terror' } }),
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'terror' }, { kind: 'boardSpecial', gem: 'terrorGem' }],
        },
      }),
    ),
  },
  {
    id: 9862,
    desc: '对一名敌人造成[魔法 + 4]点伤害，毒素宝石可提升伤害。如果是首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后诅咒并流血所有其他敌人。 [x3]',
    // 「所有其他敌人」= 官方 AboveTarget + BelowTarget 两段（目标编队上下其余全体，R13 目标）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'poisonGem' } },
        condMult: BOSS_ASC3,
      }),
      inflict('curse', 'enemyAboveTarget'),
      inflict('curse', 'enemyBelowTarget'),
      inflict('bleed', 'enemyAboveTarget'),
      inflict('bleed', 'enemyBelowTarget'),
    ),
  },
  {
    id: 9869,
    desc: '引爆所有毒宝石。每引爆一颗毒宝石，就诅咒一个随机敌人。 [1:1]',
    // EN 原句「for each Gem exploded」= 逐被摧毁宝石（perDestroyed 无色 = 全部，含爆破波及）；
    // 尾缀 [1:1] = perDestroyed 驱动比率序列化（r15 特例口径）
    // sa-F1 (R001): native s0 CountGems Poison 100 → s1 ExplodeColor Poison → s2 InflictEffectOnRandomTroops UseCounter:
    // one curse per Poison Gem (counted before the explosion), not per gem caught in the 3x3 blasts.
    build: skill(
      explodeSpecialGems('poisonGem'),
      inflict('curse', 'enemyAll', { perCount: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems', special: 'poisonGem' } } }),
    ),
  },
  {
    id: 9870,
    desc: '对一名敌人造成[魔法 + 4]点伤害。如果是首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。净化所有友军。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      cleanse('allyAll'),
    ),
  },
  {
    id: 9901,
    desc: '对所有敌人造成[(魔法 x 2.4) + 3]点伤害，骷髅头可提升伤害，并附加诅咒和恐惧效果。有10%的几率获得额外回合，骷髅头可提升额外回合数。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 2.4, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } },
      }),
      inflict('curse', 'enemyAll'),
      inflict('terror', 'enemyAll'),
      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } } }),
    ),
  },
  {
    id: 9918,
    desc: '对敌人造成[魔法 + 4]点伤害，红色宝石可提升伤害。如果是首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。然后引爆3颗邪恶石像鬼宝石。 [x2]',
    // 邪恶石像鬼 = 引擎善恶合并一口（gargoyleGem，r16 9022 超集口径）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } },
        condMult: BOSS_ASC3,
      }),
      // native ExplodeColor 3 BadGargoyle: tier 2 only (P-R1-gargoyle-tier-filter)
      explodeRandomSpecialGems('gargoyleGem', 3, 0, undefined, 2),
    ),
  },
  {
    id: 9951,
    desc: '对敌人造成[魔法 + 4]点伤害，伤害值受我的攻击力加成。如果是首领，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [3:1]',
    // [3:1] = CountAttack x34 编码 → ratio 3:1 selfStat attack（r11 CountAttack 34 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } },
        condMult: BOSS_ASC3,
      }),
    ),
  },
  {
    id: 9987,
    desc: '对所有敌人造成[魔法 + 2]点伤害，伤害由我的灵魂加成。将5颗蓝色宝石转化为幽灵宝石。 [5:1]',
    // [5:1] = CountMySouls x20（100/20 编码）→ ratio 5:1 battleSouls；幽灵宝石 = ghost（可创造）
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 5, b: 1 }, source: { kind: 'battleSouls' } },
      }),
      transformToSpecial(BaseColor.Blue, 'ghost', { count: 5 }),
    ),
  },
];

/**
 * 本批（终判）留弃 18 条分组注记（SKIP 记录见上方 SKIPPED 数组；此前复核结论中已被
 * r21/r22 回收的条目——8812/8927/9052/9571/9723/9780/9986、8838/8915/9237/9284/9462/9471、
 * 8931/9055/9181、9287、9812、8880/9252/9341/9364/9369/9492/9959——均已移出本批口径）：
 *
 * 【狼化状态白名单缺口（引擎已实现、测试白名单未扩）】
 * - 8553（狼化施加 + 狼化宝石创造 + 紫计数额外回合）、8567（狼化宝石在场条件 + 狼化施加 +
 *   收回法力）——本批无权改 tests/unit/spellData.test.ts STATUS_WHITELIST；
 *   8566 只涉狼化宝石计数（宝石≠状态）故可组装。
 *
 * 【敌方黄金池无来源（TakeEnemyGold/CountEnemyGold 无 source kind）】
 * - 8568（窃金+尾缀）、8859（窃金 && 随机技能窃取）、8904（窃金额驱动伤害 [50:1]）、
 *   9189（窃全部黄金 [x10]）。
 *
 * 【数值/公式不可考（7xxx 无步骤数据）】
 * - 7328（法力灼烧伤害公式无数值）、7402（泛指「一名盟友的攻击力」无来源 kind）、
 *   7483（基数=攻击力 ×1 与来源 ×10 双结构，modifier 单 mod 无法同表）、
 *   7713/7987（孤儿尾缀 [20:1]/[100:1] 无来源子句不可绑）。
 *
 * 【时序/条件/上限缺口】
 * - 7690（冻结前状态快照，段序后 targetStatus 恒真）、10061（击杀几率上限无 cap 原语 +
 *   ZH 30%/官方 CountMax 20 矛盾）、8567（特殊宝石在场条件不在条件域）。
 *
 * 【其余】
 * - 7542（凤凰涅槃自复活无机制）、8377（官方步骤与尾缀编码互斥无法对号）、
 *   8804（以创造格为锚的周边位置计数无来源）、8737（全咒语无 chosen 段驱动目标选择器）、
 *   9545（转换 count 无 modifier 通道；龙宝石本身波B 已解锁）。
 */
export const BATCH_R19: CuratedBatch = { batch: 'R19', spells: SPELLS, skipped: SKIPPED };
