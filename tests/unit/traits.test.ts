import { describe, it, expect } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { ManaDistributor } from '@engine/ManaDistributor';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { BoardGenerator } from '@engine/boardGen';
import { BoardModel } from '@engine/BoardModel';
import { ExtensionRegistry } from '@engine/registry';
import { MatchResolver } from '@engine/MatchResolver';
import { SeededRNG } from '@engine/rng';
import { applyStatus, hasStatus } from '@engine/skills/effects/status';
import { damageEffect } from '@engine/skills/effects/damage';
import {
  ALL_STATUSES,
  TRAIT_LIBRARY,
  applyTurnStartPassives,
  attachPassives,
  getTrait,
  implementedTraitIds,
  isImmuneToStatus,
  passivesOf,
  resolvePassives,
} from '@engine/traits';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
const g = (type: GemType): Gem => ({ id: gid++, type });

/** 数盘面上某色宝石数量 */
function countColor(board: BoardModel, color: BaseColor): number {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gem = board.get({ row: r, col: c });
      if (gem?.type.kind === 'color' && gem.type.color === color) n += 1;
    }
  }
  return n;
}

/** 数盘面上骷髅数量 */
function countSkulls(board: BoardModel): number {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board.get({ row: r, col: c })?.type.kind === 'skull') n += 1;
    }
  }
  return n;
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 10, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: 'none',
    statuses: [], defeated: false, ...over,
  };
}

/** 建一对队伍并按特质编译被动（模拟 TurnEngine 构造时的那一步）。 */
function duel(attackerTraits: string[], targetTraits: string[], over: Partial<Character> = {}) {
  const attacker = makeChar(0, { attack: 10, traitIds: attackerTraits });
  const target = makeChar(4, { hp: 50, armor: 0, traitIds: targetTraits, ...over });
  attachPassives(attacker);
  attachPassives(target);
  const left: Team = { player: PlayerSide.Left, characters: [attacker] };
  const right: Team = { player: PlayerSide.Right, characters: [target] };
  return { attacker, target, left, right, combat: new CombatResolver() };
}

describe('特质库 · 数据自洽', () => {
  it('code 唯一，且都能按 code 取回', () => {
    const codes = TRAIT_LIBRARY.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(getTrait(code)?.code).toBe(code);
    expect(implementedTraitIds()).toEqual(codes);
  });

  it('减伤比例都在 0～1 之间，名称与描述非空', () => {
    for (const t of TRAIT_LIBRARY) {
      for (const r of [t.skullDamageReduction, t.spellDamageReduction, t.battleStartManaRatio]) {
        if (r !== undefined) {
          expect(r).toBeGreaterThan(0);
          expect(r).toBeLessThanOrEqual(1);
        }
      }
      expect(t.name.trim()).not.toBe('');
      expect(t.description.trim()).not.toBe('');
    }
  });
});

describe('被动编译 · resolvePassives', () => {
  it('无特质得到中性修正', () => {
    const p = resolvePassives([]);
    expect(p).toMatchObject({
      skullDamageTaken: 1, spellDamageTaken: 1, regenPerTurn: 0, regenArmorPerTurn: 0,
    });
    expect(p.gainOnDamaged).toEqual({ hp: 0, armor: 0, attack: 0, magic: 0, mana: 0 });
    expect(p.statusImmunities).toEqual([]);
    expect(p.manaLink).toEqual({});
  });

  it('未知 code 安全忽略', () => {
    expect(resolvePassives(['not-a-real-trait']).skullDamageTaken).toBe(1);
  });

  it('同类减伤取最强，不连乘', () => {
    // 铁壁铜墙 50% + 全副武装 25%：取 50%，而非 1-(0.5*0.75)=62.5%
    const p = resolvePassives(['armored', 'stoneskin']);
    expect(p.skullDamageTaken).toBeCloseTo(0.5, 5);
  });

  it('免疫取并集，通配符覆盖一切', () => {
    // fireproof 官方「Immunity to Burning and Faerie Fire」：妖火是独立状态（修正前只免 burning）
    expect([...resolvePassives(['fireproof', 'insulated']).statusImmunities].sort())
      .toEqual(['burning', 'faerie-fire', 'frozen']);
    expect(resolvePassives(['impervious']).statusImmunities).toContain(ALL_STATUSES);
  });

  it('再生与狂暴同类累加', () => {
    const p = resolvePassives(['regeneration', 'regeneration', 'frenzy']);
    expect(p.regenPerTurn).toBe(2);
    expect(p.gainOnDamaged.attack).toBe(1);
  });

  it('护甲再生与生命再生分开累计', () => {
    const p = resolvePassives(['regeneration', 'reinforced']);
    expect(p.regenPerTurn).toBe(1);
    expect(p.regenArmorPerTurn).toBe(1);
  });

  it('法力灵链按色累计，彩虹灵链对所有色生效', () => {
    const link = resolvePassives(['waterlink']);
    expect(link.manaLink).toMatchObject({ Blue: 1 });
    expect(resolvePassives(['rainbowlink']).manaLink).toMatchObject({ '*': 1 });
  });
});

