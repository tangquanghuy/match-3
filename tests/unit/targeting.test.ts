import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { selectTargets, sideOf } from '@engine/skills/targeting';
import type { TargetMode } from '@engine/skills/targeting';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

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

/** 左队 id 0..3，右队 id 4..7；可用 hp 覆盖设定 */
function makeTeams(leftHp: number[], rightHp: number[]): {
  left: Team;
  right: Team;
} {
  const left: Team = {
    player: PlayerSide.Left,
    characters: leftHp.map((hp, i) => makeChar(i, { hp })),
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: rightHp.map((hp, i) => makeChar(i + 4, { hp })),
  };
  return { left, right };
}

function makeState(left: Team, right: Team) {
  return createGameState(new BoardModel(), left, right);
}

const rng = () => new SeededRNG(42);

describe('selectTargets 敌方模式（施法者为左队 id 0）', () => {
  it('enemyFront 取敌方队首存活', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    const state = makeState(left, right);
    const t = selectTargets('enemyFront', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([4]);
  });

  it('enemyFront 跳过已阵亡的队首', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    right.characters[0].defeated = true;
    const state = makeState(left, right);
    const t = selectTargets('enemyFront', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([5]);
  });

  it('enemyLast 取最后一名存活', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    right.characters[3].defeated = true;
    const state = makeState(left, right);
    const t = selectTargets('enemyLast', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([6]);
  });

  it('enemyAll 取全部存活，排除阵亡（需求 5.3）', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    right.characters[1].defeated = true;
    const state = makeState(left, right);
    const t = selectTargets('enemyAll', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([4, 6, 7]);
  });

  it('enemyFirstN 取前 N 名存活', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    const state = makeState(left, right);
    const t = selectTargets('enemyFirstN', state, 0, rng(), 2);
    expect(t.map((c) => c.id)).toEqual([4, 5]);
  });

  it('enemyWeakest 取最低 hp', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    const state = makeState(left, right);
    const t = selectTargets('enemyWeakest', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([7]);
  });

  it('enemyHealthiest 取最高 hp', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    const state = makeState(left, right);
    const t = selectTargets('enemyHealthiest', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([4]);
  });

  it('weakest 平局取队伍索引更小者（需求 5.2）', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [20, 20, 30, 40]);
    const state = makeState(left, right);
    const t = selectTargets('enemyWeakest', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([4]);
  });

  it('healthiest 平局取队伍索引更小者', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 40, 30, 20]);
    const state = makeState(left, right);
    const t = selectTargets('enemyHealthiest', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([4]);
  });
});

describe('selectTargets 己方模式', () => {
  it('allySelf 取施法者自身', () => {
    const { left, right } = makeTeams([50, 40, 30, 20], [50, 50, 50, 50]);
    const state = makeState(left, right);
    const t = selectTargets('allySelf', state, 2, rng());
    expect(t.map((c) => c.id)).toEqual([2]);
  });

  it('allySelf 施法者已阵亡则返回空', () => {
    const { left, right } = makeTeams([50, 40, 30, 20], [50, 50, 50, 50]);
    left.characters[2].defeated = true;
    const state = makeState(left, right);
    const t = selectTargets('allySelf', state, 2, rng());
    expect(t).toEqual([]);
  });

  it('allyWeakest 在己方队伍中选最低 hp', () => {
    const { left, right } = makeTeams([50, 40, 15, 20], [50, 50, 50, 50]);
    const state = makeState(left, right);
    const t = selectTargets('allyWeakest', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([2]);
  });

  it('allyAll 取己方全部存活', () => {
    const { left, right } = makeTeams([50, 40, 30, 20], [50, 50, 50, 50]);
    const state = makeState(left, right);
    const t = selectTargets('allyAll', state, 0, rng());
    expect(t.map((c) => c.id)).toEqual([0, 1, 2, 3]);
  });
});

describe('selectTargets 边界与随机', () => {
  it('无合法目标（敌方全灭）返回空（需求 5.5）', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [10, 10, 10, 10]);
    right.characters.forEach((c) => (c.defeated = true));
    const state = makeState(left, right);
    for (const mode of ['enemyFront', 'enemyAll', 'enemyRandom', 'enemyWeakest'] as TargetMode[]) {
      expect(selectTargets(mode, state, 0, rng())).toEqual([]);
    }
  });

  it('enemyRandom 用同种子结果一致（需求 5.4）', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    const state = makeState(left, right);
    const a = selectTargets('enemyRandom', state, 0, new SeededRNG(7));
    const b = selectTargets('enemyRandom', state, 0, new SeededRNG(7));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a.length).toBe(1);
  });

  it('enemyRandom 永不选中阵亡角色（需求 5.3）', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [40, 30, 20, 10]);
    right.characters[0].defeated = true;
    right.characters[2].defeated = true;
    const state = makeState(left, right);
    const aliveIds = new Set([5, 7]);
    for (let seed = 0; seed < 50; seed++) {
      const t = selectTargets('enemyRandom', state, 0, new SeededRNG(seed));
      expect(t.length).toBe(1);
      expect(aliveIds.has(t[0].id)).toBe(true);
    }
  });

  it('sideOf 正确定位施法者所在方', () => {
    const { left, right } = makeTeams([50, 50, 50, 50], [50, 50, 50, 50]);
    const state = makeState(left, right);
    expect(sideOf(state, 0)).toBe(PlayerSide.Left);
    expect(sideOf(state, 6)).toBe(PlayerSide.Right);
    expect(sideOf(state, 99)).toBeNull();
  });
});
