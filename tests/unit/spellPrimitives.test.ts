/**
 * 引擎原语批单测（2026-09-16 · DECISIONS 翻案记录②，spell-rules.md §9）：
 *   createStorm / stormPresent / anyEnemyStatus·anyAllyStatus / oneOf / 定量转换 /
 *   dispelStatus / reduce·buff halve / nRange·countRange / shuffleBoard / enemyChosenAndBelow。
 *
 * 每个原语至少两类用例：行为正确性 + 种子确定性（同种子同事件流/同 rng 终态）。
 * 全部走 executePrototype / 效果原语的纯逻辑路径，不经 TurnEngine（风暴结算本体
 * applyStormToTeam 与 TurnEngine.setStormFromSummon 是同一份实现，事件形态由
 * tests/unit/stormEngine.test.ts 在引擎路径另有覆盖）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import {
  skill, dmg, createStorm, createGems, dispelStatus, shuffleBoard,
  oneOf, reduce, mana, inflict, transformToSpecial, armor,
} from '@engine/skills/builders';
import { shuffleBoardEffect } from '@engine/skills/effects/gems';
import { prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import type { SkillPrototype, EffectSegment } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { GameEvent, StormChangeEvent, ReshuffleEvent } from '@engine/events';

let gid = 0;
function g(type: GemType): { id: number; type: GemType } {
  return { id: gid++, type };
}

function fillBoard(board: BoardModel, mix: (r: number, c: number) => GemType): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(mix(r, c)));
  }
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

interface Setup {
  left?: Partial<Character>[];
  right?: Partial<Character>[];
  /** (r,c) → 宝石；默认全红 */
  board?: (r: number, c: number) => GemType;
  seed?: number;
  chosenTargetId?: number;
}

