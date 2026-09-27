import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { MatchResolver } from '@engine/MatchResolver';
import type { MatchGroup } from '@engine/MatchResolver';
import { GravitySystem } from '@engine/GravitySystem';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { gemEffect } from '@engine/skills/effects/gems';
import type { EffectContext } from '@engine/skills/effects/context';
import { neutralPassives } from '@engine/traits';
import {
  BaseColor,
  PlayerSide,
  MatchState,
  colorGem,
  skullGem,
  specialGem,
  isSameMatchType,
} from '@engine/types';
import type { Character, Team, Gem, GemType, CellPos } from '@engine/types';
import type { GameEvent } from '@engine/events';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function makeIdGen(start: number): () => number {
  let id = start;
  return () => id++;
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

function makeTeam(side: PlayerSide, count: number, over: Partial<Character> = {}): Team {
  const base = side === PlayerSide.Left ? 0 : 10;
  return {
    player: side,
    characters: Array.from({ length: count }, (_, i) => makeChar(base + i, over)),
  };
}

/**
 * 布局建板。字符 → 宝石：
 *   R/G/B/Y/P/W 六色、S 骷髅、D 末日骷髅、X 炸弹、L 闪电行(蓝)、C 闪电列(黄)、
 *   N 织网(紫)、H 沙漏(黄)、A 许愿、2/4 通配倍率；'.' 为避让填充。
 *
 * 避让填充会避开与左右/上下相邻两格成三连的键；含通配的布局请全显式
 * （通配与任意色粘连，不能交给避让填充），本文件的通配布局均为手工核验的全显式棋盘。
 */
const CHAR_MAP: Record<string, GemType> = {
  R: colorGem(BaseColor.Red),
  G: colorGem(BaseColor.Green),
  B: colorGem(BaseColor.Blue),
  Y: colorGem(BaseColor.Yellow),
  P: colorGem(BaseColor.Purple),
  W: colorGem(BaseColor.Brown),
  S: skullGem(),
  D: specialGem('doomSkull'),
  U: specialGem('uberDoomSkull'),
  X: specialGem('bomb'),
  L: specialGem('lightningRow'),
  C: specialGem('lightningCol'),
  N: specialGem('web'),
  H: specialGem('hourglass'),
  A: specialGem('wish'),
  O: specialGem('ghost'),
  2: specialGem('wildcard', 2),
  3: specialGem('wildcard', 3),
  4: specialGem('wildcard', 4),
  T: specialGem('bootyGem'),
};

function layoutBoard(layout: string[]): BoardModel {
  const board = new BoardModel();
  const explicit = new Set<string>();
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      const ch = layout[r]?.[c];
      if (ch === undefined || ch === '.' || ch === ' ') continue;
      const type = CHAR_MAP[ch];
      if (!type) throw new Error(`未知布局字符: ${ch}`);
      explicit.add(`${r},${c}`);
      board.set({ row: r, col: c }, g(type));
    }
  }

  const keyAt = (r: number, c: number): string | null => {
    if (r < 0 || r >= BoardModel.ROWS || c < 0 || c >= BoardModel.COLS) return null;
    const gem = board.get({ row: r, col: c });
    if (!gem) return null;
    if (gem.type.kind === 'color') return gem.type.color;
    if (gem.type.kind === 'skull') return 'skull';
    if (gem.type.kind === 'special') return `special:${gem.type.spec.kind}`;
    return 'other';
  };
  const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      if (explicit.has(`${r},${c}`)) continue;
      // 填 K 成三连 ⇔ (左1,左2)/(左1,右1)/(右1,右2)/(上1,上2)/(上1,下1)/(下1,下2) 同键
      const pairs: [string | null, string | null][] = [
        [keyAt(r, c - 1), keyAt(r, c - 2)],
        [keyAt(r, c - 1), keyAt(r, c + 1)],
        [keyAt(r, c + 1), keyAt(r, c + 2)],
        [keyAt(r - 1, c), keyAt(r - 2, c)],
        [keyAt(r - 1, c), keyAt(r + 1, c)],
        [keyAt(r + 1, c), keyAt(r + 2, c)],
      ];
      const forbidden = new Set<string>();
      for (const [a, b] of pairs) {
        if (a !== null && a === b) forbidden.add(a);
      }
      const candidates = palette.filter((col) => !forbidden.has(col));
      board.set({ row: r, col: c }, g(colorGem(candidates[(r * 3 + c * 5) % candidates.length])));
    }
  }
  return board;
}

interface EngineOptions {
  seed?: number;
  leftCount?: number;
  rightCount?: number;
  teamOver?: Partial<Character>;
}

function makeEngine(layout: string[], options: EngineOptions = {}) {
  const { seed = 7, leftCount = 2, rightCount = 2, teamOver = {} } = options;
  const board = layoutBoard(layout);
  const rng = new SeededRNG(seed);
  const idGen = makeIdGen(50000);
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, leftCount, teamOver),
    makeTeam(PlayerSide.Right, rightCount, teamOver),
  );
  const engine = new TurnEngine(state, rng, idGen);
  return { board, state, engine, rng };
}

function eventsOf<T extends GameEvent['type']>(type: T, events: GameEvent[]): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** 棋盘当前所有宝石 id（结算后核对被清宝石确实离场；不能按格位断言——重力会回填） */
function boardGemIds(board: BoardModel): Set<number> {
  const ids = new Set<number>();
  board.forEach((gem) => {
    if (gem) ids.add(gem.id);
  });
  return ids;
}

function boardGemKinds(board: BoardModel): Set<string> {
  const kinds = new Set<string>();
  board.forEach((gem) => {
    if (gem) {
      kinds.add(gem.type.kind === 'special' ? `special:${gem.type.spec.kind}` : gem.type.kind);
    }
  });
  return kinds;
}

// ───────────────────────── 匹配性 ─────────────────────────

