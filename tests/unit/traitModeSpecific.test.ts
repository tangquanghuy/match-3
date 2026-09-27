/**
 * 模式专属特质批测试（淘宝模式 / 晋升度 / 赏金语义，8 code）：
 *   - deepvitality/deepmagic/deepshield/deepstrength「在淘宝模式中获得 N 点X」→ onDelveGain
 *     （官方 RawData GameMode=delve_attacker，Delve 进层时按 stat 调整）；
 *   - bountyhunter「基于我已晋升的稀有度获得 2 到 6 倍的赏金点数」→ onDelveBounty
 *     （官方 Activation=end_battle_rewards / TraitType=bonus_bounty）；
 *   - pathfinder「在自身旅程活动中获得 2x/2.5x/3x 英里」→ onDelveMiles；
 *   - godslayer/siegebreaker「基于我已晋升的稀有度对魔头/高塔造成 3 到 5 倍伤害」
 *     → vsAscendedMultiplier（官方 Filter=boss/castle，魔头/高塔是模式构造不是兵种种族）。
 *
 * 建模裁定（用户目标：兵种完整度——每个兵种三特质齐备）：这是「模式专属」的正确建模
 * 而非假覆盖——字段编译进 PassiveModifiers（数据建模完整、审计对账通过、描述正确），
 * 但**标准战斗结算路径不消费（惰性）**。本套件两道核心断言：
 *   A. 字段存在：8 code 全部落地且数值与官方描述逐条对账，不 many 不少；
 *   B. 标准战斗零事件、零 rng 消耗：全量触发入口（大连/配色/回合开始/开局/施法/阵亡/
 *      敌亡/骷髅倍率）配全量回调注入仍零事件零掷骰；TurnEngine 同局面同种子下
 *      「带 8 特质」与「无特质」的事件流逐字节一致。
 */
import { describe, it, expect } from 'vitest';
import traitsJson from '../../src/data/traits.json';
import {
  resolvePassives, neutralPassives, getTrait, attachPassives,
  applyBigMatchTriggers, applyColorMatchTriggers,
  applyTurnStartPassives, applyBattleStartTraits,
  applyCastTriggers, applyDeathTriggers, applyEnemyDeathTriggers,
  skullDamageMultiplier,
} from '@engine/traits';
import type { TraitDefinition } from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { PlayerSide, BaseColor, colorGem } from '@engine/types';
import type { Character, Team, StatusInstance } from '@engine/types';
import type { GameEvent } from '@engine/events';

const ALL = traitsJson as (TraitDefinition & { troops: number })[];
const MODE_KEYS = ['onDelveGain', 'onDelveBounty', 'onDelveMiles', 'vsAscendedMultiplier'] as const;
const MODE_CODES = [
  'deepvitality', 'deepmagic', 'deepshield', 'deepstrength',
  'bountyhunter', 'pathfinder', 'godslayer', 'siegebreaker',
] as const;

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

/** 计数型 rng：记录每次 next 的返回值（恒 0.5 = 概率命中、随机取首），只用于「零消耗」断言 */
function countingRng(calls: number[] = []): { next(): number } {
  return { next: () => { calls.push(0.5); return 0.5; } };
}

/** 全量回调注入的大连/配色触发环境：任何键被消费都会在事件/记录里现形 */
function fullCtx(calls: number[]) {
  return {
    size: 5,
    rng: countingRng(calls),
    enemyTeam: [makeChar(4), makeChar(5)] as readonly Character[],
    applyStatus: (char: Character, status: StatusInstance): GameEvent[] => [
      { type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns } as unknown as GameEvent,
    ],
    damage: (t: Character, _c: Character, amount: number): GameEvent[] => [
      { type: 'skill-damage', targetId: t.id, damage: amount } as unknown as GameEvent,
    ],
    drainLife: (t: Character, _h: Character, amount: number): GameEvent[] => [
      { type: 'skill-damage', targetId: t.id, damage: amount } as unknown as GameEvent,
    ],
    createGem: (): GameEvent[] => [{ type: 'gem-transform' } as unknown as GameEvent],
    summon: (): GameEvent[] => [{ type: 'summon' } as unknown as GameEvent],
    setStorm: (): GameEvent[] => [{ type: 'storm-change' } as unknown as GameEvent],
    kill: (t: Character): GameEvent[] => [{ type: 'defeat', characterId: t.id } as unknown as GameEvent],
    gainEconomy: (): GameEvent[] => [{ type: 'economy-gain' } as unknown as GameEvent],
  };
}

// ============================================================
// A. 字段存在 + 描述↔数值对账（官方中文 dump 文本重新抽数）
// ============================================================

