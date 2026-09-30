/**
 * 特质可救批（T2 死亡钩子 + 双状态诅咒族）回归测试。
 *
 * A. 双状态诅咒族（frozencurse 等 6 code）：「在敌人对自身造成骷髅头伤害时，使其陷入
 *    诅咒和X状态」——新编译字段 inflictOnSkullDamagedList，CombatResolver 在既有单状态
 *    施加点（inflictOnSkullDamaged）之后逐条施加，条目顺序与描述一致。
 * B. 死亡钩子族 4 code：
 *    - bloodlust/lordofdeath/sharedfate 走新钩子 applyEnemyDeathTriggers
 *      （TurnEngine.processDeathTriggers 接线，与阵亡响应同一时机、同一持有者口径）；
 *    - sacrifice 复用既有 onEnemyDeathGain（技能值按 randomStat 口径映射 magic）。
 *    herdspirit/dragonboon/stonepact/daospuppet/wolfcompanion 五条死亡召唤因召唤名
 *    （半人马侦察兵/德拉贡特/石梅菲特/恶道/战牙）不在兵种数据集，留在未实现（数据缺口，
 *    引擎 summonOnDeath.chance 机制本身已支持）。
 */
import { describe, it, expect } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { applyEnemyDeathTriggers, attachPassives, resolvePassives } from '@engine/traits';
import { applyStatus, hasStatus } from '@engine/skills/effects/status';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 10, armor: 0, magic: 5,
    colors: [], manaCost: 10, mana: 0, skillId: 'none',
    statuses: [], defeated: false, ...over,
  };
}

/** 建一对队伍并按特质编译被动（模拟 TurnEngine 构造时的那一步）。 */
function duel(attackerTraits: string[], targetTraits: string[]) {
  const attacker = makeChar(0, { attack: 10, traitIds: attackerTraits });
  const target = makeChar(4, { hp: 50, armor: 0, traitIds: targetTraits });
  attachPassives(attacker);
  attachPassives(target);
  const left: Team = { player: PlayerSide.Left, characters: [attacker] };
  const right: Team = { player: PlayerSide.Right, characters: [target] };
  return { attacker, target, left, right, combat: new CombatResolver() };
}

/** 带调用计数的种子随机源：断言新钩子不消耗随机数（既有 rng 终态不受影响） */
function countedRng(seed: number) {
  const rng = new SeededRNG(seed);
  const counter = { calls: 0 };
  return {
    counter,
    next: () => {
      counter.calls += 1;
      return rng.next();
    },
  };
}

describe('A · 双状态诅咒族：编译层', () => {
  const cases = [
    ['frozencurse', 'frozen'],
    ['entanglingcurse', 'entangle'],
    ['flamingcurse', 'burning'],
    ['stunningcurse', 'stun'],
    ['diseasedcurse', 'disease'],
    ['webbedcurse', 'web'],
  ] as const;

  it.each(cases)('%s 编译为「诅咒+%s」两条状态列表（描述顺序，3 回合；DoT 带 magnitude）', (code, other) => {
    const list = resolvePassives([code]).inflictOnSkullDamagedList;
    expect(list).toEqual([
      { id: 'curse', turns: 3 },
      other === 'burning' ? { id: other, turns: 3, magnitude: 1 } : { id: other, turns: 3 },
    ]);
  });

  it('无该特质的编译结果不带列表（中性被动不变）', () => {
    expect(resolvePassives([]).inflictOnSkullDamagedList).toBeUndefined();
    expect(resolvePassives(['poisonspores']).inflictOnSkullDamagedList).toBeUndefined();
  });
});

