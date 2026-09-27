import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function fillBoard(board: BoardModel, palette: BaseColor[]): void {
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
    mana: 10, // 满，可释放
    skillId: 'combo',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function setup(registry: ExtensionRegistry) {
  const board = new BoardModel();
  fillBoard(board, [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]);
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { skillId: 'none', mana: 0, hp: 50 })] };
  const state = createGameState(board, left, right);
  let idg = 500000;
  const engine = new TurnEngine(state, new SeededRNG(5), () => idg++, registry);
  engine.skullChance = 0;
  return { engine, state, board };
}

describe('castSkill 执行技能原型（需求 3.1, 3.3, 11.2）', () => {
  it('摧毁沙漏也获得额外回合，来源记作 destroy 而非匹配', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('combo', {
      segments: [{ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', rows: [3] } } }],
    });
    const { engine, board, state } = setup(registry);
    board.set({ row: 3, col: 3 }, g(specialGem('hourglass')));
    const events = engine.castSkill(0);
    expect(events.filter(e => e.type === 'special-gem-trigger' && e.kind === 'hourglass')).toHaveLength(1);
    expect(events.filter(e => e.type === 'extra-turn' && e.source === 'destroy')).toHaveLength(1);
    expect(state.activePlayer).toBe(PlayerSide.Left);
  });

  it('伤害 + 宝石 + 额外回合组合技端到端产出正确事件流', () => {
    const registry = new ExtensionRegistry();
    const combo: SkillPrototype = {
      segments: [
        // 1. 对敌方队首造成 [魔法 + 4] = 10 伤害
        { kind: 'damage', target: 'enemyFront', scaling: { base: 4, mult: 1 } },
        // 2. 摧毁第 3 行宝石（触发重力/连锁）
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', rows: [3] } } },
        // 3. 获得额外回合
        { kind: 'extraTurn' },
      ],
    };
    registry.prototypes.set('combo', combo);
    const { engine, state } = setup(registry);

    const events = engine.castSkill(0);

    // skill-cast 为首事件（需求 3.3）
    expect(events[0]).toMatchObject({ type: 'skill-cast', characterId: 0, skillId: 'combo' });
    // 释放后法力清零（需求 16.3）
    expect(state.teams[PlayerSide.Left].characters[0].mana).toBe(0);

    // 效果事件紧随其后
    const types = events.map((e) => e.type);
    expect(types).toContain('skill-damage');
    expect(types).toContain('gem-destroy');
    expect(types).toContain('gravity');
    expect(types).toContain('extra-turn');

    // 顺序：skill-cast < skill-damage < gem-destroy < extra-turn（需求 11.3）
    expect(types.indexOf('skill-cast')).toBe(0);
    expect(types.indexOf('skill-damage')).toBeLessThan(types.indexOf('gem-destroy'));
    expect(types.indexOf('gem-destroy')).toBeLessThan(types.indexOf('extra-turn'));

    // 敌方队首受 10 伤害
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(40);
  });

  it('无原型注册 → 仅扣法力，消耗回合（需求 11.4）', () => {
    const registry = new ExtensionRegistry();
    const { engine, state } = setup(registry);
    const events = engine.castSkill(0);
    expect(events[0].type).toBe('skill-cast');
    expect(events.some((event) => event.type === 'turn-end')).toBe(true);
    expect(state.activePlayer).toBe(PlayerSide.Right);
    expect(state.teams[PlayerSide.Left].characters[0].mana).toBe(0);
  });

  it('已注册的普通技能通过统一入口执行，且消耗回合', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('combo', {
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 1, mult: 0 } }],
    });
    const { engine, state } = setup(registry);

    const events = engine.resolveAction({ type: 'cast', characterId: 0 });

    expect(events.filter((event) => event.type === 'turn-end')).toHaveLength(1);
    expect(events.some((event) => event.type === 'extra-turn')).toBe(false);
    expect(events.some((event) => event.type === 'game-over')).toBe(false);
    expect(state.activePlayer).toBe(PlayerSide.Right);
  });

  it('击杀敌方全队时 game-over 排在末尾（需求 3.3）', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('combo', {
      segments: [{ kind: 'damage', target: 'enemyAll', scaling: { base: 100, mult: 0 }, range: 'all' }],
    });
    const { engine, state } = setup(registry);
    const events = engine.castSkill(0);
    expect(state.teams[PlayerSide.Right].characters).toEqual([]);
    expect(events.some((event) => event.type === 'turn-end')).toBe(false);
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: 'game-over', winner: PlayerSide.Left });
  });

  it('does not promote legacy queued data after a lethal skill hit', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('combo', {
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 100, mult: 0 } }],
    });
    const { engine, state } = setup(registry);
    const right = state.teams[PlayerSide.Right];
    right.summonQueue = [{ character: makeChar(9, { mana: 0, skillId: 'none' }), troopId: 6009 }];

    const events = engine.castSkill(0);

    expect(right.characters).toEqual([]);
    expect(events.some((event) => event.type === 'summon')).toBe(false);
    expect(events.some((event) => event.type === 'game-over')).toBe(true);
  });

  it('确定性：相同状态 + 种子 → 相同事件流（需求 11.5）', () => {
    const proto: SkillPrototype = {
      segments: [
        { kind: 'damage', target: 'enemyRandom', scaling: { base: 3, mult: 1 } },
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', cols: [2] } } },
      ],
    };
    const run = () => {
      gid = 0; // 重置宝石 id 计数器，保证两次运行初始棋盘 id 一致
      const registry = new ExtensionRegistry();
      registry.prototypes.set('combo', proto);
      const { engine } = setup(registry);
      return JSON.stringify(engine.castSkill(0));
    };
    expect(run()).toBe(run());
  });

  it('额外回合技能立即保留当前玩家，且不会泄漏到下一次行动', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('combo', { segments: [{ kind: 'extraTurn' }] });
    const { engine, state } = setup(registry);

    const castEvents = engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(castEvents.filter((event) => event.type === 'extra-turn')).toHaveLength(1);
    expect(castEvents.some((event) => event.type === 'turn-end')).toBe(false);
    expect(state.activePlayer).toBe(PlayerSide.Left);

    // 下一次正常行动会消费自己的回合，证明技能额外回合信号已清零。
    const board = state.board;
    board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Blue)));
    board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Green)));
    const swapEvents = engine.resolveAction({
      type: 'swap',
      from: { row: 7, col: 2 },
      to: { row: 6, col: 2 },
    });
    expect(swapEvents.some((event) => event.type === 'turn-end')).toBe(true);
    expect(state.activePlayer).toBe(PlayerSide.Right);
  });
});
