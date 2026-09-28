import { describe, expect, it } from 'vitest';
import { BaseColor } from '@engine/types';
import { newSave } from '../../src/meta/state/schema';
import { addHeroXp } from '../../src/meta/systems/hero';
import {
  catchUpMasteryOffers,
  combatManaMastery,
  hydrateManaMastery,
  kingdomMasteryBonus,
  meetsMasteryUnlock,
  pendingMasteryCount,
  pickManaMastery,
  spentMasteryPoints,
} from '../../src/meta/systems/manaMastery';
import { parseSaveJson, serializeSave } from '../../src/meta/state/save';

const save = () => newSave({ now: 1_700_000_000_000, starterTroopIds: [6000, 6097, 6457] });

describe('法力精通存档与加点', () => {
  it('升级一次排队一组二选一，点中后个人 +1', () => {
    const s = save();
    expect(pendingMasteryCount(s)).toBe(0);
    addHeroXp(s, 9999);
    expect(s.hero.level).toBeGreaterThan(1);
    expect(pendingMasteryCount(s)).toBe(s.hero.level - 1);
    const offer = s.hero.masteryOffers[0]!;
    expect(offer[0]).not.toBe(offer[1]);
    const picked = pickManaMastery(s, offer[0]);
    expect(picked).toMatchObject({ ok: true, color: offer[0], value: 1 });
    expect(s.hero.manaMastery[offer[0]]).toBe(1);
    expect(pendingMasteryCount(s)).toBe(s.hero.level - 2);
    expect(pickManaMastery(s, offer[0]).ok).toBe(false);
  });

  it('老档按等级补待分配，不改已花点数', () => {
    const s = save();
    s.hero.level = 12;
    s.hero.manaMastery.Blue = 3;
    catchUpMasteryOffers(s.hero, s.createdAt);
    expect(spentMasteryPoints(s)).toBe(3);
    expect(pendingMasteryCount(s)).toBe(8);
  });

  it('水合缺字段时回填待分配，同 createdAt 确定', () => {
    const a = newSave({ now: 42 });
    a.hero.level = 5;
    hydrateManaMastery(a.hero, {}, 42);
    const b = newSave({ now: 42 });
    b.hero.level = 5;
    hydrateManaMastery(b.hero, {}, 42);
    expect(a.hero.masteryOffers).toEqual(b.hero.masteryOffers);
    expect(pendingMasteryCount(a)).toBe(4);
  });

  it('王国加成进战斗精通，不解锁武器', () => {
    const s = save();
    s.kingdoms['风暴峡湾'] = { level: 10, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    expect(kingdomMasteryBonus(s)[BaseColor.Blue]).toBe(10);
    expect(combatManaMastery(s)[BaseColor.Blue]).toBe(10);
    expect(meetsMasteryUnlock(s, [BaseColor.Blue], 8)).toBe(false);
    s.hero.manaMastery.Blue = 8;
    expect(meetsMasteryUnlock(s, [BaseColor.Blue], 8)).toBe(true);
  });

  it('SaveStore 导出再导入保留精通与待分配', () => {
    const s = save();
    addHeroXp(s, 9999);
    pickManaMastery(s, s.hero.masteryOffers[0]![0]);
    const loaded = parseSaveJson(serializeSave(s));
    expect(loaded.hero.manaMastery).toEqual(s.hero.manaMastery);
    expect(loaded.hero.masteryOffers).toEqual(s.hero.masteryOffers);
  });
});
