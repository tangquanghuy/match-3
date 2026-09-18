/**
 * R22 吞噬批特质回归测试（voracious 贪食 / consumefuel 消耗燃料 / bloodyfeast 血腥盛宴）：
 *   - voracious「在造成骷髅头伤害时有 5% 的几率吞噬敌人」→ onSkullHitDevour（吞受击目标）；
 *   - consumefuel「头骨受到伤害时有 10% 的几率吞噬第一个敌人」→ onSkullDamagedDevour
 *     （引擎落地口径=吞攻击者：受击时攻击者即敌方队首）；
 *   - bloodyfeast「若敌人死亡，则有 20% 的几率吞噬该随机敌人」→ onEnemyDeathDevour
 *     （吞死者一方随机一名存活）。
 *
 * 消费点：TurnEngine.applySkullDevourTriggers（骷髅主结算 skull-damage 事件之后）与
 * processDeathTriggers（敌亡结算）。复用 devourEffect 原语：即杀走 damageOne 管线、
 * 吞噬者 +2 攻/甲/魔 +5 生命、devourImmunity 在原语口整体跳过（不杀不成长不耗 rng）。
 *
 * 护栏：无新键特质零事件（事件类型序列与基线逐字节一致）、同种子确定性；
 * 概率 <1 经种子化 rng 判定（种子扫描覆盖命中与落空两种情形）。
 */
import { describe, it, expect } from 'vitest';
import { resolvePassives, neutralPassives, getTrait } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem, skullGem } from '@engine/types';
import type { Character, Team } from '@engine/types';
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

/** 底行骷髅三连对局（与 traitWiringBatch 的 skullMatchBattle 同款）：交换 (7,1)<->(6,1) 后三骷髅命中右方队首 */
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

const eventKinds = (events: GameEvent[]) => events.map((e) => e.type).join(',');

/** 吞噬成长的官方单次额度（devourEffect 缺省）：攻/甲/魔各 +2、生命 +5 */
describe('数据落地（R22 吞噬批 3 code）', () => {
  it('三个 code 的定义与编译产物', () => {
    expect(getTrait('voracious')?.onSkullHitDevour).toEqual({ chance: 0.05 });
    expect(getTrait('consumefuel')?.onSkullDamagedDevour).toEqual({ chance: 0.1 });
    expect(getTrait('bloodyfeast')?.onEnemyDeathDevour).toEqual({ chance: 0.2 });
    expect(resolvePassives(['voracious']).onSkullHitDevour).toEqual({ chance: 0.05 });
    expect(resolvePassives(['consumefuel']).onSkullDamagedDevour).toEqual({ chance: 0.1 });
    expect(resolvePassives(['bloodyfeast']).onEnemyDeathDevour).toEqual({ chance: 0.2 });
    // 单值触发族同口径：多条并存取先声明的一条
    expect(resolvePassives(['voracious', 'voracious']).onSkullHitDevour).toEqual({ chance: 0.05 });
  });

  it('无吞噬键的特质编译为中性（不产生新键）', () => {
    expect(JSON.stringify(resolvePassives(['fast']))).toBe(JSON.stringify(neutralPassives()));
  });
});

