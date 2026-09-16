import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { MatchResolver } from '@engine/MatchResolver';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { tickStatuses } from '@engine/skills/effects/status';
import {
  BaseColor,
  PlayerSide,
  colorGem,
  skullGem,
  specialGem,
  isSameMatchType,
  STATUS_GEM_EFFECTS,
  MATCH_STATUS_GEMS,
  DESTROY_STATUS_GEMS,
} from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';
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
 * 布局建板。状态搬运族小写键：f=燃烧 z=冻结 k=诅咒 l=流血 v=毒 m=死亡标记 t=恐怖
 * e=缠绕 q=激怒 u=下潜 i=精灵火 n=打昏 c=屏障（其余沿用 gemSpecial.test 口径）。
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
  f: specialGem('burningGem'),
  z: specialGem('freezeGem'),
  k: specialGem('curseGem'),
  l: specialGem('bleedGem'),
  v: specialGem('poisonGem'),
  m: specialGem('deathMarkGem'),
  t: specialGem('terrorGem'),
  e: specialGem('entangleGem'),
  q: specialGem('enrageGem'),
  u: specialGem('submergeGem'),
  i: specialGem('faerieFireGem'),
  n: specialGem('stunGem'),
  c: specialGem('barrierGem'),
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

// ───────────────────────── 匹配性归属 ─────────────────────────

describe('状态宝石的匹配归属（matchType = 基色）', () => {
  it('各状态宝石与对应基色同类匹配', () => {
    expect(isSameMatchType(specialGem('burningGem'), colorGem(BaseColor.Red))).toBe(true);
    expect(isSameMatchType(specialGem('freezeGem'), colorGem(BaseColor.Blue))).toBe(true);
    expect(isSameMatchType(specialGem('curseGem'), colorGem(BaseColor.Brown))).toBe(true);
    expect(isSameMatchType(specialGem('bleedGem'), colorGem(BaseColor.Purple))).toBe(true);
    expect(isSameMatchType(specialGem('poisonGem'), colorGem(BaseColor.Green))).toBe(true);
    expect(isSameMatchType(specialGem('terrorGem'), colorGem(BaseColor.Purple))).toBe(true);
    expect(isSameMatchType(specialGem('entangleGem'), colorGem(BaseColor.Green))).toBe(true);
    expect(isSameMatchType(specialGem('enrageGem'), colorGem(BaseColor.Red))).toBe(true);
    expect(isSameMatchType(specialGem('submergeGem'), colorGem(BaseColor.Blue))).toBe(true);
    expect(isSameMatchType(specialGem('faerieFireGem'), colorGem(BaseColor.Green))).toBe(true);
    expect(isSameMatchType(specialGem('stunGem'), colorGem(BaseColor.Brown))).toBe(true);
    expect(isSameMatchType(specialGem('barrierGem'), colorGem(BaseColor.Yellow))).toBe(true);
    // 错色不同类
    expect(isSameMatchType(specialGem('burningGem'), colorGem(BaseColor.Blue))).toBe(false);
  });

  it('死亡标记宝石无色不可匹配（官方 Dev 发言不可匹配集合成员）', () => {
    for (const other of [
      colorGem(BaseColor.Red),
      colorGem(BaseColor.Purple),
      skullGem(),
      specialGem('deathMarkGem'),
      specialGem('wildcard', 2),
    ]) {
      expect(isSameMatchType(specialGem('deathMarkGem'), other)).toBe(false);
    }
  });

  it('全骷髅盘被死亡标记宝石截断：无任何匹配组', () => {
    const board = new BoardModel();
    for (let r = 0; r < BoardModel.ROWS; r++) {
      for (let c = 0; c < BoardModel.COLS; c++) {
        // 死亡标记与普通骷髅交错铺满：任意三连都会被死亡标记截断
        board.set({ row: r, col: c }, g((r + c) % 2 === 0 ? specialGem('deathMarkGem') : skullGem()));
      }
    }
    expect(new MatchResolver().findMatches(board)).toHaveLength(0);
  });
});

