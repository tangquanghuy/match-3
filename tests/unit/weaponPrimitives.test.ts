/**
 * 武器法术引擎原语批（窗口 K-E）单测。
 *
 * 覆盖四组为武器法术编译清缺口的原语：
 *   1. tempering 缩放来源（Character.temperingLevel，Doomed 档「+N per Tempering level」）；
 *   2. targetHasDoom 条件（劫数考证：troops.json TroopType 'Doom' 兵种属性，非战斗标记）；
 *   3. enemiesOfRace / enemiesOfColor 敌侧计数来源（alliesOf* 的镜像）；
 *   4. 王国家族（BattleRequest/GameState.kingdom 契约、kingdomPresent 条件、
 *      targetKingdom 目标过滤、allies/enemiesOfKingdom 计数、randomOfKingdom 召唤）；
 * 以及 builders（temperingBoost/boostPer/enemyHasDoom/kingdomPresent/summonRandomOfKingdom…）
 * 与「新字段不使用时事件流逐字节不变」护栏（Wave B 风格）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import {
  dmg, magic, armor, skill,
  temperingBoost, boostPer,
  enemiesOfColorBoost, enemiesOfRaceBoost,
  alliesOfKingdomBoost, enemiesOfKingdomBoost,
  enemyHasDoom, kingdomPresent, summonRandomOfKingdom,
  anyEnemyDied, transformToSpecial, createGemsMixAny,
  destroyColor, explodeSpecialGems,
  createSkulls,
} from '@engine/skills/builders';
import { resolveModifierCount, conditionMet, DOOM_TROOP_TYPE } from '@engine/skills/effects/secondary';
import type { EffectContext } from '@engine/skills/effects/context';
import type { TransformGemParams } from '@engine/skills/effects/gems';
import type { SummonTemplate } from '@engine/skills/effects/summon';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION, validateBattleRequest } from '@session/index';
import type { BattleRequest, CombatantSnapshot } from '@session/index';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { troopToSummonTemplate } from '../../src/data/troops';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

function fillBoard(board: BoardModel): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(BaseColor.Red)));
  }
}

interface CtxOpts {
  magic?: number;
  seed?: number;
  temperingLevel?: number;
  kingdom?: string | null;
  /** [己方覆盖, 敌方覆盖…] 逐角色 Partial */
  left?: Partial<Character>[];
  right?: Partial<Character>[];
  /** 召唤解析器（referenceName → 模板）；缺省 = 不注入 */
  summonRefs?: Record<string, SummonTemplate>;
  /** 王国兵册解析器；缺省 = 不注入 */
  kingdomRefs?: Record<string, string[]>;
}

