/**
 * 条件光环批测试（「在配对 4 或 5 颗宝石时…」族，窗口 E 特质子agent）。
 *
 * 覆盖：
 *   - 编译正确性：代表 code → resolvePassives 产物断言（大连状态/配色光环/净化/敌方触发/5 连限定/多属性配色）。
 *   - 触发集成：纯函数层（applyBigMatchTriggers + ctx）与真实对局层（TurnEngine 手工棋盘 4/5 连、骷髅配对）。
 *   - 护栏：无新键特质的对局，随机数消耗与事件数与改动前基线逐字节一致（基线在改动前采集）。
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePassives,
  neutralPassives,
  getTrait,
  attachPassives,
  applyBigMatchTriggers,
} from '@engine/traits';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardModel } from '@engine/BoardModel';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { PlayerSide, BaseColor } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { colorGem, skullGem } from '@engine/types';

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

/** 施加状态上下文的最小实现：直接改 statuses 并发 status-apply（与引擎注入口径一致） */
const statusCtx = {
  applyStatus: (char: Character, status: { id: string; turns: number; magnitude?: number }) => {
    char.statuses.push({ ...status });
    return [{ type: 'status-apply', targetId: char.id, statusId: status.id, turns: status.turns } as GameEvent];
  },
};

// ============================================================
// 编译正确性
// ============================================================

describe('编译正确性（代表 code → resolvePassives 产物）', () => {
  it('celestialshield：4/5 连给自身屏障', () => {
    expect(getTrait('celestialshield')?.onBigMatchStatus).toEqual({
      scope: 'self', statuses: [{ id: 'barrier' }], turns: 3,
    });
    const p = resolvePassives(['celestialshield']);
    expect(p.onBigMatchStatus?.scope).toBe('self');
    expect(p.onBigMatchStatus?.statuses[0]?.id).toBe('barrier');
  });

  it('giftoftreachery：全部技能值 = 四项各 4（种族光环）', () => {
    expect(getTrait('giftoftreachery')?.onBigMatchTypeAura).toEqual({
      troopType: 'Naga', gains: { hp: 4, armor: 4, attack: 4, magic: 4 },
    });
    expect(resolvePassives(['giftoftreachery']).bigMatchTypeAura.Naga).toEqual({
      hp: 4, armor: 4, attack: 4, magic: 4, mana: 0,
    });
  });

  it('celestialtemper / powerofstars：配色光环（红色盟友 +4 攻 / 骷髅键全队四项各 1）', () => {
    const temper = resolvePassives(['celestialtemper']).colorMatchTypeAura;
    expect(temper.Red.Red).toEqual({ hp: 0, armor: 0, attack: 4, magic: 0, mana: 0 });
    const stars = resolvePassives(['powerofstars']).colorMatchTypeAura;
    expect(Object.keys(stars)).toEqual(['skull']);
    expect(stars.skull.all).toEqual({ hp: 1, armor: 1, attack: 1, magic: 1, mana: 0 });
  });

  it('insanegrowth：「配对 5 或 5 颗」只认 5 连（minSize 限定）', () => {
    expect(getTrait('insanegrowth')?.onBigMatchSizedGain).toEqual({ minSize: 5, stat: 'magic', amount: 4 });
    expect(resolvePassives(['insanegrowth']).gainOnBigMatchSized).toEqual({ '5': { hp: 0, armor: 0, attack: 0, magic: 4, mana: 0 } });
  });

  it('ragingbull：共享数值多属性（红匹配 → 攻/甲/血各 2）', () => {
    expect(getTrait('ragingbull')?.onColorMatchGain).toEqual({
      color: 'Red', stat: 'attack', amount: 2, alsoStats: ['armor', 'hp'],
    });
    expect(resolvePassives(['ragingbull']).gainOnColorMatch.Red).toEqual({
      hp: 2, armor: 2, attack: 2, magic: 0, mana: 0,
    });
  });

  it('rancor / adagio / royalhoney：敌方骷髅触发、配色净化、大连净化', () => {
    expect(resolvePassives(['rancor']).gainOnEnemyColorMatch.skull).toEqual({
      hp: 0, armor: 0, attack: 3, magic: 0, mana: 0,
    });
    expect(resolvePassives(['adagio']).cleanseOnColorMatch).toEqual(['Yellow']);
    expect(resolvePassives(['royalhoney']).cleanseOnBigMatch).toBe(true);
  });

  it('dragonsblessing / lotusblessing / bloodmark：随机正面增益池、50% 概率、敌方全队出血', () => {
    const dragon = resolvePassives(['dragonsblessing']).onBigMatchStatus;
    expect(dragon?.randomPositive).toBe(true);
    expect(dragon?.statuses.map((s) => s.id).sort()).toEqual(['barrier', 'blessed', 'enchanted', 'rage', 'reflect']);
    const lotus = resolvePassives(['lotusblessing']).onBigMatchStatus;
    expect(lotus?.chance).toBe(0.5);
    expect(lotus?.scope).toBe('allAllies');
    const mark = resolvePassives(['bloodmark']).onBigMatchStatus;
    expect(mark?.scope).toBe('allEnemies');
    expect(mark?.statuses).toEqual([{ id: 'bleed', magnitude: 1 }]);
  });

  it('terrorqueen / gapingwounds / icyterror：4+ 连给随机敌人恐怖（T5 批：恐怖入条件光环状态表）', () => {
    expect(getTrait('terrorqueen')?.onBigMatchStatus).toEqual({
      scope: 'randomEnemy', statuses: [{ id: 'terror' }], turns: 3,
    });
    // 双状态族条目序与描述一致（出血与恐怖 / 冻结和恐怖）；DoT 段带 magnitude
    expect(getTrait('gapingwounds')?.onBigMatchStatus?.statuses).toEqual([
      { id: 'bleed', magnitude: 1 }, { id: 'terror' },
    ]);
    expect(getTrait('icyterror')?.onBigMatchStatus?.statuses).toEqual([
      { id: 'frozen' }, { id: 'terror' },
    ]);
    expect(getTrait('icyterror')?.onBigMatchStatus?.scope).toBe('randomEnemy');
  });

  it('manifestation / hunger：配对骷髅头 → 持有者四项各 N（onColorMatchGain skull 键）', () => {
    expect(getTrait('manifestation')?.onColorMatchGain).toEqual({
      color: 'skull', stat: 'hp', amount: 5, alsoStats: ['armor', 'attack', 'magic'],
    });
    expect(resolvePassives(['hunger']).gainOnColorMatch.skull).toEqual({
      hp: 2, armor: 2, attack: 2, magic: 2, mana: 0,
    });
  });

  it('新键编译后与中性被动有差异且编译为纯函数', () => {
    const codes = ['celestialshield', 'secondhelping', 'tsunami', 'huntress', 'crystallizedmana', 'boo'];
    for (const code of codes) {
      expect(JSON.stringify(resolvePassives([code]))).not.toBe(JSON.stringify(neutralPassives()));
    }
    expect(JSON.stringify(resolvePassives(codes))).toBe(JSON.stringify(resolvePassives(codes)));
  });
});

