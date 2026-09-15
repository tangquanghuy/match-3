import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { gemEffect } from '@engine/skills/effects/gems';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide, colorGem, skullGem } from '@engine/types';
import type { Character, Team, Gem, GemType, CellPos } from '@engine/types';
import type { GameState } from '@engine/GameState';

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
    magic: 3,
    colors: [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown],
    manaCost: 100,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide): Team {
  const base = side === PlayerSide.Left ? 0 : 4;
  return { player: side, characters: [makeChar(base), makeChar(base + 1)] };
}

/** ctx without engine wiring: gem ops mutate board only, no cascade */
function pureCtx(state: GameState, casterId: number): EffectContext {
  let id = 900000;
  return { state, casterId, rng: new SeededRNG(1), nextGemId: () => id++ };
}

describe('gemEffect 转化（pure，无连锁）', () => {
  it('转化某色→另一色，改变棋盘并发 gem-transform', () => {
    const board = new BoardModel();
    // 全棋盘红/蓝相间
    fillBoard(board, [BaseColor.Red, BaseColor.Blue]);
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));

    const events = gemEffect({ op: 'transform', from: BaseColor.Red, to: BaseColor.Green }).apply(
      pureCtx(state, 0),
    );

    // 不应再有红色
    let redCount = 0;
    board.forEach((gem) => {
      if (gem && gem.type.kind === 'color' && gem.type.color === BaseColor.Red) redCount++;
    });
    expect(redCount).toBe(0);
    expect(events[0].type).toBe('gem-transform');
  });
});

describe('gemEffect 创造（pure）', () => {
  it('在空格创造指定数量宝石并发 gem-create', () => {
    const board = new BoardModel();
    fillBoard(board, [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow]);
    // 清出 3 个空格
    const holes: CellPos[] = [{ row: 0, col: 0 }, { row: 3, col: 4 }, { row: 7, col: 7 }];
    for (const h of holes) board.set(h, null);
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));

    // magic=3, count {base:0,mult:1} → 3 颗
    const events = gemEffect({
      op: 'create',
      gem: { kind: 'skull' },
      count: { base: 0, mult: 1 },
    }).apply(pureCtx(state, 0));

    const create = events.find((e) => e.type === 'gem-create');
    expect(create?.type).toBe('gem-create');
    if (create?.type === 'gem-create') expect(create.spawns.length).toBe(3);
    // 空格被填满
    let empties = 0;
    board.forEach((gem) => {
      if (gem === null) empties++;
    });
    expect(empties).toBe(0);
  });

  it('满棋盘无空格：转化等量现存宝石为目标色（发 gem-transform）', () => {
    const board = new BoardModel();
    // 满盘红蓝相间，无空格
    fillBoard(board, [BaseColor.Red, BaseColor.Blue]);
    const state = createGameState(board, makeTeam(PlayerSide.Left), makeTeam(PlayerSide.Right));
    // magic=3, count {base:0,mult:1} → 3 颗绿
    const events = gemEffect({
      op: 'create',
      gem: { kind: 'color', color: BaseColor.Green },
      count: { base: 0, mult: 1 },
    }).apply(pureCtx(state, 0));

    // 无空格 → 不发 gem-create，改发 gem-transform
    expect(events.some((e) => e.type === 'gem-create')).toBe(false);
    const tf = events.find((e) => e.type === 'gem-transform');
    expect(tf?.type).toBe('gem-transform');
    if (tf?.type === 'gem-transform') {
      expect(tf.changes.length).toBe(3);
      expect(tf.changes.every((c) => c.to.kind === 'color' && c.to.color === BaseColor.Green)).toBe(true);
    }
  });
});

