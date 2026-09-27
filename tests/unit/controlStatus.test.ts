import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import type { SkillEffect } from '@engine/registry';
import { CombatResolver } from '@engine/CombatResolver';
import { SeededRNG } from '@engine/rng';
import {
  applyStatus,
  isSilenced,
  isFrozen,
  isEntangled,
  canCastSkill,
  canAttack,
  canGainMana,
} from '@engine/skills/effects/status';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

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
    manaCost: 10,
    mana: 10, // 法力已满，可释放
    skillId: 'testskill',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function setup(casterOver: Partial<Character> = {}) {
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0, casterOver)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4)] };
  const board = new BoardModel();
  const state = createGameState(board, left, right);
  const registry = new ExtensionRegistry();
  // 注册一个会发出可见事件的技能，便于断言"是否释放成功"
  const skill: SkillEffect = {
    apply: () => [{ type: 'buff', targetId: 0, stat: 'attack', amount: 1 }],
  };
  registry.skills.set('testskill', skill);
  let idg = 1000;
  const engine = new TurnEngine(state, new SeededRNG(1), () => idg++, registry);
  return { engine, state, left };
}

describe('控制类状态行动限制（原版冰冻仅限制额外回合）', () => {
  it('沉默：不可技能、不可充能、可攻击', () => {
    const c = makeChar(0);
    expect(canCastSkill(c)).toBe(true);
    applyStatus(c, { id: 'silence', turns: 2 });
    expect(isSilenced(c)).toBe(true);
    expect(canCastSkill(c)).toBe(false);
    expect(canGainMana(c)).toBe(false);
    expect(canAttack(c)).toBe(true);
  });

  it('冰冻：仍可技能、攻击和充能', () => {
    const c = makeChar(1);
    applyStatus(c, { id: 'frozen', turns: 3 });
    expect(isFrozen(c)).toBe(true);
    expect(canCastSkill(c)).toBe(true);
    expect(canAttack(c)).toBe(true);
    expect(canGainMana(c)).toBe(true);
  });

  it('缠绕：仅不可攻击，可技能、可充能', () => {
    const c = makeChar(2);
    applyStatus(c, { id: 'entangle', turns: 2 });
    expect(isEntangled(c)).toBe(true);
    expect(canAttack(c)).toBe(false);
    expect(canCastSkill(c)).toBe(true);
    expect(canGainMana(c)).toBe(true);
  });

  it('击晕：引擎侧暂无行动限制（待被动系统），仅表现层', () => {
    const c = makeChar(3);
    applyStatus(c, { id: 'stun', turns: 1 });
    expect(canCastSkill(c)).toBe(true);
    expect(canAttack(c)).toBe(true);
    expect(canGainMana(c)).toBe(true);
  });
});

describe('castSkill 受控制状态限制', () => {
  it('正常可释放：产出 skill-cast + 效果事件', () => {
    const { engine } = setup();
    const events = engine.castSkill(0);
    expect(events[0]).toMatchObject({ type: 'skill-cast', characterId: 0 });
    expect(events.some((e) => e.type === 'buff')).toBe(true);
  });

  it('沉默拒绝释放（需求 9.3）', () => {
    const { engine, left } = setup();
    applyStatus(left.characters[0], { id: 'silence', turns: 2 });
    const events = engine.castSkill(0);
    expect(events).toEqual([]);
    // 法力未被清零（释放被拒绝）
    expect(left.characters[0].mana).toBe(10);
  });

  it('冰冻仍可释放技能', () => {
    const { engine, left } = setup();
    applyStatus(left.characters[0], { id: 'frozen', turns: 3 });
    const events = engine.castSkill(0);
    expect(events[0]).toMatchObject({ type: 'skill-cast', characterId: 0 });
    expect(left.characters[0].mana).toBe(0);
  });

  it('击晕不影响技能释放（引擎侧无效果）', () => {
    const { engine, left } = setup();
    applyStatus(left.characters[0], { id: 'stun', turns: 1 });
    const events = engine.castSkill(0);
    expect(events[0]).toMatchObject({ type: 'skill-cast', characterId: 0 });
  });

  it('状态到期后恢复释放能力', () => {
    const { engine, left } = setup();
    const c = left.characters[0];
    applyStatus(c, { id: 'silence', turns: 1 });
    expect(engine.castSkill(0)).toEqual([]);
    // 手动清空存续模拟到期
    c.statuses = [];
    const events = engine.castSkill(0);
    expect(events[0]).toMatchObject({ type: 'skill-cast' });
  });
});

describe('骷髅攻击：冰冻仍攻击，缠绕攻击归零', () => {
  const combat = new CombatResolver();

  function teams(attackerStatus?: string) {
    const a = makeChar(0, { attack: 5 });
    if (attackerStatus) applyStatus(a, { id: attackerStatus, turns: 2 });
    const left: Team = { player: PlayerSide.Left, characters: [a] };
    const right: Team = { player: PlayerSide.Right, characters: [makeChar(4, { hp: 50, armor: 0 })] };
    return { left, right };
  }

  it('队首正常：产出 skull-damage 造成伤害', () => {
    const { left, right } = teams();
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(out.events.some((e) => e.type === 'skull-damage')).toBe(true);
    expect(out.events.some((e) => e.type === 'attack-struggle')).toBe(false);
    // GoW 规则：一次骷髅匹配只触发一次普攻，伤害 = 攻击力，骷髅数不乘算
    expect(right.characters[0].hp).toBe(45); // 50 - 5
  });

  it('队首冰冻：仍正常造成骷髅伤害', () => {
    const { left, right } = teams('frozen');
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(out.events.some((e) => e.type === 'skull-damage')).toBe(true);
    expect(out.events.some((e) => e.type === 'attack-struggle')).toBe(false);
    expect(right.characters[0].hp).toBe(45);
  });

  it('队首缠绕：攻击落空，reason=entangle', () => {
    const { left, right } = teams('entangle');
    const out = combat.resolveSkullDamage(left, right, 3);
    const struggle = out.events.find((e) => e.type === 'attack-struggle');
    expect(struggle).toMatchObject({ reason: 'entangle' });
    expect(right.characters[0].hp).toBe(50);
  });

  it('队首击晕：仍可攻击（引擎侧无限制），正常造成伤害', () => {
    const { left, right } = teams('stun');
    const out = combat.resolveSkullDamage(left, right, 2);
    expect(out.events.some((e) => e.type === 'skull-damage')).toBe(true);
    expect(right.characters[0].hp).toBe(45); // 50 - 5（与骷髅数无关）
  });
});
