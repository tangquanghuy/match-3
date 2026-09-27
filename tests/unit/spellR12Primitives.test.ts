/**
 * R12 原语批单元测试（2026-09-17）：面积形状清除 destroyArea / 比例法力 fraction /
 * 随机削减 reduce 'random'（官方 DecreaseRandom）/ 窃取随机属性 / LAST_TARGET 回退选敌。
 * 与 spellRecyclePrimitives.test.ts 同一套纯原语 harness（种子化 rng、无 DOM）。
 * R13 批（2026-09-17）随批增补：编队全列方位 TargetMode / enemiesOfColor 来源 /
 * destroyArea 'circle5' 圈形清除（见文件尾三个 describe）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { EffectContext } from '@engine/skills/effects/context';
import { executePrototype } from '@engine/skills/prototypes';
import {
  skill, destroyArea, mana, reduce, stealRandomStat, destroyRandomGems,
  attack, magic, armor, trueDmg,
} from '@engine/skills/builders';

let gid = 0;
function g(type: GemType): { id: number; type: GemType } {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 3, magic: 2,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

function setup(s: { left?: Partial<Character>[]; right?: Partial<Character>[]; seed?: number; chosenTargetId?: number; boardColor?: BaseColor } = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  gid = 0;
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(s.boardColor ?? BaseColor.Red)));
  }
  const left: Team = { player: PlayerSide.Left, characters: (s.left ?? [{}]).map((o, i) => makeChar(i, o)) };
  const right: Team = { player: PlayerSide.Right, characters: (s.right ?? [{}, {}, {}]).map((o, i) => makeChar(i + 4, o)) };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: state.teams[PlayerSide.Left].characters[0].id,
    rng: new SeededRNG(s.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  if (s.chosenTargetId !== undefined) ctx.chosenTargetId = s.chosenTargetId;
  return { ctx, state };
}

function gemAt(state: ReturnType<typeof createGameState>, row: number, col: number) {
  return state.board.get({ row, col });
}

describe('R12 · 面积形状清除 destroyArea', () => {
  it('square5 destroy：以棋盘中心 (3,3) 的 5x5=25 格（含边界收边），发 gem-destroy', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(destroyArea('square5', 'destroy')), ctx);
    const ev = events.find((e) => e.type === 'gem-destroy') as { cells: { pos: { row: number; col: number } }[] };
    expect(ev).toBeDefined();
    expect(ev.cells.length).toBe(25);
    for (const pos of [{ row: 1, col: 1 }, { row: 3, col: 3 }, { row: 5, col: 5 }, { row: 1, col: 5 }]) {
      expect(gemAt(state, pos.row, pos.col)).toBeNull();
    }
    // 5x5 之外的格子不动
    for (const pos of [{ row: 0, col: 0 }, { row: 6, col: 6 }, { row: 0, col: 7 }, { row: 6, col: 1 }]) {
      expect(gemAt(state, pos.row, pos.col)).not.toBeNull();
    }
  });

  it('square3 explode：3x3=9 格即完整目标集，不额外辐射，发 gem-explode', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(destroyArea('square3', 'explode')), ctx);
    expect(events.some((e) => e.type === 'gem-explode')).toBe(true);
    expect(events.some((e) => e.type === 'gem-destroy')).toBe(false);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(9);
    expect(gemAt(state, 2, 2)).toBeNull();
    expect(gemAt(state, 4, 4)).toBeNull();
    expect(gemAt(state, 0, 0)).not.toBeNull(); // 辐射会波及 (2,2)-(4,4) 之外——未发生
  });

  it('cross3 explode：横竖各 3 格的十字（5 格，官方 Block1x3+Block3x1）', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(destroyArea('cross3', 'explode')), ctx);
    expect(events.some((e) => e.type === 'gem-explode')).toBe(true);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(5);
    for (const pos of [{ row: 3, col: 3 }, { row: 3, col: 2 }, { row: 3, col: 4 }, { row: 2, col: 3 }, { row: 4, col: 3 }]) {
      expect(gemAt(state, pos.row, pos.col)).toBeNull();
    }
    expect(gemAt(state, 2, 2)).not.toBeNull(); // 十字四角不在目标集
  });

  it('x destroy：过中心格 (3,3) 的两条对角线（主对角线 8 格 ∪ 反对角线 r+c=6 共 7 格 = 14 格）', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(destroyArea('x', 'destroy')), ctx);
    const ev = events.find((e) => e.type === 'gem-destroy') as { cells: { pos: { row: number; col: number } }[] };
    expect(ev.cells.length).toBe(14);
    // 主对角线 r==c 与过 (3,3) 的反对角线 r+c==6
    for (const pos of [{ row: 0, col: 0 }, { row: 7, col: 7 }, { row: 0, col: 6 }, { row: 6, col: 0 }, { row: 3, col: 3 }, { row: 5, col: 1 }]) {
      expect(gemAt(state, pos.row, pos.col)).toBeNull();
    }
    expect(gemAt(state, 0, 7)).not.toBeNull(); // r+c=7 不在两条线上
    expect(gemAt(state, 1, 2)).not.toBeNull();
  });

  it('显式中心格：destroyArea square3 以给定格为中心（越界收边）', () => {
    const { ctx, state } = setup({});
    executePrototype(skill(destroyArea('square3', 'destroy', { row: 0, col: 0 })), ctx);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(4); // 角上 3x3 被收边成 2x2
    expect(gemAt(state, 0, 0)).toBeNull();
    expect(gemAt(state, 1, 1)).toBeNull();
    expect(gemAt(state, 2, 2)).not.toBeNull();
  });
});

describe('R12 · 比例法力 mana fraction', () => {
  it('「4 分之一的法力值」= floor(manaCost × 0.25)，逐目标现算、上限夹取', () => {
    const { ctx, state } = setup({ left: [{ manaCost: 20 }, { manaCost: 21 }, { manaCost: 20, mana: 18 }] });
    executePrototype(skill(mana('allyAll', 0, 0, { fraction: 0.25 })), ctx);
    const [a, b, c] = state.teams[PlayerSide.Left].characters;
    expect(a.mana).toBe(5);           // floor(20 × 0.25)
    expect(b.mana).toBe(5);           // floor(21 × 0.25) = 5（下取整）
    expect(c.mana).toBe(20);          // 18 + 5 → 夹到 manaCost 20
  });

  it('确定性：同种子同事件流', () => {
    const build = () => skill(mana('allyAll', 0, 0, { fraction: 0.25 }));
    const a = setup({ seed: 11 });
    const b = setup({ seed: 11 });
    expect(executePrototype(build(), b.ctx)).toEqual(executePrototype(build(), a.ctx));
  });
});

describe('R12 · 随机削减 reduce random（官方 DecreaseRandom）', () => {
  it('单步：只削攻/甲/魔之一，hp/mana 不动，削减额准确', () => {
    const { ctx, state } = setup({ right: [{ attack: 5, armor: 3, magic: 2 }], chosenTargetId: 4 });
    const before = { ...state.teams[PlayerSide.Right].characters[0] };
    const events = executePrototype(skill(reduce('enemyChosen', 'random', 2, 0)), ctx);
    const t = state.teams[PlayerSide.Right].characters[0];
    const statDrops = ['attack', 'armor', 'magic']
      .map((k) => (before as unknown as Record<string, number>)[k] - (t as unknown as Record<string, number>)[k]);
    expect(statDrops.reduce((x, y) => x + y, 0)).toBe(2); // 恰好 2 点落在三围之一
    expect(statDrops.filter((d) => d !== 0).length).toBe(1);
    expect(t.hp).toBe(before.hp);
    expect(t.mana).toBe(before.mana);
    const debuffs = events.filter((e) => e.type === 'buff' && (e as { amount: number }).amount < 0);
    expect(debuffs.length).toBe(1);
  });

  it('times 2（「从其 2 个随机技能值各消除 N 点」）：每步独立掷签，总削减 = 2×N', () => {
    const { ctx, state } = setup({ right: [{ attack: 9, armor: 9, magic: 9 }], chosenTargetId: 4 });
    const before = { ...state.teams[PlayerSide.Right].characters[0] };
    executePrototype(skill(reduce('enemyChosen', 'random', 2, 0, { times: 2 })), ctx);
    const t = state.teams[PlayerSide.Right].characters[0];
    const drop = ['attack', 'armor', 'magic']
      .map((k) => (before as unknown as Record<string, number>)[k] - (t as unknown as Record<string, number>)[k])
      .reduce((x, y) => x + y, 0);
    expect(drop).toBe(4);
  });

  it('确定性：同种子掷中同一属性', () => {
    const build = () => skill(reduce('enemyChosen', 'random', 2, 0));
    const a = setup({ seed: 5, right: [{ attack: 9, armor: 9, magic: 9 }], chosenTargetId: 4 });
    const b = setup({ seed: 5, right: [{ attack: 9, armor: 9, magic: 9 }], chosenTargetId: 4 });
    expect(executePrototype(build(), b.ctx)).toEqual(executePrototype(build(), a.ctx));
  });

  it('stealRandomStat：施法者获得掷中那项属性（同额）', () => {
    const { ctx, state } = setup({ right: [{ attack: 9, armor: 9, magic: 9 }], chosenTargetId: 4 });
    const foeBefore = { ...state.teams[PlayerSide.Right].characters[0] };
    const meBefore = { ...state.teams[PlayerSide.Left].characters[0] };
    executePrototype(skill(stealRandomStat('enemyChosen', 2, 0)), ctx);
    const statSum = (c: Record<string, number>) => c.attack + c.armor + c.magic;
    const foe = state.teams[PlayerSide.Right].characters[0] as unknown as Record<string, number>;
    const me = state.teams[PlayerSide.Left].characters[0] as unknown as Record<string, number>;
    expect(statSum(foeBefore as unknown as Record<string, number>) - statSum(foe)).toBe(2);
    expect(statSum(me) - statSum(meBefore as unknown as Record<string, number>)).toBe(2);
  });
});

describe('R12 · LAST_TARGET 回退选敌（「选择一名敌人。摧毁其法力颜色的宝石」）', () => {
  it('首段无跨段追踪时回退 ctx.chosenTargetId 的法力颜色', () => {
    // 敌人 colors 改为 Blue，棋盘铺 Blue（与默认 Red 区分，验证颜色确实来自选敌）
    const { ctx, state } = setup({ right: [{ colors: [BaseColor.Blue] }], chosenTargetId: 4, boardColor: BaseColor.Blue });
    const events = executePrototype(skill(destroyRandomGems(4, 0, 'color', 'LAST_TARGET')), ctx);
    const ev = events.find((e) => e.type === 'gem-destroy') as { cells: unknown[] };
    expect(ev).toBeDefined();
    expect(ev.cells.length).toBe(4);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(4);
  });

  it('既无追踪也无选敌 → 安全跳过（不清理）', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(destroyRandomGems(4, 0, 'color', 'LAST_TARGET')), ctx);
    expect(events).toEqual([]);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(0);
  });
});

// =====================================================================
// R13 原语批（2026-09-17）：编队全列方位 / enemiesOfColor / circle5。
// =====================================================================

describe('R13 · 编队全列方位 TargetMode（AboveTarget/BelowTarget/SelfAndBelow 族）', () => {
  it('enemyBelowTarget：选定敌人（敌方 idx0）下方 = idx1..2，锚位自身不受影响', () => {
    const { ctx, state } = setup({ right: [{}, {}, {}], chosenTargetId: 4 });
    executePrototype(skill(trueDmg('enemyBelowTarget', 3, 0, { range: 'all' })), ctx);
    const [a, b, c] = state.teams[PlayerSide.Right].characters;
    expect(a.hp).toBe(50); // 锚位（选定者）不打
    expect(b.hp).toBe(47);
    expect(c.hp).toBe(47);
  });

  it('enemyAboveTarget：选定敌人（敌方 idx2）上方 = idx0..1', () => {
    const { ctx, state } = setup({ right: [{}, {}, {}], chosenTargetId: 6 });
    executePrototype(skill(trueDmg('enemyAboveTarget', 2, 0, { range: 'all' })), ctx);
    const [a, b, c] = state.teams[PlayerSide.Right].characters;
    expect(a.hp).toBe(48);
    expect(b.hp).toBe(48);
    expect(c.hp).toBe(50); // 锚位不打
  });

  it('跨侧锚（8894「使一名盟友…再对其下位所有敌人」）：选定盟友 idx1 → 敌方 idx2 才挨打', () => {
    const { ctx, state } = setup({ left: [{}, {}, {}], right: [{}, {}, {}], chosenTargetId: 1 });
    executePrototype(skill(trueDmg('enemyBelowTarget', 4, 0, { range: 'all' })), ctx);
    const foes = state.teams[PlayerSide.Right].characters;
    expect(foes.map((f) => f.hp)).toEqual([50, 50, 46]); // 只有敌方 idx2
  });

  it('allyBelowTarget：选定盟友（idx0）下方 = idx1..2（己方不受下潮/隐匿过滤）', () => {
    const { ctx, state } = setup({ left: [{}, {}, {}], right: [{}, {}, {}], chosenTargetId: 0 });
    executePrototype(skill(attack('allyBelowTarget', 2, 0)), ctx);
    const allies = state.teams[PlayerSide.Left].characters;
    expect(allies.map((a) => a.attack)).toEqual([5, 7, 7]);
  });

  it('allySelfAndBelow（官方 SelfAndBelow）：含自身 + 下方盟友', () => {
    const { ctx, state } = setup({ left: [{}, {}, {}], right: [{}, {}, {}] });
    executePrototype(skill(attack('allySelfAndBelow', 2, 0)), ctx);
    expect(state.teams[PlayerSide.Left].characters.map((a) => a.attack)).toEqual([7, 7, 7]);
  });

  it('allyAboveSelf / allyBelowSelf：施法者贴边时上方为空、下方为其余盟友', () => {
    const { ctx, state } = setup({ left: [{}, {}, {}], right: [{}, {}, {}] });
    executePrototype(skill(magic('allyAboveSelf', 1, 0), armor('allyBelowSelf', 3, 0)), ctx);
    const allies = state.teams[PlayerSide.Left].characters;
    expect(allies.map((a) => a.magic)).toEqual([2, 2, 2]); // 上方为空 → 魔法不变
    expect(allies.map((a) => a.armor)).toEqual([3, 6, 6]); // 护甲 = 自身以外的下方盟友
  });

  it('编队切片可命中下潜目标；下潜只躲整队法术伤害', () => {
    const submerged = { statuses: [{ id: 'submerged', turns: 3 }] };
    const { ctx, state } = setup({ right: [{}, {}, submerged], chosenTargetId: 4 });
    executePrototype(skill(trueDmg('enemyBelowTarget', 9, 0, { range: 'all' })), ctx);
    const [, b, c] = state.teams[PlayerSide.Right].characters;
    expect(b.hp).toBe(41);
    expect(c.hp).toBe(41); // 编队子集不是整队，仍可伤害下潜目标
  });
});

describe('R13 · enemiesOfColor 敌方法力色存活计数来源', () => {
  it('「因红色敌人而增强」：每个红敌 +N，与 alliesOfColor 对称', () => {
    // 敌方 3 人里 2 个红（默认 colors [Red]）、1 个蓝 → trueDmg = 0 + 2×2 = 4
    const { ctx, state } = setup({
      right: [{}, {}, { colors: [BaseColor.Blue] }],
      chosenTargetId: 6,
    });
    executePrototype(skill(trueDmg('enemyChosen', 0, 0, {
      modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } },
    })), ctx);
    expect(state.teams[PlayerSide.Right].characters[2].hp).toBe(46);
  });

  it('来源计数为 0 → 加成为 0（无红敌时退化普通一次缩放）', () => {
    const { ctx, state } = setup({
      right: [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Green] }, { colors: [BaseColor.Yellow] }],
      chosenTargetId: 4,
    });
    executePrototype(skill(trueDmg('enemyChosen', 0, 0, {
      modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfColor', color: BaseColor.Red } },
    })), ctx);
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(50);
  });

  it('多来源相加（8089「紫色的盟友和敌军」）：己方 1 紫 + 敌方 2 紫 = 计数 3', () => {
    const { ctx, state } = setup({
      left: [{ colors: [BaseColor.Purple] }],
      right: [{ colors: [BaseColor.Purple] }, { colors: [BaseColor.Purple] }, {}],
      chosenTargetId: 4,
    });
    executePrototype(skill(trueDmg('enemyChosen', 0, 0, {
      modifier: {
        mod: { kind: 'multiplier', a: 2 },
        sources: [
          { kind: 'alliesOfColor', color: BaseColor.Purple },
          { kind: 'enemiesOfColor', color: BaseColor.Purple },
        ],
      },
    })), ctx);
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(44); // 0 + 2×3
  });
});

describe('R13 · destroyArea circle5（官方 BoardTarget=Circle，5x5 圈）', () => {
  it('以棋盘中心 (3,3) 为圆心、半径 2.5 格：21 格圆角盘（5x5 去四角），发 gem-destroy', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(destroyArea('circle5', 'destroy')), ctx);
    const ev = events.find((e) => e.type === 'gem-destroy') as { cells: { pos: { row: number; col: number } }[] };
    expect(ev).toBeDefined();
    expect(ev.cells.length).toBe(21);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(21);
    // 圆内近角（dr²+dc²=5 ≤ 6.25）被清；圆心与轴向端点也在圆内
    expect(gemAt(state, 1, 2)).toBeNull();
    expect(gemAt(state, 2, 1)).toBeNull();
    expect(gemAt(state, 4, 4)).toBeNull(); // (1,1) 偏移 = 2 ≤ 6.25
    expect(gemAt(state, 3, 5)).toBeNull(); // (0,2) 偏移 = 4 ≤ 6.25
  });

  it('5x5 方块角格（dx²+dy²=8）留在场内——圈与方块的分界', () => {
    const { ctx, state } = setup({});
    executePrototype(skill(destroyArea('circle5', 'destroy')), ctx);
    for (const pos of [{ row: 1, col: 1 }, { row: 1, col: 5 }, { row: 5, col: 1 }, { row: 5, col: 5 }]) {
      expect(gemAt(state, pos.row, pos.col)).not.toBeNull();
    }
    expect(gemAt(state, 3, 3)).toBeNull(); // 圆心
    expect(gemAt(state, 3, 1)).toBeNull(); // (0,-2) 距离² = 4 ≤ 6.25
  });

  it('显式中心格：circle5 以 (0,0) 为圆心时收边成 8 格（(2,2) 距离²=8 出圆）', () => {
    const { ctx, state } = setup({});
    executePrototype(skill(destroyArea('circle5', 'destroy', { row: 0, col: 0 })), ctx);
    let cleared = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gemAt(state, r, c) === null) cleared++;
    expect(cleared).toBe(8);
    expect(gemAt(state, 0, 0)).toBeNull();
    expect(gemAt(state, 1, 2)).toBeNull(); // 1+4=5 ≤ 6.25
    expect(gemAt(state, 2, 2)).not.toBeNull(); // 4+4=8 > 6.25
  });
});