describe('isSameMatchType（特殊宝石匹配语义）', () => {
  const web = specialGem('web');
  const hourglass = specialGem('hourglass');
  const lightningRow = specialGem('lightningRow');
  const lightningCol = specialGem('lightningCol');
  const doom = specialGem('doomSkull');
  const bomb = specialGem('bomb');
  const wish = specialGem('wish');
  const wild2 = specialGem('wildcard', 2);

  it('末日骷髅与普通骷髅同匹配类，至尊末日骷髅亦然', () => {
    expect(isSameMatchType(doom, skullGem())).toBe(true);
    expect(isSameMatchType(doom, doom)).toBe(true);
    expect(isSameMatchType(doom, colorGem(BaseColor.Red))).toBe(false);
    expect(isSameMatchType(specialGem('uberDoomSkull'), skullGem())).toBe(true);
    expect(isSameMatchType(specialGem('uberDoomSkull'), doom)).toBe(true);
  });

  it('织网按紫色、沙漏/闪电黄按黄色、闪电蓝按蓝色参与匹配', () => {
    expect(isSameMatchType(web, colorGem(BaseColor.Purple))).toBe(true);
    expect(isSameMatchType(hourglass, colorGem(BaseColor.Yellow))).toBe(true);
    expect(isSameMatchType(lightningCol, colorGem(BaseColor.Yellow))).toBe(true);
    expect(isSameMatchType(lightningRow, colorGem(BaseColor.Blue))).toBe(true);
    expect(isSameMatchType(web, colorGem(BaseColor.Blue))).toBe(false);
  });

  it('炸弹与许愿与幽魂不可被匹配', () => {
    const ghost = specialGem('ghost');
    for (const other of [colorGem(BaseColor.Red), skullGem(), doom, bomb, wish, wild2]) {
      expect(isSameMatchType(bomb, other)).toBe(false);
      expect(isSameMatchType(wish, other)).toBe(false);
      expect(isSameMatchType(ghost, other)).toBe(false);
    }
  });

  it('通配与任意颜色同类，但不与骷髅族相连', () => {
    for (const color of Object.values(BaseColor)) {
      expect(isSameMatchType(wild2, colorGem(color))).toBe(true);
    }
    expect(isSameMatchType(wild2, skullGem())).toBe(false);
    expect(isSameMatchType(wild2, doom)).toBe(false);
    expect(isSameMatchType(wild2, specialGem('wildcard', 4))).toBe(true);
  });
});

