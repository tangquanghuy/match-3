import { describe, expect, it } from 'vitest';
import { getTroopById } from '../../src/data/troops';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { KINGDOM_TEAM_BASE } from '../../src/meta/data/kingdomTeamBase';
import { buildPlayerSnapshots } from '../../src/meta/systems/battleBridge';
import { kingdomTeamBonusOf, kingdomTeamEntries } from '../../src/meta/systems/kingdomTeamBonus';
import { troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { newSave, type TeamMember } from '../../src/meta/state/schema';

const troop = (troopId: number): TeamMember => ({ kind: 'troop', troopId });
const base = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

describe('同王国队伍基础加成', () => {
  it('来源表逐项覆盖 24 个真实王国，每个都具有 2/3/4 的四维整数档位', () => {
    expect(Object.keys(KINGDOM_TEAM_BASE)).toHaveLength(24);
    for (const [kingdom, values] of Object.entries(KINGDOM_TEAM_BASE)) {
      expect(KINGDOM_ORDER).toContain(kingdom);
      expect(values).toHaveLength(3);
      for (const stats of values) {
        expect(Object.values(stats).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
        expect(Object.values(stats).some((n) => n > 0)).toBe(true);
      }
    }
  });

  it('2/3/4 名只用对应最高档，不把 2 人、3 人旧档累加', () => {
    const s = base();
    expect(kingdomTeamBonusOf(s, [troop(6000), troop(6097)])).toEqual({ health: 2, armor: 0, attack: 0, magic: 0 });
    expect(kingdomTeamBonusOf(s, [troop(6000), troop(6097), troop(6457)]))
      .toEqual({ health: 4, armor: 0, attack: 1, magic: 0 });
    expect(kingdomTeamBonusOf(s, [troop(6000), troop(6097), troop(6457), troop(6001)]))
      .toEqual({ health: 6, armor: 0, attack: 2, magic: 0 });
  });

  it('两组 2 人分别激活，重复同一部队的副本只算一种', () => {
    const s = base();
    const members = [troop(6000), troop(6097), troop(6004), troop(6005)];
    expect(kingdomTeamBonusOf(s, members)).toEqual({ health: 2, armor: 2, attack: 0, magic: 0 });
    expect(kingdomTeamEntries(s, members)).toMatchObject([
      { kingdom: '破碎尖塔', count: 2, provisional: false },
      { kingdom: '阿达纳', count: 2, provisional: false },
    ]);
    expect(kingdomTeamEntries(s, [troop(6000), troop(6000), troop(6004), troop(6005)]))
      .toMatchObject([{ kingdom: '阿达纳', count: 2 }]);
  });

  it('主角所属王国只取装备武器，不取职业及冠军等级；换武器立即影响同王国档位', () => {
    const s = base();
    const members = [troop(6000), troop(6097), troop(6457), { kind: 'hero' as const }];
    expect(s.hero.classId).toBe('warrior'); // 督军对应破碎尖塔，初始武器不是该王国
    expect(kingdomTeamBonusOf(s, members).health).toBe(4);
    s.hero.classLevels[s.hero.classId!] = 10;
    expect(kingdomTeamBonusOf(s, members).health).toBe(4);
    s.hero.classLevels[s.hero.classId!] = 1;
    s.hero.equippedWeapon = 'gw_GiantsMace'; // 起始池武器，目录王国：破碎尖塔
    expect(kingdomTeamEntries(s, members)).toMatchObject([{ kingdom: '破碎尖塔', count: 4 }]);
    expect(kingdomTeamBonusOf(s, members).health).toBe(6);
    const built = buildPlayerSnapshots(s);
    if (!built.ok) throw new Error(built.message);
    expect(built.playerTeam.find((member) => member.externalId.endsWith('-hero'))!.kingdom).toBe('破碎尖塔');
    expect(built.playerTeam.find((member) => member.externalId.endsWith('-hero'))!.troopTypes).toEqual(['Human']);
    s.hero.equippedWeapon = null;
    expect(kingdomTeamBonusOf(s, members).health).toBe(4);
    const unarmed = buildPlayerSnapshots(s);
    if (!unarmed.ok) throw new Error(unarmed.message);
    expect(unarmed.playerTeam.find((member) => member.externalId.endsWith('-hero'))!.kingdom).toBeUndefined();
  });

  it('主角种族随职业变化，与武器王国独立', () => {
    const s = base();
    s.hero.classId = 'bard'; // 吟游诗人：Wildfolk，所属职业王国潘神之谷
    s.hero.classLevels.bard = 1;
    s.hero.equippedWeapon = 'gw_GiantsMace'; // 装备王国破碎尖塔
    const built = buildPlayerSnapshots(s);
    if (!built.ok) throw new Error(built.message);
    const hero = built.playerTeam.find((member) => member.externalId.endsWith('-hero'))!;
    expect(hero.troopTypes).toEqual(['Wildfolk']);
    expect(hero.kingdom).toBe('破碎尖塔');
  });
  it('战斗快照加成包含同王国及永久满级王国加成，四名成员一致', () => {
    const s = base();
    const baseline = troopToSnapshot(getTroopById(6000)!, s.collection['6000']!, 'check');
    const built = buildPlayerSnapshots(s);
    if (!built.ok) throw new Error(built.message);
    const member = built.playerTeam.find((x) => x.templateId === '6000')!;
    expect(member.stats.hp - baseline.stats.hp).toBe(4);
    expect(member.stats.attack - baseline.stats.attack).toBe(1);
    const hero = built.playerTeam.find((x) => x.externalId.endsWith('-hero'))!;
    const other = built.playerTeam.find((x) => x.templateId === '6097')!;
    expect(other.stats.hp).toBeGreaterThan(baseline.stats.hp);
    expect(hero.stats.hp).toBeGreaterThan(0);
    s.kingdoms['破碎尖塔'] = { ...s.kingdoms['破碎尖塔']!, level: 10 };
    const upgraded = buildPlayerSnapshots(s);
    if (!upgraded.ok) throw new Error(upgraded.message);
    expect(upgraded.playerTeam.find((x) => x.templateId === '6000')!.stats.hp).toBe(member.stats.hp + 1);
    expect(upgraded.playerTeam.find((x) => x.externalId.endsWith('-hero'))!.stats.hp).toBe(hero.stats.hp + 1);
  });

  it('新王国的本项目设计档位以 provisional 明示，仍可正常出战', () => {
    const s = base();
    const id = 7404;
    expect(getTroopById(id)?.kingdom).toBe('午夜城市');
    expect(kingdomTeamEntries(s, [troop(id), troop(7407)]))
      .toMatchObject([{ kingdom: '午夜城市', count: 2, provisional: true }]);
  });
});
