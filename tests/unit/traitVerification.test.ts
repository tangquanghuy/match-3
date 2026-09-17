/**
 * 核对报告修正批回归（2026-09）：
 *   - 引擎接线：regen.stat 分路由（aspectofwar 攻击增益不再静默变回血）、gainOnDamaged 法力
 *   - 触发点修正：virtue 家族（配骷髅/敌亡/盟友亡/盟友施法/承伤）、darkness 全体敌减
 *   - 概率语义：maladycurse 独立双掷
 *   - 状态语义：妖火 faerie-fire ≠ 燃烧 burning（flamingmane 双子句不再被去重）
 *   - 漏子句：lethaltoxin 织网×3、darkfury magic、sacrifice 全技能
 *   - 收编批代表：lifetide/dontblink/zornsfury/kinofchaos/死亡召唤名修复
 */
import { describe, it, expect } from 'vitest';
import { SeededRNG } from '@engine/rng';
import {
  resolvePassives, neutralPassives, getTrait, attachPassives,
  applyTurnStartPassives, applyBigMatchTriggers, applyColorMatchTriggers,
  applyDeathTriggers, applyCastTriggers, applyEnemyDeathTriggers,
} from '@engine/traits';
import { applyStatus } from '@engine/skills/effects/status';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character } from '@engine/types';
import type { GameEvent } from '@engine/events';

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
    troopTypes: [],
    ...over,
  } as Character;
}

const statusCtx = { applyStatus: (char: Character, s: Parameters<typeof applyStatus>[1]) => applyStatus(char, s) };

describe('引擎接线 · regen 按 stat 字段路由', () => {
  it('aspectofwar：每回合开始获得 3 点攻击力（修正前被静默结算成回 3 点生命）', () => {
    const p = resolvePassives(['aspectofwar']);
    expect(p.regenAttackPerTurn).toBe(3);
    expect(p.regenPerTurn).toBe(0);
    const char = makeChar(0, { traitIds: ['aspectofwar'] });
    attachPassives(char);
    const events = applyTurnStartPassives([char]);
    expect(char.attack).toBe(8);
    expect(char.hp).toBe(50);
    expect(events.some((e) => e.type === 'buff' && e.stat === 'attack' && e.amount === 3)).toBe(true);
  });

  it('hp/armor regen 路由不变（trollregeneration/reinforced）', () => {
    const p = resolvePassives(['trollregeneration', 'reinforced']);
    expect(p.regenPerTurn).toBe(3);
    expect(p.regenArmorPerTurn).toBe(1);
    expect(p.regenAttackPerTurn).toBe(0);
    expect(p.regenMagicPerTurn).toBe(0);
  });

  it('织网下魔法回合增益被拦截（grantStat 官方口径）', () => {
    const char = makeChar(0);
    char.passive = { ...neutralPassives(), regenMagicPerTurn: 2 };
    char.statuses.push({ id: 'web', turns: 2 });
    const events = applyTurnStartPassives([char]);
    expect(char.magic).toBe(8);
    expect(events.some((e) => e.stat === 'magic')).toBe(false);
  });
});