function setup(s: Setup = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  gid = 0; // 每个环境从同一 id 序列开始，跨跑快照可比（确定性断言依赖）
  const board = new BoardModel();
  fillBoard(board, s.board ?? (() => colorGem(BaseColor.Red)));
  const left: Team = { player: PlayerSide.Left, characters: (s.left ?? [{}]).map((o, i) => makeChar(i, { magic: 6, ...o })) };
  const right: Team = { player: PlayerSide.Right, characters: (s.right ?? [{}, {}, {}]).map((o, i) => makeChar(i + 4, o)) };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: state.teams[PlayerSide.Left].characters[0].id,
    rng: new SeededRNG(s.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  if (s.chosenTargetId !== undefined) ctx.chosenTargetId = s.chosenTargetId;
  return { ctx, state };
}

const leftTeam = (state: ReturnType<typeof createGameState>) => state.teams[PlayerSide.Left];
const rightTeam = (state: ReturnType<typeof createGameState>) => state.teams[PlayerSide.Right];
const isStormChange = (e: GameEvent): e is StormChangeEvent => e.type === 'storm-change';
const isReshuffle = (e: GameEvent): e is ReshuffleEvent => e.type === 'reshuffle';
const countColor = (state: ReturnType<typeof createGameState>, color: BaseColor): number => {
  let n = 0;
  state.board.forEach((gem) => { if (gem && gem.type.kind === 'color' && gem.type.color === color) n += 1; });
  return n;
};
const countSpecial = (state: ReturnType<typeof createGameState>, kind: string): number => {
  let n = 0;
  state.board.forEach((gem) => { if (gem && gem.type.kind === 'special' && gem.type.spec.kind === kind) n += 1; });
  return n;
};
/** 同一构建函数在两个同种子环境各执行一次：事件流与 rng 终态必须逐字节一致 */
function expectDeterministic(build: () => SkillPrototype, s: Setup = {}): void {
  const a = setup({ ...s, seed: s.seed ?? 7 });
  const b = setup({ ...s, seed: s.seed ?? 7 });
  const ea = executePrototype(build(), a.ctx);
  const eb = executePrototype(build(), b.ctx);
  expect(eb).toEqual(ea);
  expect(b.ctx.rng.getState()).toBe(a.ctx.rng.getState());
}

// ───────────────────────── P1 createStorm ─────────────────────────

describe('createStorm 效果段（风暴原语）', () => {
  it('施法方获得风暴：team.storm 落位、storm-change 事件形态（set）', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(createStorm(BaseColor.Blue)), ctx);
    expect(events).toEqual([
      { type: 'storm-change', player: PlayerSide.Left, color: BaseColor.Blue, reason: 'set' },
    ]);
    expect(state.teams[PlayerSide.Left].storm).toMatchObject({ color: BaseColor.Blue, turns: 8 });
    expect(state.teams[PlayerSide.Right].storm).toBeUndefined();
  });

  it('后召顶替先召（全场唯一）：己方已有 → replaced+prevColor；对方有 → 对方收 color=null 再设己方', () => {
    // 己方已有蓝风暴，再召唤红风暴 → 一条 replaced（prevColor=Blue）
    const s1 = setup({});
    s1.state.teams[PlayerSide.Left].storm = { color: BaseColor.Blue, turns: 3, troopId: 9003 };
    const e1 = executePrototype(skill(createStorm(BaseColor.Red)), s1.ctx);
    expect(e1.filter(isStormChange).map((e) => [e.player, e.color, e.reason, e.prevColor])).toEqual([
      [PlayerSide.Left, BaseColor.Red, 'replaced', BaseColor.Blue],
    ]);
    expect(s1.state.teams[PlayerSide.Left].storm).toMatchObject({ color: BaseColor.Red, turns: 8 });

    // 对方已有紫风暴 → 先给对方 color:null 的 replaced，再给己方 replaced（prevColor=Purple）
    const s2 = setup({});
    s2.state.teams[PlayerSide.Right].storm = { color: BaseColor.Purple, turns: 5, troopId: 9001 };
    const e2 = executePrototype(skill(createStorm(BaseColor.Red)), s2.ctx);
    expect(e2.filter(isStormChange).map((e) => [e.player, e.color, e.reason, e.prevColor])).toEqual([
      [PlayerSide.Right, null, 'replaced', BaseColor.Purple],
      [PlayerSide.Left, BaseColor.Red, 'replaced', BaseColor.Purple],
    ]);
    expect(s2.state.teams[PlayerSide.Right].storm).toBeUndefined();
    expect(s2.state.teams[PlayerSide.Left].storm).toMatchObject({ color: BaseColor.Red });
  });

  it('骷髅系风暴：dropKind 落位并随事件下发（骸骨风暴口径）', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(skill(createStorm(BaseColor.Brown, { dropKind: 'skull' })), ctx);
    const ev = events.filter(isStormChange);
    expect(ev).toHaveLength(1);
    expect(ev[0].dropKind).toBe('skull');
    expect(state.teams[PlayerSide.Left].storm).toMatchObject({ color: BaseColor.Brown, dropKind: 'skull', turns: 8 });
  });

  it('种子确定性：风暴设置零随机消耗，同种子事件流与 rng 终态一致', () => {
    expectDeterministic(() => skill(createStorm(BaseColor.Green), createStorm(BaseColor.Purple)));
  });
});

// ───────────────────────── P2 stormPresent ─────────────────────────