describe('A · 双状态诅咒族：骷髅结算（承受方向，反手给攻击者）', () => {
  const cases = [
    ['frozencurse', 'frozen'],
    ['entanglingcurse', 'entangle'],
    ['flamingcurse', 'burning'],
    ['stunningcurse', 'stun'],
    ['diseasedcurse', 'disease'],
    ['webbedcurse', 'web'],
  ] as const;

  it.each(cases)('%s：承受骷髅伤害后攻击者陷入诅咒和%s', (code, other) => {
    const { attacker, left, right, combat } = duel([], [code]);
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(attacker, 'curse')).toBe(true);
    expect(hasStatus(attacker, other)).toBe(true);
    for (const id of ['curse', other]) {
      expect(attacker.statuses.find((s) => s.id === id)?.turns).toBe(3);
      expect(out.events.some((e) => e.type === 'status-apply' && e.statusId === id)).toBe(true);
    }
  });

  it('施加顺序与描述一致（诅咒在前）', () => {
    const { attacker, left, right, combat } = duel([], ['frozencurse']);
    combat.resolveSkullDamage(left, right, 3);
    expect(attacker.statuses.map((s) => s.id)).toEqual(['curse', 'frozen']);
  });

  it('flamingcurse：燃烧是 DoT，施加带 magnitude 1；诅咒不带', () => {
    const { attacker, left, right, combat } = duel([], ['flamingcurse']);
    combat.resolveSkullDamage(left, right, 3);
    expect(attacker.statuses.find((s) => s.id === 'burning')).toMatchObject({ turns: 3, magnitude: 1 });
    expect(attacker.statuses.find((s) => s.id === 'curse')?.magnitude).toBeUndefined();
  });

  it('diseasedcurse：诅咒先上身即穿透普通免疫——疾病免疫（immune）的攻击者连疾病一起吃', () => {
    // 引擎既有官方口径（applyStatus）：GoW Curse penetrates ordinary immunities。
    // 列表里诅咒先施加，后续疾病对「已被诅咒的免疫者」照常生效。
    const { attacker, left, right, combat } = duel(['immune'], ['diseasedcurse']);
    combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(attacker, 'curse')).toBe(true);
    expect(hasStatus(attacker, 'disease')).toBe(true);
  });

  it('诅咒剥正面：带屏障的攻击者被打后屏障被剥掉、诅咒照常上身', () => {
    const { attacker, left, right, combat } = duel([], ['frozencurse']);
    attacker.statuses = [{ id: 'barrier', turns: 2 }];
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(attacker, 'barrier')).toBe(false);
    expect(hasStatus(attacker, 'curse')).toBe(true);
    expect(out.events.some((e) => e.type === 'status-expire' && e.statusId === 'barrier')).toBe(true);
  });

  it('新钩子零随机消耗（闪避/穿甲判定之外不多花随机数）', () => {
    const { left, right, combat } = duel([], ['frozencurse']);
    const rng = countedRng(42);
    combat.resolveSkullDamage(left, right, 3, rng);
    expect(rng.counter.calls).toBe(0);
  });
});

describe('B · 死亡钩子族：编译层', () => {
  it('bloodlust 编译为敌人身亡时自身获得狂怒（3 回合）', () => {
    expect(resolvePassives(['bloodlust']).onEnemyDeathStatus).toEqual({ id: 'rage', turns: 3 });
  });

  it('lordofdeath 编译为不死族种族光环（生命和魔法各 5）', () => {
    expect(resolvePassives(['lordofdeath']).onEnemyDeathTypeAura)
      .toEqual({ troopType: 'Undead', gains: { hp: 5, magic: 5 } });
  });

  it('sharedfate 编译为使另一名敌人陷入死亡标记（3 回合）', () => {
    expect(resolvePassives(['sharedfate']).onEnemyDeathEnemyStatus).toEqual({ id: 'death-mark', turns: 3 });
  });

  it('sacrifice 复用既有 onEnemyDeathGain（所有技能 → magic +3，randomStat 口径）', () => {
    expect(resolvePassives(['sacrifice']).gainOnEnemyDeath).toMatchObject({ magic: 3 });
  });
});

