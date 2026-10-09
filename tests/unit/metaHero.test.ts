/**
 * 主角系统 v2 测试：等级曲线、官方 38 职业、冠军等级、武器（重映射后口径）、
 * 桥接快照（天赋加成/特质路由）、结算解锁。
 * 天赋树细节见 metaTalent.test.ts；职业数据完整性见 metaClasses.test.ts。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '../../src/engine/BoardModel';
import { kingdomTeamBonusOf } from '../../src/meta/systems/kingdomTeamBonus';
import { createGameState } from '../../src/engine/GameState';
import { chooseAiAction, firstCastableCharacter } from '../../src/engine/aiPolicy';
import { SeededRNG } from '../../src/engine/rng';
import { PlayerSide } from '../../src/engine/types';
import { mapRequestToTeams } from '../../src/session/combatantMapping';
import type { BattleResult } from '../../src/session/contract';
import {
  addClassXp,
  addHeroXp,
  applySettlement,
  buildBattleRequest,
  canUseWeapon,
  classByKingdom,
  classById,
  classLevelOf,
  CLASS_MAX_LEVEL,
  CHAMPION_TIERS,
  CLASSES,
  classXpToNext,
  equipClass,
  equippedWeaponOf,
  equipWeapon,
  heroLevelGain,
  heroStatsAt,
  heroStatsOf,
  heroXpToNext,
  pickTalent,
  newSave,
  planExploreEncounter,
  planQuestEncounter,
  CLASS_KINGDOM_ORDER,
  classUnlockRule,
  classUnlockText,
  eligibleClassIds,
  migrateSave,
  STARTER_CLASS_ID,
  setTeamPreset,
  STARTER_WEAPON_ID,
  STARTER_WEAPON_IDS,
  STARTER_WEAPONS,
  ALL_CATALOG_WEAPONS,
  anyWeaponById,
  normalizeWeaponType,
  ownedWeaponIds,
  resolveWeaponId,
} from '../../src/meta';

const KINGDOM = '破碎尖塔';
/** 督军（Warlord）= 破碎尖塔绑定职业（官方 HeroClassCode warrior） */
const STARTER_CLASS = 'warrior';

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