/** 原语路径 ctx（不经 TurnEngine） */
function primitiveCtx(over: CtxOpts = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  const board = new BoardModel();
  fillBoard(board);
  const left: Team = {
    player: PlayerSide.Left,
    characters: [
      makeChar(0, {
        magic: over.magic ?? 6,
        ...(over.temperingLevel !== undefined ? { temperingLevel: over.temperingLevel } : {}),
      }),
      ...[1, 2].map((i) => makeChar(i)),
      ...(over.left ?? []).map((o, i) => makeChar(10 + i, o)),
    ],
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: [makeChar(4), makeChar(5), makeChar(6), ...(over.right ?? []).map((o, i) => makeChar(20 + i, o))],
  };
  const state = createGameState(board, left, right, PlayerSide.Left,
    over.kingdom !== undefined ? { kingdom: over.kingdom } : undefined);
  const ctx: EffectContext = {
    state,
    casterId: 0,
    rng: new SeededRNG(over.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  if (over.summonRefs) {
    ctx.resolveSummonRef = (ref) => over.summonRefs![ref] ?? null;
  }
  if (over.kingdomRefs) {
    ctx.resolveKingdomSummonRefs = (k) => over.kingdomRefs![k] ?? null;
  }
  return { ctx, state };
}

function damageEvents(events: GameEvent[]): { targetId: number; damage: number }[] {
  return events.filter((e) => e.type === 'skill-damage')
    .map((e) => ({ targetId: (e as { targetId: number }).targetId, damage: (e as { damage: number }).damage }));
}

// ───────────────────────── 1. tempering 缩放来源 ─────────────────────────

describe('K-E · tempering 缩放来源（Character.temperingLevel）', () => {
  it('来源计数 = 施法者 temperingLevel；缺省按 0 计', () => {
    const leveled = primitiveCtx({ temperingLevel: 2 });
    expect(resolveModifierCount({ kind: 'tempering' }, leveled.ctx)).toBe(2);

    const plain = primitiveCtx({});
    expect(resolveModifierCount({ kind: 'tempering' }, plain.ctx)).toBe(0);
  });

  it('temperingBoost(4)：level 2 → +8、level 0/缺省 → 增项为 0（退化普通一次缩放）', () => {
    const leveled = primitiveCtx({ magic: 7, temperingLevel: 2 });
    const { ctx, state } = primitiveCtx({ magic: 7 });
    const d = (c: EffectContext) => damageEvents(executePrototype(
      { segments: [dmg('enemyFront', 10, 1, { modifier: temperingBoost(4) })] }, c,
    ));
    // [魔法+10]=17，+4×2=8 → 25
    expect(d(leveled.ctx)).toEqual([{ targetId: 4, damage: 25 }]);
    // 无淬炼 → 17（增项 0）
    expect(d(ctx)).toEqual([{ targetId: 4, damage: 17 }]);
    void state;
  });

  it('官方 7655 样例形态：散射伤害基数 + 每段位 +4（splash 段共享池同样吃到增项）', () => {
    const { ctx } = primitiveCtx({ magic: 0, temperingLevel: 3 });
    const events = executePrototype(
      { segments: [dmg('enemyFront', 10, 0, { range: 'splash', modifier: temperingBoost(4) })] },
      ctx,
    );
    // 共享池 = scaling 求值 10（mult=0、magic=0）+ 增项 4×3 = 22；溅射链分配总额始终
    // 等于池（3 名敌人容量足够），不丢伤
    const total = damageEvents(events).reduce((s, e) => s + e.damage, 0);
    expect(total).toBe(22);
  });

  it('boostPer 通用组合器与 temperingBoost 同源；与其它来源多源相加', () => {
    const { ctx } = primitiveCtx({ temperingLevel: 2 });
    const spec = boostPer({ kind: 'tempering' }, 4);
    expect(resolveModifierCount(spec.source!, ctx)).toBe(2);
    // 多来源相加：tempering(2) + 己方红法力色盟友数（全队缺省 colors=[Red] → 3）
    const multi = { mod: { kind: 'multiplier' as const, a: 1 }, sources: [{ kind: 'tempering' } as const, { kind: 'alliesOfColor', color: BaseColor.Red } as const] };
    expect(resolveModifierCount(multi.sources[0], ctx) + resolveModifierCount(multi.sources[1], ctx)).toBe(5);
  });
});

// ───────────────────────── 2. targetHasDoom 条件（劫数） ─────────────────────────

describe('K-E · targetHasDoom 条件（劫数 = TroopType Doom）', () => {
  it('敌方存活者含 Doom 部队 → 成立；不含 / 仅己方有 → 不成立', () => {
    const withDoom = primitiveCtx({ right: [{ troopTypes: [DOOM_TROOP_TYPE] }] });
    expect(conditionMet(enemyHasDoom(), withDoom.ctx)).toBe(true);

    const noDoom = primitiveCtx({});
    expect(conditionMet(enemyHasDoom(), noDoom.ctx)).toBe(false);

    // 劫数在己方不算「敌方有劫数」
    const ownSide = primitiveCtx({ left: [{ troopTypes: [DOOM_TROOP_TYPE] }] });
    expect(conditionMet(enemyHasDoom(), ownSide.ctx)).toBe(false);
  });

  it('敌方 Doom 部队已阵亡 → 不成立（按存活者判定）', () => {
    const { ctx } = primitiveCtx({ right: [{ troopTypes: [DOOM_TROOP_TYPE], defeated: true }] });
    expect(conditionMet(enemyHasDoom(), ctx)).toBe(false);
  });

  it('官方 7655 尾句形态：Give 3 Magic, if the Enemy has a Doom, give 5 more（condBonus）', () => {
    const seg = magic('allyAll', 3, 0, { condBonus: { n: 5, cond: enemyHasDoom() } });
    const buffsOf = (c: EffectContext) => executePrototype({ segments: [seg] }, c)
      .filter((e) => e.type === 'buff')
      .map((e) => (e as { targetId: number; amount: number }).amount);

    const withDoom = primitiveCtx({ right: [{ troopTypes: [DOOM_TROOP_TYPE] }] });
    // 己方 3 人（含施法者）各 +8
    expect(buffsOf(withDoom.ctx)).toEqual([8, 8, 8]);

    const noDoom = primitiveCtx({});
    expect(buffsOf(noDoom.ctx)).toEqual([3, 3, 3]);
  });

  it('ifCond 挂段：敌方无劫数 → 整段跳过（零事件、零随机消耗）；有 → 照常执行', () => {
    const seg = dmg('enemyFront', 5, 0, { ifCond: enemyHasDoom() });
    const noDoom = primitiveCtx({});
    expect(executePrototype({ segments: [seg] }, noDoom.ctx)).toEqual([]);

    const withDoom = primitiveCtx({ right: [{ troopTypes: [DOOM_TROOP_TYPE] }] });
    expect(damageEvents(executePrototype({ segments: [seg] }, withDoom.ctx)))
      .toEqual([{ targetId: 4, damage: 5 }]);
  });
});

// ───────────────────────── 3. 敌侧计数来源 ─────────────────────────

describe('K-E · enemiesOfRace / enemiesOfColor 敌侧计数来源', () => {
  it('enemiesOfRace 只数敌方该族存活者（alliesOfRace 的镜像）', () => {
    const { ctx } = primitiveCtx({
      left: [{ troopTypes: ['Beast'] }],
      right: [{ troopTypes: ['Beast'] }, { troopTypes: ['Beast', 'Human'] }],
    });
    expect(resolveModifierCount({ kind: 'enemiesOfRace', race: 'Beast' }, ctx)).toBe(2);
    expect(resolveModifierCount({ kind: 'alliesOfRace', race: 'Beast' }, ctx)).toBe(1);
  });

  it('enemiesOfRaceBoost(2) 挂伤害段：2 只恶魔敌人 → +4', () => {
    const { ctx } = primitiveCtx({
      right: [{ troopTypes: ['Demon'] }, { troopTypes: ['Demon'] }],
    });
    const events = executePrototype(
      { segments: [dmg('enemyFront', 6, 0, { modifier: enemiesOfRaceBoost('Demon', 2) })] },
      ctx,
    );
    expect(damageEvents(events)).toEqual([{ targetId: 4, damage: 10 }]);
  });

  it('enemiesOfColorBoost 回归：1 名蓝色敌人 → +3', () => {
    const { ctx } = primitiveCtx({ right: [{ colors: [BaseColor.Blue] }] });
    const events = executePrototype(
      { segments: [dmg('enemyFront', 5, 0, { modifier: enemiesOfColorBoost(BaseColor.Blue, 3) })] },
      ctx,
    );
    expect(damageEvents(events)).toEqual([{ targetId: 4, damage: 8 }]);
  });
});

// ───────────────────────── 4. 王国家族 ─────────────────────────

describe('K-E · kingdomPresent 条件（战斗上下文王国）', () => {
  it('GameState.kingdom 与条件 kingdom 严格相等才成立', () => {
    const khetar = primitiveCtx({ kingdom: 'Khetar' });
    expect(conditionMet(kingdomPresent('Khetar'), khetar.ctx)).toBe(true);
    expect(conditionMet(kingdomPresent('Adana'), khetar.ctx)).toBe(false);
  });

  it('字段缺省 / null（旧请求、竞技场口径）→ 恒为假', () => {
    const none = primitiveCtx({});
    expect(conditionMet(kingdomPresent('Khetar'), none.ctx)).toBe(false);
    expect('kingdom' in none.state).toBe(false);

    const arena = primitiveCtx({ kingdom: null });
    expect(conditionMet(kingdomPresent('Khetar'), arena.ctx)).toBe(false);
  });

  it('createGameState opts.kingdom 透传（宿主接线点：BattleRequest.kingdom → GameState.kingdom）', () => {
    const board = new BoardModel();
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(1)] };
    const withKingdom = createGameState(board, left, right, PlayerSide.Left, { kingdom: 'Khetar' });
    expect(withKingdom.kingdom).toBe('Khetar');
    const without = createGameState(board, left, right);
    expect(without.kingdom).toBeUndefined();
  });

  it('ifCond 挂段：王国匹配才执行（不匹配 → 零事件零随机消耗）', () => {
    const seg = dmg('enemyFront', 5, 0, { ifCond: kingdomPresent('Khetar') });
    const khetar = primitiveCtx({ kingdom: 'Khetar' });
    expect(damageEvents(executePrototype({ segments: [seg] }, khetar.ctx)))
      .toEqual([{ targetId: 4, damage: 5 }]);
    const elsewhere = primitiveCtx({ kingdom: 'Adana' });
    expect(executePrototype({ segments: [seg] }, elsewhere.ctx)).toEqual([]);
  });
});

