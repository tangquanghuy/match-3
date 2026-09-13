import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopByRef, troopToCharacter } from '../../src/data/troops';
import {
  GROWTH_SHAPE,
  MAX_LEVEL,
  MIN_LEVEL,
  OFFICIAL_MAX_LEVEL,
  clampLevel,
  statAtLevel,
  troopStatsAtLevel,
} from '../../src/data/leveling';
import type { StatKey } from '../../src/data/leveling';

const STATS: StatKey[] = ['health', 'armor', 'attack', 'magic'];

describe('等级曲线 · 归一化形状', () => {
  it('每项形状都是 20 点、从 0 到 1、单调不减', () => {
    for (const stat of STATS) {
      const shape = GROWTH_SHAPE[stat];
      expect(shape).toHaveLength(OFFICIAL_MAX_LEVEL);
      expect(shape[0]).toBe(0);
      expect(shape[OFFICIAL_MAX_LEVEL - 1]).toBe(1);
      for (let i = 1; i < shape.length; i++) {
        expect(shape[i]).toBeGreaterThanOrEqual(shape[i - 1]);
      }
    }
  });

  it('生命/护甲比攻击/法强涨得更均匀：法强前 9 级几乎不涨', () => {
    // 官方形状的特征：法强只在 4/10/15/20 级附近跳，所以 9 级时累积占比很低
    expect(GROWTH_SHAPE.magic[8]).toBeLessThan(0.2);
    expect(GROWTH_SHAPE.health[8]).toBeGreaterThan(0.25);
  });
});

describe('等级曲线 · 边界与夹取', () => {
  it('等级越界被夹到 1～100，小数向下取整', () => {
    expect(clampLevel(0)).toBe(MIN_LEVEL);
    expect(clampLevel(-5)).toBe(MIN_LEVEL);
    expect(clampLevel(999)).toBe(MAX_LEVEL);
    expect(clampLevel(37.9)).toBe(37);
    expect(clampLevel(Number.NaN)).toBe(MIN_LEVEL);
  });

  it('1 级等于官方基础值，20 级等于官方满级值', () => {
    expect(statAtLevel('health', 3, 14, 1)).toBe(3);
    expect(statAtLevel('health', 3, 14, OFFICIAL_MAX_LEVEL)).toBe(14);
  });

  it('base 缺失（记 0）时 1 级为 0，20 级仍为官方值', () => {
    expect(statAtLevel('armor', 0, 7, 1)).toBe(0);
    expect(statAtLevel('armor', 0, 7, OFFICIAL_MAX_LEVEL)).toBe(7);
  });

  it('base 异常大于满级值时被兜住，不会倒挂', () => {
    expect(statAtLevel('health', 50, 14, 1)).toBe(14);
    expect(statAtLevel('health', 50, 14, 10)).toBe(14);
  });
});

describe('等级曲线 · 外推段节奏', () => {
  it('生命每 3 级 +2、护甲每 2 级 +1、攻击每 5 级 +1、法强每 8 级 +1', () => {
    const at = (stat: StatKey, lv: number) => statAtLevel(stat, 0, 100, lv) - 100;
    expect(at('health', 23)).toBe(2);
    expect(at('health', 50)).toBe(20);
    expect(at('armor', 22)).toBe(1);
    expect(at('armor', 100)).toBe(40);
    expect(at('attack', 25)).toBe(1);
    expect(at('attack', 100)).toBe(16);
    expect(at('magic', 28)).toBe(1);
    expect(at('magic', 100)).toBe(10);
  });

  it('外推段严格不减，且 21 级不低于 20 级', () => {
    for (const stat of STATS) {
      let prev = statAtLevel(stat, 2, 20, OFFICIAL_MAX_LEVEL);
      for (let lv = OFFICIAL_MAX_LEVEL + 1; lv <= MAX_LEVEL; lv++) {
        const v = statAtLevel(stat, 2, 20, lv);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe('等级曲线 · 全库不变量', () => {
  it('每个兵种每项数值在 1～100 级都单调不减，且锚点精确', () => {
    let monotonicViolations = 0;
    let anchorViolations = 0;
    for (const troop of TROOPS) {
      for (const stat of STATS) {
        const base = troop.base?.[stat] ?? 0;
        const max = troop[stat === 'health' ? 'health' : stat];
        let prev = -Infinity;
        for (let lv = MIN_LEVEL; lv <= MAX_LEVEL; lv++) {
          const v = statAtLevel(stat, base, max, lv);
          if (v < prev) monotonicViolations += 1;
          prev = v;
        }
        if (statAtLevel(stat, base, max, MIN_LEVEL) !== Math.min(base, max)) anchorViolations += 1;
        if (statAtLevel(stat, base, max, OFFICIAL_MAX_LEVEL) !== max) anchorViolations += 1;
      }
    }
    expect(monotonicViolations).toBe(0);
    expect(anchorViolations).toBe(0);
  });

  it('100 级生命中位数落在 70～80，不出现指数膨胀', () => {
    const hp = TROOPS.map((t) => troopStatsAtLevel(t, MAX_LEVEL).health).sort((a, b) => a - b);
    const median = hp[Math.floor(hp.length / 2)];
    expect(median).toBeGreaterThanOrEqual(70);
    expect(median).toBeLessThanOrEqual(80);
    // 最高的兵种也应保持三位数以内
    expect(hp[hp.length - 1]).toBeLessThan(150);
  });

  it('100 级仍保持「生命 > 护甲 > 攻击 > 法强」的量级关系（按中位数）', () => {
    const median = (key: StatKey) => {
      const v = TROOPS.map((t) => troopStatsAtLevel(t, MAX_LEVEL)[key]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    expect(median('health')).toBeGreaterThan(median('armor'));
    expect(median('armor')).toBeGreaterThan(median('attack'));
    expect(median('attack')).toBeGreaterThan(median('magic'));
  });
});

describe('troopToCharacter 接等级', () => {
  it('默认 20 级，取值与官方满级字段一致（保持既有调用方行为）', () => {
    const troop = getTroopByRef('Valkyrie')!;
    const ch = troopToCharacter(troop, 0);
    expect(ch.maxHp).toBe(troop.health);
    expect(ch.attack).toBe(troop.attack);
    expect(ch.armor).toBe(troop.armor);
    expect(ch.magic).toBe(troop.magic);
  });

  it('指定等级时按曲线取值，且满血入场', () => {
    const troop = getTroopByRef('Valkyrie')!;
    const lv1 = troopToCharacter(troop, 0, 1);
    expect(lv1.maxHp).toBe(troop.base!.health);
    expect(lv1.hp).toBe(lv1.maxHp);

    const lv100 = troopToCharacter(troop, 0, MAX_LEVEL);
    expect(lv100.maxHp).toBeGreaterThan(troop.health);
    expect(lv100.hp).toBe(lv100.maxHp);
    expect(lv100.mana).toBe(0);
  });

  it('等级越界不抛错，按夹取处理', () => {
    const troop = getTroopByRef('Valkyrie')!;
    expect(troopToCharacter(troop, 0, 0).maxHp).toBe(troopToCharacter(troop, 0, 1).maxHp);
    expect(troopToCharacter(troop, 0, 500).maxHp).toBe(troopToCharacter(troop, 0, MAX_LEVEL).maxHp);
  });
});
