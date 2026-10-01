import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../src/meta/data/classes';
import { HERO_TRAIT_COLORS, heroTraitCost } from '../../src/meta/data/heroTraitCosts';
import { STONE_COLORS } from '../../src/meta/data/materials';
import { newSave } from '../../src/meta/state/schema';
import { heroTraitQuote, unlockHeroTrait } from '../../src/meta/systems/talents';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { heroTraitDialogBody } from '../../src/meta/screens/heroTraitDialog';

function fixture(classId = 'mechanist') {
  const save = newSave({ now: 0 });
  save.hero.unlockedClasses = [classId, 'warrior'];
  save.hero.classId = classId;
  save.materials.traitstones = {};
  return save;
}
function fund(save: ReturnType<typeof fixture>, id: string, slot: number) {
  for (const [key, amount] of Object.entries(heroTraitCost(id, slot)!.stones)) {
    save.materials.traitstones[key] = (save.materials.traitstones[key] ?? 0) + amount;
  }
}

describe('职业特质配方', () => {
  it('所有职业都有独立配色；秘法库存键遵循统一颜色顺序', () => {
    expect(Object.keys(HERO_TRAIT_COLORS).sort()).toEqual(CLASSES.map(c => c.id).sort());
    const order = STONE_COLORS.map(c => c.key);
    for (const c of CLASSES) for (const slot of [1, 2, 3]) {
      const cost = heroTraitCost(c.id, slot)!;
      expect(Object.keys(cost.stones)).toHaveLength(3);
      for (const [key, value] of Object.entries(cost.stones)) {
        expect(value).toBeGreaterThan(0);
        if (key.startsWith('arcane:')) {
          const [, a, b] = key.split(':');
          expect(order.indexOf(a!)).toBeGreaterThanOrEqual(0);
          expect(order.indexOf(a!)).toBeLessThanOrEqual(order.indexOf(b!));
        }
      }
    }
  });
  it('单色 Legendary 配方，不误用项目稀有度标签对应的 Mythic 配方', () => {
    expect([1, 2, 3].map(s => heroTraitCost('warrior', s)!.stones)).toEqual([
      { 'minor:red': 18, 'major:red': 12, 'runic:red': 10 },
      { 'minor:red': 26, 'major:red': 12, 'arcane:red:red': 12 },
      { 'minor:red': 34, 'arcane:red:red': 6, celestial: 2 },
    ]);
  });
  it('双色职业按主色低阶材料和双色秘法计价', () => {
    expect([1, 2, 3].map(s => heroTraitCost('mechanist', s)!.stones)).toEqual([
      { 'minor:red': 18, 'runic:red': 10, 'runic:brown': 10 },
      { 'minor:red': 26, 'major:red': 12, 'arcane:red:brown': 10 },
      { 'minor:red': 34, 'arcane:red:brown': 6, celestial: 2 },
    ]);
    expect(heroTraitCost('elementalist', 2)!.stones).toEqual({ 'minor:brown': 26, 'major:brown': 12, 'arcane:blue:brown': 10 });
  });
  it.each([0, 4, -1, 1.5, NaN, Infinity])('非法槽位 %s 不生成报价', slot => {
    expect(heroTraitCost('mechanist', slot)).toBeNull();
    expect(heroTraitQuote(fixture(), 'mechanist', slot)).toBeNull();
  });
  it.each(['missing', '__proto__', 'constructor'])('未知职业 %s 不生成报价', id => {
    expect(heroTraitCost(id, 1)).toBeNull();
    expect(unlockHeroTrait(fixture(), 1, id)).toMatchObject({ ok: false, code: 'INVALID' });
  });
  it('返回值独立，调用者修改不污染后续配方', () => {
    heroTraitCost('mechanist', 1)!.stones['minor:red'] = 1;
    expect(heroTraitCost('mechanist', 1)!.stones['minor:red']).toBe(18);
  });
});

