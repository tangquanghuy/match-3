/**
 * 五机制单测（窗口 B）：二次缩放 / 概率子句 / 敌方削弱 / 死亡条件 / 种族翻倍。
 *
 * 边界用例按 DoD 要求覆盖：无资源时 [N:M] 退化为 0 加成（数值不变）、chance 0/1。
 * 全部走 executePrototype / 效果原语的纯逻辑路径，不经 TurnEngine。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { inflict, armor, createSpecialGems, destroyRandomSpecialGems, transformToSpecial } from '@engine/skills/builders';
import type { SkillPrototype } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { WEB_STATUS_ID } from '@engine/skills/effects/status';
import { BaseColor, PlayerSide, colorGem, skullGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
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
  /** 左方（施法方）角色覆盖项，按队伍位置 */
  left?: Partial<Character>[];
  /** 右方（敌方）角色覆盖项 */
  right?: Partial<Character>[];
  /** (r,c) → 宝石；默认全红 */
  board?: (r: number, c: number) => GemType;
  seed?: number;
}

function setup(s: Setup = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
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
  return { ctx, state };
}

const leftTeam = (state: ReturnType<typeof createGameState>) => state.teams[PlayerSide.Left].characters;
const rightTeam = (state: ReturnType<typeof createGameState>) => state.teams[PlayerSide.Right].characters;

// ───────────────────────── 1. 二次缩放 ─────────────────────────

describe('二次缩放（[xN]=每来源+N，[N:M]=每N来源+M）', () => {
  it('[x4] 摧毁段之后创造：每摧毁一颗紫色宝石 +4 颗骷髅（双头怪句式）', () => {
    // 棋盘第 3 行混入 3 颗紫色；摧毁该行 → 紫色来源 3 → 创造 0 + 4×3 = 12 颗骷髅
    const { ctx, state } = setup({
      board: (r, c) => (r === 3 && c < 3 ? colorGem(BaseColor.Purple) : colorGem(BaseColor.Red)),
    });
    const proto: SkillPrototype = {
      segments: [
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', rows: [3] } } },
        { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 0, mult: 0 }, modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } } } },
      ],
    };
    executePrototype(proto, ctx);
    const skulls = rightTeam(state).length; // 占位防未用
    expect(skulls).toBe(3);
    let skullCount = 0;
    state.board.forEach((gem) => { if (gem && gem.type.kind === 'skull') skullCount += 1; });
    expect(skullCount).toBe(12);
  });

  it('[N:M] 伤害因被摧毁宝石数而增强：每 2 颗 +1（术士句式）', () => {
    // 首行 8 颗红色、其余蓝色；摧毁全部红色（来源 8）→ [M] 6 + floor(8/2)×1 = 10 伤害
    const { ctx, state } = setup({
      board: (r) => (r === 0 ? colorGem(BaseColor.Red) : colorGem(BaseColor.Blue)),
      right: [{ hp: 50, armor: 0 }],
    });
    const proto: SkillPrototype = {
      segments: [
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'color', color: BaseColor.Red } } },
        { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } } },
      ],
    };
    executePrototype(proto, ctx);
    expect(rightTeam(state)[0].hp).toBe(40); // 50 - 10
  });

  it('无资源时退化为 0 加成（数值不变）', () => {
    // 无清除段 → destroyedGems 来源 = 0 → 伤害就是 [M+2] = 8
    const { ctx, state } = setup({ right: [{ hp: 50, armor: 0 }] });
    const proto: SkillPrototype = {
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Blue } } },
      ],
    };
    executePrototype(proto, ctx);
    expect(rightTeam(state)[0].hp).toBe(42);
  });

  it('boardSkulls / boardGems 来源按执行时刻棋盘计数', () => {
    // 棋盘 3 颗骷髅 + 造 2 骷髅后伤害：来源 = boardSkulls = 5 → [M] 6 + 2×5 = 16
    const { ctx, state } = setup({
      board: (r, c) => (r === 0 && c < 3 ? skullGem() : colorGem(BaseColor.Red)),
      right: [{ hp: 50, armor: 0 }],
    });
    const proto: SkillPrototype = {
      segments: [
        { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 2, mult: 0 } } },
        { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } } },
      ],
    };
    executePrototype(proto, ctx);
    expect(rightTeam(state)[0].hp).toBe(34);
  });

  it('selfStat / teamSize / drainedMana 来源', () => {
    // 自身攻击 5 → [M] 6 + 2×5 = 16
    const a = setup({ left: [{ attack: 5 }], right: [{ hp: 50, armor: 0 }] });
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'selfStat', stat: 'attack' } } }],
    }, a.ctx);
    expect(rightTeam(a.state)[0].hp).toBe(34);

    // 敌方 3 人 → [M] 6 + 1×3 = 9
    const b = setup({ right: [{}, {}, {}] });
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'teamSize', side: 'enemy' } } }],
    }, b.ctx);
    expect(rightTeam(b.state)[0].hp).toBe(41);

    // 耗蓝 7 → 伤害 [M] 6 + 1×7 = 13
    const c = setup({ right: [{ mana: 7, manaCost: 20 }] });
    executePrototype({
      segments: [
        { kind: 'reduce', target: 'enemyFront', stat: 'mana', scaling: { base: 0, mult: 0 }, drainAll: true },
        { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'drainedMana' } } },
      ],
    }, c.ctx);
    expect(rightTeam(c.state)[0].mana).toBe(0);
    expect(rightTeam(c.state)[0].hp).toBe(37);
  });
});