describe('MatchResolver 特殊宝石匹配', () => {
  const resolver = new MatchResolver();

  function oneGroup(layout: string[]): MatchGroup | null {
    const groups = resolver.findMatches(layoutBoard(layout));
    return groups.length === 1 ? groups[0] : null;
  }

  it('织网宝石并入紫色三连', () => {
    const group = oneGroup([
      '........',
      '........',
      '........',
      '...PNP..',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(group).not.toBeNull();
    expect(group!.settle).toEqual({ kind: 'color', color: BaseColor.Purple, manaMultiplier: 1 });
  });

  it('末日骷髅并入骷髅三连并计数', () => {
    const group = oneGroup([
      '........',
      '........',
      '........',
      '...SDS..',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(group).not.toBeNull();
    expect(group!.settle).toEqual({ kind: 'skull', bonusDamage: 5 });
  });

  it('至尊末日骷髅并入骷髅三连，加伤合计 +10', () => {
    const group = oneGroup([
      '........',
      '........',
      '........',
      '...SUS..',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(group).not.toBeNull();
    expect(group!.settle).toEqual({ kind: 'skull', bonusDamage: 10 });
  });

  it('三颗炸弹/许愿不成消除组', () => {
    const bombs = resolver.findMatches(layoutBoard([
      '........',
      '........',
      '........',
      '...XXX..',
      '........',
      '........',
      '........',
      '........',
    ]));
    expect(bombs).toHaveLength(0);
    const wishes = resolver.findMatches(layoutBoard([
      '........',
      '........',
      '........',
      '...AAA..',
      '........',
      '........',
      '........',
      '........',
    ]));
    expect(wishes).toHaveLength(0);
  });

  it('通配与颜色成组并携带倍率：[2,R,R]=×2、[4,R,R]=×4、[2,3,R]=×5（官方相加口径）', () => {
    // 全显式棋盘（B/G 棋盘格 + 骷髅隔断），三连同含通配
    const base = [
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBSBGBG',   // (2,3)=S：隔断通配纵连
      'GBR2RRGB',   // (3,2)=R (3,3)=2 (3,4)=R (3,5)=R
      'BGBSBGBG',
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGBGBG',
    ];
    const g2 = oneGroup(base);
    expect(g2).not.toBeNull();
    expect(g2!.settle).toEqual({ kind: 'color', color: BaseColor.Red, manaMultiplier: 2 });

    const g4 = oneGroup(base.map((row) => row.replace('2', '4')));
    expect(g4).not.toBeNull();
    expect(g4!.settle).toEqual({ kind: 'color', color: BaseColor.Red, manaMultiplier: 4 });

    // DECISIONS 四项拍板②：同一次匹配多颗通配倍率**相加**（x2+x3=x5，旧乘法口径为 ×6）
    const both = oneGroup([
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBSSGBG',   // (2,3)=S (2,4)=S
      'GBR23RGB',   // (3,2)=R (3,3)=2 (3,4)=3 (3,5)=R
      'BGBSSGBG',
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGBGBG',
    ]);
    expect(both).not.toBeNull();
    expect(both!.settle).toEqual({ kind: 'color', color: BaseColor.Red, manaMultiplier: 5 });
  });

  it('通配不跨色依附：[R,2,B] 不成组；不与骷髅相连：[S,2,S] 不成组', () => {
    const cross = resolver.findMatches(layoutBoard([
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGSGBG',   // (2,4)=S
      'GBGR2BGB',   // (3,3)=R (3,4)=2 (3,5)=B
      'BGBGSGBG',
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGBGBG',
    ]));
    expect(cross).toHaveLength(0);

    const skulls = resolver.findMatches(layoutBoard([
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGSGBG',   // (2,4)=S
      'GBGS2SGB',   // (3,3)=S (3,4)=2 (3,5)=S
      'BGBGSGBG',   // (4,4)=S
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGBGBG',
    ]));
    expect(skulls).toHaveLength(0);
  });

  it('全通配组成 wildOnly（无归属色，只消除不结算）', () => {
    // 纵向三连通配，四周用骷髅/异色隔断（手工核验无其他三连）
    const groups = resolver.findMatches(layoutBoard([
      'SRSRSRSR',
      'RSRSRSRS',
      'SRS2SRSR',
      'RSG2BSRS',
      'SRS2SRSR',
      'RSRSRSRS',
      'SRSRSRSR',
      'RSRSRSRS',
    ]));
    expect(groups).toHaveLength(1);
    expect(groups[0].settle).toEqual({ kind: 'wildOnly' });
  });
});

// ───────────────────────── 第一批：末日骷髅 / 炸弹 ─────────────────────────

describe('末日骷髅（被匹配：+5 伤害 + 引爆一圈）', () => {
  // (3,3)=S (3,4)=D；交换 (3,5)↔(3,6) 把 S 换入组成 S-D-S。
  // 换出的填充宝石落在 (3,6)，在引爆圈（行列 2~4）之外，不干扰环内计数。
  const layout = [
    '........',
    '........',
    '........',
    '...SD.S.',
    '........',
    '........',
    '........',
    '........',
  ];

  it('匹配结算 = 骷髅普攻 +5，且相邻一圈被引爆（gem-explode）', () => {
    const { engine, state } = makeEngine(layout, { seed: 7 });
    const idsBefore = boardGemIds(state.board);
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(events[0].type).toBe('swap');

    // 骷髅伤害：attack 10 + 末日骷髅 5 = 15
    const dmg = eventsOf('skull-damage', events)[0];
    expect(dmg).toMatchObject({ type: 'skull-damage', damage: 15 });

    // 末日骷髅触发事件 + 引爆一圈（三连已移除 (3,3)(3,5)，环内其余 6 格全炸）
    const trigger = eventsOf('special-gem-trigger', events).find(
      (e) => e.type === 'special-gem-trigger' && e.kind === 'doomSkull',
    );
    expect(trigger).toMatchObject({ pos: { row: 3, col: 4 } });
    const explode = eventsOf('gem-explode', events)[0];
    expect(explode).toBeDefined();
    expect(explode.cells).toHaveLength(6);

    // 引爆产出的颜色宝石照常结算法力；被炸宝石确实离场（按 id 核对）
    expect(eventsOf('mana-gain', events).length).toBeGreaterThan(0);
    const idsAfter = boardGemIds(state.board);
    for (const c of explode.cells) {
      expect(idsBefore.has(c.gemId)).toBe(true);
      expect(idsAfter.has(c.gemId)).toBe(false);
    }
  });

  it('至尊末日骷髅：普攻 +10 且同样引爆一圈', () => {
    const { engine } = makeEngine([
      '........',
      '........',
      '........',
      '...SU.S.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(events[0].type).toBe('swap');

    const dmg = eventsOf('skull-damage', events)[0];
    expect(dmg).toMatchObject({ type: 'skull-damage', damage: 20 }); // attack 10 + 至尊 10
    const trigger = eventsOf('special-gem-trigger', events).find(
      (e) => e.type === 'special-gem-trigger' && e.kind === 'uberDoomSkull',
    );
    expect(trigger).toMatchObject({ pos: { row: 3, col: 4 } });
    expect(eventsOf('gem-explode', events)[0].cells).toHaveLength(6);
  });

  it('确定性：同 seed 两次行动事件流一致', () => {
    const run = (): string => {
      gid = 0; // 布局宝石 id 计数器归零，两次运行完全同构
      const { engine } = makeEngine(layout, { seed: 42 });
      return JSON.stringify(engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 }));
    };
    expect(run()).toBe(run());
  });

  it('末日骷髅直接摧毁也只引爆一次相邻一圈', () => {
    const { board, engine } = makeEngine([
      '........',
      '........',
      '........',
      '...D....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    // 模拟 clear 管线：先移除，再交回引擎结算（不走匹配路径）
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('doomSkull'), pos: { row: 3, col: 3 } }], events);
    expect(eventsOf('special-gem-trigger', events).filter((e) => e.kind === 'doomSkull')).toHaveLength(1);
    expect(eventsOf('gem-explode', events).flatMap((e) => e.cells)).toHaveLength(8);
  });
});

describe('炸弹（不可匹配；被摧毁时爆炸一圈）', () => {
  it('被 clear 管线摧毁时引爆 8 邻格并入结算队列', () => {
    const { board, engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...X....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const idsBefore = boardGemIds(state.board);
    board.set({ row: 3, col: 3 }, null); // 模拟管线已移除炸弹本体
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('bomb'), pos: { row: 3, col: 3 } }], events);

    expect(eventsOf('special-gem-trigger', events)).toHaveLength(1);
    const explode = eventsOf('gem-explode', events)[0];
    expect(explode.cells).toHaveLength(8); // 内部位置：完整一圈
    // 被炸宝石按 id 离场（格位断言不可用：结算末尾重力会回填）
    const idsAfter = boardGemIds(state.board);
    for (const c of explode.cells) {
      expect(idsBefore.has(c.gemId)).toBe(true);
      expect(idsAfter.has(c.gemId)).toBe(false);
    }
    // 被炸颜色宝石的法力照常结算
    expect(eventsOf('mana-gain', events).length).toBeGreaterThan(0);
  });

  it('连环引爆：相邻两颗炸弹被一颗的爆炸波及后继续引爆', () => {
    const { board, engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...X....',
      '....X...',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('bomb'), pos: { row: 3, col: 3 } }], events);

    const triggers = eventsOf('special-gem-trigger', events);
    expect(triggers).toHaveLength(2);
    const poses = triggers.map((e) => (e as { pos: unknown }).pos);
    expect(poses).toContainEqual({ row: 3, col: 3 });
    expect(poses).toContainEqual({ row: 4, col: 4 });
    // 两颗炸弹都离开棋盘
    expect(boardGemKinds(state.board).has('special:bomb')).toBe(false);
  });

  it('边上炸弹爆炸：圈被棋盘边界截断', () => {
    const { board, engine } = makeEngine([
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'X.......',
      '........',
    ], { seed: 7 });
    board.set({ row: 6, col: 0 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('bomb'), pos: { row: 6, col: 0 } }], events);
    const explode = eventsOf('gem-explode', events)[0];
    // 左边缘：只有 5 个邻格在界内
    expect(explode.cells).toHaveLength(5);
  });
});

