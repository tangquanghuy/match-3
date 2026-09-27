/**
 * T5 杂项机制批测试（配对转换/召唤/风暴/首位敌人/随机负面池/即杀/配色伤害，11 code）：
 *   1. 配对转换——trascend「配对 4/5 将 2 点生命值替换成 2 点魔力值」（onBigMatchConvert）；
 *   2. 配对召唤——genieslamp 30% 神灯之灵 / stormflock 35% 鸟妖法师（onBigMatchSummon，
 *      复用死亡召唤基建 applyDeathSummons：概率走种子化 rng、入队走容量/FIFO 规则）；
 *   3. 配对风暴——deadlywaters「创造骸骨风暴」（onBigMatchStorm，走全局唯一顶替裁定）；
 *   4. 首位敌人——dragonvines「缠绕第一名敌人」（onBigMatchStatus scope firstEnemy，确定性零随机）；
 *   5. 随机负面池——experiment「使随机一名敌人陷入一个随机的状态效果」（randomNegative，
 *      池与引擎 RANDOM_NEGATIVE_STATUS_POOL 同源，rng 掷一条）；
 *   6. 配对即杀——deathbelow「8% 猎杀最后一名敌人」（onBigMatchKill，defeat 出编队同口径）；
 *   7. 配色伤害——lumpofcoal/dawnslayer/sleetstorm「配对某色→对随机敌人造成 N 点伤害」
 *      （onColorMatchDamage，配色触发点 applyColorMatchTriggers 的 damage 注入口）。
 *
 * 护栏：全部新消费点都要求「持有者带新键 + 对应回调注入」，缺一即整块跳过——
 * 无新键特质零事件、零随机消耗（与 T4/T5 前几批同一护栏口径）。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives, neutralPassives, getTrait, attachPassives,
  applyBigMatchTriggers, applyColorMatchTriggers,
} from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem } from '@engine/types';
import type { Character, Team, StatusInstance, StormSummon } from '@engine/types';
import type { GameEvent } from '@engine/events';

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
  it('trascend：配对 4/5 时 2 生命换 2 魔法（onBigMatchConvert，minSize 缺省 4）', () => {
    expect(getTrait('trascend')?.onBigMatchConvert).toEqual({ from: 'hp', to: 'magic', amount: 2 });
    expect(getTrait('trascend')?.troops).toBe(4);
    expect(resolvePassives(['trascend']).onBigMatchConvert).toEqual({ from: 'hp', to: 'magic', amount: 2, minSize: 4 });
  });

  it('genieslamp/stormflock：配对召唤 30%/35%（onBigMatchSummon，troopId 由生成器预解析）', () => {
    expect(getTrait('genieslamp')?.onBigMatchSummon).toEqual({
      chance: 0.3, troopId: 6157, referenceName: 'Djinn', displayName: '神灯之灵',
    });
    expect(getTrait('stormflock')?.onBigMatchSummon).toEqual({
      chance: 0.35, troopId: 6754, referenceName: 'HarpyMage', displayName: '鸟妖法师',
    });
    // 同字段取概率更高的一条（与 summonOnDeath 编译同口径）
    expect(resolvePassives(['genieslamp', 'stormflock']).bigMatchSummon?.chance).toBe(0.35);
  });

  it('deadlywaters：配对 4/5 创造骸骨风暴（onBigMatchStorm，dropKind skull + 虚拟号段）', () => {
    expect(getTrait('deadlywaters')?.onBigMatchStorm).toEqual({
      color: 'Brown', turns: 8, troopId: 9007, referenceName: 'Bonestorm', displayName: '骸骨风暴', dropKind: 'skull',
    });
    expect(resolvePassives(['deadlywaters']).bigMatchStorm?.dropKind).toBe('skull');
  });

  it('dragonvines：缠绕第一名敌人（onBigMatchStatus scope firstEnemy，确定性）', () => {
    expect(getTrait('dragonvines')?.onBigMatchStatus).toEqual({ scope: 'firstEnemy', statuses: [{ id: 'entangle' }], turns: 3 });
    expect(getTrait('dragonvines')?.troops).toBe(1);
  });

  it('experiment：随机负面池（randomNegative，池与引擎 RANDOM_NEGATIVE_STATUS_POOL 同序同源）', async () => {
    const trait = getTrait('experiment')?.onBigMatchStatus;
    expect(trait?.scope).toBe('randomEnemy');
    expect(trait?.randomNegative).toBe(true);
    expect(trait?.statuses).toHaveLength(15); // official status list negatives (L2-random-status-pools)
    expect(trait?.statuses?.[0]).toEqual({ id: 'poison', magnitude: 1 });
    // DoT 带 magnitude，其余不带（与全局施加口径一致）
    expect(trait?.statuses?.find((s) => s.id === 'death-mark')).toEqual({ id: 'death-mark' });
    const { RANDOM_NEGATIVE_STATUS_POOL } = await import('@engine/skills/effects/status');
    expect(trait?.statuses?.map((s) => s.id)).toEqual([...RANDOM_NEGATIVE_STATUS_POOL]);
  });

  it('deathbelow：8% 猎杀最后一名敌人（onBigMatchKill）', () => {
    expect(getTrait('deathbelow')?.onBigMatchKill).toEqual({ chance: 0.08, scope: 'lastEnemy' });
    expect(resolvePassives(['deathbelow']).bigMatchKill).toEqual({ chance: 0.08, scope: 'lastEnemy', minSize: 4 });
  });

  it('lumpofcoal/dawnslayer/sleetstorm：配对某色→随机敌人伤害（onColorMatchDamage 同色累加）', () => {
    expect(getTrait('lumpofcoal')?.onColorMatchDamage).toEqual({ color: 'Red', amount: 5 });
    expect(getTrait('dawnslayer')?.onColorMatchDamage).toEqual({ color: 'Yellow', amount: 12 });
    expect(getTrait('sleetstorm')?.onColorMatchDamage).toEqual({ color: 'Blue', amount: 12 });
    // 缺口清扫批：编译产物带 scope（缺省 randomEnemy 语义不变），spiny/spiky 另有 allEnemies
    expect(resolvePassives(['lumpofcoal']).colorMatchDamage).toEqual({ Red: { amount: 5, scope: 'randomEnemy' } });
  });

  it('新键编译后与中性被动有差异且编译为纯函数', () => {
    const codes = ['trascend', 'genieslamp', 'deadlywaters', 'dragonvines', 'experiment', 'deathbelow', 'lumpofcoal'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// applyBigMatchTriggers 纯函数层
// ============================================================

describe('applyBigMatchTriggers：配对转换（trascend）', () => {
  it('生命 10 → 扣 2 加魔法 2（buff 事件 hp -2 / magic +2）', () => {
    const holder = makeChar(0, { traitIds: ['trascend'], hp: 10, magic: 8 });
    attachPassives(holder);
    const events = applyBigMatchTriggers([holder], { size: 4 });
    expect(holder.hp).toBe(8);
    expect(holder.magic).toBe(10);
    expect(events).toContainEqual({ type: 'buff', source: 'trait', targetId: 0, stat: 'hp', amount: -2 });
    expect(events).toContainEqual({ type: 'buff', source: 'trait', targetId: 0, stat: 'magic', amount: 2 });
  });

  it('生命不足时保底 1 点：hp=2 只换 1 点（特质不自杀）', () => {
    const holder = makeChar(0, { traitIds: ['trascend'], hp: 2 });
    attachPassives(holder);
    applyBigMatchTriggers([holder], { size: 5 });
    expect(holder.hp).toBe(1);
    expect(holder.magic).toBe(9);
    expect(holder.defeated).toBe(false);
  });

  it('minSize 缺省 4：3 连不触发', () => {
    const holder = makeChar(0, { traitIds: ['trascend'], hp: 10 });
    attachPassives(holder);
    const events = applyBigMatchTriggers([holder], { size: 3 });
    expect(events).toEqual([]);
    expect(holder.hp).toBe(10);
  });

  it('织网期间魔法增益被拦截（grantStat 既有口径）：生命照扣、魔法不加', () => {
    const holder = makeChar(0, { traitIds: ['trascend'], hp: 10, statuses: [{ id: 'web', turns: 2 }] });
    attachPassives(holder);
    const events = applyBigMatchTriggers([holder], { size: 4 });
    expect(holder.hp).toBe(8);
    expect(holder.magic).toBe(8);
    expect(events).toContainEqual({ type: 'buff', source: 'trait', targetId: 0, stat: 'hp', amount: -2 });
    expect(events.find((e) => e.type === 'buff' && (e as { stat: string }).stat === 'magic')).toBeUndefined();
  });

  it('阵亡持有者不触发；无新键特质零事件', () => {
    const dead = makeChar(0, { traitIds: ['trascend'], defeated: true });
    attachPassives(dead);
    expect(applyBigMatchTriggers([dead], { size: 4 })).toEqual([]);
    const plain = makeChar(1, { hp: 10 });
    attachPassives(plain);
    expect(applyBigMatchTriggers([plain], { size: 4 })).toEqual([]);
  });
});

describe('applyBigMatchTriggers：配对召唤（genieslamp/stormflock）', () => {
  it('概率命中 → 召唤口收到预解析 spec（genieslamp 30%，rng < 0.3）', () => {
    const holder = makeChar(0, { traitIds: ['genieslamp'] });
    attachPassives(holder);
    const seen: { chance: number; troopId: number; referenceName: string; displayName: string }[] = [];
    const calls: number[] = [];
    const events = applyBigMatchTriggers([holder], {
      size: 4,
      rng: rngOf([0.2], calls),
      summon: (spec) => { seen.push(spec); return [{ type: 'summon' } as unknown as GameEvent]; },
    });
    expect(seen).toEqual([{ chance: 0.3, troopId: 6157, referenceName: 'Djinn', displayName: '神灯之灵', minSize: 4 }]);
    expect(events).toHaveLength(1);
    expect(calls).toEqual([0.2]); // 恰好掷一次
  });

  it('概率未命中 → 不召唤仍占一次随机数；阵亡持有者不掷', () => {
    const holder = makeChar(0, { traitIds: ['genieslamp'] });
    attachPassives(holder);
    const seen: unknown[] = [];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], { size: 4, rng: rngOf([0.9], calls), summon: (s) => { seen.push(s); return []; } });
    expect(seen).toEqual([]);
    expect(calls).toEqual([0.9]);

    const dead = makeChar(1, { traitIds: ['stormflock'], defeated: true });
    attachPassives(dead);
    const calls2: number[] = [];
    applyBigMatchTriggers([dead], { size: 4, rng: rngOf([], calls2), summon: () => [] });
    expect(calls2).toEqual([]);
  });

  it('护栏：无 summon 注入时不掷随机数、零事件（纯逻辑环境）', () => {
    const holder = makeChar(0, { traitIds: ['genieslamp', 'stormflock'] });
    attachPassives(holder);
    const calls: number[] = [];
    const events = applyBigMatchTriggers([holder], { size: 4, rng: rngOf([], calls) });
    expect(events).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('applyBigMatchTriggers：配对风暴（deadlywaters）', () => {
  it('必发不掷随机数：风暴口收到骸骨风暴载荷（Brown + dropKind skull + 虚拟号段）', () => {
    const holder = makeChar(0, { traitIds: ['deadlywaters'] });
    attachPassives(holder);
    const seen: { storm: StormSummon; troopId: number }[] = [];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], {
      size: 5,
      rng: rngOf([], calls),
      setStorm: (storm, troopId) => { seen.push({ storm, troopId }); return []; },
    });
    expect(seen).toEqual([{ storm: { color: 'Brown', turns: 8, dropKind: 'skull' }, troopId: 9007 }]);
    expect(calls).toEqual([]);
  });

  it('护栏：无 setStorm 注入时零事件零随机消耗', () => {
    const holder = makeChar(0, { traitIds: ['deadlywaters'] });
    attachPassives(holder);
    const calls: number[] = [];
    expect(applyBigMatchTriggers([holder], { size: 4, rng: rngOf([], calls) })).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('applyBigMatchTriggers：配对即杀（deathbelow）', () => {
  it('概率命中 → 处决口收到敌方队伍序最后一名存活', () => {
    const holder = makeChar(0, { traitIds: ['deathbelow'] });
    attachPassives(holder);
    const last = makeChar(6);
    const foes = [makeChar(4), makeChar(5, { defeated: true }), last];
    const killed: number[] = [];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], {
      size: 4,
      enemyTeam: foes,
      rng: rngOf([0.07], calls),
      kill: (t) => { killed.push(t.id); return []; },
    });
    expect(killed).toEqual([6]); // 跳过阵亡者取末位存活
    expect(calls).toEqual([0.07]);
  });

  it('概率未命中占一次随机数；无 rng/无 kill 注入均不生效', () => {
    const holder = makeChar(0, { traitIds: ['deathbelow'] });
    attachPassives(holder);
    const killed: number[] = [];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], {
      size: 4, enemyTeam: [makeChar(4)],
      rng: rngOf([0.5], calls), kill: (t) => { killed.push(t.id); return []; },
    });
    expect(killed).toEqual([]);
    expect(calls).toEqual([0.5]);

    const calls2: number[] = [];
    applyBigMatchTriggers([holder], { size: 4, enemyTeam: [makeChar(4)], rng: rngOf([], calls2) });
    expect(calls2).toEqual([]); // 无 kill 注入 → 不掷
    applyBigMatchTriggers([holder], { size: 4, enemyTeam: [makeChar(4)], kill: () => [] });
  });
});

describe('applyBigMatchTriggers：首位敌人（dragonvines）/ 随机负面池（experiment）', () => {
  /** 施加记录器 */
  function recorder(log: [number, string][]) {
    return (char: Character, status: StatusInstance): GameEvent[] => {
      log.push([char.id, status.id]);
      return [{ type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns }];
    };
  }

  it('dragonvines：缠绕固定落在队伍序首个存活敌人，不消耗随机数', () => {
    const holder = makeChar(0, { traitIds: ['dragonvines'] });
    attachPassives(holder);
    const log: [number, string][] = [];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], {
      size: 4,
      enemyTeam: [makeChar(4, { defeated: true }), makeChar(5), makeChar(6)],
      rng: rngOf([], calls),
      applyStatus: recorder(log),
    });
    expect(log).toEqual([[5, 'entangle']]); // 首个存活，阵亡者跳过
    expect(calls).toEqual([]);
  });

  it('experiment：rng 两条（选目标 + 池内掷一条），未掷中的状态不施加', () => {
    const holder = makeChar(0, { traitIds: ['experiment'] });
    attachPassives(holder);
    const log: [number, string][] = [];
    const calls: number[] = [];
    // 目标：floor(0.9*2)=1 → 第二名；状态：floor(0.7*15)=10 → death-mark（15 项官方负面池）
    applyBigMatchTriggers([holder], {
      size: 4,
      enemyTeam: [makeChar(4), makeChar(5)],
      rng: rngOf([0.9, 0.7], calls),
      applyStatus: recorder(log),
    });
    expect(log).toEqual([[5, 'death-mark']]);
    expect(calls).toEqual([0.9, 0.7]);
  });

  it('experiment：无 rng 时整条跳过（概率性语义不退化为必发全池）', () => {
    const holder = makeChar(0, { traitIds: ['experiment'] });
    attachPassives(holder);
    const log: [number, string][] = [];
    applyBigMatchTriggers([holder], {
      size: 4,
      enemyTeam: [makeChar(4)],
      applyStatus: recorder(log),
    });
    expect(log).toEqual([]);
  });
});

