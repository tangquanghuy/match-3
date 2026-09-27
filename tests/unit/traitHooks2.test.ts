/**
 * 特质钩子第二批测试（O 桶四缺口机制，合计 9 code / 124 次出场）：
 *   1. aquatic（24）受击下潜——onDamagedStatus，与 onDamagedGain 同一骷髅受击结算点；
 *   2. valuable（7）身亡经济——onDeathEconomy，processDeathTriggers 经 creditEconomy 入账；
 *   3. omenof* 族（6 code/24）开局爆破——battleStartDestroy 定义直读，构造期走
 *      resolveBoardChange 清除管线（法力/骷髅伤害/重力/连锁照常），直接结算归持有者一方；
 *   4. manashield（69）法力操作免疫——manaOpsImmunity 在 reduce 原语 stat='mana' 入口跳过
 *      （耗蓝/耗尽/减半/窃取统一入口），灼烧另挂 mana-burn 状态免疫。
 *
 * 护栏：无新键特质零事件、零随机消耗（rng 终态逐字节一致）；开局爆破无候选时同样零消耗。
 */
import { describe, it, expect } from 'vitest';
import { resolvePassives, neutralPassives, getTrait, attachPassives } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { CombatResolver } from '@engine/CombatResolver';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { PlayerSide, BaseColor, colorGem, skullGem } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameState } from '@engine/GameState';
import type { GameEvent } from '@engine/events';
import { reduceEffect } from '@engine/skills/effects/debuff';
import { constantScaling } from '@engine/skills/scaling';
import { applyStatus, isUntargetable } from '@engine/skills/effects/status';
import type { EffectContext } from '@engine/skills/effects/context';

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

// ============================================================
// 编译正确性
// ============================================================

