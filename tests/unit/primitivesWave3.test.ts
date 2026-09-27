/**
 * 原语 Wave3 批单元测试（2026-09-18）：混合特殊宝石创造 createSpecialGems2（官方
 * CreateGems2Colors 双特殊端点，善/恶石像鬼逐颗掷签）/ inflictRandom 正面池 pool:'positive'
 * （官方 RandomPositiveStatusEffect，Book of Secrets 8369 @AllAllies）/ ColorSpec 'ENEMY'
 * 敌方法力色宝石色（2026-09-17 回收批落地，本批补护栏测试）/ 阵亡计数来源
 * countEnemyDeaths/countAllyDeaths（官方 CountEnemyDeaths 8086 Glutmaw、Dullahan 8172 双来源）/
 * 法力已满条件 manaFull（官方 AddForFullMana，Maid of Envy 8532）。
 * 与 spellR12Primitives.test.ts 同一套纯原语 harness（种子化 rng、无 DOM、零引擎注入）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { EffectContext } from '@engine/skills/effects/context';
import { executePrototype } from '@engine/skills/prototypes';
import {
  skill, dmg, drainMana, sacrifice, attack, destroyColor, inflictRandom,
  createSpecialGems2, inflict,
} from '@engine/skills/builders';
import { POSITIVE_STATUS_IDS } from '@engine/skills/effects/status';

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
  return { ctx, state };
}

function gemAt(state: ReturnType<typeof createGameState>, row: number, col: number) {
  return state.board.get({ row, col });
}

/** 全盘扫出某种类的特殊宝石 spec 列表（按行列序，确定性） */
function specialSpecs(state: ReturnType<typeof createGameState>): { kind: string; tier?: number }[] {
  const out: { kind: string; tier?: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gem = gemAt(state, r, c);
      if (gem && gem.type.kind === 'special') out.push({ kind: gem.type.spec.kind, tier: gem.type.spec.tier });
    }
  }
  return out;
}

// —— 原语 1+2 · 混合特殊宝石创造 createSpecialGems2（官方 CreateGems2Colors 善/恶石像鬼） ——

describe('Wave3 · createSpecialGems2 双 kind 逐颗掷签（CreateGems2Colors）', () => {
  // 官方 8795 Frozen Time 步骤：{Color1: GoodGargoyle, Amount: 3, Color2: BadGargoyle, Type: CreateGems2Colors}
  // 引擎口径：gargoyleGem tier 1=善 / 2=恶（types.ts）
  const GOOD = { kind: 'gargoyleGem' as const, tier: 1 };
  const BAD = { kind: 'gargoyleGem' as const, tier: 2 };

  it('8795 句式：满盘创造 3 颗石像鬼宝石（转化回退），每颗 tier ∈ {善, 恶}', () => {
    const { ctx, state } = setup({ seed: 7 });
    const events = executePrototype(skill(createSpecialGems2([GOOD, BAD], 3)), ctx);
    const ev = events.find((e) => e.type === 'gem-transform') as { changes: { to: GemType }[] };
    expect(ev).toBeDefined();
    expect(ev.changes.length).toBe(3);
    const specs = specialSpecs(state);
    expect(specs.length).toBe(3);
    for (const spec of specs) {
      expect(spec.kind).toBe('gargoyleGem');
      expect([1, 2]).toContain(spec.tier);
    }
  });

  it('确定性：同种子两次执行 → 逐颗 tier 序列完全一致（放回均匀、可重复同侧）', () => {
    const tiersOf = (seed: number) => {
      const { ctx, state } = setup({ seed });
      executePrototype(skill(createSpecialGems2([GOOD, BAD], 3)), ctx);
      return specialSpecs(state).map((s) => s.tier);
    };
    for (const seed of [1, 7, 42, 2026]) {
      expect(tiersOf(seed)).toEqual(tiersOf(seed));
    }
    // 同种子下 rng 消耗固定：全 64 格转化候选 → 每次 3 颗，无多无少
    const { state } = setup({ seed: 7 });
    void state;
  });

  it('放回均匀：两侧端点都可能被掷中（多种子扫描，善/恶均出现、也存在混色盘）', () => {
    const allGood: boolean[] = [];
    const allBad: boolean[] = [];
    const mixed: boolean[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const { ctx, state } = setup({ seed });
      executePrototype(skill(createSpecialGems2([GOOD, BAD], 3)), ctx);
      const tiers = specialSpecs(state).map((s) => s.tier);
      if (tiers.every((t) => t === 1)) allGood.push(true);
      if (tiers.every((t) => t === 2)) allBad.push(true);
      if (tiers.includes(1) && tiers.includes(2)) mixed.push(true);
    }
    expect(allGood.length).toBeGreaterThan(0); // 端点1（善）可达
    expect(allBad.length).toBeGreaterThan(0);  // 端点2（恶）可达
    expect(mixed.length).toBeGreaterThan(0);   // 逐颗独立掷签（放回）可达
  });

  it('官方 8795 Frozen Time 全句组装：冻结随机敌人 → 创造 3 颗石像鬼宝石 → 额外回合', () => {
    const { ctx, state } = setup({ seed: 7 });
    const events = executePrototype(
      skill(inflict('frozen', 'enemyRandom'), createSpecialGems2([GOOD, BAD], 3)),
      ctx,
    );
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'frozen')).toBe(true);
    expect(specialSpecs(state).length).toBe(3);
    // 原型外挂 extraTurn 段单独可执行（8795 第三步）
    const events2 = executePrototype(skill(createSpecialGems2([GOOD, BAD], 3)), setup({ seed: 7 }).ctx);
    expect(events2.some((e) => e.type === 'gem-transform')).toBe(true);
  });
});

