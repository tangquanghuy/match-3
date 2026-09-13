import { describe, it, expect } from 'vitest';
import {
  skill, scale, flat,
  dmg, dmgSplash, dmgAll, trueDmg,
  heal, armor, attack, magic, mana,
  createGems, createSkulls, transform, destroyRows, destroyCols, destroyColor, explodeColor, destroyRandomGems,
  inflict, extraTurn,
  summonRef, summonRandom, summonTemplate,
  CHOSEN,
} from '@engine/skills/builders';
import { BaseColor } from '@engine/types';

describe('skill() 组装顺序', () => {
  it('段顺序与书写顺序一致（需求 1.3）', () => {
    const p = skill(dmg('enemyFront', 2), heal('allySelf', 1), extraTurn());
    expect(p.segments.map((s) => s.kind)).toEqual(['damage', 'buff', 'extraTurn']);
  });
});

describe('数值构造器', () => {
  it('scale/flat', () => {
    expect(scale(3, 2)).toEqual({ base: 3, mult: 2 });
    expect(scale(3)).toEqual({ base: 3, mult: 1 });
    expect(flat(5)).toEqual({ base: 5, mult: 0 });
  });
});

describe('伤害构造器（需求 1.2）', () => {
  it('dmg 默认单体', () => {
    expect(dmg('enemyFront', 2)).toEqual({ kind: 'damage', target: 'enemyFront', scaling: { base: 2, mult: 1 } });
  });
  it('dmgSplash 带 range', () => {
    expect(dmgSplash('enemyFront', 2)).toMatchObject({ kind: 'damage', range: 'splash' });
  });
  it('dmgAll 群体+range=all', () => {
    expect(dmgAll(1)).toMatchObject({ kind: 'damage', target: 'enemyAll', range: 'all' });
  });
  it('trueDmg 真实伤害', () => {
    expect(trueDmg('enemyFront', 3)).toMatchObject({ kind: 'damage', trueDamage: true });
  });
});

describe('增益构造器（需求 1.2）', () => {
  it('各 stat 正确', () => {
    expect(heal('allySelf', 1)).toMatchObject({ kind: 'buff', stat: 'hp' });
    expect(armor('allySelf', 1)).toMatchObject({ kind: 'buff', stat: 'armor' });
    expect(attack('allySelf', 1)).toMatchObject({ kind: 'buff', stat: 'attack' });
    expect(magic('allySelf', 1)).toMatchObject({ kind: 'buff', stat: 'magic' });
    expect(mana('allySelf', 1)).toMatchObject({ kind: 'buff', stat: 'mana' });
  });
});

describe('宝石构造器（需求 1.2, 2.2）', () => {
  it('createGems 固定色', () => {
    expect(createGems(BaseColor.Red, 9)).toMatchObject({
      kind: 'gem', params: { op: 'create', gem: { kind: 'color', color: BaseColor.Red }, count: { base: 9, mult: 0 } },
    });
  });
  it('createGems 支持 CHOSEN 占位', () => {
    expect(createGems(CHOSEN, 5)).toMatchObject({
      kind: 'gem', params: { op: 'create', gem: { kind: 'color', color: 'CHOSEN' } },
    });
  });
  it('createSkulls', () => {
    expect(createSkulls(7)).toMatchObject({ kind: 'gem', params: { op: 'create', gem: { kind: 'skull' } } });
  });
  it('transform 支持 CHOSEN 两端', () => {
    expect(transform(CHOSEN, BaseColor.Blue)).toMatchObject({
      kind: 'gem', params: { op: 'transform', from: 'CHOSEN', to: BaseColor.Blue },
    });
  });
  it('destroyRows/Cols/Color（clear 段）', () => {
    expect(destroyRows(3)).toMatchObject({ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', rows: [3] } } });
    expect(destroyCols(0, 7)).toMatchObject({ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'lines', cols: [0, 7] } } });
    expect(destroyColor(CHOSEN)).toMatchObject({ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'color', color: 'CHOSEN' } } });
    expect(explodeColor(CHOSEN)).toMatchObject({ kind: 'gem', params: { op: 'clear', mode: 'explode', target: { kind: 'color', color: 'CHOSEN' } } });
    expect(destroyRandomGems(5)).toMatchObject({ kind: 'gem', params: { op: 'clear', mode: 'destroy', target: { kind: 'randomGems' } } });
  });
});

describe('状态构造器（需求 1.2）', () => {
  it('DoT 默认带 magnitude', () => {
    expect(inflict('poison', 'enemyFront')).toMatchObject({ kind: 'status', statusId: 'poison', turns: 3, magnitude: 3 });
  });
  it('非 DoT 无 magnitude', () => {
    const s = inflict('silence', 'enemyFront');
    expect(s).toMatchObject({ kind: 'status', statusId: 'silence' });
    expect(s.magnitude).toBeUndefined();
  });
  it('opts 覆盖 turns/n', () => {
    expect(inflict('poison', 'enemyFirstN', { n: 2, turns: 5 })).toMatchObject({ turns: 5, n: 2 });
  });
});

describe('召唤构造器（需求 7.1）', () => {
  it('summonRef 引用兵种', () => {
    expect(summonRef('Skeleton')).toMatchObject({ kind: 'summon', params: { source: { ref: 'Skeleton' } } });
  });
  it('summonRandom 候选集', () => {
    expect(summonRandom(['Goblin', 'Orc'])).toMatchObject({ kind: 'summon', params: { source: { randomOf: ['Goblin', 'Orc'] } } });
  });
  it('summonTemplate 手写模板', () => {
    const tpl = { name: '骸骨', maxHp: 20, hp: 20, attack: 8, armor: 0, magic: 2, colors: [BaseColor.Purple], manaCost: 10, mana: 0, skillId: 'none' };
    expect(summonTemplate(tpl)).toMatchObject({ kind: 'summon', params: { source: { template: tpl } } });
  });
});
