import type { GameEvent, BuffEvent } from '@engine/events';
import { AnimConfig } from './AnimationConfig';
import { isCardPlaybackEvent } from './impactPlayback';

/** Same cascade only: board mutations and lifecycle changes always end a wave.
 * Keep every original elimination (shape, sound, mana partition and gem cleanup). */
export function computeEliminationWaves(events: GameEvent[]): Map<number, number> {
  const leaders = new Map<number, number>();
  let leader: number | undefined;
  let chain: number | undefined;
  const gems = new Set<number>();
  events.forEach((event, index) => {
    if (event.type === 'elimination') {
      if (leader === undefined || chain !== event.chainCount || event.cells.some(cell => gems.has(cell.gemId))) {
        leader = index; chain = event.chainCount; gems.clear();
      }
      leaders.set(index, leader);
      for (const cell of event.cells) gems.add(cell.gemId);
    } else if (event.type !== 'mana-gain' && event.type !== 'special-gem-trigger' && !isCardPlaybackEvent(event)) {
      leader = undefined; chain = undefined; gems.clear();
    }
  });
  return leaders;
}

export interface BuffFeedback {
  show: boolean;
  amount: number;
  text?: string;
  durationMs?: number;
  heavyFx?: 'heal_cleanse' | 'armor_up';
  playAudio: boolean;
}
export interface BuffPlaybackBatch {
  events: { event: BuffEvent; feedback: BuffFeedback }[];
  targetIds: number[];
  duration: number;
}
/** Only contiguous attribute effects: never cross an attack or a board/phase boundary. */
export function computeBuffPlaybackBatches(events: GameEvent[]) {
  const leaders = new Map<number, BuffPlaybackBatch>();
  const members = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    if (events[i].type !== 'buff') continue;
    const rows: BuffPlaybackBatch['events'] = [];
    let j = i;
    while (j < events.length && events[j].type === 'buff') {
      const event = events[j] as BuffEvent;
      rows.push({ event, feedback: { show: false, amount: event.amount, playAudio: false } });
      if (j !== i) members.add(j);
      j++;
    }
    const targets = new Map<number, typeof rows>();
    for (const row of rows) {
      const group = targets.get(row.event.targetId) ?? [];
      group.push(row); targets.set(row.event.targetId, group);
    }
    let duration = .1;
    const audioUsed = new Set<string>();
    for (const group of targets.values()) {
      const sums = new Map<string, typeof rows>();
      for (const row of group) {
        // Gains and losses, as well as passive vs skill feedback, remain distinguishable.
        const key = `${row.event.stat}:${row.event.source ?? 'skill'}:${Math.sign(row.event.amount)}`;
        const same = sums.get(key) ?? [];
        same.push(row); sums.set(key, same);
      }
      for (const same of sums.values()) {
        same[0].feedback.show = true;
        same[0].feedback.amount = same.reduce((sum, row) => sum + row.event.amount, 0);
      }
      if (sums.size > 1) {
        const names: Record<BuffEvent['stat'], string> = { attack: '攻击', armor: '护甲', hp: '生命', mana: '法力', magic: '魔力' };
        group[0].feedback.text = [...sums.values()].map(same => {
          const row = same[0];
          const amount = row.feedback.amount;
          return `${row.event.source === 'trait' ? '特质·' : ''}${names[row.event.stat]} ${amount >= 0 ? '+' : ''}${amount}`;
        }).join('\n');
        for (const row of group) row.feedback.show = row === group[0];
      }
      const heavy = group.filter(row => row.event.source !== 'trait' && row.event.amount > 0
        && (row.event.stat === 'hp' || row.event.stat === 'armor'));
      const selected = heavy.find(row => row.event.stat === 'hp') ?? heavy[0];
      if (selected) {
        const fx = selected.event.stat === 'hp' ? 'heal_cleanse' : 'armor_up';
        selected.feedback.heavyFx = fx;
        selected.feedback.playAudio = !audioUsed.has(fx);
        audioUsed.add(fx);
        const readableMs = Math.max(AnimConfig.frameFX[fx].duration, heavy.length >= 3 ? 1250 : 0);
        // Extend the visible strip and combined text, not an empty timeline delay.
        selected.feedback.durationMs = readableMs;
        group[0].feedback.durationMs = readableMs;
        duration = Math.max(duration, readableMs / 1000);
      }
      if (group.some(row => row.event.source === 'trait')) duration = Math.max(duration, .12);
    }
    leaders.set(i, { events: rows, targetIds: [...targets.keys()], duration });
    i = j - 1;
  }
  return { leaders, members };
}

export interface DefeatPlaybackBatch {
  events: Extract<GameEvent, { type: 'defeat' }>[];
  characterIds: number[];
  completed: Set<number>;
}
export function computeDefeatPlaybackBatches(events: GameEvent[]) {
  const leaders = new Map<number, DefeatPlaybackBatch>();
  const members = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    if (events[i].type !== 'defeat') continue;
    const ids: number[] = [];
    const rows: DefeatPlaybackBatch['events'] = [];
    let j = i;
    while (j < events.length && events[j].type === 'defeat') {
      const id = (events[j] as Extract<GameEvent, { type: 'defeat' }>).characterId;
      if (ids.includes(id)) break;
      ids.push(id);
      rows.push(events[j] as Extract<GameEvent, { type: 'defeat' }>);
      if (j !== i) members.add(j);
      j++;
    }
    leaders.set(i, { events: rows, characterIds: ids, completed: new Set() });
    i = j - 1;
  }
  return { leaders, members };
}

export interface SplashPlaybackSlot { leader: number; offset: number; targetIds: number[] }
/** Short stagger per wave. A repeated target or new cast starts a fresh wave. */
export function computeSplashPlaybackSlots(events: GameEvent[]) {
  const slots = new Map<number, SplashPlaybackSlot>();
  for (let i = 0; i < events.length; i++) {
    const first = events[i];
    if (first.type !== 'skill-damage' || first.range !== 'splash' || (first.chainIndex ?? 0) !== 0) continue;
    const targetIds = [first.targetId];
    let j = i + 1;
    while (j < events.length) {
      const hit = events[j];
      if (hit.type !== 'skill-damage' || hit.range !== 'splash' || hit.casterId !== first.casterId
        || hit.chainIndex !== j - i || targetIds.includes(hit.targetId)) break;
      targetIds.push(hit.targetId); j++;
    }
    for (let k = i; k < j; k++) slots.set(k, { leader: i, targetIds,
      offset: k === i ? 0 : (AnimConfig.splashChain.firstImpactDelay
        + (k - i) * AnimConfig.splashChain.victimStagger - AnimConfig.splashChain.shortSwordDuration) / 1000 });
    i = j - 1;
  }
  return slots;
}
