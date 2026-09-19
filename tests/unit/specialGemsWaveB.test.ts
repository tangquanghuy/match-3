import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { MatchResolver } from '@engine/MatchResolver';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { attachPassives, setSummonTemplateResolver } from '@engine/traits';
import {
  BaseColor,
  PlayerSide,
  colorGem,
  skullGem,
  specialGem,
  isSameMatchType,
  matchJoinKey,
  MANA_BONUS_GIANT,
  SPIRIT_GEM_DRAIN,
  WAVE_B_GEM_KINDS,
} from '@engine/types';
import type { Character, Team, Gem, GemType, SpecialGemKind } from '@engine/types';
import type { GameEvent } from '@engine/events';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

/** 重置宝石 id 计数器（确定性测试的多次 run 需要逐字节一致的 id 序列） */
function resetGid(): void {
  gid = 0;
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
 * 布局建板。波B 小写/符号键（其余沿用 statusGems.test 口径）：
 * d=龙(蓝) D=龙(红) J=巨人(红) m=药水(绿) y=灵力(紫) o=糖果(黄) 4=元素星 2=暗影星
 * A=天使 Q=恶魔传送门 g=石像鬼·善 h=石像鬼·恶 T=石块 L=狼化 x=腐朽 V=火山 t=陷阱
 * E=附魔 M=宝箱怪
 */
const CHAR_MAP: Record<string, GemType> = {
  R: colorGem(BaseColor.Red),
  G: colorGem(BaseColor.Green),
  B: colorGem(BaseColor.Blue),
  Y: colorGem(BaseColor.Yellow),
  P: colorGem(BaseColor.Purple),
  W: colorGem(BaseColor.Brown),
  S: skullGem(),
  X: specialGem('bomb'),
  d: specialGem('dragonGem', undefined, BaseColor.Blue),
  D: specialGem('dragonGem', undefined, BaseColor.Red),
  J: specialGem('giantGem', undefined, BaseColor.Red),
  m: specialGem('manaPotionGem', undefined, BaseColor.Green),
  y: specialGem('spiritGem', undefined, BaseColor.Purple),
  o: specialGem('candyGem', undefined, BaseColor.Yellow),
  '4': specialGem('elementalStar'),
  '2': specialGem('umbralStar'),
  A: specialGem('angelGem'),
  Q: specialGem('daemonicPortalGem'),
  g: specialGem('gargoyleGem', 1),
  h: specialGem('gargoyleGem', 2),
  T: specialGem('stoneBlock'),
  L: specialGem('lycanthropyGem'),
  x: specialGem('decayGem'),
  V: specialGem('volcanoGem'),
  t: specialGem('trapGem'),
  E: specialGem('enchantedGem'),
  M: specialGem('mimicGem'),
};

/**
 * 候选色落子是否与既有两格构成三连（真实匹配器语义：以首个非通配为锚，
 * 三格都须与锚同类——通配并任一非骷髅锚；星键按 isSameMatchType 白名单）。
 */
function formsRun(a: GemType | null, b: GemType | null, c: GemType | null): boolean {
  if (!a || !b || !c) return false;
  const isWild = (t: GemType): boolean => t.kind === 'special' && t.spec.kind === 'wildcard';
  const anchor = [a, b, c].find((t) => !isWild(t)) ?? null;
  if (anchor === null) return true; // 全通配（纯通配 run 也是合法匹配）
  const anchorKey = matchJoinKey(anchor);
  return [a, b, c].every((t) => (isWild(t) ? anchorKey !== 'skull' : isSameMatchType(t, anchor)));
}

function layoutBoard(layout: string[]): BoardModel {
  const board = new BoardModel();
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      const ch = layout[r]?.[c];
      if (ch === undefined || ch === '.' || ch === ' ') continue;
      const type = CHAR_MAP[ch];
      if (!type) throw new Error(`未知布局字符: ${ch}`);
      board.set({ row: r, col: c }, g(type));
    }
  }

  const typeAt = (r: number, c: number): GemType | null => {
    if (r < 0 || r >= BoardModel.ROWS || c < 0 || c >= BoardModel.COLS) return null;
    return board.get({ row: r, col: c })?.type ?? null;
  };
  const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      if (board.get({ row: r, col: c }) !== null) continue;
      // 真实匹配器语义的防三连：按扫描序的三元组逐一模拟（星/通配/六色族都按真实连接键）
      const forbidden = (cand: GemType): boolean => {
        const triples: [GemType | null, GemType | null, GemType | null][] = [
          [typeAt(r, c - 2), typeAt(r, c - 1), cand],
          [typeAt(r, c - 1), cand, typeAt(r, c + 1)],
          [cand, typeAt(r, c + 1), typeAt(r, c + 2)],
          [typeAt(r - 2, c), typeAt(r - 1, c), cand],
          [typeAt(r - 1, c), cand, typeAt(r + 1, c)],
          [cand, typeAt(r + 1, c), typeAt(r + 2, c)],
        ];
        return triples.some(([a, b, cc]) => formsRun(a, b, cc));
      };
      const candidates = palette.filter((col) => !forbidden(colorGem(col)));
      board.set({ row: r, col: c }, g(colorGem(candidates[(r * 3 + c * 5) % candidates.length])));
    }
  }
  return board;
}

function makeEngine(layout: string[], options: { seed?: number; leftCount?: number; rightCount?: number } = {}) {
  const { seed = 7, leftCount = 2, rightCount = 2 } = options;
  const board = layoutBoard(layout);
  const rng = new SeededRNG(seed);
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, leftCount),
    makeTeam(PlayerSide.Right, rightCount),
  );
  const engine = new TurnEngine(state, rng, makeIdGen(50000));
  return { board, state, engine, rng };
}

