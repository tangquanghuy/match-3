import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@engine/events';
import { computeStatusPlaybackBatches, statusFeedbackFX } from '@render/statusPlayback';
import {
  STATUS_ACCENT_KEYS, STATUS_CUE_REPEAT_MS, STATUS_EMBLEM_MAX_PER_CARD, canonicalStatusKey, dotTickBreakdown, dotTickColor,
  isPositiveStatus, statusAccentKey, statusBadgeCorner, statusBlockedCue, statusExpireCue,
  statusLiveLines, statusTickCue,
} from '@render/statusPresentation';
import { statusBadge } from '@render/statusBadges';
import { STATUS_DESCRIPTIONS } from '../../src/data/statusDescriptions';
import {
  POSITIVE_STATUS_IDS, RANDOM_NEGATIVE_STATUS_POOL, RANDOM_POSITIVE_STATUS_POOL,
  statusCountsDown, statusRecoveryChance,
} from '@engine/skills/effects/status';
import { STATUS_GEM_EFFECTS } from '@engine/types';

/** 引擎会实际施加的全部状态 id（宝石表 + 随机池 + 正面表 + 别名）。 */
const ENGINE_STATUS_IDS = [...new Set([
  ...Object.values(STATUS_GEM_EFFECTS).map(spec => spec.statusId),
  ...RANDOM_NEGATIVE_STATUS_POOL,
  ...RANDOM_POSITIVE_STATUS_POOL,
  ...POSITIVE_STATUS_IDS,
  'cursed', 'enraged', 'charmed', 'wolf-form', 'lycanthropy', 'death_mark', 'mana-burn', 'mana_burn',
])];

describe('状态演出口径（statusPresentation）', () => {
  it('每个引擎状态都有图标、中文名与说明文案', () => {
    for (const id of ENGINE_STATUS_IDS) {
      const badge = statusBadge(id);
      expect(badge.label, `${id} 缺中文名`).not.toBe('状态');
      expect(badge.icon, `${id} 缺图标`).not.toBeNull();
      expect(STATUS_DESCRIPTIONS[badge.label], `${badge.label}(${id}) 缺说明`).toBeTruthy();
    }
  });

  it('别名归一到同一演出键（激怒/诅咒/魅惑/狼化/死亡标记）', () => {
    expect(canonicalStatusKey('enraged')).toBe('rage');
    expect(canonicalStatusKey('cursed')).toBe('curse');
    expect(canonicalStatusKey('charmed')).toBe('charm');
    expect(canonicalStatusKey('lycanthropy')).toBe('wolf');
    expect(canonicalStatusKey('wolf-form')).toBe('wolf');
    expect(canonicalStatusKey('death_mark')).toBe('death-mark');
    expect(canonicalStatusKey('mana_burn')).toBe('mana-burn');
  });

  it('每个引擎状态都有卡面持续表现（持续光晕或专属控制态）', () => {
    // 冰冻/沉默/缠绕是卡面 class，击晕是序列帧持续层，其余必须有 status-accent
    const ownVisual = new Set(['frozen', 'silence', 'entangle', 'stun']);
    for (const id of ENGINE_STATUS_IDS) {
      const key = canonicalStatusKey(id);
      if (ownVisual.has(key)) continue;
      expect(statusAccentKey(id), `${id} 无卡面持续表现`).not.toBeNull();
    }
  });

  it('持续光晕键表内部无重复且都是规范键', () => {
    expect(new Set(STATUS_ACCENT_KEYS).size).toBe(STATUS_ACCENT_KEYS.length);
    for (const key of STATUS_ACCENT_KEYS) expect(canonicalStatusKey(key)).toBe(key);
  });

  it('增减益归类与引擎正面状态表一致', () => {
    for (const id of POSITIVE_STATUS_IDS) expect(isPositiveStatus(id), id).toBe(true);
    for (const id of RANDOM_NEGATIVE_STATUS_POOL) expect(isPositiveStatus(id), id).toBe(false);
    expect(isPositiveStatus('enraged')).toBe(true);
  });
});

