/**
 * 特质引擎接线批测试（18 条注入口缺失接线 + 收编批 52 code）：
 *   1. 回合开始施加状态（turnStartStatus，11 code：tidalking 自身下潜 / sunflare·burningembers
 *      燃烧随机敌 / feylink 妖火 / curseofkhet·curseofdamnation 诅咒 / divineroar·blessedwaters
 *      赐福 / poolofstars·mirroredstone 反射 / sleepersbane 诅咒和/或恐怖独立概率）；
 *   2. 骷髅命中钩子（CombatResolver）：brokenjaw 断颚多条命中状态 / siphon 吸星大法命中窃法 /
 *      spikearmor·electrifiedplating 命中附加护甲比（razorarmor 同字段）；
 *   3. 骷髅受击钩子：deathray 死光受击死亡标记首位敌人 / manyheads 九头攻击受击敌方全体受伤 /
 *      onyxshard 缟玛瑙碎片受击创造极度末日骷髅（TurnEngine.applyDamagedTriggersFromEvents）；
 *   4. 收编批数据落地：bonefeast 骨宴回合开始造骷髅 / 六色族宝石 color 贯通（kinof* 龙宝石族 /
 *      *shard 巨人宝石族）/ temptation 蛊惑 / icyrebirth·deafeningwail 身亡全体状态 / moonfever。
 *
 * 护栏：无新键特质零事件、零随机消耗（旧特质行为逐字节不变）；概率 <1 经种子化 rng 判定。
 */
import { describe, it, expect } from 'vitest';
import { resolvePassives, neutralPassives, getTrait, attachPassives } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { CombatResolver } from '@engine/CombatResolver';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem, skullGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { hasStatus } from '@engine/skills/effects/status';

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

function countKind(board: BoardModel, pred: (t: GemType) => boolean): number {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gem = board.get({ row: r, col: c });
      if (gem && pred(gem.type)) n++;
    }
  }
  return n;
}

const countSpecial = (board: BoardModel, kind: string) =>
  countKind(board, (t) => t.kind === 'special' && t.spec.kind === kind);

/** 铺一张不会自发匹配的棋盘（与 traitGemCraft 同款），特质挂在右方 */
function battle(rightTraits: string[], seed = 51, palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]) {
  const rng = new SeededRNG(seed);
  let id = 98000;
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % palette.length]) });
    }
  }
  const mine = makeChar(0);
  const theirs = makeChar(4, { traitIds: rightTraits });
  const state = createGameState(board, makeTeam(PlayerSide.Left, [mine]), makeTeam(PlayerSide.Right, [theirs]));
  const engine = new TurnEngine(state, rng, () => id++, new ExtensionRegistry());
  return { engine, state, board, mine, theirs };
}

/** CombatResolver 对局夹具（与 traitSkullHit 同款）：双方各一名，按特质编译被动 */
function duel(attackerOver: Partial<Character>, targetOver: Partial<Character>) {
  const attacker = makeChar(0, { attack: 10, ...attackerOver });
  const target = makeChar(4, { hp: 50, armor: 0, ...targetOver });
  attachPassives(attacker);
  attachPassives(target);
  const left: Team = { player: PlayerSide.Left, characters: [attacker] };
  const right: Team = { player: PlayerSide.Right, characters: [target] };
  return { attacker, target, left, right, combat: new CombatResolver() };
}

