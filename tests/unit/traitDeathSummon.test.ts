/**
 * 死亡召唤特质测试（summonOnDeath / summonOnAllyDeath / summonOnEnemyDeath）。
 *
 * 语义（对齐官方）：
 *   - summonOnDeath 只有死者本人持有才触发；
 *   - summonOnAllyDeath 由死者队伍存活持有者触发（持有者自己阵亡不触发）；
 *   - summonOnEnemyDeath 由对方队伍存活持有者触发；
 *   - 概率判定走注入的种子化 rng；满概率（chance=1）不需要 rng。
 * 链路：TurnEngine.processDeathTriggers → resolveDeathSummons → applyDeathSummons
 *   → enqueueSummon（容量满进 FIFO 队列，同召唤技能语义）。
 */
import { describe, it, expect } from 'vitest';
import { applyDeathSummons, setSummonTemplateResolver } from '@engine/traits';
import type { DeathSummonSpec } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { PlayerSide, BaseColor } from '@engine/types';
import type { Character } from '@engine/types';

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

const SPEC: DeathSummonSpec = {
  chance: 1,
  troopId: 6011,
  referenceName: 'AncientHorror',
  displayName: '远古恐惧',
};

describe('applyDeathSummons 纯函数层', () => {
  it('满概率：召唤物经模板解析入队（enqueue 收到带 id 的完整角色）', () => {
    const templates: string[] = [];
    setSummonTemplateResolver((spec) => {
      templates.push(spec.referenceName);
      return {
        name: spec.displayName,
        maxHp: 10, hp: 10, attack: 1, armor: 0, magic: 1,
        colors: [BaseColor.Purple], manaCost: 8, mana: 0, skillId: 'none',
      };
    });
    const enqueued: { name?: string; troopId: number; id?: number; side?: string }[] = [];
    const events = applyDeathSummons([{ spec: SPEC, side: PlayerSide.Left }], {
      deadId: 9,
      nextCharId: () => 100,
      enqueue: (summoned, troopId, side) => {
        enqueued.push({ name: summoned.name, troopId, id: summoned.id, side });
        return [];
      },
    });
    expect(templates).toEqual(['AncientHorror']);
    expect(enqueued).toEqual([{ name: '远古恐惧', troopId: 6011, id: 100, side: PlayerSide.Left }]);
    expect(events).toEqual([]);
  });

  it('概率判定失败：不召唤', () => {
    const half: DeathSummonSpec = { ...SPEC, chance: 0.25 };
    const events = applyDeathSummons([{ spec: half, side: PlayerSide.Left }], {
      deadId: 9,
      nextCharId: () => 100,
      rng: { next: () => 0.5 }, // 0.5 >= 0.25 → 拒绝
      enqueue: () => [{ type: 'summon' } as never],
    });
    expect(events).toEqual([]);
  });

  it('概率判定成功：召唤（同一条 rng，确定性）', () => {
    const half: DeathSummonSpec = { ...SPEC, chance: 0.25 };
    let called = 0;
    applyDeathSummons([{ spec: half, side: PlayerSide.Left }], {
      deadId: 9,
      nextCharId: () => 100,
      rng: { next: () => 0.1 }, // 0.1 < 0.25 → 通过
      enqueue: () => { called++; return []; },
    });
    expect(called).toBe(1);
  });

  it('模板解析失败（召唤名查无兵种）：安全跳过不崩溃', () => {
    setSummonTemplateResolver(() => null);
    const events = applyDeathSummons([{ spec: SPEC, side: PlayerSide.Left }], {
      deadId: 9,
      nextCharId: () => 100,
      enqueue: () => [{ type: 'summon' } as never],
    });
    expect(events).toEqual([]);
  });
});

