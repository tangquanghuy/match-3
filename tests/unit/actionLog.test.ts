import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

/** 铺一张不会自发匹配的棋盘，让交换/施法之外没有额外连锁噪声。 */
function fillBoard(board: BoardModel): void {
  const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
    }
  }
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 6,
    colors: [BaseColor.Red],
    manaCost: 10,
    mana: 10, // 默认满法力，可释放
    skillId: 'plain',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function setup(registry = new ExtensionRegistry(), leftOver: Partial<Character> = {}) {
  const board = new BoardModel();
  fillBoard(board);
  // 底行构造一处合法交换：(7,0)=(7,1)=红、(6,2)=红，交换 (7,2)<->(6,2) 即成三连红
  board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
  board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Blue)));

  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, leftOver)] };
  const right: Team = {
    player: PlayerSide.Right,
    characters: [makeChar(4, { skillId: 'none', mana: 0 })],
  };
  const state = createGameState(board, left, right);
  let idg = 900000;
  const engine = new TurnEngine(state, new SeededRNG(7), () => idg++, registry);
  engine.skullChance = 0; // 补充只生成颜色宝石，避免骷髅伤害干扰胜负
  return { engine, state };
}

/** 只造成伤害的普通技能：应交出回合。 */
function plainSkill(base: number): SkillPrototype {
  return { segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base, mult: 0 } }] };
}

describe('结构化行动日志（任务 4 / 需求 1.5、3.6）', () => {
  it('合法交换登记类型、行动方与两格坐标', () => {
    const { engine, state } = setup();
    engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });

    expect(state.actionLog).toHaveLength(1);
    const [entry] = state.actionLog;
    expect(entry.index).toBe(0);
    expect(entry.side).toBe(PlayerSide.Left);
    expect(entry.action).toEqual({
      type: 'swap',
      from: { row: 7, col: 2 },
      to: { row: 6, col: 2 },
    });
    expect(entry.outcome).toBe('switched');
  });

  it('坐标是快照，调用方复用同一对象也不会回写日志', () => {
    const { engine, state } = setup();
    const from = { row: 7, col: 2 };
    const to = { row: 6, col: 2 };
    engine.resolveAction({ type: 'swap', from, to });
    from.row = 0;
    to.col = 0;

    expect(state.actionLog[0].action).toEqual({
      type: 'swap',
      from: { row: 7, col: 2 },
      to: { row: 6, col: 2 },
    });
  });

  it('被拒绝的行动不登记也不占号', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('plain', plainSkill(3));
    // 法力不足：施法应被拒绝
    const { engine, state } = setup(registry, { mana: 0 });

    engine.resolveSwap({ row: 0, col: 0 }, { row: 5, col: 5 }); // 非相邻
    engine.resolveSwap({ row: 0, col: 0 }, { row: 0, col: 1 }); // 不成匹配
    engine.castSkill(0); // 法力不足
    engine.castSkill(999); // 角色不存在
    expect(state.actionLog).toHaveLength(0);

    // 其后第一次真实行动仍应拿到 index 0
    state.teams[PlayerSide.Left].characters[0].mana = 10;
    engine.castSkill(0);
    expect(state.actionLog).toHaveLength(1);
    expect(state.actionLog[0].index).toBe(0);
  });

  it('施法登记角色 id 与实际技能 id', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('plain', plainSkill(3));
    const { engine, state } = setup(registry);

    engine.castSkill(0);

    const [entry] = state.actionLog;
    expect(entry.action).toEqual({ type: 'cast', characterId: 0 });
    expect(entry.skillId).toBe('plain');
    expect(entry.side).toBe(PlayerSide.Left);
    expect(entry.outcome).toBe('held');
  });

  it('施放不消耗回合：普通与额外回合技能都记为 held，行动方不变', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('extra', {
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 3, mult: 0 } },
        { kind: 'extraTurn' },
      ],
    });
    registry.prototypes.set('plain', plainSkill(3));
    const { engine, state } = setup(registry, { skillId: 'extra' });

    engine.castSkill(0);
    expect(state.actionLog[0].outcome).toBe('held');
    expect(state.activePlayer).toBe(PlayerSide.Left);

    // 普通技能同样不交出回合（释放免费）；额外回合标记留到下一次交换行动生效
    state.teams[PlayerSide.Left].characters[0].mana = 10;
    state.teams[PlayerSide.Left].characters[0].skillId = 'plain';
    engine.castSkill(0);
    expect(state.actionLog[1].index).toBe(1);
    expect(state.actionLog[1].outcome).toBe('held');
    expect(state.activePlayer).toBe(PlayerSide.Left);
  });

  it('致胜行动记为 game-over，优先于回合归属', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('lethal', {
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 999, mult: 0 } },
        { kind: 'extraTurn' },
      ],
    });
    const { engine, state } = setup(registry, { skillId: 'lethal' });

    engine.castSkill(0);

    expect(state.winner).toBe(PlayerSide.Left);
    expect(state.actionLog).toHaveLength(1);
    expect(state.actionLog[0].outcome).toBe('game-over');
  });

  it('index 随受理行动单调递增，可作为本场行动序号', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('plain', plainSkill(1));
    registry.prototypes.set('none', plainSkill(1));
    const { engine, state } = setup(registry);

    engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 }); // 左方交换 → 交给右方
    state.teams[PlayerSide.Right].characters[0].mana = 10;
    engine.castSkill(4); // 右方施法 → 交回左方

    expect(state.actionLog.map((e) => [e.index, e.side, e.action.type])).toEqual([
      [0, PlayerSide.Left, 'swap'],
      [1, PlayerSide.Right, 'cast'],
    ]);
  });
});
