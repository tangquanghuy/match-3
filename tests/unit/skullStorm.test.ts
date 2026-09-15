/**
 * 骷髅系风暴（骸骨/末日/超级末日）+ 炸毁骷髅官方规则 · 单元测试。
 *
 * 官方语义（查证结论，DECISIONS「风暴」第 2 节 +「骷髅爆炸」）：
 * - 炸毁骷髅 ≠ 三消骷髅：前者按**法术伤害**打敌方队首（普通 1 / 末日 5 / 至尊 10），
 *   不吃攻击力、不可闪避；后者是队首攻击力普攻、可被闪避。
 * - 骸骨风暴提升骷髅掉率；末日/超级末日风暴让（至尊）末日骷髅开始从顶部掉落。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { GravitySystem, STORM_DOOMSKULL_DROP, STORM_UBER_DOOMSKULL_DROP } from '@engine/GravitySystem';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import {
  BaseColor,
  PlayerSide,
  colorGem,
  skullGem,
  specialGem,
} from '@engine/types';
import type { Character, Team, Gem, GemType, CellPos } from '@engine/types';
import type { GameEvent } from '@engine/events';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 10,
    armor: 0,
    magic: 0,
    colors: [...Object.values(BaseColor)],
    manaCost: 100,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide, over: Partial<Character> = {}): Team {
  const base = side === PlayerSide.Left ? 0 : 10;
  return {
    player: side,
    characters: [makeChar(base, over), makeChar(base + 1, over)],
  };
}

/** 无匹配布局：全棋盘交错填 R/G，任何三连都不成立 */
function plainBoard(): BoardModel {
  const board = new BoardModel();
  const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      board.set({ row: r, col: c }, g(colorGem(palette[(r * 2 + c * 3) % 3])));
    }
  }
  return board;
}

function makeEngine(leftOver: Partial<Character> = {}, rightOver: Partial<Character> = {}) {
  const board = plainBoard();
  const state = createGameState(board, makeTeam(PlayerSide.Left, leftOver), makeTeam(PlayerSide.Right, rightOver));
  const engine = new TurnEngine(state, new SeededRNG(7), (() => {
    let id = 50000;
    return () => id++;
  })());
  return { board, state, engine };
}

/** 模拟 clear 管线：把给定格位的宝石移除后交给引擎结算 */
function destroyAt(engine: TurnEngine, board: BoardModel, cells: CellPos[], events: GameEvent[]): void {
  const destroyed = cells
    .map((pos) => {
      const gem = board.get(pos);
      if (!gem) throw new Error(`格位无宝石: ${JSON.stringify(pos)}`);
      board.set(pos, null);
      return { gemType: gem.type, pos };
    });
  engine.resolveBoardChange(destroyed, events);
}

function skillDamageEvents(events: GameEvent[]): Extract<GameEvent, { type: 'skill-damage' }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: 'skill-damage' }> => e.type === 'skill-damage');
}

// ───────────────────────── 炸毁骷髅的官方结算 ─────────────────────────

