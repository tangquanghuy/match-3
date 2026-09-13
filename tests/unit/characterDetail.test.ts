import { describe, it, expect } from 'vitest';
import { buildDetailViewModel } from '../../src/render/CharacterDetailPanel';
import { BaseColor } from '@engine/types';
import type { Character } from '@engine/types';
import type { TroopData } from '../../src/data/troops';

function makeChar(over: Partial<Character> = {}): Character {
  return {
    id: 1,
    name: '测试角色',
    maxHp: 40,
    hp: 25,
    attack: 12,
    armor: 6,
    magic: 8,
    colors: [BaseColor.Red, BaseColor.Blue],
    manaCost: 12,
    mana: 5,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTroop(over: Partial<TroopData> = {}): TroopData {
  return {
    id: 6001,
    name: '测试角色',
    referenceName: 'TestTroop',
    rarity: 'Rare',
    rarityIdx: 2,
    kingdom: '测试王国',
    troopTypes: ['Beast'],
    role: 'Striker',
    attack: 12,
    armor: 6,
    health: 40,
    magic: 8,
    manaColors: [BaseColor.Red, BaseColor.Blue],
    manaCost: 12,
    spell: {
      id: 7001,
      name: '测试技能',
      description: '对 1 名敌人造成 [魔法 + 2] 点伤害。',
      meta: { scalings: [{ base: 2, mult: 1 }], raw: '对 1 名敌人造成 [魔法 + 2] 点伤害。', parsed: true },
    },
    traits: [
      { code: 'frenzy', name: '狂暴', description: '受击时获得攻击力。' },
      { code: 'big', name: '庞然', description: '匹配 4/5 获得生命。' },
    ],
    portrait: null,
    ...over,
  };
}

describe('buildDetailViewModel（需求 4.1-4.3）', () => {
  it('包含名称、生命/护甲、攻击、魔力、法力(当前/需求)、颜色', () => {
    const vm = buildDetailViewModel(makeChar(), makeTroop());
    expect(vm.name).toBe('测试角色');
    expect(vm.hp).toBe(25);
    expect(vm.maxHp).toBe(40);
    expect(vm.armor).toBe(6);
    expect(vm.attack).toBe(12);
    expect(vm.magic).toBe(8);
    expect(vm.mana).toBe(5);
    expect(vm.manaCost).toBe(12);
    expect(vm.colors).toEqual([BaseColor.Red, BaseColor.Blue]);
  });

  it('技能名 + 全文 + 法力消耗（需求 4.2）', () => {
    const vm = buildDetailViewModel(makeChar(), makeTroop());
    expect(vm.skill).not.toBeNull();
    expect(vm.skill!.name).toBe('测试技能');
    expect(vm.skill!.description).toBe('对 1 名敌人造成 [魔法 + 2] 点伤害。');
    expect(vm.skill!.manaCost).toBe(12);
  });

  it('全部特质（名称 + 描述）（需求 4.3）', () => {
    const vm = buildDetailViewModel(makeChar(), makeTroop());
    expect(vm.traits).toEqual([
      { name: '狂暴', description: '受击时获得攻击力。' },
      { name: '庞然', description: '匹配 4/5 获得生命。' },
    ]);
  });

  it('无 TroopData 时仍展示属性，技能为 null、特质为空', () => {
    const vm = buildDetailViewModel(makeChar());
    expect(vm.name).toBe('测试角色');
    expect(vm.attack).toBe(12);
    expect(vm.skill).toBeNull();
    expect(vm.traits).toEqual([]);
  });

  it('hp 夹在 [0, maxHp]、mana 夹在 [0, manaCost]，避免越界展示', () => {
    const vm = buildDetailViewModel(
      makeChar({ hp: 999, mana: 999, armor: -3 }),
      makeTroop(),
    );
    expect(vm.hp).toBe(40);
    expect(vm.mana).toBe(12);
    expect(vm.armor).toBe(0);
  });

  it('纯函数：不修改传入的 Character', () => {
    const c = makeChar({ hp: 999 });
    const snapshot = JSON.stringify(c);
    buildDetailViewModel(c, makeTroop());
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
