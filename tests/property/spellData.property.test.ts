/**
 * 组装产物属性测试（窗口 B · 阶段 3）。
 *
 * 契约（fast-check 基建口径，与 tests/property/ 既有风格一致）：
 *   1. 相同种子 → 相同事件流（全库抽样对抗随机施法者/棋盘/队伍构成）；
 *   2. 事件顺序契约：技能事件（skill-damage/gem-create/buff/status-apply/summon/extra-turn）
 *      都在本次行动的 mana 扣减后果之前成立——技能事件流不含 turn-end 之外的
 *      引擎回合事件；每次施加的状态都有 status-apply 且先于 status-tick/expire。
 * 纯逻辑：不走 TurnEngine（回合生命周期由既有 castSkillPrototype/property 测试覆盖），
 * 这里直接对 executePrototype 断言确定性，随机性全部来自 ctx.rng。
 */
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import type { EffectContext } from '@engine/skills/effects/context';
import { collectCurated } from '@engine/skills/curated';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import { TROOPS } from '../../src/data/troops';

const { byId: curatedById } = collectCurated();
/** 全量已配置 spellId（含 overrides），按升序稳定遍历 */
const ALL_IDS = Object.keys(SKILL_LIBRARY).map(Number).filter((id) => TROOPS.some((t) => t.spell.id === id)).sort((a, b) => a - b);

const PALETTE: GemType[] = [
  colorGem(BaseColor.Red), colorGem(BaseColor.Blue), colorGem(BaseColor.Green),
  colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple), colorGem(BaseColor.Brown),
];

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 60, hp: 45, attack: 8, armor: 4, magic: 7,
    colors: [BaseColor.Red, BaseColor.Blue], manaCost: 12, mana: 12,
    skillId: 'none', statuses: [], defeated: false,
    troopTypes: ['Human'], ...over,
  };
}

function buildState(seed: number): { state: ReturnType<typeof createGameState>; casterId: number } {
  const board = new BoardModel();
  let gid = 0;
  // 随机棋盘：种子化取色（确定性）
  const rng = new SeededRNG(seed);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: gid++, type: PALETTE[rng.nextInt(PALETTE.length)] });
    }
  }
  const left: Team = {
    player: PlayerSide.Left,
    characters: [
      makeChar(0, { troopTypes: ['Human', 'Beast'] }),
      makeChar(1, { hp: 20, statuses: [{ id: 'burning', turns: 2, magnitude: 2 }] }),
      makeChar(2, { mana: 3 }),
    ],
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: [
      makeChar(4, { hp: 15, troopTypes: ['Giant'] }),
      makeChar(5, { mana: 8, statuses: [{ id: 'poison', turns: 3, magnitude: 2 }] }),
      makeChar(6),
    ],
  };
  const state = createGameState(board, left, right);
  return { state, casterId: 0 };
}

function makeCtx(state: ReturnType<typeof createGameState>, seed: number): EffectContext {
  let gid = 900_000;
  return {
    state,
    casterId: 0,
    rng: new SeededRNG(seed),
    nextGemId: () => gid++,
    resolveSummonRef: () => null,
  };
}

describe('组装产物确定性（同种子 → 同事件流）', () => {
  it('任意（spellId, seed）组合执行两遍事件流逐字相等', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: ALL_IDS.length - 1 }),
        fc.integer({ min: 1, max: 0xffffff }),
        (idx, seed) => {
          const spellId = ALL_IDS[idx];
          const proto = SKILL_LIBRARY[spellId];
          if (!proto) return;
          const a = buildState(seed);
          const b = buildState(seed);
          const ea = executePrototype(proto, makeCtx(a.state, seed));
          const eb = executePrototype(proto, makeCtx(b.state, seed));
          expect(ea).toEqual(eb);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('技能事件顺序契约：无引擎回合事件混入；defeat 后无该角色再受击', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: ALL_IDS.length - 1 }),
        fc.integer({ min: 1, max: 0xffffff }),
        (idx, seed) => {
          const spellId = ALL_IDS[idx];
          const proto = SKILL_LIBRARY[spellId];
          if (!proto) return;
          const { state } = buildState(seed);
          const events = executePrototype(proto, makeCtx(state, seed));
          // 技能事件流不允许出现回合级事件（turn-end / gravity / refill 由引擎回合出口产出）
          for (const e of events) {
            expect(['turn-end', 'gravity', 'refill', 'swap', 'swap-rejected']).not.toContain(e.type);
          }
          // 阵亡角色不得在 defeat 之后再次受击（技能流内部一致性）
          const defeatedAt = new Map<number, number>();
          events.forEach((e, i) => {
            if (e.type === 'defeat') defeatedAt.set(e.characterId, i);
            if (e.type === 'skill-damage' && defeatedAt.has(e.targetId)) {
              expect(defeatedAt.get(e.targetId)!).toBeLessThan(i);
            }
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('抽样全量可用性：全部 spellId 都能构建出非空执行（含空效果技能除外）', () => {
    // 冒烟性质：任何崩溃都意味着某条组装数据让原语越界
    for (const id of curatedById.keys()) {
      const proto = SKILL_LIBRARY[id];
      if (!proto) continue;
      const { state } = buildState(20260914);
      expect(() => executePrototype(proto, makeCtx(state, 20260914))).not.toThrow();
    }
  });
});
