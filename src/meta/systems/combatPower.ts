import { getTroopById } from '../../data/troops';
import type { CombatantSnapshot } from '../../session/contract';

/** 战力只用于队伍比较；技能组合、克制和先手仍由战斗本身决定。 */
export function combatantPower(unit: CombatantSnapshot): number {
  const stats = combatantStatPower(unit);
  const manaCost = Number.isFinite(unit.manaCost) ? Math.max(6, unit.manaCost) : 100;
  const mana = unit.skillId === 'none' ? 0 : Math.round(120 / manaCost);
  const baseRarity = unit.templateId ? getTroopById(Number(unit.templateId))?.rarityIdx ?? 0 : 0;
  const rarity = Math.min(5, Math.max(0, Number.isFinite(unit.rarityIdx) ? unit.rarityIdx! : baseRarity));
  const unlockedTraits = Math.min(3, new Set(unit.displayTraitIds ?? unit.traitIds ?? []).size);
  return Math.round(stats + mana + rarity * 12 + unlockedTraits * 15);
}

export function combatantStatPower(unit: CombatantSnapshot): number {
  const { hp, armor, attack, magic } = unit.stats;
  return Math.max(0, hp) + Math.max(0, armor) + Math.max(0, attack) * 2 + Math.max(0, magic) * 3;
}

export function teamPower(team: readonly CombatantSnapshot[]): number {
  return team.reduce((sum, unit) => sum + combatantPower(unit), 0);
}

export function teamStatPower(team: readonly CombatantSnapshot[]): number {
  return team.reduce((sum, unit) => sum + combatantStatPower(unit), 0);
}
