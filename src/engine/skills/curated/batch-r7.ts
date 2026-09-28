/**
 * 放弃桶回收批 R7（2026-09-17 第三次重筛）：对数字批次 SKIPPED 再过筛，
 * 用 2026-09-16/17 新落地原语抢救「当时理由过时」的条目。核对者：子 agent，87 条。
 * 依据：spell-rules §9-§13（位置 reposition/shuffleTeam、split、'lastTarget'、countRange、
 * skillOnce、'not'、inflictRandom、sacrifice、transformTroop、gainMaps、troopPresent、
 * casterStatBeatsTarget、anyEnemyColor、terror/faerie-fire、裸散射=enemyChosen、heal full、
 * nRange、boardAtLeast、oneOf、buff n、enemyNth、enemyWeakestN/HealthiestN、
 * enemyChosenAndBelow、freeze/bleed/entangle/ghost/barrier/web/faerieFire 宝石）。
 * 复用的既有批次口径（头注注明）：
 *  - 「转换…以增强」转化段先执行（batch-12 7215/7235 同款）；
 *  - 「击晕/使所有受到伤害的敌人」= enemyAll + targetHpDamaged（batch-r6 7985 同款）；
 *  - 裸「因敌人X而增强」= enemyStatSum、裸散射伤害 = enemyChosen 溅射链（batch-r6 8866/8860 同款）；
 *  - 「若其中一个使用X法力」按 anyEnemyColor 超集口径（spell-rules §13.3，9550 头注）。
 * 自我转化（「转化为X」主语缺省）= transformTroop('allySelf', …)，与诺斯费拉图/暗魄狼/
 * 蝙蝠群/狼人/村民的变身链一致（batch-r4 147 行同款）。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, armor, attack, magic, mana, cleanse, inflict, inflictRandom, reduce, steal, createGems, createSkulls, createSpecialGems, transform, transformToSpecial, destroyAllColors, destroyChosenRow, destroyChosenCross, destroyChosenCol, destroyRandomRows, destroyRandomCols, destroyRandomGems, explodeChosenRow, explodeChosenCol, explodeRandomGems, explodeSpecialGems, oneOf, summonRef, summonRandom, extraTurn, reposition, shuffleTeam, shuffleBoard, skillOnce, escape, sacrifice, transformTroop, transformTroopRandom, scale, flat, CASTER, CELL, explodeAt, dispelStatus, targetedSkill } from '../builders';
import { POSITIVE_STATUS_IDS } from '../effects/status';
import { BaseColor } from '../../types';
import type { SpecialGemKind } from '../../types';
import type { GemSegment } from '../prototypes';
import type { CuratedBatch } from './index';

// 恶魔/龙族/科博引用池（从 troops.json troopTypes 内联）
const DAEMON_REFS = ["AncientHorror","SpiderQueen","Abhorath","Webspinner","Moloch","TheSilentOne","Gorgotha","Kerberos","Cthyryzyx","Terraxis","Psion","Abynissia","Quasit","Hellhound","Succubus","HeraldOfChaos","InfernalKing","Venbarak","War","Plague","Famine","Death","Marilith","Hellcat","Creeper","KruargTheDread","Desdaemona","Warg","Incubus","DarkMonolith","Myzmer","Elemaugrim","CorruptedUrska","BoneDaemon","Hellspawn","Spinnerette","Doomclaw","YaoGuai","Erinyes","Tzathoth","Gargantaur","TomeOfEvil","Hellcackle","Glaycion","Nightmare","SirMordayne","Umbraxis","ThePossessedKing","Sloth","Envy","Greed","Gluttony","Barghast","Pride","Wrath","Lust","SibylOfLust","SoldierOfWrath","WallOfTentacles","Bael","VashDagon","QueenOfSin","Glutmaw","Obsidius","Lamashtu","PossessedUrska","BrokerOfGreed","EnvoyOfPride","MotherOfDarkness","GateOfSouls","Lucifria","Blightwing","Deminaga","TheInfernalMachine","Ironjaw","Tartarus","Netherhound","EldritchGuardian","FellDragonEgg","FellDragon","Nocturnia","HeraldOfWoe","IndolatorOfSloth","ShadeOfKurandara","Kurandara","EnragedKurandara","DaemonGnome","Mambasira","Arcturion","HeraldOfDamnation","Baphomet","TheScourgeOfHonor","DeepGolem","NyarMel","HoundOfYaoGuai","MaidOfEnvy","TheArchduke","Lemure","Fury","Charonas","JudgeOfTheDead","HellclawHunter","HellclawMage","HellclawWarrior","Indrajit","HelgorTheGuardian","FlamingOni","Oneiros","RedAhriman","AbjectOfDespond","Despond","BileBlackheart","AnimusOfEnvy","HornedHag","ConsortOfDarkness","EldritchMinion","Uvhash-Ka","WarMachine","HellclawRager","HeraldOfBlight","HellstoneGate","HeraldOfTorpor","Czernobog","Nabassu","Xenith","Tourmaline","Chalcedony","Petrahulk","StoneMefyt","TheElderDragon","VrawkDaemon","EldritchDisciple","Voidcaller","TheBaneOfMercy","EyeOfArges","InfernalVoyager","TheIronMaiden","TriTerror","DaemonChild","TheVoidDragon","Tempurath","DaemonicSentinel","Hellborer","DarkHerald","Groevanga","FellHydra","Isban","Goethite","SuccubusQueen","Bieska","HoundmasterGor","BlightHound","Astaroth","DaeDrak","MelekTauss","DoomedGuardian","StingBat","TheBaneOfValor","Redreaver","LionOfYaoGuai","Discordia","ImmortalAbaddon","BlightedHusk","BaneOfAmbition","HellclawShadowpriest","Polymetis","DagoNath","FelineOfEnvy","Skarn","MaidenOfPain","HeraldOfWar","Azbeel","OkraNosTheSleeper","Voidjaw","ChampionOfRot","BloodSpore","InfernalTrickster","Seditius","ImmortalZephaar"];
const DRAGON_REFS = ["Sheggra","Venoxia","ShadowDragon","Emperina","Celestasia","BoneDragon","DrakeRider","Dimetraxia","Wyvern","Venbarak","Borealis","DragonEggs","BabyDragon","Dragonette","Dragotaur","Dragonmoth","Visk","TheDragonSoul","Couatl","Sylvanimora","DRACOS-1337","DragonianRogue","DragonianMonk","SilverDrakon","Krystenax","Drake","Elemaugrim","DragonTurtle","Asha","Leviathan","Penglong","Glitterclaw","TheWorldbreaker","Divinia","LordEmber","LadyGarnetia","Tinseltail","Shimmerscale","Volthrenax","Thaumaris","Droggo","Sylfrostenath","MatronDragotani","UndeadDrake","FellDragonEgg","FellDragon","Nocturnia","Ishtara","DragonianSage","Obregonia","DragonSpirit","Essencia","Huanglong","Veneratus","HornedWyrm","NetherWyrm","TerraWyrm","TheGreatWyrm","Tihamata","RedAhriman","TwinkleBerry","MagmaDragon","Sabellius","Adakite","Obsidiaxas","Sapphirax","Emeraldrin","Rubirath","Topasarth","Amethialas","Garnetaerlin","Diamantina","Aquaria","TheElderDragon","HeraldOfKrystenax","TheGuardianDragon","CobaltDrake","HuntmasterArborius","CrystalEggs","DragonstoneGuardian","TheVoidDragon","Comethalas","Nebuladryx","Meteoridan","Solarithus","Lunarelleon","Eklipsos","Stellarix","DraconicSentinel","Tianlong","BrassDrake","Venerabilax","Chromaticea","Kukulkan","ImmortalAquaria","Leucithrax","TheSlimeDragon","Bahamata","Gingeraxia","Belcerulea","Gladius","Thornaressa","Narcithus","Orrissea","Orchidius","Chrysantherax","Chargrimax","Crackleleaf","Mistmother","DrakeEggs","ImmortalDrakkon","CrimsonWyrmling","Dragonhawk","Amethony","Creteus","Krakynos","Runethius","Hematrax","Vizinium","Demizerius","Amenhotrex","Pandemonia"];
const KOBOLD_REFS = ["Kobold", "KoboldKnight", "KoboldMagi", "KoboldEmissary", "KoboldThief"];

/** 「爆破 N-M 颗(特殊)宝石」：clear 随机宝石支持 countRange（effects/gems.ts 原语，
 *  组装器暂无包装构造函数）→ 直接落段。 */
