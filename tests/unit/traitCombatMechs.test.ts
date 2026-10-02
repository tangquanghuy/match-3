/**
 * 战斗机制批测试（jinx / leader 族 / indigestible / goodtarot+badtarot，7 code）：
 *   1. jinx——「将敌人的宝石灵力减半。」（官方 Halve enemy Gem Masteries）：本引擎以
 *      匹配宝石产出的法力作为 Masteries 落地模型，敌方队伍宝石法力 ×0.5
 *      （TurnEngine 构造期快照，开局生效全场持续，distributeGemMana 抑制点）；
 *   2. leader/general/goblord——位次条件光环（positionAura：front=编队首位 / last=末位），
 *      进入位次一次性补授（战斗开始 + 每次行动开始，granted 集合防重复）；
 *   3. indigestible——「对吞噬免疫。」（官方 Immunity to Devour）：引擎尚无吞噬机制，
 *      devourImmunity 数据字段编译进 passive（吞噬机制落地时消费）；
 *   4. goodtarot/badtarot——施法随机状态（onAllyCastRandomStatus）：盟友施法时
 *      随机盟友吃正面池 / 随机敌人吃负面池（池与 skills/effects/status.ts 的
 *      RANDOM_*_STATUS_POOL 同源，施法响应区 applyCastRandomStatusTriggers 结算）。
 *
 * 护栏：全部新消费点都要求「持有者带新键 + 对应注入」，缺一即整块跳过——
 * 无新键特质零事件、零随机消耗（与 T4/T5 前几批同一护栏口径）。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives, neutralPassives, getTrait, attachPassives,
  applyCastRandomStatusTriggers, applyPositionAuras,
} from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem } from '@engine/types';
import type { Character, Team, StatusInstance } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { TraitDefinition } from '@engine/traits';

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

/** 概率判定的记录型 rng：先返回预设值，之后恒返回 1（保证不会二次命中） */
function rngOf(values: number[], calls: number[] = []): { next(): number } {
  return { next: () => { const v = values.length > 0 ? values.shift()! : 1; calls.push(v); return v; } };
}

// ============================================================
// 编译正确性（数据 → resolvePassives 产物）
// ============================================================