// ───────────────────────── 第二批：闪电 / 织网 / 沙漏 / 许愿 ─────────────────────────

describe('闪电宝石（被匹配或被摧毁时清整行/列）', () => {
  it('闪电·蓝被匹配：清空所在整行', () => {
    // (3,3)=B (3,4)=L；交换 (3,5)↔(3,6) 把 B 换入组成蓝色三连
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...BL.B.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(events[0].type).toBe('swap');

    const trigger = eventsOf('special-gem-trigger', events).find(
      (e) => e.type === 'special-gem-trigger' && e.kind === 'lightningRow',
    );
    expect(trigger).toMatchObject({ pos: { row: 3, col: 4 }, line: 3 });

    // 行内其余 5 格（三连 3 格已随组移除）走 gem-destroy 清除
    const destroys = eventsOf('gem-destroy', events);
    expect(destroys).toHaveLength(1);
    const cells = (destroys[0] as { cells: { pos: { row: number } }[] }).cells;
    expect(cells).toHaveLength(5);
    expect(cells.every((c) => c.pos.row === 3)).toBe(true);
    // 闪电宝石本体已消耗
    expect(boardGemKinds(state.board).has('special:lightningRow')).toBe(false);
  });

  it('闪电·黄被摧毁：清空所在整列', () => {
    const { board, engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...C....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('lightningCol'), pos: { row: 3, col: 3 } }], events);

    expect(eventsOf('special-gem-trigger', events).filter((e) => e.kind === 'lightningCol')).toHaveLength(1);
    expect(eventsOf('gem-destroy', events).flatMap((e) => e.cells)).toHaveLength(7);
    expect(eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Yellow)
      .reduce((sum, e) => sum + e.amount, 0)).toBeGreaterThanOrEqual(1);
    expect(boardGemKinds(state.board).has('special:lightningCol')).toBe(false);
  });
});

describe('织网宝石（被匹配时随机敌人获得 web）', () => {
  it('紫色三连含织网宝石：对随机（二选一）敌人施加 web 3 回合', () => {
    // (3,3)=P (3,4)=N；交换 (3,5)↔(3,6) 把 P 换入组成紫色三连
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...PN.P.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    expect(eventsOf('special-gem-trigger', events)).toHaveLength(1);
    const applies = eventsOf('status-apply', events);
    expect(applies).toHaveLength(1);
    const targetId = (applies[0] as { targetId: number }).targetId;
    expect([10, 11]).toContain(targetId);
    expect(applies[0]).toMatchObject({ statusId: 'web', turns: 3 });
    const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === targetId)!;
    expect(enemy.statuses.some((s) => s.id === 'web' && s.turns === 3)).toBe(true);
  });
});

describe('沙漏宝石（被匹配时额外回合）', () => {
  it('黄色三连含沙漏：本方保留回合（extra-turn, source match）', () => {
    // (3,3)=Y (3,4)=H；交换 (3,5)↔(3,6) 把 Y 换入组成黄色三连
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...YH.Y.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    expect(eventsOf('special-gem-trigger', events)).toHaveLength(1);
    const extra = eventsOf('extra-turn', events)[0];
    expect(extra).toMatchObject({ player: PlayerSide.Left, source: 'match' });
    expect(state.activePlayer).toBe(PlayerSide.Left);
  });
});