describe('编译正确性（4 机制 → 定义/resolvePassives 产物）', () => {
  it('aquatic：受击下潜（onDamagedStatus，submerged × 3 回合）', () => {
    expect(getTrait('aquatic')?.onDamagedStatus).toEqual({ statusId: 'submerged', turns: 3 });
    expect(getTrait('aquatic')?.troops).toBe(24);
    expect(resolvePassives(['aquatic']).onDamagedStatus).toEqual({ statusId: 'submerged', turns: 3 });
  });

  it('valuable：身亡经济（onDeathEconomy，25 黄金）', () => {
    expect(getTrait('valuable')?.onDeathEconomy).toEqual({ currency: 'gold', amount: 25 });
    expect(getTrait('valuable')?.troops).toBe(7);
    expect(resolvePassives(['valuable']).onDeathEconomy).toEqual({ currency: 'gold', amount: 25 });
  });

  it('manashield：法力操作免疫 + mana-burn 状态免疫（statusImmunities）', () => {
    expect(getTrait('manashield')?.manaOpsImmunity).toBe(true);
    expect(getTrait('manashield')?.troops).toBe(69);
    const compiled = resolvePassives(['manashield']);
    expect(compiled.manaOpsImmunity).toBe(true);
    expect(compiled.statusImmunities).toContain('mana-burn');
  });

  it('omenof* 族：开局爆破（battleStartDestroy，定义直读不进 passive）', () => {
    expect(getTrait('omenofdark')?.battleStartDestroy).toEqual({ kind: 'color', color: 'Purple' });
    expect(getTrait('omenofstone')?.battleStartDestroy).toEqual({ kind: 'color', color: 'Brown' });
    expect(getTrait('omenofdeath')?.battleStartDestroy).toEqual({ kind: 'skull' });
    expect(getTrait('omenofice')?.battleStartDestroy).toEqual({ kind: 'color', color: 'Blue' });
    expect(getTrait('omenofnature')?.battleStartDestroy).toEqual({ kind: 'color', color: 'Green' });
    expect(getTrait('omenoffire')?.battleStartDestroy).toEqual({ kind: 'color', color: 'Red' });
    // 定义直读字段不编译进 passive：编译结果与中性被动逐字节一致
    expect(JSON.stringify(resolvePassives(['omenofdark']))).toBe(JSON.stringify(neutralPassives()));
  });

  it('新键编译后与中性被动有差异且编译为纯函数', () => {
    const codes = ['aquatic', 'valuable', 'manashield'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// 1. 受击下潜（CombatResolver 集成）
// ============================================================

describe('aquatic：受击下潜（骷髅受击结算点）', () => {
  function skullHit(target: Character): GameEvent[] {
    attachPassives(target);
    const attacker = makeChar(0, { attack: 10 });
    attachPassives(attacker);
    const combat = new CombatResolver();
    return combat.resolveSkullDamage(
      makeTeam(PlayerSide.Left, [attacker]),
      makeTeam(PlayerSide.Right, [target]),
      3,
    ).events;
  }

  it('承受骷髅伤害后自身下潜（status-apply 事件 + 不可被指定）', () => {
    const target = makeChar(1, { traitIds: ['aquatic'] });
    const events = skullHit(target);
    expect(target.statuses).toContainEqual({ id: 'submerged', turns: 3 });
    expect(events).toContainEqual({ type: 'status-apply', targetId: 1, statusId: 'submerged', turns: 3 });
    expect(isUntargetable(target)).toBe(false);
  });

  it('已有下潜时刷新为更长回合（不叠加第二条）', () => {
    const target = makeChar(1, { traitIds: ['aquatic'] });
    applyStatus(target, { id: 'submerged', turns: 1 });
    skullHit(target);
    expect(target.statuses).toHaveLength(1);
    expect(target.statuses[0]).toEqual({ id: 'submerged', turns: 3 });
  });

  it('无特质受击者不下潜', () => {
    const target = makeChar(1);
    const events = skullHit(target);
    expect(target.statuses).toHaveLength(0);
    expect(events.filter((e) => e.type === 'status-apply')).toEqual([]);
  });
});

// ============================================================
// 2. 身亡经济（TurnEngine 集成）
// ============================================================

/** 底行构造「交换 (7,1)<->(6,1) 后三骷髅」的局面（复用条件经济批的棋盘模式） */
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

describe('valuable：身亡时获得 25 黄金（战场经济池）', () => {
  it('敌方 valuable 队首被骷髅击杀 → enemyGold +25 + economy-gain 事件', () => {
    const hero = makeChar(0, { attack: 10 });
    const dying = makeChar(4, { traitIds: ['valuable'], hp: 5 });
    const { engine, state } = buildWithSkullMatch([hero, makeChar(1)], [dying, makeChar(5)]);
    expect(state.economy.gold).toBe(0);
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const gains = events.filter((e) => e.type === 'economy-gain' && e.currency === 'gold');
    expect(gains).toHaveLength(1);
    expect(gains[0]).toMatchObject({ currency: 'gold', amount: 25, side: PlayerSide.Right });
    expect(engine.getState().economy.gold).toBe(0);
    expect(engine.getState().enemyGold).toBe(25);
  });

  it('无特质的阵亡不入账', () => {
    const hero = makeChar(0, { attack: 10 });
    const dying = makeChar(4, { hp: 5 });
    const { engine } = buildWithSkullMatch([hero, makeChar(1)], [dying, makeChar(5)]);
    engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(dying.defeated).toBe(true);
    expect(engine.getState().economy.gold).toBe(0);
  });

  it('护栏：身亡经济不消耗随机数（同种子 rng 终态一致，事件差异恰为 economy-gain）', () => {
    for (const seed of [11, 23]) {
      const withTrait = buildWithSkullMatch(
        [makeChar(0, { attack: 10 }), makeChar(1)],
        [makeChar(4, { traitIds: ['valuable'], hp: 5 }), makeChar(5)],
        seed,
      );
      const plain = buildWithSkullMatch(
        [makeChar(0, { attack: 10 }), makeChar(1)],
        [makeChar(4, { hp: 5 }), makeChar(5)],
        seed,
      );
      const eventsA = withTrait.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      const eventsB = plain.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      expect(withTrait.engine.getState().economy.gold).toBe(0);
      expect(withTrait.engine.getState().enemyGold).toBe(25);
      const rest = eventsA.filter((e) => e.type !== 'economy-gain');
      expect(JSON.stringify(rest)).toBe(JSON.stringify(eventsB));
    }
  });
});

// ============================================================
// 3. 开局爆破（TurnEngine 构造期）
// ============================================================

const FOUR_COLOR = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow];

/** 8×8 四色棋盘（无紫/棕），overwrite 可在指定格覆盖特殊宝石 */
function buildBoard8(overwrite?: { pos: { row: number; col: number }; gem: ReturnType<typeof colorGem> }): BoardModel {
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(FOUR_COLOR[(r + c) % 4]) });
    }
  }
  if (overwrite) board.set(overwrite.pos, { id: overwrite.pos.row * 8 + overwrite.pos.col + 1, type: overwrite.gem });
  return board;
}

