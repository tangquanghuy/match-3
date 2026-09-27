import { describe, it, expect } from 'vitest';
import { SeededRNG } from '@engine/rng';
import {
  applyStatus,
  tickStatuses,
  hasStatus,
  FAERIE_FIRE_STATUS_ID,
  FAERIE_FIRE_SPELL_MULT,
} from '@engine/skills/effects/status';
import { damageOne } from '@engine/skills/effects/damage';
import { CombatResolver } from '@engine/CombatResolver';
import { neutralPassives } from '@engine/traits';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 100,
    hp: 100,
    attack: 10,
    armor: 0,
    magic: 0,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

function withFaerieFire(over: Partial<Character> = {}): Character {
  const char = makeChar(1, { passive: neutralPassives(), ...over });
  char.statuses.push({ id: FAERIE_FIRE_STATUS_ID, turns: 3 });
  return char;
}

describe('妖火状态（faerie-fire）：法术伤害 +50%', () => {
  it('damageOne：带妖火的目标受到的法术伤害 ×1.5（10 → 15）', () => {
    const target = withFaerieFire();
    const events = damageOne(target, 0, 10, false, 'single');
    const dmg = events.find((e) => e.type === 'skill-damage');
    expect(dmg).toMatchObject({ damage: 15, resultingHp: 85 });
  });

  it('无妖火：同伤害不放大（10 → 10）', () => {
    const target = makeChar(1, { passive: neutralPassives() });
    const events = damageOne(target, 0, 10, false, 'single');
    expect(events.find((e) => e.type === 'skill-damage')).toMatchObject({ damage: 10 });
  });

  it('妖火与法术减伤特质相乘（0.8 减伤：round(10 × 1.5 × 0.8) = 12）', () => {
    const target = makeChar(1, { passive: { ...neutralPassives(), spellDamageTaken: 0.8 } });
    target.statuses.push({ id: FAERIE_FIRE_STATUS_ID, turns: 3 });
    const events = damageOne(target, 0, 10, false, 'single');
    expect(events.find((e) => e.type === 'skill-damage')).toMatchObject({ damage: 12 });
  });

  it('骷髅普攻不吃妖火（resolveSkullDamage 不经 damageOne）', () => {
    const attacker = makeChar(0);
    const target = withFaerieFire();
    const enemyTeam = makeTeam(PlayerSide.Right, [target]);
    const myTeam = makeTeam(PlayerSide.Left, [attacker]);
    const outcome = new CombatResolver().resolveSkullDamage(myTeam, enemyTeam, 1, new SeededRNG(3));
    const hits = outcome.events.filter((e) => e.type === 'skull-damage');
    expect(hits).toHaveLength(1);
    // 攻击 10、无甲 → 恰 10 点，不放大
    expect(hits[0]).toMatchObject({ damage: 10, resultingHp: 90 });
  });
});

describe('妖火状态：每回合累计 10% 自愈（AUTO_RECOVER 通道）', () => {
  it('未解除时 recoveryChance 按 10% 步进累计；掷中后移除并发 status-expire', () => {
    const char = withFaerieFire();
    // 该种子前期 rng.next() 均偏大（自愈判定连续失败），可观察累计过程
    const rng = new SeededRNG(4);
    const observed: number[] = [];
    for (let turn = 0; turn < 12 && hasStatus(char, FAERIE_FIRE_STATUS_ID); turn++) {
      const before = char.statuses.find((s) => s.id === FAERIE_FIRE_STATUS_ID)?.recoveryChance ?? 10;
      observed.push(before);
      tickStatuses(char, rng);
    }
    // 累计序列必须是 10,20,30,…（首回合 10%，之后每回合 +10%）
    expect(observed[0]).toBe(10);
    for (let i = 1; i < observed.length; i++) {
      expect(observed[i]).toBe(observed[i - 1] + 10);
    }
    // 12 回合内（累计 ≥100%）必然自愈
    expect(hasStatus(char, FAERIE_FIRE_STATUS_ID)).toBe(false);
  });

  it('tickStatuses 掷中自愈时发 status-expire 事件', () => {
    // 找一个首次 rng.next() < 0.1 的种子（首回合即自愈）
    let seed = 1;
    for (; seed < 500; seed++) {
      if (new SeededRNG(seed).next() < 0.1) break;
    }
    const char = withFaerieFire();
    const events = tickStatuses(char, new SeededRNG(seed));
    expect(events.some((e) => e.type === 'status-expire' && e.statusId === FAERIE_FIRE_STATUS_ID)).toBe(true);
    expect(hasStatus(char, FAERIE_FIRE_STATUS_ID)).toBe(false);
  });

  it('被诅咒时累积步长减半（R004：10% 起步，每回合 +5%）', () => {
    const char = withFaerieFire();
    char.statuses.push({ id: 'curse', turns: 4 });
    const rng = new SeededRNG(4); // 首掷失败（同上）
    const events = tickStatuses(char, rng);
    expect(events.some((e) => e.type === 'status-expire' && e.statusId === FAERIE_FIRE_STATUS_ID)).toBe(false);
    const ff = char.statuses.find((s) => s.id === FAERIE_FIRE_STATUS_ID)!;
    expect(ff.recoveryChance).toBe(15); // R004：10% 起步 + 诅咒下 5% 步长（共用概率，诅咒实例同值）
    expect(char.statuses.find((s) => s.id === 'curse')!.recoveryChance).toBe(15);
  });
});

describe('妖火状态的施加与免疫', () => {
  it('applyStatus 正常施加（宝石/技能入口共用）', () => {
    const char = makeChar(1);
    const events = applyStatus(char, { id: FAERIE_FIRE_STATUS_ID, turns: 3 });
    expect(events).toMatchObject([{ type: 'status-apply', statusId: 'faerie-fire', turns: 3 }]);
    expect(hasStatus(char, FAERIE_FIRE_STATUS_ID)).toBe(true);
  });

  it('免疫特质（statusImmunities）拦截施加', () => {
    const char = makeChar(1, { passive: { ...neutralPassives(), statusImmunities: [FAERIE_FIRE_STATUS_ID] } });
    const events = applyStatus(char, { id: FAERIE_FIRE_STATUS_ID, turns: 3 });
    expect(events).toHaveLength(0);
    expect(hasStatus(char, FAERIE_FIRE_STATUS_ID)).toBe(false);
  });

  it('重复施加取更长回合（max 合并）', () => {
    const char = makeChar(1);
    applyStatus(char, { id: FAERIE_FIRE_STATUS_ID, turns: 2 });
    applyStatus(char, { id: FAERIE_FIRE_STATUS_ID, turns: 5 });
    expect(char.statuses.find((s) => s.id === FAERIE_FIRE_STATUS_ID)?.turns).toBe(5);
  });

  it('放大倍率常量为 1.5（官方 +50%）', () => {
    expect(FAERIE_FIRE_SPELL_MULT).toBe(1.5);
  });
});
