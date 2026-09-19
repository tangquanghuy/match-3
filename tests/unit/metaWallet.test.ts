import { describe, it, expect } from 'vitest';
import { canAfford, earn, newSave, spend } from '../../src/meta';

const save = (): ReturnType<typeof newSave> =>
  newSave({ now: 0, currencies: { gold: 100, souls: 50, gems: 10, goldKeys: 1 } });

describe('货币账本', () => {
  it('earn 入账并返回实际入账项', () => {
    const s = save();
    const applied = earn(s, { gold: 840, souls: 1260 });
    expect(applied).toEqual({ gold: 840, souls: 1260 });
    expect(s.currencies.gold).toBe(940);
    expect(s.currencies.souls).toBe(1310);
  });

  it('earn 忽略零与非正值，非法值不入账', () => {
    const s = save();
    expect(earn(s, { gold: 0, gems: -5 })).toEqual({});
    expect(s.currencies.gems).toBe(10);
  });

  it('spend 多币种原子扣费', () => {
    const s = save();
    const result = spend(s, { gold: 60, souls: 50, gems: 10 });
    expect(result.ok).toBe(true);
    expect(s.currencies).toEqual({ gold: 40, souls: 0, gems: 0, goldKeys: 1, glory: 0 });
  });

  it('spend 任一不足 → 整笔不动（原子性）', () => {
    const s = save();
    const result = spend(s, { gold: 60, souls: 51 });
    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.currencies.gold).toBe(100); // 黄金也没被扣
    expect(s.currencies.souls).toBe(50);
  });

  it('spend 负数账目 → INVALID', () => {
    const s = save();
    expect(spend(s, { gold: -1 })).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('canAfford 与 spend 判定一致', () => {
    const s = save();
    expect(canAfford(s, { gold: 100, goldKeys: 1 })).toBe(true);
    expect(canAfford(s, { gems: 11 })).toBe(false);
    expect(canAfford(s, { gold: -1 })).toBe(false);
  });
});
