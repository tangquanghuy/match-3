import { heroTraitCost } from '../../src/meta/data/heroTraitCosts';
/**
 * 天赋树与职业特质系统测试（v2）：
 * 选取/改配/档位门控、自身静态加成（站位/武器类型/每盟友）、全队静态加成 scope、
 * 特质别名路由、职业特质槽解锁、结算经验加成。
 */
import { describe, it, expect } from 'vitest';
import {
  CHAMPION_TIERS,
  classById,
  earn,
  newSave,
  pickTalent,
  clearTalent,
  heroStatBonus,
  allyStatBonus,
  heroTraitCodes,
  selectedTalents,
  talentPicksOf,
  unlockHeroTrait,
  xpBonusPct,
  equipClass,
  applySettlement,
  planQuestEncounter,
  setTeamPreset,
  type MetaSave,
} from '../../src/meta';
import type { BattleResult } from '../../src/session/contract';
import { heroXpToNext } from '../../src/meta/data/classes';

const KNIGHT = 'knight';
const ELEMENTALIST = 'elementalist';

function saveWithClass(classId = KNIGHT, level = 100): MetaSave {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  s.hero.unlockedClasses.push(classId);
  equipClass(s, classId);
  s.hero.classLevels[classId] = level;
  return s;
}

function mkResult(winner: 'player' | 'enemy'): BattleResult {
  return {
    schemaVersion: 1,
    battleId: 'b',
    requestId: 'r',
    rulesetVersion: '1.0.0',
    seed: 1,
    winner,
    turns: 2,
    combatants: [],
    defeatedExternalIds: [],
    summonedCount: 0,
    actionLogDigest: '00000000',
    eventSummary: [],
  };
}