describe('K-E · targetKingdom 目标过滤（「给予所有白盔国盟友…」）', () => {
  it('allyAll + targetKingdom：只命中该王国盟友（armor 增益，全队满血避免 heal 零事件）', () => {
    const { ctx } = primitiveCtx({
      left: [
        { kingdom: 'Whitehelm', id: 11 },
        { kingdom: 'Khetar', id: 12 },
      ],
    });
    const events = executePrototype(
      { segments: [armor('allyAll', 5, 0, { targetKingdom: 'Whitehelm' })] },
      ctx,
    );
    const buffs = events.filter((e) => e.type === 'buff').map((e) => (e as { targetId: number }).targetId);
    expect(buffs).toEqual([11]);
  });

  it('enemyAll + targetKingdom：只命中来自该王国的敌人', () => {
    const { ctx } = primitiveCtx({
      right: [{ kingdom: 'Adana', id: 21 }, { kingdom: 'Khetar', id: 22 }],
    });
    const events = executePrototype(
      { segments: [dmg('enemyAll', 4, 0, { targetKingdom: 'Adana' })] },
      ctx,
    );
    expect(damageEvents(events)).toEqual([{ targetId: 21, damage: 4 }]);
  });

  it('无人属于该王国 → 段整体跳过（零事件）', () => {
    const { ctx } = primitiveCtx({ left: [{ kingdom: 'Khetar', id: 11 }] });
    const events = executePrototype(
      { segments: [armor('allyAll', 5, 0, { targetKingdom: 'Whitehelm' })] },
      ctx,
    );
    expect(events).toEqual([]);
  });
});

