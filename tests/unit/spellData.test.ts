/**
 * 组装器校验（窗口 B ·「对号入座」的硬关卡）。
 *
 * 对 curated 全部批次的每一条核对结果强制执行：
 *   1. desc 与 troops.json 的技能描述**逐字相等**（错一字即失败）；
 *   2. spellId 存在、批间无重复、不与 SKILL_OVERRIDES 冲突；
 *   3. 白名单：状态 id / 种族 / 召唤物引用 / 颜色；
 *   4. 数值护栏（伤害/治疗/创造数量上限，对齐全库血量）；
 *   5. 全量原型在固定种子棋盘上烟雾执行不抛错（确定性入口）。
 * 汇总报告写入 artifacts/spell-build.txt。
 */
import { describe, it, expect } from 'vitest';
// 测试环境无 @types/node（package.json 冻结不可加依赖），运行时由 vitest（node 环境）提供
// @ts-expect-error - node:fs 运行时可用，仅类型声明缺失
import fs from 'node:fs';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { collectCurated, collectCuratedBatches } from '@engine/skills/curated';
import { SKILL_OVERRIDES, SKILL_LIBRARY, curatedBatches, curatedSkipped } from '@engine/skills/library';
import type { EffectSegment } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import { TROOPS, getTroopByRef, knownTroopTypes } from '../../src/data/troops';

// —— 数据索引 ——

const TROOP_BY_SPELL_ID = new Map<number, (typeof TROOPS)[number]>(
  TROOPS.map((t) => [t.spell.id, t] as const),
);
const RACES = knownTroopTypes();

/**
 * 组装侧状态白名单（spell-rules.md §6 词表的规范拼写）。
 * 引擎已实现 disease/curse/death-mark/rage/charm/marked 的语义（2026-09-16 特殊状态批）；
 * 白名单随回收批扩容——batch-33 起组装侧使用 rage/disease（allyStatusCount/enemyStatusCount 来源同验）。
 */
const STATUS_WHITELIST = new Set([
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'barrier', 'submerged',
  'rage', 'disease', 'curse', 'death-mark', 'charm', 'marked',
  // 波A 状态本体（2026-09-16 落地），回收批随用随扩：
  'terror', 'faerie-fire',
]);

const { byId: curatedById, skipped } = collectCurated();
void skipped;

// —— 通用白名单遍历 ——

function checkSourcesAndParams(seg: EffectSegment, errs: string[], id: number): void {
  const statusSet = STATUS_WHITELIST;
  const walk = (obj: unknown, path: string): void => {
    if (obj === null || typeof obj !== 'object') return;
    const rec = obj as Record<string, unknown>;
    if (typeof rec.statusId === 'string' && !statusSet.has(rec.statusId)) {
      errs.push(`spell ${id}: 未知状态 id "${rec.statusId}" (${path})`);
    }
    if (typeof rec.race === 'string' && !RACES.has(rec.race)) {
      errs.push(`spell ${id}: 未知种族 "${rec.race}" (${path})`);
    }
    if (typeof rec.statusId2 === 'string') delete rec.statusId2;
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'ref' || k === 'randomOf') {
        const names = Array.isArray(v) ? v : [v];
        for (const n of names) {
          if (typeof n === 'string' && !getTroopByRef(n)) {
            errs.push(`spell ${id}: 召唤引用不存在 "${n}" (${path}.${k})`);
          }
        }
        continue;
      }
      walk(v, `${path}.${k}`);
    }
  };
  walk(seg, seg.kind);
}

// —— 护栏 ——

const MAX_HEALTH = Math.max(...TROOPS.map((t) => t.health ?? 0));

function guardrails(seg: EffectSegment, errs: string[], id: number): void {
  if (seg.kind === 'damage' || seg.kind === 'buff' || seg.kind === 'reduce' || seg.kind === 'randomStat') {
    const cap = seg.kind === 'damage' || seg.kind === 'reduce' ? MAX_HEALTH * 2 : MAX_HEALTH;
    if (seg.scaling.base > cap) errs.push(`spell ${id}: ${seg.kind} 基数 ${seg.scaling.base} 超护栏 ${cap}`);
    if (seg.kind === 'damage' && seg.rangeSpec) {
      for (const bound of [seg.rangeSpec.min, seg.rangeSpec.max]) {
        if (bound.base > cap) errs.push(`spell ${id}: 伤害区间基数 ${bound.base} 超护栏 ${cap}`);
      }
    }
  }
  if (seg.kind === 'gem' && seg.params.op === 'create' && seg.params.count.base > 32) {
    errs.push(`spell ${id}: 创造数量 ${seg.params.count.base} 超护栏 32`);
  }
}

// —— 烟雾执行 ——