describe('骷髅减伤特质', () => {
  it('全副武装把 10 点骷髅伤害减到 8', () => {
    const { target, left, right, combat } = duel([], ['armored']);
    combat.resolveSkullDamage(left, right, 3);
    expect(target.hp).toBe(42); // 50 - round(10*0.75)
  });

  it('铁壁铜墙减半', () => {
    const { target, left, right, combat } = duel([], ['stoneskin']);
    combat.resolveSkullDamage(left, right, 3);
    expect(target.hp).toBe(45);
  });

  it('无特质不减免，且骷髅数不影响伤害', () => {
    const three = duel([], []);
    three.combat.resolveSkullDamage(three.left, three.right, 3);
    const five = duel([], []);
    five.combat.resolveSkullDamage(five.left, five.right, 5);
    expect(three.target.hp).toBe(40);
    expect(five.target.hp).toBe(40);
  });

  it('减伤后先扣护甲再扣血', () => {
    const { target, left, right, combat } = duel([], ['stoneskin'], { armor: 3 });
    combat.resolveSkullDamage(left, right, 3);
    expect(target.armor).toBe(0);
    expect(target.hp).toBe(48); // 伤害 5：护甲吃 3，血扣 2
  });
});

describe('法术减伤特质', () => {
  it('法术铠甲把技能伤害减 25%', () => {
    const caster = makeChar(0, { magic: 10 });
    const plain = makeChar(4, { hp: 50 });
    const armored = makeChar(5, { hp: 50, traitIds: ['spellarmor'] });
    attachPassives(plain);
    attachPassives(armored);
    const state = createGameState(
      new BoardGenerator(new SeededRNG(1), () => 1, 0).generate(),
      { player: PlayerSide.Left, characters: [caster] },
      { player: PlayerSide.Right, characters: [plain, armored] },
    );
    const ctx = { state, casterId: 0, rng: new SeededRNG(1), nextGemId: () => 1 };

    // targets 直接给角色数组（原语层接口），range 标注为群体
    damageEffect({ targets: [plain, armored], scaling: { base: 0, mult: 2 }, range: 'all' }).apply(ctx);
    expect(plain.hp).toBe(30); // 20 伤害
    expect(armored.hp).toBe(35); // round(20*0.75) = 15
  });
});

describe('状态免疫特质', () => {
  it('对应状态被拒绝，其它状态照常', () => {
    const ch = makeChar(0, { traitIds: ['fireproof'] });
    attachPassives(ch);
    expect(applyStatus(ch, { id: 'burning', turns: 3 })).toEqual([]);
    expect(hasStatus(ch, 'burning')).toBe(false);
    expect(applyStatus(ch, { id: 'poison', turns: 3 }).length).toBeGreaterThan(0);
    expect(hasStatus(ch, 'poison')).toBe(true);
  });

  it('无坚不摧免疫全部状态', () => {
    const ch = makeChar(0, { traitIds: ['impervious'] });
    attachPassives(ch);
    for (const id of ['burning', 'poison', 'frozen', 'silence', 'entangle', 'stun']) {
      expect(applyStatus(ch, { id, turns: 2 })).toEqual([]);
      expect(isImmuneToStatus(ch, id)).toBe(true);
    }
    expect(ch.statuses).toEqual([]);
  });

  it('未编译被动的角色不免疫任何状态', () => {
    const ch = makeChar(0, { traitIds: ['impervious'] }); // 故意不 attachPassives
    expect(isImmuneToStatus(ch, 'burning')).toBe(false);
    expect(passivesOf(ch).skullDamageTaken).toBe(1);
  });
});