// ───────────────────────── 「被匹配」型（A 组：燃烧/冻结/诅咒/毒/恐怖） ─────────────────────────

/**
 * 通用：交换 (3,5)↔(3,6) 把基色宝石换入，组成「基基基特」**四连**（组内恰一颗状态宝石）。
 * 用四连而非三连：4 连授予额外回合 → 行动方保持 Left，回合尾结算不会 tick 敌方
 * （三连会换边，敌方刚获得的状态在断言前就被递减/自愈结算干扰）。
 */
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

describe('「被匹配」型状态宝石（GEMS-SEMANTICS-2 A 组）', () => {
  it('燃烧宝石：红色三连含燃烧宝石 → 敌方全体获得 burning 3 回合（magnitude 3）', () => {
    const { engine, state } = matchViaSwap('f', 'R');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    // 四连 → 额外回合，回合尾不换边不结算敌方状态（断言窗口干净）
    expect(eventsOf('turn-end', events)).toHaveLength(0);
    expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind: 'burningGem' });
    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'burning');
    expect(applies).toHaveLength(2); // 敌方全体（2 人）
    for (const apply of applies) {
      expect(apply).toMatchObject({ statusId: 'burning', turns: 3 });
      const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === apply.targetId)!;
      const burning = enemy.statuses.find((s) => s.id === 'burning');
      expect(burning).toMatchObject({ turns: 3, magnitude: 3 });
    }
  });

  it('燃烧宝石匹配照常按红色结算法力（组归属色生效）', () => {
    const { engine } = matchViaSwap('f', 'R');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const mana = eventsOf('mana-gain', events).filter((e) => e.color === BaseColor.Red);
    expect(mana.reduce((sum, e) => sum + e.amount, 0)).toBe(4); // 四连 = 4 颗红色系
  });

  it('冻结宝石：蓝色三连含冻结宝石 → 随机一名敌人获得 frozen 3 回合', () => {
    const { engine, state } = matchViaSwap('z', 'B');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'frozen');
    expect(applies).toHaveLength(1);
    expect([10, 11]).toContain(applies[0].targetId);
    const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === applies[0].targetId)!;
    expect(enemy.statuses.some((s) => s.id === 'frozen' && s.turns === 3)).toBe(true);
  });

  it('诅咒宝石：棕色三连含诅咒宝石 → 随机一名敌人获得 curse 4 回合', () => {
    const { engine, state } = matchViaSwap('k', 'W');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'curse');
    expect(applies).toHaveLength(1);
    expect([10, 11]).toContain(applies[0].targetId);
    const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === applies[0].targetId)!;
    expect(enemy.statuses.some((s) => s.id === 'curse' && s.turns === 4)).toBe(true);
  });

  it('诅咒存续：三连触发（有回合尾换边结算）诅咒不被自动解除清掉——诅咒无自愈通道（GOW-STATUS-RESEARCH 诅咒行）', () => {
    // 三连（非四连）→ 行动后正常换边，回合尾 tickTeamStatuses 结算敌方状态。
    // 回归背景（UX 审查 P1#6）：诅咒自身被误入 AUTO_RECOVER 集合时，首个回合尾就有
    // 5% 概率（此复现场景确定性）立即 status-expire——「上靶即蒸发」，场上零痕迹。
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const layout = [
        '........',
        '........',
        '........',
        '....k...',
        '...WRW..',
        '........',
        '........',
        '........',
      ];
      const { engine, state } = makeEngine(layout, { seed, rightCount: 3 });
      const events = engine.resolveSwap({ row: 3, col: 4 }, { row: 4, col: 4 });

      const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'curse');
      expect(applies).toHaveLength(1); // 已上靶
      const expires = eventsOf('status-expire', events).filter((e) => e.statusId === 'curse');
      expect(expires).toHaveLength(0); // 回合尾不得被自愈通道清掉
      const victim = state.teams[PlayerSide.Right].characters.find((c) => c.id === applies[0].targetId)!;
      expect(victim.statuses.some((s) => s.id === 'curse')).toBe(true);
    }
  });

  it('诅咒无自愈通道：tickStatuses 掷中自愈区间的种子也不得清掉诅咒（确定性回归）', () => {
    // GOW-STATUS-RESEARCH 诅咒行只赋予「他状态减半 / 剥正面 / 穿透普通免疫」，
    // 诅咒本身不在自动解除集合（对齐燃烧同类语义修订前的织网例外思路）。
    // 种子 1/3/6 的第二次 next() 落在 <5% 区间——修正前这里会 status-expire。
    for (const seed of [1, 3, 6]) {
      const victim = makeChar(10);
      victim.statuses = [{ id: 'curse', turns: 4 }];
      const rng = new SeededRNG(seed);
      rng.next(); // 对齐既有事件的消耗节奏，取第二次抽取作为自愈骰
      const events = tickStatuses(victim, rng);
      const expired = events.filter((e) => e.type === 'status-expire' && e.statusId === 'curse');
      expect(expired).toHaveLength(0);
      expect(victim.statuses.some((s) => s.id === 'curse')).toBe(true);
    }
  });

  it('毒宝石：绿色三连含毒宝石 → 敌方全体获得 poison 3 回合', () => {
    const { engine, state } = matchViaSwap('v', 'G');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'poison');
    expect(applies).toHaveLength(2);
    for (const enemy of state.teams[PlayerSide.Right].characters) {
      expect(enemy.statuses.some((s) => s.id === 'poison' && s.turns === 3)).toBe(true);
    }
  });

  it('恐怖宝石：紫色三连含恐怖宝石 → 随机一名敌人获得 terror 4 回合', () => {
    const { engine, state } = matchViaSwap('t', 'P');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });

    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'terror');
    expect(applies).toHaveLength(1);
    expect([10, 11]).toContain(applies[0].targetId);
    const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === applies[0].targetId)!;
    expect(enemy.statuses.some((s) => s.id === 'terror' && s.turns === 4)).toBe(true);
  });
});

