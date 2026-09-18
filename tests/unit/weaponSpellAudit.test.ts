/**
 * 武器法术组装审计（窗口 K-B · 硬关卡 · 分保真度绑定）。
 *
 * 对 curated W 系批次（batch-w*.ts）与元数据（weapon-skill-meta.json）强制执行：
 *   1. 三级并集：full + partial + mana-only = 池全集 718，无遗漏、无重复；
 *   2. full/partial 的 spellId 必须在批次 build 里；mana-only 必须只在 meta（不在批次）；
 *   3. desc 与 weapons.json 快照（zh）逐字相等（武器侧「对号入座」锚）；
 *      部队批次的 troops.json 锚不适用于武器 id——两个 id 空间不相交（冲突回归用例）；
 *   4. fidelity 一致性：full 的 missingFeatures/skippedClauses 为空；
 *      partial/mana-only 至少略去一个子句；mana-only 的 skippedClauses 非空；
 *   5. 白名单（状态 id / 召唤引用）与数值护栏（对齐部队批口径）；
 *   6. 全量原型在固定种子棋盘上烟雾执行不抛错（确定性入口）。
 * 汇总报告：artifacts/weapon-spell-triage.md。
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
import { collectWeaponCurated, collectWeaponBatches } from '@engine/skills/curated';
import { SKILL_OVERRIDES } from '@engine/skills/library';
import type { EffectSegment } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import { TROOPS, getTroopByRef } from '../../src/data/troops';

const POOL: { spellId: number; desc: string }[] =
  JSON.parse(fs.readFileSync('scripts/curated-pools/pool-w01.json', 'utf8'));

const META: Record<string, { fidelity: string; missingFeatures: string[]; skippedClauses: string[] }> =
  JSON.parse(fs.readFileSync('src/data/weapon-skill-meta.json', 'utf8'));

const STATUS_WHITELIST = new Set([
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'barrier', 'submerged',
  'rage', 'disease', 'curse', 'death-mark', 'charm', 'marked', 'terror', 'faerie-fire',
  // 第三轮：正面状态族落地（status.ts BLESS/ENCHANTED/REFLECT_STATUS_ID + WOLF_STATUS_IDS）
  'blessed', 'enchanted', 'reflect', 'lycanthropy',
]);

const { byId: weaponById, skipped: weaponSkipped, batches: weaponBatchNames } = collectWeaponCurated();
const weaponBatches = collectWeaponBatches();

const poolById = new Map(POOL.map((p) => [p.spellId, p] as const));
const troopSpellIds = new Set(TROOPS.map((t) => t.spell.id));

// —— 通用白名单遍历（与 spellData.test.ts 同款） ——

function checkSegments(seg: EffectSegment, errs: string[], id: number): void {
  const walk = (obj: unknown, path: string): void => {
    if (obj === null || typeof obj !== 'object') return;
    const rec = obj as Record<string, unknown>;
    if (typeof rec.statusId === 'string' && !STATUS_WHITELIST.has(rec.statusId)) {
      errs.push(`spell ${id}: 未知状态 id "${rec.statusId}" (${path})`);
    }
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

const MAX_HEALTH = Math.max(...TROOPS.map((t) => t.health ?? 0));

function guardrails(seg: EffectSegment, errs: string[], id: number): void {
  if (seg.kind === 'damage' || seg.kind === 'buff' || seg.kind === 'reduce' || seg.kind === 'randomStat') {
    const cap = seg.kind === 'damage' || seg.kind === 'reduce' ? MAX_HEALTH * 2 : MAX_HEALTH;
    if (seg.scaling.base > cap) errs.push(`spell ${id}: ${seg.kind} 基数 ${seg.scaling.base} 超护栏 ${cap}`);
  }
  if (seg.kind === 'gem' && seg.params.op === 'create' && seg.params.count.base > 32) {
    errs.push(`spell ${id}: 创造数量 ${seg.params.count.base} 超护栏 32`);
  }
}

// —— 烟雾执行（spellData.test.ts 同款固定种子棋盘） ——

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
    rng: new SeededRNG(20260917),
    nextGemId: () => 6_000_000 + gid++,
    resolveSummonRef: () => null,
  };
  const proto = weaponById.get(spellId);
  if (!proto) throw new Error(`spell ${spellId} 不在编译集合中`);
  try {
    executePrototype(proto, ctx);
  } catch (e) {
    errs.push(`spell ${spellId}: 烟雾执行抛错 ${String(e).slice(0, 160)}`);
  }
}

// —— 用例 ——

describe('武器法术池与元数据（pool-w01 + weapon-skill-meta）', () => {
  it('池全量 718 条且 spellId 无重复', () => {
    expect(POOL.length).toBe(718);
    const ids = POOL.map((p) => p.spellId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('meta 覆盖池全集、键一一对应、fidelity 值域合法', () => {
    const metaIds = Object.keys(META).map(Number).sort((a, b) => a - b);
    const poolIds = POOL.map((p) => p.spellId).sort((a, b) => a - b);
    expect(metaIds, 'meta 键与池逐一对应').toEqual(poolIds);
    for (const v of Object.values(META)) {
      expect(['full', 'partial', 'mana-only']).toContain(v.fidelity);
      expect(Array.isArray(v.missingFeatures)).toBe(true);
      expect(Array.isArray(v.skippedClauses)).toBe(true);
    }
  });

  it('第六轮分布快照：full 683 / partial 27 / mana-only 8（前轮 610/96/12；K-B 收官轮小引擎批+解析收尾）', () => {
    const tier = { full: 0, partial: 0, 'mana-only': 0 };
    for (const v of Object.values(META)) tier[v.fidelity as keyof typeof tier] += 1;
    expect(tier.full).toBe(683);
    expect(tier.partial).toBe(27);
    expect(tier['mana-only']).toBe(8);
  });
});

describe('武器法术组装审计（curated W 系批次 · 分保真度）', () => {
  it('full + partial + mana-only = 718，三类互斥无遗漏', () => {
    const builtIds = [...weaponById.keys()];
    const fullPartial = Object.entries(META)
      .filter(([, v]) => v.fidelity !== 'mana-only')
      .map(([id]) => Number(id));
    const manaOnly = Object.entries(META)
      .filter(([, v]) => v.fidelity === 'mana-only')
      .map(([id]) => Number(id));

    // 三级合计 = 718
    expect(fullPartial.length + manaOnly.length).toBe(POOL.length);
    // full/partial 必须在批次 build 里
    for (const id of fullPartial) {
      expect(weaponById.has(id), `spell ${id}（${META[String(id)].fidelity}）必须在批次 build 里`).toBe(true);
    }
    // mana-only 不在批次 build 里
    for (const id of manaOnly) {
      expect(weaponById.has(id), `spell ${id} 是 mana-only，不得进批次`).toBe(false);
    }
    // 批次 build 与 meta 的 full/partial 集合一致
    expect(new Set(builtIds).size).toBe(builtIds.length);
    expect(new Set(fullPartial).size).toBe(fullPartial.length);
    expect(new Set(builtIds)).toEqual(new Set(fullPartial));
    //mana-only 占位绑定单独成类
    expect(manaOnly.length).toBeGreaterThan(0);
    void weaponSkipped;
  });

  it('fidelity 一致性：full 无省略；partial/mana-only 必有略去子句', () => {
    for (const [id, v] of Object.entries(META)) {
      if (v.fidelity === 'full') {
        expect(v.missingFeatures.length, `full ${id} 不应有 missingFeatures`).toBe(0);
        expect(v.skippedClauses.length, `full ${id} 不应有 skippedClauses`).toBe(0);
      } else {
        expect(
          v.skippedClauses.length + v.missingFeatures.length,
          `${v.fidelity} ${id} 应至少记录一个略去子句或特征`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('desc 与 weapons.json 快照逐字一致（武器侧对号入座锚）', () => {
    const errs: string[] = [];
    for (const b of weaponBatches) {
      for (const s of b.spells) {
        const pool = poolById.get(s.id);
        if (!pool) {
          errs.push(`spell ${s.id}: 不在 pool-w01.json 中`);
          continue;
        }
        if (pool.desc !== s.desc) {
          errs.push(`spell ${s.id}: desc 与 pool 不一致\n  curated: ${s.desc}\n  pool:    ${pool.desc}`);
        }
      }
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('批次号 W 系命名、批次内按 spellId 升序', () => {
    expect(weaponBatchNames).toEqual([...weaponBatchNames].sort());
    for (const n of weaponBatchNames) expect(n).toMatch(/^W\d{2}$/);
    for (const b of weaponBatches) {
      const ids = b.spells.map((s) => s.id);
      const sorted = [...ids].sort((a, c) => a - c);
      expect(ids, `批次 ${b.batch} 未按 id 升序`).toEqual(sorted);
    }
  });

  it('武器 spellId 与部队法术 id / SKILL_OVERRIDES 零冲突（回归护栏）', () => {
    const errs: string[] = [];
    for (const id of weaponById.keys()) {
      if (troopSpellIds.has(id)) errs.push(`spell ${id}: 与部队法术 id 冲突`);
      if (id in SKILL_OVERRIDES) errs.push(`spell ${id}: 与 SKILL_OVERRIDES 冲突`);
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('白名单（状态/召唤引用）与数值护栏', () => {
    const errs: string[] = [];
    for (const [id, proto] of weaponById) {
      for (const seg of proto.segments) {
        checkSegments(seg, errs, id);
        guardrails(seg, errs, id);
      }
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('全量原型固定种子烟雾执行不抛错', () => {
    const errs: string[] = [];
    for (const [id] of weaponById) smokeExecute(id, errs);
    expect(errs, errs.join('\n')).toEqual([]);
  });
});