describe('受击 / 命中触发特质', () => {
  it('狂暴：受到骷髅伤害后攻击力 +1', () => {
    const { target, left, right, combat } = duel([], ['frenzy']);
    expect(target.attack).toBe(10);
    combat.resolveSkullDamage(left, right, 3);
    expect(target.attack).toBe(11);
  });

  it('被纠缠时攻击落空，不触发狂暴', () => {
    const { attacker, target, left, right, combat } = duel([], ['frenzy']);
    applyStatus(attacker, { id: 'entangle', turns: 2 });
    combat.resolveSkullDamage(left, right, 3);
    expect(target.attack).toBe(10);
  });

  it('被冻结仍能造成骷髅伤害并触发受击狂暴；冻结限制额外回合而非攻击', () => {
    const { attacker, target, left, right, combat } = duel([], ['frenzy']);
    applyStatus(attacker, { id: 'frozen', turns: 2 });
    combat.resolveSkullDamage(left, right, 3);
    expect(target.attack).toBe(11);
  });

  it('毒液：造成骷髅伤害时让目标中毒，并产出 status-apply', () => {
    const { target, left, right, combat } = duel(['venomous'], []);
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(target, 'poison')).toBe(true);
    expect(out.events.some((e) => e.type === 'status-apply')).toBe(true);
  });

  it('毒液遇免疫目标：不施加也不报错', () => {
    const { target, left, right, combat } = duel(['venomous'], ['sturdy']);
    combat.resolveSkullDamage(left, right, 3);
    expect(hasStatus(target, 'poison')).toBe(false);
  });
});

describe('闪避与反弹特质', () => {
  /** 固定随机源，便于断言闪避判定 */
  const fixedRng = (value: number) => ({ next: () => value });

  it('敏捷：判定命中时攻击落空，reason=dodge，且不触发受击/命中类特质', () => {
    const { attacker, target, left, right, combat } = duel(['venomous'], ['agile', 'frenzy']);
    const out = combat.resolveSkullDamage(left, right, 3, fixedRng(0.1)); // 0.1 < 0.2 → 闪避

    expect(out.events.some((e) => e.type === 'skull-damage')).toBe(false);
    expect(out.events.find((e) => e.type === 'attack-struggle')).toMatchObject({ reason: 'dodge' });
    expect(target.hp).toBe(50);
    expect(target.attack).toBe(10); // 狂暴未触发
    expect(hasStatus(target, 'poison')).toBe(false); // 毒液未触发
    expect(attacker.hp).toBe(50);
  });

  it('敏捷：判定未命中时正常受伤', () => {
    const { target, left, right, combat } = duel([], ['agile']);
    combat.resolveSkullDamage(left, right, 3, fixedRng(0.9));
    expect(target.hp).toBe(40);
  });

  it('不传随机源时闪避特质不生效（纯逻辑单测可省略 rng）', () => {
    const { target, left, right, combat } = duel([], ['agile']);
    combat.resolveSkullDamage(left, right, 3);
    expect(target.hp).toBe(40);
  });

  it('炼狱护甲把 25% 伤害反弹给攻击者', () => {
    const { attacker, target, left, right, combat } = duel([], ['infernalarmor']);
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(target.hp).toBe(40);
    expect(attacker.hp).toBe(50 - 3); // round(10 * 0.25) = 3
    // 反弹也发 skull-damage，攻守双方对调
    expect(out.events.filter((e) => e.type === 'skull-damage')).toHaveLength(2);
  });

  it('反弹按减伤后的实际伤害折算', () => {
    const { attacker, left, right, combat } = duel([], ['infernalarmor', 'stoneskin']);
    combat.resolveSkullDamage(left, right, 3);
    // 铁壁铜墙先把 10 减到 5，反弹按 5 算 → round(5*0.25)=1
    expect(attacker.hp).toBe(49);
  });

  it('反弹致死时产出攻击者的 defeat 事件', () => {
    const { attacker, left, right, combat } = duel([], ['mithrilarmor']);
    attacker.hp = 2; // 反弹 round(10*0.75)=8 足以致死
    const out = combat.resolveSkullDamage(left, right, 3);
    expect(attacker.defeated).toBe(true);
    expect(out.events.some((e) => e.type === 'defeat' && e.characterId === attacker.id)).toBe(true);
  });
});