describe('主角成长曲线（官方口径：职业基底 + 等级属性点）', () => {
  it('1 级只有职业基底；等级属性点全整数、逐级单调不减', () => {
    // 督军（破碎尖塔）官方基底 攻8/甲10/血12/魔0
    expect(heroStatsAt(1, STARTER_CLASS_ID)).toEqual({ attack: 8, armor: 10, health: 12, magic: 0 });
    expect(heroLevelGain(1)).toEqual({ health: 0, armor: 0, attack: 0, magic: 0 });
    for (let lv = 1; lv <= 100; lv++) {
      const g = heroLevelGain(lv);
      for (const v of Object.values(g)) expect(Number.isInteger(v)).toBe(true);
      const s = heroStatsAt(lv, STARTER_CLASS_ID);
      for (const v of Object.values(s)) expect(Number.isInteger(v)).toBe(true);
      if (lv > 1) {
        const prev = heroLevelGain(lv - 1);
        for (const k of ['health', 'armor', 'attack', 'magic'] as const) {
          expect(g[k]).toBeGreaterThanOrEqual(prev[k]);
        }
      }
    }
  });

  it('100 级对齐官方 200 级：四维合计 ≈ 神话卡，且远低于旧设计值', () => {
    const total = (lv: number) => {
      const s = heroStatsAt(lv, STARTER_CLASS_ID);
      return s.health + s.armor + s.attack + s.magic;
    };
    // 官方：200 级主角 ≈ 一张神话卡的属性点（本项目 100 级 ← 官方 200 级，2:1 压缩）
    expect(total(100)).toBe(90);
    // 官方：本项目 25 级 ← 官方 50 级，此时约 70 点（= 神话 − 官方 50→200 的 21 点）
    expect(total(25)).toBe(70);
    // 20 级不再出现「62 血 24 甲」：单项与合计都落在满级传说卡（合计 80）以下
    expect(total(20)).toBeLessThan(80);
    expect(heroStatsAt(20, STARTER_CLASS_ID).health).toBeLessThan(30);
    expect(heroStatsAt(20, STARTER_CLASS_ID).magic).toBeLessThan(8);
  });

  it('等级属性点配比沿用官方 50→200 的 生命8:护甲6:攻击4:魔法3', () => {
    const g = heroLevelGain(100);
    expect(g).toEqual({ health: 23, armor: 17, attack: 11, magic: 9 });
  });

  it('职业基底真正入面板：换职业改变四维', () => {
    const warlord = heroStatsAt(30, STARTER_CLASS_ID);
    const doomsayer = heroStatsAt(30, CLASSES.find((c) => c.kingdom === '末日预言者的王国')?.id
      ?? CLASSES.find((c) => c.baseStats.health >= 20)!.id);
    expect(doomsayer.health).toBeGreaterThan(warlord.health);
    // 无职业时走兜底基底，不会变成「只有等级点」
    expect(heroStatsAt(30, null).health).toBeGreaterThan(heroLevelGain(30).health);
  });

  it('经验表单调递增；多级一次连升、余量保留', () => {
    expect(heroXpToNext(1)).toBeLessThan(heroXpToNext(10));
    const s = save();
    const need1 = heroXpToNext(1);
    const need2 = heroXpToNext(2);
    const r = addHeroXp(s, need1 + need2 + 5);
    expect(r).toEqual({ levelsGained: 2, newLevel: 3 });
    expect(s.hero.xp).toBe(5);
    expect(heroStatsOf(s).health).toBe(heroStatsAt(3, s.hero.classId).health);
  });

  it('主角突破 100 后保持属性和精通，升级经验恒为 99→100 所需', () => {
    const s = save();
    s.hero.level = 99;
    s.hero.xp = 11;
    const need = heroXpToNext(99);
    expect(heroXpToNext(100)).toBe(need);
    expect(heroXpToNext(300)).toBe(need);
    const result = addHeroXp(s, need * 4 + 7);
    expect(result).toEqual({ levelsGained: 4, newLevel: 103 });
    expect(s.hero.xp).toBe(18);
    expect(heroStatsOf(s)).toEqual(heroStatsAt(100, s.hero.classId));
    expect(heroLevelGain(103)).toEqual(heroLevelGain(100));
    expect(s.hero.masteryOffers).toHaveLength(1);
    const further = addHeroXp(s, need * 2 - 18);
    expect(further.newLevel).toBe(105);
    expect(s.hero.masteryOffers).toHaveLength(1);
  });

  it('淬炼面板加成与战斗桥接共用单一口径', () => {
    const s = save();
    s.weaponTempering[s.hero.equippedWeapon!] = 6;
    const base = heroStatsAt(s.hero.level, s.hero.classId);
    expect(heroStatsOf(s)).toEqual({
      attack: base.attack + 2,
      armor: base.armor + 1,
      health: base.health + 1,
      magic: base.magic + 1,
    });
  });
});