describe('gemEffect 摧毁（接入 TurnEngine 连锁）', () => {
  function engineCtx(state: GameState, engine: TurnEngine, casterId: number): EffectContext {
    let id = 800000;
    return {
      state,
      casterId,
      rng: new SeededRNG(1),
      nextGemId: () => id++,
      resolveBoardChange: (destroyed, events) => engine.resolveBoardChange(destroyed, events),
    };
  }

  it('摧毁整行后棋盘补满，且发 gem-destroy', () => {
    const board = new BoardModel();
    fillBoard(board, [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow]);
    const left = makeTeam(PlayerSide.Left);
    const state = createGameState(board, left, makeTeam(PlayerSide.Right));
    const rng = new SeededRNG(7);
    let idg = 700000;
    const engine = new TurnEngine(state, rng, () => idg++);
    engine.skullChance = 0;

    const events = gemEffect({ op: 'clear', mode: 'destroy', target: { kind: 'lines', rows: [3] } }).apply(engineCtx(state, engine, 0));

    expect(events.some((e) => e.type === 'gem-destroy')).toBe(true);
    // 结算后棋盘应被重力补满
    expect(board.isFull()).toBe(true);
    // 触发了重力/补充事件
    expect(events.some((e) => e.type === 'gravity')).toBe(true);
    expect(events.some((e) => e.type === 'refill')).toBe(true);
  });

  it('摧毁所有指定色宝石，产生法力结算（需求 7.5）', () => {
    const board = new BoardModel();
    // 让红色只出现在若干格，其余为不成列的杂色
    fillBoard(board, [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]);
    // 手动放置 5 颗红色，分散避免直接连锁
    const reds: CellPos[] = [
      { row: 0, col: 0 }, { row: 2, col: 5 }, { row: 4, col: 1 }, { row: 6, col: 3 }, { row: 1, col: 7 },
    ];
    for (const p of reds) board.set(p, g(colorGem(BaseColor.Red)));

    const left = makeTeam(PlayerSide.Left);
    const state = createGameState(board, left, makeTeam(PlayerSide.Right));
    const rng = new SeededRNG(3);
    let idg = 600000;
    const engine = new TurnEngine(state, rng, () => idg++);
    engine.skullChance = 0;

    let cid = 500000;
    const ctx: EffectContext = {
      state,
      casterId: 0,
      rng: new SeededRNG(1),
      nextGemId: () => cid++,
      resolveBoardChange: (destroyed, events) => engine.resolveBoardChange(destroyed, events),
    };

    const events = gemEffect({ op: 'clear', mode: 'destroy', target: { kind: 'color', color: BaseColor.Red } }).apply(ctx);

    const destroy = events.find((e) => e.type === 'gem-destroy');
    expect(destroy?.type).toBe('gem-destroy');
    if (destroy?.type === 'gem-destroy') expect(destroy.cells.length).toBe(5);
    // 左队吃红，摧毁红宝石应产生 mana-gain（需求 7.5）
    expect(events.some((e) => e.type === 'mana-gain')).toBe(true);
    // 棋盘补满
    expect(board.isFull()).toBe(true);
  });

  it('摧毁骷髅宝石产生骷髅伤害（需求 7.5）', () => {
    const board = new BoardModel();
    fillBoard(board, [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]);
    // 放置 3 颗分散骷髅
    const skulls: CellPos[] = [{ row: 0, col: 0 }, { row: 3, col: 3 }, { row: 6, col: 6 }];
    for (const p of skulls) board.set(p, g(skullGem()));

    const left = makeTeam(PlayerSide.Left);
    const right = makeTeam(PlayerSide.Right);
    left.characters[0].attack = 5;
    const state = createGameState(board, left, right);
    const rng = new SeededRNG(11);
    let idg = 400000;
    const engine = new TurnEngine(state, rng, () => idg++);
    engine.skullChance = 0;

    let cid = 300000;
    const ctx: EffectContext = {
      state,
      casterId: 0,
      rng: new SeededRNG(1),
      nextGemId: () => cid++,
      resolveBoardChange: (destroyed, events) => engine.resolveBoardChange(destroyed, events),
    };

    const hpBefore = right.characters[0].hp;
    const armorBefore = right.characters[0].armor;
    const events = gemEffect({ op: 'clear', mode: 'destroy', target: { kind: 'lines', cols: [0] } }).apply(ctx);
    // col 0 含 1 颗骷髅(0,0) → 官方"炸毁骷髅"规则：法术伤害 1 点/颗打敌方队首
    // （不吃攻击力、不可闪避，与三消骷髅是两条规则；查证结论见 DECISIONS「骷髅爆炸」）。
    // attack=5 只用于验证旧攻击力口径确实不再参与。
    const dmg = events.find((e) => e.type === 'skill-damage');
    expect(dmg).toBeDefined();
    expect(dmg && 'damage' in dmg ? dmg.damage : undefined).toBe(1);
    expect(right.characters[0].hp + right.characters[0].armor).toBeLessThan(hpBefore + armorBefore);
  });
});