describe('字段存在：8 code 全部落地、数值与官方描述逐条对账', () => {
  it('deep* 四族：onDelveGain 的 stat/amount 与「在淘宝模式中获得 N 点X」逐条一致', () => {
    const expectOf = {
      deepvitality: { stat: 'hp', amount: 9 },
      deepmagic: { stat: 'magic', amount: 5 },
      deepshield: { stat: 'armor', amount: 9 },
      deepstrength: { stat: 'attack', amount: 7 },
    } as const;
    for (const [code, want] of Object.entries(expectOf)) {
      const t = getTrait(code);
      expect(t, code).toBeDefined();
      // 描述重新抽数对账
      const m = /^在淘宝模式中获得\s*(\d+)\s*点(生命值|魔力值|护甲值|攻击力)。?$/.exec(t!.description);
      expect(m, `${code} 描述不是淘宝模式句式`).not.toBeNull();
      const wordOf: Record<string, string> = { 生命值: 'hp', 魔力值: 'magic', 护甲值: 'armor', 攻击力: 'attack' };
      expect(Number(m![1])).toBe(want.amount);
      expect(wordOf[m![2]]).toBe(want.stat);
      // 字段存在且一致
      expect(t!.onDelveGain).toEqual(want);
    }
  });

  it('bountyhunter：赏金倍率区间 [2,6] 与「2 到 6 倍的赏金点数」一致', () => {
    const t = getTrait('bountyhunter');
    const m = /^基于我已晋升的稀有度获得\s*(\d+)\s*到\s*(\d+)\s*倍的赏金点数。?$/.exec(t!.description);
    expect(m).not.toBeNull();
    expect(t!.onDelveBounty).toEqual({ min: Number(m![1]), max: Number(m![2]) });
    expect(t!.onDelveBounty).toEqual({ min: 2, max: 6 });
  });

  it('pathfinder：英里倍率表 [2, 2.5, 3] 与「2x/2.5x/3x 英里」逐位一致', () => {
    const t = getTrait('pathfinder');
    const m = /在自身旅程活动中获得\s*([\d.x/]+?)\s*英里，数量因自身晋升稀有度而定。?$/.exec(t!.description);
    expect(m).not.toBeNull();
    const want = m![1].split('/').map((s) => Number(s.replace(/x$/i, '')));
    expect(t!.onDelveMiles?.multipliers).toEqual(want);
    expect(t!.onDelveMiles?.multipliers).toEqual([2, 2.5, 3]);
  });

  it('godslayer/siegebreaker：晋升度倍率区间与「对魔头/高塔造成 3 到 5 倍伤害」一致', () => {
    const expectOf = { godslayer: 'boss', siegebreaker: 'tower' } as const;
    for (const [code, target] of Object.entries(expectOf)) {
      const t = getTrait(code);
      const word = target === 'boss' ? '魔头' : '高塔';
      const m = new RegExp(`^基于我已晋升的稀有度对(${word})造成\\s*(\\d+)\\s*到\\s*(\\d+)\\s*倍伤害。?$`).exec(t!.description);
      expect(m, `${code} 描述不是晋升度伤害句式`).not.toBeNull();
      expect(t!.vsAscendedMultiplier).toEqual({ target, min: Number(m![2]), max: Number(m![3]) });
      expect(t!.vsAscendedMultiplier).toEqual({ target, min: 3, max: 5 });
    }
  });

  it('防误收：traits.json 中带模式专属键的条目恰好是这 8 个 code，一个不多', () => {
    const holders = ALL.filter((t) => MODE_KEYS.some((k) => t[k] !== undefined)).map((t) => t.code);
    expect([...holders].sort()).toEqual([...MODE_CODES].sort());
  });

  it('出场覆盖：8 code 的 troops 计数与官方 dump 一致（合计 452 兵种位）', () => {
    const expectTroops: Record<string, number> = {
      deepvitality: 73, deepmagic: 57, deepshield: 48, deepstrength: 16,
      bountyhunter: 93, pathfinder: 35, godslayer: 69, siegebreaker: 61,
    };
    for (const [code, n] of Object.entries(expectTroops)) expect(getTrait(code)?.troops).toBe(n);
    expect(Object.values(expectTroops).reduce((s, x) => s + x, 0)).toBe(452);
  });
});

// ============================================================
// A2. 编译产物：PassiveModifiers 挂载正确（数据建模完整）
// ============================================================

