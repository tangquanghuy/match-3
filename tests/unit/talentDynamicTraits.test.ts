/**
 * 职业天赋动态特质定义批测试（主角系统 v3，56 条天赋的引擎钩子落地）。
 *
 * 覆盖：
 *   - 注册表：registerDynamicTraits 后 getTrait 回落可查、dynamicTraitCodes 可枚举；
 *   - 编译正确性：代表 code → resolvePassives 产物（既有键与新增键）；
 *   - 钩子集成：纯函数层（applyBigMatchTriggers/applyDeathTriggers/applyEnemyDeathTriggers）
 *     与真实对局层（TurnEngine：开局施加状态/开局法力光环/回合经济）；
 *   - meta 集成：TALENT_DYNAMIC_DEFS 与 classes.json 的 unimplemented 天赋一一对应、
 *     heroTraitCodes 携带动态 code、buildBattleRequest 过会话校验。
 */
import { describe, it, expect } from 'vitest';
import {
  dynamicTraitCodes,
  getTrait,
  resolvePassives,
  applyBigMatchTriggers,
  applyDeathTriggers,
  applyEnemyDeathTriggers,
  applyColorMatchTriggers,
  attachPassives,
} from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { applyStatus, RANDOM_POSITIVE_STATUS_POOL } from '@engine/skills/effects/status';
import { PlayerSide, BaseColor } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { TALENT_DYNAMIC_CODES, TALENT_DYNAMIC_DEFS } from '../../src/meta/data/talentDefs';
import {
  CLASSES,
  pickTalent,
  equipClass,
  setTeamPreset,
  newSave,
  buildBattleRequest,
  planQuestEncounter,
} from '../../src/meta';
import { PERK_DYNAMIC_DEFS, PVP_DYNAMIC_DEFS } from '../../src/meta/data/talentDefs';
import { traitBadgeSvg } from '../../src/render/traitBadges';

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

/** 编译特质进 passive（passivesOf 只读 char.passive） */
function withPassives(chars: Character[]): Character[] {
  for (const c of chars) attachPassives(c);
  return chars;
}

/** 生成满盘随机合法棋盘（对局集成用） */
function freshBoard(seed: number): BoardModel {
  return new BoardGenerator(new SeededRNG(seed), () => 0).generate();
}

/** 测试用状态施加上下文（与引擎注入口径一致：直改 statuses + status-apply 事件） */
const statusCtx = (rng: SeededRNG) => ({
  applyStatus: (char: Character, status: { id: string; turns: number; magnitude?: number }) => {
    char.statuses.push({ ...status });
    return [{ type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns } as never];
  },
  rng,
  kill: (target: Character) => {
    target.hp = 0;
    target.defeated = true;
    return [];
  },
});

// ============================================================
// 注册表与编译
// ============================================================

