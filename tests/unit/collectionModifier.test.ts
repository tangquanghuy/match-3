import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave } from '../../src/meta/state/save';
import { grantTroop } from '../../src/meta/systems/troopProgress';
import {
  restoreInitialCollection,
  restoreRealCollection,
  unlockKingdomTroops,
} from '../../src/meta/systems/collectionModifier';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { starterTroopIds } from '../../src/meta/data/economy';

function ownedIds(book: Record<string, unknown>): string[] {
  return Object.keys(book).sort();
}

describe('收集修改器', () => {
  it('解锁王国不会把真实收集盖掉，第二次解锁也不会刷新备份', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000] });
    save.collection['6000']!.level = 9;
    const before = ownedIds(save.collection);

    const first = unlockKingdomTroops(save, '破碎尖塔');
    expect(first.ok).toBe(true);
    expect(save.collectionTruth).not.toBeNull();
    expect(ownedIds(save.collectionTruth!)).toEqual(before);
    expect(save.collectionTruth!['6000']!.level).toBe(9);
    expect(save.collection['6000']!.level).toBe(9);
    const added = kingdomTroopPool('破碎尖塔').filter((troop) => troop.id !== 6000);
    for (const troop of added) expect(save.collection[String(troop.id)]).toBeDefined();
    expect(save.collectionTruth![String(added[0]!.id)]).toBeUndefined();

    const truthKeys = ownedIds(save.collectionTruth!);
    const second = unlockKingdomTroops(save, '龙爪');
    expect(second.ok).toBe(true);
    expect(ownedIds(save.collectionTruth!)).toEqual(truthKeys);
    expect(save.collection[String(kingdomTroopPool('龙爪')[0]!.id)]).toBeDefined();
  });

  it('还原真实收集后，之后的正常获得会计入下一份真实收集', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000] });
    unlockKingdomTroops(save, '破碎尖塔');
    restoreRealCollection(save);
    expect(save.collectionTruth).toBeNull();
    expect(ownedIds(save.collection)).toEqual(['6000']);

    grantTroop(save, 6097);
    unlockKingdomTroops(save, '龙爪');
    expect(ownedIds(save.collectionTruth!)).toEqual(['6000', '6097']);
    restoreRealCollection(save);
    expect(ownedIds(save.collection)).toEqual(['6000', '6097']);
  });

  it('还原初始只换当前收藏，真实收集还在', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.collection['7000'] = { copies: 2, level: 4, ascension: 0, traits: [false, false, false], locked: false };
    restoreInitialCollection(save);
    expect(ownedIds(save.collection)).toEqual(starterTroopIds().map(String).sort());
    expect(save.collection['6000']!.level).toBe(1);
    expect(save.collectionTruth!['7000']!.copies).toBe(2);
    expect(save.collectionTruth!['7000']!.level).toBe(4);

    restoreInitialCollection(save);
    expect(save.collectionTruth!['7000']!.level).toBe(4);
    restoreRealCollection(save);
    expect(save.collection['7000']!.level).toBe(4);
    expect(save.collectionTruth).toBeNull();
  });

  it('修改期间真正获得的卡会写进真实收集', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000] });
    unlockKingdomTroops(save, '破碎尖塔');
    const gained = kingdomTroopPool('龙爪')[0]!.id;
    grantTroop(save, gained);
    expect(save.collectionTruth![String(gained)]).toBeDefined();
    expect(save.collectionTruth![String(kingdomTroopPool('破碎尖塔').find((t) => t.id !== 6000)!.id)]).toBeUndefined();
    restoreRealCollection(save);
    expect(save.collection[String(gained)]).toBeDefined();
  });

  it('旧档没有备份字段时，不会把当前收藏误当成已经冻结的真实收集', () => {
    const save = hydrateSave({
      version: 1,
      collection: { '6000': { copies: 1, level: 3, ascension: 0, traits: [false, false, false], locked: false } },
    });
    expect(save.collectionTruth).toBeNull();
    expect(save.collection['6000']!.level).toBe(3);
  });
});