// ───────────────────────── 「被摧毁」型（流血/缠绕/打昏/屏障/激怒/沉没/精灵火/死亡标记） ─────────────────────────

describe('「被摧毁」型状态宝石（GEMS-SEMANTICS-2 A/B 组）', () => {
  /** 通用：直接把该宝石从 (3,3) 摧毁（技能 destroy 的 resolveBoardChange 路径） */
  function destroyGem(kind: keyof typeof STATUS_GEM_EFFECTS, sideCounts: { left?: number; right?: number } = {}) {
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
    const { board, engine, state } = makeEngine(layout, {
      seed: 7,
      leftCount: sideCounts.left ?? 2,
      rightCount: sideCounts.right ?? 2,
    });
    board.set({ row: 3, col: 3 }, null);
    const events: GameEvent[] = [];
    engine.resolveBoardChange([{ gemType: specialGem(kind), pos: { row: 3, col: 3 } }], events);
    return { events, state };
  }

  const CASES: [keyof typeof STATUS_GEM_EFFECTS, string, number, 'enemy' | 'ally'][] = [
    ['bleedGem', 'bleed', 3, 'enemy'],
    ['entangleGem', 'entangle', 3, 'enemy'],
    ['stunGem', 'stun', 1, 'enemy'],
    ['barrierGem', 'barrier', 3, 'ally'],
    ['enrageGem', 'enraged', 2, 'ally'],
    ['submergeGem', 'submerged', 2, 'ally'],
    ['faerieFireGem', 'faerie-fire', 3, 'enemy'],
    ['deathMarkGem', 'death-mark', 3, 'enemy'],
  ];

  for (const [kind, statusId, turns, side] of CASES) {
    it(`${kind}：被摧毁 → 随机一名${side === 'enemy' ? '敌人' : '己方'}获得 ${statusId} ${turns} 回合`, () => {
      const { events, state } = destroyGem(kind);
      expect(eventsOf('special-gem-trigger', events)[0]).toMatchObject({ kind });
      const applies = eventsOf('status-apply', events).filter((e) => e.statusId === statusId);
      expect(applies).toHaveLength(1);
      const targetTeam = side === 'enemy' ? PlayerSide.Right : PlayerSide.Left;
      const ids = state.teams[targetTeam].characters.map((c) => c.id);
      expect(ids).toContain(applies[0].targetId);
      const target = state.teams[targetTeam].characters.find((c) => c.id === applies[0].targetId)!;
      expect(target.statuses.some((s) => s.id === statusId && s.turns === turns)).toBe(true);
    });
  }

  it('流血宝石被匹配同样视为被摧毁（A 组共性：紫色三连含流血宝石 → 敌人获得 bleed）', () => {
    const { engine, state } = matchViaSwap('l', 'P');
    const events = engine.resolveSwap({ row: 3, col: 5 }, { row: 3, col: 6 });
    const applies = eventsOf('status-apply', events).filter((e) => e.statusId === 'bleed');
    expect(applies).toHaveLength(1);
    expect([10, 11]).toContain(applies[0].targetId);
    const enemy = state.teams[PlayerSide.Right].characters.find((c) => c.id === applies[0].targetId)!;
    expect(enemy.statuses.find((s) => s.id === 'bleed')).toMatchObject({ turns: 3, magnitude: 1 });
  });

  it('「被匹配」型宝石被普通摧毁不触发（官方文本只写 When matched：炸弹波及燃烧宝石不燃烧）', () => {
    const layout = [
      '........',
      '...f....',
      '...X....',
      '........',
      '........',
      '........',
      '........',
      '........',
    ];
    const { board, engine } = makeEngine(layout, { seed: 7 });
    board.set({ row: 2, col: 3 }, null);
    const events: GameEvent[] = [];
    // 炸弹被摧毁 → 引爆相邻一圈（含 (1,3) 的燃烧宝石）
    engine.resolveBoardChange([{ gemType: specialGem('bomb'), pos: { row: 2, col: 3 } }], events);
    expect(eventsOf('special-gem-trigger', events).some((e) => e.kind === 'bomb')).toBe(true);
    expect(eventsOf('special-gem-trigger', events).some((e) => e.kind === 'burningGem')).toBe(false);
    expect(eventsOf('status-apply', events).some((e) => e.statusId === 'burning')).toBe(false);
  });
});

