import type { MaterialDelta } from './materials';

export const WEEKLY_REWARD_MULTIPLIER = 2;

export function doubleWeeklyMaterials(gain: MaterialDelta): MaterialDelta {
  return {
    ...(gain.ingots ? { ingots: Object.fromEntries(Object.entries(gain.ingots).map(([key, value]) => [key, (value ?? 0) * WEEKLY_REWARD_MULTIPLIER])) } : {}),
    ...(gain.traitstones ? { traitstones: Object.fromEntries(Object.entries(gain.traitstones).map(([key, value]) => [key, (value ?? 0) * WEEKLY_REWARD_MULTIPLIER])) } : {}),
    ...(gain.forgeScrolls ? { forgeScrolls: gain.forgeScrolls * WEEKLY_REWARD_MULTIPLIER } : {}),
    ...(gain.treasureMaps ? { treasureMaps: gain.treasureMaps * WEEKLY_REWARD_MULTIPLIER } : {}),
  };
}
