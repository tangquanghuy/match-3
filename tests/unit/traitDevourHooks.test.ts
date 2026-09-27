/**
 * 自复活/凤凰涅槃 + 吞噬特质钩子 + 复制召唤 回归测试。
 *
 * 自复活（Sunbird「浴火重生」官方 "Deal [Magic + 6] damage randomly split amongst enemies,
 * boosted by my Life. Die and rise from the Ashes."——凤凰涅槃浴火重生）：
 *   - 被动通道 PassiveModifiers.selfRevive：TurnEngine 出编队口（resolveDefeatAfterRevive）
 *     在 resolveDefeatEvents 移除编队前拦截本次伤害致死的 defeat 事件——掷中即不走 defeat
 *     路径（死亡被撤销：不出编队、不发 defeat、死亡扫描不触发阵亡钩子），原位回血复活；
 *   - 段级通道 selfRevive 段：本次施法中施法者被击杀（如反弹反杀）按段规格复活
 *     （healPct 缺省 0.5、full=满血、fullMana=法力回满）。
 *
 * 吞噬特质钩子（R22 批）：devourEffect 原语概率掷签（每目标恒 1 次）、devourImmunity
 * 整体跳过（不杀不成长不耗 rng）、目标当前攻击、护甲与生命（不含魔法；opts.gain 可覆写）。
 *
 * 复制召唤（R22 批 summonCopy）：属性/技能/特质全拷贝（满血、零法力、无状态），
 * 编队满员时召唤失效。
 *
 * 护栏：无新键零事件零 rng、同种子双跑事件流逐字节一致。
 */
import { describe, it, expect } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { resolvePassives, neutralPassives } from '@engine/traits';
import { devourEffect } from '@engine/skills/effects/devour';
import { summonCopyEffect, selfReviveEffect } from '@engine/skills/effects/summon';
import { dmg, selfRevive, summonCopy, skill } from '@engine/skills/builders';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { PlayerSide, BaseColor, colorGem, skullGem, MatchState } from '@engine/types';
import type { Character, Team, StatusInstance } from '@engine/types';
import type { GameEvent } from '@engine/events';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 10,
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

/** 底行骷髅三连对局（与 traitDevour 的 skullMatchBattle 同款）：交换 (7,1)<->(6,1) 后三骷髅命中右方队首 */
function skullMatchBattle(leftChars: Character[], rightChars: Character[], seed: number) {
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
  const state = createGameState(board, makeTeam(PlayerSide.Left, leftChars), makeTeam(PlayerSide.Right, rightChars));
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
}

/** 注入编译被动（TurnEngine 构造期已按 traitIds 编译过，测试在构造后覆写） */
function inject(char: Character, patch: Partial<ReturnType<typeof neutralPassives>>): void {
  char.passive = { ...neutralPassives(), ...patch };
}

/** 脚本化 rng：devourEffect 掷签用（恒返回 v），带调用计数 */
function scriptedRng(v: number): { rng: SeededRNG; calls: () => number } {
  let n = 0;
  const rng = { next: () => { n += 1; return v; } } as unknown as SeededRNG;
  return { rng, calls: () => n };
}

// —— 自复活：被动通道（TurnEngine 出编队口） ——