describe('K-E · alliesOfKingdom / enemiesOfKingdom 计数来源（Wave4 既有 + builder）', () => {
  it('alliesOfKingdomBoost：2 名 Khetar 盟友 → 护甲增益 3+4=7', () => {
    const { ctx } = primitiveCtx({ left: [{ kingdom: 'Khetar', id: 11 }, { kingdom: 'Khetar', id: 12 }] });
    const events = executePrototype(
      { segments: [armor('allyFront', 3, 0, { modifier: alliesOfKingdomBoost('Khetar', 2) })] },
      ctx,
    );
    expect(events.filter((e) => e.type === 'buff').map((e) => (e as { amount: number }).amount)).toEqual([7]);
  });

  it('enemiesOfKingdomBoost：1 名 Adana 敌人 → 伤害 +3', () => {
    const { ctx } = primitiveCtx({ right: [{ kingdom: 'Adana', id: 21 }] });
    const events = executePrototype(
      { segments: [dmg('enemyFront', 5, 0, { modifier: enemiesOfKingdomBoost('Adana', 3) })] },
      ctx,
    );
    expect(damageEvents(events)).toEqual([{ targetId: 4, damage: 8 }]);
  });
});

// ───────────────────────── 5. 按王国随机召唤 ─────────────────────────

describe('K-E · randomOfKingdom 召唤来源（summonRandomOfKingdom）', () => {
  const REFS: Record<string, SummonTemplate> = {
    Zombie: { name: '僵尸', maxHp: 10, hp: 10, attack: 2, armor: 1, magic: 1, colors: [BaseColor.Brown], manaCost: 8, mana: 0, skillId: 'none' },
    Skeleton: { name: '骷髅', maxHp: 8, hp: 8, attack: 3, armor: 0, magic: 1, colors: [BaseColor.Brown], manaCost: 8, mana: 0, skillId: 'none' },
  };

  it('注入王国兵册 → 种子化掷选一名并按模板召唤（与同种子 rng 逐位可复现）', () => {
    const { ctx, state } = primitiveCtx({
      summonRefs: REFS,
      kingdomRefs: { Khetar: ['Zombie', 'Skeleton'] },
      seed: 7,
    });
    const events = executePrototype({ segments: [summonRandomOfKingdom('Khetar')] }, ctx);
    const summon = events.find((e) => e.type === 'summon');
    expect(summon).toBeDefined();
    // 期望名与同种子 RNG 的掷选一致（resolveTemplate 只为掷名消耗一次 rng）
    const expected = ['Zombie', 'Skeleton'][new SeededRNG(7).nextInt(2)];
    const summoned = state.teams[PlayerSide.Left].characters.at(-1)!;
    expect(summoned.name).toBe(REFS[expected].name);
    expect(summoned.hp).toBe(REFS[expected].maxHp);
  });

  it('兵册为空 / 解析器缺省 → 整段安全跳过（零事件、零随机消耗）', () => {
    const empty = primitiveCtx({ summonRefs: REFS, kingdomRefs: { Khetar: [] } });
    expect(executePrototype({ segments: [summonRandomOfKingdom('Khetar')] }, empty.ctx)).toEqual([]);

    const absent = primitiveCtx({ summonRefs: REFS });
    expect(executePrototype({ segments: [summonRandomOfKingdom('Khetar')] }, absent.ctx)).toEqual([]);
    expect(absent.ctx.resolveKingdomSummonRefs).toBeUndefined(); // kingdom 解析器缺省即未注入
  });

  it('TurnEngine 全管线：setSummonKingdomResolver 注入后 castSkill 产出召唤', () => {
    const board = new BoardModel();
    gid = 0;
    fillBoard(board);
    const left: Team = {
      player: PlayerSide.Left,
      characters: [makeChar(0, { skillId: 'wsummon', mana: 20, manaCost: 20 }), makeChar(1), makeChar(2)],
    };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5), makeChar(6)] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('wsummon', skill(summonRandomOfKingdom('Khetar')));
    let idg = 800000;
    const engine = new TurnEngine(state, new SeededRNG(11), () => idg++, registry);
    engine.skullChance = 0;
    engine.setSummonResolver((ref) => troopToSummonTemplate(ref));
    engine.setSummonKingdomResolver((k) => (k === 'Khetar' ? ['DoomOfIce'] : null));
    const events = engine.castSkill(0);
    const summon = events.find((e) => e.type === 'summon');
    expect(summon).toBeDefined();
    // 召唤物按 DoomOfIce 模板入队（名 = 寒冰劫数），编队从 3 → 4（进场上位）
    const summoned = state.teams[PlayerSide.Left].characters.at(-1)!;
    expect(summoned.name).toBe('寒冰劫数');
    expect(state.teams[PlayerSide.Left].characters.length).toBe(4);
  });
});