function eventsOf<T extends GameEvent['type']>(type: T, events: GameEvent[]): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** 交换 (3,5)↔(3,6) 组成「特基基基」四连（4 连给额外回合，行动方保持 Left，断言窗口干净） */
function matchViaSwap(special: string, base: string) {
  const layout = [
    '........',
    '........',
    '........',
    `..${special}${base}${base}.${base}`,
    '........',
    '........',
    '........',
    '........',
  ];
  return makeEngine(layout, { seed: 7 });
}

/** 通用：直接把该宝石从 (3,3) 摧毁（技能 destroy 的 resolveBoardChange 路径） */
function destroyAt(kind: SpecialGemKind, opts: { tier?: number; color?: BaseColor; row?: number; col?: number; seed?: number } = {}) {
  const layout = [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
  ];
  const { board, engine, state } = makeEngine(layout, { seed: opts.seed ?? 7 });
  const pos = { row: opts.row ?? 3, col: opts.col ?? 3 };
  board.set(pos, null);
  const events: GameEvent[] = [];
  engine.resolveBoardChange([{ gemType: specialGem(kind, opts.tier, opts.color), pos }], events);
  return { events, state, board };
}

// ───────────────────────── 匹配归属（连接键） ─────────────────────────

describe('波B 匹配归属（六色族 spec.color / 星族特殊键 / 不可匹配族）', () => {
  it('六色族按 spec.color 与同色互连；异色不连', () => {
    expect(isSameMatchType(specialGem('dragonGem', undefined, BaseColor.Blue), colorGem(BaseColor.Blue))).toBe(true);
    expect(isSameMatchType(specialGem('dragonGem', undefined, BaseColor.Red), colorGem(BaseColor.Blue))).toBe(false);
    expect(isSameMatchType(specialGem('dragonGem', undefined, BaseColor.Red), specialGem('dragonGem', undefined, BaseColor.Blue))).toBe(false);
    expect(matchJoinKey(specialGem('giantGem', undefined, BaseColor.Green))).toBe('Green');
    expect(isSameMatchType(specialGem('spiritGem', undefined, BaseColor.Purple), colorGem(BaseColor.Purple))).toBe(true);
    expect(isSameMatchType(specialGem('manaPotionGem', undefined, BaseColor.Green), colorGem(BaseColor.Green))).toBe(true);
    expect(isSameMatchType(specialGem('candyGem', undefined, BaseColor.Yellow), colorGem(BaseColor.Yellow))).toBe(true);
  });

  it('六色族不与骷髅族相连；通配与六色族同类（不与骷髅连的既有规则不受扰）', () => {
    expect(isSameMatchType(specialGem('dragonGem', undefined, BaseColor.Blue), skullGem())).toBe(false);
    expect(isSameMatchType(specialGem('giantGem', undefined, BaseColor.Red), skullGem())).toBe(false);
    expect(isSameMatchType(specialGem('dragonGem', undefined, BaseColor.Blue), specialGem('wildcard', 2))).toBe(true);
    expect(isSameMatchType(specialGem('wildcard', 2), skullGem())).toBe(false);
  });

  it('元素星（star4）：与棕/蓝/绿/红互连，不与黄/紫/骷髅连；星与星互连', () => {
    expect(isSameMatchType(specialGem('elementalStar'), colorGem(BaseColor.Brown))).toBe(true);
    expect(isSameMatchType(specialGem('elementalStar'), colorGem(BaseColor.Blue))).toBe(true);
    expect(isSameMatchType(specialGem('elementalStar'), colorGem(BaseColor.Green))).toBe(true);
    expect(isSameMatchType(specialGem('elementalStar'), colorGem(BaseColor.Red))).toBe(true);
    expect(isSameMatchType(specialGem('elementalStar'), colorGem(BaseColor.Yellow))).toBe(false);
    expect(isSameMatchType(specialGem('elementalStar'), colorGem(BaseColor.Purple))).toBe(false);
    expect(isSameMatchType(specialGem('elementalStar'), skullGem())).toBe(false);
    expect(isSameMatchType(specialGem('elementalStar'), specialGem('elementalStar'))).toBe(true);
    expect(matchJoinKey(specialGem('elementalStar'))).toBe('star4');
  });

  it('暗影星（star2）：与黄/紫互连，不与棕蓝绿红/骷髅连；与元素星不连', () => {
    expect(isSameMatchType(specialGem('umbralStar'), colorGem(BaseColor.Yellow))).toBe(true);
    expect(isSameMatchType(specialGem('umbralStar'), colorGem(BaseColor.Purple))).toBe(true);
    expect(isSameMatchType(specialGem('umbralStar'), colorGem(BaseColor.Red))).toBe(false);
    expect(isSameMatchType(specialGem('umbralStar'), colorGem(BaseColor.Brown))).toBe(false);
    expect(isSameMatchType(specialGem('umbralStar'), skullGem())).toBe(false);
    expect(isSameMatchType(specialGem('umbralStar'), specialGem('elementalStar'))).toBe(false);
    expect(matchJoinKey(specialGem('umbralStar'))).toBe('star2');
  });

  it('不可匹配族（天使/传送门/石像鬼/石块/陷阱/宝箱怪）与任何宝石都不同类', () => {
    for (const kind of ['angelGem', 'daemonicPortalGem', 'gargoyleGem', 'stoneBlock', 'trapGem', 'mimicGem'] as SpecialGemKind[]) {
      for (const other of [
        colorGem(BaseColor.Red), colorGem(BaseColor.Purple), skullGem(),
        specialGem('wildcard', 2), specialGem(kind),
      ]) {
        expect(isSameMatchType(specialGem(kind), other)).toBe(false);
      }
    }
  });

  it('波B 单色 kind 归属表：火山=红 / 腐朽=棕 / 狼化=紫 / 附魔=紫', () => {
    expect(isSameMatchType(specialGem('volcanoGem'), colorGem(BaseColor.Red))).toBe(true);
    expect(isSameMatchType(specialGem('decayGem'), colorGem(BaseColor.Brown))).toBe(true);
    expect(isSameMatchType(specialGem('lycanthropyGem'), colorGem(BaseColor.Purple))).toBe(true);
    expect(isSameMatchType(specialGem('enchantedGem'), colorGem(BaseColor.Purple))).toBe(true);
    expect(matchJoinKey(specialGem('mimicGem'))).toBeNull();
  });

  it('棋盘级：星+棕+蓝按 star4 键连成一个消除组（混合色也成 run）', () => {
    const { board } = makeEngine([
      '........',
      '........',
      '........',
      '..4WB...',
      '........',
      '........',
      '........',
      '........',
    ], { seed: 7 });
    const groups = new MatchResolver().findMatches(board);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells.map((p) => `${p.row},${p.col}`)).toEqual(['3,2', '3,3', '3,4']);
    expect(groups[0].settle).toMatchObject({ kind: 'color', color: BaseColor.Brown });
    expect(groups[0].settle.kind === 'color' && groups[0].settle.bonusColors).toBeDefined();
  });

  it('WAVE_B_GEM_KINDS 恰好 17 颗', () => {
    expect(WAVE_B_GEM_KINDS.size).toBe(17);
  });
});