/** 底行骷髅三连对局：交换 (7,1)<->(6,1) 后三骷髅命中敌方队首（复用宝石创造批的棋盘模式） */
function skullMatchBattle(leftChars: Character[], rightChars: Character[], seed = 11) {
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

// ============================================================
// 数据落地（18 条接线 + 收编批）
// ============================================================

describe('数据落地（回合开始施加状态 11 code）', () => {
  it('tidalking 自身下潜 / divineroar 赐福随机盟友 / poolofstars·mirroredstone 反射随机盟友', () => {
    expect(getTrait('tidalking')?.turnStartStatus).toEqual({ target: 'self', statuses: [{ id: 'submerged' }], turns: 3 });
    expect(getTrait('divineroar')?.turnStartStatus).toEqual({ target: 'randomAlly', statuses: [{ id: 'blessed' }], turns: 3, chance: 0.5 });
    expect(getTrait('poolofstars')?.turnStartStatus).toEqual({ target: 'randomAlly', statuses: [{ id: 'reflect' }], turns: 3, chance: 0.4 });
    expect(getTrait('mirroredstone')?.turnStartStatus).toEqual({ target: 'randomAlly', statuses: [{ id: 'reflect' }], turns: 3, chance: 0.35 });
  });

  it('sunflare/burningembers 燃烧随机敌（DoT 带 magnitude）· feylink 妖火 · curseofkhet 诅咒', () => {
    expect(getTrait('sunflare')?.turnStartStatus).toEqual({ target: 'randomEnemy', statuses: [{ id: 'burning', magnitude: 1 }], turns: 3, chance: 0.5 });
    expect(getTrait('burningembers')?.turnStartStatus).toEqual({ target: 'randomEnemy', statuses: [{ id: 'burning', magnitude: 1 }], turns: 3, chance: 0.5 });
    expect(getTrait('feylink')?.turnStartStatus).toEqual({ target: 'randomEnemy', statuses: [{ id: 'faerie-fire' }], turns: 3, chance: 0.5 });
    expect(getTrait('curseofkhet')?.turnStartStatus).toEqual({ target: 'randomEnemy', statuses: [{ id: 'curse' }], turns: 3, chance: 0.25 });
  });

  it('curseofdamnation 诅咒全体敌 · blessedwaters 赐福全体盟友 · sleepersbane 和/或独立概率', () => {
    expect(getTrait('curseofdamnation')?.turnStartStatus).toEqual({ target: 'allEnemies', statuses: [{ id: 'curse' }], turns: 3, chance: 0.4 });
    expect(getTrait('blessedwaters')?.turnStartStatus).toEqual({ target: 'allAllies', statuses: [{ id: 'blessed' }], turns: 3, chance: 0.15 });
    expect(getTrait('sleepersbane')?.turnStartStatus).toEqual({
      target: 'randomEnemy',
      statuses: [{ id: 'curse' }, { id: 'terror' }],
      turns: 3,
      chance: 0.5,
      independentChance: true,
    });
  });
});

describe('数据落地（骷髅受击/命中钩子 7 code + 收编批）', () => {
  it('命中附加护甲比（spikearmor 25% / electrifiedplating 50%）与命中窃法（siphon）', () => {
    expect(getTrait('spikearmor')?.skullDamageFromArmorRatio).toBe(0.25);
    expect(getTrait('electrifiedplating')?.skullDamageFromArmorRatio).toBe(0.5);
    expect(resolvePassives(['spikearmor']).skullDamageFromArmorRatio).toBe(0.25);
    expect(resolvePassives(['spikearmor', 'electrifiedplating']).skullDamageFromArmorRatio).toBe(0.5);
    expect(getTrait('siphon')?.onSkullHitStealMana).toBe(1);
    expect(resolvePassives(['siphon']).onSkullHitStealMana).toBe(1);
  });

  it('brokenjaw 命中多条状态（出血带 magnitude + 沉默）', () => {
    expect(getTrait('brokenjaw')?.inflictOnSkullHitList).toEqual([
      { id: 'bleed', turns: 3, magnitude: 1 },
      { id: 'silence', turns: 3 },
    ]);
    expect(resolvePassives(['brokenjaw']).inflictOnSkullHitList).toHaveLength(2);
  });

  it('deathray 受击死亡标记首位敌 · manyheads 受击敌方全体受伤 · onyxshard 受击创造极度末日骷髅', () => {
    expect(getTrait('deathray')?.onDamagedEnemyStatus).toEqual({ id: 'death-mark', turns: 3 });
    expect(getTrait('manyheads')?.onSkullDamagedEnemyDamage).toEqual({ amount: 3 });
    expect(getTrait('onyxshard')?.onDamagedCreateGem).toEqual({ gem: 'uberDoomSkull', count: 2 });
    expect(resolvePassives(['onyxshard']).onDamagedCreateGem).toEqual({ gem: 'uberDoomSkull', count: 2 });
  });

  it('收编批：bonefeast 造骷髅 / temptation 蛊惑 / icyrebirth·deafeningwail 身亡全体状态 / moonfever 狼化', () => {
    expect(getTrait('bonefeast')?.turnStartCreateGem).toEqual({ color: 'skull', count: 2 });
    expect(getTrait('temptation')?.onAllyDeathStatus).toEqual({ target: 'randomEnemy', statuses: [{ id: 'charm' }], turns: 3 });
    expect(getTrait('icyrebirth')?.onSelfDeathEnemyAllStatus).toEqual({ statuses: [{ id: 'frozen' }], turns: 3 });
    expect(getTrait('deafeningwail')?.onSelfDeathEnemyAllStatus).toEqual({ statuses: [{ id: 'silence' }], turns: 3 });
    expect(getTrait('moonfever')?.onBigMatchStatus).toEqual({ scope: 'randomEnemy', statuses: [{ id: 'lycanthropy' }], turns: 3 });
    expect(getTrait('carcass')?.onDeathCreateGem).toEqual({ gem: 'decayGem', count: 1 });
  });

  it('收编批：六色族 color 贯通（kinof* 龙宝石族 / *shard 巨人宝石族 / 法力药水族 / 灵力缺省紫）', () => {
    expect(getTrait('kinofthedeep')?.turnStartColorToSpecial).toEqual({ color: 'Blue', gem: 'dragonGem', gemColor: 'Blue', count: 2, chance: 0.4 });
    expect(getTrait('kinofbones')?.turnStartColorToSpecial).toEqual({ color: 'Brown', gem: 'dragonGem', gemColor: 'Brown', count: 2, chance: 0.4 });
    expect(getTrait('sapphireshard')?.onDamagedCreateGem).toEqual({ gem: 'giantGem', color: 'Blue', count: 1 });
    expect(getTrait('umbralshard')?.onDamagedCreateGem).toEqual({ gem: 'giantGem', color: 'Brown', count: 1 });
    expect(getTrait('stonefragment')?.onDamagedCreateGem).toEqual({ gem: 'manaPotionGem', color: 'Brown', count: 1 });
    expect(getTrait('icefragment')?.onDamagedCreateGem).toEqual({ gem: 'manaPotionGem', color: 'Blue', count: 1 });
    expect(getTrait('alchemistfire')?.turnStartColorToSpecial).toEqual({ color: 'Red', gem: 'manaPotionGem', gemColor: 'Red', count: 1, chance: 0.5 });
    // spiritGem 官方颜色集合存疑 → 引擎既定缺省紫（可匹配）
    expect(getTrait('murderofravens')?.turnStartColorToSpecial).toEqual({ color: 'Blue', gem: 'spiritGem', gemColor: 'Purple', count: 2 });
    expect(getTrait('ancestralspirits')?.turnStartCreateSpecialGem).toEqual({ gem: 'spiritGem', color: 'Purple', count: 1 });
  });

  it('编译纯函数性不被破坏；定义直读键（turnStartStatus）不进 passive', () => {
    const codes = ['tidalking', 'sunflare', 'sleepersbane', 'brokenjaw', 'siphon', 'deathray', 'manyheads', 'onyxshard'];
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
    for (const code of ['tidalking', 'sunflare', 'sleepersbane', 'bonefeast']) {
      expect(JSON.stringify(resolvePassives([code]))).toBe(JSON.stringify(neutralPassives()));
    }
  });
});

// ============================================================
// 回合开始施加状态（TurnEngine 集成，passTurn 触发右方）
// ============================================================

describe('回合开始施加状态（applyTurnStartEconomyAndSummons 消费）', () => {
  it('tidalking：回合开始必发使自身下潜（无概率零随机消耗）', () => {
    const { engine, theirs } = battle(['tidalking']);
    expect(hasStatus(theirs, 'submerged')).toBe(false);
    const events = engine.passTurn();
    expect(hasStatus(theirs, 'submerged')).toBe(true);
    expect(events.some((e) => e.type === 'status-apply' && (e as { statusId?: string }).statusId === 'submerged')).toBe(true);
  });

  it('非行动方的持有者不触发（官方 trig=self_player）', () => {
    const { engine, mine } = battle([], 51);
    // 左方持有 tidalking（构造时另建）——直接验证右方 passTurn 后左方无下潜
    const { engine: engine2, mine: leftHolder } = battleLeft(['tidalking']);
    void engine;
    void mine;
    engine2.passTurn();
    expect(hasStatus(leftHolder, 'submerged')).toBe(false);
  });

  /** 左方持有变体：特质挂左方（passTurn 后行动方是右方，左方的回合开始不结算） */
  function battleLeft(traits: string[]) {
    const rng = new SeededRNG(51);
    let id = 98000;
    const board = new BoardModel();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem([BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple][(r + c) % 4]) });
      }
    }
    const mine = makeChar(0, { traitIds: traits });
    const theirs = makeChar(4);
    const state = createGameState(board, makeTeam(PlayerSide.Left, [mine]), makeTeam(PlayerSide.Right, [theirs]));
    return { engine: new TurnEngine(state, rng, () => id++, new ExtensionRegistry()), mine };
  }

  it('curseofdamnation：回合开始概率命中时诅咒持有者的所有敌人（确定性逐个施加）', () => {
    let hit = false;
    for (const seed of [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62]) {
      const rng = new SeededRNG(seed);
      let id = 98000;
      const board = new BoardModel();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem([BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple][(r + c) % 4]) });
        }
      }
      // 持有者在右方；其敌人 = 左方全队
      const mineA = makeChar(0);
      const mineB = makeChar(1);
      const theirs = makeChar(4, { traitIds: ['curseofdamnation'] });
      const state = createGameState(board, makeTeam(PlayerSide.Left, [mineA, mineB]), makeTeam(PlayerSide.Right, [theirs]));
      const engine = new TurnEngine(state, rng, () => id++, new ExtensionRegistry());
      engine.passTurn();
      if (hasStatus(mineA, 'curse') || hasStatus(mineB, 'curse')) {
        // 命中即对方全队都中（allEnemies）；同队持有者不得自伤
        expect(hasStatus(mineA, 'curse')).toBe(true);
        expect(hasStatus(mineB, 'curse')).toBe(true);
        expect(hasStatus(theirs, 'curse')).toBe(false);
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });

  it('sleepersbane：独立概率掷——多种子扫描下诅咒与恐怖各自出现', () => {
    let sawCurse = false;
    let sawTerror = false;
    let sawOnly = false;
    for (const seed of [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66]) {
      const { engine } = battle(['sleepersbane'], seed);
      const { state } = { state: engine.getState() };
      void state;
      const events = engine.passTurn();
      const applied = events.filter((e) => e.type === 'status-apply') as { statusId?: string }[];
      const curses = applied.filter((e) => e.statusId === 'curse').length;
      const terrors = applied.filter((e) => e.statusId === 'terror').length;
      expect(curses).toBeLessThanOrEqual(1);
      expect(terrors).toBeLessThanOrEqual(1);
      if (curses > 0) sawCurse = true;
      if (terrors > 0) sawTerror = true;
      if ((curses > 0) !== (terrors > 0)) sawOnly = true;
    }
    expect(sawCurse).toBe(true);
    expect(sawTerror).toBe(true);
    expect(sawOnly).toBe(true); // 「和/或」= 独立概率（只中其一的情形必须存在）
  });
});

