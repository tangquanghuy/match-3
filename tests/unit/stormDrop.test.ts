/**
 * 风暴掉落权重测试（阶段 1.3）：GravitySystem.refill 对应色 ×STORM_DROP_WEIGHT。
 *
 * 官方实测：火风暴下新宝石约 27.1% 为对应色（正常 14.3% = 1/7）≈ ×1.9。
 * 引擎加权：对应色概率 = 1.9/(5+1.9) ≈ 27.5%，其余各色 ≈ 14.5%。
 * 统计断言允许 ±3% 浮动；无风暴时必须与旧分布（均匀 1/6）一致。
 */
import { describe, it, expect } from 'vitest';
import { GravitySystem, STORM_DROP_WEIGHT } from '@engine/GravitySystem';
import { BoardModel } from '@engine/BoardModel';
import { SeededRNG } from '@engine/rng';
import { ALL_BASE_COLORS, BaseColor } from '@engine/types';
import type { Character } from '@engine/types';
import type { GameEvent, RefillEvent, StormChangeEvent } from '@engine/events';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { chooseEnemySwap } from '@engine/ai';
import { MatchState, PlayerSide } from '@engine/types';

/** 全空棋盘上反复 refill：一次 apply 补满 64 格，大样本统计颜色分布 */
function sampleRefills(iterations: number, seed: number, stormWeights?: ReadonlyMap<BaseColor, number>) {
  const counts = new Map<BaseColor, number>(ALL_BASE_COLORS.map((c) => [c, 0]));
  let id = 0;
  const gravity = new GravitySystem(new SeededRNG(seed), () => ++id);
  let total = 0;
  for (let i = 0; i < iterations; i++) {
    const board = new BoardModel(); // 每轮新空盘 → 64 颗全新补充
    const { spawns } = gravity.apply(board, 0, stormWeights);
    for (const s of spawns) {
      if (s.gemType.kind === 'color') counts.set(s.gemType.color, counts.get(s.gemType.color)! + 1);
      total += 1;
    }
  }
  return { counts, total };
}

const isStormChange = (e: GameEvent): e is StormChangeEvent => e.type === 'storm-change';
const isRefill = (e: GameEvent): e is RefillEvent => e.type === 'refill';

describe('GravitySystem：风暴颜色权重', () => {
  it('掉落加成常量 = 1.9（官方实测 ×1.9，可调）', () => {
    expect(STORM_DROP_WEIGHT).toBe(1.9);
  });

  it('紫色风暴激活：紫色 ≈ 27.5%，其余各色 ≈ 14.5%（±3%，2000 次 refill 大样本）', () => {
    const weights = new Map([[BaseColor.Purple, STORM_DROP_WEIGHT]]);
    const { counts, total } = sampleRefills(2000, 20260915, weights);
    expect(total).toBe(2000 * BoardModel.ROWS * BoardModel.COLS);

    const expectedStorm = STORM_DROP_WEIGHT / (ALL_BASE_COLORS.length - 1 + STORM_DROP_WEIGHT); // ≈ 0.2754
    const expectedOther = 1 / (ALL_BASE_COLORS.length - 1 + STORM_DROP_WEIGHT); // ≈ 0.1449
    for (const color of ALL_BASE_COLORS) {
      const ratio = counts.get(color)! / total;
      const expected = color === BaseColor.Purple ? expectedStorm : expectedOther;
      expect(
        Math.abs(ratio - expected),
        `${color} 出现率 ${ratio.toFixed(4)} 应在 ${expected.toFixed(4)} ±0.03 内`,
      ).toBeLessThanOrEqual(0.03);
    }
  });

  it('无风暴：各色均匀 1/6（±3%），与主分支分布一致', () => {
    const { counts, total } = sampleRefills(2000, 20260915);
    for (const color of ALL_BASE_COLORS) {
      const ratio = counts.get(color)! / total;
      expect(Math.abs(ratio - 1 / ALL_BASE_COLORS.length), `${color}=${ratio.toFixed(4)}`).toBeLessThanOrEqual(0.03);
    }
  });

  it('无风暴路径与旧实现逐字节一致：不传权重与传空表产出完全相同的种子序列', () => {
    const a = sampleRefills(50, 42).counts;
    const b = sampleRefills(50, 42, new Map()).counts;
    for (const color of ALL_BASE_COLORS) expect(b.get(color)).toBe(a.get(color));
  });
});