// ───────────────────────── 六色族行为 ─────────────────────────

describe('龙宝石（dragonGem：匹配/摧毁 → 爆炸其所在列下方）', () => {
  it('被匹配：所在列下方全部被清（gem-explode），组法力照常按蓝色结算', () => {
    const { engine } = matchViaSwap('d', 'B');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(eventsOf('turn-end', events)).toHaveLength(0); // 4 连额外回合
    const trig = eventsOf('special-gem-trigger', events).find((e) => e.kind === 'dragonGem');
    expect(trig).toMatchObject({ pos: { row: 3, col: 2 }, color: BaseColor.Blue });
    const explode = eventsOf('gem-explode', events).find((e) => e.cells.some((c) => c.pos.col === 2));
    expect(explode).toBeDefined();
    const cols = explode!.cells.map((c) => `${c.pos.row},${c.pos.col}`).sort();
    expect(cols).toEqual(['4,2', '5,2', '6,2', '7,2']); // {row..ROWS-1}×col（自身格已被组移除）
    const blue = eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Blue);
    expect(blue.reduce((s, e) => s + e.amount, 0)).toBeGreaterThanOrEqual(4);
  });

  it('被摧毁（技能清除路径）：同样爆炸其列下方', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine } = makeEngine(layout, { seed: 7 });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('dragonGem', undefined, BaseColor.Red), pos: { row: 3, col: 3 } }], events);
    const trig = eventsOf('special-gem-trigger', events).find((e) => e.kind === 'dragonGem');
    expect(trig).toMatchObject({ color: BaseColor.Red });
    const explode = eventsOf('gem-explode', events)[0];
    const cols = explode.cells.map((c) => `${c.pos.row},${c.pos.col}`).sort();
    expect(cols).toEqual(['4,3', '5,3', '6,3', '7,3']);
  });
});

describe('巨人宝石（giantGem：匹配/摧毁 → +5 该色法力 + 爆炸相邻一圈）', () => {
  it('被摧毁：+5 红法力（distributeGemMana 口径）+ 8 邻格 gem-explode', () => {
    const { events, state } = destroyAt('giantGem', { color: BaseColor.Red });
    expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind: 'giantGem', color: BaseColor.Red });
    const red = eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Red);
    expect(red.reduce((s, e) => s + e.amount, 0)).toBe(MANA_BONUS_GIANT);
    // 接收者为 Left 队首（沉默/满魔跳过的 ManaDistributor 口径）
    expect(red[0].characterId).toBe(state.teams[PlayerSide.Left].characters[0].id);
    const explode = eventsOf('gem-explode', events)[0];
    expect(explode.cells).toHaveLength(8); // 中心 (3,3) 的 8 邻格
  });

  it('被匹配：组法力（4 颗）+ 巨人 +5 叠加；相邻一圈被引爆（组内已移除格跳过）', () => {
    const { engine } = matchViaSwap('J', 'R');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const red = eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Red);
    // 组结算一事件（4 颗红色系）+ 巨人 +5 一事件
    expect(red.some((e) => e.amount === 4)).toBe(true);
    expect(red.some((e) => e.amount === MANA_BONUS_GIANT)).toBe(true);
    // 巨人在 (3,2)：8 邻格中 (3,3) 已被组移除 → 引爆其余 7 格
    const explode = eventsOf('gem-explode', events).find((e) => e.cells.length === 7);
    expect(explode).toBeDefined();
    const keys = explode!.cells.map((c) => `${c.pos.row},${c.pos.col}`).sort();
    expect(keys).toContain('2,1');
    expect(keys).toContain('4,3');
    expect(keys).not.toContain('3,3');
  });

  it('沉默拦截：队首被沉默时 +5 流向下一个能吃该色的盟友（canGainMana 口径）', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine, state } = makeEngine(layout, { seed: 7 });
    state.teams[PlayerSide.Left].characters[0].statuses = [{ id: 'silence', turns: 2 }];
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('giantGem', undefined, BaseColor.Red), pos: { row: 3, col: 3 } }], events);
    const red = eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Red);
    expect(red.reduce((s, e) => s + e.amount, 0)).toBe(MANA_BONUS_GIANT);
    expect(red.every((e) => e.characterId !== state.teams[PlayerSide.Left].characters[0].id)).toBe(true);
  });
});

