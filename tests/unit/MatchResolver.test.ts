import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { MatchResolver, grantsExtraTurn } from '@engine/MatchResolver';
import { BaseColor, colorGem, skullGem } from '@engine/types';
import type { Gem, GemType } from '@engine/types';

let idCounter = 0;
function gem(type: GemType): Gem {
  return { id: idCounter++, type };
}

/** 用字符布局快速搭建棋盘。未指定的格子用"避让填充"，保证不形成意外匹配。 */
function buildBoard(layout: string[]): BoardModel {
  const board = new BoardModel();
  const map: Record<string, BaseColor> = {
    R: BaseColor.Red,
    G: BaseColor.Green,
    B: BaseColor.Blue,
    Y: BaseColor.Yellow,
    P: BaseColor.Purple,
    W: BaseColor.Brown,
  };

  // 先放置显式宝石
  const explicit = new Set<string>();
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      const ch = layout[r]?.[c];
      if (ch === undefined || ch === '.' || ch === ' ') continue;
      explicit.add(`${r},${c}`);
      if (ch === 'S') {
        board.set({ row: r, col: c }, gem(skullGem()));
      } else if (map[ch]) {
        board.set({ row: r, col: c }, gem(colorGem(map[ch])));
      }
    }
  }

  // 其余格子避让填充：避开与左两格、上两格成三连的颜色
  const palette = [
    BaseColor.Red,
    BaseColor.Green,
    BaseColor.Blue,
    BaseColor.Yellow,
    BaseColor.Purple,
    BaseColor.Brown,
  ];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      if (explicit.has(`${r},${c}`)) continue;
      const forbidden = new Set<BaseColor>();
      const l1 = c >= 1 ? board.get({ row: r, col: c - 1 }) : null;
      const l2 = c >= 2 ? board.get({ row: r, col: c - 2 }) : null;
      if (l1?.type.kind === 'color' && l2?.type.kind === 'color' && l1.type.color === l2.type.color) {
        forbidden.add(l1.type.color);
      }
      const u1 = r >= 1 ? board.get({ row: r - 1, col: c }) : null;
      const u2 = r >= 2 ? board.get({ row: r - 2, col: c }) : null;
      if (u1?.type.kind === 'color' && u2?.type.kind === 'color' && u1.type.color === u2.type.color) {
        forbidden.add(u1.type.color);
      }
      const color = palette.find((p) => !forbidden.has(p))!;
      board.set({ row: r, col: c }, gem(colorGem(color)));
    }
  }
  return board;
}

describe('MatchResolver', () => {
  const resolver = new MatchResolver();

  it('检测横向三连', () => {
    const board = buildBoard(['RRR']);
    const matches = resolver.findMatches(board);
    const horizontal = matches.find((m) => m.cells.length >= 3);
    expect(horizontal).toBeDefined();
    expect(horizontal!.cells.length).toBe(3);
    expect(horizontal!.shape).toBe('line3');
  });

  it('检测纵向三连', () => {
    const board = buildBoard(['R', 'R', 'R']);
    const matches = resolver.findMatches(board);
    const m = matches.find((g) => g.cells.length === 3);
    expect(m).toBeDefined();
    expect(m!.shape).toBe('line3');
  });

  it('四连判定为 line4plus（授予额外回合）', () => {
    const board = buildBoard(['YYYY']);
    const matches = resolver.findMatches(board);
    const m = matches.find((g) => g.cells.length >= 4);
    expect(m).toBeDefined();
    expect(m!.shape).toBe('line4plus');
    expect(grantsExtraTurn(m!.shape)).toBe(true);
  });

  it('骷髅三连可被检测', () => {
    const board = buildBoard(['SSS']);
    const matches = resolver.findMatches(board);
    const m = matches.find((g) => g.gemType.kind === 'skull');
    expect(m).toBeDefined();
    expect(m!.cells.length).toBe(3);
  });

  it('L/T 形交叉合并为单组并判定为交叉形', () => {
    // 在 (0,0)(0,1)(0,2) 横向 + (0,0)(1,0)(2,0) 纵向，共享 (0,0)
    const board = buildBoard(['PPP', 'P', 'P']);
    const matches = resolver.findMatches(board);
    // 应合并为一组
    const cross = matches.find((g) => g.cells.length === 5);
    expect(cross).toBeDefined();
    expect(cross!.shape).toBe('T');
    expect(grantsExtraTurn(cross!.shape)).toBe(true);
  });

  it('无匹配时返回空', () => {
    // 全避让填充（无显式宝石）的棋盘不应有任何匹配
    const clean = buildBoard([]);
    expect(resolver.hasAnyMatch(clean)).toBe(false);
  });
});