describe('stormPresent 条件（风暴在场）', () => {
  const proto = (cond: object): SkillPrototype => ({
    segments: [
      { kind: 'damage', target: 'enemyFront', scaling: { base: 4, mult: 0 }, condMult: { times: 3, cond } } as EffectSegment,
    ],
  });

  it('无风暴 → 条件不成立（伤害原值）；任意风暴在场 → 倍率生效', () => {
    const none = setup({ right: [{ hp: 50, armor: 0 }] });
    executePrototype(proto({ kind: 'stormPresent' }), none.ctx);
    expect(rightTeam(none.state).characters[0].hp).toBe(46);

    const any = setup({ right: [{ hp: 50, armor: 0 }] });
    any.state.teams[PlayerSide.Right].storm = { color: BaseColor.Purple, turns: 3, troopId: 9001 };
    executePrototype(proto({ kind: 'stormPresent' }), any.ctx);
    expect(rightTeam(any.state).characters[0].hp).toBe(50 - 12);
  });

  it('color 筛色、dropKind 筛骸骨系：颜色不匹配/系别不匹配都不算', () => {
    // 蓝色风暴：匹配 color Blue、不匹配 color Red、不匹配 dropKind skull
    const blue = setup({ right: [{ hp: 99, armor: 0 }] });
    blue.state.teams[PlayerSide.Right].storm = { color: BaseColor.Blue, turns: 3, troopId: 9003 };
    executePrototype(proto({ kind: 'stormPresent', color: BaseColor.Blue }), blue.ctx);
    expect(rightTeam(blue.state).characters[0].hp).toBe(99 - 12);

    const redFilter = setup({ right: [{ hp: 99, armor: 0 }] });
    redFilter.state.teams[PlayerSide.Right].storm = { color: BaseColor.Blue, turns: 3, troopId: 9003 };
    executePrototype(proto({ kind: 'stormPresent', color: BaseColor.Red }), redFilter.ctx);
    expect(rightTeam(redFilter.state).characters[0].hp).toBe(95);

    const bone = setup({ right: [{ hp: 99, armor: 0 }] });
    bone.state.teams[PlayerSide.Right].storm = { color: BaseColor.Brown, turns: 3, troopId: 9007, dropKind: 'skull' };
    executePrototype(proto({ kind: 'stormPresent', dropKind: 'skull' }), bone.ctx);
    expect(rightTeam(bone.state).characters[0].hp).toBe(99 - 12);
    executePrototype(proto({ kind: 'stormPresent', color: BaseColor.Blue }), bone.ctx);
    expect(rightTeam(bone.state).characters[0].hp).toBe(99 - 12 - 4);
  });

  it('ifCond 挂段：风暴不在场整段静默跳过（不发事件）', () => {
    const { ctx, state } = setup({});
    const events = executePrototype(
      skill(armor('allySelf', 8, 0, { ifCond: { kind: 'stormPresent' } })),
      ctx,
    );
    expect(events).toEqual([]);
    expect(leftTeam(state).characters[0].armor).toBe(0);
  });
});

// ───────────────────────── P7 anyEnemyStatus / anyAllyStatus ─────────────────────────

describe('聚合存在判定（anyEnemyStatus / anyAllyStatus）', () => {
  it('任一存活敌人带该状态 → 整段生效；无人带 → 静默跳过', () => {
    const withCurse = setup({
      right: [{ statuses: [{ id: 'curse', turns: 2 }] }, {}, {}],
    });
    const events = executePrototype(
      skill(mana('allySelf', 10, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } })),
      withCurse.ctx,
    );
    expect(events).toEqual([{ type: 'buff', targetId: 0, stat: 'mana', amount: 10 }]);

    const clean = setup({ right: [{}, {}, {}] });
    const none = executePrototype(
      skill(mana('allySelf', 10, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'curse' } })),
      clean.ctx,
    );
    expect(none).toEqual([]);
    expect(leftTeam(clean.state).characters[0].mana).toBe(0);
  });

  it('anyAllyStatus 读己方（含施法者）；状态到期（turns=0）不算在场', () => {
    const allyPoisoned = setup({ left: [{}, { statuses: [{ id: 'poison', turns: 2 }] }] });
    const events = executePrototype(
      skill(armor('allySelf', 3, 0, { ifCond: { kind: 'anyAllyStatus', statusId: 'poison' } })),
      allyPoisoned.ctx,
    );
    expect(events).toEqual([{ type: 'buff', targetId: 0, stat: 'armor', amount: 3 }]);

    const expired = setup({ left: [{ statuses: [{ id: 'poison', turns: 0 }] }] });
    expect(executePrototype(
      skill(armor('allySelf', 3, 0, { ifCond: { kind: 'anyAllyStatus', statusId: 'poison' } })),
      expired.ctx,
    )).toEqual([]);
  });

  it('种子确定性：判定不消耗随机数，两跑一致', () => {
    expectDeterministic(() => skill(
      mana('allySelf', 2, 0, { ifCond: { kind: 'anyEnemyStatus', statusId: 'disease' } }),
      createGems(BaseColor.Red, 1, 0),
    ), { right: [{ statuses: [{ id: 'disease', turns: 2 }] }] });
  });
});

// ───────────────────────── P3 oneOf ─────────────────────────

