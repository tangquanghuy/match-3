/**
 * 特质终扫批测试（2026-09-18 特质缺口最后一轮全量判读）。
 *
 * 判读口径：以 data/raw/gow-2026-09-18/traits.en.json 的官方 EN 描述 + RawData 逻辑字段
 * （TraitType/Activation/Filter/Modifier）逐条核对全部未实现 code，只有「现有机制字段
 * 可完整表达」的才落地；需新机制/新消费口的按批留弃。
 *
 * 结论（28 个 missTraits = 兵种侧全部缺口）：
 *   - 落地 2 code：daospuppet（身亡召唤刀）/ clanhunt（骷髅配色绿色光环）；
 *   - 留弃 26 code（分组原因见 DROPPED 常量注释）。
 * 其余 382 个非兵种 code：96 个为 meta 职业天赋动态注册（静态库落条会遮蔽动态定义），
 * 286 个无兵种载体（Delve/Boss/觉醒/新兵种内容），均不落地——由守护用例锁定。
 *
 * 护栏：落地条目只使用既有字段与既有消费点；留弃 code 必须保持引擎不可见。
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error - node:fs 运行时可用，仅类型声明缺失
import { readFileSync } from 'node:fs';
import {
  getTrait,
  resolvePassives,
  neutralPassives,
  attachPassives,
  applyDeathSummons,
  applyColorMatchTriggers,
  setSummonTemplateResolver,
  implementedTraitIds,
} from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem, skullGem } from '@engine/types';
import type { Character, Team } from '@engine/types';
import traitsJson from '../../src/data/traits.json';
import troopsJson from '../../src/data/troops.json';

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

function makeTeam(side: PlayerSide, chars: Character[]): Team {
  return { player: side, characters: chars };
}

// ============================================================
// 数据落地（终扫批 2 code）
// ============================================================

describe('数据落地（终扫批）', () => {
  it('daospuppet 恶道木偶：身亡时 25% 召唤刀（官方 RawData Filter=6993 即兵种 id）', () => {
    const t = getTrait('daospuppet');
    expect(t?.summonOnDeath).toEqual({
      chance: 0.25,
      troopId: 6993,
      referenceName: 'Dao',
      displayName: '刀',
    });
    // 编译进 passive（死亡召唤三字段经 resolvePassives 的既有编译路径）
    const p = resolvePassives(['daospuppet']);
    expect(p.summonOnDeath?.troopId).toBe(6993);
    expect(p.summonOnDeath?.chance).toBe(0.25);
  });

  it('clanhunt 族猎：盟友配对骷髅头时给予所有绿色盟友 2 点攻击力（skull 色键配色光环）', () => {
    const t = getTrait('clanhunt');
    expect(t?.onColorMatchTypeAura).toEqual({ color: 'skull', scope: 'Green', gains: { attack: 2 } });
    // 编译：'skull' 色键 → passive.colorMatchTypeAura（powerofstars/diamondaura 同表）
    const p = resolvePassives(['clanhunt']);
    expect(p.colorMatchTypeAura.skull.Green.attack).toBe(2);
    // 与中性被动有可观测差异（审计 B 关口径）
    expect(p).not.toEqual(neutralPassives());
  });

  it('落地条目只新增既有键：新条目的效果键全集 ⊆ 库中既有效果键', () => {
    const all = traitsJson as { code: string }[] & Record<string, unknown>[];
    const known = new Set<string>();
    for (const t of all) for (const k of Object.keys(t)) known.add(k);
    for (const code of ['daospuppet', 'clanhunt']) {
      const t = all.find((x) => x.code === code)!;
      for (const k of Object.keys(t)) expect(known.has(k), `${code}.${k} 引入了新键`).toBe(true);
    }
  });
});

// ============================================================
// 行为（纯函数层）
// ============================================================

describe('行为（终扫批）', () => {
  it('daospuppet：概率判定经注入 rng，命中时以刀（6993）模板入队', () => {
    setSummonTemplateResolver((spec) => ({
      name: spec.displayName,
      maxHp: 28, hp: 28, attack: 17, armor: 23, magic: 3,
      colors: [BaseColor.Red], manaCost: 26, mana: 0, skillId: 'none',
    }));
    const spec = getTrait('daospuppet')!.summonOnDeath!;
    const enqueued: { id: number; name?: string; troopId: number }[] = [];
    applyDeathSummons([{ spec, side: PlayerSide.Left }], {
      deadId: 9,
      nextCharId: () => 777,
      rng: { next: () => 0.1 }, // 0.1 < 0.25 → 通过
      enqueue: (summoned, troopId) => {
        enqueued.push({ id: summoned.id, name: summoned.name, troopId });
        return [];
      },
    });
    expect(enqueued).toEqual([{ id: 777, name: '刀', troopId: 6993 }]);

    // 0.9 >= 0.25 → 拒绝，不入队
    const missed = applyDeathSummons([{ spec, side: PlayerSide.Left }], {
      deadId: 9,
      nextCharId: () => 777,
      rng: { next: () => 0.9 },
      enqueue: () => [{ type: 'summon' } as never],
    });
    expect(missed).toEqual([]);
  });

  it('clanhunt：骷髅触发点给绿色盟友 +2 攻击，非绿色与持有者不变；其它色键不触发', () => {
    const holder = makeChar(0, { traitIds: ['clanhunt'] });
    const green = makeChar(1, { colors: [BaseColor.Green], attack: 7 });
    const red = makeChar(2, { colors: [BaseColor.Red], attack: 3 });
    attachPassives(holder); // passivesOf 读编译产物，纯函数层需先编译
    const team = [holder, green, red];

    applyColorMatchTriggers(team, 'skull', {});
    expect(green.attack).toBe(9); // 7 + 2
    expect(red.attack).toBe(3); // 非绿色不受光环
    expect(holder.attack).toBe(5); // 持有者自身非绿色

    // 非骷髅色键不触发
    const green2 = makeChar(1, { colors: [BaseColor.Green], attack: 7 });
    applyColorMatchTriggers([holder, green2], BaseColor.Blue, {});
    expect(green2.attack).toBe(7);
  });
});

// ============================================================
// 行为（TurnEngine 集成：真实骷髅配对结算触发 clanhunt）
// ============================================================

describe('TurnEngine 集成（clanhunt 骷髅结算点）', () => {
  /** 底行骷髅三连对局（与 traitWiringBatch 同款）：交换 (7,1)<->(6,1) 后三骷髅命中敌方队首 */
  function skullMatchBattle(leftChars: Character[], rightChars: Character[], seed = 11) {
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    board.set({ row: 7, col: 0 }, { id: 70, type: skullGem() });
    board.set({ row: 7, col: 2 }, { id: 72, type: skullGem() });
    board.set({ row: 7, col: 1 }, { id: 71, type: colorGem(BaseColor.Green) });
    board.set({ row: 6, col: 1 }, { id: 61, type: skullGem() });
    const rng = new SeededRNG(seed);
    const idGen = (() => { let n = 800; return () => ++n; })();
    const state = createGameState(board, makeTeam(PlayerSide.Left, leftChars), makeTeam(PlayerSide.Right, rightChars));
    return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state };
  }

  it('骷髅配对结算后绿色盟友恰好 +2 攻击（无特质对照不涨）', () => {
    const withTrait = skullMatchBattle(
      [makeChar(0, { traitIds: ['clanhunt'] }), makeChar(1, { colors: [BaseColor.Green], attack: 7 }), makeChar(2, { colors: [BaseColor.Red], attack: 3 })],
      [makeChar(4, { hp: 200 })],
    );
    withTrait.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const left = withTrait.state.teams[PlayerSide.Left].characters;
    expect(left[1].attack).toBe(9); // 绿色盟友 7 + 2
    expect(left[2].attack).toBe(3); // 非绿色不变

    const control = skullMatchBattle(
      [makeChar(0), makeChar(1, { colors: [BaseColor.Green], attack: 7 }), makeChar(2, { colors: [BaseColor.Red], attack: 3 })],
      [makeChar(4, { hp: 200 })],
    );
    control.engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const plain = control.state.teams[PlayerSide.Left].characters;
    expect(plain[1].attack).toBe(7); // 无 clanhunt：骷髅结算不给绿色盟友加攻
    expect(plain[2].attack).toBe(3);
  });
});

