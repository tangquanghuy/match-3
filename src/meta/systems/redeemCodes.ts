import type { MetaSave } from '../state/schema';
import type { MetaFailure } from '../types';
import { fail } from '../types';

/** Matches worker/campaigns/2026-10-06-creation-corridor-9000-likes.sql. */
export const LIKES_9000_MAIL_ID = 'creation-corridor-9000-likes-2026-10-06';
export const LIKES_9000_CODE = '9000LIKES';

/** The mail ID itself is the per-save receipt, including for already-claimed campaign mail. */
export function hasRedeemedLikes9000(save: MetaSave): boolean {
  return save.mailbox.items.some(item => item.id === LIKES_9000_MAIL_ID);
}

export function redeemCode(save: MetaSave, code: string, now: number): { ok: true; mailId: string } | MetaFailure {
  if (typeof code !== 'string' || code.length > 48 || code.trim().toUpperCase() !== LIKES_9000_CODE)
    return fail('INVALID', '兑换码无效');
  if (hasRedeemedLikes9000(save)) return fail('ALREADY_UNLOCKED', '该兑换码已经兑换过了');
  // Same mail ID and reward as the historical campaign: retries and pending D1 delivery deduplicate.
  // Only the authoritative save command writes this receipt; resetting creates a fresh mailbox.
  save.mailbox.items.push({
    id: LIKES_9000_MAIL_ID,
    title: '创世回廊点赞达9000！',
    body: '感谢大家对创世回廊的支持，点赞已达9000！随信赠送900,000黄金和4,500钻石，请查收。',
    sentAt: now, readAt: null, claimedAt: null,
    currencies: { gold: 900_000, gems: 4_500 }, materials: {},
  });
  return { ok: true, mailId: LIKES_9000_MAIL_ID };
}