// ───────────────────────── 白名单与护栏 ─────────────────────────

describe('自然掉落白名单与随机序列护栏', () => {
  it('MATCH/DESTROY 两集合恰好覆盖 13 颗且不相交', () => {
    const kinds = Object.keys(STATUS_GEM_EFFECTS) as (keyof typeof STATUS_GEM_EFFECTS)[];
    expect(kinds).toHaveLength(13);
    for (const kind of kinds) {
      const matched = MATCH_STATUS_GEMS.has(kind);
      const destroyed = DESTROY_STATUS_GEMS.has(kind);
      expect(matched !== destroyed).toBe(true); // 每颗恰好归一条路径
    }
    expect(MATCH_STATUS_GEMS.size).toBe(5);
    expect(DESTROY_STATUS_GEMS.size).toBe(8);
  });

  it('不携带状态宝石的对局：同种子事件流逐字节可复现（黄金序列锁）', () => {
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
    const run = (): string => {
      const { engine } = makeEngine(layout, { seed: 42 });
      const all: GameEvent[] = [];
      // 依次尝试相邻交换，收集前 3 次被受理的行动事件流
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
      return all.map((e) => e.type).join(',');
    };
    const golden = 'swap,elimination,mana-gain,gravity,refill,turn-end,swap,elimination,mana-gain,gravity,refill,turn-end,swap,elimination,mana-gain,gravity,refill,turn-end';
    expect(run()).toBe(golden);
    expect(run()).toBe(golden);
  });
});