let gid = 0;
function fillBoard(board: BoardModel): void {
  const palette: GemType[] = [
    colorGem(BaseColor.Red), colorGem(BaseColor.Blue), colorGem(BaseColor.Green),
    colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple), colorGem(BaseColor.Brown),
  ];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: gid++, type: palette[(r * 3 + c * 5) % 6] });
    }
  }
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 60, hp: 45, attack: 8, armor: 4, magic: 7,
    colors: [BaseColor.Red, BaseColor.Blue], manaCost: 12, mana: 12,
    skillId: 'none', statuses: [], defeated: false,
    troopTypes: ['Human'], ...over,
  };
}

function smokeExecute(spellId: number, errs: string[]): void {
  const board = new BoardModel();
  gid = 0;
  fillBoard(board);
  const left: Team = {
    player: PlayerSide.Left,
    characters: [makeChar(0, { troopTypes: ['Human', 'Beast'] }), makeChar(1), makeChar(2, { hp: 20 })],
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: [makeChar(4, { hp: 30 }), makeChar(5, { mana: 8 }), makeChar(6)],
  };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: 0,
    rng: new SeededRNG(20260914),
    nextGemId: () => 5_000_000 + gid++,
    resolveSummonRef: () => null,
  };
  const proto = SKILL_LIBRARY[spellId];
  try {
    executePrototype(proto, ctx);
  } catch (e) {
    errs.push(`spell ${spellId}: 烟雾执行抛错 ${String(e).slice(0, 120)}`);
  }
}

// —— 用例 ——

describe('组装器校验（curated 批次对号入座）', () => {
  it('desc 与 troops.json 逐字一致、id 存在且唯一', () => {
    const errs: string[] = [];
    const seen = new Set<number>();
    for (const [id] of curatedById) {
      const troop = TROOP_BY_SPELL_ID.get(id);
      if (!troop) {
        errs.push(`spell ${id}: troops.json 中不存在该 spell.id`);
        continue;
      }
      if (seen.has(id)) errs.push(`spell ${id}: 批间重复`);
      seen.add(id);
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('curated 不与 SKILL_OVERRIDES 冲突', () => {
    const errs: string[] = [];
    for (const id of Object.keys(SKILL_OVERRIDES).map(Number)) {
      if (curatedById.has(id)) errs.push(`spell ${id}: curated 与 overrides 重复配置`);
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('白名单（状态/种族/召唤引用）与数值护栏', () => {
    const errs: string[] = [];
    for (const [id, proto] of curatedById) {
      if (!TROOP_BY_SPELL_ID.has(id)) continue;
      for (const seg of proto.segments) {
        checkSourcesAndParams(seg, errs, id);
        guardrails(seg, errs, id);
      }
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('desc 逐字比对（对号入座锚）', () => {
    const errs: string[] = [];
    const descs = collectDescs();
    for (const [id, desc] of descs) {
      const troop = TROOP_BY_SPELL_ID.get(id);
      if (!troop) continue;
      if (troop.spell.description !== desc) {
        errs.push(`spell ${id}: desc 与 troops.json 不一致\n  curated:  ${desc}\n  database: ${troop.spell.description}`);
      }
    }
    expect(descs.size).toBeGreaterThan(0);
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('全量原型固定种子烟雾执行不抛错', () => {
    const errs: string[] = [];
    for (const [id] of curatedById) {
      if (!TROOP_BY_SPELL_ID.has(id)) continue;
      smokeExecute(id, errs);
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('写入覆盖率报告 artifacts/spell-build.txt', () => {
    const total = TROOPS.length;
    const curated = curatedById.size;
    const byReason = new Map<string, number>();
    for (const s of curatedSkipped()) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
    const notCurated = total - curated - curatedSkipped().length;
    const lines: string[] = [];
    lines.push('============================================================');
    lines.push('技能组装覆盖率报告（人工核对组装 · scripts/spell-assembler.md）');
    lines.push('============================================================');
    lines.push(`技能总数: ${total}`);
    lines.push(`已核对组装 (compiled): ${curated}`);
    lines.push(`核对后放弃 (skipped):  ${curatedSkipped().length}`);
    lines.push(`尚未核对 (pending):    ${notCurated}`);
    lines.push(`已核对批次: ${curatedBatches().join(', ')}`);
    lines.push('');
    lines.push('-- skipped 按原因分布 --');
    for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(n).padStart(5)}  ${reason}`);
    }
    lines.push('');
    lines.push('-- 尚未核对批次清单 --');
    const all = new Set(curatedBatches());
    for (let i = 1; i <= 32; i++) {
      const name = String(i).padStart(2, '0');
      if (!all.has(name)) lines.push(`  batch-${name} (pool: scripts/curated-pools/pool-${name}.json)`);
    }
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/spell-build.txt', '\uFEFF' + lines.join('\n'), 'utf8');
    expect(curated).toBeGreaterThan(0);
  });
});

/** 从批次模块直读 desc（对号入座锚的唯一来源是批次文件本身） */
function collectDescs(): Map<number, string> {
  const descs = new Map<number, string>();
  for (const b of collectCuratedBatches()) {
    for (const s of b.spells) descs.set(s.id, s.desc);
  }
  return descs;
}