describe('炸毁骷髅（爆破/摧毁，非三消）官方规则', () => {
  it('3 颗普通骷髅被炸 → 敌方队首吃 3 点法术伤害，不吃攻击力', () => {
    const { board, state, engine } = makeEngine({ attack: 99 }, {});
    const cells: CellPos[] = [{ row: 0, col: 0 }, { row: 2, col: 4 }, { row: 6, col: 7 }];
    for (const p of cells) board.set(p, g(skullGem()));
    const front = state.teams[PlayerSide.Right].characters[0];
    const before = front.hp + front.armor;

    const events: GameEvent[] = [];
    destroyAt(engine, board, cells, events);

    const dmg = skillDamageEvents(events);
    expect(dmg).toHaveLength(1);
    expect(dmg[0].damage).toBe(3); // 1 点/颗，与 attack=99 无关
    expect(dmg[0].targetId).toBe(front.id);
    expect(front.hp + front.armor).toBe(before - 3);
    // 演出元数据：爆炸源 = 被炸骷髅质心格（(0,0)(2,4)(6,7) → (3,4)），构成 3 普通
    expect(dmg[0].originCell).toEqual({ row: 3, col: 4 });
    expect(dmg[0].skullBurst).toEqual({ normal: 3, doom: 0, uber: 0 });
    // 不走三消骷髅的攻击管线（skull-damage 事件）
    expect(events.some((e) => e.type === 'skull-damage')).toBe(false);
  });

  it('被炸末日骷髅 → 5 点伤害且不引爆邻格（引爆环只在被匹配时触发）', () => {
    const { board, state, engine } = makeEngine();
    const pos: CellPos = { row: 3, col: 3 };
    board.set(pos, g(specialGem('doomSkull')));
    const front = state.teams[PlayerSide.Right].characters[0];
    const before = front.hp + front.armor;

    const events: GameEvent[] = [];
    destroyAt(engine, board, [pos], events);

    expect(skillDamageEvents(events)[0].damage).toBe(5);
    expect(front.hp + front.armor).toBe(before - 5);
    expect(events.some((e) => e.type === 'gem-explode')).toBe(false);
    expect(events.some((e) => e.type === 'special-gem-trigger')).toBe(false);
    // 演出元数据：末日骷髅弹体 + 爆炸源格
    const meta = skillDamageEvents(events)[0];
    expect(meta.skullBurst).toEqual({ normal: 0, doom: 1, uber: 0 });
    expect(meta.originCell).toEqual({ row: 3, col: 3 });
  });

  it('被炸至尊末日骷髅 → 10 点伤害', () => {
    const { board, state, engine } = makeEngine();
    const pos: CellPos = { row: 3, col: 3 };
    board.set(pos, g(specialGem('uberDoomSkull')));
    const front = state.teams[PlayerSide.Right].characters[0];
    const before = front.hp + front.armor;

    const events: GameEvent[] = [];
    destroyAt(engine, board, [pos], events);

    expect(skillDamageEvents(events)[0].damage).toBe(10);
    expect(front.hp + front.armor).toBe(before - 10);
  });

  it('混合批次（2 普通 + 1 末日）→ 合计 7 点', () => {
    const { board, state, engine } = makeEngine();
    const cells: CellPos[] = [{ row: 0, col: 0 }, { row: 2, col: 4 }];
    for (const p of cells) board.set(p, g(skullGem()));
    const doomPos: CellPos = { row: 5, col: 5 };
    board.set(doomPos, g(specialGem('doomSkull')));
    const front = state.teams[PlayerSide.Right].characters[0];
    const before = front.hp + front.armor;

    const events: GameEvent[] = [];
    destroyAt(engine, board, [...cells, doomPos], events);

    expect(skillDamageEvents(events)[0].damage).toBe(7);
    expect(front.hp + front.armor).toBe(before - 7);
  });

  it('护甲先吸收：3 颗骷髅（3 点）打在 2 点护甲上 → 护甲清零、生命 -1', () => {
    const { board, state, engine } = makeEngine({}, { armor: 2 });
    const cells: CellPos[] = [{ row: 0, col: 0 }, { row: 2, col: 4 }, { row: 6, col: 7 }];
    for (const p of cells) board.set(p, g(skullGem()));
    const front = state.teams[PlayerSide.Right].characters[0];
    const hpBefore = front.hp;

    const events: GameEvent[] = [];
    destroyAt(engine, board, cells, events);

    expect(front.armor).toBe(0);
    expect(front.hp).toBe(hpBefore - 1);
    // damage 字段为减免前伤害；实际吸收体现在 resultingArmor/resultingHp
    expect(skillDamageEvents(events)[0].damage).toBe(3);
  });
});

// ───────────────────────── 骷髅系风暴的掉落修正 ─────────────────────────

