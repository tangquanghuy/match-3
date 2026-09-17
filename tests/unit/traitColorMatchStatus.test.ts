/**
 * 配色施加状态批测试（T5 配色状态批 16 code：「在配对X色宝石时使随机一名敌人陷入Y状态」族）。
 *
 * 覆盖：
 *   - 编译正确性：16 code 逐条断言官方描述 → onColorMatchStatus（色键/状态/DoT magnitude/概率），
 *     resolvePassives 产物进 PassiveModifiers.colorMatchStatus。
 *   - 纯函数层：applyColorMatchTriggers + ctx（随机目标 rng、foxfire 50% 概率、无 ctx 安全跳过、
 *     非命中色零消耗、双状态、真实 applyStatus 的免疫拦截）。
 *   - 真实对局：TurnEngine 手工棋盘红/紫匹配触发（deepwounds 出血 / webbedbranches 织网 /
 *     impervious 全免拦截）。
 *   - 护栏：无新键特质的 legacy 配色族对局，随机数消耗与事件数与**改动前**基线逐字节一致。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives,
  neutralPassives,
  getTrait,
  attachPassives,
  applyColorMatchTriggers,
} from '@engine/traits';
import { applyStatus } from '@engine/skills/effects/status';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { PlayerSide, BaseColor } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { colorGem } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

/** 施加状态上下文的最小实现：直接改 statuses 并发 status-apply（与引擎注入口径一致） */
const statusCtx = {
  applyStatus: (char: Character, status: { id: string; turns: number; magnitude?: number }) => {
    char.statuses.push({ ...status });
    return [{ type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns } as GameEvent];
  },
};

/** 包装 rng 统计消耗次数（护栏：非命中路径必须零消耗） */
function countingRng(seed: number): { rng: Pick<SeededRNG, 'next'>; calls: () => number } {
  const base = new SeededRNG(seed);
  let calls = 0;
  return {
    rng: { next: () => { calls += 1; return base.next(); } },
    calls: () => calls,
  };
}

// ============================================================
// 编译正确性（16 code 逐条对官方描述）
// ============================================================

