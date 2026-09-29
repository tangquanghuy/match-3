// sa-P round 10: P-A-chosen-target-status-precast + P-A-random-skulls-variants.
// - Global condition chosenTargetStatus {statusId}: the chosen target's status, live while alive, cast-start snapshot
//   once it left the roster; usable before any targeting segment.
//   troop:6857 8276 native ExplodeColor Red [AddForBurning] -> ExplodeColor Green [AddForDisease] -> Damage@FromTarget.
//   weapon:1413 8521 native ExplodeGems 4 [AddForStun@FromTarget] -> SplashHeavyDamage@FromTarget.
// - Random-N Skull pool (native ExplodeColor Skull N: 8504 troop:7001, 7136) = matchJoinKey 'skull' (R013-5).
import { describe, it, expect } from 'vitest';
import { castSpell, sixColourBoard, withCells } from '../helpers/gowCast';
import { specialGem } from '@engine/types';
import type { Character } from '@engine/types';
import type { GameEvent } from '@engine/events';

const st = (...ids: string[]) => ids.map((id) => ({ id, turns: 99 })) as Character['statuses'];
const foe = (statuses: Character['statuses'] = st('rage')) => ({ hp: 900, maxHp: 900, armor: 0, statuses });
const firstIdx = (o: string[], p: (s: string) => boolean) => o.findIndex(p);
const skillPhase = (ev: GameEvent[]) => { const i = ev.findIndex((e) => e.type === 'elimination'); return i < 0 ? ev : ev.slice(0, i); };

describe('P-A-chosen-target-status-precast', () => {
  it('troop:6857 8276: Burning + Diseased target -> explode, explode, then the damage (native order)', () => {
    const r = castSpell({ key: 'troop:6857', target: 11, enemies: [foe(), foe(st('burning', 'disease')), foe(), foe()] });
    const o = r.summary.order;
    const ex = o.map((s, i) => (s.startsWith('explode') ? i : -1)).filter((i) => i >= 0);
    const hit = firstIdx(o, (s) => s.startsWith('dmg E11'));
    expect(ex.length).toBeGreaterThanOrEqual(2);
    expect(hit).toBeGreaterThan(ex[1]);
  });
  it('troop:6857 8276: only Burning -> one explode before the damage; untouched target -> none', () => {
    const b = castSpell({ key: 'troop:6857', target: 11, enemies: [foe(st('disease')), foe(st('burning')), foe(), foe()] }).summary.order;
    const hitB = firstIdx(b, (s) => s.startsWith('dmg E11'));
    expect(b.slice(0, hitB).filter((s) => s.startsWith('explode'))).toHaveLength(1);
    const n = castSpell({ key: 'troop:6857', target: 11, enemies: [foe(st('burning', 'disease')), foe(), foe(), foe()] }).summary.order;
    const hitN = firstIdx(n, (s) => s.startsWith('dmg E11'));
    expect(n.slice(0, hitN).filter((s) => s.startsWith('explode'))).toHaveLength(0);
  });
  it('weapon:1413 8521: Stunned target -> explode 4 before the heavy splash; not Stunned -> no explode', () => {
    const s = castSpell({ key: 'weapon:1413', target: 11, enemies: [foe(), foe(st('stun')), foe(), foe()] }).summary.order;
    const ex = firstIdx(s, (x) => x.startsWith('explode'));
    const hit = firstIdx(s, (x) => x.startsWith('dmg E11'));
    expect(ex).toBeGreaterThanOrEqual(0);
    expect(hit).toBeGreaterThan(ex);
    const n = castSpell({ key: 'weapon:1413', target: 11, enemies: [foe(st('stun')), foe(), foe(), foe()] }).summary.order;
    expect(n.slice(0, firstIdx(n, (x) => x.startsWith('dmg E11'))).some((x) => x.startsWith('explode'))).toBe(false);
  });
});

describe('P-A-random-skulls-variants', () => {
  it('troop:7001 8504: Doom / Uber Doom Skulls are in the random Skull pool', () => {
    const DOOM = specialGem('doomSkull'), UBER = specialGem('uberDoomSkull');
    const board = withCells(sixColourBoard, { '0,0': DOOM, '0,7': UBER, '7,0': DOOM });
    const r = castSpell({ key: 'troop:7001', board });
    const ev = skillPhase(r.events).find((e) => e.type === 'gem-explode') as Extract<GameEvent, { type: 'gem-explode' }> | undefined;
    expect(ev).toBeDefined();
    const at = new Set(ev!.cells.map((c) => `${c.pos.row},${c.pos.col}`));
    expect(['0,0', '0,7', '7,0'].every((k) => at.has(k))).toBe(true);
  });
});