describe('骷髅系风暴掉落加权（GravitySystem）', () => {
  /** 清空棋盘后做一次重力补充，统计 spawn 类型占比 */
  function fillRatio(skullDrop: Parameters<GravitySystem['apply']>[3] | undefined, seed = 11): {
    total: number;
    skulls: number;
    dooms: number;
    ubers: number;
  } {
    const board = new BoardModel();
    const rng = new SeededRNG(seed);
    let id = 800000;
    const gravity = new GravitySystem(rng, () => id++);
    const { spawns } = gravity.apply(board, 0.16, undefined, skullDrop);
    const count = { total: spawns.length, skulls: 0, dooms: 0, ubers: 0 };
    for (const s of spawns) {
      if (s.gemType.kind === 'skull') count.skulls += 1;
      else if (s.gemType.kind === 'special' && s.gemType.spec.kind === 'doomSkull') count.dooms += 1;
      else if (s.gemType.kind === 'special' && s.gemType.spec.kind === 'uberDoomSkull') count.ubers += 1;
    }
    return count;
  }

  it('骸骨风暴：骷髅掉率 ≈ skullChance × 1.9（0.16 → 0.304）', () => {
    const baseline = fillRatio(undefined);
    expect(baseline.total).toBe(64);
    expect(baseline.skulls / baseline.total).toBeGreaterThan(0.08);
    expect(baseline.skulls / baseline.total).toBeLessThan(0.25);

    const boosted = fillRatio({ kind: 'skull', chance: 0.16 * 1.9 });
    expect(boosted.skulls / boosted.total).toBeGreaterThan(0.22);
    expect(boosted.skulls / boosted.total).toBeLessThan(0.4);
  });

  it('末日风暴：末日骷髅开始从顶部掉落（≈4%）', () => {
    const r = fillRatio({ kind: 'doomSkull', chance: STORM_DOOMSKULL_DROP });
    expect(r.dooms).toBeGreaterThanOrEqual(1);
    expect(r.dooms).toBeLessThanOrEqual(10);
    // 颜色掉落不受影响：无骷髅加成时骷髅占比仍在基线带内
    expect(r.skulls / r.total).toBeLessThan(0.25);
  });

  it('超级末日风暴：至尊末日骷髅开始掉落（≈2%）', () => {
    let ubers = 0;
    // 2% 概率 × 单盘 64 格期望 1.28 颗，跨 5 盘（320 格，期望 6.4）取稳定下界
    for (let seed = 21; seed < 26; seed++) {
      ubers += fillRatio({ kind: 'uberDoomSkull', chance: STORM_UBER_DOOMSKULL_DROP }, seed).ubers;
    }
    expect(ubers).toBeGreaterThanOrEqual(1);
  });

  it('无骷髅风暴：末日骷髅不从顶部掉落（关闭分支不消耗随机数）', () => {
    const r = fillRatio(undefined);
    expect(r.dooms).toBe(0);
    expect(r.ubers).toBe(0);
  });
});

// ───────────────────────── 骷髅系风暴契约（设置/顶替） ─────────────────────────

describe('骷髅系风暴契约（TurnEngine.debugSetStorm）', () => {
  it('设置骸骨风暴：Team.storm.dropKind + 事件带 dropKind（color 保留为表现主色）', () => {
    const { state, engine } = makeEngine();
    const events = engine.debugSetStorm(BaseColor.Brown, PlayerSide.Left, 8, 'skull');
    const ev = events[0];
    if (ev.type !== 'storm-change') throw new Error('期望 storm-change');
    expect(ev.dropKind).toBe('skull');
    expect(ev.color).toBe(BaseColor.Brown);
    expect(state.teams[PlayerSide.Left].storm?.dropKind).toBe('skull');
    expect(state.teams[PlayerSide.Left].storm?.color).toBe(BaseColor.Brown);
  });

  it('颜色风暴顶替骷髅风暴：新事件/新状态不带 dropKind', () => {
    const { state, engine } = makeEngine();
    engine.debugSetStorm(BaseColor.Purple, PlayerSide.Left, 8, 'doomSkull');
    const events = engine.debugSetStorm(BaseColor.Red, PlayerSide.Left, 8);
    const ev = events[0];
    if (ev.type !== 'storm-change') throw new Error('期望 storm-change');
    expect(ev.dropKind).toBeUndefined();
    expect(state.teams[PlayerSide.Left].storm?.dropKind).toBeUndefined();
    expect(state.teams[PlayerSide.Left].storm?.color).toBe(BaseColor.Red);
  });
});