// ============================================================
// 触发集成 · 纯函数层
// ============================================================

describe('applyBigMatchTriggers + ctx（纯函数层）', () => {
  it('provocation：4 连给随机一名盟友狂怒（rng 注入）', () => {
    const holder = makeChar(0, { traitIds: ['provocation'] });
    attachPassives(holder);
    const allies = [holder, makeChar(1), makeChar(2)];
    const rng = new SeededRNG(3);
    const events = applyBigMatchTriggers(allies, { size: 4, rng, ...statusCtx });
    const rage = allies.filter((c) => c.statuses.some((s) => s.id === 'rage'));
    expect(rage.length).toBe(1);
    expect(events.some((e) => e.type === 'status-apply')).toBe(true);
  });

  it('deepwater / tsunami：自己下潜 vs 全队下潜', () => {
    const self = makeChar(0, { traitIds: ['deepwater'] });
    attachPassives(self);
    applyBigMatchTriggers([self, makeChar(1)], { size: 4, ...statusCtx });
    expect(self.statuses.some((s) => s.id === 'submerged')).toBe(true);
    expect(self.statuses).toHaveLength(1); // 只有自己

    const tsunami = makeChar(0, { traitIds: ['tsunami'] });
    attachPassives(tsunami);
    const team = [tsunami, makeChar(1), makeChar(2)];
    applyBigMatchTriggers(team, { size: 5, ...statusCtx });
    expect(team.every((c) => c.statuses.some((s) => s.id === 'submerged'))).toBe(true);
  });

  it('insanegrowth：size=4 不触发、size=5 触发（magic +4）', () => {
    const char = makeChar(0, { traitIds: ['insanegrowth'], magic: 8 });
    attachPassives(char);
    applyBigMatchTriggers([char], { size: 4 });
    expect(char.magic).toBe(8);
    const events = applyBigMatchTriggers([char], { size: 5 });
    expect(char.magic).toBe(12);
    expect(events.some((e) => e.type === 'buff' && e.stat === 'magic' && e.amount === 4)).toBe(true);
  });

  it('lotusblessing：50% 概率受 rng 控制；无 rng 不生效（召唤口径）', () => {
    // 找一个「首掷 <0.5」与一个「首掷 >=0.5」的种子，两种分支都锁定
    let hitSeed = -1;
    let missSeed = -1;
    for (let seed = 0; seed < 50 && (hitSeed < 0 || missSeed < 0); seed++) {
      if (new SeededRNG(seed).next() < 0.5) {
        if (hitSeed < 0) hitSeed = seed;
      } else if (missSeed < 0) {
        missSeed = seed;
      }
    }
    expect(hitSeed).toBeGreaterThanOrEqual(0);
    expect(missSeed).toBeGreaterThanOrEqual(0);
    const drive = (seed: number, withRng: boolean) => {
      const char = makeChar(0, { traitIds: ['lotusblessing'] });
      attachPassives(char);
      applyBigMatchTriggers([char], {
        size: 4,
        ...(withRng ? { rng: new SeededRNG(seed) } : {}),
        ...statusCtx,
      });
      return char.statuses.some((s) => s.id === 'blessed');
    };
    expect(drive(hitSeed, true)).toBe(true);
    expect(drive(missSeed, true)).toBe(false);
    expect(drive(hitSeed, false)).toBe(false);
  });

  it('bloodmark：4 连使敌方全队出血（magnitude 1），不影响己方', () => {
    const holder = makeChar(0, { traitIds: ['bloodmark'] });
    attachPassives(holder);
    const foes = [makeChar(9), makeChar(10)];
    applyBigMatchTriggers([holder], { size: 4, ...statusCtx, enemyTeam: foes });
    expect(foes.every((f) => f.statuses.some((s) => s.id === 'bleed' && s.magnitude === 1))).toBe(true);
    expect(holder.statuses).toHaveLength(0);
  });

  it('winterveil：4 连冻结随机一名敌人（randomEnemy，目标只落在敌方）', () => {
    const holder = makeChar(0, { traitIds: ['winterveil'] });
    attachPassives(holder);
    const allies = [holder, makeChar(1)];
    const foes = [makeChar(9), makeChar(10)];
    const events = applyBigMatchTriggers(allies, { size: 4, rng: new SeededRNG(3), ...statusCtx, enemyTeam: foes });
    const frozenFoes = foes.filter((f) => f.statuses.some((s) => s.id === 'frozen'));
    expect(frozenFoes.length).toBe(1);
    expect(allies.every((a) => a.statuses.length === 0)).toBe(true);
    expect(events.some((e) => e.type === 'status-apply')).toBe(true);
    // 敌方全灭时安全跳过
    const dead = makeChar(11, { defeated: true });
    expect(() => applyBigMatchTriggers([holder], { size: 4, rng: new SeededRNG(3), ...statusCtx, enemyTeam: [dead] })).not.toThrow();
  });

  it('terrorqueen：4+ 连使随机一名敌人陷入恐怖（terror 本体，randomEnemy）', () => {
    const holder = makeChar(0, { traitIds: ['terrorqueen'] });
    attachPassives(holder);
    const allies = [holder, makeChar(1)];
    const foes = [makeChar(9), makeChar(10)];
    const events = applyBigMatchTriggers(allies, { size: 4, rng: new SeededRNG(3), ...statusCtx, enemyTeam: foes });
    const terrorFoes = foes.filter((f) => f.statuses.some((s) => s.id === 'terror'));
    expect(terrorFoes.length).toBe(1);
    expect(allies.every((a) => a.statuses.length === 0)).toBe(true);
    expect(events.some((e) => e.type === 'status-apply' && e.statusId === 'terror')).toBe(true);
    // size=3（非大连）不触发；敌方全灭安全跳过
    applyBigMatchTriggers(allies, { size: 3, rng: new SeededRNG(3), ...statusCtx, enemyTeam: foes });
    expect(terrorFoes.length).toBe(1);
    const dead = makeChar(11, { defeated: true });
    expect(() => applyBigMatchTriggers([holder], { size: 4, rng: new SeededRNG(3), ...statusCtx, enemyTeam: [dead] })).not.toThrow();
  });

  it('royalhoney：净化移除负面（中毒/死亡标记）保留正面（屏障）', () => {
    const char = makeChar(0, { traitIds: ['royalhoney'] });
    char.statuses.push({ id: 'poison', turns: 3, magnitude: 2 }, { id: 'barrier', turns: 3 }, { id: 'rage', turns: 2 });
    attachPassives(char);
    const events = applyBigMatchTriggers([char], { size: 4 });
    const ids = char.statuses.map((s) => s.id);
    expect(ids).toContain('barrier');
    expect(ids).toContain('rage');
    expect(ids).not.toContain('poison');
    const cleanse = events.find((e) => e.type === 'status-cleanse');
    expect(cleanse && 'statusIds' in cleanse && cleanse.statusIds).toEqual(['poison']);
  });

  it('无 ctx 时新效果全部跳过（纯逻辑环境安全路径）', () => {
    const char = makeChar(0, { traitIds: ['celestialshield', 'lotusblessing', 'provocation'] });
    attachPassives(char);
    const events = applyBigMatchTriggers([char], { size: 4 });
    expect(events).toEqual([]);
    expect(char.statuses).toHaveLength(0);
  });
});