// ───────────────────────── 6. 契约与校验 ─────────────────────────

function snapshot(over: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    externalId: 'hero-1',
    name: '测试角色',
    stats: { hp: 40, attack: 4, armor: 0, magic: 6 },
    manaColors: [BaseColor.Red],
    manaCost: 10,
    skillId: 'none',
    traitIds: [],
    ...over,
  };
}

function request(over: Partial<BattleRequest> = {}): BattleRequest {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: 'battle-1',
    requestId: 'req-1',
    rulesetVersion: RULESET_VERSION,
    seed: 12345,
    playerTeam: [snapshot({ externalId: 'p1' })],
    enemyTeam: [snapshot({ externalId: 'e1' })],
    ...over,
  };
}

function codesAt(raw: unknown, path: string): string[] {
  const result = validateBattleRequest(raw, { knownSkillIds: new Set(['none']) });
  if (result.ok) return [];
  return result.issues.filter((i) => i.path === path).map((i) => i.code);
}

describe('K-E · BattleRequest.kingdom 契约（向后兼容）', () => {
  it('不传 = undefined → 校验通过（旧宿主兼容口径）', () => {
    const result = validateBattleRequest(request(), { knownSkillIds: new Set(['none']) });
    expect(result.ok).toBe(true);
    expect(result.ok && result.request.kingdom).toBeUndefined();
  });

  it('王国名 / null（竞技场口径）均合法；类型错误拒绝', () => {
    expect(codesAt(request({ kingdom: 'Khetar' }), 'kingdom')).toEqual([]);
    expect(codesAt(request({ kingdom: null }), 'kingdom')).toEqual([]);
    expect(codesAt(request({ kingdom: 42 as unknown as string }), 'kingdom')).toEqual(['bad-type']);
    expect(codesAt(request({ kingdom: '  ' }), 'kingdom')).toEqual(['bad-type']);
  });
});

// ───────────────────────── 7. 护栏：新字段不使用时事件流逐字节不变 ─────────────────────────

describe('K-E · 护栏（Wave B 风格）：新字段不使用 → 事件流/rng 序列逐字节不变', () => {
  /** 稳定棋盘：周期染色无预成三连；setGems 覆写构造一次确定性三连 */
  function guardHarness(options: { kingdom?: string | null; withKingdomResolver?: boolean } = {}) {
    let localId = 60000;
    const gg = (type: GemType): Gem => ({ id: localId++, type });
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, gg(colorGem(palette[(r + c) % palette.length])));
    }
    // (7,4)(7,5) 红色横向对 + (6,6) 红色：交换 (6,6)<->(7,6) 凑成 row7 三连
    board.set({ row: 7, col: 4 }, gg(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 5 }, gg(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 6 }, gg(colorGem(BaseColor.Red)));
    const left: Team = {
      player: PlayerSide.Left,
      characters: [makeChar(0, { mana: 20, manaCost: 20, magic: 3, skillId: 'wpn' }), makeChar(1), makeChar(2)],
    };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5), makeChar(6)] };
    const state = createGameState(board, left, right, PlayerSide.Left,
      options.kingdom !== undefined ? { kingdom: options.kingdom } : undefined);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('wpn', skill(dmg('enemyFront', 5, 0)));
    const engine = new TurnEngine(state, new SeededRNG(11), () => 700000 + localId++, registry);
    engine.skullChance = 0;
    if (options.withKingdomResolver) {
      engine.setSummonResolver((ref) => troopToSummonTemplate(ref));
      engine.setSummonKingdomResolver(() => ['DoomOfIce']);
    }
    return { engine, state };
  }

  function scriptedBattle(harness: { engine: TurnEngine }): { type: string }[] {
    // 先施法（施法不换边、activePlayer 仍是 Left），再交换触发三连；
    // 交换在前会导致 activePlayer 切到 Right、随后 Left 的 cast 被拒（引擎按行动方查人）。
    const events = [
      ...harness.engine.resolveAction({ type: 'cast', characterId: 0 }),
      ...harness.engine.resolveAction({ type: 'swap', from: { row: 6, col: 6 }, to: { row: 7, col: 6 } }),
    ];
    return events;
  }

  it('同 seed 两次全新对局：事件流逐字节一致', () => {
    const a = scriptedBattle(guardHarness());
    const b = scriptedBattle(guardHarness());
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('带 kingdom 上下文 / 王国召唤解析器（未被消费）→ 事件流与不带逐字节一致', () => {
    const plain = scriptedBattle(guardHarness());
    const withCtx = scriptedBattle(guardHarness({ kingdom: 'Khetar', withKingdomResolver: true }));
    expect(JSON.stringify(withCtx)).toBe(JSON.stringify(plain));
  });
});