describe('徽记角标与数值行只显示有意义的数', () => {
  it('官方无时限状态不显示回合角标（引擎不递减，显示出来永远不动）', () => {
    for (const id of ['poison', 'burning', 'barrier', 'blessed', 'enchanted', 'reflect', 'submerged',
      'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'terror', 'faerie-fire']) {
      expect(statusCountsDown(id), `${id} 应为无时限/自愈类`).toBe(false);
      expect(statusBadgeCorner({ id, turns: 3 }), id).toBe('');
    }
  });

  it('出血角标显示层数，数值行给出该层的每回合伤害', () => {
    expect(statusBadgeCorner({ id: 'bleed', turns: 3, magnitude: 3 })).toBe('3');
    expect(statusLiveLines({ id: 'bleed', turns: 3, magnitude: 1 }, null)).toEqual(['1 层 · 每回合 1 点']);
    expect(statusLiveLines({ id: 'bleed', turns: 3, magnitude: 4 }, null)).toEqual(['4 层 · 每回合 10 点']);
    // 层数上限 4：越界数据也不越界显示
    expect(statusLiveLines({ id: 'bleed', turns: 3, magnitude: 9 }, null)).toEqual(['4 层 · 每回合 10 点']);
  });

  it('仍按回合倒计时的辅助状态照旧显示剩余回合', () => {
    expect(statusCountsDown('helper-mark')).toBe(true);
    expect(statusBadgeCorner({ id: 'helper-mark', turns: 2 })).toBe('2');
  });

  it('可自愈负面显示下回合自愈几率；中毒不显示', () => {
    expect(statusLiveLines({ id: 'burning', turns: 3 }, 40)).toEqual(['下回合自愈几率 40%']);
    expect(statusLiveLines({ id: 'poison', turns: 3 }, 40)).toEqual([]);
  });

  it('自愈几率与引擎 tick 口径同源（取可自愈实例的最小值，缺省 10%）', () => {
    expect(statusRecoveryChance({ statuses: [] })).toBeNull();
    expect(statusRecoveryChance({ statuses: [{ id: 'poison', turns: 3 }] })).toBeNull();
    expect(statusRecoveryChance({ statuses: [{ id: 'burning', turns: 3 }] })).toBe(10);
    expect(statusRecoveryChance({
      statuses: [{ id: 'burning', turns: 3, recoveryChance: 30 }, { id: 'web', turns: 3, recoveryChance: 20 }],
    })).toBe(20);
  });
});

describe('拦截与移除的演出提示', () => {
  it('四种拦截各有专属文案与提示音', () => {
    const label = (id: string) => statusBadge(id).label;
    expect(statusBlockedCue({ reason: 'immune', statusId: 'poison' }, label))
      .toMatchObject({ text: '免疫中毒', sfx: 'immune' });
    expect(statusBlockedCue({ reason: 'blessed', statusId: 'burning' }, label))
      .toMatchObject({ text: '赐福抵挡', sfx: 'immune' });
    expect(statusBlockedCue({ reason: 'submerged', statusId: 'submerged' }, label))
      .toMatchObject({ text: '潜水闪避', ring: 'ripple' });
    expect(statusBlockedCue({ reason: 'extra-turn', statusId: 'frozen' }, label))
      .toMatchObject({ text: '冰冻\n无额外回合', sfx: 'frozenDeny' });
  });

  it('净化与驱散的提示不同（驱散不是治疗）', () => {
    for (const kind of ['recovered', 'stripped', 'cleansed', 'dispelled', 'barrier-block'] as const) {
      expect(statusExpireCue(kind).sfx).toBeUndefined();
    }
    expect(statusExpireCue('cleansed').text).toBe('净化');
    expect(statusExpireCue('cleansed').sfx).toBeUndefined();
    expect(statusExpireCue('dispelled')).toMatchObject({ text: '驱散' });
    expect(statusExpireCue('stripped')).toMatchObject({ text: '增益被剥离' });
    expect(statusExpireCue('recovered')).toMatchObject({ text: '挣脱' });
  });

  it('死亡标记与恐怖的零伤害结算有专属演出', () => {
    expect(statusTickCue('death-mark')).toMatchObject({ text: '死亡标记' });
    expect(statusTickCue('death-mark')?.sfx).toBeUndefined();
    expect(statusTickCue('death_mark')?.text).toBe('死亡标记');
    expect(statusTickCue('terror')).toMatchObject({ text: '恐惧后退', sfx: 'terror' });
    // DoT 走伤害飘字，不额外弹提示
    expect(statusTickCue('poison')).toBeNull();
    expect(statusTickCue('burning')).toBeNull();
  });

  it('DoT 飘字按状态分色：出血红、燃烧橙、其余绿', () => {
    expect(dotTickColor(['bleed'])).toBe('#ff5b6e');
    expect(dotTickColor(['burning'])).toBe('#ff9a5a');
    expect(dotTickColor(['poison'])).toBe('#7bd88f');
    // 合并飘字时燃烧优先（视觉上最强）
    expect(dotTickColor(['poison', 'burning'])).toBe('#ff9a5a');
  });

  it('击晕不再复用冰冻闪光帧', () => {
    expect(statusFeedbackFX(['stun'])).toBeUndefined();
    expect(statusFeedbackFX(['frozen'])).toBe('frozen_flash');
  });
});

describe('移除类演出在批内的标记', () => {
  const expire = (targetId: number, statusId: string, reason?: GameEvent extends never ? never : string): GameEvent =>
    ({ type: 'status-expire', targetId, statusId, ...(reason ? { reason } : {}) }) as GameEvent;

  it('一次自愈移除多个状态，只演一次「挣脱」', () => {
    const events = [
      expire(4, 'burning', 'recovered'), expire(4, 'web', 'recovered'), expire(4, 'silence', 'recovered'),
    ];
    const rows = computeStatusPlaybackBatches(events).leaders.get(0)!.events;
    expect(rows.filter(r => r.feedback?.cue === 'recovered')).toHaveLength(1);
  });

  it('诅咒剥离多个正面状态，只演一次「增益被剥离」', () => {
    const events = [expire(4, 'barrier', 'stripped'), expire(4, 'reflect', 'stripped')];
    const rows = computeStatusPlaybackBatches(events).leaders.get(0)!.events;
    expect(rows.filter(r => r.feedback?.cue === 'stripped')).toHaveLength(1);
  });

  it('不同目标各演一次', () => {
    const events = [expire(4, 'burning', 'recovered'), expire(5, 'burning', 'recovered')];
    const rows = computeStatusPlaybackBatches(events).leaders.get(0)!.events;
    expect(rows.filter(r => r.feedback?.cue === 'recovered')).toHaveLength(2);
  });

  it('屏障挡下 DoT（0 伤 tick）演出格挡；法术吸收走弹道路径不重复演', () => {
    const dotBlocked: GameEvent[] = [
      expire(4, 'barrier', 'consumed'),
      { type: 'status-tick', targetId: 4, statusId: 'burning', damage: 0 },
    ];
    expect(computeStatusPlaybackBatches(dotBlocked).leaders.get(0)!.events[0].feedback?.cue).toBe('barrier-block');

    const spellBlocked: GameEvent[] = [
      { type: 'status-expire', targetId: 4, statusId: 'barrier', reason: 'consumed', absorbedFrom: { casterId: 9, range: 'single' } },
    ];
    expect(computeStatusPlaybackBatches(spellBlocked).leaders.get(0)!.events[0].feedback?.cue).toBeUndefined();
  });

  it('到期/施法/行动结束等普通移除不额外演出', () => {
    for (const reason of ['expired', 'cast', 'action', 'consumed', 'transform']) {
      const rows = computeStatusPlaybackBatches([expire(4, 'enchanted', reason)]).leaders.get(0)!.events;
      expect(rows[0].feedback?.cue, reason).toBeUndefined();
    }
  });

  it('死亡标记/恐怖结算占满一个可读窗口，不被 0 伤当成无事发生', () => {
    const batch = computeStatusPlaybackBatches([
      { type: 'status-tick', targetId: 4, statusId: 'death-mark' },
    ]).leaders.get(0)!;
    expect(batch.duration).toBe(.32);
  });
});

describe('同回合多种 DoT 的伤害归属', () => {
  const label = (id: string) => statusBadge(id).label;

  it('单一 DoT 仍是纯数字', () => {
    expect(dotTickBreakdown([{ statusId: 'poison', damage: 1 }], 1, label)).toBe('-1');
  });

  it('多种 DoT 逐条列出，看得出各打了多少', () => {
    expect(dotTickBreakdown(
      [{ statusId: 'burning', damage: 3 }, { statusId: 'bleed', damage: 6 }], 9, label,
    )).toBe('燃烧 -3\n出血 -6');
  });

  it('批内按目标给出逐状态明细，0 伤条目不列（中毒未命中）', () => {
    const events: GameEvent[] = [
      { type: 'status-tick', targetId: 4, statusId: 'poison', damage: 0 },
      { type: 'status-tick', targetId: 4, statusId: 'burning', damage: 1, armorDamage: 2 },
      { type: 'status-tick', targetId: 4, statusId: 'bleed', damage: 6 },
    ];
    const lead = computeStatusPlaybackBatches(events).leaders.get(0)!.events[0].feedback!;
    expect(lead.damage).toBe(9);
    expect(lead.damageRows).toEqual([{ statusId: 'burning', damage: 3 }, { statusId: 'bleed', damage: 6 }]);
    expect(dotTickBreakdown(lead.damageRows!, lead.damage!, label)).toBe('燃烧 -3\n出血 -6');
  });
});

describe('沉默跳过充能的提示', () => {
  it('有专属文案与重复抑制间隔', () => {
    expect(statusBlockedCue({ reason: 'mana', statusId: 'silence' }, id => statusBadge(id).label))
      .toMatchObject({ text: '沉默\n无法充能', ring: 'pulse' });
    // 沉默会随每次同色匹配重复触发，必须有抑制窗口
    expect(STATUS_CUE_REPEAT_MS).toBeGreaterThan(0);
  });
});

describe('状态「中招」徽印素材覆盖', () => {
  it('每个引擎状态（含别名）都有专属徽印素材，不回退到小图标', async () => {
    const { statusEmblemKeys, statusEmblemUrl } = await import('@render/statusEmblems');
    const keys = new Set(statusEmblemKeys());
    for (const id of ENGINE_STATUS_IDS) {
      expect(keys.has(canonicalStatusKey(id)), `${id} 缺徽印素材（scripts/art-gen/statusEmblems.mjs）`).toBe(true);
      expect(statusEmblemUrl(id)).toMatch(/status-emblems/);
    }
  });

  it('一张卡一批演出的徽印数有上限（一次挂十几个状态不刷屏）', () => {
    expect(STATUS_EMBLEM_MAX_PER_CARD).toBeGreaterThanOrEqual(1);
    expect(STATUS_EMBLEM_MAX_PER_CARD).toBeLessThanOrEqual(4);
  });

  it('施加批的徽印按卡内次序错开', () => {
    const events: GameEvent[] = ['bleed', 'curse', 'silence'].map(statusId =>
      ({ type: 'status-apply', targetId: 4, statusId, turns: 3 }));
    const rows = computeStatusPlaybackBatches(events).leaders.get(0)!.events;
    expect(rows.map(r => r.feedback?.order)).toEqual([0, 1, 2]);
  });
});