describe('触发点修正 · virtue 家族', () => {
  it('virtueofcourage：配骷髅头时全队攻+2 命+2（不再是开局光环）', () => {
    const holder = makeChar(0, { traitIds: ['virtueofcourage'] });
    attachPassives(holder);
    const mate = makeChar(1);
    const events = applyColorMatchTriggers([holder, mate], 'skull', {});
    expect(holder.attack).toBe(7);
    expect(mate.attack).toBe(7);
    expect(mate.maxHp).toBe(52);
    expect(events.filter((e) => e.type === 'buff')).toHaveLength(4); // 攻+命 × 2 人
  });

  it('virtueofjustice：敌亡触发全队攻+3 甲+3（applyEnemyDeathTriggers）', () => {
    const holder = makeChar(0, { traitIds: ['virtueofjustice'] });
    attachPassives(holder);
    const mate = makeChar(1);
    const dead = makeChar(9, { defeated: true });
    applyEnemyDeathTriggers([holder, mate], [dead]);
    expect(holder.attack).toBe(8);
    expect(holder.armor).toBe(3);
    expect(mate.attack).toBe(8);
    expect(mate.armor).toBe(3);
  });

  it('virtueofsacrifice：盟友亡触发全队攻+2 魔+2（onAllyDeathTypeAura）', () => {
    const holder = makeChar(0, { traitIds: ['virtueofsacrifice'] });
    attachPassives(holder);
    const mate = makeChar(1);
    const dead = makeChar(9, { defeated: true });
    applyDeathTriggers([dead, holder, mate], [makeChar(5)]);
    expect(holder.attack).toBe(7);
    expect(holder.magic).toBe(10);
    expect(mate.attack).toBe(7);
    expect(mate.magic).toBe(10);
  });

  it('virtueofloyalty：盟友施法触发全队甲+3 命+3（onAllyCastTypeAura）', () => {
    const holder = makeChar(0, { traitIds: ['virtueofloyalty'] });
    attachPassives(holder);
    const mate = makeChar(1);
    applyCastTriggers([holder, mate], [makeChar(5)]);
    expect(holder.armor).toBe(3);
    expect(holder.maxHp).toBe(53);
    expect(mate.armor).toBe(3);
    expect(mate.maxHp).toBe(53);
  });

  it('virtueofhumility：自身承伤触发全队甲+2 魔+2（onDamagedTypeAura，CombatResolver 接线）', async () => {
    const { CombatResolver } = await import('@engine/CombatResolver');
    const holder = makeChar(0, { traitIds: ['virtueofhumility'] });
    attachPassives(holder);
    const mate = makeChar(1);
    const foe = makeChar(5, { attack: 10 });
    const own = { player: PlayerSide.Left, characters: [holder, mate] };
    const enemy = { player: PlayerSide.Right, characters: [foe] };
    const outcome = new CombatResolver().resolveSkullDamage(enemy, own, 3, new SeededRNG(1));
    expect(outcome.events.some((e) => e.type === 'skull-damage')).toBe(true);
    expect(holder.armor).toBe(2);
    expect(holder.magic).toBe(10);
    expect(mate.armor).toBe(2);
    expect(mate.magic).toBe(10);
  });
});

describe('darkness · 大连全体敌减（allEnemies scope）', () => {
  it('4/5 连时所有敌人攻 -4（确定性、零随机消耗）', () => {
    const holder = makeChar(0, { traitIds: ['darkness'] });
    attachPassives(holder);
    const foes = [makeChar(5, { attack: 10 }), makeChar(6, { attack: 3 })];
    const events = applyBigMatchTriggers([holder], { size: 4, enemyTeam: foes });
    expect(foes[0].attack).toBe(6);
    expect(foes[1].attack).toBe(0); // 夹零
    expect(events.filter((e) => e.type === 'buff' && e.amount === -4)).toHaveLength(1);
    expect(events.filter((e) => e.type === 'buff' && e.amount === -3)).toHaveLength(1);
  });

  it('lossofsanity：所有敌人魔 -3（收编批）', () => {
    const holder = makeChar(0, { traitIds: ['lossofsanity'] });
    attachPassives(holder);
    const foes = [makeChar(5, { magic: 9 }), makeChar(6, { magic: 2 })];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], {
      size: 5,
      enemyTeam: foes,
      rng: { next: () => (calls.push(1), 0.5) },
    });
    expect(foes[0].magic).toBe(6);
    expect(foes[1].magic).toBe(0);
    expect(calls).toHaveLength(0); // allEnemies 确定性：零随机消耗
  });
});

describe('maladycurse · 独立双 25% 掷', () => {
  const spec = getTrait('maladycurse')?.onBigMatchStatus;
  it('数据带 independentChance', () => {
    expect(spec?.chance).toBe(0.25);
    expect(spec?.independentChance).toBe(true);
    expect(spec?.statuses.map((s) => s.id)).toEqual(['curse', 'death-mark']);
  });

  it('首掷<0.25 且次掷<0.25：两条都上；否则各中各的', () => {
    const drive = (seq: number[]) => {
      const holder = makeChar(0, { traitIds: ['maladycurse'] });
      attachPassives(holder);
      const foe = makeChar(5);
      let i = 0;
      applyBigMatchTriggers([holder], {
        size: 4,
        enemyTeam: [foe],
        rng: { next: () => seq[i++ % seq.length] },
        ...statusCtx,
      });
      return {
        curse: foe.statuses.some((s) => s.id === 'curse'),
        deathMark: foe.statuses.some((s) => s.id === 'death-mark'),
      };
    };
    // 掷序：先掷目标（1 名敌人也耗一次），再按 statuses 序逐条掷独立 25%
    expect(drive([0.1, 0.1])).toEqual({ curse: true, deathMark: true });
    expect(drive([0.1, 0.9])).toEqual({ curse: false, deathMark: true });
    expect(drive([0.9, 0.1])).toEqual({ curse: true, deathMark: false });
    expect(drive([0.9, 0.9])).toEqual({ curse: false, deathMark: false });
  });
});

