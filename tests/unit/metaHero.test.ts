import { describe, it, expect } from 'vitest';
import type { BattleResult } from '../../src/session/contract';
import {
  activeTalentCodes,
  addClassXp,
  addHeroXp,
  applySettlement,
  buildBattleRequest,
  canUseWeapon,
  classByKingdom,
  classById,
  classLevelOf,
  CLASS_MAX_LEVEL,
  CLASS_TALENT_LEVELS,
  CLASSES,
  classXpToNext,
  equipClass,
  equippedWeaponOf,
  equipWeapon,
  heroStatsAt,
  heroStatsOf,
  heroXpToNext,
  KNOWN_TRAIT_CODES,
  newSave,
  planQuestEncounter,
  setTeamPreset,
  STARTER_WEAPON_ID,
  WEAPONS,
} from '../../src/meta';

const KINGDOM = '破碎尖塔';

const save = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

/** 组一支带主角的出战队伍（主角 + 破碎尖塔 3 张普通卡 = 4 人） */
function teamWithHero(s: ReturnType<typeof save>) {
  const r = setTeamPreset(s, 0, {
    name: '主角队',
    members: [
      { kind: 'hero' },
      { kind: 'troop', troopId: 6000 },
      { kind: 'troop', troopId: 6097 },
      { kind: 'troop', troopId: 6457 },
    ],
    bannerKingdomId: null,
  });
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
}

/** 极小合成 BattleResult（结算只消费 winner / defeatedExternalIds / economy） */
function mkResult(winner: 'player' | 'enemy', defeatedExternalIds: string[] = []): BattleResult {
  return {
    schemaVersion: 1,
    battleId: 'b',
    requestId: 'r',
    rulesetVersion: '1.0.0',
    seed: 1,
    winner,
    turns: 2,
    combatants: [],
    defeatedExternalIds,
    summonedCount: 0,
    actionLogDigest: '00000000',
    eventSummary: [],
  };
}

describe('主角成长曲线（设计值锚点 + 官方形状）', () => {
  it('1 级 = 锚点 base，20 级 = 锚点 max，逐级单调不减', () => {
    expect(heroStatsAt(1).health).toBe(20);
    expect(heroStatsAt(20).health).toBe(62);
    expect(heroStatsAt(20).magic).toBe(27);
    for (let lv = 2; lv <= 30; lv++) {
      expect(heroStatsAt(lv).health).toBeGreaterThanOrEqual(heroStatsAt(lv - 1).health);
      expect(heroStatsAt(lv).attack).toBeGreaterThanOrEqual(heroStatsAt(lv - 1).attack);
    }
  });

  it('经验表单调递增；多级一次连升、余量保留', () => {
    expect(heroXpToNext(1)).toBeLessThan(heroXpToNext(10));
    const s = save();
    const need1 = heroXpToNext(1);
    const need2 = heroXpToNext(2);
    const r = addHeroXp(s, need1 + need2 + 5);
    expect(r).toEqual({ levelsGained: 2, newLevel: 3 });
    expect(s.hero.xp).toBe(5);
    expect(heroStatsOf(s).health).toBe(heroStatsAt(3).health);
  });
});

