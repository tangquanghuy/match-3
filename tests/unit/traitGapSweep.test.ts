/**
 * 缺口清扫批测试（203 缺口 code 全量核对后的落地批，105 code）：
 *   1. 种族开局法力（allyStartMana，17 code：orclord/hauntedcrown 族「All X Allies start
 *      with N% Mana」）——applyBattleStartTraits 直读定义；
 *   2. 开局范围光环（battleStartTypeAura，7 code：iceaura 族六色 + soaring 族亲）；
 *   3. 束带计数光环（perAllyTrait，5 code：bandinglife 族，官方 Filter=traitbanding）；
 *   4. 回合开始范围光环（turnStartTypeAura，17 code：queensgrace/nightsong/blessingofanu 族）
 *      ——applyTurnStartPassives 直读定义，仅行动方结算；
 *   5. 施法显式状态（onAllyCastStatus/onEnemyCastStatus，5 code：moonfestival/magehunter 族）
 *      + 施法敌方削减（onAllyCastEnemyDrain，psychicaffliction/succumb）；
 *   6. 复活满法力（summonOnDeath.fullMana，immortal/deepsoul/rebirth 族 11 code）；
 *   7. 配色/大连伤害扩 scope（spiny/spiky 全体骷髅伤害、attackfrombelow 末位大连伤害）+
 *      配色状态 randomAlly/独立概率（enchantinggaze/brambleheart）；
 *   8. 惰性建模护栏（defender PVP / turnStartStorm / turnStartSummon / 经济三字段——
 *      编译进 passive 数据完整，标准战斗零事件零随机消耗）。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives, neutralPassives, getTrait, attachPassives,
  applyBattleStartTraits, applyTurnStartPassives,
  applyCastRandomStatusTriggers, applyColorMatchTriggers,
  applyBigMatchTriggers, applyDeathSummons, setSummonTemplateResolver,
} from '@engine/traits';
import { PlayerSide, BaseColor } from '@engine/types';
import type { Character, StatusInstance } from '@engine/types';
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
    ...over,
  };
}

/** 概率判定的记录型 rng：先返回预设值，之后恒返回 1（保证不会二次命中） */
function rngOf(values: number[], calls: number[] = []): { next(): number } {
  return { next: () => { const v = values.length > 0 ? values.shift()! : 1; calls.push(v); return v; } };
}

function recorder(log: [number, string, number][]) {
  return (char: Character, status: StatusInstance): GameEvent[] => {
    log.push([char.id, status.id, status.turns]);
    return [{ type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns } as GameEvent];
  };
}

const poolOf = (scope: 'randomAlly' | 'randomEnemy') =>
  scope === 'randomAlly' ? ['barrier', 'rage'] : ['poison', 'curse'];

// ============================================================
// 数据落地（生成器产物）
// ============================================================