describe('oneOf 随机多选一', () => {
  const branches = (): (EffectSegment | EffectSegment[])[] => [
    [dmg('enemyFront', 10, 0), inflict('burning', 'enemyFront')],
    createGems(BaseColor.Purple, 5, 0),
  ];

  it('只执行掷中的一支：另一支零执行零事件；多段分支整支生效', () => {
    // 种子扫描：A 支（伤害+燃烧）与 B 支（造紫宝石）都会出现，且每次只出现一支的痕迹
    let sawDamage = false;
    let sawGems = false;
    for (let seed = 1; seed <= 40; seed++) {
      const { ctx, state } = setup({ seed, right: [{ hp: 50, armor: 0 }] });
      const events = executePrototype(skill(oneOf(...branches())), ctx);
      const hp = rightTeam(state).characters[0].hp;
      const gems = countColor(state, BaseColor.Purple);
      if (hp === 40) {
        sawDamage = true;
        expect(gems).toBe(0); // 未选中支完全没执行
        expect(events.some((e) => e.type === 'gem-create')).toBe(false);
        expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'burning')).toBe(true);
      } else if (gems === 5) {
        sawGems = true;
        expect(hp).toBe(50);
        expect(events.some((e) => e.type === 'skill-damage')).toBe(false);
      } else {
        throw new Error(`seed ${seed}: 两支都/都没执行（hp=${hp}, gems=${gems}）`);
      }
    }
    expect(sawDamage).toBe(true);
    expect(sawGems).toBe(true);
  });

  it('种子确定性：同种子同分支（事件流与 rng 终态逐字节一致）', () => {
    expectDeterministic(() => skill(oneOf(...branches())), { right: [{ hp: 50, armor: 0 }] });
  });

  it('oneOf 自身的 ifCond 先裁决，再掷分支', () => {
    // ifCond 不成立 → 不掷分支、无任何效果
    const { ctx, state } = setup({});
    const seg: EffectSegment = {
      kind: 'oneOf',
      options: [[createGems(BaseColor.Purple, 3, 0)], [createGems(BaseColor.Blue, 3, 0)]],
      ifCond: { kind: 'stormPresent' },
    };
    executePrototype({ segments: [seg] }, ctx);
    expect(countColor(state, BaseColor.Purple)).toBe(0);
    expect(countColor(state, BaseColor.Blue)).toBe(0);
  });
});

// ───────────────────────── P4 定量转换 ─────────────────────────

describe('定量转换（transform count / ANY / toSpecial）', () => {
  const purpleBoard = (r: number): GemType =>
    r < 2 ? colorGem(BaseColor.Purple) : colorGem(BaseColor.Red);

  it('「将 2 颗紫色宝石转换成炸弹宝石」：恰好 2 颗转换、其余不动', () => {
    const { ctx, state } = setup({ board: purpleBoard });
    const events = executePrototype(skill(transformToSpecial(BaseColor.Purple, 'bomb', { count: 2 })), ctx);
    expect(countSpecial(state, 'bomb')).toBe(2);
    expect(countColor(state, BaseColor.Purple)).toBe(14); // 16 颗紫 - 2
    const changes = events[0].type === 'gem-transform' ? events[0].changes : [];
    expect(changes).toHaveLength(2);
    for (const ch of changes) expect(ch.to).toEqual(specialGem('bomb'));
  });

  it('「将一颗宝石转换成炸弹宝石」：from ANY 取 1 颗非目标类型转换', () => {
    const { ctx, state } = setup({ board: purpleBoard });
    executePrototype(skill(transformToSpecial('ANY', 'bomb', { count: 1 })), ctx);
    expect(countSpecial(state, 'bomb')).toBe(1);
  });

  it('数量超过池子时有多少转多少；池子为空不发事件', () => {
    const { ctx, state } = setup({ board: purpleBoard });
    executePrototype(skill(transformToSpecial('ANY', 'bomb', { count: 99 })), ctx);
    expect(countSpecial(state, 'bomb')).toBe(64); // 全盘 64 格

    const empty = setup({ board: () => specialGem('bomb') });
    const events = executePrototype(skill(transformToSpecial('ANY', 'bomb', { count: 3 })), empty.ctx);
    expect(events).toEqual([]);
  });

  it('种子确定性：同种子转换同一批格子', () => {
    expectDeterministic(() => skill(transformToSpecial(BaseColor.Purple, 'bomb', { count: 5 })), { board: purpleBoard });
  });
});

// ───────────────────────── P5 dispelStatus ─────────────────────────