describe('多同类段 modifier 辖域（spell-rules §1 · 2026-09-16 裁定）', () => {
  it('点名「伤害效果」：同子句两段伤害都吃加成（7059/9344 锁死）', () => {
    // 首行 4 颗紫色；摧毁后来源 4 → [2:1] 每段 bonus = floor(4/2)×1 = 2
    // 两段 [M+1] = 7+2 = 9：front 与 last 各扣 9，中间不吃
    const { ctx, state } = setup({
      board: (r, c) => (r === 0 && c < 4 ? colorGem(BaseColor.Purple) : colorGem(BaseColor.Red)),
      right: [{ hp: 50, armor: 0 }, { hp: 50, armor: 0 }, { hp: 50, armor: 0 }],
    });
    const mod = { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } } as const;
    executePrototype({
      segments: [
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'color', color: BaseColor.Purple } } },
        { kind: 'damage', target: 'enemyFront', scaling: { base: 1, mult: 1 }, modifier: mod },
        { kind: 'damage', target: 'enemyLast', scaling: { base: 1, mult: 1 }, modifier: mod },
      ],
    }, ctx);
    expect(rightTeam(state)[0].hp).toBe(41);
    expect(rightTeam(state)[1].hp).toBe(50);
    expect(rightTeam(state)[2].hp).toBe(41);
  });

  it('对照：modifier 只挂一段时按段独立（未挂段吃基础值，8181 窃取段语义）', () => {
    // 同上但 front 段不挂 modifier：front = 7，last = 9
    const { ctx, state } = setup({
      board: (r, c) => (r === 0 && c < 4 ? colorGem(BaseColor.Purple) : colorGem(BaseColor.Red)),
      right: [{ hp: 50, armor: 0 }, { hp: 50, armor: 0 }, { hp: 50, armor: 0 }],
    });
    executePrototype({
      segments: [
        { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'color', color: BaseColor.Purple } } },
        { kind: 'damage', target: 'enemyFront', scaling: { base: 1, mult: 1 } },
        { kind: 'damage', target: 'enemyLast', scaling: { base: 1, mult: 1 }, modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems', color: BaseColor.Purple } } },
      ],
    }, ctx);
    expect(rightTeam(state)[0].hp).toBe(43);
    expect(rightTeam(state)[2].hp).toBe(41);
  });

  it('drainedMana 双方都计：耗尽盟友与敌军法力按总量结算（7807 口径锁死）', () => {
    // 盟友 5+3（allyAll 含施法者）、敌军 7 → 总 15；施法者 hp 30 → 治 [1:1]×15 = 15 → 45
    const { ctx, state } = setup({
      left: [{ hp: 30, mana: 5 }, { hp: 50, mana: 3 }],
      right: [{ mana: 7, manaCost: 20 }],
    });
    executePrototype({
      segments: [
        { kind: 'reduce', target: 'allyAll', stat: 'mana', scaling: { base: 0, mult: 0 }, drainAll: true },
        { kind: 'reduce', target: 'enemyAll', stat: 'mana', scaling: { base: 0, mult: 0 }, drainAll: true },
        { kind: 'buff', target: 'allySelf', stat: 'hp', scaling: { base: 0, mult: 0 }, modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'drainedMana' } } },
      ],
    }, ctx);
    expect(leftTeam(state)[0].mana).toBe(0);
    expect(leftTeam(state)[1].mana).toBe(0);
    expect(rightTeam(state)[0].mana).toBe(0);
    expect(leftTeam(state)[0].hp).toBe(45);
  });
});

