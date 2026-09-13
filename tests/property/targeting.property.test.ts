import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { selectTargets } from '@engine/skills/targeting';
import type { TargetMode } from '@engine/skills/targeting';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

/**
 * 目标选择属性测试（需求 5.3, 5.4）。
 *   - 随机目标用同种子结果一致（确定性）
 *   - 选中集恒不含阵亡角色
 */

function makeChar(id: number, hp: number, defeated: boolean): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated,
  };
}

/** 生成一支 1~4 人、含随机 hp 与阵亡标记的队伍 */
const teamArb = (baseId: number) =>
  fc
    .array(
      fc.record({
        hp: fc.integer({ min: 0, max: 50 }),
        defeated: fc.boolean(),
      }),
      { minLength: 1, maxLength: 4 },
    )
    .map((rows) =>
      rows.map((r, i) => makeChar(baseId + i, r.hp, r.defeated || r.hp <= 0)),
    );

function stateOf(leftChars: Character[], rightChars: Character[]) {
  const left: Team = { player: PlayerSide.Left, characters: leftChars };
  const right: Team = { player: PlayerSide.Right, characters: rightChars };
  return createGameState(new BoardModel(), left, right);
}

const ALL_MODES: TargetMode[] = [
  'enemyFront',
  'enemyRandom',
  'enemyWeakest',
  'enemyHealthiest',
  'enemyFirstN',
  'enemyLast',
  'enemyAll',
  'allySelf',
  'allyFront',
  'allyRandom',
  'allyWeakest',
  'allyHealthiest',
  'allyFirstN',
  'allyLast',
  'allyAll',
];

describe('目标选择属性（需求 5.3）', () => {
  it('任意模式下选中集恒不含阵亡角色', () => {
    fc.assert(
      fc.property(
        teamArb(0),
        teamArb(4),
        fc.constantFrom(...ALL_MODES),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 4 }),
        (leftChars, rightChars, mode, seed, n) => {
          const state = stateOf(leftChars, rightChars);
          // 施法者取左队第一人（无论其是否阵亡都测试选择器鲁棒性）
          const casterId = leftChars[0].id;
          const targets = selectTargets(mode, state, casterId, new SeededRNG(seed), n);
          for (const t of targets) {
            expect(t.defeated).toBe(false);
          }
        },
      ),
    );
  });

  it('随机模式用同种子产出一致结果（需求 5.4）', () => {
    const randomModes: TargetMode[] = ['enemyRandom', 'allyRandom'];
    fc.assert(
      fc.property(
        teamArb(0),
        teamArb(4),
        fc.constantFrom(...randomModes),
        fc.integer({ min: 0, max: 100 }),
        (leftChars, rightChars, mode, seed) => {
          const state = stateOf(leftChars, rightChars);
          const casterId = leftChars.find((c) => !c.defeated)?.id ?? leftChars[0].id;
          const a = selectTargets(mode, state, casterId, new SeededRNG(seed));
          const b = selectTargets(mode, state, casterId, new SeededRNG(seed));
          expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
        },
      ),
    );
  });

  it('weakest/healthiest 返回的是存活集合中的 hp 极值', () => {
    fc.assert(
      fc.property(teamArb(4), fc.integer({ min: 0, max: 100 }), (rightChars, seed) => {
        const leftChars = [makeChar(0, 50, false)];
        const state = stateOf(leftChars, rightChars);
        const alive = rightChars.filter((c) => !c.defeated);
        if (alive.length === 0) return; // 无目标场景由单测覆盖

        const weakest = selectTargets('enemyWeakest', state, 0, new SeededRNG(seed));
        const healthiest = selectTargets('enemyHealthiest', state, 0, new SeededRNG(seed));
        const minHp = Math.min(...alive.map((c) => c.hp));
        const maxHp = Math.max(...alive.map((c) => c.hp));
        expect(weakest[0].hp).toBe(minHp);
        expect(healthiest[0].hp).toBe(maxHp);
      }),
    );
  });
});
