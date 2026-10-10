import { describe, expect, it } from 'vitest';
import { castSpell, sixColourBoard } from '../helpers/gowCast';
import { BaseColor, colorGem } from '@engine/types';

const skill = 'troop:7155';

describe('Piscea: select two foes, resolve the spell, then settle the board', () => {
  it.each([0, 1])('a devour-immune enemy at slot %i does not suppress the other 30%% roll', (immuneSlot) => {
    let wins = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const enemies = [{ hp: 1000, maxHp: 1000 }, { hp: 1000, maxHp: 1000 }];
      const immune = { ...enemies[immuneSlot], traitIds: ['indigestible'] };
      const r = castSpell({ key: skill, seed, board: sixColourBoard,
        enemies: enemies.map((enemy, i) => i === immuneSlot ? immune : enemy) });
      expect(r.f.enemies[immuneSlot].defeated).toBe(false);
      const devours = r.events.filter(e => e.type === 'skill-damage' && e.devoured);
      expect(devours.every(e => e.type === 'skill-damage' && e.targetId === r.f.enemies[1 - immuneSlot].id)).toBe(true);
      if (devours.length) {
        const created = r.events.findIndex(e => e.type === 'gem-create' || e.type === 'gem-transform');
        const devoured = r.events.findIndex(e => e.type === 'skill-damage' && e.devoured);
        const settled = r.events.map(e => e.type).lastIndexOf('skill-phase-boundary');
        expect(created).toBeGreaterThanOrEqual(0);
        expect(devoured).toBeGreaterThan(created);
        expect(settled).toBeGreaterThan(devoured);
      }
      wins += Number(devours.length > 0);
    }
    // One vulnerable target, exactly one independent 30% roll per cast (not 30% squared).
    expect(wins).toBeGreaterThan(90);
    expect(wins).toBeLessThan(155);
  });

  it('can devour both distinct targets in the same cast', () => {
    let both = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { events, f } = castSpell({ key: skill, seed, board: sixColourBoard,
        enemies: [{ hp: 1000, maxHp: 1000 }, { hp: 1000, maxHp: 1000 }] });
      const victims = events.filter(e => e.type === 'skill-damage' && e.devoured)
        .map(e => e.type === 'skill-damage' ? e.targetId : -1);
      expect(new Set(victims).size).toBe(victims.length);
      expect(victims.every(id => f.enemies.some(enemy => enemy.id === id))).toBe(true);
      if (victims.length === 2) both++;
    }
    expect(both).toBeGreaterThan(15);
    expect(both).toBeLessThan(60);
  });

  it('shows green clear and blue creation before devour, then gravity and cascades', () => {
    let checked = 0;
    let settled = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { events } = castSpell({ key: skill, seed, board: (row, col) => row === 0 && col === 0 ? colorGem(BaseColor.Blue) : sixColourBoard(row, col) });
      const clear = events.findIndex(e => e.type === 'gem-destroy');
      const blue = events.findIndex(e => e.type === 'gem-create' || e.type === 'gem-transform');
      const devour = events.findIndex(e => e.type === 'skill-damage' && e.devoured);
      if (devour < 0) continue;
      const gravity = events.findIndex(e => e.type === 'gravity');
      const cascade = events.findIndex(e => e.type === 'elimination');
      expect(clear).toBeGreaterThanOrEqual(0);
      expect(blue).toBeGreaterThan(clear);
      expect(devour).toBeGreaterThan(blue);
      if (gravity >= 0) expect(gravity).toBeGreaterThan(devour);
      if (cascade >= 0) { expect(cascade).toBeGreaterThan(devour); settled++; }
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    expect(settled).toBeGreaterThan(0); // An actual match, not merely a deferred gravity pass.
  });
});
