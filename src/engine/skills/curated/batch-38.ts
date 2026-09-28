/**
 * 人工核对组装 · 批次 38（窗口 E · 状态宝石批回收，池：batch-08/09/10/16/18/24/29/36
 * SKIPPED 回收——每条注明原批）
 *
 * 背景：2026-09-16 状态搬运宝石批·波A（GEMS-SEMANTICS-2 A/B 组 13 颗：燃烧/冻结/诅咒/
 * 流血/毒/死亡标记/恐怖/缠绕/激怒/沉没/精灵火/打昏/屏障）落地引擎。凡仅因这些宝石缺席
 * 受阻的 SKIPPED 条目逐条人工复核后收回；受其它卡点（散射无目标/混合特殊创造无原语/
 * 石像鬼与石块与暗影之星与狼人宝石未实现/王国条件/跑掉机制）的条目留原批并修正理由。
 *
 * 语义裁定备注（均为本批新增口径，已写入 spell-assembler §特殊宝石词汇 / spell-rules §6/§7）：
 * - 「妖仙宝石」= 精灵火宝石（Faerie Fire Gem）：官方 SpellSteps 实锤——spells.gow.en.json
 *   id 9221 `{"Color1":"FaerieFire","Type":"CountGems"}`，中文数据「妖仙/妖火/精灵火」同物
 *   异译（9221）。
 * - 「因被诅咒的敌人数而增强」= enemyStatusCount curse；「因燃烧敌人数量而增强」=
 *   enemyStatusCount burning（既有口径，8882/9637）。
 * - 「因恐怖宝石数/诅咒宝石数而增强」= boardSpecial terrorGem/curseGem（boardSpecial 全 kind
 *   开放，9165/9641/9677）。
 * - 「窃取一名敌人 N 点生命值」= 伤害段 + drain（batch-04 头注口径，8360）。
 * - 「给予一名盟友…」= allyChosen（batch-05 7288 口径，9221）。
 * - 「数值…增强」管到前句全部数值段（生命值和攻击力两段同挂 modifier，9221/9641）。
 * - 「随机摧毁 2 行和列」= destroyRandomRows(2) + destroyRandomCols(2)（9221）。
 * - 「耗掉 N 点法力值」= reduce mana（既有口径，9012）。
 */