describe('动态特质注册表', () => {
  it('56 条定义已随 meta 模块导入注册；getTrait 回落可查', () => {
    expect(TALENT_DYNAMIC_DEFS).toHaveLength(56);
    expect(dynamicTraitCodes()).toContain('fasthealing');
    expect(getTrait('fasthealing')?.regen).toEqual({ stat: 'hp', amount: 2 });
    expect(resolvePassives(['fasthealing']).regenPerTurn).toBe(2);
  });

  it('编译：vengeance/counterattack/delirium（事件自身数值，含 alsoStats 双属性）', () => {
    expect(resolvePassives(['vengeance']).gainOnEnemyDeath.attack).toBe(3);
    expect(resolvePassives(['counterattack']).gainOnDamaged.attack).toBe(2);
    const p = resolvePassives(['delirium']);
    expect(p.gainOnDamaged.magic).toBe(2);
    expect(p.gainOnDamaged.attack).toBe(2);
  });

  it('编译：光环家族（onEnemyDeathTypeAura/onAllyDeathTypeAura/onAllyCastTypeAura/onBigMatchTypeAura）', () => {
    expect(resolvePassives(['mysticchannel']).onEnemyDeathTypeAura).toEqual({
      troopType: 'Mystic', gains: { magic: 2, hp: 2 },
    });
    expect(resolvePassives(['unholyblessing']).onAllyDeathTypeAura).toEqual({
      troopType: 'Undead', gains: { armor: 2, magic: 2 },
    });
    expect(resolvePassives(['lordofstorms']).onAllyCastTypeAura).toEqual({
      troopType: 'Elemental', gains: { magic: 1 },
    });
    expect(resolvePassives(['brilliantaura']).bigMatchTypeAura.all).toMatchObject({ hp: 2 });
    expect(getTrait('eternalsummer')?.turnStartTypeAura).toEqual({ scope: 'Fey', gains: { hp: 2 } });
  });

  it('编译：配色/受击/闪避/法术减伤（既有键，官方数值）', () => {
    expect(resolvePassives(['healingherb']).gainOnColorMatch.Green).toMatchObject({ hp: 4 });
    expect(getTrait('darkvenom')?.onColorMatchStatus).toMatchObject({ color: 'Purple', scope: 'randomEnemy' });
    expect(getTrait('rocksolid')?.onColorMatchStatus).toMatchObject({ color: 'Brown', scope: 'self' });
    expect(resolvePassives(['dodge']).dodgeChance).toBe(0.3);
    expect(resolvePassives(['antimagicsphere']).spellDamageTaken).toBe(0.8);
    expect(resolvePassives(['impact']).inflictOnSkullDamaged).toEqual({ id: 'stun', turns: 3 });
  });

  it('编译：本批新增 passive 键', () => {
    expect(resolvePassives(['golemprotector']).summonOnDamaged).toMatchObject({ chance: 0.2, troopId: 6398 });
    expect(resolvePassives(['childofsky']).summonOnAllyCast).toMatchObject({ chance: 0.25, troopId: 6331 });
    expect(resolvePassives(['razorarmor']).skullDamageFromArmorRatio).toBe(0.2);
    expect(resolvePassives(['banishment']).onBigMatchDispelEnemies).toBe(true);
    expect(resolvePassives(['purification']).onBigMatchCleanseSelf).toBe(true);
    expect(resolvePassives(['lifesiphon']).onBigMatchDrainLife).toEqual({ amount: 2 });
    expect(resolvePassives(['chaosstorm']).onBigMatchRandomStorm).toEqual({ minSize: 4 });
    expect(resolvePassives(['chaoswave']).onSkullMatchEnemyDrain).toEqual({ stat: 'random', amount: 1 });
    expect(resolvePassives(['risingshadows']).onEnemyDeathKill).toEqual({ chance: 0.07, scope: 'lastEnemy' });
    expect(resolvePassives(['chillofdeath']).onEnemyDeathRandomStatus).toEqual({ statuses: [{ id: 'frozen' }], turns: 3 });
    expect(getTrait('vanguard')?.battleStartStatus).toEqual({ target: 'self', statuses: [{ id: 'barrier' }], turns: 3 });
    expect(getTrait('serendipity')?.battleStartStatus).toMatchObject({ target: 'randomAlly', randomPositive: true });
    expect(getTrait('windspeed')?.allyStartMana).toEqual({ scope: 'Yellow', ratio: 0.1 });
    expect(getTrait('lightfingers')?.turnStartEconomy).toEqual({ currency: 'gold', amount: 5 });
  });
});

// ============================================================
// 真实对局集成（TurnEngine）
// ============================================================

/** Stable board: exactly one 4/5 match, made by a vertical swap into row 4. */
function bigMatchBoard(size: 4 | 5, color: BaseColor = BaseColor.Red): { board: BoardModel; swapCol: number; nextId: () => number } {
  const board = new BoardModel();
  const colors = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow];
  let id = 1;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      board.set({ row, col }, { id: id++, type: { kind: 'color', color: colors[(row + col) % 3]! } });
    }
  }
  for (let col = 0; col < size - 1; col++) {
    board.set({ row: 4, col }, { id: id++, type: { kind: 'color', color } });
  }
  board.set({ row: 5, col: size - 1 }, { id: id++, type: { kind: 'color', color } });
  return { board, swapCol: size - 1, nextId: () => id++ };
}