describe('许愿宝石（被摧毁时 5 选 1 随机回蓝）', () => {
  const WISH_LAYOUT = [
    '........',
    '........',
    '........',
    '...A....',
    '........',
    '........',
    '........',
    '........',
  ];

  function destroyWish(
    seed: number,
    mutate?: (state: ReturnType<typeof createGameState>) => void,
  ): { events: GameEvent[]; state: ReturnType<typeof createGameState> } {
    const { board, engine, state } = makeEngine(WISH_LAYOUT, { seed, leftCount: 3, rightCount: 2 });
    mutate?.(state);
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('wish'), pos: { row: 3, col: 3 } }], events);
    return { events, state };
  }

  /** 扫一个抽中指定 option 的 seed（各选项 20%，400 个 seed 内必现） */
  function seedForOption(option: number): number {
    for (let seed = 1; seed <= 400; seed++) {
      if (wishEvent(destroyWish(seed).events).option === option) return seed;
    }
    throw new Error(`400 个 seed 内未出现 option=${option}`);
  }

  function wishEvent(events: GameEvent[]): { option: number; targetIds: number[] } {
    const trigger = eventsOf('special-gem-trigger', events).find(
      (e) => e.type === 'special-gem-trigger' && e.kind === 'wish',
    );
    expect(trigger).toBeDefined();
    return (trigger as { wish: { option: number; targetIds: number[] } }).wish;
  }

  it('每个 seed 恰好抽中一个选项且受益者拿到满法力（确定性）', () => {
    const a = destroyWish(11);
    const b = destroyWish(11);
    const wa = wishEvent(a.events);
    expect(wa).toEqual(wishEvent(b.events)); // 同 seed 同结果
    expect(wa.option).toBeGreaterThanOrEqual(0);
    expect(wa.option).toBeLessThanOrEqual(4);

    // 受益者经 buff(mana) 事件补满
    const gains = eventsOf('buff', a.events).filter((e) => (e as { stat?: string }).stat === 'mana');
    const gained = new Set(gains.map((e) => (e as { targetId: number }).targetId));
    expect([...gained].sort((x, y) => x - y)).toEqual([...wa.targetIds].sort((x, y) => x - y));
    for (const id of wa.targetIds) {
      for (const side of [PlayerSide.Left, PlayerSide.Right]) {
        const ch = a.state.teams[side].characters.find((c) => c.id === id);
        if (ch) expect(ch.mana).toBe(ch.manaCost);
      }
    }
  });

  it('各选项语义：随机 1/2/3 名己方、己方全员、双方全员都出现且目标正确', () => {
    const seen = new Map<number, { option: number; targetIds: number[] }>();
    for (let seed = 1; seed <= 400 && seen.size < 5; seed++) {
      const { events } = destroyWish(seed);
      const w = wishEvent(events);
      if (!seen.has(w.option)) seen.set(w.option, w);
    }
    // 400 个 seed 内五个选项都应出现（各 20%）
    expect(seen.size).toBe(5);

    const leftIds = [0, 1, 2];
    const rightIds = [10, 11];
    for (const { option, targetIds } of seen.values()) {
      if (option <= 2) {
        expect(targetIds.length).toBe(option + 1);
        expect(targetIds.every((id) => leftIds.includes(id))).toBe(true);
      } else if (option === 3) {
        expect([...targetIds].sort((x, y) => x - y)).toEqual(leftIds);
      } else {
        expect([...targetIds].sort((x, y) => x - y)).toEqual([...leftIds, ...rightIds].sort((x, y) => x - y));
      }
    }
  });

  it('沉默的己方不充能：目标选中也不回蓝（与法力分配器同口径）', () => {
    const seed = seedForOption(3); // 己方全员回满
    const { events, state } = destroyWish(seed, (s) => {
      s.teams[PlayerSide.Left].characters[0].statuses = [{ id: 'silence', turns: 9 }];
    });
    const w = wishEvent(events);
    expect(w.option).toBe(3);
    // 沉默者仍在受益名单（选人发生在充能前），但法力不变、无 buff 事件
    expect(w.targetIds).toContain(0);
    expect(state.teams[PlayerSide.Left].characters[0].mana).toBe(0);
    const manaGains = eventsOf('buff', events).filter((e) => (e as { stat?: string }).stat === 'mana');
    expect(manaGains.some((e) => (e as { targetId: number }).targetId === 0)).toBe(false);
    // 其余己方照常回满
    expect(state.teams[PlayerSide.Left].characters[1].mana).toBe(
      state.teams[PlayerSide.Left].characters[1].manaCost,
    );
  });

  it('阵亡的己方不受益：全员回满时跳过阵亡者', () => {
    const seed = seedForOption(3);
    const { events, state } = destroyWish(seed, (s) => {
      s.teams[PlayerSide.Left].characters[2].defeated = true;
    });
    const w = wishEvent(events);
    expect(w.option).toBe(3);
    expect(w.targetIds).not.toContain(2);
    expect(state.teams[PlayerSide.Left].characters[2].mana).toBe(0);
    expect(state.teams[PlayerSide.Left].characters[0].mana).toBe(
      state.teams[PlayerSide.Left].characters[0].manaCost,
    );
  });

  it('许愿被炸弹波及（摧毁链二级触发）：炸弹爆炸途中引爆许愿', () => {
    const { board, engine } = makeEngine([
      '........',
      '........',
      '...A....',   // (2,3)=许愿，在炸弹环内
      '...X....',   // (3,3)=炸弹
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7, leftCount: 3, rightCount: 2 });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('bomb'), pos: { row: 3, col: 3 } }], events);

    const kinds = eventsOf('special-gem-trigger', events).map((e) => (e as { kind: string }).kind);
    expect(kinds).toContain('bomb');
    expect(kinds).toContain('wish');
    const w = wishEvent(events);
    expect(w.option).toBeGreaterThanOrEqual(0);
    expect(eventsOf('buff', events).some((e) => (e as { stat?: string }).stat === 'mana')).toBe(true);
  });
});

// ───────────────────────── 闪电另一方向 / 组合触发 / 幽魂 ─────────────────────────

describe('闪电镜像方向覆盖', () => {
  it('闪电·黄被匹配：清空所在整列（右缘列，避免填充干扰）', () => {
    // (1,7)=Y (2,7)=C；(4,7)=Y 与 (3,7)=W 交换后组成纵向黄色三连
    const { engine, state } = makeEngine([
      '........',
      '.......Y',
      '.......C',
      '.......W',
      '.......Y',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 3, col: 7 }, { row: 4, col: 7 });
    expect(events[0].type).toBe('swap');

    const trigger = eventsOf('special-gem-trigger', events).find(
      (e) => e.type === 'special-gem-trigger' && e.kind === 'lightningCol',
    );
    expect(trigger).toMatchObject({ pos: { row: 2, col: 7 }, line: 7 });
    const destroys = eventsOf('gem-destroy', events);
    expect(destroys).toHaveLength(1);
    const cells = (destroys[0] as { cells: { pos: { col: number } }[] }).cells;
    expect(cells).toHaveLength(5); // 三连同组移除 (1,7)(2,7)(3,7)，其余 5 格被清
    expect(cells.every((c) => c.pos.col === 7)).toBe(true);
    expect(boardGemKinds(state.board).has('special:lightningCol')).toBe(false);
    // 被清颜色宝石照常结算法力
    expect(eventsOf('mana-gain', events).length).toBeGreaterThan(0);
  });

  it('闪电·蓝被摧毁：清空所在整行', () => {
    const { board, engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...L....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('lightningRow'), pos: { row: 3, col: 3 } }], events);

    expect(eventsOf('special-gem-trigger', events).filter((e) => e.kind === 'lightningRow')).toHaveLength(1);
    expect(eventsOf('gem-destroy', events).flatMap((e) => e.cells)).toHaveLength(7);
    expect(eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Blue)
      .reduce((sum, e) => sum + e.amount, 0)).toBeGreaterThanOrEqual(1);
    expect(boardGemKinds(state.board).has('special:lightningRow')).toBe(false);
  });
});