describe('报价、确认和原子扣款', () => {
  it('只读报价包含需求、持有和每项缺口，弹窗在不足时禁用确认', () => {
    const s = fixture();
    s.materials.traitstones = { 'minor:red': 10, 'runic:red': 1 };
    const before = structuredClone(s);
    expect(heroTraitQuote(s, 'mechanist', 1)).toMatchObject({ canUnlock: false, reason: '特质石不足', rows: [
      { key: 'minor:red', required: 18, owned: 10, short: 8 },
      { key: 'runic:red', required: 10, owned: 1, short: 9 },
      { key: 'runic:brown', required: 10, owned: 0, short: 10 },
    ] });
    const html = heroTraitDialogBody({ save: () => s }, 'mechanist', 1);
    expect(html).toContain('需要 18 · 持有 10');
    expect(html).toContain('还差 8');
    expect(html).toContain('data-trait-confirm disabled');
    expect(s).toEqual(before);
  });
  it('足量报价不扣材料，确认时仅扣一次，不收金币和灵魂', () => {
    const s = fixture(); fund(s, 'mechanist', 1);
    const currencies = structuredClone(s.currencies);
    expect(heroTraitQuote(s, 'mechanist', 1)?.canUnlock).toBe(true);
    expect(heroTraitDialogBody({ save: () => s }, 'mechanist', 1)).not.toContain('data-trait-confirm disabled');
    expect(unlockHeroTrait(s, 1)).toMatchObject({ ok: true, cost: heroTraitCost('mechanist', 1) });
    expect(Object.values(s.materials.traitstones).every(n => n === 0)).toBe(true);
    expect(s.currencies).toEqual(currencies);
    const after = structuredClone(s);
    expect(unlockHeroTrait(s, 1)).toMatchObject({ code: 'ALREADY_UNLOCKED' });
    expect(s).toEqual(after);
  });
  it('只缺一项也不部分扣款', () => {
    const s = fixture(); fund(s, 'mechanist', 1); s.materials.traitstones['runic:brown'] = 9;
    const before = structuredClone(s);
    expect(unlockHeroTrait(s, 1)).toMatchObject({ code: 'INSUFFICIENT', message: '符文土之石还差 1' });
    expect(s).toEqual(before);
  });
  it('确认前库存改变会重新校验', () => {
    const s = fixture(); fund(s, 'mechanist', 1);
    expect(heroTraitQuote(s, 'mechanist', 1)?.canUnlock).toBe(true);
    s.materials.traitstones['minor:red'] = 0;
    expect(unlockHeroTrait(s, 1)).toMatchObject({ code: 'INSUFFICIENT' });
    expect(s.hero.classTraits.mechanist?.[0]).toBeFalsy();
  });
  it('顺序和职业解锁门槛在服务端校验，失败不扣款', () => {
    const s = fixture(); fund(s, 'mechanist', 2);
    const before = structuredClone(s);
    expect(unlockHeroTrait(s, 2)).toMatchObject({ code: 'PREREQ_LOCKED' });
    expect(s).toEqual(before);
    s.hero.unlockedClasses = ['warrior'];
    expect(heroTraitQuote(s, 'mechanist', 1)?.reason).toBe('职业尚未解锁');
    expect(unlockHeroTrait(s, 1, 'mechanist')).toMatchObject({ code: 'PREREQ_LOCKED' });
  });
  it('已有特质保留，不补扣历史资源；下一槽按新配方解锁', () => {
    const s = fixture(); s.hero.classTraits.mechanist = [true, true, false]; fund(s, 'mechanist', 3);
    expect(unlockHeroTrait(s, 3)).toMatchObject({ ok: true });
    expect(s.hero.classTraits.mechanist).toEqual([true, true, true]);
    expect(s.materials.traitstones['minor:red']).toBe(0);
  });
  it('明确确认的职业不受期间装备职业变化影响', () => {
    const s = fixture(); fund(s, 'mechanist', 1); s.hero.classId = 'warrior';
    expect(unlockHeroTrait(s, 1, 'mechanist')).toMatchObject({ ok: true });
    expect(s.hero.classId).toBe('warrior');
    expect(s.hero.classTraits.mechanist?.[0]).toBe(true);
    expect(s.hero.classTraits.warrior?.[0]).toBeFalsy();
  });
  it('网关传递目标职业、扣款落盘，重载保留解锁状态', async () => {
    const storage = memoryStorage(), gw = new MockGateway(storage);
    await gw.load();
    const s = structuredClone(gw.current());
    if (!s.hero.unlockedClasses.includes('mechanist')) s.hero.unlockedClasses.push('mechanist');
    s.hero.classTraits.mechanist = [false, false, false];
    s.materials.traitstones = {}; fund(s, 'mechanist', 1);
    await gw.dev!.importSaveJson(JSON.stringify(s));
    expect((await gw.unlockHeroTrait(1, 'mechanist')).result).toMatchObject({ ok: true });
    const reloaded = await new MockGateway(storage).load();
    expect(reloaded.save.hero.classTraits.mechanist).toEqual([true, false, false]);
    expect(reloaded.save.materials.traitstones['minor:red'] ?? 0).toBe(0);
    expect(reloaded.save.hero.classId).toBe(s.hero.classId);
  });
});