describe('编译产物：模式专属字段编译进 PassiveModifiers', () => {
  it('deep* 多条并存按 stat 聚合累加；单条编译与定义一致', () => {
    expect(resolvePassives(['deepvitality']).onDelveGains).toEqual({ hp: 9 });
    expect(resolvePassives(['deepvitality', 'deepshield', 'deepmagic', 'deepstrength']).onDelveGains)
      .toEqual({ hp: 9, armor: 9, magic: 5, attack: 7 });
  });

  it('bountyhunter/pathfinder 编译原样挂载；vsAscended 按 target 并存（屠魔+攻城可同持）', () => {
    expect(resolvePassives(['bountyhunter']).onDelveBounty).toEqual({ min: 2, max: 6 });
    expect(resolvePassives(['pathfinder']).onDelveMiles).toEqual({ multipliers: [2, 2.5, 3] });
    expect(resolvePassives(['godslayer']).vsAscendedMultipliers).toEqual([{ target: 'boss', min: 3, max: 5 }]);
    expect(resolvePassives(['godslayer', 'siegebreaker']).vsAscendedMultipliers).toEqual([
      { target: 'boss', min: 3, max: 5 },
      { target: 'tower', min: 3, max: 5 },
    ]);
  });

  it('全 8 code 编译：passive 带全部模式专属字段且无任何标准战斗字段被意外点亮', () => {
    const p = resolvePassives([...MODE_CODES]);
    expect(p.onDelveGains).toEqual({ hp: 9, magic: 5, armor: 9, attack: 7 });
    expect(p.onDelveBounty).toEqual({ min: 2, max: 6 });
    expect(p.onDelveMiles).toEqual({ multipliers: [2, 2.5, 3] });
    expect(p.vsAscendedMultipliers).toEqual([{ target: 'boss', min: 3, max: 5 }, { target: 'tower', min: 3, max: 5 }]);
    // 标准战斗路径全部保持中性：屠戮表/减伤/免疫/触发增益零污染
    expect(p.skullMultVsTroopType).toEqual({});
    expect(p.skullMultVsStatus).toEqual({});
    expect(p.skullMultVsColor).toEqual({});
    expect(p.skullDamageTaken).toBe(1);
    expect(p.statusImmunities).toEqual([]);
    expect(JSON.stringify(p.gainOnBigMatch)).toBe(JSON.stringify(neutralPassives().gainOnBigMatch));
  });

  it('编译产物与中性被动有差异（审计 B 关卡）且编译为纯函数', () => {
    for (const code of MODE_CODES) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives([...MODE_CODES]))).toBe(JSON.stringify(resolvePassives([...MODE_CODES])));
  });

  it('attachPassives 后字段挂在 Character.passive 上（将来 Delve/晋升层可直接读）', () => {
    const char = makeChar(0, { traitIds: ['deepvitality', 'godslayer'] });
    attachPassives(char);
    expect(char.passive?.onDelveGains).toEqual({ hp: 9 });
    expect(char.passive?.vsAscendedMultipliers).toEqual([{ target: 'boss', min: 3, max: 5 }]);
  });
});

// ============================================================
// B. 标准战斗惰性：零事件、零 rng 消耗、屠戮倍率不泄漏
// ============================================================

