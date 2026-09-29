/**
 * 状态演出的纯逻辑口径（无 DOM）：别名归一、增减益归类、徽记角标/说明数值行、
 * 拦截与移除原因 → 飘字/颜色/提示音。App / TeamView / UnitSheet / 单测共用，
 * 避免同一张映射表在多个文件里各写一份后漂移。
 */
import type { StatusBlockedEvent, StatusExpireReason } from '@engine/events';
import {
  POSITIVE_STATUS_IDS, isRecoverableStatus, statusCountsDown,
} from '@engine/skills/effects/status';
import type { StatusCueKind } from './StatusSynth';

/** 状态 id → 演出规范键（小写、连字符形态、别名收敛）。 */
export function canonicalStatusKey(statusId: string): string {
  const key = statusId.toLowerCase().replace(/_/g, '-');
  switch (key) {
    case 'cursed': return 'curse';
    case 'enraged': return 'rage';
    case 'charmed': return 'charm';
    case 'lycanthropy':
    case 'wolf-form': return 'wolf';
    case 'deathmark': return 'death-mark';
    default: return key;
  }
}

const POSITIVE = new Set(POSITIVE_STATUS_IDS.map(canonicalStatusKey));

/** 正面状态（增益）；其余一律按负面处理。 */
export function isPositiveStatus(statusId: string): boolean {
  return POSITIVE.has(canonicalStatusKey(statusId));
}

/**
 * 有卡面持续光晕（status-accent-*）的状态键。冰冻/沉默/缠绕/击晕有专属持续层，不在此表。
 */
export const STATUS_ACCENT_KEYS: readonly string[] = [
  'death-mark', 'curse', 'disease', 'mana-burn', 'charm', 'rage', 'wolf',
  'web', 'bleed', 'barrier', 'submerged', 'marked', 'faerie-fire', 'terror',
  'poison', 'burning', 'enchanted', 'blessed', 'reflect',
];
const ACCENT_SET = new Set(STATUS_ACCENT_KEYS);

/** 状态对应的持续光晕键；无光晕返回 null。 */
export function statusAccentKey(statusId: string): string | null {
  const key = canonicalStatusKey(statusId);
  return ACCENT_SET.has(key) ? key : null;
}

/** 出血每层对应的每回合伤害（与 tickStatuses 同表）。 */
const BLEED_DAMAGE = [0, 1, 3, 6, 10];

interface StatusLike { id: string; turns: number; magnitude?: number }

function bleedStacks(s: StatusLike): number {
  return Math.min(4, Math.max(1, s.magnitude ?? 1));
}

/**
 * 徽记右下角角标：出血显示层数；仍按回合倒计时的辅助状态显示剩余回合；
 * 官方无时限状态不显示（它们的 turns 不代表剩余回合，显示出来会一直不动、误导玩家）。
 */
export function statusBadgeCorner(s: StatusLike): string {
  if (canonicalStatusKey(s.id) === 'bleed') return String(bleedStacks(s));
  if (statusCountsDown(s.id) && s.turns > 0) return String(s.turns);
  return '';
}

/**
 * 说明浮层 / 详情面板的「当前」数值行。
 * @param recoveryChance 持有者下一次回合开始的累积自愈概率（%），无则 null
 */
export function statusLiveLines(s: StatusLike, recoveryChance: number | null): string[] {
  const lines: string[] = [];
  if (canonicalStatusKey(s.id) === 'bleed') {
    const n = bleedStacks(s);
    lines.push(`${n} 层 · 每回合 ${BLEED_DAMAGE[n]} 点`);
  } else if (statusCountsDown(s.id) && s.turns > 0) {
    lines.push(`剩余 ${s.turns} 回合`);
  }
  if (recoveryChance !== null && isRecoverableStatus(s.id)) lines.push(`下回合自愈几率 ${recoveryChance}%`);
  return lines;
}

/** DoT 结算飘字颜色（合并飘字取伤害主导的那一种；出血红、燃烧橙、中毒绿）。 */
export function dotTickColor(statusIds: readonly string[]): string {
  const keys = statusIds.map(canonicalStatusKey);
  if (keys.includes('burning')) return '#ff9a5a';
  if (keys.includes('bleed')) return '#ff5b6e';
  return '#7bd88f';
}

