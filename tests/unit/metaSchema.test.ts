import { describe, it, expect } from 'vitest';
import {
  META_SAVE_VERSION,
  hydrateSave,
  migrateSave,
  newSave,
  MetaSaveError,
  validateTeam,
} from '../../src/meta';
import { STARTING_CURRENCIES } from '../../src/meta/data/economy';

const STARTERS = [6000, 6097, 6457]; // 破碎尖塔的三张普通卡

describe('MetaSave schema v1', () => {
  it('新档默认：初始货币 + 空收藏', () => {
    const save = newSave({ now: 0 });
    expect(save.version).toBe(META_SAVE_VERSION);
    expect(save.currencies).toEqual({ ...STARTING_CURRENCIES, glory: 0, gloryKeys: 0, trophies: 0 });
    expect(save.collection).toEqual({});
    expect(save.teams).toEqual([]);
    expect(save.hero.level).toBe(1);
    expect(save.settings.language).toBe('zh');
  });

  it('给 starter 后：三条收藏记录 + 默认初始队（4 人、校验通过）', () => {
    const save = newSave({ now: 0, starterTroopIds: STARTERS });
    expect(Object.keys(save.collection).sort()).toEqual(STARTERS.map(String).sort());
    for (const id of STARTERS) {
      const rec = save.collection[String(id)];
      expect(rec).toMatchObject({ copies: 0, level: 1, ascension: 0, locked: false });
      expect(rec.traits).toEqual([false, false, false]);
    }
    expect(save.teams).toHaveLength(1);
    expect(save.teams[0].members).toEqual([{ kind: 'hero' }, ...STARTERS.map((troopId) => ({ kind: 'troop', troopId }))]);
    expect(validateTeam(save, save.teams[0]).ok).toBe(true);
  });

  it('starterTeamName: null 时不建初始队', () => {
    const save = newSave({ now: 0, starterTroopIds: STARTERS, starterTeamName: null });
    expect(save.teams).toEqual([]);
  });

  it('hydrateSave：缺节补默认（节级降级重建）', () => {
    const save = hydrateSave({ version: 1 });
    expect(save.currencies).toEqual({ ...STARTING_CURRENCIES, glory: 0, gloryKeys: 0, trophies: 0 });
    expect(save.hero.level).toBe(1);
    expect(save.arena.activeDraft).toBeNull();
    expect(save.stats).toEqual({ battlesWon: 0, battlesLost: 0, soulsEarned: 0, goldEarned: 0 });
  });

  it('hydrateSave：损坏条目丢弃、合法条目保留', () => {
    const save = hydrateSave({
      version: 1,
      collection: {
        '6000': { copies: 2, level: 7, ascension: 1, traits: [true, false, false], locked: true },
        bad: '不是对象',
        '6457': { copies: '垃圾', level: '垃圾' },
      },
      teams: [{ name: '测试队', members: [{ kind: 'troop', troopId: 6000 }, { junk: true }] }, '垃圾'],
      currencies: { gold: '垃圾', souls: 123 },
    });
    expect(save.collection['6000']).toEqual({
      copies: 2,
      level: 7,
      ascension: 1,
      traits: [true, false, false],
      locked: true,
    });
    expect(save.collection['6457']).toEqual({
      copies: 0,
      level: 1,
      ascension: 0,
      traits: [false, false, false],
      locked: false,
    });
    expect(Object.keys(save.collection)).toHaveLength(2);
    expect(save.teams).toHaveLength(1);
    expect(save.teams[0].members).toEqual([{ kind: 'troop', troopId: 6000 }]);
    expect(save.currencies.gold).toBe(STARTING_CURRENCIES.gold);
    expect(save.currencies.souls).toBe(123);
  });

  it('migrateSave：完整 v1 存档原样通过（含时间戳）', () => {
    const save = newSave({ now: 1726500000000, starterTroopIds: STARTERS });
    const round = migrateSave(JSON.parse(JSON.stringify(save)) as unknown);
    expect(round).toEqual(save);
  });

  it('migrateSave：版本过高 / 非对象直接报错（调用方决定回退）', () => {
    expect(() => migrateSave({ version: META_SAVE_VERSION + 1 })).toThrow(MetaSaveError);
    expect(() => migrateSave(null)).toThrow(MetaSaveError);
    expect(() => migrateSave([1, 2])).toThrow(MetaSaveError);
  });
});