describe('标准战斗惰性：全量触发入口零事件、零 rng 消耗', () => {
  const holder = () => makeChar(0, { traitIds: [...MODE_CODES] });

  it('大连触发（全回调注入）：零事件、rng 零调用', () => {
    const h = holder();
    attachPassives(h);
    const calls: number[] = [];
    expect(applyBigMatchTriggers([h], fullCtx(calls))).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('配色触发（全回调注入）：任意色零事件、rng 零调用', () => {
    const h = holder();
    attachPassives(h);
    for (const color of [BaseColor.Red, BaseColor.Blue, BaseColor.Brown, 'skull'] as const) {
      const calls: number[] = [];
      const ctx = fullCtx(calls);
      expect(applyColorMatchTriggers([h], color, ctx)).toEqual([]);
      expect(calls, `color=${color}`).toEqual([]);
    }
  });

  it('回合开始/战斗开始/施法/阵亡/敌亡触发：全部零事件', () => {
    const h = holder();
    attachPassives(h);
    const foe = makeChar(4, { traitIds: [...MODE_CODES] });
    attachPassives(foe);
    const allies = makeTeam(PlayerSide.Left, [h, makeChar(1)]);
    const enemies = makeTeam(PlayerSide.Right, [foe, makeChar(5)]);
    expect(applyTurnStartPassives([h, foe])).toEqual([]);
    expect(applyBattleStartTraits(allies.characters, enemies.characters)).toEqual([]);
    expect(applyCastTriggers(allies.characters, enemies.characters)).toEqual([]);
    expect(applyDeathTriggers(allies.characters, enemies.characters)).toEqual([]);
    expect(applyEnemyDeathTriggers(enemies.characters, allies.characters, {
      applyStatus: (char, status) => [{ type: 'status-apply', targetId: char.id, statusId: status.id } as unknown as GameEvent],
    })).toEqual([]);
  });

  it('晋升度倍率不泄漏：godslayer/siegebreaker 持有者对任意目标的骷髅倍率恒为 1', () => {
    const attacker = holder();
    attachPassives(attacker);
    const bossish = makeChar(4, { troopTypes: ['Divine', 'Boss'] });
    const towerish = makeChar(5, { troopTypes: ['Construct', 'Tower'] });
    expect(skullDamageMultiplier(attacker, bossish)).toBe(1);
    expect(skullDamageMultiplier(attacker, towerish)).toBe(1);
    // 对照：真正的屠戮族（skullMultVsTroopType）仍正常工作，证明上面的「恒为 1」不是空断言
    const slayer = makeChar(9, { traitIds: ['dragonslayer'] });
    attachPassives(slayer);
    expect(skullDamageMultiplier(slayer, makeChar(6, { troopTypes: ['Dragon'] }))).toBe(2);
  });

  it('无新键特质（对照组）：同一入口同样零事件（护栏双向成立）', () => {
    const plain = makeChar(0);
    attachPassives(plain);
    const calls: number[] = [];
    expect(applyBigMatchTriggers([plain], fullCtx(calls))).toEqual([]);
    expect(calls).toEqual([]);
  });
});

// ============================================================
// C. TurnEngine 集成：同局面同种子，带 8 特质与无特质逐字节一致
// ============================================================

/** 带 rng 调用计数的种子化随机源（TurnEngine 消费的真实类型） */
class CountingRNG extends SeededRNG {
  calls = 0;
  override next(): number {
    this.calls += 1;
    return super.next();
  }
}

/** 底行构造「交换 (7,2)<->(6,2) 后成 4 连红」的局面（复用 T5 杂项批的棋盘模式） */
function buildWith4Red(playerChars: Character[], enemyChars: Character[], seed = 5) {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
    }
  }
  for (let c = 0; c < 8; c++) {
    const isRedCol = c < 4 && c !== 2;
    board.set({ row: 7, col: c }, { id: 70 + c, type: colorGem(isRedCol ? BaseColor.Red : palette[c % 4]) });
  }
  board.set({ row: 6, col: 2 }, { id: 62, type: colorGem(BaseColor.Red) });
  const rng = new CountingRNG(seed);
  const idGen = (() => { let n = 700; return () => ++n; })();
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, playerChars),
    makeTeam(PlayerSide.Right, enemyChars),
  );
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), state, rng };
}

describe('TurnEngine 集成：模式专属特质对真实对局零影响', () => {
  it('带全 8 特质 vs 无特质：4 连红对局的事件流逐字节一致、rng 消耗一致', () => {
    const withTraits = buildWith4Red(
      [makeChar(0, { traitIds: [...MODE_CODES] }), makeChar(1, { traitIds: [...MODE_CODES] })],
      [makeChar(4, { traitIds: [...MODE_CODES] }), makeChar(5)],
    );
    const without = buildWith4Red([makeChar(0), makeChar(1)], [makeChar(4), makeChar(5)]);
    const eventsA = withTraits.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const eventsB = without.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(JSON.stringify(eventsA)).toBe(JSON.stringify(eventsB));
    expect(withTraits.rng.calls).toBe(without.rng.calls);
  });

  it('事件流里确实发生了真实战斗（法力/匹配/重力事件存在），零影响不是空对空', () => {
    const run = buildWith4Red([makeChar(0, { traitIds: [...MODE_CODES] })], [makeChar(4)]);
    const events = run.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'mana-gain' || e.type === 'elimination')).toBe(true);
    // 模式专属语义专属事件（赏金/英里/晋升伤害）绝不出现在标准战斗事件流
    const types = events.map((e) => (e as { type: string }).type);
    expect(types).not.toContain('bounty-gain');
    expect(types).not.toContain('miles-gain');
    expect(types).not.toContain('ascended-damage');
  });

  it('换多个种子仍然逐字节一致（排除种子巧合）', () => {
    for (const seed of [1, 42, 2026]) {
      const a = buildWith4Red([makeChar(0, { traitIds: [...MODE_CODES] }), makeChar(1)], [makeChar(4)], seed);
      const b = buildWith4Red([makeChar(0), makeChar(1)], [makeChar(4)], seed);
      const ea = a.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
      const eb = b.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
      expect(JSON.stringify(ea), `seed=${seed}`).toBe(JSON.stringify(eb));
      expect(a.rng.calls).toBe(b.rng.calls);
    }
  });
});
