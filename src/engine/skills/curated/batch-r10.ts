/**
 * 放弃桶回收批 R10（2026-09-17）：正面状态族落地解锁批。
 *
 * 背景：R9 报告 31 条放弃条目卡在四个缺失状态——blessed 14 / mirror 5 / enraged 4 / enchanted 8。
 * 本批前置工作（引擎侧）：
 * - 赐福 blessed（官方帮助中心 + wiki 状态表交叉核实）：施加时净化全部负面状态；存续期间
 *   免疫一切状态施加；与诅咒互相抵消；纯时限到期（官方无「施法/骷髅后结束」条款）。
 * - 附魔 enchanted：持有者每回合开始 +2 法力，直到其施放法术（TurnEngine 施法口在效果
 *   执行前移除；turns 仅兜底；沉默期间不可获得）。
 * - 反射 reflect：所受伤害 50% 反弹给来源（至少 1 点），受一次伤害后消失。gowhead 官方
 *   步骤名为 CauseMirror、中文数据译「反射」——与 traits.json mirrorimage/reflectivesurface
 *   既有拼写 `reflect` 对齐，消费点在 CombatResolver（骷髅）与 damageOne（法术）。
 * - 激怒 enraged：考证确认为狂怒 rage 同族（骷髅 1.5x·无视特质·攻击后逝），引擎既有
 *   RAGE_STATUS_IDS 已含别名，本批仅 STATUS_WHITELIST 放行组装。
 * 同批：STATUS_WHITELIST 扩容（blessed/enchanted/reflect/enraged）+ 单测
 * tests/unit/positiveStatus.test.ts + spell-rules.md §6/§7 词表更新。
 *
 * 本批口径（沿 R8/R9 实锤）：
 * - 「受祝福/被激怒/被附魔的盟友（和敌人）数而增强」= allyStatusCount/enemyStatusCount
 *   （多来源计数相加 ×[xN]，8637/9776 先例）。
 * - 「被摧毁的宝石数」= destroyedGems 无色（R8 9639 先例）；点名颜色时筛色（9790 先例）。
 * - 「与其法力颜色相同的宝石」= ColorSpec 'LAST_TARGET'（跨段追踪目标法力色，9540 先例）。
 * - 「RandomAlly + RandomPrefNotPrevAlly」两段 = allyRandomN n:2（9851 先例）；
 *   「首 2 位敌人」= enemyFirstN n:2；「一名敌人和一名随机敌人」= enemyChosen + enemyRandom（9220 先例）。
 * - 官方 CauseSpecificStatusEffectConditional 的 StatusModifier（AddForElemental /
 *   AddForLessAttackOnTarget 等）= 条件施加：targetRace 条件可表达（9594）；攻击力比较
 *   条件方向机翻两可（8495）→ 语义拿不准整条 SKIP。
 * - 本批只收录回收成功条目；仍不可表达条目的 SKIP 记录保留在原批次文件（避免覆盖报告重复计数）。
 */
import type { CuratedBatch } from './index';
import { chooseSkill, targetedSkill, skill, dmg, dmgSplash, trueDmg, heal, armor, mana, createGems, transform, inflict,
  cleanse, destroyColor, destroyChosenCol, createSpecialGems, summonRandom, } from '../builders';
import { BaseColor } from '../../types';