// ============================================================
// 触发集成 · 真实对局（TurnEngine 手工棋盘）
// ============================================================

interface LocalEngine {
  engine: TurnEngine;
  board: BoardModel;
  rng: SeededRNG;
}

/** 底行构造「交换 (7,2)<->(6,2) 后成 N 连红」的局面（palette 染色保证无其它红干扰） */
function buildWithNMatch(nRed: 4 | 5, playerChars: Character[], enemyChars: Character[], seed = 5): LocalEngine {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
    }
  }
  // 底行：交换 (7,2)<->(6,2) 后 (7,0..nRed-1) 恰好 N 连红；(7,2) 原绿、(6,2) 备红；
  // 第 N+1 列起用 palette 色兜住，避免红跑变长
  for (let c = 0; c < 8; c++) {
    const isRedCol = c < nRed && c !== 2;
    board.set({ row: 7, col: c }, { id: 70 + c, type: colorGem(isRedCol ? BaseColor.Red : palette[c % 4]) });
  }
  board.set({ row: 6, col: 2 }, { id: 62, type: colorGem(BaseColor.Red) });
  // (5,2) 与 (6,2) 异色，避免纵向干扰
  board.set({ row: 5, col: 2 }, { id: 52, type: colorGem(BaseColor.Blue) });

  const rng = new SeededRNG(seed);
  const idGen = (() => { let n = 700; return () => ++n; })();
  const state = createGameState(
    board,
    makeTeam(PlayerSide.Left, playerChars),
    makeTeam(PlayerSide.Right, enemyChars),
  );
  return { engine: new TurnEngine(state, rng, idGen, new ExtensionRegistry()), board, rng };
}

