import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { AiColorChooser, countBoardColors } from '@engine/skills/colorChooser';
import { BaseColor, PlayerSide, ALL_BASE_COLORS, colorGem, skullGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

/** 按各色计数铺棋盘，多余格填骷髅 */
function boardOf(counts: number[]): BoardModel {
  gid = 0;
  const board = new BoardModel();
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cells.push({ row: r, col: c });
  let i = 0;
  for (let ci = 0; ci < ALL_BASE_COLORS.length && i < cells.length; ci++) {
    for (let k = 0; k < counts[ci] && i < cells.length; k++) {
      board.set(cells[i++], g(colorGem(ALL_BASE_COLORS[ci])));
    }
  }
  while (i < cells.length) board.set(cells[i++], g(skullGem()));
  return board;
}

function makeChar(id: number): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: 'none', statuses: [], defeated: false,
  };
}
function stateOf(board: BoardModel) {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  return createGameState(board, left, right);
}

// 6 色计数，每色 0..10（总数 ≤ 60 < 64，留骷髅空间）
const countsArb = fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 6, maxLength: 6 });

describe('AiColorChooser 属性（需求 2.3, 2.7）', () => {
  it('确定性：同棋盘多次选色结果一致', () => {
    fc.assert(
      fc.property(countsArb, (counts) => {
        const chooser = new AiColorChooser();
        const s1 = stateOf(boardOf(counts));
        const s2 = stateOf(boardOf(counts));
        expect(chooser.choose(s1, 0)).toBe(chooser.choose(s2, 0));
      }),
    );
  });

  it('选中的恒为现存数量最多的颜色（存在颜色时）', () => {
    fc.assert(
      fc.property(countsArb, (counts) => {
        const state = stateOf(boardOf(counts));
        const chosen = new AiColorChooser().choose(state, 0);
        const map = countBoardColors(state);
        const maxN = Math.max(0, ...ALL_BASE_COLORS.map((c) => map.get(c) ?? 0));
        if (maxN === 0) {
          expect(chosen).toBeNull();
        } else {
          expect(chosen).not.toBeNull();
          // 选中色的计数等于最大值
          expect(map.get(chosen!) ?? 0).toBe(maxN);
          // 且是平局中固定序最靠前者
          const firstMax = ALL_BASE_COLORS.find((c) => (map.get(c) ?? 0) === maxN);
          expect(chosen).toBe(firstMax);
        }
      }),
    );
  });
});