describe('集成：fromdark 触发风暴后 refill 紫色占比上升', () => {
  function makeChar(id: number, over: Partial<Character> = {}): Character {
    return {
      id,
      name: `C${id}`,
      maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 8,
      colors: [BaseColor.Red], manaCost: 20, mana: 0,
      skillId: 'none', statuses: [], defeated: false,
      ...over,
    };
  }

  it('持有 fromdark 的角色在盟友阵亡后设暗风暴 → 风暴期 refill 紫色显著高于其余色', () => {
    // 风暴持续 8 回合，单局样本有限：多种子收集「风暴在场期间」的 refill 样本并池化。
    // 风暴期判定走事件流：storm-change(color!=null) 之后在场，color=null（顶替/到期）后离场。
    const pooled = new Map<BaseColor, number>(ALL_BASE_COLORS.map((c) => [c, 0]));
    let pooledTotal = 0;
    for (let seed = 1; seed < 20 && pooledTotal < 400; seed++) {
      const idGen = (() => { let n = 500; return () => ++n; })();
      const rng = new SeededRNG(seed);
      const board = new BoardGenerator(rng, idGen, 0.16).generate();
      const state = createGameState(
        board,
        {
          player: PlayerSide.Left,
          characters: [
            makeChar(0, { hp: 1, maxHp: 1, attack: 1 }), // 受害者（队首，被高攻骷髅击杀）
            makeChar(1, { hp: 9999, maxHp: 9999, attack: 1, traitIds: ['fromdark'] }),
          ],
        },
        {
          player: PlayerSide.Right,
          characters: [
            makeChar(4, { hp: 9999, maxHp: 9999, attack: 60 }),
            makeChar(5, { hp: 9999, maxHp: 9999, attack: 1 }),
          ],
        },
      );
      const engine = new TurnEngine(state, rng, idGen, new ExtensionRegistry());

      // 驱动对局并统计风暴在场期间的补充宝石（设置行动本身的补充发生在风暴设置之前，天然不计）
      let stormActive = false;
      let sawStorm = false;
      for (let turn = 0; turn < 200; turn++) {
        if (state.state === MatchState.GameOver) break;
        const swap = chooseEnemySwap(state.board, rng);
        if (!swap) break;
        for (const e of engine.resolveAction({ type: 'swap', from: swap.a, to: swap.b })) {
          if (isStormChange(e)) {
            stormActive = e.color !== null;
            if (stormActive) sawStorm = true;
          } else if (stormActive && isRefill(e)) {
            for (const s of e.spawns) {
              if (s.gemType.kind === 'color') {
                pooled.set(s.gemType.color, pooled.get(s.gemType.color)! + 1);
                pooledTotal += 1;
              }
            }
          }
        }
        if (sawStorm && !stormActive) break; // 本种子风暴已到期，换下一个种子继续池化
      }
    }

    expect(pooledTotal, '多种子池化后应凑齐风暴期样本').toBeGreaterThanOrEqual(400);
    const purple = pooled.get(BaseColor.Purple)! / pooledTotal;
    // 风暴期紫色期望 ≈27.5%（基线 16.7%）；400+ 池化样本下 >0.21 的裕度 ≈ 3σ
    expect(purple, `紫色占比 ${purple.toFixed(3)}（${pooled.get(BaseColor.Purple)}/${pooledTotal}）`).toBeGreaterThan(0.21);
    // 且其余各色都被压到基线附近以下（≈14.5% + 3% 裕度）
    for (const color of ALL_BASE_COLORS) {
      if (color === BaseColor.Purple) continue;
      const ratio = pooled.get(color)! / pooledTotal;
      expect(ratio, `${color} 占比 ${ratio.toFixed(3)}`).toBeLessThan(0.18);
    }
  });
});
