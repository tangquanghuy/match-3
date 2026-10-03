import { describe, expect, it } from 'vitest';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { newSave } from '../../src/meta/state/schema';
import { parseSaveJson } from '../../src/meta/state/save';
import { saveToRecords, recordsToSave } from '../../src/meta/state/records';
import { TROOPS } from '../../src/data/troops';

describe('troop favorites', () => {
  it('defaults old saves and sanitizes unknown, duplicate and malformed IDs', () => {
    const raw = { ...newSave({ now: 1 }) } as Record<string, unknown>;
    delete raw.favoriteTroopIds;
    expect(parseSaveJson(JSON.stringify(raw)).favoriteTroopIds).toEqual([]);
    raw.favoriteTroopIds = [6000, 6000, '6097', null, -1, 6000.5, 6097];
    const save = parseSaveJson(JSON.stringify(raw));
    expect(save.favoriteTroopIds).toEqual([6000, 6097]);
    expect(recordsToSave(saveToRecords(save)).favoriteTroopIds).toEqual([6000, 6097]);
  });

  it('persists both directions and supports unowned troops without granting ownership', async () => {
    const storage = memoryStorage();
    const gateway = new MockGateway(storage);
    await gateway.load();
    const unowned = TROOPS.find(t => !gateway.current().collection[t.id])!.id;
    const collection = structuredClone(gateway.current().collection);
    expect((await gateway.setTroopFavorite(unowned, true)).result).toBe(true);
    expect((await gateway.setTroopFavorite(unowned, true)).result).toBe(true);
    expect(gateway.current().favoriteTroopIds).toEqual([unowned]);
    expect(gateway.current().collection).toEqual(collection);
    const reload = new MockGateway(storage);
    await reload.load();
    expect(reload.current().favoriteTroopIds).toEqual([unowned]);
    expect((await reload.setTroopFavorite(unowned, false)).result).toBe(false);
    const final = new MockGateway(storage);
    expect((await final.load()).save.favoriteTroopIds).toEqual([]);
  });

  it('rejects invalid commands without writing a revision or changing favorites', async () => {
    const gateway = new MockGateway(memoryStorage());
    await gateway.load();
    await gateway.setTroopFavorite(6000, true);
    const before = gateway.exportSaveJson();
    for (const [id, favorite] of [[-1, true], [6000.5, true], [6000, 'yes']] as const) {
      expect((await gateway.setTroopFavorite(id, favorite as boolean)).result).toMatchObject({ ok: false, code: 'INVALID' });
      expect(gateway.exportSaveJson()).toBe(before);
    }
  });
});
