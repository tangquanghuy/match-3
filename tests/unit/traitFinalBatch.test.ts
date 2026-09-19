/**
 * 特质收尾批测试（2026-09-19 最后 23 个无定义 code 收编）。
 *
 * 引擎侧新增 13 个定义直读钩子 + 2 个编译键扩展（onBigMatchExplodeGem kind 通道 /
 * onBigMatchCreatePlainGem），生成器侧 MANUAL_TRAITS 显式收编（官方 EN 逐条核对
 * krystaradb 兵种页，机制字段与 RawData TraitType/Activation/Modifier 对账）。
 *
 * 本文件锁定行为口径：
 *   - 回合开始削减/窃取/爆破（applyTurnStartEconomyAndSummons 定义直读）；
 *   - 开局按概率转换宝石（构造期事件，chance=1 的动态注册用例）；
 *   - 盟友施法响应伤害（applyAllyCastTriggers 直读）；
 *   - 编译键扩展的正确编译产物（kind/tier/plainGem 通道）。
 * 无新键特质零事件零随机消耗的对局不变性由 traitMatchDamageDrain / traitBigMatch 基线锁定。
 */
import { describe, it, expect } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { registerDynamicTraits, resolvePassives } from '@engine/traits';
import { registerSkillLibrary } from '@engine/skills/library';
import { BoardModel } from '@engine/BoardModel';
import { BaseColor, PlayerSide, colorGem, skullGem } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `t${id}`,
    skillId: '7004',
    hp: 28,
    maxHp: 28,
    attack: 10,
    armor: 10,
    magic: 5,
    mana: 0,
    manaCost: 12,
    colors: [BaseColor.Blue],
    troopTypes: ['Human'],
    statuses: [],
    traitIds: [],
    defeated: false,
    ...over,
  } as unknown as Character;
}

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars } as unknown as Team;
}

/** 满盘红宝石（可按用例换子）的最小对局；技能原型注册 7004（狙击）供施法用例。
 *  boardSetup 在引擎构造前执行——开局钩子（battleStartConvertGems）读构造期棋盘。 */
function makeEngine(
  left: Character[],
  right: Character[],
  boardSetup?: (board: BoardModel) => void,
  seed = 7,
): { engine: TurnEngine; state: ReturnType<typeof createGameState> } {
  const board = new BoardModel();
  // 四色斜纹盘：无初始三连（避免构造期连锁污染开局钩子断言），且不含蓝（转换用例可精确埋蓝）
  const palette = [BaseColor.Red, BaseColor.Brown, BaseColor.Yellow, BaseColor.Green] as const;
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      board.set({ row, col }, { id: row * BoardModel.COLS + col + 1, type: colorGem(palette[(row + col) % 4]!) });
    }
  }
  boardSetup?.(board);
  const rng = new SeededRNG(seed);
  const idGen = (() => { let n = 800; return () => ++n; })();
  const state = createGameState(board, makeTeam(PlayerSide.Left, left), makeTeam(PlayerSide.Right, right));
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  const engine = new TurnEngine(state, rng, idGen, registry);
  return { engine, state };
}

/** 动态注册表无反注册 API：每个用例用唯一 code，注册后随文件模块态存续 */
function registerTestTraits(defs: Parameters<typeof registerDynamicTraits>[0]): void {
  registerDynamicTraits(defs);
}

