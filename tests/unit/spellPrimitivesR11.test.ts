/**
 * 目标措辞/条件原语族单元测试（R11 批，2026-09-18）。
 *
 * 覆盖本批新增的五个原语面：
 *   1. enemyChosenAndAdjacent——选定敌人编队前后各一位（「上方和下方的敌人」）；
 *   2. ColorSpec 'ENEMY_MOST_USED'/'ALLY_MOST_USED'——行动日志聚合「已用法力最多的颜色」；
 *   3. Condition targetColor 扩 'CHOSEN'——「所有使用该(选定)颜色的敌人/盟友」动态色过滤；
 *   4. Condition regionPresent / ascended——地区/晋升度条件（模式字段，标准战斗恒 false）；
 *   5. colorChooser.prototypeNeedsColor 的 oneOf 分支 / ifCond 嵌套 CHOSEN 检测。
 * 与 spellRecyclePrimitives.test.ts 同一套纯原语 harness（种子化 rng、无 DOM）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { EffectContext } from '@engine/skills/effects/context';
import { selectTargets } from '@engine/skills/targeting';
import { executePrototype } from '@engine/skills/prototypes';
import { skill, dmg, destroyColor, createGems } from '@engine/skills/builders';
import { mostUsedManaColor } from '@engine/skills/effects/gems';
import { conditionMet, modifierBonus, type Condition } from '@engine/skills/effects/secondary';
import { prototypeNeedsColor } from '@engine/skills/colorChooser';

let gid = 0;
function g(type: GemType): { id: number; type: GemType } {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

interface SetupOpts {
  left?: Partial<Character>[];
  right?: Partial<Character>[];
  seed?: number;
  chosenColor?: BaseColor;
}

function setup(s: SetupOpts = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  gid = 0;
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(BaseColor.Red)));
  }
  const left: Team = { player: PlayerSide.Left, characters: (s.left ?? [{}]).map((o, i) => makeChar(i, o)) };
  const right: Team = { player: PlayerSide.Right, characters: (s.right ?? [{}, {}, {}]).map((o, i) => makeChar(i + 4, o)) };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: state.teams[PlayerSide.Left].characters[0].id,
    rng: new SeededRNG(s.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  if (s.chosenColor !== undefined) ctx.chosenColor = s.chosenColor;
  return { ctx, state };
}

function skillDamageTotal(events: GameEvent[]): number {
  return events.filter((e) => e.type === 'skill-damage').reduce((sum, e) => sum + (e as { damage: number }).damage, 0);
}

describe('R11 · enemyChosenAndAdjacent（编队前后各一位）', () => {
  it('选定中间敌人 → 前后各一位；首位 → 只有下一位；末位 → 只有上一位', () => {
    const { state } = setup({ right: [{}, {}, {}] });
    const rng = new SeededRNG(7);
    const alive = state.teams[PlayerSide.Right].characters;
    expect(selectTargets('enemyChosenAndAdjacent', state, 0, rng, 1, alive[1].id).map((c) => c.id))
      .toEqual([alive[0].id, alive[2].id]);
    expect(selectTargets('enemyChosenAndAdjacent', state, 0, rng, 1, alive[0].id).map((c) => c.id))
      .toEqual([alive[1].id]);
    expect(selectTargets('enemyChosenAndAdjacent', state, 0, rng, 1, alive[2].id).map((c) => c.id))
      .toEqual([alive[1].id]);
  });

  it('无选定 id / 选定者不在场 → 空数组（安全跳过）', () => {
    const { state } = setup({ right: [{}, {}] });
    const rng = new SeededRNG(7);
    expect(selectTargets('enemyChosenAndAdjacent', state, 0, rng, 1)).toEqual([]);
    expect(selectTargets('enemyChosenAndAdjacent', state, 0, rng, 1, 999).map((c) => c.id)).toEqual([]);
  });

  it('相邻按编队伍索引：中段阵亡者被跳过（索引闭合），效果只打存活邻居', () => {
    const { ctx, state } = setup({ right: [{ hp: 50 }, { hp: 50 }, { hp: 50 }] });
    const alive = state.teams[PlayerSide.Right].characters;
    // 中间敌人（id 5）被选定为相邻锚点不存在——改用选定 id 4（首位），其相邻 = 5
    const events = executePrototype(skill(dmg('enemyChosenAndAdjacent', 10, 0)), { ...ctx, chosenTargetId: alive[0].id });
    const hit = events.find((e) => e.type === 'skill-damage') as { targetId: number };
    expect(hit.targetId).toBe(alive[1].id);
  });
});

describe('R11 most-used mana color: troop composition, never cast history', () => {
  it('counts each living troop once per color, not the mana cost or prior casts', () => {
    const { state } = setup({
      right: [
        { colors: [BaseColor.Blue], manaCost: 4 },
        { colors: [BaseColor.Blue, BaseColor.Yellow], manaCost: 8 },
        { colors: [BaseColor.Yellow], manaCost: 50 },
        { colors: [BaseColor.Blue], manaCost: 5 },
      ],
    });
    expect(mostUsedManaColor(state, PlayerSide.Right, new SeededRNG(7))).toBe(BaseColor.Blue);
    state.actionLog.push({ index: 0, side: PlayerSide.Right,
      action: { type: 'cast', characterId: 6 }, outcome: 'held' });
    expect(mostUsedManaColor(state, PlayerSide.Right, new SeededRNG(7))).toBe(BaseColor.Blue);
  });

  it('resolves before any cast; ties are seeded draws, not first color order', () => {
    const { state } = setup({ right: [{ colors: [BaseColor.Green, BaseColor.Yellow] }] });
    const drawn = new Set(Array.from({ length: 32 }, (_, n) =>
      mostUsedManaColor(state, PlayerSide.Right, new SeededRNG(n + 1))));
    expect(drawn).toEqual(new Set([BaseColor.Green, BaseColor.Yellow]));
    expect(mostUsedManaColor(state, PlayerSide.Left, new SeededRNG(1))).toBe(BaseColor.Red);
    state.teams[PlayerSide.Right].characters[0].defeated = true;
    expect(mostUsedManaColor(state, PlayerSide.Right, new SeededRNG(1))).toBeNull();
  });

  it('ENEMY_MOST_USED destruction reads team composition without a cast', () => {
    const { ctx, state } = setup({ right: [{ colors: [BaseColor.Blue] }] });
    state.board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Blue)));
    executePrototype(skill(destroyColor('ENEMY_MOST_USED')), ctx);
    expect(state.board.get({ row: 0, col: 0 })).toBeNull();
    expect(state.board.get({ row: 1, col: 0 })).not.toBeNull();
  });

  it('secondary board count and gem effects share the same tie choice within a cast', () => {
    const { ctx, state } = setup({ right: [
      { colors: [BaseColor.Blue] }, { colors: [BaseColor.Yellow] },
    ] });
    ctx.castTracking = { destroyed: [], transformed: 0, drainedMana: 0,
      enemyDeaths: 0, allyDeaths: 0 };
    state.board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Blue)));
    state.board.set({ row: 0, col: 1 }, g(colorGem(BaseColor.Yellow)));
    state.board.set({ row: 0, col: 2 }, g(colorGem(BaseColor.Yellow)));
    const spec = { mod: { kind: 'multiplier' as const, a: 1 },
      source: { kind: 'boardGems' as const, color: 'ENEMY_MOST_USED' as const } };
    const first = modifierBonus(spec, ctx);
    const selected = ctx.castTracking.mostUsedManaColors?.[PlayerSide.Right];
    expect(first).toBe(selected === BaseColor.Blue ? 1 : 2);
    const randomState = ctx.rng.getState();
    expect(modifierBonus(spec, ctx)).toBe(first);
    expect(ctx.rng.getState()).toBe(randomState);
  });

  it('ALLY_MOST_USED creation selects current allied troop color', () => {
    const a = setup({ left: [{ colors: [BaseColor.Purple] }] });
    executePrototype(skill(createGems('ALLY_MOST_USED', 3, 0)), a.ctx);
    let created = 0;
    a.state.board.forEach((gem) => { if (gem && gem.type.kind === 'color' && gem.type.color === BaseColor.Purple) created++; });
    expect(created).toBeGreaterThanOrEqual(3);
  });
});

describe('R11 · targetColor 扩 CHOSEN（动态色目标）', () => {
  it('chosenColor=Yellow → 只打带黄法力色的敌人', () => {
    const { ctx } = setup({
      right: [{ colors: [BaseColor.Yellow] }, { colors: [BaseColor.Blue] }, { colors: [BaseColor.Yellow] }],
      chosenColor: BaseColor.Yellow,
    });
    const events = executePrototype(
      skill(dmg('enemyAll', 10, 0, { range: 'all', ifCond: { kind: 'targetColor', color: 'CHOSEN' } })),
      ctx,
    );
    expect(events.filter((e) => e.type === 'skill-damage').length).toBe(2);
  });

  it('未选色 → 条件不成立，整段静默跳过（零事件零伤害）', () => {
    const { ctx } = setup({ right: [{ colors: [BaseColor.Yellow] }] });
    const events = executePrototype(
      skill(dmg('enemyAll', 10, 0, { range: 'all', ifCond: { kind: 'targetColor', color: 'CHOSEN' } })),
      ctx,
    );
    expect(skillDamageTotal(events)).toBe(0);
  });

  it('prototypeNeedsColor：ifCond 嵌套 CHOSEN 与 oneOf 分支内 CHOSEN 均被检测', () => {
    const ifCondSpell = skill(dmg('enemyAll', 1, 0, { range: 'all', ifCond: { kind: 'targetColor', color: 'CHOSEN' } }));
    expect(prototypeNeedsColor(ifCondSpell)).toBe(true);
    const oneOfSpell = skill(
      createGems(BaseColor.Red, 1, 0),
      { kind: 'oneOf', options: [[createGems('CHOSEN', 1, 0)]] } as never,
    );
    expect(prototypeNeedsColor(oneOfSpell)).toBe(true);
    // 嵌套 not(… anyOf …) 也检测得到
    const nested = skill(dmg('enemyAll', 1, 0, {
      range: 'all',
      ifCond: { kind: 'not', cond: { kind: 'anyOf', of: [{ kind: 'targetColor', color: 'CHOSEN' }] } },
    }));
    expect(prototypeNeedsColor(nested)).toBe(true);
    // 固定色条件不触发选色
    const fixed = skill(dmg('enemyAll', 1, 0, { range: 'all', ifCond: { kind: 'targetColor', color: BaseColor.Red } }));
    expect(prototypeNeedsColor(fixed)).toBe(false);
  });
});

describe('R11 · regionPresent / ascended（模式专属条件建模）', () => {
  it('标准战斗：state 无 region/ascension → 恒 false（condMult 退化为原值）', () => {
    const { ctx } = setup({ right: [{ colors: [BaseColor.Red] }] });
    const cond: Condition = { kind: 'regionPresent', region: 'SummerIsle' };
    expect(conditionMet(cond, ctx)).toBe(false);
    const asc: Condition = { kind: 'ascended', min: 3 };
    expect(conditionMet(asc, ctx)).toBe(false);
    const events = executePrototype(
      skill(dmg('enemyChosen', 10, 0, { condMult: { times: 2, cond: asc } })),
      { ...ctx, chosenTargetId: 4 },
    );
    expect(skillDamageTotal(events)).toBe(10);
  });

  it('晋升模式字段挂上后条件成立（condMult ×倍生效）', () => {
    const { ctx, state } = setup({ right: [{ colors: [BaseColor.Red] }] });
    (state as { region?: string }).region = 'Geheron';
    (state as { ascension?: number }).ascension = 3;
    expect(conditionMet({ kind: 'regionPresent', region: 'Geheron' }, ctx)).toBe(true);
    expect(conditionMet({ kind: 'regionPresent', region: 'Aidania' }, ctx)).toBe(false);
    expect(conditionMet({ kind: 'ascended', min: 3 }, ctx)).toBe(true);
    expect(conditionMet({ kind: 'ascended', min: 5 }, ctx)).toBe(false);
    // Boss×升华复合条件（官方 MultiplyForAscensionBoss 建模）
    const bossAsc: Condition = {
      kind: 'allOf',
      of: [{ kind: 'targetRace', race: 'Boss' }, { kind: 'ascended', min: 3 }],
    };
    const events = executePrototype(
      skill(dmg('enemyChosen', 10, 0, { condMult: { times: 3, cond: bossAsc } })),
      { ...ctx, chosenTargetId: 4 },
    );
    expect(skillDamageTotal(events)).toBe(10); // 目标非 Boss → 不翻倍
    const b = setup({ right: [{ colors: [BaseColor.Red], troopTypes: ['Boss'] }] });
    (b.state as { ascension?: number }).ascension = 4;
    const boosted = executePrototype(
      skill(dmg('enemyChosen', 10, 0, { condMult: { times: 3, cond: bossAsc } })),
      { ...b.ctx, chosenTargetId: 4 },
    );
    expect(skillDamageTotal(boosted)).toBe(30);
  });
});
