// P-F2-dead-target-colour: "If the enemy dies, convert 1 of their Mana Color gems" (troop:7597, spell 9476:
// Damage -> ConvertGems@FromTarget FromTarget>DaemonicPortal [AddForKill 1]). The defeated target leaves
// state.teams, so its mana colours must come from a cast-start snapshot.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { BaseColor } from '@engine/types';
import type { GameEvent } from '@engine/events';

const portals = (ev: GameEvent[]) => ev.flatMap(e => e.type === 'gem-transform' ? e.changes : [])
  .filter(c => c.to.kind === 'special' && c.to.spec.kind === 'daemonicPortalGem');

describe('P-F2-dead-target-colour', () => {
  it('kill branch: 1 gem of the dead target\'s mana colour becomes a Daemonic Portal', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => i === 2 ? { ...e, hp: 5, maxHp: 5, armor: 0, colors: [BaseColor.Purple] } : e);
    const f = setupCast({ key: 'troop:7597', target: 12, enemies });
    const ev = f.cast();
    expect(f.enemies[2].defeated).toBe(true);
    const changes = portals(ev);
    expect(changes.length).toBe(1);
    const from = changes[0].from;
    expect(from.kind === 'color' ? from.color : null).toBe(BaseColor.Purple);
  });

  it('no kill: no conversion', () => {
    const r = castSpell({ key: 'troop:7597' });
    expect(r.summary.order.join(' ; ')).not.toMatch(/daemonicPortal/);
  });
});