describe('妖火拆分 · faerie-fire ≠ burning', () => {
  it('flamingmane：燃烧+妖火双子句都在（修正前被 Set 去重丢一条）', () => {
    expect(getTrait('flamingmane')?.onBigMatchStatus?.statuses).toEqual([
      { id: 'burning', magnitude: 1 }, { id: 'faerie-fire' },
    ]);
  });

  it('fireproof：免疫燃烧和妖火两条', () => {
    expect(getTrait('fireproof')?.statusImmunities).toEqual(['burning', 'faerie-fire']);
  });

  it('motherswrath（收编）：大连对全体敌人施加妖火', () => {
    const holder = makeChar(0, { traitIds: ['motherswrath'] });
    attachPassives(holder);
    const foes = [makeChar(5), makeChar(6)];
    applyBigMatchTriggers([holder], { size: 4, enemyTeam: foes, ...statusCtx });
    expect(foes.every((f) => f.statuses.some((s) => s.id === 'faerie-fire'))).toBe(true);
    expect(foes.every((f) => !f.statuses.some((s) => s.id === 'burning'))).toBe(true);
  });
});

describe('漏子句补齐', () => {
  it('lethaltoxin：中毒与织网各 ×3（skullMultVsStatusList 编译进同一张表）', () => {
    const p = resolvePassives(['lethaltoxin']);
    expect(p.skullMultVsStatus.poison).toBe(3);
    expect(p.skullMultVsStatus.web).toBe(3);
  });

  it('darkfury：受击获得攻 8 + 魔 8（alsoStats 展开）', () => {
    const p = resolvePassives(['darkfury']);
    expect(p.gainOnDamaged.attack).toBe(8);
    expect(p.gainOnDamaged.magic).toBe(8);
  });

  it('sacrifice：敌亡全技能 +3 = 四项各 3（修正前只落 magic 一项）', () => {
    const p = resolvePassives(['sacrifice']);
    expect(p.gainOnEnemyDeath).toEqual({ hp: 3, armor: 3, attack: 3, magic: 3, mana: 0 });
  });
});

