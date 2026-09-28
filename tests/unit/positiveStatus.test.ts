/**
 * 正面状态族单测（2026-09-17 R10 批）：blessed / enchanted / reflect / enraged。
 *
 * 官方语义考证（官方帮助中心「All status effects」+ wiki 状态表交叉，GOW-STATUS-RESEARCH 同源）：
 *   - Blessed 赐福：施加时净化全部负面状态；存续期间免疫一切状态效果；诅咒例外（互相抵消）。
 *   - Enchanted 附魔：持有者回合开始 +2 法力，直到其施放法术（施法移除在 TurnEngine）。
 *   - Reflect 反射（gowhead 步骤名 CauseMirror）：所受伤害 50% 反弹（至少 1 点），受一次伤害后消失。
 *   - Enraged 激怒：与 rage 同族（RAGE_STATUS_IDS 既有别名），骷髅 1.5x + 无视特质（既有实现）。
 */
import { describe, expect, it } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import {
  applyStatus, hasStatus, tickStatuses,
  ENCHANTED_STATUS_ID, ENCHANTED_MANA_PER_TURN, REFLECT_STATUS_ID,
  reflectDamageAmount, consumeReflect, endActionStatuses,
} from '@engine/skills/effects/status';
import { damageOne } from '@engine/skills/effects/damage';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 10,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 10,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function team(side: PlayerSide, characters: Character[]): Team {
  return { player: side, characters };
}

describe('Blessed 赐福（净化 + 免疫一切状态）', () => {
  it('施加时净化负面状态并与现有诅咒互消，发 status-expire', () => {
    const ch = makeChar(1);
    applyStatus(ch, { id: 'poison', turns: 3, magnitude: 2 });
    applyStatus(ch, { id: 'curse', turns: 3 });
    applyStatus(ch, { id: 'barrier', turns: 3 });

    const events = applyStatus(ch, { id: 'blessed', turns: 3 });

    expect(hasStatus(ch, 'poison')).toBe(false);
    expect(hasStatus(ch, 'curse')).toBe(false);
    // 正面状态不在净化范围
    expect(hasStatus(ch, 'barrier')).toBe(true);
    expect(hasStatus(ch, 'blessed')).toBe(false);
    const expired = events.filter((e) => e.type === 'status-expire').map((e) => (e as { statusId: string }).statusId);
    expect(expired.sort()).toEqual(['curse', 'poison']);
  });

  it('存续期间拦截其他状态施加（负面正面皆拦），不拦截赐福自身刷新', () => {
    const ch = makeChar(1);
    applyStatus(ch, { id: 'blessed', turns: 3 });

    expect(applyStatus(ch, { id: 'poison', turns: 2 })).toEqual([]);
    // R011: Blessed blocks negatives only; positive statuses still apply.
    expect(applyStatus(ch, { id: 'barrier', turns: 2 })).toHaveLength(1);
    expect(hasStatus(ch, 'poison')).toBe(false);
    expect(hasStatus(ch, 'barrier')).toBe(true);

    // 自身重复施加 = 刷新时长（不拦）
    expect(applyStatus(ch, { id: 'blessed', turns: 5 }).length).toBe(1);
    expect(ch.statuses.find((s) => s.id === 'blessed')?.turns).toBe(5);
  });

  it('诅咒落在赐福单位上：两者互相抵消（官方状态表）', () => {
    const ch = makeChar(1);
    applyStatus(ch, { id: 'blessed', turns: 3 });

    const events = applyStatus(ch, { id: 'curse', turns: 3 });

    expect(hasStatus(ch, 'blessed')).toBe(false);
    expect(hasStatus(ch, 'curse')).toBe(false);
    const expired = events.filter((e) => e.type === 'status-expire').map((e) => (e as { statusId: string }).statusId);
    expect(expired).toContain('blessed');
  });

  it('赐福无回合上限，持有者行动后移除，之后恢复可施加（R004）', () => {
    const ch = makeChar(1);
    applyStatus(ch, { id: 'blessed', turns: 1 });
    tickStatuses(ch); // R004：回合开始不递减
    tickStatuses(ch);
    expect(hasStatus(ch, 'blessed')).toBe(true);
    endActionStatuses(ch); // 施法／首位骷髅伤害 = 行动

    expect(hasStatus(ch, 'blessed')).toBe(false);
    expect(applyStatus(ch, { id: 'poison', turns: 2 }).length).toBe(1);
    expect(hasStatus(ch, 'poison')).toBe(true);
  });
});

describe('Enchanted 附魔（回合开始 +2 法力，施法移除）', () => {
  it('tickStatuses 为持有者 +2 法力（按 manaCost 夹取）并发 buff 事件', () => {
    const ch = makeChar(1, { manaCost: 6, mana: 0 });
    applyStatus(ch, { id: 'enchanted', turns: 3 });

    const events = tickStatuses(ch);

    expect(ch.mana).toBe(ENCHANTED_MANA_PER_TURN);
    expect(events).toContainEqual({ type: 'buff', targetId: ch.id, stat: 'mana', amount: ENCHANTED_MANA_PER_TURN });
  });

  it('法力已满时不入账不发事件；沉默期间不获得', () => {
    const full = makeChar(1, { manaCost: 6, mana: 6 });
    applyStatus(full, { id: ENCHANTED_STATUS_ID, turns: 3 });
    expect(tickStatuses(full).filter((e) => e.type === 'buff')).toEqual([]);

    const silenced = makeChar(2, { manaCost: 6, mana: 0 });
    applyStatus(silenced, { id: ENCHANTED_STATUS_ID, turns: 3 });
    applyStatus(silenced, { id: 'silence', turns: 3 });
    expect(tickStatuses(silenced).filter((e) => e.type === 'buff')).toEqual([]);
    expect(silenced.mana).toBe(0);
  });

  it('施放法术后移除附魔（TurnEngine 施法口，先于效果执行）', () => {
    const caster = makeChar(1, { manaCost: 10, mana: 10, skillId: 'none' });
    const board = new BoardModel();
    const state = createGameState(board, team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [makeChar(2)]));
    const engine = new TurnEngine(state, new SeededRNG(1), (() => {
      let idg = 500000;
      return () => idg++;
    })());
    applyStatus(caster, { id: ENCHANTED_STATUS_ID, turns: 3 });

    const events = engine.castSkill(1);

    expect(events).toContainEqual({ type: 'skill-cast', characterId: 1, skillId: 'none' });
    expect(events).toContainEqual({ type: 'status-expire', targetId: 1, statusId: ENCHANTED_STATUS_ID });
    expect(hasStatus(caster, ENCHANTED_STATUS_ID)).toBe(false);
  });
});

