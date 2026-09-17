/**
 * T5 三机制批测试（13 code）：
 *   - onColorMatchDrain（配色窃取生命，5 code）：corruption/poisontide/justabite/darkesthunger/
 *     ladyofdesire「在配对X色宝石时窃取第一/首位敌人 N 点生命值」——对首位存活敌人伤害
 *     （damageOne 管线）+ 持有者按实际伤害额等量治疗。
 *   - onBigMatchDamage（4/5 连技能伤害，3 code）：shock（随机敌 2）/tentacles（全体 3）/
 *     lightningbolt（随机敌 10）——产出 skill-damage 事件。
 *   - onBigMatchEnemyDrain（4+ 连敌减，5 code）：suppression/aspectofplague（front 魔法）/
 *     technomancy（随机魔法）/creepinggloom（随机耗蓝）/chillingaura（front 攻击）——
 *     reduce 语义（不给自己）。
 *
 * 覆盖：
 *   - 编译正确性：13 code 逐条断言官方描述 → 字段（色键/数额/scope/stat），多持有同色
 *     窃取累加（corruption+ladyofdesire）。
 *   - 纯函数层：applyColorMatchTriggers + drainLife（front 目标、前次击杀后重取首位、
 *     非命中色零消耗、无注入安全跳过）；applyBigMatchTriggers + damage（randomEnemy 耗
 *     1 随机数、enemyAll 零随机、minSize 门槛）+ bigMatchEnemyDrain（front/randomEnemy、
 *     夹零不发事件、manashield 免疫耗蓝、reduce 不进账）。
 *   - 真实对局：TurnEngine 手工棋盘红匹配触发窃取/伤害/敌减（skill-damage 与负 buff 事件）。
 *   - 护栏：无新键特质的 legacy 大连族对局，随机数消耗与事件数与改动前基线逐字节一致。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives,
  neutralPassives,
  getTrait,
  attachPassives,
  applyColorMatchTriggers,
  applyBigMatchTriggers,
} from '@engine/traits';
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

/** 包装 rng 统计消耗次数（护栏：非命中路径必须零消耗） */
function countingRng(seed: number): { rng: Pick<SeededRNG, 'next'>; calls: () => number } {
  const base = new SeededRNG(seed);
  let calls = 0;
  return {
    rng: { next: () => { calls += 1; return base.next(); } },
    calls: () => calls,
  };
}

/** 纯函数层窃取口的最小实现：扣血 + skill-damage 事件（记录调用，供断言 front 目标） */
function makeDrainLife() {
  const calls: { targetId: number; holderId: number; amount: number }[] = [];
  const fn = (target: Character, holder: Character, amount: number): GameEvent[] => {
    calls.push({ targetId: target.id, holderId: holder.id, amount });
    const dealt = Math.min(amount, target.hp);
    target.hp -= dealt;
    if (target.hp <= 0 && !target.defeated) target.defeated = true;
    return [{
      type: 'skill-damage', casterId: holder.id, targetId: target.id,
      range: 'single', damage: dealt, resultingHp: target.hp, resultingArmor: target.armor,
    } as GameEvent];
  };
  return { fn, calls };
}

/** 纯函数层伤害口的最小实现：扣血 + skill-damage 事件 */
function makeDamage() {
  const calls: { targetId: number; casterId: number; amount: number }[] = [];
  const fn = (target: Character, caster: Character, amount: number): GameEvent[] => {
    calls.push({ targetId: target.id, casterId: caster.id, amount });
    target.hp -= amount;
    return [{
      type: 'skill-damage', casterId: caster.id, targetId: target.id,
      range: 'single', damage: amount, resultingHp: target.hp, resultingArmor: target.armor,
    } as GameEvent];
  };
  return { fn, calls };
}

// ============================================================
// 编译正确性（13 code 逐条对官方描述）
// ============================================================

