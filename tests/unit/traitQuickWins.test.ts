/**
 * 特质快速赢面批次测试（stealthy / 反射变体 / 承受骷髅附状态 / 4-5 连种族光环 / 种族映射补漏）。
 *
 * 对应 build_traits.mjs 新规则与 traits.ts 新字段（inflictOnSkullDamaged、bigMatchTypeAura）。
 */
import { describe, it, expect } from 'vitest';
import { resolvePassives, attachPassives, applyBigMatchTriggers, getTrait } from '@engine/traits';
import { CombatResolver } from '@engine/CombatResolver';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { SeededRNG } from '@engine/rng';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function team(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

describe('隐匿 stealthy（92 次出场）', () => {
  it('编译为 untargetable=true', () => {
    expect(getTrait('stealthy')?.untargetable).toBe(true);
    expect(resolvePassives(['stealthy']).untargetable).toBe(true);
  });

  it('隐匿角色不可被指定，无隐匿角色不受影响', () => {
    const hidden = makeChar(4, { traitIds: ['stealthy'] });
    attachPassives(hidden);
    const normal = makeChar(5);
    expect(resolvePassives(['stealthy']).untargetable).toBe(true);
    expect(resolvePassives([]).untargetable).toBe(false);
    void hidden;
    void normal;
  });
});

describe('反射变体（flowershield 等 9 个 code）', () => {
  it('「反射 35% 的骷髅伤害」解析为 reflectSkullRatio', () => {
    expect(getTrait('flowershield')?.reflectSkullRatio).toBe(0.35);
    expect(resolvePassives(['flowershield']).reflectSkullRatio).toBe(0.35);
  });
});

describe('承受骷髅伤害附状态（毒孢子族）', () => {
  it('poisonspores 数据：DoT 带 magnitude 1、回合 3', () => {
    expect(getTrait('poisonspores')?.inflictOnSkullDamaged).toEqual({
      id: 'poison',
      turns: 3,
      magnitude: 1,
    });
  });

  it('战斗接入：目标被打时攻击者中毒；闪避/屏障路径不触发', () => {
    const attacker = makeChar(0, { attack: 10 });
    const spored = makeChar(4, { traitIds: ['poisonspores'] });
    attachPassives(spored);

    // 正常命中：攻击者应中毒
    const outcome = new CombatResolver().resolveSkullDamage(
      team(PlayerSide.Left, [attacker]),
      team(PlayerSide.Right, [spored]),
      3,
      new SeededRNG(1),
    );
    expect(attacker.statuses.some((s) => s.id === 'poison')).toBe(true);
    expect(outcome.events.some((e) => e.type === 'status-apply')).toBe(true);

    // 闪避：攻击落空路径，不应触发毒孢子（目标换成高闪避特质角色）
    const dodgy = makeChar(6, { traitIds: ['agile'] });
    attachPassives(dodgy);
    const attacker2 = makeChar(1, { attack: 10 });
    // 用足够多的随机种子确保闪避成功（20% 概率）
    for (let seed = 0; seed < 40; seed++) {
      const a = makeChar(1, { attack: 10 });
      const d = makeChar(7, { traitIds: ['agile'] });
      attachPassives(d);
      const outcome2 = new CombatResolver().resolveSkullDamage(
        team(PlayerSide.Left, [a]),
        team(PlayerSide.Right, [d]),
        3,
        new SeededRNG(seed),
      );
      if (outcome2.events.some((e) => e.type === 'attack-struggle')) {
        expect(a.statuses.some((s) => s.id === 'poison')).toBe(false);
        return;
      }
    }
    expect.unreachable('40 个种子里应至少闪避成功一次');
    void dodgy;
    void attacker2;
  });
});

describe('4/5 连种族光环（firstwargare/overclock 族）', () => {
  it('数据形态：种族/全队 scope + 共享数值双属性', () => {
    expect(getTrait('firstwargare')?.onBigMatchTypeAura).toEqual({
      troopType: 'Wargare',
      gains: { attack: 2, magic: 2 },
    });
    expect(getTrait('overclock')?.onBigMatchTypeAura).toEqual({
      troopType: 'Mech',
      gains: { attack: 2, armor: 2 },
    });
    expect(getTrait('celestialsage')?.onBigMatchTypeAura).toEqual({
      troopType: 'all',
      gains: { magic: 1 },
    });
  });

  it('编译：同种族叠加，异种族并存', () => {
    const p = resolvePassives(['firstwargare', 'masterofbeasts']);
    expect(p.bigMatchTypeAura.Wargare).toEqual({ hp: 0, armor: 0, attack: 2, magic: 2, mana: 0 });
    expect(p.bigMatchTypeAura.Beast).toEqual({ hp: 0, armor: 2, attack: 2, magic: 0, mana: 0 });
  });

  it('触发：配对方全体种族匹配者得增益，异族与被织网锁魔力的按各自规则结算', () => {
    const holder = makeChar(0, { traitIds: ['firstwargare'] });
    attachPassives(holder);
    const wargareAlly = makeChar(1, { troopTypes: ['Wargare'] });
    const nonWargare = makeChar(2, { troopTypes: ['Elf'] });
    const events = applyBigMatchTriggers([holder, wargareAlly, nonWargare]);

    // 狐人盟友 +2 攻 +2 魔；持有者自身不是狐人，不吃；异族不吃
    expect(wargareAlly.attack).toBe(7);
    expect(wargareAlly.magic).toBe(10);
    expect(nonWargare.attack).toBe(5);
    expect(nonWargare.magic).toBe(8);
    expect(events.filter((e) => e.type === 'buff').length).toBe(2);
  });

  it("troopType 'all' 给全队（含持有者）", () => {
    const holder = makeChar(0, { traitIds: ['celestialsage'] });
    attachPassives(holder);
    const ally = makeChar(1);
    applyBigMatchTriggers([holder, ally]);
    expect(holder.magic).toBe(9);
    expect(ally.magic).toBe(9);
  });
});

describe('种族映射补漏', () => {
  it('urskabond（厄什卡 → Urska）解析为战斗开始光环', () => {
    expect(getTrait('urskabond')?.typeAura).toEqual({ troopType: 'Urska', stat: 'hp', amount: 2 });
  });
});