describe('灵力宝石（spiritGem：匹配/摧毁 → 敌方每个存活角色 -2 法力）', () => {
  it('被摧毁：敌方全体 -2（夹零、不转移）；沉默不影响被汲取方', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine, state } = makeEngine(layout, { seed: 7 });
    const [foe0, foe1] = state.teams[PlayerSide.Right].characters;
    foe0.mana = 1; // 夹零：只扣 1
    foe1.mana = 5;
    foe1.statuses = [{ id: 'silence', turns: 2 }]; // 沉默不保护被汲取方
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('spiritGem', undefined, BaseColor.Purple), pos: { row: 3, col: 3 } }], events);
    expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind: 'spiritGem', color: BaseColor.Purple });
    const buffs = eventsOf('buff', events).filter((e) => e.stat === 'mana' && e.amount < 0);
    expect(buffs).toHaveLength(2);
    expect(foe0.mana).toBe(0);
    expect(foe1.mana).toBe(5 - SPIRIT_GEM_DRAIN);
    // 不转移：己方法力不变
    expect(state.teams[PlayerSide.Left].characters.every((c) => c.mana === 0)).toBe(true);
  });

  it('法力操作免疫（manashield）拦截汲取（与引擎削减口同口径）', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine, state } = makeEngine(layout, { seed: 7 });
    const foe = state.teams[PlayerSide.Right].characters[0];
    foe.mana = 6;
    foe.traitIds = ['manashield'];
    attachPassives(foe); // TurnEngine 构造期已编译过一次，改特质后需重编译
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('spiritGem'), pos: { row: 3, col: 3 } }], events);
    expect(foe.mana).toBe(6);
    expect(eventsOf('buff', events).filter((e) => e.stat === 'mana' && e.amount < 0)).toHaveLength(0);
  });
});

describe('法力药水宝石（manaPotionGem：摧毁 → 全盘随机空格撒 7-11 颗该色宝石）', () => {
  it('被摧毁：7-11 颗绿色普通宝石落在原本为空的格子（gem-create 事件）', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine } = makeEngine(layout, { seed: 7 });
    // 挖出确定性的空格集合（rows 5-7 × cols 0-5 = 18 格）
    const emptied = new Set<string>();
    for (let r = 5; r <= 7; r++) {
      for (let c = 0; c <= 5; c++) {
        board.set({ row: r, col: c }, null);
        emptied.add(`${r},${c}`);
      }
    }
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('manaPotionGem', undefined, BaseColor.Green), pos: { row: 3, col: 3 } }], events);
    const trig = eventsOf('special-gem-trigger', events).find((e) => e.kind === 'manaPotionGem');
    expect(trig).toMatchObject({ color: BaseColor.Green });
    const create = eventsOf('gem-create', events)[0];
    expect(create).toBeDefined();
    expect(create.spawns.length).toBeGreaterThanOrEqual(7);
    expect(create.spawns.length).toBeLessThanOrEqual(11);
    for (const s of create.spawns) {
      expect(emptied.has(`${s.pos.row},${s.pos.col}`)).toBe(true); // 只落空格
      expect(s.gemType).toEqual(colorGem(BaseColor.Green));
    }
  });

  it('确定性：同种子双跑 gem-create 数量与落点逐字节一致', () => {
    const run = (): { n: number; cells: string[]; rngState: number } => {
      const layout = [
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
      ];
      const { board, engine, rng } = makeEngine(layout, { seed: 11 });
      const emptied = new Set<string>();
      for (let r = 0; r < BoardModel.ROWS; r++) {
        for (let c = 0; c < 3; c++) {
          board.set({ row: r, col: c }, null);
          emptied.add(`${r},${c}`);
        }
      }
      board.set({ row: 3, col: 3 }, null);
      const events: GameEvent[] = [];
      engine.resolveBoardChange([{ gemType: specialGem('manaPotionGem', undefined, BaseColor.Green), pos: { row: 3, col: 3 } }], events);
      const create = eventsOf('gem-create', events)[0];
      return {
        n: create.spawns.length,
        cells: create.spawns.map((s) => `${s.pos.row},${s.pos.col}`).sort(),
        rngState: rng.getState(),
      };
    };
    const a = run();
    const b = run();
    expect(b.n).toBe(a.n);
    expect(b.cells).toEqual(a.cells);
    expect(b.rngState).toBe(a.rngState);
  });
});