// ============================================================
// 终扫判定守护（留弃清单 + 全覆盖对账 + meta 不遮蔽）
// ============================================================

/**
 * 留弃 26 code（官方 EN + RawData 逐条核对后的「需新机制」分组）：
 *   - 缺吞噬机制（3）：voracious / consumefuel / bloodyfeast（consume 原语未建模，
 *     devourImmunity 仅为数据字段）；
 *   - 缺爆破原语变体（7）：unstablepossession（大连×随机色）/ cataclysm（骷髅命中触发）/
 *     hiddentrap（配色触发×随机色）/ trappedtomb·onelittlespark·angelicburst（回合开始）/
 *     goodomen（大连×特殊宝石）——引擎爆破口仅支持「大连×指定基础色」
 *     （onBigMatchExplodeGem → TurnEngine.explodeGemsOfColor）；
 *   - 缺回合开始敌方削减/窃取钩子（3）：aspectoffamine / aspectofdeath / monkeymagic；
 *   - 缺额外回合触发钩子（2）：bigteeth / essenceoftime；
 *   - 风暴契约单色，混合/特殊风暴无映射（3）：elementalaura（元素风暴全色）/
 *     umbralaura（临界风暴映射拿不准）/ songofmadness（疯狂风暴=蓝+紫，battleStartStorm
 *     只收单色、猜单色会错）；
 *   - 缺施法响应伤害口（2）：serpentsfang / artillerysupport（RawData adjust_enemy_life
 *     与既有施法敌减 reduce 语义有差，且审计关卡限定 stat∈{magic,random}）；
 *   - 缺战斗开始宝石转换钩子（2）：wintercourtsboon / summercourtsboon；
 *   - 缺召唤响应钩子（2）：callnature（盟友召唤→风暴）/ summoningritual（盟友召唤→魔法）；
 *   - 缺大连素色宝石创造（1）：lunarscales（create_gem_3 紫色**素**宝石；大连创造口仅特殊宝石）。
 */