// ───────────────────────── 8. K-B 收官轮 · anyEnemyDied 条件 ─────────────────────────

/** 清出 n 个空格（创造段在满盘时会走「就地转化」路径，为验证 gem-create 需要空位） */
function punchHoles(state: ReturnType<typeof createGameState>, n: number): void {
  let cleared = 0;
  for (let r = 0; r < 8 && cleared < n; r++) {
    for (let c = 0; c < 8 && cleared < n; c++) {
      state.board.set({ row: r, col: c }, null);
      cleared++;
    }
  }
}

describe('K-B 收官 · anyEnemyDied（If an Enemy dies → anyTrackedDied 武器形态）', () => {
  it('7117 官方形态：本咒语击杀任一敌人 → 条件段执行（创造 7 颗骷髅头）', () => {
    const kill = primitiveCtx({ right: [{ hp: 5, maxHp: 50 }] });
    punchHoles(kill.state, 8);
    const events = executePrototype(
      { segments: [dmg('enemyAll', 40, 0, { range: 'all' }), createSkulls(7, 0, { ifCond: anyEnemyDied() })] },
      kill.ctx,
    );
    const created = events.filter((e) => e.type === 'gem-create');
    expect(created.length).toBe(1);
    expect(events.some((e) => e.type === 'defeat')).toBe(true);
  });

  it('无击杀 → 条件段静默跳过（零事件、零随机消耗：与不写该段的事件流逐字节一致）', () => {
    gid = 0;
    const withSeg = primitiveCtx({ seed: 7 });
    const eventsWith = executePrototype(
      { segments: [dmg('enemyAll', 1, 0, { range: 'all' }), createSkulls(7, 0, { ifCond: anyEnemyDied() })] },
      withSeg.ctx,
    );
    gid = 0;
    const without = primitiveCtx({ seed: 7 });
    const eventsWithout = executePrototype({ segments: [dmg('enemyAll', 1, 0, { range: 'all' })] }, without.ctx);
    // 跳过不消耗 rng → 两种写法事件流逐字节一致
    expect(JSON.stringify(eventsWith)).toBe(JSON.stringify(eventsWithout));
  });

  it('9629 官方形态：溅射击杀 → 再创造 4 颗（条件化的第二段创造）', () => {
    const kill = primitiveCtx({ right: [{ hp: 3, maxHp: 50 }] });
    kill.ctx.chosenTargetId = 20; // enemyChosen：手动选定低位敌人（over.right 从 id 20 起）
    punchHoles(kill.state, 8);
    const events = executePrototype(
      {
        segments: [
          dmg('enemyChosen', 10, 0, { range: 'splash' }),
          createSkulls(7, 0),
          createSkulls(4, 0, { ifCond: anyEnemyDied() }),
        ],
      },
      kill.ctx,
    );
    expect(events.some((e) => e.type === 'defeat')).toBe(true);
    expect(events.filter((e) => e.type === 'gem-create').length).toBe(2);
  });

  it('构造器 = anyTrackedDied 专名形态（序列化同为 { kind: anyTrackedDied }）', () => {
    expect(anyEnemyDied()).toEqual({ kind: 'anyTrackedDied' });
  });
});

// ───────────────────────── 9. K-B 收官 · 转换端点 tier 通道 ─────────────────────────