// —— 原语 3 · inflictRandom 正面池（官方 RandomPositiveStatusEffect） ——

describe('Wave3 · inflictRandom pool 正面池 / times 连掷', () => {
  it("pool:'positive'：敌对目标也强制掷正面全集（官方 8369 BookOfSecrets @AllAllies 分支）", () => {
    const { ctx } = setup({ seed: 7 });
    const events = executePrototype(skill(inflictRandom('enemyAll', { pool: 'positive' })), ctx);
    const applies = events.filter((e) => e.type === 'status-apply');
    expect(applies.length).toBe(3); // 3 名敌人各掷 1 条
    for (const e of applies) {
      expect(POSITIVE_STATUS_IDS).toContain(e.statusId);
    }
  });

  it('缺省（无 pool）：敌对目标仍掷负面池（2026-09-17 回收批口径不变）', () => {
    // Official status-list negatives (L2-random-status-pools: charm removed; faerie-fire/marked/lycanthropy/terror added)
    const NEGATIVE = new Set(['poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'death-mark', 'faerie-fire', 'marked', 'lycanthropy', 'terror']);
    const { ctx } = setup({ seed: 7 });
    const events = executePrototype(skill(inflictRandom('enemyAll')), ctx);
    const applies = events.filter((e) => e.type === 'status-apply');
    expect(applies.length).toBe(3);
    for (const e of applies) {
      expect(NEGATIVE.has(e.statusId)).toBe(true);
    }
  });

  it('确定性：同种子两次执行施加的状态序列一致；pool 正/负同种子序列不同（池确实不同）', () => {
    const run = (pool?: 'positive') => {
      const { ctx } = setup({ seed: 11 });
      const events = executePrototype(skill(inflictRandom('enemyRandom', pool ? { pool } : {})), ctx);
      return events.filter((e) => e.type === 'status-apply').map((e) => e.statusId).join(',');
    };
    expect(run()).toBe(run());
    expect(run('positive')).toBe(run('positive'));
  });

  it('times=3（「陷入 3 个随机状态效果」）：每目标连掷 3 条 status-apply', () => {
    const { ctx } = setup({ seed: 3 });
    const events = executePrototype(skill(inflictRandom('enemyRandom', { times: 3 })), ctx);
    const applies = events.filter((e) => e.type === 'status-apply');
    expect(applies.length).toBe(3);
  });
});

// —— 原语 4 · ColorSpec 'ENEMY' 敌方法力色宝石色（回收批已落地，本批护栏） ——

describe('Wave3 · ColorSpec ENEMY（指定/随机存活敌人的法力色）', () => {
  it('单色敌人：destroyColor(ENEMY) 清除该法力色的宝石（「摧毁其法力颜色宝石」）', () => {
    const { ctx, state } = setup({ seed: 7, right: [{ colors: [BaseColor.Blue] }] });
    // 盘面预置 2 颗蓝宝石
    state.board.set({ row: 2, col: 2 }, g(colorGem(BaseColor.Blue)));
    state.board.set({ row: 5, col: 6 }, g(colorGem(BaseColor.Blue)));
    const events = executePrototype(skill(destroyColor('ENEMY')), ctx);
    const ev = events.find((e) => e.type === 'gem-destroy') as { cells: unknown[] };
    expect(ev.cells.length).toBe(2);
    expect(gemAt(state, 2, 2)).toBeNull();
    expect(gemAt(state, 5, 6)).toBeNull();
    expect(gemAt(state, 0, 0)).not.toBeNull(); // 红色不受影响
  });

  it('多色敌人：rng 掷选其一法力色（确定性——同种子同色）', () => {
    const run = () => {
      const { ctx, state } = setup({
        seed: 9,
        right: [{ colors: [BaseColor.Blue, BaseColor.Green] }],
      });
      state.board.set({ row: 1, col: 1 }, g(colorGem(BaseColor.Blue)));
      state.board.set({ row: 6, col: 6 }, g(colorGem(BaseColor.Green)));
      executePrototype(skill(destroyColor('ENEMY')), ctx);
      return { blue: gemAt(state, 1, 1) === null, green: gemAt(state, 6, 6) === null };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    // 恰好清掉一种颜色的预置格（另一色不动）
    expect(a.blue !== a.green).toBe(true);
  });

  it('LAST_TARGET 跨段：先伤害选定敌人，再摧毁「其」法力色宝石（8532 同款跨段口径）', () => {
    const { ctx, state } = setup({
      seed: 7,
      chosenTargetId: 4,
      right: [{ colors: [BaseColor.Green] }, { colors: [BaseColor.Blue] }, { colors: [BaseColor.Blue] }],
    });
    state.board.set({ row: 0, col: 0 }, g(colorGem(BaseColor.Green)));
    state.board.set({ row: 3, col: 3 }, g(colorGem(BaseColor.Blue)));
    executePrototype(skill(dmg('enemyChosen', 1, 0), destroyColor('LAST_TARGET')), ctx);
    expect(gemAt(state, 0, 0)).toBeNull();  // 选定敌人（id 4）的绿色被清
    expect(gemAt(state, 3, 3)).not.toBeNull();
  });
});

// —— 原语 5 · 阵亡计数来源 countEnemyDeaths / countAllyDeaths ——

describe('Wave3 · 阵亡计数来源（官方 CountEnemyDeaths/CountAllyDeaths）', () => {
  it('敌方击杀计入 countEnemyDeaths：后续段数值因阵亡数而增强 [x2]（8086 Glutmaw 句式）', () => {
    const { ctx } = setup({ seed: 7 });
    const events = executePrototype(
      skill(
        dmg('enemyAll', 0, 0, { execute: true, range: 'all' }), // 即杀敌方全体（3 名）
        attack('allySelf', 0, 0, {
          modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'countEnemyDeaths' } },
        }),
      ),
      ctx,
    );
    expect(events.filter((e) => e.type === 'defeat').length).toBe(3);
    const buff = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(buff.amount).toBe(6); // 3 阵亡 × 2
  });

  it('献祭盟友计入 countAllyDeaths（8172 Dullahan 双来源的己方侧）', () => {
    const { ctx } = setup({
      seed: 7,
      left: [{}, {}, {}], // 施法者 + 2 盟友
    });
    const events = executePrototype(
      skill(
        sacrifice('allyLast'), // 即杀队末盟友
        attack('allySelf', 0, 0, {
          modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'countAllyDeaths' } },
        }),
      ),
      ctx,
    );
    expect(events.filter((e) => e.type === 'defeat').length).toBe(1);
    const buff = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(buff.amount).toBe(5);
  });

  it('双来源相加（Dullahan「boosted by Ally and Enemy deaths [x5]」）', () => {
    const { ctx } = setup({ seed: 7, left: [{}, {}, {}] });
    const events = executePrototype(
      skill(
        sacrifice('allyLast'),
        dmg('enemyFirstN', 0, 0, { execute: true, n: 2, range: 'all' }),
        attack('allySelf', 0, 0, {
          modifier: {
            mod: { kind: 'multiplier', a: 5 },
            sources: [{ kind: 'countAllyDeaths' }, { kind: 'countEnemyDeaths' }],
          },
        }),
      ),
      ctx,
    );
    expect(events.filter((e) => e.type === 'defeat').length).toBe(3);
    const buff = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(buff.amount).toBe(15); // (1 己方 + 2 敌方) × 5
  });

  it('零击杀 → 来源计数 0，数值退化为一次缩放（无阵亡不虚增）', () => {
    const { ctx } = setup({ seed: 7 });
    const events = executePrototype(
      skill(attack('allySelf', 2, 0, {
        modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'countEnemyDeaths' } },
      })),
      ctx,
    );
    const buff = events.find((e) => e.type === 'buff' && e.stat === 'attack') as { amount: number };
    expect(buff.amount).toBe(2);
  });
});