describe('自复活（selfRevive 被动）：致死伤害不走 defeat 路径、原位回血', () => {
  it('骷髅致死 → 复活到 50% maxHp：无 defeat 事件、不出编队、发 buff(hp)', () => {
    // 扫一个「复活后无连锁再伤」的种子，保证精确数值断言
    let picked: { events: GameEvent[]; state: ReturnType<typeof createGameState> } | null = null;
    for (let seed = 1; seed <= 60 && !picked; seed++) {
      const right = makeChar(4, { hp: 5 });
      const { engine, state } = skullMatchBattle([makeChar(0, { attack: 10 })], [right], seed);
      inject(state.teams[PlayerSide.Right].characters[0], { selfRevive: { healPct: 0.5 } });
      const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      const revived = state.teams[PlayerSide.Right].characters[0];
      if (revived.hp === 25 && !revived.defeated) picked = { events, state };
    }
    expect(picked).not.toBeNull();
    const { events, state } = picked!;
    // 死亡被撤销：defeat 事件从事件流剔除，死亡扫描（阵亡钩子）不触发
    expect(events.some((e) => e.type === 'defeat')).toBe(false);
    expect(events.some((e) => e.type === 'game-over')).toBe(false);
    // 复活：原位回血到 ceil(50 × 0.5) = 25，发 buff(hp) 事件
    expect(events.some((e) => e.type === 'buff' && (e as { targetId: number; stat: string; amount: number }).targetId === 4
      && (e as { stat: string }).stat === 'hp' && (e as { amount: number }).amount === 25)).toBe(true);
    const revived = state.teams[PlayerSide.Right].characters[0];
    expect(revived.id).toBe(4);
    expect(revived.defeated).toBe(false);
    expect(revived.hp).toBe(25);
  });

  it('复活阻止全灭判负：单挑对局复活后游戏继续', () => {
    const right = makeChar(4, { hp: 5 });
    const { engine, state } = skullMatchBattle([makeChar(0, { attack: 10 })], [right], 1);
    inject(state.teams[PlayerSide.Right].characters[0], { selfRevive: { healPct: 0.5 } });
    engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(state.winner).toBeNull();
    expect(state.state).not.toBe(MatchState.GameOver);
    expect(state.teams[PlayerSide.Right].characters.some((c) => c.id === 4 && !c.defeated)).toBe(true);
  });

  it('对照组：无 selfRevive 时同一致死伤害走 defeat 路径（出编队）', () => {
    const { engine, state } = skullMatchBattle(
      [makeChar(0, { attack: 10 })],
      [makeChar(4, { hp: 5 })],
      1,
    );
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(events.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 4)).toBe(true);
    expect(state.teams[PlayerSide.Right].characters.some((c) => c.id === 4)).toBe(false);
  });

  it('chance 掷签失败 → 照常死亡（defeat 出编队）', () => {
    const right = makeChar(4, { hp: 5 });
    const { engine, state } = skullMatchBattle([makeChar(0, { attack: 10 })], [right], 1);
    inject(state.teams[PlayerSide.Right].characters[0], { selfRevive: { chance: 0, healPct: 0.5 } });
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(events.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 4)).toBe(true);
    expect(state.teams[PlayerSide.Right].characters.some((c) => c.id === 4)).toBe(false);
  });

  it('DoT 致死同样复活（回合尾状态结算口）', () => {
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    const poisoned: StatusInstance = { id: 'burning', turns: 2, recoveryChance: 0 };
    const right = makeChar(4, { hp: 2, armor: 0, statuses: [poisoned] });
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [makeChar(0)]),
      makeTeam(PlayerSide.Right, [right]),
    );
    const rng = new SeededRNG(7);
    const idGen = (() => { let n = 800; return () => ++n; })();
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    inject(state.teams[PlayerSide.Right].characters[0], { selfRevive: { healPct: 0.5 } });
    const events = engine.passTurn();
    // passTurn 从左方换边后对右方（即将行动方）结算 DoT：3 点毒伤致死 → 复活
    expect(state.teams[PlayerSide.Right].characters[0].id).toBe(4);
    expect(state.teams[PlayerSide.Right].characters[0].defeated).toBe(false);
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(25);
    expect(events.some((e) => e.type === 'defeat')).toBe(false);
  });

  it('护栏：无 selfRevive 对局事件流与基线逐字节一致（零事件零 rng）', () => {
    const base = skullMatchBattle([makeChar(0, { attack: 10 })], [makeChar(4, { hp: 100 })], 11);
    const baseEvents = base.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const unrelated = skullMatchBattle(
      [makeChar(0, { attack: 10, traitIds: ['fast'] })],
      [makeChar(4, { hp: 100, traitIds: ['sacred'] })],
      11,
    );
    const old = unrelated.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(JSON.stringify(old)).toBe(JSON.stringify(baseEvents));
  });
});

// —— 自复活：段级通道（executePrototype 施法内拦截） ——

