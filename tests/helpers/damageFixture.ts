import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem, type Character } from '@engine/types';
import type { EffectContext } from '@engine/skills/effects/context';
export function damageCharacter(id: number, overrides: Partial<Character> = {}): Character {
  return { id, name: `C${id}`, maxHp: 1000, hp: 1000, armor: 0, attack: 17, magic: 11,
    colors: [BaseColor.Red, BaseColor.Green], manaCost: 16, mana: 16,
    skillId: '20007', statuses: [], defeated: false, ...overrides };
}
export function damageFixture(red = 0, green = 0, overrides: Partial<Character>[] = [{}, {}, {}, {}]) {
  const board = new BoardModel();
  const other = [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const i = row * 8 + col;
    board.set({ row, col }, { id: i + 1, type: colorGem(i < red ? BaseColor.Red : i < red + green ? BaseColor.Green : other[(row + col) % 4]) });
  }
  const caster = damageCharacter(0);
  const enemies = overrides.map((o, i) => damageCharacter(10 + i, o));
  const state = createGameState(board, { player: PlayerSide.Left, characters: [caster] }, { player: PlayerSide.Right, characters: enemies });
  let gid = 1000;
  const ctx: EffectContext = { state, casterId: 0, chosenTargetId: 11, rng: new SeededRNG(42), nextGemId: () => gid++ };
  return { board, state, ctx, caster, enemies };
}
