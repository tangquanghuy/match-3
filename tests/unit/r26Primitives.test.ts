/**
 * R26 批原语单测：reduce/steal fraction（25% 比例削减）、steal drainAll 透传修复、
 * createMix 混合端点（SpecialGemSpec/'SKULL'，纯色数组旧序列化不变）、
 * reposition n（enemyNth 第二位）、随机清除 countRange、狼化状态施加（8553）。
 * 全部走 executePrototype / 构造函数纯逻辑路径，不经 TurnEngine。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import {
  createMix, destroyRandomGems, inflict, reposition, skill, steal, reduce,
} from '@engine/skills/builders';
import type { SkillPrototype } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team } from '@engine/types';

let gid = 0;

function fillBoard(board: BoardModel): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, { id: gid++, type: colorGem(BaseColor.Red) });
  }
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

function setup(leftOver: Partial<Character>[] = [{}], rightOver: Partial<Character>[] = [{}, {}, {}]): {
  ctx: EffectContext; state: ReturnType<typeof createGameState>;
} {
  const board = new BoardModel();
  fillBoard(board);
  const left: Team = { player: PlayerSide.Left, characters: leftOver.map((o, i) => makeChar(i, o)) };
  const right: Team = { player: PlayerSide.Right, characters: rightOver.map((o, i) => makeChar(i + 4, o)) };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: state.teams[PlayerSide.Left].characters[0].id,
    rng: new SeededRNG(20260919),
    nextGemId: () => 950000 + gid++,
  };
  return { ctx, state };
}

const leftTeam = (s: ReturnType<typeof createGameState>) => s.teams[PlayerSide.Left].characters;
const rightTeam = (s: ReturnType<typeof createGameState>) => s.teams[PlayerSide.Right].characters;

describe('R26 · reduce/steal fraction（25% 比例削减）', () => {
  it('fraction 0.25：削减额 = 当前值 × 1/4 下取整（10 甲 → 削 2）', () => {
    const { ctx, state } = setup([{}], [{ armor: 10 }]);
    executePrototype({ segments: [reduce('enemyFront', 'armor', 0, 0, { fraction: 0.25 })] }, ctx);
    expect(rightTeam(state)[0].armor).toBe(8);
  });

  it('fraction 窃取形态：steal armor 25%（官方 CountArmor 25 + StealArmor，8040 句式）', () => {
    const { ctx, state } = setup([{ armor: 0 }, {}, {}], [{ armor: 10 }]);
    executePrototype({
      segments: [steal('enemyFront', 'armor', 'armor', 0, 0, { fraction: 0.25 })],
    }, ctx);
    expect(rightTeam(state)[0].armor).toBe(8);
    // 施法者获得同额（gainRatio 缺省 1）
    expect(leftTeam(state)[0].armor).toBe(2);
  });

  it('fraction 与 halve 互斥时 halve 优先；当前值为 0 → 无事发生', () => {
    const { ctx, state } = setup([{}], [{ armor: 10 }]);
    executePrototype({ segments: [reduce('enemyFront', 'armor', 0, 0, { halve: true, fraction: 0.25 })] }, ctx);
    expect(rightTeam(state)[0].armor).toBe(5);

    const { ctx: ctx2, state: state2 } = setup([{}], [{ mana: 0 }]);
    const events = executePrototype({ segments: [reduce('enemyFront', 'mana', 0, 0, { fraction: 0.25 })] }, ctx2);
    expect(events).toHaveLength(0);
    expect(rightTeam(state2)[0].mana).toBe(0);
  });
});

describe('R26 · steal drainAll 透传（r15 7347 静默无效修复）', () => {
  it('「耗尽其法力值并获得其中半数」：目标清零、自身得一半', () => {
    const { ctx, state } = setup([{}], [{ mana: 9, manaCost: 20 }]);
    executePrototype({
      segments: [steal('enemyFront', 'mana', 'mana', 0, 0, { drainAll: true, gainRatio: 0.5 })],
    }, ctx);
    expect(rightTeam(state)[0].mana).toBe(0);
    expect(leftTeam(state)[0].mana).toBe(4); // floor(9/2)
  });
});

describe('R26 · createMix 混合端点', () => {
  it('纯色数组维持旧 mix 序列化（逐字节护栏）', () => {
    expect(JSON.parse(JSON.stringify(createMix([BaseColor.Red, 'CHOSEN'], 5)))).toEqual({
      kind: 'gem',
      params: { op: 'create', gem: { kind: 'mix', colors: [BaseColor.Red, 'CHOSEN'] }, count: { base: 5, mult: 0 } },
    });
  });

  it('色 + 骷髅 / 色 + 特殊宝石端点走 mixAny（7713/9658 句式）', () => {
    const mixed = createMix([BaseColor.Green, 'SKULL'], 14);
    expect(mixed.params).toHaveProperty('gem', { kind: 'mixAny', entries: [BaseColor.Green, 'SKULL'] });
    const special = createMix([BaseColor.Green, { kind: 'freezeGem' }], 14);
    expect(special.params).toHaveProperty('gem', { kind: 'mixAny', entries: [BaseColor.Green, { kind: 'freezeGem' }] });
  });

  it('行为：绿宝石与骷髅逐颗混合创造（两种类型都出现）', () => {
    gid = 0;
    const board = new BoardModel();
    fillBoard(board);
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
    const state = createGameState(board, left, right);
    const ctx: EffectContext = {
      state, casterId: 0, rng: new SeededRNG(11), nextGemId: () => 960000 + gid++,
    };
    executePrototype({
      segments: [
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'allColors' } } },
        createMix([BaseColor.Green, 'SKULL'], 20) as SkillPrototype['segments'][number],
      ],
    }, ctx);
    let greens = 0;
    let skulls = 0;
    state.board.forEach((gem) => {
      if (!gem) return;
      if (gem.type.kind === 'color' && gem.type.color === BaseColor.Green) greens++;
      if (gem.type.kind === 'skull') skulls++;
    });
    expect(greens).toBeGreaterThan(0);
    expect(skulls).toBeGreaterThan(0);
    expect(greens + skulls).toBe(20);
  });
});

describe('R26 · 既有原语核实（reposition n / 随机清除 countRange / 狼化）', () => {
  it('reposition enemyNth n:2：编队第二位被击回末位（「第二次击退」）', () => {
    const { ctx, state } = setup([{}], [{}, {}, {}]);
    executePrototype({ segments: [reposition('enemyNth', 'back', { n: 2 })] }, ctx);
    const ids = rightTeam(state).map((c) => c.id);
    expect(ids).toEqual([4, 6, 5]);
  });

  it('destroyRandomGems countRange：掷选 2-3 颗（区间路径）', () => {
    const { ctx } = setup();
    const events = executePrototype({
      segments: [destroyRandomGems(0, 0, 'all', undefined, { countRange: { min: 2, max: 3 } })],
    }, ctx);
    // 单条 gem-destroy 事件携带全部被清格
    const n = events.filter((e) => e.type === 'gem-destroy').reduce((acc, e) => acc + (e as { cells: unknown[] }).cells.length, 0);
    expect([2, 3]).toContain(n);
  });

  it('inflict lycanthropy：2 名随机敌人陷入狼化（8553，白名单扩容后）', () => {
    const { ctx, state } = setup();
    executePrototype({
      segments: [inflict('lycanthropy', 'enemyRandomN', { n: 2 })],
    }, ctx);
    const wolves = rightTeam(state).filter((c) => c.statuses.some((s) => s.id === 'lycanthropy'));
    expect(wolves).toHaveLength(2);
  });

  it('skill() 组合烟测：R26 两条回收技能段可执行不抛错', () => {
    const { ctx } = setup();
    const proto: SkillPrototype = skill(
      { kind: 'damage', target: 'enemyAll', scaling: { base: 6, mult: 1 }, range: 'all' },
      { kind: 'selfRevive', healPct: 0.5, full: true },
    );
    expect(() => executePrototype(proto, ctx)).not.toThrow();
  });
});
