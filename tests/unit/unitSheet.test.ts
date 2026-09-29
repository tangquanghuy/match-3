/**
 * 部队详情窗（lane A）纯逻辑：施放按钮状态裁决、文案、版式系数、状态实时数值行。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PANE_POS,
  PANE_SPREAD,
  bringPaneToFront,
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

describe('unitSheetMetrics（三张同尺寸卡叠成一摞）', () => {
  const fits = (w: number, h: number) => {
    const m = unitSheetMetrics(w, h);
    // 横向：卡宽 + 两侧偏移不超出覆盖区
    expect(m.cardW + m.spread * 2).toBeLessThanOrEqual(w - m.pad * 2);
    // 竖向：关闭钮预留 + 2:3 卡 + 按钮 + 复选框
    expect(m.pad * 2 + m.closeSize + m.cardH + m.gap * 2 + m.buttonH + m.checkH).toBeLessThanOrEqual(h);
    expect(m.cardH).toBe(Math.round(m.cardW * 1.5));
    expect(m.spread).toBe(Math.round(m.cardW * PANE_SPREAD));
    return m;
  };

  it('1440×900 棋盘（768 逻辑 px）', () => {
    const m = fits(768, 812);
    expect(m.compact).toBe(false);
    expect(m.cardW).toBeGreaterThan(300);
  });

  it('960×720 控件占 HUD 通道时（602 逻辑 px 见方）也放得下', () => {
    expect(fits(602, 602).compact).toBe(false);
  });

  it('740×400 棋盘（344 逻辑 px）：紧凑态，卡宽不小于 150px', () => {
    const m = fits(344, 388);
    expect(m.compact).toBe(true);
    expect(m.pad).toBeGreaterThanOrEqual(8);
    expect(m.cardW).toBeGreaterThanOrEqual(150);
  });
});

describe('bringPaneToFront', () => {
  it('点露出的那张与当前页交换位置；点当前页不变', () => {
    const a = bringPaneToFront(DEFAULT_PANE_POS, 'spell');
    expect(a).toEqual({ spell: 'center', portrait: 'left', traits: 'right' });
    const b = bringPaneToFront(a, 'traits');
    expect(b).toEqual({ spell: 'right', portrait: 'left', traits: 'center' });
    expect(bringPaneToFront(b, 'traits')).toEqual(b);
    expect(DEFAULT_PANE_POS).toEqual({ spell: 'left', portrait: 'center', traits: 'right' });
  });
});

describe('statusLiveLine', () => {
  it('出血写层数与每回合伤害；官方无时限状态不写剩余回合', () => {
    // bleed 的 magnitude 是层数（3 层 = 每回合 6 点），不是每回合伤害
    expect(statusLiveLine({ id: 'bleed', turns: 3, magnitude: 3 })).toBe('3 层 · 每回合 6 点');
    // 中毒/燃烧等官方状态 turns 不递减，显示「剩余 N 回合」会一直不动、误导玩家
    expect(statusLiveLine({ id: 'poison', turns: 3 })).toBe('');
    expect(statusLiveLine({ id: 'burning', turns: 3 })).toBe('');
    // 仍按回合倒计时的辅助状态照旧写剩余回合
    expect(statusLiveLine({ id: 'helper-buff', turns: 2 })).toBe('剩余 2 回合');
    expect(statusLiveLine({ id: 'helper-buff', turns: 0 })).toBe('');
  });
  it('可自愈负面附带下回合自愈几率', () => {
    expect(statusLiveLine({ id: 'burning', turns: 3 }, 30)).toBe('下回合自愈几率 30%');
    // 中毒不参与累积自愈，不显示几率
    expect(statusLiveLine({ id: 'poison', turns: 3 }, 30)).toBe('');
  });
});