describe('数据落地（缺口清扫批）', () => {
  it('种族开局法力 17 code 全部落地（radiantaura 40% 其余 50%，种族映射正确）', () => {
    const codes = ['orclord', 'lordofbeasts', 'wildmana', 'stoneloyalty', 'radiantaura', 'inspirehope',
      'drownedcrew', 'shipscaptain', 'griffoncommander', 'hauntedcrown', 'mazemaster', 'dragonseer',
      'northernclans', 'elvenkin', 'lordofsummer', 'seaofhope', 'cattauriroar'];
    for (const code of codes) {
      const s = getTrait(code)?.allyStartMana;
      expect(s, code).toBeDefined();
      expect(s!.ratio, code).toBe(code === 'radiantaura' ? 0.4 : 0.5);
    }
    expect(getTrait('hauntedcrown')?.allyStartMana).toEqual({ troopType: 'Undead', ratio: 0.5 });
    expect(getTrait('cattauriroar')?.allyStartMana).toEqual({ troopType: 'Centaur', ratio: 0.5 });
  });

  it('开局/回合开始范围光环、束带计数、施法状态、复活族关键条目', () => {
    expect(getTrait('iceaura')?.battleStartTypeAura).toEqual({ scope: 'Blue', gains: { hp: 5, armor: 5, attack: 5, magic: 5 } });
    expect(getTrait('soaring')?.battleStartTypeAura).toEqual({ scope: 'Stryx', gains: { hp: 5, attack: 5 } });
    expect(getTrait('queensgrace')?.turnStartTypeAura).toEqual({ scope: 'Daemon', gains: { attack: 2, hp: 2 } });
    expect(getTrait('blessingofanu')?.turnStartTypeAura?.gains).toEqual({ hp: 1, armor: 1, attack: 1, magic: 1 });
    expect(getTrait('bandinglife')?.perAllyTrait).toEqual({ trait: 'banding', gains: { hp: 2 } });
    expect(getTrait('truebanding')?.perAllyTrait?.gains).toEqual({ hp: 1, armor: 1, attack: 1, magic: 1 });
    expect(getTrait('moonfestival')?.onAllyCastStatus).toEqual({ scope: 'randomAlly', statuses: [{ id: 'enchanted' }], turns: 3, chance: 0.3 });
    expect(getTrait('magehunter')?.onEnemyCastStatus).toEqual({ scope: 'self', statuses: [{ id: 'rage' }], turns: 3 });
    expect(getTrait('psychicbacklash')?.onEnemyCastStatus).toEqual({ scope: 'randomEnemy', statuses: [{ id: 'stun' }], turns: 3 });
    expect(getTrait('psychicaffliction')?.onAllyCastEnemyDrain).toEqual({ stat: 'magic', amount: 1, scope: 'allEnemies' });
    expect(getTrait('succumb')?.onAllyCastEnemyDrain).toEqual({ stat: 'random', amount: 4, scope: 'allEnemies' });
    expect(getTrait('spiny')?.onColorMatchDamage).toEqual({ color: 'skull', amount: 1, scope: 'allEnemies' });
    expect(getTrait('attackfrombelow')?.onBigMatchDamage).toEqual({ amount: 8, scope: 'lastEnemy' });
    expect(getTrait('wildhorns')?.regen).toEqual({ stat: 'attack', amount: 2, alsoStats: ['hp', 'armor'] });
  });

  it('复活族 11 code：自身模板/官方变身物 + fullMana 标记（immortal 官方不带 mana）', () => {
    expect(getTrait('immortal')?.summonOnDeath).toMatchObject({ chance: 0.25, referenceName: 'InfernalKing' });
    expect(getTrait('immortal')?.summonOnDeath?.fullMana).toBeUndefined();
    expect(getTrait('deepsoul')?.summonOnDeath).toMatchObject({ chance: 0.15, referenceName: 'Krakynos', fullMana: true });
    expect(getTrait('rebirth')?.summonOnDeath).toMatchObject({ chance: 0.5, referenceName: 'BabyDragon', fullMana: true });
    expect(getTrait('hiddennest')?.summonOnDeath).toMatchObject({ chance: 0.5, referenceName: 'FellDragonEgg', fullMana: true });
    for (const code of ['cursedsoul', 'bloodysoul', 'eldritchsoul', 'deadlysoul', 'ancientsoul', 'infernalsoul', 'eternaldawn']) {
      expect(getTrait(code)?.summonOnDeath?.fullMana, code).toBe(true);
      expect(getTrait(code)?.summonOnDeath?.chance, code).toBe(code === 'eternaldawn' ? 0.2 : 0.15);
    }
  });
});

// ============================================================
// 种族开局法力 + 开局范围光环 + 束带计数（applyBattleStartTraits）
// ============================================================