describe('matching-side trait ownership', () => {
  it('enemy-owned board changes keep enemy ownership for resulting four-matches', () => {
    const { board, swapCol, nextId } = bigMatchBoard(4, BaseColor.Purple);
    board.set({ row: 4, col: swapCol }, { id: nextId(), type: { kind: 'color', color: BaseColor.Purple } });
    const left = makeChar(1, { traitIds: ['elementalforce'] });
    const right = makeChar(2, { traitIds: ['hunt', 'darkvenom'] });
    const state = createGameState(board, makeTeam(PlayerSide.Left, [left]),
      makeTeam(PlayerSide.Right, [right]), PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(5), nextId, new ExtensionRegistry());
    engine.takeInitialEvents();
    const events: ReturnType<typeof engine.resolveAction> = [];
    engine.resolveBoardChange([], events, PlayerSide.Right, 'remove');
    expect(events.some(e => e.type === 'elimination' && e.cells.length >= 4)).toBe(true);
    expect(events.filter(e => e.type === 'status-apply').map(e => [e.targetId, e.statusId]))
      .toEqual([[left.id, 'marked'], [left.id, 'poison']]);
    expect(right.statuses).toEqual([]);
    expect(events.some(e => e.type === 'extra-turn')).toBe(false);
  });

  it('after a real turn switch, the new matching side owns big and color status effects', () => {
    const { board, swapCol, nextId } = bigMatchBoard(4, BaseColor.Purple);
    const left = makeChar(1, { traitIds: ['elementalforce', 'hunt', 'darkvenom'] });
    const right = makeChar(2, { traitIds: ['hunt', 'darkvenom'] });
    const state = createGameState(board, makeTeam(PlayerSide.Left, [left]),
      makeTeam(PlayerSide.Right, [right]), PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(5), nextId, new ExtensionRegistry());
    engine.takeInitialEvents();
    engine.passTurn();
    expect(state.activePlayer).toBe(PlayerSide.Right);
    const events = engine.resolveAction({ type: 'swap', from: { row: 4, col: swapCol }, to: { row: 5, col: swapCol } });
    expect(events.some(e => e.type === 'elimination' && e.cells.length >= 4)).toBe(true);
    const statuses = events.filter(e => e.type === 'status-apply');
    expect(statuses.map(e => e.statusId).sort()).toEqual(['marked', 'poison']);
    expect(statuses.every(e => e.targetId === left.id)).toBe(true);
    expect(right.statuses).toEqual([]);
  });

  for (const size of [4, 5] as const) {
    for (const matchingSide of [PlayerSide.Left, PlayerSide.Right]) {
      it(`${matchingSide} side ${size}-match triggers only its own holder, targeting the opposite team`, () => {
        const { board, swapCol, nextId } = bigMatchBoard(size);
        const left = makeChar(1, { traitIds: ['elementalforce'] });
        const right = makeChar(2, { traitIds: ['elementalforce'] });
        const state = createGameState(board, makeTeam(PlayerSide.Left, [left]),
          makeTeam(PlayerSide.Right, [right]), matchingSide);
        const engine = new TurnEngine(state, new SeededRNG(5), nextId, new ExtensionRegistry());
        engine.takeInitialEvents();
        const events = engine.resolveAction({ type: 'swap', from: { row: 4, col: swapCol }, to: { row: 5, col: swapCol } });
        expect(events.some(e => e.type === 'elimination' && e.cells.length >= size)).toBe(true);
        const statuses = events.filter(e => e.type === 'status-apply');
        expect(statuses).toHaveLength(2);
        const target = matchingSide === PlayerSide.Left ? right : left;
        const holder = matchingSide === PlayerSide.Left ? left : right;
        expect(statuses.every(e => e.targetId === target.id)).toBe(true);
        expect(holder.statuses).toEqual([]);
      });
    }
  }

  for (const size of [4, 5] as const) {
    for (const matchingSide of [PlayerSide.Left, PlayerSide.Right]) {
      it(`${matchingSide} side ${size}-match never triggers the opponent's big/color-match status traits`, () => {
        const { board, swapCol, nextId } = bigMatchBoard(size, BaseColor.Purple);
        const holderSide = matchingSide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
        const holder = makeChar(holderSide === PlayerSide.Left ? 1 : 2, { traitIds: ['elementalforce', 'hunt', 'darkvenom'] });
        const other = makeChar(holderSide === PlayerSide.Left ? 2 : 1);
        const state = createGameState(board,
          makeTeam(PlayerSide.Left, [holderSide === PlayerSide.Left ? holder : other]),
          makeTeam(PlayerSide.Right, [holderSide === PlayerSide.Right ? holder : other]), matchingSide);
        const engine = new TurnEngine(state, new SeededRNG(5), nextId, new ExtensionRegistry());
        engine.takeInitialEvents();
        const events = engine.resolveAction({ type: 'swap', from: { row: 4, col: swapCol }, to: { row: 5, col: swapCol } });
        expect(events.some(e => e.type === 'elimination' && e.cells.length >= size)).toBe(true);
        expect(events.filter(e => e.type === 'status-apply' && ['stun', 'frozen', 'burning', 'entangle', 'marked', 'poison'].includes(e.statusId)))
          .toEqual([]);
        expect(other.statuses).toEqual([]);
      });
    }
  }
});