describe('编译正确性（13 code → 三字段）', () => {
  it('onColorMatchDrain：5 code 色键/数额与描述一致', () => {
    expect(getTrait('corruption')?.onColorMatchDrain).toEqual({ color: 'Red', amount: 3 });
    expect(getTrait('poisontide')?.onColorMatchDrain).toEqual({ color: 'Green', amount: 4 });
    expect(getTrait('justabite')?.onColorMatchDrain).toEqual({ color: 'Brown', amount: 4 });
    expect(getTrait('darkesthunger')?.onColorMatchDrain).toEqual({ color: 'Purple', amount: 6 });
    expect(getTrait('ladyofdesire')?.onColorMatchDrain).toEqual({ color: 'Red', amount: 2 });
  });

  it('onBigMatchDamage：3 code 数额/scope 与描述一致（minSize 编译期缺省 4）', () => {
    expect(getTrait('shock')?.onBigMatchDamage).toEqual({ amount: 2, scope: 'randomEnemy' });
    expect(getTrait('tentacles')?.onBigMatchDamage).toEqual({ amount: 3, scope: 'enemyAll' });
    expect(getTrait('lightningbolt')?.onBigMatchDamage).toEqual({ amount: 10, scope: 'randomEnemy' });
    expect(resolvePassives(['shock']).bigMatchDamage).toEqual([
      { amount: 2, scope: 'randomEnemy', minSize: 4 },
    ]);
  });

  it('onBigMatchEnemyDrain：5 code stat/数额/scope 与描述一致（技能值→magic、法力值→mana）', () => {
    expect(getTrait('suppression')?.onBigMatchEnemyDrain).toEqual({ stat: 'magic', amount: 1, scope: 'front' });
    expect(getTrait('aspectofplague')?.onBigMatchEnemyDrain).toEqual({ stat: 'magic', amount: 3, scope: 'front' });
    expect(getTrait('technomancy')?.onBigMatchEnemyDrain).toEqual({ stat: 'magic', amount: 2, scope: 'randomEnemy' });
    expect(getTrait('creepinggloom')?.onBigMatchEnemyDrain).toEqual({ stat: 'mana', amount: 3, scope: 'randomEnemy' });
    expect(getTrait('chillingaura')?.onBigMatchEnemyDrain).toEqual({ stat: 'attack', amount: 2, scope: 'front' });
    expect(resolvePassives(['creepinggloom']).bigMatchEnemyDrain).toEqual([
      { stat: 'mana', amount: 3, scope: 'randomEnemy', minSize: 4 },
    ]);
  });

  it('多持有同色窃取累加（corruption+ladyofdesire → Red 5）；编译为纯函数且与中性被动有差异', () => {
    expect(resolvePassives(['corruption', 'ladyofdesire']).colorMatchDrain).toEqual({ Red: 5 });
    const codes = ['corruption', 'poisontide', 'justabite', 'darkesthunger', 'ladyofdesire',
      'shock', 'tentacles', 'lightningbolt', 'suppression', 'aspectofplague', 'technomancy',
      'creepinggloom', 'chillingaura'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// 触发集成 · 纯函数层（applyColorMatchTriggers + drainLife）
// ============================================================

describe('applyColorMatchTriggers + drainLife（纯函数层）', () => {
  it('corruption：红匹配窃取首位敌人，front 目标确定性、零随机消耗', () => {
    const holder = makeChar(0, { traitIds: ['corruption'] });
    attachPassives(holder);
    const foes = [makeChar(9), makeChar(10)];
    const { fn, calls } = makeDrainLife();
    const { rng, calls: rngCalls } = countingRng(3);
    const events = applyColorMatchTriggers([holder], BaseColor.Red, {
      rng, drainLife: fn, enemyTeam: foes,
    });
    expect(calls).toEqual([{ targetId: 9, holderId: 0, amount: 3 }]);
    expect(foes[0].hp).toBe(47);
    expect(foes[1].hp).toBe(50);
    expect(events.some((e) => e.type === 'skill-damage' && e.damage === 3)).toBe(true);
    expect(rngCalls()).toBe(0); // front 目标确定性选取，不掷随机
  });

  it('非命中色不触发且零消耗；无 drainLife 注入整块跳过', () => {
    const holder = makeChar(0, { traitIds: ['corruption'] });
    attachPassives(holder);
    const foes = [makeChar(9)];
    const { fn, calls } = makeDrainLife();
    const { rng, calls: rngCalls } = countingRng(3);
    expect(applyColorMatchTriggers([holder], BaseColor.Blue, { rng, drainLife: fn, enemyTeam: foes })).toEqual([]);
    expect(calls).toEqual([]);
    expect(rngCalls()).toBe(0);
    expect(applyColorMatchTriggers([holder], BaseColor.Red, { enemyTeam: foes })).toEqual([]);
    expect(foes[0].hp).toBe(50);
  });

  it('前一个持有者击杀首位后，后续持有者重取当前首位', () => {
    // 两个持有者同持 corruption（Red 键累加各自 3），首位敌人残血 2 → 第一个窃取击杀，
    // 第二个窃取落到新的首位
    const a = makeChar(0, { traitIds: ['corruption'] });
    const c = makeChar(2, { traitIds: ['corruption'] });
    attachPassives(a); attachPassives(c);
    const lowHp = makeChar(9, { hp: 2, maxHp: 50 });
    const behind = makeChar(10);
    const { fn, calls } = makeDrainLife();
    applyColorMatchTriggers([a, c], BaseColor.Red, { drainLife: fn, enemyTeam: [lowHp, behind] });
    expect(calls).toEqual([
      { targetId: 9, holderId: 0, amount: 3 }, // 首位被打死（hp 2）
      { targetId: 10, holderId: 2, amount: 3 }, // 重取当前首位
    ]);
    expect(lowHp.defeated).toBe(true);
  });

  it('持有者阵亡不触发；敌方全灭安全跳过', () => {
    const holder = makeChar(0, { traitIds: ['corruption'] });
    const dead = makeChar(1, { traitIds: ['corruption'], defeated: true });
    attachPassives(holder); attachPassives(dead);
    const { fn, calls } = makeDrainLife();
    expect(() => applyColorMatchTriggers([holder, dead], BaseColor.Red, {
      drainLife: fn, enemyTeam: [],
    })).not.toThrow();
    expect(calls).toEqual([]);
  });
});

// ============================================================
// 触发集成 · 纯函数层（applyBigMatchTriggers + damage / bigMatchEnemyDrain）
// ============================================================

describe('applyBigMatchTriggers + damage（纯函数层）', () => {
  it('shock：随机一名敌人受 2 点 skill-damage，只耗 1 次随机数', () => {
    const holder = makeChar(0, { traitIds: ['shock'] });
    attachPassives(holder);
    const foes = [makeChar(9), makeChar(10)];
    const { fn, calls } = makeDamage();
    const { rng, calls: rngCalls } = countingRng(7);
    const events = applyBigMatchTriggers([holder], {
      size: 4, rng, damage: fn, enemyTeam: foes,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].amount).toBe(2);
    expect([9, 10]).toContain(calls[0].targetId);
    expect(events.some((e) => e.type === 'skill-damage' && e.damage === 2)).toBe(true);
    expect(rngCalls()).toBe(1);
  });

  it('tentacles：对所有敌人各 3 点，零随机消耗；minSize 门槛（size 3）不触发', () => {
    const holder = makeChar(0, { traitIds: ['tentacles'] });
    attachPassives(holder);
    const foes = [makeChar(9), makeChar(10), makeChar(11)];
    const { fn, calls } = makeDamage();
    const { rng, calls: rngCalls } = countingRng(7);
    applyBigMatchTriggers([holder], { size: 4, rng, damage: fn, enemyTeam: foes });
    expect(calls.map((c) => c.targetId).sort((x, y) => x - y)).toEqual([9, 10, 11]);
    expect(calls.every((c) => c.amount === 3)).toBe(true);
    expect(rngCalls()).toBe(0);

    const { fn: fn2, calls: calls2 } = makeDamage();
    const { rng: rng2, calls: rngCalls2 } = countingRng(7);
    expect(applyBigMatchTriggers([holder], { size: 3, rng: rng2, damage: fn2, enemyTeam: foes })).toEqual([]);
    expect(calls2).toEqual([]);
    expect(rngCalls2()).toBe(0);
  });

  it('无 damage 注入 / 无敌队 / 敌方全灭：整块跳过零事件', () => {
    const holder = makeChar(0, { traitIds: ['lightningbolt'] });
    attachPassives(holder);
    const { rng, calls: rngCalls } = countingRng(7);
    expect(applyBigMatchTriggers([holder], { size: 5, rng })).toEqual([]);
    expect(applyBigMatchTriggers([holder], { size: 5, rng, enemyTeam: [] })).toEqual([]);
    const dead = makeChar(9, { defeated: true });
    expect(applyBigMatchTriggers([holder], { size: 5, rng, enemyTeam: [dead] })).toEqual([]);
    expect(rngCalls()).toBe(0);
  });
});

describe('applyBigMatchTriggers + bigMatchEnemyDrain（纯函数层）', () => {
  it('suppression：首位敌人魔法 -1（负 buff 事件），持有者不进账（reduce 语义）', () => {
    const holder = makeChar(0, { traitIds: ['suppression'] });
    attachPassives(holder);
    const foes = [makeChar(9, { magic: 8 }), makeChar(10, { magic: 8 })];
    const { rng, calls: rngCalls } = countingRng(3);
    const events = applyBigMatchTriggers([holder], { size: 4, rng, enemyTeam: foes });
    expect(foes[0].magic).toBe(7);
    expect(foes[1].magic).toBe(8);
    expect(holder.magic).toBe(8); // 不给自己
    expect(events).toContainEqual({ type: 'buff', targetId: 9, stat: 'magic', amount: -1 });
    expect(rngCalls()).toBe(0); // front 确定性
  });

  it('technomancy：随机敌人 -2 魔法，耗 1 次随机数；chillingaura：首位攻击 -2', () => {
    const tech = makeChar(0, { traitIds: ['technomancy'] });
    attachPassives(tech);
    const foes = [makeChar(9, { magic: 8 }), makeChar(10, { magic: 8 })];
    const { rng, calls: rngCalls } = countingRng(3);
    applyBigMatchTriggers([tech], { size: 4, rng, enemyTeam: foes });
    const drained = foes.filter((f) => f.magic === 6);
    expect(drained).toHaveLength(1);
    expect(rngCalls()).toBe(1);

    const chill = makeChar(1, { traitIds: ['chillingaura'] });
    attachPassives(chill);
    const foes2 = [makeChar(11, { attack: 5 }), makeChar(12, { attack: 5 })];
    const events = applyBigMatchTriggers([chill], { size: 4, enemyTeam: foes2 });
    expect(foes2[0].attack).toBe(3);
    expect(foes2[1].attack).toBe(5);
    expect(chill.attack).toBe(5); // 「窃取」按批裁定落纯削减，持有者不进账
    expect(events).toContainEqual({ type: 'buff', targetId: 11, stat: 'attack', amount: -2 });
  });

  it('creepinggloom：耗蓝夹零（法力 2 只耗 2）；法力为 0 不发事件；manashield 免疫耗蓝', () => {
    const holder = makeChar(0, { traitIds: ['creepinggloom'] });
    attachPassives(holder);
    const low = makeChar(9, { mana: 2 });
    attachPassives(low); // 无免疫
    const events = applyBigMatchTriggers([holder], { size: 4, enemyTeam: [low] });
    expect(low.mana).toBe(0);
    expect(events).toContainEqual({ type: 'buff', targetId: 9, stat: 'mana', amount: -2 });

    const empty = makeChar(10, { mana: 0 });
    expect(applyBigMatchTriggers([holder], { size: 4, enemyTeam: [empty] })).toEqual([]);

    const shielded = makeChar(11, { mana: 10, traitIds: ['manashield'] });
    attachPassives(shielded);
    expect(applyBigMatchTriggers([holder], { size: 4, enemyTeam: [shielded] })).toEqual([]);
    expect(shielded.mana).toBe(10);
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

describe('TurnEngine 集成：真实对局中的三机制', () => {
  it('红匹配 → corruption 窃取首位敌人 3 点生命，持有者等量治疗（skill-damage + buff 事件）', () => {
    const hero = makeChar(0, { traitIds: ['corruption'], hp: 40, maxHp: 50 });
    attachPassives(hero);
    const foes = [makeChar(4), makeChar(5)];
    const { engine } = buildWithNMatch(4, BaseColor.Red, [hero, makeChar(1)], foes);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const dmg = events.find((e) => e.type === 'skill-damage' && e.casterId === 0 && e.damage === 3);
    expect(dmg).toBeDefined();
    expect(foes[0].hp).toBe(47);
    expect(events).toContainEqual({ type: 'buff', targetId: 0, stat: 'hp', amount: 3 });
    expect(hero.hp).toBe(43);
  });

  it('4 连 → tentacles 对所有敌人各 3 点（两条 skill-damage 事件）', () => {
    const hero = makeChar(0, { traitIds: ['tentacles'] });
    attachPassives(hero);
    const foes = [makeChar(4), makeChar(5)];
    const { engine } = buildWithNMatch(4, BaseColor.Red, [hero, makeChar(1)], foes);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const hits = events.filter((e) => e.type === 'skill-damage' && e.casterId === 0 && e.damage === 3);
    expect(hits).toHaveLength(2);
    expect(foes[0].hp).toBe(47);
    expect(foes[1].hp).toBe(47);
  });

  it('4 连 → suppression 削减首位敌人魔法（负 buff 事件），chillingaura 削减首位攻击', () => {
    const hero = makeChar(0, { traitIds: ['suppression'] });
    attachPassives(hero);
    const foes = [makeChar(4, { magic: 8 }), makeChar(5, { magic: 8 })];
    const { engine } = buildWithNMatch(4, BaseColor.Red, [hero, makeChar(1)], foes);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(foes[0].magic).toBe(7);
    expect(foes[1].magic).toBe(8);
    expect(events).toContainEqual({ type: 'buff', targetId: 4, stat: 'magic', amount: -1 });

    const chill = makeChar(0, { traitIds: ['chillingaura'] });
    attachPassives(chill);
    const foes2 = [makeChar(4, { attack: 5 }), makeChar(5)];
    const { engine: engine2 } = buildWithNMatch(4, BaseColor.Red, [chill, makeChar(1)], foes2);
    engine2.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(foes2[0].attack).toBe(3);
  });
});

// ============================================================
// 护栏 · 无新键特质的对局随机序列不变
// ============================================================

describe('护栏 · 无新键特质的对局随机序列不变', () => {
  /** 全 legacy 大连族阵容：走 applyBigMatchTriggers/applyColorMatchTriggers 既有键 */
  function build(seed: number) {
    const idGen = (() => { let n = 500; return () => ++n; })();
    const rng = new SeededRNG(seed);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const left = [
      makeChar(0, { traitIds: ['celestialshield', 'big'] }),
      makeChar(1, { traitIds: ['winterveil', 'insanegrowth'] }),
      makeChar(2, { traitIds: ['royalhoney', 'greedy'] }),
    ];
    const right = [
      makeChar(4, { traitIds: ['suitofwands'] }),
      makeChar(5, { traitIds: ['huge'] }),
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
    // 基线说明：本组数字在**不含新键特质**的 legacy 大连族对局采集。damage/drainLife
    // 注入对无新键阵容必须零随机消耗、零额外事件——若 applyBigMatchTriggers 的伤害/敌减块
    // 或 applyColorMatchTriggers 的窃取块意外消耗随机数或多发事件，会偏离基线而红。
    // 2026-09 核对修正：insanegrowth 数据由「只认 5 连 magic+4」改为官方「4/5 连 magic+5」，
    // 纯确定性 buff 事件增加（seed 7: 104→108、seed 42: 73→74），rng 终态五组全部逐字节不变——
    // 即该修正确实零随机消耗。
    const BASELINE: Record<number, { rngState: number; eventCount: number }> = {
      7: { rngState: 3704343930, eventCount: 108 },
      42: { rngState: 233035930, eventCount: 74 },
      99: { rngState: 1304883736, eventCount: 97 },
      1234: { rngState: 3200391881, eventCount: 83 },
      2026: { rngState: 1936721333, eventCount: 92 },
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