// ───────────────────────── 2. 概率子句 ─────────────────────────

describe('概率子句（chance）', () => {
  it('chance=1 必发；chance=0 恒不发（不发事件）', () => {
    const always = setup({ right: [{ hp: 50, armor: 0 }] });
    const ev1 = executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, chance: 1 }],
    }, always.ctx);
    expect(ev1.some((e) => e.type === 'skill-damage')).toBe(true);
    expect(rightTeam(always.state)[0].hp).toBe(42);

    const never = setup({ right: [{ hp: 50, armor: 0 }] });
    const ev0 = executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, chance: 0 }],
    }, never.ctx);
    expect(ev0).toHaveLength(0);
    expect(rightTeam(never.state)[0].hp).toBe(50);
  });

  it('同种子确定性：chance 命中与否可复现', () => {
    const proto: SkillPrototype = {
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, chance: 0.5 }],
    };
    const a = setup({ seed: 42, right: [{ hp: 50, armor: 0 }] });
    const b = setup({ seed: 42, right: [{ hp: 50, armor: 0 }] });
    const ea = executePrototype(proto, a.ctx);
    const eb = executePrototype(proto, b.ctx);
    expect(ea).toEqual(eb);
  });

  it('chance 跳过的段不更新死亡条件追踪', () => {
    // 第 1 段 chance=0 跳过 → lastTarget 不产生 → 第 2 段 ifTargetDied 无从成立
    const { ctx, state } = setup({ right: [{ hp: 1 }] });
    const events = executePrototype({
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, chance: 0 },
        { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 5, mult: 0 } }, ifTargetDied: true },
      ],
    }, ctx);
    expect(events).toHaveLength(0);
    expect(rightTeam(state)[0].defeated).toBe(false);
  });
});

// ───────────────────────── 3. 敌方削弱 ─────────────────────────