describe('编译正确性（新键 → 定义/resolvePassives 产物）', () => {
  it('jinx：敌方宝石灵力减半（enemyMasteryMult 0.5，多条并存取最强抑制）', () => {
    expect(getTrait('jinx')?.enemyMasteryMult).toBe(0.5);
    expect(getTrait('jinx')?.troops).toBe(24);
    expect(neutralPassives().enemyMasteryMult).toBe(1);
    expect(resolvePassives(['jinx']).enemyMasteryMult).toBe(0.5);
    expect(resolvePassives(['jinx', 'jinx']).enemyMasteryMult).toBe(0.5);
    expect(resolvePassives(['armored']).enemyMasteryMult).toBe(1);
  });

  it('leader/general/goblord：位次条件光环（positionAura，front/last + 全部技能值/单属性）', () => {
    expect(getTrait('leader')?.positionAura).toEqual({
      position: 'front', gains: { hp: 3, armor: 3, attack: 3, magic: 3 },
    });
    expect(getTrait('general')?.positionAura).toEqual({
      position: 'last', gains: { hp: 3, armor: 3, attack: 3, magic: 3 },
    });
    expect(getTrait('goblord')?.positionAura).toEqual({ position: 'last', gains: { hp: 20 } });
    expect(getTrait('leader')?.troops).toBe(15);
    // 定义直读键：不进 passive（与 teamAura 同口径）
    expect(resolvePassives(['leader'])).toEqual(neutralPassives());
  });

  it('indigestible：吞噬免疫（devourImmunity 数据字段编译进 passive）', () => {
    expect(getTrait('indigestible')?.devourImmunity).toBe(true);
    expect(getTrait('indigestible')?.troops).toBe(18);
    expect(neutralPassives().devourImmunity).toBe(false);
    expect(resolvePassives(['indigestible']).devourImmunity).toBe(true);
    for (const code of ['impervious', 'fortitude', 'invulnerable']) {
      expect(getTrait(code)?.devourImmunity).toBe(true);
      expect(resolvePassives([code]).devourImmunity).toBe(true);
    }
  });

  it('goodtarot/badtarot：施法随机状态（randomAlly / randomEnemy，官方目标反向已按 EN 修正）', () => {
    expect(getTrait('goodtarot')?.onAllyCastRandomStatus).toEqual({ scope: 'randomAlly' });
    expect(getTrait('goodtarot')?.troops).toBe(17);
    expect(getTrait('badtarot')?.onAllyCastRandomStatus).toEqual({ scope: 'randomEnemy' });
    expect(getTrait('badtarot')?.troops).toBe(6);
    // 同类取先声明的一条
    expect(resolvePassives(['goodtarot', 'badtarot']).castRandomStatus).toEqual({ scope: 'randomAlly' });
    expect(resolvePassives(['badtarot']).castRandomStatus).toEqual({ scope: 'randomEnemy' });
  });

  it('新键编译后与中性被动有差异且编译为纯函数', () => {
    const codes = ['jinx', 'indigestible', 'goodtarot', 'badtarot'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });

  it('覆盖兜底：官方 dump 中五个 code 的兵种次数与 traits.json 一致（80 次）', () => {
    const codes: [string, number][] = [
      ['jinx', 24], ['leader', 15], ['indigestible', 18], ['goodtarot', 17], ['badtarot', 6],
    ];
    for (const [code, troops] of codes) {
      expect((getTrait(code) as TraitDefinition).troops).toBe(troops);
    }
  });
});

// ============================================================
// applyPositionAuras 纯函数层（leader/general/goblord）
// ============================================================

describe('applyPositionAuras：位次条件光环', () => {
  it('front：编队首位补授四项各 3（hp 连带抬上限），buff 事件齐全', () => {
    const hero = makeChar(0, { traitIds: ['leader'] });
    attachPassives(hero);
    const granted = new Set<number>();
    const events = applyPositionAuras([[hero, makeChar(1)]], granted);
    expect(hero.maxHp).toBe(53);
    expect(hero.hp).toBe(53);
    expect(hero.armor).toBe(3);
    expect(hero.attack).toBe(8);
    expect(hero.magic).toBe(11);
    expect(events).toEqual([
      { type: 'buff', source: 'trait', targetId: 0, stat: 'hp', amount: 3 },
      { type: 'buff', source: 'trait', targetId: 0, stat: 'armor', amount: 3 },
      { type: 'buff', source: 'trait', targetId: 0, stat: 'attack', amount: 3 },
      { type: 'buff', source: 'trait', targetId: 0, stat: 'magic', amount: 3 },
    ]);
    // 第二次调用不重复授出（granted 防重复）
    expect(applyPositionAuras([[hero, makeChar(1)]], granted)).toEqual([]);
    expect(hero.magic).toBe(11);
  });

  it('非首位持有者不授；首位离场后（前移到 [0]）下次结算补授', () => {
    const hero = makeChar(1, { traitIds: ['leader'] });
    const front = makeChar(0);
    const granted = new Set<number>();
    applyPositionAuras([[front, hero]], granted);
    expect(hero.magic).toBe(8); // 未在首位，不授也不占资格
    expect(granted.has(hero.id)).toBe(false);
    // 首位阵亡移出编队 → hero 前移到 [0]，下次行动开始补授
    applyPositionAuras([[hero]], granted);
    expect(hero.magic).toBe(11);
    expect(granted.has(hero.id)).toBe(true);
  });

  it('last：末位持有者授出（general）；首位非持有者不受影响；阵亡者跳过', () => {
    const tail = makeChar(9, { traitIds: ['general'] });
    const granted = new Set<number>();
    applyPositionAuras([[makeChar(8), tail]], granted);
    expect(tail.magic).toBe(11);
    // 阵亡的首位/末位不结算
    const dead = makeChar(7, { traitIds: ['general'], defeated: true });
    applyPositionAuras([[dead, makeChar(8)]], granted);
    expect(dead.magic).toBe(8);
  });

  it('单人队 front 与 last 同一人：只授一次', () => {
    const solo = makeChar(0, { traitIds: ['leader', 'general'] });
    const granted = new Set<number>();
    applyPositionAuras([[solo]], granted);
    // leader + general 各自授一次（两条特质并存），但不因同一人占两个位次而翻倍
    expect(solo.magic).toBe(8 + 3 + 3);
    expect(applyPositionAuras([[solo]], granted)).toEqual([]);
  });

  it('无位次光环的队伍零事件', () => {
    const granted = new Set<number>();
    expect(applyPositionAuras([[makeChar(0), makeChar(1)]], granted)).toEqual([]);
  });
});

// ============================================================
// applyCastRandomStatusTriggers 纯函数层（goodtarot/badtarot）
// ============================================================

describe('applyCastRandomStatusTriggers：施法随机状态', () => {
  /** 施加记录器 */
  function recorder(log: [number, string, number][]) {
    return (char: Character, status: StatusInstance): GameEvent[] => {
      log.push([char.id, status.id, status.turns]);
      return [{ type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns }];
    };
  }
  const poolOf = (scope: 'randomAlly' | 'randomEnemy') =>
    scope === 'randomAlly' ? ['barrier', 'rage', 'submerged'] : ['poison', 'curse'];

  it('goodtarot：盟友施法 → 随机盟友吃正面池一条（目标/掷签各耗一次 rng，回合 3）', () => {
    const holder = makeChar(0, { traitIds: ['goodtarot'] });
    attachPassives(holder);
    const allies = [holder, makeChar(1)];
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    // 目标 floor(0.9*2)=1 → C1；状态 floor(0.9*3)=2 → submerged
    const events = applyCastRandomStatusTriggers(allies, [makeChar(4)], {
      rng: rngOf([0.9, 0.9], calls),
      applyStatus: recorder(log),
      poolOf,
    });
    expect(log).toEqual([[1, 'submerged', 3]]);
    expect(calls).toEqual([0.9, 0.9]);
    expect(events).toHaveLength(1);
  });

  it('badtarot：盟友施法 → 随机敌人吃负面池一条（官方 EN 目标=Enemy，zh 机翻已修正）', () => {
    const holder = makeChar(0, { traitIds: ['badtarot'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    // 目标 floor(0.2*2)=0 → C4；状态 floor(0.2*2)=0 → poison
    applyCastRandomStatusTriggers([holder, makeChar(1)], [makeChar(4), makeChar(5)], {
      rng: rngOf([0.2, 0.2], calls),
      applyStatus: recorder(log),
      poolOf,
    });
    expect(log).toEqual([[4, 'poison', 3]]);
    expect(calls).toEqual([0.2, 0.2]);
  });

  it('持有者阵亡不触发；施法者自己也算盟友（与官方一致）', () => {
    const dead = makeChar(0, { traitIds: ['goodtarot'], defeated: true });
    attachPassives(dead);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    applyCastRandomStatusTriggers([dead, makeChar(1)], [makeChar(4)], {
      rng: rngOf([], calls), applyStatus: recorder(log), poolOf,
    });
    expect(log).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('护栏：缺 rng/施加口/池任一注入 → 零事件零随机消耗；无新键特质同', () => {
    const holder = makeChar(0, { traitIds: ['goodtarot', 'badtarot'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    expect(applyCastRandomStatusTriggers([holder], [makeChar(4)], { rng: rngOf([], calls), applyStatus: recorder(log) })).toEqual([]);
    expect(applyCastRandomStatusTriggers([holder], [makeChar(4)], { rng: rngOf([], calls), poolOf })).toEqual([]);
    expect(applyCastRandomStatusTriggers([holder], [makeChar(4)], { applyStatus: recorder(log), poolOf })).toEqual([]);
    expect(calls).toEqual([]);
    const plain = makeChar(3);
    attachPassives(plain);
    const calls2: number[] = [];
    applyCastRandomStatusTriggers([plain], [makeChar(4)], { rng: rngOf([], calls2), applyStatus: recorder(log), poolOf });
    expect(calls2).toEqual([]);
  });
});

// ============================================================
// TurnEngine 集成（jinx 法力抑制 / leader 位次 / tarot 施法钩）
// ============================================================

/** 底行构造「交换 (7,2)<->(6,2) 后成 4 连红」的局面（复用杂项批的棋盘模式） */
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

describe('TurnEngine 集成：jinx 敌方宝石灵力减半', () => {
  const manaGainOf = (events: GameEvent[], id: number) =>
    events.filter((e) => e.type === 'mana-gain' && (e as { characterId: number }).characterId === id)
      .reduce((s, e) => s + (e as { amount: number }).amount, 0);

  it('无 jinx：4 连红 → 首位红盟友 +4 法力（基线）', () => {
    const hero = makeChar(0);
    const { engine } = buildWith4Red([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(manaGainOf(events, 0)).toBe(4);
    expect(hero.mana).toBe(4);
  });

  it('敌方持有 jinx：同局面首位红盟友只 +2（floor(4×0.5)，宝石灵力减半）', () => {
    const hero = makeChar(0);
    const jinx = makeChar(4, { traitIds: ['jinx'] });
    const { engine } = buildWith4Red([hero, makeChar(1)], [jinx, makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(manaGainOf(events, 0)).toBe(2);
    expect(hero.mana).toBe(2);
  });

  it('己方持有 jinx 不抑制自己：Left 的 jinx 持有者一方照常 +4', () => {
    const hero = makeChar(0);
    const own = makeChar(1, { traitIds: ['jinx'] });
    const { engine } = buildWith4Red([hero, own], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(manaGainOf(events, 0)).toBe(4);
  });

  it('官方 Activation=start_battle：开局快照全场持续，jinx 持有者离场抑制不解除', () => {
    const hero = makeChar(0);
    const jinx = makeChar(4, { traitIds: ['jinx'] });
    const { engine, state } = buildWith4Red([hero, makeChar(1)], [jinx, makeChar(5)]);
    // 模拟阵亡出编队（快照在构造期已生效）
    jinx.defeated = true;
    state.teams[PlayerSide.Right].characters = state.teams[PlayerSide.Right].characters.filter((c) => c.id !== 4);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(manaGainOf(events, 0)).toBe(2);
  });
});

describe('TurnEngine 集成：leader 族位次光环', () => {
  it('战斗开始：首位持有者补授四项各 3（构造期静默，与开局光环同口径）', () => {
    const hero = makeChar(0, { traitIds: ['leader'] });
    buildWith4Red([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    expect(hero.maxHp).toBe(53);
    expect(hero.armor).toBe(3);
    expect(hero.attack).toBe(8);
    expect(hero.magic).toBe(11);
  });

  it('战斗开始时不在首位的持有者不授；首位离场后下次行动开始补授', () => {
    const hero = makeChar(1, { traitIds: ['leader'] });
    const { engine, state } = buildWith4Red([makeChar(0), hero], [makeChar(4), makeChar(5)]);
    expect(hero.magic).toBe(8); // 开局不授
    // 首位阵亡移出编队（队友阵亡由结算管线 splice 出编队）
    state.teams[PlayerSide.Left].characters = state.teams[PlayerSide.Left].characters.filter((c) => c.id !== 0);
    engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(hero.magic).toBe(11);
    expect(hero.armor).toBe(3);
  });

  it('无 leader 的同局面零位次事件（行动开始事件序不含位次 buff）', () => {
    const { engine } = buildWith4Red([makeChar(0), makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    // 4 连红本身可能触发配色/大连路径，但位次光环族的 armor buff 只会来自 leader——
    // 本局面无任何特质，armor+3 事件不应出现
    expect(events.some((e) => e.type === 'buff' && (e as { stat: string }).stat === 'armor' && (e as { amount: number }).amount === 3)).toBe(false);
  });
});

describe('TurnEngine 集成：goodtarot / badtarot 施法随机状态', () => {
  /** 无匹配的满盘棋盘（施法不动棋盘，避免死局重排干扰断言） */
  function buildCast(playerChars: Character[], enemyChars: Character[], seed = 11) {
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    const rng = new SeededRNG(seed);
    const idGen = (() => { let n = 700; return () => ++n; })();
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, playerChars),
      makeTeam(PlayerSide.Right, enemyChars),
    );
    return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
  }

  // Official status-list positives (L2-random-status-pools; Enrage via its canonical id only)
  const POSITIVE_POOL = ['barrier', 'blessed', 'enchanted', 'enraged', 'reflect', 'submerged'];

  it('goodtarot：施法时一名随机盟友获得正面池状态（回合 3）', () => {
    const tarot = makeChar(0, { traitIds: ['goodtarot'] });
    const caster = makeChar(1, { mana: 20 });
    const { engine, state } = buildCast([tarot, caster], [makeChar(4), makeChar(5)]);
    const events = engine.castSkill(1);
    expect(events.some((e) => e.type === 'skill-cast')).toBe(true);
    const applied = state.teams[PlayerSide.Left].characters
      .flatMap((c) => c.statuses.map((s) => ({ id: c.id, statusId: s.id, turns: s.turns })));
    expect(applied).toHaveLength(1);
    expect(POSITIVE_POOL).toContain(applied[0].statusId);
    expect(applied[0].turns).toBe(3);
    expect(applied[0].id).not.toBe(4); // 目标必为施法方盟友
  });

  it('badtarot：施法时一名随机敌人获得负面池状态（官方 EN 目标=Enemy）', () => {
    const tarot = makeChar(0, { traitIds: ['badtarot'] });
    const caster = makeChar(1, { mana: 20 });
    const { engine, state } = buildCast([tarot, caster], [makeChar(4), makeChar(5)]);
    engine.castSkill(1);
    const applied = state.teams[PlayerSide.Right].characters.flatMap((c) => c.statuses);
    expect(applied).toHaveLength(1);
    expect(state.teams[PlayerSide.Left].characters.every((c) => c.statuses.length === 0)).toBe(true);
  });

  it('无 tarot 特质：施法不产生任何状态（旧路径零事件）', () => {
    const caster = makeChar(1, { mana: 20 });
    const { engine, state } = buildCast([makeChar(0), caster], [makeChar(4), makeChar(5)]);
    engine.castSkill(1);
    expect([...state.teams[PlayerSide.Left].characters, ...state.teams[PlayerSide.Right].characters]
      .every((c) => c.statuses.length === 0)).toBe(true);
  });

  it('确定性：同种子两次对局施加的目标与状态一致', () => {
    const run = () => {
      const tarot = makeChar(0, { traitIds: ['goodtarot'] });
      const caster = makeChar(1, { mana: 20 });
      const { engine, state } = buildCast([tarot, caster], [makeChar(4), makeChar(5)], 23);
      engine.castSkill(1);
      return state.teams[PlayerSide.Left].characters
        .flatMap((c) => c.statuses.map((s) => `${c.id}:${s.id}`)).join(',');
    };
    expect(run()).toBe(run());
  });
});