describe('特质收尾批 · 回合开始钩子（定义直读）', () => {
  it('aspectoffamine 口径：回合开始削减首位敌人全部技能值各 3（攻/甲/生命/魔法）', () => {
    const holder = makeChar(1, { traitIds: ['aspectoffamine'] });
    const foe = makeChar(2, { hp: 28, maxHp: 28, attack: 10, armor: 10, magic: 5 });
    const { engine } = makeEngine([holder], [foe, makeChar(3, { hp: 10 })]);
    engine.passTurn(); // Left → Right：Right 回合开始，holder 在 Left 不触发
    expect(foe.attack).toBe(10);
    engine.passTurn(); // Right → Left：Left 回合开始，holder 触发，首位敌人=foe
    // 全部技能值各 -3（官方 "loses 3 Skill points" 与 powerof* 族同口径）
    expect(foe.attack).toBe(7);
    expect(foe.armor).toBe(7);
    expect(foe.hp).toBe(25);
    expect(foe.magic).toBe(2);
  });

  it('aspectofdeath 口径：回合开始从首位敌人窃取 2 点生命（按实际伤害等量治疗；护甲先挡）', () => {
    const holder = makeChar(1, { traitIds: ['aspectofdeath'], hp: 20 });
    const foe = makeChar(2, { hp: 28, armor: 0 });
    const { engine } = makeEngine([holder], [foe]);
    engine.passTurn();
    engine.passTurn();
    expect(foe.hp).toBe(26); // 首2点伤害
    expect(holder.hp).toBe(22); // 按实际伤害额治疗（护甲不为 0 时仍是 2 点直伤管线）
  });

  it('monkeymagic 口径：回合开始从首位敌人窃取 2 点法力（目标夹零、自己按 manaCost 夹取）', () => {
    const holder = makeChar(1, { traitIds: ['monkeymagic'], mana: 0, manaCost: 12 });
    const foe = makeChar(2, { mana: 5 });
    const { engine } = makeEngine([holder], [foe]);
    engine.passTurn();
    engine.passTurn();
    expect(foe.mana).toBe(3); // 削 2
    expect(holder.mana).toBe(2); // 回灌 2（< manaCost 上限）
  });

  it('onelittlespark 口径：回合开始爆破盘上 2 颗骷髅头（结算归持有者一方）', () => {
    const holder = makeChar(1, { traitIds: ['onelittlespark'] });
    const foe = makeChar(2, { hp: 28, armor: 0 });
    const { engine, state } = makeEngine([holder], [foe]);
    // 埋 2 颗骷髅头进满盘红场
    state.board.set({ row: 0, col: 0 }, { id: 901, type: skullGem() });
    state.board.set({ row: 0, col: 1 }, { id: 902, type: skullGem() });
    engine.passTurn();
    engine.passTurn();
    const board = state.board;
    let skulls = 0;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const g = board.get({ row, col });
        if (g?.type.kind === 'skull') skulls += 1;
      }
    }
    expect(skulls).toBe(0); // 两颗骷髅头都被爆破（重力补红，不再有骷髅）
    // 爆破的骷髅按持有者一方结算：对 foe 造成 2 点骷髅伤害（2 颗 × 1）
    expect(foe.hp).toBeLessThan(28);
  });
});