describe('职业（官方 38 个，绑定王国任务链）', () => {
  it('38 职业 × 3 树 × 7 档；冠军等级上限 100；档位表 = 官方 1/5/10/20/40/70/100', () => {
    expect(CLASSES).toHaveLength(38);
    expect(CLASS_MAX_LEVEL).toBe(100);
    expect([...CHAMPION_TIERS]).toEqual([1, 5, 10, 20, 40, 70, 100]);
    for (const cls of CLASSES) {
      expect(cls.trees).toHaveLength(3);
      for (const tree of cls.trees) expect(tree.talents).toHaveLength(7);
      expect(classByKingdom(cls.kingdom)?.id).toBe(cls.id);
      expect(classById(cls.id)).toBeTruthy();
    }
    expect(classXpToNext(1)).toBe(150);
  });

  it('破碎尖塔／督军新档默认解锁并装备；1 级即解锁第一档天赋选取', () => {
    expect(classByKingdom(KINGDOM)?.id).toBe(STARTER_CLASS);
    const s = save();
    // 用户裁定 2026-09-29：起始职业无需通关任何关卡
    expect(classUnlockRule(STARTER_CLASS)).toEqual({ kind: 'default' });
    expect(s.hero.unlockedClasses).toContain(STARTER_CLASS);
    expect(s.hero.classId).toBe(STARTER_CLASS);
    expect(equipClass(s, STARTER_CLASS)).toEqual({ ok: true, classId: STARTER_CLASS });
    expect(classLevelOf(s, STARTER_CLASS)).toBe(1);

    // 第一档（Lv.1）可选取战争树 T1「凶悍」= 自身攻击 +4
    const warlord = classById(STARTER_CLASS)!;
    const ferocity = warlord.trees[0]!.talents[0]!;
    expect(ferocity.effect).toEqual({ kind: 'selfStat', stat: 'attack', amount: 4 });
    expect(pickTalent(s, STARTER_CLASS, 0, ferocity.code)).toMatchObject({ ok: true });
  });

  it('冠军升级：经验逐级结算，封顶 100 级；未装备职业不积经验', () => {
    const s = save();
    s.hero.unlockedClasses.push(STARTER_CLASS);
    equipClass(s, STARTER_CLASS);
    s.hero.classXp[STARTER_CLASS] = classXpToNext(1) + classXpToNext(2) + 3;
    expect(addClassXp(s, STARTER_CLASS, 0)).toEqual({ levelsGained: 2, newLevel: 3 });
    expect(s.hero.classXp[STARTER_CLASS]).toBe(3);

    s.hero.classLevels[STARTER_CLASS] = CLASS_MAX_LEVEL;
    expect(addClassXp(s, STARTER_CLASS, 9999)).toEqual({ levelsGained: 0, newLevel: CLASS_MAX_LEVEL });
    expect(addClassXp(s, 'knight', 50)).toBeNull();
  });
});

