/**
 * 引擎侧状态演出元数据（审查修复批）：拦截事件、移除原因、层数/刷新标记、
 * 恐怖换位调位事件、反射标记。全部为演出用可选字段/新增事件，不改变任何结算。
 */
import { describe, expect, it } from 'vitest';
import { applyStatus, tickStatuses, tickTeamStatuses, cleanseEffect, dispelStatusEffect } from '@engine/skills/effects/status';
import { damageEffect } from '@engine/skills/effects/damage';
import { reflectHit } from '@engine/skills/effects/reflect';
import { CombatResolver } from '@engine/CombatResolver';
import { SeededRNG } from '@engine/rng';
import { ManaDistributor } from '@engine/ManaDistributor';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, StatusInstance, Team } from '@engine/types';
import { attachPassives, neutralPassives } from '@engine/traits';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  const ch: Character = {
    id, name: `U${id}`, hp: 40, maxHp: 40, armor: 0, attack: 5, magic: 3,
    mana: 0, manaCost: 10, colors: [], statuses: [], defeated: false,
    skillId: 'noop', passive: neutralPassives(), ...over,
  } as Character;
  return ch;
}
const team = (chars: Character[]): Team => ({ characters: chars, summonQueue: [] } as unknown as Team);

describe('拦截类演出事件 status-blocked', () => {
  it('特质免疫：不施加状态，发一条 immune', () => {
    const ch = makeChar(1, { passive: { ...neutralPassives(), statusImmunities: ['burning'] } });
    const events = applyStatus(ch, { id: 'burning', turns: 3 });
    // 免疫直接写在 passive 上（无特质 id），触发来源为空
    expect(events).toEqual([{ type: 'status-blocked', targetId: 1, statusId: 'burning', reason: 'immune', traitActivations: [] }]);
    expect(ch.statuses).toEqual([]);
  });

  it('赐福拦截负面：发 blessed，赐福本身保留', () => {
    const ch = makeChar(1, { statuses: [{ id: 'blessed', turns: 3 }] });
    const events = applyStatus(ch, { id: 'poison', turns: 3 });
    expect(events).toEqual([{ type: 'status-blocked', targetId: 1, statusId: 'poison', reason: 'blessed' }]);
    expect(ch.statuses.map(s => s.id)).toEqual(['blessed']);
  });

  it('诅咒穿透普通免疫，不发拦截事件', () => {
    const ch = makeChar(1, { passive: { ...neutralPassives(), statusImmunities: ['curse'] } });
    expect(applyStatus(ch, { id: 'curse', turns: 3 })[0]).toMatchObject({ type: 'status-apply', statusId: 'curse' });
  });

  it('下潮躲开覆盖整队的法术伤害：伤害之后补一条 submerged，不打断群攻批次', () => {
    const dodger = makeChar(2, { statuses: [{ id: 'submerged', turns: 2 }] });
    const victim = makeChar(3);
    const caster = makeChar(1);
    const state = { teams: { [PlayerSide.Left]: team([caster]), [PlayerSide.Right]: team([victim, dodger]) } };
    const events = damageEffect({ targets: [victim, dodger], scaling: { base: 5, mult: 0 }, range: 'all', wholeTeamDamage: true })
      .apply({ state, casterId: 1, rng: new SeededRNG(1) } as never);
    expect(events.map(e => e.type)).toEqual(['skill-damage', 'status-blocked']);
    expect(events[1]).toMatchObject({ targetId: 2, reason: 'submerged' });
    expect(dodger.hp).toBe(40);
  });
});

