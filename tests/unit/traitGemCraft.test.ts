/**
 * T4 宝石创造钩子批测试（回合开始/身亡时/配对时创造特殊宝石，59 code / 180+ 次出场）：
 *   1. 回合开始创造特殊宝石——turnStartCreateSpecialGem（spidersilk 织网 25% /
 *      landmines 炸弹必发 / eyeofdestruction 末日骷髅×2 / hohoho 冻结×3 …）；
 *   2. 回合开始转换特殊宝石——turnStartColorToSpecial（redrage 红×2→燃烧 /
 *      temporal 黄→沙漏 / terrifyingaura 紫×2→恐怖 …）；
 *   3. 身亡创造——onDeathCreateGem（unstablecore 26 次「在我身亡时创造 3 颗炸弹宝石」）；
 *   4. 大连创造——onBigMatchCreateGem（wildtribe 10% x2 通配 / wildmagic 25% /
 *      twinfires 燃烧×2 / spectromancy 50% x3 通配）。
 *
 * 落子口径：随机现存格就地翻新（满盘创造的代理口径），发既有 gem-transform 事件；
 * 改完棋盘立即 runCascades（大连路径由外层下一轮吸收）。
 *
 * 护栏：概率 <1 的条目无 rng/无 createGem 注入时不生效（纯逻辑环境零事件零随机消耗）；
 * 阵亡持有者不触发大连创造；大连落子避开本轮将被消除的匹配格。
 */
import { describe, it, expect } from 'vitest';
import { resolvePassives, neutralPassives, getTrait, attachPassives, applyBigMatchTriggers } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem, skullGem } from '@engine/types';
import type { Character, Team, GemType, SpecialGemKind } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { MatchResolver } from '@engine/MatchResolver';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

/** 盘面上指定 kind 的特殊宝石数（含骷髅族按 skull 判） */
function countSpecial(board: BoardModel, kind: SpecialGemKind): number {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gem = board.get({ row: r, col: c });
      if (gem?.type.kind === 'special' && gem.type.spec.kind === kind) n++;
    }
  }
  return n;
}

function countColor(board: BoardModel, color: BaseColor): number {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gem = board.get({ row: r, col: c });
      if (gem?.type.kind === 'color' && gem.type.color === color) n++;
    }
  }
  return n;
}

/** gem-transform 事件里 to 为指定特殊宝石的改动清单 */
function transformChangesOf(events: GameEvent[], kind: SpecialGemKind): { pos: { row: number; col: number }; to: GemType }[] {
  const out: { pos: { row: number; col: number }; to: GemType }[] = [];
  for (const e of events) {
    if (e.type !== 'gem-transform') continue;
    for (const ch of (e as { changes: { pos: { row: number; col: number }; to: GemType }[] }).changes) {
      if (ch.to.kind === 'special' && ch.to.spec.kind === kind) out.push({ pos: ch.pos, to: ch.to });
    }
  }
  return out;
}

// ============================================================
// 编译正确性
// ============================================================