// ============================================================
// 骷髅命中钩子（CombatResolver）
// ============================================================

describe('骷髅命中钩子（CombatResolver 消费）', () => {
  it('brokenjaw：命中后目标陷入出血（magnitude 1）和沉默', () => {
    const { target, left, right, combat } = duel({}, { traitIds: [] });
    const attacker = makeChar(0, { attack: 10, traitIds: ['brokenjaw'] });
    attachPassives(attacker);
    left.characters[0] = attacker;
    void target;
    combat.resolveSkullDamage(left, right, 3, new SeededRNG(7));
    expect(hasStatus(right.characters[0], 'bleed')).toBe(true);
    expect(hasStatus(right.characters[0], 'silence')).toBe(true);
    // DoT magnitude 挂在状态实例上（status-apply 事件不携带 magnitude）
    const bleed = right.characters[0].statuses.find((s) => s.id === 'bleed');
    expect(bleed?.magnitude).toBe(1);
    expect(right.characters[0].statuses.find((s) => s.id === 'silence')?.magnitude).toBeUndefined();
  });

  it('siphon：命中窃取 1 法力（目标 -1、自己回灌夹取）；目标无法力时不发事件', () => {
    const { attacker, target, left, right, combat } = duel({}, {});
    attacker.traitIds = ['siphon'];
    attacker.mana = 5;
    attacker.manaCost = 20;
    attachPassives(attacker);
    target.mana = 3;
    const out = combat.resolveSkullDamage(left, right, 3, new SeededRNG(7));
    expect(target.mana).toBe(2);
    expect(attacker.mana).toBe(6);
    const loss = out.events.find((e) => e.type === 'buff' && (e as { stat?: string }).stat === 'mana' && (e as { targetId?: number }).targetId === target.id) as { amount?: number } | undefined;
    expect(loss?.amount).toBe(-1);

    // manashield：法力操作免疫在削减口拦截（不削也不偷）
    const { attacker: a2, target: t2, left: l2, right: r2, combat: c2 } = duel({}, {});
    a2.traitIds = ['siphon'];
    a2.mana = 5;
    attachPassives(a2);
    t2.traitIds = ['manashield'];
    attachPassives(t2);
    t2.mana = 3;
    c2.resolveSkullDamage(l2, r2, 3, new SeededRNG(7));
    expect(t2.mana).toBe(3);
    expect(a2.mana).toBe(5);
  });

  it('deathray：受击后对攻击方首位存活施加死亡标记；激怒攻击者不触发', () => {
    const { target, left, right, combat } = duel({}, { traitIds: ['deathray'] });
    combat.resolveSkullDamage(left, right, 3, new SeededRNG(7));
    expect(hasStatus(left.characters[0], 'death-mark')).toBe(true);
    void target;

    // 激怒无视敌方特质：不施加
    const { attacker: a2, left: l2, right: r2, combat: c2 } = duel({}, { traitIds: ['deathray'] });
    a2.statuses.push({ id: 'rage', turns: 2 });
    c2.resolveSkullDamage(l2, r2, 3, new SeededRNG(7));
    expect(hasStatus(a2, 'death-mark')).toBe(false);
  });

  it('spikearmor：命中附加 25% 护甲比（TurnEngine 骷髅结算口消费，走 bonus 通道）', async () => {
    const { engine, state } = skullMatchBattle(
      [makeChar(0, { attack: 10, armor: 20, traitIds: ['spikearmor'] })],
      [makeChar(4, { hp: 100 })],
    );
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const dmg = events.find((e) => e.type === 'skull-damage') as { damage: number } | undefined;
    expect(dmg).toBeDefined();
    // 10 攻击 + floor(20 护甲 × 25%) = 15
    expect(dmg!.damage).toBe(15);
    void state;
  });
});