describe('编译正确性（16 code → onColorMatchStatus）', () => {
  it('单状态·动词句（molten/wildvines/magicvines/lionsroar/petrification）', () => {
    expect(getTrait('molten')?.onColorMatchStatus).toEqual({
      color: 'Red', scope: 'randomEnemy', statuses: [{ id: 'burning', magnitude: 1 }], turns: 3,
    });
    expect(getTrait('wildvines')?.onColorMatchStatus).toEqual({
      color: 'Green', scope: 'randomEnemy', statuses: [{ id: 'entangle' }], turns: 3,
    });
    expect(getTrait('magicvines')?.onColorMatchStatus).toEqual({
      color: 'Purple', scope: 'randomEnemy', statuses: [{ id: 'entangle' }], turns: 3,
    });
    expect(getTrait('lionsroar')?.onColorMatchStatus).toEqual({
      color: 'Yellow', scope: 'randomEnemy', statuses: [{ id: 'stun' }], turns: 3,
    });
    expect(getTrait('petrification')?.onColorMatchStatus).toEqual({
      color: 'Brown', scope: 'randomEnemy', statuses: [{ id: 'stun' }], turns: 3,
    });
  });

  it('单状态·陷入句（sunfire/sourcandy/deepwounds/rainofspines/grimcurse/curseofmadness/huntersmoon/webbedbranches）', () => {
    // 妖火 = faerie-fire 独立状态（非 DoT，不带 magnitude）——修正前误映射 burning
    expect(getTrait('sunfire')?.onColorMatchStatus).toEqual({
      color: 'Red', scope: 'randomEnemy', statuses: [{ id: 'faerie-fire' }], turns: 3,
    });
    expect(getTrait('sourcandy')?.onColorMatchStatus).toEqual({
      color: 'Green', scope: 'randomEnemy', statuses: [{ id: 'faerie-fire' }], turns: 3,
    });
    expect(getTrait('deepwounds')?.onColorMatchStatus).toEqual({
      color: 'Red', scope: 'randomEnemy', statuses: [{ id: 'bleed', magnitude: 1 }], turns: 3,
    });
    expect(getTrait('rainofspines')?.onColorMatchStatus).toEqual({
      color: 'Green', scope: 'randomEnemy', statuses: [{ id: 'bleed', magnitude: 1 }], turns: 3,
    });
    expect(getTrait('grimcurse')?.onColorMatchStatus).toEqual({
      color: 'Purple', scope: 'randomEnemy', statuses: [{ id: 'disease' }], turns: 3,
    });
    expect(getTrait('curseofmadness')?.onColorMatchStatus).toEqual({
      color: 'Brown', scope: 'randomEnemy', statuses: [{ id: 'curse' }], turns: 3,
    });
    expect(getTrait('huntersmoon')?.onColorMatchStatus).toEqual({
      color: 'Red', scope: 'randomEnemy', statuses: [{ id: 'marked' }], turns: 3,
    });
    expect(getTrait('webbedbranches')?.onColorMatchStatus).toEqual({
      color: 'Purple', scope: 'randomEnemy', statuses: [{ id: 'web' }], turns: 3,
    });
  });

  it('双状态（enchantedvines 缠绕+妖火 / ancientchill 冻结+妖火）条目序与描述一致', () => {
    expect(getTrait('enchantedvines')?.onColorMatchStatus).toEqual({
      color: 'Green', scope: 'randomEnemy',
      statuses: [{ id: 'entangle' }, { id: 'faerie-fire' }], turns: 3,
    });
    expect(getTrait('ancientchill')?.onColorMatchStatus).toEqual({
      color: 'Blue', scope: 'randomEnemy',
      statuses: [{ id: 'frozen' }, { id: 'faerie-fire' }], turns: 3,
    });
  });

  it('foxfire：50% 概率收进 chance；编译产物进 colorMatchStatus 色键', () => {
    expect(getTrait('foxfire')?.onColorMatchStatus).toEqual({
      color: 'Red', scope: 'randomEnemy', statuses: [{ id: 'faerie-fire' }], turns: 3, chance: 0.5,
    });
    const fox = resolvePassives(['foxfire']).colorMatchStatus;
    expect(fox.Red).toEqual({ scope: 'randomEnemy', statuses: [{ id: 'faerie-fire' }], turns: 3, chance: 0.5 });
    expect(resolvePassives(['enchantedvines']).colorMatchStatus.Green?.statuses).toEqual([
      { id: 'entangle' }, { id: 'faerie-fire' },
    ]);
    expect(resolvePassives(['webbedbranches']).colorMatchStatus.Purple).toEqual({
      scope: 'randomEnemy', statuses: [{ id: 'web' }], turns: 3,
    });
    // 编译为纯函数且与中性被动有差异
    const codes = ['molten', 'sunfire', 'sourcandy', 'deepwounds', 'rainofspines', 'wildvines', 'magicvines',
      'enchantedvines', 'ancientchill', 'grimcurse', 'curseofmadness', 'huntersmoon', 'webbedbranches',
      'petrification', 'lionsroar', 'foxfire'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// 触发集成 · 纯函数层
// ============================================================

describe('applyColorMatchTriggers + ctx（纯函数层）', () => {
  it('deepwounds：红匹配使随机一名敌人出血（magnitude 1），目标只落在敌方', () => {
    const holder = makeChar(0, { traitIds: ['deepwounds'] });
    attachPassives(holder);
    const allies = [holder, makeChar(1)];
    const foes = [makeChar(9), makeChar(10)];
    const { rng, calls } = countingRng(3);
    const events = applyColorMatchTriggers(allies, BaseColor.Red, {
      rng, ...statusCtx, enemyTeam: foes,
    });
    const bled = foes.filter((f) => f.statuses.some((s) => s.id === 'bleed' && s.magnitude === 1));
    expect(bled).toHaveLength(1);
    expect(allies.every((a) => a.statuses.length === 0)).toBe(true);
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'bleed')).toBe(true);
    expect(calls()).toBe(1); // 只耗选目标的 1 次随机数（无概率句）
  });

  it('非命中色不触发且零随机消耗；无 ctx（无施加口/敌队）整块跳过', () => {
    const holder = makeChar(0, { traitIds: ['deepwounds'] });
    attachPassives(holder);
    const foes = [makeChar(9)];
    const { rng, calls } = countingRng(3);
    const events = applyColorMatchTriggers([holder], BaseColor.Blue, {
      rng, ...statusCtx, enemyTeam: foes,
    });
    expect(events).toEqual([]);
    expect(foes[0].statuses).toHaveLength(0);
    expect(calls()).toBe(0);

    const noCtx = applyColorMatchTriggers([holder], BaseColor.Red, { enemyTeam: foes });
    expect(noCtx).toEqual([]);
    expect(foes[0].statuses).toHaveLength(0);
  });

  it('foxfire：50% 概率受 rng 控制；无 rng 不生效（召唤口径）', () => {
    let hitSeed = -1;
    let missSeed = -1;
    for (let seed = 0; seed < 50 && (hitSeed < 0 || missSeed < 0); seed++) {
      if (new SeededRNG(seed).next() < 0.5) {
        if (hitSeed < 0) hitSeed = seed;
      } else if (missSeed < 0) {
        missSeed = seed;
      }
    }
    expect(hitSeed).toBeGreaterThanOrEqual(0);
    expect(missSeed).toBeGreaterThanOrEqual(0);
    const drive = (seed: number, withRng: boolean) => {
      const char = makeChar(0, { traitIds: ['foxfire'] });
      attachPassives(char);
      const foes = [makeChar(9), makeChar(10)];
      applyColorMatchTriggers([char], BaseColor.Red, {
        ...(withRng ? { rng: new SeededRNG(seed) } : {}),
        ...statusCtx,
        enemyTeam: foes,
      });
      return foes.filter((f) => f.statuses.some((s) => s.id === 'faerie-fire')).length;
    };
    expect(drive(hitSeed, true)).toBe(1);
    expect(drive(missSeed, true)).toBe(0);
    expect(drive(hitSeed, false)).toBe(0); // 无 rng：概率 <1 不生效（与召唤/大连施加同口径）
  });

  it('enchantedvines：双状态（缠绕+妖火）落在同一名敌人', () => {
    const holder = makeChar(0, { traitIds: ['enchantedvines'] });
    attachPassives(holder);
    const foes = [makeChar(9), makeChar(10)];
    const events = applyColorMatchTriggers([holder], BaseColor.Green, {
      rng: new SeededRNG(7), ...statusCtx, enemyTeam: foes,
    });
    const hit = foes.filter((f) => f.statuses.some((s) => s.id === 'entangle'));
    expect(hit).toHaveLength(1);
    // 妖火为独立状态 faerie-fire（修正前与燃烧混淆）
    expect(hit[0].statuses.map((s) => s.id).sort()).toEqual(['entangle', 'faerie-fire']);
    expect(hit[0].statuses.find((s) => s.id === 'faerie-fire')?.magnitude).toBeUndefined();
    expect(events.filter((e) => e.type === 'status-apply')).toHaveLength(2);
  });

  it('免疫拦截走真实 applyStatus：impervious（全免）敌人不被上状态', () => {
    const holder = makeChar(0, { traitIds: ['sunfire'] });
    attachPassives(holder);
    const immune = makeChar(9, { traitIds: ['impervious'] });
    attachPassives(immune);
    const events = applyColorMatchTriggers([holder], BaseColor.Red, {
      rng: new SeededRNG(3),
      applyStatus: (char, status) => applyStatus(char, status),
      enemyTeam: [immune],
    });
    expect(immune.statuses).toHaveLength(0);
    expect(events.filter((e) => e.type === 'status-apply')).toHaveLength(0);
  });

  it('敌方全灭 / 持有者阵亡：安全跳过不抛错', () => {
    const holder = makeChar(0, { traitIds: ['molten'] });
    attachPassives(holder);
    const dead = makeChar(11, { defeated: true });
    expect(() => applyColorMatchTriggers([holder], BaseColor.Red, {
      rng: new SeededRNG(3), ...statusCtx, enemyTeam: [dead],
    })).not.toThrow();
    expect(() => applyColorMatchTriggers([dead], BaseColor.Red, {
      rng: new SeededRNG(3), ...statusCtx, enemyTeam: [makeChar(9)],
    })).not.toThrow();
  });
});

// ============================================================
// 触发集成 · 真实对局（TurnEngine 手工棋盘）
// ============================================================

interface LocalEngine {
  engine: TurnEngine;
  board: BoardModel;
  rng: SeededRNG;
}

/** 底行构造「交换 (7,2)<->(6,2) 后成 N 连 target 色」的局面（palette 染色排除目标色，防跑位） */
function buildWithNMatch(
  n: 4 | 5,
  target: BaseColor,
  playerChars: Character[],
  enemyChars: Character[],
  seed = 5,
): LocalEngine {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Red]
    .filter((c) => c !== target);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % palette.length]) });
    }
  }
  // 底行：交换 (7,2)<->(6,2) 后 (7,0..n-1) 恰好 N 连目标色；(5,2) 与 (6,2) 异色避免纵向干扰
  for (let c = 0; c < 8; c++) {
    const isTargetCol = c < n && c !== 2;
    board.set({ row: 7, col: c }, { id: 70 + c, type: colorGem(isTargetCol ? target : palette[c % palette.length]) });
  }
  board.set({ row: 6, col: 2 }, { id: 62, type: colorGem(target) });
  board.set({ row: 5, col: 2 }, { id: 52, type: colorGem(palette[0]) });

  const rng = new SeededRNG(seed);
  const idGen = (() => { let n2 = 700; return () => ++n2; })();
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, playerChars),
    makeTeam(PlayerSide.Right, enemyChars),
  );
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), board, rng };
}