describe('移除原因 status-expire.reason', () => {
  it('累积自愈掷中 → recovered', () => {
    const ch = makeChar(1, { statuses: [{ id: 'burning', turns: 3, recoveryChance: 100 }] });
    const events = tickStatuses(ch, new SeededRNG(1));
    expect(events.filter(e => e.type === 'status-expire'))
      .toEqual([{ type: 'status-expire', targetId: 1, statusId: 'burning', reason: 'recovered' }]);
  });

  it('诅咒剥离正面 → stripped；赐福净化负面 → cleansed', () => {
    const cursedTarget = makeChar(1, { statuses: [{ id: 'barrier', turns: 3 }, { id: 'reflect', turns: 3 }] });
    const stripped = applyStatus(cursedTarget, { id: 'curse', turns: 3 })
      .filter(e => e.type === 'status-expire');
    expect(stripped.every(e => e.type === 'status-expire' && e.reason === 'stripped')).toBe(true);

    const sick = makeChar(2, { statuses: [{ id: 'poison', turns: 3 }, { id: 'web', turns: 3 }] });
    const cleansed = applyStatus(sick, { id: 'blessed', turns: 3 }).filter(e => e.type === 'status-expire');
    expect(cleansed).toHaveLength(2);
    expect(cleansed.every(e => e.type === 'status-expire' && e.reason === 'cleansed')).toBe(true);
  });

  it('屏障/反射被一次伤害消耗 → consumed', () => {
    const target = makeChar(1, { statuses: [{ id: 'barrier', turns: 3 }] });
    const attacker = makeChar(9, { attack: 7 });
    const out = new CombatResolver().resolveSkullDamage(team([attacker]), team([target]), 1, new SeededRNG(1));
    expect(out.events).toContainEqual({ type: 'status-expire', targetId: 1, statusId: 'barrier', reason: 'consumed' });

    const reflector = makeChar(2, { statuses: [{ id: 'reflect', turns: 3 }] });
    const source = makeChar(3);
    expect(reflectHit(reflector, source, 10, 'skill'))
      .toContainEqual({ type: 'status-expire', targetId: 2, statusId: 'reflect', reason: 'consumed' });
  });

  it('定向驱散 → dispelled；技能净化发 status-cleanse（默认 kind）', () => {
    const target = makeChar(1, { statuses: [{ id: 'bleed', turns: 3, magnitude: 1 }] });
    expect(dispelStatusEffect({ targets: [target], statusId: 'bleed' }).apply({} as never))
      .toEqual([{ type: 'status-expire', targetId: 1, statusId: 'bleed', reason: 'dispelled' }]);

    const sick = makeChar(2, { statuses: [{ id: 'poison', turns: 3 }, { id: 'barrier', turns: 3 }] });
    const cleansed = cleanseEffect({ targets: [sick] }).apply({} as never);
    expect(cleansed).toEqual([{ type: 'status-cleanse', targetId: 2, statusIds: ['poison'] }]);
    // 正面状态保留（表现层据此只撤被移除的那一个持续层）
    expect(sick.statuses.map(s => s.id)).toEqual(['barrier']);
  });

  it('DoT 致死后不再发该单位的到期事件（defeat 之后不应还有状态演出）', () => {
    const dying = makeChar(1, {
      hp: 1,
      statuses: [{ id: 'burning', turns: 3, recoveryChance: 0 }, { id: 'helper-mark', turns: 1 }] as StatusInstance[],
    });
    const events = tickStatuses(dying, new SeededRNG(7));
    const defeatAt = events.findIndex(e => e.type === 'defeat');
    expect(defeatAt).toBeGreaterThanOrEqual(0);
    expect(events.slice(defeatAt + 1)).toEqual([]);
  });
});

describe('施加事件的层数与刷新标记', () => {
  it('出血携带施加后层数；再次施加标 refreshed', () => {
    const ch = makeChar(1);
    const first = applyStatus(ch, { id: 'bleed', turns: 3 })[0];
    expect(first).toMatchObject({ type: 'status-apply', stacks: 1 });
    expect(first).not.toHaveProperty('refreshed');
    expect(applyStatus(ch, { id: 'bleed', turns: 3 })[0])
      .toMatchObject({ type: 'status-apply', stacks: 2, refreshed: true });
    // 上限 4 层：越界施加照实报当前层数
    applyStatus(ch, { id: 'bleed', turns: 3, magnitude: 5 }, { stack: true });
    expect(applyStatus(ch, { id: 'bleed', turns: 3 })[0]).toMatchObject({ stacks: 4, refreshed: true });
  });

  it('非层数状态不带 stacks；新挂不带 refreshed', () => {
    const ch = makeChar(1);
    const first = applyStatus(ch, { id: 'poison', turns: 3 })[0];
    expect(first).toMatchObject({ type: 'status-apply', statusId: 'poison' });
    expect(first).not.toHaveProperty('stacks');
    expect(first).not.toHaveProperty('refreshed');
    expect(applyStatus(ch, { id: 'poison', turns: 3 })[0]).toMatchObject({ refreshed: true });
  });
});