describe('敌方削弱家族（reduce/drain/steal）', () => {
  it('减护甲夹零；减到负不动', () => {
    const { ctx, state } = setup({ right: [{ armor: 3 }] });
    executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'armor', scaling: { base: 5, mult: 0 } }],
    }, ctx);
    expect(rightTeam(state)[0].armor).toBe(0);
  });

  it('耗蓝清到 0 为止，不发超额事件', () => {
    const { ctx, state } = setup({ right: [{ mana: 4, manaCost: 20 }] });
    const events = executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'mana', scaling: { base: 9, mult: 0 } }],
    }, ctx);
    expect(rightTeam(state)[0].mana).toBe(0);
    const buffs = events.filter((e) => e.type === 'buff');
    expect(buffs).toEqual([{ type: 'buff', targetId: 4, stat: 'mana', amount: -4 }]);
  });

  it('窃取：目标减甲、自身转魔法（萨梯句式）', () => {
    const { ctx, state } = setup({ left: [{ magic: 1 }], right: [{ armor: 6 }] });
    executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'armor', scaling: { base: 2, mult: 0 }, gainStat: 'magic' }],
    }, ctx);
    expect(rightTeam(state)[0].armor).toBe(4);
    expect(leftTeam(state)[0].magic).toBe(3);
  });

  it('被织网者仍可被耗蓝（web 锁 magic 增益，不锁 mana 充能）', () => {
    const { ctx, state } = setup({ right: [{ mana: 9, manaCost: 20, statuses: [{ id: WEB_STATUS_ID, turns: 3 }] }] });
    const events = executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'mana', scaling: { base: 5, mult: 0 } }],
    }, ctx);
    expect(rightTeam(state)[0].mana).toBe(4);
    expect(events.some((e) => e.type === 'buff' && e.amount === -5)).toBe(true);
  });

  it('施法者被织网时，窃取转 magic 的自身获得被拦截为 0', () => {
    const { ctx, state } = setup({ left: [{ magic: 0, statuses: [{ id: WEB_STATUS_ID, turns: 3 }] }], right: [{ armor: 6 }] });
    const events = executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'armor', scaling: { base: 2, mult: 0 }, gainStat: 'magic' }],
    }, ctx);
    // 目标照常被削
    expect(rightTeam(state)[0].armor).toBe(4);
    // 施法者 magic 无增益、无正向 buff 事件
    expect(leftTeam(state)[0].magic).toBe(0);
    expect(events.filter((e) => e.type === 'buff' && e.amount > 0)).toHaveLength(0);
  });

  it('目标属性为 0 时无事发生（无事件）', () => {
    const { ctx, state } = setup({ right: [{ armor: 0 }] });
    const events = executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'armor', scaling: { base: 5, mult: 0 } }],
    }, ctx);
    expect(events).toHaveLength(0);
    expect(rightTeam(state)[0].armor).toBe(0);
  });
});

// ───────────────────────── 4. 死亡条件 ─────────────────────────

describe('死亡/阵亡条件（ifTargetDied）', () => {
  it('主目标被前段击杀 → 条件段生效（远古恐惧句式）', () => {
    const { ctx, state } = setup({ right: [{ hp: 3, armor: 0 }] });
    const events = executePrototype({
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 3, mult: 0 } },
        { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 5, mult: 0 } }, ifTargetDied: true },
      ],
    }, ctx);
    // 阵亡者被移出队伍；条件段照常执行
    expect(rightTeam(state)).toHaveLength(0);
    expect(events.some((e) => e.type === 'defeat')).toBe(true);
    let skulls = 0;
    state.board.forEach((gem) => { if (gem && gem.type.kind === 'skull') skulls += 1; });
    expect(skulls).toBe(5);
  });

  it('主目标未死 → 条件段跳过（伤害段本身的事件照常）', () => {
    const { ctx, state } = setup({ right: [{ hp: 50, armor: 0 }] });
    const events = executePrototype({
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 3, mult: 0 } },
        { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 5, mult: 0 } }, ifTargetDied: true },
      ],
    }, ctx);
    expect(rightTeam(state)[0].defeated).toBe(false);
    expect(events.some((e) => e.type === 'gem-create')).toBe(false);
  });

  it('条件以「最近产目标段的主目标」为准（被后段覆盖）', () => {
    const { ctx, state } = setup({ right: [{ hp: 50, armor: 0 }, { hp: 3, armor: 0 }] });
    const events = executePrototype({
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 1, mult: 0 } }, // 主目标=第一个，未死
        { kind: 'damage', target: 'enemyWeakest', scaling: { base: 10, mult: 0 } }, // 打死最弱者，覆盖 lastTarget
        { kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 5, mult: 0 } }, ifTargetDied: true },
      ],
    }, ctx);
    expect(events.some((e) => e.type === 'defeat')).toBe(true);
    let skulls = 0;
    state.board.forEach((gem) => { if (gem && gem.type.kind === 'skull') skulls += 1; });
    expect(skulls).toBe(5);
  });

  it('额外回合可挂死亡条件（战斗之神句式）', () => {
    const { ctx, state } = setup({ right: [{ hp: 1, armor: 0 }] });
    const events = executePrototype({
      segments: [
        { kind: 'damage', target: 'enemyFront', scaling: { base: 6, mult: 0 } },
        { kind: 'extraTurn', ifTargetDied: true },
      ],
    }, ctx);
    expect(rightTeam(state)).toHaveLength(0);
    expect(events.some((e) => e.type === 'extra-turn')).toBe(true);
  });
});