describe('K-B 收官 · transformToSpecial tier 通道（8966 x3 通配符）', () => {
  it('spec 形态 { kind, tier }：转换结果带 tier（wildcard tier 3）', () => {
    const { ctx } = primitiveCtx({ seed: 7 });
    const events = executePrototype(
      { segments: [transformToSpecial('ANY', { kind: 'wildcard', tier: 3 }, { count: 2 })] },
      ctx,
    );
    const changes = events.flatMap((e) => (e.type === 'gem-transform' ? (e as { changes: { to: GemType }[] }).changes : []));
    expect(changes.length).toBe(2);
    for (const ch of changes) {
      expect(ch.to).toEqual(specialGem('wildcard', 3));
    }
  });

  it('opts.tier 与 spec 形态等价（kind 字符串 + tier 走同一 spec 端点）', () => {
    gid = 0;
    const a = primitiveCtx({ seed: 7 });
    const ea = executePrototype({ segments: [transformToSpecial('ANY', { kind: 'wildcard', tier: 3 }, { count: 2 })] }, a.ctx);
    gid = 0;
    const b = primitiveCtx({ seed: 7 });
    const eb = executePrototype({ segments: [transformToSpecial('ANY', 'wildcard', { count: 2, tier: 3 })] }, b.ctx);
    expect(JSON.stringify(eb)).toBe(JSON.stringify(ea));
  });

  it('8966 官方形态：选定单格（CELL）→ x3 通配符', () => {
    const { ctx, state } = primitiveCtx({ seed: 7 });
    ctx.chosenCell = { row: 2, col: 3 };
    const before = state.board.get({ row: 2, col: 3 })!.type;
    const events = executePrototype(
      { segments: [transformToSpecial('CELL', { kind: 'wildcard', tier: 3 })] },
      ctx,
    );
    const changes = events.flatMap((e) => (e.type === 'gem-transform' ? (e as { changes: { pos: unknown; from: GemType; to: GemType }[] }).changes : []));
    expect(changes.length).toBe(1);
    expect(changes[0].pos).toEqual({ row: 2, col: 3 });
    expect(changes[0].from).toEqual(before);
    expect(changes[0].to).toEqual(specialGem('wildcard', 3));
  });

  it('护栏：不带 tier 的既有调用序列化为 kind 字符串形态、事件流与裸段字面量逐字节一致', () => {
    // 序列化：kind 字符串（不升级对象）——旧批次/旧段字面量兼容口径
    const seg = transformToSpecial('ANY', 'bomb', { count: 1 });
    expect((seg.params as TransformGemParams).toSpecial).toBe('bomb');
    const legacy = transformToSpecial('ANY', 'wildcard');
    expect((legacy.params as TransformGemParams).toSpecial).toBe('wildcard');
    // 行为：builder 产物与裸段字面量（旧序列）同 seed 事件流一致
    gid = 0;
    const viaBuilder = primitiveCtx({ seed: 11 });
    const e1 = executePrototype({ segments: [transformToSpecial('ANY', 'bomb', { count: 2 })] }, viaBuilder.ctx);
    gid = 0;
    const viaLiteral = primitiveCtx({ seed: 11 });
    const e2 = executePrototype(
      { segments: [{ kind: 'gem', params: { op: 'transform', from: 'ANY', to: 'SKULL', toSpecial: 'bomb', count: { base: 2, mult: 0 } } }] },
      viaLiteral.ctx,
    );
    expect(JSON.stringify(e2)).toBe(JSON.stringify(e1));
  });
});

// ───────────────────────── 10. K-B 收官 · mixAny 特殊宝石/骷髅端点 ─────────────────────────

