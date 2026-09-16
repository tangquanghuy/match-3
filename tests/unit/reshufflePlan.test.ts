import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { MatchResolver } from '@engine/MatchResolver';
import { hasLegalSwap } from '@engine/boardUtils';
import {
  BaseColor,
  PlayerSide,
  MatchState,
  colorGem,
} from '@engine/types';
import type { Character, Team, Gem } from '@engine/types';
import {
  buildReshufflePlan,
  gatherPointAt,
  gatherScaleAt,
  gatherRotationAt,
  scatterPoseAt,
  RESHUFFLE_SCATTER_WINDOW,
  RESHUFFLE_TIMING,
} from '@render/reshufflePlan';
import type { CellPos } from '@engine/types';

// ───────────────────────── 纯计划（reshufflePlan）─────────────────────────

const CELL = 72;
const centerOf = (pos: CellPos) => ({ x: pos.col * CELL + CELL / 2, y: pos.row * CELL + CELL / 2 });

function snapshot8x8(): { gemId: number; x: number; y: number }[] {
  const out: { gemId: number; x: number; y: number }[] = [];
  let id = 100;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = centerOf({ row: r, col: c });
      out.push({ gemId: id++, x: p.x, y: p.y });
    }
  }
  return out;
}

describe('reshufflePlan · 重排演出计划（P0 重排卡死回归）', () => {
  it('计划覆盖快照里每一颗精灵：变动的终点=新格中心，未变动的终点=原位', () => {
    const sprites = snapshot8x8();
    const moves = [
      { gemId: 101, from: { row: 0, col: 1 }, to: { row: 5, col: 6 } },
      { gemId: 130, from: { row: 3, col: 6 }, to: { row: 0, col: 0 } },
    ];
    const plan = buildReshufflePlan({
      moves,
      sprites,
      centerOf,
      gridPixels: CELL * 8,
    });

    expect(plan).toHaveLength(sprites.length);
    const byId = new Map(plan.map((it) => [it.gemId, it]));

    const moved1 = byId.get(101)!;
    expect(moved1.finalX).toBeCloseTo(centerOf({ row: 5, col: 6 }).x, 10);
    expect(moved1.finalY).toBeCloseTo(centerOf({ row: 5, col: 6 }).y, 10);

    const moved2 = byId.get(130)!;
    expect(moved2.finalX).toBeCloseTo(centerOf({ row: 0, col: 0 }).x, 10);
    expect(moved2.finalY).toBeCloseTo(centerOf({ row: 0, col: 0 }).y, 10);

    // 未变动宝石：终点 = 快照原位
    const still = byId.get(105)!;
    expect(still.finalX).toBe(sprites[5].x);
    expect(still.finalY).toBe(sprites[5].y);
  });

  it('聚拢插值端点精确：p=0 在起点、p=1 精确落在聚集点（瞬移不再被旧补间覆写）', () => {
    const plan = buildReshufflePlan({
      moves: [{ gemId: 7, from: { row: 0, col: 0 }, to: { row: 7, col: 7 } }],
      sprites: [{ gemId: 7, x: 36, y: 36 }],
      centerOf,
      gridPixels: CELL * 8,
    });
    const it = plan[0];
    const p0 = gatherPointAt(it, 0);
    expect(p0.x).toBe(36);
    expect(p0.y).toBe(36);

    const p1 = gatherPointAt(it, 1);
    expect(p1.x).toBeCloseTo(it.gatherX, 12);
    expect(p1.y).toBeCloseTo(it.gatherY, 12);

    // 缩放/旋转同窗端点
    expect(gatherScaleAt(0)).toBe(1);
    expect(gatherScaleAt(1)).toBe(RESHUFFLE_TIMING.gatherScale);
    expect(gatherRotationAt(it, 1)).toBeCloseTo(it.rotTarget, 12);
  });

  it('散开姿态端点精确：窗口末端强制回到 scale=1 / rotation=0（终态无悬挂）', () => {
    const plan = buildReshufflePlan({
      moves: [],
      sprites: snapshot8x8().slice(0, 20),
      centerOf,
      gridPixels: CELL * 8,
    });
    for (const it of plan) {
      const before = scatterPoseAt(it, it.scatterDelay);
      expect(before.scale).toBe(RESHUFFLE_TIMING.gatherScale);
      expect(before.rotation).toBeCloseTo(it.rotTarget, 12);

      const end = scatterPoseAt(it, RESHUFFLE_SCATTER_WINDOW);
      expect(end.scale).toBe(1);
      expect(end.rotation).toBe(0);
    }
  });

  it('散开窗口覆盖最大错峰延迟 + 单颗时长（尾颗不被截断 = 无悬挂状态）', () => {
    const maxDelay =
      (RESHUFFLE_TIMING.scatterStaggerSlots - 1) * RESHUFFLE_TIMING.scatterStaggerStep;
    expect(RESHUFFLE_SCATTER_WINDOW).toBeGreaterThanOrEqual(maxDelay + RESHUFFLE_TIMING.scatter);
  });

  it('计划确定性：同输入同计划（聚拢抖动/旋转按 gemId 派生，不用 Math.random）', () => {
    const args = {
      moves: [{ gemId: 5, from: { row: 1, col: 1 }, to: { row: 2, col: 2 } }],
      sprites: snapshot8x8().slice(0, 30),
      centerOf,
      gridPixels: CELL * 8,
    };
    const a = buildReshufflePlan(args);
    const b = buildReshufflePlan(args);
    expect(a).toEqual(b);
  });
});

