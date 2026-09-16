import { describe, it, expect } from 'vitest';
import { MetaSaveError, SaveStore, newSave } from '../../src/meta';
import type { MetaSave, StorageLike } from '../../src/meta';

/** 内存存储：测试用 StorageLike 实现（浏览器侧对应 localStorage） */
function memStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    dump: () => Object.fromEntries(map),
  };
}

const seedSave = (): MetaSave => newSave({ now: 1726500000000, starterTroopIds: [6000, 6097, 6457] });

describe('SaveStore（双槽防损 + 导入导出）', () => {
  it('空存储 → 新档即可出战（含起始队伍），无告警', () => {
    const store = new SaveStore(memStorage());
    const { save, fresh, warning } = store.load();
    expect(fresh).toBe(true);
    expect(warning).toBeNull();
    expect(save.teams).toHaveLength(1);
    expect(save.teams[0].members).toHaveLength(3);
  });

  it('persist → load 往返一致；双槽轮转正确', () => {
    const storage = memStorage();
    const store = new SaveStore(storage);
    const save = seedSave();
    store.persist(save);
    expect(store.load()).toMatchObject({ fresh: false, warning: null });

    // 第二次落盘：旧主槽滚入备份
    save.currencies.gold = 777;
    const before = Date.now();
    store.persist(save);
    expect(save.savedAt).toBeGreaterThanOrEqual(before);
    const dump = storage.dump();
    expect(JSON.parse(dump['gems.meta.save'] as string).currencies.gold).toBe(777);
    expect(JSON.parse(dump['gems.meta.save.bak'] as string).currencies.gold).toBe(2000);

    const loaded = store.load().save;
    expect(loaded).toEqual(save);
  });

  it('主槽损坏 → 自动回退备份槽，并给出告警', () => {
    const storage = memStorage();
    const store = new SaveStore(storage);
    const save = seedSave();
    store.persist(save); // main = save
    save.currencies.gems = 999;
    store.persist(save); // main = save(gems 999), bak = save(gems 150)
    storage.setItem('gems.meta.save', '{损坏的JSON');

    const { save: loaded, fresh, warning } = store.load();
    expect(fresh).toBe(false);
    expect(warning).toContain('主槽');
    expect(loaded.currencies.gems).toBe(150); // 回退到上一份
  });

  it('双槽皆损 → 重建新档 + 告警（损坏存档可降级重建）', () => {
    const storage = memStorage({
      'gems.meta.save': 'garbage{',
      'gems.meta.save.bak': 'also-bad',
    });
    const { save, fresh, warning } = new SaveStore(storage).load();
    expect(fresh).toBe(true);
    expect(warning).toContain('重建');
    expect(save.teams).toHaveLength(1); // 新档带起始队
  });

  it('exportJson / importJson 往返一致', () => {
    const store = new SaveStore(memStorage());
    const save = seedSave();
    const round = store.importJson(store.exportJson(save));
    expect(round).toEqual(save);
  });

  it('importJson：坏 JSON / 版本过高 → MetaSaveError', () => {
    const store = new SaveStore(memStorage());
    expect(() => store.importJson('不是JSON')).toThrow(MetaSaveError);
    expect(() => store.importJson('{"version":99}')).toThrow(MetaSaveError);
  });
});
