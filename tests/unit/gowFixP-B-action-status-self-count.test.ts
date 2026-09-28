import { describe, expect, it } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import type { Character } from '@engine/types';

// P-B-action-status-self-count: TurnEngine removes the caster's Enchanted / Submerged / Blessed when the cast begins
// (R002 / R004), but native Count* steps of that same spell still count the caster (community t/80861: they vanish
// AFTER the spell cast). castTracking/ctx.actionEndedStatusIds lets allyStatusCount / selfStatus / anyAllyStatus see them.
const st = (id: string) => [{ id, turns: 99 }] as Character['statuses'];
const order = (key: string, casterStatus?: string, extra: Record<string, unknown> = {}) =>
  castSpell({ key, ...(casterStatus ? { caster: { statuses: st(casterStatus) } } : {}), ...extra }).summary.order.join(' ; ');

describe('P-B-action-status-self-count', () => {
  it.each([
    ['troop:6692', 'submerged'],
    ['troop:6624', 'submerged'],
    ['troop:6933', 'blessed'],
    ['troop:7325', 'enchanted'],
    ['weapon:1151', 'enchanted'],
  ])('%s: a %s caster counts itself', (key, status) => {
    const plain = order(key);
    const self = order(key, status);
    expect(self).not.toBe(plain);
  });
  it('troop:6692 repro: Submerged caster -> 6 + 3 Blue gems', () => {
    const r = castSpell({ key: 'troop:6692', caster: { statuses: st('submerged') } });
    expect(r.summary.order.join(' ; ')).toMatch(/Blue x9\b/);
    const r0 = castSpell({ key: 'troop:6692' });
    expect(r0.summary.order.join(' ; ')).toMatch(/Blue x6\b/);
  });
  it('the status is still removed from the caster by the cast', () => {
    const r = castSpell({ key: 'troop:6692', caster: { statuses: st('submerged') } });
    expect(r.f.caster.statuses.some(s => s.id === 'submerged')).toBe(false);
  });
});
