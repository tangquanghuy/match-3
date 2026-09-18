/**
 * 放弃桶回收批 R19（2026-09-18，与 R18 并行 · 分界 id ≥ 8700）。
 *
 * 工作面 = 「从未组装也未在 SKIPPED」的 id ≥ 8700 条目 + tmp/remaining_all.json 中
 * id ≥ 8700 的 SKIP 记录用 Wave4 后全词汇重判可挽救者。判读依据 = 官方英文原句
 * （data/raw/gow-2026-09-18 troops.en.json stats.spell.desc）与官方 SpellSteps
 * （data/raw/spells.gow.en.json RawData.SpellSteps），原句优先于机翻 ZH。
 *
 * 本批口径：
 * - 二次缩放尾缀编码（r11 实测推广）：Count* Amount/100 = ×N（multiplier 系）；
 *   Amount ≈ 100/N = [N:1]（ratio 系，34→[3:1]/50→[2:1]/100→[1:1]/10→[10:1]/20→[5:1]/25→[4:1]）。
 * - 王国计数/条件首落地：alliesOfKingdom（8723/8985/9245/9249/9588）+ kingdomOf 条件
 *   （9593「敌人来自 Merlantis」= builders.ts Wave4 注记的官方出处）。注意 8985「狂野皇廷」
 *   = 官方 KingdomId 3048，本地 troops.json 王国名为「卜筮之原」（kingdom 匹配按本地名）。
 * - 晋升度惰性建模（r16 口径）：Boss/高塔 ×「3-5 倍」= anyOf[targetRace, ascended≥3] 取下限 3。
 * - 战场经济来源扩用：battleGold（9005/9259/8749/9316/8732）、battleSouls（9180/9551/9586/9987）、
 *   battleMaps（9342）+ gainMaps/gainGold/gainSouls 获得段。
 * - Wave4 新词消费：convertSpecial+tiers（8801）、perDestroyed（9060/9869）、lastReduce（9815）、
 *   mana fraction（8923/9463）、CreateGems2Colors 闪电对（9198）、rangeSpec+split（9281）。
 * - 「吞噬」= execute 即杀段（w01 7380 口径）；条件/几率吞噬挂 ifCond/chance/chanceBoost。
 * - ZH 机翻漏译按 EN/ST 补齐（8895 藏宝图子句，8930 EN 优先口径）；绑定口径见条目注释。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, reduce, steal,
  cleanse, randomStat, inflict, inflictRandom, createGems, createMix, createSkulls,
  createSpecialGems, createSpecialGems2, transform, transformToSpecial, convertSpecial,
  destroyColor, destroyAllColors, destroyRandomCols, destroyChosenCol, destroyRandomGems,
  explodeRandomGems, explodeRandomSpecialGems, explodeSpecialGems, explodeSkulls,
  createStorm, shuffleBoard, extraTurn, oneOf, reposition, sacrifice, summonRandom, summonRef,
  gainGold, gainSouls, gainMaps, scale, CHOSEN,
} from '../builders';
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
  { id: 8859, reason: '「窃取黄金 [100:1]」二次缩放来源不支持（敌方黄金计数无 source kind，battleGold 为共用池总额）；随机技能值窃取本身可表达' },
  { id: 8880, reason: '「混合紫色和骷髅头的宝石」创造无原语（createMix 仅六色、createSpecialGems2 仅双特殊，batch-36 9312 口径）；灵魂/净化本身可表达' },
  { id: 8902, reason: '「倒数第二位敌人」(SecondLastEnemy) 无对应目标模式（enemyNth 为静态 n，无法动态取倒数第二）' },
  { id: 8904, reason: '「因窃取黄金数而增强」来源缺失（battleGold 为战场池总额、非本次窃取额）；[50:1] 无可绑来源' },
  { id: 9189, reason: '「窃取所有黄金」无数量来源原语（敌方黄金池不可读）；尾缀 [x10] 无文本落点，语义拿不准' },
  { id: 9252, reason: '「每有一个红色盟友则使随机敌人陷入恐怖」= 在场计数驱动施加，perDestroyed 仅辖被摧毁宝石（9287 同族无原语）' },
  { id: 9341, reason: '「每有 10 黄金则使随机敌人陷入疾病」= 经济计数驱动施加，状态段无计数驱动位（r16 UseCounterForAmount 口径）' },
  { id: 9364, reason: '几率来源「敌人最常用法力色的宝石数」——boardGems 来源 color 仅收 BaseColor，不支持 ENEMY_MOST_USED 动态色' },
  { id: 9369, reason: '「消除所有敌人正面增益」泛指驱散仍不做（§6）；「3-[(魔法 x 1.33) + 2] 点真实伤害」数值区间亦 blocked（伤害区间族）' },
  { id: 9492, reason: '「几率随被摧毁的头骨数量而增强」——destroyedGems 来源无骷髅筛（仅基色，r17 8812 同卡点）；5x5 圆/即杀本身可表达' },
  { id: 9545, reason: '「转换数量因诅咒敌人数增加」——transform count 为静态缩放、无 modifier 通道；诅咒/死亡标记施加本身可表达' },
  { id: 9812, reason: '「若有敌人死亡」跨段任意死亡绑定缺失（2 目标段 ifTargetDied 仅判最近段主目标，r16 9986 同口径）' },
  { id: 9959, reason: '文本「引爆2-5颗宝石」与官方步骤（ExplodeGems 2+1+1+1 无掷签 = 固定 5）互相矛盾，语义拿不准' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8715,
    desc: '摧毁所有绿色宝石。创造蓝色宝石，数量等同于被摧毁的宝石数。有个别 30% 的几率吞噬 2 名随机敌人。 [1:1]',
    // 蓝宝石数量 = destroyedGems Green ×1（官方 UseCounterForAmount CreateGems）；「个别 30%」=
    // 两次独立掷签（官方 Consume + Consume RandomPrefNotPrevEnemy，8063 独立随机口径）
    build: skill(
      destroyColor(BaseColor.Green),
      createGems(BaseColor.Blue, 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Green } } }),
      dmg('enemyRandom', 0, 0, { execute: true, chance: 0.3 }),
      dmg('enemyRandom', 0, 0, { execute: true, chance: 0.3 }),
    ),
  },
  {
    id: 8723,
    desc: '造成 [魔法 + 6] 点散射伤害，伤害值因荆棘森林盟友数而加强。再使首位敌人陷入沉默效果。 [x6]',
    // 王国盟友计数首落地：alliesOfKingdom（Forest of Thorns 3015 = 本地「荆棘森林」）；裸散射 = 全体散射
    build: skill(
      dmg('enemyAll', 6, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'alliesOfKingdom', kingdom: '荆棘森林' } },
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
        dmg('enemyRandom', 0, 0, { execute: true }),
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
      explodeRandomGems(1, 0),
    ),
  },
  {
    id: 8817,
    desc: '摧毁所有黄色宝石。每摧毁一颗黄色宝石，则有 10% 的几率吞噬一名敌人。 [1:1]',
    // 逐摧毁计数掷签：chance 0 + chanceBoost 10×摧毁黄宝石数/100（官方 ConsumeConditional
    // UseCounterForAmount x10 实锤，r4 「几率=chance+boost」口径）
    build: skill(
      destroyColor(BaseColor.Yellow),
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0,
        chanceBoost: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
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
    // 「移除所有宝石」= destroyAllColors（不含骷髅，batch-01 宝石/骷髅术语口径）
    build: skill(
      destroyAllColors(),
      gainGold(10),
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
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
    build: skill(
      dmg('enemyChosen', 3, 1),
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.2 }),
      createSpecialGems({ kind: 'dragonGem', color: BaseColor.Red }, 12, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8891,
    desc: '对末位敌人造成 [魔法 + 3] 点伤害，有 20% 的几率吞噬对方。再使自身下潜。',
    build: skill(
      dmg('enemyLast', 3, 1),
      dmg('enemyLast', 0, 0, { execute: true, chance: 0.2 }),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 8895,
    desc: '给予所有盟友 [魔法 + 1] 点随机技能值，并赋予他们一个随机正面增益状态效果。获得 50 黄金、20 个灵魂。',
    // ZH 漏译「并获得 2 张藏宝图」——EN/ST（GiveTreasureMaps x2）补齐（8930 EN 优先口径）
    build: skill(
      randomStat('allyAll', 1, 1),
      inflictRandom('allyAll', { pool: 'positive' }),
      gainGold(50),
      gainSouls(20),
      gainMaps(2),
    ),
  },
  {
    id: 8920,
    desc: '创造 8 颗黄色宝石和 8 颗灵力宝石。获得法印效果。',
    // 灵力宝石 = spiritGem（官方 CreateGems Spirit 无色，r14 8917 同款缺省）
    build: skill(
      createGems(BaseColor.Yellow, 8),
      createSpecialGems({ kind: 'spiritGem' }, 8),
      inflict('enchanted', 'allySelf'),
    ),
  },
  {
    id: 8922,
    desc: '给予所有红色盟友 2 点魔法值，数值因灵力宝石数而增强。再赋予他们法印效果。 [1:1]',
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
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfRace', race: 'Orc' } } }),
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.35, ifCond: { kind: 'targetStatus', statusId: 'death-mark' } }),
    ),
  },
  {
    id: 8985,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因狂野皇廷盟友数而增强。有 40% 的几率召唤另一只妖犬。 [x4]',
    // 王国计数首落地：「狂野皇廷」= 官方 KingdomId 3048，本地 troops.json 王国名「卜筮之原」
    //（kingdomOf/alliesOfKingdom 按本地 Character.kingdom 匹配）；召唤自身 = FeyHound 7357
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfKingdom', kingdom: '卜筮之原' } },
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
        dmg('enemyRandom', 0, 0, { execute: true }),
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
      steal('enemyChosen', 'mana', 'mana', 6, 0),
      dmg('lastTarget', 0, 0, {
        execute: true,
        chance: 0,
        chanceBoost: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'drainedMana' } },
      }),
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
    // 官方 RandomAlly + RandomPrefNotPrevAlly → allyRandomN n:2（不重复近似）
    build: skill(
      dmg('enemyChosen', 2, 1, { condMult: CASTLE_ASC3 }),
      inflict('submerged', 'allyRandomN', { n: 2 }),
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
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'alliesOfKingdom', kingdom: '狮心帝国' } },
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
          sources: [{ kind: 'alliesOfKingdom', kingdom: '皓彩森林' }, { kind: 'enemyStatusCount', statusId: 'faerie-fire' }],
        },
      }),
      armor('allySelf', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'alliesOfKingdom', kingdom: '皓彩森林' }, { kind: 'enemyStatusCount', statusId: 'faerie-fire' }],
        },
      }),
      inflict('barrier', 'allySelf'),
    ),
  },
  {
    id: 9251,
    desc: '对一名敌人造成 [魔法 + 2] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。创造 1-3x3 通配宝石。',
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
    // 区间伤害 + 分摊 {2}（§12.2 rangeSpec+split，damage.ts 双界走 evaluateWithModifier）；
    // [2:1] = CountArmor x50 → selfStat armor；「自毁」= sacrifice allySelf chance（§11 追加）
    build: skill(
      reposition('enemyChosen', 'front'),
      dmg('enemyChosen', 0, 0, {
        rangeSpec: { min: scale(2, 0.625), max: scale(4, 1.25) },
        split: 2,
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
      steal('enemyFirstN', 'hp', 'hp', 2, 1.25, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'ghost' } },
      }),
      inflict('curse', 'enemyFirstN', { n: 2 }),
      inflict('frozen', 'enemyFirstN', { n: 2 }),
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
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得屏障效果。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
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
      createSpecialGems({ kind: 'daemonicPortalGem' }, 2),
      transformToSpecial(BaseColor.Yellow, 'spiritGem'),
    ),
  },
  {
    id: 9476,
    desc: '对敌人造成 [魔法 + 4] 点伤害。如果敌人是 Boss，则根据我的升天造成 3 倍 - 5 倍伤害。如果敌人死亡，则将其 1 颗法力色宝石转换为恶魔传送门宝石。',
    // r16 卡点回收：「该敌 1 颗法力色宝石」= transformToSpecial('LAST_TARGET', …, {count:1})
    //（§11 补充跨段取敌色，9745/8933 先例）；「敌人死亡」= ifTargetDied（AddForKill 实锤）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      transformToSpecial('LAST_TARGET', 'daemonicPortalGem', { count: 1, ifTargetDied: true }),
    ),
  },
  {
    id: 9551,
    desc: '对敌人造成 [魔法 + 2] 点伤害，伤害值由我的灵魂数增强。如果敌人是塔，则根据我的升天数造成 3 倍 - 5 倍伤害。获得 5 个灵魂。 [1:1]',
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
    build: skill(
      dmg('enemyChosen', 0, 0, { execute: true, ifCond: { kind: 'boardAtLeast', n: 13 } }),
      trueDmg('enemyChosen', 2, 2, { ifCond: { kind: 'not', cond: { kind: 'boardAtLeast', n: 13 } } }),
      createSkulls(9),
    ),
  },
  {
    id: 9586,
    desc: '获得 [魔法 + 1] 点攻击力和护甲，由我的灵魂增强。为我下方的所有盟友提供 2-5 点魔法值。 [3:1]',
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
    desc: '对敌人造成 [魔法 + 4] 点伤害，伤害值因 Dhrak-Zum 盟友数量而增强。如果敌人是 Boss，则根据我的升级造成 3 倍 - 5 倍伤害。 [x4]',
    // r16 卡点回收：alliesOfKingdom（Dhrak-Zum 3035 = 本地「卓克祖」）；[x4] = CountArmyKingdom x400
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfKingdom', kingdom: '卓克祖' } },
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
        condMult: { times: 2, cond: { kind: 'kingdomOf', side: 'enemy', kingdom: '梅兰堤斯' } },
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
    build: skill(
      transformToSpecial(CHOSEN, 'enchantedGem', { count: 10 }),
      inflict('blessed', 'allyAll', { ifCond: CHOSEN_COLOR }),
      transformToSpecial(CHOSEN, 'entangleGem', { count: 10 }),
      inflict('curse', 'enemyAll', { ifCond: CHOSEN_COLOR }),
    ),
  },
  {
    id: 9659,
    desc: '对3名随机敌人造成[魔法 + 2]溅射伤害，伤害值因愤怒宝石和骷髅头数量而增强。然后召唤一场末日风暴。 [1:1]',
    // 双来源各 ×1（boardSpecial enrageGem + boardSkulls）；末日风暴 = dropKind doomSkull（p37 先例）
    build: skill(
      dmgSplash('enemyRandomN', 2, 1, {
        n: 3,
        modifier: {
          mod: { kind: 'multiplier', a: 1 },
          sources: [{ kind: 'boardSpecial', gem: 'enrageGem' }, { kind: 'boardSkulls' }],
        },
      }),
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
      inflict('blessed', 'allySelf', { ifTargetDied: true }),
      inflict('enchanted', 'allySelf', { ifTargetDied: true }),
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
      attack('allySelf', 10, 0),
      armor('allySelf', 10, 0),
      magic('allySelf', 10, 0),
      attack('allySelf', 20, 0, { ifTargetDied: true }),
      armor('allySelf', 20, 0, { ifTargetDied: true }),
      magic('allySelf', 20, 0, { ifTargetDied: true }),
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
    desc: '对一名敌人造成[魔法 + 2]点伤害。如果敌人是塔，则根据我的升华值造成3倍到5倍的伤害。引爆3颗与敌人法力颜色相同的宝石。',
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
    desc: '对一名敌人造成[魔法 + 6]点伤害，伤害值因紫色宝石数量而增强。如果敌人使用红色法力，则有60%的几率将其吞噬。 [x4]',
    build: skill(
      dmg('enemyChosen', 6, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.6, ifCond: { kind: 'targetColor', color: BaseColor.Red } }),
    ),
  },
  {
    id: 9781,
    desc: '对敌人造成[魔法 + 4]点伤害，受流血宝石加成。若为首领，则根据我的升华等级造成3倍至5倍伤害。获得额外回合。 [x3]',
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
    desc: '对敌人造成[魔法 + 4]点伤害，骷髅头可提升伤害。若为首领，则根据我的升华等级造成3倍至5倍伤害。创造末日风暴。 [x3]',
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
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'enemyStatusCount', statusId: 'terror' }, { kind: 'boardSpecial', gem: 'terrorGem' }],
        },
      }),
      dmg('enemyChosen', 0, 0, { execute: true, chance: 0.5, ifCond: { kind: 'targetStatus', statusId: 'terror' } }),
    ),
  },
  {
    id: 9862,
    desc: '对一名敌人造成[魔法 + 4]点伤害，毒素宝石可提升伤害。如果是首领，则根据我的升华等级造成3倍至5倍伤害。然后诅咒并流血所有其他敌人。 [x3]',
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
    build: skill(
      explodeSpecialGems('poisonGem'),
      inflict('curse', 'enemyAll', { perDestroyed: {} }),
    ),
  },
  {
    id: 9870,
    desc: '对一名敌人造成[魔法 + 4]点伤害。如果是首领，则根据我的升华等级造成3倍至5倍伤害。净化所有友军。',
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
    desc: '对敌人造成[魔法 + 4]点伤害，红色宝石可提升伤害。如果是首领，则根据我的升华等级造成3倍至5倍伤害。然后引爆3颗邪恶石像鬼宝石。 [x2]',
    // 邪恶石像鬼 = 引擎善恶合并一口（gargoyleGem，r16 9022 超集口径）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } },
        condMult: BOSS_ASC3,
      }),
      explodeRandomSpecialGems('gargoyleGem', 3),
    ),
  },
  {
    id: 9951,
    desc: '对敌人造成[魔法 + 4]点伤害，伤害值受我的攻击力加成。如果是首领，则根据我的升阶等级，造成3倍至5倍的伤害。 [3:1]',
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
 * 本批复核仍留弃条目（SKIP 记录保留在原批次文件，避免重复计数；此处仅记 R19 复核结论）：
 *
 * 【指定盟友法力色无占位】
 * - 8737：「选择一个盟友，创造其法力颜色宝石」——ColorSpec 无 'ALLY(选定盟友)' 占位
 *   （'CASTER'/'ENEMY'/'LAST_TARGET' 均不合；r17 同卡点）。
 *
 * 【位置/周边计数】
 * - 8804：「宝石附近或下方每有一颗绿色宝石」周边位置计数无 modifier 来源（boardGems 为全盘）；
 * - 8812：「每有一颗骷髅头被摧毁则再爆破」——destroyedGems 无骷髅筛；
 * - 9052：「爆破一颗宝石和其两边的宝石」一行三格无此面积形状（cross3 为十字）。
 *
 * 【敌方侧种族计数来源缺失（enemiesOfRace 族待引擎扩）】
 * - 8838（亡灵+恶魔双侧四来源）、8915（恶魔敌人+盟友）、9237（不死+恶魔敌人）、
 *   9284（鬼魂宝石+不死敌人双来源）、9462（敌我龙族）、9471（恶魔+娜迦四来源）。
 *
 * 【状态段计数驱动 / 跨段任意死亡】
 * - 9287（每颗鬼魂宝石→屏障，在场计数驱动施加）、9986（「若有敌人死亡」4 目标段漏判，
 *   ifTargetDied 仅判最近段主目标）。
 *
 * 【目标相对条件挂无目标段】
 * - 8925：「若对方是一名骑士则创造灵力宝石」——创造段无目标无从判定（r16 口径）；
 *   屏障+半数法力本身可表达。
 *
 * 【晋升度外泄无碍、数值区间族】
 * - 8931（3-8 点法力）、9055（3-10 法力）、9181（3-10 法力）——GenerateRandomMana 数值区间
 *   仍 blocked（§9.8；8931/9055 其余部分现均可表达）。
 *
 * 【色+特殊宝石混合创造无原语】
 * - 9546（棕色+腐烂）、9780（绿色+流血）——createMix 仅颜色、createSpecialGems2 仅双特殊。
 *
 * 【伤害值→治疗量绑定】
 * - 9571：「将其作为生命赋予最弱的盟友」——治疗量绑定伤害额无原语（lastReduce 仅辖 reduce 族）。
 *
 * 【泛指驱散敌方增益】
 * - 9723：「驱散一名敌人」= 移除其全部正面增益，泛指驱散仍不做（§6）；屏障宝石加成/创造本身可表达。
 *
 * 【几率上限 / 内部编码矛盾】
 * - 10061：击杀几率「最高可达 30%」上限无法表达（chanceBoost 仅 [0,1] 夹取），官方 CountMax 20
 *   与 ZH 30% 亦互相矛盾；
 * - 8927/8871：ZH 描述截断（「数值因被摧毁的 [x5]」/「4 颗 [1:1]」末段缺失），8927 另有
 *   「被摧毁的石像鬼宝石」destroyedGems 无特殊宝石筛。
 */
export const BATCH_R19: CuratedBatch = { batch: 'R19', spells: SPELLS, skipped: SKIPPED };