describe('定向驱散单一状态（dispelStatus）', () => {
  it('只移除点名状态、其余保留，发 status-expire 事件', () => {
    const { ctx, state } = setup({
      right: [{ statuses: [{ id: 'bleed', turns: 3 }, { id: 'poison', turns: 3 }] }],
    });
    const events = executePrototype(skill(dispelStatus('bleed', 'enemyFront')), ctx);
    expect(events).toEqual([expect.objectContaining({ type: 'status-expire', targetId: 4, statusId: 'bleed' })]);
    const statuses = rightTeam(state).characters[0].statuses.map((s) => s.id);
    expect(statuses).toEqual(['poison']);
  });

  it('目标没有该状态 → 无事发生；驱散正面状态（屏障）同样可表达', () => {
    const clean = setup({ right: [{}] });
    expect(executePrototype(skill(dispelStatus('bleed', 'enemyFront')), clean.ctx)).toEqual([]);

    const shielded = setup({ right: [{ statuses: [{ id: 'barrier', turns: 3 }] }] });
    const events = executePrototype(skill(dispelStatus('barrier', 'enemyFront')), shielded.ctx);
    expect(events).toEqual([expect.objectContaining({ type: 'status-expire', targetId: 4, statusId: 'barrier' })]);
    expect(rightTeam(shielded.state).characters[0].statuses).toEqual([]);
  });
});

// ───────────────────────── P6 比例法力/属性减半 ─────────────────────────

describe('reduce halve（按当前值 50% 下取整）', () => {
  it('attack 5 → 减 2（floor 2.5）；armor 7 → 减 3；事件为实际变化量（负数）', () => {
    const { ctx, state } = setup({ right: [{ attack: 5, armor: 7 }] });
    const events = executePrototype(
      skill(reduce('enemyFront', 'attack', 0, 0, { halve: true }), reduce('enemyFront', 'armor', 0, 0, { halve: true })),
      ctx,
    );
    expect(rightTeam(state).characters[0].attack).toBe(3);
    expect(rightTeam(state).characters[0].armor).toBe(4);
    expect(events).toEqual([
      { type: 'buff', targetId: 4, stat: 'attack', amount: -2 },
      { type: 'buff', targetId: 4, stat: 'armor', amount: -3 },
    ]);
  });

  it('mana 减半：7 → 3；当前值 0/1 时无事发生（0 变化不发事件）', () => {
    const { ctx, state } = setup({ right: [{ mana: 7 }] });
    executePrototype(skill(reduce('enemyFront', 'mana', 0, 0, { halve: true })), ctx);
    expect(rightTeam(state).characters[0].mana).toBe(4);

    const low = setup({ right: [{ mana: 1 }] });
    const events = executePrototype(skill(reduce('enemyFront', 'mana', 0, 0, { halve: true })), low.ctx);
    expect(events).toEqual([]);
    expect(rightTeam(low.state).characters[0].mana).toBe(1); // floor(0.5)=0 → 不变
  });
});

describe('buff halve（「获得半数法力值」= 半条法力 floor(manaCost/2)）', () => {
  it('manaCost 20 → 获得 10，受 manaCost 上限夹取', () => {
    const { ctx, state } = setup({ left: [{ manaCost: 20, mana: 0 }] });
    const events = executePrototype(skill(mana('allySelf', 0, 0, { halve: true })), ctx);
    expect(events).toEqual([{ type: 'buff', targetId: 0, stat: 'mana', amount: 10 }]);
    expect(leftTeam(state).characters[0].mana).toBe(10);

    const nearlyFull = setup({ left: [{ manaCost: 20, mana: 16 }] });
    const events2 = executePrototype(skill(mana('allySelf', 0, 0, { halve: true })), nearlyFull.ctx);
    expect(events2).toEqual([{ type: 'buff', targetId: 0, stat: 'mana', amount: 4 }]);
    expect(leftTeam(nearlyFull.state).characters[0].mana).toBe(20);
  });

  it('非 mana 属性不受 halve 影响（半条法力仅限法力口径）', () => {
    const { ctx, state } = setup({ left: [{ manaCost: 20 }] });
    executePrototype(skill(armor('allySelf', 4, 0, { halve: true })), ctx);
    expect(leftTeam(state).characters[0].armor).toBe(4); // halve 仅 stat='mana' 生效，数值照常
  });
});

// ───────────────────────── P8 数量区间 ─────────────────────────

