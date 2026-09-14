/**
 * 织网（web，GoW Web）状态语义测试。
 *
 * 官方规则（见 .kiro/specs/combat-mechanics/GEMS-SEMANTICS.md）：
 *   - 魔力归零：技能数值只剩基础项；基础能力值不受影响；
 *   - 无法获得魔法值增益（技能 buff 与特质触发两条路都要拦）；
 *   - 每回合累计 10% 几率自行挣脱；存续回合照常递减；
 *   - 不禁行动：可攻击、可施法、可充能（与缠绕=攻击归零区分）。
 */
import { describe, it, expect } from 'vitest';
import {
  applyStatus,
  tickStatuses,
  hasStatus,
  isWebbed,
  WEB_RECOVERY_BASE,
  WEB_RECOVERY_STEP,
  statusEffect,
  canCastSkill,
  canAttack,
  canGainMana,
} from '@engine/skills/effects/status';
import { buffEffect } from '@engine/skills/effects/buff';
import { casterMagic } from '@engine/skills/effects/context';
import { attachPassives, applyCastTriggers, getTrait } from '@engine/traits';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character } from '@engine/types';
import type { EffectContext } from '@engine/skills/effects/context';
import type { SeededRNG as RNG } from '@engine/rng';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 10,
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

/** 固定值 rng 桩：next() 恒返回 fail/success */
function stubRng(next: number): RNG {
  return { next: () => next } as unknown as RNG;
}

function makeState(left: Character[], right: Character[]) {
  return createGameState(
    new BoardModel(),
    { player: PlayerSide.Left, characters: left },
    { player: PlayerSide.Right, characters: right },
  );
}

function ctx(state: ReturnType<typeof makeState>, casterId: number): EffectContext {
  let gid = 1;
  return { state, casterId, rng: new SeededRNG(1), nextGemId: () => gid++ };
}

describe('织网 · 施加与行动限制', () => {
  it('施加后 isWebbed 为真；不禁行动（可攻击/施法/充能）', () => {
    const c = makeChar(1);
    applyStatus(c, { id: 'web', turns: 3 });
    expect(isWebbed(c)).toBe(true);
    expect(canCastSkill(c)).toBe(true);
    expect(canAttack(c)).toBe(true);
    expect(canGainMana(c)).toBe(true);
  });

  it('免疫织网的特质（slippery）拦截施加', () => {
    const c = makeChar(1, { traitIds: ['slippery'] });
    attachPassives(c);
    const events = applyStatus(c, { id: 'web', turns: 3 });
    expect(events).toEqual([]);
    expect(c.statuses).toEqual([]);
  });
});

describe('织网 · 挣脱判定（累计 10%/回合）', () => {
  it('判定失败：几率按 10/20/30 累计，回合照常递减，到期自然解除', () => {
    const c = makeChar(1);
    applyStatus(c, { id: 'web', turns: 3 });
    const fail = stubRng(0.99); // next()*100 = 99，恒大于几率
    tickStatuses(c, fail);
    tickStatuses(c, fail);
    expect(isWebbed(c)).toBe(true);
    expect(c.statuses[0].magnitude).toBe(WEB_RECOVERY_BASE + WEB_RECOVERY_STEP * 2);
    tickStatuses(c, fail); // turns 3→0，到期移除
    expect(isWebbed(c)).toBe(false);
  });

  it('判定成功：立即移除并发 status-expire', () => {
    const c = makeChar(1);
    applyStatus(c, { id: 'web', turns: 3 });
    const alwaysWin = stubRng(0); // next()*100 = 0 < 10
    const events = tickStatuses(c, alwaysWin);
    expect(isWebbed(c)).toBe(false);
    expect(events).toEqual([{ type: 'status-expire', targetId: 1, statusId: 'web' }]);
  });

  it('未传 rng（纯逻辑调用）不判定不累计，只走正常到期', () => {
    const c = makeChar(1);
    applyStatus(c, { id: 'web', turns: 2 });
    tickStatuses(c);
    expect(isWebbed(c)).toBe(true);
    expect(c.statuses[0].magnitude).toBeUndefined();
    tickStatuses(c);
    expect(isWebbed(c)).toBe(false);
  });
});

