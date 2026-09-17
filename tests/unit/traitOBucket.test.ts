/**
 * O 桶·需人工判读 高频批测试（artifacts/recycle/traits-rescue-plan.md「O」段出场 ≥5 的可落地子集）。
 *
 * 全部走既有机制，引擎零改动：
 *   - 屠戮条件扩展（DAMAGE_CONDITION_MAP = 基础表 + 特质可救批扩展表 + 下潜）：
 *     cursehunter/virulence/doom/focus/depthcharge → skullMultVsStatus
 *   - 骷髅匹配附状态（「配对骷髅头使敌人陷入X状态」句式）：feartouch → inflictOnSkullHit
 *   - 开局召唤风暴（复用死亡召唤的 STORM_MAP）：songofnature/songofstone/songofdoom → battleStartStorm
 * 另含既有 code 零扰动回归（老屠戮 code 与既有 5 个 songof* 输出不变）。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives,
  attachPassives,
  passivesOf,
  getTrait,
  skullDamageMultiplier,
  collectBattleStartStorms,
} from '@engine/traits';
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

describe('屠戮条件扩展（cursehunter/virulence/doom/focus/depthcharge，21 次出场）', () => {
  it('数据形态：条件状态按官方描述映射到 skullMultVsStatus', () => {
    expect(getTrait('cursehunter')?.skullMultVsStatus).toEqual({ status: 'curse', mult: 2 });
    expect(getTrait('virulence')?.skullMultVsStatus).toEqual({ status: 'disease', mult: 2 });
    expect(getTrait('doom')?.skullMultVsStatus).toEqual({ status: 'death-mark', mult: 2 });
    expect(getTrait('focus')?.skullMultVsStatus).toEqual({ status: 'marked', mult: 2 });
    expect(getTrait('depthcharge')?.skullMultVsStatus).toEqual({ status: 'submerged', mult: 2 });
  });

  it('结算：只对带对应状态的目标翻倍；异状态与无状态目标为 1（同类取最强口径）', () => {
    const hunter = makeChar(0, { traitIds: ['cursehunter'] });
    attachPassives(hunter);
    const cursed = makeChar(1, { statuses: [{ id: 'curse', turns: 2 }] });
    const clean = makeChar(2);
    const burning = makeChar(3, { statuses: [{ id: 'burning', turns: 2 }] });
    expect(skullDamageMultiplier(hunter, cursed)).toBe(2);
    expect(skullDamageMultiplier(hunter, clean)).toBe(1);
    expect(skullDamageMultiplier(hunter, burning)).toBe(1);
  });

  it('基线零扰动：扩展前已落地的屠戮 code 输出逐字段不变', () => {
    expect(getTrait('pyromania')?.skullMultVsStatus).toEqual({ status: 'burning', mult: 2 });
    expect(getTrait('shatter')?.skullMultVsStatus).toEqual({ status: 'frozen', mult: 2 });
    expect(getTrait('clobber')?.skullMultVsStatus).toEqual({ status: 'stun', mult: 2 });
    expect(getTrait('stalker')?.skullMultVsStatus).toEqual({ status: 'web', mult: 2 });
    expect(getTrait('icycloak')?.skullMultVsStatus).toEqual({ status: 'frozen', mult: 3 });
    expect(getTrait('bloodsucking')?.skullMultVsWounded).toBe(2);
  });
});

describe('骷髅匹配附状态（feartouch，5 次出场）', () => {
  it('数据形态：inflictOnSkullHit = terror（非 DoT，不带 magnitude）', () => {
    expect(getTrait('feartouch')?.inflictOnSkullHit).toEqual({ id: 'terror', turns: 3 });
  });

  it('战斗接入：持有者造成骷髅伤害时目标陷入恐怖', () => {
    const attacker = makeChar(0, { attack: 10, traitIds: ['feartouch'] });
    attachPassives(attacker);
    const victim = makeChar(1);
    const outcome = new CombatResolver().resolveSkullDamage(
      team(PlayerSide.Left, [attacker]),
      team(PlayerSide.Right, [victim]),
      3,
      new SeededRNG(1),
    );
    expect(victim.statuses.some((s) => s.id === 'terror')).toBe(true);
    expect(outcome.events.some((e) => e.type === 'status-apply')).toBe(true);
  });

  it('无骷髅命中的持有者不变（数据键只在命中路径消费）', () => {
    const plain = makeChar(0);
    attachPassives(plain);
    expect(passivesOf(plain).inflictOnSkullHit).toBeUndefined();
  });
});

describe('开局风暴（songofnature/songofstone/songofdoom，14 次出场）', () => {
  it('数据形态：颜色/虚拟号段/dropKind 复用死亡召唤的 STORM_MAP', () => {
    expect(getTrait('songofnature')?.battleStartStorm).toEqual({
      color: 'Green',
      turns: 8,
      troopId: 9005,
      referenceName: 'Leafstorm',
      displayName: '叶风暴',
    });
    expect(getTrait('songofstone')?.battleStartStorm).toEqual({
      color: 'Brown',
      turns: 8,
      troopId: 9006,
      referenceName: 'Duststorm',
      displayName: '尘风暴',
    });
    expect(getTrait('songofdoom')?.battleStartStorm).toEqual({
      color: 'Purple',
      turns: 8,
      troopId: 9008,
      referenceName: 'Doomstorm',
      displayName: '末日风暴',
      dropKind: 'doomSkull',
    });
  });

  it('收集：同一持有者的多条开局风暴按声明序产出 spec', () => {
    const holder = makeChar(0, { traitIds: ['songofnature', 'songofstone'] });
    const specs = collectBattleStartStorms([holder], PlayerSide.Left);
    expect(specs.map((s) => s.spec.referenceName)).toEqual(['Leafstorm', 'Duststorm']);
    expect(specs.every((s) => s.side === PlayerSide.Left && s.spec.chance === 1)).toBe(true);
  });

  it('既有 5 个 songof* 显式映射零扰动（displayName 保持官方英文名）', () => {
    expect(getTrait('songoflight')?.battleStartStorm).toMatchObject({ troopId: 9004, displayName: 'Lightstorm' });
    expect(getTrait('songofdarkness')?.battleStartStorm).toMatchObject({ troopId: 9001, displayName: 'Darkstorm' });
    expect(getTrait('songofbones')?.battleStartStorm).toMatchObject({ troopId: 9007, dropKind: 'skull' });
    expect(getTrait('songoffire')?.battleStartStorm).toMatchObject({ troopId: 9002, displayName: 'Firestorm' });
    expect(getTrait('songofice')?.battleStartStorm).toMatchObject({ troopId: 9003, displayName: 'Icestorm' });
  });
});

describe('护栏', () => {
  it('无新键特质编译后不携带本批字段（零事件零 rng 消耗的数据前提）', () => {
    const p = resolvePassives(['aegis', 'agile']);
    expect(p.skullMultVsStatus).toEqual({});
    expect(p.inflictOnSkullHit).toBeUndefined();
    expect(p.onBigMatchStatus).toBeUndefined();
  });

  it('开局召唤非风暴物（parliamentarycall）：缺口清扫批落 turnStartSummon 惰性字段', () => {
    // 历史裁定「留未实现桶」已按缺口清扫批修订：回合开始召唤为惰性数据建模
    //（官方 RawData summon / Filter=6026 实锤枭熊），回合钩子落地前零事件零消耗
    const t = getTrait('parliamentarycall');
    expect(t?.turnStartSummon).toEqual({
      chance: 0.1, troopId: 6026, referenceName: 'Owlbear', displayName: '枭熊',
    });
    expect(resolvePassives(['parliamentarycall']).turnStartSummon).toEqual({
      chance: 0.1, troopId: 6026, referenceName: 'Owlbear', displayName: '枭熊',
    });
  });
});