describe('糖果宝石（candyGem：匹配 → 己方全体该色存活盟友各 +1 法力）', () => {
  it('被匹配：黄糖果 → 己方全体各 +1（直接授予，buff 事件）', () => {
    const { engine, state } = matchViaSwap('o', 'Y');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(eventsOf('special-gem-trigger', events).find((e) => e.kind === 'candyGem'))
      .toMatchObject({ color: BaseColor.Yellow });
    const buffs = eventsOf('buff', events).filter((e) => e.stat === 'mana' && e.amount === 1);
    expect(buffs).toHaveLength(2); // 己方全体各一条 +1
    const [ally0, ally1] = state.teams[PlayerSide.Left].characters;
    // ally0 另吃 4 连黄色组法力（4），ally1 只吃糖果 +1（直接授予不走分配器）
    expect(ally0.mana).toBe(4 + 1);
    expect(ally1.mana).toBe(1);
  });

  it('沉默盟友不获得（canGainMana 口径）；被普通摧毁不触发（官方只写 when matched）', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine, state } = makeEngine(layout, { seed: 7 });
    state.teams[PlayerSide.Left].characters[0].statuses = [{ id: 'silence', turns: 2 }];
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('candyGem', undefined, BaseColor.Yellow), pos: { row: 3, col: 3 } }], events);
    expect(eventsOf('special-gem-trigger', events).some((e) => e.kind === 'candyGem')).toBe(false);
    expect(eventsOf('buff', events).some((e) => e.stat === 'mana')).toBe(false);
    expect(state.teams[PlayerSide.Left].characters.every((c) => c.mana === 0)).toBe(true);
  });
});

// ───────────────────────── 星族 ─────────────────────────

describe('元素星（elementalStar：四色各 +1 法力 + 摧毁对角线）', () => {
  /**
   * 星在 (3,3)，左侧 (3,2) 用星族族外的黄——run 级扫描是贪心的从左到右（与通配同款语义）：
   * 星若紧邻左侧同族色会被先并入左侧 run 前缀，右侧同族 run 就拿不到它。
   * 交换 (3,6)↔(3,7) 组成 [星,R,R,R] 四连。
   */
  function starViaSwap() {
    const layout = [
      '........',
      '........',
      '........',
      '..Y4RR.R',
      '........',
      '........',
      '........',
      '........',
    ];
    return makeEngine(layout, { seed: 7 });
  }

  it('匹配结算：组法力按其余宝石色 + 四色各 +1（棕蓝绿红）', () => {
    const { engine } = starViaSwap();
    const events = engine.resolveSwap({ row: 3, col: 6 }, { row: 3, col: 7 });
    const total = (color: BaseColor): number =>
      eventsOf('mana-gain', events).filter((e) => e.color === color).reduce((s, e) => s + e.amount, 0);
    // 4 连红色系（4）+ 星族红 +1；对角清除的填充宝石可能带来同色扰动，用 ≥ 断言
    expect(total(BaseColor.Red)).toBeGreaterThanOrEqual(4 + 1);
    expect(total(BaseColor.Brown)).toBeGreaterThanOrEqual(1);
    expect(total(BaseColor.Blue)).toBeGreaterThanOrEqual(1);
    expect(total(BaseColor.Green)).toBeGreaterThanOrEqual(1);
  });

  it('摧毁对角线四格 {±1,±1}（非 8 邻环）', () => {
    const { engine } = starViaSwap();
    const events = engine.resolveSwap({ row: 3, col: 6 }, { row: 3, col: 7 });
    const destroy = eventsOf('gem-destroy', events).find((e) => e.cells.length === 4);
    expect(destroy).toBeDefined();
    // 星在 (3,3)：对角 (2,2) (2,4) (4,2) (4,4)
    expect(destroy!.cells.map((c) => `${c.pos.row},${c.pos.col}`).sort())
      .toEqual(['2,2', '2,4', '4,2', '4,4']);
  });

  it('星族连接键回归：星与骷髅交错铺满 → 无任何组（星不与骷髅连、骷髅 run 被截断）', () => {
    const board = new BoardModel();
    for (let r = 0; r < BoardModel.ROWS; r++) {
      for (let c = 0; c < BoardModel.COLS; c++) {
        board.set({ row: r, col: c }, g((r + c) % 2 === 0 ? specialGem('elementalStar') : skullGem()));
      }
    }
    const groups = new MatchResolver().findMatches(board);
    expect(groups).toHaveLength(0);
  });
});

describe('暗影星（umbralStar：两色各 +1 法力 + 摧毁整行+整列）', () => {
  it('匹配：行+列全清（交叉点=自身只触发一次）+ 黄紫各 +1', () => {
    const { engine } = matchViaSwap('2', 'Y');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const trig = eventsOf('special-gem-trigger', events).find((e) => e.kind === 'umbralStar');
    expect(trig).toMatchObject({ pos: { row: 3, col: 2 }, line: 3 });
    // 组移除后仍在盘上的行 3 与列 2 格子全清：行 3 余 (3,0)(3,1)(3,6)(3,7)；列 2 余 (0,2)(1,2)(2,2)(4,2)(5,2)(6,2)(7,2)
    const destroy = eventsOf('gem-destroy', events).find((e) => e.cells.length === 11);
    expect(destroy).toBeDefined();
    const keys = destroy!.cells.map((c) => `${c.pos.row},${c.pos.col}`).sort();
    expect(keys).toContain('3,0');
    expect(keys).toContain('7,2');
    expect(keys).not.toContain('3,2'); // 自身已被组移除，只触发一次
    // 黄紫各 +1（黄另有 4 连组法力；紫只应有星族 +1 —— 允许重力连锁带来的扰动用 ≥ 断言）
    const total = (color: BaseColor): number =>
      eventsOf('mana-gain', events).filter((e) => e.color === color).reduce((s, e) => s + e.amount, 0);
    expect(total(BaseColor.Purple)).toBeGreaterThanOrEqual(1);
    expect(total(BaseColor.Yellow)).toBeGreaterThanOrEqual(5);
  });
});

// ───────────────────────── 不可匹配族 ─────────────────────────