describe('多颗特殊宝石同组触发', () => {
  it('[S,D,U] 双末日族同组：加伤合计 +15，各自引爆一圈（环重叠去重）', () => {
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...SDU..',   // 预置三连，交换无关格受理本次行动
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 5, col: 5 }, { row: 5, col: 6 });
    expect(events[0].type).toBe('swap');

    const dmg = eventsOf('skull-damage', events)[0];
    expect(dmg).toMatchObject({ damage: 25 }); // attack 10 + 末日 5 + 至尊 10

    const kinds = eventsOf('special-gem-trigger', events).map((e) => (e as { kind: string }).kind);
    expect(kinds).toEqual(['doomSkull', 'uberDoomSkull']);
    const explodes = eventsOf('gem-explode', events);
    expect(explodes).toHaveLength(2);
    // 末日环：环内 6 格（组内 2 格已移除）；至尊环与末日环重叠 4 格已空，只剩 3 格
    expect(explodes[0].cells).toHaveLength(6);
    expect(explodes[1].cells).toHaveLength(3);
    const idsAfter = boardGemIds(state.board);
    for (const ex of explodes) {
      for (const c of ex.cells) expect(idsAfter.has(c.gemId)).toBe(false);
    }
  });

  it('[N,P,N] 双织网同组：两次随机施网事件', () => {
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...NPN..',   // 预置紫色三连，交换无关格受理本次行动
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 5, col: 5 }, { row: 5, col: 6 });
    expect(events[0].type).toBe('swap');

    expect(eventsOf('special-gem-trigger', events)).toHaveLength(2);
    const applies = eventsOf('status-apply', events);
    expect(applies.length).toBeGreaterThanOrEqual(1);
    for (const apply of applies) {
      const targetId = (apply as { targetId: number }).targetId;
      expect([10, 11]).toContain(targetId);
      const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === targetId)!;
      expect(enemy.statuses.some((s) => s.id === 'web')).toBe(true);
    }
  });

  it('织网敌人免疫 web 时：触发事件仍在，但状态不施加', () => {
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...PN.P.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    // attachPassives 会在引擎构造时按 traitIds 覆盖 passive，因此在构造后注入免疫
    // （结算路径只读 char.passive，构造后设置即生效）
    for (const enemy of state.teams[PlayerSide.Right].characters) {
      enemy.passive = { ...neutralPassives(), statusImmunities: ['web'] };
    }
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(1);
    expect(eventsOf('status-apply', events)).toHaveLength(0);
    for (const enemy of state.teams[PlayerSide.Right].characters) {
      expect(enemy.statuses.some((s) => s.id === 'web')).toBe(false);
    }
  });

  it('[Y,H,C] 沙漏+闪电同组：额外回合与整列清除同时生效', () => {
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...YHC..',   // 预置黄色三连（含沙漏+闪电黄）
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 5, col: 5 }, { row: 5, col: 6 });
    expect(events[0].type).toBe('swap');

    const kinds = eventsOf('special-gem-trigger', events).map((e) => (e as { kind: string }).kind);
    expect(kinds).toContain('hourglass');
    expect(kinds).toContain('lightningCol');
    expect(eventsOf('extra-turn', events).length).toBe(1);
    // 闪电在 (3,5)：清空第 5 列（三连同组移除后其余 7 格走 gem-destroy）
    const destroys = eventsOf('gem-destroy', events);
    expect(destroys).toHaveLength(1);
    const cells = (destroys[0] as { cells: { pos: { col: number } }[] }).cells;
    expect(cells.every((c) => c.pos.col === 5)).toBe(true);
    expect(state.activePlayer).toBe(PlayerSide.Left);
  });
});