// ============================================================
// applyColorMatchTriggers：配色伤害（lumpofcoal/dawnslayer/sleetstorm）
// ============================================================

describe('applyColorMatchTriggers：配色伤害', () => {
  it('lumpofcoal：配对红色时对随机一名敌人造成 5 点伤害（rng 选目标）', () => {
    const holder = makeChar(0, { traitIds: ['lumpofcoal'] });
    attachPassives(holder);
    const hits: [number, number][] = [];
    const calls: number[] = [];
    applyColorMatchTriggers([holder], BaseColor.Red, {
      enemyTeam: [makeChar(4), makeChar(5)],
      rng: rngOf([0.9], calls),
      damage: (t, caster, amount) => { hits.push([t.id, amount]); void caster; return []; },
    });
    expect(hits).toEqual([[5, 5]]); // floor(0.9*2)=1 → 第二名敌人
    expect(calls).toEqual([0.9]);
  });

  it('非对应颜色不触发；无 damage 注入零事件零随机消耗', () => {
    const holder = makeChar(0, { traitIds: ['lumpofcoal'] });
    attachPassives(holder);
    const hits: [number, number][] = [];
    applyColorMatchTriggers([holder], BaseColor.Blue, {
      enemyTeam: [makeChar(4)],
      rng: { next: () => { throw new Error('不应消耗随机数'); } },
      damage: (t, _c, amount) => { hits.push([t.id, amount]); return []; },
    });
    expect(hits).toEqual([]);

    const calls: number[] = [];
    applyColorMatchTriggers([holder], BaseColor.Red, { enemyTeam: [makeChar(4)], rng: rngOf([], calls) });
    expect(calls).toEqual([]);
  });
});