describe('编译正确性（4 新键 → 定义/resolvePassives 产物）', () => {
  it('unstablecore：身亡创造 3 颗炸弹（onDeathCreateGem，编译进 passive）', () => {
    expect(getTrait('unstablecore')?.onDeathCreateGem).toEqual({ gem: 'bomb', count: 3 });
    expect(getTrait('unstablecore')?.troops).toBe(26);
    expect(resolvePassives(['unstablecore']).onDeathCreateGem).toEqual({ gem: 'bomb', count: 3 });
  });

  it('大连创造：wildtribe/wildmagic x2 通配带概率、twinfires 燃烧×2 必发、spectromancy x3 通配', () => {
    expect(getTrait('wildtribe')?.onBigMatchCreateGem).toEqual({ gem: 'wildcard', tier: 2, count: 1, chance: 0.1 });
    expect(getTrait('wildmagic')?.onBigMatchCreateGem).toEqual({ gem: 'wildcard', tier: 2, count: 1, chance: 0.25 });
    expect(getTrait('twinfires')?.onBigMatchCreateGem).toEqual({ gem: 'burningGem', count: 2 });
    expect(getTrait('spectromancy')?.onBigMatchCreateGem).toEqual({ gem: 'wildcard', tier: 3, count: 1, chance: 0.5 });
    // minSize 编译期缺省 4（「4 或更多」= 任意大连），多条并存按声明序
    const compiled = resolvePassives(['wildtribe', 'spectromancy']).bigMatchCreateGem;
    expect(compiled).toEqual([
      { gem: 'wildcard', tier: 2, count: 1, chance: 0.1, minSize: 4 },
      { gem: 'wildcard', tier: 3, count: 1, chance: 0.5, minSize: 4 },
    ]);
  });

  it('回合开始创造/转换特殊宝石：定义直读不进 passive（编译结果与中性被动逐字节一致）', () => {
    expect(getTrait('spidersilk')?.turnStartCreateSpecialGem).toEqual({ gem: 'web', count: 1, chance: 0.25 });
    expect(getTrait('landmines')?.turnStartCreateSpecialGem).toEqual({ gem: 'bomb', count: 1 });
    expect(getTrait('eyeofdestruction')?.turnStartCreateSpecialGem).toEqual({ gem: 'doomSkull', count: 2 });
    expect(getTrait('redrage')?.turnStartColorToSpecial).toEqual({ color: 'Red', gem: 'burningGem', count: 2 });
    expect(getTrait('temporal')?.turnStartColorToSpecial).toEqual({ color: 'Yellow', gem: 'hourglass', count: 1, chance: 0.5 });
    for (const code of ['spidersilk', 'landmines', 'redrage', 'temporal']) {
      expect(JSON.stringify(resolvePassives([code]))).toBe(JSON.stringify(neutralPassives()));
    }
  });

  it('普通颜色创造带数量：intothevoid「创造 2 颗紫色宝石」（turnStartCreateGem.count）', () => {
    expect(getTrait('intothevoid')?.turnStartCreateGem).toEqual({ color: 'Purple', count: 2 });
    expect(getTrait('lightningaura')?.turnStartCreateGem).toEqual({ color: 'Yellow', count: 2 });
  });

  it('新键编译后与中性被动有差异且编译为纯函数', () => {
    const codes = ['unstablecore', 'wildtribe', 'wildmagic', 'twinfires', 'spectromancy'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// 回合开始创造/转换特殊宝石（TurnEngine 集成，passTurn 触发右方）
// ============================================================

describe('回合开始创造特殊宝石（applyTurnStartBoardTraits）', () => {
  /** 铺一张不会自发匹配的棋盘（palette 可指定，默认无红无棕） */
  function battle(rightTraits: string[], seed = 51, palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]) {
    const rng = new SeededRNG(seed);
    let id = 98000;
    const board = new BoardModel();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % palette.length]) });
      }
    }
    const mine = makeChar(0);
    const theirs = makeChar(4, { traitIds: rightTraits });
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [mine]),
      makeTeam(PlayerSide.Right, [theirs]),
    );
    const engine = new TurnEngine(state, rng, () => id++, new ExtensionRegistry());
    return { engine, board };
  }

  it('landmines：回合开始必发创造一颗炸弹宝石（不可匹配，盘面不留连锁）', () => {
    const { engine, board } = battle(['landmines']);
    expect(countSpecial(board, 'bomb')).toBe(0);
    const events = engine.passTurn();
    const changes = transformChangesOf(events, 'bomb');
    expect(changes).toHaveLength(1);
    expect(countSpecial(board, 'bomb')).toBe(1);
    expect(board.isFull()).toBe(true);
    expect(new MatchResolver().hasAnyMatch(board)).toBe(false);
  });

  it('eyeofdestruction：创造 2 颗末日骷髅头（单条 gem-transform 事件带 2 处改动）', () => {
    const { engine, board } = battle(['eyeofdestruction']);
    const events = engine.passTurn();
    const changes = transformChangesOf(events, 'doomSkull');
    expect(changes).toHaveLength(2);
    expect(countSpecial(board, 'doomSkull')).toBe(2);
  });

  it('spidersilk：25% 织网宝石——多种子扫描至少命中一次，未命中零 gem-transform', () => {
    let hit = false;
    for (const seed of [51, 52, 53, 54, 55, 56, 57, 58, 59, 60]) {
      const { engine, board } = battle(['spidersilk'], seed);
      const events = engine.passTurn();
      const changes = transformChangesOf(events, 'web');
      if (changes.length > 0) {
        expect(changes).toHaveLength(1);
        expect(countSpecial(board, 'web')).toBeGreaterThanOrEqual(1);
        hit = true;
        break;
      }
      expect(changes).toEqual([]);
    }
    expect(hit).toBe(true);
  });

  it('redrage：将 2 颗红色宝石转换成燃烧宝石（palette 含红；转换后照常结算连锁）', () => {
    const { engine } = battle(['redrage'], 51, [BaseColor.Red, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]);
    const events = engine.passTurn();
    const changes = transformChangesOf(events, 'burningGem');
    expect(changes).toHaveLength(2);
    expect(board_redside_ok(changes));
  });

  it('多颗普通颜色创造：intothevoid 一次创造 2 颗紫色宝石', () => {
    const { engine } = battle(['intothevoid']);
    const before = countColor(engine.getState().board, BaseColor.Purple);
    const events = engine.passTurn();
    const transforms = events.filter((e) => e.type === 'gem-transform');
    expect(transforms).toHaveLength(1);
    const changes = (transforms[0] as { changes: { from: GemType; to: GemType }[] }).changes;
    expect(changes).toHaveLength(2);
    expect(changes.every((ch) => ch.to.kind === 'color' && ch.to.color === BaseColor.Purple)).toBe(true);
    // 净增 = 2 - 原地本就是紫宝石的落点数（就地翻新口径）
    const convertedFromPurple = changes.filter((ch) => ch.from.kind === 'color' && ch.from.color === BaseColor.Purple).length;
    expect(countColor(engine.getState().board, BaseColor.Purple)).toBe(before + 2 - convertedFromPurple);
  });

  /** redrage 专用小校验：转换后的格位彼此不同 */
  function board_redside_ok(changes: { pos: { row: number; col: number } }[]): boolean {
    const keys = new Set(changes.map((ch) => `${ch.pos.row},${ch.pos.col}`));
    return keys.size === changes.length;
  }
});

