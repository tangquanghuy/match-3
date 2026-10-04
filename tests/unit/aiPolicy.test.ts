import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { chooseAiAction, evaluateSwaps, firstCastableCharacter } from '@engine/aiPolicy';
import { chooseEnemySwap } from '@engine/ai';
import { skill, transform, extraTurn } from '@engine/skills/builders';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { COMMUNITY_TROOPS, HUIJIU_SPELL_ID, WANGFENG_SPELL_ID } from '../../src/data/communityTroops';
import { BaseColor, MatchState, PlayerSide, colorGem, skullGem } from '@engine/types';
import type { BattleAction, CellPos, Character, GemType } from '@engine/types';
import type { SkillPrototype } from '@engine/skills/prototypes';

/**
 * 棋盘字符布局：R 红 / B 蓝 / S 骷髅；'.' 用「无合法交换」的填充色（棕/紫/黄/绿按
 * (row + 2·col) mod 4 排布：横向两色交替、纵向四色轮转，任何相邻交换都成不了三连）。
 * 因此棋盘上的合法交换只来自布局里显式写出的宝石。
 */
const FILLER = [BaseColor.Brown, BaseColor.Purple, BaseColor.Yellow, BaseColor.Green];
let gemId = 1;
function board(layout: string[]): BoardModel {
  const b = new BoardModel();
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const ch = layout[row]?.[col] ?? '.';
      const type: GemType = ch === 'R' ? colorGem(BaseColor.Red)
        : ch === 'B' ? colorGem(BaseColor.Blue)
          : ch === 'S' ? skullGem()
            : colorGem(FILLER[(row + 2 * col) % 4]);
      b.set({ row, col }, { id: gemId++, type });
    }
  }
  return b;
}

function char(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `c${id}`, maxHp: 30, hp: 30, attack: 3, armor: 0, magic: 2,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: `s${id}`, statuses: [], defeated: false,
    ...over,
  };
}

function stateOf(layout: string[], left: Character[], right: Character[] = [char(100), char(101)]) {
  const state = createGameState(board(layout), { player: PlayerSide.Left, characters: left }, { player: PlayerSide.Right, characters: right });
  state.activePlayer = PlayerSide.Left;
  state.state = MatchState.AwaitingInput;
  return state;
}

const key = (p: CellPos) => `${p.row},${p.col}`;
function swapKeys(action: BattleAction | undefined): string[] {
  if (!action || action.type !== 'swap') return [];
  return [key(action.from), key(action.to)].sort();
}

