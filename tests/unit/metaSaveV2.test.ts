/**
 * 存档 v1 → v2 迁移测试：旧 8 职业设计虚构 id 重映射到官方职业、
 * 武器 id 同步改名、talentSpent 废弃、talentPicks/classTraits 落位。
 */
import { describe, it, expect } from 'vitest';
import { META_SAVE_VERSION, migrateSave, newSave, SaveStore } from '../../src/meta';

/** 合成一份典型 v1 档（旧 id 体系） */
function v1Raw(): Record<string, unknown> {
  const base = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  raw.version = 1; // 合成 v1 档（当前 newSave 已是 v2 口径，须显式降版本走迁移链）
  const hero = raw.hero as Record<string, unknown>;
  // 旧口径：talentSpent 存在、无 talentPicks/classTraits；旧职业/武器 id
  hero.classId = 'berserker';
  hero.classLevels = { berserker: 7, knight: 3 };
  hero.classXp = { berserker: 40, knight: 10 };
  hero.unlockedClasses = ['knight', 'berserker', 'druid'];
  hero.unlockedWeapons = ['w_univ_apprentice', 'w_berserker_10', 'w_sorc_20'];
  hero.equippedWeapon = 'w_berserker_10';
  hero.talentSpent = { knight: 2 };
  delete hero.talentPicks;
  delete hero.classTraits;
  return raw;
}

function memStorage() {
  const mem = new Map<string, string>();
  return {
    storage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    },
    mem,
  };
}

describe('存档 v1 → v2 迁移', () => {
  it('职业 id 重映射：berserker→warrior、druid→warden、knight 原名保留', () => {
    const save = migrateSave(v1Raw());
    expect(save.version).toBe(META_SAVE_VERSION);
    expect(save.hero.unlockedClasses.sort()).toEqual(['knight', 'warden', 'warrior'].sort());
    expect(save.hero.classId).toBe('warrior');
    expect(save.hero.classLevels).toEqual({ warrior: 7, knight: 3 });
    expect(save.hero.classXp).toEqual({ warrior: 40, knight: 10 });
  });

  it('武器 id 同步改名；equippedWeapon 一并迁移', () => {
    const save = migrateSave(v1Raw());
    expect(save.hero.equippedWeapon).toBe('w_warlord_10');
    // v1→v2 只做旧职业改名（w_berserker_10 → w_warlord_10）。
    // 这些 w_* 本身在 2026-09-19 已被裁定为假数据整表退役，但存档侧的清理是 schema v4
    // 的事（窗口 M，待窗口 N 的 v3 落盘后接）——本用例只锁 v2 这一步的行为。
    // newSave 的模板会带上起始武器（STARTER_WEAPON_ID），hydrate 与旧列表取并集。
    expect(save.hero.unlockedWeapons.sort()).toEqual(
      ['gw_KnightsSword', 'w_univ_apprentice', 'w_warlord_10', 'w_sorcerer_20'].sort(),
    );
  });

  it('talentSpent 废弃；talentPicks/classTraits 落默认值', () => {
    const save = migrateSave(v1Raw());
    expect((save.hero as unknown as Record<string, unknown>).talentSpent).toBeUndefined();
    expect(save.hero.talentPicks).toEqual({});
    expect(save.hero.classTraits).toEqual({});
  });

  it('v2 档原样通过（幂等）：不丢天赋与特质数据', () => {
    const fresh = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    fresh.hero.unlockedClasses.push('knight');
    fresh.hero.talentPicks['knight'] = ['stonewall', null, null, null, null, null, null];
    fresh.hero.classTraits['knight'] = [true, false, false];
    const save = migrateSave(JSON.parse(JSON.stringify(fresh)));
    expect(save.hero.talentPicks['knight']).toEqual(['stonewall', null, null, null, null, null, null]);
    expect(save.hero.classTraits['knight']).toEqual([true, false, false]);
  });

  it('直写原始 v1 JSON → SaveStore.load 端到端迁移成功', () => {
    const { storage, mem } = memStorage();
    const store = new SaveStore(storage);
    mem.set('gems.meta.save', JSON.stringify(v1Raw()));
    const { save, fresh, warning } = store.load();
    expect(fresh).toBe(false);
    expect(warning).toBeNull();
    expect(save.version).toBe(META_SAVE_VERSION);
    expect(save.hero.classId).toBe('warrior');
    expect(save.hero.unlockedClasses).toContain('warrior');
  });
});