// ============================================================
// 骷髅受击钩子（TurnEngine.applyDamagedTriggersFromEvents）
// ============================================================

describe('骷髅受击钩子（受击创造 / 受击敌方全体受伤）', () => {
  it('onyxshard：受到骷髅伤害后在盘面创造 2 颗极度末日骷髅', () => {
    const { engine, state } = skullMatchBattle(
      [makeChar(0, { attack: 5 })],
      [makeChar(4, { hp: 100, traitIds: ['onyxshard'] })],
    );
    expect(countSpecial(state.board, 'uberDoomSkull')).toBe(0);
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(state.teams[PlayerSide.Right].characters[0].defeated).toBe(false);
    expect(countSpecial(state.board, 'uberDoomSkull')).toBe(2);
    expect(events.some((e) => e.type === 'gem-transform')).toBe(true);
  });

  it('manyheads：受到骷髅伤害时攻击方全体受到 3 点技能伤害', () => {
    const hero = makeChar(0, { attack: 5 });
    const mate = makeChar(1, { hp: 40 });
    const victim = makeChar(4, { hp: 100, traitIds: ['manyheads'] });
    const { engine } = skullMatchBattle([hero, mate], [victim, makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    // 双名攻击方各受 3 点（hero 50→47、mate 40→37）
    expect(hero.hp).toBe(47);
    expect(mate.hp).toBe(37);
    const hits = events.filter((e) => e.type === 'skill-damage' && (e as { damage: number }).damage === 3);
    expect(hits.length).toBe(2);
  });

  it('无新键特质：同局面零事件零随机消耗（行为逐字节不变）', () => {
    const baseline = skullMatchBattle([makeChar(0, { attack: 5 })], [makeChar(4, { hp: 100 })]);
    const plain = baseline.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const withOld = skullMatchBattle(
      [makeChar(0, { attack: 5, traitIds: ['fast'] })],
      [makeChar(4, { hp: 100, traitIds: ['sacred'] })],
    );
    const old = withOld.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    // 事件类型序列一致（无 gem-transform / 额外 skill-damage / status-apply）
    const kinds = (events: GameEvent[]) => events.map((e) => e.type).join(',');
    expect(kinds(old)).toBe(kinds(plain));
    expect(old.some((e) => e.type === 'gem-transform')).toBe(false);
  });
});

// ============================================================
// 收编批：骨宴骷髅创造（TurnEngine 骷髅落子）
// ============================================================

describe('bonefeast：回合开始创造 2 颗普通骷髅头', () => {
  it('gem-transform 落 2 处普通骷髅（连锁吸收后盘面仍满）', () => {
    const { engine } = battle(['bonefeast']);
    const events = engine.passTurn();
    const transforms = events.filter((e) => e.type === 'gem-transform') as { changes: { to: GemType }[] }[];
    const skullChanges = transforms.flatMap((t) => t.changes).filter((ch) => ch.to.kind === 'skull' && ch.to.variant === 'normal');
    expect(skullChanges).toHaveLength(2);
    expect(engine.getState().board.isFull()).toBe(true);
  });
});