describe('开局族（allyStartMana / battleStartTypeAura / perAllyTrait）', () => {
  it('hauntedcrown：不死族盟友开局补到 50% 法力（只补不扣、重复触发不叠加）', () => {
    const holder = makeChar(0, { traitIds: ['hauntedcrown'], troopTypes: ['Undead'] });
    const undead = makeChar(1, { manaCost: 20, mana: 4, troopTypes: ['Undead'] });
    const other = makeChar(2, { manaCost: 20, mana: 0, troopTypes: ['Beast'] });
    const events = applyBattleStartTraits([holder, undead, other], []);
    expect(undead.mana).toBe(10);
    expect(other.mana).toBe(0);
    expect(events.filter((e) => e.targetId === 1)).toEqual([{ type: 'buff', targetId: 1, stat: 'mana', amount: 6 }]);
  });

  it('iceaura：蓝色盟友开局全部状态 +5（scopeMatches 认颜色、含持有者）', () => {
    const holder = makeChar(0, { traitIds: ['iceaura'], colors: [BaseColor.Blue] });
    const blue = makeChar(1, { colors: [BaseColor.Blue] });
    const red = makeChar(2, { colors: [BaseColor.Red] });
    applyBattleStartTraits([holder, blue, red], []);
    expect(blue.attack).toBe(10);
    expect(blue.magic).toBe(13);
    expect(red.attack).toBe(5);
  });

  it('bandinglife：数同队带束带特质的盟友（含自己），各自吃各自的计数光环', () => {
    const a = makeChar(0, { traitIds: ['bandinglife', 'bandingarmor'], troopTypes: ['Beast'] });
    const b = makeChar(1, { traitIds: ['truebanding'], troopTypes: ['Beast'] });
    const plain = makeChar(2, { troopTypes: ['Beast'] });
    applyBattleStartTraits([a, b, plain], []);
    // 束带持有者 2 人（a、b）：a 的 bandinglife 生命 2×2、bandingarmor 护甲 2×2
    expect(a.hp).toBe(54);
    expect(a.armor).toBe(4);
    // b 的 truebanding 四项各 1×2（含自己的生命 +2）
    expect(b.hp).toBe(52);
    expect(b.armor).toBe(2);
    expect(b.attack).toBe(7);
    expect(b.magic).toBe(10);
    // plain 无束带特质，不吃
    expect(plain.hp).toBe(50);
  });

  it('护栏：无新键的队伍零事件（开局族不改变既有行为）', () => {
    const team = [makeChar(0, { manaCost: 20 }), makeChar(1)];
    expect(applyBattleStartTraits(team, [])).toEqual([]);
  });
});

// ============================================================
// 回合开始范围光环（applyTurnStartPassives）
// ============================================================

describe('回合开始范围光环（turnStartTypeAura）', () => {
  it('feralinspiration：己方行动回合开始，野兽盟友攻击/魔法各 +1（每回合叠加）', () => {
    const holder = makeChar(0, { traitIds: ['feralinspiration'], troopTypes: ['Beast'] });
    const beast = makeChar(1, { troopTypes: ['Beast'] });
    const other = makeChar(2, { troopTypes: ['Dragon'] });
    const first = applyTurnStartPassives([holder, beast, other]);
    expect(beast.attack).toBe(6);
    expect(beast.magic).toBe(9);
    expect(other.attack).toBe(5);
    expect(first.filter((e) => e.targetId === 1)).toEqual([
      { type: 'buff', targetId: 1, stat: 'hp', amount: 0 },
      { type: 'buff', targetId: 1, stat: 'armor', amount: 0 },
      { type: 'buff', targetId: 1, stat: 'attack', amount: 1 },
      { type: 'buff', targetId: 1, stat: 'magic', amount: 1 },
    ].filter((e: { amount: number }) => e.amount !== 0));
    // 第二回合再叠一次
    applyTurnStartPassives([holder, beast, other]);
    expect(beast.attack).toBe(7);
  });

  it('nightsong：紫色是颜色 scope（scopeMatches 认 colors）；仅行动方队伍结算', () => {
    const holder = makeChar(0, { traitIds: ['nightsong'], colors: [BaseColor.Purple] });
    const purple = makeChar(1, { colors: [BaseColor.Purple] });
    applyTurnStartPassives([holder, purple]);
    expect(purple.hp).toBe(52);
    expect(purple.magic).toBe(10);
  });
});

// ============================================================
// 施法显式状态 + 施法敌方削减（applyCastRandomStatusTriggers）
// ============================================================