// ============================================================
// 身亡创造（unstablecore，processDeathTriggers 结算点）
// ============================================================

/** 底行构造「交换 (7,1)<->(6,1) 后三骷髅击杀敌方队首」的局面（复用身亡经济批的棋盘模式） */
function buildWithSkullMatch(playerChars: Character[], enemyChars: Character[], seed = 11) {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
    }
  }
  board.set({ row: 7, col: 0 }, { id: 70, type: skullGem() });
  board.set({ row: 7, col: 2 }, { id: 72, type: skullGem() });
  board.set({ row: 7, col: 1 }, { id: 71, type: colorGem(BaseColor.Green) });
  board.set({ row: 6, col: 1 }, { id: 61, type: skullGem() });
  const rng = new SeededRNG(seed);
  const idGen = (() => { let n = 800; return () => ++n; })();
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, playerChars),
    makeTeam(PlayerSide.Right, enemyChars),
  );
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
}

describe('unstablecore：身亡时创造 3 颗炸弹宝石', () => {
  it('敌方 unstablecore 队首被骷髅击杀 → 盘面落 3 颗炸弹 + gem-transform 事件', () => {
    const hero = makeChar(0, { attack: 10 });
    const dying = makeChar(4, { traitIds: ['unstablecore'], hp: 5 });
    const { engine } = buildWithSkullMatch([hero, makeChar(1)], [dying, makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(dying.defeated).toBe(true);
    const changes = transformChangesOf(events, 'bomb');
    expect(changes).toHaveLength(3);
    // 三个落点互不重复
    expect(new Set(changes.map((ch) => `${ch.pos.row},${ch.pos.col}`)).size).toBe(3);
    expect(countSpecial(engine.getState().board, 'bomb')).toBe(3);
  });

  it('存活时不创造：无击杀的对局盘面无炸弹', () => {
    const hero = makeChar(0, { traitIds: ['unstablecore'] });
    const { engine, state } = buildWithSkullMatch([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(state.board.isFull()).toBe(true);
    expect(countSpecial(state.board, 'bomb')).toBe(0);
  });

  it('己方 unstablecore 阵亡同样创造（持有者本人结算，不区分阵营方向）', () => {
    const dying = makeChar(0, { traitIds: ['unstablecore'], hp: 5 });
    const foe = makeChar(4, { attack: 10 });
    const { engine } = buildWithSkullMatch([dying, makeChar(1)], [foe, makeChar(5)]);
    // passTurn 交给右方后由右方行动：三骷髅打死左方队首 → 队首身亡时自己创造炸弹
    engine.passTurn();
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(dying.defeated).toBe(true);
    expect(transformChangesOf(events, 'bomb')).toHaveLength(3);
  });
});

// ============================================================
// 大连创造（applyBigMatchTriggers 纯函数层 + TurnEngine 集成）
// ============================================================

describe('applyBigMatchTriggers：大连创造纯函数层', () => {
  /** 记录 createGem 调用 */
  function recorder(logs: [SpecialGemKind, number | undefined, number][]) {
    return (gem: SpecialGemKind, tier: number | undefined, count: number): GameEvent[] => {
      logs.push([gem, tier, count]);
      return [{ type: 'gem-transform', changes: [] }];
    };
  }

  it('wildtribe：概率命中（rng < 10%）→ createGem(wildcard, tier 2, 1) 事件透传', () => {
    const holder = makeChar(0, { traitIds: ['wildtribe'] });
    attachPassives(holder);
    const logs: [SpecialGemKind, number | undefined, number][] = [];
    const events = applyBigMatchTriggers([holder], {
      size: 4,
      rng: { next: () => 0.05 },
      createGem: recorder(logs),
    });
    expect(logs).toEqual([['wildcard', 2, 1]]);
    expect(events).toEqual([{ type: 'gem-transform', changes: [] }]);
  });

  it('wildtribe：概率未命中（rng ≥ 10%）→ 不创造；4 连恰好掷一次（零多余消耗）', () => {
    const holder = makeChar(0, { traitIds: ['wildtribe'] });
    attachPassives(holder);
    let calls = 0;
    const events = applyBigMatchTriggers([holder], {
      size: 4,
      rng: { next: () => { calls++; return 0.5; } },
      createGem: recorder([]),
    });
    expect(events).toEqual([]);
    expect(calls).toBe(1);
  });

  it('spectromancy：50% 概率 + x3 通配（tier 3）', () => {
    const holder = makeChar(0, { traitIds: ['spectromancy'] });
    attachPassives(holder);
    const logs: [SpecialGemKind, number | undefined, number][] = [];
    applyBigMatchTriggers([holder], { size: 5, rng: { next: () => 0.49 }, createGem: recorder(logs) });
    expect(logs).toEqual([['wildcard', 3, 1]]);
  });

  it('twinfires：无概率句必发，且不消耗随机数', () => {
    const holder = makeChar(0, { traitIds: ['twinfires'] });
    attachPassives(holder);
    let calls = 0;
    const logs: [SpecialGemKind, number | undefined, number][] = [];
    applyBigMatchTriggers([holder], {
      size: 4,
      rng: { next: () => { calls++; return 1; } },
      createGem: recorder(logs),
    });
    expect(logs).toEqual([['burningGem', undefined, 2]]);
    expect(calls).toBe(0);
  });

  it('minSize 限定：3 连不触发（不掷随机数）；阵亡持有者不触发', () => {
    const holder = makeChar(0, { traitIds: ['wildtribe'] });
    attachPassives(holder);
    let calls = 0;
    applyBigMatchTriggers([holder], {
      size: 3,
      rng: { next: () => { calls++; return 0; } },
      createGem: recorder([]),
    });
    expect(calls).toBe(0);

    const dead = makeChar(0, { traitIds: ['twinfires'], defeated: true });
    attachPassives(dead);
    const logs: [SpecialGemKind, number | undefined, number][] = [];
    applyBigMatchTriggers([dead], { size: 4, createGem: recorder(logs) });
    expect(logs).toEqual([]);
  });

  it('护栏：无 createGem 注入时概率条目不生效也不掷随机数（纯逻辑环境零事件零消耗）', () => {
    const holder = makeChar(0, { traitIds: ['wildtribe', 'twinfires'] });
    attachPassives(holder);
    let calls = 0;
    const events = applyBigMatchTriggers([holder], {
      size: 4,
      rng: { next: () => { calls++; return 0; } },
    });
    expect(events).toEqual([]);
    expect(calls).toBe(0);
  });

  it('护栏：无 rng 注入时概率 <1 的条目不生效（确定性环境跳过而非必发）', () => {
    const holder = makeChar(0, { traitIds: ['wildtribe'] });
    attachPassives(holder);
    const logs: [SpecialGemKind, number | undefined, number][] = [];
    applyBigMatchTriggers([holder], { size: 4, createGem: recorder(logs) });
    expect(logs).toEqual([]);
  });
});

// ============================================================
// TurnEngine 集成：twinfires 4 连红必发 2 颗燃烧宝石（避开匹配格）
// ============================================================

describe('TurnEngine 集成：大连创造落子注入', () => {
  /** 底行构造「交换 (7,2)<->(6,2) 后成 4 连红」的局面（复用条件经济批的棋盘模式） */
  function buildWith4Red(playerChars: Character[], enemyChars: Character[], seed = 5) {
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    for (let c = 0; c < 8; c++) {
      const isRedCol = c < 4 && c !== 2;
      board.set({ row: 7, col: c }, { id: 70 + c, type: colorGem(isRedCol ? BaseColor.Red : palette[c % 4]) });
    }
    board.set({ row: 6, col: 2 }, { id: 62, type: colorGem(BaseColor.Red) });
    const rng = new SeededRNG(seed);
    const idGen = (() => { let n = 700; return () => ++n; })();
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, playerChars),
      makeTeam(PlayerSide.Right, enemyChars),
    );
    return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
  }

  it('twinfires：4 连红 → 创造 2 颗燃烧宝石，落点避开本轮被消除的匹配格', () => {
    const hero = makeChar(0, { traitIds: ['twinfires'] });
    const { engine } = buildWith4Red([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const changes = transformChangesOf(events, 'burningGem');
    expect(changes).toHaveLength(2);
    // 匹配格 = 底行 (7,0..3)（交换后红 4 连），落子不得落在其上
    const taken = new Set(changes.map((ch) => `${ch.pos.row},${ch.pos.col}`));
    expect(taken.size).toBe(2);
    for (const key of taken) {
      const [r, c] = key.split(',').map(Number);
      expect(!(r === 7 && c >= 0 && c <= 3)).toBe(true);
    }
  });

  it('无大连创造特质的同局面零 gem-transform（旧路径不受注入影响）', () => {
    const { engine } = buildWith4Red([makeChar(0), makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.some((e) => e.type === 'gem-transform')).toBe(false);
  });
});