describe('目标数量区间 nRange（enemyRandomN）', () => {
  it('1 到 4 名：每次掷选落在这区间；同种子同目标集', () => {
    const idsOf = (seed: number): number[] => {
      const { ctx, state } = setup({
        seed,
        right: [{}, {}, {}, {}, {}],
      });
      executePrototype(skill(inflict('poison', 'enemyRandomN', { nRange: { min: 1, max: 4 } })), ctx);
      return rightTeam(state).characters.filter((c) => c.statuses.some((s) => s.id === 'poison')).map((c) => c.id);
    };
    for (let seed = 1; seed <= 30; seed++) {
      const picked = idsOf(seed);
      expect(picked.length).toBeGreaterThanOrEqual(1);
      expect(picked.length).toBeLessThanOrEqual(4);
      expect(idsOf(seed)).toEqual(picked); // 同种子重跑一致
    }
    // 区间两端都应出现过（30 个种子足够覆盖 min=1 与 max=4）
    const counts = new Set(Array.from({ length: 30 }, (_, i) => idsOf(i + 1).length));
    expect(counts.has(1)).toBe(true);
    expect(counts.has(4)).toBe(true);
  });
});

describe('创造数量区间 countRange', () => {
  it('「创造 8-12 颗紫色宝石」：落在区间内（满盘就地转化）；同种子同数量同格子', () => {
    const run = (seed: number): { n: number; ids: number[] } => {
      const { ctx, state } = setup({ seed });
      executePrototype(skill(createGems(BaseColor.Purple, 8, 0, { countRange: { min: 8, max: 12 } })), ctx);
      const ids: number[] = [];
      state.board.forEach((gem) => { if (gem && gem.type.kind === 'color' && gem.type.color === BaseColor.Purple) ids.push(gem.id); });
      return { n: ids.length, ids };
    };
    for (let seed = 1; seed <= 20; seed++) {
      const r = run(seed);
      expect(r.n).toBeGreaterThanOrEqual(8);
      expect(r.n).toBeLessThanOrEqual(12);
      expect(run(seed).ids).toEqual(r.ids);
    }
    const counts = new Set(Array.from({ length: 20 }, (_, i) => run(i + 1).n));
    expect(counts.size).toBeGreaterThan(1); // 区间确实在掷，不是恒定值
  });

  it('随机爆破数量区间（「爆破 1-2 颗宝石」）：destroy randomGems 同样支持', () => {
    const clearProto = ((): SkillPrototype => ({
      segments: [{
        kind: 'gem',
        params: { op: 'clear', mode: 'destroy', target: { kind: 'randomGems', count: { base: 1, mult: 0 }, include: 'color', countRange: { min: 1, max: 2 } } },
      }],
    }));
    const aliveAfter = (seed: number): number => {
      const { ctx, state } = setup({ seed });
      executePrototype(clearProto(), ctx);
      let alive = 0;
      state.board.forEach((gem) => { if (gem) alive += 1; });
      return alive;
    };
    for (let seed = 1; seed <= 20; seed++) {
      const alive = aliveAfter(seed);
      expect(alive).toBeGreaterThanOrEqual(62); // 摧毁 1-2 颗
      expect(alive).toBeLessThanOrEqual(63);
      expect(aliveAfter(seed)).toBe(alive); // 同种子一致
    }
  });
});

// ───────────────────────── P9 shuffleBoard ─────────────────────────