import { skill, dmg, dmgAll, heal, attack, reduce, inflict, createSpecialGems,
  transformToSpecial, explodeRandomSpecialGems, destroyRandomRows, destroyRandomCols,
  extraTurn } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    // 原 batch-08
    id: 8360,
    desc: '窃取一名敌人 [魔法 + 1] 点生命值。再将 4 颗黄色宝石转换成末日骷髅头。',
    build: skill(
      // 窃取生命值 = 伤害段 + drain（batch-04 头注口径）
      dmg('enemyChosen', 1, 1, { drain: true }),
      // 定量转换（引擎原语批 opts.count）+ 末日骷髅头端点（batch-37 口径）
      transformToSpecial(BaseColor.Yellow, 'doomSkull', { count: 4 }),
    ),
  },
  {
    // 原 batch-36
    id: 8882,
    desc: '对所有敌人造成 [魔法 + 3] 点伤害。创造 9 颗诅咒宝石，数量因被诅咒的敌人数而增强。 [1:1]',
    build: skill(
      dmgAll(3, 1),
      createSpecialGems({ kind: 'curseGem' }, 9, 0, {
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'enemyStatusCount', statusId: 'curse' } },
      }),
    ),
  },
  {
    // 原 batch-36
    id: 8975,
    desc: '将 2 颗紫色宝石转换成死亡标记宝石。将所有黄色宝石转换成末日骷髅头。',
    build: skill(
      // 死亡标记宝石（波A 落地）+ 定量转换
      transformToSpecial(BaseColor.Purple, 'deathMarkGem', { count: 2 }),
      transformToSpecial(BaseColor.Yellow, 'doomSkull'),
    ),
  },
  {
    // 原 batch-36
    id: 9012,
    desc: '耗掉一名敌人 7 点法力值。再将所有蓝色宝石转换成诅咒宝石。',
    build: skill(
      reduce('enemyChosen', 'mana', 7, 0),
      transformToSpecial(BaseColor.Blue, 'curseGem'),
    ),
  },
  {
    // 原 batch-36
    id: 9050,
    desc: '将 5 颗绿色宝石转换成燃烧宝石。获得一个额外回合。',
    build: skill(
      transformToSpecial(BaseColor.Green, 'burningGem', { count: 5 }),
      extraTurn(),
    ),
  },
  {
    // 原 batch-36
    id: 9124,
    desc: '创造 5 颗沙漏宝石和 5 颗冻结宝石。再获得一个额外回合。',
    build: skill(
      createSpecialGems({ kind: 'hourglass' }, 5, 0),
      createSpecialGems({ kind: 'freezeGem' }, 5, 0),
      extraTurn(),
    ),
  },
  {
    // 原 batch-10
    id: 9165,
    desc: '对 4 名随机敌人造成 [魔法 + 3] 点伤害，伤害值因恐怖宝石数而增强。 [1:1]',
    build: skill(
      dmg('enemyRandomN', 3, 1, {
        n: 4, randomWaves: 4,
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'boardSpecial', gem: 'terrorGem' } },
      }),
    ),
  },
  {
    // 原 batch-16
    id: 9221,
    desc: '给予一名盟友 [魔法 + 1] 点生命值和攻击力，数值因妖仙宝石数而增强。随机摧毁 2 行和列。 [x8]',
    build: skill(
      // 「妖仙宝石」= 精灵火宝石（官方 SpellSteps CountGems Color1=FaerieFire，见头注）
      // 「一名盟友」= allyChosen（batch-05 7288 口径）；「数值…增强」管两段
      // sa-A r3: native order IncreaseAttack then IncreaseHealth
      attack('allyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'faerieFireGem' } },
      }),
      heal('allyChosen', 1, 1, {
        modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'boardSpecial', gem: 'faerieFireGem' } },
      }),
      destroyRandomRows(2),
      destroyRandomCols(2),
    ),
  },
  {
    // 原 batch-36
    id: 9548,
    desc: '创造 5 颗精灵火宝石和 5 颗燃烧宝石。然后获得额外回合。',
    build: skill(
      createSpecialGems({ kind: 'faerieFireGem' }, 5, 0),
      createSpecialGems({ kind: 'burningGem' }, 5, 0),
      extraTurn(),
    ),
  },
  {
    // 原 batch-36
    id: 9637,
    desc: '对一名敌人造成[魔法 + 2]点伤害，伤害值因燃烧敌人数量而增强。然后引爆4颗燃烧宝石。 [x4]',
    build: skill(
      dmg('enemyChosen', 2, 1, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'enemyStatusCount', statusId: 'burning' } },
      }),
      explodeRandomSpecialGems('burningGem', 4, 0),
    ),
  },
  {
    // 原 batch-18
    id: 9641,
    desc: '对 2 名随机敌人造成 [魔法 + 2] 点伤害，并为 2 名随机盟友带来 [魔法 + 2] 点生命值，伤害值均因恐怖宝石而增强。 [x4]',
    build: skill(
      // R007-3: native Damage RandomEnemy + RandomPrefNotPrevEnemy, IncreaseHealth RandomAlly + RandomPrefNotPrevAlly
      dmg('enemyRandomN', 2, 1, {
        n: 2, randomWaves: 2,
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'terrorGem' } },
      }),
      heal('allyRandomPrefNotPrevN', 2, 1, {
        n: 2,
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'terrorGem' } },
      }),
    ),
  },
  {
    // 原 batch-36
    id: 9677,
    desc: '对2名随机敌人造成[魔法 + 3]点伤害，伤害值因诅咒宝石数量而增强。然后制造4颗诅咒宝石。 [x3]',
    build: skill(
      // Native Damage@RandomEnemy + Damage@RandomPrefNotPrevEnemy (R007-3): second hit reuses a lone enemy.
      ...(['enemyRandom', 'enemyRandomPrefNotPrev'] as const).map(t => dmg(t, 3, 1, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'curseGem' } },
      })),
      createSpecialGems({ kind: 'curseGem' }, 4, 0),
    ),
  },
  {
    // 原 batch-29
    id: 9950,
    desc: '对敌人造成[魔法 + 3]点伤害，伤害值受蛛网宝石加成。如果敌人已被蛛网束缚，则造成双倍伤害。然后将其蛛网束缚。 [x2]',
    build: skill(
      dmg('enemyChosen', 3, 1, {
        // 「受蛛网宝石加成」= boardSpecial web（batch-33 口径）；「如果敌人已被蛛网束缚…
        // 双倍」= condMult targetStatus web（batch-12 8287 同构）
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'web' } },
        condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'web' } },
      }),
      inflict('web', 'enemyChosen'),
    ),
  },
];

export const BATCH_38: CuratedBatch = { batch: '38', spells: SPELLS, skipped: SKIPPED };