describe('TurnEngine 集成：真实对局中的条件光环', () => {
  it('4 连红 → celestialshield 自身获得屏障（status-apply 事件 + 状态在身）', () => {
    const hero = makeChar(0, { traitIds: ['celestialshield'] });
    attachPassives(hero);
    const { engine } = buildWithNMatch(4, [hero, makeChar(1)], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    const apply = events.find((e) => e.type === 'status-apply' && e.statusId === 'barrier');
    expect(apply).toBeDefined();
    expect(hero.statuses.some((s) => s.id === 'barrier')).toBe(true);
  });

  it('4 连红 → secondhelping 给哥布林盟友 +5 生命（抬上限），非哥布林不受影响', () => {
    const goblin = makeChar(1, { troopTypes: ['Goblin'], hp: 50, maxHp: 50 });
    const normal = makeChar(2, { hp: 50, maxHp: 50 });
    const holder = makeChar(0, { traitIds: ['secondhelping'] });
    attachPassives(holder);
    const { engine } = buildWithNMatch(4, [holder, goblin, normal], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(goblin.maxHp).toBe(55);
    expect(goblin.hp).toBe(55);
    expect(normal.maxHp).toBe(50);
    expect(events.some((e) => e.type === 'buff' && e.stat === 'hp' && e.amount === 5)).toBe(true);
  });

  it('insanegrowth：4 连不触发、5 连 magic +4（minSize 限定在真实对局生效）', () => {
    // 断言读 state 里的角色对象（createGameState 可能拷贝入参）
    const four = buildWithNMatch(4, [makeChar(0, { traitIds: ['insanegrowth'], magic: 8 }), makeChar(1)], [makeChar(4), makeChar(5)]);
    attachPassives(four.engine.getState().teams[PlayerSide.Left].characters[0]);
    four.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(four.engine.getState().teams[PlayerSide.Left].characters[0].magic).toBe(8);

    const five = buildWithNMatch(5, [makeChar(0, { traitIds: ['insanegrowth'], magic: 8 }), makeChar(1)], [makeChar(4), makeChar(5)]);
    attachPassives(five.engine.getState().teams[PlayerSide.Left].characters[0]);
    const events = five.engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(events.some((e) => e.type === 'buff' && e.stat === 'magic')).toBe(true);
    expect(five.engine.getState().teams[PlayerSide.Left].characters[0].magic).toBe(12);
  });

  it('celestialtemper：红色匹配给所有红色盟友 +4 攻（colorMatchTypeAura）', () => {
    const red = makeChar(0, { colors: [BaseColor.Red], attack: 5 });
    const blue = makeChar(1, { colors: [BaseColor.Blue], attack: 5, troopTypes: [] });
    const holder = makeChar(2, { traitIds: ['celestialtemper'], colors: [BaseColor.Purple] });
    attachPassives(holder);
    const { engine } = buildWithNMatch(4, [red, blue, holder], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(red.attack).toBe(9);
    expect(blue.attack).toBe(5);
    expect(events.some((e) => e.type === 'buff' && e.targetId === red.id && e.stat === 'attack' && e.amount === 4)).toBe(true);
  });

  it('敌方配对骷髅 → rancor 自己 +3 攻（gainOnEnemyColorMatch，skull 键）', () => {
    const rancor = makeChar(4, { traitIds: ['rancor'], attack: 5 });
    attachPassives(rancor);
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    // 底行骷髅 (7,0)/(7,2)，(6,1) 备骷髅、(7,1) 原绿：交换 (7,1)<->(6,1) 后底行三骷髅。
    // 三消骷髅由当前行动方（左队）匹配 → 右队的 rancor 持有者应获得攻击。
    board.set({ row: 7, col: 0 }, { id: 70, type: skullGem() });
    board.set({ row: 7, col: 2 }, { id: 72, type: skullGem() });
    board.set({ row: 7, col: 1 }, { id: 71, type: colorGem(BaseColor.Green) });
    board.set({ row: 6, col: 1 }, { id: 61, type: skullGem() });
    const idGen = (() => { let n = 800; return () => ++n; })();
    const rng = new SeededRNG(11);
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [makeChar(0), makeChar(1)]),
      makeTeam(PlayerSide.Right, [rancor, makeChar(5)]),
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(rancor.attack).toBe(8);
    expect(events.some((e) => e.type === 'buff' && e.stat === 'attack' && e.amount === 3)).toBe(true);
  });

  it('配对骷髅 → hunger 持有者四项各 +2（onColorMatchGain skull 键，真实对局）', () => {
    const hungry = makeChar(0, { traitIds: ['hunger'], hp: 50, maxHp: 50, attack: 5, armor: 0, magic: 8 });
    attachPassives(hungry);
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: colorGem(palette[(r + c) % 4]) });
      }
    }
    // 与 rancor 用例同款底行骷髅布局：交换 (7,1)<->(6,1) 后底行三骷髅，由当前行动方（左队）匹配
    board.set({ row: 7, col: 0 }, { id: 70, type: skullGem() });
    board.set({ row: 7, col: 2 }, { id: 72, type: skullGem() });
    board.set({ row: 7, col: 1 }, { id: 71, type: colorGem(BaseColor.Green) });
    board.set({ row: 6, col: 1 }, { id: 61, type: skullGem() });
    const idGen = (() => { let n = 900; return () => ++n; })();
    const rng = new SeededRNG(11);
    const state = createGameState(
      board,
      makeTeam(PlayerSide.Left, [hungry, makeChar(1)]),
      makeTeam(PlayerSide.Right, [makeChar(4), makeChar(5)]),
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(hungry.attack).toBe(7);
    expect(hungry.magic).toBe(10);
    expect(hungry.armor).toBe(2);
    expect(hungry.maxHp).toBe(52);
    expect(events.some((e) => e.type === 'buff' && e.targetId === hungry.id && e.stat === 'attack' && e.amount === 2)).toBe(true);
  });

  it('royalhoney：4 连净化全队的中毒（真实对局）', () => {
    const honey = makeChar(0, { traitIds: ['royalhoney'] });
    honey.statuses.push({ id: 'poison', turns: 3, magnitude: 2 });
    const mate = makeChar(1);
    mate.statuses.push({ id: 'poison', turns: 2, magnitude: 1 });
    attachPassives(honey);
    const { engine } = buildWithNMatch(4, [honey, mate], [makeChar(4), makeChar(5)]);
    const events = engine.resolveSwap({ row: 7, col: 2 }, { row: 6, col: 2 });
    expect(honey.statuses.some((s) => s.id === 'poison')).toBe(false);
    expect(mate.statuses.some((s) => s.id === 'poison')).toBe(false);
    expect(events.some((e) => e.type === 'status-cleanse')).toBe(true);
  });
});