describe('TurnEngine 集成：真实对局中的配色施加状态', () => {
  it('红匹配 → deepwounds 使一名敌人出血（status-apply 事件 + 状态在身，己方不受影响）', () => {
    const hero = makeChar(0, { traitIds: ['deepwounds'] });
    attachPassives(hero);
    const foes = [makeChar(4), makeChar(5)];
    const { engine } = buildWithNMatch(4, BaseColor.Red, [hero, makeChar(1)], foes);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'bleed')).toBe(true);
    const bled = foes.filter((f) => f.statuses.some((s) => s.id === 'bleed'));
    expect(bled.length).toBeGreaterThanOrEqual(1);
    expect(hero.statuses).toHaveLength(0);
  });

  it('紫匹配 → webbedbranches 使一名敌人织网（色键按匹配色路由）', () => {
    const hero = makeChar(0, { traitIds: ['webbedbranches'] });
    attachPassives(hero);
    const foes = [makeChar(4), makeChar(5)];
    const { engine } = buildWithNMatch(4, BaseColor.Purple, [hero, makeChar(1)], foes);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'web')).toBe(true);
    expect(foes.some((f) => f.statuses.some((s) => s.id === 'web'))).toBe(true);
    expect(hero.statuses).toHaveLength(0);
  });

  it('impervious 敌人全免：sunfire 红匹配后无任何燃烧落地', () => {
    const hero = makeChar(0, { traitIds: ['sunfire'] });
    attachPassives(hero);
    const immuneA = makeChar(4, { traitIds: ['impervious'] });
    const immuneB = makeChar(5, { traitIds: ['impervious'] });
    attachPassives(immuneA);
    attachPassives(immuneB);
    const { engine } = buildWithNMatch(4, BaseColor.Red, [hero, makeChar(1)], [immuneA, immuneB]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(immuneA.statuses).toHaveLength(0);
    expect(immuneB.statuses).toHaveLength(0);
    expect(events.some((e) => e.type === 'status-apply')).toBe(false);
  });
});