describe('武器（主角唯一施法手段；全部来自官方目录）', () => {
  // 2026-09-19 窗口 M：首批 20 把自造 w_* 是假数据、已整表退役（见 src/meta/data/weapons.ts）。
  // 武器域此后只有一个来源（718 官方目录）、没有等级/职业门槛，
  // 起始池 22 把零条件隐式拥有（不写进 unlockedWeapons）。

  it('起始池：22 把低档目录武器、全部可装备、六法力色齐全', () => {
    expect(STARTER_WEAPON_IDS).toHaveLength(22);
    expect(STARTER_WEAPONS).toHaveLength(22); // 每个 id 都能在目录里解析到
    for (const w of STARTER_WEAPONS) {
      expect(w.id.startsWith('gw_')).toBe(true);
      expect(w.starter).toBe(true);
      expect(w.equippable).toBe(true); // mana-only 占位武器不得进起始池
      expect(['Common', 'Uncommon']).toContain(w.rarity); // 只收最低两档
      expect(w.weaponType).toBeTruthy();
      expect(w.imageFile).toBeTruthy(); // 官方卡面，零剪影兜底
    }
    // 六法力色全覆盖——选武器就是选法力色，缺一色就有一色玩不了
    const colors = new Set(STARTER_WEAPONS.flatMap((w) => w.manaColors));
    expect(colors.size).toBe(6);
  });

  it('新档自带骑士之剑，且无需任何解锁条件', () => {
    const s = save();
    expect(STARTER_WEAPON_ID).toBe('gw_KnightsSword');
    expect(equippedWeaponOf(s)?.id).toBe(STARTER_WEAPON_ID);
    expect(equippedWeaponOf(s)?.name).toBe('骑士之剑');
    expect(canUseWeapon(s, equippedWeaponOf(s)!)).toBe(true);
    // 起始池整池零条件可用（1 级主角、无职业）
    for (const w of STARTER_WEAPONS) expect(canUseWeapon(s, w)).toBe(true);
  });

  it('起始池隐式拥有：不写进存档 unlockedWeapons，但 ownedWeaponIds 全含且去重', () => {
    const s = save();
    // 存档里只有 newHero() 写入的那一把
    expect(s.hero.unlockedWeapons).toEqual([STARTER_WEAPON_ID]);
    const owned = ownedWeaponIds(s);
    expect(owned).toHaveLength(22);
    expect(new Set(owned).size).toBe(22); // 与存档里那把不重复计数
    for (const id of STARTER_WEAPON_IDS) expect(owned).toContain(id);
  });

  it('装备只判所有权与可装备性，没有等级/职业门槛', () => {
    const s = save();
    // 起始池：直接装
    expect(equipWeapon(s, 'gw_DustyTome')).toEqual({ ok: true, weaponId: 'gw_DustyTome' });
    expect(equippedWeaponOf(s)?.name).toBe('积尘巨著');
    // 非起始池且未拥有：拒绝（获取途径是熔炉等，不是等级）
    expect(equipWeapon(s, 'gw_Dawnbringer')).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    // 拥有后即可装（不看主角等级）
    s.hero.unlockedWeapons.push('gw_Dawnbringer');
    expect(s.hero.level).toBe(1);
    expect(equipWeapon(s, 'gw_Dawnbringer')).toEqual({ ok: true, weaponId: 'gw_Dawnbringer' });
    expect(equipWeapon(s, 'gw_不存在的武器')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('粗糙棍棒现已可装备（W05 回收占位）', () => {
    const club = anyWeaponById('gw_CrudeClub');
    expect(club).toBeTruthy();
    expect(club!.equippable).toBe(true);
    expect(club!.skill).not.toBeNull();
    const s = save();
    s.hero.unlockedWeapons.push('gw_CrudeClub');
    expect(canUseWeapon(s, club!)).toBe(true);
    expect(equipWeapon(s, 'gw_CrudeClub')).toEqual({ ok: true, weaponId: 'gw_CrudeClub' });
  });

  it('已退役的假数据 id 运行时仍可解析（老档在 schema 迁移落地前不炸）', () => {
    // w_univ_apprentice（学徒法杖 staff）→ 起始池同类型的巫师的魔杖
    expect(resolveWeaponId('w_univ_apprentice')).toBe('gw_WizardsWand');
    expect(anyWeaponById('w_univ_apprentice')?.name).toBe('巫师的魔杖');
    const s = save();
    // 老档 equippedWeapon 指向 w_*：解析得到归一后的目录武器，不会变成「未装备」
    s.hero.equippedWeapon = 'w_archer_20';
    expect(equippedWeaponOf(s)?.id).toBe('gw_ElderBow');
    // 装备走归一，返回的是归一后的 id
    expect(equipWeapon(s, 'w_thief_10')).toEqual({ ok: true, weaponId: 'gw_BlackDagger' });
  });

  it('weaponType 归一：官方 Artifact 归到天赋词表的 relic（此前 8 条天赋永久空转）', () => {
    // classes.json 的 selfStatIfWeapon 用 relic（8 次），官方武器数据用 Artifact（65 把）
    expect(normalizeWeaponType('Artifact')).toBe('relic');
    expect(normalizeWeaponType('Jewellery')).toBe('jewellery');
    expect(normalizeWeaponType('Sword')).toBe('sword');
    expect(normalizeWeaponType('')).toBeNull();
    const artifacts = ALL_CATALOG_WEAPONS.filter((w) => w.weaponType === 'relic');
    expect(artifacts.length).toBe(65);
    expect(ALL_CATALOG_WEAPONS.some((w) => w.weaponType === 'artifact')).toBe(false);
  });

  it('目录适配层不再丢字段：四维 718/718、词缀 710/718', () => {
    expect(ALL_CATALOG_WEAPONS).toHaveLength(718);
    const missingStats = ALL_CATALOG_WEAPONS.filter(
      (w) => ![w.attack, w.armor, w.health, w.magic].every((n) => Number.isFinite(n)),
    );
    expect(missingStats).toEqual([]);
    // 此前 weaponCatalog.ts 写死 affixes: []，把 710 把武器的词缀全丢了
    expect(ALL_CATALOG_WEAPONS.filter((w) => w.affixes.length > 0)).toHaveLength(710);
    const sample = anyWeaponById('gw_BlackDagger')!;
    expect(sample.affixes[0]).toMatchObject({ name: '险恶', rarity: 'Rare' });
    expect(sample.roleName).toBe('击杀者');
    expect(sample.masteryRequirement).toBeGreaterThan(0);
  });

  it('天赋条件用到的 13 个类型键，目录里都有武器能命中', () => {
    const talentKeys = [
      'dagger', 'relic', 'bow', 'hammer', 'tome', 'polearm', 'mace',
      'scythe', 'axe', 'missile', 'staff', 'jewellery', 'shield',
    ];
    const present = new Set(ALL_CATALOG_WEAPONS.map((w) => w.weaponType));
    for (const key of talentKeys) {
      expect(present.has(key), `天赋类型键 ${key} 在目录里无对应武器`).toBe(true);
    }
  });
});

describe('主角入队桥接与结算（天赋真实入战）', () => {
  it('战斗快照不会把淬炼面板加成重复计算', () => {
    const s = save();
    s.weaponTempering[s.hero.equippedWeapon!] = 6;
    teamWithHero(s);
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    const base = heroStatsAt(s.hero.level, s.hero.classId);
    const bonus = kingdomTeamBonusOf(s, s.teams[0]!.members);
    expect(hero.stats.attack).toBe(base.attack + 2 + bonus.attack);
    expect(hero.stats.armor).toBe(base.armor + 1 + bonus.armor);
    expect(hero.stats.hp).toBe(base.health + 1 + bonus.health);
  });

  it('天赋自身静态加成入快照；主角采纳职业兵种类型', () => {
    const s = save();
    s.hero.unlockedClasses.push(STARTER_CLASS);
    equipClass(s, STARTER_CLASS);
    s.hero.classLevels[STARTER_CLASS] = 5;
    const warlord = classById(STARTER_CLASS)!;
    expect(pickTalent(s, STARTER_CLASS, 0, warlord.trees[0]!.talents[0]!.code)).toMatchObject({ ok: true });
    teamWithHero(s);

    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.name).toBe('主角');
    expect(hero.skillId).toBe(STARTER_WEAPON_ID);
    expect(hero.role).toBe('Striker');
    expect(hero.manaColors).toEqual(equippedWeaponOf(s)!.manaColors);
    // 督军采纳 Orc? 否——无字面证据保持 Human；天赋凶悍 = 攻击 +4
    expect(hero.troopTypes).toEqual(['Human']);
    const bonus = kingdomTeamBonusOf(s, s.teams[0]!.members);
    expect(hero.stats.attack).toBe(heroStatsAt(s.hero.level, s.hero.classId).attack + 4 + bonus.attack);
    expect(hero.stats.hp).toBe(heroStatsAt(s.hero.level, s.hero.classId).health + bonus.health); // 无永久王国加成，但计入同王国编队加成

    // 武器原型注册为真实技能（非兜底空原型）
    const proto = outcome.registry.prototypes.get(STARTER_WEAPON_ID)!;
    expect(proto.segments.length).toBeGreaterThan(0);
  });

  it('供魔武器主角让已满法力队友先施法；队友未满时主角正常施法', () => {
    const s = save();
    teamWithHero(s);
    expect(equipWeapon(s, 'gw_DustyTome')).toMatchObject({ ok: true });
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.request.playerTeam[0]).toMatchObject({ skillId: 'gw_DustyTome', role: 'Generator' });

    const mapped = mapRequestToTeams(outcome.request);
    const hero = mapped.playerTeam.characters[0]!;
    const ally = mapped.playerTeam.characters[2]!; // 6097: Defender，位于主角之后
    expect(hero.role).toBe('Generator');
    expect(ally.role).toBe('Defender');
    const state = createGameState(new BoardModel(), mapped.playerTeam, mapped.enemyTeam);
    hero.mana = hero.manaCost;
    ally.mana = ally.manaCost;
    expect(firstCastableCharacter(state, PlayerSide.Left, outcome.registry)?.id).toBe(ally.id);
    expect(chooseAiAction({ state, side: PlayerSide.Left, rng: new SeededRNG(1), registry: outcome.registry })?.action)
      .toEqual({ type: 'cast', characterId: ally.id });

    ally.mana = 0;
    expect(firstCastableCharacter(state, PlayerSide.Left, outcome.registry)?.id).toBe(hero.id);
    expect(chooseAiAction({ state, side: PlayerSide.Left, rng: new SeededRNG(1), registry: outcome.registry })?.action)
      .toEqual({ type: 'cast', characterId: hero.id });
  });

  it('天赋 trait 别名进主角 traitIds（携火者→firelink）；未实现天赋不带特质', () => {
    const s = save();
    s.hero.unlockedClasses.push(STARTER_CLASS);
    equipClass(s, STARTER_CLASS);
    s.hero.classLevels[STARTER_CLASS] = 70; // 第 6 档（Lv.70）解锁
    const warlord = classById(STARTER_CLASS)!;
    const firebringer = warlord.trees[1]!.talents[5]!; // 烈焰树 T6：携火者→firelink
    expect(firebringer.effect).toEqual({ kind: 'trait', code: 'firelink' });
    expect(pickTalent(s, STARTER_CLASS, 5, firebringer.code)).toMatchObject({ ok: true });
    teamWithHero(s);
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.traitIds).toContain('firelink');
  });

  it('无武器的主角：skillId 兜底 none、棕色法力、耗蓝按校验下限 1', () => {
    const s = save();
    s.hero.equippedWeapon = null;
    teamWithHero(s);
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.skillId).toBe('none');
    expect(hero.role).toBeNull();
    expect(hero.manaCost).toBe(1);
    expect(outcome.registry.prototypes.get('none')!.segments).toEqual([]);
  });

  it('结算：主角经验会升级（含胜利加成）；冠军经验只算主角编队的胜场', () => {
    const s = save();
    s.hero.unlockedClasses.push(STARTER_CLASS);
    equipClass(s, STARTER_CLASS);
    teamWithHero(s);
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    const detail = applySettlement(s, mkResult('player'), {
      plan,
      enemyByExternalId: new Map(),
      todayStart: 1000,
    });
    expect(detail.heroLevelsGained).toBe(1); // 击杀 0 + 胜利 40 + 主角胜场 60 = 100 ≥ 首级门槛 100
    expect(s.hero.level).toBe(2);
    expect(s.hero.classXp[STARTER_CLASS]).toBe(100);
    expect(detail.classXpGained).toBe(100);
    expect(s.hero.classWins[STARTER_CLASS]).toBe(1);
    expect(classLevelOf(s, STARTER_CLASS)).toBe(1);
  });

  it('主角未编队时不积冠军经验', () => {
    const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457, 6169] });
    s.teams[0]!.members = [6000, 6097, 6457, 6169].map(troopId => ({ kind: 'troop', troopId }));
    s.hero.unlockedClasses.push(STARTER_CLASS);
    equipClass(s, STARTER_CLASS);
    const plan = planQuestEncounter(KINGDOM, 1, 5);
    applySettlement(s, mkResult('player'), {
      plan,
      enemyByExternalId: new Map(),
      todayStart: 1000,
    });
    expect(s.hero.classXp[STARTER_CLASS]).toBeUndefined();
    expect(s.hero.classWins[STARTER_CLASS]).toBeUndefined();
  });

});