describe('voracious 贪食：骷髅命中吞噬受击目标（TurnEngine.applySkullDevourTriggers）', () => {
  it('命中吞噬：目标即杀 + 吞噬者获官方成长；落空种子目标存活、无成长', () => {
    let sawDevour = false;
    let sawMiss = false;
    for (let seed = 1; seed <= 120 && (!sawDevour || !sawMiss); seed++) {
      const { engine, state } = skullMatchBattle(
        // 攻击者预扣生命（30/50）：吞噬的 +5 生命成长走治疗口径，预扣后才可见
        [makeChar(0, { attack: 10, hp: 30, traitIds: ['voracious'] })],
        [makeChar(4, { hp: 50 })],
        seed,
      );
      const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      const attacker = state.teams[PlayerSide.Left].characters[0];
      // 吞噬命中以攻击者成长（攻 10→12）为信号——不受链式骷髅伤害干扰
      const devoured = attacker.attack === 12;
      if (devoured && !sawDevour) {
        sawDevour = true;
        // 即杀走 damageOne 管线：skill-damage 事件（伤害=当时有效耐久 50-10=40）+ 目标归零
        const kill = events.find(
          (e) => e.type === 'skill-damage' && (e as { targetId: number }).targetId === 4
            && (e as { resultingHp: number }).resultingHp === 0,
        );
        expect(kill).toBeDefined();
        expect(events.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 4)).toBe(true);
        // 成长：+2 攻/甲/魔、+5 生命（治疗口径：30→35，maxHp 不变）
        expect(attacker.attack).toBe(12);
        expect(attacker.armor).toBe(2);
        expect(attacker.magic).toBe(10);
        expect(attacker.hp).toBe(35);
        expect(attacker.maxHp).toBe(50);
      }
      if (!devoured && !sawMiss) {
        sawMiss = true;
        // 落空：目标存活（链式骷髅可能追加伤害，故不断言精确血量），吞噬者无成长无治疗
        expect(state.teams[PlayerSide.Right].characters.length).toBe(1);
        expect(attacker.attack).toBe(10);
        expect(attacker.hp).toBe(30);
      }
    }
    expect(sawDevour).toBe(true);
    expect(sawMiss).toBe(true);
  });

  it('吞噬免疫（indigestible）整体拦截：不杀、不成长（同命中种子）', () => {
    // 先找一个命中种子（吞噬者成长即吞噬命中，不受链式骷髅干扰）
    for (let seed = 1; seed <= 120; seed++) {
      const probe = skullMatchBattle(
        [makeChar(0, { attack: 10, traitIds: ['voracious'] })],
        [makeChar(4, { hp: 50 })],
        seed,
      );
      probe.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      if (probe.state.teams[PlayerSide.Left].characters[0].attack === 12) {
        // 同种子换成免疫目标：骷髅伤害照常结算（链式可能追加，不断言精确血量），
        // 吞噬被原语口整体拦截——目标存活、无成长、无 defeat 事件
        const { engine, state } = skullMatchBattle(
          [makeChar(0, { attack: 10, hp: 30, traitIds: ['voracious'] })],
          [makeChar(4, { hp: 50, traitIds: ['indigestible'] })],
          seed,
        );
        const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
        expect(state.teams[PlayerSide.Right].characters.length).toBe(1);
        expect(state.teams[PlayerSide.Right].characters[0].defeated).toBe(false);
        expect(state.teams[PlayerSide.Left].characters[0].attack).toBe(10);
        expect(state.teams[PlayerSide.Left].characters[0].hp).toBe(30);
        expect(events.some((e) => e.type === 'defeat')).toBe(false);
        return;
      }
    }
    throw new Error('扫描范围内未找到 voracious 命中种子');
  });
});

describe('consumefuel 消耗燃料：受击吞噬攻击者（onSkullDamagedDevour）', () => {
  it('受击吞噬：攻击者被吞 + 持有者获官方成长；落空种子攻击者存活', () => {
    let sawDevour = false;
    let sawMiss = false;
    for (let seed = 1; seed <= 160 && (!sawDevour || !sawMiss); seed++) {
      const { engine, state } = skullMatchBattle(
        [makeChar(0, { attack: 10 })],
        [makeChar(4, { maxHp: 100, hp: 100, traitIds: ['consumefuel'] })],
        seed,
      );
      const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
      const holder = state.teams[PlayerSide.Right].characters[0];
      // 吞噬命中以持有者成长（攻 10→12）为信号——不受链式骷髅伤害干扰
      const devoured = holder.attack === 12;
      if (devoured && !sawDevour) {
        sawDevour = true;
        // 攻击者被吞（即杀=有效耐久 10）
        expect(events.some((e) => e.type === 'defeat' && (e as { characterId: number }).characterId === 0)).toBe(true);
        // 持有者成长 +2/+2/+2/+5（生命走治疗口径，maxHp 不变；受击后必有余量可回）
        expect(holder.attack).toBe(12);
        expect(holder.armor).toBe(2);
        expect(holder.magic).toBe(10);
        expect(holder.maxHp).toBe(100);
        expect(state.teams[PlayerSide.Left].characters.length).toBe(0);
      }
      if (!devoured && !sawMiss) {
        sawMiss = true;
        // 落空：攻击者存活，持有者无成长（不断言精确血量——链式骷髅可能追加伤害）
        expect(state.teams[PlayerSide.Left].characters.length).toBe(1);
        expect(holder.attack).toBe(10);
        expect(holder.maxHp).toBe(100);
      }
    }
    expect(sawDevour).toBe(true);
    expect(sawMiss).toBe(true);
  });
});