// ============================================================
// 护栏 · 无新键特质的对局随机序列不变
// ============================================================

describe('护栏 · 无新键特质的对局随机序列不变', () => {
  /** 全 legacy 配色族阵容：走 applyColorMatchTriggers 既有键（增益/光环/净化/敌方触发） */
  function build(seed: number) {
    const idGen = (() => { let n = 500; return () => ++n; })();
    const rng = new SeededRNG(seed);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const left = [
      makeChar(0, { traitIds: ['boo', 'diamondaura'] }),
      makeChar(1, { traitIds: ['ragingbull', 'powerofstars'] }),
      makeChar(2, { traitIds: ['adagio'] }),
    ];
    const right = [
      makeChar(4, { traitIds: ['rancor'] }),
      makeChar(5, { traitIds: ['hunger'] }),
    ];
    for (const c of [...left, ...right]) attachPassives(c);
    const state = createGameState(board, makeTeam(PlayerSide.Left, left), makeTeam(PlayerSide.Right, right));
    return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state, rng };
  }

  function drive(seed: number, turns: number): { rngState: number; eventCount: number } {
    const { engine, state, rng } = build(seed);
    let count = 0;
    for (let i = 0; i < turns; i++) {
      if (state.state === 'GameOver') break;
      const swap = chooseEnemySwap(state.board, rng);
      if (!swap) break;
      count += engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b }).length;
    }
    return { rngState: rng.getState(), eventCount: count };
  }

  it('多组种子下 rng 终态与事件数与改前基线逐字节一致', () => {
    // 基线说明：本组数字在本批**改动前**采集（legacy 配色族对局）。触发器扩展对
    // 「不含新键特质」的对局必须零随机消耗、零额外事件——若 applyColorMatchTriggers
    // 的配色施加状态块意外消耗随机数或多发事件，rngState/eventCount 会偏离基线而红。
    const BASELINE: Record<number, { rngState: number; eventCount: number }> = {
      7: { rngState: 1496707235, eventCount: 86 },
      42: { rngState: 2440672625, eventCount: 116 },
      99: { rngState: 296062478, eventCount: 93 },
      1234: { rngState: 3200391881, eventCount: 82 },
      2026: { rngState: 1368826860, eventCount: 101 },
    };
    for (const [seed, expected] of Object.entries(BASELINE)) {
      expect({ seed: Number(seed), ...drive(Number(seed), 12) })
        .toEqual({ seed: Number(seed), ...expected });
    }
  });

  it('同一驱动跑两遍事件流完全一致（确定性）', () => {
    const run = () => {
      const { engine, state, rng } = build(7);
      const events: GameEvent[] = [];
      for (let i = 0; i < 12; i++) {
        if (state.state === 'GameOver') break;
        const swap = chooseEnemySwap(state.board, rng);
        if (!swap) break;
        events.push(...engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b }));
      }
      return JSON.stringify(events);
    };
    expect(run()).toBe(run());
  });
});
