/**
 * 人工核对组装 · 批次 P40（收尾+复查批）
 * 范围：pool-40.json 余量（9 条中 3 条已随 batch-p39 组装，6 条旧 SKIP 复查）
 * + batch-p37/p38/p39 三批 SKIPPED 全量复查（38 条）。
 * 核对者：技能组装子agent。复查 44 条 / 回收组装 3 条 / 仍弃 41 条（仍弃台账在原批 SKIPPED，
 * 本批不重复登记以免覆盖率报告双计）。
 *
 * 回收依据（新原语/新裁定落地后复核）：
 * - 9185「蓝色闪电宝石/黄色闪电宝石」→ 引擎 SPECIAL_MATCH_COLOR 实锤官方颜色归属：
 *   lightningRow=Blue（蓝闪电，匹配清整行）、lightningCol=Yellow（黄闪电，匹配清整列）——
 *   颜色即行列，此前「未区分行列」的 SKIP 前提不再成立（types.ts SPECIAL_MATCH_COLOR）。
 * - 9184「爆破所有闪电宝石」→ 闪电宝石族 = { lightningRow, lightningCol } 两种，
 *   拆 explodeSpecialGems 两段 = 精确覆盖「所有」、无超集无子集（非「单颗未分行列」歧义族）。
 * - 9567「如果发生风暴，则再造成 10 点伤害」→ 裸伤害句式裁定（spell-rules §0：
 *   无目标词 = enemyChosen；全库数据「全体伤害必明写所有敌人」40/40）——承前全体读法废弃。
 *   「并打乱他们的队伍」→ shuffleTeam('enemy')（§12.1 新原语）。
 *
 * 遗留（需主线程处理，本文件无权改他批）：
 * - 9184/9567 在 batch-p38 SKIPPED、9185 在 batch-p39 SKIPPED 仍留有旧记录，
 *   本批已回收组装，主线程可从原批 SKIPPED 数组删除这三条（避免覆盖率报告虚计）。
 * - 9193（p39 SKIP）：转化端「蓝色闪电宝石」现已可表达（lightningRow），但 [1:1] modifier
 *   无来源子句（描述中无「因…而增强」），来源归属拿不准 → 维持弃。
 * - 9567 备选读法：若官方原意为「风暴时对所有敌人追加 10 点」（承前全体），需改第三段为
 *   dmg('enemyAll',10,0,{range:'all',ifCond:stormPresent})——现按 §0 裁定落 enemyChosen。
 */
import type { CuratedBatch } from './index';
import { chooseSkill, skill, dmg, createStorm, shuffleTeam, createSpecialGems, explodeSpecialGems, extraTurn } from '../builders';
import { BaseColor } from '../../types';

const SKIPPED: { id: number; reason: string }[] = [
  // 复查后全部仍弃条目沿用原批（p37/p38/p39）SKIPPED 记录，本批不重复登记（防覆盖率双计）。
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 9184,
    desc: '对首 2 位敌人造成 [魔法 + 3] 点伤害，伤害值因自身的攻击力、生命值和护甲值而增强。爆破所有闪电宝石。 [3:1]',
    build: skill(
      dmg('enemyFirstN', 3, 1, {
        n: 2,
        modifier: {
          mod: { kind: 'ratio', a: 3, b: 1 },
          pooled: true /* CountAttackArmorLife = one native Count step (R007-1) */, sources: [{ kind: 'selfStat', stat: 'attack' }, { kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }],
        },
      }),
      // 「所有闪电宝石」= 闪电族两种全量（lightningRow 蓝/清行 + lightningCol 黄/清列），拆两段精确覆盖
      explodeSpecialGems('lightningRow'),
      explodeSpecialGems('lightningCol'),
    ),
  },
  {
    id: 9185,
    desc: '&&创造一颗蓝色闪电宝石。板面上每有一颗蓝色宝石，则有 7% 的几率获得一个额外回合 && 创造一颗黄色闪电宝石。板面上每有一颗蓝色宝石，则有 7% 的几率获得一个额外回合  [x7]',
    // Both raw CountGems steps use Yellow while description says Blue: source conflict pending independent check.
    build: skill(chooseSkill(['蓝闪电宝石与额外回合', '黄闪电宝石与额外回合'], [createSpecialGems({ kind: 'lightningRow' }, 1), extraTurn({ chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } })], [createSpecialGems({ kind: 'lightningCol' }, 1), extraTurn({ chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } })])),
  },
  {
    id: 9567,
    desc: '对所有敌人造成 [魔法 + 1] 点伤害，并打乱他们的队伍。如果发生风暴，则再造成 10 点伤害。然后制造冰风暴。',
    build: skill(
      // native one step: Damage@AllEnemies 1+M [AddForAnyStorm 10] -> +10 on the same hit to every enemy when a Storm exists
      dmg('enemyAll', 1, 1, { range: 'all', condBonus: { n: 10, cond: { kind: 'stormPresent' } } }),
      shuffleTeam('enemy'),
      createStorm(BaseColor.Blue),
    ),
  },
];

export const BATCH_P40: CuratedBatch = { batch: 'p40', spells: SPELLS, skipped: SKIPPED };