describe('回合开始的棋盘写入特质', () => {
  /** 铺一张不会自发匹配的棋盘 */
  function plainBoard() {
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
      }
    }
    return board;
  }

  function battle(rightTraits: string[], seed = 51) {
    const rng = new SeededRNG(seed);
    let id = 98000;
    const board = plainBoard();
    const mine = makeChar(0);
    const theirs = makeChar(4, { traitIds: rightTraits });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [mine] },
      { player: PlayerSide.Right, characters: [theirs] },
    );
    const engine = new TurnEngine(state, rng, () => id++);
    engine.skullChance = 0;
    return { engine, state, board, mine, theirs };
  }

  it('火生：回合开始把随机一格变成红色宝石，并产出 gem-transform', () => {
    const { engine, board } = battle(['bornoffire']);
    const before = countColor(board, BaseColor.Red);

    const events = engine.passTurn(); // 交给右方 → 触发右方的回合开始特质

    const transform = events.find((e) => e.type === 'gem-transform');
    expect(transform).toBeDefined();
    expect(countColor(board, BaseColor.Red)).toBeGreaterThan(before);
  });

  it('改完棋盘立即结算连锁：回合结束后盘面不留现成匹配', () => {
    const resolver = new MatchResolver();
    // 多跑几个种子，确保「造出的宝石正好凑成三连」的情形也被覆盖
    for (const seed of [51, 52, 53, 54, 55, 56, 57, 58]) {
      const { engine, board } = battle(['bornoffire'], seed);
      engine.passTurn();
      expect(resolver.hasAnyMatch(board)).toBe(false);
      expect(board.isFull()).toBe(true);
    }
  });

  it('白骨堆：按概率把一颗紫色宝石转成骷髅头', () => {
    // chance 0.25，多试几个种子确保至少命中一次
    let hit = false;
    for (const seed of [61, 62, 63, 64, 65, 66, 67, 68, 69, 70]) {
      const { engine, board } = battle(['bonepile'], seed);
      const skullsBefore = countSkulls(board);
      engine.passTurn();
      if (countSkulls(board) > skullsBefore) { hit = true; break; }
    }
    expect(hit).toBe(true);
  });

  it('无棋盘写入特质时不产出 gem-transform', () => {
    const { engine } = battle([]);
    const events = engine.passTurn();
    expect(events.some((e) => e.type === 'gem-transform')).toBe(false);
  });

  it('只作用于即将行动的一方', () => {
    // 特质挂在左方，passTurn 交给右方 → 本次回合开始不应触发左方的特质
    const rng = new SeededRNG(71);
    let id = 99000;
    const board = plainBoard();
    const mine = makeChar(0, { traitIds: ['bornoffire'] });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [mine] },
      { player: PlayerSide.Right, characters: [makeChar(4)] },
    );
    const engine = new TurnEngine(state, rng, () => id++);
    engine.skullChance = 0;
    const events = engine.passTurn();
    expect(events.some((e) => e.type === 'gem-transform')).toBe(false);
  });
});