/**
 * DoT 结算飘字文案：同回合多种 DoT 同时结算时逐条列出（`燃烧 -3` / `出血 -6`），
 * 只有一种时仍是纯数字 `-N`。此前多种 DoT 会合成一个数字，玩家看不出是谁打的、各打了多少。
 * @param rows 本次该卡的逐状态伤害（0 伤的条目由调用方剔除）
 * @param total 合并总伤害（与 rows 之和一致；rows 为空时兜底显示）
 */
export function dotTickBreakdown(
  rows: readonly { statusId: string; damage: number }[],
  total: number,
  labelOf: (id: string) => string,
): string {
  if (rows.length <= 1) return `-${total}`;
  return rows.map(row => `${labelOf(row.statusId)} -${row.damage}`).join('\n');
}

export interface StatusCue {
  /** 卡面飘字 */
  text: string;
  /** 飘字/光圈主题色 */
  color: string;
  /** 提示音；缺省不响 */
  sfx?: StatusCueKind;
  /** 卡面光圈的形态 */
  ring: 'pulse' | 'shatter' | 'ripple' | 'burst';
}

/** status-blocked → 演出提示。 */
export function statusBlockedCue(ev: Pick<StatusBlockedEvent, 'reason' | 'statusId'>, labelOf: (id: string) => string): StatusCue {
  switch (ev.reason) {
    case 'immune': return { text: `免疫${labelOf(ev.statusId)}`, color: '#e9edf2', sfx: 'immune', ring: 'pulse' };
    case 'blessed': return { text: '赐福抵挡', color: '#ffd56a', sfx: 'immune', ring: 'pulse' };
    case 'submerged': return { text: '潜水闪避', color: '#7fd0f0', sfx: 'submergeDodge', ring: 'ripple' };
    // 两行：第一行说是谁干的，第二行说丢了什么（单行会挤出卡面）
    case 'extra-turn': return { text: '冰冻\n无额外回合', color: '#9fdcff', sfx: 'frozenDeny', ring: 'shatter' };
    case 'mana': return { text: '沉默\n无法充能', color: '#c9a2f0', sfx: 'frozenDeny', ring: 'pulse' };
  }
}

/**
 * 同一单位重复提示的最小间隔（ms）。沉默跳过充能会随每次同色匹配重复触发，
 * 连锁里能连来四五次；同卡短时间内只演一次，避免刷屏。
 */
export const STATUS_CUE_REPEAT_MS = 900;

/** 一张卡一批最多演几枚「中招」徽印（「陷入所有负面状态」一次挂 15 个，全演会糊成一团）。 */
export const STATUS_EMBLEM_MAX_PER_CARD = 3;

/** 移除原因中需要额外演出的一类（其余只撤徽记/持续层）。 */
export type ExpireCueKind = 'recovered' | 'stripped' | 'cleansed' | 'dispelled' | 'barrier-block';

export function expireCueKind(reason: StatusExpireReason | undefined): ExpireCueKind | null {
  switch (reason) {
    case 'recovered':
    case 'stripped':
    case 'cleansed':
    case 'dispelled':
      return reason;
    default:
      return null;
  }
}

/** 移除类演出提示（每目标每种原因一次）。 */
export function statusExpireCue(kind: ExpireCueKind): StatusCue {
  switch (kind) {
    case 'recovered': return { text: '挣脱', color: '#bff5c8', sfx: 'recover', ring: 'burst' };
    case 'stripped': return { text: '增益被剥离', color: '#c79bff', sfx: 'dispel', ring: 'shatter' };
    case 'cleansed': return { text: '净化', color: '#fff2b0', ring: 'burst' };
    case 'dispelled': return { text: '驱散', color: '#c79bff', sfx: 'dispel', ring: 'shatter' };
    case 'barrier-block': return { text: '屏障抵挡', color: '#8cecf7', sfx: 'barrierBreak', ring: 'shatter' };
  }
}

/** status-tick 中需要单独演出的非伤害结算。 */
export function statusTickCue(statusId: string): StatusCue | null {
  const key = canonicalStatusKey(statusId);
  if (key === 'death-mark') return { text: '死亡标记', color: '#ff5066', sfx: 'deathMark', ring: 'burst' };
  if (key === 'terror') return { text: '恐惧后退', color: '#d9a6ff', sfx: 'terror', ring: 'ripple' };
  return null;
}
