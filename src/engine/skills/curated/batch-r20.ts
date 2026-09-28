/**
 * 放弃桶回收批 R20（2026-09-18）：最终全量扫尾批。
 *
 * 工作面 = 全库 1793 unique spell id 减去全部既有批次（batch-01…39/p37…40/r1…r19）
 * 的 `id: N`（含 SKIPPED 记录）与 library.ts overrides 后的**最后剩余 55 条**
 * （tmp/r20_remaining.json，已扣 library override 7062）。逐条用当前全词汇
 * （Wave B 17 kind / R11-R17 全部新原语 / perDestroyed / convertSpecial / lastReduce /
 * enemiesOfColor / enemiesOfKingdom / kingdomOf / manaFull / countEnemyDeaths 等）重判。
 *
 * 判读依据 = 官方英文原句（data/raw/gow-2026-09-18/troops.en.json stats.spell.desc）
 * 与官方 SpellSteps（data/raw/spells.gow.en.json RawData.Id → SpellSteps），原句优先于机翻 ZH。
 *
 * 本批口径：
 * - 尾缀编码（r19 表推广）：Count 系 Amount/100 = ×N（multiplier 系）；
 *   Amount ≈ 100/N = [N:1]（ratio 系，34→[3:1]/50→[2:1]/100→[1:1]/10→[10:1]）。
 * - Wave4 敌侧来源首批消费：「因紫色的敌人数」= enemiesOfColor（8290）、「蓝色盟友和敌人数」=
 *   alliesOfColor + enemiesOfColor 双来源（8312）。
 * - 「几率与黄金数等量」= chance 0 + chanceBoost battleGold ×1（§11 追加 selfStat magic 同构，8268）。
 * - 「窃取生命并转为护甲」= steal('enemyChosen','hp','armor',…)（9282 hp 窃取 + 7744 转换端点，8274）。
 * - 「每耗掉一点法力值则有 N% 几率吞噬」= chanceBoost drainedMana（9118 口径，8587）。
 * - 「AddForKill 数值翻倍」= 基础段 + 追加段同挂 ifTargetDied（r16 9716 口径，8304）。
 * - 板面/状态计数驱动的「施加状态」（8566）、敌方侧种族计数（8584）、敌方黄金（8568）、
 *   狼化状态施加（8553）等仍无对应原语 → 留弃（见批尾分组）。
 */
import type { CuratedBatch } from './index';
import {
  skill, dmg, trueDmg, heal, armor, attack, magic, mana, reduce, steal,
  inflict, createGems, createSkulls, createSpecialGems, transform, transformToSpecial,
  destroyColor, destroySpecialGems, destroyRandomRows, destroyArea,
  explodeColor, explodeRandomRows, explodeRandomCols, explodeRandomGems,
  oneOf, reposition, summonRef, extraTurn, gainGold, gainSouls, CHOSEN, dispelStatus, devour,
} from '../builders';
import type { SegmentOpts } from '../builders';
import { BaseColor } from '../../types';
import type { Condition, CondMult } from '../effects/secondary';
import type { EffectSegment } from '../prototypes';
import type { TargetMode } from '../targeting';

/** Boss×晋升 3-5 倍（官方 MultiplyForAscensionBoss，r11 口径：倍率取区间下限 3） */
const BOSS_ASC3: CondMult = {
  times: 3,
  cond: { kind: 'allOf', of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }] },
};

/** 高塔/防御塔×晋升 3-5 倍（官方 MultiplyForAscensionCastle，r16 口径） */
const CASTLE_ASC3: CondMult = {
  times: 3,
  cond: { kind: 'allOf', of: [{ kind: 'targetRace', race: 'Castle' }, { kind: 'ascended', min: 3 }] },
};