describe('屠戮倍率与穿透护甲', () => {
  const fixedRng = (value: number) => ({ next: () => value });

  it('龙族杀手对龙族造成双倍骷髅伤害，对其它种族不变', () => {
    const vsDragon = duel(['dragonslayer'], [], { troopTypes: ['Dragon'] });
    vsDragon.combat.resolveSkullDamage(vsDragon.left, vsDragon.right, 3);
    expect(vsDragon.target.hp).toBe(30); // 10 × 2

    const vsBeast = duel(['dragonslayer'], [], { troopTypes: ['Beast'] });
    vsBeast.combat.resolveSkullDamage(vsBeast.left, vsBeast.right, 3);
    expect(vsBeast.target.hp).toBe(40);
  });

  it('纵火狂只对燃烧目标翻倍', () => {
    const clean = duel(['pyromania'], []);
    clean.combat.resolveSkullDamage(clean.left, clean.right, 3);
    expect(clean.target.hp).toBe(40);

    const burning = duel(['pyromania'], []);
    applyStatus(burning.target, { id: 'burning', turns: 2, magnitude: 1 });
    burning.combat.resolveSkullDamage(burning.left, burning.right, 3);
    expect(burning.target.hp).toBe(30);
  });

  it('烈焰之恨按目标法力色判定', () => {
    const red = duel(['burninghatred'], [], { colors: [BaseColor.Red] });
    red.combat.resolveSkullDamage(red.left, red.right, 3);
    expect(red.target.hp).toBe(30);

    const blue = duel(['burninghatred'], [], { colors: [BaseColor.Blue] });
    blue.combat.resolveSkullDamage(blue.left, blue.right, 3);
    expect(blue.target.hp).toBe(40);
  });

  it('吸血鬼只对已受伤目标翻倍', () => {
    const full = duel(['bloodsucking'], []);
    full.combat.resolveSkullDamage(full.left, full.right, 3);
    expect(full.target.hp).toBe(40);

    const hurt = duel(['bloodsucking'], []);
    hurt.target.hp = 30; // maxHp 50 → 已受伤
    hurt.combat.resolveSkullDamage(hurt.left, hurt.right, 3);
    expect(hurt.target.hp).toBe(10); // 10 × 2
  });

  it('多个屠戮条件同时命中时取最强，不相乘', () => {
    const { target, left, right, combat } = duel(
      ['dragonslayer', 'icycloak'], // ×2 与 ×3
      [],
      { troopTypes: ['Dragon'] },
    );
    applyStatus(target, { id: 'frozen', turns: 2 });
    combat.resolveSkullDamage(left, right, 3);
    expect(target.hp).toBe(20); // 10 × 3，而不是 ×6
  });

  it('倍率与目标减伤叠加：先放大再折算', () => {
    const { target, left, right, combat } = duel(['dragonslayer'], ['stoneskin'], { troopTypes: ['Dragon'] });
    combat.resolveSkullDamage(left, right, 3);
    expect(target.hp).toBe(40); // 10×2=20，铁壁减半 → 10
  });

  it('穿透护甲命中时直接跳过护甲', () => {
    const pierced = duel(['armorpiercing'], [], { armor: 20 });
    pierced.combat.resolveSkullDamage(pierced.left, pierced.right, 3, fixedRng(0.1));
    expect(pierced.target.armor).toBe(20);
    expect(pierced.target.hp).toBe(40);

    const blocked = duel(['armorpiercing'], [], { armor: 20 });
    blocked.combat.resolveSkullDamage(blocked.left, blocked.right, 3, fixedRng(0.9));
    expect(blocked.target.armor).toBe(10);
    expect(blocked.target.hp).toBe(50);
  });

  it('不传随机源时穿透护甲不生效', () => {
    const { target, left, right, combat } = duel(['armorpiercing'], [], { armor: 20 });
    combat.resolveSkullDamage(left, right, 3);
    expect(target.armor).toBe(10);
    expect(target.hp).toBe(50);
  });
});