describe('TurnEngine 集成：真实对局中的死亡召唤', () => {
  /** 双方轮流 AI 交换驱动对局（与 App.runEnemyTurn 同口径：chooseEnemySwap + resolveAction） */
  function drive(engine: TurnEngine, state: ReturnType<typeof createGameState>, rng: SeededRNG, maxTurns = 60): void {
    for (let i = 0; i < maxTurns; i++) {
      if (state.state === 'GameOver') return;
      const swap = chooseEnemySwap(state.board, rng);
      if (!swap) return;
      engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b });
    }
  }

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
    setSummonTemplateResolver((spec) => ({
      name: spec.displayName,
      maxHp: 12, hp: 12, attack: 2, armor: 0, magic: 2,
      colors: [BaseColor.Purple], manaCost: 8, mana: 0, skillId: 'none',
    }));
    return { engine, state, rng };
  }

  it('持有 summonOnDeath 的角色被击杀 → 本队补位召唤（远古恐惧）', () => {
    let triggered = false;
    // daemonicpact 25% 概率：多换种子，锁定「触发时行为必须正确」
    for (let seed = 1; seed < 80 && !triggered; seed++) {
      const { engine, state, rng } = buildEngine(
        [makeChar(0, { hp: 1, maxHp: 1, traitIds: ['daemonicpact'] }), makeChar(1), makeChar(2)],
        [makeChar(4, { attack: 60 }), makeChar(5)],
        seed,
      );
      drive(engine, state, rng);
      const summoned = state.teams[PlayerSide.Left].characters.find((c) => c.name === '远古恐惧');
      if (summoned) {
        triggered = true;
        expect(summoned.maxHp).toBe(12); // 来自测试注入的模板，证明装配链路走通
      }
    }
    expect(triggered, '80 个种子内 25% 召唤应至少触发一次').toBe(true);
  });

  it('敌方持有 summonOnEnemyDeath：我方角色阵亡时设风暴而非召唤兵种（darkdeath → 暗风暴变体）', () => {
    // 生成器两段式解析后，darkdeath 的「暗风暴」解析为风暴变体 spec：不入队兵种，
    // 改设持有者（敌方）一方的 team.storm。本用例锁定：90 个种子内绝不误召其它单位，
    // 且首个我方阵亡后敌方风暴出现（chance=1）。风暴持续 8 回合会到期，因此须在
    // 驱动过程中捕获在场状态，不能等整局跑完再看。
    let stormSeen = false;
    for (let seed = 1; seed < 90; seed++) {
      const { engine, state, rng } = buildEngine(
        [makeChar(0, { hp: 1, maxHp: 1 }), makeChar(1), makeChar(2), makeChar(3)],
        [makeChar(4, { attack: 60, traitIds: ['darkdeath'] }), makeChar(5)],
        seed,
      );
      let stormHere: { color: BaseColor; turns: number; troopId: number } | undefined;
      for (let i = 0; i < 60 && !stormHere; i++) {
        if (state.state === 'GameOver') break;
        const swap = chooseEnemySwap(state.board, rng);
        if (!swap) break;
        engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b });
        stormHere = state.teams[PlayerSide.Right].storm;
      }
      expect(state.teams[PlayerSide.Right].characters.some((c) => c.name !== 'C4' && c.name !== 'C5' && c.name.startsWith('C') === false && c.id !== 4 && c.id !== 5)).toBe(false);
      if (stormHere) {
        stormSeen = true;
        expect(stormHere).toEqual({ color: BaseColor.Purple, turns: 8, troopId: 9001 });
      }
    }
    expect(stormSeen, '90 个种子内 darkdeath 应至少设置一次暗风暴').toBe(true);
  });

  it('召唤名可解析的敌方死亡召唤（soullegion → 幽魂）触发时补位正确', () => {
    let triggered = false;
    for (let seed = 1; seed < 120 && !triggered; seed++) {
      const { engine, state, rng } = buildEngine(
        [makeChar(0, { hp: 1, maxHp: 1 }), makeChar(1), makeChar(2), makeChar(3)],
        [makeChar(4, { attack: 60, traitIds: ['soullegion'] }), makeChar(5)],
        seed,
      );
      drive(engine, state, rng);
      const summoned = state.teams[PlayerSide.Right].characters.find((c) => c.name === '幽魂');
      if (summoned) {
        triggered = true;
        expect(summoned.name).toBe('幽魂');
      }
    }
    expect(triggered, 'soullegion 50% 概率，120 个种子应至少触发一次').toBe(true);
  });
});