describe('末日环跨链与幽魂', () => {
  it('末日骷髅引爆圈波及炸弹：匹配路径接入摧毁链（炸弹继续连环）', () => {
    const { engine } = makeEngine([
      '........',
      '........',
      '....X...',   // (2,4)=炸弹，在末日环内
      '...SD.S.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(events[0].type).toBe('swap');

    const kinds = eventsOf('special-gem-trigger', events).map((e) => (e as { kind: string }).kind);
    expect(kinds).toEqual(['doomSkull', 'bomb']);
    const explodes = eventsOf('gem-explode', events);
    expect(explodes).toHaveLength(2);
    // 末日环 6 格（含炸弹），炸弹连环再炸 3 格（其余环内格已空）
    expect(explodes[0].cells).toHaveLength(6);
    expect(explodes[1].cells).toHaveLength(3);
  });

  it('幽魂：被摧毁无任何触发（语义待定，仅移除）', () => {
    const { board, engine } = makeEngine([
      '........',
      '........',
      '........',
      '...O....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('ghost'), pos: { row: 3, col: 3 } }], events);
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(0);
    expect(eventsOf('gem-explode', events)).toHaveLength(0);
    expect(eventsOf('status-apply', events)).toHaveLength(0);
  });
});

describe('clear 管线集成（gemEffect → 引擎触发链，生产路径）', () => {
  function wiredCtx(state: ReturnType<typeof createGameState>, engine: TurnEngine): EffectContext {
    let id = 900000;
    return {
      state,
      casterId: 0,
      rng: new SeededRNG(7),
      nextGemId: () => id++,
      resolveBoardChange: (destroyed, events) => engine.resolveBoardChange(destroyed, events),
    };
  }

  it('gemEffect destroy 摧毁炸弹本体 → 引爆一圈并入结算', () => {
    const { engine, state } = makeEngine([
      '........',
      '........',
      '........',
      '...X....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const before = boardGemIds(state.board);
    const events = gemEffect({
      op: 'clear',
      mode: 'destroy',
      target: { kind: 'cell', cell: { row: 3, col: 3 } },
    }).apply(wiredCtx(state, engine));

    const destroy = eventsOf('gem-destroy', events).find(
      (e) => e.cells.some((c) => c.gemType.kind === 'special'),
    );
    expect(destroy).toBeDefined(); // 炸弹本体被技能清除
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(1);
    expect(eventsOf('gem-explode', events)[0].cells).toHaveLength(8);
    const idsAfter = boardGemIds(state.board);
    for (const c of eventsOf('gem-explode', events)[0].cells) {
      expect(before.has(c.gemId)).toBe(true);
      expect(idsAfter.has(c.gemId)).toBe(false);
    }
  });

  it('gemEffect explode 3×3 已覆盖炸弹环：引爆不再重复结算', () => {
    const { engine } = makeEngine([
      '........',
      '........',
      '........',
      '...X....',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = gemEffect({
      op: 'clear',
      mode: 'explode',
      target: { kind: 'cell', cell: { row: 3, col: 3 } },
    }).apply(wiredCtx(engine.getState(), engine));

    // 3×3 已清空炸弹的整个环 → 触发事件仍在；唯一的 gem-explode 是技能自身清 3×3，
    // 炸弹的环已在其中，不再产生第二次引爆
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(1);
    expect(eventsOf('gem-explode', events)).toHaveLength(1);
    expect(eventsOf('gem-explode', events)[0].cells).toHaveLength(9);
  });
});

// ───────────────────────── 通配倍率接入法力结算 ─────────────────────────

describe('通配宝石倍率作用于该次匹配法力', () => {
  it('[R,R,通配×2] 三连法力 = 3 × 2 = 6', () => {
    // 全显式棋盘：通配悬在 (2,5)，与 (3,5) 的蓝宝石交换后落位组成 [R,R,2]
    const { engine } = makeEngine([
      'BGBGBGBG',
      'GBGBGRGB',   // (1,5)=R：隔断纵列
      'BGBGB2SG',   // (2,5)=通配×2 悬置，(2,6)=S 防换入蓝宝石成三连
      'GBGRRBGB',   // (3,3)=R (3,4)=R，(3,5)=B 待换出
      'BGBGBSBG',   // (4,5)=S：隔断
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGBGBG',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 2, col: 5 }, { row: 3, col: 5 });
    expect(events[0].type).toBe('swap');

    // 交换后通配落位 (3,5)：[R,R,2] 红色三连，法力 = 3 × 2 = 6
    const redGain = eventsOf('mana-gain', events).find(
      (e) => e.type === 'mana-gain' && (e as { color: BaseColor }).color === BaseColor.Red,
    );
    expect(redGain).toMatchObject({ amount: 6 });
  });
});

// ───────────────────────── 自然掉落开关 ─────────────────────────

describe('GravitySystem 自然掉落开关（默认关闭）', () => {
  function holedBoard(): BoardModel {
    const board = new BoardModel();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(BaseColor.Red)));
      }
    }
    for (let r = 0; r < 4; r++) board.set({ row: r, col: 0 }, null);
    return board;
  }

  it('默认 0：补充只产出颜色/骷髅，不消耗额外随机数', () => {
    const rng = new SeededRNG(5);
    const gravity = new GravitySystem(rng, makeIdGen(1));
    const result = gravity.apply(holedBoard(), 0);
    expect(result.spawns).toHaveLength(4);
    expect(result.spawns.every((s) => s.gemType.kind === 'color')).toBe(true);
  });

  it('specialSpawnChance=1：补充全部产出可匹配的特殊宝石', () => {
    const rng = new SeededRNG(5);
    const gravity = new GravitySystem(rng, makeIdGen(1));
    gravity.specialSpawnChance = 1;
    const result = gravity.apply(holedBoard(), 0);
    expect(result.spawns).toHaveLength(4);
    const spawnable = new Set(['doomSkull', 'web', 'lightningRow', 'lightningCol', 'hourglass']);
    for (const s of result.spawns) {
      expect(s.gemType.kind).toBe('special');
      expect(spawnable.has((s.gemType as { spec: { kind: string } }).spec.kind)).toBe(true);
    }
  });
});

// ───────────────────────── 引擎级不变量（交付人工前的自动护栏） ─────────────────────────

describe('引擎级不变量', () => {
  it('三颗炸弹成行不构成匹配：任意交换均被拒绝（不可匹配宝石参与交换合法性）', () => {
    const { engine } = makeEngine([
      '........',
      '........',
      '........',
      '...XXX..',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const events = engine.resolveSwap({ row: 5, col: 5 }, { row: 5, col: 6 });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('swap-rejected');
  });

  it('各特殊宝石行动结束后：棋盘恒满、状态机回到 AwaitingInput', () => {
    const cases: [string, string | string[], (engine: TurnEngine, board: BoardModel) => void][] = [
      ['末日骷髅', '...SD.S.', (engine) => {
        engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
      }],
      ['至尊末日骷髅', '...SU.S.', (engine) => {
        engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
      }],
      ['闪电行', '...BL.B.', (engine) => {
        engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
      }],
      ['织网', '...PN.P.', (engine) => {
        engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
      }],
      ['沙漏', '...YH.Y.', (engine) => {
        engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
      }],
      ['炸弹连环', ['........', '........', '........', '...X....', '....X...', '........', '........', '........'], (engine, board) => {
        board.set({ row: 3, col: 3 }, null);
        const events: GameEvent[] = [];
        engine.resolveBoardChange([{ gemType: specialGem('bomb'), pos: { row: 3, col: 3 } }], events);
      }],
    ];
    for (const [name, layout, act] of cases) {
      const rows = typeof layout === 'string' ? [layout] : layout;
      const { board, engine, state } = makeEngine(rows, { seed: 7 });
      act(engine, board);
      expect(state.board.isFull(), `${name}: 重力回填后不残留空洞`).toBe(true);
      expect(state.state).toBe(MatchState.AwaitingInput);
      // 行动日志闭合：被受理的行动都有回合归属
      const last = state.actionLog[state.actionLog.length - 1];
      if (last) expect(['switched', 'extra-turn', 'game-over']).toContain(last.outcome);
    }
  });

  it('沙漏额外回合写入行动日志（outcome = extra-turn）；末日骷髅不写（switched）', () => {
    const hourglass = makeEngine([
      '........',
      '........',
      '........',
      '...YH.Y.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    hourglass.engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const hgLog = hourglass.state.actionLog[hourglass.state.actionLog.length - 1];
    expect(hgLog.outcome).toBe('extra-turn');

    const doom = makeEngine([
      '........',
      '........',
      '........',
      '...SD.S.',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    doom.engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const doomLog = doom.state.actionLog[doom.state.actionLog.length - 1];
    expect(doomLog.outcome).toBe('switched');
  });

  it('通配宝石被匹配后消耗：盘面上不再有通配', () => {
    const { engine, state } = makeEngine([
      'BGBGBGBG',
      'GBGBGRGB',
      'BGBGB2SG',
      'GBGRRBGB',
      'BGBGBSBG',
      'BGBGBGBG',
      'GBGBGBGB',
      'BGBGBGBG',
    ], { seed: 7 });
    engine.resolveSwap({ row: 2, col: 5 }, { row: 3, col: 5 });
    expect(boardGemKinds(state.board).has('special:wildcard')).toBe(false);
  });
});

// ───────────────────────── 确定性扫描（同 seed 同事件流，逐宝石类型） ─────────────────────────

describe('确定性扫描', () => {
  type Act = (engine: TurnEngine, board: BoardModel, state: ReturnType<typeof createGameState>) => GameEvent[];

  function streamOf(layout: string[], seed: number, act: Act): string {
    gid = 0; // 布局宝石 id 计数器归零，两次运行完全同构
    const { board, engine, state } = makeEngine(layout, { seed });
    return JSON.stringify(act(engine, board, state));
  }

  const swap3 = (a: CellPos, b: CellPos): Act => (engine) => engine.resolveSwap(a, b);
  const destroyAt = (pos: CellPos, kind: Parameters<typeof specialGem>[0]): Act => (engine, board) => {
    board.set(pos, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem(kind), pos }], events);
    return events;
  };

  const WILDCARD_LAYOUT = [
    'BGBGBGBG',
    'GBGBGRGB',
    'BGBGB2SG',
    'GBGRRBGB',
    'BGBGBSBG',
    'BGBGBGBG',
    'GBGBGBGB',
    'BGBGBGBG',
  ];
  const CHAIN_LAYOUT = [
    '........',
    '........',
    '........',
    '...X....',
    '....X...',
    '........',
    '........',
    '........',
  ];

  const CASES: [string, string[], Act][] = [
    ['末日骷髅', ['........', '........', '........', '...SD.S.', '........', '........', '........', '........'], swap3({ row: 3, col: 5 }, { row: 3, col: 6 })],
    ['至尊末日骷髅', ['........', '........', '........', '...SU.S.', '........', '........', '........', '........'], swap3({ row: 3, col: 5 }, { row: 3, col: 6 })],
    ['闪电行·匹配', ['........', '........', '........', '...BL.B.', '........', '........', '........', '........'], swap3({ row: 3, col: 5 }, { row: 3, col: 6 })],
    ['织网', ['........', '........', '........', '...PN.P.', '........', '........', '........', '........'], swap3({ row: 3, col: 5 }, { row: 3, col: 6 })],
    ['沙漏', ['........', '........', '........', '...YH.Y.', '........', '........', '........', '........'], swap3({ row: 3, col: 5 }, { row: 3, col: 6 })],
    ['通配', WILDCARD_LAYOUT, swap3({ row: 2, col: 5 }, { row: 3, col: 5 })],
    ['炸弹·摧毁', ['........', '........', '........', '...X....', '........', '........', '........', '........'], destroyAt({ row: 3, col: 3 }, 'bomb')],
    ['闪电列·摧毁', ['........', '........', '........', '...C....', '........', '........', '........', '........'], destroyAt({ row: 3, col: 3 }, 'lightningCol')],
    ['闪电行·摧毁', ['........', '........', '........', '...L....', '........', '........', '........', '........'], destroyAt({ row: 3, col: 3 }, 'lightningRow')],
    ['许愿·摧毁', ['........', '........', '........', '...A....', '........', '........', '........', '........'], destroyAt({ row: 3, col: 3 }, 'wish')],
    ['幽魂·摧毁', ['........', '........', '........', '...O....', '........', '........', '........', '........'], destroyAt({ row: 3, col: 3 }, 'ghost')],
    ['炸弹连环', CHAIN_LAYOUT, destroyAt({ row: 3, col: 3 }, 'bomb')],
  ];

  for (const [name, layout, act] of CASES) {
    it(`${name}：同 seed 两次事件流一致`, () => {
      expect(streamOf(layout, 97, act)).toBe(streamOf(layout, 97, act));
      // 不同 seed 事件流允许不同，但两次同 seed 必须逐字节一致（需求 17.3）
    });
  }
});