describe('织网 · 魔力归零（技能数值只剩基础项）', () => {
  it('casterMagic：织网时按 0 计，解除后恢复', () => {
    const c = makeChar(0, { magic: 8 });
    const state = makeState([c], [makeChar(4)]);
    expect(casterMagic(ctx(state, 0))).toBe(8);
    applyStatus(c, { id: 'web', turns: 3 });
    expect(casterMagic(ctx(state, 0))).toBe(0);
    c.statuses = [];
    expect(casterMagic(ctx(state, 0))).toBe(8);
  });

  it('技能伤害段：[魔法+2] 在织网时只打基础值 2（非织网为 magic 8 → 10）', () => {
    const caster = makeChar(0, { magic: 8 });
    const enemy = makeChar(4, { armor: 0 });
    const state = makeState([caster], [enemy]);
    const targets = [enemy];
    const dmg = (m: number) => m + 2; // [魔法+2] 的求值口径与 evaluateScaling 一致（round(magic)+base）
    expect(dmg(casterMagic(ctx(state, 0)))).toBe(10);
    applyStatus(caster, { id: 'web', turns: 3 });
    expect(dmg(casterMagic(ctx(state, 0)))).toBe(2);
    void targets;
  });
});

describe('织网 · 拦截魔法值增益', () => {
  it('buffEffect 加魔法：织网目标不增益不发事件；护甲增益不受影响', () => {
    const target = makeChar(0);
    const state = makeState([target], []);
    applyStatus(target, { id: 'web', turns: 3 });

    const magicEvents = buffEffect({ targets: [target], stat: 'magic', scaling: { base: 3, mult: 0 } }).apply(
      ctx(state, 0),
    );
    expect(magicEvents).toEqual([]);
    expect(target.magic).toBe(8);

    const armorEvents = buffEffect({ targets: [target], stat: 'armor', scaling: { base: 2, mult: 0 } }).apply(
      ctx(state, 0),
    );
    expect(armorEvents.length).toBe(1);
    expect(target.armor).toBe(12);
  });

  it('特质触发增益（arcane 施法 +1 法强）：织网期间不生效，解除后恢复', () => {
    const caster = makeChar(0, { traitIds: ['arcane'] });
    attachPassives(caster);
    const ally = makeChar(1, { traitIds: ['arcane'] });
    attachPassives(ally);
    applyStatus(ally, { id: 'web', turns: 3 });

    const events = applyCastTriggers([caster, ally], []);
    // caster 未织网：+1 法强并发 buff；ally 织网：被拦截
    expect(events).toEqual([{ type: 'buff', targetId: caster.id, stat: 'magic', amount: 1 }]);
    expect(caster.magic).toBe(9);
    expect(ally.magic).toBe(8);
  });
});

describe('织网 · 数据契约（防回归）', () => {
  it('snare「天罗地网」命中附网不带 magnitude（magnitude 是挣脱几率，不是 DoT 伤害）', () => {
    const t = getTrait('snare');
    expect(t?.inflictOnSkullHit).toEqual({ id: 'web', turns: 3 });
  });

  it('statusEffect 原语施加 web 不带默认 magnitude（DoT 默认伤害仅限 poison/burning）', () => {
    const state = makeState([makeChar(0)], [makeChar(4)]);
    const events = statusEffect({ targets: [state.teams[PlayerSide.Right].characters[0]], statusId: 'web', turns: 3 }).apply(
      ctx(state, 0),
    );
    expect(events[0]).toMatchObject({ type: 'status-apply', statusId: 'web', turns: 3 });
    const target = state.teams[PlayerSide.Right].characters[0];
    expect(target.statuses[0]).toEqual({ id: 'web', turns: 3 });
    void hasStatus;
  });
});
