/** Hero traits use the official Legendary recipe (base rarity index 4, not this repo's
 * display label "Legendary"/index 5). Class mastery/weapon colors are explicit;
 * never infer them from equipped weapons, talent trees or kingdom banner colors.
 * Provenance and monochrome differences: docs/hero-class-traits-and-directory.md.
 */
import { STONE_COLORS } from './materials';
export const HERO_TRAIT_COLORS: Readonly<Record<string, readonly [string, string]>> = {
  nightweaver: ['blue', 'purple'],
  spiritwalker: ['blue', 'green'],
  geomancer: ['green', 'brown'],
  elementalist: ['brown', 'blue'],
  doomsayer: ['red', 'purple'],
  barbarian: ['brown', 'red'],
  monk: ['brown', 'yellow'],
  stormcaller: ['red', 'yellow'],
  slayer: ['blue', 'red'],
  archmagus: ['yellow', 'purple'],
  invoker: ['brown', 'purple'],
  corsair: ['yellow', 'blue'],
  tidecaller: ['green', 'blue'],
  heirophant: ['yellow', 'green'],
  dervish: ['brown', 'yellow'],
  maskedlord: ['green', 'brown'],
  plaguelord: ['blue', 'green'],
  shaman: ['brown', 'green'],
  warpriest: ['yellow', 'blue'],
  frostmage: ['purple', 'blue'],
  thief: ['purple', 'brown'],
  hunter: ['green', 'red'],
  runepriest: ['yellow', 'brown'],
  dragonguard: ['blue', 'brown'],
  bard: ['blue', 'yellow'],
  marauder: ['red', 'blue'],
  deathknight: ['red', 'purple'],
  oracle: ['yellow', 'purple'],
  orbweaver: ['purple', 'green'],
  assassin: ['purple', 'red'],
  mechanist: ['red', 'brown'],
  necromancer: ['blue', 'purple'],
  sorcerer: ['purple', 'purple'],
  archer: ['green', 'green'],
  priest: ['yellow', 'yellow'],
  warden: ['brown', 'brown'],
  knight: ['blue', 'blue'],
  warrior: ['red', 'red'],
};
export interface HeroTraitCost { stones: Record<string, number> }

export function heroTraitCost(classId: string, slot: number): HeroTraitCost | null {
  if (!Object.prototype.hasOwnProperty.call(HERO_TRAIT_COLORS, classId)) return null;
  const colors = HERO_TRAIT_COLORS[classId];
  if (!colors || !Number.isInteger(slot) || slot < 1 || slot > 3) return null;
  const [primary, secondary] = colors;
  const mono = primary === secondary;
  const order = STONE_COLORS.map(c => c.key);
  const pair = [...colors].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const arcane = `arcane:${pair.join(':')}`;
  if (slot === 1) return { stones: mono
    ? { [`minor:${primary}`]: 18, [`major:${primary}`]: 12, [`runic:${primary}`]: 10 }
    : { [`minor:${primary}`]: 18, [`runic:${primary}`]: 10, [`runic:${secondary}`]: 10 } };
  if (slot === 2) return { stones: { [`minor:${primary}`]: 26, [`major:${primary}`]: 12, [arcane]: mono ? 12 : 10 } };
  return { stones: { [`minor:${primary}`]: 34, [arcane]: 6, celestial: 2 } };
}