describe('aiPolicy：决策优先级', () => {
  it('填充色棋盘本身没有任何合法交换（夹具自检）', () => {
    const s = stateOf([], [char(1)]);
    expect(evaluateSwaps(s, PlayerSide.Left)).toEqual([]);
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1) })).toBeNull();
  });

  it('1. 有 4 连交换时先交换，即便有满法力可施法的角色', () => {
    const s = stateOf([
      'RR.R....',
      '..R.....',
    ], [char(1, { mana: 10 })]);
    const d = chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1) });
    expect(d?.reason).toBe('big-match');
    expect(swapKeys(d?.action)).toEqual(['0,2', '1,2']);
  });

  it('1. 5 连 / T 型高于普通 4 连', () => {
    const five = stateOf([
      'BB.B....',
      '..B.....',
      '........',
      '........',
      'RR.RR...',
      '..R.....',
    ], [char(1)]);
    const d5 = chooseAiAction({ state: five, side: PlayerSide.Left, rng: new SeededRNG(1) });
    expect(swapKeys(d5?.action)).toEqual(['4,2', '5,2']);

    // T 型：交换后 (1,3) 同时连起横向 (1,1..3) 与纵向 (0..2,3)
    const tee = stateOf([
      '...R....',
      '.RRBR...',
      '...R....',
      '........',
      '........',
      'BB.B....',
      '..B.....',
    ], [char(1)]);
    const dt = chooseAiAction({ state: tee, side: PlayerSide.Left, rng: new SeededRNG(1) });
    expect(dt?.reason).toBe('big-match');
    expect(swapKeys(dt?.action)).toEqual(['1,3', '1,4']);
  });

  it('2. 没有大消时施法：按队伍顺序取第一个引擎会受理的角色', () => {
    const s = stateOf(['SS......', '..S.....'], [
      char(1, { mana: 10, defeated: true }),
      char(2, { mana: 10, statuses: [{ id: 'silence', turns: 2 }] }),
      char(3, { mana: 9 }),
      char(4, { mana: 10 }),
      char(5, { mana: 10 }),
    ]);
    const d = chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1) });
    expect(d).toEqual({ action: { type: 'cast', characterId: 4 }, reason: 'cast' });
  });

  it('2. 「一场一次」已用过、或手动选目标没有候选时不施法（与引擎前置校验一致）', () => {
    const registry = new ExtensionRegistry();
    registry.prototypes.set('once', { segments: [], oncePerBattle: true } as unknown as SkillPrototype);
    registry.prototypes.set('aim', { segments: [], inputTarget: 'enemyChosen' } as unknown as SkillPrototype);
    const s = stateOf(['SS......', '..S.....'], [
      char(1, { mana: 10, skillId: 'once' }),
      char(2, { mana: 10, skillId: 'aim' }),
      char(3, { mana: 10, skillId: 'plain' }),
    ], [char(100, { defeated: true })]);
    s.actionLog.push({ index: 0, side: PlayerSide.Left, action: { type: 'cast', characterId: 1 }, skillId: 'once', outcome: 'switched' });
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(3);
    // 非行动方 / 非等待输入时不给施法
    s.activePlayer = PlayerSide.Right;
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)).toBeNull();
  });

  it('lets a ready damage dealer cast before an earlier mana generator', () => {
    const s = stateOf(['RR.R....'], [
      char(1, { role: 'Generator', mana: 10 }),
      char(2, { role: 'Striker', mana: 10 }),
    ]);
    expect(firstCastableCharacter(s, PlayerSide.Left)?.id).toBe(2);
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1) })?.action)
      .toEqual({ type: 'cast', characterId: 2 });
    s.teams[PlayerSide.Left].characters[1]!.mana = 0;
    expect(firstCastableCharacter(s, PlayerSide.Left)?.id).toBe(1);
  });

  it('Huijiu yields to a ready Striker despite using a non-conversion generator spell', () => {
    const id = String(HUIJIU_SPELL_ID);
    const troop = COMMUNITY_TROOPS.find(t => t.spell.id === HUIJIU_SPELL_ID)!;
    expect(troop.role).toBe('Generator');
    const s = stateOf([], [
      char(1, { name: troop.name, role: troop.role, mana: troop.manaCost, manaCost: troop.manaCost, skillId: id }),
      char(2, { role: 'Generator', mana: 10 }),
      char(3, { role: 'Striker', mana: 10 }),
      char(4, { role: 'Striker', mana: 0 }),
    ]);
    const registry = new ExtensionRegistry();
    registry.prototypes.set(id, SKILL_LIBRARY[HUIJIU_SPELL_ID]);
    // Huijiu creates stars rather than converting colors; its role still yields to damage.
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(3);
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.action)
      .toEqual({ type: 'cast', characterId: 3 });
    s.teams[PlayerSide.Left].characters[2]!.mana = 0;
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(1);
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.action)
      .toEqual({ type: 'cast', characterId: 1 });
    s.teams[PlayerSide.Left].characters[2]!.mana = 10;
    s.teams[PlayerSide.Left].characters[2]!.statuses = [{ id: 'silence', turns: 1 }];
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(1);
  });

  it('holds a conversion that gives a big swap to the opponent, unless it grants an extra turn', () => {
    // B B . B, with a red gem below the gap: red->blue leaves a one-swap four-match.
    const s = stateOf(['BB.B....', '..R.....', '........', '........', '........', 'RR.R....'], [
      char(1, { mana: 10, skillId: 'convert' }),
      char(2, { mana: 10, skillId: 'attack', role: 'Striker' }),
    ]);
    const registry = new ExtensionRegistry();
    registry.prototypes.set('convert', skill(transform(BaseColor.Red, BaseColor.Blue)));
    expect(evaluateSwaps(s, PlayerSide.Left).every(move => move.bigTier === 0)).toBe(true);
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(2);
    expect(s.board.get({ row: 1, col: 2 })?.type).toEqual(colorGem(BaseColor.Red));
    s.teams[PlayerSide.Left].characters[1]!.mana = 0;
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)).toBeNull();
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.action.type)
      .toBe('swap');
    registry.prototypes.set('convert', skill(transform(BaseColor.Red, BaseColor.Blue), extraTurn()));
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(1);
    const big = stateOf(['BBRR....'], [char(3, { mana: 10, skillId: 'convert' })]);
    registry.prototypes.set('convert', skill(transform(BaseColor.Red, BaseColor.Blue)));
    expect(firstCastableCharacter(big, PlayerSide.Left, registry)?.id).toBe(3);
  });

  it('WangFeng summons into an open slot before big swaps and ready damage dealers', () => {
    const id = String(WANGFENG_SPELL_ID);
    const s = stateOf(['RR.R....', '..R.....'], [
      char(1, { mana: 16, manaCost: 16, role: 'Generator', skillId: id }),
      char(2, { mana: 10, role: 'Striker' }),
    ]);
    const registry = new ExtensionRegistry();
    registry.prototypes.set(id, SKILL_LIBRARY[WANGFENG_SPELL_ID]);
    expect(evaluateSwaps(s, PlayerSide.Left).some(move => move.bigTier > 0)).toBe(true);
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.action)
      .toEqual({ type: 'cast', characterId: 1 });
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry, allowCast: false })?.reason)
      .toBe('big-match');
    s.teams[PlayerSide.Left].characters[0]!.mana = 0;
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.reason)
      .toBe('big-match');
  });

  it('WangFeng defers a risky conversion only with a full team', () => {
    const id = String(WANGFENG_SPELL_ID);
    const s = stateOf([], [
      char(1, { mana: 16, manaCost: 16, role: 'Generator', skillId: id }),
      char(2, { mana: 10, role: 'Striker' }),
      char(3), char(4),
    ]);
    const palette = [BaseColor.Brown, BaseColor.Purple, BaseColor.Blue, BaseColor.Green];
    let gemId = 1000;
    for (let row = 0; row < BoardModel.ROWS; row++) for (let col = 0; col < BoardModel.COLS; col++) {
      s.board.set({ row, col }, { id: gemId++, type: colorGem(palette[(row + 2 * col) % 4]) });
    }
    const set = (row: number, col: number, color: BaseColor) => {
      s.board.set({ row, col }, { id: gemId++, type: colorGem(color) });
    };
    // Red->purple creates a one-swap four-match; no summon slot remains.
    set(0, 0, BaseColor.Purple); set(0, 1, BaseColor.Purple);
    set(0, 3, BaseColor.Purple); set(1, 2, BaseColor.Red);
    const registry = new ExtensionRegistry();
    registry.prototypes.set(id, SKILL_LIBRARY[WANGFENG_SPELL_ID]);
    expect(evaluateSwaps(s, PlayerSide.Left).every(move => move.bigTier === 0)).toBe(true);
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(2);
    s.teams[PlayerSide.Left].characters[1]!.mana = 0;
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)).toBeNull();
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.action.type)
      .not.toBe('cast');
    s.teams[PlayerSide.Left].characters.pop();
    expect(firstCastableCharacter(s, PlayerSide.Left, registry)?.id).toBe(1);
    s.teams[PlayerSide.Left].characters[1]!.mana = 10;
    expect(chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), registry })?.action)
      .toEqual({ type: 'cast', characterId: 1 });
  });

  it('3. 没有大消与施法时优先骷髅（骷髅多者优先）', () => {
    const s = stateOf([
      'SS.S....',
      '........',
      'RR.B....',
      '..R.....',
    ], [char(1, { mana: 0 })]);
    // (0,2)↔(0,3) 只成三骷髅；另有红色三连
    const d = chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1) });
    expect(d?.reason).toBe('skull');
    expect(swapKeys(d?.action)).toEqual(['0,2', '0,3']);
  });

  it('4. 按己方剩余法力缺口挑颜色：只缺蓝时打蓝不打红', () => {
    const layout = [
      'RR.R....',
      '........',
      'BB.B....',
    ];
    const needBlue = stateOf(layout, [char(1, { colors: [BaseColor.Red], mana: 10, statuses: [{ id: 'silence', turns: 2 }] }), char(2, { colors: [BaseColor.Blue], mana: 2 })]);
    const d = chooseAiAction({ state: needBlue, side: PlayerSide.Left, rng: new SeededRNG(1) });
    expect(d?.reason).toBe('mana');
    expect(swapKeys(d?.action)).toEqual(['2,2', '2,3']);
    const needRed = stateOf(layout, [char(1, { colors: [BaseColor.Red], mana: 0 }), char(2, { colors: [BaseColor.Blue], mana: 10, statuses: [{ id: 'silence', turns: 2 }] })]);
    expect(swapKeys(chooseAiAction({ state: needRed, side: PlayerSide.Left, rng: new SeededRNG(1) })?.action)).toEqual(['0,2', '0,3']);
  });

  it('5. 谁都不缺法力时仍给出一个合法交换；allowCast=false 只选交换', () => {
    const s = stateOf(['RR.R....'], [char(1, { mana: 10 })]);
    // 满法力可施法，但回退路径禁止施法
    const d = chooseAiAction({ state: s, side: PlayerSide.Left, rng: new SeededRNG(1), allowCast: false });
    expect(d?.reason).toBe('any');
    expect(swapKeys(d?.action)).toEqual(['0,2', '0,3']);
  });

  it('敌方视角（Right）用自己的队伍判断施法与缺口', () => {
    const s = stateOf(['RR.R....'], [char(1, { mana: 10 })], [char(100, { mana: 10 })]);
    s.activePlayer = PlayerSide.Right;
    expect(chooseAiAction({ state: s, side: PlayerSide.Right, rng: new SeededRNG(1) })?.action)
      .toEqual({ type: 'cast', characterId: 100 });
  });

  it('确定性：唯一最优时不消耗随机数；并列时同种子同结果', () => {
    const unique = stateOf(['RR.R....', '..R.....'], [char(1)]);
    const rng = new SeededRNG(7);
    const before = rng.getState();
    chooseAiAction({ state: unique, side: PlayerSide.Left, rng });
    expect(rng.getState()).toBe(before);

    const tie = stateOf(['RR.R....', '........', '........', '........', 'RR.R....'], [char(1)]);
    const a = chooseAiAction({ state: tie, side: PlayerSide.Left, rng: new SeededRNG(42) });
    const b = chooseAiAction({ state: tie, side: PlayerSide.Left, rng: new SeededRNG(42) });
    expect(a).toEqual(b);
    // 决策不改棋盘
    expect(evaluateSwaps(tie, PlayerSide.Left).length).toBeGreaterThan(0);
  });

  it('旧 chooseEnemySwap 仍可用（既有集成测试依赖）', () => {
    const s = stateOf(['RR.R....'], [char(1)]);
    expect(chooseEnemySwap(s.board, new SeededRNG(1))).not.toBeNull();
  });
});