describe('职业解锁分五批（用户裁定 2026-09-29）', () => {
  /** 取某批次里第一个职业（批次容量将来调整也不用改测试） */
  const firstOf = (match: (r: ReturnType<typeof classUnlockRule>) => boolean) => {
    const cls = CLASS_KINGDOM_ORDER.map((k) => CLASSES.find((c) => c.kingdom === k)!)
      .find((c) => match(classUnlockRule(c.id)));
    if (!cls) throw new Error('该批次没有职业');
    return cls;
  };
  const questSettle = (s: ReturnType<typeof save>, kingdom: string, node: number) => {
    s.kingdoms[kingdom] = { level: 1, questsDone: node - 1, exploreTier: 0, lastTributeAt: 0 };
    return applySettlement(s, mkResult('player'), {
      plan: planQuestEncounter(kingdom, node, 5), enemyByExternalId: new Map(), todayStart: 1000,
    });
  };
  const exploreSettle = (s: ReturnType<typeof save>, kingdom: string, tier: number) =>
    applySettlement(s, mkResult('player'), {
      plan: planExploreEncounter(kingdom, tier, 5, 5), enemyByExternalId: new Map(), todayStart: 1000,
    });

  it('五批覆盖全部 38 个职业，破碎尖塔独占 default 批', () => {
    const counts = { default: 0, quest4: 0, quest8: 0, hard: 0, veryHard: 0 } as Record<string, number>;
    for (const cls of CLASSES) {
      const r = classUnlockRule(cls.id);
      counts[r.kind === 'quest' ? `quest${r.nodes}` : r.kind] += 1;
    }
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(38);
    expect(counts.default).toBe(1);
    expect(classUnlockRule(STARTER_CLASS)).toEqual({ kind: 'default' });
    // 每批都非空，且主线批只有 4 / 8 两种门槛
    for (const key of ['quest4', 'quest8', 'hard', 'veryHard']) expect(counts[key]).toBeGreaterThan(0);
  });

  it('主线 4 关批：第 4 关通关即解锁，第 3 关不解锁', () => {
    const cls = firstOf((r) => r.kind === 'quest' && r.nodes === 4);
    const early = questSettle(save(), cls.kingdom, 3);
    expect(early.classUnlocked).toBeNull();

    const s = save();
    const detail = questSettle(s, cls.kingdom, 4);
    expect(detail.classUnlocked).toBe(cls.id);
    expect(s.hero.unlockedClasses).toContain(cls.id);
  });

  it('主线 8 关批：第 4 关不解锁，第 8 关才解锁', () => {
    const cls = firstOf((r) => r.kind === 'quest' && r.nodes === 8);
    expect(questSettle(save(), cls.kingdom, 4).classUnlocked).toBeNull();

    const s = save();
    expect(questSettle(s, cls.kingdom, 8).classUnlocked).toBe(cls.id);
    expect(s.hero.unlockedClasses).toContain(cls.id);
  });

  it('原困难批：首次通关探索 3 解锁，主线全通与探索 1/2 不解锁', () => {
    const cls = firstOf((r) => r.kind === 'hard');
    const s = save();
    expect(questSettle(s, cls.kingdom, 8).classUnlocked).toBeNull();
    expect(exploreSettle(s, cls.kingdom, 1).classUnlocked).toBeNull();
    expect(exploreSettle(s, cls.kingdom, 2).classUnlocked).toBeNull();
    expect(exploreSettle(s, cls.kingdom, 3).classUnlocked).toBe(cls.id);
    expect(s.hero.unlockedClasses).toContain(cls.id);
  });

  it('原非常困难批：首次通关探索 6 解锁，探索 1~5 不解锁', () => {
    const cls = firstOf((r) => r.kind === 'veryHard');
    const s = save();
    for (const tier of [1, 2, 3]) expect(exploreSettle(s, cls.kingdom, tier).classUnlocked).toBeNull();
    for (const tier of [4, 5]) expect(exploreSettle(s, cls.kingdom, tier).classUnlocked).toBeNull();
    expect(exploreSettle(s, cls.kingdom, 6).classUnlocked).toBe(cls.id);
  });

  it('探索 3/6 的首通记录独立满足对应职业门槛', () => {
    for (const [kind, tier] of [['hard', 3], ['veryHard', 6]] as const) {
      const cls = firstOf((rule) => rule.kind === kind);
      const s = save();
      s.kingdoms[cls.kingdom] = { level: 1, questsDone: 8, exploreTier: tier, lastTributeAt: 0,
        clearedExploreTiers: [tier] };
      expect(eligibleClassIds(s)).toContain(cls.id);
      expect(classUnlockText(cls.id)).toContain(`探索难度 ${tier}`);
    }
  });

  it('可直接首通探索 3/6 解锁对应职业，重复通关不重复解锁', () => {
    for (const [kind, tier] of [['hard', 3], ['veryHard', 6]] as const) {
      const cls = firstOf((rule) => rule.kind === kind);
      const s = save();
      expect(exploreSettle(s, cls.kingdom, tier).classUnlocked).toBe(cls.id);
      expect(exploreSettle(s, cls.kingdom, tier).classUnlocked).toBeNull();
    }
  });

  it('旧档载入补发起始职业；eligibleClassIds 与结算判定同源', () => {
    const s = save();
    s.hero.unlockedClasses = [];
    const revived = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(revived.hero.unlockedClasses).toContain(STARTER_CLASS);

    const s2 = save();
    const q4 = firstOf((r) => r.kind === 'quest' && r.nodes === 4);
    s2.kingdoms[q4.kingdom] = { level: 1, questsDone: 4, exploreTier: 0, lastTributeAt: 0 };
    expect(eligibleClassIds(s2)).toEqual(expect.arrayContaining([STARTER_CLASS, q4.id]));
  });
});
