import type { GameEvent } from '@engine/events';
import { canonicalStatusKey, expireCueKind } from './statusPresentation';
import type { ExpireCueKind } from './statusPresentation';

export type StatusEvent = Extract<GameEvent, { type: 'status-apply' | 'status-tick' | 'status-expire' }>;
export interface StatusFeedback {
  /** Original events still dispatch individually; only transient feedback is merged. */
  show: boolean;
  statusIds: string[];
  damage?: number;
  /** 本次该卡各 DoT 的实际伤害（只含 >0 的条目），供飘字逐条列出。 */
  damageRows?: { statusId: string; damage: number }[];
  playAudio: boolean;
  /** 施加批：该行是本卡本批第几个状态（徽印错开播放用）。 */
  order?: number;
  /** 移除类额外演出（挣脱/剥离/净化/驱散/屏障挡下 DoT）；每目标每种只标一次。 */
  cue?: ExpireCueKind;
}
export interface StatusPlaybackBatch {
  events: { index: number; event: StatusEvent; feedback?: StatusFeedback }[];
  targetIds: number[];
  duration: number;
}

/** 需要明显演出（较长占位）的非伤害结算。 */
const HEAVY_TICK_KEYS = new Set(['death-mark', 'terror']);

/** Never cross damage, cleanse, death or another mechanism event. Expirations
 * within a tick run retain their engine order, including zero-damage ticks. */
export function computeStatusPlaybackBatches(events: GameEvent[]) {
  const leaders = new Map<number, StatusPlaybackBatch>();
  const members = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const first = events[i];
    if (first.type !== 'status-apply' && first.type !== 'status-tick' && first.type !== 'status-expire') continue;
    const kind = first.type === 'status-apply' ? 'apply' : 'tick';
    let j = i;
    const rows: StatusPlaybackBatch['events'] = [];
    while (j < events.length) {
      const event = events[j];
      if (kind === 'apply' ? event.type !== 'status-apply'
        : event.type !== 'status-tick' && event.type !== 'status-expire') break;
      rows.push({ index: j, event: event as StatusEvent });
      if (j !== i) members.add(j);
      j++;
    }
    const targets = new Map<number, typeof rows>();
    for (const row of rows) {
      const group = targets.get(row.event.targetId) ?? [];
      group.push(row); targets.set(row.event.targetId, group);
    }
    let audioUsed = false;
    let duration = .12;
    for (const group of targets.values()) {
      const feedbackRows = group.filter(row => row.event.type !== 'status-expire');
      const ids = [...new Set(feedbackRows.map(row => row.event.statusId))];
      const perStatus = feedbackRows.map(row => ({
        statusId: row.event.statusId,
        damage: row.event.type === 'status-tick'
          ? Math.max(0, (row.event.damage ?? 0) + (row.event.armorDamage ?? 0)) : 0,
      }));
      const damage = perStatus.reduce((sum, row) => sum + row.damage, 0);
      // 逐条明细只保留真的打出伤害的（中毒未命中的 0 伤条目不列）
      const damageRows = perStatus.filter(row => row.damage > 0);
      for (let k = 0; k < feedbackRows.length; k++) {
        const playAudio: boolean = kind === 'apply' && k === 0 && !audioUsed;
        feedbackRows[k].feedback = { show: k === 0, statusIds: ids, damage, damageRows, playAudio, order: k };
        audioUsed ||= playAudio;
      }
      // 施加批一律给徽印弹入留出可读窗口（此前只有带帧动画的四种状态才 .32s，其余一闪而过）；
      // 徽印飞入徽记的后半段与下一拍重叠，不再额外占时长
      if (kind === 'apply' || damage > 0) duration = .32;
      if (kind === 'tick' && ids.some(id => HEAVY_TICK_KEYS.has(canonicalStatusKey(id)))) duration = .32;

      // 移除类演出：同目标同原因只标首条（群体剥离/自愈一次移除多个状态只演一次）
      const cued = new Set<ExpireCueKind>();
      group.forEach((row, k) => {
        if (row.event.type !== 'status-expire') return;
        const ev = row.event;
        let cue = expireCueKind(ev.reason);
        // DoT 被屏障整发吸收：屏障 consumed 后紧跟同目标 0 伤 tick（法术吸收带 absorbedFrom，另走弹道）
        const next = group[k + 1]?.event;
        if (!cue && ev.statusId === 'barrier' && !ev.absorbedFrom && next?.type === 'status-tick' && !(next.damage ?? 0)) {
          cue = 'barrier-block';
        }
        if (!cue || cued.has(cue)) return;
        cued.add(cue);
        row.feedback = { show: true, statusIds: [ev.statusId], playAudio: false, cue };
        duration = Math.max(duration, .32);
      });
    }
    leaders.set(i, { events: rows, targetIds: [...targets.keys()], duration });
    i = j - 1;
  }
  return { leaders, members };
}

/** One short flash per card, not one heavyweight strip per state. 击晕没有专属帧，由 App 代码绘制星环。 */
export function statusFeedbackFX(ids: string[]): 'poison_flash' | 'burning_flash' | 'frozen_flash' | undefined {
  if (ids.includes('burning')) return 'burning_flash';
  if (ids.includes('poison')) return 'poison_flash';
  if (ids.includes('frozen')) return 'frozen_flash';
  return undefined;
}

/** Keep simultaneous state feedback legible on a narrow card; every badge remains individual. */
export function statusFeedbackLabel(ids: string[], labelOf: (id: string) => string): string {
  if (ids.length <= 2) return ids.map(labelOf).join(' / ');
  return `${labelOf(ids[0])}等${ids.length}种状态`;
}