// ───────────────────────── 引擎死局自动重排（TurnEngine）─────────────────────────

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 0,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide): Team {
  return {
    player: side,
    characters: [
      makeChar(side === PlayerSide.Left ? 0 : 4),
      makeChar(side === PlayerSide.Left ? 1 : 5),
      makeChar(side === PlayerSide.Left ? 2 : 6),
      makeChar(side === PlayerSide.Left ? 3 : 7),
    ],
  };
}

let gid = 0;
function g(type: Gem['type']): Gem {
  return { id: gid++, type };
}

/** 6 色「拉丁方」布局：行内步进 1、行间步进 2 —— 无现成三连，且任意相邻交换都不成三连（死局） */
function deadlockedBoard(): BoardModel {
  const palette = [
    BaseColor.Red, BaseColor.Green, BaseColor.Blue,
    BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown,
  ];
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem(palette[(c + 2 * r) % 6])));
    }
  }
  return board;
}

describe('TurnEngine 死局自动重排（P0 回归：事件流含移动 + 布局合法）', () => {
  it('死局 passTurn 发 reshuffle 事件；重排后无现成三连且有合法交换', () => {
    const board = deadlockedBoard();
    const resolver = new MatchResolver();
    expect(resolver.hasAnyMatch(board)).toBe(false); // 前置：布局本身合法无匹配
    expect(hasLegalSwap(board)).toBe(false); // 前置：确属死局

    const rng = new SeededRNG(7);
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));
    const engine = new TurnEngine(state, rng, (() => {
      let id = 90000;
      return () => id++;
    })());

    const events = engine.passTurn();
    const reshuffles = events.filter((e) => e.type === 'reshuffle');
    expect(reshuffles).toHaveLength(1);
    const moves = reshuffles[0].moves; // 事件流含移动（表现层据此做洗牌动画）
    expect(moves.length).toBeGreaterThan(0);

    // 移动列表本身合法：gemId 不重复、终点在界内且互不重叠
    const ids = new Set(moves.map((m) => m.gemId));
    expect(ids.size).toBe(moves.length);
    const targets = new Set(moves.map((m) => `${m.to.row},${m.to.col}`));
    expect(targets.size).toBe(moves.length);
    for (const m of moves) {
      expect(m.to.row).toBeGreaterThanOrEqual(0);
      expect(m.to.row).toBeLessThan(8);
      expect(m.to.col).toBeGreaterThanOrEqual(0);
      expect(m.to.col).toBeLessThan(8);
    }

    // 重排后布局合法：无现成三连 + 至少一个合法交换（棋盘可玩）
    expect(resolver.hasAnyMatch(board)).toBe(false);
    expect(hasLegalSwap(board)).toBe(true);

    // 引擎回到等待输入（无悬挂状态）
    expect(state.state).toBe(MatchState.AwaitingInput);
  });
});
