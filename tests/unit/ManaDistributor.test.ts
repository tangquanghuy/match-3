import { describe, it, expect } from 'vitest';
import { ManaDistributor } from '@engine/ManaDistributor';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(
  id: number,
  colors: BaseColor[],
  manaCost: number,
  opts: Partial<Character> = {},
): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 100,
    hp: 100,
    attack: 10,
    armor: 0,
    magic: 0,
    colors,
    manaCost,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...opts,
  };
}

function makeTeam(chars: Character[]): Team {
  return { player: PlayerSide.Left, characters: chars };
}

describe('ManaDistributor 单一法力条 · 从上到下顺序吸收', () => {
  const dist = new ManaDistributor();

  it('disease halves mana received from a color match', () => {
    const team = makeTeam([
      makeChar(0, [BaseColor.Red], 10, { statuses: [{ id: 'disease', turns: 3 }] }),
      makeChar(1, [BaseColor.Red], 10),
    ]);
    const events = dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(team.characters[0].mana).toBe(3);
    expect(events[0].amount).toBe(3);
    expect(team.characters[1].mana).toBe(0);
  });

  it('法力按队伍顺序从上往下填充', () => {
    const team = makeTeam([
      makeChar(0, [BaseColor.Red], 10),
      makeChar(1, [BaseColor.Red], 10),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(team.characters[0].mana).toBe(5);
    expect(team.characters[1].mana).toBe(0);
  });

  it('首个角色填满后溢出流向下一个吃此色角色', () => {
    const team = makeTeam([
      makeChar(0, [BaseColor.Red], 3),
      makeChar(1, [BaseColor.Red], 10),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(team.characters[0].mana).toBe(3); // 满
    expect(team.characters[1].mana).toBe(2); // 溢出
  });

  it('跳过不吃此色的角色', () => {
    const team = makeTeam([
      makeChar(0, [BaseColor.Blue], 10), // 不吃红
      makeChar(1, [BaseColor.Red], 10),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 4);
    expect(team.characters[0].mana).toBe(0);
    expect(team.characters[1].mana).toBe(4);
  });

  it('多颜色角色任一关联色都为同一条法力充能', () => {
    const team = makeTeam([makeChar(0, [BaseColor.Red, BaseColor.Blue], 10)]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 3);
    dist.distribute(team, PlayerSide.Left, BaseColor.Blue, 2);
    expect(team.characters[0].mana).toBe(5); // 红3 + 蓝2 累积到同一条
  });

  it('跳过已阵亡角色', () => {
    const team = makeTeam([
      makeChar(0, [BaseColor.Red], 10, { defeated: true }),
      makeChar(1, [BaseColor.Red], 10),
    ]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 4);
    expect(team.characters[0].mana).toBe(0);
    expect(team.characters[1].mana).toBe(4);
  });

  it('法力不超过上限 manaCost', () => {
    const team = makeTeam([makeChar(0, [BaseColor.Red], 3)]);
    dist.distribute(team, PlayerSide.Left, BaseColor.Red, 100);
    expect(team.characters[0].mana).toBe(3);
  });

  it('无人可接时丢弃，不报错', () => {
    const team = makeTeam([makeChar(0, [BaseColor.Blue], 3)]);
    const events = dist.distribute(team, PlayerSide.Left, BaseColor.Red, 5);
    expect(events.length).toBe(0);
  });

  it('分配总量守恒：分给各角色之和 ≤ 产出量', () => {
    const team = makeTeam([
      makeChar(0, [BaseColor.Red], 3),
      makeChar(1, [BaseColor.Red], 3),
    ]);
    const events = dist.distribute(team, PlayerSide.Left, BaseColor.Red, 10);
    const total = events.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(6); // 两人各满 3，剩余 4 丢弃
  });

  it('技能可释放判定：法力达到需求总量才可释放', () => {
    expect(ManaDistributor.isSkillCastable(9, 10)).toBe(false);
    expect(ManaDistributor.isSkillCastable(10, 10)).toBe(true);
    expect(ManaDistributor.isSkillCastable(11, 10)).toBe(true);
  });
});
