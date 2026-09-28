import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { chainSurgeBonus, manaSurgeChance, matchManaWithSurge, matchSurgeChance, surgeNeedsRoll } from '@engine/manaSurge';
import { SeededRNG } from '@engine/rng';
import { BaseColor, colorGem, PlayerSide, type Character, type Gem, type GemType, type Team } from '@engine/types';
import type { GameEvent } from '@engine/events';

function g(type: GemType, id = Math.floor(Math.random() * 1e6) + 1): Gem {
  return { id, type };
}

function makeChar(id: number): Character {
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
  };
}

function makeTeam(side: PlayerSide, count = 2): Team {
  const base = side === PlayerSide.Left ? 0 : 10;
  return { player: side, characters: Array.from({ length: count }, (_, i) => makeChar(base + i)) };
}

const CHAR_MAP: Record<string, GemType> = {
  R: colorGem(BaseColor.Red),
  G: colorGem(BaseColor.Green),
  B: colorGem(BaseColor.Blue),
  Y: colorGem(BaseColor.Yellow),
  P: colorGem(BaseColor.Purple),
  W: colorGem(BaseColor.Brown),
};

function layoutBoard(layout: string[]): BoardModel {
  const board = new BoardModel();
  const explicit = new Set<string>();
  const keyAt = (r: number, c: number): string | null => {
    if (r < 0 || r >= BoardModel.ROWS || c < 0 || c >= BoardModel.COLS) return null;
    const gem = board.get({ row: r, col: c });
    if (!gem || gem.type.kind !== 'color') return null;
    return gem.type.color;
  };
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      const ch = layout[r]?.[c];
      if (ch === undefined || ch === '.') continue;
      explicit.add(`${r},${c}`);
      board.set({ row: r, col: c }, g(CHAR_MAP[ch]!));
    }
  }
  const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      if (explicit.has(`${r},${c}`)) continue;
      const pairs: [string | null, string | null][] = [
        [keyAt(r, c - 1), keyAt(r, c - 2)],
        [keyAt(r, c - 1), keyAt(r, c + 1)],
        [keyAt(r, c + 1), keyAt(r, c + 2)],
        [keyAt(r - 1, c), keyAt(r - 2, c)],
        [keyAt(r - 1, c), keyAt(r + 1, c)],
        [keyAt(r + 1, c), keyAt(r + 2, c)],
      ];
      const forbidden = new Set<string>();
      for (const [a, b] of pairs) if (a !== null && a === b) forbidden.add(a);
      const candidates = palette.filter((col) => !forbidden.has(col));
      board.set({ row: r, col: c }, g(colorGem(candidates[(r * 3 + c * 5) % candidates.length])));
    }
  }
  return board;
}

let nextId = 80_000;
function makeEngine(layout: string[], seed = 7) {
  const rng = new SeededRNG(seed);
  const state = createGameState(layoutBoard(layout), makeTeam(PlayerSide.Left, 2), makeTeam(PlayerSide.Right, 2));
  return new TurnEngine(state, rng, () => nextId++);
}

function firstGain(events: GameEvent[], color: BaseColor): Extract<GameEvent, { type: 'mana-gain' }> | null {
  for (const e of events) {
    if (e.type === 'mana-gain' && e.color === color) return e;
  }
  return null;
}

const THREE = [
  '........',
  '........',
  '........',
  '...G....',
  '.RRGR...',
  '...B....',
  '........',
  '........',
];

const FOUR = [
  '........',
  '........',
  '........',
  '...G....',
  '.RRRGR..',
  '...B....',
  '........',
  '........',
];

const FIVE = [
  '........',
  '........',
  '........',
  '..B.....',
  '.RGRRRR.',
  '..B.....',
  '........',
  '........',
];