describe('特质收尾批 · 开局转换 / 施法响应', () => {
  it('battleStartConvertGems：无候选色时安全跳过（零转换、零事件）', () => {
    registerTestTraits([{
      code: 'testconvert2',
      name: '测试转换2',
      description: '战斗开始时，将 3 颗蓝色宝石转换为冻结宝石。',
      battleStartConvertGems: { color: BaseColor.Blue, gem: 'freezeGem', count: 3, chance: 1 },
    }]);
    const holder = makeChar(1, { traitIds: ['testconvert2'] });
    const { engine } = makeEngine([holder], [makeChar(2)]);
    const events = engine.takeInitialEvents();
    const transforms = events.filter((e) => e.type === 'gem-transform');
    expect(transforms.length).toBe(0); // 满盘红场无蓝宝石
  });

  it('battleStartConvertGems：埋 3 颗蓝宝石时精确转换这 3 颗', () => {
    registerTestTraits([{
      code: 'testconvert3',
      name: '测试转换3',
      description: '战斗开始时，将 3 颗蓝色宝石转换为冻结宝石。',
      battleStartConvertGems: { color: BaseColor.Blue, gem: 'freezeGem', count: 3, chance: 1 },
    }]);
    const holder = makeChar(1, { traitIds: ['testconvert3'] });
    const { engine, state } = makeEngine([holder], [makeChar(2)], (board) => {
      board.set({ row: 0, col: 0 }, { id: 911, type: colorGem(BaseColor.Blue) });
      board.set({ row: 0, col: 3 }, { id: 912, type: colorGem(BaseColor.Blue) });
      board.set({ row: 5, col: 5 }, { id: 913, type: colorGem(BaseColor.Blue) });
    });
    engine.takeInitialEvents();
    const board = state.board;
    let blue = 0;
    let freeze = 0;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const g = board.get({ row, col });
        if (g?.type.kind === 'color' && g.type.color === BaseColor.Blue) blue += 1;
        if (g?.type.kind === 'special' && g.type.spec.kind === 'freezeGem') freeze += 1;
      }
    }
    expect(blue).toBe(0);
    expect(freeze).toBe(3);
  });

  it('artillerysupport 口径：盟友施法时对所有敌人造成 5 点伤害（持有者不重复计自己施法外的那份）', () => {
    registerTestTraits([{
      code: 'testarty',
      name: '测试炮火',
      description: '当一名盟友施放法术时，对所有敌人造成 5 点伤害。',
      onAllyCastEnemyDamage: { amount: 5, scope: 'enemyAll' },
    }]);
    const caster = makeChar(1, { mana: 12, manaCost: 12 }); // 7004 狙击：[魔法+2] 点伤害（magic 5 → 7）
    const holder = makeChar(2, { traitIds: ['testarty'] });
    const foe = makeChar(3, { hp: 60, maxHp: 60, armor: 0 });
    const { engine } = makeEngine([caster, holder], [foe]);
    engine.takeInitialEvents();
    const events = engine.resolveAction({ type: 'cast', characterId: 1 });
    // 狙击 7 点 + 炮火 5 点（施法者也是盟友口径内：官方 "an Ally casts" 含自身）
    expect(foe.hp).toBe(60 - 7 - 5);
    const dmgEvents = events.filter((e) => e.type === 'skill-damage');
    expect(dmgEvents.length).toBeGreaterThanOrEqual(2);
  });
});

describe('特质收尾批 · 编译键扩展', () => {
  it('goodomen：大连爆破编译出 kind=gargoyleGem tier=1 count=4', () => {
    const p = resolvePassives(['goodomen']);
    expect(p.onBigMatchExplodeGem).toEqual([
      { color: '', kind: 'gargoyleGem', tier: 1, count: 4, minSize: 4 },
    ]);
  });

  it('unstablepossession：大连爆破编译出 kind=random count=2', () => {
    const p = resolvePassives(['unstablepossession']);
    expect(p.onBigMatchExplodeGem).toEqual([{ color: '', kind: 'random', count: 2, minSize: 4 }]);
  });

  it('lunarscales：大连创造素色宝石编译（color Purple count 3 chance 0.5）', () => {
    const p = resolvePassives(['lunarscales']);
    expect(p.onBigMatchCreatePlainGem).toEqual({ color: 'Purple', count: 3, chance: 0.5, minSize: 4 });
  });

  it('既有 lightningstrike 色爆破条目不受 kind 扩展影响（color 通道原样编译）', () => {
    registerTestTraits([{
      code: 'testlightning',
      name: '测试闪电打击',
      description: '在配对 4 或 5 颗宝石时，爆破一颗黄色宝石。',
      onBigMatchExplodeGem: { color: 'Yellow', count: 1 },
    }]);
    const p = resolvePassives(['testlightning']);
    // legacy 条目无 kind 键（消费侧据此走 explodeGem 色通道）
    expect(p.onBigMatchExplodeGem).toEqual([{ color: 'Yellow', count: 1, minSize: 4 }]);
  });
});