describe('职业（8 个，绑定王国任务链）', () => {
  it('全部职业定义合法：天赋 5 档且 code 均为已实现特质', () => {
    expect(CLASSES).toHaveLength(8);
    for (const cls of CLASSES) {
      expect(cls.talents.map((t) => t.level)).toEqual([...CLASS_TALENT_LEVELS]);
      for (const talent of cls.talents) {
        expect(KNOWN_TRAIT_CODES.has(talent.code)).toBe(true);
      }
      expect(classByKingdom(cls.kingdom)?.id).toBe(cls.id);
      expect(classById(cls.id)).toBeTruthy();
    }
    expect(CLASS_MAX_LEVEL).toBe(80);
    expect(classXpToNext(1)).toBe(150);
  });

  it('解锁→装备→天赋生效：破碎尖塔 8 关解锁骑士', () => {
    expect(classByKingdom(KINGDOM)?.id).toBe('knight');
    const s = save();
    expect(equipClass(s, 'knight')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.unlockedClasses.push('knight');
    expect(equipClass(s, 'knight')).toEqual({ ok: true, classId: 'knight' });
    expect(classLevelOf(s, 'knight')).toBe(1);
    expect(activeTalentCodes(s)).toEqual([]); // 1 级还没有天赋

    s.hero.classLevels['knight'] = 5;
    expect(activeTalentCodes(s)).toEqual(['armored']);
    s.hero.classLevels['knight'] = 20;
    expect(activeTalentCodes(s)).toEqual(['armored', 'sturdy']);
  });

  it('职业升级：经验逐级结算，封顶 80 级；未装备职业不积经验', () => {
    const s = save();
    s.hero.unlockedClasses.push('knight');
    equipClass(s, 'knight');
    s.hero.classXp['knight'] = classXpToNext(1) + classXpToNext(2) + 3;
    expect(addClassXp(s, 'knight', 0)).toEqual({ levelsGained: 2, newLevel: 3 });
    expect(s.hero.classXp['knight']).toBe(3);

    s.hero.classLevels['knight'] = CLASS_MAX_LEVEL;
    expect(addClassXp(s, 'knight', 9999)).toEqual({ levelsGained: 0, newLevel: CLASS_MAX_LEVEL });
    expect(addClassXp(s, 'ranger', 50)).toBeNull();
  });
});

describe('武器（主角唯一施法手段）', () => {
  it('首批 20 把：通用 4 + 8 职业 × 2；新档自带学徒法杖', () => {
    expect(WEAPONS).toHaveLength(20);
    expect(WEAPONS.filter((w) => w.classId === null)).toHaveLength(4);
    for (const cls of CLASSES) {
      expect(WEAPONS.filter((w) => w.classId === cls.id)).toHaveLength(2);
    }
    const s = save();
    expect(equippedWeaponOf(s)?.id).toBe(STARTER_WEAPON_ID);
    expect(canUseWeapon(s, equippedWeaponOf(s)!)).toBe(true);
  });

  it('通用武器按主角等级解锁', () => {
    const s = save();
    expect(canUseWeapon(s, WEAPONS.find((w) => w.id === 'w_univ_tome')!)).toBe(false);
    s.hero.level = 10;
    expect(canUseWeapon(s, WEAPONS.find((w) => w.id === 'w_univ_tome')!)).toBe(true);
    expect(equipWeapon(s, 'w_univ_tome')).toEqual({ ok: true, weaponId: 'w_univ_tome' });
    expect(equippedWeaponOf(s)?.name).toBe('学者之书');
  });

  it('职业武器需要对应职业与职业等级（10/20 两档）', () => {
    const s = save();
    expect(equipWeapon(s, 'w_knight_10')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.unlockedClasses.push('knight');
    equipClass(s, 'knight');
    expect(equipWeapon(s, 'w_knight_10')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.classLevels['knight'] = 10;
    expect(equipWeapon(s, 'w_knight_10')).toEqual({ ok: true, weaponId: 'w_knight_10' });
    expect(equipWeapon(s, 'w_knight_20')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.classLevels['knight'] = 20;
    expect(equipWeapon(s, 'w_knight_20')).toEqual({ ok: true, weaponId: 'w_knight_20' });
    expect(equipWeapon(s, 'w_nonexistent')).toMatchObject({ ok: false, code: 'INVALID' });
  });
});

describe('主角入队桥接与结算（M5 占位转正）', () => {
  it('主角+部队混编可出战：快照带武器技能、天赋、王国加成', () => {
    const s = save();
    s.hero.unlockedClasses.push('knight');
    equipClass(s, 'knight');
    s.hero.classLevels['knight'] = 5; // 天赋档 1 生效
    teamWithHero(s);

    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.name).toBe('法露特');
    expect(hero.skillId).toBe(STARTER_WEAPON_ID);
    expect(hero.manaColors).toEqual(equippedWeaponOf(s)!.manaColors);
    expect(hero.traitIds).toEqual(['armored']);
    expect(hero.stats.hp).toBe(heroStatsAt(s.hero.level).health); // 破碎尖塔未满级，无加成

    // 武器原型注册为真实技能（非兜底空原型）
    const proto = outcome.registry.prototypes.get(STARTER_WEAPON_ID)!;
    expect(proto.segments.length).toBeGreaterThan(0);
  });

  it('无武器的主角：skillId 兜底 none、棕色法力、耗蓝按校验下限 1', () => {
    const s = save();
    s.hero.equippedWeapon = null;
    teamWithHero(s);
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.skillId).toBe('none');
    expect(hero.manaCost).toBe(1);
    expect(outcome.registry.prototypes.get('none')!.segments).toEqual([]);
  });

  it('结算：主角经验会升级（含胜利加成）；职业经验只算主角编队的胜场', () => {
    const s = save();
    s.hero.unlockedClasses.push('knight');
    equipClass(s, 'knight');
    teamWithHero(s);
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    const detail = applySettlement(s, mkResult('player'), {
      plan,
      enemyByExternalId: new Map(),
      todayStart: 1000,
    });
    expect(detail.heroLevelsGained).toBe(1); // 击杀 0 + 胜利 40 + 主角胜场 60 = 100 ≥ 首级 80
    expect(s.hero.level).toBe(2);
    expect(s.hero.classXp['knight']).toBe(25);
    expect(classLevelOf(s, 'knight')).toBe(1);
  });

  it('主角未编队时不积职业经验', () => {
    const s = save();
    s.hero.unlockedClasses.push('knight');
    equipClass(s, 'knight');
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    applySettlement(s, mkResult('player'), {
      plan,
      enemyByExternalId: new Map(),
      todayStart: 1000,
    });
    expect(s.hero.classXp['knight']).toBeUndefined();
  });

  it('任务链 8 关通关 → 解锁该王国绑定职业', () => {
    const s = save();
    s.kingdoms[KINGDOM] = { level: 1, questsDone: 7, exploreTier: 0, lastTributeAt: 0 };
    const plan = planQuestEncounter(KINGDOM, 8, 5);
    const detail = applySettlement(s, mkResult('player'), {
      plan,
      enemyByExternalId: new Map(),
      todayStart: 1000,
    });
    expect(detail.classUnlocked).toBe('knight');
    expect(s.hero.unlockedClasses).toContain('knight');
  });
});