// 玉银墓城（王国 3066，troops.gow.en.json KingdomId × troops.json referenceName 取交集，R9 王国池同法）
const K3066 = ['MoonveilWarden', 'Negasus', 'VanyaSoulmourn', 'BoneGolem', 'Necrocorn', 'Draugr'];

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  // —— 赐福 blessed（8 条） ——
  {
    id: 8023,
    desc: '将所有蓝色宝石转换成黄色。给予所有其他盟友 [魔法 + 1] 点生命值，再赐福第一位盟友。',
    // CauseBlessed FrontAlly → allyFront；「所有其他盟友」= allyOthers
    build: skill(
      transform(BaseColor.Blue, BaseColor.Yellow),
      inflict('blessed', 'allyFront'),
      heal('allyOthers', 1, 1),
    ),
  },
  {
    id: 8024,
    desc: '将紫色宝石转换成红色，和棕色宝石转换成骷髅头。赐福 2 位随机盟友。',
    // CauseBlessed RandomAlly + RandomPrefNotPrevAlly → n:2（9851 先例）；棕色→骷髅 SKULL
    build: skill(
      transform(BaseColor.Purple, BaseColor.Red),
      transform(BaseColor.Brown, 'SKULL'),
      inflict('blessed', 'allyRandomPrefNotPrevN', { n: 2 }),
    ),
  },
  {
    id: 8069,
    desc: '净化和赐福一名盟友。创造与其法力颜色相同的 10 颗宝石。',
    // 「其」= 跨段所选盟友；CreateGems FromTarget 动态色 = ColorSpec LAST_TARGET
    build: skill(
      cleanse('allyChosen'),
      inflict('blessed', 'lastTarget'),
      createGems('LAST_TARGET', 10, 0),
    ),
  },
  {
    id: 8071,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因被赐福的盟友数而增强。召唤一名玉银墓城军队。 [x4]',
    // CountSpecificStatusEffect blessed 400 → allyStatusCount ×4；王国 3066（玉银墓城）召唤
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'allyStatusCount', statusId: 'blessed' } },
      }),
      summonRandom(K3066),
    ),
  },
  {
    id: 8387,
    desc: '给予一名盟友[魔法 + 1]生命，并赋予其一半的法力值。然后祝福他们。',
    // GenerateHalfMana → mana halve（R9 8282 口径：获得 floor(manaCost/2)）；「其/他们」= lastTarget
    build: skill(
      heal('allyChosen', 1, 1),
      mana('lastTarget', 0, 0, { halve: true }),
      inflict('blessed', 'lastTarget'),
    ),
  },
  {
    id: 8411,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害。创造 9 颗黄色宝石，数量因有赐福的盟友数而增强。 [1:1]',
    // 伤害段无 UseCounter（不挂来源）；创造段 Count blessed 100 → ×1 allyStatusCount
    build: skill(
      dmg('enemyAll', 3, 1, { range: 'all' }),
      createGems(BaseColor.Yellow, 9, 0, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'allyStatusCount', statusId: 'blessed' } },
      }),
    ),
  },
  {
    id: 9594,
    desc: '赋予一名盟友[魔法 + 1]护甲和生命值。如果他们是元素生物，则祝福并使其受到屏障效果。',
    // StatusModifier AddForElemental → targetRace Elemental 条件施加（「其」= lastTarget）
    build: skill(
      armor('allyChosen', 1, 1),
      heal('allyChosen', 1, 1),
      inflict('blessed', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Elemental' } }),
      inflict('barrier', 'lastTarget', { ifCond: { kind: 'targetRace', race: 'Elemental' } }),
    ),
  },
  {
    id: 9857,
    desc: '对一名敌人造成[魔法 + 3]点伤害，受祝福盟友加成。然后祝福一名随机盟友。 [x5]',
    // Count blessed AllAllies 500 → ×5 allyStatusCount；CauseBlessed RandomAlly 单体
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'blessed' } },
      }),
      inflict('blessed', 'allyRandom'),
    ),
  },
  // —— 反射 reflect（gowhead 步骤名 CauseMirror，3 条） ——
  {
    id: 8693,
    desc: '摧毁所有紫色宝石。获得反射效果和 [魔法 + 1] 点护甲值，数值因被摧毁的宝石数而增强。 [1:1]',
    // 「被摧毁的宝石数」= destroyedGems 无色（R8 9639 先例，本批仅摧毁紫色）；CauseMirror = reflect
    build: skill(
      destroyColor(BaseColor.Purple),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'destroyedGems' } },
      }),
      inflict('reflect', 'allySelf'),
    ),
  },
  {
    id: 8919,
    desc: '对一名敌人造成 [魔法 + 3] 点伤害。再获得反射效果。',
    build: skill(
      dmg('enemyChosen', 3, 1),
      inflict('reflect', 'allySelf'),
    ),
  },
  {
    id: 8986,
    desc: '摧毁一列。获得 [魔法 + 1] 点护甲值和生命值，数值因被摧毁的黄色宝石数而增强。获得反射效果。 [x4]',
    // 单方括号管护甲+生命两段（R4 §11）；Count Yellow Column 400 → destroyedGems Yellow ×4（9949 先例）
    build: skill(
      destroyChosenCol(),
      heal('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
      armor('allySelf', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Yellow } },
      }),
      inflict('reflect', 'allySelf'),
    ),
  },
  // —— 附魔 enchanted（4 条） ——
  {
    id: 9480,
    desc: '为一名盟友赋予 [魔法 + 1] 点生命，生命值由半人马盟友增加。然后对他们施加附魔和屏障。 [x2]',
    // CountArmyType centaur 200 → alliesOfRace Centaur ×2；「他们」= lastTarget（官方步骤：屏障→附魔）
    build: skill(
      heal('allyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'alliesOfRace', race: 'Centaur' } },
      }),
      inflict('barrier', 'lastTarget'),
      inflict('enchanted', 'lastTarget'),
    ),
  },
  {
    id: 9494,
    desc: '对所有敌人造成 [魔法 + 2] 点伤害，伤害值因紫龙宝石而增强。为自己设置屏障和附魔。 [x6]',
    // 紫龙宝石 → 基础色 Purple（R8 先例）；CountGems 600 → boardGems Purple ×6
    build: skill(
      dmg('enemyAll', 2, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'boardGems', color: BaseColor.Purple } },
      }),
      inflict('barrier', 'allySelf'),
      inflict('enchanted', 'allySelf'),
    ),
  },
  {
    id: 9664,
    desc: '给我和一位盟友[魔法 + 2]盔甲。然后为我们俩附魔并施加屏障。',
    // 「一位盟友」= allyChosen；官方步骤序：甲(他)→甲(我)→屏障(他)→附魔(他)→屏障(我)→附魔(我)
    build: skill(
      armor('allyChosen', 2, 1),
      armor('allySelf', 2, 1),
      inflict('barrier', 'lastTarget'),
      inflict('enchanted', 'lastTarget'),
      inflict('barrier', 'allySelf'),
      inflict('enchanted', 'allySelf'),
    ),
  },
  {
    id: 9674,
    desc: '&& 为一名盟友赋予 [魔法 + 2] 生命，然后为其设置屏障。&& 创建 10 颗与所选盟友法力颜色相同的宝石，然后为其附魔。',
    // CreateGems FromTarget 动态色 = LAST_TARGET（8069 同批口径）
    build: targetedSkill('allyChosen', chooseSkill(["给予一名盟友［魔法＋2］生命和屏障","创造10颗所选盟友一种法力颜色的宝石并使其附魔"], [heal('allyChosen', 2, 1), inflict('barrier', 'lastTarget')], [createGems('CHOSEN_TARGET', 10, 0), inflict('enchanted', 'allyChosen')])),
  },
  // —— 激怒 enraged（rage 同族，2 条） ——
  {
    id: 8496,
    desc: '结果 [魔法 + 1] 对所有敌人造成损伤，由愤怒的同盟和敌人激活。 [x2]',
    // 机翻事故实锤（官方步骤优先，R9 方法）：计数 = 燃烧/激怒 × 盟友/敌人四路各 ×2 →
    // sources 计数相加 ×2（8637 多来源先例）；「愤怒」= enraged（CauseEnraged 家族 Data 实锤）
    build: skill(
      dmg('enemyAll', 1, 1, {
        range: 'all',
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [
            { kind: 'allyStatusCount', statusId: 'burning' },
            { kind: 'allyStatusCount', statusId: 'enraged' },
            { kind: 'enemyStatusCount', statusId: 'burning' },
            { kind: 'enemyStatusCount', statusId: 'enraged' },
          ],
        },
      }),
    ),
  },
  {
    id: 9727,
    desc: '对一名敌人和一名随机敌人造成[魔法 + 4]重度溅射伤害，伤害值因被激怒的盟友和敌人数量而增强。然后制造5颗激怒宝石。 [x10]',
    // 双计数（盟友+敌人各 1000=×10）→ sources 相加 ×10；「一名敌人和一名随机敌人」= 9220 先例；
    // SplashHeavyDamage = dmgSplash（9881 先例）；激怒宝石 = createSpecialGems enrageGem（9742 先例）
    build: skill(
      dmgSplash('enemyChosen', 4, 1, { splashRatio: 0.75,
        modifier: {
          mod: { kind: 'multiplier', a: 10 },
          sources: [
            { kind: 'allyStatusCount', statusId: 'enraged' },
            { kind: 'enemyStatusCount', statusId: 'enraged' },
          ],
        },
      }),
      dmgSplash('enemyRandomPrefNotPrev', 4, 1, { splashRatio: 0.75,
        modifier: {
          mod: { kind: 'multiplier', a: 10 },
          sources: [
            { kind: 'allyStatusCount', statusId: 'enraged' },
            { kind: 'enemyStatusCount', statusId: 'enraged' },
          ],
        },
      }),
      createSpecialGems({ kind: 'enrageGem' }, 5),
    ),
  },
  // —— 附魔 enchanted（含动态色转换，1 条） ——
  {
    id: 9813,
    desc: '&& 对敌人造成 [(魔法 x 1.5) + 4] 真实伤害。&& 为我自己附魔，然后将敌人法力颜色之一的所有宝石转换为黄色。',
    // ConvertGems FromTarget→Yellow = LAST_TARGET 定色全量转换（9540 先例）
    build: targetedSkill('enemyChosen', chooseSkill(["对所选敌人造成［魔法×1.5＋4］真实伤害","自身附魔，将所选敌人一种法力颜色的宝石转为黄色"], [trueDmg('enemyChosen', 4, 1.5)], [inflict('enchanted', 'allySelf'), transform('CHOSEN_TARGET', BaseColor.Yellow)])),
  },
];

export const BATCH_R10: CuratedBatch = { batch: 'R10', spells: SPELLS, skipped: SKIPPED };
