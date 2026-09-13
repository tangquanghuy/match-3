import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { evaluateScaling } from '@engine/skills/scaling';
import { damageEffect } from '@engine/skills/effects/damage';
import { buffEffect } from '@engine/skills/effects/buff';
import { selectTargets } from '@engine/skills/targeting';
import type { EffectContext } from '@engine/skills/effects/context';
import type { SkillPrototype, EffectSegment } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';
import type { GameState } from '@engine/GameState';
import type { GameEvent } from '@engine/events';

/**
 * 战斗技能系统集中属性测试（需求 12.1–12.5）。
 *   - 缩放非负
 *   - 任意增益/伤害序列后 hp∈[0,maxHp]、mana∈[0,manaCost]
 *   - 技能释放确定性（相同状态 + 种子 → 相同事件流）
 *   - 事件流排序合法（skill-cast 先、game-over 末）
 */

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}
function fillBoard(board: BoardModel, palette: BaseColor[]): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
    }
  }
}

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
    manaCost: 12,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeState(): GameState {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0), makeChar(1)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] };
  return createGameState(new BoardModel(), left, right);
}

// —— 需求 12.1：缩放非负 ——
describe('缩放非负（需求 12.1）', () => {
  it('任意 spec 与 magic≥0，evaluateScaling ≥ 0 且为整数', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.integer({ min: 0, max: 40 }),
        (base, mult, magic) => {
          const v = evaluateScaling({ base, mult }, magic);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(v)).toBe(true);
        },
      ),
    );
  });
});

// —— 需求 12.2：hp/mana 不越界 ——
describe('增益/伤害序列后 hp、mana 不越界（需求 12.2）', () => {
  type Op =
    | { t: 'dmgFront'; base: number }
    | { t: 'dmgAll'; base: number }
    | { t: 'healSelf'; base: number }
    | { t: 'manaSelf'; base: number };

  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.integer({ min: 0, max: 30 }).map((base) => ({ t: 'dmgFront', base } as Op)),
    fc.integer({ min: 0, max: 30 }).map((base) => ({ t: 'dmgAll', base } as Op)),
    fc.integer({ min: 0, max: 30 }).map((base) => ({ t: 'healSelf', base } as Op)),
    fc.integer({ min: 0, max: 30 }).map((base) => ({ t: 'manaSelf', base } as Op)),
  );

  it('对任意操作序列，全体角色 0≤hp≤maxHp 且 0≤mana≤manaCost', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 0, maxLength: 20 }), fc.integer({ min: 0, max: 50 }), (ops, seed) => {
        const state = makeState();
        const rng = new SeededRNG(seed);
        let idc = 70000;
        const ctx = (casterId: number): EffectContext => ({
          state,
          casterId,
          rng,
          nextGemId: () => idc++,
        });

        for (const op of ops) {
          switch (op.t) {
            case 'dmgFront': {
              const targets = selectTargets('enemyFront', state, 0, rng);
              damageEffect({ targets, scaling: { base: op.base, mult: 1 } }).apply(ctx(0));
              break;
            }
            case 'dmgAll': {
              const targets = selectTargets('enemyAll', state, 0, rng);
              damageEffect({ targets, scaling: { base: op.base, mult: 1 }, range: 'all' }).apply(ctx(0));
              break;
            }
            case 'healSelf': {
              const targets = selectTargets('allyAll', state, 0, rng);
              buffEffect({ targets, stat: 'hp', scaling: { base: op.base, mult: 0 } }).apply(ctx(0));
              break;
            }
            case 'manaSelf': {
              const targets = selectTargets('allyAll', state, 0, rng);
              buffEffect({ targets, stat: 'mana', scaling: { base: op.base, mult: 0 } }).apply(ctx(0));
              break;
            }
          }
        }

        for (const side of [PlayerSide.Left, PlayerSide.Right]) {
          for (const c of state.teams[side].characters) {
            expect(c.hp).toBeGreaterThanOrEqual(0);
            expect(c.hp).toBeLessThanOrEqual(c.maxHp);
            expect(c.mana).toBeGreaterThanOrEqual(0);
            expect(c.mana).toBeLessThanOrEqual(c.manaCost);
          }
        }
      }),
    );
  });
});

// —— 需求 12.3/12.4：确定性 + 事件排序 ——
describe('技能释放确定性与事件排序（需求 12.3, 12.4）', () => {
  // 随机组装一个多段原型
  const segArb: fc.Arbitrary<EffectSegment> = fc.oneof(
    fc.integer({ min: 0, max: 20 }).map(
      (base) => ({ kind: 'damage', target: 'enemyRandom', scaling: { base, mult: 1 } } as EffectSegment),
    ),
    fc.integer({ min: 0, max: 20 }).map(
      (base) => ({ kind: 'damage', target: 'enemyAll', scaling: { base, mult: 0 }, range: 'all' } as EffectSegment),
    ),
    fc.integer({ min: 0, max: 10 }).map(
      (base) => ({ kind: 'buff', target: 'allySelf', stat: 'attack', scaling: { base, mult: 0 } } as EffectSegment),
    ),
    fc.constant({ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', rows: [3] } } } as EffectSegment),
    fc.constant({ kind: 'extraTurn' } as EffectSegment),
  );

  function runCast(proto: SkillPrototype, seed: number): GameEvent[] {
    gid = 0; // 固定初始棋盘 id
    const board = new BoardModel();
    fillBoard(board, [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple]);
    const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, { mana: 12, skillId: 'x' })] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] };
    const state = createGameState(board, left, right);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('x', proto);
    let idg = 200000;
    const engine = new TurnEngine(state, new SeededRNG(seed), () => idg++, registry);
    engine.skullChance = 0;
    return engine.castSkill(0);
  }

  it('相同状态 + 种子 → 相同事件流', () => {
    fc.assert(
      fc.property(fc.array(segArb, { minLength: 0, maxLength: 5 }), fc.integer({ min: 1, max: 100 }), (segments, seed) => {
        const proto: SkillPrototype = { segments };
        const a = runCast(proto, seed);
        const b = runCast(proto, seed);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
    );
  });

  it('事件流排序合法：skill-cast 首、game-over（若有）末', () => {
    fc.assert(
      fc.property(fc.array(segArb, { minLength: 0, maxLength: 5 }), fc.integer({ min: 1, max: 100 }), (segments, seed) => {
        const events = runCast({ segments }, seed);
        // skill-cast 必为首事件
        expect(events[0]?.type).toBe('skill-cast');
        // 后续不再出现 skill-cast
        expect(events.slice(1).some((e) => e.type === 'skill-cast')).toBe(false);
        // game-over 若存在，必为末事件且唯一
        const goIdx = events.findIndex((e) => e.type === 'game-over');
        if (goIdx >= 0) {
          expect(goIdx).toBe(events.length - 1);
          expect(events.filter((e) => e.type === 'game-over').length).toBe(1);
        }
      }),
    );
  });
});
