/**
 * 放弃桶回收原语单元测试（2026-09-17 用户裁定批）：献祭 / 随机状态 / 兵种转化 / 藏宝图 / 特定兵种在场。
 * 与 spellPrimitives.test.ts 同一套纯原语 harness（种子化 rng、无 DOM）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { EffectContext } from '@engine/skills/effects/context';
import { executePrototype } from '@engine/skills/prototypes';
import { skill, sacrifice, inflictRandom, transformTroop, gainMaps, dmg, dmgAll } from '@engine/skills/builders';

let gid = 0;
function g(type: GemType): { id: number; type: GemType } {
  return { id: gid++, type };
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false, ...over,
  };
}

function setup(s: { left?: Partial<Character>[]; right?: Partial<Character>[]; seed?: number } = {}): { ctx: EffectContext; state: ReturnType<typeof createGameState> } {
  gid = 0;
  const board = new BoardModel();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, g(colorGem(BaseColor.Red)));
  }
  const left: Team = { player: PlayerSide.Left, characters: (s.left ?? [{}]).map((o, i) => makeChar(i, o)) };
  const right: Team = { player: PlayerSide.Right, characters: (s.right ?? [{}, {}, {}]).map((o, i) => makeChar(i + 4, o)) };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = {
    state,
    casterId: state.teams[PlayerSide.Left].characters[0].id,
    rng: new SeededRNG(s.seed ?? 7),
    nextGemId: () => 900000 + gid++,
  };
  return { ctx, state };
}

describe('回收原语五件套（2026-09-17）', () => {
  it('献祭：即杀己方随机盟友（defeat 事件）+ 属性快照入跨段追踪', () => {
    const { ctx, state } = setup({ left: [{}, { attack: 13, name: '祭品' }] });
    // 裁定：献祭 = 随机**其他**盟友（不含施法者，官方手感）
    const events = executePrototype(skill(sacrifice('allyOthers')), ctx);
    // 纯原语层：executePrototype 内部的 resolveDefeatEvents 会发 defeat 事件并把阵亡者移出编队
    const hit = events.find((e: GameEvent) => e.type === 'skill-damage') as { damage: number };
    expect(hit).toBeDefined();
    expect(hit.damage).toBe(50); // execute=trueDamage → 伤害额 = 目标当前血量
    expect(events.some((e: GameEvent) => e.type === 'defeat')).toBe(true);
    expect(state.teams[PlayerSide.Left].characters.some((c) => c.id === 1)).toBe(false); // 已移出编队
    expect(ctx.castTracking?.sacrificed).toMatchObject({ attack: 13, armor: 0 });
  });

  it('随机状态：每目标独立施加池内负面状态（确定性）', () => {
    const build = () => skill(inflictRandom('enemyAll'), dmgAll(1));
    const a = setup({ seed: 11 });
    const b = setup({ seed: 11 });
    const ea = executePrototype(build(), a.ctx);
    const eb = executePrototype(build(), b.ctx);
    expect(eb).toEqual(ea);
    const applied = ea.filter((e) => e.type === 'status-apply');
    expect(applied.length).toBe(3);
    for (const e of applied) {
      expect(['poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'death-mark', 'charm']).toContain((e as { statusId: string }).statusId);
    }
  });

  it('兵种转化：目标就地替换（保留 id/不触发阵亡），数值取模板、法力清零', () => {
    const { ctx, state } = setup({ right: [{ name: '哥布林', hp: 7 }] });
    // 用一个已知存在兵种的引用（哥布林族 Gobtrample 之类）；这里按 referenceName 查真实兵种
    const ctx2 = { ...ctx, resolveSummonRef: (ref: string) => ref === 'TestOgre'
      ? { name: '巨魔', maxHp: 66, hp: 66, attack: 9, armor: 3, magic: 1, colors: [BaseColor.Brown], manaCost: 6, mana: 0, skillId: 'none' }
      : null } as typeof ctx;
    const events = executePrototype(skill(transformTroop('enemyFront', 'TestOgre')), ctx2);
    expect(events).toEqual([{ type: 'troop-transform', sourceSide: PlayerSide.Left, targetId: 4, name: '巨魔' }]);
    const target = state.teams[PlayerSide.Right].characters[0];
    expect(target.defeated).toBe(false); // 转化不是死亡
    expect(target.id).toBe(4); // 保留 id/编队位
    expect(target.name).toBe('巨魔');
    expect(target.maxHp).toBe(66);
    expect(target.hp).toBe(66);
    expect(target.mana).toBe(0);
  });

  it('藏宝图：gainMaps 入战场经济池 + battleMaps 来源计数驱动二次缩放', () => {
    const { ctx } = setup({});
    executePrototype(skill(gainMaps(1, 0, { chance: 1 }), gainMaps(1, 0, { chance: 1 })), ctx);
    expect(ctx.state.economy.maps).toBe(2);
    // 「每收集到一张藏宝图，额外创造 4 颗 [x4]」：来源计数 2 → 加成 8（同一技能内先得图后结算）
    const events = executePrototype(
      skill(gainMaps(1, 0), gainMaps(1, 0), dmg('enemyFront', 1, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'battleMaps' } } })),
      setup({}) .ctx, // 全新战场：池里只有本技能得到的 2 张图
    );
    expect(events.filter((e) => e.type === 'economy-gain').length).toBe(2);
  });

  it('特定兵种在场：按中文名匹配存活者（ally/enemy 两侧）', () => {
    const { ctx } = setup({ left: [{ name: '普通兵' }, { name: '梁帝' }], right: [{ name: '梁帝' }] });
    const ally = executePrototype(skill(dmg('enemyFront', 1, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '梁帝' } })), ctx);
    expect(ally.length).toBeGreaterThan(0);
    const none = executePrototype(skill(dmg('enemyFront', 1, 0, { ifCond: { kind: 'troopPresent', side: 'ally', name: '不存在' } })), ctx);
    expect(none).toEqual([]);
    const enemy = executePrototype(skill(dmg('enemyFront', 1, 0, { ifCond: { kind: 'troopPresent', side: 'enemy', name: '梁帝' } })), ctx);
    expect(enemy.length).toBeGreaterThan(0);
  });
});


describe('藏宝图技能单场上限', () => {
  it('重复施法最多两张，事件报告实际增量，后续伤害照常执行', () => {
    const { ctx, state } = setup();
    expect(executePrototype(skill(gainMaps(1)), ctx)).toMatchObject([{ type: 'economy-gain', amount: 1 }]);
    expect(executePrototype(skill(gainMaps(2)), ctx)).toMatchObject([{ type: 'economy-gain', amount: 1 }]);
    const events = executePrototype(skill(gainMaps(2), dmg('enemyFront', 3)), ctx);
    expect(events.some(e => e.type === 'economy-gain')).toBe(false);
    expect(events.some(e => e.type === 'skill-damage')).toBe(true);
    expect(state.economy.maps).toBe(2);
    expect(setup().state.economy.maps).toBe(0);
  });
});


it('map-scaled damage uses the two actually collected maps after repeated casts', () => {
  const { ctx } = setup();
  executePrototype(skill(gainMaps(2)), ctx);
  const events = executePrototype(skill(gainMaps(2), dmg('enemyFront', 1, 0, {
    modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'battleMaps' } },
  })), ctx);
  expect(events.filter(e => e.type === 'economy-gain')).toHaveLength(0);
  expect(events.find(e => e.type === 'skill-damage')).toMatchObject({ damage: 9 });
});