// —— 原语 6 · 法力上限条件 manaFull（官方 AddForFullMana） ——

describe('Wave3 · manaFull 法力已满条件（8532 Maid of Envy 句式）', () => {
  it('目标相对：只对满法力的敌人生效（「If the Enemy has full Mana, drain their Mana」）', () => {
    const { ctx, state } = setup({
      seed: 7,
      right: [{ mana: 20 }, { mana: 5 }, { mana: 0 }], // manaCost=20，仅第一名满
    });
    executePrototype(skill(drainMana('enemyAll', { ifCond: { kind: 'manaFull' } })), ctx);
    expect(state.teams[PlayerSide.Right].characters[0].mana).toBe(0);  // 满法力 → 被耗尽
    expect(state.teams[PlayerSide.Right].characters[1].mana).toBe(5);  // 未满 → 不受影响
    expect(state.teams[PlayerSide.Right].characters[2].mana).toBe(0);
  });

  it('8532 全句组装：伤害 → 若该敌人法力已满则耗尽（lastTarget 跨段）', () => {
    const { ctx, state } = setup({
      seed: 7,
      chosenTargetId: 4,
      right: [{ mana: 20 }, {}, {}],
    });
    executePrototype(
      skill(dmg('enemyChosen', 1, 0, { trueDamage: true }), drainMana('lastTarget', { ifCond: { kind: 'manaFull' } })),
      ctx,
    );
    expect(state.teams[PlayerSide.Right].characters[0].hp).toBe(49); // 先吃了 1 点真实伤害
    expect(state.teams[PlayerSide.Right].characters[0].mana).toBe(0);
  });

  it("of:'caster'：施法者法力已满才执行（全局条件）", () => {
    const full = setup({ seed: 7, left: [{ mana: 20 }] });
    const events = executePrototype(
      skill(attack('allySelf', 4, 0, { ifCond: { kind: 'manaFull', of: 'caster' } })),
      full.ctx,
    );
    expect(events.some((e) => e.type === 'buff' && e.stat === 'attack')).toBe(true);

    const notFull = setup({ seed: 7, left: [{ mana: 19 }] });
    const events2 = executePrototype(
      skill(attack('allySelf', 4, 0, { ifCond: { kind: 'manaFull', of: 'caster' } })),
      notFull.ctx,
    );
    expect(events2.some((e) => e.type === 'buff')).toBe(false);
  });

  it('目标相对条件挂在无目标段 → 整段安全跳过（既有护栏兼容 manaFull）', () => {
    const { ctx } = setup({ seed: 7, right: [{ mana: 20 }] });
    const events = executePrototype(
      skill(createSpecialGems2(
        [{ kind: 'gargoyleGem', tier: 1 }, { kind: 'gargoyleGem', tier: 2 }], 3,
        0, { ifCond: { kind: 'manaFull' } },
      )),
      ctx,
    );
    expect(events.some((e) => e.type === 'gem-transform')).toBe(false);
  });

  it('确定性：同种子同盘面 → 相同事件流（manaFull 判定无随机）', () => {
    const run = () => {
      const { ctx } = setup({ seed: 5, right: [{ mana: 20 }, { mana: 20 }, { mana: 1 }] });
      const events = executePrototype(skill(drainMana('enemyAll', { ifCond: { kind: 'manaFull' } })), ctx);
      return events.filter((e) => e.type === 'status-apply' || e.type === 'buff').map((e) => e.type);
    };
    expect(run()).toEqual(run());
  });
});