function buildEngine(board: BoardModel, left: Character[], right: Character[], seed = 5) {
  const rng = new SeededRNG(seed);
  const idGen = (() => { let n = 700; return () => ++n; })();
  const state = createGameState(board, makeTeam(PlayerSide.Left, left), makeTeam(PlayerSide.Right, right));
  const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
  return { engine, state, rng, initial: engine.takeInitialEvents() };
}

describe('omenof*：战斗开始爆破一颗宝石（构造期清除管线）', () => {
  it('omenofdark: one Purple explosion returns zero direct Mana and still settles gravity', () => {
    const holder = makeChar(0, { traitIds: ['omenofdark'], colors: [BaseColor.Red, BaseColor.Purple] });
    const { initial, rng } = buildEngine(
      buildBoard8({ pos: { row: 3, col: 3 }, gem: colorGem(BaseColor.Purple) }),
      [holder, makeChar(1)],
      [makeChar(4), makeChar(5)],
    );
    const firstGravity = initial.findIndex(e => e.type === 'gravity');
    const purpleMana = initial.slice(0, firstGravity).filter(e => e.type === 'mana-gain' && e.color === BaseColor.Purple);
    expect(purpleMana).toHaveLength(0); // GoW 4.0: floor(1 * 50%) = 0.
    expect(initial.some((e) => e.type === 'gravity')).toBe(true);
    expect(initial.some((e) => e.type === 'refill')).toBe(true);
    // 消耗了随机数（爆破候选选取/补充生成），与无特质构造不同
    const plain = buildEngine(
      buildBoard8({ pos: { row: 3, col: 3 }, gem: colorGem(BaseColor.Purple) }),
      [makeChar(0), makeChar(1)],
      [makeChar(4), makeChar(5)],
    );
    expect(rng.getState()).not.toBe(plain.rng.getState());
  });

  it('omenofstone on the right: one Brown explosion returns zero direct Mana to both sides', () => {
    const holder = makeChar(4, { traitIds: ['omenofstone'], colors: [BaseColor.Brown] });
    const { initial } = buildEngine(
      buildBoard8({ pos: { row: 4, col: 4 }, gem: colorGem(BaseColor.Brown) }),
      [makeChar(0), makeChar(1)],
      [holder, makeChar(5)],
    );
    const firstGravity = initial.findIndex(e => e.type === 'gravity');
    const brownMana = initial.slice(0, firstGravity).filter(e => e.type === 'mana-gain' && e.color === BaseColor.Brown);
    expect(brownMana).toHaveLength(0);
    expect(initial.some(e => e.type === 'gem-explode')).toBe(true);
  });

  it('omenofdeath：爆破骷髅 → 敌方队首吃 1 点法术伤害（炸毁骷髅口径）', () => {
    const foe = makeChar(4);
    const { initial } = buildEngine(
      buildBoard8({ pos: { row: 2, col: 2 }, gem: skullGem() }),
      [makeChar(0, { traitIds: ['omenofdeath'] }), makeChar(1)],
      [foe, makeChar(5)],
    );
    expect(foe.hp).toBe(49);
    const hits = initial.filter((e) => e.type === 'skill-damage') as Array<{ type: string; targetId: number; damage: number; skullBurst?: { normal: number } }>;
    expect(hits.some((e) => e.targetId === 4 && e.damage === 1 && e.skullBurst?.normal === 1)).toBe(true);
  });

  it('护栏：盘面无候选色时零事件、零随机消耗（与无特质构造逐字节一致）', () => {
    const a = buildEngine(
      buildBoard8(),
      [makeChar(0, { traitIds: ['omenofdark'] }), makeChar(1)],
      [makeChar(4), makeChar(5)],
    );
    const b = buildEngine(
      buildBoard8(),
      [makeChar(0), makeChar(1)],
      [makeChar(4), makeChar(5)],
    );
    expect(a.rng.getState()).toBe(b.rng.getState());
    expect(a.initial).toEqual(b.initial);
  });
});

