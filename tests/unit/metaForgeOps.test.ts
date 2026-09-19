/**
 * 淬炼存档集成（素材批 2026-09-19；WEAPON-FORGE-DESIGN F2）：
 * 学徒法杖（Common）淬炼消耗/写回、稀有度解析（首批 w_* 推导 + 目录 gw_* 原文）、
 * 材料不足原子不动、满级拦截。
 */
import { describe, it, expect } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { STARTER_WEAPON_ID } from '../../src/meta/data/weapons';
import { weaponRarityOfId, temperingLevelOf, temperWeaponOnSave } from '../../src/meta/systems/forgeOps';
import { temperingCost } from '../../src/meta/systems/forge';
import { starterTroopIds } from '../../src/meta/data/economy';

const save = () => newSave({ now: 0, starterTroopIds: starterTroopIds(), currencies: { gold: 100_000 } });

describe('稀有度解析（weaponRarityOfId）', () => {
  it('首批 w_*：通用按解锁档推导，职业 10/20 级分 UltraRare/Epic', () => {
    expect(weaponRarityOfId('w_univ_apprentice')).toBe('Common');
    expect(weaponRarityOfId('w_univ_tome')).toBe('Rare');
    expect(weaponRarityOfId('w_knight_10')).toBe('UltraRare');
    expect(weaponRarityOfId('w_knight_20')).toBe('Epic');
  });

  it('目录 gw_*：稀有度取 weapons.json 原文；未知 id 返回 null', () => {
    // gw_ 前缀 + 真实 referenceName（蛋爆是官方活动武器，目录内必有）
    expect(weaponRarityOfId('gw_Eggsplosion')).toBe('Epic');
    expect(weaponRarityOfId('gw_不存在的武器')).toBeNull();
    expect(weaponRarityOfId('完全未知')).toBeNull();
  });
});

describe('temperWeaponOnSave（存档集成）', () => {
  it('淬炼 +1：钢锭/黄金原子扣账，等级写回', () => {
    const s = save();
    s.materials.ingots.common = 100;
    const cost0 = temperingCost('Common', 0); // { ingots: 2, gold: 200, scrolls: 0 }
    const r = temperWeaponOnSave(s, STARTER_WEAPON_ID);
    expect(r).toMatchObject({ ok: true, level: 1 });
    if (!r.ok) return;
    expect(r.cost).toMatchObject({ gold: cost0.gold, ingots: cost0.ingots });
    expect(s.materials.ingots.common).toBe(100 - cost0.ingots);
    expect(s.currencies.gold).toBe(100_000 - cost0.gold);
    expect(temperingLevelOf(s, STARTER_WEAPON_ID)).toBe(1);
  });

  it('钢锭不足 → 整笔不动；黄金不足 → 素材回滚', () => {
    const s = save();
    s.materials.ingots.common = 1; // 少于 2
    const goldBefore = s.currencies.gold;
    expect(temperWeaponOnSave(s, STARTER_WEAPON_ID)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.materials.ingots.common).toBe(1);
    expect(s.currencies.gold).toBe(goldBefore);

    const s2 = save();
    s2.materials.ingots.common = 100;
    s2.currencies.gold = 0;
    expect(temperWeaponOnSave(s2, STARTER_WEAPON_ID)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s2.materials.ingots.common).toBe(100); // 素材回滚
    expect(temperingLevelOf(s2, STARTER_WEAPON_ID)).toBe(0);
  });

  it('未拥有/未知武器拒绝；满级拦截（构造 20 级）', () => {
    const s = save();
    expect(temperWeaponOnSave(s, 'w_knight_20')).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    expect(temperWeaponOnSave(s, 'gw_不存在的武器')).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    // 已拥有但目录无此 id（数据不一致场景）→ INVALID
    s.hero.unlockedWeapons.push('gw_不存在的武器');
    expect(temperWeaponOnSave(s, 'gw_不存在的武器')).toMatchObject({ ok: false, code: 'INVALID' });
    s.weaponTempering[STARTER_WEAPON_ID] = 20;
    s.materials.ingots.common = 999;
    expect(temperWeaponOnSave(s, STARTER_WEAPON_ID)).toMatchObject({ ok: false, code: 'AT_CAP' });
  });
});