describe('TurnEngine real match integration', () => {
  it('elementalforce: a real four-gem swap applies two effects before board cascades', () => {
    const board = new BoardModel();
    const colors = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow];
    let nextId = 1;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        board.set({ row, col }, { id: nextId++, type: { kind: 'color', color: colors[(row + col) % 3]! } });
      }
    }
    for (let col = 0; col < 3; col++) {
      board.set({ row: 4, col }, { id: nextId++, type: { kind: 'color', color: BaseColor.Red } });
    }
    board.set({ row: 5, col: 3 }, { id: nextId++, type: { kind: 'color', color: BaseColor.Red } });
    const foe = makeChar(2);
    const state = createGameState(board,
      makeTeam(PlayerSide.Left, [makeChar(1, { traitIds: ['elementalforce'] })]),
      makeTeam(PlayerSide.Right, [foe]), PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(5), () => nextId++, new ExtensionRegistry());
    engine.takeInitialEvents();
    const events = engine.resolveAction({ type: 'swap', from: { row: 4, col: 3 }, to: { row: 5, col: 3 } });
    const firstBigMatch = events.findIndex(e => e.type === 'elimination' && e.cells.length >= 4);
    expect(firstBigMatch).toBeGreaterThanOrEqual(0);
    const firstStatuses = events.slice(firstBigMatch + 1).filter(e => e.type === 'status-apply').slice(0, 2);
    expect(firstStatuses).toHaveLength(2);
    expect(firstStatuses.every(e => e.targetId === foe.id)).toBe(true);
    expect(new Set(firstStatuses.map(e => e.statusId)).size).toBe(2);
    const nextElimination = events.findIndex((e, i) => i > firstBigMatch && e.type === 'elimination');
    expect(nextElimination === -1 || events.indexOf(firstStatuses[1]!) < nextElimination).toBe(true);
  });
});

