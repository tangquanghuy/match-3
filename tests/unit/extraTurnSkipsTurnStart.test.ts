/**
 * 额外回合不重复触发「回合开始」结算（用户裁定 2026-09-19）。
 *
 * 背景：finishTurn 原先在额外回合（四连/技能给的额外回合）也无条件跑
 * applyTurnStartPassives —— 拥有「每回合开始获得护甲/回血」类特质的部队
 * 会在每次四连时再次跳加护甲特效，表现与语义都错。
 * 正确语义：额外回合是同一回合的延续，回合开始块（被动恢复/经济/腐朽光环/
 * 状态 tick/风暴/棋盘写入特质）只在真实换手后执行。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

/** 铺一张不会自发匹配的棋盘（四色棋盘格），杜绝额外连锁噪声。 */
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
    hp: 49, // 差 1 点满：再生若触发必然产出 buff 事件
    attack: 5,
    armor: 0,
    magic: 0,
    colors: [BaseColor.Red],
    manaCost: 12,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    traitIds: ['regeneration'], // 每回合开始恢复 1 点生命（applyTurnStartPassives 消费）
    ...over,
  };
}

function setup() {
  const board = new BoardModel();
  fillBoard(board);
  // 底行构造一处 4 连交换：(7,0..2)=红、(7,3)=绿、(6,3)=红 → 交换 (7,3)<->(6,3) 成 4 连红
  board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Red)));
  board.set({ row: 7, col: 3 }, g(colorGem(BaseColor.Green)));
  board.set({ row: 6, col: 3 }, g(colorGem(BaseColor.Red)));
  // 破坏 (7,4) 附近可能的自然连：用与棋盘格异色的宝石
  board.set({ row: 7, col: 4 }, g(colorGem(BaseColor.Blue)));

  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  const state = createGameState(board, left, right);
  let idg = 900000;
  const engine = new TurnEngine(state, new SeededRNG(7), () => idg++, new ExtensionRegistry());
  engine.skullChance = 0;
  return { engine, state };
}

const regenBuffs = (events: readonly GameEvent[]): GameEvent[] =>
  events.filter((e) => e.type === 'buff' && e.stat === 'hp');

describe('额外回合不触发回合开始结算', () => {
  it('四连（额外回合）行动中再生不触发；换手后的行动才触发', () => {
    const { engine } = setup();
    engine.takeInitialEvents();

    // 四连红 → 额外回合（行动方不变）
    const fourMatchEvents = engine.resolveSwap({ row: 7, col: 3 }, { row: 6, col: 3 });
    expect(fourMatchEvents.some((e) => e.type === 'extra-turn')).toBe(true);
    // 关键断言：额外回合的行动里没有回合开始的回血 buff
    expect(regenBuffs(fourMatchEvents)).toHaveLength(0);
    // 行动方未变，仍是玩家
    expect(engine.getState().activePlayer).toBe(PlayerSide.Left);

    // 第二次普通行动（这次不再产生额外回合）：正常换手，对手回合开始 → 对手再生触发
    // 先清掉底行的 4 连结构：上面交换后 (7,0..3) 已消除，棋盘经重力补充，直接再随便走一步合法交换
    const before = engine.getState().actionLog.length;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (engine.getState().actionLog.length > before) break;
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= 8 || c2 >= 8) continue;
          const events = engine.resolveSwap({ row: r, col: c }, { row: r2, col: c2 });
          // 换手后的对手回合开始：对手（C4，hp49）的再生应正常回血
          if (engine.getState().actionLog.length > before) {
            expect(events.some((e) => e.type === 'turn-end')).toBe(true);
            break;
          }
        }
      }
    }
    // 换手后对手的回合开始恢复必须仍然发生（修复不能把正常回合的开始结算一并干掉）
    const state = engine.getState();
    const enemy = state.teams[PlayerSide.Right].characters[0]!;
    expect(enemy.hp).toBe(50); // 49 + 1（回合开始再生）
  });
});