// ───────────────────────── 5. 种族翻倍 ─────────────────────────

describe('种族条件翻倍（raceDouble）', () => {
  it('增益段：目标含该族数值 ×2，不含则原值（升级句式）', () => {
    const { ctx, state } = setup({ left: [{ magic: 3 }, {}], right: [] });
    leftTeam(state)[1].troopTypes = ['Construct'];
    const events = executePrototype({
      segments: [{ kind: 'buff', target: 'allyAll', stat: 'attack', scaling: { base: 3, mult: 0 }, raceDouble: 'Construct' }],
    }, ctx);
    // 自己（无种族）+3；机械盟友 ×2 = +6
    expect(leftTeam(state)[0].attack).toBe(5 + 3);
    expect(leftTeam(state)[1].attack).toBe(5 + 6);
    const buffs = events.filter((e) => e.type === 'buff');
    expect(buffs.map((e) => (e as { amount: number }).amount).sort()).toEqual([3, 6]);
  });

  it('伤害段：受击者含该族其所受伤害 ×2，群体段逐个判定', () => {
    const { ctx, state } = setup({ right: [{ troopTypes: ['Giant'] }, {}] });
    rightTeam(state)[1].troopTypes = [];
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyAll', range: 'all', scaling: { base: 2, mult: 0 }, raceDouble: 'Giant' }],
    }, ctx);
    expect(rightTeam(state)[0].hp).toBe(50 - 4); // 巨人 ×2
    expect(rightTeam(state)[1].hp).toBe(50 - 2);
  });
});

// ───────────────────────── 6. 通用条件触发与条件加成 ─────────────────────────

describe('通用条件触发（ifCond）与条件加成（condBonus）', () => {
  it('ifCond 目标相对条件：按该段自己的目标过滤（「若敌人已被冻结，则窃取」）', () => {
    // 冻结的敌人 → 条件成立，执行窃取
    const a = setup({ right: [{ statuses: [{ id: 'frozen', turns: 2 }], magic: 4 }] });
    const evA = executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'magic', scaling: { base: 3, mult: 0 }, ifCond: { kind: 'targetStatus', statusId: 'frozen' } }],
    }, a.ctx);
    expect(rightTeam(a.state)[0].magic).toBe(1);
    expect(evA.some((e) => e.type === 'buff' && e.amount === -3)).toBe(true);

    // 未冻结 → 条件不成立，静默跳过（无事件、数值不变）
    const b = setup({ right: [{ magic: 4 }] });
    const evB = executePrototype({
      segments: [{ kind: 'reduce', target: 'enemyFront', stat: 'magic', scaling: { base: 3, mult: 0 }, ifCond: { kind: 'targetStatus', statusId: 'frozen' } }],
    }, b.ctx);
    expect(rightTeam(b.state)[0].magic).toBe(4);
    expect(evB).toHaveLength(0);
  });

  it('ifCond 全局条件：整段判定（「板面上有 ≥13 颗红宝石，则额外回合」）', () => {
    const proto = (cond: { kind: 'boardAtLeast'; color?: string; n: number }) => ({
      segments: [{ kind: 'extraTurn', ifCond: cond }],
    });
    // 全红棋盘 = 64 颗 ≥ 13 → 执行
    const a = setup({});
    const evA = executePrototype(proto({ kind: 'boardAtLeast', color: 'Red', n: 13 }) as never, a.ctx);
    expect(evA.some((e) => e.type === 'extra-turn')).toBe(true);
    // 蓝色 0 颗 < 13 → 跳过
    const b = setup({});
    const evB = executePrototype(proto({ kind: 'boardAtLeast', color: 'Blue', n: 13 }) as never, b.ctx);
    expect(evB).toHaveLength(0);
  });

  it('ifCond 目标已受伤（targetHpDamaged）', () => {
    const a = setup({ right: [{ hp: 30 }] });
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 6, mult: 0 }, ifCond: { kind: 'targetHpDamaged' } }],
    }, a.ctx);
    expect(rightTeam(a.state)[0].hp).toBe(24);

    const b = setup({ right: [{ hp: 50, maxHp: 50 }] });
    const evB = executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 6, mult: 0 }, ifCond: { kind: 'targetHpDamaged' } }],
    }, b.ctx);
    expect(rightTeam(b.state)[0].hp).toBe(50);
    expect(evB).toHaveLength(0);
  });

  it('ifCond 目标相对条件挂在无目标段（gem）→ 整段跳过', () => {
    const { ctx, state } = setup({});
    const events = executePrototype({
      segments: [{ kind: 'gem', params: { op: 'create', gem: { kind: 'skull' }, count: { base: 3, mult: 0 } }, ifCond: { kind: 'targetStatus', statusId: 'frozen' } }],
    }, ctx);
    expect(events).toHaveLength(0);
    let skulls = 0;
    state.board.forEach((gem) => { if (gem && gem.type.kind === 'skull') skulls += 1; });
    expect(skulls).toBe(0);
  });

  it('condBonus：「若敌人已受伤，伤害 +8」（b02:7012 句式）', () => {
    const a = setup({ right: [{ hp: 40 }] });
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, condBonus: { n: 8, cond: { kind: 'targetHpDamaged' } } }],
    }, a.ctx);
    // caster magic=6 → 8 + 8 = 16
    expect(rightTeam(a.state)[0].hp).toBe(24);

    const b = setup({ right: [{ hp: 50, maxHp: 50 }] });
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 }, condBonus: { n: 8, cond: { kind: 'targetHpDamaged' } } }],
    }, b.ctx);
    expect(rightTeam(b.state)[0].hp).toBe(42); // 仅 8
  });

  it('叠加顺序：(基础值 + 条件加成) × 条件倍率', () => {
    // magic=6 → 基础 6，+10 = 16，×3 = 48
    const { ctx, state } = setup({ right: [{ hp: 90, maxHp: 100, statuses: [{ id: 'entangle', turns: 2 }] }] });
    executePrototype({
      segments: [{
        kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 },
        condBonus: { n: 10, cond: { kind: 'targetHpDamaged' } },
        condMult: { times: 3, cond: { kind: 'targetStatus', statusId: 'entangle' } },
      }],
    }, ctx);
    expect(rightTeam(state)[0].hp).toBe(42);
  });
});