describe('Reflect 反射（所受伤害 50% 反弹，至少 1 点，受击后消失）', () => {
  it('reflectDamageAmount 折算口径（50% + 下限 1）', () => {
    expect(reflectDamageAmount(1)).toBe(1);
    expect(reflectDamageAmount(3)).toBe(1); // official 4.5: floor(1.5)=1
    expect(reflectDamageAmount(10)).toBe(5);
  });

  it('consumeReflect 移除状态并发 status-expire', () => {
    const ch = makeChar(1);
    applyStatus(ch, { id: REFLECT_STATUS_ID, turns: 3 });
    const events = consumeReflect(ch);
    expect(events).toEqual([{ type: 'status-expire', targetId: ch.id, statusId: REFLECT_STATUS_ID }]);
    expect(hasStatus(ch, REFLECT_STATUS_ID)).toBe(false);
    // 无反射时空过
    expect(consumeReflect(ch)).toEqual([]);
  });

  it('骷髅伤害反弹 50% 给攻击者并消耗反射（原伤害照常）', () => {
    const combat = new CombatResolver();
    const attacker = makeChar(0, { attack: 10, armor: 0 });
    const target = makeChar(4, { hp: 50, armor: 0 });
    applyStatus(target, { id: REFLECT_STATUS_ID, turns: 3 });

    const out = combat.resolveSkullDamage(team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [target]), 3);

    // 原伤害 10 照常结算
    expect(target.hp).toBe(40);
    // 反弹 5（50%）扣攻击者
    expect(attacker.hp).toBe(45);
    expect(hasStatus(target, REFLECT_STATUS_ID)).toBe(false);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'skull-damage', attackerId: target.id, targetId: attacker.id, damage: 5 }));
    expect(out.events).toContainEqual({ type: 'status-expire', targetId: target.id, statusId: REFLECT_STATUS_ID });
  });

  it('法术伤害同样反弹（damageOne 传入施法者）', () => {
    const caster = makeChar(0, { hp: 50, armor: 0 });
    const target = makeChar(4, { hp: 50, armor: 0 });
    applyStatus(target, { id: REFLECT_STATUS_ID, turns: 3 });

    const events = damageOne(target, caster.id, 12, false, 'single', undefined, caster);

    expect(target.hp).toBe(38); // 12 点照常
    expect(caster.hp).toBe(44); // 反弹 6
    expect(hasStatus(target, REFLECT_STATUS_ID)).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'skill-damage', casterId: target.id, targetId: caster.id, damage: 6 }));
  });

  it('不传施法者（DoT 等无来源路径）不反弹', () => {
    const target = makeChar(4, { hp: 50 });
    applyStatus(target, { id: REFLECT_STATUS_ID, turns: 3 });
    const events = damageOne(target, 0, 12, false, 'single');
    expect(target.hp).toBe(38);
    expect(hasStatus(target, REFLECT_STATUS_ID)).toBe(true); // 未消耗（无来源可弹）
    expect(events.filter((e) => e.type === 'skill-damage')).toHaveLength(1);
  });

  it('屏障整发吸收=没被打中：不反弹、不消耗', () => {
    const combat = new CombatResolver();
    const attacker = makeChar(0, { attack: 10 });
    const target = makeChar(4, { hp: 50 });
    applyStatus(target, { id: 'barrier', turns: 3 });
    applyStatus(target, { id: REFLECT_STATUS_ID, turns: 3 });

    combat.resolveSkullDamage(team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [target]), 3);

    expect(target.hp).toBe(50);
    expect(hasStatus(target, 'barrier')).toBe(false); // 屏障被消耗
    expect(hasStatus(target, REFLECT_STATUS_ID)).toBe(true); // 反射保留
    expect(attacker.hp).toBe(50);
  });
});

describe('Enraged 激怒（与 rage 同族，既有实现回归锚定）', () => {
  it('enraged id 走 RAGE_STATUS_IDS 同款 1.5x 骷髅伤害 + 攻击后消耗', () => {
    const combat = new CombatResolver();
    const attacker = makeChar(0, { attack: 10 });
    const enemy = makeChar(4, { hp: 50 });
    applyStatus(attacker, { id: 'enraged', turns: 2 });

    const out = combat.resolveSkullDamage(team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [enemy]), 3);

    expect(enemy.hp).toBe(35); // 10 × 1.5
    expect(attacker.statuses).toEqual([]);
    expect(out.events).toContainEqual({ type: 'status-expire', targetId: attacker.id, statusId: 'enraged' });
  });
});
