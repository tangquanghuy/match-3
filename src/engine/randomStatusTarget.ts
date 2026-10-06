import type { Character } from './types';

/** Only random status grants skip targets already carrying that status. Bleed can stack to four. */
export function canReceiveRandomStatus(target: Character, statusId: string): boolean {
  const active = target.statuses.find(status => status.id === statusId && status.turns > 0);
  return !active || (statusId === 'bleed' && (active.magnitude ?? 1) < 4);
}

export function eligibleRandomStatuses<T extends { id: string }>(target: Character, statuses: readonly T[]): T[] {
  return statuses.filter(status => canReceiveRandomStatus(target, status.id));
}

export function randomStatusCandidates<T extends Character>(pool: readonly T[], statuses: readonly { id: string }[]): T[] {
  return pool.filter(target => !target.defeated && statuses.some(status => canReceiveRandomStatus(target, status.id)));
}