function explodeRandomGemsRange(min: number, max: number, special?: SpecialGemKind): GemSegment {
  return {
    kind: 'gem',
    params: {
      op: 'clear',
      mode: 'explode',
      target: {
        kind: 'randomGems',
        count: flat(min),
        include: 'all',
        ...(special !== undefined ? { special } : {}),
        countRange: { min, max },
      },
    },
  };
}

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7057,
    desc: '造成 [魔法 + 1] 点真实伤害。如果敌人受伤，则增加 6 点伤害。',
    build: skill(trueDmg('enemyChosen', 1, 1, { condBonus: { n: 6, cond: { kind: 'targetHpDamaged' } } })),
  },
  {
    id: 7060,
    desc: '对 1 名随机的敌人造成 [魔法 + 3] 点伤害，伤害值因骷髅头数而增强。冻结敌人。 [1:1]',
    build: skill(
      dmg('enemyRandom', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSkulls' } } }),
      inflict('frozen', 'lastTarget'),
    ),
  },
  {
    id: 7130,
    desc: '获得 [魔法 + 3] 点护甲值。若板面上有 13 颗或更多棕色宝石，则给予所有盟友 5 点护甲值。',
    build: skill(
      armor('allySelf', 3, 1),
      armor('allyAll', 5, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Brown, n: 13 } }),
    ),
  },
  {
    id: 7137,
    desc: '移除所有宝石。恢复所有生命值，并获得 [魔法 + 1] 点攻击力。',
    build: skill(
      destroyAllColors(),
      heal('allySelf', 0, 0, { full: true }),
      attack('allySelf', 1),
    ),
  },
  {
    id: 7255,
    desc: '爆破一行。对第一位敌人造成 [魔法 + 2] 点溅射伤害，并将其打回末位。',
    build: skill(
      explodeChosenRow(),
      dmgSplash('enemyFront', 2, 1),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 7275,
    desc: '对 1 名敌人造成 [魔法 + 9] 点伤害。获得 [魔法 + 9] 点攻击力和生命值。只能施放一次。',
    build: skillOnce(
      dmg('enemyChosen', 9, 1),
      attack('allySelf', 9, 1),
      heal('allySelf', 9, 1),
    ),
  },
  {
    id: 7276,
    desc: '对所有敌人造成 5 点伤害，并将第一名敌人击退至末位。',
    build: skill(
      dmg('enemyAll', 5, 0, { range: 'all' }),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 7277,
    desc: '给予一名盟友 [魔法 + 1] 点生命值，并获得下列其一：创造 6 颗具有该军队法力颜色的宝石，或给予其 2 点魔力值。',
    build: skill(
      heal('allyChosen', 1, 1),
      oneOf([createGems(CASTER, 6)], [magic('lastTarget', 2, 0)]),
    ),
  },
  {
    id: 7320,
    desc: '对 1 名随机敌人造成 [魔法 + 4] 点伤害，并使敌人陷入燃烧或疾病状态。',
    build: skill(
      dmg('enemyRandom', 4, 1),
      // 「或」= 掷签二选一（spell-rules §9.3）；「敌人」指回前段随机目标
      oneOf([inflict('burning', 'lastTarget')], [inflict('disease', 'lastTarget')]),
    ),
  },
  {
    id: 7346,
    desc: '获得一个额外回合。，并获得下列其一：减除全部敌人 [魔法 + 2] 点攻击力，或对所有敌人造成 [魔法 + 2] 点伤害，或爆破 [魔法 + 2] 颗随机宝石。',
    build: skill(
      extraTurn(),
      oneOf(
        [reduce('enemyAll', 'attack', 2, 1)],
        [dmg('enemyAll', 2, 1, { range: 'all' })],
        [explodeRandomGems(2, 1, 'all')],
      ),
    ),
  },
  {
    id: 7348,
    desc: '窃取 1 名敌人 [魔法 + 2] 点生命值，或窃取其法力值。',
    // sa-F1: native Target Enemy; the chosen target sits inside oneOf, so declare it (inputTarget) or no target is picked.
    build: targetedSkill('enemyChosen',
      // 「窃取生命」= 窃取式伤害；「窃取其法力值」无数值 = 全部窃取（「耗尽其法力值」同族口径）
      oneOf(
        [dmg('enemyChosen', 2, 1, { drain: true })],
        [steal('enemyChosen', 'mana', 'mana', 0, 0, { drainAll: true })],
      ),
    ),
  },
  {
    id: 7355,
    desc: '所有其他盟友获得 [(魔法 / 2) + 3] 点法力值和 5 点魔力值。只能施放一次。',
    build: skillOnce(
      mana('allyOthers', 3, 0.5),
      magic('allyOthers', 5, 0),
    ),
  },
  {
    id: 7356,
    desc: '对 1 名敌人造成 [魔法 + 40] 点伤害并光荣地死去。（很明显）只能施放一次。',
    build: skillOnce(
      dmg('enemyChosen', 40, 1),
      // 「光荣地死去」= 自毁（spell-rules §11 追加：自毁 = sacrifice allySelf）
      sacrifice('allySelf'),
    ),
  },
  {
    id: 7373,
    desc: '对 1 名随机敌人造成 [魔法 + 1] 点伤害。转化为一只随机龙族。',
    build: skill(
      dmg('enemyRandom', 1, 1),
      // 「转化为」主语缺省 = 自我变身（与 7629/7630/7631/7440/7441 变身链同款，batch-r4 先例）
      transformTroopRandom('allySelf', DRAGON_REFS),
    ),
  },
  {
    id: 7394,
    desc: '随机爆破两颗宝石。对所有敌人造成 [(魔法 / 2) + 3] 点伤害，伤害值因自身的护甲值而增强，并摧毁自身。 [2:1]',
    build: skill(
      explodeRandomGems(2, 0, 'all'),
      dmg('enemyAll', 3, 0.5, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
      sacrifice('allySelf'),
    ),
  },
  {
    id: 7397,
    desc: '摧毁 1 行并将第一名敌人击退至末位。',
    build: skill(
      destroyChosenRow(),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 7415,
    desc: '对 1 名敌人造成 [魔法 + 2] 点真实伤害。如果敌人使用黄色法力值，则造成双倍伤害。如果敌人是恶魔，则获得一个额外回合。',
    build: skill(
      trueDmg('enemyChosen', 2, 1, { condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Yellow } } }),
      extraTurn({ ifCond: { kind: 'enemyRacePresent', race: 'Daemon' } }),
    ),
  },
  {
    id: 7436,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害，伤害值因敌方攻击力而增强。冻结敌人。 [2:1]',
    build: skill(
      // 裸「因敌人X而增强」= enemyStatSum（batch-r6 8866 同款）
      // Native 7436: CountAttack@FromTarget 50 = the damaged enemy's own Attack [2:1] (was the sum over all enemies).
      dmg('enemyChosen', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
      inflict('frozen', 'lastTarget'),
    ),
  },
  {
    id: 7439,
    desc: '对 1 名敌人造成 [魔法 + 1] 点伤害并将其拉至首位。',
    build: skill(
      dmg('enemyChosen', 1, 1),
      reposition('enemyChosen', 'front'),
    ),
  },
  {
    id: 7440,
    desc: '对 1 名敌人造成 [魔法 + 6] 点伤害，将所有紫色宝石转换为蓝色宝石以强化效果。转化为一名村民。 [1:1]',
    build: skill(
      // 「转换…以强化」句式：转化段先执行，transformedGems 来源才数得到（batch-12 7215 同款）
      transform(BaseColor.Purple, BaseColor.Blue),
      dmg('enemyChosen', 6, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'transformedGems' } } }),
      transformTroop('allySelf', 'Werewolf'),
    ),
  },
  {
    id: 7441,
    desc: '将黄色宝石转换为棕色。转化为一名狼人。',
    // sa-F1 (R001): native s0 Transform@Self (Werewolf 6294) runs before s2 ConvertGems Yellow>Brown.
    build: skill(
      transformTroop('allySelf', 'Werewolf'),
      transform(BaseColor.Yellow, BaseColor.Brown),
    ),
  },
  {
    id: 7454,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因自身的攻击力、生命值、护甲值而增强。若敌人攻击力低于自身，则伤害翻倍。 [20:3]',
    build: skill(
      dmg('enemyChosen', 3, 1, {
        condMult: { times: 2, cond: { kind: 'casterStatBeatsTarget', stat: 'attack' } },
        modifier: {
          mod: { kind: 'ratio', a: 20, b: 3 },
          pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [{ kind: 'selfStat', stat: 'attack' }, { kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }],
        },
      }),
    ),
  },
  {
    id: 7500,
    desc: '对 1 名随机敌人造成 [魔法 + 5] 点伤害并将其冻结。创造 7 颗蓝色宝石。',
    build: skill(
      dmg('enemyRandom', 5, 1),
      inflict('frozen', 'lastTarget'),
      createGems(BaseColor.Blue, 7),
    ),
  },
  {
    id: 7504,
    desc: '对两名最强大的敌人造成 [魔法 + 1] 点伤害，伤害值因自身护甲值而增强。 [2:1]',
    build: skill(
      dmg('enemyHealthiestN', 1, 1, {
        n: 2,
        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } },
      }),
    ),
  },
  {
    id: 7599,
    desc: '对一名随机敌人造成 [魔法 + 5] 点伤害。将所有蓝色宝石转换成绿色以增强效果。使所有敌人陷入妖火状态。 [2:1]',
    build: skill(
      // 「转换…以增强」句式：转化段先执行，transformedGems 来源才数得到（batch-12 7215 同款）
      // sa-F2 fix round A (R001): native CountGems Blue ; Damage ; ConvertGems Blue>Green ; CauseFaerieFire
      dmg('enemyRandom', 5, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      transform(BaseColor.Blue, BaseColor.Green),
      inflict('faerie-fire', 'enemyAll'),
    ),
  },
  {
    id: 7630,
    desc: '对所有敌人造成  [(魔法 / 2) + 1]  点真实伤害，再转化成诺斯费拉图。',
    build: skill(
      trueDmg('enemyAll', 1, 0.5, { range: 'all' }),
      transformTroop('allySelf', 'Nosferatu'),
    ),
  },
  {
    id: 7631,
    desc: '对前两名敌人造成  [魔法 + 4]  点伤害。使他们陷入猎人标记和死亡标记状态。再转化成诺斯费拉图。',
    build: skill(
      // L1-6453-order (R001): native CauseDeathMark -> CauseHuntersMark -> Damage -> Transform Self 6451.
      inflict('death-mark', 'enemyFirstN', { n: 2 }),
      inflict('marked', 'enemyFirstN', { n: 2 }),
      dmg('enemyFirstN', 4, 1, { n: 2 }),
      transformTroop('allySelf', 'Nosferatu'),
    ),
  },
  {
    id: 7635,
    desc: '爆破 4 颗红宝石。对 1 名随机敌人造成 [魔法 + 5] 点伤害，摧毁自身。',
    build: skill(
      explodeRandomGems(4, 0, 'color', BaseColor.Red),
      dmg('enemyRandom', 5, 1),
      // sa-F2 fix round A: native 3:Dispel@Self precedes 4:Damage@Self 10000 (own Barrier must not block it)
      ...['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged'].map(statusId => ({ kind: 'dispel' as const, target: 'allySelf' as const, statusId })),
      sacrifice('allySelf'),
    ),
  },
  {
    id: 7664,
    desc: '对最虚弱的两名敌人造成 [魔法 + 3] 伤害。若敌人身亡，则获得一个额外回合。',
    build: skill(
      dmg('enemyWeakestN', 3, 1, { n: 2 }),
      extraTurn({ ifTargetDied: true }),
    ),
  },
  {
    id: 7673,
    desc: '获得 [魔法 + 20] 点生命值和护甲值。只能施放一次。',
    build: skillOnce(
      // 单方括号管两段：并列数值段共用 scaling（spell-rules §11 追加）
      heal('allySelf', 20, 1),
      armor('allySelf', 20, 1),
    ),
  },
  {
    id: 7696,
    desc: '净化一名盟友并赋予其屏障效果，同时给予其 [(魔法 x 2) + 2] 点生命值。将其移至队伍首位。',
    build: skill(
      cleanse('allyChosen'),
      inflict('barrier', 'allyChosen'),
      heal('allyChosen', 2, 2),
      reposition('allyChosen', 'front'),
    ),
  },
  {
    id: 7791,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人生命值受损，则获得狂怒效果并再造成 10 点伤害。',
    build: skill(
      // 原生：Damage [AddForDamaged 10]（命中前判受损，同一击）→ 击杀则狂怒自身 → 命中后目标受损则狂怒自身。
      // 命中后「目标受损」= chosenTargetDamaged（sa-P P-F3-lasttarget-damaged，读选定目标，自身段也可判定）。
      dmg('enemyChosen', 4, 1, { condBonus: { n: 10, cond: { kind: 'targetHpDamaged' } } }),
      inflict('rage', 'allySelf', { ifTargetDied: true }),
      inflict('rage', 'allySelf', { ifCond: { kind: 'chosenTargetDamaged' } }),
    ),
  },
  {
    id: 7943,
    desc: '获得 [魔法 + 1] 点生命值。如果板面上有 13 颗或更多蓝色宝石，则获得 4 点攻击力。爆破一行或一列。',
    build: skill(
      heal('allySelf', 1, 1),
      attack('allySelf', 4, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 13 } }),
      oneOf([explodeChosenRow()], [explodeChosenCol()]),
    ),
  },
  {
    id: 8042,
    desc: '创造 7 颗绿色宝石和 7 颗红色宝石。召唤 1-2 只恐狼。',
    build: skill(
      createGems(BaseColor.Green, 7),
      createGems(BaseColor.Red, 7),
      summonRef('DireWolf', undefined, { countRange: { min: 1, max: 2 } }),
    ),
  },
  {
    id: 8252,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害，或打乱板面并获得一个额外回合，或爆破 7 颗宝石。',
    build: skill(
      oneOf(
        [dmg('enemyAll', 3, 1, { range: 'all' })],
        [shuffleBoard(), extraTurn()],
        [explodeRandomGems(7, 0, 'all')],
      ),
    ),
  },
  {
    id: 8286,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。冻结 1 到 4 名随机敌人。',
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
      inflict('frozen', 'enemyRandomN', { nRange: { min: 1, max: 4 } }),
    ),
  },
  {
    id: 8291,
    desc: '将一名敌人击回末位。爆破 2 颗宝石，数量因敌人生命值而增强。 [10:1]',
    build: skill(
      reposition('enemyChosen', 'back'),
      // 裸「因敌人生命值而增强」= enemyStatSum hp（batch-r6 8866 同款）
      explodeRandomGems(2, 0, 'all', undefined, {
        modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'enemyStatSum', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 8292,
    desc: '缠绕首 2 名敌人，或给予首 2 名盟友半数法力值。获得一个额外回合。',
    build: skill(
      oneOf(
        [inflict('entangle', 'enemyFirstN', { n: 2 })],
        [mana('allyFirstN', 0, 0, { halve: true, n: 2 })],
      ),
      extraTurn(),
    ),
  },
  {
    id: 8294,
    desc: '对 1 到 4 名随机敌人造成 [魔法 + 4] 点溅射伤害。打乱板面并获得一个额外回合。',
    build: skill(
      // Native steps: one guaranteed wave, then independent 90% / 35% / 25% rolls.
      // Keep the shared wave selector so later hits prefer other living centres.
      dmgSplash('enemyRandomN', 4, 1, { splashChances: [1, 0.9, 0.35, 0.25] }),
      shuffleBoard(),
      extraTurn(),
    ),
  },
  {
    id: 8305,
    desc: '对末位敌人造成 [魔法 + 1] 点真实伤害，有 50% 的几率也对第 3 位敌人造成 [魔法 + 1] 点真实伤害。再使自身下潜。',
    // Native SecondLastEnemy: the penultimate survivor only; the 50% chance
    // applies solely to this second hit, not to the guaranteed last-enemy hit.
    build: skill(
      trueDmg('enemyLast', 1, 1),
      trueDmg('enemySecondLast', 1, 1, { chance: 0.5 }),
      inflict('submerged', 'allySelf'),
    ),
  },
  {
    id: 8369,
    desc: '召唤一名随机恶魔，或使所有敌人和盟友陷入一个随机的状态效果，或对第一名敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      oneOf(
        [summonRandom(DAEMON_REFS)],
        // 随机状态按阵营分池：敌方负面 / 盟友正面（spell-rules §11 补充）
        [inflictRandom('enemyAll'), inflictRandom('allyAll')],
        [dmg('enemyFront', 2, 1)],
      ),
    ),
  },
  {
    id: 8373,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。如果自身身处狂怒状态，则造成双倍伤害。若敌人是一名恶魔，则自身获得狂怒效果。',
    build: skill(
      dmg('enemyChosen', 3, 1, { condMult: { times: 2, cond: { kind: 'selfStatus', statusId: 'rage' } } }),
      // "if the Enemy is a Daemon": lastTargetRace (targetRace on an allySelf segment tested the caster, never fired).
      inflict('rage', 'allySelf', { ifCond: { kind: 'lastTargetRace', race: 'Daemon' } }),
    ),
  },
  {
    id: 8438,
    desc: '杀死一名随机敌人，再跑掉。只能施放一次。',
    // Native: Dispel@RandomEnemy → LethalDamage@FromPrevious → RunAway (sa-F1: dispel first, so a Barrier cannot absorb the kill).
    build: skillOnce(
      ...POSITIVE_STATUS_IDS.map((statusId, index) => dispelStatus(statusId, index === 0 ? 'enemyRandom' : 'lastTarget')),
      dmg('lastTarget', 0, 0, { execute: true }),
      escape(1),
    ),
  },
  {
    id: 8457,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因骷髅头数而增强。再获得一个额外回合或创造 7 颗骷髅头。 [3:1]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardSkulls' } } }),
      oneOf([extraTurn()], [createSkulls(7)]),
    ),
  },
  {
    id: 8460,
    desc: '给予所有盟友 [(魔法 x 1.5) + 1] 点生命值。召唤一名随机科博。再获得一个额外回合或召唤另一名科博。',
    build: skill(
      heal('allyAll', 1, 1.5),
      summonRandom(KOBOLD_REFS),
      oneOf([extraTurn()], [summonRandom(KOBOLD_REFS)]),
    ),
  },
  {
    id: 8486,
    desc: '对一名敌人造成 [魔法 + 4] 点严重的溅射伤害。击晕所有受到伤害的敌人。再打乱敌方队伍队形。',
    build: skill(
      dmgSplash('enemyChosen', 4, 1),
      // 「击晕所有受到伤害的敌人」= enemyAll + targetHpDamaged（batch-r6 7985 同款）
      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetHpDamaged' } }),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 8537,
    desc: '给予前 2 位盟友 [魔法 + 3] 点攻击力，最弱的 2 位盟友 [魔法 + 3] 点生命值，和最强的 2 位盟友 10 点魔力值。',
    build: skill(
      attack('allyFirstN', 3, 1, { n: 2 }),
      heal('allyWeakestN', 3, 1, { n: 2 }),
      magic('allyHealthiestN', 10, 0, { n: 2 }),
    ),
  },
  {
    id: 8544,
    desc: '获得 4 点魔力值。并获得 [魔法 + 1] 点生命值，或对所有敌人造成 [魔法 + 1] 点伤害，或再获得 10 点魔力值。',
    build: skill(
      magic('allySelf', 4, 0),
      oneOf(
        [heal('allySelf', 1, 1)],
        [dmg('enemyAll', 1, 1, { range: 'all' })],
        [magic('allySelf', 10, 0)],
      ),
    ),
  },
  {
    id: 8611,
    desc: '消除一名敌人所有护甲值。再对他和他下面的所有敌人造成 [魔法 + 2] 点伤害。',
    build: skill(
      reduce('enemyChosen', 'armor', 0, 0, { drainAll: true }),
      dmg('enemyChosenAndBelow', 2, 1),
    ),
  },
  {
    id: 8629,
    desc: '对首位敌人造成 [魔法 + 4] 点真实伤害，伤害值因棕色宝石和盟友数而增强。再将他们击回后方。 [x2]',
    build: skill(
      trueDmg('enemyFront', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          // sa-R2 L4b-7094: CountArmyColor Data 5 = Brown allies (not team size).
          sources: [{ kind: 'boardGems', color: BaseColor.Brown }, { kind: 'alliesOfColor', color: BaseColor.Brown }],
        },
      }),
      reposition('enemyFront', 'back'),
      // Native CreateGems 3 ElementalStar (was missing).
      createSpecialGems({ kind: 'elementalStar' }, 3),
    ),
  },
  {
    id: 8690,
    desc: '对一名敌人造成 [魔法 + 4] 点溅射伤害。再使所有受伤害的敌人陷入中毒状态。',
    build: skill(
      dmgSplash('enemyChosen', 4, 1),
      // 「所有受伤害的敌人」= enemyAll + targetHpDamaged（batch-r6 7985 同款）
      inflict('poison', 'enemyAll', { ifCond: { kind: 'targetHpDamaged' } }),
    ),
  },
  {
    id: 8716,
    desc: '对第一个敌人造成 [(魔法 x 2) + 1] – [(魔法 x 4) + 3]点伤害。如果他们死了，爆炸 8 颗宝石。',
    build: skill(
      dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(1, 2), max: scale(3, 4) } }),
      explodeRandomGems(8, 0, 'all', undefined, { ifTargetDied: true }),
    ),
  },
  {
    id: 8736,
    desc: '对一名敌人造成 3-[魔法 + 2] 点伤害。',
    build: skill(dmg('enemyChosen', 0, 0, { rangeSpec: { min: flat(3), max: scale(2, 1) } })),
  },
  {
    id: 8741,
    desc: '对敌人造成 [魔法 + 3] 点伤害。引爆 2 颗与其法力颜色相同的宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      // 「其」= 前段伤害目标 → LAST_TARGET 动态法力色（spell-rules §11 补充）
      explodeRandomGems(2, 0, 'color', 'LAST_TARGET'),
    ),
  },
  {
    id: 8751,
    desc: '对所有敌人造成 [(魔法 x 0.75) + 1] 点伤害，伤害值因自身的攻击力、生命值和护甲值二增强。再将首位敌人打回末位。 [10:1]',
    build: skill(
      dmg('enemyAll', 1, 0.75, {
        range: 'all',
        modifier: {
          mod: { kind: 'ratio', a: 10, b: 1 },
          pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [{ kind: 'selfStat', stat: 'attack' }, { kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }],
        },
      }),
      reposition('enemyFront', 'back'),
    ),
  },
  {
    id: 8826,
    desc: '对所有敌人造成 [(魔法 x 1.5) + 3] 点伤害，或给予所有盟友 [(魔法 x 1.5) + 3] 点生命值。 ',
    build: skill(
      oneOf(
        [dmg('enemyAll', 3, 1.5, { range: 'all' })],
        [heal('allyAll', 3, 1.5)],
      ),
    ),
  },
  {
    id: 8870,
    desc: '摧毁一列。赋予一名随机盟友屏障效果，再给予其 [魔法 + 1] 点护甲值，数值因被摧毁的黄色宝石数而增强。  [1:1]',
    build: skill(
      destroyChosenCol(),
      inflict('barrier', 'allyRandom'),
      // 「再给予其」= 指回前段随机盟友（'lastTarget'，spell-rules §12.3）
      armor('lastTarget', 1, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9000,
    desc: '创造 8-12 黄色宝石，并给予一名盟友 [魔法 + 1] 点护甲值。',
    build: skill(
      createGems(BaseColor.Yellow, 0, 0, { countRange: { min: 8, max: 12 } }),
      armor('allyChosen', 1, 1),
    ),
  },
  {
    id: 9013,
    desc: '对 2 名随机敌人造成 [魔法 + 3] 点伤害，并重组敌人队伍队列。',
    build: skill(
      dmg('enemyRandomN', 3, 1, { n: 2 }),
      shuffleTeam('enemy'),
    ),
  },
  {
    id: 9027,
    desc: '对首 2 位敌人造成 [魔法 + 2] 点伤害，或获得 [魔法 + 2] 点攻击力，或随机摧毁 2 行。',
    build: skill(
      oneOf(
        [dmg('enemyFirstN', 2, 1, { n: 2 })],
        [attack('allySelf', 2, 1)],
        [destroyRandomRows(2, 0)],
      ),
    ),
  },
  {
    id: 9140,
    desc: '创造 8 颗绿色 宝石。召唤 0-3 只驯鹿',
    build: skill(
      createGems(BaseColor.Green, 8),
      summonRef('Caribou', undefined, { countRange: { min: 0, max: 3 } }),
    ),
  },
  {
    id: 9283,
    desc: '创造 1 颗鬼魂宝石。板面上没有一颗蓝色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      createSpecialGems({ kind: 'ghost' }, 1),
      extraTurn({
        chance: 0.07,
        ifCond: { kind: 'not', cond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 1 } },
        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } },
      }),
    ),
  },
  {
    id: 9285,
    desc: '对首 2 位敌人造成 [魔法 + 1] 点伤害。创造 2 颗鬼魂宝石。再摧毁 8 颗宝石。',
    build: skill(
      dmg('enemyFirstN', 1, 1, { n: 2 }),
      createSpecialGems({ kind: 'ghost' }, 2),
      destroyRandomGems(8, 0, 'all'),
    ),
  },
  {
    id: 9291,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因红色宝石数而增强。若自身护甲值更高，则获得屏障效果。 [x2]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),
      inflict('barrier', 'allySelf', { ifCond: { kind: 'casterStatBeatsTarget', stat: 'armor' } }),
    ),
  },
  {
    id: 9292,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。爆破 1-4 颗鬼魂宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      explodeRandomGemsRange(1, 4, 'ghost'),
    ),
  },
  {
    id: 9295,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因鬼魂宝石数而增强。再创造 3 颗鬼魂宝石。 [x8]',
    build: skill(
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'ghost' } } }),
      createSpecialGems({ kind: 'ghost' }, 3),
    ),
  },
  {
    id: 9297,
    desc: '爆破所有冻结宝石。对一名敌人造成 [魔法 + 3] 点伤害，伤害值因爆破的宝石数而增强。 [1:1]',
    build: skill(
      explodeSpecialGems('freezeGem'),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems' } } }),
    ),
  },
  {
    id: 9317,
    desc: '对一名敌人造成 [魔法 + 3] 点溅射伤害，伤害值因攻击力而增强。再将他打回末位。 [2:1]',
    build: skill(
      dmgSplash('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } } }),
      reposition('enemyChosen', 'back'),
    ),
  },
  {
    id: 9319,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。将其 1 法力颜色的 4 颗宝石转换成冻结宝石。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      // 「其 1 法力颜色」= 跨段追踪目标的一种法力色（spell-rules §11 补充 LAST_TARGET）
      transformToSpecial('LAST_TARGET', 'freezeGem', { count: 4 }),
    ),
  },
  {
    id: 9337,
    desc: '创造 2 颗缠绕宝石。板面上每有一颗绿色宝石，则有 7% 的几率获得一个额外回合。 [x7]',
    build: skill(
      createSpecialGems({ kind: 'entangleGem' }, 2),
      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Green } } }),
    ),
  },
  {
    id: 9339,
    desc: '爆破 1 颗宝石。召唤 1-3 只荒芜猎犬。',
    build: skill(
      // 裸单颗宝石操作 = 随机一颗（spell-rules §11 追加）
      explodeAt(CELL),
      summonRef('BlightHound', undefined, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 9346,
    desc: '对首位敌人造成 [魔法 + 3] 点伤害，再将他打回末位。摧毁一个随机列。',
    build: skill(
      dmg('enemyFront', 3, 1),
      reposition('enemyFront', 'back'),
      destroyRandomCols(1, 0),
    ),
  },
  {
    id: 9472,
    desc: '对所有敌人造成[(魔法 x 1.25) + 6]散射伤害，并造成随机状态效果。',
    build: skill(
      dmg('enemyAll', 6, 1.25, { range: 'all' }),
      inflictRandom('enemyAll'),
    ),
  },
  {
    id: 9550,
    desc: '对随机敌人造成 [魔法 + 3] 点伤害。如果他们使用紫色法力值，则恢复我一半的法力值。',
    build: skill(
      dmg('enemyRandom', 3, 1),
      // 「他们使用紫色法力值」按 anyEnemyColor 超集口径（任一存活敌人带该色即真，spell-rules §13.3）
      mana('allySelf', 0, 0, { halve: true, ifCond: { kind: 'anyEnemyColor', color: BaseColor.Purple } }),
    ),
  },
  {
    id: 9651,
    desc: '对一名敌人造成[魔法 + 1]点伤害，伤害值因紫色宝石数量而增强。如果我的魔力值更高，则造成双倍伤害。 [3:1]',
    build: skill(
      dmg('enemyChosen', 1, 1, {
        condMult: { times: 2, cond: { kind: 'casterStatBeatsTarget', stat: 'magic' } },
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
    ),
  },
  {
    id: 9725,
    desc: '爆破 2-4 颗宝石。',
    build: skill(explodeRandomGems(2), { ...explodeRandomGems(1), chance: 0.5 }, { ...explodeRandomGems(1), chance: 0.25 }, dmg('enemyFront', 4, 0.5)),
  },
  {
    id: 9734,
    desc: '赋予一名盟友[魔法 + 1]攻击力并使其获得屏障。如果该盟友是金牛座，则赋予其一半的法力值。',
    build: skill(
      attack('allyChosen', 1, 1),
      inflict('barrier', 'allyChosen'),
      mana('allyChosen', 0, 0, { halve: true, ifCond: { kind: 'targetRace', race: 'Tauros' } }),
    ),
  },
  {
    id: 9777,
    desc: '从 3 个随机敌人身上窃取 [魔法 + 3] 点生命值，受到流血宝石的加成。 [x5]',
    build: skill(
      // 「窃取生命值」= 窃取式伤害（drain），3 名随机敌人同一批
      dmg('enemyRandomN', 3, 1, {
        n: 3,
        drain: true,
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'bleedGem' } },
      }),
    ),
  },
  {
    id: 9792,
    desc: '对一名敌人造成[魔法 + 1]点伤害，伤害受流血宝石和妖精之火宝石加成。然后生成5个流血宝石和5个妖精之火宝石。 [x2]',
    build: skill(
      dmg('enemyChosen', 1, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'boardSpecial', gem: 'bleedGem' }, { kind: 'boardSpecial', gem: 'faerieFireGem' }],
        },
      }),
      createSpecialGems({ kind: 'bleedGem' }, 5),
      createSpecialGems({ kind: 'faerieFireGem' }, 5),
    ),
  },
  {
    id: 9814,
    desc: '对一名敌人造成[魔法 + 4]点伤害，伤害由我的金币加成。然后将4颗敌人同色系的魔法宝石转化为战利品宝石。 [10:1]',
    build: skill(
      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleGold' } } }),
      // 「敌人同色系」= 跨段追踪目标的法力色（LAST_TARGET）；战利品宝石 = bootyGem
      transformToSpecial('LAST_TARGET', 'bootyGem', { count: 4 }),
    ),
  },
  {
    id: 9845,
    desc: '对所有敌人造成[魔法 + 3]点伤害，受半人马盟友加成。若敌人死亡，则所有盟友恢复50%的法力值。 [x2]',
    build: skill(
      dmg('enemyAll', 3, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Centaur' } },
      }),
      mana('allyAll', 0, 0, { halve: true, ifTargetDied: true }),
    ),
  },
  {
    id: 9846,
    desc: '引爆一颗宝石。对随机敌人造成[魔法 + 3]点伤害，伤害值根据被摧毁的黄色宝石数量增加，并对其施加一个随机状态效果。 [x3]',
    build: skill(
      explodeRandomGems(1, 0, 'all'),
      dmg('enemyRandom', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
      inflictRandom('lastTarget'),
    ),
  },
  {
    id: 9865,
    desc: '引爆一颗宝石。造成[魔法 + 8]点散射伤害，被摧毁的黄色宝石数量越多，伤害越高。 [x8]',
    build: skill(
      explodeRandomGems(1, 0, 'all'),
      // 裸散射重裁（2026-09-18）：官方 ScatterDamage@AllEnemies = 全体散射
      dmg('enemyAll', 8, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9942,
    desc: '对敌人造成[魔法 + 4]点伤害，有15%的几率将其击杀，每有一颗蛛网宝石，击杀几率提高3%。 [x3]',
    build: skill(
      // 原生序：LethalDamageConditional 15%（+3%/蛛网宝石）→ Damage [Magic + 4]
      dmg('enemyChosen', 0, 0, {
        execute: true,
        chance: 0.15,
        chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'web' } },
      }),
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 9947,
    desc: '生成5个冰冻宝石和5个蛛网宝石。获得额外回合。',
    build: skill(
      createSpecialGems({ kind: 'freezeGem' }, 5),
      createSpecialGems({ kind: 'web' }, 5),
      extraTurn(),
    ),
  },
  {
    id: 9952,
    desc: '摧毁一行和一列。生成 1 个蛛网宝石，其数量会根据被摧毁的黄色宝石的数量进行加成。 [1:1]',
    build: skill(
      // native RowAndColumn is one step (15 cells, no refill between) (sa-R1)
      destroyChosenCross(),
      createSpecialGems({ kind: 'web' }, 1, 0, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } } }),
    ),
  },
  {
    id: 9954,
    desc: '摧毁随机3行。然后生成3个幽灵宝石和3个屏障宝石。',
    build: skill(
      destroyRandomRows(3, 0),
      createSpecialGems({ kind: 'ghost' }, 3),
      createSpecialGems({ kind: 'barrierGem' }, 3),
    ),
  },
];

export const BATCH_R7: CuratedBatch = { batch: 'R7', spells: SPELLS, skipped: SKIPPED };