describe('K-B 收官 · createGemsMixAny 骷髅/特殊宝石端点（9110/9167/9300 族）', () => {
  it('色 + 骷髅头混合：逐颗只在两 endpoint 中取（9110「混合蓝色和骷髅头」）', () => {
    const { ctx, state } = primitiveCtx({ seed: 7 });
    punchHoles(state, 12);
    const events = executePrototype({ segments: [createGemsMixAny([BaseColor.Blue, 'SKULL'], 12)] }, ctx);
    const spawns = events.flatMap((e) => (e.type === 'gem-create' ? (e as { spawns: { gemType: GemType }[] }).spawns : []));
    expect(spawns.length).toBeGreaterThan(0);
    for (const s of spawns) {
      const isBlue = s.gemType.kind === 'color' && s.gemType.color === BaseColor.Blue;
      const isSkull = s.gemType.kind === 'skull';
      expect(isBlue || isSkull, `非混合端点宝石: ${JSON.stringify(s.gemType)}`).toBe(true);
    }
  });

  it('双特殊宝石混合（9300「混合鬼魂宝石和冻结宝石」）', () => {
    const { ctx, state } = primitiveCtx({ seed: 7 });
    punchHoles(state, 10);
    const events = executePrototype(
      { segments: [createGemsMixAny([{ kind: 'ghost' }, { kind: 'freezeGem' }], 8)] },
      ctx,
    );
    const spawns = events.flatMap((e) => (e.type === 'gem-create' ? (e as { spawns: { gemType: GemType }[] }).spawns : []));
    expect(spawns.length).toBe(8);
    for (const s of spawns) {
      expect(s.gemType.kind).toBe('special');
      expect(['ghost', 'freezeGem']).toContain((s.gemType as { spec: { kind: string } }).spec.kind);
    }
  });

  it('骷髅 + 恐怖宝石混合（9167「混合骷髅头和恐怖宝石」）', () => {
    const { ctx, state } = primitiveCtx({ seed: 7 });
    punchHoles(state, 8);
    const events = executePrototype(
      { segments: [createGemsMixAny(['SKULL', { kind: 'terrorGem' }], 6)] },
      ctx,
    );
    const spawns = events.flatMap((e) => (e.type === 'gem-create' ? (e as { spawns: { gemType: GemType }[] }).spawns : []));
    expect(spawns.length).toBe(6);
    for (const s of spawns) {
      const ok = s.gemType.kind === 'skull'
        || (s.gemType.kind === 'special' && s.gemType.spec.kind === 'terrorGem');
      expect(ok, `非混合端点宝石: ${JSON.stringify(s.gemType)}`).toBe(true);
    }
  });
});

// ───────────────────────── 11. K-B 收官 · 条件化清除段 ─────────────────────────

describe('K-B 收官 · 条件化清除（clear 构造器 opts + ifCond）', () => {
  it('7286 官方形态：风暴在场 → destroyColor 执行；否则整段跳过', () => {
    const green = primitiveCtx({ seed: 7 });
    green.state.teams[PlayerSide.Left].storm = { color: BaseColor.Brown, turns: 3, troopId: 0 };
    green.ctx.state.board.set({ row: 3, col: 3 }, { id: 990001, type: colorGem(BaseColor.Green) });
    const seg = destroyColor(BaseColor.Green, { ifCond: { kind: 'stormPresent', color: BaseColor.Brown } });
    const events = executePrototype({ segments: [seg] }, green.ctx);
    expect(events.filter((e) => e.type === 'gem-destroy').length).toBe(1);

    const noStorm = primitiveCtx({ seed: 7 });
    noStorm.ctx.state.board.set({ row: 3, col: 3 }, { id: 990002, type: colorGem(BaseColor.Green) });
    const eventsNone = executePrototype({ segments: [seg] }, noStorm.ctx);
    expect(eventsNone).toEqual([]);
  });

  it('9983 官方形态：troopPresent 条件 + explodeSpecialGems（引爆所有死亡印记宝石）', () => {
    const withZephaar = primitiveCtx({ left: [{ name: '不朽的泽法尔', id: 11 }] });
    withZephaar.ctx.state.board.set({ row: 4, col: 4 }, { id: 990003, type: specialGem('deathMarkGem') });
    const seg = explodeSpecialGems('deathMarkGem', { ifCond: { kind: 'troopPresent', side: 'ally', name: '不朽的泽法尔' } });
    const events = executePrototype({ segments: [seg] }, withZephaar.ctx);
    expect(events.filter((e) => e.type === 'gem-explode').length).toBe(1);

    const without = primitiveCtx({});
    without.ctx.state.board.set({ row: 4, col: 4 }, { id: 990004, type: specialGem('deathMarkGem') });
    expect(executePrototype({ segments: [seg] }, without.ctx)).toEqual([]);
  });

  it('护栏：不传 opts 的清除调用事件流与裸段字面量逐字节一致（旧形序列化不变）', () => {
    gid = 0;
    const a = primitiveCtx({ seed: 13 });
    a.ctx.state.board.set({ row: 1, col: 1 }, { id: 990005, type: specialGem('stunGem') });
    const e1 = executePrototype({ segments: [explodeSpecialGems('stunGem')] }, a.ctx);
    gid = 0;
    const b = primitiveCtx({ seed: 13 });
    b.ctx.state.board.set({ row: 1, col: 1 }, { id: 990005, type: specialGem('stunGem') });
    const e2 = executePrototype(
      { segments: [{ kind: 'gem', params: { op: 'clear', mode: 'explode', target: { kind: 'special', gem: 'stunGem' } } }] },
      b.ctx,
    );
    expect(JSON.stringify(e2)).toBe(JSON.stringify(e1));
  });
});
