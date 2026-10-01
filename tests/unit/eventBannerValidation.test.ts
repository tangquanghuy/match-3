import { describe, expect, it } from 'vitest';
import { ALL_BASE_COLORS, BaseColor } from '../../src/engine/types';
import { kingdomUnlockLevel } from '../../src/meta/data/kingdoms';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { runCommand } from '../../src/meta/server/core';
import { defaultEnv } from '../../src/meta/server/env';
import { recordsToSave, saveToRecords } from '../../src/meta/state/records';
import { newSave } from '../../src/meta/state/schema';
import { eventModeState } from '../../src/meta/systems/events';
import { eventBattle, towerNextBattle } from './helpers/eventDriver';

const WEEK = weekStartOf(Date.UTC(2026, 9, 1, 12));
function fresh(week = WEEK) {
  const save = newSave({ now: week, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 1000, gems: 0 } });
  save.hero.level = Math.max(20, kingdomUnlockLevel('荣耀之地'));
  save.teams[0]!.bannerKingdomId = '荣耀之地'; // Normal banner: Red +2.
  return save;
}
function env(week = WEEK) {
  return defaultEnv({ now: () => week + 3600000, seed: () => 12345 });
}

describe('aggregated event banners through the production planning gate', () => {
  it.each([false, true])('issues a tower ticket with +3, including persisted runs (reload=%s)', (reload) => {
    let save = fresh();
    towerNextBattle(save, WEEK);
    const run = eventModeState(save, WEEK, 'towerOfDoom').run!;
    run.relics = ['prism_flame', 'storm_crown'];
    run.bonus.banner = Object.fromEntries(ALL_BASE_COLORS.map((color) => [color, 2]));
    if (reload) save = recordsToSave(saveToRecords(save), WEEK);
    const reply = runCommand(save, {
      type: 'planEventBattle', args: { typeId: 'towerOfDoom', choice: towerNextBattle(save, WEEK) },
    }, env());
    expect(reply.result.ok, JSON.stringify(reply.result)).toBe(true);
    if (!reply.result.ok) throw new Error(reply.result.message);
    expect(reply.commit).toBe(true);
    expect(reply.result.request.playerBanner?.boosts).toEqual(
      Object.fromEntries(ALL_BASE_COLORS.map((color) => [color, 3])),
    );
    expect(reply.save.pendingBattle?.requestId).toBe(reply.result.request.requestId);
    expect(eventModeState(reply.save, WEEK, 'towerOfDoom').run?.relics).toEqual(run.relics);
  });

  it('allows tide +2 to stack with an equipped +2 banner without nerfing either side', () => {
    // Find a naturally scheduled tide week rather than injecting an invalid weekly selection.
    for (let offset = 0; offset < 52; offset++) {
      const week = WEEK + offset * 7 * 86400000;
      const save = fresh(week);
      if (!eventModeState(save, week, 'classTrials').trials.includes('tide')) continue;
      const out = eventBattle(save, 'classTrials', week, 'trial:tide');
      expect(out.request.playerBanner?.boosts.Red).toBe(4);
      const reply = runCommand(save, {
        type: 'planEventBattle', args: { typeId: 'classTrials', choice: 'trial:tide' },
      }, env(week));
      expect(reply.result.ok, JSON.stringify(reply.result)).toBe(true);
      if (!reply.result.ok) throw new Error(reply.result.message);
      expect(reply.commit).toBe(true);
      expect(reply.result.request.playerBanner?.boosts).toEqual(
        Object.fromEntries(ALL_BASE_COLORS.map((color) => [color, color === BaseColor.Red ? 4 : 2])),
      );
      expect(reply.result.request.enemyBanner?.boosts).toEqual(
        Object.fromEntries(ALL_BASE_COLORS.map((color) => [color, 2])),
      );
      expect(reply.save.pendingBattle?.requestId).toBe(reply.result.request.requestId);
      return;
    }
    throw new Error('Fixture found no tide trial in 52 weeks');
  });
});