// ============================================================
// 护栏 · 无新键特质的对局随机序列不变
// ============================================================

describe('护栏 · 无新键特质的对局随机序列不变', () => {
  function build(seed: number): { engine: TurnEngine; state: ReturnType<typeof createGameState>; rng: SeededRNG } {
    const idGen = (() => { let n = 500; return () => ++n; })();
    const rng = new SeededRNG(seed);
    const board = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(
      board,
      {
        player: PlayerSide.Left,
        characters: [
          // legacy 4/5 连特质：自身增益 + 种族光环（光环受益者也给同一种族）
          makeChar(0, { traitIds: ['huge', 'firstwargare'] }),
          makeChar(1, { troopTypes: ['Wargare'] }),
          makeChar(2),
        ],
      },
      { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] },
    );
    const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());
    return { engine, state, rng };
  }

  function drive(seed: number, turns: number): { rngState: number; eventCount: number } {
    const { engine, state, rng } = build(seed);
    let count = 0;
    for (let i = 0; i < turns; i++) {
      if (state.state === 'GameOver') break;
      const swap = chooseEnemySwap(state.board, rng);
      if (!swap) break;
      count += engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b }).length;
    }
    return { rngState: rng.getState(), eventCount: count };
  }

  it('多组种子下 rng 终态与事件数与改前基线逐字节一致', () => {
    // 基线说明：本组数字在条件光环批**改动前**采集（legacy 特质对局）。
    // 触发器扩展对「不含新键特质」的对局必须零随机消耗、零额外事件——
    // 若触发器意外消耗随机数或多发事件，rngState/eventCount 会偏离基线而红。
    const BASELINE: Record<number, { rngState: number; eventCount: number }> = {
      7: { rngState: 1496707235, eventCount: 77 },
      42: { rngState: 2440672625, eventCount: 95 },
      2026: { rngState: 1368826860, eventCount: 87 },
    };
    for (const [seed, expected] of Object.entries(BASELINE)) {
      expect({ seed: Number(seed), ...drive(Number(seed), 12) })
        .toEqual({ seed: Number(seed), ...expected });
    }
  });

  it('同一驱动跑两遍事件流完全一致（确定性）', () => {
    const run = () => {
      const { engine, state, rng } = build(7);
      const events: GameEvent[] = [];
      for (let i = 0; i < 12; i++) {
        if (state.state === 'GameOver') break;
        const swap = chooseEnemySwap(state.board, rng);
        if (!swap) break;
        events.push(...engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b }));
      }
      return JSON.stringify(events);
    };
    expect(run()).toBe(run());
  });
});