describe('bloodyfeast 血腥盛宴：敌亡吞噬随机存活（processDeathTriggers）', () => {
  /** 左方=击杀者+血腥盛宴持有者，右方=低血受害者+一名队友；受害者被骷髅击杀后触发。
   *  吞噬命中以持有者成长（攻 5→7）为信号——不受链式骷髅伤害干扰。持有者预扣生命
   *  （30/50），吞噬 +5 生命走治疗口径（左方不受击，30→35 确定性可见）。 */
  const feast = (seed: number, mateOver: Partial<Character> = {}) => {
    const victim = makeChar(4, { hp: 5 });
    const mate = makeChar(5, { hp: 60, ...mateOver });
    const { engine, state } = skullMatchBattle(
      [makeChar(0, { attack: 40 }), makeChar(1, { attack: 5, hp: 30, traitIds: ['bloodyfeast'] })],
      [victim, mate],
      seed,
    );
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const right = state.teams[PlayerSide.Right].characters;
    const holder = state.teams[PlayerSide.Left].characters[1];
    return { events, state, right, holder, devoured: holder.attack === 7 };
  };

  it('敌亡吞噬：受害者阵亡后按概率吞掉随机存活（持有者获官方成长）；落空种子无成长', () => {
    let sawDevour = false;
    let sawMiss = false;
    for (let seed = 1; seed <= 160 && (!sawDevour || !sawMiss); seed++) {
      const { right, holder, devoured } = feast(seed);
      // 受害者（id 4）必死于骷髅命中；吞噬目标只从存活取，幸存者若存在必是队友（id 5）
      expect(right.some((c) => c.id === 4)).toBe(false);
      if (devoured && !sawDevour) {
        sawDevour = true;
        expect(right.length).toBe(0); // 唯一候选（队友）被吞
        expect(holder.attack).toBe(7);
        expect(holder.hp).toBe(35);
      }
      if (!devoured && !sawMiss) {
        sawMiss = true;
        expect(holder.attack).toBe(5);
        expect(holder.hp).toBe(30);
      }
    }
    expect(sawDevour).toBe(true);
    expect(sawMiss).toBe(true);
  });

  it('吞噬免疫拦截随机目标：唯一候选带 indigestible 时不吞、不成长（全种子不变式）', () => {
    // 对照组：同夹具无免疫时存在命中种子（证明夹具本身可吞）
    let controlHit = false;
    for (let seed = 1; seed <= 160 && !controlHit; seed++) {
      if (feast(seed).devoured) controlHit = true;
    }
    expect(controlHit).toBe(true);
    // 免疫组：候选唯一且带 indigestible——无论 20% 是否命中都不吞、不成长
    for (let seed = 1; seed <= 60; seed++) {
      const { right, holder } = feast(seed, { traitIds: ['indigestible'] });
      expect(holder.attack).toBe(5);
      expect(right.length).toBe(1);
      expect(right[0].id).toBe(5);
      expect(right[0].defeated).toBe(false);
    }
  });
});

describe('护栏：无新键特质零事件、同种子确定性', () => {
  it('无吞噬特质对局与基线事件类型序列一致（骷髅路径零新增事件）', () => {
    const plain = skullMatchBattle([makeChar(0, { attack: 10 })], [makeChar(4, { hp: 100 })], 11);
    const base = plain.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const unrelated = skullMatchBattle(
      [makeChar(0, { attack: 10, traitIds: ['fast'] })],
      [makeChar(4, { hp: 100, traitIds: ['sacred'] })],
      11,
    );
    const old = unrelated.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(eventKinds(old)).toBe(eventKinds(base));
  });

  it('voracious 对局同种子重放事件序列一致（确定性）', () => {
    const run = () => {
      const { engine } = skullMatchBattle(
        [makeChar(0, { attack: 10, traitIds: ['voracious'] })],
        [makeChar(4, { hp: 50 })],
        3,
      );
      return eventKinds(engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 }));
    };
    expect(run()).toBe(run());
  });
});