// ───────────────────────── 7. 条件组合与状态叠层 ─────────────────────────

describe('条件组合（anyOf/allOf）与己方种族在场', () => {
  it('anyOf：「若敌人是兽人或恶魔，则窃取」（b12:7236 句式）', () => {
    const cond = { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Orc' }, { kind: 'targetRace', race: 'Daemon' }] };
    const seg = (target: 'enemyFront') => ({
      kind: 'reduce' as const, target, stat: 'magic' as const, scaling: { base: 4, mult: 0 }, ifCond: cond,
    });
    // 恶魔敌人 → 命中
    const a = setup({ right: [{ magic: 6, troopTypes: ['Daemon'] }] });
    executePrototype({ segments: [seg('enemyFront')] } as never, a.ctx);
    expect(rightTeam(a.state)[0].magic).toBe(2);
    // 人类敌人 → 跳过
    const b = setup({ right: [{ magic: 6, troopTypes: ['Human'] }] });
    const evB = executePrototype({ segments: [seg('enemyFront')] } as never, b.ctx);
    expect(rightTeam(b.state)[0].magic).toBe(6);
    expect(evB).toHaveLength(0);
  });

  it('allOf：全部子条件成立才执行', () => {
    const cond = { kind: 'allOf' as const, of: [{ kind: 'targetStatus' as const, statusId: 'poison' }, { kind: 'targetHpDamaged' as const }] };
    // 中毒 + 残血 → 执行
    const a = setup({ right: [{ hp: 30, statuses: [{ id: 'poison', turns: 2 }] }] });
    executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 5, mult: 0 }, ifCond: cond }],
    }, a.ctx);
    expect(rightTeam(a.state)[0].hp).toBe(25);
    // 中毒但满血 → 跳过
    const b = setup({ right: [{ hp: 50, maxHp: 50, statuses: [{ id: 'poison', turns: 2 }] }] });
    const evB = executePrototype({
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 5, mult: 0 }, ifCond: cond }],
    }, b.ctx);
    expect(evB).toHaveLength(0);
  });

  it('allyRacePresent：「如果己方有龙族军队」（b27:8688 句式）', () => {
    // 己方有巨兽（Beast）
    const a = setup({ left: [{}, { troopTypes: ['Beast'] }] });
    const evA = executePrototype({ segments: [armor('allySelf', 8, 0, { ifCond: { kind: 'allyRacePresent', race: 'Beast' } })] }, a.ctx);
    expect(evA.some((e) => e.type === 'buff')).toBe(true);
    // 己方无该族 → 跳过
    const b = setup({ left: [{}, {}] });
    const evB = executePrototype({ segments: [armor('allySelf', 8, 0, { ifCond: { kind: 'allyRacePresent', race: 'Beast' } })] }, b.ctx);
    expect(evB).toHaveLength(0);
  });
});