describe('收编批行为抽查', () => {
  it('zornsfury：受击获得 4 点法力（按法力上限夹取）', async () => {
    const { CombatResolver } = await import('@engine/CombatResolver');
    const target = makeChar(0, { traitIds: ['zornsfury'] });
    attachPassives(target);
    const foe = makeChar(5, { attack: 10 });
    const own = { player: PlayerSide.Left, characters: [target] };
    const enemy = { player: PlayerSide.Right, characters: [foe] };
    new CombatResolver().resolveSkullDamage(enemy, own, 3, new SeededRNG(1));
    expect(target.mana).toBe(4);
    // 夹取：受 6 次攻击只拿到 manaCost=20
    for (let i = 0; i < 5; i++) new CombatResolver().resolveSkullDamage(enemy, own, 3, new SeededRNG(1));
    expect(target.mana).toBe(20);
  });

  it('dontblink：45% 闪避骷髅伤害（收编）', () => {
    expect(resolvePassives(['dontblink']).dodgeChance).toBe(0.45);
  });

  it('angrybear：配对棕色宝石时自身狂怒（scope self，零随机消耗）', () => {
    const holder = makeChar(0, { traitIds: ['angrybear'] });
    attachPassives(holder);
    const calls: number[] = [];
    applyColorMatchTriggers([holder], BaseColor.Brown, {
      rng: { next: () => (calls.push(1), 0.9) },
      enemyTeam: [makeChar(5)],
      ...statusCtx,
    });
    expect(holder.statuses.some((s) => s.id === 'rage')).toBe(true);
    expect(calls).toHaveLength(0); // self 目标确定性
  });

  it('kinofchaos：回合开始 40% 把 2 颗骷髅头转化为超级末日骷髅头（(宝石)? 去重 bug 修复后收编）', () => {
    expect(getTrait('kinofchaos')?.turnStartColorToSpecial).toEqual({
      color: 'skull', gem: 'uberDoomSkull', count: 2, chance: 0.4,
    });
    expect(getTrait('daemonsmark')?.turnStartColorToSpecial).toEqual({
      color: 'skull', gem: 'doomSkull', count: 2,
    });
  });

  it('死亡召唤名修复：displayName 用兵种库实名（herdspirit 半人马侦察兵→人马斥候）', () => {
    expect(getTrait('herdspirit')?.summonOnDeath).toMatchObject({
      chance: 0.25, troopId: 6016, referenceName: 'CentaurScout', displayName: '人马斥候',
    });
    expect(getTrait('wolfcompanion')?.summonOnDeath).toMatchObject({
      chance: 0.25, troopId: 7819, referenceName: 'Warfang', displayName: '沃方',
    });
  });

  it('lifetide（收编）：配蓝色宝石 → 所有海族盟友生命 +5', () => {
    const holder = makeChar(0, { traitIds: ['lifetide'], troopTypes: ['Merfolk'] });
    const mate = makeChar(1, { troopTypes: ['Merfolk'] });
    const outsider = makeChar(2, { troopTypes: ['Beast'] });
    attachPassives(holder);
    const events = applyColorMatchTriggers([holder, mate, outsider], BaseColor.Blue, {});
    expect(mate.maxHp).toBe(55);
    expect(outsider.maxHp).toBe(50);
    expect(events.filter((e) => e.type === 'buff' && e.amount === 5)).toHaveLength(2);
  });

  it('bountifulgrowth（收编）：4+ 连 → 所有绿色盟友生命 +4（bigMatchTypeAura 支持颜色 scope）', () => {
    const holder = makeChar(0, { traitIds: ['bountifulgrowth'], colors: [BaseColor.Green] });
    const green = makeChar(1, { colors: [BaseColor.Green] });
    const red = makeChar(2, { colors: [BaseColor.Red] });
    attachPassives(holder);
    applyBigMatchTriggers([holder, green, red], { size: 4 });
    expect(green.maxHp).toBe(54);
    expect(red.maxHp).toBe(50);
    expect(holder.maxHp).toBe(54);
  });

  it('vast（收编）：4+ 连自身攻/命/甲各 +2（onBigMatchGain alsoStats）', () => {
    const char = makeChar(0, { traitIds: ['vast'] });
    attachPassives(char);
    applyBigMatchTriggers([char], { size: 4 });
    expect(char.attack).toBe(7);
    expect(char.maxHp).toBe(52);
    expect(char.armor).toBe(2);
  });

  it('eternaldoom（收编）：配对时召唤末日风暴（dropKind doomSkull）', () => {
    expect(getTrait('eternaldoom')?.onBigMatchStorm).toMatchObject({
      color: 'Purple', turns: 8, troopId: 9008, referenceName: 'Doomstorm', dropKind: 'doomSkull',
    });
  });

  it('reflectivesurface / raging（收编）：受击获得反射/狂怒', () => {
    expect(getTrait('reflectivesurface')?.onDamagedStatus).toEqual({ statusId: 'reflect', turns: 3 });
    expect(getTrait('raging')?.onDamagedStatus).toEqual({ statusId: 'rage', turns: 3 });
  });
});

describe('护栏 · 无新键特质零事件零 rng 消耗不破坏', () => {
  it('无新键阵容在 applyBigMatchTriggers 下零事件（damage/drain 未注入）', () => {
    const holder = makeChar(0, { traitIds: ['big'] });
    attachPassives(holder);
    const foes = [makeChar(5)];
    const events: GameEvent[] = applyBigMatchTriggers([holder], { size: 5, enemyTeam: foes });
    expect(events.filter((e) => e.type !== 'buff')).toHaveLength(0);
  });

  it('旧敌减特质（suppression front）行为不变', () => {
    expect(getTrait('suppression')?.onBigMatchEnemyDrain).toEqual({ stat: 'magic', amount: 1, scope: 'front' });
  });

  it('旧死亡召唤（daemonicpact，兵种名直解）行为不变', () => {
    const spec = getTrait('daemonicpact')?.summonOnDeath;
    expect(spec).toBeDefined();
    expect(spec!.chance).toBeGreaterThan(0);
  });
});
