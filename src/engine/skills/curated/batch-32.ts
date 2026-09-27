/**
 * 人工核对组装 · 批次 32（池：scripts/curated-pools/pool-32.json）
 * 核对者：agent 批次32
 *
 * 语义裁定备注：
 * - 池文件实际仅 3 条（任务单写 40 条，以 pool-32.json 现有内容为准逐条核对）。
 * - 9014「蓝龙宝石/绿龙宝石」为龙宝石（特殊宝石家族，非 BaseColor 色宝石，
 *   组装器无此创造词汇）→ SKIP（特殊宝石）。
 * - 8967「消除敌人的 … 项技能」= 消除敌方正面增益（驱散，不做清单）；
 *   叠加来源「天使宝石」亦属特殊宝石（二次缩放来源不支持），双重受阻 → SKIP。
 * - 10058「伤害值由我的生命值提升 [1:1]」= 伤害段挂二次缩放 ratio 1:1，
 *   来源 selfStat hp（「我的生命值」= 自身当前生命值，SOP 来源表；来源子句
 *   点名「伤害值」→ 挂伤害段）；「将我的生命值恢复至满值」= heal full（SOP 裁定）；
 *   「最后两名敌人」= enemyLastN + n:2（SOP §3 目标表）。
 */
import { chooseSkill, skill, dmg, heal, inflict, extraTurn } from '../builders';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  { id: 8967, reason: '驱散敌方增益（「消除敌人的…项技能」= 消除敌方正面增益，不做）；来源「天使宝石」亦属二次缩放来源不支持' },
  { id: 9014, reason: '特殊宝石（「蓝龙宝石/绿龙宝石」为龙宝石，无创造原语；召唤子句无法单独保留）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 10058,
    desc: '&& 对最后两名敌人造成1点伤害，伤害值由我的生命值提升。&& 纠缠所有敌人。然后将我的生命值恢复至满值，并获得额外回合。 [1:1]',
    build: skill(chooseSkill(["对最后两名敌人造成［魔法＋2＋自身生命］伤害","缠绕所有敌人，自身恢复全部生命并获得额外回合"], [dmg('enemyLastN', 2, 1, {
        n: 2, range: 'all',
        modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
      })], [inflict('entangle', 'enemyAll'), heal('allySelf', 0, 0, { full: true }), extraTurn()])),
  },
];

export const BATCH_32: CuratedBatch = { batch: '32', spells: SPELLS, skipped: SKIPPED };