describe('selfRevive 段（凤凰涅槃）：施法中被反弹反杀 → 死亡撤销原位复活', () => {
  /** 施法对局：施法者 hp=1，敌方队首带反射（受伤 50% 反弹 ≥1）；魔法 6 → [魔法+4]=10 伤害、反弹 5 点必杀施法者 */
  function castBattle(proto: SkillPrototype, seed: number) {
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    const caster = makeChar(0, { hp: 1, magic: 6, mana: 20, manaCost: 20, skillId: 'combo' });
    const reflector = makeChar(4, { skillId: 'none', mana: 0, statuses: [{ id: 'reflect', turns: 3 }] });
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [caster]),
      makeTeam(PlayerSide.Right, [reflector]),
    );
    const registry = new ExtensionRegistry();
    registry.prototypes.set('combo', proto);
    const engine = new TurnEngine(state, new SeededRNG(seed), (() => { let n = 500000; return () => ++n; })(), registry);
    return { engine, state, caster: state.teams[PlayerSide.Left].characters[0] };
  }

  it('带 selfRevive 段：施法者被反弹击杀 → 复活到 50%、无 defeat 事件', () => {
    const proto = skill(dmg('enemyFront', 4, 1), selfRevive());
    const { engine, state, caster } = castBattle(proto, 5);
    const events = engine.castSkill(0);
    expect(events.some((e) => e.type === 'defeat')).toBe(false);
    expect(caster.defeated).toBe(false);
    expect(caster.hp).toBe(25); // ceil(50 × 0.5)
    expect(state.teams[PlayerSide.Left].characters.some((c) => c.id === 0)).toBe(true);
    expect(events.some((e) => e.type === 'buff' && (e as { targetId: number; stat: string; amount: number }).targetId === 0
      && (e as { stat: string }).stat === 'hp' && (e as { amount: number }).amount === 25)).toBe(true);
  });

  it('full 满血复活 + fullMana 法力回满', () => {
    const proto = skill(dmg('enemyFront', 4, 1), selfRevive(0.5, { full: true, fullMana: true }));
    const { engine, caster } = castBattle(proto, 5);
    const events = engine.castSkill(0);
    expect(caster.defeated).toBe(false);
    expect(caster.hp).toBe(50);
    expect(caster.mana).toBe(20); // 施法扣光 → 复活回满
    expect(events.some((e) => e.type === 'buff' && (e as { targetId: number; stat: string; amount: number }).targetId === 0
      && (e as { stat: string }).stat === 'mana' && (e as { amount: number }).amount === 20)).toBe(true);
  });

  it('对照组：无 selfRevive 段 → 施法者死亡出编队', () => {
    const proto = skill(dmg('enemyFront', 4, 1));
    const { engine, state, caster } = castBattle(proto, 5);
    const events = engine.castSkill(0);
    expect(events.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 0)).toBe(true);
    expect(caster.defeated).toBe(true);
    expect(state.teams[PlayerSide.Left].characters.some((c) => c.id === 0)).toBe(false);
  });
});

// —— 自复活：原语层 ——

describe('selfReviveEffect 原语：死亡态复活、存活无事件', () => {
  it('死亡态目标复活到指定百分比并发 buff(hp)；存活目标零事件', () => {
    const board = new BoardModel();
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [makeChar(0)]),
      makeTeam(PlayerSide.Right, [makeChar(4)]),
    );
    const fallen = makeChar(9, { hp: 0, defeated: true });
    const revivedEvents = selfReviveEffect({ targets: [fallen] }).apply({
      state, casterId: 0, rng: new SeededRNG(1), nextGemId: () => 0,
    });
    expect(fallen.defeated).toBe(false);
    expect(fallen.hp).toBe(25);
    expect(revivedEvents).toEqual([{ type: 'buff', targetId: 9, stat: 'hp', amount: 25 }]);

    const alive = makeChar(8, { hp: 30 });
    expect(selfReviveEffect({ targets: [alive] }).apply({ state, casterId: 0, rng: new SeededRNG(1), nextGemId: () => 0 })).toEqual([]);
    expect(alive.hp).toBe(30);
  });
});