describe('Mana Surge 公式', () => {
  it('精通 0 首轮 3 消不涌动；100 点 50%；5 消必翻倍', () => {
    expect(manaSurgeChance(0)).toBe(0);
    expect(manaSurgeChance(100)).toBe(0.5);
    expect(matchManaWithSurge(3, 1, 0, 0)).toEqual({ amount: 3, surged: false });
    expect(matchManaWithSurge(3, 1, 100, 0.49)).toEqual({ amount: 6, surged: true });
    expect(matchManaWithSurge(3, 1, 100, 0.5)).toEqual({ amount: 3, surged: false });
    expect(matchManaWithSurge(5, 1, 0, 1)).toEqual({ amount: 10, surged: true });
    expect(matchManaWithSurge(3, 5, 100, 0)).toEqual({ amount: 30, surged: true });
  });

  it('4 消：基础几率 ×2，至少 35%', () => {
    expect(matchSurgeChance(4, 0)).toBeCloseTo(0.35);
    expect(matchSurgeChance(4, 25)).toBeCloseTo(0.4); // 20% × 2
    expect(matchSurgeChance(4, 9999)).toBe(1);
    expect(matchManaWithSurge(4, 1, 0, 0.34)).toEqual({ amount: 8, surged: true });
    expect(matchManaWithSurge(4, 1, 0, 0.35)).toEqual({ amount: 4, surged: false });
  });

  it('连锁加成：2 连 +10%、3 连 +20%、4 连及以后封顶 +30%', () => {
    expect([1, 2, 3, 4, 5, 9].map(chainSurgeBonus).map((v) => Math.round(v * 100))).toEqual([0, 10, 20, 30, 30, 30]);
    expect(matchSurgeChance(3, 0, 3)).toBeCloseTo(0.2);
    expect(matchSurgeChance(3, 100, 4)).toBeCloseTo(0.8);
    // 4 消叠连锁：(0 + 30%) × 2 = 60%
    expect(matchSurgeChance(4, 0, 4)).toBeCloseTo(0.6);
    expect(surgeNeedsRoll(3, 0, 1)).toBe(false);
    expect(surgeNeedsRoll(3, 0, 2)).toBe(true);
    expect(surgeNeedsRoll(5, 0, 1)).toBe(false);
  });
});

describe('TurnEngine Mana Surge', () => {
  it('精通为 0 时 3 消仍是 3 点，且不写 surge 键、不消耗随机', () => {
    const a = makeEngine(THREE, 11);
    const b = makeEngine(THREE, 11);
    const ea = a.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 });
    const eb = b.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 });
    const ga = firstGain(ea, BaseColor.Red);
    expect(ga?.amount).toBe(3);
    expect(ga?.surge).toBeUndefined();
    expect(JSON.stringify(ea).replace(/"(gemId|gemIdA|gemIdB)":\d+/g, '"$1":X'))
      .toBe(JSON.stringify(eb).replace(/"(gemId|gemIdA|gemIdB)":\d+/g, '"$1":X'));
  });

  it('高精通 3 消翻倍并标记 surge', () => {
    const engine = makeEngine(THREE, 3);
    engine.playerManaMastery = { [BaseColor.Red]: 1_000_000 };
    const gain = firstGain(engine.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }), BaseColor.Red);
    expect(gain?.amount).toBe(6);
    expect(gain?.surge).toBe(true);
  });

  it('4 消高精通必涌动（几率 ×2 封顶 100%）', () => {
    const engine = makeEngine(FOUR, 3);
    engine.playerManaMastery = { [BaseColor.Red]: 1_000_000 };
    const gain = firstGain(engine.resolveSwap({ row: 4, col: 4 }, { row: 4, col: 5 }), BaseColor.Red);
    expect(gain?.amount).toBe(8);
    expect(gain?.surge).toBe(true);
  });

  it('4 消精通 0 也有 35% 涌动：多个种子里既有涌动也有不涌动', () => {
    const amounts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const engine = makeEngine(FOUR, seed);
      amounts.add(firstGain(engine.resolveSwap({ row: 4, col: 4 }, { row: 4, col: 5 }), BaseColor.Red)!.amount);
    }
    expect([...amounts].sort()).toEqual([4, 8]);
  });

  it('5 消必涌动，精通 0 也翻倍', () => {
    const engine = makeEngine(FIVE, 3);
    const gain = firstGain(engine.resolveSwap({ row: 4, col: 1 }, { row: 4, col: 2 }), BaseColor.Red);
    expect(gain?.amount).toBe(10);
    expect(gain?.surge).toBe(true);
  });
});