describe('对局集成（TurnEngine）', () => {
  it('开局施加状态：vanguard 自身屏障 / roottrap 缠绕首敌 / swiftcurse 死亡标记随机敌', () => {
    const left = makeTeam(PlayerSide.Left, withPassives([makeChar(1, { traitIds: ['vanguard', 'roottrap', 'swiftcurse'] })]));
    const right = makeTeam(PlayerSide.Right, [makeChar(2), makeChar(3)]);
    const state = createGameState(freshBoard(7), left, right, PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(7), () => 0, new ExtensionRegistry());
    const events = engine.takeInitialEvents();
    const hero = state.teams[PlayerSide.Left].characters[0]!;
    expect(hero.statuses.some((s) => s.id === 'barrier')).toBe(true);
    // roottrap 缠绕敌方队首（确定性）；swiftcurse 死亡标记随机敌（2/3 其一）
    expect(state.teams[PlayerSide.Right].characters[0]!.statuses.some((s) => s.id === 'entangle')).toBe(true);
    expect(state.teams[PlayerSide.Right].characters.filter((c) => c.statuses.some((s) => s.id === 'death-mark'))).toHaveLength(1);
    expect(events.filter((e) => e.type === 'status-apply').length).toBeGreaterThanOrEqual(3);
  });

  it('battle-start random positive statuses choose an available effect and recipient', () => {
    const filled = RANDOM_POSITIVE_STATUS_POOL.map(id => ({ id, turns: 3 }));
    const holder = makeChar(1, { traitIds: ['serendipity'], statuses: filled.map(s => ({ ...s })) });
    const ally = makeChar(2, { statuses: filled.filter(s => s.id !== 'enchanted').map(s => ({ ...s })) });
    const state = createGameState(freshBoard(8), makeTeam(PlayerSide.Left, withPassives([holder, ally])),
      makeTeam(PlayerSide.Right, [makeChar(3)]), PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(8), () => 0, new ExtensionRegistry());
    expect(engine.takeInitialEvents().filter(e => e.type === 'status-apply' && e.statusId === 'enchanted'))
      .toMatchObject([{ targetId: 2 }]);
  });

  it('开局法力光环：inspiration 全队 15% / windspeed 黄色盟友 10%（fill-up-to 取最大比例）', () => {
    // manaCost 20：两个光环都是「补到 manaCost×ratio」口径（allyStartMana 既有语义），
    // 黄色盟友取 max(15%,10%) = 15% = 3；红色盟友只有 inspiration = 3。
    const yellowAlly = makeChar(11, { colors: [BaseColor.Yellow], mana: 0 });
    const redAlly = makeChar(12, { colors: [BaseColor.Red], mana: 0 });
    const left = makeTeam(PlayerSide.Left, withPassives([
      makeChar(10, { traitIds: ['inspiration', 'windspeed'] }),
      yellowAlly,
      redAlly,
    ]));
    const state = createGameState(freshBoard(7), left, makeTeam(PlayerSide.Right, [makeChar(13)]), PlayerSide.Left);
    new TurnEngine(state, new SeededRNG(7), () => 0, new ExtensionRegistry());
    expect(state.teams[PlayerSide.Left].characters[0]!.mana).toBe(3);
    expect(state.teams[PlayerSide.Left].characters[1]!.mana).toBe(3);
    expect(state.teams[PlayerSide.Left].characters[2]!.mana).toBe(3);
    // windspeed 单独持有（无 inspiration）时黄色盟友 10% = 2 生效
  });

  it('回合经济：lightfingers 在持有者方回合开始 +5 黄金（economy-gain 事件恰好一次）', () => {
    const left = makeTeam(PlayerSide.Left, withPassives([makeChar(1, { traitIds: ['lightfingers'] })]));
    const state = createGameState(freshBoard(7), left, makeTeam(PlayerSide.Right, [makeChar(2)]), PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(7), () => 0, new ExtensionRegistry());
    engine.takeInitialEvents();
    const goldBefore = state.economy.gold;
    // passTurn → 切到 Right（无持有者，零入账）；再 passTurn → 切回 Left，lightfingers 结算
    engine.passTurn();
    expect(state.economy.gold).toBe(goldBefore);
    engine.passTurn();
    expect(state.economy.gold).toBe(goldBefore + 5);
  });

  it('大匹配新键：banishment 驱散敌方正面 / lifesiphon 窃取首位 / purification 自净化', () => {
    const holder = makeChar(1, {
      traitIds: ['banishment', 'lifesiphon', 'purification'],
      statuses: [{ id: 'poison', turns: 3 }],
    });
    attachPassives(holder);
    const foe = makeChar(2, { statuses: [{ id: 'barrier', turns: 3 }], hp: 40 });
    applyBigMatchTriggers([holder], {
      size: 4,
      rng: new SeededRNG(1),
      enemyTeam: [foe],
      drainLife: (target, caster, amount) => {
        target.hp -= amount;
        caster.hp += amount;
        return [];
      },
    });
    expect(foe.statuses.some((s) => s.id === 'barrier')).toBe(false); // 驱散
    expect(foe.hp).toBe(38); // 窃取 2
    expect(holder.statuses.some((s) => s.id === 'poison')).toBe(false); // 自净化
  });

  it('elementalist hero keeps Elemental Force when the level-40 Deluge talent is selected', () => {
    const save = newSave({ now: 0, starterTroopIds: [7375, 6554, 6329] });
    save.character!.name = '叶落';
    save.hero.unlockedClasses.push('elementalist');
    expect(equipClass(save, 'elementalist')).toMatchObject({ ok: true });
    save.hero.classLevels.elementalist = 100;
    save.hero.classTraits.elementalist = [true, true, true];
    expect(pickTalent(save, 'elementalist', 4, 'deluge')).toMatchObject({ ok: true });
    for (const id of [7375, 6554, 6329]) save.collection[String(id)]!.traits = [true, true, true];
    expect(setTeamPreset(save, 0, {
      name: '叶落队',
      members: [{ kind: 'troop', troopId: 7375 }, { kind: 'hero' },
        { kind: 'troop', troopId: 6554 }, { kind: 'troop', troopId: 6329 }],
      bannerKingdomId: null,
    })).toMatchObject({ ok: true });
    const outcome = buildBattleRequest(save, planQuestEncounter('破碎尖塔', 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam[1]!;
    expect(hero.traitIds).toEqual(expect.arrayContaining(['deluge', 'elementalforce']));

    const { board, swapCol, nextId } = bigMatchBoard(4, BaseColor.Red);
    const allies = outcome.request.playerTeam.map((unit, i) =>
      makeChar(i + 1, { name: unit.name, traitIds: unit.traitIds }));
    const foe = makeChar(9);
    const state = createGameState(board, makeTeam(PlayerSide.Left, allies),
      makeTeam(PlayerSide.Right, [foe]), PlayerSide.Left);
    const engine = new TurnEngine(state, new SeededRNG(5), nextId, new ExtensionRegistry());
    engine.takeInitialEvents();
    const events = engine.resolveAction({ type: 'swap',
      from: { row: 4, col: swapCol }, to: { row: 5, col: swapCol } });
    expect(events.some(e => e.type === 'elimination' && e.cells.length >= 4)).toBe(true);
    expect(events.filter(e => e.type === 'status-apply' && e.targetId === foe.id
      && ['stun', 'frozen', 'burning', 'entangle'].includes(e.statusId))).toHaveLength(2);
    expect(events.some(e => e.type === 'status-apply' && e.statusId === 'submerged'
      && allies.some(ally => ally.id === e.targetId))).toBe(true);
  });

  it('elementalforce: 4+ match applies two distinct missing statuses, never refreshes existing ones', () => {
    const holder = makeChar(1, { traitIds: ['elementalforce'] });
    attachPassives(holder);
    const foe = makeChar(2, { statuses: [{ id: 'burning', turns: 3, magnitude: 1 }] });
    const rng = new SeededRNG(7);
    const trigger = (size: number) => applyBigMatchTriggers([holder], {
      size, enemyTeam: [foe], rng, applyStatus,
    });

    expect(trigger(3)).toEqual([]);
    expect(foe.statuses.map(s => s.id)).toEqual(['burning']);
    const first = trigger(4).filter(e => e.type === 'status-apply');
    expect(first).toHaveLength(2);
    expect(new Set(first.map(e => e.statusId)).size).toBe(2);
    expect(foe.statuses).toHaveLength(3);
    expect(foe.statuses.find(s => s.id === 'burning')).toMatchObject({ turns: 3, magnitude: 1 });

    const last = trigger(5).filter(e => e.type === 'status-apply');
    expect(last).toHaveLength(1);
    expect(new Set(foe.statuses.map(s => s.id))).toEqual(new Set(['stun', 'frozen', 'burning', 'entangle']));
    expect(trigger(4).filter(e => e.type === 'status-apply')).toHaveLength(0);
    expect(foe.statuses).toHaveLength(4);
  });

  it('elementalforce: chooses one eligible enemy then draws two statuses without replacement', () => {
    const holder = makeChar(1, { traitIds: ['elementalforce'] });
    attachPassives(holder);
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 32; seed++) {
      const foes = [makeChar(2), makeChar(3)];
      const applied = applyBigMatchTriggers([holder], {
        size: 4, enemyTeam: foes, rng: new SeededRNG(seed), applyStatus,
      }).filter(e => e.type === 'status-apply');
      expect(applied).toHaveLength(2);
      expect(new Set(applied.map(e => e.targetId)).size).toBe(1);
      expect(new Set(applied.map(e => e.statusId)).size).toBe(2);
      expect(foes.map(foe => foe.statuses.length).sort()).toEqual([0, 2]);
      outcomes.add(`${applied[0]!.targetId}:${applied.map(e => e.statusId).join(',')}`);
    }
    expect(outcomes.size).toBeGreaterThan(2);
  });

  it('elementalforce: skips a fully affected enemy, grants only remaining statuses', () => {
    const holder = makeChar(1, { traitIds: ['elementalforce'] });
    attachPassives(holder);
    const full = makeChar(2, { statuses: ['stun', 'frozen', 'burning', 'entangle'].map(id => ({ id, turns: 3 })) });
    const open = makeChar(3, { statuses: [{ id: 'burning', turns: 3 }] });
    const applied = applyBigMatchTriggers([holder], {
      size: 4, enemyTeam: [full, open], rng: new SeededRNG(1), applyStatus,
    }).filter(e => e.type === 'status-apply');
    expect(applied).toHaveLength(2);
    expect(applied.every(e => e.targetId === 3 && e.statusId !== 'burning')).toBe(true);
    expect(full.statuses).toHaveLength(4);
    expect(open.statuses).toHaveLength(3);

    const almostFull = makeChar(4, { statuses: ['stun', 'frozen', 'burning'].map(id => ({ id, turns: 3 })) });
    expect(applyBigMatchTriggers([holder], { size: 4, enemyTeam: [almostFull], rng: new SeededRNG(1), applyStatus })
      .filter(e => e.type === 'status-apply')).toMatchObject([{ targetId: 4, statusId: 'entangle' }]);
    expect(applyBigMatchTriggers([holder], { size: 4, enemyTeam: [full], rng: new SeededRNG(1), applyStatus }))
      .toEqual([]);
  });

  it('elementalforce: blocking effects emit blocked events rather than silently selecting a full target', () => {
    const holder = makeChar(1, { traitIds: ['elementalforce'] });
    attachPassives(holder);
    const blessed = makeChar(2, { statuses: [{ id: 'blessed', turns: 3 }] });
    const events = applyBigMatchTriggers([holder], {
      size: 4, enemyTeam: [blessed], rng: new SeededRNG(1), applyStatus,
    });
    expect(events.filter(e => e.type === 'status-blocked' && e.reason === 'blessed')).toHaveLength(2);
    expect(blessed.statuses.map(s => s.id)).toEqual(['blessed']);
  });

  it('死亡链：savior 盟友死→同队随机存活屏障；chillofdeath/risingshadows 走敌方死亡链不炸', () => {
    const savior = makeChar(1, { traitIds: ['savior'] });
    const dyingAlly = makeChar(2, { defeated: true }); // 模拟已阵亡（行动末尾已移出编队前的状态）
    attachPassives(savior);
    applyDeathTriggers([savior, dyingAlly], [makeChar(3)], statusCtx(new SeededRNG(1)));
    expect(savior.statuses.some((s) => s.id === 'barrier')).toBe(true);

    const watcher = makeChar(4, { traitIds: ['chillofdeath', 'risingshadows'] });
    const lastFoe = makeChar(5, { hp: 1 });
    attachPassives(watcher);
    const ctx = statusCtx(new SeededRNG(3));
    const events = applyEnemyDeathTriggers([watcher], [lastFoe], ctx);
    // chillofdeath 必然冻结死者一方剩余存活（lastFoe 是唯一目标）
    expect(lastFoe.statuses.some((s) => s.id === 'frozen')).toBe(true);
    expect(Array.isArray(events)).toBe(true);
  });

  it('chaoswave：骷髅匹配时敌方全员随机技能 -1（每个敌人恰好一项属性掉 1）', () => {
    const holder = makeChar(1, { traitIds: ['chaoswave'] });
    attachPassives(holder);
    const foeA = makeChar(2, { attack: 5, armor: 5, magic: 5, mana: 10, manaCost: 20 });
    const foeB = makeChar(3, { attack: 5, armor: 5, magic: 5, mana: 10, manaCost: 20 });
    const before = [foeA, foeB].map((f) => ({ a: f.attack, ar: f.armor, m: f.magic, mana: f.mana }));
    applyColorMatchTriggers([holder], 'skull', { enemyTeam: [foeA, foeB], rng: new SeededRNG(1) });
    for (const [i, foe] of [foeA, foeB].entries()) {
      const b = before[i]!;
      const dropped =
        b.a - foe.attack + b.ar - foe.armor + b.m - foe.magic + Math.max(0, b.mana - foe.mana);
      expect(dropped).toBe(1);
    }
  });
});

// ============================================================
// meta 集成
// ============================================================

describe('meta 集成（classes.json ↔ 动态定义 ↔ 桥接）', () => {
  it('classes.json 中所有 unimplemented 天赋都有动态定义（v3 全量收编）', () => {
    const unimplemented = new Set<string>();
    for (const cls of CLASSES) {
      for (const tree of cls.trees) {
        for (const t of tree.talents) {
          if (t.effect.kind === 'unimplemented') unimplemented.add(t.code);
        }
      }
    }
    expect(unimplemented.size).toBeGreaterThan(0);
    for (const code of unimplemented) {
      expect(TALENT_DYNAMIC_CODES.has(code)).toBe(true);
      expect(TALENT_DYNAMIC_DEFS.find((d) => d.code === code)).toBeTruthy();
    }
  });

  it('特质收编：classes.json 全部 unimplemented 特质都有动态定义（38/38）', () => {
    const unimplemented = new Set<string>();
    for (const cls of CLASSES) {
      for (const perk of cls.perks) {
        if (!perk.implemented) unimplemented.add(perk.code);
      }
    }
    expect(unimplemented.size).toBe(38);
    for (const code of unimplemented) {
      expect(PERK_DYNAMIC_DEFS.find((d) => d.code === code)).toBeTruthy();
    }
    // 抽查编译
    expect(resolvePassives(['fullplate']).regenArmorPerTurn).toBe(2);
    expect(resolvePassives(['bullseye']).skullLethalChance).toBe(0.15);
    expect(resolvePassives(['assassinate']).onSkullHitKill).toEqual({ chance: 0.1, scope: 'lastEnemy' });
    expect(getTrait('wrathofanu')?.turnStartStatus).toMatchObject({ target: 'randomEnemy', chance: 0.5 });
    expect(getTrait('stormsoul')?.turnStartStorm).toMatchObject({ referenceName: 'Lightstorm' });
    expect(resolvePassives(['portent']).onEnemyCastTypeAura).toEqual({ troopType: 'Centaur', gains: { magic: 2 } });
  });

  it('PvP 天赋：exemplar/bloodandglory 已注册（pvpMode 注入后生效；本批引擎接线）', () => {
    expect(PVP_DYNAMIC_DEFS.map((d) => d.code).sort()).toEqual(['bloodandglory', 'exemplar']);
    expect(resolvePassives(['exemplar']).pvpBonuses).toEqual([{ phase: 'battle', gains: { attack: 5 } }]);
    expect(resolvePassives(['bloodandglory']).pvpEconomyGain).toEqual({ currency: 'gold', amount: 1 });
  });

  it('图标：静态天赋 code 经显示兜底出图标（主角卡同兵种特质口径）', () => {
    // 动态定义天赋走引擎定义
    expect(traitBadgeSvg('fasthealing')).toContain('svg');
    // 静态效果天赋（无引擎定义）走显示兜底
    expect(traitBadgeSvg('ferocity')).toContain('svg'); // 督军 War T1 自身攻击
    expect(traitBadgeSvg('armoroflight')).toContain('svg'); // 全队护甲（战旗族）
    expect(traitBadgeSvg('shiningstaff')).toContain('svg'); // 武器条件（剑族）
    // 未实现且未收编的 code 才返回 null
    expect(traitBadgeSvg('nonexistent_code_xyz')).toBeNull();
  });

  it('桥接：选中动态天赋进入主角 traitIds 且过会话校验', () => {
    const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    s.hero.unlockedClasses.push('warrior');
    equipClass(s, 'warrior');
    s.hero.classLevels['warrior'] = 100;
    // 督军 War 树 T5（Lv.40 档）= vengeance（动态定义）
    const warlord = CLASSES.find((c) => c.id === 'warrior')!;
    const vengeance = warlord.trees[0]!.talents[4]!;
    expect(vengeance.code).toBe('vengeance');
    expect(pickTalent(s, 'warrior', 4, 'vengeance')).toMatchObject({ ok: true });
    setTeamPreset(s, 0, {
      name: 't',
      members: [{ kind: 'hero' }, { kind: 'troop', troopId: 6000 }, { kind: 'troop', troopId: 6097 }],
      bannerKingdomId: null,
    });
    const outcome = buildBattleRequest(s, planQuestEncounter('破碎尖塔', 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.traitIds).toContain('vengeance');
  });
});