// —— 吞噬特质钩子（devourEffect 原语层精确断言） ——

describe('吞噬特质钩子：概率掷签、免疫拦截、成长额度', () => {
  /** devourEffect 最小 ctx：caster 在左队、目标为独立对象（不走编队移除） */
  function devourCtx(caster: Character, rng: SeededRNG) {
    const state = createGameState(
      new BoardModel(),
      makeTeam(PlayerSide.Left, [caster]),
      makeTeam(PlayerSide.Right, [makeChar(4)]),
    );
    return { state, casterId: caster.id, rng, nextGemId: () => 0 };
  }

  it('掷签命中：目标即杀（skill-damage 归零）+ 吞噬者获得目标当前属性（每目标恒 1 次 rng）', () => {
    const caster = makeChar(0, { hp: 30 });
    const target = makeChar(9, { hp: 10 });
    const { rng, calls } = scriptedRng(0.01);
    const events = devourEffect({ targets: [target], chance: 0.25 }).apply(devourCtx(caster, rng));
    expect(calls()).toBe(1); // 概率在原语内部掷签，恒 1 次/目标
    expect(target.defeated).toBe(true);
    expect(target.hp).toBe(0);
    // 即杀走 damageOne 伤害管线（伤害=有效耐久 10）
    expect(events.some((e) => e.type === 'skill-damage' && (e as { targetId: number; damage: number }).targetId === 9
      && (e as { damage: number }).damage === 10)).toBe(true);
    expect(events.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 9)).toBe(true);
    // 吞噬获取目标当前攻击 10、护甲 0、生命 10，不获取魔法
    expect(caster.attack).toBe(20);
    expect(caster.armor).toBe(0);
    expect(caster.magic).toBe(8);
    expect(caster.hp).toBe(40);
    expect(caster.maxHp).toBe(60);
    for (const stat of ['attack', 'hp'] as const) {
      expect(events.some((e) => e.type === 'buff' && (e as { targetId: number; stat: string }).targetId === 0
        && (e as { stat: string }).stat === stat)).toBe(true);
    }
  });

  it('掷签落空：零事件、目标存活、无成长（rng 恒消耗 1 次保证确定性）', () => {
    const caster = makeChar(0, { hp: 30 });
    const target = makeChar(9, { hp: 10 });
    const { rng, calls } = scriptedRng(0.99);
    const events = devourEffect({ targets: [target], chance: 0.25 }).apply(devourCtx(caster, rng));
    expect(events).toEqual([]);
    expect(target.defeated).toBe(false);
    expect(target.hp).toBe(10);
    expect(caster.attack).toBe(10);
    expect(caster.hp).toBe(30);
    expect(calls()).toBe(1);
  });

  it('devourImmunity 整体拦截：不杀、不成长、不耗 rng', () => {
    const caster = makeChar(0, { hp: 30 });
    const target = makeChar(9, { hp: 10, traitIds: ['indigestible'] });
    target.passive = { ...neutralPassives(), ...resolvePassives(['indigestible']) };
    const { rng, calls } = scriptedRng(0.01);
    const events = devourEffect({ targets: [target], chance: 0.25 }).apply(devourCtx(caster, rng));
    expect(events).toEqual([]);
    expect(target.defeated).toBe(false);
    expect(target.hp).toBe(10);
    expect(caster.attack).toBe(10);
    expect(caster.hp).toBe(30);
    expect(calls()).toBe(0); // 免疫在掷签前跳过
  });

  it('成长额度覆写（opts.gain）：+5 攻、生命 +0 不发事件，其余按目标当前值', () => {
    const caster = makeChar(0, { hp: 30 });
    const target = makeChar(9, { hp: 10 });
    const { rng } = scriptedRng(0.01);
    devourEffect({ targets: [target], chance: 0.25, gain: { attack: 5, hp: 0 } }).apply(devourCtx(caster, rng));
    expect(caster.attack).toBe(15);
    expect(caster.armor).toBe(0);
    expect(caster.magic).toBe(8);
    expect(caster.hp).toBe(30); // hp 增益 0 → 不治疗
  });

  it('TurnEngine 消费（onSkullHitDevour chance=1）：骷髅命中即吞受击目标；免疫目标拦截', () => {
    // 命中：chance=1 必吞 → 目标出编队、攻击者获得目标当前属性
    const hit = skullMatchBattle(
      [makeChar(0, { attack: 10, hp: 30 })],
      [makeChar(4, { hp: 50 })],
      1,
    );
    inject(hit.state.teams[PlayerSide.Left].characters[0], { onSkullHitDevour: { chance: 1 } });
    const hitEvents = hit.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(hitEvents.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 4)).toBe(true);
    expect(hit.state.teams[PlayerSide.Right].characters.some((c) => c.id === 4)).toBe(false);
    const attacker = hit.state.teams[PlayerSide.Left].characters[0];
    expect(attacker.attack).toBe(20);
    expect(attacker.armor).toBe(0);
    expect(attacker.magic).toBe(8);
    expect(attacker.hp).toBeGreaterThan(30);

    // 免疫：同一 for局，目标带 indigestible → 不吞、无成长
    const immune = skullMatchBattle(
      [makeChar(0, { attack: 10, hp: 30 })],
      [makeChar(4, { hp: 50, traitIds: ['indigestible'] })],
      1,
    );
    inject(immune.state.teams[PlayerSide.Left].characters[0], { onSkullHitDevour: { chance: 1 } });
    const immuneEvents = immune.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(immuneEvents.some((e) => e.type === 'defeat')).toBe(false);
    expect(immune.state.teams[PlayerSide.Right].characters[0].defeated).toBe(false);
    expect(immune.state.teams[PlayerSide.Left].characters[0].attack).toBe(10);
  });
});

