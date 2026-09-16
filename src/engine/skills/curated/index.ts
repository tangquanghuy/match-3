/**
 * 人工核对组装结果（窗口 B）。
 *
 * 每个批次文件由核对者按 `scripts/spell-assembler.md`（SOP）逐条组装：
 *   - `desc` 与 `src/data/troops.json` 的技能描述**逐字相等**（校验测试强制比对，
 *     这是「对号入座」的锚——拼装结果必须对应数据库里的那一条）；
 *   - `build` 用 builders.ts 的构造函数拼装（组装器合法词汇表，类型系统把关）；
 *   - 拿不准的条目进 `skipped`（带标准原因），绝不猜。
 *
 * `SKILL_OVERRIDES`（library.ts 早期手写条目）优先级高于本目录。
 */
import type { SkillPrototype } from '../prototypes';

/** 一条人工核对过的技能组装结果 */
export interface CuratedSpell {
  /** 兵种 spell.id（= troops.json 的 spell.id，全局唯一） */
  id: number;
  /** 官方描述逐字抄录（校验器与 troops.json 精确比对） */
  desc: string;
  /** 组装器拼装的原型 */
  build: SkillPrototype;
}

/** 一个批次的产物 */
export interface CuratedBatch {
  /** 批次号（与池文件 pool-XX.json 对应） */
  batch: string;
  spells: CuratedSpell[];
  /** 核对后放弃的条目（标准原因见 SOP §4） */
  skipped: { id: number; reason: string }[];
}

import { BATCH_01 } from './batch-01';
import { BATCH_02 } from './batch-02';
import { BATCH_03 } from './batch-03';
import { BATCH_04 } from './batch-04';
import { BATCH_05 } from './batch-05';
import { BATCH_06 } from './batch-06';
import { BATCH_07 } from './batch-07';
import { BATCH_08 } from './batch-08';
import { BATCH_09 } from './batch-09';
import { BATCH_10 } from './batch-10';
import { BATCH_11 } from './batch-11';
import { BATCH_12 } from './batch-12';
import { BATCH_13 } from './batch-13';
import { BATCH_14 } from './batch-14';
import { BATCH_15 } from './batch-15';
import { BATCH_16 } from './batch-16';
import { BATCH_17 } from './batch-17';
import { BATCH_18 } from './batch-18';
import { BATCH_19 } from './batch-19';
import { BATCH_20 } from './batch-20';
import { BATCH_21 } from './batch-21';
import { BATCH_22 } from './batch-22';
import { BATCH_23 } from './batch-23';
import { BATCH_24 } from './batch-24';
import { BATCH_25 } from './batch-25';
import { BATCH_26 } from './batch-26';
import { BATCH_27 } from './batch-27';
import { BATCH_28 } from './batch-28';
import { BATCH_29 } from './batch-29';
import { BATCH_30 } from './batch-30';
import { BATCH_31 } from './batch-31';
import { BATCH_32 } from './batch-32';
import { BATCH_33 } from './batch-33';
import { BATCH_34 } from './batch-34';
import { BATCH_35 } from './batch-35';
import { BATCH_36 } from './batch-36';
import { BATCH_37 } from './batch-37';
import { BATCH_38 } from './batch-38';
import { BATCH_39 } from './batch-39';
import { BATCH_R1 } from './batch-r1';
import { BATCH_R2 } from './batch-r2';
import { BATCH_R3 } from './batch-r3';
import { BATCH_R4 } from './batch-r4';

/** 全部批次（新批次在此追加注册） */
const BATCHES: CuratedBatch[] = [
  BATCH_01,
  BATCH_02,
  BATCH_03,
  BATCH_04,
  BATCH_05,
  BATCH_06,
  BATCH_07,
  BATCH_08,
  BATCH_09,
  BATCH_10,
  BATCH_11,
  BATCH_12,
  BATCH_13,
  BATCH_14,
  BATCH_15,
  BATCH_16,
  BATCH_17,
  BATCH_18,
  BATCH_19,
  BATCH_20,
  BATCH_21,
  BATCH_22,
  BATCH_23,
  BATCH_24,
  BATCH_25,
  BATCH_26,
  BATCH_27,
  BATCH_28,
  BATCH_29,
  BATCH_30,
  BATCH_31,
  BATCH_32,
  BATCH_33,
  BATCH_34,
  BATCH_35,
  BATCH_36,
  BATCH_37,
  BATCH_38,
  BATCH_39,
  BATCH_R1,
  BATCH_R2,
  BATCH_R3,
  BATCH_R4,
];

/** 合并全部批次的组装结果（id → 原型），并给出跳过清单 */
export function collectCurated(): {
  byId: Map<number, SkillPrototype>;
  skipped: { id: number; batch: string; reason: string }[];
  batches: string[];
} {
  const byId = new Map<number, SkillPrototype>();
  const skipped: { id: number; batch: string; reason: string }[] = [];
  const batches: string[] = [];
  for (const b of BATCHES) {
    batches.push(b.batch);
    for (const s of b.spells) byId.set(s.id, s.build);
    for (const k of b.skipped) skipped.push({ id: k.id, batch: b.batch, reason: k.reason });
  }
  return { byId, skipped, batches };
}

/** 批次原数组（校验测试直读 desc 用） */
export function collectCuratedBatches(): CuratedBatch[] {
  return BATCHES;
}
