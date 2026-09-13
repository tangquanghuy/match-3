import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { summonEffect } from '@engine/skills/effects/summon';
import type { SummonTemplate } from '@engine/skills/effects/summon';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameState } from '@engine/GameState';

function makeChar(id: number): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: 'none', statuses: [], defeated: false,
  };
}
function freshState(): GameState {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  return createGameState(new BoardModel(), left, right);
}

const CANDIDATES = ['A', 'B', 'C', 'D', 'E'];
const resolveRef = (ref: string): SummonTemplate => ({
  name: ref, maxHp: 20, hp: 20, attack: 5, armor: 0, magic: 3,
  colors: [BaseColor.Blue], manaCost: 10, mana: 0, skillId: 'none',
});

function summonRandomName(refs: string[], seed: number): string | null {
  const state = freshState();
  let gid = 1;
  const ctx: EffectContext = { state, casterId: 0, rng: new SeededRNG(seed), nextGemId: () => gid++ };
  summonEffect({ source: { randomOf: refs }, resolveRef }).apply(ctx);
  const team = state.teams[PlayerSide.Left].characters;
  return team.length > 1 ? team[1].name : null;
}

describe('随机召唤确定性（需求 7.4）', () => {
  it('相同候选集 + 相同种子 → 相同选择', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...CANDIDATES), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 1000 }),
        (refs, seed) => {
          expect(summonRandomName(refs, seed)).toBe(summonRandomName(refs, seed));
        },
      ),
    );
  });

  it('选中的召唤物恒在候选集内', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...CANDIDATES), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 1000 }),
        (refs, seed) => {
          const name = summonRandomName(refs, seed);
          expect(refs).toContain(name);
        },
      ),
    );
  });
});
