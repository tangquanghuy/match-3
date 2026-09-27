import { describe, it, expect } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { applyStatus } from '@engine/skills/effects/status';
import { BoardGenerator } from '@engine/boardGen';
import { BaseColor, PlayerSide, MatchState } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

function setup() {
  const rng = new SeededRNG(42);
  let id = 1000;
  const board = new BoardGenerator(rng, () => id++, 0).generate();
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  const state = createGameState(board, left, right);
  const engine = new TurnEngine(state, rng, () => id++);
  engine.skullChance = 0;
  return { engine, state };
}

describe('TurnEngine.passTurn（测试页推进回合复用）', () => {
  it('空过回合切换行动方并回到等待输入', () => {
    const { engine, state } = setup();
    expect(state.activePlayer).toBe(PlayerSide.Left);
    engine.passTurn();
    expect(state.activePlayer).toBe(PlayerSide.Right);
    expect(state.state).toBe(MatchState.AwaitingInput);
  });

  it('对即将行动方结算中毒 DoT，产出 status-tick', () => {
    const { engine, state } = setup();
    // 给右队（即将行动方）角色中毒
    applyStatus(state.teams[PlayerSide.Right].characters[0], { id: 'poison', turns: 2, magnitude: 4 });
    const hpBefore = state.teams[PlayerSide.Right].characters[0].hp;
    const events = engine.passTurn();
    expect(events.some((e) => e.type === 'status-tick')).toBe(true);
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBeGreaterThanOrEqual(hpBefore - 1);
  });

  it('燃烧自愈后 passTurn 产出 status-expire（R004：无回合上限，走累积自愈判定）', () => {
    const { engine, state } = setup();
    const target = state.teams[PlayerSide.Right].characters[0];
    applyStatus(target, { id: 'burning', turns: 1 });
    target.statuses[0].recoveryChance = 100;
    const events = engine.passTurn();
    expect(events.some((e) => e.type === 'status-expire')).toBe(true);
    expect(state.teams[PlayerSide.Right].characters[0].statuses.length).toBe(0);
  });

  it('非等待输入态时 passTurn 无操作', () => {
    const { engine, state } = setup();
    state.state = MatchState.GameOver;
    expect(engine.passTurn()).toEqual([]);
  });
});