describe('状态叠加层数（stacks）', () => {
  it('「陷入 2 层流血」→ magnitude 2，每回合结算 2 点', () => {
    const { ctx, state } = setup({ right: [{ hp: 50 }] });
    executePrototype({
      segments: [inflict('bleed', 'enemyFront', { turns: 3, stacks: 2 })],
    }, ctx);
    const st = rightTeam(state)[0].statuses.find((x) => x.id === 'bleed');
    expect(st?.magnitude).toBe(2);
  });

  it('同 id 叠层再施加 → magnitude 累加、回合取 max（2 层 + 3 层 = 5）', () => {
    const { ctx, state } = setup({ right: [{ hp: 50 }] });
    executePrototype({
      segments: [
        inflict('bleed', 'enemyFront', { turns: 2, stacks: 2 }),
        inflict('bleed', 'enemyFront', { turns: 4, stacks: 3 }),
      ],
    }, ctx);
    const st = rightTeam(state)[0].statuses.find((x) => x.id === 'bleed');
    expect(st?.magnitude).toBe(5);
    expect(st?.turns).toBe(4);
  });

  it('非 stacks 施加维持 max 合并（web 语义回归）', () => {
    const { ctx, state } = setup({ right: [{ hp: 50 }] });
    executePrototype({
      segments: [
        inflict('poison', 'enemyFront', { turns: 2, magnitude: 2 }),
        inflict('poison', 'enemyFront', { turns: 3, magnitude: 5 }),
      ],
    }, ctx);
    const st = rightTeam(state)[0].statuses.find((x) => x.id === 'poison');
    expect(st?.magnitude).toBe(5); // max，而非 7
    expect(st?.turns).toBe(3);
  });

  it('「3 次叠加中毒」= 每层默认 3 × 3 层 = 9', () => {
    const { ctx, state } = setup({ right: [{ hp: 50 }] });
    executePrototype({
      segments: [inflict('poison', 'enemyFront', { turns: 3, stacks: 3 })],
    }, ctx);
    const st = rightTeam(state)[0].statuses.find((x) => x.id === 'poison');
    expect(st?.magnitude).toBe(9);
  });

  it('bleed 单层施加默认 1 点（官方每回合 1 伤/层）', () => {
    const { ctx, state } = setup({ right: [{ hp: 50 }] });
    executePrototype({
      segments: [inflict('bleed', 'enemyFront', { turns: 3 })],
    }, ctx);
    const st = rightTeam(state)[0].statuses.find((x) => x.id === 'bleed');
    expect(st?.magnitude).toBe(1);
  });
});

// ───────────────────────── 8. 特殊宝石创造（窗口 C spec 接入） ─────────────────────────

