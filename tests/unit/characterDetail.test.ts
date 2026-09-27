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

  it('技能名 + 全文 + 法力值消耗（需求 4.2）', () => {
    const vm = buildDetailViewModel(makeChar(), makeTroop());
    expect(vm.skill).not.toBeNull();
    expect(vm.skill!.name).toBe('测试技能');
    expect(vm.skill!.description).toBe('对 1 名敌人造成 [魔法 + 2] 点伤害。');
    expect(vm.skill!.manaCost).toBe(12);
  });

  it('全部特质（名称 + 描述 + 实现状态）（需求 4.3）', () => {
    const vm = buildDetailViewModel(makeChar(), makeTroop());
    expect(vm.traits).toEqual([
      { code: 'frenzy', name: '狂暴', description: '受击时获得攻击力。', implemented: true },
      { code: 'big', name: '庞然', description: '匹配 4/5 获得生命。', implemented: true },
    ]);
  });

  it('无 TroopData 时仍展示属性，技能为 null、特质为空', () => {
    const vm = buildDetailViewModel(makeChar());
    expect(vm.name).toBe('测试角色');
    expect(vm.attack).toBe(12);
    expect(vm.skill).toBeNull();
    expect(vm.traits).toEqual([]);
  });

  it('宿主角色没有 TroopData：特质从 char.traitIds + 特质库读取', () => {
    // armored / regeneration 都是已实现特质（见 src/data/traits.json）
    const host = makeChar({ traitIds: ['armored', 'regeneration'] });
    const vm = buildDetailViewModel(host);
    expect(vm.traits.length).toBe(2);
    expect(vm.traits[0].implemented).toBe(true);
    expect(vm.traits[1].implemented).toBe(true);
    expect(vm.traits.every((t) => t.name.length > 0 && t.description.length > 0)).toBe(true);
  });

  it('未实现特质照常展示但标注未生效；官方文本优先于特质库', () => {
    // 未实现 code 库里查不到：回落 TroopData 官方名/描述并标注 implemented=false
    const c = makeChar({ traitIds: ['not-implemented-yet', 'armored'] });
    const vm = buildDetailViewModel(c, makeTroop({
      traits: [
        { code: 'not-implemented-yet', name: '疾病免疫', description: '对疾病免疫。' },
        { code: 'armored', name: '全副武装', description: '官方描述。' },
      ],
    }));
    expect(vm.traits[0]).toEqual({
      code: 'not-implemented-yet',
      name: '疾病免疫',
      description: '对疾病免疫。',
      implemented: false,
    });
    // traitIds 里已实现的：官方文本（TroopData）优先展示
    expect(vm.traits[1]).toEqual({
      code: 'armored',
      name: '全副武装',
      description: '官方描述。',
      implemented: true,
    });
  });

  it('TroopData 多出的特质条目也列出（按其实现状态标注）', () => {
    const c = makeChar({ traitIds: ['armored'] });
    const vm = buildDetailViewModel(c, makeTroop({
      traits: [
        { code: 'armored', name: '全副武装', description: '官方描述。' },
        { code: 'big', name: '庞然', description: '匹配 4/5 获得生命。' },
      ],
    }));
    expect(vm.traits.map((t) => t.name)).toEqual(['全副武装', '庞然']);
    expect(vm.traits.map((t) => t.implemented)).toEqual([true, true]);
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

  it('重复的 traitId 只列一次（详情窗特质列表不出重复行）', () => {
    const vm = buildDetailViewModel(makeChar({ traitIds: ['armored', 'armored'] }));
    expect(vm.traits.map((t) => t.code)).toEqual(['armored']);
  });

  it('当前状态带图标元数据与实时数值', () => {
    const vm = buildDetailViewModel(makeChar({ statuses: [{ id: 'poison', turns: 3, magnitude: 2 }] as Character['statuses'] }));
    expect(vm.statuses).toHaveLength(1);
    expect(vm.statuses[0]).toMatchObject({ id: 'poison', turns: 3, magnitude: 2 });
    expect(vm.statuses[0].label.length).toBeGreaterThan(0);
  });

  it('纯函数：不修改传入的 Character', () => {
    const c = makeChar({ hp: 999 });
    const snapshot = JSON.stringify(c);
    buildDetailViewModel(c, makeTroop());
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