// —— 复制召唤（summonCopyEffect） ——

describe('复制召唤：属性拷贝完整性、FIFO 队列', () => {
  function copyState(leftChars: Character[], source: Character) {
    const state = createGameState(
      new BoardModel(),
      makeTeam(PlayerSide.Left, leftChars),
      makeTeam(PlayerSide.Right, [source, makeChar(5)]),
    );
    return { state, ctx: { state, casterId: leftChars[0].id, rng: new SeededRNG(3), nextGemId: () => 0 } };
  }

  it('属性/技能/特质全拷贝：满血、零法力、无状态、新 id、可变数组深拷贝', () => {
    const source = makeChar(4, {
      name: 'Sunbird',
      maxHp: 29,
      hp: 7,
      attack: 13,
      armor: 6,
      magic: 10,
      mana: 9,
      colors: [BaseColor.Red, BaseColor.Purple],
      manaCost: 12,
      skillId: 's7542',
      traitIds: ['fireheart', 'fromashes'],
      troopTypes: ['Elemental', 'Beast'],
      statuses: [{ id: 'poison', turns: 2, magnitude: 3 }],
    });
    const caster = makeChar(0);
    const { state, ctx } = copyState([caster], source);
    const events = summonCopyEffect({ targets: [source] }).apply(ctx);
    expect(state.teams[PlayerSide.Left].characters.length).toBe(2);
    const copy = state.teams[PlayerSide.Left].characters[1];
    expect(events[0]).toMatchObject({ type: 'summon', player: PlayerSide.Left, destination: 'field', characterId: copy.id });
    expect(copy.id).not.toBe(source.id);
    expect(copy.id).toBe(6); // 现有最大 id + 1（确定性）
    expect(copy.name).toBe('Sunbird');
    expect(copy.maxHp).toBe(29);
    expect(copy.hp).toBe(29); // 复制体满血（不继承来源当前血量）
    expect(copy.attack).toBe(13);
    expect(copy.armor).toBe(6);
    expect(copy.magic).toBe(10);
    expect(copy.mana).toBe(0); // 零法力
    expect(copy.manaCost).toBe(12);
    expect(copy.skillId).toBe('s7542');
    expect(copy.traitIds).toEqual(['fireheart', 'fromashes']);
    expect(copy.troopTypes).toEqual(['Elemental', 'Beast']);
    expect(copy.statuses).toEqual([]); // 无状态
    expect(copy.defeated).toBe(false);
    // 数组深拷贝：改复制体不影响来源
    copy.colors.push(BaseColor.Green);
    expect(source.colors).toEqual([BaseColor.Red, BaseColor.Purple]);
    copy.traitIds!.push('regeneration');
    expect(source.traitIds).toEqual(['fireheart', 'fromashes']);
  });

  it('编队满员时复制召唤失效', () => {
    const sourceA = makeChar(4, { name: 'A' });
    const sourceB = makeChar(5, { name: 'B', hp: 10 });
    const left = [makeChar(0), makeChar(1), makeChar(2), makeChar(3)];
    const state = createGameState(
      new BoardModel(),
      makeTeam(PlayerSide.Left, left),
      makeTeam(PlayerSide.Right, [sourceA, sourceB]),
    );
    const ctx = { state, casterId: 0, rng: new SeededRNG(3), nextGemId: () => 0 };
    expect(summonCopyEffect({ targets: [sourceA] }).apply(ctx)).toEqual([]);
    expect(summonCopyEffect({ targets: [sourceB] }).apply(ctx)).toEqual([]);
    expect(state.teams[PlayerSide.Left].characters).toHaveLength(4);
    expect(state.teams[PlayerSide.Left].summonQueue).toBeUndefined();
  });

  it('TurnEngine 消费（summonCopy 段）：施法复制敌方队首进场', () => {
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    const caster = makeChar(0, { mana: 20, manaCost: 20, skillId: 'copy' });
    const enemy = makeChar(4, { name: '模板兵', skillId: 'none', mana: 0 });
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [caster]),
      makeTeam(PlayerSide.Right, [enemy]),
    );
    const registry = new ExtensionRegistry();
    registry.prototypes.set('copy', skill(summonCopy('enemyFront')));
    const engine = new TurnEngine(state, new SeededRNG(5), (() => { let n = 500000; return () => ++n; })(), registry);
    const events = engine.castSkill(0);
    expect(state.teams[PlayerSide.Left].characters.length).toBe(2);
    const copy = state.teams[PlayerSide.Left].characters[1];
    expect(copy.name).toBe('模板兵');
    expect(copy.hp).toBe(copy.maxHp);
    expect(events.some((e) => e.type === 'summon' && (e as { destination: string }).destination === 'field')).toBe(true);
  });
});