describe('打乱板面（shuffleBoard）', () => {
  it('宝石集合不变（id+类型）、发 reshuffle 事件、洗后无现成三连', () => {
    const palette = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
    const { ctx, state } = setup({ board: (r, c) => colorGem(palette[(r * 5 + c * 3 + 1) % 6]) });
    const before: string[] = [];
    state.board.forEach((gem) => { if (gem) before.push(`${gem.id}:${JSON.stringify(gem.type)}`); });

    const events = executePrototype(skill(shuffleBoard()), ctx);
    const reshuffles = events.filter(isReshuffle);
    expect(reshuffles).toHaveLength(1);
    expect(reshuffles[0].moves.length).toBeGreaterThan(0);

    const after: string[] = [];
    state.board.forEach((gem) => { if (gem) after.push(`${gem.id}:${JSON.stringify(gem.type)}`); });
    expect(after.slice().sort()).toEqual(before.slice().sort());
  });

  it('种子确定性：同种子洗出同一布局；非满盘安全跳过', () => {
    const palette = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
    const layout = (seed: number): string[] => {
      const { ctx, state } = setup({ seed, board: (r, c) => colorGem(palette[(r * 5 + c * 3 + 1) % 6]) });
      executePrototype(skill(shuffleBoard()), ctx);
      const snap: string[] = [];
      state.board.forEach((gem, pos) => { if (gem) snap.push(`${pos.row},${pos.col}:${gem.id}`); });
      return snap;
    };
    expect(layout(11)).toEqual(layout(11));
    expect(layout(11)).not.toEqual(layout(12)); // 不同种子应（几乎必然）不同布局

    // 非满盘（有洞）：安全跳过，棋盘原样
    const holed = setup({ board: (r, c) => (r === 0 && c === 0 ? colorGem(BaseColor.Red) : colorGem(BaseColor.Blue)) });
    holed.state.board.set({ row: 0, col: 0 }, null);
    const events = executePrototype(skill(shuffleBoard()), holed.ctx);
    expect(events).toEqual([]);
    let alive = 0;
    holed.state.board.forEach((gem) => { if (gem) alive += 1; });
    expect(alive).toBe(63);
  });

  it('纯原语入口 shuffleBoardEffect：满盘重排 + 事件（与段路径同行为）', () => {
    const { ctx } = setup({});
    const events = shuffleBoardEffect().apply(ctx);
    expect(events.filter(isReshuffle)).toHaveLength(1);
  });
});

// ───────────────────────── P10 enemyChosenAndBelow ─────────────────────────

describe('位置复合目标 enemyChosenAndBelow', () => {
  it('指定敌人 + 其下方（编队更靠后）的全部存活敌人受击，上方不受影响', () => {
    // 敌方 [id4, id5, id6]，指定 id5 → id5、id6 各受 8 点（range all：名单内全员全额）；id4 无伤
    const { ctx, state } = setup({
      right: [{}, {}, {}],
      chosenTargetId: 5,
    });
    executePrototype(skill(dmg('enemyChosenAndBelow', 8, 0, { range: 'all' })), ctx);
    expect(rightTeam(state).characters[0].hp).toBe(50);
    expect(rightTeam(state).characters[1].hp).toBe(42);
    expect(rightTeam(state).characters[2].hp).toBe(42);
  });

  it('指定最后一名 → 只有他自己；目标选择器感知新模式（AI/原型探测）', () => {
    const { ctx, state } = setup({ right: [{}, {}, {}], chosenTargetId: 6 });
    executePrototype(skill(dmg('enemyChosenAndBelow', 8, 0, { range: 'all' })), ctx);
    expect(rightTeam(state).characters[0].hp).toBe(50);
    expect(rightTeam(state).characters[1].hp).toBe(50);
    expect(rightTeam(state).characters[2].hp).toBe(42);

    const proto = skill(dmg('enemyChosenAndBelow', 8, 0));
    expect(prototypeChosenTargetMode(proto)).toBe('enemyChosenAndBelow');
  });

  it('未提供选定目标 → 整段安全跳过', () => {
    const { ctx, state } = setup({ right: [{}, {}, {}] });
    const events = executePrototype(skill(dmg('enemyChosenAndBelow', 8, 0)), ctx);
    expect(events).toEqual([]);
    expect(rightTeam(state).characters.every((c) => c.hp === 50)).toBe(true);
  });
});

// ───────────────────────── 序列化护栏（spell-rules §8） ─────────────────────────

describe('新段 JSON 往返一致（序列化护栏）', () => {
  it('storm/oneOf/dispel/shuffleBoard/定量转换段 JSON.stringify→parse 深相等', () => {
    const proto: SkillPrototype = skill(
      createStorm(BaseColor.Brown, { dropKind: 'skull', turns: 5 }),
      oneOf([dmg('enemyFront', 2, 1)], [inflict('poison', 'enemyRandomN', { nRange: { min: 1, max: 4 } })]),
      dispelStatus('bleed', 'enemyChosen'),
      shuffleBoard(),
      transformToSpecial('ANY', 'bomb', { count: 1 }),
      createGems(BaseColor.Purple, 8, 0, { countRange: { min: 8, max: 12 } }),
      reduce('enemyFront', 'attack', 0, 0, { halve: true }),
      mana('allySelf', 0, 0, { halve: true }),
    );
    const round = JSON.parse(JSON.stringify(proto)) as SkillPrototype;
    expect(round).toEqual(proto);
  });
});