describe('天使宝石（angelGem：摧毁 → 随机己方 blessed，施加即净化负面）', () => {
  it('被摧毁：一名己方获得 blessed 3 回合，且其负面状态被净化', () => {
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine, state } = makeEngine(layout, { seed: 7 });
    for (const ally of state.teams[PlayerSide.Left].characters) {
      ally.statuses = [{ id: 'poison', turns: 2 }];
    }
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('angelGem'), pos: { row: 3, col: 3 } }], events);
    expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind: 'angelGem' });
    const blessed = eventsOf('status-apply', events).filter((e) => e.statusId === 'blessed');
    expect(blessed).toHaveLength(1);
    expect(blessed[0].turns).toBe(3);
    const target = state.teams[PlayerSide.Left].characters.find((c) => c.id === blessed[0].targetId)!;
    expect(target.statuses.some((s) => s.id === 'blessed')).toBe(true);
    expect(target.statuses.some((s) => s.id === 'poison')).toBe(false); // 净化
    const expires = eventsOf('status-expire', events).filter((e) => e.statusId === 'poison');
    expect(expires).toHaveLength(1); // 只净化受祝福者
  });
});

describe('恶魔传送门宝石（daemonicPortalGem：摧毁 → 炸一圈 + 为摧毁者召唤随机恶魔）', () => {
  it('被摧毁：8 邻格 gem-explode + 召唤入场（summonQueue FIFO 先例口径）', () => {
    setSummonTemplateResolver(() => makeChar(0));
    const layout = [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine, state } = makeEngine(layout, { seed: 7 });
    engine.setDaemonPool(['impOfWrath', 'hellhoundX']);
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem('daemonicPortalGem'), pos: { row: 3, col: 3 } }], events);
    const explode = eventsOf('gem-explode', events)[0];
    expect(explode.cells).toHaveLength(8);
    const summons = eventsOf('summon', events);
    expect(summons).toHaveLength(1);
    expect(summons[0]).toMatchObject({ player: PlayerSide.Left, destination: 'field' });
    expect(state.teams[PlayerSide.Left].characters).toHaveLength(3); // 2 + 召唤物
    setSummonTemplateResolver(() => null);
  });

  it('候选池为空：只爆炸不召唤、零随机消耗（安全跳过）', () => {
    const { events, state } = destroyAt('daemonicPortalGem');
    expect(eventsOf('gem-explode', events)[0].cells).toHaveLength(8);
    expect(eventsOf('summon', events)).toHaveLength(0);
    expect(state.teams[PlayerSide.Left].characters).toHaveLength(2);
  });
});

describe('石像鬼宝石（gargoyleGem tier1 善 / tier2 恶）', () => {
  const POSITIVE = ['barrier', 'blessed', 'enchanted', 'enraged', 'reflect', 'submerged'];
  const NEGATIVE = ['poison', 'burning', 'bleed', 'silence', 'frozen', 'entangle', 'web', 'stun', 'curse'];

  it('善（tier 1）：己方每个存活角色各随机 1 条正面状态', () => {
    const { events, state } = destroyAt('gargoyleGem', { tier: 1 });
    expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind: 'gargoyleGem' });
    const applies = eventsOf('status-apply', events);
    expect(applies).toHaveLength(2);
    for (const ally of state.teams[PlayerSide.Left].characters) {
      expect(ally.statuses).toHaveLength(1);
      expect(POSITIVE).toContain(ally.statuses[0].id);
    }
  });

  it('恶（tier 2）：敌方每个存活角色各随机 1 条负面状态', () => {
    const { events, state } = destroyAt('gargoyleGem', { tier: 2 });
    const applies = eventsOf('status-apply', events);
    expect(applies).toHaveLength(2);
    for (const foe of state.teams[PlayerSide.Right].characters) {
      expect(foe.statuses).toHaveLength(1);
      expect(NEGATIVE).toContain(foe.statuses[0].id);
    }
    expect(state.teams[PlayerSide.Left].characters.every((c) => c.statuses.length === 0)).toBe(true);
  });

  it('DoT 量级对齐状态宝石族口径（燃烧 3 / 出血 1）', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = destroyAt('gargoyleGem', { tier: 2, seed });
      for (const foe of state.teams[PlayerSide.Right].characters) {
        const burning = foe.statuses.find((s) => s.id === 'burning');
        if (burning) expect(burning.magnitude).toBe(3);
        const bleed = foe.statuses.find((s) => s.id === 'bleed');
        if (bleed) expect(bleed.magnitude).toBe(1);
      }
    }
  });
});

describe('石块（stoneBlock：惰性障碍，无触发不计法力）', () => {
  it('被摧毁：无触发事件、无法力、无骷髅伤害（settleDestroyed 天然不数 special）', () => {
    const { events } = destroyAt('stoneBlock');
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(0);
    expect(eventsOf('mana-gain', events)).toHaveLength(0);
    expect(eventsOf('skull-damage', events)).toHaveLength(0);
    expect(eventsOf('status-apply', events)).toHaveLength(0);
  });
});

describe('狼化宝石（lycanthropyGem：紫匹配；摧毁 → 随机敌人狼化）', () => {
  it('被摧毁：随机敌人获得 lycanthropy 3 回合', () => {
    const { events, state } = destroyAt('lycanthropyGem');
    expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind: 'lycanthropyGem', color: BaseColor.Purple });
    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'lycanthropy');
    expect(applies).toHaveLength(1);
    expect(applies[0].turns).toBe(3);
    expect(state.teams[PlayerSide.Right].characters.map((c) => c.id)).toContain(applies[0].targetId);
  });

  it('被匹配同样视为被摧毁（官方 "Removing Lycanthropy gems cast lycanthropy"）', () => {
    const { engine } = matchViaSwap('L', 'P');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'lycanthropy');
    expect(applies).toHaveLength(1);
  });
});