describe('特殊宝石创造（createSpecialGems）', () => {
  it('「创造 2 颗炸弹宝石」→ gem-create 产出 special bomb', () => {
    const { ctx, state } = setup({});
    state.board.set({ row: 0, col: 0 }, null);
    state.board.set({ row: 0, col: 1 }, null);
    const events = executePrototype({
      segments: [createSpecialGems({ kind: 'bomb' }, 2)],
    }, ctx);
    const create = events.find((e) => e.type === 'gem-create');
    expect(create).toBeDefined();
    const spawns = (create as { spawns: { gemType: { kind: string; spec?: { kind: string } } }[] }).spawns;
    expect(spawns).toHaveLength(2);
    expect(spawns.every((x) => x.gemType.kind === 'special' && x.gemType.spec?.kind === 'bomb')).toBe(true);
    // 棋盘上确实多了两颗炸弹
    let bombs = 0;
    state.board.forEach((gem) => { if (gem && gem.type.kind === 'special' && gem.type.spec.kind === 'bomb') bombs += 1; });
    expect(bombs).toBe(2);
  });

  it('末日骷髅计入 boardSkulls 二次缩放来源（isSameMatchType 同族）', () => {
    const { ctx, state } = setup({ right: [{ hp: 60, armor: 0 }] });
    executePrototype({
      segments: [
        createSpecialGems({ kind: 'doomSkull' }, 2),
        { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSkulls' } } },
      ],
    }, ctx);
    // 基础 6 + 2×2（棋盘 2 颗末日骷髅，同族计入骷髅数）= 10
    expect(rightTeam(state)[0].hp).toBe(50);
  });

  it('通配宝石带 tier 构造', () => {
    const { ctx, state } = setup({});
    state.board.set({ row: 0, col: 0 }, null);
    executePrototype({
      segments: [createSpecialGems({ kind: 'wildcard', tier: 4 }, 1)],
    }, ctx);
    let tier: number | undefined;
    state.board.forEach((gem) => {
      const t = gem?.type;
      if (t && t.kind === 'special' && t.spec.kind === 'wildcard') tier = t.spec.tier;
    });
    expect(tier).toBe(4);
  });

  it('「摧毁 3 颗末日骷髅头」→ 定量随机清除限定种类', () => {
    const { ctx, state } = setup({ board: (r, c) => (r === 0 && c < 3 ? { kind: 'special', spec: { kind: 'doomSkull' } } : colorGem(BaseColor.Red)) });
    const events = executePrototype({
      segments: [destroyRandomSpecialGems('doomSkull', 2)],
    }, ctx);
    const destroy = events.find((e) => e.type === 'gem-destroy');
    expect(destroy).toBeDefined();
    const destroyed = (destroy as { cells: { gemType: { kind: string; spec?: { kind: string } } }[] }).cells;
    expect(destroyed).toHaveLength(2);
    expect(destroyed.every((x) => x.gemType.kind === 'special' && x.gemType.spec?.kind === 'doomSkull')).toBe(true);
    // 棋盘只剩 1 颗末日骷髅
    let left = 0;
    state.board.forEach((gem) => { if (gem && gem.type.kind === 'special' && gem.type.spec.kind === 'doomSkull') left += 1; });
    expect(left).toBe(1);
  });

  it('「将所有骷髅头转换成末日骷髅头」→ transformToSpecial', () => {
    const { ctx, state } = setup({ board: (r, c) => (r === 0 && c < 2 ? { kind: 'skull', variant: 'normal' } : colorGem(BaseColor.Red)) });
    executePrototype({
      segments: [transformToSpecial('SKULL', 'doomSkull')],
    }, ctx);
    let doom = 0;
    let plainSkulls = 0;
    state.board.forEach((gem) => {
      if (!gem) return;
      if (gem.type.kind === 'special' && gem.type.spec.kind === 'doomSkull') doom += 1;
      if (gem.type.kind === 'skull') plainSkulls += 1;
    });
    expect(doom).toBe(2);
    expect(plainSkulls).toBe(0);
  });

  it('boardSpecial 来源：「因炸弹宝石数而增强」', () => {
    const { ctx, state } = setup({ right: [{ hp: 60, armor: 0 }] });
    executePrototype({
      segments: [
        createSpecialGems({ kind: 'bomb' }, 3),
        { kind: 'damage', target: 'enemyFront', scaling: { base: 0, mult: 1 }, modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'bomb' } } },
      ],
    }, ctx);
    // 基础 6 + 2×3 = 12
    expect(rightTeam(state)[0].hp).toBe(48);
  });

});