// ============================================================
// TurnEngine 集成（真实交换触发大连/配色钩子）
// ============================================================

/** 底行构造「交换 (7,2)<->(6,2) 后成 4 连红」的局面（复用大连创造批的棋盘模式） */
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

describe('TurnEngine 集成：trascend / deadlywaters / lumpofcoal', () => {
  it('trascend：4 连红 → 持有者 2 生命换 2 魔法（真实交换路径）', () => {
    const hero = makeChar(0, { traitIds: ['trascend'], hp: 10, magic: 8 });
    const { engine } = buildWith4Red([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(hero.hp).toBe(8);
    expect(hero.magic).toBe(10);
    expect(events).toContainEqual({ type: 'buff', source: 'trait', targetId: 0, stat: 'hp', amount: -2 });
    expect(events).toContainEqual({ type: 'buff', source: 'trait', targetId: 0, stat: 'magic', amount: 2 });
  });

  it('deadlywaters：4 连红 → 持有者一方获得骸骨风暴（storm-change + Team.storm）', () => {
    const hero = makeChar(0, { traitIds: ['deadlywaters'] });
    const { engine, state } = buildWith4Red([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const stormEvents = events.filter((e) => e.type === 'storm-change');
    expect(stormEvents).toHaveLength(1);
    const storm = state.teams[PlayerSide.Left].storm!;
    expect(storm.color).toBe(BaseColor.Brown);
    expect(storm.dropKind).toBe('skull');
    expect(storm.troopId).toBe(9007);
    expect(storm.turns).toBeGreaterThanOrEqual(1);
  });

  it('lumpofcoal：4 连红 → 随机一名敌人吃 5 点技能伤害（skill-damage 事件 + 扣血）', () => {
    const hero = makeChar(0, { traitIds: ['lumpofcoal'] });
    const { engine } = buildWith4Red([hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const dmg = events.filter((e) => e.type === 'skill-damage' && (e as { damage: number }).damage === 5);
    expect(dmg).toHaveLength(1);
  });

  it('无新键特质的同局面：零 storm-change、零额外 skill-damage（旧路径不受注入影响）', () => {
    const { engine } = buildWith4Red([makeChar(0), makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.some((e) => e.type === 'storm-change')).toBe(false);
    expect(events.some((e) => e.type === 'skill-damage')).toBe(false);
  });
});