describe('施法显式状态 / 敌方削减', () => {
  it('moonfestival：盟友施法 → 30% 给随机盟友附魔（概率+目标各耗一次 rng）', () => {
    const holder = makeChar(0, { traitIds: ['moonfestival'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    // 概率 0.2 < 0.3 命中；目标 floor(0.9*2)=1
    applyCastRandomStatusTriggers([holder, makeChar(1)], [makeChar(4)], {
      rng: rngOf([0.2, 0.9], calls), applyStatus: recorder(log), poolOf,
    });
    expect(log).toEqual([[1, 'enchanted', 3]]);
    expect(calls).toEqual([0.2, 0.9]);
  });

  it('moonfestival：概率未中（≥0.3）不施加、只耗概率一条', () => {
    const holder = makeChar(0, { traitIds: ['moonfestival'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    applyCastRandomStatusTriggers([holder], [makeChar(4)], {
      rng: rngOf([0.3], calls), applyStatus: recorder(log), poolOf,
    });
    expect(log).toEqual([]);
    expect(calls).toEqual([0.3]);
  });

  it('magehunter：敌方施法 → 持有者自身狂怒（确定性目标、零随机消耗）', () => {
    const holder = makeChar(0, { traitIds: ['magehunter'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    applyCastRandomStatusTriggers([makeChar(3)], [holder], {
      rng: rngOf([], calls), applyStatus: recorder(log), poolOf,
    });
    expect(log).toEqual([[0, 'rage', 3]]);
    expect(calls).toEqual([]);
  });

  it('psychicbacklash：敌方施法 → 击晕一名随机敌人', () => {
    const holder = makeChar(0, { traitIds: ['psychicbacklash'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    applyCastRandomStatusTriggers([makeChar(3), makeChar(4)], [holder], {
      rng: rngOf([0.7], calls), applyStatus: recorder(log), poolOf,
    });
    // 目标 floor(0.7*2)=1 → C4
    expect(log).toEqual([[4, 'stun', 3]]);
    expect(calls).toEqual([0.7]);
  });

  it('hemlock：盟友施法 → 随机敌人诅咒+疾病（多状态逐条施加）', () => {
    const holder = makeChar(0, { traitIds: ['hemlock'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    applyCastRandomStatusTriggers([holder], [makeChar(4)], {
      rng: rngOf([0.5]), applyStatus: recorder(log), poolOf,
    });
    expect(log).toEqual([[4, 'curse', 3], [4, 'disease', 3]]);
  });

  it('psychicaffliction：盟友施法 → 所有敌人魔法 -1（reduce 语义、零随机消耗）', () => {
    const holder = makeChar(0, { traitIds: ['psychicaffliction'] });
    attachPassives(holder);
    const calls: number[] = [];
    const events = applyCastRandomStatusTriggers([holder], [makeChar(4, { magic: 3 }), makeChar(5, { magic: 1 })], {
      rng: rngOf([], calls), applyStatus: recorder([]), poolOf,
    });
    expect(events).toEqual([
      { type: 'buff', targetId: 4, stat: 'magic', amount: -1 },
      { type: 'buff', targetId: 5, stat: 'magic', amount: -1 },
    ]);
    expect(calls).toEqual([]);
  });

  it('succumb：随机技能值 -4（stat random 经 rng 掷属性，属性可被打到 0）', () => {
    const holder = makeChar(0, { traitIds: ['succumb'] });
    attachPassives(holder);
    const foe = makeChar(4, { magic: 2, attack: 5, armor: 5 });
    const events = applyCastRandomStatusTriggers([holder], [foe], {
      rng: rngOf([0.99]), applyStatus: recorder([]), poolOf,
    });
    // floor(0.99*4)=3 → magic；夹零只减 2
    expect(events).toEqual([{ type: 'buff', targetId: 4, stat: 'magic', amount: -2 }]);
    expect(foe.magic).toBe(0);
  });

  it('护栏：无新键特质零事件零随机消耗；惰性字段不产生战斗事件', () => {
    const plain = makeChar(0);
    attachPassives(plain);
    const calls: number[] = [];
    const log: [number, string, number][] = [];
    applyCastRandomStatusTriggers([plain], [makeChar(4)], {
      rng: rngOf([], calls), applyStatus: recorder(log), poolOf,
    });
    expect(log).toEqual([]);
    expect(calls).toEqual([]);
    // 惰性族编译进 passive 但没有触发钩子：中性对照
    const lazy = resolvePassives(['defender', 'goldenhoard', 'soulgatherer', 'soulverdict', 'pickpocket', 'snowstorm', 'harpyflock']);
    const neutral = neutralPassives();
    expect(lazy).not.toEqual(neutral); // 编译有差异（审计 B 关）
    expect(lazy.pvpMode).toBe(true);
    expect(lazy.turnStartEconomyGains).toEqual({ gold: 5, souls: 4, gems: 0 });
    expect(lazy.allyCastEconomyGains).toEqual({ gold: 0, souls: 3, gems: 0 });
    expect(lazy.damagedEconomyGains).toEqual({ gold: 10, souls: 0, gems: 0 });
    expect(lazy.turnStartStorm?.referenceName).toBe('Icestorm');
    expect(lazy.turnStartSummon?.referenceName).toBe('Harpy');
  });
});

// ============================================================
// 复活满法力（applyDeathSummons fullMana）
// ============================================================

describe('复活满法力（fullMana）', () => {
  it('deepsoul：15% 复活自身模板且满法力入场；概率未中不入队', () => {
    setSummonTemplateResolver(() => ({
      name: 'Krakynos', manaCost: 20, mana: 0, maxHp: 50, hp: 50, attack: 5, armor: 5, magic: 8,
      colors: [BaseColor.Purple], skillId: 'none', troopTypes: ['Druid'],
    } as unknown as Character));
    const spec = getTrait('deepsoul')!.summonOnDeath!;
    // 必中的 rng（0 < 0.15）
    const enqueued: { id: number; mana: number }[] = [];
    applyDeathSummons([{ spec, side: PlayerSide.Left }], {
      nextCharId: (() => { let n = 100; return () => n++; })(),
      rng: rngOf([0]),
      enqueue: (c) => { enqueued.push({ id: c.id, mana: c.mana }); return []; },
    });
    expect(enqueued).toEqual([{ id: 100, mana: 20 }]); // fullMana → mana 补到 manaCost
    // 对照：不带 fullMana 的召唤按模板原值入场
    const plainSpec = { ...spec, fullMana: undefined };
    const enqueuedPlain: number[] = [];
    applyDeathSummons([{ spec: plainSpec, side: PlayerSide.Left }], {
      nextCharId: () => 200,
      rng: rngOf([0]),
      enqueue: (c) => { enqueuedPlain.push(c.mana); return []; },
    });
    expect(enqueuedPlain).toEqual([0]);
    // 概率不中的路径：恒 1 ≥ 0.15
    const enqueued2: number[] = [];
    applyDeathSummons([{ spec, side: PlayerSide.Left }], {
      nextCharId: () => 300,
      rng: rngOf([1]),
      enqueue: (c) => { enqueued2.push(c.id); return []; },
    });
    expect(enqueued2).toEqual([]);
  });
});

// ============================================================
// 配色/大连伤害扩 scope（spiny 全体骷髅伤害 / attackfrombelow 末位）
// ============================================================

describe('伤害 scope 扩展（allEnemies / lastEnemy）', () => {
  it('spiny：配对骷髅时对所有敌人各造成 1 点伤害（确定性、零随机消耗）', () => {
    const holder = makeChar(0, { traitIds: ['spiny'] });
    attachPassives(holder);
    const damaged: [number, number][] = [];
    const calls: number[] = [];
    applyColorMatchTriggers([holder], 'skull', {
      enemyTeam: [makeChar(4, { magic: 3 }), makeChar(5, { magic: 3 })],
      rng: rngOf([], calls),
      damage: (foe, _caster, amount) => { damaged.push([foe.id, amount]); return []; },
    });
    expect(damaged).toEqual([[4, 1], [5, 1]]);
    expect(calls).toEqual([]);
  });

  it('attackfrombelow：4+ 连时对末位敌人造成 8 点伤害（确定性、零随机消耗）', () => {
    const holder = makeChar(0, { traitIds: ['attackfrombelow'] });
    attachPassives(holder);
    const damaged: [number, number][] = [];
    const calls: number[] = [];
    applyBigMatchTriggers([holder], {
      size: 4,
      enemyTeam: [makeChar(4), makeChar(5)],
      rng: rngOf([], calls),
      damage: (foe, _caster, amount) => { damaged.push([foe.id, amount]); return []; },
    });
    expect(damaged).toEqual([[5, 8]]);
    expect(calls).toEqual([]);
  });

  it('enchantinggaze：匹配紫色 → 随机盟友附魔（randomAlly scope）', () => {
    const holder = makeChar(0, { traitIds: ['enchantinggaze'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    applyColorMatchTriggers([holder, makeChar(1)], BaseColor.Purple, {
      rng: rngOf([0.2]),
      applyStatus: recorder(log),
    });
    expect(log).toEqual([[0, 'enchanted', 3]]); // floor(0.2*2)=0 → 持有者自己
  });

  it('brambleheart：独立 50% 概率纠缠或流血（各掷各的，可只中一条）', () => {
    const holder = makeChar(0, { traitIds: ['brambleheart'] });
    attachPassives(holder);
    const log: [number, string, number][] = [];
    const calls: number[] = [];
    // 目标 0.9；纠缠概率 0.2（<0.5 中）、流血概率 0.9（≥0.5 不中）
    applyColorMatchTriggers([holder], BaseColor.Green, {
      enemyTeam: [makeChar(4)],
      rng: rngOf([0.9, 0.2, 0.9], calls),
      applyStatus: recorder(log),
    });
    expect(log).toEqual([[4, 'entangle', 3]]);
    expect(calls).toEqual([0.9, 0.2, 0.9]);
  });
});
