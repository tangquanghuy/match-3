/**
 * 部队详情窗（lane A）纯逻辑：施放按钮状态裁决、文案、版式系数、状态实时数值行。
 */
import { describe, expect, it } from 'vitest';
import {
  castButtonLabel,
  resolveCastAvailability,
  statusLiveLine,
  unitSheetMetrics,
  type CastAvailabilityInput,
} from '../../src/render/UnitSheet';

const ready: CastAvailabilityInput = {
  autoBattle: false,
  defeated: false,
  over: false,
  enemyTurn: false,
  busy: false,
  mana: 12,
  manaCost: 12,
  silenced: false,
  usedOnce: false,
};

describe('resolveCastAvailability', () => {
  it('我方回合、满法力、空闲 → 可释放', () => {
    expect(resolveCastAvailability(ready)).toEqual({ kind: 'ready' });
    expect(castButtonLabel({ kind: 'ready' })).toBe('释放技能');
  });

  it('自动战斗优先于一切（lane B 接管时手动施放被拒绝）', () => {
    const a = resolveCastAvailability({ ...ready, autoBattle: true, enemyTurn: true, mana: 0, busy: true });
    expect(a.kind).toBe('auto');
    expect(castButtonLabel(a)).toBe('自动战斗中');
  });

  it('对手回合优先于法力不足/结算中', () => {
    expect(resolveCastAvailability({ ...ready, enemyTurn: true, mana: 3, busy: true }).kind).toBe('enemyTurn');
    expect(castButtonLabel({ kind: 'enemyTurn' })).toBe('对手回合');
  });

  it('法力不足写出差额，并排在「结算中」之前（演出中能看到差额在缩小）', () => {
    const a = resolveCastAvailability({ ...ready, mana: 7, busy: true });
    expect(a).toEqual({ kind: 'short', short: 5 });
    expect(castButtonLabel(a)).toBe('还差 5 点法力');
  });

  it('与引擎 isSkillCastable 同口径：mana >= manaCost', () => {
    expect(resolveCastAvailability({ ...ready, mana: 0, manaCost: 0 }).kind).toBe('ready');
    expect(resolveCastAvailability({ ...ready, mana: 13 }).kind).toBe('ready');
  });

  it('沉默 / 限用已用 / 结算中 / 阵亡 / 对局结束', () => {
    expect(castButtonLabel(resolveCastAvailability({ ...ready, silenced: true }))).toBe('沉默中');
    expect(castButtonLabel(resolveCastAvailability({ ...ready, usedOnce: true }))).toBe('本场已施放');
    expect(castButtonLabel(resolveCastAvailability({ ...ready, busy: true }))).toBe('结算中');
    expect(castButtonLabel(resolveCastAvailability({ ...ready, defeated: true, enemyTurn: true }))).toBe('已阵亡');
    expect(castButtonLabel(resolveCastAvailability({ ...ready, over: true }))).toBe('战斗已结束');
  });
});

describe('unitSheetMetrics', () => {
  it('1440×900 棋盘（768 逻辑 px）：立绘卡宽约四成多，2:3 卡 + 按钮 + 复选框放得下', () => {
    const m = unitSheetMetrics(768, 812);
    expect(m.k).toBe(1);
    expect(m.compact).toBe(false);
    expect(m.cardW).toBeGreaterThan(300);
    expect(m.cardW).toBeLessThanOrEqual(Math.floor(768 * 0.44));
    expect(36 + m.pad * 2 + m.cardW * 1.5 + 42 + 26).toBeLessThan(812);
  });

  it('740×400 棋盘（344 逻辑 px）：紧凑态，右栏至少留 170px，间距不小于 8px', () => {
    const m = unitSheetMetrics(344, 388);
    expect(m.compact).toBe(true);
    expect(m.pad).toBeGreaterThanOrEqual(8);
    expect(344 - m.cardW - m.pad * 3).toBeGreaterThanOrEqual(170);
    expect(28 + m.pad * 2 + m.cardW * 1.5 + 32 + 22).toBeLessThanOrEqual(388);
  });
});

describe('statusLiveLine', () => {
  it('DoT 写每回合数值，限时状态写剩余回合', () => {
    expect(statusLiveLine({ turns: 3, magnitude: 4 })).toBe('每回合 4 点 · 剩余 3 回合');
    expect(statusLiveLine({ turns: 2 })).toBe('剩余 2 回合');
    expect(statusLiveLine({ turns: 0 })).toBe('');
  });
});