// ───────────────────────── 其余（腐朽/火山/陷阱/占位） ─────────────────────────

describe('腐朽宝石（decayGem：盘上光环，回合开始兵多一方全员 -1 甲/颗）', () => {
  it('左方兵多（3v2）：额外回合不结算光环；下次真实换手后左方全员各 -1 甲（场上 1 颗）', () => {
    const layout = [
      'x.......',
      '........',
      '........',
      '..xWW.W.',
      '........',
      '........',
      '........',
      '........',
    ];
    const { engine, state } = makeEngine(layout, { seed: 7, leftCount: 3, rightCount: 2 });
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) ch.armor = 10;
    }
    // 场上 2 颗腐朽：交换后 (3,2) 的 x 被组消掉，(0,0) 仍在 → n=1。
    // 该交换构成大连（额外回合）：额外回合是同一回合的延续，回合开始的腐朽光环
    // 不再随行动立即结算（额外回合语义修正，用户裁定 2026-09-19）。
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    expect(events.some((e) => e.type === 'extra-turn')).toBe(true);
    expect(eventsOf('buff', events).filter((e) => e.stat === 'armor' && e.amount < 0)).toHaveLength(0);
    // 下一次真实换手（右方回合开始）时光环正常结算：兵多一方（左）全员 -1
    const handover = engine.passTurn();
    const armorBuffs = eventsOf('buff', handover).filter((e) => e.stat === 'armor' && e.amount < 0);
    expect(armorBuffs).toHaveLength(3); // 左方 3 人
    for (const ally of state.teams[PlayerSide.Left].characters) expect(ally.armor).toBe(9);
    for (const foe of state.teams[PlayerSide.Right].characters) expect(foe.armor).toBe(10);
    expect(eventsOf('special-gem-trigger', handover).some((e) => e.kind === 'decayGem')).toBe(true);
  });

  it('同数兵员（2v2）：双方都扣', () => {
    const layout = [
      'x.......',
      '........',
      '........',
      '..WW....',
      '........',
      '........',
      '........',
      '........',
    ];
    const { engine, state } = makeEngine(layout, { seed: 7 });
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) ch.armor = 5;
    }
    // 场上恰 1 颗腐朽（(0,0)），无匹配交换？——用 passTurn 走真实回合尾（光环挂回合开始扫描）
    const events = engine.passTurn();
    const armorBuffs = eventsOf('buff', events).filter((e) => e.stat === 'armor' && e.amount < 0);
    expect(armorBuffs).toHaveLength(4); // 双方 2+2 人
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) expect(ch.armor).toBe(4);
    }
  });

  it('甲不足时夹零；无腐朽宝石的对局零事件（黄金序列测试覆盖）', () => {
    const layout = [
      'x.......',
      '........',
      '........',
      '..WW....',
      '........',
      '........',
      '........',
      '........',
    ];
    const { engine, state } = makeEngine(layout, { seed: 7 });
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) ch.armor = 5;
    }
    state.teams[PlayerSide.Left].characters[0].armor = 0; // 已无甲：不再发事件
    const events = engine.passTurn();
    const armorBuffs = eventsOf('buff', events).filter((e) => e.stat === 'armor' && e.amount < 0);
    expect(armorBuffs).toHaveLength(3); // 其余 3 人（1 左 + 2 右）
  });
});

describe('火山宝石（volcanoGem：匹配 → 向上垂直列 + 对角爆炸；普通摧毁不触发）', () => {
  it('被匹配：向上垂直 + 对角延伸清除', () => {
    const { engine } = matchViaSwap('V', 'R');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const trig = eventsOf('special-gem-trigger', events).find((e) => e.kind === 'volcanoGem');
    expect(trig).toMatchObject({ pos: { row: 3, col: 2 }, color: BaseColor.Red });
    const explode = eventsOf('gem-explode', events).find((e) => e.cells.length === 8);
    expect(explode).toBeDefined();
    // (3,2) 上方：(2,2)(1,2)(0,2) + 对角 (2,1)(2,3)(1,0)(1,4)(0,5)
    expect(explode!.cells.map((c) => `${c.pos.row},${c.pos.col}`).sort())
      .toEqual(['0,2', '0,5', '1,0', '1,2', '1,4', '2,1', '2,2', '2,3']);
  });

  it('被普通摧毁不触发（官方 guide 句式只写 match；doomSkull 同款 viaMatch 门）', () => {
    const { events } = destroyAt('volcanoGem', { color: BaseColor.Red });
    expect(eventsOf('special-gem-trigger', events).some((e) => e.kind === 'volcanoGem')).toBe(false);
    expect(eventsOf('gem-explode', events)).toHaveLength(0);
  });
});

