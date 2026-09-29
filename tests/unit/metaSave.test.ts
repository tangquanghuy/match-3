import { describe, it, expect } from 'vitest';
import { MetaSaveError, SaveStore, newSave } from '../../src/meta';
import type { MetaSave, StorageLike } from '../../src/meta';
import { parseSaveJson, serializeSave } from '../../src/meta/state/save';
import { META_SAVE_VERSION } from '../../src/meta/state/schema';

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

describe('SaveStore（本地介质：双槽防损）', () => {
  it('空存储 → 无存档、无告警（建什么新档由宿主决定）', () => {
    expect(new SaveStore(memStorage()).load()).toEqual({ save: null, warning: null });
  });

  it('persist → load 往返一致；双槽轮转正确；介质不改存档内容', () => {
    const storage = memStorage();
    const store = new SaveStore(storage);
    const save = seedSave();
    store.persist(save);
    expect(store.load()).toMatchObject({ warning: null });

    save.currencies.gold = 777;
    const savedAt = save.savedAt;
    store.persist(save);
    expect(save.savedAt).toBe(savedAt);
    const dump = storage.dump();
    expect(JSON.parse(dump['gems.meta.save'] as string).currencies.gold).toBe(777);
    expect(JSON.parse(dump['gems.meta.save.bak'] as string).currencies.gold).toBe(2000);

    expect(store.load().save).toEqual(save);
  });

  it('主槽损坏 → 自动回退备份槽，并给出告警', () => {
    const storage = memStorage();
    const store = new SaveStore(storage);
    const save = seedSave();
    store.persist(save);
    save.currencies.gems = 999;
    store.persist(save);
    storage.setItem('gems.meta.save', '{损坏的JSON');

    const { save: loaded, warning } = store.load();
    expect(warning).toContain('主槽');
    expect(loaded?.currencies.gems).toBe(150);
  });

  it('双槽皆损 → 无存档 + 告警', () => {
    const storage = memStorage({
      'gems.meta.save': 'garbage{',
      'gems.meta.save.bak': 'also-bad',
    });
    const { save, warning } = new SaveStore(storage).load();
    expect(save).toBeNull();
    expect(warning).toContain('备份槽损坏');
  });
});

describe('存档序列化（本地与 D1 共用）', () => {
  it('serializeSave / parseSaveJson 往返一致', () => {
    const save = seedSave();
    expect(parseSaveJson(serializeSave(save))).toEqual(save);
  });

  it('坏 JSON / 版本过高 / 上线前旧版本 → MetaSaveError', () => {
    expect(() => parseSaveJson('不是JSON')).toThrow(MetaSaveError);
    expect(() => parseSaveJson('{"version":99}')).toThrow(MetaSaveError);
    expect(() => parseSaveJson(JSON.stringify({ ...seedSave(), version: META_SAVE_VERSION - 1 }))).toThrow(MetaSaveError);
  });

  it('新档带服务端化字段：revision / pendingBattle / mapSeenLevel', () => {
    const save = seedSave();
    expect(save).toMatchObject({ revision: 0, pendingBattle: null, mapSeenLevel: null });
    const raw = JSON.parse(serializeSave(save));
    raw.revision = 7;
    raw.pendingBattle = { mode: 'arena', requestId: 'arena-1-0-0', issuedAt: 5 };
    raw.mapSeenLevel = 12;
    expect(parseSaveJson(JSON.stringify(raw))).toMatchObject({
      revision: 7,
      pendingBattle: { mode: 'arena', requestId: 'arena-1-0-0', issuedAt: 5 },
      mapSeenLevel: 12,
    });
    raw.pendingBattle = { mode: 'encounter', requestId: 1 };
    expect(parseSaveJson(JSON.stringify(raw)).pendingBattle).toBeNull();
  });
});

describe('three-member team repair', () => {
  it('appends the hero and preserves all three existing positions', () => {
    const save = seedSave();
    save.teams[0]!.members = save.teams[0]!.members.filter(m => m.kind !== 'hero');
    const original = structuredClone(save.teams[0]!.members);
    const loaded = parseSaveJson(JSON.stringify(save));
    expect(loaded.teams[0]!.members).toEqual([...original, { kind: 'hero' }]);
    expect(parseSaveJson(JSON.stringify(loaded)).teams).toEqual(loaded.teams);
  });
});
