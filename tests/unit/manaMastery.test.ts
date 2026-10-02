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

  it('已开放王国的精通从 1 级起计入战斗与武器解锁', () => {
    const s = save();
    expect(kingdomMasteryBonus(s)[BaseColor.Blue]).toBe(1);
    expect(kingdomMasteryBonus(s)[BaseColor.Brown]).toBe(1);
    s.hero.manaMastery.Blue = 7;
    expect(meetsMasteryUnlock(s, [BaseColor.Blue], 8)).toBe(true);
    s.hero.level = 16;
    const before = kingdomMasteryBonus(s)[BaseColor.Blue];
    s.kingdoms['风暴峡湾'] = { level: 10, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    expect(kingdomMasteryBonus(s)[BaseColor.Blue]).toBe(before + 9);
    expect(combatManaMastery(s)[BaseColor.Blue]).toBe(before + 16);
  });

  it('连续升级时即使总选第二候选，六色个人精通差距也不超过 2', () => {
    for (const createdAt of [1, 42, 1_700_000_000_000]) {
      const s = newSave({ now: createdAt });
      s.hero.level = 100;
      catchUpMasteryOffers(s.hero, createdAt);
      while (s.hero.masteryOffers.length) {
        const offer = s.hero.masteryOffers[0]!;
        const chosen = offer[1];
        expect(pickManaMastery(s, chosen).ok).toBe(true);
        const values = Object.values(s.hero.manaMastery);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
      }
      expect(spentMasteryPoints(s)).toBe(99);
      expect(Math.min(...Object.values(s.hero.manaMastery))).toBeGreaterThanOrEqual(15);
    }
  });

  it('只有一色落后两点时，本级固定补齐该色', () => {
    const s = save();
    s.hero.level = 12;
    for (const color of ['Red', 'Green', 'Yellow', 'Purple', 'Brown'] as const) s.hero.manaMastery[color] = 2;
    catchUpMasteryOffers(s.hero, s.createdAt);
    expect(s.hero.masteryOffers[0]).toEqual(['Blue', 'Blue']);
    expect(pickManaMastery(s, 'Red').ok).toBe(false);
    expect(pickManaMastery(s, 'Blue')).toMatchObject({ ok: true, value: 1 });
  });

  it('读取旧存档时重排待分配候选，保留已分配精通', () => {
    const s = save();
    s.hero.level = 12;
    const manaMastery = { Red: 2, Green: 2, Blue: 0, Yellow: 2, Purple: 2, Brown: 2 };
    hydrateManaMastery(s.hero, {
      manaMastery,
      masteryOffers: [['Red', 'Green']],
    }, s.createdAt);
    expect(s.hero.manaMastery).toEqual(manaMastery);
    expect(s.hero.masteryOffers).toEqual([['Blue', 'Blue']]);
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