const DROPPED = [
  'angelicburst', 'artillerysupport', 'aspectofdeath', 'aspectoffamine', 'bigteeth',
  'bloodyfeast', 'callnature', 'cataclysm', 'clairvoyance', 'consumefuel',
  'elementalaura', 'essenceoftime', 'goodomen', 'hiddentrap', 'lunarscales',
  'monkeymagic', 'onelittlespark', 'serpentsfang', 'songofmadness', 'summercourtsboon',
  'summoningritual', 'trappedtomb', 'umbralaura', 'unstablepossession', 'voracious',
  'wintercourtsboon',
] as const;

describe('终扫判定守护', () => {
  it('留弃 26 code 保持引擎不可见（getTrait 返回 undefined）', () => {
    for (const code of DROPPED) {
      expect(getTrait(code), `${code} 应保持未实现`).toBeUndefined();
    }
  });

  it('兵种侧全覆盖：troops.json 引用的特质 code = 已实现 ∪ 留弃（无未判读残留）', () => {
    const official = new Set<string>(
      (troopsJson as { traits?: { code: string }[] }[]).flatMap((t) => (t.traits ?? []).map((x) => x.code)),
    );
    const implemented = new Set(implementedTraitIds());
    const uncovered = [...official].filter((c) => !implemented.has(c) && !DROPPED.includes(c as never));
    expect(uncovered, `未判读残留: ${uncovered.join(',')}`).toEqual([]);
    // 留弃清单与官方差集精确一致（防清单腐化：多列/漏列都报）
    expect([...official].filter((c) => !implemented.has(c)).sort()).toEqual([...DROPPED].sort());
  });

  it('meta 职业天赋动态特质不进静态库（防静态条目遮蔽 registerDynamicTraits 定义）', () => {
    const src = readFileSync(new URL('../../src/meta/data/talentDefs.ts', import.meta.url), 'utf8');
    const metaCodes = [...src.matchAll(/code:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
    expect(metaCodes.length).toBeGreaterThan(90);
    const implemented = new Set(implementedTraitIds());
    const shadowed = [...new Set(metaCodes)].filter((c) => implemented.has(c));
    expect(shadowed, `静态库遮蔽 meta 天赋: ${shadowed.join(',')}`).toEqual([]);
  });
});