// —— 全量确定性 ——

describe('同种子双跑确定性', () => {
  it('自复活 + 吞噬同场对局：事件流与终局编队逐字节一致', () => {
    const run = () => {
      const right = makeChar(4, { hp: 5 });
      const { engine, state } = skullMatchBattle(
        [makeChar(0, { attack: 10, traitIds: ['voracious'] })],
        [right],
        3,
      );
      inject(state.teams[PlayerSide.Right].characters[0], { selfRevive: { chance: 0.25, healPct: 0.5 } });
      const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      return {
        events: JSON.stringify(events),
        teams: JSON.stringify(state.teams),
        board: JSON.stringify(state.board),
      };
    };
    expect(run()).toEqual(run());
  });

  it('selfRevive 段施法对局：事件流逐字节一致', () => {
    const run = () => {
      const board = new BoardModel();
      const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
        }
      }
      const caster = makeChar(0, { hp: 1, magic: 6, mana: 20, manaCost: 20, skillId: 'combo' });
      const reflector = makeChar(4, { skillId: 'none', mana: 0, statuses: [{ id: 'reflect', turns: 3 }] });
      const state = createGameState(
        board,
        makeTeam(PlayerSide.Left, [caster]),
        makeTeam(PlayerSide.Right, [reflector]),
      );
      const registry = new ExtensionRegistry();
      registry.prototypes.set('combo', skill(dmg('enemyFront', 4, 1), selfRevive()));
      const engine = new TurnEngine(state, new SeededRNG(5), (() => { let n = 500000; return () => ++n; })(), registry);
      engine.castSkill(0);
      return JSON.stringify({ events: undefined, teams: state.teams, state: state.state, winner: state.winner });
    };
    expect(run()).toBe(run());
  });
});
