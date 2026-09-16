/**
 * 特质可救批（T1 免疫 + T3 骷髅命中）回归测试。
 *
 * T1：warded/cunning/brave/immune 四条免疫特质——纯数据，编译进 statusImmunities，
 *     引擎侧由 applyStatus 的免疫关卡（isImmuneToStatus）拦截。
 * T3：「在造成/受到骷髅头伤害时使对方陷入X状态」——复用 venomous（inflictOnSkullHit）
 *     与毒孢子（inflictOnSkullDamaged）两条既有结算钩子，本批只落数据。
 *
 * 结算直接走 CombatResolver.resolveSkullDamage：TurnEngine 对普通骷髅匹配与
 * 炸毁骷髅（settleExplodedSkulls）都经它结算，构造时已 attachPassives，
 * 与夹具里手动 attachPassives 等价。
 */
import { describe, it, expect } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { SeededRNG } from '@engine/rng';
import { hasStatus } from '@engine/skills/effects/status';
import { attachPassives, isImmuneToStatus, resolvePassives } from '@engine/traits';
import { PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 10, armor: 0, magic: 5,
    colors: [], manaCost: 10, mana: 0, skillId: 'none',
    statuses: [], defeated: false, ...over,
  };
}

/** 建一对队伍并按特质编译被动（模拟 TurnEngine 构造时的那一步）。 */
function duel(attackerTraits: string[], targetTraits: string[], targetOver: Partial<Character> = {}) {
  const attacker = makeChar(0, { attack: 10, traitIds: attackerTraits });
  const target = makeChar(4, { hp: 50, armor: 0, traitIds: targetTraits, ...targetOver });
  attachPassives(attacker);
  attachPassives(target);
  const left: Team = { player: PlayerSide.Left, characters: [attacker] };
  const right: Team = { player: PlayerSide.Right, characters: [target] };
  return { attacker, target, left, right, combat: new CombatResolver() };
}

/** 带调用计数的种子随机源：断言特质是否消耗随机数（无该特质的攻击者必须零消耗） */
function countedRng(seed: number) {
  const rng = new SeededRNG(seed);
  const counter = { calls: 0 };
  return {
    counter,
    next: () => {
      counter.calls += 1;
      return rng.next();
    },
  };
}

describe('T1 免疫特质（纯数据批）', () => {
  it('四条免疫特质编译出对应的 statusImmunities', () => {
    expect(resolvePassives(['warded']).statusImmunities).toEqual(['death-mark']);
    expect(resolvePassives(['cunning']).statusImmunities).toEqual(['marked']);
    expect(resolvePassives(['brave']).statusImmunities).toEqual(['terror']);
    // 「对疾病和狼化免疫」：狼化（wolf）引擎未实现，只收疾病
    expect(resolvePassives(['immune']).statusImmunities).toEqual(['disease']);
  });

  it('免疫在引擎判定侧生效（isImmuneToStatus）', () => {
    const brave = makeChar(1, { traitIds: ['brave'] });
    attachPassives(brave);
    expect(isImmuneToStatus(brave, 'terror')).toBe(true);
    expect(isImmuneToStatus(brave, 'burning')).toBe(false);
  });
});

describe('T3 骷髅命中附带状态 · 造成方向（inflictOnSkullHit）', () => {
  const cases = [
    ['deathtouch', 'death-mark'],
    ['eagleeye', 'marked'],
    ['cursedtouch', 'curse'],
    ['plaguetouch', 'disease'],
  ] as const;

  it.each(cases)('%s：造成骷髅伤害后目标陷入 %s（3 回合）', (code, statusId) => {
    const { target, left, right, combat } = duel([code], []);
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(target, statusId)).toBe(true);
    const inst = target.statuses.find((s) => s.id === statusId);
    expect(inst?.turns).toBe(3);
    expect(out.events.some((e) => e.type === 'status-apply' && e.statusId === statusId)).toBe(true);
  });

  it('razorteeth：出血是 DoT，施加带 magnitude 1', () => {
    const { target, left, right, combat } = duel(['razorteeth'], []);
    combat.resolveSkullDamage(left, right, 3);
    const inst = target.statuses.find((s) => s.id === 'bleed');
    expect(inst).toMatchObject({ turns: 3, magnitude: 1 });
  });

  it('savagestrike：100% 忽略护甲，护甲不掉血扣满', () => {
    const { target, left, right, combat } = duel(['savagestrike'], [], { armor: 5 });
    const rng = countedRng(7);
    combat.resolveSkullDamage(left, right, 3, rng);
    expect(target.armor).toBe(5); // 穿透：护甲分文未动
    expect(target.hp).toBe(40); // 攻击力 10 全额进血
    expect(rng.counter.calls).toBe(1); // 穿甲判定消耗一次随机数
  });
});

describe('T3 骷髅命中附带状态 · 承受方向（inflictOnSkullDamaged）', () => {
  const cases = [
    ['revenge', 'marked'],
    ['frozensoul', 'frozen'],
    ['serenity', 'silence'],
  ] as const;

  it.each(cases)('%s：受到骷髅伤害后反手让攻击者陷入 %s', (code, statusId) => {
    const { attacker, left, right, combat } = duel([], [code]);
    combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(attacker, statusId)).toBe(true);
  });

  it.each([['scalding'], ['magmahide']])('%s：反手燃烧带 magnitude 1（DoT）', (code) => {
    const { attacker, left, right, combat } = duel([], [code]);
    combat.resolveSkullDamage(left, right, 3);
    const inst = attacker.statuses.find((s) => s.id === 'burning');
    expect(inst).toMatchObject({ turns: 3, magnitude: 1 });
  });
});

describe('T3 × T1：免疫目标不吃骷髅附带状态', () => {
  it('warded（死亡标记免疫）挡下 deathtouch', () => {
    const { target, left, right, combat } = duel(['deathtouch'], ['warded']);
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(target, 'death-mark')).toBe(false);
    expect(out.events.some((e) => e.type === 'status-apply')).toBe(false);
    expect(target.hp).toBe(40); // 伤害照常结算，只免状态
  });

  it('cunning（猎人标记免疫）挡下 eagleeye', () => {
    const { target, left, right, combat } = duel(['eagleeye'], ['cunning']);
    combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(target, 'marked')).toBe(false);
  });

  it('攻击者自身带 cunning：不被 revenge 反手标记', () => {
    const { attacker, left, right, combat } = duel(['cunning'], ['revenge']);
    combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(attacker, 'marked')).toBe(false);
  });
});

describe('无该特质的攻击者零影响', () => {
  it('无特质对局不产生任何状态事件，也不消耗随机数（既有 rng 终态不变）', () => {
    const { attacker, target, left, right, combat } = duel([], []);
    const rng = countedRng(42);
    const out = combat.resolveSkullDamage(left, right, 3, rng);
    expect(out.events.some((e) => e.type === 'status-apply')).toBe(false);
    expect(attacker.statuses).toEqual([]);
    expect(target.statuses).toEqual([]);
    expect(rng.counter.calls).toBe(0); // 闪避/穿甲判定都未触发
    expect(target.hp).toBe(40);
  });

  it('同种子重复结算结果一致（确定性）', () => {
    const run = () => {
      const d = duel([], []);
      const rng = countedRng(2026);
      const out = d.combat.resolveSkullDamage(d.left, d.right, 3, rng);
      return { hp: d.target.hp, armor: d.target.armor, calls: rng.counter.calls, events: out.events };
    };
    expect(run()).toEqual(run());
  });
});