/** 「消除(一名/所有)敌人正面增益」= 按正面状态逐一驱散（spell-rules §6 口径，r18 同款助手） */
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
  { id: 8406, reason: '二次缩放来源不支持（「每有一名法力值满值的敌人则创造」= 官方 CountEnemiesFullMana 计数无对应来源 kind；quarter mana/15% 自毁本身可表达）' },
  { id: 8533, reason: '语义拿不准（「若敌人是元素则赋予盟友法印」——目标相对条件按本段 allyOthers 目标过滤会错滤，跨段目标种族条件无原语，r18 8182 口径）' },
  { id: 8550, reason: '语义拿不准（「否则就使他陷入死亡标记」= ifTargetDied 取反的幸存条件无原语，r17 8374 口径）' },
  { id: 8553, reason: '缺失状态（「陷入狼化状态」不在 STATUS_WHITELIST、引擎无狼化变形机制，spell-rules §7；创造/几率段本身可表达）' },
  { id: 8566, reason: '语义拿不准（「板面上每有一颗狼化宝石则使随机敌人陷入死亡标记」= 板面计数驱动施加，status 段无计数驱动位，r16 9252/9287 口径）' },
  { id: 8567, reason: '句子式不明（「若板面上有狼化宝石」条件——boardAtLeast 只计基色/骷髅，特殊宝石在场条件不在条件域；收回法力本身可表达）' },
  { id: 8568, reason: '二次缩放来源不支持（窃取敌方黄金 CountEnemyGold/TakeEnemyGold 无对应池与来源，r19 8859/8904、r18 8087 口径）；耗蓝+冻结本身可表达' },
  { id: 8573, reason: '语义拿不准（「纳迦族则几率翻倍」= 概率的条件倍率无原语，chanceBoost 仅加算百分点；「否则则造成伤害」= 幸存反向条件亦无原语，r17 8374 口径）' },
  { id: 8584, reason: '二次缩放来源不支持（「敌人队伍里的野兽数」= 敌方侧种族计数 enemiesOfRace 无对应 kind，r17/r19 同口径）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 8268,
    desc: '移除所有棕色宝石，每移除一颗宝石则获得 2 黄金。有与黄金数等量的几率召唤一名机械鼠。 [1:1]',
    // 「每移除一颗宝石获得 2 黄金」= gainGold 挂 destroyedGems Brown ×2（8936 口径，清除段前移）；
    // 「与黄金数等量的几率」= chance 0 + chanceBoost battleGold ×1（§11 追加）；[1:1] = CountMyGold 100 序列化
    build: skill(
      destroyColor(BaseColor.Brown),
      gainGold(0, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems', color: BaseColor.Brown } } }),
      summonRef('MechaRat', 6849, { chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'battleGold' } } }),
    ),
  },
  {
    id: 8270,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得狂怒效果，或摧毁一行。',
    // 「狂怒或摧毁一行」= oneOf（官方两变体步骤，公共伤害段抽出，r15 8744 口径）；狂怒 = enraged（R10 拼写）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      oneOf(
        [inflict('enraged', 'allySelf')],
        [destroyRandomRows(1)],
      ),
    ),
  },
  {
    id: 8274,
    desc: '诅咒一名敌人并窃取其 [(魔法 / 2) + 1] 点生命值，数值因自身的灵魂数量而增强。再将其转换成护甲值。 [3:1]',
    // 「窃取生命并转为护甲」= steal hp→armor（9282 hp 窃取 + 7744 转换端点口径）；
    // [3:1] = CountMySouls 34 → ratio 3:1 battleSouls（r19 编码表）
    build: skill(
      inflict('curse', 'enemyChosen'),
      steal('enemyChosen', 'hp', 'armor', 1, 0.5, {
        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'battleSouls' } },
      }),
    ),
  },
  {
    id: 8275,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。燃烧所有敌人。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      inflict('burning', 'enemyAll'),
    ),
  },
  {
    id: 8290,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因紫色的敌人数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x4]',
    // 「因紫色的敌人数 [x4]」= enemiesOfColor Purple（Wave4 来源，CountArmyColor@AllEnemies 400）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemiesOfColor', color: BaseColor.Purple } },
        condMult: BOSS_ASC3,
      }),
    ),
  },
  {
    id: 8295,
    desc: '创建 8-12 颗紫色宝石，并给予所有紫色盟友四分之一的法力值。',
    // 「8-12 颗」= countRange（§9.8）；「所有紫色盟友」= targetColor 逐目标过滤（9178 口径）；「四分之一」= fraction
    build: skill(
      createGems(BaseColor.Purple, 0, 0, { countRange: { min: 8, max: 12 } }),
      mana('allyAll', 0, 0, { fraction: 0.25, ifCond: { kind: 'targetColor', color: BaseColor.Purple } }),
    ),
  },
  {
    id: 8296,
    desc: '创建 8 颗骷髅头或 8 颗末日骷髅头，数值因自身拥有的灵魂数而增强。召唤一名铁\n颚。 [10:1]',
    // 「骷髅或末日骷髅」= oneOf（官方两变体步骤，召唤段公共抽出）；[10:1] = CountMySouls 10 → battleSouls
    build: skill(
      oneOf(
        [createSkulls(8, 0, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleSouls' } } })],
        [createSpecialGems({ kind: 'doomSkull' }, 8, 0, { modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'battleSouls' } } })],
      ),
      summonRef('Ironjaw', 6873),
    ),
  },
  {
    id: 8298,
    desc: '对一名敌人造成 [魔法 + 6] 点伤害，伤害值因其攻击力而增强。获得 10 个灵魂。 [1:1]',
    // [1:1] = CountAttack@FromTarget 100 → ratio 1:1 targetStat attack（9951 口径）
    build: skill(
      dmg('enemyChosen', 6, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),
      gainSouls(10),
    ),
  },
  {
    id: 8302,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。若敌人是不死族，则造成双倍伤害并有 50% 的几率将其吞噬。获得 5 点生命值。',
    // 「若不死族双倍」= condMult targetRace；「50% 吞噬」= execute + chance + 同条件（8979 口径）
    // sa-F1 (R001): native ConsumeConditional (a real Devour) -> IncreaseHealth 5 -> Damage x2, same as the 7211 family.
    build: skill(
      devour('enemyChosen', { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Undead' } }),
      heal('allySelf', 5, 0),
      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetRace', race: 'Undead' } } }),
    ),
  },
  {
    id: 8304,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。获得 12 点生命值和护甲值。若敌人身亡，则数值翻倍。',
    // 「若敌人身亡则数值翻倍」= AddForKill 12 实锤 → 基础 12 + 追加 12 段同挂 ifTargetDied（9716 口径）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      heal('allySelf', 12, 0),
      armor('allySelf', 12, 0),
      heal('allySelf', 12, 0, { ifTargetDied: true }),
      armor('allySelf', 12, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8309,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。再耗掉所有敌人 2 点法力值。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      reduce('enemyAll', 'mana', 2, 0),
    ),
  },
  {
    id: 8312,
    desc: '对一名敌人造成 [魔法 + 4] 伤害，伤害值因蓝色盟友和敌人数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x3]',
    // 「蓝色盟友和敌人数 [x3]」= alliesOfColor + enemiesOfColor 双来源各 ×3（7650 双计数口径）
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'enemiesOfColor', color: BaseColor.Blue }],
        },
        condMult: BOSS_ASC3,
      }),
    ),
  },
  {
    id: 8382,
    desc: '对一名敌人造成 [(魔法 x 2) + 7] 点伤害，有 10% 的几率吞噬敌人，几率因红色宝石和陷入燃烧状态的敌人而增强。若敌人身亡，则创造 9 颗红色宝石。 [x4]',
    // 「几率因红宝石+燃烧敌人增强 [x4]」= chanceBoost 双来源各 ×4（9755 口径）；「若敌人身亡创造」= ifTargetDied
    build: skill(
      // sa-R5 L1-devour-first (R001): native ConsumeConditional (a real Devour) precedes the Damage.
      devour('enemyChosen', {
        chance: 0.1,
        chanceBoost: {
          mod: { kind: 'multiplier', a: 4 },
          sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'enemyStatusCount', statusId: 'burning' }],
        },
      }),
      dmg('enemyChosen', 7, 2),
      createGems(BaseColor.Red, 9, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8388,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。如果敌人身亡，则创造 11 颗蓝色宝石。',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      createGems(BaseColor.Blue, 11, 0, { ifTargetDied: true }),
    ),
  },
  {
    id: 8390,
    desc: '按 X 形摧毁宝石。赋予 2 名随机盟友法印效果。',
    // 「按 X 形摧毁」= destroyArea('x')（官方 BoardTarget Diagonals，7463 口径）
    build: skill(
      destroyArea('x', 'destroy'),
      inflict('enchanted', 'allyRandomPrefNotPrevN', { n: 2 }),
    ),
  },
  {
    id: 8421,
    desc: '给予一名盟友 2 点魔力值，和半数法力值。若他是龙族，则赋予其屏障和法印效果。',
    // 「半数法力」= mana halve（§9.6，按其自身 manaCost 现算）；「若他是龙族」= targetRace 挂 lastTarget 段（目标域正确）
    build: skill(
      magic('allyChosen', 2, 0),
      mana('lastTarget', 0, 0, { halve: true }),
      inflict('barrier', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Dragon' } }),
      inflict('enchanted', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Dragon' } }),
    ),
  },
  {
    id: 8469,
    desc: '给予一名盟友 4 点魔力值而等于其法力的半数法力值。若他是一名妖仙，则给予其赐福和法印效果。',
    // 同 8421 结构，妖仙 = Fey、赐福+法印
    build: skill(
      magic('allyChosen', 4, 0),
      mana('lastTarget', 0, 0, { halve: true }),
      inflict('blessed', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Fey' } }),
      inflict('enchanted', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Fey' } }),
    ),
  },
  {
    id: 8471,
    desc: '对第首位和末位敌人造成 [魔法 + 4] 点伤害。各有 10% 的几率吞噬敌人，每有一名下潜的敌人或盟友吞噬几率则增强 +3%。 [x3]',
    // 「首位和末位」= enemyFront/enemyLast 两段；「几率 +3%/名下潜者 [x3]」= chance 0.1 + chanceBoost
    // allyStatusCount/enemyStatusCount submerged 双来源各 ×3（官方两步 ConsumeConditional 独立掷签）
    build: skill(
      // sa-R5 L1-devour-first (R001): native ConsumeConditional@FrontEnemy, ConsumeConditional@LastEnemy (real Devours),
      // then Damage@FirstLastEnemies on whoever is first/last after the devours.
      ...(['enemyFront', 'enemyLast'] as const).map(t => devour(t, {
        chance: 0.1,
        chanceBoost: {
          mod: { kind: 'multiplier', a: 3 },
          sources: [{ kind: 'allyStatusCount', statusId: 'submerged' }, { kind: 'enemyStatusCount', statusId: 'submerged' }],
        },
      })),
      dmg('enemyFront', 4, 1),
      dmg('enemyLast', 4, 1),
    ),
  },
  {
    id: 8473,
    desc: '选定一个颜色以移除所有同色宝石。消除第一名敌人所有正面增益效果，并耗掉他们的法力值。耗掉的法力值数与被移除的宝石数等同。 [1:1]',
    // 「消除正面增益」= dispelPositives（§6 口径，ZH 明示正面增益）；「耗蓝=被移除宝石数 [1:1]」=
    // lastReduce 同族跨段数值绑定——destroyedGems 无色计数（8473 官方 DecreaseMana UseCounterForAmount）
    build: skill(
      destroyColor(CHOSEN),
      ...dispelPositives('enemyFront'),
      reduce('enemyFront', 'mana', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8476,
    desc: '把自己拉到首位，并击晕第一位敌人。再爆破 1 颗随机宝石，数量因自身的生命值而增强。 [10:1]',
    // 「拉到首位」= reposition（§12.1）；[10:1] = CountLife 10 → ratio 10:1 selfStat hp（9281 口径）
    build: skill(
      reposition('allySelf', 'front'),
      inflict('stun', 'enemyFront'),
      explodeRandomGems(1, 0, 'all', undefined, {
        modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      }),
    ),
  },
  {
    id: 8484,
    desc: '爆破 1 行或 1 列。再将末位敌人拉到首位。',
    // 「行或列」= oneOf（官方两变体步骤，击退段公共抽出，9663 口径）
    build: skill(
      oneOf(
        [explodeRandomRows(1)],
        [explodeRandomCols(1)],
      ),
      reposition('enemyLast', 'front'),
    ),
  },
  {
    id: 8501,
    desc: '获得 [魔法 + 1] 黄金。淹没自己，沉入海底并获得额外的转向。',
    // 「淹没自己」= submerged；「沉入海底」= reposition back（§12.1）
    build: skill(
      gainGold(1, 1),
      inflict('submerged', 'allySelf'),
      reposition('allySelf', 'back'),
      extraTurn(),
    ),
  },
  {
    id: 8503,
    desc: '创造 3 颗黄色宝石。对一名敌人造成 [魔法 + 3] 点伤害，伤害值因黄色宝石数而增强。赋予自己法印效果。 [2:1]',
    // 「迷惑自己」机翻，EN/ST = Enchant myself → 法印（R10 口径）；[2:1] = CountGems Yellow 50 → boardGems
    build: skill(
      createGems(BaseColor.Yellow, 3),
      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),
      inflict('enchanted', 'allySelf'),
    ),
  },
  {
    id: 8538,
    desc: '将所有绿色宝石转换成狼化宝石，所有黄色宝石转换成末日骷髅头。召唤一名寒冬狼或瓦格。',
    // 狼化宝石 = lycanthropyGem（波B 落地）；「寒冬狼或瓦格」= oneOf（官方两变体步骤）
    build: skill(
      transformToSpecial(BaseColor.Green, 'lycanthropyGem'),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
      oneOf(
        [summonRef('WinterWolf', 6196)],
        [summonRef('Warg', 6282)],
      ),
    ),
  },
  {
    id: 8545,
    desc: '造成 [魔法 + 8] 点散射伤害。有 75% 的几率给予所有盟友法印效果。',
    // 裸散射 = 全体散射（§0 官方口径）
    build: skill(
      dmg('enemyAll', 8, 1, { range: 'all' }),
      inflict('enchanted', 'allyAll', { chance: 0.75 }),
    ),
  },
  {
    id: 8548,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害。个别有 50% 几率获得 [魔法 + 1] 点攻击力，一个额外回合和获得屏障、法印或赐福效果。',
    // 「个别 50%」= 官方五步独立掷签（IncreaseAttack/ExtraTurn/CauseBarrier/CauseEnchanted/CauseBlessed 各 50%）
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all' }),
      attack('allySelf', 1, 1, { chance: 0.5 }),
      extraTurn({ chance: 0.5 }),
      inflict('barrier', 'allySelf', { chance: 0.5 }),
      inflict('enchanted', 'allySelf', { chance: 0.5 }),
      inflict('blessed', 'allySelf', { chance: 0.5 }),
    ),
  },
  {
    id: 8549,
    desc: '消除一名敌人 [魔法 + 1] 点随机技能值，数量因自身灵魂数而增强。移除所有黄色宝石。 [2:1]',
    // 「消除随机技能值」= reduce stat random（R12 DecreaseRandom）；[2:1] = CountMySouls 50 → battleSouls
    build: skill(
      reduce('enemyChosen', 'random', 1, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleSouls' } } }),
      destroyColor(BaseColor.Yellow),
    ),
  },
  {
    id: 8551,
    desc: '每有一颗紫色宝石则获得 1 个灵魂。再爆破所有紫色宝石。 [1:1]',
    // 灵魂 = 1 × 板面紫宝石数（boardGems Purple ×1，economy 段支持 modifier）；先计数后爆破（ZH 段序）
    build: skill(
      gainSouls(0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
      explodeColor(BaseColor.Purple),
    ),
  },
  {
    id: 8552,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，伤害值因自身的灵魂数而增强。 [2:1]',
    // [2:1] = CountMySouls 50 → ratio 2:1 battleSouls
    build: skill(
      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'battleSouls' } } }),
    ),
  },
  {
    id: 8558,
    desc: '创造 6 颗绿色宝石。再将所有绿色宝石转换成狼化宝石。召唤 1-3 个寒冬狼。',
    // 「1-3 个」= 官方三步 SummoningNoError（100%/50%/50%）逐次独立掷签（9756 口径）
    build: skill(
      createGems(BaseColor.Green, 6),
      transformToSpecial(BaseColor.Green, 'lycanthropyGem'),
      summonRef('WinterWolf', 6196),
      summonRef('WinterWolf', 6196, { chance: 0.5 }),
      summonRef('WinterWolf', 6196, { chance: 0.5 }),
    ),
  },
  {
    id: 8565,
    desc: '耗掉所有敌人 2 点法力值。每有一颗狼化宝石则再耗掉 2 点法力值。再创造 1-3 颗狼化宝石。 [x2]',
    // 「每颗狼化宝石再耗 2 [x2]」= reduce 段挂 boardSpecial lycanthropyGem ×2（9345 debuff 段 modifier 口径）
    build: skill(
      reduce('enemyAll', 'mana', 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
      createSpecialGems({ kind: 'lycanthropyGem' }, 0, 0, { countRange: { min: 1, max: 3 } }),
    ),
  },
  {
    id: 8571,
    desc: '对首位和末位敌人造成 [魔法 + 2] 点真实伤害。板面上每有一颗狼化宝石则创造 3 颗末日骷髅头。 [x3]',
    // 「每颗狼化宝石创造 3 [x3]」= createSpecialGems 挂 boardSpecial ×3（7953 创造数 modifier 口径）
    build: skill(
      trueDmg('enemyFront', 2, 1),
      trueDmg('enemyLast', 2, 1),
      createSpecialGems({ kind: 'doomSkull' }, 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
    ),
  },
  {
    id: 8574,
    desc: '耗掉一名敌人 8 点法力值。板面上每有一颗骷髅头则有 4%  的几率吞噬敌人。 [x4]',
    // 「每颗骷髅 +4% 吞噬几率」= chance 0 + chanceBoost boardSkulls ×4（8817 口径）
    build: skill(
      // sa-R5 L1-devour-first (R001): native ConsumeConditional (4%/Skull, a real Devour) precedes DecreaseMana 8.
      devour('enemyChosen', { chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSkulls' } } }),
      reduce('enemyChosen', 'mana', 8, 0),
    ),
  },
  {
    id: 8575,
    desc: '对末位敌人造成 [魔法 + 2] 点伤害并冻结他。若敌人已被冻结，则有 20% 的几率吞噬敌人。',
    // sa-R5 (R001): native ConsumeConditional@LastEnemy (20% if ALREADY Frozen) -> Damage@LastEnemy -> CauseFrozen@LastEnemy.
    // Old order froze first (the 20% always qualified) and used a plain execute instead of Devour.
    build: skill(
      devour('enemyLast', { chance: 0.2, ifCond: { kind: 'targetStatus', statusId: 'frozen' } }),
      dmg('enemyLast', 2, 1),
      inflict('frozen', 'enemyLast'),
    ),
  },
  {
    id: 8579,
    desc: '对末位敌人造成 [(魔法 / 2) + 3] 点伤害，伤害值因狼化宝石数而增强。 [x10]',
    // [x10] = CountGems Lycanthropy 1000 → boardSpecial lycanthropyGem ×10
    build: skill(
      dmg('enemyLast', 3, 0.5, {
        modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
    ),
  },
  {
    id: 8580,
    desc: '板面上每有一颗狼化宝石，则给予所有其他盟友 3 点法力值。再将黄色宝石转换成骷髅头。 [x3]',
    // 「每颗狼化宝石 +3 法力 [x3]」= buff 段挂 boardSpecial ×3（8088 mana 段 modifier 口径）
    build: skill(
      // L3-015: native GenerateMana UseCounterForAmount (no Amount) = 3 x count only
      mana('allyOthers', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } },
      }),
      transform(BaseColor.Yellow, 'SKULL'),
    ),
  },
  {
    id: 8582,
    desc: '使一名敌人陷入出血状态。若敌人使用蓝色法力值，则叠加 2 次出血状态。每有一颗狼化宝石，则有 5% 的几率吞噬敌人。 [x5]',
    // 「蓝色法力再叠 2 次」= AddForBlueTarget ×2 实锤 → 两段条件出血（叠层累加合并）；
    // 「每颗狼化宝石 +5%」= chance 0 + chanceBoost boardSpecial ×5
    build: skill(
      // sa-R5 L1-devour-first (R001): native ConsumeConditional (5%/Lycanthropy Gem) is a real Devour and runs first.
      devour('enemyChosen', { chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'boardSpecial', gem: 'lycanthropyGem' } } }),
      inflict('bleed', 'enemyChosen'),
      inflict('bleed', 'lastTarget', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
      inflict('bleed', 'lastTarget', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),
    ),
  },
  {
    id: 8583,
    desc: '摧毁所有狼化宝石。创造 8 颗红色宝石，数值因被摧毁的宝石数而增强。 [x3]',
    // [x3] = destroyedGems 无色计数（本cast 摧毁的即全部狼化宝石，口径等价）
    build: skill(
      destroySpecialGems('lycanthropyGem'),
      createGems(BaseColor.Red, 8, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'destroyedGems' } },
      }),
    ),
  },
  {
    id: 8587,
    desc: '耗掉一名敌人 6 点法力值。对其造成 [魔法 + 2] 点伤害。每耗掉一个法力值则有 2% 的几率吞噬敌人。 [x2]',
    // 「每耗 1 法力 +2% 吞噬」= chance 0 + chanceBoost drainedMana ×2（9118 口径）；「对其」= lastTarget
    build: skill(
      // sa-R5 L1-7059: native DecreaseMana 6 -> ConsumeConditional (2%/drained Mana, CountMax 12) -> Damage.
      // Devour (caster gains stats), not a plain execute, and it precedes the damage (R001).
      reduce('enemyChosen', 'mana', 6, 0),
      devour('lastTarget', { chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'drainedMana' } } }),
      dmg('lastTarget', 2, 1),
    ),
  },
  {
    id: 8609,
    desc: '选择一名敌人。10%的可能将他吞噬掉，由计分板上的蓝色宝石数决定。否则对敌人造成[魔法 + 4]点伤害。 [x4]',
    // 「否则」为机翻噪声——官方步骤 Damage 无条件恒发（按 ST 组装，7652 口径）；
    // [x4] = CountGems Blue 400 → chanceBoost boardGems Blue ×4
    build: skill(
      // sa-R5 L1-devour-first: native ConsumeConditional = Devour (caster gains stats), not a plain execute.
      devour('enemyChosen', { chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),
      dmg('enemyChosen', 4, 1),
    ),
  },
  {
    id: 8636,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，若对方是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。板面上每有一颗元素星则获得 2 点魔力值。 [x2]',
    // [x2] = CountGems ElementalStar 200 → boardSpecial elementalStar ×2（8125 天使宝石同族）
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: BOSS_ASC3 }),
      // sa-F3: native IncreaseSpellPower UseCounter (no Amount) = 2 x count only（8638 同款）
      magic('allySelf', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'elementalStar' } },
      }),
    ),
  },
  {
    id: 8638,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害。如果敌人是个高塔，则基于我已晋升的稀有度造成 3 到 5 倍伤害。板面上每有一颗元素星则获得 2 点法力值。 [x2]',
    build: skill(
      dmg('enemyChosen', 4, 1, { condMult: CASTLE_ASC3 }),
      // L3-015: native GenerateMana UseCounterForAmount (no Amount) = 2 x count only
      mana('allySelf', 0, 0, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'elementalStar' } },
      }),
    ),
  },
  {
    id: 8650,
    desc: '赋予 2 名随机盟友法印效果。板面上每有一颗紫色宝石则有 7% 的几率获得一个额外回合。 [x7]',
    // [x7] = CountGems Purple 700 → chanceBoost boardGems Purple ×7（8861 口径）
    build: skill(
      inflict('enchanted', 'allyRandomPrefNotPrevN', { n: 2 }),
      extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),
    ),
  },
  {
    id: 8652,
    desc: '创建 3 颗通配宝石。若有盟友拥有法印效果，则获得一个额外回合。再赋予一名随机盟友法印效果。',
    // 「3 颗通配」= 官方三步 WildCard2/3/4 各一颗（tier 分档实锤）；「若有盟友法印」= anyAllyStatus 全局条件
    build: skill(
      createSpecialGems({ kind: 'wildcard', tier: 2 }, 1),
      createSpecialGems({ kind: 'wildcard', tier: 3 }, 1),
      createSpecialGems({ kind: 'wildcard', tier: 4 }, 1),
      extraTurn({ ifCond: { kind: 'anyAllyStatus', statusId: 'enchanted' } }),
      inflict('enchanted', 'allyRandom'),
    ),
  },
  {
    id: 8681,
    desc: '有 10% 的几率吞噬一名随机敌人，每有一颗通配宝石则几率增加 +10%。再将所有骷髅头转换成 x2 通配宝石。 [x10]',
    // [x10] = CountGems WildCard 1000（三 tier 合并按 kind 计数）→ chanceBoost boardSpecial wildcard ×10；
    // 「骷髅→x2 通配」= transformToSpecial（引擎 wildcard tier 缺省 ?? 2 等价官方 WildCard2，9614 口径）
    build: skill(
      dmg('enemyRandom', 0, 0, {
        execute: true,
        chance: 0.1,
        chanceBoost: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'boardSpecial', gem: 'wildcard' } },
      }),
      transformToSpecial('SKULL', 'wildcard'),
    ),
  },
  {
    id: 8687,
    desc: '赐予一名盟友法印效果，并给予其 3 点魔力值。再创建 12 颗其法力颜色之一的宝石。',
    // 【挽救】r19 8737 卡点回收：「其法力颜色之一」= LAST_TARGET（前序 chosen 段更新跨段追踪，
    // 首段回退 chosenTargetId，9745/8216 口径）；「发力」为「法力」误植
    build: skill(
      inflict('enchanted', 'allyChosen'),
      magic('allyChosen', 3, 0),
      createGems('LAST_TARGET', 12),
    ),
  },
];

/**
 * 本批留弃 9 条（按卡点分组；即全库收口后的最终不可表达集合）：
 *
 * 【二次缩放来源不支持】8406（满蓝敌人数 CountEnemiesFullMana）、8568（敌方黄金
 *   CountEnemyGold/TakeEnemyGold）、8584（敌方侧种族计数 enemiesOfRace）。
 * 【条件域缺口】8567（特殊宝石在场条件——boardAtLeast 只计基色/骷髅）；
 *   8533（跨段目标种族条件——目标相对条件辖 allyOthers 段会错滤，r18 8182 口径）。
 * 【幸存/反向死亡条件】8550、8573（「否则」分支 = ifTargetDied 取反无原语；8573 另有
 *   「纳迦族几率翻倍」概率条件倍率无原语）。
 * 【缺失状态】8553（狼化不在 STATUS_WHITELIST、引擎无变形机制，§7）。
 * 【状态段计数驱动】8566（板面狼化宝石数驱动施加死亡标记，r16 9252/9287 口径）。
 */
export const BATCH_R20: CuratedBatch = { batch: 'R20', spells: SPELLS, skipped: SKIPPED };