describe('施法 / 阵亡 / 4-5 连响应特质', () => {
  /** 造一场可控战斗：静态棋盘 + 一个纯伤害技能，用于观察施法与阵亡响应。 */
  function castable(leftTraits: string[], rightTraits: string[], damage = 3) {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('hit', {
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: damage, mult: 0 } }],
    });
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
      }
    }
    const caster = makeChar(0, { traitIds: leftTraits, skillId: 'hit', mana: 10, manaCost: 10, magic: 0 });
    const ally = makeChar(1, { traitIds: leftTraits });
    const foe = makeChar(4, { traitIds: rightTraits, hp: 50 });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [caster, ally] },
      { player: PlayerSide.Right, characters: [foe] },
    );
    let idg = 90000;
    const engine = new TurnEngine(state, new SeededRNG(2), () => idg++, registry);
    engine.skullChance = 0;
    return { engine, caster, ally, foe, state };
  }

  it('秘法：同队任一角色施法时全队 +1 法强，施法者自己也算盟友', () => {
    const { engine, caster, ally, foe } = castable(['arcane'], []);
    const before = { caster: caster.magic, ally: ally.magic, foe: foe.magic };
    engine.castSkill(0);
    expect(caster.magic).toBe(before.caster + 1);
    expect(ally.magic).toBe(before.ally + 1);
    expect(foe.magic).toBe(before.foe);
  });

  it('铭刻 / 怨恨：敌人施法时获得护甲 / 攻击力', () => {
    // 用 0 伤害技能：否则同一次施法的伤害会立刻把铭刻加的护甲吃掉，看不出效果
    const { engine, foe } = castable([], ['inscribed', 'grudge'], 0);
    const before = { armor: foe.armor, attack: foe.attack };
    engine.castSkill(0);
    expect(foe.armor).toBe(before.armor + 1);
    expect(foe.attack).toBe(before.attack + 1);
  });

  it('施法响应先于技能效果：铭刻加的护甲能吃掉同一次施法的伤害', () => {
    const { engine, foe } = castable([], ['inscribed'], 3);
    const hpBefore = foe.hp;
    engine.castSkill(0);
    // 护甲 0 →（铭刻）1 → 被 3 点伤害吃掉 1，血只掉 2
    expect(foe.armor).toBe(0);
    expect(foe.hp).toBe(hpBefore - 2);
  });

  it('施法响应产出 buff 事件，供卡面演出', () => {
    const { engine } = castable(['arcane'], []);
    const events = engine.castSkill(0);
    const idx = events.findIndex((e) => e.type === 'skill-cast');
    const buff = events.slice(idx).find((e) => e.type === 'buff' && e.stat === 'magic');
    expect(buff).toBeDefined();
  });

  it('吸收生命：敌人阵亡时 +4 生命；复仇者：盟友阵亡时 +3 攻击', () => {
    // 施法直接打死敌方队首（伤害 999）
    const { engine, caster, ally, foe } = castable(['lifedrain'], ['avenger'], 999);
    caster.hp = 40;
    caster.maxHp = 50;
    const allyAttackBefore = ally.attack;
    engine.castSkill(0);

    expect(foe.defeated).toBe(true);
    // 我方带吸收生命 → 敌人阵亡时 +4 生命
    expect(caster.hp).toBe(44);
    // 复仇者在敌方身上，触发条件是「己方盟友阵亡」，此处阵亡者是敌方自己
    expect(ally.attack).toBe(allyAttackBefore);
  });

  it('庆功：敌人阵亡时获得法力，且不超过上限', () => {
    const { engine, caster, foe } = castable(['victorylap'], [], 999);
    caster.manaCost = 20;
    caster.mana = 20; // 施法后归零，随后阵亡响应给 +8
    engine.castSkill(0);
    expect(foe.defeated).toBe(true);
    expect(caster.mana).toBe(8);
  });

  it('庞然 / 修理：4 连时匹配方全队获得生命 / 护甲，对方不获得', () => {
    const rng = new SeededRNG(31);
    let id = 95000;
    // 底行 (7,0..2) 三红 + (6,3) 红，交换 (7,3)<->(6,3) 成四连红
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
      }
    }
    for (const c of [0, 1, 2]) board.set({ row: 7, col: c }, g(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 3 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 3 }, g(colorGem(BaseColor.Green)));
    board.set({ row: 5, col: 3 }, g(colorGem(BaseColor.Blue)));

    const big = makeChar(0, { traitIds: ['big'], hp: 50, maxHp: 50 });
    const repair = makeChar(1, { traitIds: ['repair'], armor: 0 });
    const foe = makeChar(4, { traitIds: ['big'], hp: 50, maxHp: 50 });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [big, repair] },
      { player: PlayerSide.Right, characters: [foe] },
    );
    const engine = new TurnEngine(state, rng, () => id++);
    engine.skullChance = 0;

    engine.resolveSwap({ row: 7, col: 3 }, { row: 6, col: 3 });

    expect(big.maxHp).toBeGreaterThanOrEqual(51);
    expect(repair.armor).toBeGreaterThanOrEqual(1);
    // 匹配方是左队，右队即使也带庞然也不该获得
    expect(foe.maxHp).toBe(50);
  });

  it('食人魔之怒：匹配红色宝石时全队获得攻击力，匹配其它色不获得', () => {
    const rng = new SeededRNG(41);
    let id = 97000;
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
      }
    }
    // 底行构造红色三连（交换 (7,2)<->(6,2)）
    board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
    board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Blue)));

    const fury = makeChar(0, { traitIds: ['ogrefury'], attack: 10, colors: [BaseColor.Red] });
    const foe = makeChar(4, { traitIds: ['ogrefury'], attack: 10 });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [fury] },
      { player: PlayerSide.Right, characters: [foe] },
    );
    const engine = new TurnEngine(state, rng, () => id++);
    engine.skullChance = 0;
    engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });

    expect(fury.attack).toBeGreaterThanOrEqual(11);
    // 匹配方是左队，右队即使也带食人魔之怒也不该获得
    expect(foe.attack).toBe(10);
  });

  it('三连不触发 4/5 连响应', () => {
    const rng = new SeededRNG(33);
    let id = 96000;
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
      }
    }
    board.set({ row: 7, col: 0 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 1 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 6, col: 2 }, g(colorGem(BaseColor.Red)));
    board.set({ row: 7, col: 2 }, g(colorGem(BaseColor.Green)));
    board.set({ row: 5, col: 2 }, g(colorGem(BaseColor.Blue)));
    board.set({ row: 7, col: 3 }, g(colorGem(BaseColor.Yellow)));

    const big = makeChar(0, { traitIds: ['big'], hp: 50, maxHp: 50 });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [big] },
      { player: PlayerSide.Right, characters: [makeChar(4)] },
    );
    const engine = new TurnEngine(state, rng, () => id++);
    engine.skullChance = 0;
    engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });

    expect(big.maxHp).toBe(50);
  });
});

