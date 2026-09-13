import { describe, expect, it } from 'vitest';
import { BaseColor, PlayerSide } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { extraActionComboLevel, hasTurnSwitch } from '../../src/render/turnHudLogic';

const elimination = (chainCount: number): GameEvent => ({
  type: 'elimination',
  chainCount,
  cells: [{
    pos: { row: 0, col: 0 },
    gemId: chainCount,
    gemType: { kind: 'color', color: BaseColor.Red },
  }],
  shape: 'line3',
});

describe('turn HUD event semantics', () => {
  it('does not advance TURN for an extra action', () => {
    expect(hasTurnSwitch([{ type: 'extra-turn', player: PlayerSide.Left, source: 'match' }])).toBe(false);
  });

  it('advances TURN when control passes to the other side', () => {
    expect(hasTurnSwitch([{ type: 'turn-end', nextPlayer: PlayerSide.Right }])).toBe(true);
  });

  it('treats a first-resolution extra action as combo level 2', () => {
    expect(extraActionComboLevel([elimination(1)])).toBe(2);
  });

  it('adds the extra action after the highest cascade level', () => {
    expect(extraActionComboLevel([elimination(1), elimination(2), elimination(3)])).toBe(4);
  });
});
