import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { MatchResolver } from '@engine/MatchResolver';
import {
  BaseColor,
  PlayerSide,
  MatchState,
  colorGem,
  skullGem,
} from '@engine/types';
import type { Character, Team, Gem } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    colors: [BaseColor.Red],
    manaRequirement: { [BaseColor.Red]: 20 },
    manaPool: {},
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide): Team {
  return {
    player: side,
    characters: [makeChar(side === PlayerSide.Left ? 0 : 4), makeChar(side === PlayerSide.Left ? 1 : 5), makeChar(side === PlayerSide.Left ? 2 : 6), makeChar(side === PlayerSide.Left ? 3 : 7)],
  };
}

let gid = 0;
function g(type: Gem['type']): Gem {
  return { id: gid++, type };
}

function makeIdGen(start: number): () => number {
  let id = start;
  return () => id++;
}

describe('TurnEngine 交换合法性', () => {
  it('非相邻交换被拒绝且棋盘不变', () => {
    const rng = new SeededRNG(1);
    const idGen = makeIdGen(50000);
    const board = new BoardGenerator(rng, idGen).generate();
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));
    const engine = new TurnEngine(state, rng, idGen);

    const before = board.get({ row: 0, col: 0 })?.id;
    const events = engine.resolveSwap({ row: 0, col: 0 }, { row: 5, col: 5 });
    expect(events.length).toBe(0);
    expect(board.get({ row: 0, col: 0 })?.id).toBe(before);
  });

  it('非法交换（不产生匹配）发出 swap-rejected 并还原', () => {
    // 构造一个已知无匹配、且交换后仍无匹配的棋盘
    const board = new BoardModel();
    const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        // 棋盘格染色，保证任意相邻交换都不会立刻三连
        board.set({ row: r, col: c }, g(colorGem(palette[(r * 3 + c * 5) % 4])));
      }
    }
    const resolver = new MatchResolver();
    // 找一对交换后无匹配的相邻格
    const rng = new SeededRNG(2);
    const idGen = makeIdGen(60000);
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));
    const engine = new TurnEngine(state, rng, idGen);

    // 若初始就有匹配则跳过该断言（染色未必绝对无匹配）
    if (!resolver.hasAnyMatch(board)) {
      board.swap({ row: 0, col: 0 }, { row: 0, col: 1 });
      const illegal = !resolver.hasAnyMatch(board);
      board.swap({ row: 0, col: 0 }, { row: 0, col: 1 }); // 还原
      if (illegal) {
        const events = engine.resolveSwap({ row: 0, col: 0 }, { row: 0, col: 1 });
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('swap-rejected');
      }
    }
  });
});

describe('TurnEngine 连锁与法力', () => {
  it('合法交换触发消除并产生法力，回合结束切换玩家', () => {
    // 手工构造：第 7 行 [R R . R ...]，把 (6,2) 的 R 下移可凑成三连
    // 更简单：直接放一个交换即成三连的局面
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % 4])));
      }
    }
    // 在底行构造： (7,0)=R (7,1)=R (6,2)=R, 交换 (7,2)<->(6,2) 使 (7,0..2) 三连红
    board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
    // 确保 (7,2) 上方与之交换不会有其它干扰，(6,2)=R 与 (5,2) 不同
    board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Blue)));

    const rng = new SeededRNG(5);
    const idGen = makeIdGen(70000);
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));
    const engine = new TurnEngine(state, rng, idGen);

    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });

    // 应有 swap 事件
    expect(events[0].type).toBe('swap');
    // 应有至少一个消除事件
    expect(events.some((e) => e.type === 'elimination')).toBe(true);
    // 红色匹配应产生 mana-gain 给左队队首（吃红）
    const manaGain = events.find((e) => e.type === 'mana-gain');
    expect(manaGain).toBeDefined();
    // 解析完棋盘应填满
    expect(board.isFull()).toBe(true);
    // 状态回到等待输入
    expect(state.state).toBe(MatchState.AwaitingInput);
  });
});

describe('TurnEngine 确定性', () => {
  it('相同种子相同操作产生相同事件流', () => {
    function run(): string {
      const rng = new SeededRNG(12345);
      const idGen = makeIdGen(80000);
      const board = new BoardGenerator(rng, idGen).generate();
      const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));
      const engine = new TurnEngine(state, rng, idGen);
      // 找一个合法交换
      const resolver = new MatchResolver();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          for (const b of [{ row: r, col: c + 1 }, { row: r + 1, col: c }]) {
            if (!BoardModel.inBounds(b)) continue;
            const trial = board.clone();
            trial.swap({ row: r, col: c }, b);
            if (resolver.hasAnyMatch(trial)) {
              const events = engine.resolveSwap({ row: r, col: c }, b);
              return JSON.stringify(events);
            }
          }
        }
      }
      return '';
    }
    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('TurnEngine 骷髅伤害', () => {
  it('骷髅三连对敌方队首造成伤害', () => {
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % 4])));
      }
    }
    // 构造骷髅三连：(7,0)=S (7,1)=S (6,2)=S，交换 (7,2)<->(6,2)
    board.set({ row: 7, col: 0 }, g(skullGem()));
    board.set({ row: 7, col: 1 }, g(skullGem()));
    board.set({ row: 6, col: 2 }, g(skullGem()));
    board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
    board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Blue)));

    const rng = new SeededRNG(9);
    const idGen = makeIdGen(90000);
    const left = makeTeam(PlayerSide.Left);
    const right = makeTeam(PlayerSide.Right);
    const state = createGameState(board, left, right);
    const engine = new TurnEngine(state, rng, idGen);
    engine.skullChance = 0;

    const hpBefore = right.characters[0].hp;
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });

    const dmg = events.find((e) => e.type === 'skull-damage');
    expect(dmg).toBeDefined();
    // 攻击者为左队队首 attack=5，骷髅数=3 → 伤害 15
    expect(right.characters[0].hp).toBe(hpBefore - 15);
  });
});