describe('陷阱宝石（trapGem：摧毁 → 五选一负面，永远打玩家队）', () => {
  it('掷签不变量：要么 3 颗末日骷髅，要么玩家队（Left）全员获得四状态之一；Right 行动也一样', () => {
    const seenStatus = new Set<string>();
    const seenSkulls = [];
    for (let seed = 1; seed <= 16; seed++) {
      const layout = [
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
      ];
      const { board, engine, state } = makeEngine(layout, { seed });
      state.activePlayer = PlayerSide.Right; // 官方：即使玩家自己摧毁也打玩家队
      board.set({ row: 3, col: 3 }, null);
      const events: GameEvent[] = [];
      engine.resolveBoardChange([{ gemType: specialGem('trapGem'), pos: { row: 3, col: 3 } }], events);
      expect(eventsOf('special-gem-trigger', events).some((e) => e.kind === 'trapGem')).toBe(true);
      const doomTransforms = eventsOf('gem-transform', events)
        .flatMap((e) => e.changes)
        .filter((c) => c.to.kind === 'special' && c.to.spec.kind === 'doomSkull');
      const statusApplies = eventsOf('status-apply', events).filter((e) =>
        ['stun', 'frozen', 'entangle', 'faerie-fire'].includes(e.statusId));
      if (doomTransforms.length > 0) {
        expect(doomTransforms).toHaveLength(3); // 创造 3 末日骷髅
        expect(statusApplies).toHaveLength(0);
        seenSkulls.push(seed);
      } else {
        expect(statusApplies.length).toBeGreaterThan(0); // 玩家队全员
        const leftIds = state.teams[PlayerSide.Left].characters.map((c) => c.id);
        const rightIds = state.teams[PlayerSide.Right].characters.map((c) => c.id);
        for (const apply of statusApplies) {
          expect(leftIds).toContain(apply.targetId);
          expect(rightIds).not.toContain(apply.targetId);
          seenStatus.add(apply.statusId);
        }
      }
    }
    expect(seenSkulls.length).toBeGreaterThan(0); // 两个分支在种子扫描下都出现
    expect(seenStatus.size).toBeGreaterThan(0);
  });
});

describe('行为句未证实宝石（enchantedGem / mimicGem：kind 先行，摧毁无特殊效果）', () => {
  it('附魔宝石：紫匹配成立；被摧毁无触发事件（待官方语义核实）', () => {
    const { events } = destroyAt('enchantedGem');
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(0);
    expect(eventsOf('status-apply', events)).toHaveLength(0);
  });

  it('宝箱怪宝石：无匹配归属；被摧毁无触发事件（待官方语义核实）', () => {
    const { events } = destroyAt('mimicGem');
    expect(eventsOf('special-gem-trigger', events)).toHaveLength(0);
    expect(eventsOf('mana-gain', events)).toHaveLength(0);
  });
});

// ───────────────────────── 确定性与 rng 序列护栏 ─────────────────────────

describe('确定性与随机数序列护栏（GravitySystem 骷髅风暴同款）', () => {
  it('携带波B 宝石的对局：同种子双跑事件流与 rng 终态逐字节一致', () => {
    const run = (): { seq: string; rngState: number } => {
      resetGid();
      const layout = [
        'A.T.Q.M.',
        '........',
        '........',
        '..dBB.B.',
        '.....L..',
        '..J.....',
        'x.......',
        '........',
      ];
      const { engine, rng } = makeEngine(layout, { seed: 42 });
      const all: GameEvent[] = [];
      let accepted = 0;
      outer:
      for (let r = 0; r < BoardModel.ROWS; r++) {
        for (let c = 0; c < BoardModel.COLS; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
            const events = engine.resolveSwap({ row: r, col: c }, { row: r + dr, col: c + dc });
            if (events.length > 0 && events[0].type === 'swap') {
              all.push(...events);
              accepted += 1;
              if (accepted >= 3) break outer;
            }
          }
        }
      }
      expect(accepted).toBe(3);
      return { seq: all.map((e) => JSON.stringify(e)).join('\n'), rngState: rng.getState() };
    };
    const a = run();
    const b = run();
    expect(b.seq).toBe(a.seq);
    expect(b.rngState).toBe(a.rngState);
  });

  it('不携带波B 宝石的存量对局：事件流黄金序列不变（新增分支零侵入）', () => {
    const layout = [
      'RGR.R.G.',
      'BGB.B.G.',
      'RYR.Y.B.',
      'G..B..R.',
      'B.R..G.B',
      'G.B.Y.R.',
      'R.Y.B.G.',
      'Y.G.R.Y.',
    ];
    const run = (): { seq: string; rngState: number } => {
      const { engine, rng } = makeEngine(layout, { seed: 42 });
      const all: GameEvent[] = [];
      let accepted = 0;
      outer:
      for (let r = 0; r < BoardModel.ROWS; r++) {
        for (let c = 0; c < BoardModel.COLS; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
            const events = engine.resolveSwap({ row: r, col: c }, { row: r + dr, col: c + dc });
            if (events.length > 0 && events[0].type === 'swap') {
              all.push(...events);
              accepted += 1;
              if (accepted >= 3) break outer;
            }
          }
        }
      }
      expect(accepted).toBe(3);
      return { seq: all.map((e) => e.type).join(','), rngState: rng.getState() };
    };
    const golden = 'swap,elimination,mana-gain,gravity,refill,turn-end,swap,elimination,mana-gain,gravity,refill,turn-end,swap,elimination,mana-gain,gravity,refill,turn-end';
    const a = run();
    expect(a.seq).toBe(golden);
    expect(run()).toMatchObject({ seq: golden, rngState: a.rngState });
  });

  it('腐朽光环零随机消耗：场上有腐朽宝石的回合尾 rng 状态与无光环路径一致', () => {
    const withDecay = (): number => {
      const layout = [
        'x.......',
        '........',
        '........',
        '..WW....',
        '........',
        '........',
        '........',
        '........',
      ];
      const { engine, rng } = makeEngine(layout, { seed: 9 });
      engine.passTurn();
      return rng.getState();
    };
    const withoutDecay = (): number => {
      const layout = [
        'W.......',
        '........',
        '........',
        '..WW....',
        '........',
        '........',
        '........',
        '........',
      ];
      const { engine, rng } = makeEngine(layout, { seed: 9 });
      engine.passTurn();
      return rng.getState();
    };
    expect(withDecay()).toBe(withoutDecay());
  });
});
