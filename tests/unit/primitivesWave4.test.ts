/**
 * 原语 Wave4 批单元测试（2026-09-18）——七项机制补全：
 *  1. 王国归属：条件 kingdomOf（官方 9593 Seaborn Knight「If the Enemy is from Merlantis」
 *     的 side-scoped 口径）+ 来源 alliesOfKingdom/enemiesOfKingdom（官方 9588 Dugall
 *     Ramhorn「boosted by Dhrak-Zum Allies」）；CombatantSnapshot.kingdom 搬运。
 *  2. 逐颗宝石驱动施加：StatusSegment.perDestroyed（官方 7463 Infernal Drill / 9287 /
 *     8804 Poison Stone 的 InflictEffectOnRandomTroops + UseCounterForAmount 步骤）。
 *  3. 特殊↔特殊转换：convertSpecial（官方 8801 Crypt of Despair「Convert 4 Stone Blocks
 *     to either Good or Evil Gargoyle Gems」，kind 精确对位 + tiers 整段掷签）。
 *  4. 选定单格转换：transform from 'CELL'（官方 9638 Shining Light「Choose a Gem. Convert
 *     it…」，BoardTarget SingleGem + Color1 FromTarget）。
 *  5. 动态编队第 N 位：reposition n（官方 8101 Tricky Blow 两轮 TroopOrderBack）。
 *  6. 跨段数值绑定：lastReduce（官方 7507 句式「减除其 [魔法 + 2] 点生命值并将之转化为
 *     攻击力」——增益 = 实际削减额）。
 *  7. 击杀几率（10061）：引擎 chance 即概率段级管线，无上限语义（本文件不重复覆盖，
 *     见 dmg execute/chance 既有用例）。
 * 与 primitivesWave3.test.ts 同一套纯原语 harness（种子化 rng、无 DOM、零引擎注入）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { EffectContext } from '@engine/skills/effects/context';
import { executePrototype } from '@engine/skills/prototypes';
import {
  skill, dmg, attack, reduce, inflict, inflictRandom, destroyColor, destroySkulls,
  convertSpecial, transformToSpecial, transform, reposition,
} from '@engine/skills/builders';
import { prototypeNeedsCell } from '@engine/skills/cellChooser';
import { snapshotToCharacter } from '@session/combatantMapping';

let gid = 0;
function g(type: GemType): { id: number; type: GemType } {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 3, magic: 2,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

interface SetupOpts {
  left?: Partial<Character>[];
  right?: Partial<Character>[];
  seed?: number;
  chosenTargetId?: number;
  chosenCell?: { row: number; col: number };
  boardColor?: BaseColor;
}

function setup(s: SetupOpts = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  gid = 0;
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(s.boardColor ?? BaseColor.Red)));
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
  if (s.chosenTargetId !== undefined) ctx.chosenTargetId = s.chosenTargetId;
  if (s.chosenCell !== undefined) ctx.chosenCell = s.chosenCell;
  return { ctx, state };
}

function gemAt(state: ReturnType<typeof createGameState>, row: number, col: number) {
  return state.board.get({ row, col });
}

function orderOf(state: ReturnType<typeof createGameState>, side: PlayerSide): number[] {
  return state.teams[side].characters.map((c) => c.id);
}

// —— 机制 1 · 王国归属（kingdomOf 条件 + alliesOf/enemiesOfKingdom 来源） ——

describe('Wave4 · kingdomOf 王国在场条件（9588/9593 王国家族）', () => {
  it("side:'enemy'：敌方存活者存在该王国成员才执行（「If the Enemy is from Merlantis」）", () => {
    const hit = setup({ seed: 7, right: [{ kingdom: 'Merlantis' }, {}, {}] });
    const ev = executePrototype(skill(dmg('enemyFront', 5, 0, {
      ifCond: { kind: 'kingdomOf', side: 'enemy', kingdom: 'Merlantis' },
    })), hit.ctx);
    expect(ev.some((e) => e.type === 'skill-damage')).toBe(true);

    const miss = setup({ seed: 7, right: [{ kingdom: 'Dhrak-Zum' }, {}, {}] });
    const ev2 = executePrototype(skill(dmg('enemyFront', 5, 0, {
      ifCond: { kind: 'kingdomOf', side: 'enemy', kingdom: 'Merlantis' },
    })), miss.ctx);
    expect(ev2.some((e) => e.type === 'skill-damage')).toBe(false);
  });

  it("side:'ally'：己方一侧判定；阵亡成员不计入存活筛选", () => {
    const ok = setup({ seed: 7, left: [{ kingdom: 'Merlantis' }, {}, {}] });
    const ev = executePrototype(skill(attack('allySelf', 1, 0, {
      ifCond: { kind: 'kingdomOf', side: 'ally', kingdom: 'Merlantis' },
    })), ok.ctx);
    expect(ev.some((e) => e.type === 'buff' && e.stat === 'attack')).toBe(true);

    const deadOnly = setup({
      seed: 7,
      left: [{ kingdom: 'Merlantis', defeated: true }, {}, {}],
      right: [{}, {}, {}],
    });
    const ev2 = executePrototype(skill(attack('allySelf', 1, 0, {
      ifCond: { kind: 'kingdomOf', side: 'ally', kingdom: 'Merlantis' },
    })), deadOnly.ctx);
    expect(ev2.some((e) => e.type === 'buff')).toBe(false);
  });

  it('alliesOfKingdom 来源：施法方该王国存活盟友数计数（9588「Dhrak-Zum Allies」）', () => {
    const { ctx } = setup({
      seed: 7,
      left: [{ kingdom: 'Dhrak-Zum' }, { kingdom: 'Dhrak-Zum' }, { kingdom: 'Aidania' }],
    });
    const events = executePrototype(skill(attack('allySelf', 0, 0, {
      modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'alliesOfKingdom', kingdom: 'Dhrak-Zum' } },
    })), ctx);
    const buff = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(buff.amount).toBe(8); // 2 名 Dhrak-Zum 盟友 × 4
  });

  it('enemiesOfKingdom 来源：敌方该王国存活计数（与 enemiesOfColor 对称）', () => {
    const { ctx } = setup({
      seed: 7,
      right: [{ kingdom: 'Merlantis' }, { kingdom: 'Merlantis' }, {}],
    });
    const events = executePrototype(skill(dmg('enemyFront', 0, 0, {
      modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemiesOfKingdom', kingdom: 'Merlantis' } },
    })), ctx);
    const dmgEv = events.find((e) => e.type === 'skill-damage') as { damage: number };
    expect(dmgEv.damage).toBe(6); // 2 名 Merlantis 敌人 × 3
  });

  it('CombatantSnapshot.kingdom 搬运：快照携带 → Character.kingdom；未携带 → 不写键', () => {
    const withKingdom = snapshotToCharacter({
      externalId: 'e1', name: 'N', stats: { hp: 10, attack: 2, armor: 1, magic: 3 },
      manaColors: [BaseColor.Red], manaCost: 10, kingdom: 'Merlantis',
    }, 0);
    expect(withKingdom.kingdom).toBe('Merlantis');
    const without = snapshotToCharacter({
      externalId: 'e2', name: 'N', stats: { hp: 10, attack: 2, armor: 1, magic: 3 },
      manaColors: [BaseColor.Red], manaCost: 10,
    }, 1);
    expect('kingdom' in without).toBe(false);
  });
});

// —— 机制 2 · 逐颗宝石驱动施加（perDestroyed） ——

describe('Wave4 · perDestroyed 逐颗摧毁驱动施加（7463/9287/8804 族）', () => {
  it('7463 句式：摧毁 2 颗黄宝石 → 随机盟友各获 1 次屏障（共 2 次 status-apply）', () => {
    const { ctx, state } = setup({ seed: 7, left: [{}, {}, {}] });
    state.board.set({ row: 1, col: 1 }, g(colorGem(BaseColor.Yellow)));
    state.board.set({ row: 5, col: 5 }, g(colorGem(BaseColor.Yellow)));
    const events = executePrototype(skill(
      destroyColor(BaseColor.Yellow),
      inflict('barrier', 'allyAll', { perDestroyed: { color: BaseColor.Yellow } }),
    ), ctx);
    const applies = events.filter((e) => e.type === 'status-apply' && e.statusId === 'barrier') as { targetId: number }[];
    expect(applies.length).toBe(2);
    // 目标落在盟友池内（左侧 3 人）
    const allyIds = new Set(state.teams[PlayerSide.Left].characters.map((c) => c.id));
    for (const e of applies) expect(allyIds.has(e.targetId)).toBe(true);
  });

  it('可重复同目标：单一目标池 + 计数 3 → 同一目标连吃 3 次（放回掷选）', () => {
    const s2 = setup({ seed: 7, right: [{}] });
    s2.state.board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Green)));
    s2.state.board.set({ row: 0, col: 1 }, g(colorGem(BaseColor.Green)));
    s2.state.board.set({ row: 0, col: 2 }, g(colorGem(BaseColor.Green)));
    const ev2 = executePrototype(skill(
      destroyColor(BaseColor.Green),
      inflict('poison', 'enemyAll', { perDestroyed: { color: BaseColor.Green } }),
    ), s2.ctx);
    const applies = ev2.filter((e) => e.type === 'status-apply' && e.statusId === 'poison') as { targetId: number }[];
    expect(applies.length).toBe(3);
    for (const e of applies) expect(e.targetId).toBe(4); // 唯一敌人 id=4
  });

  it("'skull' 筛骷髅族：摧毁的骷髅计入、色宝石不计", () => {
    const { ctx, state } = setup({ seed: 7, right: [{}] });
    state.board.set({ row: 2, col: 2 }, g({ kind: 'skull', variant: 'normal' }));
    state.board.set({ row: 3, col: 3 }, g({ kind: 'skull', variant: 'normal' }));
    const events = executePrototype(skill(
      destroySkulls(),
      inflict('stun', 'enemyAll', { perDestroyed: { color: 'skull' }, turns: 1 }),
    ), ctx);
    const applies = events.filter((e) => e.type === 'status-apply' && e.statusId === 'stun');
    expect(applies.length).toBe(2);
    expect(state.teams[PlayerSide.Right].characters[0].statuses.some((s) => s.id === 'stun')).toBe(true);
  });

  it('计数为 0 → 零事件且零 rng 消耗（后续段的随机序列与空段一致）', () => {
    // 全红盘：蓝宝石摧毁 0 颗 → perDestroyed Red 计数 0。若该路径偷耗 rng，
    // 后续 inflictRandom 的掷签序列会与「不跑这段」的基线错位。
    const run = (withCountSegment: boolean) => {
      const { ctx } = setup({ seed: 7 });
      return executePrototype(skill(
        ...(withCountSegment
          ? [destroyColor(BaseColor.Blue), inflict('barrier', 'allyAll', { perDestroyed: { color: BaseColor.Red } })]
          : []),
        inflictRandom('enemyRandom'),
      ), ctx).filter((e) => e.type === 'status-apply').map((e) => e.statusId).join(',');
    };
    expect(run(true)).toBe(run(false));
  });

  it('确定性：同种子 → 目标落点序列完全一致', () => {
    const run = () => {
      const s = setup({ seed: 11, left: [{}, {}, {}] });
      s.state.board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Yellow)));
      s.state.board.set({ row: 1, col: 1 }, g(colorGem(BaseColor.Yellow)));
      s.state.board.set({ row: 2, col: 2 }, g(colorGem(BaseColor.Yellow)));
      return executePrototype(skill(
        destroyColor(BaseColor.Yellow),
        inflict('barrier', 'allyAll', { perDestroyed: { color: BaseColor.Yellow } }),
      ), s.ctx).filter((e) => e.type === 'status-apply').map((e) => e.targetId).join(',');
    };
    expect(run()).toBe(run());
  });
});

// —— 机制 3 · 特殊↔特殊转换（convertSpecial + tiers） ——

describe('Wave4 · convertSpecial 石块→善恶石像鬼（8801 Crypt of Despair）', () => {
  const place = (state: ReturnType<typeof createGameState>, cells: [number, number][]): void => {
    for (const [r, c] of cells) state.board.set({ row: r, col: c }, g(specialGem('stoneBlock')));
  };
  const gargoyleSpecs = (state: ReturnType<typeof createGameState>) => {
    const out: number[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const gem = gemAt(state, r, c);
        if (gem && gem.type.kind === 'special' && gem.type.spec.kind === 'gargoyleGem') {
          out.push(gem.type.spec.tier ?? -1);
        }
      }
    }
    return out;
  };

  it('kind 精确对位：盘上 4 颗石块全数转为石像鬼宝石（count=4，不放回）', () => {
    const { ctx, state } = setup({ seed: 7 });
    place(state, [[0, 0], [2, 3], [5, 1], [7, 7]]);
    const events = executePrototype(skill(convertSpecial('stoneBlock', 'gargoyleGem', { count: 4 })), ctx);
    const ev = events.find((e) => e.type === 'gem-transform') as { changes: { to: GemType }[] };
    expect(ev.changes.length).toBe(4);
    expect(gargoyleSpecs(state).length).toBe(4);
    // 石块不再在盘上（toSpecial 无 tier 掷签时 spec 只带 kind）
    expect(gemAt(state, 0, 0)!.type).toEqual({ kind: 'special', spec: { kind: 'gargoyleGem' } });
  });

  it("tiers:[1,2] 整段掷签：本次转换的所有宝石同 tier（官方 AB-CD 双分支语义）", () => {
    const tiersOf = (seed: number) => {
      const { ctx, state } = setup({ seed });
      place(state, [[0, 0], [2, 3], [5, 1], [7, 7]]);
      executePrototype(skill(convertSpecial('stoneBlock', 'gargoyleGem', { count: 4, tiers: [1, 2] })), ctx);
      return gargoyleSpecs(state);
    };
    const tiers = tiersOf(7);
    expect(tiers.length).toBe(4);
    for (const t of tiers) expect([1, 2]).toContain(t);
    expect(new Set(tiers).size).toBe(1); // 同一次施放内 tier 统一
    // 确定性：同种子同序列
    expect(tiersOf(7)).toEqual(tiersOf(7));
    // 两侧端点跨种子均可达
    const allTiers = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) allTiers.add(tiersOf(seed)[0]);
    expect(allTiers.has(1)).toBe(true);
    expect(allTiers.has(2)).toBe(true);
  });

  it('无石块 → 零事件且零 rng（后续段随机序列与空段一致）', () => {
    const run = (withConvert: boolean) => {
      const { ctx } = setup({ seed: 7 }); // 全红盘无石块
      return executePrototype(skill(
        ...(withConvert ? [convertSpecial('stoneBlock', 'gargoyleGem', { count: 4, tiers: [1, 2] })] : []),
        inflictRandom('enemyRandom'),
      ), ctx).filter((e) => e.type === 'status-apply').map((e) => e.statusId).join(',');
    };
    expect(run(true)).toBe(run(false));
  });
});

// —— 机制 4 · 选定单格转换（from 'CELL'） ——

describe("Wave4 · transform from 'CELL' 选定单格转换（9638 Shining Light）", () => {
  it("transformToSpecial('CELL', 'umbralStar')：只转换选定格那颗宝石", () => {
    const { ctx, state } = setup({ seed: 7, chosenCell: { row: 3, col: 4 } });
    const events = executePrototype(skill(transformToSpecial('CELL', 'umbralStar', { count: 1 })), ctx);
    const ev = events.find((e) => e.type === 'gem-transform') as { changes: { pos: { row: number; col: number }; to: GemType }[] };
    expect(ev.changes.length).toBe(1);
    expect(ev.changes[0].pos).toEqual({ row: 3, col: 4 });
    expect(ev.changes[0].to).toEqual({ kind: 'special', spec: { kind: 'umbralStar' } });
    expect(gemAt(state, 3, 4)!.type.kind).toBe('special');
    expect(gemAt(state, 0, 0)!.type).toEqual({ kind: 'color', color: BaseColor.Red }); // 其余盘面不动
  });

  it('未选格 / 选定格已是目标类型 → 段安全跳过', () => {
    const noCell = setup({ seed: 7 });
    const ev1 = executePrototype(skill(transformToSpecial('CELL', 'umbralStar', { count: 1 })), noCell.ctx);
    expect(ev1.some((e) => e.type === 'gem-transform')).toBe(false);

    const already = setup({ seed: 7, chosenCell: { row: 0, col: 0 } });
    already.state.board.set({ row: 0, col: 0 }, g(specialGem('umbralStar')));
    const ev2 = executePrototype(skill(transformToSpecial('CELL', 'umbralStar', { count: 1 })), already.ctx);
    expect(ev2.some((e) => e.type === 'gem-transform')).toBe(false);
  });

  it('9638 全句组装：转换选定宝石 + 创造 2 颗暗影之星', () => {
    const { ctx, state } = setup({ seed: 7, chosenCell: { row: 6, col: 6 } });
    const events = executePrototype(skill(
      transformToSpecial('CELL', 'umbralStar', { count: 1 }),
      // 第二步官方 CreateGems LightDarkStar 2：满盘时走就地转化回退，落 2 颗暗影之星
      { kind: 'gem', params: { op: 'create', gem: { kind: 'special', spec: { kind: 'umbralStar' } }, count: { base: 2, mult: 0 } } },
    ), ctx);
    const transforms = events.filter((e) => e.type === 'gem-transform');
    expect(transforms.length).toBe(2);
    let stars = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const gem = gemAt(state, r, c);
        if (gem && gem.type.kind === 'special' && gem.type.spec.kind === 'umbralStar') stars += 1;
      }
    }
    expect(stars).toBe(3); // 选定格 1 颗 + 创造 2 颗（满盘转化回退）
  });

  it('prototypeNeedsCell 识别 transform-from-CELL 原型（CellPicker 管线接线）', () => {
    expect(prototypeNeedsCell(skill(transformToSpecial('CELL', 'umbralStar', { count: 1 })))).toBe(true);
    expect(prototypeNeedsCell(skill(transformToSpecial('ANY', 'bomb', { count: 1 })))).toBe(false);
    expect(prototypeNeedsCell(skill(transform(BaseColor.Green, BaseColor.Red)))).toBe(false);
  });
});

// —— 机制 5 · 动态编队第 N 位 reposition（8101） ——

describe('Wave4 · reposition n 编队第 N 位（8101 Tricky Blow 两轮击退）', () => {
  it("reposition('enemyNth','back',{n:2})：编队第 2 位被打回末位", () => {
    const { ctx, state } = setup({
      seed: 7,
      right: [{}, {}, {}, {}], // id 4,5,6,7
    });
    const events = executePrototype(skill(reposition('enemyNth', 'back', { n: 2 })), ctx);
    expect(events.some((e) => e.type === 'troop-reposition' && e.targetId === 5)).toBe(true);
    expect(orderOf(state, PlayerSide.Right)).toEqual([4, 6, 7, 5]);
  });

  it('8101 两轮击退：第二轮打动态编队第二位（首轮击退后的现行序）', () => {
    const { ctx, state } = setup({ seed: 7, right: [{}, {}, {}, {}] });
    executePrototype(skill(
      reposition('enemyNth', 'back', { n: 1 }), // 第一轮：队首 4 → 末位
      reposition('enemyNth', 'back', { n: 2 }), // 第二轮：现行第 2 位 = 6 → 末位
    ), ctx);
    expect(orderOf(state, PlayerSide.Right)).toEqual([5, 7, 4, 6]);
  });

  it('n 越界（编队不足 N 人）→ 无事件安全跳过', () => {
    const { ctx } = setup({ seed: 7, right: [{}, {}] }); // 只有 2 人
    const events = executePrototype(skill(reposition('enemyNth', 'back', { n: 3 })), ctx);
    expect(events.some((e) => e.type === 'troop-reposition')).toBe(false);
  });
});

// —— 机制 6 · 跨段数值绑定 lastReduce（7507） ——

describe('Wave4 · lastReduce 跨段数值绑定（7507「减除生命值并转化为攻击力」）', () => {
  const LAST_REDUCE = { mod: { kind: 'multiplier' as const, a: 1 }, source: { kind: 'lastReduce' as const } };

  it('7507 句式：削减盟友 [M+2] 生命 → 同段后续 attack 增益 = 实际削减额', () => {
    const { ctx } = setup({
      seed: 7,
      left: [{ magic: 2 }, {}, {}],
      chosenTargetId: 0,
    });
    const events = executePrototype(skill(
      reduce('allyChosen', 'hp', 2, 1),   // [魔法 + 2] = 4 点生命
      attack('lastTarget', 0, 0, { modifier: LAST_REDUCE }), // 「并转化为攻击力」
    ), ctx);
    const hpLoss = events.find((e) => e.type === 'buff' && e.stat === 'hp' && e.amount < 0) as { amount: number };
    expect(hpLoss.amount).toBe(-4);
    const atk = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(atk.amount).toBe(4); // 同额转化（非声明额的固定值）
  });

  it('实际额而非声明额：削减被夹零（护甲 3 减 25 → 实削 3）→ 增益 3', () => {
    const { ctx } = setup({ seed: 7, chosenTargetId: 4 });
    const events = executePrototype(skill(
      reduce('enemyChosen', 'armor', 25, 0, {}),
      attack('lastTarget', 0, 0, { modifier: LAST_REDUCE }),
    ), ctx);
    const armorLoss = events.find((e) => e.type === 'buff' && e.stat === 'armor' && e.amount < 0) as { amount: number };
    expect(armorLoss.amount).toBe(-3);
    const atk = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(atk.amount).toBe(3);
  });

  it('「最近一段」覆写语义：第二段削减为 0 → lastReduce 归零，增益不发', () => {
    const { ctx } = setup({ seed: 7, right: [{ armor: 0 }], chosenTargetId: 4 });
    const events = executePrototype(skill(
      reduce('enemyChosen', 'armor', 5, 0),        // 实削 0（护甲已是 0）→ 覆写为 0
      attack('lastTarget', 0, 0, { modifier: LAST_REDUCE }),
    ), ctx);
    expect(events.some((e) => e.type === 'buff' && e.stat === 'attack')).toBe(false);
  });

  it('多目标累加：两目标各实削 2 → lastReduce = 4', () => {
    const { ctx } = setup({ seed: 7, right: [{ armor: 2 }, { armor: 2 }, { armor: 9 }] });
    const events = executePrototype(skill(
      reduce('enemyFirstN', 'armor', 2, 0, { n: 2 }), // 前两名各削 2
      attack('allySelf', 0, 0, { modifier: LAST_REDUCE }),
    ), ctx);
    const atk = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(atk.amount).toBe(4);
  });
});
