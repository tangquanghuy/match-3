import { describe, it, expect } from 'vitest';
import { ManaDistributor } from '@engine/ManaDistributor';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(
  id: number,
  manaRequirement: Partial<Record<BaseColor, number>>,
  opts: Partial<Character> = {},
): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 100,
    hp: 100,
    attack: 10,
    armor: 0,
    colors: Object.keys(manaRequirement) as BaseColor[],
    manaRequirement,
    manaPool: {},
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...opts,
  };
}

function makeTeam(chars: Character[]): Team {
  return { player: PlayerSide.Left, characters: chars };
}

describe('ManaDistributor 从上到下顺序吸收', () => {
  const dist = new ManaDistributor();

  it('法力按队伍顺序从上往下填充', () => {
    const team = makeTeam([
      makeChar(0, { [BaseColor.Red]: 10 }),
      makeChar(1, { [BaseColor.Red]: 10 }),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(team.characters[0].manaPool[BaseColor.Red]).toBe(5);
    expect(team.characters[1].manaPool[BaseColor.Red] ?? 0).toBe(0);
  });

  it('首个角色填满后溢出流向下一个吃此色角色', () => {
    const team = makeTeam([
      makeChar(0, { [BaseColor.Red]: 3 }),
      makeChar(1, { [BaseColor.Red]: 10 }),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(team.characters[0].manaPool[BaseColor.Red]).toBe(3); // 满
    expect(team.characters[1].manaPool[BaseColor.Red]).toBe(2); // 溢出
  });

  it('跳过不吃此色的角色', () => {
    const team = makeTeam([
      makeChar(0, { [BaseColor.Blue]: 10 }), // 不吃红
      makeChar(1, { [BaseColor.Red]: 10 }),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 4);
    expect(team.characters[0].manaPool[BaseColor.Red] ?? 0).toBe(0);
    expect(team.characters[1].manaPool[BaseColor.Red]).toBe(4);
  });

  it('跳过已阵亡角色', () => {
    const team = makeTeam([
      makeChar(0, { [BaseColor.Red]: 10 }, { defeated: true }),
      makeChar(1, { [BaseColor.Red]: 10 }),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 4);
    expect(team.characters[0].manaPool[BaseColor.Red] ?? 0).toBe(0);
    expect(team.characters[1].manaPool[BaseColor.Red]).toBe(4);
  });

  it('法力不超过上限', () => {
    const team = makeTeam([makeChar(0, { [BaseColor.Red]: 3 })]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 100);
    expect(team.characters[0].manaPool[BaseColor.Red]).toBe(3);
  });

  it('无人可接时丢弃，不报错', () => {
    const team = makeTeam([makeChar(0, { [BaseColor.Blue]: 3 })]);
    const events = dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(events.length).toBe(0);
  });

  it('多颜色角色各色独立累积', () => {
    const team = makeTeam([makeChar(0, { [BaseColor.Red]: 5, [BaseColor.Blue]: 5 })]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 3);
    dist.distribute(team, PlayerSide.Left, BaseColor.Blue, 2);
    expect(team.characters[0].manaPool[BaseColor.Red]).toBe(3);
    expect(team.characters[0].manaPool[BaseColor.Blue]).toBe(2);
  });

  it('技能可释放判定：所有颜色满才可释放', () => {
    expect(
      ManaDistributor.isSkillCastable(
        { [BaseColor.Red]: 5, [BaseColor.Blue]: 5 },
        { [BaseColor.Red]: 5, [BaseColor.Blue]: 4 },
      ),
    ).toBe(false);
    expect(
      ManaDistributor.isSkillCastable(
        { [BaseColor.Red]: 5, [BaseColor.Blue]: 5 },
        { [BaseColor.Red]: 5, [BaseColor.Blue]: 5 },
      ),
    ).toBe(true);
  });
});