describe('恐怖换位与反射的演出元数据', () => {
  it('恐怖下移一位时发 troop-reposition（卡列据此滑到新站位）', () => {
    const scared = makeChar(1, { statuses: [{ id: 'terror', turns: 4 }] });
    const behind = makeChar(2);
    const roster = [scared, behind];
    // 找一个让 10% 掷签命中的种子
    let events: ReturnType<typeof tickTeamStatuses> = [];
    for (let seed = 1; seed < 200; seed++) {
      const a = makeChar(1, { statuses: [{ id: 'terror', turns: 4 }] });
      const b = makeChar(2);
      const list = [a, b];
      const out = tickTeamStatuses(list, new SeededRNG(seed), PlayerSide.Left);
      if (out.some(e => e.type === 'troop-reposition')) { events = out; break; }
    }
    expect(events.filter(e => e.type === 'troop-reposition'))
      .toEqual([{ type: 'troop-reposition', targetId: 1, to: 'back', index: 1 }]);
    // 未命中掷签时不发（无位次变化不演出）
    expect(tickTeamStatuses(roster, new SeededRNG(2), PlayerSide.Left)
      .filter(e => e.type === 'troop-reposition').length).toBeLessThanOrEqual(1);
  });

  it('反射弹回的法术伤害带 reflected 标记（不被当成主动施法）', () => {
    const reflector = makeChar(2, { statuses: [{ id: 'reflect', turns: 3 }] });
    const source = makeChar(3);
    const hit = reflectHit(reflector, source, 10, 'skill').find(e => e.type === 'skill-damage');
    expect(hit).toMatchObject({ type: 'skill-damage', casterId: 2, targetId: 3, reflected: true });
  });

  it('反弹被来源屏障挡下时带 absorbedFrom（表现层照常打回一发再播格挡）', () => {
    const reflector = makeChar(2, { statuses: [{ id: 'reflect', turns: 3 }] });
    const source = makeChar(3, { statuses: [{ id: 'barrier', turns: 3 }] });
    const events = reflectHit(reflector, source, 10, 'skill');
    expect(events[0]).toMatchObject({
      type: 'status-expire', targetId: 3, statusId: 'barrier', absorbedFrom: { casterId: 2 },
    });
  });

  it('攻击落空原因如实标 entangle（canAttack 只被缠绕否决）', () => {
    const attacker = makeChar(1, { statuses: [{ id: 'entangle', turns: 3 }, { id: 'frozen', turns: 3 }] });
    attachPassives(attacker);
    const out = new CombatResolver().resolveSkullDamage(team([attacker]), team([makeChar(9)]), 1, new SeededRNG(1));
    expect(out.events).toEqual([{ type: 'attack-struggle', attackerId: 1, reason: 'entangle' }]);
  });
});

describe('法力侧的静默机制补演出', () => {
  const manaChar = (id: number, over: Partial<Character> = {}) =>
    makeChar(id, { colors: [BaseColor.Red], manaCost: 10, mana: 0, ...over });

  it('疾病减半的入账带 halved（消 4 颗只加 2 点不再像 bug）', () => {
    const t = team([manaChar(1, { statuses: [{ id: 'disease', turns: 3 }] })]);
    const events = new ManaDistributor().distribute(t, PlayerSide.Left, BaseColor.Red, 4);
    expect(events).toEqual([expect.objectContaining({ type: 'mana-gain', amount: 2, halved: true })]);
  });

  it('未被减半的入账不带 halved（既有事件形态不变）', () => {
    const t = team([manaChar(1)]);
    const events = new ManaDistributor().distribute(t, PlayerSide.Left, BaseColor.Red, 4);
    expect(events).toEqual([{ type: 'mana-gain', color: BaseColor.Red, amount: 4, characterId: 1, player: PlayerSide.Left }]);
  });

  it('沉默跳过充能：发 status-blocked(mana)，且排在全部 mana-gain 之后不打断法力流批次', () => {
    const silenced = manaChar(1, { statuses: [{ id: 'silence', turns: 3 }] });
    const next = manaChar(2);
    const events = new ManaDistributor().distribute(team([silenced, next]), PlayerSide.Left, BaseColor.Red, 3);
    expect(events.map(e => e.type)).toEqual(['mana-gain', 'status-blocked']);
    expect(events[0]).toMatchObject({ characterId: 2, amount: 3 });
    expect(events[1]).toEqual({ type: 'status-blocked', targetId: 1, statusId: 'silence', reason: 'mana' });
    expect(silenced.mana).toBe(0);
  });

  it('已满的沉默单位不提示（跳过属正常，不值得弹）', () => {
    const full = manaChar(1, { mana: 10, statuses: [{ id: 'silence', turns: 3 }] });
    const events = new ManaDistributor().distribute(team([full, manaChar(2)]), PlayerSide.Left, BaseColor.Red, 3);
    expect(events.some(e => e.type === 'status-blocked')).toBe(false);
  });
});