describe('天赋选取与改配', () => {
  it('档位门控：冠军等级不足拒绝选取；达标后三树任选其一', () => {
    const s = saveWithClass(KNIGHT, 1); // 仅第 1 档解锁
    const knight = classById(KNIGHT)!;
    // 骑士三树 T1：守卫·石墙 / 光明·闪耀法杖 / 士气·典范
    expect(knight.trees.map((tr) => tr.talents[0]!.code)).toEqual(['stonewall', 'shiningstaff', 'exemplar']);
    expect(pickTalent(s, KNIGHT, 1, 'protector')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(pickTalent(s, KNIGHT, 0, 'stonewall')).toMatchObject({ ok: true });
    expect(talentPicksOf(s, KNIGHT)[0]).toBe('stonewall');
  });

  it('同档重选 = 免费改配；取消后空档', () => {
    const s = saveWithClass(KNIGHT, 20);
    // 第 2 档（Lv.10）：守卫·护卫 / 光明·引光者，跨树改配
    expect(pickTalent(s, KNIGHT, 1, 'leadinglight')).toMatchObject({ ok: true });
    expect(pickTalent(s, KNIGHT, 1, 'protector')).toMatchObject({ ok: true });
    expect(talentPicksOf(s, KNIGHT)[1]).toBe('protector');
    expect(clearTalent(s, KNIGHT, 1)).toMatchObject({ ok: true });
    expect(talentPicksOf(s, KNIGHT)[1]).toBeNull();
  });

  it('校验：未解锁职业/未知档位/非该档天赋都拒绝', () => {
    const s = saveWithClass(KNIGHT, 100);
    expect(pickTalent(s, 'berserker', 0, 'ferocity')).toMatchObject({ ok: false, code: 'INVALID' });
    expect(pickTalent(s, KNIGHT, 7, 'ferocity')).toMatchObject({ ok: false, code: 'INVALID' });
    // ferocity 是督军 War 树 T1，不在骑士的任何树
    expect(pickTalent(s, KNIGHT, 0, 'ferocity')).toMatchObject({ ok: false, code: 'INVALID' });
    expect(clearTalent(s, KNIGHT, -1)).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('未解锁档位的天赋不生效；脏档位（超解锁数）被忽略', () => {
    const s = saveWithClass(KNIGHT, 20); // 解锁前 3 档（Lv.1/5/10）
    pickTalent(s, KNIGHT, 0, 'shiningstaff'); // 光明 T1：法杖条件自身魔法
    pickTalent(s, KNIGHT, 2, 'brilliantaura'); // 光明 T3：4/5 配全体生命（alliesStat）
    expect(selectedTalents(s)).toHaveLength(2);
    // 第 4 档（Lv.40）未解锁：即便存档有脏数据也不生效
    s.hero.talentPicks[KNIGHT]![3] = 'savior';
    expect(selectedTalents(s)).toHaveLength(2);
  });
});

describe('战斗快照期加成', () => {
  it('selfStatIfPosition：引光者 = 首位护甲 +10', () => {
    const s = saveWithClass(KNIGHT, 100);
    pickTalent(s, KNIGHT, 1, 'leadinglight'); // 光明 T2
    expect(heroStatBonus(s, 0, 4, null, new Map()).armor).toBe(10);
    expect(heroStatBonus(s, 1, 4, null, new Map()).armor).toBe(0);
  });

  it('selfStatIfWeapon：护卫 = 盾牌魔法 +3（覆盖同档改配后只算新选）', () => {
    const s = saveWithClass(KNIGHT, 100);
    pickTalent(s, KNIGHT, 1, 'leadinglight');
    pickTalent(s, KNIGHT, 1, 'protector'); // 同档改配
    expect(heroStatBonus(s, 2, 4, 'shield', new Map()).magic).toBe(3);
    expect(heroStatBonus(s, 2, 4, 'sword', new Map()).magic).toBe(0);
  });

  it('selfStatPerAlly：矮人护甲 = 每名矮人盟友 +4（元素使·石 T4）', () => {
    const s = saveWithClass(ELEMENTALIST, 100);
    pickTalent(s, ELEMENTALIST, 3, 'dwarvenarmor');
    expect(heroStatBonus(s, 2, 4, null, new Map([['Dwarf', 2]])).armor).toBe(8);
    expect(heroStatBonus(s, 2, 4, null, new Map([['Dwarf', 1]])).armor).toBe(4);
    expect(heroStatBonus(s, 2, 4, null, new Map([['Beast', 3]])).armor).toBe(0);
  });

  it('commander「首位全技能 +2」= 四维全部 +2', () => {
    const s = saveWithClass(KNIGHT, 100);
    pickTalent(s, KNIGHT, 4, 'commander'); // 士气 T5
    expect(heroStatBonus(s, 0, 4, null, new Map())).toEqual({ health: 2, attack: 2, armor: 2, magic: 2 });
    expect(heroStatBonus(s, 2, 4, null, new Map())).toEqual({ health: 0, attack: 0, armor: 0, magic: 0 });
  });

  it('alliesStat scope：all / color / type（含多属性）', () => {
    const s = saveWithClass(KNIGHT, 100);
    pickTalent(s, KNIGHT, 4, 'armoroflight'); // 光明 T5：全体护甲 +4
    const talents = selectedTalents(s);
    expect(allyStatBonus(talents, ['Beast'], ['red'])).toEqual({ health: 0, attack: 0, armor: 4, magic: 0 });

    // 颜色 + 类型 scope（元素使：石/水/风暴）
    const s2 = saveWithClass(ELEMENTALIST, 100);
    pickTalent(s2, ELEMENTALIST, 3, 'waterybinding'); // 水 T4：蓝盟友生命 +4
    pickTalent(s2, ELEMENTALIST, 2, 'stonecircle'); // 石 T3：棕盟友护甲 +3
    pickTalent(s2, ELEMENTALIST, 4, 'titanicsurge'); // 风暴 T5：巨人生命/魔法 +1
    const t = selectedTalents(s2);
    expect(allyStatBonus(t, ['Beast'], ['blue'])).toEqual({ health: 4, attack: 0, armor: 0, magic: 0 });
    expect(allyStatBonus(t, ['Beast'], ['brown'])).toEqual({ health: 0, attack: 0, armor: 3, magic: 0 });
    expect(allyStatBonus(t, ['Giant'], [])).toEqual({ health: 1, attack: 0, armor: 0, magic: 1 });
    expect(allyStatBonus(t, ['Beast'], ['red'])).toEqual({ health: 0, attack: 0, armor: 0, magic: 0 });
  });

  it('trait 别名与职业特质进 heroTraitCodes；未实现天赋/特质被过滤', () => {
    const s = saveWithClass(KNIGHT, 100);
    pickTalent(s, KNIGHT, 3, 'dawnsaura'); // 光明 T4 → songoflight（已实现开局风暴特质）
    pickTalent(s, KNIGHT, 0, 'stonewall'); // 动态定义天赋：code 本身进快照（v3 收编）
    expect(heroTraitCodes(s).sort()).toEqual(['songoflight', 'stonewall'].sort());
    // 解锁特质槽 1（knightbond 已实现）
    earn(s, { gold: 100000, souls: 100000 });
    Object.assign(s.materials.traitstones, heroTraitCost(KNIGHT, 1)!.stones);
    expect(unlockHeroTrait(s, 2)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(unlockHeroTrait(s, 1)).toMatchObject({ ok: true, slot: 1 });
    expect(heroTraitCodes(s).sort()).toEqual(['knightbond', 'songoflight', 'stonewall'].sort());
  });

  it('xpBonus 只结算主角经验（勤学 +10%）', () => {
    const s = saveWithClass(KNIGHT, 100);
    pickTalent(s, KNIGHT, 3, 'quickstudy'); // 士气 T4
    expect(xpBonusPct(s)).toBe(10);
    expect(xpBonusPct(saveWithClass(KNIGHT, 100))).toBe(0);

    // 结算联动：40（胜利）+60（主角胜场）=100 → 加成后 110 ≥ 首级门槛，但不够再升一级
    s.kingdoms['破碎尖塔'] = { level: 1, questsDone: 1, exploreTier: 0, lastTributeAt: 0 };
    setTeamPreset(s, 0, {
      name: 't',
      members: [{ kind: 'hero' }, { kind: 'troop', troopId: 6000 }, { kind: 'troop', troopId: 6097 }],
      bannerKingdomId: null,
    });
    const plan = planQuestEncounter('破碎尖塔', 2, 5);
    applySettlement(s, mkResult('player'), { plan, enemyByExternalId: new Map(), todayStart: 1000 });
    expect(s.hero.level).toBe(2);
    expect(s.hero.xp).toBe(110 - heroXpToNext(1));
  });
});

describe('职业特质槽', () => {
  it('未装备职业时不可解锁；顺序解锁；费用走账本', () => {
    const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    // 新档默认装备起始职业（2026-09-29），先卸下才能验「未装备」分支
    s.hero.classId = null;
    expect(unlockHeroTrait(s, 1)).toMatchObject({ ok: false, code: 'INVALID' });
    s.hero.unlockedClasses.push(KNIGHT);
    equipClass(s, KNIGHT);
    const goldBefore = s.currencies.gold;
    const soulsBefore = s.currencies.souls;
    Object.assign(s.materials.traitstones, heroTraitCost(KNIGHT, 1)!.stones);
    const r = unlockHeroTrait(s, 1);
    expect(r).toMatchObject({ ok: true, slot: 1 });
    if (r.ok) {
      expect(s.currencies.gold).toBe(goldBefore);
      expect(s.currencies.souls).toBe(soulsBefore);
      for (const key of Object.keys(r.cost.stones)) expect(s.materials.traitstones[key]).toBe(0);
    }
    expect(s.hero.classTraits[KNIGHT]).toEqual([true, false, false]);
    expect(unlockHeroTrait(s, 1)).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
  });

  it('特质槽按职业隔离：切换职业后另一职业槽为空', () => {
    const s = saveWithClass(KNIGHT, 1);
    earn(s, { gold: 100000, souls: 100000 });
    Object.assign(s.materials.traitstones, heroTraitCost(KNIGHT, 1)!.stones);
    unlockHeroTrait(s, 1);
    expect(s.hero.classTraits[KNIGHT]).toEqual([true, false, false]);
    s.hero.unlockedClasses.push('warrior');
    equipClass(s, 'warrior');
    expect(s.hero.classTraits['warrior']).toBeUndefined();
    expect(heroTraitCodes(s)).toEqual([]); // 督军槽未解锁
  });

  it('档位表锚点：第 1 档 = 冠军 1 级、末档 = 100 级', () => {
    expect(CHAMPION_TIERS[0]).toBe(1);
    expect(CHAMPION_TIERS[CHAMPION_TIERS.length - 1]).toBe(100);
  });
});