describe('B · applyEnemyDeathTriggers 纯函数层', () => {
  it('bloodlust：敌人身亡 → 持有者获得狂怒（rage，3 回合）', () => {
    const holder = makeChar(1, { traitIds: ['bloodlust'] });
    attachPassives(holder);
    const events = applyEnemyDeathTriggers([holder], [], { applyStatus });
    expect(hasStatus(holder, 'rage')).toBe(true);
    expect(holder.statuses.find((s) => s.id === 'rage')?.turns).toBe(3);
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'rage')).toBe(true);
  });

  it('lordofdeath：敌人身亡 → 持有一方的不死族盟友生命/魔法各 +5（含持有者本人）', () => {
    const holder = makeChar(1, { traitIds: ['lordofdeath'] });
    const undead = makeChar(2, { troopTypes: ['Undead'], hp: 30, maxHp: 30, magic: 8 });
    attachPassives(holder);
    attachPassives(undead);
    const events = applyEnemyDeathTriggers([holder, undead], [], { applyStatus });
    expect(undead.maxHp).toBe(35);
    expect(undead.hp).toBe(35);
    expect(undead.magic).toBe(13);
    // 持有者自己不是不死族，不吃光环
    expect(holder.maxHp).toBe(50);
    expect(holder.magic).toBe(5);
    expect(events.filter((e) => e.type === 'buff' && e.targetId === 2)).toEqual([
      { type: 'buff', source: 'trait', targetId: 2, stat: 'hp', amount: 5,
        traitActivations: [{ characterId: 1, traitId: 'lordofdeath', name: '死亡领主' }] },
      { type: 'buff', source: 'trait', targetId: 2, stat: 'magic', amount: 5,
        traitActivations: [{ characterId: 1, traitId: 'lordofdeath', name: '死亡领主' }] },
    ]);
  });

  it('lordofdeath：织网的盟友魔法增益被拦（引擎既有口径），生命照加', () => {
    const holder = makeChar(1, { traitIds: ['lordofdeath'] });
    const webbed = makeChar(2, {
      troopTypes: ['Undead'], hp: 30, maxHp: 30, magic: 8,
      statuses: [{ id: 'web', turns: 2 }],
    });
    attachPassives(holder);
    attachPassives(webbed);
    applyEnemyDeathTriggers([holder, webbed], [], { applyStatus });
    expect(webbed.maxHp).toBe(35);
    expect(webbed.magic).toBe(8);
  });

  it('sharedfate：敌人身亡 → 死者一方队伍序首个存活者陷入死亡标记（3 回合）', () => {
    const holder = makeChar(1, { traitIds: ['sharedfate'] });
    attachPassives(holder);
    const survivors = [makeChar(6, { hp: 1 }), makeChar(7)];
    const events = applyEnemyDeathTriggers([holder], survivors, { applyStatus });
    expect(hasStatus(survivors[0], 'death-mark')).toBe(true);
    expect(survivors[0].statuses.find((s) => s.id === 'death-mark')?.turns).toBe(3);
    expect(hasStatus(survivors[1], 'death-mark')).toBe(false);
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'death-mark')).toBe(true);
  });

  it('sharedfate：死者一方已无其他存活者（同队全灭）→ 空事件不崩溃', () => {
    const holder = makeChar(1, { traitIds: ['sharedfate'] });
    attachPassives(holder);
    expect(applyEnemyDeathTriggers([holder], [], { applyStatus })).toEqual([]);
  });

  it('sharedfate：目标带死亡标记免疫（warded）→ 不施加、零事件', () => {
    const holder = makeChar(1, { traitIds: ['sharedfate'] });
    const warded = makeChar(6, { traitIds: ['warded'] });
    attachPassives(holder);
    attachPassives(warded);
    const events = applyEnemyDeathTriggers([holder], [warded], { applyStatus });
    expect(hasStatus(warded, 'death-mark')).toBe(false);
    expect(events).toEqual([expect.objectContaining({ type: 'status-blocked' })]);
  });

  it('无持有者 / 持有者已阵亡：零事件零副作用', () => {
    const plain = makeChar(1);
    const deadHolder = makeChar(2, { traitIds: ['bloodlust'], defeated: true });
    attachPassives(deadHolder);
    expect(applyEnemyDeathTriggers([plain, deadHolder], [makeChar(6)], { applyStatus })).toEqual([]);
  });
});

describe('B · TurnEngine 集成：processDeathTriggers 接线（bloodlust）', () => {
  /** 双方轮流 AI 交换驱动对局（与 traitDeathSummon 同口径：chooseEnemySwap + resolveAction） */
  function buildEngine(
    playerChars: Character[],
    enemyChars: Character[],
    seed: number,
  ): { engine: TurnEngine; state: ReturnType<typeof createGameState>; rng: SeededRNG } {
    const idGen = (() => { let n = 500; return () => ++n; })();
    const rng = new SeededRNG(seed);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: playerChars },
      { player: PlayerSide.Right, characters: enemyChars },
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    return { engine, state, rng };
  }

  it('敌方角色在行动中阵亡 → 我方 bloodlust 持有者获得狂怒（逐行动检查，狂怒未被攻击消耗）', () => {
    let triggered = false;
    for (let seed = 1; seed < 80 && !triggered; seed++) {
      const holder = makeChar(1, { traitIds: ['bloodlust'] });
      const { engine, state, rng } = buildEngine(
        // 我方队首高攻（秒杀对面 hp1 队首），持有者在第二位：本行动内不会自己攻击消耗狂怒
        [makeChar(0, { attack: 60, hp: 60, maxHp: 60 }), holder],
        [makeChar(4, { hp: 1, maxHp: 1 }), makeChar(5)],
        seed,
      );
      for (let i = 0; i < 40 && !triggered; i++) {
        if (state.state === 'GameOver') break;
        const before = state.teams[PlayerSide.Right].characters.length;
        const swap = chooseEnemySwap(state.board, rng);
        if (!swap) break;
        engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b });
        const after = state.teams[PlayerSide.Right].characters.length;
        if (after < before && !holder.defeated) {
          triggered = true;
          expect(hasStatus(holder, 'rage')).toBe(true);
        }
      }
    }
    expect(triggered, '80 个种子内应至少出现一次敌阵亡并触发 bloodlust').toBe(true);
  });
});