// ============================================================
// 4. 法力操作免疫（reduce 原语入口）
// ============================================================

/** 最小 EffectContext：reduce 原语只读 state/casterId/rng/nextGemId */
function makeCtx(state: GameState, casterId: number): EffectContext {
  const rng = new SeededRNG(1);
  let n = 900;
  return { state, casterId, rng, nextGemId: () => ++n };
}

function makeCtxState(): GameState {
  return createGameState(
    buildBoard8(),
    makeTeam(PlayerSide.Left, [makeChar(0), makeChar(1)]),
    makeTeam(PlayerSide.Right, [makeChar(4), makeChar(5)]),
  );
}

describe('manashield：对法力灼烧、法力耗尽和法力窃取免疫', () => {
  it('耗蓝：免疫目标法力不动、零事件；无特质目标正常被耗', () => {
    const state = makeCtxState();
    const shielded = makeChar(4, { traitIds: ['manashield'], mana: 12 });
    attachPassives(shielded);
    const drain = reduceEffect({ targets: [shielded], stat: 'mana', scaling: constantScaling(5) });
    expect(drain.apply(makeCtx(state, 0))).toEqual([]);
    expect(shielded.mana).toBe(12);

    const normal = makeChar(5, { mana: 12 });
    attachPassives(normal);
    const drained = reduceEffect({ targets: [normal], stat: 'mana', scaling: constantScaling(5) });
    expect(drained.apply(makeCtx(state, 0))).toEqual([
      { type: 'buff', targetId: 5, stat: 'mana', amount: -5 },
    ]);
    expect(normal.mana).toBe(7);
  });

  it('耗尽（drainAll）：免疫目标法力分毫不动', () => {
    const state = makeCtxState();
    const shielded = makeChar(4, { traitIds: ['manashield'], mana: 12 });
    attachPassives(shielded);
    const events = reduceEffect({ targets: [shielded], stat: 'mana', scaling: constantScaling(0), drainAll: true })
      .apply(makeCtx(state, 0));
    expect(events).toEqual([]);
    expect(shielded.mana).toBe(12);
  });

  it('窃取（stat=mana + gainStat）：免疫目标不被抽、窃取者也不因此进账；同批普通目标照常', () => {
    const state = makeCtxState();
    const shielded = makeChar(4, { traitIds: ['manashield'], mana: 12 });
    const normal = makeChar(5, { mana: 12 });
    attachPassives(shielded);
    attachPassives(normal);
    const caster = makeChar(0);
    state.teams[PlayerSide.Left].characters[0] = caster;
    const events = reduceEffect({
      targets: [shielded, normal], stat: 'mana', scaling: constantScaling(4), gainStat: 'attack',
    }).apply(makeCtx(state, 0));
    expect(shielded.mana).toBe(12);
    expect(events).toEqual([
      { type: 'buff', targetId: 5, stat: 'mana', amount: -4 },
      { type: 'buff', targetId: 0, stat: 'attack', amount: 4 },
    ]);
    expect(normal.mana).toBe(8);
    expect(caster.attack).toBe(9);
  });

  it('法力灼烧状态（mana-burn）施加被免疫拦截；无特质目标正常施加', () => {
    const shielded = makeChar(4, { traitIds: ['manashield'] });
    attachPassives(shielded);
    expect(applyStatus(shielded, { id: 'mana-burn', turns: 2 })).toEqual([]);
    expect(shielded.statuses).toHaveLength(0);

    const normal = makeChar(5);
    attachPassives(normal);
    const events = applyStatus(normal, { id: 'mana-burn', turns: 2 });
    expect(events).toEqual([{ type: 'status-apply', targetId: 5, statusId: 'mana-burn', turns: 2 }]);
    expect(normal.statuses).toContainEqual({ id: 'mana-burn', turns: 2 });
  });

  it('免疫只限法力操作：护甲削减不受 manashield 影响', () => {
    const state = makeCtxState();
    const shielded = makeChar(4, { traitIds: ['manashield'], armor: 10 });
    attachPassives(shielded);
    const events = reduceEffect({ targets: [shielded], stat: 'armor', scaling: constantScaling(5) })
      .apply(makeCtx(state, 0));
    expect(events).toEqual([{ type: 'buff', targetId: 4, stat: 'armor', amount: -5 }]);
    expect(shielded.armor).toBe(5);
  });
});
