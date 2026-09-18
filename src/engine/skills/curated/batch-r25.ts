/**
 * 人工核对组装 · 批次 R25（池：scripts/curated-pools/pool-{30,31,34,35,36,37,38,39,40}.json 收口复核批）
 * 核对者：窗口 B 子 agent（R25，2026-09-19）
 *
 * 工作面核查结论（脚本逐条对账，tmp/_r25_desc_check2.py）：
 * 池 30-40 共 329 条 unique spellId，与既有全部批次（batch-01…batch-40、batch-p37…p41、
 * batch-r1…r22，index.ts 注册口径）交叉核对——328 条已在既有批次组装入库，desc 与池文件
 * **逐字节一致**、批间零重复、零遗漏：
 *   - pool-30/31 原生组装 → batch-30 / batch-31；挽救批 → batch-r1 / r8 / r11 / r14 / r16 / r18；
 *   - pool-34/35/36 → batch-34 / batch-35 / batch-36；挽救批 → batch-r11 / r16 / r18；
 *   - pool-37/38/39/40 → batch-37…batch-40 + batch-p37…p41；挽救批 → batch-r11。
 * 故本批为空批（SPELLS 零条目）——「现存未组装条目」仅剩下方 SKIPPED 的 1 条，
 * 其卡点为引擎词汇真实缺口，维持 r8/r14/r19/r21/r22 连续拒收口径，不为凑数硬收（SOP §1.4）。
 */

import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  // 池 31（石化梅菲特「毒石」，desc 与 troops.json 逐字锚定已核）：
  // 「创造 1 颗石像鬼宝石」（createSpecialGems2 gargoyleGem 可表）+「获得一个额外回合」可表；
  // 卡点＝「宝石附近或下方每有一颗绿色宝石，则使一名随机敌人陷入中毒状态 [1:1]」——
  // 以**创造宝石格为锚**的周边位置计数（官方 BoardTarget SurroundingGems）：
  // modifier 来源仅有全盘口径 boardGems，无位置来源 kind，[1:1] 无可靠挂载段（r8-r22 口径维持）。
  { id: 8804, reason: '二次缩放来源不支持（「宝石附近或下方每有一颗绿色宝石」＝以创造格为锚的周边位置计数，官方 BoardTarget SurroundingGems；boardGems 为全盘口径无位置来源，r8-r22 口径维持）' },
];

const SPELLS: CuratedBatch['spells'] = [];

export const BATCH_R25: CuratedBatch = { batch: 'r25', spells: SPELLS, skipped: SKIPPED };
