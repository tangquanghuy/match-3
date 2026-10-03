import { fnv1a32 } from './hash';

/** Three PvP opponent bands: integer currencies vary within each difficulty. */
export const PVP_GLORY_RANGES = [
  { min: 10, max: 16 },
  { min: 17, max: 23 },
  { min: 24, max: 30 },
] as const;

export function pvpGloryRange(tier: number, multiplier = 1): { min: number; max: number } {
  const range = PVP_GLORY_RANGES[Math.max(0, Math.min(2, Math.floor(tier)))]!;
  return { min: range.min * multiplier, max: range.max * multiplier };
}

/** The server-side encounter identity varies each win without relying on client battle data. */
export function rollPvpGlory(tier: number, identity: string, multiplier = 1): number {
  const { min, max } = pvpGloryRange(tier);
  return (min + fnv1a32(`pvp-glory:${identity}`) % (max - min + 1)) * multiplier;
}
