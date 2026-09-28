import { describe, expect, it } from 'vitest';
import { castSpell, reviewBoard, withCells } from '../helpers/gowCast';
import { specialGem, type GemType } from '@engine/types';

// P-D-lethal-first-lasttarget: a chance-gated execute segment that fails its roll still records its victim in
// castTracking.lastTarget, so native LethalDamageConditional@LastEnemy -> TrueDamage@LastEnemy (weapon:1435 / 8664)
// runs in native order (R001): failed roll -> the true damage hits the same enemy; slain -> no damage to anyone else.
const doomBoard = (n: number) => {
  const over: Record<string, GemType> = {};
  for (let i = 0; i < n; i++) over[`${7 - Math.floor(i / 8)},${i % 8}`] = specialGem('doomSkull');
  return withCells(reviewBoard, over);
};

describe('P-D-lethal-first-lasttarget', () => {
  it('weapon:1435: failed slay roll -> true damage still lands on the last enemy', () => {
    const r = castSpell({ key: 'weapon:1435', seed: 1 });
    const order = r.summary.order.join(' ; ');
    expect(order).toMatch(/^dmg E13 13\b/);
    expect(order).not.toMatch(/defeat/);
  });
  it('weapon:1435: 16 Doomskulls (>= 100%) -> the last enemy is slain first, nobody else is damaged', () => {
    const r = castSpell({ key: 'weapon:1435', seed: 1, board: doomBoard(16) });
    const order = r.summary.order.join(' ; ');
    expect(order).toMatch(/defeat E13/);
    expect(order).not.toMatch(/dmg E1[0-2]\b/);
    expect(order).not.toMatch(/dmg E13 13/);
  });
  it('the slay segment comes first in the prototype (native order)', () => {
    const r = castSpell({ key: 'weapon:1435' });
    const segs = (r.f.proto!.segments as Array<{ kind: string; execute?: boolean; target?: string }>);
    expect(segs[0]).toMatchObject({ kind: 'damage', execute: true, target: 'enemyLast' });
    expect(segs[1]).toMatchObject({ kind: 'damage', target: 'lastTarget' });
  });
});
