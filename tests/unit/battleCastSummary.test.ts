/**
 * 窗口 P · 批次 1 · B-4 第③段：施法效果摘要翻译器。
 *
 * 这一段是纯逻辑（事件流 → 中文摘要行），截图验不出归并规则与排除规则，
 * 故在此锁死四条不变量：归并、排除、顺序、行数上限。
 */
import { describe, it, expect } from 'vitest';
import { summarizeCastEvents } from '../../src/render/castSummary';
import { PlayerSide, skullGem } from '../../src/engine/types';
import type { GameEvent } from '../../src/engine/events';

const NAMES: Record<number, string> = { 1: '奥契丝', 2: '战象', 3: '死亡陷阱模仿怪', 4: '匪徒' };
const nameOf = (id: number): string | undefined => NAMES[id];

const damage = (targetId: number, dmg: number): GameEvent => ({
  type: 'skill-damage',
  casterId: 1,
  targetId,
  range: 'single',
  damage: dmg,
  resultingHp: 10,
  resultingArmor: 0,
});

describe('施法效果摘要（B-4 第③段）', () => {
  it('同一目标的多段伤害归并成一行、取累计值', () => {
    const lines = summarizeCastEvents([damage(2, 5), damage(2, 7), damage(3, 4)], { nameOf });
    expect(lines).toEqual(['战象 −12 生命', '死亡陷阱模仿怪 −4 生命']);
  });

  it('状态/增益/召唤/阵亡各出一行，状态带剩余回合', () => {
    const lines = summarizeCastEvents(
      [
        { type: 'buff', targetId: 1, stat: 'hp', amount: 14 },
        { type: 'status-apply', targetId: 1, statusId: 'barrier', turns: 2 },
        { type: 'summon', player: PlayerSide.Left, slot: 3, troopId: 6353, characterId: 4, destination: 'field' },
        { type: 'defeat', characterId: 2 },
      ],
      { nameOf },
    );
    expect(lines).toEqual([
      '奥契丝 +14 生命',
      '奥契丝 获得 屏障（2 回合）',
      '召唤 匪徒',
      '战象 阵亡',
    ]);
  });

  it('不属于本次施法的事件被排除：特质被动 buff 与回合结算 DoT', () => {
    const lines = summarizeCastEvents(
      [
        { type: 'buff', targetId: 1, stat: 'attack', amount: 3, source: 'trait' },
        { type: 'status-tick', targetId: 2, statusId: 'poison', damage: 2 },
        damage(2, 6),
      ],
      { nameOf },
    );
    expect(lines).toEqual(['战象 −6 生命']);
  });

  it('宝石事件按创造/转化/清除三类各自累计颗数', () => {
    const cell = (x: number) => ({ pos: { row: 0, col: x }, gemId: x, gemType: skullGem() });
    const lines = summarizeCastEvents(
      [
        { type: 'gem-destroy', cells: [cell(0), cell(1)] },
        { type: 'gem-explode', cells: [cell(2)] },
      ],
      { nameOf },
    );
    expect(lines).toEqual(['清除 3 颗宝石']);
  });

  it('取不到名字时用「目标」兜底，绝不泄露内部 id', () => {
    expect(summarizeCastEvents([damage(99, 3)], { nameOf })).toEqual(['目标 −3 生命']);
  });

  it('超过行数上限时折成「…等 N 项效果」', () => {
    const events: GameEvent[] = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      type: 'status-apply',
      targetId: i,
      statusId: 'poison',
      turns: 1,
    }));
    const lines = summarizeCastEvents(events, { nameOf, maxLines: 4 });
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('…等 5 项效果');
  });
});