describe('回合开始与战斗开始特质', () => {
  it('再生每回合恢复 1 点，不超过上限', () => {
    const ch = makeChar(0, { traitIds: ['regeneration'], hp: 48, maxHp: 50 });
    attachPassives(ch);
    expect(applyTurnStartPassives([ch])).toEqual([
      { type: 'buff', source: 'trait', targetId: 0, stat: 'hp', amount: 1 },
    ]);
    expect(ch.hp).toBe(49);
    applyTurnStartPassives([ch]);
    expect(ch.hp).toBe(50);
    // 满血时不再产出事件
    expect(applyTurnStartPassives([ch])).toEqual([]);
  });

  it('阵亡角色不再生', () => {
    const ch = makeChar(0, { traitIds: ['regeneration'], hp: 0, defeated: true });
    attachPassives(ch);
    expect(applyTurnStartPassives([ch])).toEqual([]);
  });

  /** 起一场战斗只为触发构造期的特质结算 */
  function startBattle(left: Character[], right: Character[], seed = 9) {
    const rng = new SeededRNG(seed);
    let id = 7000 + seed;
    const board = new BoardGenerator(rng, () => id++, 0).generate();
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: left },
      { player: PlayerSide.Right, characters: right },
    );
    new TurnEngine(state, rng, () => id++);
    return state;
  }

  it('revered gives every ally two random skill points instead of always granting magic', () => {
    const revered = makeChar(0, { traitIds: ['revered'], magic: 5 });
    const ally = makeChar(1, { magic: 5 });
    const foe = makeChar(4, { magic: 5 });
    const skillTotal = (c: Character) => c.attack + c.armor + c.maxHp + c.magic;
    const before = [skillTotal(revered), skillTotal(ally), skillTotal(foe)];
    startBattle([revered, ally], [foe]);

    expect(skillTotal(revered)).toBe(before[0]! + 2);
    expect(skillTotal(ally)).toBe(before[1]! + 2);
    expect(skillTotal(foe)).toBe(before[2]);
  });

  it('诅咒给全体敌人 -2 法强，不影响自己一方', () => {
    const cursed = makeChar(4, { traitIds: ['accursed'], magic: 5 });
    const teammate = makeChar(5, { magic: 5 });
    const target = makeChar(0, { magic: 5 });
    startBattle([target], [cursed, teammate], 10);

    expect(target.magic).toBe(3);
    expect(cursed.magic).toBe(5);
    expect(teammate.magic).toBe(5);
  });

  it('revered rolls two skill points while enemy accursed still subtracts magic', () => {
    const revered = makeChar(0, { traitIds: ['revered'], magic: 5 });
    const ally = makeChar(1, { magic: 5 });
    const cursed = makeChar(4, { traitIds: ['accursed'], magic: 5 });
    const skillTotal = (c: Character) => c.attack + c.armor + c.maxHp + c.magic;
    const before = [skillTotal(revered), skillTotal(ally), skillTotal(cursed)];
    startBattle([revered, ally], [cursed], 12);

    // Each ally gets two random points, then loses two magic from the opposing aura.
    expect(skillTotal(revered)).toBe(before[0]);
    expect(skillTotal(ally)).toBe(before[1]);
    expect(skillTotal(cursed)).toBe(before[2]);
  });

  it('骑士族亲只给同队骑士 +2 生命，不影响其它种族与敌方骑士', () => {
    const bond = makeChar(0, { traitIds: ['knightbond'], troopTypes: ['Knight'], hp: 50, maxHp: 50 });
    const knight = makeChar(1, { troopTypes: ['Knight'], hp: 50, maxHp: 50 });
    const beast = makeChar(2, { troopTypes: ['Beast'], hp: 50, maxHp: 50 });
    const enemyKnight = makeChar(4, { troopTypes: ['Knight'], hp: 50, maxHp: 50 });
    startBattle([bond, knight, beast], [enemyKnight], 14);

    expect(knight.maxHp).toBe(52);
    expect(bond.maxHp).toBe(52); // 光环包含自己
    expect(beast.maxHp).toBe(50);
    expect(enemyKnight.maxHp).toBe(50);
  });

  it('之盾类族亲加护甲，双类型角色也吃得到', () => {
    const shield = makeChar(0, { traitIds: ['knightshield'], troopTypes: ['Knight'], armor: 3 });
    const hybrid = makeChar(1, { troopTypes: ['Human', 'Knight'], armor: 3 });
    startBattle([shield, hybrid], [makeChar(4)], 15);

    expect(hybrid.armor).toBe(5);
    expect(shield.armor).toBe(5);
  });

  it('无种族的角色不吃族亲光环', () => {
    const bond = makeChar(0, { traitIds: ['knightbond'], troopTypes: ['Knight'], hp: 50, maxHp: 50 });
    const typeless = makeChar(1, { hp: 50, maxHp: 50 });
    startBattle([bond, typeless], [makeChar(4)], 16);

    expect(typeless.maxHp).toBe(50);
  });

  it('水系之心按蓝色盟友数量叠加生命', () => {
    const rng = new SeededRNG(11);
    let id = 7500;
    const board = new BoardGenerator(rng, () => id++, 0).generate();
    const heart = makeChar(0, { traitIds: ['waterheart'], colors: [BaseColor.Blue], hp: 50, maxHp: 50 });
    const blue = makeChar(1, { colors: [BaseColor.Blue] });
    const red = makeChar(2, { colors: [BaseColor.Red] });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [heart, blue, red] },
      { player: PlayerSide.Right, characters: [makeChar(4)] },
    );
    new TurnEngine(state, rng, () => id++);

    // 队内蓝色盟友 2 名（含自己）→ +2 生命，上限同步抬高
    expect(heart.maxHp).toBe(52);
    expect(heart.hp).toBe(52);
    expect(blue.maxHp).toBe(50);
  });

  it('法力灵链在匹配对应色时额外充能，且不挤占队友', () => {
    const dist = new ManaDistributor();
    const linked = makeChar(0, { colors: [BaseColor.Blue], traitIds: ['waterlink'], manaCost: 20 });
    const plain = makeChar(1, { colors: [BaseColor.Blue], manaCost: 20 });
    attachPassives(linked);
    attachPassives(plain);
    const team: Team = { player: PlayerSide.Left, characters: [linked, plain] };

    const events = dist.distribute(team, PlayerSide.Left, BaseColor.Blue, 3);
    // 队首吃 3 点 + 灵链 1 点，队友仍拿到剩余 0（本例全被队首吸收）
    expect(linked.mana).toBe(4);
    expect(events[0]).toMatchObject({ characterId: 0, amount: 4 });
    expect(plain.mana).toBe(0);
  });

  it('灵链不会突破法力上限', () => {
    const dist = new ManaDistributor();
    const linked = makeChar(0, { colors: [BaseColor.Blue], traitIds: ['waterlink'], manaCost: 3 });
    attachPassives(linked);
    dist.distribute({ player: PlayerSide.Left, characters: [linked] }, PlayerSide.Left, BaseColor.Blue, 3);
    expect(linked.mana).toBe(3);
  });

  it('快速 / 赐能在 TurnEngine 构造时结算开局法力', () => {
    const rng = new SeededRNG(3);
    let id = 5000;
    const board = new BoardGenerator(rng, () => id++, 0).generate();
    const fast = makeChar(0, { traitIds: ['fast'], manaCost: 10 });
    const empowered = makeChar(1, { traitIds: ['empowered'], manaCost: 10 });
    const plain = makeChar(2, { manaCost: 10 });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [fast, empowered, plain] },
      { player: PlayerSide.Right, characters: [makeChar(4)] },
    );
    new TurnEngine(state, rng, () => id++);

    expect(fast.mana).toBe(5);
    expect(empowered.mana).toBe(10);
    expect(plain.mana).toBe(0);
    // 构造时也已编译被动
    expect(fast.passive).toBeDefined();
  });

  it('TurnEngine 回合结束时结算再生（对即将行动方）', () => {
    const rng = new SeededRNG(4);
    let id = 6000;
    const board = new BoardGenerator(rng, () => id++, 0).generate();
    const mine = makeChar(0);
    const theirs = makeChar(4, { traitIds: ['regeneration'], hp: 40, maxHp: 50 });
    const state = createGameState(
      board,
      { player: PlayerSide.Left, characters: [mine] },
      { player: PlayerSide.Right, characters: [theirs] },
    );
    const engine = new TurnEngine(state, rng, () => id++);
    engine.skullChance = 0;

    const events = engine.passTurn(); // 交给右方 → 对右方结算回合开始被动
    expect(theirs.hp).toBe(41);
    expect(events.some((e) => e.type === 'buff' && e.stat === 'hp')).toBe(true);
  });
});
