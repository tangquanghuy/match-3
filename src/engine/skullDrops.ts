import { skullGem, specialGem, type GemType } from './types';

export interface SkullDropMix {
  readonly normal: number;
  readonly doom: number;
  readonly uber: number;
}

/** Base natural draws: 15% ordinary, 4% Doom, 1% Uber Doom, 80% colored gems. */
export const BATTLE_SKULL_DROPS: SkullDropMix = Object.freeze({ normal: 0.15, doom: 0.04, uber: 0.01 });
/** Total skull-family probability; event rules and storms may override this total. */
export const BATTLE_SKULL_CHANCE = 0.2;

/** Reuse the skull draw, without an additional random roll. Missing mix preserves legacy ordinary skulls. */
export function pickSkullVariant(roll: number, chance: number, mix?: SkullDropMix): GemType {
  if (!mix) return skullGem();
  const total = mix.normal + mix.doom + mix.uber;
  if (total <= 0) return skullGem();
  const scale = chance / total;
  if (roll < mix.normal * scale) return skullGem();
  if (roll < (mix.normal + mix.doom) * scale) return specialGem('doomSkull');
  return specialGem('uberDoomSkull');
}
